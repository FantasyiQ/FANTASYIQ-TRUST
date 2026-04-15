'use client';

import { useMemo } from 'react';
import TradeEvaluator from '@/app/dashboard/trade/TradeEvaluator';
import { PLAYERS, getDraftPicks, DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { PprFormat, LeagueType, LeagueSettings, Player } from '@/lib/trade-engine';
import type { TradeTeam } from '@/app/dashboard/trade/TradeEvaluator';

const LEAGUE_SIZES = [8, 10, 12, 14, 16, 32] as const;
type LeagueSize = typeof LEAGUE_SIZES[number];

function nearestLeagueSize(n: number): LeagueSize {
    return LEAGUE_SIZES.reduce((prev, curr) =>
        Math.abs(curr - n) < Math.abs(prev - n) ? curr : prev
    );
}

function scoringTypeToPpr(scoringType: string | null): PprFormat {
    if (scoringType === 'ppr') return 1;
    if (scoringType === 'half_ppr') return 0.5;
    return 0;
}

function scoringLabel(scoringType: string | null): string {
    if (scoringType === 'ppr') return 'PPR';
    if (scoringType === 'half_ppr') return '½ PPR';
    return 'Standard';
}

// Build LeagueSettings from Sleeper roster_positions and scoring_settings.
// Counts actual starter slots to derive dynamic position scarcity.
function buildLeagueSettings(
    rosterPositions: string[],
    scoringSettings: {
        pass_td?:      number;
        bonus_rec_te?: number;
    },
): LeagueSettings {
    let qbSlots = 0, rbSlots = 0, wrSlots = 0, teSlots = 0, flexSlots = 0, sfSlots = 0;

    for (const pos of rosterPositions) {
        switch (pos) {
            case 'QB':         qbSlots++;   break;
            case 'RB':         rbSlots++;   break;
            case 'WR':         wrSlots++;   break;
            case 'TE':         teSlots++;   break;
            case 'FLEX':       flexSlots++; break;
            case 'SUPER_FLEX': sfSlots++;   break;
            case 'REC_FLEX':   flexSlots++; break; // WR/TE/RB flex variant
            // BN, IR, K, DEF — don't affect skill position scarcity
        }
    }

    return {
        passTd:     scoringSettings.pass_td     ?? DEFAULT_LEAGUE_SETTINGS.passTd,
        bonusRecTe: scoringSettings.bonus_rec_te ?? DEFAULT_LEAGUE_SETTINGS.bonusRecTe,
        qbSlots:    qbSlots  || DEFAULT_LEAGUE_SETTINGS.qbSlots,
        rbSlots:    rbSlots  || DEFAULT_LEAGUE_SETTINGS.rbSlots,
        wrSlots:    wrSlots  || DEFAULT_LEAGUE_SETTINGS.wrSlots,
        teSlots:    teSlots  || DEFAULT_LEAGUE_SETTINGS.teSlots,
        flexSlots,
        sfSlots,
    };
}

interface RawOwnedPick {
    season: string;
    round:  number;
    slot:   number;
}

export interface RawTeamData {
    rosterId:   number;
    teamName:   string;
    players:    { name: string; position: string; team: string }[];
    ownedPicks: RawOwnedPick[];
}

interface ScoringSettings {
    pass_td?:      number;
    bonus_rec_te?: number;
}

interface Props {
    leagueName:       string;
    scoringType:      string | null;
    totalRosters:     number;
    draftRounds?:     number;
    leagueType:       LeagueType;
    rosterPositions?: string[];
    scoringSettings?: ScoringSettings;
    myTeamData?:      RawTeamData;
    otherTeamsData?:  RawTeamData[];
}

export default function LeagueTradeEvaluator({
    leagueName, scoringType, totalRosters, draftRounds = 5, leagueType,
    rosterPositions = [], scoringSettings = {}, myTeamData, otherTeamsData = [],
}: Props) {
    const ppr           = scoringTypeToPpr(scoringType);
    const leagueSize    = nearestLeagueSize(totalRosters);
    const leagueSettings = useMemo(
        () => buildLeagueSettings(rosterPositions, scoringSettings),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [JSON.stringify(rosterPositions), JSON.stringify(scoringSettings)],
    );
    const superflex = leagueSettings.sfSlots > 0;

    const sfLabel   = superflex ? ' · Superflex' : '';
    const passTdLabel = leagueSettings.passTd === 6 ? ' · 6pt TD' : '';
    const tePremLabel = leagueSettings.bonusRecTe > 0 ? ' · TE+' : '';
    const label     = `${leagueName} — ${scoringLabel(scoringType)} · ${totalRosters} Teams · ${leagueType}${sfLabel}${passTdLabel}${tePremLabel}`;

    const allPicks     = useMemo(() => getDraftPicks(leagueSize, draftRounds), [leagueSize, draftRounds]);
    const pickByName   = useMemo(() => new Map(allPicks.map(p => [p.name, p])), [allPicks]);
    const playerByName = useMemo(() => new Map(PLAYERS.map(p => [p.name.toLowerCase(), p])), []);

    // Depth base values for players not in the curated top-300 list
    const DEPTH_BASE: Record<string, number> = {
        QB: 22, RB: 18, WR: 18, TE: 14, K: 8, DEF: 8,
    };

    let depthRank = 400;

    function convertRaw(raw: RawTeamData): TradeTeam {
        const players: Player[] = raw.players
            .map(p => {
                const curated = playerByName.get(p.name.toLowerCase());
                if (curated) {
                    return {
                        ...curated,
                        team:     p.team     || curated.team,
                        position: p.position || curated.position,
                    };
                }
                // Include depth/unranked players with a basic profile
                if (!p.name || !p.position) return undefined;
                return {
                    rank:      depthRank++,
                    name:      p.name,
                    position:  p.position,
                    team:      p.team ?? '',
                    age:       26,
                    baseValue: DEPTH_BASE[p.position] ?? 10,
                } satisfies Player;
            })
            .filter((p): p is Player => p !== undefined);

        const picks: Player[] = raw.ownedPicks
            .map(op => pickByName.get(`${op.season} ${op.round}.${op.slot.toString().padStart(2, '0')}`))
            .filter((p): p is Player => p !== undefined);

        return { rosterId: raw.rosterId, teamName: raw.teamName, players, picks };
    }

    const myTeam = useMemo<TradeTeam | undefined>(
        () => (myTeamData ? convertRaw(myTeamData) : undefined),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [myTeamData, playerByName, pickByName]
    );

    const otherTeams = useMemo<TradeTeam[]>(
        () => otherTeamsData.map(convertRaw),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [otherTeamsData, playerByName, pickByName]
    );

    return (
        <TradeEvaluator
            initialPpr={ppr}
            initialLeagueSize={leagueSize}
            initialLeagueType={leagueType}
            initialLeagueSettings={leagueSettings}
            leagueLabel={label}
            myTeam={myTeam}
            otherTeams={otherTeams}
        />
    );
}
