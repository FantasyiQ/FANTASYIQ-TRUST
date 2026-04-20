import { prisma } from '@/lib/prisma';
import type { DeltaEntry, DeltaResponse } from '@/lib/player-universe';

const KTC_CAP = 9999;
function normalise(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / KTC_CAP) * 100)));
}

export async function GET(): Promise<Response> {
    // Fetch current values and the most recent snapshot in parallel
    const [currentRows, sleeperPlayers, snapshot] = await Promise.all([
        prisma.fantasyCalcValue.findMany({
            where: {
                position: { in: ['QB', 'RB', 'WR', 'TE'] },
                OR: [{ dynastyValue: { gt: 0 } }, { redraftValue: { gt: 0 } }],
            },
            select: { nameLower: true, playerName: true, position: true, dynastyValue: true, dynastyValueSf: true, redraftValue: true, redraftValueSf: true },
        }),
        prisma.sleeperPlayer.findMany({
            where:  { active: true },
            select: { fullName: true, team: true, injuryStatus: true },
        }),
        // Most recent snapshot batch: get the latest takenAt, then fetch all rows from that batch
        prisma.fantasyCalcSnapshot.findFirst({
            orderBy: { takenAt: 'desc' },
            select:  { takenAt: true },
        }),
    ]);

    if (!snapshot) {
        return Response.json({
            snapshotTakenAt: null,
            generatedAt: new Date().toISOString(),
            totalChanged: 0,
            entries: [],
        } satisfies DeltaResponse);
    }

    // Fetch all snapshot rows from the most recent batch (same takenAt minute)
    const batchStart = new Date(snapshot.takenAt.getTime() - 60 * 1000); // ±1 min window
    const snapshotRows = await prisma.fantasyCalcSnapshot.findMany({
        where: { takenAt: { gte: batchStart } },
        select: { nameLower: true, position: true, dynastyValue: true, dynastyValueSf: true, redraftValue: true, redraftValueSf: true, team: true, injuryStatus: true },
    });

    // Build Sleeper lookup
    const sleeperByName = new Map<string, { team: string; injuryStatus: string | null }>();
    for (const p of sleeperPlayers) {
        sleeperByName.set(p.fullName.toLowerCase(), { team: p.team, injuryStatus: p.injuryStatus });
    }

    // Build maps
    const currentMap  = new Map(currentRows.map(r => [r.nameLower, r]));
    const snapshotMap = new Map(snapshotRows.map(r => [r.nameLower, r]));

    const entries: DeltaEntry[] = [];

    // Check all current players for changes
    for (const curr of currentRows) {
        const prev = snapshotMap.get(curr.nameLower);
        const sl   = sleeperByName.get(curr.nameLower);
        const currentTeam = (sl?.team && sl.team !== 'FA') ? sl.team : null;

        if (!prev) {
            // New player (not in yesterday's snapshot)
            entries.push({
                name:     curr.playerName,
                position: curr.position,
                dynasty:  { current: normalise(curr.dynastyValue), prev: 0, delta: normalise(curr.dynastyValue) },
                redraft:  { current: normalise(curr.redraftValue), prev: 0, delta: normalise(curr.redraftValue) },
                team:     currentTeam !== null ? { current: currentTeam, prev: null } : null,
                injuryStatus: sl?.injuryStatus ? { current: sl.injuryStatus, prev: null } : null,
                isNew:    true,
                isDropped: false,
            });
            continue;
        }

        const dynastyCurr = normalise(curr.dynastyValue);
        const dynastyPrev = normalise(prev.dynastyValue);
        const redraftCurr = normalise(curr.redraftValue);
        const redraftPrev = normalise(prev.redraftValue);

        const prevTeam = prev.team;
        const teamChanged = currentTeam !== prevTeam;

        const currInjury = sl?.injuryStatus ?? null;
        const prevInjury = prev.injuryStatus ?? null;
        const injuryChanged = currInjury !== prevInjury;

        const dynastyDelta = dynastyCurr - dynastyPrev;
        const redraftDelta = redraftCurr - redraftPrev;

        // Only include if something actually changed
        if (dynastyDelta === 0 && redraftDelta === 0 && !teamChanged && !injuryChanged) continue;

        entries.push({
            name:     curr.playerName,
            position: curr.position,
            dynasty:  { current: dynastyCurr, prev: dynastyPrev, delta: dynastyDelta },
            redraft:  { current: redraftCurr, prev: redraftPrev, delta: redraftDelta },
            team:          teamChanged    ? { current: currentTeam, prev: prevTeam ?? null }       : null,
            injuryStatus:  injuryChanged  ? { current: currInjury,  prev: prevInjury }             : null,
            isNew:    false,
            isDropped: false,
        });
    }

    // Dropped players (in snapshot but not current)
    for (const [nameLower, prev] of snapshotMap) {
        if (!currentMap.has(nameLower)) {
            entries.push({
                name:      nameLower,
                position:  prev.position,
                dynasty:   { current: 0, prev: normalise(prev.dynastyValue), delta: -normalise(prev.dynastyValue) },
                redraft:   { current: 0, prev: normalise(prev.redraftValue),  delta: -normalise(prev.redraftValue) },
                team:          null,
                injuryStatus:  null,
                isNew:     false,
                isDropped: true,
            });
        }
    }

    // Sort: biggest absolute dynasty delta first, then new/dropped, then team/injury changes
    entries.sort((a, b) => {
        if (a.isDropped !== b.isDropped) return a.isDropped ? 1 : -1;
        if (a.isNew !== b.isNew)         return a.isNew ? -1 : 1;
        return Math.abs(b.dynasty.delta) - Math.abs(a.dynasty.delta);
    });

    return Response.json({
        snapshotTakenAt: snapshot.takenAt.toISOString(),
        generatedAt:     new Date().toISOString(),
        totalChanged:    entries.length,
        entries,
    } satisfies DeltaResponse, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
}
