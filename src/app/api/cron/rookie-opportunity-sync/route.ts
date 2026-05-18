/**
 * /api/cron/rookie-opportunity-sync
 *
 * Runs nightly after sleeper-players (6am) and sleeper-projections (8am) — scheduled at 9am.
 *
 * For every player in rookie_rankings_players:
 *   1. Match to SleeperPlayer by fullName
 *   2. Calculate Opportunity Score (0–100) from Sleeper data
 *   3. Compute adjusted FiQ Score = (baseFiQScore × 0.75) + (opportunityScore × 0.25)
 *   4. Recompute fiqTier from adjusted score
 *   5. Upsert back to DB
 *
 * Opportunity Score Components:
 *   - Depth Chart Role   (0–40 pts) — are they actually going to play?
 *   - ADP / Market Signal(0–30 pts) — Sleeper searchRank
 *   - Projected Points   (0–20 pts) — season PPR projection normalized by position
 *   - Health / Status    (0–10 pts) — injury status
 */

import { prisma } from '@/lib/prisma';
import { computeRookieFiQTier } from '@/lib/dynasty/rookieRankings';

export const maxDuration = 60;

// ── Opportunity Score ─────────────────────────────────────────────────────────

const SEASON = '2026';

// Max projected PPR points by position — used to normalise to 0–20 range.
// Conservative ceilings for rookies (not a veteran ceiling).
const PROJ_CAPS: Record<string, number> = {
    QB:  280,
    RB:  160,
    WR:  160,
    TE:  120,
};

function calcOpportunityScore(params: {
    depthChartOrder: number | null;
    searchRank:      number | null;
    injuryStatus:    string | null;
    active:          boolean;
    projectedPts:    number;   // sum of weekly PPR projections for SEASON
    position:        string;
}): number {
    const { depthChartOrder, searchRank, injuryStatus, active, projectedPts, position } = params;
    let score = 0;

    // 1. Depth Chart Role (0–50)
    // 1=Starter, 2=Co-Starter, 3=Role Player, 4=Backup, 5=3rd String
    if      (depthChartOrder === 1)  score += 50;
    else if (depthChartOrder === 2)  score += 40;
    else if (depthChartOrder === 3)  score += 25;
    else if (depthChartOrder === 4)  score += 12;
    else if (depthChartOrder === 5)  score += 5;
    // null → no data yet → 0; score stays neutral (won't penalise pre-season rookies)

    // 2. ADP / Market Signal (0–30) — Sleeper searchRank (lower = more valued)
    const rank = searchRank ?? 9_999_999;
    if      (rank <=  25)  score += 30;
    else if (rank <=  50)  score += 26;
    else if (rank <= 100)  score += 21;
    else if (rank <= 200)  score += 15;
    else if (rank <= 400)  score += 9;
    else if (rank <= 700)  score += 4;
    // > 700 or unranked → 0

    // 3. Projected Season Points (0–20)
    if (projectedPts > 0) {
        const cap   = PROJ_CAPS[position] ?? 140;
        const ratio = Math.min(projectedPts / cap, 1);
        score += Math.round(ratio * 20);
    }

    // 4. Health / Status (0–10)
    if (!active) {
        // Inactive / cut — no points
    } else {
        const inj = (injuryStatus ?? '').toLowerCase();
        if      (!injuryStatus || inj === 'active') score += 10;
        else if (inj === 'questionable')            score += 7;
        else if (inj === 'doubtful')                score += 3;
        // Out | IR | PUP → 0
    }

    return Math.min(score, 100);
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all rookies for this season
    const rookies = await prisma.rookieRankingsPlayer.findMany({
        where: { season: SEASON },
    });

    if (rookies.length === 0) {
        return Response.json({ ok: true, updated: 0, message: `No rookies found for season ${SEASON}` });
    }

    // Fetch matching Sleeper players in one query
    const names = rookies.map(r => r.playerName);
    const sleeperMap = new Map(
        (await prisma.sleeperPlayer.findMany({
            where:  { fullName: { in: names } },
            select: {
                fullName:        true,
                position:        true,
                depthChartOrder: true,
                searchRank:      true,
                injuryStatus:    true,
                active:          true,
                playerId:        true,
            },
        })).map(sp => [sp.fullName, sp])
    );

    // Fetch season projections for all matched players in one query
    const playerIds = [...sleeperMap.values()].map(sp => sp.playerId);
    const projRows  = await prisma.playerProjection.findMany({
        where:  { season: SEASON, playerId: { in: playerIds } },
        select: { playerId: true, pointsPpr: true },
    });

    // Sum PPR projections per player
    const projByPlayerId = new Map<string, number>();
    for (const row of projRows) {
        projByPlayerId.set(row.playerId, (projByPlayerId.get(row.playerId) ?? 0) + row.pointsPpr);
    }

    // Process each rookie
    let updated = 0;
    let noMatch = 0;

    for (const rookie of rookies) {
        const sp = sleeperMap.get(rookie.playerName);

        // If baseFiQScore hasn't been set yet (existing rows seeded before this feature),
        // treat the current fiqScore as the base.
        const base = rookie.baseFiQScore > 0 ? rookie.baseFiQScore : rookie.fiqScore;

        if (!sp) {
            // No Sleeper match — if a manual depth order is set, apply it with no other signals
            if (rookie.manualDepthOrder != null) {
                const opportunityScore = calcOpportunityScore({
                    depthChartOrder: rookie.manualDepthOrder,
                    searchRank:      null,
                    injuryStatus:    null,
                    active:          true,
                    projectedPts:    0,
                    position:        rookie.position,
                });
                const rawAdjusted = (base * 0.75) + (opportunityScore * 0.25);
                const adjustedFiQ = parseFloat(Math.max(rawAdjusted, base).toFixed(2));
                const newTier     = computeRookieFiQTier(adjustedFiQ);
                await prisma.rookieRankingsPlayer.update({
                    where: { id: rookie.id },
                    data:  { baseFiQScore: base, opportunityScore, fiqScore: adjustedFiQ, fiqTier: newTier },
                });
                updated++;
            } else if (rookie.baseFiQScore === 0) {
                await prisma.rookieRankingsPlayer.update({
                    where: { id: rookie.id },
                    data:  { baseFiQScore: rookie.fiqScore },
                });
            }
            noMatch++;
            continue;
        }

        const projectedPts    = projByPlayerId.get(sp.playerId) ?? 0;
        // Use Sleeper depth chart if available; fall back to manual override
        const depthChartOrder = sp.depthChartOrder ?? rookie.manualDepthOrder ?? null;
        const opportunityScore = calcOpportunityScore({
            depthChartOrder,
            searchRank:      sp.searchRank,
            injuryStatus:    sp.injuryStatus,
            active:          sp.active,
            projectedPts,
            position:        sp.position,
        });

        // Floor at base — opportunity can only raise the score, never lower it
        const rawAdjusted = (base * 0.75) + (opportunityScore * 0.25);
        const adjustedFiQ = parseFloat(Math.max(rawAdjusted, base).toFixed(2));
        const newTier     = computeRookieFiQTier(adjustedFiQ);

        await prisma.rookieRankingsPlayer.update({
            where: { id: rookie.id },
            data: {
                baseFiQScore:    base,
                opportunityScore,
                fiqScore:        adjustedFiQ,
                fiqTier:         newTier,
            },
        });

        updated++;
    }

    return Response.json({
        ok:      true,
        season:  SEASON,
        updated,
        noMatch,
        total:   rookies.length,
    });
}
