// ── FantasyiQ Trust — Weekly Projection Engine ───────────────────────────────
//
// Implements the 7-step model from the build spec:
//   1. Sleeper base projections (from DB, synced by sleeper-projections cron)
//   2. Merge with live per-player pts (from Sleeper matchup API)
//   3. Rest-of-game (ROS) = max(0, BaseProj − LivePts)
//   4. FantasyiQ enhanced projection (modifiers applied to BaseProj)
//   5. Team-level rollup (TeamLive, TeamProjFinal, TeamProjEnhanced)
//   6. Win probability (variance-based normal distribution CDF)
//
// Modifier availability:
//   Injury Status      — real data from SleeperPlayer.injuryStatus
//   Opp. Def. Rank     — real data derived from league standings (pts-for proxy)
//   Snap Share         — no live feed; neutral (0)
//   Usage Rate         — no live feed; neutral (0)
//   Game Script        — no real-time game flow; neutral (0)
//   Weather            — no external API; neutral (0)
//   Vegas Implied Total — no odds API; neutral (0)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlayerModifiers {
    snapWeight:    number;  // 0–0.15
    usageWeight:   number;  // 0–0.20
    scriptWeight:  number;  // −0.10 to +0.10
    defWeight:     number;  // −0.12 to +0.12  (opponent def rank)
    injuryWeight:  number;  // −0.25 to 0
    weatherWeight: number;  // −0.08 to +0.08
    vegasWeight:   number;  // −0.10 to +0.10
    total:         number;  // sum of all
}

export interface PlayerProjectionRow {
    playerId:      string;
    name:          string;
    position:      string;
    team:          string;
    isStarter:     boolean;
    injuryStatus:  string | null;
    livePts:       number;
    baseProj:      number;   // Sleeper projected pts for the full game
    rosProj:       number;   // max(0, baseProj − livePts)
    fantasyIqProj: number;   // baseProj × (1 + total modifier)
    projTotal:     number;   // max(livePts, fantasyIqProj) — projected final for this player
    volatility:    number;   // positional variance weight 0–1.0
    modifiers:     PlayerModifiers;
}

export interface TeamProjection {
    rosterId:         number;
    teamName:         string;
    username:         string | undefined;
    avatar:           string | null | undefined;
    teamLive:         number;  // SUM(livePts) of starters
    teamProjFinal:    number;  // Sleeper-based projected final (live + ROS)
    teamProjEnhanced: number;  // FantasyiQ projected final (live + enhanced ROS)
    teamVariance:     number;  // SUM(volatility²) for starters — used in win prob
    startingPlayers:  number;  // count of started players
    players:          PlayerProjectionRow[];
}

export interface MatchupProjection {
    matchupId: number;
    week:      number;
    teamA:     TeamProjection;
    teamB:     TeamProjection;
    winProbA:  number;  // 0–1 probability team A wins
    margin:    number;  // teamA.teamProjEnhanced − teamB.teamProjEnhanced
}

// ── Modifier computation ──────────────────────────────────────────────────────

function injuryModifier(status: string | null | undefined): number {
    switch (status) {
        case 'Questionable': return -0.05;
        case 'Doubtful':     return -0.15;
        case 'Out':          return -0.25;
        case 'IR':           return -0.25;
        case 'PUP':          return -0.25;
        default:             return 0;
    }
}

/**
 * Opponent defensive rank modifier (±12%).
 * defRank: 1 = weakest defense (most pts allowed) → best matchup → +0.12
 *          n = strongest defense → worst matchup → −0.12
 * Linear interpolation between extremes.
 */
export function defRankModifier(defRank: number, totalTeams: number): number {
    if (totalTeams <= 1) return 0;
    return 0.12 - (defRank - 1) * (0.24 / (totalTeams - 1));
}

export function computeModifiers(
    injuryStatus:    string | null | undefined,
    opponentDefRank: number,
    totalTeams:      number,
): PlayerModifiers {
    const snapWeight    = 0;  // no snap share data
    const usageWeight   = 0;  // no usage rate data
    const scriptWeight  = 0;  // no game flow data
    const defWeight     = defRankModifier(opponentDefRank, totalTeams);
    const injuryWeight  = injuryModifier(injuryStatus);
    const weatherWeight = 0;  // no weather API
    const vegasWeight   = 0;  // no odds API
    const total         = snapWeight + usageWeight + scriptWeight + defWeight + injuryWeight + weatherWeight + vegasWeight;
    return { snapWeight, usageWeight, scriptWeight, defWeight, injuryWeight, weatherWeight, vegasWeight, total };
}

// ── Position volatility ───────────────────────────────────────────────────────

export function positionVolatility(position: string): number {
    switch (position.toUpperCase()) {
        case 'QB':  return 0.30;
        case 'RB':  return 0.50;
        case 'WR':  return 0.45;
        case 'TE':  return 0.40;
        case 'K':   return 0.25;
        case 'DEF': return 0.35;
        default:    return 0.40;
    }
}

// ── Normal distribution CDF (Abramowitz & Stegun, max error 1.5×10⁻⁷) ────────

function normalCDF(z: number): number {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = z < 0 ? -1 : 1;
    const x    = Math.abs(z) / Math.sqrt(2);
    const t    = 1 / (1 + p * x);
    const erf  = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * erf);
}

/**
 * Win probability for team A.
 * margin = teamA.projEnhanced − teamB.projEnhanced
 * varianceA/B = SUM(volatility²) for each team's starters
 */
export function winProbability(margin: number, varianceA: number, varianceB: number): number {
    const combinedSd = Math.sqrt(varianceA + varianceB);
    if (combinedSd === 0) return margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
    return normalCDF(margin / combinedSd);
}

// ── Team rollup ───────────────────────────────────────────────────────────────

export function buildTeamProjection(
    rosterId: number,
    teamName: string,
    username: string | undefined,
    avatar:   string | null | undefined,
    players:  PlayerProjectionRow[],
): TeamProjection {
    const starters = players.filter(p => p.isStarter);

    // Live: sum of actual points scored so far
    const teamLive = starters.reduce((s, p) => s + p.livePts, 0);

    // Sleeper projected final: live + Sleeper ROS for each starter
    // = SUM(max(livePts, baseProj)) — i.e. take the higher of actual or projected
    const teamProjFinal = starters.reduce((s, p) => s + Math.max(p.livePts, p.baseProj), 0);

    // FantasyiQ projected final: same but using enhanced projection
    const teamProjEnhanced = starters.reduce((s, p) => s + p.projTotal, 0);

    // Variance: sum of squared volatility for starters (drives win probability spread)
    const teamVariance = starters.reduce((s, p) => s + p.volatility * p.volatility * Math.max(p.rosProj, p.fantasyIqProj - p.livePts, 0), 0);

    return {
        rosterId,
        teamName,
        username,
        avatar,
        teamLive:         Math.round(teamLive * 100) / 100,
        teamProjFinal:    Math.round(teamProjFinal * 100) / 100,
        teamProjEnhanced: Math.round(teamProjEnhanced * 100) / 100,
        teamVariance,
        startingPlayers:  starters.length,
        players,
    };
}

// ── Main assembly ─────────────────────────────────────────────────────────────

export interface PlayerRecord {
    playerId:     string;
    name:         string;
    position:     string;
    team:         string;
    injuryStatus: string | null;
}

export interface RosterSlot {
    rosterId:     number;
    teamName:     string;
    username:     string | undefined;
    avatar:       string | null | undefined;
    starters:     string[];  // player IDs in starting lineup
    players:      string[];  // all player IDs
    livePts:      number;    // team total (fallback when per-player not available)
    playerPts:    Record<string, number>;  // playerId → live pts
}

export interface ProjectionRecord {
    playerId:     string;
    baseProj:     number;
}

/**
 * Rank opponent teams by their allowed fantasy points (proxy = their season fpts).
 * Lower fpts means better defense (fewer points "caused" = harder to play against).
 * Returns a Map<rosterId, defRank> where rank 1 = weakest defense.
 */
export function buildOpponentDefRankMap(
    standings: Array<{ rosterId: number; fpts: number }>,
): Map<number, number> {
    const sorted = [...standings].sort((a, b) => b.fpts - a.fpts);
    return new Map(sorted.map((t, i) => [t.rosterId, i + 1]));
}

/**
 * Build all PlayerProjectionRow records for a roster, then return a TeamProjection.
 */
export function assembleTeamProjection(
    slot:         RosterSlot,
    projByPlayer: Map<string, number>,   // playerId → baseProj
    playerInfo:   Map<string, PlayerRecord>,
    opponentDefRank: number,
    totalTeams:   number,
): TeamProjection {
    const starterSet = new Set(slot.starters.filter(id => id !== '0'));
    const allIds     = [...new Set([...slot.starters, ...slot.players])].filter(id => id !== '0');

    const rows: PlayerProjectionRow[] = allIds.map(pid => {
        const info       = playerInfo.get(pid);
        const baseProj   = projByPlayer.get(pid) ?? 0;
        const livePts    = slot.playerPts[pid] ?? 0;
        const isStarter  = starterSet.has(pid);
        const position   = info?.position ?? 'UNK';
        const volatility = positionVolatility(position);
        const mods       = computeModifiers(info?.injuryStatus, opponentDefRank, totalTeams);
        const fantasyIqProj = baseProj * (1 + mods.total);
        const rosProj    = Math.max(0, baseProj - livePts);
        const projTotal  = Math.max(livePts, fantasyIqProj);

        return {
            playerId:      pid,
            name:          info?.name         ?? `Player ${pid}`,
            position,
            team:          info?.team         ?? '',
            isStarter,
            injuryStatus:  info?.injuryStatus ?? null,
            livePts:       Math.round(livePts * 100) / 100,
            baseProj:      Math.round(baseProj * 100) / 100,
            rosProj:       Math.round(rosProj * 100) / 100,
            fantasyIqProj: Math.round(fantasyIqProj * 100) / 100,
            projTotal:     Math.round(projTotal * 100) / 100,
            volatility,
            modifiers:     mods,
        };
    });

    // Sort: starters first, then bench; within each group by fantasyIqProj desc
    rows.sort((a, b) => {
        if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1;
        return b.fantasyIqProj - a.fantasyIqProj;
    });

    return buildTeamProjection(slot.rosterId, slot.teamName, slot.username, slot.avatar, rows);
}

// ── Lineup Optimizer ──────────────────────────────────────────────────────────

export interface LineupRules {
    QB:         number;
    RB:         number;
    WR:         number;
    TE:         number;
    FLEX:       number;       // RB/WR/TE eligible
    SUPER_FLEX: number;       // QB/RB/WR/TE eligible
    REC_FLEX:   number;       // WR/TE eligible
    WRRB_FLEX:  number;       // WR/RB eligible
    K:          number;
    DEF:        number;
}

export interface OptimizedSlot {
    slot:       string;
    player:     PlayerProjectionRow;
    wasStarter: boolean;
    status:     'stay' | 'start';
}

export interface LineupOptimizationResult {
    optimizedSlots:     OptimizedSlot[];
    benchedStarters:    PlayerProjectionRow[];   // currently starting → should be benched
    bench:              PlayerProjectionRow[];   // remaining on bench (unchanged)
    optimizedTotalProj: number;
    currentTotalProj:   number;
    gain:               number;
    swapCount:          number;                  // how many bench→start moves recommended
}

/** Parse roster position array into slot counts (ignores BN / IR). */
export function parseLineupRules(rosterPositions: string[]): LineupRules {
    const rules: LineupRules = {
        QB: 0, RB: 0, WR: 0, TE: 0,
        FLEX: 0, SUPER_FLEX: 0, REC_FLEX: 0, WRRB_FLEX: 0,
        K: 0, DEF: 0,
    };
    const SKIP = new Set(['BN', 'IR']);
    for (const pos of rosterPositions) {
        if (SKIP.has(pos)) continue;
        if (pos in rules) (rules as unknown as Record<string, number>)[pos]++;
    }
    return rules;
}

/**
 * Greedy lineup optimizer.
 * Fills fixed slots (QB/RB/WR/TE/K/DEF) by descending FantasyiQ projection,
 * then fills flex slots from the remaining eligible pool.
 * Returns the optimized starting set and the delta vs current lineup.
 */
export function optimizeLineup(
    players:  PlayerProjectionRow[],
    rules:    LineupRules,
): LineupOptimizationResult {
    const eligible = players.filter(p => p.position !== 'UNK');

    const byPos = (pos: string) =>
        eligible
            .filter(p => p.position.toUpperCase() === pos)
            .sort((a, b) => b.fantasyIqProj - a.fantasyIqProj);

    const QBs  = byPos('QB');
    const RBs  = byPos('RB');
    const WRs  = byPos('WR');
    const TEs  = byPos('TE');
    const Ks   = byPos('K');
    const DEFs = byPos('DEF');

    const used  = new Set<string>();
    const slots: OptimizedSlot[] = [];

    function take(group: PlayerProjectionRow[], n: number, slotName: string) {
        let taken = 0;
        for (const p of group) {
            if (taken >= n) break;
            if (used.has(p.playerId)) continue;
            used.add(p.playerId);
            slots.push({
                slot:       slotName,
                player:     p,
                wasStarter: p.isStarter,
                status:     p.isStarter ? 'stay' : 'start',
            });
            taken++;
        }
    }

    // Fixed slots first
    take(QBs,  rules.QB,  'QB');
    take(RBs,  rules.RB,  'RB');
    take(WRs,  rules.WR,  'WR');
    take(TEs,  rules.TE,  'TE');
    take(Ks,   rules.K,   'K');
    take(DEFs, rules.DEF, 'DEF');

    // FLEX: RB/WR/TE
    const flexPool = [...RBs, ...WRs, ...TEs]
        .filter(p => !used.has(p.playerId))
        .sort((a, b) => b.fantasyIqProj - a.fantasyIqProj);
    take(flexPool, rules.FLEX, 'FLEX');

    // SUPER_FLEX: QB/RB/WR/TE
    const sfPool = [...QBs, ...RBs, ...WRs, ...TEs]
        .filter(p => !used.has(p.playerId))
        .sort((a, b) => b.fantasyIqProj - a.fantasyIqProj);
    take(sfPool, rules.SUPER_FLEX, 'SUPER_FLEX');

    // REC_FLEX: WR/TE
    const recPool = [...WRs, ...TEs]
        .filter(p => !used.has(p.playerId))
        .sort((a, b) => b.fantasyIqProj - a.fantasyIqProj);
    take(recPool, rules.REC_FLEX, 'REC_FLEX');

    // WRRB_FLEX: WR/RB
    const wrrbPool = [...WRs, ...RBs]
        .filter(p => !used.has(p.playerId))
        .sort((a, b) => b.fantasyIqProj - a.fantasyIqProj);
    take(wrrbPool, rules.WRRB_FLEX, 'WRRB_FLEX');

    // Anything not in the optimized lineup
    const remaining = eligible.filter(p => !used.has(p.playerId))
        .sort((a, b) => b.fantasyIqProj - a.fantasyIqProj);

    // Split remaining into "benched starters" (should move to bench) and "bench stays"
    const benchedStarters = remaining.filter(p => p.isStarter);
    const bench           = remaining.filter(p => !p.isStarter);

    // Totals
    const optimizedTotalProj = slots.reduce((s, sl) => s + sl.player.fantasyIqProj, 0);
    const currentStarters    = eligible.filter(p => p.isStarter);
    const currentTotalProj   = currentStarters.reduce((s, p) => s + p.fantasyIqProj, 0);
    const gain               = optimizedTotalProj - currentTotalProj;
    const swapCount          = slots.filter(sl => !sl.wasStarter).length;

    return {
        optimizedSlots:     slots,
        benchedStarters,
        bench,
        optimizedTotalProj: Math.round(optimizedTotalProj * 100) / 100,
        currentTotalProj:   Math.round(currentTotalProj * 100) / 100,
        gain:               Math.round(gain * 100) / 100,
        swapCount,
    };
}

export interface TeamLineupOptimization {
    rosterId:   number;
    teamName:   string;
    username:   string | undefined;
    result:     LineupOptimizationResult;
}

// ── Waiver Wire Intelligence ───────────────────────────────────────────────────

export interface WaiverTarget {
    player:         PlayerProjectionRow;
    waiverGain:     number;   // optimizedProjWithFA − optimizedProjCurrent
    replaces:       PlayerProjectionRow | null;  // starter who gets bumped
    becomesStarter: boolean;
}

export interface TeamWaiverAnalysis {
    rosterId:           number;
    teamName:           string;
    username:           string | undefined;
    currentOptProj:     number;
    totalGainAvailable: number;  // waiverGain of the top target
    isAlreadyOptimal:   boolean;
    topTargets:         WaiverTarget[];
}

/**
 * For one team: simulate adding each free agent and measure the improvement
 * to the optimized lineup projection.
 *
 * Free agents with Out/IR/PUP status are skipped.
 * Results are sorted by waiverGain descending.
 */
// ── Trade Insights ────────────────────────────────────────────────────────────

export interface MutualTradeProposal {
    youGive:     PlayerProjectionRow;
    youGet:      PlayerProjectionRow;
    yourGain:    number;
    theirGain:   number;
    tradingWith: string;   // opponent team name
    mutualGain:  number;   // min(yourGain, theirGain) — ranking metric
}

export interface TeamTradeInsights {
    rosterId:  number;
    teamName:  string;
    username:  string | undefined;
    topTrades: MutualTradeProposal[];
}

/**
 * For every pair of teams, find 1-for-1 trades where:
 *   - Both players are skill positions (QB/RB/WR/TE)
 *   - Their FIQProj values are within VALUE_WINDOW of each other
 *   - Swapping improves BOTH teams' optimized lineup projections
 *
 * Results are returned per-team, sorted by mutualGain (most beneficial first).
 */
export function computeTradeInsights(
    teams: TeamProjection[],
    rules: LineupRules,
    topN  = 5,
): TeamTradeInsights[] {
    const SKILL        = new Set(['QB', 'RB', 'WR', 'TE']);
    const VALUE_WINDOW = 0.40; // allow up to 40% difference in FIQProj
    const MIN_PROJ     = 1.0;  // ignore fringe players

    // Pre-compute each team's optimized baseline projection
    const baselines = new Map<number, number>();
    for (const t of teams) {
        baselines.set(t.rosterId, optimizeLineup(t.players, rules).optimizedTotalProj);
    }

    // Accumulate trades from each team's perspective
    const byTeam = new Map<number, MutualTradeProposal[]>();
    const seen   = new Map<number, Set<string>>(); // dedup per team
    for (const t of teams) {
        byTeam.set(t.rosterId, []);
        seen.set(t.rosterId, new Set());
    }

    for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
            const tA   = teams[i];
            const tB   = teams[j];
            const baseA = baselines.get(tA.rosterId)!;
            const baseB = baselines.get(tB.rosterId)!;

            const eligA = tA.players.filter(p => SKILL.has(p.position) && p.fantasyIqProj >= MIN_PROJ);
            const eligB = tB.players.filter(p => SKILL.has(p.position) && p.fantasyIqProj >= MIN_PROJ);

            for (const p1 of eligA) {
                for (const p2 of eligB) {
                    // Value-proximity filter
                    const hi = Math.max(p1.fantasyIqProj, p2.fantasyIqProj);
                    if (Math.abs(p1.fantasyIqProj - p2.fantasyIqProj) / hi > VALUE_WINDOW) continue;

                    // Simulate the swap
                    const aAfter = [
                        ...tA.players.filter(p => p.playerId !== p1.playerId),
                        { ...p2, isStarter: false },
                    ];
                    const bAfter = [
                        ...tB.players.filter(p => p.playerId !== p2.playerId),
                        { ...p1, isStarter: false },
                    ];

                    const deltaA = Math.round((optimizeLineup(aAfter, rules).optimizedTotalProj - baseA) * 100) / 100;
                    const deltaB = Math.round((optimizeLineup(bAfter, rules).optimizedTotalProj - baseB) * 100) / 100;

                    if (deltaA <= 0 || deltaB <= 0) continue;

                    const mutualGain = Math.min(deltaA, deltaB);

                    const keyA = `${p1.playerId}-${p2.playerId}`;
                    if (!seen.get(tA.rosterId)!.has(keyA)) {
                        seen.get(tA.rosterId)!.add(keyA);
                        byTeam.get(tA.rosterId)!.push({
                            youGive: p1, youGet: p2,
                            yourGain: deltaA, theirGain: deltaB,
                            tradingWith: tB.teamName, mutualGain,
                        });
                    }

                    const keyB = `${p2.playerId}-${p1.playerId}`;
                    if (!seen.get(tB.rosterId)!.has(keyB)) {
                        seen.get(tB.rosterId)!.add(keyB);
                        byTeam.get(tB.rosterId)!.push({
                            youGive: p2, youGet: p1,
                            yourGain: deltaB, theirGain: deltaA,
                            tradingWith: tA.teamName, mutualGain,
                        });
                    }
                }
            }
        }
    }

    return teams.map(t => ({
        rosterId:  t.rosterId,
        teamName:  t.teamName,
        username:  t.username,
        topTrades: (byTeam.get(t.rosterId) ?? [])
            .sort((a, b) => b.mutualGain - a.mutualGain)
            .slice(0, topN),
    }));
}

export function computeWaiverTargets(
    rosterId:    number,
    teamName:    string,
    username:    string | undefined,
    teamPlayers: PlayerProjectionRow[],
    freeAgents:  PlayerProjectionRow[],
    rules:       LineupRules,
    topN        = 10,
): TeamWaiverAnalysis {
    const SKIP_STATUS = new Set(['Out', 'IR', 'PUP']);

    const baseline       = optimizeLineup(teamPlayers, rules);
    const currentOptProj = baseline.optimizedTotalProj;
    const baselineIds    = new Set(baseline.optimizedSlots.map(s => s.player.playerId));

    // Only evaluate FAs that could realistically start (proj > 0, not injured out)
    const candidates = freeAgents
        .filter(fa => fa.fantasyIqProj > 0 && !SKIP_STATUS.has(fa.injuryStatus ?? ''))
        .sort((a, b) => b.fantasyIqProj - a.fantasyIqProj);

    const targets: WaiverTarget[] = [];

    for (const fa of candidates) {
        const withFA    = [...teamPlayers, fa];
        const newResult = optimizeLineup(withFA, rules);
        const gain      = Math.round((newResult.optimizedTotalProj - currentOptProj) * 100) / 100;

        if (gain <= 0) continue;

        // Who got bumped out of the optimized lineup?
        const newIds       = new Set(newResult.optimizedSlots.map(s => s.player.playerId));
        const replacedSlot = baseline.optimizedSlots.find(s => !newIds.has(s.player.playerId));

        targets.push({
            player:         fa,
            waiverGain:     gain,
            replaces:       replacedSlot?.player ?? null,
            becomesStarter: newIds.has(fa.playerId),
        });
    }

    targets.sort((a, b) => b.waiverGain - a.waiverGain);
    const topTargets = targets.slice(0, topN);

    return {
        rosterId,
        teamName,
        username,
        currentOptProj,
        totalGainAvailable: topTargets[0]?.waiverGain ?? 0,
        isAlreadyOptimal:   topTargets.length === 0,
        topTargets,
    };
}

// ── Roster Intelligence (RosteriQ) ────────────────────────────────────────────

export type RosterGrade       = 'A' | 'B' | 'C' | 'D';
export type PositionalTagType = 'major_strength' | 'slight_strength' | 'neutral' | 'slight_weakness' | 'major_weakness';
export type DepthTagType      = 'deep' | 'average' | 'thin';
export type RiskTagType       = 'stable' | 'balanced' | 'high_variance';

export interface PositionalAnalysis {
    slot:      string;              // 'QB', 'RB1', 'RB2', 'WR1', etc.
    player:    PlayerProjectionRow;
    fiqProj:   number;
    leagueAvg: number;
    pctDiff:   number;             // (fiqProj − leagueAvg) / leagueAvg
    tag:       PositionalTagType;
}

export interface RosterIntelligence {
    rosterId:        number;
    teamName:        string;
    username:        string | undefined;
    strengthScore:   number;        // ratio vs league avg
    grade:           RosterGrade;
    tagline:         string;
    positional:      PositionalAnalysis[];
    strengths:       PositionalAnalysis[];
    weaknesses:      PositionalAnalysis[];
    depthTag:        DepthTagType;
    depthLabel:      string;
    startableBench:  number;
    waiverGain:      number;
    tradeGain:       number;
    riskTag:         RiskTagType;
    riskLabel:       string;
    volatileCount:   number;
    recommendedPath: string;
}

/**
 * Derives Roster Intelligence from already-computed data — no new queries.
 * Runs after optimizeLineup, computeWaiverTargets, and computeTradeInsights.
 */
export function computeRosterIntelligence(
    teams:             TeamProjection[],
    optimizations:     TeamLineupOptimization[],
    waiverAnalyses:    TeamWaiverAnalysis[],
    tradeInsightsList: TeamTradeInsights[],
): RosterIntelligence[] {
    if (teams.length === 0) return [];

    // Index by rosterId for O(1) lookup
    const optByRoster    = new Map(optimizations.map(o => [o.rosterId, o.result]));
    const waiverByRoster = new Map(waiverAnalyses.map(w => [w.rosterId, w]));
    const tradeByRoster  = new Map(tradeInsightsList.map(t => [t.rosterId, t]));

    // League-average optimized projection
    const optProjs  = optimizations.map(o => o.result.optimizedTotalProj);
    const leagueAvg = optProjs.reduce((s, v) => s + v, 0) / (optProjs.length || 1);

    // League-average starter FIQProj per position (for positional & depth comparisons)
    const projsByPos = new Map<string, number[]>();
    for (const opt of optimizations) {
        for (const sl of opt.result.optimizedSlots) {
            const pos = sl.player.position;
            if (!projsByPos.has(pos)) projsByPos.set(pos, []);
            projsByPos.get(pos)!.push(sl.player.fantasyIqProj);
        }
    }
    const leagueAvgByPos = new Map<string, number>();
    for (const [pos, vals] of projsByPos) {
        leagueAvgByPos.set(pos, vals.reduce((s, v) => s + v, 0) / vals.length);
    }

    const result: RosterIntelligence[] = teams.map(team => {
        const opt        = optByRoster.get(team.rosterId);
        const waiver     = waiverByRoster.get(team.rosterId);
        const trade      = tradeByRoster.get(team.rosterId);
        const optProj    = opt?.optimizedTotalProj ?? 0;
        const waiverGain = waiver?.totalGainAvailable ?? 0;
        const tradeGain  = trade?.topTrades[0]?.yourGain ?? 0;

        // ── 1. Strength score & grade ─────────────────────────────────────────
        const strengthScore = leagueAvg > 0 ? optProj / leagueAvg : 1;
        const grade: RosterGrade =
            strengthScore >= 1.15 ? 'A' :
            strengthScore >= 1.00 ? 'B' :
            strengthScore >= 0.85 ? 'C' : 'D';
        const tagline =
            grade === 'A' ? 'Win-Now Contender'  :
            grade === 'B' ? 'Playoff Bubble Team' :
            grade === 'C' ? 'Needs Work'          : 'Rebuild Candidate';

        // ── 2. Positional analysis ────────────────────────────────────────────
        const slots    = opt?.optimizedSlots ?? [];
        const posCount = new Map<string, number>();

        const positional: PositionalAnalysis[] = slots.map(sl => {
            const pos = sl.player.position;
            const n   = (posCount.get(pos) ?? 0) + 1;
            posCount.set(pos, n);

            const slotsOfPos = slots.filter(s => s.player.position === pos).length;
            const slotLabel  = slotsOfPos > 1 ? `${pos}${n}` : pos;

            const avg     = leagueAvgByPos.get(pos) ?? 0;
            const fiqProj = sl.player.fantasyIqProj;
            const pctDiff = avg > 0 ? (fiqProj - avg) / avg : 0;

            const tag: PositionalTagType =
                pctDiff >=  0.20 ? 'major_strength'  :
                pctDiff >=  0.05 ? 'slight_strength'  :
                pctDiff >= -0.05 ? 'neutral'           :
                pctDiff >= -0.20 ? 'slight_weakness'   : 'major_weakness';

            return { slot: slotLabel, player: sl.player, fiqProj, leagueAvg: avg, pctDiff, tag };
        });

        const strengths  = positional.filter(p => p.tag === 'major_strength'  || p.tag === 'slight_strength');
        const weaknesses = positional.filter(p => p.tag === 'major_weakness'  || p.tag === 'slight_weakness');

        // ── 3. Depth quality ──────────────────────────────────────────────────
        const benchPlayers = [...(opt?.benchedStarters ?? []), ...(opt?.bench ?? [])];
        const startable    = benchPlayers.filter(p => {
            const avg = leagueAvgByPos.get(p.position) ?? 0;
            return avg > 0 && p.fantasyIqProj >= avg;
        });
        const depthTag: DepthTagType =
            startable.length >= 3 ? 'deep' :
            startable.length >= 1 ? 'average' : 'thin';
        const depthLabel =
            depthTag === 'deep'    ? 'Deep and Flexible' :
            depthTag === 'average' ? 'Average Depth'     : 'Thin Bench';

        // ── 4. Risk profile ───────────────────────────────────────────────────
        const INJURY_FLAGS = new Set(['Questionable', 'Doubtful']);
        const volatileStarters = slots.filter(sl => {
            const p = sl.player;
            return p.volatility >= 0.45 || INJURY_FLAGS.has(p.injuryStatus ?? '');
        });
        const volatileCount = volatileStarters.length;
        const riskTag: RiskTagType =
            volatileCount <= 1 ? 'stable' :
            volatileCount <= 3 ? 'balanced' : 'high_variance';
        const riskLabel =
            riskTag === 'stable'       ? 'Stable'        :
            riskTag === 'balanced'     ? 'Balanced'      : 'High Variance';

        // ── 5. Recommended path ───────────────────────────────────────────────
        const majorWeak    = weaknesses.filter(w => w.tag === 'major_weakness');
        const majorStrong  = strengths.filter(s => s.tag === 'major_strength');
        const topWeakSlot  = majorWeak[0]?.slot  ?? weaknesses[0]?.slot  ?? null;
        const topStrongSlot = majorStrong[0]?.slot ?? strengths[0]?.slot ?? null;

        let recommendedPath: string;
        if (weaknesses.length === 0 && waiverGain < 0.5 && tradeGain < 0.5) {
            recommendedPath = grade === 'A'
                ? 'Win-now roster. Stay aggressive — your window is open.'
                : 'Well-optimized roster. Focus on holding key players through bye weeks.';
        } else if (topWeakSlot && waiverGain > 0 && tradeGain > 0) {
            recommendedPath = `Weakness at ${topWeakSlot}. Check waiver targets (+${waiverGain.toFixed(1)} pts) or explore a trade for +${tradeGain.toFixed(1)} pts.`;
        } else if (topWeakSlot && waiverGain > 0) {
            recommendedPath = `Weakness at ${topWeakSlot}. You have +${waiverGain.toFixed(1)} pts available on waivers — review your targets.`;
        } else if (topWeakSlot && tradeGain > 0 && topStrongSlot) {
            recommendedPath = `Weakness at ${topWeakSlot} with ${topStrongSlot} surplus. A ${topStrongSlot}-for-${topWeakSlot} trade could add +${tradeGain.toFixed(1)} pts.`;
        } else if (depthTag === 'thin' && waiverGain > 0) {
            recommendedPath = `Thin bench. Add depth via waivers (+${waiverGain.toFixed(1)} pts available).`;
        } else if (grade === 'D') {
            recommendedPath = 'Prioritize acquiring young assets and future picks. Focus on the long game.';
        } else {
            recommendedPath = 'Monitor your injury situation and stay active on waivers each week.';
        }

        return {
            rosterId:        team.rosterId,
            teamName:        team.teamName,
            username:        team.username,
            strengthScore:   Math.round(strengthScore * 1000) / 1000,
            grade, tagline,
            positional, strengths, weaknesses,
            depthTag, depthLabel, startableBench: startable.length,
            waiverGain, tradeGain,
            riskTag, riskLabel, volatileCount,
            recommendedPath,
        };
    });

    return result.sort((a, b) => b.strengthScore - a.strengthScore);
}
