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
} from '@/lib/sleeper';
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
import { computeNeedsProfile, computeRookieDraftNeeds } from '@/lib/mock-draft/NeedsEngine';
import { countStartersPerTeam }   from '@/lib/draft/draftStrategyUtils';

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

function buildSnakeDraftOrder(
    slotToTeamId: string[],   // index = slot-1
    totalRounds:  number,
): MockDraftPick[] {
    const N     = slotToTeamId.length;
    const picks: MockDraftPick[] = [];

    for (let round = 1; round <= totalRounds; round++) {
        const isEven = round % 2 === 0;
        for (let i = 0; i < N; i++) {
            const slot   = isEven ? N - i : i + 1;
            const teamId = slotToTeamId[slot - 1];
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
    const leagueId = searchParams.get('leagueId');
    if (!leagueId) return Response.json({ error: 'Missing leagueId' }, { status: 400 });

    const league = await prisma.league.findUnique({
        where:  { id: leagueId },
        select: {
            id: true, userId: true, leagueId: true, leagueName: true,
            leagueType: true, rosterPositions: true, scoringType: true,
            totalRosters: true, sleeperUserId: true, season: true,
            assignedPlanId: true, assignedPlanType: true,
        },
    });

    if (!league || league.userId !== session.user.id) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const deny = await requireLeaguePaidAccess(session.user.id, league.assignedPlanId, league.assignedPlanType);
    if (deny) return deny;

    // ── League settings ────────────────────────────────────────────────────────
    const rosterPositions = (league.rosterPositions ?? []) as string[];
    const isDynasty       = league.leagueType === 'Dynasty';
    const superflex       = rosterPositions.includes('SUPER_FLEX');
    const tePremium       = rosterPositions.includes('TE_FLEX');
    const rawSlots        = countStartersPerTeam(rosterPositions);
    const starterSlots    = {
        QB:   rawSlots.QB   ?? 1,
        RB:   rawSlots.RB   ?? 2,
        WR:   rawSlots.WR   ?? 2,
        TE:   rawSlots.TE   ?? 1,
        FLEX: (rawSlots['FLEX'] ?? 0) + (rawSlots['SUPER_FLEX'] ?? 0),
    };

    // ── Parallel Sleeper fetches ───────────────────────────────────────────────
    const [rosters, members, drafts, dbUser] = await Promise.all([
        getLeagueRosters(league.leagueId).catch(() => []),
        getLeagueUsers(league.leagueId).catch(() => []),
        getLeagueDrafts(league.leagueId).catch(() => []),
        prisma.user.findUnique({ where: { id: session.user.id }, select: { sleeperUserId: true } }),
    ]);

    // ── Identify user's roster ────────────────────────────────────────────────
    const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId ?? null;
    const userRoster      = rosters.find(r => r.owner_id === mySleeperUserId) ?? rosters[0];
    const yourTeamId      = String(userRoster?.roster_id ?? 1);

    // ── Determine draft type & parameters ─────────────────────────────────────
    const hasExistingRosters = rosters.some(r => (r.players ?? []).length > 5);
    const isRookieDraft      = isDynasty && hasExistingRosters;

    const upcomingDraft = drafts.find(d => d.status === 'pre_draft' || d.status === 'drafting')
        ?? drafts.at(-1)
        ?? null;

    const totalTeams  = rosters.length || (league.totalRosters ?? 12);
    const defaultRounds = isRookieDraft ? 5 : isDynasty ? 20 : 15;
    const totalRounds   = upcomingDraft?.settings?.rounds ?? defaultRounds;
    const isSnake       = (upcomingDraft?.type ?? 'snake') !== 'linear';

    const settings: MockDraftSettings = {
        totalTeams,
        totalRounds,
        isSnake,
        superflex,
        tePremium,
        isDynasty,
        isRookieDraft,
        starterSlots,
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

    const draftOrder = buildSnakeDraftOrder(slotToTeamId, totalRounds);

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
            QB: 1.00,
            RB: 1.03,                      // dynasty RB scarcity premium
            WR: 1.00,                      // baseline
            TE: 0.95,
        };

        const season = league.season ?? '2026';
        const rookies = await prisma.rookieRankingsPlayer.findMany({
            where:   { season, position: { in: ['QB', 'RB', 'WR', 'TE'] } },
            orderBy: { fiqScore: 'desc' },
            select:  { playerName: true, position: true, fiqScore: true, fiqTier: true },
        });

        const sleeperPlayers = rookies.length > 0
            ? await prisma.sleeperPlayer.findMany({
                where:  { fullName: { in: rookies.map(r => r.playerName) } },
                select: { playerId: true, fullName: true, team: true, age: true, injuryStatus: true },
              })
            : [];
        const spByName = new Map(sleeperPlayers.map(p => [p.fullName.toLowerCase(), p]));

        boardPlayers = rookies
            .map((r, i) => {
                const sp        = spByName.get(r.playerName.toLowerCase());
                const mult      = DYNASTY_POS_MULT[r.position] ?? 1.0;
                const baseScore = Math.min(100, Math.max(1, Math.round(r.fiqScore * mult)));
                const tierMatch = r.fiqTier?.match(/(\d+)/);
                const tier      = tierMatch ? parseInt(tierMatch[1], 10)
                    : Math.min(5, Math.max(1, Math.ceil((i + 1) / Math.max(rookies.length / 5, 1))));
                return {
                    playerId:     sp?.playerId ?? `rookie-${i}`,
                    name:         r.playerName,
                    position:     r.position as MockPlayer['position'],
                    team:         sp?.team ?? null,
                    age:          sp?.age ?? null,
                    tier:         Math.min(5, Math.max(1, tier)),
                    baseScore,
                    isRookie:     true,
                    injuryStatus: sp?.injuryStatus ?? null,
                    imageUrl:     sp ? `https://sleepercdn.com/content/nfl/players/${sp.playerId}.jpg` : null,
                };
            })
            // Re-sort by adjusted baseScore so the board reflects dynasty-adjusted BPA
            .sort((a, b) => b.baseScore - a.baseScore);
    } else {
        // Startup dynasty or redraft: FantasyCalc values
        const needed = totalTeams * totalRounds + 60;

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
            },
        });

        const sleeperPlayers = fcValues.length > 0
            ? await prisma.sleeperPlayer.findMany({
                where:  { fullName: { in: fcValues.map(v => v.playerName) }, active: true },
                select: { playerId: true, fullName: true, team: true, age: true, injuryStatus: true },
              })
            : [];
        const spByName = new Map(sleeperPlayers.map(p => [p.fullName.toLowerCase(), p]));

        const VALUE_CAP = isDynasty ? 9999 : 5000;

        boardPlayers = fcValues.map((v, i) => {
            const sp     = spByName.get(v.playerName.toLowerCase());
            const rawVal = isDynasty
                ? (superflex ? v.dynastyValueSf : v.dynastyValue)
                : (superflex ? v.redraftValueSf : v.redraftValue);
            const baseScore = Math.min(100, Math.max(1, Math.round((rawVal / VALUE_CAP) * 100)));
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
        });
    }

    // ── Build existing roster position + name lookup ──────────────────────────
    const existingPlayerIds = [...new Set(rosters.flatMap(r => r.players ?? []).filter(Boolean))];
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
    const QUALITY_THRESHOLD = 1500;  // meaningful dynasty piece (~tier 4+)

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

    // ── Build teams ────────────────────────────────────────────────────────────
    const teams: MockTeam[] = rosters.map(r => {
        const teamId    = String(r.roster_id);
        const member    = memberMap.get(r.owner_id ?? '');
        const ownerName = member?.metadata?.team_name || member?.display_name || `Team ${r.roster_id}`;
        const isUser    = teamId === yourTeamId;

        const rosterByPosition: Record<string, number> = {};
        for (const pid of (r.players ?? [])) {
            const sp = existingPlayerById.get(pid);
            if (sp?.position && ['QB', 'RB', 'WR', 'TE'].includes(sp.position)) {
                rosterByPosition[sp.position] = (rosterByPosition[sp.position] ?? 0) + 1;
            }
        }

        let needsProfile;
        if (isRookieDraft) {
            // Count quality assets (meaningful dynasty value) per position
            const qualityCount: Record<string, number> = {};
            for (const pid of (r.players ?? [])) {
                const sp = existingPlayerById.get(pid);
                if (!sp?.position || !['QB', 'RB', 'WR', 'TE'].includes(sp.position)) continue;
                const val = sp.fullName ? (fcValueByName.get(sp.fullName.toLowerCase()) ?? 0) : 0;
                if (val > QUALITY_THRESHOLD) {
                    qualityCount[sp.position] = (qualityCount[sp.position] ?? 0) + 1;
                }
            }
            needsProfile = computeRookieDraftNeeds(qualityCount);
        } else {
            needsProfile = computeNeedsProfile(rosterByPosition, settings);
        }

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
