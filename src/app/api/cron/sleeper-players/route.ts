import { prisma } from '@/lib/prisma';

export const maxDuration = 60;

type RawPlayer = {
    active?: boolean;
    position?: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    team?: string;
};

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const res = await fetch('https://api.sleeper.app/v1/players/nfl', { cache: 'no-store' });
    if (!res.ok) {
        return Response.json({ error: `Sleeper responded ${res.status}` }, { status: 502 });
    }

    const data: Record<string, RawPlayer> = await res.json() as Record<string, RawPlayer>;

    const rows = Object.entries(data)
        .filter(([, p]) => p.position)
        .map(([id, p]) => ({
            playerId: id,
            fullName: p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
            position: p.position!,
            team: p.team ?? 'FA',
            active: p.active ?? false,
        }));

    // Upsert in batches of 500 to stay within statement limits
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        await Promise.all(
            batch.map((r) =>
                prisma.sleeperPlayer.upsert({
                    where: { playerId: r.playerId },
                    create: r,
                    update: { fullName: r.fullName, position: r.position, team: r.team, active: r.active },
                })
            )
        );
    }

    return Response.json({ ok: true, upserted: rows.length });
}
