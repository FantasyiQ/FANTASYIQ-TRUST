'use client';

import { useMemo } from 'react';
import TradeEvaluator from '@/app/dashboard/trade/TradeEvaluator';
import { PLAYERS } from '@/lib/trade-engine';
import type { PprFormat, LeagueType, Player } from '@/lib/trade-engine';

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

interface RosterPlayer {
    name: string;
    position: string;
    team: string;
}

interface Props {
    leagueName:       string;
    scoringType:      string | null;
    totalRosters:     number;
    leagueType:       LeagueType;
    myRosterPlayers?: RosterPlayer[];
}

export default function LeagueTradeEvaluator({
    leagueName, scoringType, totalRosters, leagueType, myRosterPlayers = [],
}: Props) {
    const ppr        = scoringTypeToPpr(scoringType);
    const leagueSize = nearestLeagueSize(totalRosters);
    const label      = `${leagueName} — ${scoringLabel(scoringType)} · ${totalRosters} Teams · ${leagueType}`;

    // Match roster players to trade-engine PLAYERS by name (case-insensitive)
    const myRoster = useMemo<Player[]>(() => {
        const byName = new Map(PLAYERS.map(p => [p.name.toLowerCase(), p]));
        return myRosterPlayers
            .map(p => byName.get(p.name.toLowerCase()))
            .filter((p): p is Player => p !== undefined);
    }, [myRosterPlayers]);

    return (
        <TradeEvaluator
            initialPpr={ppr}
            initialLeagueSize={leagueSize}
            initialLeagueType={leagueType}
            leagueLabel={label}
            myRoster={myRoster}
        />
    );
}
