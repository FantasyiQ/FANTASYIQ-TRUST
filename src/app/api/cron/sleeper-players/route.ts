import { prisma } from '@/lib/prisma';

export const maxDuration = 60;

type RawPlayer = {
    active?:          boolean;
    position?:        string;
    full_name?:       string;
    first_name?:      string;
    last_name?:       string;
    team?:            string;
    espn_id?:         string | number | null;
    injury_status?:   string | null;
    injury_body_part?: string | null;
    number?:          number | string | null;
    height?:          string | null;  // inches as string e.g. "74"
    weight?:          string | null;  // lbs as string e.g. "225"
    birth_date?:      string | null;  // ISO date e.g. "1998-05-15" — canonical DOB source
    age?:             number | null;  // pre-calculated by Sleeper (fallback when birth_date absent)
};

function formatHeight(inches: string | null | undefined): string | null {
    if (!inches) return null;
    const n = parseInt(inches);
    if (isNaN(n)) return null;
    return `${Math.floor(n / 12)}' ${n % 12}"`;
}

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
            playerId:       id,
            fullName:       p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
            position:       p.position!,
            team:           p.team ?? 'FA',
            active:         p.active ?? false,
            espnId:         p.espn_id ? String(p.espn_id) : null,
            injuryStatus:   p.injury_status ?? null,
            injuryBodyPart: p.injury_body_part ?? null,
            jerseyNumber:   p.number ? parseInt(String(p.number)) || null : null,
            height:         formatHeight(p.height),
            weight:         p.weight ? parseInt(String(p.weight)) || null : null,
            birthDate:      p.birth_date ?? null,
            age:            p.age ?? null,
        }));

    // Upsert in batches of 500 to stay within statement limits
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        await Promise.all(
            batch.map((r) =>
                prisma.sleeperPlayer.upsert({
                    where:  { playerId: r.playerId },
                    create: r,
                    update: {
                        fullName:       r.fullName,
                        position:       r.position,
                        team:           r.team,
                        active:         r.active,
                        espnId:         r.espnId,
                        injuryStatus:   r.injuryStatus,
                        injuryBodyPart: r.injuryBodyPart,
                        jerseyNumber:   r.jerseyNumber,
                        height:         r.height,
                        weight:         r.weight,
                        birthDate:      r.birthDate,
                        age:            r.age,
                    },
                })
            )
        );
    }

    return Response.json({ ok: true, upserted: rows.length });
}
