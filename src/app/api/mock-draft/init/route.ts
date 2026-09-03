// GET /api/mock-draft/init?leagueId=...
// Returns the full MockDraftInitResponse: league context + BPA-sorted player board.
// No persistence — mock drafts are in-memory practice runs.

import { type NextRequest } from 'next/server';
import { auth }                     from '@/lib/auth';
import { requireLeaguePaidAccess }  from '@/lib/access';
import { prisma }                   from '@/lib/prisma';
import {
    getLeagueRosters,
    getLeagueUsers,
    getLeagueDrafts,
    getTradedPicks,
    getNflState,
    getPlayers,
} from '@/lib/sleeper';
import type { SleeperTradedPick } from '@/lib/sleeper';
import type {
    MockLeagueContext,
    MockDraftBoard,
    MockDraftInitResponse,
    MockTeam,
    MockPlayer,
    MockDraftPick,
    MockDraftSettings,
    NeedsProfile,
    PersonalityProfile,
} from '@/lib/mock-draft/types';
import { buildNeedsProfile } from '@/lib/mock-draft/NeedsEngine';
import { assessTeamNeeds, deriveSlots, positionValue } from '@/lib/needs/assessTeamNeeds';
import { countStartersPerTeam }   from '@/lib/draft/draftStrategyUtils';
import {
    computeRealPoints, computePerfFactor,
    computePositionScoringFactor, combineScoringFactors, STANDARD_SCORING,
} from '@/lib/rankings/leagueScoringPoints';
import { resolveProductionSignals } from '@/lib/rankings/productionSignals';
import { buildLeagueConfig } from '@/lib/rankings/leagueConfigBuilder';
import { buildLeagueDefensiveAndKickerRankings } from '@/lib/rankings/defensiveEngine';
import { buildIdpSeedProjections, buildKickerSeedProjections, buildDefenseSeedProjections, toIdpPosition } from '@/lib/rankings/seedProjections';
import { buildProjectionsFromSleeperStats } from '@/lib/rankings/sleeperStatsAdapter';
import { calculateAge, isPlausiblyActivePlayer } from '@/lib/calculateAge';
import { buildSleeperNameResolver } from '@/lib/sleeperNameResolver';

export const maxDuration = 30;

// ── Seeded PRNG for stable team personalities ─────────────────────────────────

function hashCode(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

function makeSeededRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(1664525, s) + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}

function buildPersonality(teamId: string, isUser: boolean): PersonalityProfile {
    if (isUser) return { riskTolerance: 'MEDIUM', needBias: 0.5, chaosBias: 0.6 };
    const rng = makeSeededRng(hashCode(teamId));
    const r1 = rng(), r2 = rng(), r3 = rng();
    return {
        riskTolerance: r1 < 0.33 ? 'LOW' : r1 < 0.66 ? 'MEDIUM' : 'HIGH',
        needBias:      0.25 + r2 * 0.55,
        chaosBias:     0.35 + r3 * 0.55,
    };
}

// ── Snake draft order builder ──────────────────────────────────────────────────

function buildDraftOrder(
    roundSlots: string[][],   // per-round slot arrays (traded pick overrides already applied)
    totalRounds:  number,
    isSnake:      boolean,
): MockDraftPick[] {
    const N     = roundSlots[0]?.length ?? 0;
    const picks: MockDraftPick[] = [];

    for (let round = 1; round <= totalRounds; round++) {
        const slots  = roundSlots[round - 1] ?? roundSlots[0];
        const isEven = isSnake && round % 2 === 0;
        for (let i = 0; i < N; i++) {
            const slot   = isEven ? N - i : i + 1;
            const teamId = slots[slot - 1];
            if (!teamId) continue;
            picks.push({
                overall: (round - 1) * N + i + 1,
                round,
                slot,
                teamId,
            });
        }
    }
    return picks;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const leagueId  = searchParams.get('leagueId');
    const modeParam = searchParams.get('mode') as 'dynasty' | 'redraft' | null;
    const slotParam = parseInt(searchParams.get('slot') ?? '0', 10) || 0;
    if (!leagueId) return Response.json({ error: 'Missing leagueId' }, { status: 400 });

    const league = await prisma.league.findUnique({
        where:  { id: leagueId },
        select: {
            id: true, userId: true, leagueId: true, leagueName: true,
            leagueType: true, rosterPositions: true, scoringType: true,
            scoringSettings: true,
            totalRosters: true, sleeperUserId: true, season: true,
            assignedPlanId: true, assignedPlanType: true,
            platform: true, standings: true,
        },
    });

    if (!league || league.userId !== session.user.id) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const deny = await requireLeaguePaidAccess(session.user.id, league.assignedPlanId, league.assignedPlanType);
    if (deny) return deny;

    // ── League settings ────────────────────────────────────────────────────────
    const rosterPositions = (league.rosterPositions ?? []) as string[];
    const isDynasty       = modeParam === 'dynasty' ? true : modeParam === 'redraft' ? false : league.leagueType === 'Dynasty';
    const superflex       = rosterPositions.includes('SUPER_FLEX');
    const tePremium       = rosterPositions.includes('TE_FLEX');

    // Real per-league scoring settings — drives both the League Scoring Points
    // Engine (perfFactor nudge on QB/RB/WR/TE) and the defensive engine (K/DEF/IDP)
    // below, same source of truth as Trade Evaluator / Dynasty Rankings / Redraft Board.
    const scoringSettings = (league.scoringSettings as Record<string, number> | null) ?? STANDARD_SCORING;

    // IDP support: detect whether this league starts defensive players, and how
    // many IDP starter slots it has (drives whether IDP enter the rookie pool).
    const IDP_SLOTS = new Set(['DL','DE','DT','NT','LB','OLB','ILB','MLB','DB','CB','S','FS','SS','NB','IDP','IDPFLEX','IDP_FLEX']);
    const IDP_PLAYER_POSITIONS = ['DE','DT','NT','DL','EDGE','OLB','ILB','MLB','LB','CB','FS','SS','NB','S','DB','SAF'];
    const hasIDP          = rosterPositions.some(p => IDP_SLOTS.has(p));
    const idpStarterSlots = rosterPositions.filter(p => IDP_SLOTS.has(p)).length;
    const hasK            = rosterPositions.includes('K');
    const hasDef          = rosterPositions.includes('DEF');

    const rawSlots        = countStartersPerTeam(rosterPositions);
    const starterSlots    = {
        QB:   rawSlots.QB   ?? 1,
        RB:   rawSlots.RB   ?? 2,
        WR:   rawSlots.WR   ?? 2,
        TE:   rawSlots.TE   ?? 1,
        FLEX: (rawSlots['FLEX'] ?? 0) + (rawSlots['SUPER_FLEX'] ?? 0),
        K:    rawSlots['K']   ?? (rosterPositions.includes('K')   ? 1 : 0),
        DEF:  rawSlots['DEF'] ?? (rosterPositions.includes('DEF') ? 1 : 0),
        IDP:  idpStarterSlots,
    };

    // For redraft mode applied to a dynasty league: treat all rosters as empty
    // so needs start at 0 (redraft = no carryover players).
    const forceEmptyRosters = modeParam === 'redraft';

    // ── Parallel Sleeper fetches ───────────────────────────────────────────────
    let [rosters, members, drafts, dbUser, tradedPicksRaw, nflState] = await Promise.all([
        getLeagueRosters(league.leagueId).catch(() => []),
        getLeagueUsers(league.leagueId).catch(() => []),
        getLeagueDrafts(league.leagueId).catch(() => []),
        prisma.user.findUnique({ where: { id: session.user.id }, select: { sleeperUserId: true } }),
        getTradedPicks(league.leagueId).catch(() => [] as SleeperTradedPick[]),
        getNflState(),
    ]);
    const statsSeason = nflState.season;

    // For ESPN / Yahoo / NFL leagues, Sleeper calls return [].
    // Fall back to team data stored in league.standings during ESPN sync.
    if (rosters.length === 0 && league.platform !== 'sleeper') {
        type StandingRow = { teamId?: string | number; name?: string; abbrev?: string; ownerId?: string };
        const rows = Array.isArray(league.standings) ? (league.standings as StandingRow[]) : [];
        if (rows.length > 0) {
            rosters = rows.map((t, i) => ({
                roster_id: parseInt(String(t.teamId ?? i + 1), 10) || (i + 1),
                owner_id:  String(t.ownerId ?? t.teamId ?? i + 1),
                players:   [] as string[],
            })) as typeof rosters;
            members = rows.map(t => ({
                user_id:      String(t.ownerId ?? t.teamId ?? ''),
                display_name: t.name ?? t.abbrev ?? 'Team',
                metadata:     { team_name: t.name ?? '' },
                avatar:       null,
            })) as typeof members;
        }
    }

    // ── Identify user's roster ────────────────────────────────────────────────
    const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId ?? null;
    const userRoster      = rosters.find(r => r.owner_id === mySleeperUserId) ?? rosters[0];
    const yourTeamId      = String(userRoster?.roster_id ?? 1);

    // ── Determine draft type & parameters ─────────────────────────────────────
    const hasExistingRosters = !forceEmptyRosters && rosters.some(r => (r.players ?? []).length > 5);
    const isRookieDraft      = isDynasty && hasExistingRosters;
    const isRedraftMode      = !isDynasty && !isRookieDraft;

    const upcomingDraft = drafts.find(d => d.status === 'pre_draft' || d.status === 'drafting')
        ?? drafts.at(-1)
        ?? null;

    // ── Rookie draft availability gate ─────────────────────────────────────────
    // A rookie mock draft only means something if there's a real rookie draft
    // left to prep for. If this league's own draft already ran (Sleeper marks
    // it 'complete' and there's no pre_draft/drafting one), there's nothing
    // upcoming until next year's incoming class is released — showing this
    // year's already-drafted class as if it were still available is actively
    // misleading (e.g. a top rookie already on a real roster still surfacing
    // near the top of the mock board). Prefer next season's class if it's
    // been published; otherwise report unavailable instead of a stale board.
    let rookieDraftSeason = league.season ?? '2026';
    if (isRookieDraft && upcomingDraft?.status === 'complete') {
        const nextSeason = String(Number(rookieDraftSeason) + 1);
        const nextSeasonCount = await prisma.rookieRankingsPlayer.count({ where: { season: nextSeason } });
        if (nextSeasonCount > 0) {
            rookieDraftSeason = nextSeason;
        } else {
            return Response.json({
                unavailable: true,
                reason: `Your ${rookieDraftSeason} rookie draft is already complete. Mock Draft will be back once next year's rookie class is released.`,
            });
        }
    }

    const totalTeams  = rosters.length || (league.totalRosters ?? 12);
    const defaultRounds = isRookieDraft ? 5 : (rosterPositions.length || (isDynasty ? 20 : 15));
    const totalRounds   = upcomingDraft?.settings?.rounds ?? defaultRounds;
    const defaultType   = isRookieDraft ? 'linear' : 'snake'; // rookie drafts are linear; redraft & dynasty startup snake
    const isSnake       = (upcomingDraft?.type ?? defaultType) !== 'linear';

    const settings: MockDraftSettings = {
        totalTeams,
        totalRounds,
        isSnake,
        superflex,
        tePremium,
        isDynasty,
        isRookieDraft,
        starterSlots,
        draftMode: isRookieDraft ? 'rookie' : isDynasty ? 'dynasty' : 'redraft',
    };

    // ── Build slot → teamId mapping ────────────────────────────────────────────
    const memberMap      = new Map(members.map(m => [m.user_id, m]));
    const sleeperOrder   = upcomingDraft?.draft_order ?? null;   // userId → slot (1-indexed)
    let slotToTeamId: string[];

    if (sleeperOrder && Object.keys(sleeperOrder).length > 0) {
        slotToTeamId = new Array(totalTeams).fill('');
        for (const [userId, slot] of Object.entries(sleeperOrder)) {
            const r = rosters.find(r => r.owner_id === userId);
            if (r && slot >= 1 && slot <= totalTeams) {
                slotToTeamId[slot - 1] = String(r.roster_id);
            }
        }
        // Fill gaps with any unassigned rosters
        const used   = new Set(slotToTeamId.filter(Boolean));
        const unused = rosters.map(r => String(r.roster_id)).filter(id => !used.has(id));
        for (let i = 0; i < slotToTeamId.length; i++) {
            if (!slotToTeamId[i]) slotToTeamId[i] = unused.shift() ?? '';
        }
    } else {
        // Random order — shuffle all roster IDs
        slotToTeamId = rosters.map(r => String(r.roster_id));
        for (let i = slotToTeamId.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [slotToTeamId[i], slotToTeamId[j]] = [slotToTeamId[j], slotToTeamId[i]];
        }
    }

    // If the user requested a specific slot, swap their team into that position.
    const desiredSlot = slotParam >= 1 && slotParam <= totalTeams ? slotParam : null;
    if (desiredSlot) {
        const currentIdx  = slotToTeamId.indexOf(yourTeamId);
        const targetIdx   = desiredSlot - 1;
        if (currentIdx !== -1 && currentIdx !== targetIdx) {
            const displaced = slotToTeamId[targetIdx];
            slotToTeamId[targetIdx]  = yourTeamId;
            slotToTeamId[currentIdx] = displaced;
        }
    }

    // Build per-round slot arrays and apply traded-pick overrides.
    // roster.draft_picks contains picks the roster currently owns (possibly from other teams).
    // For each traded pick, find the original team's slot and remap it to the new owner.
    const rosterToOwner = new Map(rosters.map(r => [r.roster_id, r.owner_id]));
    const currentSeason = upcomingDraft?.season ?? String(new Date().getFullYear());
    const roundSlots: string[][] = Array.from({ length: totalRounds }, () => [...slotToTeamId]);

    // /traded_picks is a log — if a pick changed hands multiple times (A→B→C),
    // there are multiple entries. Group by (round, originalRosterId) and find the
    // terminal owner: the entry whose owner_id isn't anyone else's previous_owner_id.
    const pickGroups = new Map<string, SleeperTradedPick[]>();
    for (const dp of tradedPicksRaw) {
        if (dp.season !== currentSeason) continue;
        const key = `${dp.round}_${dp.roster_id}`;
        const g = pickGroups.get(key) ?? [];
        g.push(dp);
        pickGroups.set(key, g);
    }

    if (sleeperOrder) {
        for (const [key, trades] of pickGroups) {
            // Find terminal owner (not traded on further)
            const prevOwnerIds = new Set(trades.map(t => Number(t.previous_owner_id)));
            const terminal = trades.find(t => !prevOwnerIds.has(Number(t.owner_id)));
            const currentOwnerRosterId = Number(terminal?.owner_id ?? trades[trades.length - 1].owner_id);

            const [roundStr, origRosterIdStr] = key.split('_');
            const round = Number(roundStr);
            const origRosterId = Number(origRosterIdStr);

            if (currentOwnerRosterId === origRosterId) continue;  // not traded (or traded back)
            if (round < 1 || round > totalRounds) continue;

            const origUserId = rosterToOwner.get(origRosterId);
            if (!origUserId) continue;
            const slot = sleeperOrder[origUserId];
            if (!slot || slot < 1 || slot > totalTeams) continue;
            roundSlots[round - 1][slot - 1] = String(currentOwnerRosterId);
        }
    }

    const draftOrder = buildDraftOrder(roundSlots, totalRounds, isSnake);

    // Players already on any real roster in this league — excluded from the
    // rookie draft pool below (a rookie already drafted onto a real roster
    // isn't "available," even though FiQ rookie rankings has no concept of
    // draft state and would otherwise keep surfacing them at full value).
    const existingPlayerIds = [...new Set(rosters.flatMap(r => r.players ?? []).filter(Boolean))];

    // ── Load player pool ───────────────────────────────────────────────────────
    let boardPlayers: MockPlayer[] = [];

    if (isRookieDraft) {
        // Dynasty rookie draft: FiQ rookie rankings as the pool.
        //
        // Position scarcity multipliers: dynasty values RBs above same-tier WRs because
        // RBs age faster, contribute earlier, and are scarcer at the top of any class.
        // Without this adjustment, WRs (which tend to score higher in raw FiQ) would
        // dominate round 1 and elite RBs like Coleman/Singleton/Johnson fall to round 2.
        const DYNASTY_POS_MULT: Record<string, number> = {
            QB: 0.97,
            RB: 0.97,
            WR: 0.97,                      // baseline
            TE: 1.01,
        };

        // IDP fantasy value depends heavily on how many IDP a league starts.
        // With only 1 IDP starter, demand is minimal — elite defenders fall far
        // down the board (essentially undrafted by the CPU), while deep IDP
        // leagues value them in early rounds. Scale the dampener with slot count:
        // ~0.62 at 1 slot → caps at 0.90 for deep IDP leagues. (tunable)
        const idpMult = Math.min(0.90, 0.55 + 0.07 * idpStarterSlots);

        const rookiePositions = hasIDP
            ? ['QB', 'RB', 'WR', 'TE', ...IDP_PLAYER_POSITIONS]
            : ['QB', 'RB', 'WR', 'TE'];
        const rookiesRaw = await prisma.rookieRankingsPlayer.findMany({
            where:   { season: rookieDraftSeason, position: { in: rookiePositions } },
            orderBy: { fiqScore: 'desc' },
            select:  { playerName: true, position: true, fiqScore: true, fiqTier: true, height: true, weight: true, fortyTime: true, sleeperPlayerId: true },
        });

        // Broad fetch by position, not an exact-string match against FiQ's own
        // rookie names — a name-filtered query silently misses real matches
        // whenever the two sources spell a suffix differently (see
        // buildSleeperNameResolver's header).
        const sleeperPlayers = rookiesRaw.length > 0
            ? await prisma.sleeperPlayer.findMany({
                where:  { position: { in: rookiePositions } },
                select: { playerId: true, fullName: true, team: true, age: true, position: true, injuryStatus: true },
              })
            : [];
        const resolveSleeper = buildSleeperNameResolver(sleeperPlayers);
        // Prefer the stored sleeperPlayerId (resolved once at sync time by the
        // same suffix/nickname-safe matcher) over re-resolving by name here;
        // fall back to the name resolver only when the ID is null.
        const sleeperById = new Map(sleeperPlayers.map(p => [p.playerId, p]));
        function resolveSleeperForRookie(r: { playerName: string; position: string; sleeperPlayerId: string | null }) {
            return (r.sleeperPlayerId ? sleeperById.get(r.sleeperPlayerId) : undefined)
                ?? resolveSleeper(r.playerName, r.position);
        }

        // Exclude rookies already on a real roster in this league — already
        // drafted/rostered, not actually available. A rookie with no Sleeper
        // match can't be checked against rosters, so it's kept by default
        // rather than guessed at.
        const existingPlayerIdSet = new Set(existingPlayerIds);
        const rookies = rookiesRaw.filter(r => {
            const sp = resolveSleeperForRookie(r);
            return !sp || !existingPlayerIdSet.has(sp.playerId);
        });

        boardPlayers = rookies
            .map((r, i) => {
                const sp        = resolveSleeperForRookie(r);
                const mult      = IDP_PLAYER_POSITIONS.includes(r.position)
                    ? idpMult
                    : (DYNASTY_POS_MULT[r.position] ?? 1.0);
                const baseScore = Math.min(100, Math.max(1, Math.round(r.fiqScore * mult)));
                const tierMatch = r.fiqTier?.match(/(\d+)/);
                const tier      = tierMatch ? parseInt(tierMatch[1], 10)
                    : Math.min(5, Math.max(1, Math.ceil((i + 1) / Math.max(rookies.length / 5, 1))));
                return {
                    playerId:     sp?.playerId ?? `rookie-${i}`,
                    name:         r.playerName,
                    position:     (IDP_PLAYER_POSITIONS.includes(r.position) ? 'IDP' : r.position) as MockPlayer['position'],
                    team:         sp?.team ?? null,
                    age:          sp?.age ?? null,
                    tier:         Math.min(5, Math.max(1, tier)),
                    baseScore,
                    isRookie:     true,
                    injuryStatus: sp?.injuryStatus ?? null,
                    imageUrl:     sp ? `https://sleepercdn.com/content/nfl/players/${sp.playerId}.jpg` : null,
                    height:       r.height,
                    weight:       r.weight,
                    fortyTime:    r.fortyTime,
                };
            })
            // Re-sort by adjusted baseScore so the board reflects dynasty-adjusted BPA
            .sort((a, b) => b.baseScore - a.baseScore);
    } else {
        // Startup dynasty or redraft: FantasyCalc values.
        // For redraft, use a smaller QB/RB/WR/TE pool (≈10 rounds worth) so that
        // K/DEF — added separately — naturally appear in the BPA window by round 11+.
        const needed = isRedraftMode
            ? Math.ceil(totalTeams * totalRounds * 0.72) + 30
            : totalTeams * totalRounds + 60;

        const fcValues = await prisma.fantasyCalcValue.findMany({
            where: {
                position: { in: ['QB', 'RB', 'WR', 'TE'] },
                ...(isDynasty
                    ? { dynastyValue: { gt: 100 } }
                    : { redraftValue: { gt: 50 } }),
            },
            orderBy: isDynasty
                ? (superflex ? { dynastyValueSf: 'desc' } : { dynastyValue: 'desc' })
                : (superflex ? { redraftValueSf: 'desc' } : { redraftValue:   'desc' }),
            take:    needed,
            select:  {
                playerName: true, position: true,
                dynastyValue: true, dynastyValueSf: true,
                redraftValue: true, redraftValueSf: true,
                sleeperPlayerId: true,
            },
        });

        // Broad fetch by position, not an exact-string match against
        // FantasyCalc's own playerName — a name-filtered query silently
        // misses real matches whenever the two sources spell a suffix
        // differently (see buildSleeperNameResolver's header). This was
        // the actual root cause of real active players like "Kenneth
        // Walker III" / "Brian Thomas Jr." showing as FA with no
        // team/age/image in the pool: FantasyCalc's playerName carries the
        // suffix, Sleeper's fullName doesn't, so the old `in: [...]` filter
        // never even fetched their Sleeper row.
        const sleeperPlayers = fcValues.length > 0
            ? await prisma.sleeperPlayer.findMany({
                where:  { position: { in: ['QB', 'RB', 'WR', 'TE'] }, active: true },
                select: { playerId: true, fullName: true, team: true, age: true, position: true, injuryStatus: true },
              })
            : [];
        const resolveSleeper = buildSleeperNameResolver(sleeperPlayers);
        // Prefer the stored sleeperPlayerId (resolved once at sync time by the
        // same suffix/nickname-safe matcher) over re-resolving by name here;
        // fall back to the name resolver only when the ID is null.
        const sleeperById = new Map(sleeperPlayers.map(p => [p.playerId, p]));
        function resolveSleeperForFc(v: { playerName: string; position: string; sleeperPlayerId: string | null }) {
            return (v.sleeperPlayerId ? sleeperById.get(v.sleeperPlayerId) : undefined)
                ?? resolveSleeper(v.playerName, v.position);
        }

        // League Scoring Points Engine: real per-league scoring adjustment on
        // top of the FantasyCalc market-consensus anchor — same source and
        // same pattern already proven in Live Draft Assistant (contextLoader.ts).
        // Sourced from whichever real signal each player actually has: this
        // season's real stats, else this season's real projection (reflects
        // this year's actual team/role/health), else last season's real
        // stats as a final fallback. See productionSignals.ts.
        const statsByPlayerId = fcValues.length > 0
            ? await resolveProductionSignals(sleeperPlayers.map(p => p.playerId))
            : new Map();

        // Pass 1: resolve real per-game production and accumulate positional
        // totals — perfFactor can't be computed until every player in a
        // position group has been seen.
        type FcRow = (typeof fcValues)[number];
        type PendingFc = {
            v: FcRow; sp: (typeof sleeperPlayers)[number] | undefined;
            realPtsPerGame: number; standardPtsPerGame: number;
            gamesPlayed: number | null;
        };
        const pendingFc: PendingFc[] = [];
        const posPtsSum = new Map<string, number>(), posPtsCount = new Map<string, number>(), posStdPtsSum = new Map<string, number>();

        for (const v of fcValues) {
            const sp     = resolveSleeperForFc(v);
            const stats  = sp?.playerId ? statsByPlayerId.get(sp.playerId) : undefined;
            const realPtsPerGame     = stats ? computeRealPoints(stats.statsPerGame, scoringSettings) : 0;
            const standardPtsPerGame = stats ? computeRealPoints(stats.statsPerGame, STANDARD_SCORING) : 0;

            if (stats?.gamesPlayed) {
                posPtsSum.set(v.position, (posPtsSum.get(v.position) ?? 0) + realPtsPerGame);
                posPtsCount.set(v.position, (posPtsCount.get(v.position) ?? 0) + 1);
                posStdPtsSum.set(v.position, (posStdPtsSum.get(v.position) ?? 0) + standardPtsPerGame);
            }
            pendingFc.push({ v, sp, realPtsPerGame, standardPtsPerGame, gamesPlayed: stats?.gamesPlayed ?? null });
        }

        const posAvgPtsPerGame = new Map<string, number>(), posStdAvgPtsPerGame = new Map<string, number>();
        for (const [pos, sum] of posPtsSum) posAvgPtsPerGame.set(pos, sum / (posPtsCount.get(pos) ?? 1));
        for (const [pos, sum] of posStdPtsSum) posStdAvgPtsPerGame.set(pos, sum / (posPtsCount.get(pos) ?? 1));
        const posScoringFactor = new Map<string, number>();
        for (const pos of posAvgPtsPerGame.keys()) {
            posScoringFactor.set(pos, computePositionScoringFactor(posAvgPtsPerGame.get(pos) ?? 0, posStdAvgPtsPerGame.get(pos) ?? 0));
        }

        // FantasyCalc's dynastyValue and redraftValue share the same 0-9999
        // scale (confirmed: both max out at 9999) — a 5000 cap for redraft
        // was wrong and clamped every player above it (104 real players, incl.
        // merely-good ones like Brock Bowers/Trey McBride) to the same max
        // baseScore of 100 as the true top of the board (Gibbs/Bijan/Chase),
        // erasing all real differentiation and letting a Redraft mock draft's
        // CPU bots randomly draft a TE 1st or 2nd overall.
        const VALUE_CAP = 9999;

        boardPlayers = pendingFc.map(({ v, sp, realPtsPerGame, gamesPlayed }, i) => {
            const rawVal = isDynasty
                ? (superflex ? v.dynastyValueSf : v.dynastyValue)
                : (superflex ? v.redraftValueSf : v.redraftValue);
            const rawBaseScore = Math.min(100, Math.max(1, Math.round((rawVal / VALUE_CAP) * 100)));

            const individualFactor = gamesPlayed
                ? computePerfFactor(realPtsPerGame, posAvgPtsPerGame.get(v.position) ?? 0, gamesPlayed)
                : 1.0;
            const positionFactor = posScoringFactor.get(v.position) ?? 1.0;
            const perfFactor     = combineScoringFactors(individualFactor, positionFactor);

            // Additive, bounded nudge rather than a multiplier — rawBaseScore
            // already saturates at 100 for elite players (same reasoning as
            // contextLoader.ts's Live Draft Assistant), so multiplying by
            // perfFactor (up to 1.4375x) would collapse the top of the pool.
            const perfAdjustment = Math.round((perfFactor - 1) * 20);
            const baseScore = Math.min(100, Math.max(1, rawBaseScore + perfAdjustment));
            const tier = baseScore >= 85 ? 1 : baseScore >= 70 ? 2 : baseScore >= 50 ? 3 : baseScore >= 30 ? 4 : 5;
            return {
                playerId:     sp?.playerId ?? `fc-${i}`,
                name:         v.playerName,
                position:     v.position as MockPlayer['position'],
                team:         sp?.team ?? null,
                age:          sp?.age ?? null,
                tier,
                baseScore,
                isRookie:     false,
                injuryStatus: sp?.injuryStatus ?? null,
                imageUrl:     sp ? `https://sleepercdn.com/content/nfl/players/${sp.playerId}.jpg` : null,
            };
        }).sort((a, b) => b.baseScore - a.baseScore);
    }

    // ── K/DEF/IDP: append to the player pool using the real defensive engine ──
    // Reuses the same engine already proven in Trade Evaluator / Dynasty
    // Rankings (real per-league scoring, positional scarcity from actual
    // roster slot counts, ceilings K max 45 / DEF max 55 / IDP 60-70 on the
    // same 0-100 scale as everything else on the board) instead of a random
    // shuffle. Runs for both dynasty-startup and redraft mock drafts — not
    // rookie drafts, which source IDP rookies from RookieRankingsPlayer above.
    if (!isRookieDraft && (hasK || hasDef || hasIDP)) {
        const allPlayersRaw = await getPlayers();
        const { scoring, lineup } = buildLeagueConfig(scoringSettings, rosterPositions, totalTeams);

        // Sleeper's free feed leaves long-retired players marked active with
        // stale data — team!=FA plus a real-age cutoff catches most of it,
        // and a depth-chart+experience check catches the rarer case where
        // team AND birthDate are both stale (see feedback_stale_sleeper_player_data,
        // feedback_mock_draft_stale_rookie_pool).
        const allPlayers: typeof allPlayersRaw = {};
        for (const [pid, player] of Object.entries(allPlayersRaw)) {
            const age = calculateAge(player.birthDate) ?? player.age ?? null;
            if (!isPlausiblyActivePlayer({ team: player.team, age, depthChartOrder: player.depthChartOrder, yearsExp: player.yearsExp })) continue;
            allPlayers[pid] = player;
        }

        const idpPlayersForEngine: { playerId: string; position: 'DL' | 'LB' | 'DB' }[] = [];
        const kickerIdsForEngine: string[] = [];
        for (const [pid, player] of Object.entries(allPlayers)) {
            if (hasIDP) {
                const idpPos = toIdpPosition(player.position);
                if (idpPos) idpPlayersForEngine.push({ playerId: pid, position: idpPos });
            }
            if (hasK && player.position === 'K') kickerIdsForEngine.push(pid);
        }

        // Live stats-based projections need a season with real completed games —
        // try the current season first, fall back to the prior completed one
        // during the preseason window when this year's stats don't exist yet.
        const liveProjections = await buildProjectionsFromSleeperStats(statsSeason, allPlayers, scoringSettings)
            ?? await buildProjectionsFromSleeperStats(String(Number(statsSeason) - 1), allPlayers, scoringSettings);
        const idpProjections     = liveProjections?.idpProjections     ?? buildIdpSeedProjections(idpPlayersForEngine);
        const kickerProjections  = liveProjections?.kickerProjections  ?? buildKickerSeedProjections(kickerIdsForEngine);
        const defenseProjections = liveProjections?.defenseProjections ?? buildDefenseSeedProjections();

        const rankings = buildLeagueDefensiveAndKickerRankings(
            scoring, lineup, idpProjections, kickerProjections, defenseProjections,
            isDynasty ? 'Dynasty' : 'Redraft', liveProjections?.offensiveTop5Avg ?? {},
        );

        const defensiveEntities = [
            ...(hasIDP ? rankings.idp      : []),
            ...(hasK   ? rankings.kickers  : []),
            ...(hasDef ? rankings.defenses : []),
        ];

        if (defensiveEntities.length > 0) {
            const entityIds = defensiveEntities.map(e => e.id);
            const entityPlayers = await prisma.sleeperPlayer.findMany({
                where:  { playerId: { in: entityIds } },
                select: { playerId: true, fullName: true, position: true, team: true, age: true, injuryStatus: true },
            });
            const entityById = new Map(entityPlayers.map(p => [p.playerId, p]));

            const defMock: MockPlayer[] = [];
            for (const entity of defensiveEntities) {
                const sp = entityById.get(entity.id);
                if (!sp?.fullName) continue; // no real player/team match — skip rather than guess
                const isIdp = IDP_PLAYER_POSITIONS.includes(sp.position ?? '');
                const baseScore = Math.min(100, Math.max(1, Math.round(entity.valueScore)));
                const tier = baseScore >= 85 ? 1 : baseScore >= 70 ? 2 : baseScore >= 50 ? 3 : baseScore >= 30 ? 4 : 5;
                defMock.push({
                    playerId:     entity.id,
                    name:         sp.fullName,
                    position:     (isIdp ? 'IDP' : sp.position) as MockPlayer['position'],
                    team:         sp.team ?? null,
                    age:          sp.age ?? null,
                    tier,
                    baseScore,
                    isRookie:     false,
                    injuryStatus: sp.injuryStatus ?? null,
                    imageUrl:     `https://sleepercdn.com/content/nfl/players/${entity.id}.jpg`,
                });
            }
            boardPlayers = [...boardPlayers, ...defMock].sort((a, b) => b.baseScore - a.baseScore);
        }
    }

    // ── Build existing roster position + name lookup ──────────────────────────
    const existingSleeperPlayers = existingPlayerIds.length > 0
        ? await prisma.sleeperPlayer.findMany({
            where:  { playerId: { in: existingPlayerIds } },
            select: { playerId: true, position: true, fullName: true },
          })
        : [];
    const existingPlayerById = new Map(existingSleeperPlayers.map(p => [p.playerId, p]));

    // ── For rookie drafts: load FC dynasty values to compute quality-based needs ─
    // Raw player counts always show 0% on a full dynasty roster (teams have 6+ WRs).
    // Quality needs count "meaningful dynasty assets" (value > threshold) vs. target depth.
    // TEs have lower dynasty values overall — a quality starter sits around 1500-2500,
    // while quality RBs/WRs/QBs are 3000+. Using the same threshold inflates TE need.
    const QUALITY_THRESHOLD: Record<string, number> = {
        QB: 3000,
        RB: 3000,
        WR: 3000,
        TE: 1500,
    };

    const fcValueByName = new Map<string, number>();  // playerName.lower → dynastyValue
    if (isRookieDraft && existingSleeperPlayers.length > 0) {
        const names = existingSleeperPlayers
            .filter(p => ['QB', 'RB', 'WR', 'TE'].includes(p.position))
            .map(p => p.fullName)
            .filter((n): n is string => Boolean(n));

        if (names.length > 0) {
            const fcRows = await prisma.fantasyCalcValue.findMany({
                where:  { playerName: { in: names } },
                select: { playerName: true, dynastyValue: true, dynastyValueSf: true },
            });
            for (const row of fcRows) {
                const val = superflex ? row.dynastyValueSf : row.dynastyValue;
                fcValueByName.set(row.playerName.toLowerCase(), val);
            }
        }
    }

    // ── Unified Team Needs setup (same model as Trade Partners) ───────────────
    const needSlots = deriveSlots(rosterPositions);
    const idpSet = new Set(IDP_PLAYER_POSITIONS);
    const playersByPosFor = (r: typeof rosters[number]): Record<string, number[]> => {
        const m: Record<string, number[]> = {};
        if (forceEmptyRosters) return m;   // redraft: rosters start empty
        for (const pid of (r.players ?? [])) {
            const sp = existingPlayerById.get(pid);
            if (!sp?.position) continue;
            const pos = idpSet.has(sp.position) ? 'IDP' : sp.position;
            const dtv = ['QB','RB','WR','TE'].includes(pos) && sp.fullName
                ? (fcValueByName.get(sp.fullName.toLowerCase()) ?? 0)
                : 0;   // IDP/K/DEF have no DTV — depth-only (count still matters)
            (m[pos] ??= []).push(dtv);
        }
        return m;
    };
    // League-average positional value (offense), same metric the module uses
    const needLeagueAvg: Record<string, number> = {};
    for (const pos of ['QB','RB','WR','TE']) {
        const starters = needSlots.starters[pos] ?? 0;
        const sum = rosters.reduce((s, r) => s + positionValue(playersByPosFor(r)[pos] ?? [], starters), 0);
        needLeagueAvg[pos] = sum / (rosters.length || 1);
    }
    const idpUrgencyCap = hasIDP ? Math.min(0.6, 0.18 * idpStarterSlots) : undefined;
    const needUrgencyCaps: Record<string, number> = {
        K: 0.35, DEF: 0.45,
        ...(idpUrgencyCap !== undefined ? { IDP: idpUrgencyCap } : {}),
    };
    const needDepthOnly = new Set(['DEF', 'IDP']);  // no DTV value source

    // ── Build teams ────────────────────────────────────────────────────────────
    const teams: MockTeam[] = rosters.map(r => {
        const teamId    = String(r.roster_id);
        const member    = memberMap.get(r.owner_id ?? '');
        const ownerName = member?.metadata?.team_name || member?.display_name || `Team ${r.roster_id}`;
        const isUser    = teamId === yourTeamId;

        const rosterByPosition: Record<string, number> = {};
        // Redraft: all teams start empty — no carryover from existing dynasty rosters
        if (!forceEmptyRosters) {
            for (const pid of (r.players ?? [])) {
                const sp = existingPlayerById.get(pid);
                if (sp?.position && ['QB', 'RB', 'WR', 'TE'].includes(sp.position)) {
                    rosterByPosition[sp.position] = (rosterByPosition[sp.position] ?? 0) + 1;
                }
            }
        }

        const verdicts = assessTeamNeeds({
            playersByPos:   playersByPosFor(r),
            slots:          needSlots,
            leagueAvgByPos: needLeagueAvg,
            depthOnly:      needDepthOnly,
            urgencyCaps:    needUrgencyCaps,
        });
        const needsProfile = buildNeedsProfile(verdicts, needSlots.starters);

        return {
            teamId,
            ownerName,
            isUser,
            rosterByPosition,
            needsProfile,
            personality: buildPersonality(teamId, isUser),
        };
    });

    // ── Assemble response ──────────────────────────────────────────────────────
    const context: MockLeagueContext = {
        leagueId,
        leagueName: league.leagueName ?? 'My League',
        yourTeamId,
        teams,
        draftOrder,
        settings,
    };

    const board: MockDraftBoard = { players: boardPlayers };

    const response: MockDraftInitResponse = { context, board };
    return Response.json(response);
}
