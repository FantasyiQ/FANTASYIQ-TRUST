import { prisma } from '@/lib/prisma';

export type LeagueRow = {
    id:              string;
    leagueId:        string;
    leagueName:      string;
    season:          string;
    userId:          string;
    isCommissioner:  boolean;
};

/**
 * Fetch a league by its DB id, attaching an isCommissioner flag based on the
 * sleeperUserId comparison (no Sleeper API call required).
 *
 * Returns null if the league doesn't exist or doesn't belong to the requesting user.
 */
export async function getLeagueById(
    id: string,
    requestingUserId: string,
): Promise<LeagueRow | null> {
    const [league, dbUser] = await Promise.all([
        prisma.league.findUnique({
            where:  { id },
            select: { id: true, leagueId: true, leagueName: true, season: true, userId: true, sleeperUserId: true },
        }),
        prisma.user.findUnique({
            where:  { id: requestingUserId },
            select: { sleeperUserId: true },
        }),
    ]);

    if (!league || league.userId !== requestingUserId) return null;

    const isCommissioner =
        !!league.sleeperUserId &&
        !!dbUser?.sleeperUserId &&
        String(league.sleeperUserId).trim() === String(dbUser.sleeperUserId).trim();

    return {
        id:             league.id,
        leagueId:       league.leagueId,
        leagueName:     league.leagueName,
        season:         league.season,
        userId:         league.userId,
        isCommissioner,
    };
}
