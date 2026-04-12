'use client';

import TradeEvaluator from '@/app/dashboard/trade/TradeEvaluator';
import type { PprFormat, LeagueType } from '@/lib/trade-engine';

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

interface Props {
    leagueName:  string;
    scoringType: string | null;
    totalRosters: number;
    leagueType:  LeagueType;
}

export default function LeagueTradeEvaluator({ leagueName, scoringType, totalRosters, leagueType }: Props) {
    const ppr = scoringTypeToPpr(scoringType);
    const leagueSize = nearestLeagueSize(totalRosters);
    const label = `${leagueName} — ${scoringLabel(scoringType)} · ${totalRosters} Teams · ${leagueType}`;

    return (
        <TradeEvaluator
            initialPpr={ppr}
            initialLeagueSize={leagueSize}
            initialLeagueType={leagueType}
            leagueLabel={label}
        />
    );
}
