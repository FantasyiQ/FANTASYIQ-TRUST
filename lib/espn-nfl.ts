// ESPN hidden NFL API helpers
// All endpoints are unauthenticated and publicly accessible.

// Browser-like headers required — Vercel IPs get blocked without them
const ESPN_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.espn.com/',
    'Origin': 'https://www.espn.com',
};

export interface EspnPlayer {
    espnId:         string;
    fullName:       string;
    position:       string;   // ESPN position abbreviation
    team:           string;   // NFL team abbreviation (e.g. "ARI")
    jerseyNumber:   number | null;
    height:         string | null;   // e.g. "6' 2\""
    weight:         number | null;   // lbs
    age:            number | null;
    injuryStatus:   string | null;   // Active | Questionable | Doubtful | Out | IR | PUP | null
    injuryBodyPart: string | null;
}

interface EspnTeam {
    id: string;
    abbreviation: string;
    slug: string;
}

interface EspnRosterPlayer {
    id: string;
    fullName: string;
    position?: { abbreviation?: string };
    jersey?: string;
    displayHeight?: string;
    displayWeight?: string;
    age?: number;
    injuries?: { status?: string; type?: string; details?: { location?: string } }[];
    status?: { type?: string };
}

interface EspnRosterGroup {
    position?: string;
    items: EspnRosterPlayer[];
}

// ── Teams ──────────────────────────────────────────────────────────────────

export async function getEspnTeams(): Promise<EspnTeam[]> {
    const res = await fetch(
        'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=32',
        { headers: ESPN_HEADERS, cache: 'no-store' }
    );
    if (!res.ok) throw new Error(`ESPN teams ${res.status}`);
    const data = await res.json() as {
        sports: [{ leagues: [{ teams: [{ team: EspnTeam }] }] }]
    };
    return data.sports[0].leagues[0].teams.map(t => t.team);
}

// ── Team roster ────────────────────────────────────────────────────────────

export async function getEspnTeamRoster(teamSlug: string, teamAbbr: string): Promise<EspnPlayer[]> {
    const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamSlug}/roster`,
        { headers: ESPN_HEADERS, cache: 'no-store' }
    );
    if (!res.ok) return [];

    const data = await res.json() as { athletes?: EspnRosterGroup[] };
    const players: EspnPlayer[] = [];

    for (const group of data.athletes ?? []) {
        for (const p of group.items) {
            const injury = p.injuries?.[0];
            const rawStatus = injury?.status ?? p.status?.type ?? 'active';
            const injuryStatus = normalizeInjuryStatus(rawStatus);

            players.push({
                espnId:         p.id,
                fullName:       p.fullName,
                position:       p.position?.abbreviation ?? '',
                team:           teamAbbr,
                jerseyNumber:   p.jersey ? parseInt(p.jersey) : null,
                height:         p.displayHeight ?? null,
                weight:         p.displayWeight ? parseFloat(p.displayWeight) : null,
                age:            p.age ?? null,
                injuryStatus:   injuryStatus,
                injuryBodyPart: injury?.details?.location ?? null,
            });
        }
    }

    return players;
}

// ── All 32 rosters ─────────────────────────────────────────────────────────

export async function getAllEspnRosters(): Promise<EspnPlayer[]> {
    const teams = await getEspnTeams();
    const results = await Promise.all(
        teams.map(t => getEspnTeamRoster(t.slug, t.abbreviation))
    );
    return results.flat();
}

// ── Injury normalisation ───────────────────────────────────────────────────

function normalizeInjuryStatus(raw: string): string {
    const s = raw.toLowerCase();
    if (s.includes('questionable')) return 'Questionable';
    if (s.includes('doubtful'))     return 'Doubtful';
    if (s.includes('out'))          return 'Out';
    if (s.includes('ir') || s.includes('injured reserve')) return 'IR';
    if (s.includes('pup'))          return 'PUP';
    if (s.includes('suspended'))    return 'Suspended';
    return 'Active';
}
