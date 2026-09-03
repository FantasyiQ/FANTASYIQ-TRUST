// ESPN equivalent of contextLoader.ts's loadDraftContext(), for the live
// draft board (Available Players + Draft Board grid). Returns a shape
// parallel to Sleeper's DraftContext so the UI layer doesn't need
// platform-specific branches beyond picking which loader ran.
//
// Uses a simplified fiqScore (dynasty market value only — no perfFactor/
// injury layering like Sleeper's) since replicating that full pipeline for a
// second platform's data source is a larger, separate effort. See
// lib/espn.ts's draft-picks section for the "unverified ESPN response
// shape" caveat this loader inherits.

import { prisma } from '@/lib/prisma';
import {
    getEspnDraftDetail,
    getEspnPlayerPool,
    getEspnTeams,
    getEspnLeagueSettings,
    normalizeEspnDraftPicks,
    normalizeEspnPlayerPool,
    normalizeEspnPlayerEntry,
} from '@/lib/espn';
import { getTier } from './context';
import { buildSleeperNameResolver } from '@/lib/sleeperNameResolver';

export interface EspnDraftBoardPickResolved {
    pickOverall: number;
    round:       number;
    teamId:      string;
    espnPlayerId: string;
    name:        string | null;
    position:    string | null;
}

export interface EspnAvailablePlayerScored {
    espnPlayerId: string;
    name:         string;
    position:     string;
    team:         string | null;
    fiqScore:     number;
    tier:         number;
    injuryStatus: string | null;
}

export interface EspnDraftContext {
    picksSoFar:       EspnDraftBoardPickResolved[];
    availablePlayers: EspnAvailablePlayerScored[];
    draftMeta: {
        totalTeams:         number;
        totalRounds:        number;
        currentRound:       number;
        currentPickOverall: number;
        onTheClockTeamId:   string | null;
    };
    rosterOptions: { rosterId: string; displayName: string }[];
    dataSource:    'live' | 'unavailable';
    error:         string | null;
}

function emptyContext(error: string | null = null): EspnDraftContext {
    return {
        picksSoFar:       [],
        availablePlayers: [],
        draftMeta: { totalTeams: 0, totalRounds: 0, currentRound: 0, currentPickOverall: 0, onTheClockTeamId: null },
        rosterOptions:    [],
        dataSource:       'unavailable',
        error,
    };
}

export async function loadEspnDraftContext({
    espnLeagueId,
    season,
    espnS2,
    swid,
    superflex = false,
}: {
    espnLeagueId: string;
    season:       number;
    espnS2:       string;
    swid:         string;
    superflex?:   boolean;
}): Promise<EspnDraftContext> {
    let draftDetail, playerPool, teamsResp, settings;
    try {
        [draftDetail, playerPool, teamsResp, settings] = await Promise.all([
            getEspnDraftDetail(espnLeagueId, season, espnS2, swid),
            getEspnPlayerPool(espnLeagueId, season, espnS2, swid),
            getEspnTeams(espnLeagueId, season, espnS2, swid),
            getEspnLeagueSettings(espnLeagueId, season, espnS2, swid),
        ]);
    } catch (err) {
        return emptyContext(err instanceof Error ? err.message : 'Failed to load ESPN draft data');
    }

    try {
        const rosterOptions = (teamsResp.teams ?? []).map(t => ({
            rosterId:    String(t.id),
            displayName: `${t.location ?? ''} ${t.nickname ?? ''}`.trim() || t.abbrev || `Team ${t.id}`,
        }));
        const totalTeams = rosterOptions.length;

        const normalizedPicks = normalizeEspnDraftPicks(draftDetail.picks);
        const draftedIds      = new Set(normalizedPicks.map(p => p.espnPlayerId));
        const playerById      = new Map(playerPool.map(p => [String(p.id), p]));

        const picksSoFar: EspnDraftBoardPickResolved[] = normalizedPicks.map(p => {
            const raw = playerById.get(p.espnPlayerId);
            const resolved = raw ? normalizeEspnPlayerEntry(raw) : null;
            return {
                ...p,
                name:     resolved?.name ?? null,
                position: resolved?.position ?? null,
            };
        });

        // Dynasty market value only — see file header re: not replicating
        // Sleeper's full perfFactor/injury-adjusted pipeline here.
        const available = normalizeEspnPlayerPool(playerPool, draftedIds);
        // Broad fetch by position, not an exact-string match against ESPN's
        // own player names — FantasyCalc spells some players with a
        // generational suffix ("Kenneth Walker III") that ESPN's fullName
        // may omit (or vice versa), so a `playerName: { in: espnNames } }`
        // filter silently drops those players' FantasyCalc row before
        // matching even starts. Unlike the roster data synced into
        // League.standings, getEspnPlayerPool's live kona_player_info pull
        // carries no sleeperPlayerId, so there's no ID bridge available
        // here — fall back to the same suffix-safe name+position resolver
        // used elsewhere (see buildSleeperNameResolver's header).
        const availablePositions = [...new Set(available.map(p => p.position))];
        const fcValues = availablePositions.length > 0
            ? await prisma.fantasyCalcValue.findMany({
                where:  { position: { in: availablePositions } },
                select: { playerName: true, position: true, dynastyValue: true, dynastyValueSf: true },
            })
            : [];
        const resolveFc = buildSleeperNameResolver(fcValues.map(v => ({ ...v, fullName: v.playerName })));

        const availablePlayers: EspnAvailablePlayerScored[] = available.map(p => {
            const fc = resolveFc(p.name, p.position);
            const dynastyValue = fc ? (superflex ? fc.dynastyValueSf : fc.dynastyValue) : null;
            const fiqScore = dynastyValue != null ? Math.min(100, Math.round(dynastyValue / 90)) : 40;
            return { ...p, fiqScore, tier: getTier(fiqScore) };
        }).sort((a, b) => b.fiqScore - a.fiqScore);

        const currentPickOverall = normalizedPicks.length + 1;
        // Total rounds = total roster spots per team (a snake draft fills
        // every roster slot exactly once) — sourced from real league settings,
        // not guessed from pick progress.
        const totalRounds = Object.values(settings.settings?.rosterSettings?.lineupSlotCounts ?? {})
            .reduce((sum, count) => sum + (count > 0 ? count : 0), 0);
        const currentRound = totalTeams > 0 ? Math.ceil(currentPickOverall / totalTeams) : 0;

        // Best-effort on-the-clock: snake order over team list as returned by
        // ESPN (ascending team ID) — not confirmed to match ESPN's actual
        // assigned draft order, which may differ. Flagged as an approximation.
        let onTheClockTeamId: string | null = null;
        if (draftDetail.inProgress && totalTeams > 0) {
            const pickInRound = (currentPickOverall - 1) % totalTeams;
            const idx = (currentRound % 2 === 0) ? totalTeams - 1 - pickInRound : pickInRound;
            onTheClockTeamId = rosterOptions[idx]?.rosterId ?? null;
        }

        return {
            picksSoFar,
            availablePlayers,
            draftMeta: { totalTeams, totalRounds, currentRound, currentPickOverall, onTheClockTeamId },
            rosterOptions,
            dataSource: 'live',
            error: null,
        };
    } catch (err) {
        return emptyContext(err instanceof Error ? err.message : 'Failed to process ESPN draft data');
    }
}
