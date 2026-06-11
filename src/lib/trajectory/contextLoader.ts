// FantasyiQ Trust — League Context Loader
// Fetches all-team roster + pick data from Sleeper + DB to build a LeagueContext
// for the Team Trajectory Engine. League-relative: all teams are loaded so
// pick capital can be normalized against the league average.

import { prisma } from '@/lib/prisma';
import { getLeagueRosters, getDraftPicks } from '@/lib/sleeper';
import type { LeagueContext, TeamContext, TeamPick } from './types';
import type { LeaguePhaseResult } from '@/lib/leaguePhase';

// ── Age curve helpers ─────────────────────────────────────────────────────────

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

const AGE_CURVES: Record<string, { youngAge: number; cliffAge: number }> = {
    QB: { youngAge: 24, cliffAge: 38 },
    RB: { youngAge: 22, cliffAge: 30 },
    WR: { youngAge: 23, cliffAge: 33 },
    TE: { youngAge: 23, cliffAge: 33 },
};

/**
 * Returns 0–100 where 100 = young/high-upside, 0 = old/near-cliff.
 * Inverted from the old "age burden" convention so higher is always better.
 */
function youthScore(age: number, position: string): number {
    const cfg = AGE_CURVES[position] ?? { youngAge: 24, cliffAge: 34 };
    const burden = Math.max(0, Math.min(100,
        (age - cfg.youngAge) / (cfg.cliffAge - cfg.youngAge) * 100
    ));
    return 100 - burden;
}

interface RichPlayer {
    position: string;
    age:      number | null;
    dynastyValue: number;
}

function computeStarterQuality(players: RichPlayer[]): number {
    const sorted   = [...players].sort((a, b) => b.dynastyValue - a.dynastyValue);
    const starters = sorted.slice(0, 8);
    if (starters.length === 0) return 0;
    const avg = starters.reduce((s, p) => s + p.dynastyValue, 0) / starters.length;
    // Dynasty value range ~500–8000 → normalize to 0–100
    return Math.max(0, Math.min(100, Math.round((avg - 500) / 75)));
}

function computeAgeCurveScore(players: RichPlayer[]): number {
    const skill = players.filter(p => SKILL_POSITIONS.has(p.position) && p.dynastyValue > 0);
    if (skill.length === 0) return 50;

    let weightedYouth = 0;
    let totalWeight   = 0;

    for (const p of skill) {
        const age = p.age ?? 26;
        const youth = youthScore(age, p.position);
        weightedYouth += youth * p.dynastyValue;
        totalWeight   += p.dynastyValue;
    }

    return totalWeight > 0 ? Math.round(weightedYouth / totalWeight) : 50;
}

function computeFutureVsProduction(players: RichPlayer[]): number {
    const skill = players.filter(p => SKILL_POSITIONS.has(p.position) && p.dynastyValue > 0);
    if (skill.length === 0) return 50;

    let futureWeight = 0;
    let totalValue   = 0;

    for (const p of skill) {
        const age = p.age ?? 26;
        // Future weight: 22 → 1.0, 30 → 0.0 (linear)
        const fw = Math.max(0, Math.min(1, 1 - (age - 22) / 8));
        futureWeight += p.dynastyValue * fw;
        totalValue   += p.dynastyValue;
    }

    return totalValue > 0 ? Math.round(futureWeight / totalValue * 100) : 50;
}

// ── Pick ownership ────────────────────────────────────────────────────────────

function computeOwnedPicks(
    rosterId: number,
    allRosterIds: number[],
    tradedPicks: { season: string; round: number; roster_id: number; owner_id: number }[],
    futureSeasons: string[],
    draftRounds: number,
): TeamPick[] {
    // Build current-ownership map from tradedPicks
    const tradedOwnerMap = new Map<string, number>();
    for (const tp of tradedPicks) {
        tradedOwnerMap.set(`${tp.season}-${tp.round}-${tp.roster_id}`, tp.owner_id);
    }

    const owned: TeamPick[] = [];
    for (const season of futureSeasons) {
        for (let round = 1; round <= draftRounds; round++) {
            for (const origRosterId of allRosterIds) {
                const key          = `${season}-${round}-${origRosterId}`;
                const currentOwner = tradedOwnerMap.get(key) ?? origRosterId;
                if (currentOwner === rosterId) {
                    owned.push({ round, year: parseInt(season, 10) });
                }
            }
        }
    }

    return owned;
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface LeagueContextResult {
    context:    LeagueContext;
    myTeamId:   string | null;
}

export async function getLeagueContext(
    sleeperLeagueId: string,
    mySleeperUserId: string | null,
    season: string,
    isDynasty: boolean,
    superflex: boolean,
    phaseResult: LeaguePhaseResult,
): Promise<LeagueContextResult> {
    const [rosters, draftPicks] = await Promise.all([
        getLeagueRosters(sleeperLeagueId),
        getDraftPicks(sleeperLeagueId),
    ]);

    // Collect all player IDs across all rosters
    const allPlayerIds = [...new Set(
        rosters.flatMap(r => (r.players ?? []).filter(id => id && id !== '0'))
    )];

    // Batch fetch SleeperPlayer + FantasyCalcValue
    const [sleeperPlayers, fcRecords] = await Promise.all([
        allPlayerIds.length > 0
            ? prisma.sleeperPlayer.findMany({
                where:  { playerId: { in: allPlayerIds } },
                select: { playerId: true, fullName: true, position: true, age: true },
            })
            : Promise.resolve([]),
        // We'll join dynasty values by name after getting names
        Promise.resolve([] as { nameLower: string; position: string; dynastyValue: number; dynastyValueSf: number; redraftValue: number; redraftValueSf: number; age: number | null }[]),
    ]);

    // Build id → SleeperPlayer map
    const playerById = new Map(sleeperPlayers.map(p => [p.playerId, p]));

    // Fetch dynasty values by name
    const names = sleeperPlayers.map(p => p.fullName.toLowerCase().trim());
    const fcData = names.length > 0
        ? await prisma.fantasyCalcValue.findMany({
            where:  { nameLower: { in: names } },
            select: { nameLower: true, position: true, dynastyValue: true, dynastyValueSf: true, redraftValue: true, redraftValueSf: true, age: true },
        })
        : [];
    void fcRecords;

    // Two-level map: nameLower → position → dynasty record (handle name collisions)
    const fcByNamePos = new Map<string, Map<string, typeof fcData[0]>>();
    for (const rec of fcData) {
        if (!fcByNamePos.has(rec.nameLower)) fcByNamePos.set(rec.nameLower, new Map());
        fcByNamePos.get(rec.nameLower)!.set(rec.position, rec);
    }

    const seasonNum    = parseInt(season, 10) || new Date().getFullYear();
    const futureSeasons = [String(seasonNum), String(seasonNum + 1), String(seasonNum + 2)];
    const draftRounds   = isDynasty ? 5 : 3;
    const allRosterIds  = rosters.map(r => r.roster_id);

    // Build rich player helper
    function enrichPlayers(playerIds: string[]): RichPlayer[] {
        return playerIds
            .filter(id => id && id !== '0')
            .map(pid => {
                const sp = playerById.get(pid);
                if (!sp) return null;

                const nameLower = sp.fullName.toLowerCase().trim();
                const byPos     = fcByNamePos.get(nameLower);
                const fcRec    = byPos?.get(sp.position) ?? (byPos?.size === 1 ? byPos.values().next().value : undefined);

                let dynastyValue = 0;
                if (fcRec) {
                    dynastyValue = isDynasty
                        ? (superflex ? fcRec.dynastyValueSf : fcRec.dynastyValue)
                        : (superflex ? fcRec.redraftValueSf : fcRec.redraftValue);
                }

                const age = sp.age ?? (fcRec?.age ? Math.round(Number(fcRec.age)) : null);

                return { position: sp.position, age, dynastyValue } satisfies RichPlayer;
            })
            .filter((p): p is RichPlayer => p !== null);
    }

    // Build TeamContext for each roster
    let myTeamId: string | null = null;

    const teams: TeamContext[] = rosters.map(roster => {
        const id      = String(roster.roster_id);
        const players = enrichPlayers(roster.players ?? []);
        const picks   = computeOwnedPicks(roster.roster_id, allRosterIds, draftPicks, futureSeasons, draftRounds);

        if (roster.owner_id === mySleeperUserId) myTeamId = id;

        return {
            id,
            startersScore:           computeStarterQuality(players),
            ageCurveScore:           computeAgeCurveScore(players),
            futureVsProductionScore: computeFutureVsProduction(players),
            picks,
        };
    });

    return {
        context: {
            teams,
            phase: {
                phase:            phaseResult.phase,
                isWinNowWindow:   phaseResult.isWinNowWindow,
                activeRookieYear: phaseResult.activeRookieYear,
            },
        },
        myTeamId,
    };
}
