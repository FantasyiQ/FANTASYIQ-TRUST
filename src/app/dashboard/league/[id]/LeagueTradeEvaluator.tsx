'use client';

import { useMemo } from 'react';
import TradeEvaluator from '@/app/dashboard/trade/TradeEvaluator';
import { PLAYERS, getDraftPicks } from '@/lib/trade-engine';
import type { PprFormat, LeagueType, Player } from '@/lib/trade-engine';
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

interface Props {
    leagueName:      string;
    scoringType:     string | null;
    totalRosters:    number;
    leagueType:      LeagueType;
    myTeamData?:     RawTeamData;
    otherTeamsData?: RawTeamData[];
}

export default function LeagueTradeEvaluator({
    leagueName, scoringType, totalRosters, leagueType, myTeamData, otherTeamsData = [],
}: Props) {
    const ppr        = scoringTypeToPpr(scoringType);
    const leagueSize = nearestLeagueSize(totalRosters);
    const label      = `${leagueName} — ${scoringLabel(scoringType)} · ${totalRosters} Teams · ${leagueType}`;

    const allPicks     = useMemo(() => getDraftPicks(leagueSize), [leagueSize]);
    const pickByName   = useMemo(() => new Map(allPicks.map(p => [p.name, p])), [allPicks]);
    const playerByName = useMemo(() => new Map(PLAYERS.map(p => [p.name.toLowerCase(), p])), []);

    function convertRaw(raw: RawTeamData): TradeTeam {
        const players: Player[] = raw.players
            .map(p => {
                const curated = playerByName.get(p.name.toLowerCase());
                if (!curated) return undefined;
                // Override team and position from live Sleeper data so scheme
                // fit and badges reflect current roster assignments
                return {
                    ...curated,
                    team:     p.team     || curated.team,
                    position: p.position || curated.position,
                };
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
            leagueLabel={label}
            myTeam={myTeam}
            otherTeams={otherTeams}
        />
    );
}
