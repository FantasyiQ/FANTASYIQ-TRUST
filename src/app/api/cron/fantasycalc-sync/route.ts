import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';
import { normalizePlayerName as normalizeName } from '@/lib/playerName';
import { buildSleeperNameResolver } from '@/lib/sleeperNameResolver';
import { withCronLog } from '@/lib/cron-logger';

export const maxDuration = 300;

type KtcPlayer = {
    playerID:        number;
    playerName:      string;
    position:        string;
    team?:           string | null;
    age?:            number | null;
    oneQBValues:     { value: number };
    superflexValues: { value: number };
};

/** Parse the embedded playersArray from the dynasty rankings page */
function parsePlayersArray(html: string): KtcPlayer[] {
    const varIdx = html.indexOf('var playersArray = ');
    if (varIdx === -1) throw new Error('playersArray not found in HTML');
    const arrStart = html.indexOf('[', varIdx);
    if (arrStart === -1) throw new Error('Array start not found');

    // Find matching closing bracket
    let depth = 0, end = -1;
    for (let i = arrStart; i < html.length; i++) {
        if (html[i] === '[') depth++;
        else if (html[i] === ']') {
            depth--;
            if (depth === 0) { end = i; break; }
        }
    }
    if (end === -1) throw new Error('Array end not found');
    return JSON.parse(html.slice(arrStart, end + 1)) as KtcPlayer[];
}

async function fetchKtcPage(url: string): Promise<KtcPlayer[]> {
    const res = await fetch(url, {
        cache: 'no-store',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FantasyiQ/1.0)' },
    });
    if (!res.ok) throw new Error(`Dynasty data source responded ${res.status} for ${url}`);
    return parsePlayersArray(await res.text());
}


export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await withCronLog('fantasycalc-sync', async () => {
        // ── Step 1: Snapshot current values (before today's update) ──────────────
        // Merge with Sleeper for accurate team/injury at snapshot time.
        const [currentRows, sleeperPlayers] = await Promise.all([
            prisma.fantasyCalcValue.findMany({
                where: { OR: [{ dynastyValue: { gt: 0 } }, { redraftValue: { gt: 0 } }] },
                select: { nameLower: true, position: true, dynastyValue: true, dynastyValueSf: true, redraftValue: true, redraftValueSf: true, team: true },
            }),
            prisma.sleeperPlayer.findMany({
                where:  { active: true },
                select: { playerId: true, fullName: true, team: true, injuryStatus: true, position: true },
            }),
        ]);

        // Some real players share an exact fullName (e.g. two "Justin Jefferson"s —
        // WR/MIN and LB/CLE), and FantasyCalc spells some players with a suffix
        // ("Kenneth Walker III") Sleeper's own fullName omits. The shared
        // resolver handles both — resolved once here, reused for both the
        // snapshot enrichment below and the canonical sleeperPlayerId written
        // onto FantasyCalcValue in step 2, so every future read is a plain ID
        // lookup instead of re-matching by name at read time.
        const resolveSleeper = buildSleeperNameResolver(sleeperPlayers);

        const snapshotRows = currentRows.map(r => {
            const sl = resolveSleeper(r.nameLower, r.position) ?? null;
            const rawTeam = sl?.team ?? r.team ?? null;
            return {
                nameLower:      r.nameLower,
                position:       r.position,
                dynastyValue:   r.dynastyValue,
                dynastyValueSf: r.dynastyValueSf,
                redraftValue:   r.redraftValue,
                redraftValueSf: r.redraftValueSf,
                team:           (rawTeam && rawTeam !== 'FA') ? rawTeam : null,
                injuryStatus:   sl?.injuryStatus ?? null,
            };
        });
    
        const SNAP_BATCH = 500;
        for (let i = 0; i < snapshotRows.length; i += SNAP_BATCH) {
            await prisma.fantasyCalcSnapshot.createMany({ data: snapshotRows.slice(i, i + SNAP_BATCH) });
        }
    
        // Prune snapshots older than 7 days
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        await prisma.fantasyCalcSnapshot.deleteMany({ where: { takenAt: { lt: cutoff } } });
    
        // ── Step 2: Fetch fresh dynasty values ────────────────────────────────────────
        let dynastyPlayers: KtcPlayer[], redraftPlayers: KtcPlayer[];
        try {
            [dynastyPlayers, redraftPlayers] = await Promise.all([
                fetchKtcPage('https://keeptradecut.com/dynasty-rankings'),
                fetchKtcPage('https://keeptradecut.com/fantasy-rankings'),
            ]);
        } catch (err) {
            // Throw (not an early Response) so withCronLog records this as a
            // real failure — this cron feeds every dynasty/redraft player
            // value in the app, so a silent skip here is exactly the kind of
            // blind spot that let leagues go stale for months undetected.
            throw new Error(`KeepTradeCut fetch failed: ${String(err)}`);
        }

        // The data source uses different playerIDs for the same player on dynasty vs redraft pages.
        // Match by name (lowercased) to correctly link redraft values.
        const redraftMap = new Map<string, number>();
        const redraftSfMap = new Map<string, number>();
        for (const p of redraftPlayers) {
            const key = p.playerName.toLowerCase();
            redraftMap.set(key, p.oneQBValues?.value ?? 0);
            redraftSfMap.set(key, p.superflexValues?.value ?? 0);
        }
    
        const entries = dynastyPlayers.filter(p => p.playerName && p.playerID);
    
        const BATCH = 50;
        let upserted = 0;
    
        // Upsert by nameLower (not fcId) so that rows originally created with old
        // FantasyCalc IDs get updated correctly — The data source uses different playerIDs.
        // Also update fcId so it reflects the current data source ID.
        for (let i = 0; i < entries.length; i += BATCH) {
            const batch = entries.slice(i, i + BATCH);
            await Promise.all(batch.map(async p => {
                const nameLower      = p.playerName.toLowerCase();
                const normdLower     = normalizeName(nameLower);
                const redraftValue   = redraftMap.get(nameLower)   ?? 0;
                const redraftValueSf = redraftSfMap.get(nameLower) ?? 0;
                const sleeperPlayerId = resolveSleeper(nameLower, p.position)?.playerId ?? null;

                // If the canonical name has punctuation (e.g. "d.j. moore"), delete any
                // stale de-punctuated duplicate (e.g. "dj moore") so it can't shadow the
                // real entry in name-matching lookups.
                if (normdLower !== nameLower) {
                    await prisma.fantasyCalcValue.deleteMany({
                        where: { nameLower: normdLower },
                    }).catch(() => null);
                }
    
                return prisma.fantasyCalcValue.upsert({
                    where:  { nameLower },
                    create: {
                        fcId:           p.playerID,
                        playerName:     p.playerName,
                        nameLower,
                        position:       p.position,
                        team:           p.team              ?? null,
                        age:            p.age               ?? null,
                        dynastyValue:   p.oneQBValues?.value   ?? 0,
                        dynastyValueSf: p.superflexValues?.value ?? 0,
                        redraftValue,
                        redraftValueSf,
                        trend30Day:     null,
                        sleeperPlayerId,
                    },
                    update: {
                        fcId:           p.playerID,
                        playerName:     p.playerName,
                        position:       p.position,
                        team:           p.team              ?? null,
                        age:            p.age               ?? null,
                        dynastyValue:   p.oneQBValues?.value   ?? 0,
                        dynastyValueSf: p.superflexValues?.value ?? 0,
                        redraftValue,
                        redraftValueSf,
                        trend30Day:     null,
                        sleeperPlayerId,
                    },
                }).catch(() => null);
            }));
            upserted += batch.length;
        }
    
        // Self-heal: collapse punctuation-variant duplicates (e.g. a stale
        // "tre' harris" alongside the canonical "tre harris") that linger when
        // KTC changes a name's punctuation. Keeps the current canonical row
        // (or, failing that, the highest-value one). Uses a punctuation-only key
        // so it NEVER collapses suffix-different players ("Michael Carter" vs
        // "Michael Carter II").
        const punctKey = (s: string) => s.toLowerCase().replace(/['‘’.]/g, '').replace(/\s+/g, ' ').trim();
        const canonical = new Set(entries.map(e => e.playerName.toLowerCase()));
        const allRows = await prisma.fantasyCalcValue.findMany({
            select: { nameLower: true, dynastyValue: true, redraftValue: true },
        });
        const byKey = new Map<string, typeof allRows>();
        for (const r of allRows) {
            const k = punctKey(r.nameLower);
            (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(r);
        }
        const staleNames: string[] = [];
        for (const group of byKey.values()) {
            if (group.length < 2) continue;
            group.sort((a, b) =>
                (canonical.has(b.nameLower) ? 1 : 0) - (canonical.has(a.nameLower) ? 1 : 0)
                || b.dynastyValue - a.dynastyValue
                || b.redraftValue - a.redraftValue);
            for (const r of group.slice(1)) staleNames.push(r.nameLower);
        }
        if (staleNames.length) {
            await prisma.fantasyCalcValue.deleteMany({ where: { nameLower: { in: staleNames } } }).catch(() => null);
        }

        return { processed: upserted, message: `${upserted} players upserted, ${staleNames.length} deduped` };
        });
        return Response.json({ ok: true, source: 'FantasyCalc', ...result });
    } catch (err) {
        captureError(err, { cron: 'fantasycalc-sync' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
