import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

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

    // Fetch 1QB dynasty values (PPR) — most common format
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

    // Single bulk upsert via raw SQL — vastly faster than N individual upserts
    const values = players.map(p =>
        Prisma.sql`(
            ${p.id},
            ${p.name},
            ${p.name.toLowerCase()},
            ${p.position},
            ${p.maybeTeam ?? null},
            ${p.maybeAge ?? null},
            ${p.value},
            ${p.redraftValue},
            ${p.trend30Day ?? null},
            NOW()
        )`
    );

    await prisma.$executeRaw`
        INSERT INTO "FantasyCalcValue"
            ("fcId","playerName","nameLower","position","team","age","dynastyValue","redraftValue","trend30Day","updatedAt")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("fcId") DO UPDATE SET
            "playerName"   = EXCLUDED."playerName",
            "nameLower"    = EXCLUDED."nameLower",
            "position"     = EXCLUDED."position",
            "team"         = EXCLUDED."team",
            "age"          = EXCLUDED."age",
            "dynastyValue" = EXCLUDED."dynastyValue",
            "redraftValue" = EXCLUDED."redraftValue",
            "trend30Day"   = EXCLUDED."trend30Day",
            "updatedAt"    = NOW()
    `;

    return Response.json({ ok: true, upserted: players.length });
}
