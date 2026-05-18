// Fetches the minimal data needed to run the Team Trajectory engine for the
// current user's team in a given Sleeper league.
// Keeps costs low by using the SleeperPlayer and FantasyCalcValue DB tables
// instead of loading the full 10k-player Sleeper players map.

import { prisma } from '@/lib/prisma';
import { getLeagueRosters, getTradedPicks } from '@/lib/sleeper';
import type { RosterPlayer, OwnedPick } from '@/lib/teamTrajectory';

export interface MyTeamSnapshot {
    players:    RosterPlayer[];
    ownedPicks: OwnedPick[];
}

export async function getMyTeamSnapshot(
    sleeperLeagueId: string,
    mySleeperUserId: string | null,
    season: string,
    superflex: boolean,
    isDynasty: boolean,
): Promise<MyTeamSnapshot | null> {
    if (!mySleeperUserId) return null;

    const [rosters, tradedPicks] = await Promise.all([
        getLeagueRosters(sleeperLeagueId),
        getTradedPicks(sleeperLeagueId),
    ]);

    const myRoster = rosters.find(r => r.owner_id === mySleeperUserId);
    if (!myRoster) return null;

    const playerIds = (myRoster.players ?? []).filter(id => id && id !== '0');

    // ── Fetch player data from DB ──────────────────────────────────────────────
    const sleeperPlayers = await prisma.sleeperPlayer.findMany({
        where:  { playerId: { in: playerIds } },
        select: { playerId: true, fullName: true, position: true, age: true },
    });

    const playerMap = new Map(sleeperPlayers.map(p => [p.playerId, p]));
    const names     = sleeperPlayers.map(p => p.fullName.toLowerCase().trim());

    const ktcRecords = names.length > 0
        ? await prisma.fantasyCalcValue.findMany({
            where:  { nameLower: { in: names } },
            select: { nameLower: true, position: true, dynastyValue: true, dynastyValueSf: true, redraftValue: true, redraftValueSf: true, age: true },
        })
        : [];

    // Build name→position→ktc map to resolve collisions (two players with same name)
    const ktcByNamePos = new Map<string, Map<string, typeof ktcRecords[0]>>();
    for (const rec of ktcRecords) {
        if (!ktcByNamePos.has(rec.nameLower)) ktcByNamePos.set(rec.nameLower, new Map());
        ktcByNamePos.get(rec.nameLower)!.set(rec.position, rec);
    }

    const players: RosterPlayer[] = playerIds
        .map(pid => {
            const sp = playerMap.get(pid);
            if (!sp) return null;

            const nameLower = sp.fullName.toLowerCase().trim();
            const byPos     = ktcByNamePos.get(nameLower);
            const ktcRec    = byPos?.get(sp.position) ?? (byPos?.size === 1 ? byPos.values().next().value : undefined);

            let ktcValue = 0;
            if (ktcRec) {
                if (isDynasty) {
                    ktcValue = superflex ? ktcRec.dynastyValueSf : ktcRec.dynastyValue;
                } else {
                    ktcValue = superflex ? ktcRec.redraftValueSf : ktcRec.redraftValue;
                }
            }

            const age = sp.age ?? (ktcRec?.age ? Math.round(Number(ktcRec.age)) : null);

            return {
                id:       pid,
                name:     sp.fullName,
                position: sp.position,
                age,
                ktcValue,
            } satisfies RosterPlayer;
        })
        .filter((p): p is RosterPlayer => p !== null);

    // ── Compute owned picks (simplified) ──────────────────────────────────────
    // For trajectory we just need a quality count, not exact slot positions.
    // Future seasons window: current season + 2 years
    const seasonNum    = parseInt(season, 10) || new Date().getFullYear();
    const futureSeasons = [String(seasonNum), String(seasonNum + 1), String(seasonNum + 2)];
    const ROUNDS        = isDynasty ? [1, 2, 3, 4, 5] : [1, 2, 3];
    const myRosterId    = myRoster.roster_id;

    // Build current-ownership map from tradedPicks.
    // tradedPicks has one entry per pick that changed hands — owner_id is current owner.
    const tradedOwnerMap = new Map<string, number>();
    for (const tp of tradedPicks) {
        const key = `${tp.season}-${tp.round}-${tp.roster_id}`;
        tradedOwnerMap.set(key, tp.owner_id);
    }

    const ownedPicks: OwnedPick[] = [];

    for (const season of futureSeasons) {
        for (const round of ROUNDS) {
            // Own picks from ALL teams, check current ownership
            for (const roster of rosters) {
                const origRosterId = roster.roster_id;
                const key          = `${season}-${round}-${origRosterId}`;
                const currentOwner = tradedOwnerMap.get(key) ?? origRosterId;

                if (currentOwner === myRosterId) {
                    ownedPicks.push({ season, round });
                }
            }
        }
    }

    return { players, ownedPicks };
}
