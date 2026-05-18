// FantasyiQ Trust — Live Draft Assistant v1 — Context Loader
// Builds a DraftContext from Sleeper API + DB for use by the scoring engine.

import { prisma } from '@/lib/prisma';
import {
    getLeagueRosters,
    getSleeperDraft,
    getActiveDraftPicks,
    resolveDraftType,
    type SleeperRoster,
    type SleeperDraft,
    type SleeperDraftPickEntry,
} from '@/lib/sleeper';
import type { DraftContext, DraftType } from './context';

// ── On-the-clock resolution ────────────────────────────────────────────────────

function deriveOnTheClockRosterId(
    draft:   SleeperDraft,
    picks:   SleeperDraftPickEntry[],
    rosters: SleeperRoster[],
): string | null {
    if (!draft.draft_order) return null;

    const totalTeams = draft.settings.teams;
    const nextPickNo = picks.length + 1;
    const round      = Math.ceil(nextPickNo / totalTeams);
    const posInRound = ((nextPickNo - 1) % totalTeams) + 1;

    // Snake drafts reverse order on even rounds; linear keeps same order
    const slot = (draft.type === 'snake' && round % 2 === 0)
        ? totalTeams - posInRound + 1
        : posInRound;

    // draft_order: user_id → 1-based slot number
    const targetUserId = Object.entries(draft.draft_order).find(([, s]) => s === slot)?.[0];
    if (!targetUserId) return null;

    const roster = rosters.find(r => r.owner_id === targetUserId);
    return roster ? String(roster.roster_id) : null;
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function loadDraftContext(params: {
    leagueDbId:      string;
    sleeperLeagueId: string;
    sleeperDraftId:  string;
    myRosterId:      string;
}): Promise<DraftContext> {
    const { leagueDbId, sleeperLeagueId, sleeperDraftId, myRosterId } = params;
    const myRosterIdNum = parseInt(myRosterId, 10);

    const [draft, picks, rosters, dbLeague] = await Promise.all([
        getSleeperDraft(sleeperDraftId),
        getActiveDraftPicks(sleeperDraftId),
        getLeagueRosters(sleeperLeagueId),
        prisma.league.findUniqueOrThrow({
            where:  { id: leagueDbId },
            select: { scoringType: true, rosterPositions: true, leagueType: true },
        }),
    ]);

    const rosterPositions = dbLeague.rosterPositions as string[];
    const superflex  = rosterPositions.includes('SUPER_FLEX');
    const tePremium  = rosterPositions.includes('TE_FLEX');
    const ppr        = dbLeague.scoringType === 'ppr';
    const bestBall   = (draft.metadata?.scoring_type ?? '').includes('best_ball');

    // If the league already has rosters it's an established dynasty — the only
    // draft that runs each year is the rookie draft.  Use this as the primary
    // signal rather than Sleeper metadata, which is unreliable across league types.
    const leagueHasRosters = rosters.some(r => (r.players ?? []).length > 0);
    const draftType: DraftType = leagueHasRosters
        ? 'rookie'
        : (resolveDraftType(draft) === 'rookie' ? 'rookie' : 'startup');

    const rosterSlots = rosterPositions.reduce<Record<string, number>>((acc, slot) => {
        acc[slot] = (acc[slot] ?? 0) + 1;
        return acc;
    }, {});

    const totalTeams         = draft.settings.teams;
    const totalRounds        = draft.settings.rounds;
    const currentPickOverall = picks.length + 1;
    const currentRound       = Math.ceil(currentPickOverall / totalTeams);

    const onTheClockRosterId = deriveOnTheClockRosterId(draft, picks, rosters);

    const picksSoFar = picks.map(p => ({
        pickOverall:     p.pick_no,
        round:           p.round,
        rosterId:        String(p.roster_id),
        sleeperPlayerId: p.player_id,
    }));

    const draftedIds = new Set(picks.map(p => p.player_id));

    // ── My roster from picks so far ───────────────────────────────────────────
    const myPickIds = picks
        .filter(p => p.roster_id === myRosterIdNum)
        .map(p => p.player_id);

    const myPickPlayers = myPickIds.length > 0
        ? await prisma.sleeperPlayer.findMany({
            where:  { playerId: { in: myPickIds } },
            select: { playerId: true, position: true },
        })
        : [];

    const myRosterData = myPickPlayers.map(p => ({
        sleeperPlayerId: p.playerId,
        position:        p.position,
    }));

    // ── Available player pool ─────────────────────────────────────────────────
    const availablePlayers: DraftContext['availablePlayers'] = [];

    if (draftType === 'rookie') {
        // Source: 2026 FiQ Rookie Rankings
        const rookies = await prisma.rookieRankingsPlayer.findMany({
            where:   { season: '2026' },
            orderBy: { fiqScore: 'desc' },
            select:  { playerName: true, position: true, fiqScore: true },
        });

        const sleeperPlayers = await prisma.sleeperPlayer.findMany({
            where:  { fullName: { in: rookies.map(r => r.playerName) } },
            select: { fullName: true, playerId: true, team: true, searchRank: true, age: true },
        });

        const spByName = new Map(sleeperPlayers.map(p => [p.fullName, p]));

        for (const r of rookies) {
            const sp = spByName.get(r.playerName);
            if (sp && draftedIds.has(sp.playerId)) continue;
            availablePlayers.push({
                sleeperPlayerId: sp?.playerId ?? '',
                name:     r.playerName,
                position: r.position,
                team:     sp?.team ?? null,
                age:      sp?.age ?? null,
                fiqScore: Math.round(r.fiqScore),
                adp:      sp?.searchRank ?? null,
            });
        }
    } else {
        // Source: FantasyCalcValue (KTC dynasty values) for startup drafts
        const fcValues = superflex
            ? await prisma.fantasyCalcValue.findMany({
                where:   { dynastyValueSf: { gt: 300 } },
                orderBy: { dynastyValueSf: 'desc' },
                take:    500,
                select:  { playerName: true, position: true, dynastyValue: true, dynastyValueSf: true },
            })
            : await prisma.fantasyCalcValue.findMany({
                where:   { dynastyValue: { gt: 300 } },
                orderBy: { dynastyValue: 'desc' },
                take:    500,
                select:  { playerName: true, position: true, dynastyValue: true, dynastyValueSf: true },
            });

        const sleeperPlayers = await prisma.sleeperPlayer.findMany({
            where:  { fullName: { in: fcValues.map(v => v.playerName) }, active: true },
            select: { fullName: true, playerId: true, team: true, searchRank: true, age: true },
        });

        const spByName = new Map(sleeperPlayers.map(p => [p.fullName, p]));

        for (const fcv of fcValues) {
            const sp = spByName.get(fcv.playerName);
            if (sp && draftedIds.has(sp.playerId)) continue;

            const ktcValue = superflex ? fcv.dynastyValueSf : fcv.dynastyValue;
            // Normalize KTC (0–9999) to 0–100: 9000 → 100, 3000 → 33, 500 → 0
            const fiqScore = Math.min(100, Math.round(ktcValue / 90));

            availablePlayers.push({
                sleeperPlayerId: sp?.playerId ?? '',
                name:     fcv.playerName,
                position: fcv.position,
                team:     sp?.team ?? null,
                age:      sp?.age ?? null,
                fiqScore,
                adp:      sp?.searchRank ?? null,
            });
        }
    }

    return {
        leagueId:        leagueDbId,
        sleeperLeagueId,
        sleeperDraftId,
        draftType,
        scoring:  { ppr, superflex, tePremium, bestBall, rosterSlots },
        draftMeta: {
            totalTeams,
            totalRounds,
            currentRound,
            currentPickOverall,
            picksPerRound: totalTeams,
            onTheClockRosterId,
        },
        picksSoFar,
        myRoster: myRosterData,
        availablePlayers,
    };
}
