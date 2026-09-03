/**
 * One-time backfill: resolves every existing FantasyCalcValue and
 * RookieRankingsPlayer row (plus every ESPN League.standings roster entry)
 * to its canonical Sleeper playerId, using the same suffix/nickname-safe
 * matching logic proven this session (see src/lib/sleeperNameResolver.ts —
 * duplicated inline here rather than imported, since this script runs
 * standalone via tsx and this project's convention for one-off scripts is
 * to avoid `@/lib` path-alias imports).
 *
 * From this point on, the three sync jobs (fantasycalc-sync,
 * rookie-opportunity-sync, espn/sync + espn/sync-history) resolve and store
 * this ID going forward on every run — this script only catches up rows
 * that existed before those fixes shipped.
 *
 * Safe to re-run — every row/entry is recomputed from scratch each time, not
 * incrementally patched.
 *
 * Run: npx tsx scripts/backfill-sleeper-player-ids.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .replace(/['‘’]/g, '')
        .replace(/\s+\b(jr\.?|sr\.?|ii|iii|iv|v)\s*$/i, '')
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

interface SleeperRow { fullName: string; position: string; playerId: string }

function buildResolver(players: SleeperRow[]): (name: string, position: string) => SleeperRow | undefined {
    const byNamePos = new Map<string, SleeperRow>();
    const byNormNamePos = new Map<string, SleeperRow>();
    const byNameCount = new Map<string, number>();
    const byName = new Map<string, SleeperRow>();
    const byNormNameCount = new Map<string, number>();
    const byNormName = new Map<string, SleeperRow>();
    const byDefNickname = new Map<string, SleeperRow>();

    for (const p of players) {
        const exact = p.fullName.toLowerCase();
        const normd = normalizeName(p.fullName);
        byNamePos.set(`${exact}|${p.position}`, p);
        byNormNamePos.set(`${normd}|${p.position}`, p);
        byNameCount.set(exact, (byNameCount.get(exact) ?? 0) + 1);
        byName.set(exact, p);
        byNormNameCount.set(normd, (byNormNameCount.get(normd) ?? 0) + 1);
        byNormName.set(normd, p);
        if (p.position === 'DEF') {
            byDefNickname.set(normalizeName(p.fullName.split(' ').pop() ?? p.fullName), p);
        }
    }

    return (name: string, position: string): SleeperRow | undefined => {
        const exact = name.toLowerCase();
        const normd = normalizeName(name);
        const direct = byNamePos.get(`${exact}|${position}`)
            ?? byNormNamePos.get(`${normd}|${position}`)
            ?? (byNameCount.get(exact) === 1 ? byName.get(exact) : undefined)
            ?? (byNormNameCount.get(normd) === 1 ? byNormName.get(normd) : undefined);
        if (direct || position !== 'DEF') return direct;
        return byDefNickname.get(normalizeName(name.replace(/\s*(D\/ST|DST|DEF)\s*$/i, '')));
    };
}

async function backfillFantasyCalcValue(): Promise<void> {
    const [rows, sleeperPlayers] = await Promise.all([
        prisma.fantasyCalcValue.findMany({ select: { id: true, nameLower: true, position: true } }),
        prisma.sleeperPlayer.findMany({ where: { active: true }, select: { fullName: true, position: true, playerId: true } }),
    ]);
    const resolve = buildResolver(sleeperPlayers);

    let matched = 0;
    const ops = rows.map(r => {
        const sp = resolve(r.nameLower, r.position);
        if (sp) matched++;
        return prisma.fantasyCalcValue.update({ where: { id: r.id }, data: { sleeperPlayerId: sp?.playerId ?? null } });
    });

    const BATCH = 100;
    for (let i = 0; i < ops.length; i += BATCH) await prisma.$transaction(ops.slice(i, i + BATCH));
    console.log(`FantasyCalcValue: ${matched}/${rows.length} matched`);
}

async function backfillRookieRankings(): Promise<void> {
    const rows = await prisma.rookieRankingsPlayer.findMany({ select: { id: true, playerName: true, position: true } });
    const positions = [...new Set(rows.map(r => r.position))];
    const sleeperPlayers = await prisma.sleeperPlayer.findMany({ where: { position: { in: positions } }, select: { fullName: true, position: true, playerId: true } });
    const resolve = buildResolver(sleeperPlayers);

    let matched = 0;
    const ops = rows.map(r => {
        const sp = resolve(r.playerName, r.position);
        if (sp) matched++;
        return prisma.rookieRankingsPlayer.update({ where: { id: r.id }, data: { sleeperPlayerId: sp?.playerId ?? null } });
    });

    const BATCH = 100;
    for (let i = 0; i < ops.length; i += BATCH) await prisma.$transaction(ops.slice(i, i + BATCH));
    console.log(`RookieRankingsPlayer: ${matched}/${rows.length} matched`);
}

interface EspnStandingsPlayer { name: string; position: string; sleeperPlayerId?: string | null; [key: string]: unknown }
interface EspnStandingsTeam { players?: EspnStandingsPlayer[]; [key: string]: unknown }

async function backfillEspnStandings(): Promise<void> {
    const leagues = await prisma.league.findMany({
        where: { platform: 'espn' },
        select: { id: true, standings: true },
    });
    // Not active-only — some leagues' standings include historical rosters
    // with now-retired players (see sync-history/route.ts's same reasoning).
    const sleeperPlayers = await prisma.sleeperPlayer.findMany({ select: { fullName: true, position: true, playerId: true } });
    const resolve = buildResolver(sleeperPlayers);

    let leaguesUpdated = 0, playersMatched = 0, playersTotal = 0;
    for (const league of leagues) {
        const teams = (league.standings as EspnStandingsTeam[] | null) ?? [];
        let changed = false;
        for (const team of teams) {
            for (const p of team.players ?? []) {
                playersTotal++;
                const sp = resolve(p.name, p.position);
                const resolvedId = sp?.playerId ?? null;
                if (p.sleeperPlayerId !== resolvedId) changed = true;
                p.sleeperPlayerId = resolvedId;
                if (sp) playersMatched++;
            }
        }
        if (changed) {
            await prisma.league.update({ where: { id: league.id }, data: { standings: JSON.parse(JSON.stringify(teams)) } });
            leaguesUpdated++;
        }
    }
    console.log(`ESPN standings: ${leaguesUpdated}/${leagues.length} leagues updated, ${playersMatched}/${playersTotal} players matched`);
}

async function main(): Promise<void> {
    await backfillFantasyCalcValue();
    await backfillRookieRankings();
    await backfillEspnStandings();
    await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
