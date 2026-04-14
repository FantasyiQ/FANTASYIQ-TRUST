import { prisma } from '@/lib/prisma';

export const maxDuration = 60;

type FcEntry = {
    player: {
        id:          number;
        name:        string;
        position:    string;
        maybeTeam?:  string | null;
        maybeAge?:   number | null;
    };
    value:        number;   // dynasty value
    redraftValue: number;
    trend30Day?:  number | null;
};

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const res = await fetch(
        'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&ppr=1&numTeams=12',
        { cache: 'no-store' },
    );
    if (!res.ok) {
        return Response.json({ error: `FantasyCalc responded ${res.status}` }, { status: 502 });
    }

    const raw = await res.json() as FcEntry[];
    if (!Array.isArray(raw) || raw.length === 0) {
        return Response.json({ error: 'Empty response from FantasyCalc' }, { status: 502 });
    }

    // Filter out entries without a valid player name
    const entries = raw.filter(e => typeof e.player?.name === 'string' && e.player.name.length > 0);

    const BATCH = 50;
    let upserted = 0;

    for (let i = 0; i < entries.length; i += BATCH) {
        const batch = entries.slice(i, i + BATCH);
        await Promise.all(batch.map(e =>
            prisma.fantasyCalcValue.upsert({
                where:  { fcId: e.player.id },
                create: {
                    fcId:         e.player.id,
                    playerName:   e.player.name,
                    nameLower:    e.player.name.toLowerCase(),
                    position:     e.player.position,
                    team:         e.player.maybeTeam  ?? null,
                    age:          e.player.maybeAge   ?? null,
                    dynastyValue: e.value,
                    redraftValue: e.redraftValue,
                    trend30Day:   e.trend30Day         ?? null,
                },
                update: {
                    playerName:   e.player.name,
                    nameLower:    e.player.name.toLowerCase(),
                    position:     e.player.position,
                    team:         e.player.maybeTeam  ?? null,
                    age:          e.player.maybeAge   ?? null,
                    dynastyValue: e.value,
                    redraftValue: e.redraftValue,
                    trend30Day:   e.trend30Day         ?? null,
                },
            }).catch(() => null)
        ));
        upserted += batch.length;
    }

    return Response.json({ ok: true, upserted });
}
