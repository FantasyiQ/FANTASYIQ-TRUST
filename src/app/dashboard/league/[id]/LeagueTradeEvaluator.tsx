'use client';

import { useMemo } from 'react';
import TradeEvaluator from '@/app/dashboard/trade/TradeEvaluator';
import { getDraftPicks, DEFAULT_LEAGUE_SETTINGS, roundOrdinal } from '@/lib/trade-engine';
import type { PprFormat, LeagueType, LeagueSettings, Player } from '@/lib/trade-engine';
import type { TradeTeam } from '@/app/dashboard/trade/TradeEvaluator';
import type { DefenseValues } from '@/lib/rankings/unifiedTradeEvaluator';

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
    } | null | undefined,
): LeagueSettings {
    scoringSettings = scoringSettings ?? {};
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
    season:         string;
    round:          number;
    slot?:          number;    // set when draft_order is known for this season
    tier?:          string;    // "Early" | "Mid" | "Late" — when draft_order is not yet set
    tierProjected?: boolean;   // true when all teams are 0-0 (no standings data)
    origTeamName?:  string;    // set when pick was traded — "from Team X"
}

export interface RawTeamData {
    rosterId:   number;
    teamName:   string;
    players:    { id: string; name: string; position: string; team: string }[];
    ownedPicks: RawOwnedPick[];
}

interface ScoringSettings {
    pass_td?:      number;
    bonus_rec_te?: number;
}

interface Props {
    leagueName:           string;
    scoringType:          string | null;
    totalRosters:         number;
    draftRounds?:         number;
    draftOrderProjected?: boolean;
    leagueType:           LeagueType;
    rosterPositions?:     string[];
    scoringSettings?:     ScoringSettings;
    myTeamData?:          RawTeamData;
    otherTeamsData?:      RawTeamData[];
    /**
     * Pre-computed defensive value scores (0–100) keyed by player name,
     * from the defensive ranking engine. Optional — when absent the
     * evaluator shows DTV values only.
     */
    defenseValues?:       DefenseValues;
}

export default function LeagueTradeEvaluator({
    leagueName, scoringType, totalRosters, draftRounds = 5, draftOrderProjected = false,
    leagueType, rosterPositions = [], scoringSettings = {}, myTeamData, otherTeamsData = [],
    defenseValues,
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
    const projectedLabel = draftOrderProjected ? ' · Projected Order' : '';
    const label     = `${leagueName} — ${scoringLabel(scoringType)} · ${totalRosters} Teams · ${leagueType}${sfLabel}${passTdLabel}${tePremLabel}${projectedLabel}`;

    // Derive which seasons are actually referenced by owned picks so the lookup map
    // always covers them — regardless of what the calendar says.
    const ownedPickSeasons = useMemo(() => {
        const s = new Set<string>();
        if (myTeamData) for (const p of myTeamData.ownedPicks) s.add(p.season);
        for (const t of otherTeamsData) for (const p of t.ownedPicks) s.add(p.season);
        return s.size > 0 ? [...s] : undefined;
    }, [myTeamData, otherTeamsData]);

    const allPicks   = useMemo(() => getDraftPicks(leagueSize, draftRounds, ownedPickSeasons), [leagueSize, draftRounds, ownedPickSeasons]);
    const pickByName = useMemo(() => new Map(allPicks.map(p => [p.name, p])), [allPicks]);

    // Depth base values for unranked / non-skill-position players
    const DEPTH_BASE: Record<string, number> = {
        QB: 22, RB: 18, WR: 18, TE: 14, K: 8, DEF: 8,
        // IDP positions — no KTC value; DTV shown as "—" in UI
        DL: 0, LB: 0, DB: 0, DE: 0, DT: 0, NT: 0,
        OLB: 0, ILB: 0, MLB: 0, EDGE: 0,
        CB: 0, S: 0, SS: 0, FS: 0, SAF: 0, NB: 0,
    };

    let depthRank = 400;

    function convertRaw(raw: RawTeamData): TradeTeam {
        const players: Player[] = raw.players
            .filter(p => !!p.name && !!p.position)
            .map(p => ({
                rank:      depthRank++,
                id:        p.id,
                name:      p.name,
                position:  p.position,
                team:      p.team ?? '',
                age:       0,   // will be overlaid by patchPlayer from universe
                baseValue: DEPTH_BASE[p.position] ?? 12,
            } as Player));

        const picks: Player[] = raw.ownedPicks
            .map(op => {
                const key = op.slot !== undefined
                    ? `${op.season} ${op.round}.${op.slot.toString().padStart(2, '0')}`
                    : op.tier
                        ? `${op.season} ${op.tier} ${roundOrdinal(op.round)}`  // "2027 Early 1st"
                        : undefined;
                if (!key) return undefined;
                const base = pickByName.get(key);
                if (!base) return undefined;
                return op.origTeamName
                    ? { ...base, name: `${base.name} (from ${op.origTeamName})` }
                    : base;
            })
            .filter((p): p is Player => p !== undefined);

        return { rosterId: raw.rosterId, teamName: raw.teamName, players, picks };
    }

    const myTeam = useMemo<TradeTeam | undefined>(
        () => (myTeamData ? convertRaw(myTeamData) : undefined),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [myTeamData, pickByName]
    );

    const otherTeams = useMemo<TradeTeam[]>(
        () => otherTeamsData.map(convertRaw),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [otherTeamsData, pickByName]
    );

    return (
        <TradeEvaluator
                initialPpr={ppr}
                initialLeagueSize={leagueSize}
                initialLeagueType={leagueType}
                initialLeagueSettings={leagueSettings}
                leagueLabel={label}
                lockSettings
                myTeam={myTeam}
                otherTeams={otherTeams}
                defenseValues={defenseValues}
        />
    );
}
