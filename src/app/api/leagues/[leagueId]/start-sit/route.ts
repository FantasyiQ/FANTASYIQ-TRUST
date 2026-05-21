// POST /api/leagues/[leagueId]/start-sit
// Body: { playerAId, playerBId, week? }

import { type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { requirePaidTier } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { getNflState } from '@/lib/sleeper';
import {
    computeModifiers,
    positionVolatility,
    winProbability,
    buildOpponentDefRankMap,
} from '@/lib/projection-engine';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RiskLabel = 'Low' | 'Medium' | 'High';
export type MatchupLabel = 'Favorable' | 'Neutral' | 'Difficult';
export type SlotType = 'direct' | 'flex' | 'conflict';

export interface StartSitPlayer {
    id:           string;
    name:         string;
    position:     string;
    team:         string;
    injuryStatus: string | null;
    proj:         number;
    baseProj:     number;
    risk:         number;       // positional volatility 0–1
    riskLabel:    RiskLabel;
    riskVariance: number;       // vol² × baseProj
    matchup:      MatchupLabel;
}

export interface SlotInfo {
    type:  SlotType;
    label: string;
}

export interface WinProbImpact {
    winProbA: number;
    winProbB: number;
    impact:   number;  // winProbA - winProbB (positive = A is better)
}

export interface StartSitResult {
    winner:        'playerA' | 'playerB' | 'toss-up';
    confidence:    number;
    delta:         number;
    playerA:       StartSitPlayer;
    playerB:       StartSitPlayer;
    slotInfo:      SlotInfo;
    winProbImpact: WinProbImpact | null;
    explanation:   string[];
}

// ── Flex eligibility ──────────────────────────────────────────────────────────

const FLEX_SLOTS: Record<string, string[]> = {
    FLEX:       ['RB', 'WR', 'TE'],
    SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
    REC_FLEX:   ['WR', 'TE'],
    WRRB_FLEX:  ['RB', 'WR'],
};

function isFlexCompatible(posA: string, posB: string, rosterPositions: string[]): boolean {
    return rosterPositions.some(slot => {
        const eligible = FLEX_SLOTS[slot];
        return eligible && eligible.includes(posA.toUpperCase()) && eligible.includes(posB.toUpperCase());
    });
}

function slotCompatibility(posA: string, posB: string, rosterPositions: string[]): SlotInfo {
    const pA = posA.toUpperCase();
    const pB = posB.toUpperCase();
    if (pA === pB) return { type: 'direct', label: `Direct ${pA} matchup` };
    if (isFlexCompatible(pA, pB, rosterPositions)) return { type: 'flex', label: 'Both FLEX-eligible' };
    return { type: 'conflict', label: `${pA} vs ${pB} — different roster slots` };
}

// ── Risk calculation ──────────────────────────────────────────────────────────

function computeRiskLabel(volatility: number, baseProj: number): RiskLabel {
    const variance = volatility * volatility * baseProj;
    if (variance < 2.0) return 'Low';
    if (variance <= 4.0) return 'Medium';
    return 'High';
}

// ── Matchup label (derived from baseProj vs positional average) ───────────────
// Sleeper's projections encode NFL opponent strength — a high baseProj signals
// a favourable NFL matchup for that player's specific week.

const POS_AVG: Record<string, number> = { QB: 22, RB: 12, WR: 11, TE: 8, K: 7, DEF: 8 };

function matchupLabel(baseProj: number, position: string): MatchupLabel {
    const avg   = POS_AVG[position.toUpperCase()] ?? 10;
    const ratio = baseProj / avg;
    if (ratio >= 1.15) return 'Favorable';
    if (ratio <= 0.85) return 'Difficult';
    return 'Neutral';
}

// ── Confidence (normalCDF of projection delta) ────────────────────────────────

function normalCDF(z: number): number {
    const a1 =  0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 =  1.061405429, p  = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    const x    = Math.abs(z) / Math.SQRT2;
    const t    = 1 / (1 + p * x);
    const erf  = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * erf);
}

// ── Explanation builder ───────────────────────────────────────────────────────

function buildExplanation(
    pA: StartSitPlayer,
    pB: StartSitPlayer,
    delta: number,
    slotInfo: SlotInfo,
    winProb: WinProbImpact | null,
): string[] {
    const lines: string[] = [];
    const winner = delta > 0 ? pA : pB;
    const loser  = delta > 0 ? pB : pA;

    if (Math.abs(delta) < 1.0) {
        lines.push('Projections are nearly identical — this is a close call.');
    } else {
        lines.push(`${winner.name} projects ${Math.abs(delta).toFixed(1)} more points this week.`);
    }

    if (pA.matchup !== pB.matchup) {
        const favoured = pA.matchup === 'Favorable' ? pA : pB.matchup === 'Favorable' ? pB : null;
        const tough    = pA.matchup === 'Difficult'  ? pA : pB.matchup === 'Difficult'  ? pB : null;
        if (favoured) lines.push(`${favoured.name} draws a favorable defensive matchup this week.`);
        if (tough)    lines.push(`${tough.name} faces a difficult defensive matchup this week.`);
    }

    if (pA.injuryStatus && !pB.injuryStatus) {
        lines.push(`${pA.name} carries injury risk (${pA.injuryStatus}).`);
    } else if (!pA.injuryStatus && pB.injuryStatus) {
        lines.push(`${pB.name} carries injury risk (${pB.injuryStatus}).`);
    } else if (pA.injuryStatus && pB.injuryStatus) {
        lines.push('Both players carry injury risk this week — monitor game-time reports.');
    }

    if (pA.riskLabel !== pB.riskLabel) {
        const safer   = pA.riskLabel === 'Low' || (pA.riskLabel === 'Medium' && pB.riskLabel === 'High') ? pA : pB;
        const riskier = safer === pA ? pB : pA;
        lines.push(`${safer.name} is the lower-variance play (${safer.riskLabel} risk vs ${riskier.riskLabel} risk).`);
    }

    if (winProb && Math.abs(winProb.impact) >= 0.01) {
        const better = winProb.impact > 0 ? pA : pB;
        const pct    = Math.round(Math.abs(winProb.impact) * 100);
        lines.push(`Starting ${better.name} improves your win probability by ${pct}% based on this week's matchup.`);
    }

    if (slotInfo.type === 'conflict') {
        lines.push(`Note: ${pA.position} and ${pB.position} occupy different roster slots — verify both are eligible for your open slot.`);
    }

    if (lines.length < 3 && Math.abs(delta) < 3.0 && Math.abs(delta) >= 1.0) {
        lines.push(`The gap is small enough that game-time injury updates could flip this decision.`);
    }

    return lines;
}

// ── Sleeper matchup type ──────────────────────────────────────────────────────

interface SleeperMatchupFull {
    matchup_id: number | null;
    roster_id:  number;
    starters:   string[];
    players:    string[];
    players_points: Record<string, number>;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const deny = await requirePaidTier(session.user.id);
    if (deny) return deny;

    const { leagueId: dbLeagueId } = await params;
    const body = await request.json() as { playerAId?: string; playerBId?: string; week?: number };
    const { playerAId, playerBId } = body;

    if (!playerAId || !playerBId)    return Response.json({ error: 'playerAId and playerBId are required' }, { status: 400 });
    if (playerAId === playerBId)     return Response.json({ error: 'Select two different players' }, { status: 400 });

    // ── Load league ───────────────────────────────────────────────────────────
    const league = await prisma.league.findUnique({
        where:  { id: dbLeagueId },
        select: {
            id:              true,
            userId:          true,
            leagueId:        true,
            scoringType:     true,
            totalRosters:    true,
            platform:        true,
            rosterPositions: true,
            standings:       true,
            sleeperUserId:   true,
        },
    });

    if (!league || league.userId !== session.user.id) {
        return Response.json({ error: 'League not found' }, { status: 404 });
    }

    // ── Determine week / season ───────────────────────────────────────────────
    let week   = body.week ?? 0;
    let season = '';
    if (!week) {
        const nflState = await getNflState();
        week   = nflState.week;
        season = nflState.season;
    } else {
        season = String(new Date().getFullYear());
    }

    // ── Scoring field ─────────────────────────────────────────────────────────
    const pprField: 'pointsPpr' | 'pointsStd' | 'pointsHalfPpr' =
        league.scoringType === 'ppr'      ? 'pointsPpr'     :
        league.scoringType === 'half_ppr' ? 'pointsHalfPpr' : 'pointsStd';

    // ── Fetch both players ────────────────────────────────────────────────────
    const [players, projections] = await Promise.all([
        prisma.sleeperPlayer.findMany({
            where:  { playerId: { in: [playerAId, playerBId] } },
            select: { playerId: true, fullName: true, position: true, team: true, injuryStatus: true },
        }),
        prisma.playerProjection.findMany({
            where:  { season, week, playerId: { in: [playerAId, playerBId] } },
            select: { playerId: true, pointsPpr: true, pointsStd: true, pointsHalfPpr: true },
        }),
    ]);

    const playerMap = new Map(players.map(p => [p.playerId, p]));
    const projMap   = new Map(projections.map(p => [p.playerId, p[pprField] ?? 0]));

    const infoA = playerMap.get(playerAId);
    const infoB = playerMap.get(playerBId);
    if (!infoA || !infoB) return Response.json({ error: 'One or both players not found' }, { status: 404 });

    // ── Build per-player projection rows ──────────────────────────────────────
    const totalTeams  = league.totalRosters;
    const neutralRank = Math.ceil(totalTeams / 2);

    type PlayerInfo = { playerId: string; fullName: string | null; position: string | null; team: string | null; injuryStatus: string | null };

    function buildPlayer(info: PlayerInfo, baseProj: number): StartSitPlayer {
        const mods       = computeModifiers(info.injuryStatus, neutralRank, totalTeams);
        const fiqProj    = Math.round(baseProj * (1 + mods.total) * 100) / 100;
        const vol        = positionVolatility(info.position ?? '');
        return {
            id:           info.playerId,
            name:         info.fullName ?? `Player ${info.playerId}`,
            position:     info.position ?? 'UNK',
            team:         info.team ?? '',
            injuryStatus: info.injuryStatus ?? null,
            proj:         fiqProj,
            baseProj:     Math.round(baseProj * 100) / 100,
            risk:         vol,
            riskLabel:    computeRiskLabel(vol, baseProj),
            riskVariance: Math.round(vol * vol * baseProj * 100) / 100,
            matchup:      matchupLabel(baseProj, info.position ?? ''),
        };
    }

    const pA = buildPlayer(infoA, projMap.get(playerAId) ?? 0);
    const pB = buildPlayer(infoB, projMap.get(playerBId) ?? 0);

    const delta      = Math.round((pA.proj - pB.proj) * 100) / 100;
    const confidence = Math.round(normalCDF(delta / 3.0) * 100) / 100;
    const winner: StartSitResult['winner'] =
        Math.abs(delta) < 0.5 ? 'toss-up' : delta > 0 ? 'playerA' : 'playerB';

    // ── Slot compatibility ────────────────────────────────────────────────────
    const slotInfo = slotCompatibility(pA.position, pB.position, league.rosterPositions);

    // ── Win probability impact (Sleeper leagues only) ─────────────────────────
    let winProbImpact: WinProbImpact | null = null;

    if (league.platform === 'sleeper') {
        try {
            type StandingEntry = { rosterId: number; ownerId?: string | null; fpts?: number };
            const standings = (league.standings as StandingEntry[] | null) ?? [];

            const [dbUser, rawMatchupsRes] = await Promise.all([
                prisma.user.findUnique({ where: { id: session.user.id }, select: { sleeperUserId: true } }),
                fetch(`https://api.sleeper.app/v1/league/${league.leagueId}/matchups/${week}`, { cache: 'no-store' }),
            ]);

            if (rawMatchupsRes.ok) {
                const rawMatchups = await rawMatchupsRes.json() as SleeperMatchupFull[];
                const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId;
                const myRosterId = standings.find(s => s.ownerId === mySleeperUserId)?.rosterId;

                if (myRosterId) {
                    const userMatchup = rawMatchups.find(m => m.roster_id === myRosterId);
                    const oppMatchup  = rawMatchups.find(m =>
                        m.matchup_id !== null &&
                        m.matchup_id === userMatchup?.matchup_id &&
                        m.roster_id !== myRosterId,
                    );

                    if (userMatchup && oppMatchup) {
                        // Collect all player IDs across both rosters + both candidates
                        const allIds = new Set([
                            ...userMatchup.starters.filter(id => id !== '0'),
                            ...oppMatchup.starters.filter(id => id !== '0'),
                            playerAId,
                            playerBId,
                        ]);

                        const [allProjs, allInfo] = await Promise.all([
                            prisma.playerProjection.findMany({
                                where:  { season, week, playerId: { in: [...allIds] } },
                                select: { playerId: true, pointsPpr: true, pointsStd: true, pointsHalfPpr: true },
                            }),
                            prisma.sleeperPlayer.findMany({
                                where:  { playerId: { in: [...allIds] } },
                                select: { playerId: true, fullName: true, position: true, team: true, injuryStatus: true },
                            }),
                        ]);

                        const allProjMap = new Map(allProjs.map(p => [p.playerId, p[pprField] ?? 0]));
                        const allInfoMap = new Map(allInfo.map(p => [p.playerId, p]));

                        const rosterPositions = league.rosterPositions;
                        const standingsFpts = standings.map(s => ({ rosterId: s.rosterId, fpts: s.fpts ?? 0 }));
                        const defRankMap    = buildOpponentDefRankMap(standingsFpts);
                        const userDefRank   = defRankMap.get(userMatchup.roster_id) ?? neutralRank;
                        const oppDefRank    = defRankMap.get(oppMatchup.roster_id)  ?? neutralRank;

                        // Opponent team (fixed)
                        const oppRows = oppMatchup.starters
                            .filter(id => id !== '0')
                            .map(pid => {
                                const info = allInfoMap.get(pid);
                                const base = allProjMap.get(pid) ?? 0;
                                const mods = computeModifiers(info?.injuryStatus, userDefRank, totalTeams);
                                const fiq  = base * (1 + mods.total);
                                const vol  = positionVolatility(info?.position ?? '');
                                return { proj: fiq, variance: vol * vol * Math.max(0, fiq) };
                            });
                        const oppTotalProj = oppRows.reduce((s, r) => s + r.proj, 0);
                        const oppVariance  = oppRows.reduce((s, r) => s + r.variance, 0);

                        // User's starters with projections
                        type StarterRow = { pid: string; pos: string; proj: number; variance: number };
                        const userStarters: StarterRow[] = userMatchup.starters
                            .filter(id => id !== '0')
                            .map(pid => {
                                const info = allInfoMap.get(pid);
                                const base = allProjMap.get(pid) ?? 0;
                                const mods = computeModifiers(info?.injuryStatus, oppDefRank, totalTeams);
                                const fiq  = base * (1 + mods.total);
                                const vol  = positionVolatility(info?.position ?? '');
                                return { pid, pos: info?.position ?? '', proj: fiq, variance: vol * vol * Math.max(0, fiq) };
                            });

                        function userTeamWith(candidateId: string, candidateInfo: PlayerInfo): { totalProj: number; variance: number } {
                            // If candidate already starting, return baseline as-is
                            if (userStarters.some(r => r.pid === candidateId)) {
                                return {
                                    totalProj: userStarters.reduce((s, r) => s + r.proj, 0),
                                    variance:  userStarters.reduce((s, r) => s + r.variance, 0),
                                };
                            }

                            const candidateBase = allProjMap.get(candidateId) ?? 0;
                            const candidateMods = computeModifiers(candidateInfo.injuryStatus, oppDefRank, totalTeams);
                            const candidateProj = candidateBase * (1 + candidateMods.total);
                            const candidateVol  = positionVolatility(candidateInfo.position ?? '');
                            const candidateVar  = candidateVol * candidateVol * Math.max(0, candidateProj);
                            const candidatePos  = (candidateInfo.position ?? '').toUpperCase();

                            // Find the worst-projected compatible starter to replace
                            const compatible = userStarters
                                .filter(r => r.pos.toUpperCase() === candidatePos || isFlexCompatible(r.pos, candidatePos, rosterPositions))
                                .sort((a, b) => a.proj - b.proj);

                            if (compatible.length === 0) {
                                // No compatible slot — add on top (edge case)
                                return {
                                    totalProj: userStarters.reduce((s, r) => s + r.proj, 0) + candidateProj,
                                    variance:  userStarters.reduce((s, r) => s + r.variance, 0) + candidateVar,
                                };
                            }

                            const toReplace = compatible[0]!;
                            return {
                                totalProj: userStarters.reduce((s, r) => s + (r.pid === toReplace.pid ? candidateProj : r.proj), 0),
                                variance:  userStarters.reduce((s, r) => s + (r.pid === toReplace.pid ? candidateVar  : r.variance), 0),
                            };
                        }

                        const teamWithA = userTeamWith(playerAId, infoA);
                        const teamWithB = userTeamWith(playerBId, infoB);

                        const marginA = teamWithA.totalProj - oppTotalProj;
                        const marginB = teamWithB.totalProj - oppTotalProj;

                        const wpA = Math.round(winProbability(marginA, teamWithA.variance, oppVariance) * 1000) / 1000;
                        const wpB = Math.round(winProbability(marginB, teamWithB.variance, oppVariance) * 1000) / 1000;

                        winProbImpact = {
                            winProbA: wpA,
                            winProbB: wpB,
                            impact:   Math.round((wpA - wpB) * 1000) / 1000,
                        };
                    }
                }
            }
        } catch { /* win prob impact is optional — silently skip on any error */ }
    }

    const result: StartSitResult = {
        winner,
        confidence,
        delta,
        playerA:       pA,
        playerB:       pB,
        slotInfo,
        winProbImpact,
        explanation:   buildExplanation(pA, pB, delta, slotInfo, winProbImpact),
    };

    return Response.json(result);
}
