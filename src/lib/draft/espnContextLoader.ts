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
    translateEspnScoring,
    deriveEspnRosterPositions,
} from '@/lib/espn';
import { getTier } from './context';
import { buildSleeperNameResolver } from '@/lib/sleeperNameResolver';
import { getPlayers, getNflState } from '@/lib/sleeper';
import { calculateAge, isPlausiblyActivePlayer } from '@/lib/calculateAge';
import { buildLeagueConfig } from '@/lib/rankings/leagueConfigBuilder';
import { buildLeagueDefensiveAndKickerRankings } from '@/lib/rankings/defensiveEngine';
import { buildIdpSeedProjections, buildKickerSeedProjections, buildDefenseSeedProjections, toIdpPosition } from '@/lib/rankings/seedProjections';
import { buildProjectionsFromSleeperStats } from '@/lib/rankings/sleeperStatsAdapter';

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

        // K/DEF/IDP: FantasyCalc doesn't price any of these positions at all
        // (zero rows), so every kicker/defense/IDP player above falls
        // through to the flat fiqScore=40 default — every one of them
        // scored identically regardless of real talent. Same real
        // defensive/kicker engine already used for Sleeper leagues (Rankings,
        // Trade Evaluator, Live Draft Assistant), reused as-is here — scored
        // with translateEspnScoring/deriveEspnRosterPositions, the same
        // already-shipped ESPN→Sleeper-format translation every ESPN sync
        // path uses (buildCoreEspnLeagueFields), not a new unverified
        // assumption about ESPN's data shape.
        const defScoreEntries: { fullName: string; position: string; valueScore: number }[] = [];
        const kdefPositions = new Set(['K', 'DEF', 'DL', 'LB', 'DB']);
        if (available.some(p => kdefPositions.has(p.position))) {
            try {
                const rawDefScoring   = translateEspnScoring(settings.settings);
                const espnRosterPositions = deriveEspnRosterPositions(settings.settings);

                const allPlayersRaw = await getPlayers();
                const enginePlayers: typeof allPlayersRaw = {};
                for (const [pid, player] of Object.entries(allPlayersRaw)) {
                    const age = calculateAge(player.birthDate) ?? null;
                    if (!isPlausiblyActivePlayer({ team: player.team, age, depthChartOrder: player.depthChartOrder, yearsExp: player.yearsExp })) continue;
                    enginePlayers[pid] = player;
                }

                const { scoring: defScoring, lineup: defLineup } = buildLeagueConfig(
                    rawDefScoring,
                    espnRosterPositions,
                    totalTeams,
                );

                const idpPlayersForSeed: { playerId: string; position: 'DL' | 'LB' | 'DB' }[] = [];
                const kickerIdsForSeed:  string[] = [];
                for (const [pid, player] of Object.entries(enginePlayers)) {
                    const idpPos = toIdpPosition(player.position);
                    if (idpPos) idpPlayersForSeed.push({ playerId: pid, position: idpPos });
                    else if (player.position === 'K') kickerIdsForSeed.push(pid);
                }

                const nflState    = await getNflState();
                const statsSeason = nflState.season;
                const liveProjections = await buildProjectionsFromSleeperStats(statsSeason, enginePlayers, rawDefScoring)
                    ?? await buildProjectionsFromSleeperStats(String(Number(statsSeason) - 1), enginePlayers, rawDefScoring);

                const idpProjections     = liveProjections?.idpProjections     ?? buildIdpSeedProjections(idpPlayersForSeed);
                const kickerProjections  = liveProjections?.kickerProjections  ?? buildKickerSeedProjections(kickerIdsForSeed);
                const defenseProjections = liveProjections?.defenseProjections ?? buildDefenseSeedProjections();

                const defRankings = buildLeagueDefensiveAndKickerRankings(
                    defScoring, defLineup, idpProjections, kickerProjections, defenseProjections,
                    'Dynasty', // ESPN loader doesn't distinguish dynasty/redraft (see file header) — Dynasty applies a small age multiplier, immaterial to K/DEF
                    liveProjections?.offensiveTop5Avg ?? {},
                );

                for (const entity of [...defRankings.kickers, ...defRankings.defenses, ...defRankings.idp]) {
                    const sp = enginePlayers[entity.id];
                    if (!sp) continue;
                    defScoreEntries.push({ fullName: sp.full_name, position: entity.position, valueScore: entity.valueScore });
                }
            } catch {
                // Non-critical add-on — K/DEF/IDP just keep the flat default
                // below if this fails for any reason.
            }
        }
        const resolveDefScore = buildSleeperNameResolver(defScoreEntries);

        const availablePlayers: EspnAvailablePlayerScored[] = available.map(p => {
            const fc = resolveFc(p.name, p.position);
            const dynastyValue = fc ? (superflex ? fc.dynastyValueSf : fc.dynastyValue) : null;
            const defScore = dynastyValue == null && kdefPositions.has(p.position)
                ? resolveDefScore(p.name, p.position)?.valueScore
                : undefined;
            const fiqScore = dynastyValue != null ? Math.min(100, Math.round(dynastyValue / 90))
                : defScore != null ? Math.max(1, Math.round(defScore))
                : 40;
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
