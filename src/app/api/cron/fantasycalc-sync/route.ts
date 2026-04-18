import { prisma } from '@/lib/prisma';

export const maxDuration = 60;

type KtcPlayer = {
    playerID:        number;
    playerName:      string;
    position:        string;
    team?:           string | null;
    age?:            number | null;
    oneQBValues:     { value: number };
    superflexValues: { value: number };
};

/** Parse the embedded playersArray from a KTC HTML page */
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
    if (!res.ok) throw new Error(`KTC responded ${res.status} for ${url}`);
    return parsePlayersArray(await res.text());
}

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch both dynasty and redraft pages in parallel
    let dynastyPlayers: KtcPlayer[], redraftPlayers: KtcPlayer[];
    try {
        [dynastyPlayers, redraftPlayers] = await Promise.all([
            fetchKtcPage('https://keeptradecut.com/dynasty-rankings'),
            fetchKtcPage('https://keeptradecut.com/fantasy-rankings'),
        ]);
    } catch (err) {
        return Response.json({ error: String(err) }, { status: 502 });
    }

    // KTC uses different playerIDs for the same player on dynasty vs redraft pages.
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
    // FantasyCalc IDs get updated correctly — KTC uses different playerIDs.
    // Also update fcId so it reflects the current KTC ID.
    for (let i = 0; i < entries.length; i += BATCH) {
        const batch = entries.slice(i, i + BATCH);
        await Promise.all(batch.map(p => {
            const nameLower      = p.playerName.toLowerCase();
            const redraftValue   = redraftMap.get(nameLower)   ?? 0;
            const redraftValueSf = redraftSfMap.get(nameLower) ?? 0;
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
                },
            }).catch(() => null);
        }));
        upserted += batch.length;
    }

    return Response.json({ ok: true, source: 'KTC', upserted });
}
