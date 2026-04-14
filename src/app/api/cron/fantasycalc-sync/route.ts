import { prisma } from '@/lib/prisma';

export const maxDuration = 60;

type KtcPlayer = {
    playerID:        number;
    playerName:      string;
    position:        string;
    team?:           string | null;
    age?:            number | null;
    oneQBValues:     { value: number };
    superflexValues: { value: number };
};

/** Parse the embedded playersArray from a KTC HTML page */
function parsePlayersArray(html: string): KtcPlayer[] {
    const varIdx = html.indexOf('var playersArray = ');
    if (varIdx === -1) throw new Error('playersArray not found in HTML');
    const arrStart = html.indexOf('[', varIdx);
    if (arrStart === -1) throw new Error('Array start not found');

    // Find matching closing bracket
    let depth = 0, end = -1;
    for (let i = arrStart; i < html.length; i++) {
        if (html[i] === '[') depth++;
        else if (html[i] === ']') {
            depth--;
            if (depth === 0) { end = i; break; }
        }
    }
    if (end === -1) throw new Error('Array end not found');
    return JSON.parse(html.slice(arrStart, end + 1)) as KtcPlayer[];
}

async function fetchKtcPage(url: string): Promise<KtcPlayer[]> {
    const res = await fetch(url, {
        cache: 'no-store',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FantasyIQ/1.0)' },
    });
    if (!res.ok) throw new Error(`KTC responded ${res.status} for ${url}`);
    return parsePlayersArray(await res.text());
}

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch both dynasty and redraft pages in parallel
    let dynastyPlayers: KtcPlayer[], redraftPlayers: KtcPlayer[];
    try {
        [dynastyPlayers, redraftPlayers] = await Promise.all([
            fetchKtcPage('https://keeptradecut.com/dynasty-rankings'),
            fetchKtcPage('https://keeptradecut.com/fantasy-rankings'),
        ]);
    } catch (err) {
        return Response.json({ error: String(err) }, { status: 502 });
    }

    // Build redraft value map by playerID
    const redraftMap = new Map<number, number>();
    for (const p of redraftPlayers) {
        redraftMap.set(p.playerID, p.oneQBValues?.value ?? 0);
    }

    const entries = dynastyPlayers.filter(p => p.playerName && p.playerID);

    // Build redraft superflex map (from fantasy-rankings superflexValues)
    const redraftSfMap = new Map<number, number>();
    for (const p of redraftPlayers) {
        redraftSfMap.set(p.playerID, p.superflexValues?.value ?? 0);
    }

    const BATCH = 50;
    let upserted = 0;

    for (let i = 0; i < entries.length; i += BATCH) {
        const batch = entries.slice(i, i + BATCH);
        await Promise.all(batch.map(p =>
            prisma.fantasyCalcValue.upsert({
                where:  { fcId: p.playerID },
                create: {
                    fcId:           p.playerID,
                    playerName:     p.playerName,
                    nameLower:      p.playerName.toLowerCase(),
                    position:       p.position,
                    team:           p.team                           ?? null,
                    age:            p.age                            ?? null,
                    dynastyValue:   p.oneQBValues?.value             ?? 0,
                    dynastyValueSf: p.superflexValues?.value         ?? 0,
                    redraftValue:   redraftMap.get(p.playerID)       ?? 0,
                    redraftValueSf: redraftSfMap.get(p.playerID)     ?? 0,
                    trend30Day:     null,
                },
                update: {
                    playerName:     p.playerName,
                    nameLower:      p.playerName.toLowerCase(),
                    position:       p.position,
                    team:           p.team                           ?? null,
                    age:            p.age                            ?? null,
                    dynastyValue:   p.oneQBValues?.value             ?? 0,
                    dynastyValueSf: p.superflexValues?.value         ?? 0,
                    redraftValue:   redraftMap.get(p.playerID)       ?? 0,
                    redraftValueSf: redraftSfMap.get(p.playerID)     ?? 0,
                    trend30Day:     null,
                },
            }).catch(() => null)
        ));
        upserted += batch.length;
    }

    return Response.json({ ok: true, source: 'KTC', upserted });
}
