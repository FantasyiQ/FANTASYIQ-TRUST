// FantasyIQ Trust — Real Redraft Big Board
//
// Ranks players for a specific league's redraft board using their real
// per-game production computed under that league's exact scoring settings
// (via the League Scoring Points Engine's computeRealPoints), rather than a
// generic Sleeper ADP number that's identical for every league regardless of
// PPR/Standard/custom scoring rules.
//
// Players with real season stats are ranked by computed points, descending.
// Players with no stats yet (rookies, new signings) have no real signal to
// rank by — rather than fabricate one, they're placed after every player
// with real data, ordered among themselves by ADP (Sleeper's real market
// consensus, the best available honest signal for them specifically).

import { prisma } from '@/lib/prisma';
import { getNflState } from '@/lib/sleeper';
import { computeRealPoints, toStatsPerGame } from './leagueScoringPoints';

const REDRAFT_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
const MAX_PLAUSIBLE_AGE = 45; // no real NFL player plays past their mid-40s

export interface RealRedraftPlayer {
    playerId:       string;
    name:           string;
    position:       string;
    team:           string | null;
    age:            number | null;
    birthDate:      string | null;
    injuryStatus:   string | null;
    adp:            number;              // Sleeper searchRank — always present, used as the tiebreak/fallback signal
    realPtsPerGame: number | null;        // null when the player has no season stats yet
    hasRealData:    boolean;
}

export async function computeRealRedraftBoard(
    scoringSettings: Record<string, number>,
    limit = 300,
): Promise<RealRedraftPlayer[]> {
    const nflState    = await getNflState();
    const statsSeason = nflState.season;

    const [rawPlayers, currentSeasonStats] = await Promise.all([
        prisma.sleeperPlayer.findMany({
            where: {
                position: { in: [...REDRAFT_POSITIONS] },
                team:     { not: 'FA' }, // not rostered anywhere = zero real value this season
                // Sleeper never assigns a searchRank to team defenses (always
                // null), so requiring one would silently drop every DEF from
                // the board — only require it for individual skill players.
                OR: [
                    { searchRank: { not: null } },
                    { position: 'DEF' },
                ],
            },
            select: {
                playerId: true, fullName: true, position: true, team: true,
                birthDate: true, age: true, searchRank: true, injuryStatus: true,
            },
        }),
        prisma.playerSeasonStats.findMany({
            where:  { season: statsSeason },
            select: { playerId: true, gamesPlayed: true, rawStats: true },
        }),
    ]);

    const seasonStatsRows = currentSeasonStats.length > 0
        ? currentSeasonStats
        : await prisma.playerSeasonStats.findMany({
            where:  { season: String(Number(statsSeason) - 1) },
            select: { playerId: true, gamesPlayed: true, rawStats: true },
        });
    const statsByPlayerId = new Map(
        seasonStatsRows.map(s => [s.playerId, {
            gamesPlayed:  s.gamesPlayed,
            statsPerGame: toStatsPerGame(s.rawStats as Record<string, number>, s.gamesPlayed),
        }])
    );

    const players: RealRedraftPlayer[] = rawPlayers
        // Sleeper's active flag is unreliable for long-retired players still
        // marked active — a real computed-age cutoff catches what team!=FA
        // alone can miss (see feedback_stale_sleeper_player_data).
        .filter(p => {
            if (!p.birthDate) return true; // team defenses — no birthDate, always fine
            const dob = new Date(p.birthDate);
            if (isNaN(dob.getTime())) return true;
            const age = new Date().getFullYear() - dob.getFullYear();
            return age <= MAX_PLAUSIBLE_AGE;
        })
        .map(p => {
            const stats = statsByPlayerId.get(p.playerId);
            const realPtsPerGame = stats && stats.gamesPlayed > 0
                ? computeRealPoints(stats.statsPerGame, scoringSettings)
                : null;
            return {
                playerId:       p.playerId,
                name:           p.fullName ?? '',
                position:       p.position ?? '',
                team:           p.team,
                age:            p.age,
                birthDate:      p.birthDate,
                injuryStatus:   p.injuryStatus,
                adp:            p.searchRank ?? 999,
                realPtsPerGame,
                hasRealData:    realPtsPerGame !== null,
            };
        })
        .sort((a, b) => {
            // Real-data players first, ranked by computed points descending;
            // no-data players after, ranked by ADP ascending among themselves.
            if (a.hasRealData && b.hasRealData) return (b.realPtsPerGame ?? 0) - (a.realPtsPerGame ?? 0);
            if (a.hasRealData !== b.hasRealData) return a.hasRealData ? -1 : 1;
            return a.adp - b.adp;
        })
        .slice(0, limit);

    return players;
}
