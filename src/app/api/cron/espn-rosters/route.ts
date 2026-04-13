import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAllEspnRosters } from '@/lib/espn-nfl';

export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const players = await getAllEspnRosters();

    // Match ESPN players to SleeperPlayer records by normalised name + team,
    // then update injury/physical fields. We don't create new records here —
    // Sleeper is the canonical player source; ESPN only enriches it.
    let matched = 0;
    let unmatched = 0;

    const BATCH = 100;
    for (let i = 0; i < players.length; i += BATCH) {
        const batch = players.slice(i, i + BATCH);
        await Promise.all(batch.map(async (ep) => {
            const result = await prisma.sleeperPlayer.updateMany({
                where: {
                    fullName: { equals: ep.fullName, mode: 'insensitive' },
                    team:     ep.team,
                },
                data: {
                    espnId:         ep.espnId,
                    injuryStatus:   ep.injuryStatus,
                    injuryBodyPart: ep.injuryBodyPart,
                    jerseyNumber:   ep.jerseyNumber,
                    height:         ep.height,
                    weight:         ep.weight ?? undefined,
                    age:            ep.age ?? undefined,
                },
            });
            if (result.count > 0) matched++;
            else unmatched++;
        }));
    }

    return Response.json({ ok: true, total: players.length, matched, unmatched });
}
