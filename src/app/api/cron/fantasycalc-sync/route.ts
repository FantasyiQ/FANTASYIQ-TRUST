import { prisma } from '@/lib/prisma';

export const maxDuration = 60;

// FantasyCalc public API — returns dynasty + redraft values for all players
// https://api.fantasycalc.com/values/current
// Parameters: isDynasty, numQbs (1=1QB, 2=Superflex), ppr (0/0.5/1), numTeams

type FcPlayer = {
    id:            number;
    name:          string;
    position:      string;
    value:         number;   // dynasty value
    redraftValue:  number;
    maybeTeam?:    string | null;
    maybeAge?:     number | null;
    trend30Day?:   number | null;
};

type FcResponse = FcPlayer[];

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch 1QB dynasty values (PPR) — this is the most common format
    const res = await fetch(
        'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&ppr=1&numTeams=12',
        { cache: 'no-store' },
    );
    if (!res.ok) {
        return Response.json({ error: `FantasyCalc responded ${res.status}` }, { status: 502 });
    }

    const players = await res.json() as FcResponse;

    if (!Array.isArray(players) || players.length === 0) {
        return Response.json({ error: 'Empty response from FantasyCalc' }, { status: 502 });
    }

    // Upsert in batches of 200
    const BATCH = 200;
    let upserted = 0;

    for (let i = 0; i < players.length; i += BATCH) {
        const batch = players.slice(i, i + BATCH);
        await Promise.all(batch.map(p =>
            prisma.fantasyCalcValue.upsert({
                where:  { fcId: p.id },
                create: {
                    fcId:         p.id,
                    playerName:   p.name,
                    nameLower:    p.name.toLowerCase(),
                    position:     p.position,
                    team:         p.maybeTeam  ?? null,
                    age:          p.maybeAge   ?? null,
                    dynastyValue: p.value,
                    redraftValue: p.redraftValue,
                    trend30Day:   p.trend30Day  ?? null,
                },
                update: {
                    playerName:   p.name,
                    nameLower:    p.name.toLowerCase(),
                    position:     p.position,
                    team:         p.maybeTeam  ?? null,
                    age:          p.maybeAge   ?? null,
                    dynastyValue: p.value,
                    redraftValue: p.redraftValue,
                    trend30Day:   p.trend30Day  ?? null,
                },
            }).catch(() => null)
        ));
        upserted += batch.length;
    }

    return Response.json({ ok: true, upserted });
}
