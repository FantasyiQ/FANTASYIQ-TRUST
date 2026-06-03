// DSS V1 — Dynasty Skill Score
// Computed nightly from Sleeper Dynasty league standings.
// Formula: 35% win rate + 25% PF percentile + 25% playoff rate + 15% league strength

import { prisma } from '@/lib/prisma';

interface StandingsRow {
    rosterId: number;
    ownerId:  string;
    wins:     number;
    losses:   number;
    ties:     number;
    fpts:     number;
}

export interface DssResult {
    dss:            number;
    winRateScore:   number;
    pfScore:        number;
    playoffScore:   number;
    leagueStrScore: number;
    dynastyLeagues: number;
    totalGames:     number;
}

/** Returns DSS breakdown for a user based on their Sleeper Dynasty league standings.
 *  Returns null if the user has no Sleeper ID or fewer than 4 games across all leagues. */
export async function computeDss(userId: string): Promise<DssResult | null> {
    const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { sleeperUserId: true },
    });
    if (!user?.sleeperUserId) return null;

    const sleeperUserId = user.sleeperUserId;

    const leagues = await prisma.league.findMany({
        where:  { userId, platform: 'sleeper', leagueType: 'Dynasty' },
        select: { standings: true, totalRosters: true },
    });

    type LeagueMetric = {
        winRate:     number;
        pfPct:       number;  // 0..1, 1 = best PF in league
        madePlayoff: boolean; // top floor(n/3) by standings rank
        oppWinRate:  number;  // avg win rate of opponents
        totalGames:  number;  // weight for aggregation
    };

    const metrics: LeagueMetric[] = [];

    for (const league of leagues) {
        if (!Array.isArray(league.standings) || league.standings.length < 2) continue;

        const standings = league.standings as unknown as StandingsRow[];
        const myRow     = standings.find(r => String(r.ownerId) === String(sleeperUserId));
        if (!myRow) continue;

        const totalGames = myRow.wins + myRow.losses + myRow.ties;
        if (totalGames < 4) continue;

        const n = standings.length;

        // Win rate (0..1)
        const winRate = myRow.wins / totalGames;

        // PF percentile: rank from worst (0) to best (1)
        const fptsAsc = [...standings].sort((a, b) => a.fpts - b.fpts);
        const pfRank  = fptsAsc.findIndex(r => String(r.ownerId) === String(sleeperUserId)); // 0-based
        const pfPct   = n > 1 ? pfRank / (n - 1) : 0.5;

        // Playoff qualification: top floor(n/3) teams in standings (pre-sorted wins desc, fpts desc)
        const playoffSlots  = Math.max(2, Math.floor(n / 3));
        const standingsRank = standings.findIndex(r => String(r.ownerId) === String(sleeperUserId)); // 0-based
        const madePlayoff   = standingsRank < playoffSlots;

        // League strength: average win rate of all other teams
        const opponents    = standings.filter(r => String(r.ownerId) !== String(sleeperUserId));
        const oppWinRates  = opponents.map(r => {
            const g = r.wins + r.losses + r.ties;
            return g > 0 ? r.wins / g : 0;
        });
        const oppWinRate   = oppWinRates.length > 0
            ? oppWinRates.reduce((s, v) => s + v, 0) / oppWinRates.length
            : 0.5;

        metrics.push({ winRate, pfPct, madePlayoff, oppWinRate, totalGames });
    }

    if (metrics.length === 0) return null;

    const totalWeight = metrics.reduce((s, m) => s + m.totalGames, 0);

    const weightedAvg = (fn: (m: LeagueMetric) => number): number =>
        metrics.reduce((s, m) => s + fn(m) * m.totalGames, 0) / totalWeight;

    const avgWinRate    = weightedAvg(m => m.winRate);
    const avgPfPct      = weightedAvg(m => m.pfPct);
    const playoffRate   = metrics.filter(m => m.madePlayoff).length / metrics.length;
    const avgOppWinRate = weightedAvg(m => m.oppWinRate);

    const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

    const winRateScore   = clamp(avgWinRate * 100);
    const pfScore        = clamp(avgPfPct * 100);
    const playoffScore   = clamp(playoffRate * 100);
    const leagueStrScore = clamp(avgOppWinRate * 100);

    const dss = clamp(
        0.35 * winRateScore +
        0.25 * pfScore      +
        0.25 * playoffScore +
        0.15 * leagueStrScore,
    );

    return {
        dss,
        winRateScore,
        pfScore,
        playoffScore,
        leagueStrScore,
        dynastyLeagues: metrics.length,
        totalGames:     metrics.reduce((s, m) => s + m.totalGames, 0),
    };
}

export async function computeAndSaveDss(userId: string): Promise<void> {
    const result = await computeDss(userId);
    if (!result) return;

    await prisma.$transaction([
        prisma.dssScore.upsert({
            where:  { userId },
            create: { userId, ...result, computedAt: new Date() },
            update: { ...result, computedAt: new Date() },
        }),
        prisma.user.update({
            where: { id: userId },
            data:  { dssScore: result.dss },
        }),
    ]);
}
