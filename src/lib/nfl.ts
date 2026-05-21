// FantasyiQ Trust — NFL Fantasy API client
// NFL Fantasy API v2 — cookie-based auth via `sid` session cookie.
// NOTE: The exact login endpoint behaviour depends on NFL.com's identity service
// and may need adjustment after testing against live traffic.

export const NFL_API_BASE = process.env.NFL_BASE_URL ?? 'https://api.fantasy.nfl.com/v2';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NFLLeague {
    id:          string;
    name:        string;
    season:      number | string;
    numTeams?:   number;
    teamCount?:  number;   // alternate field name
    scoringType?: string;
    draftStatus?: string;
    status?:     string;
}

export interface NFLLeagueNormalized {
    leagueId:    string;
    name:        string;
    season:      string;
    numTeams:    number;
    scoringType: string;
    status:      string;
    alreadySynced: boolean;
}

// ── HTTP helper ────────────────────────────────────────────────────────────────

export async function nflFetch(path: string, sid: string): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${NFL_API_BASE}${path}`;
    const res = await fetch(url, {
        headers: {
            Cookie: `sid=${sid}`,
            Accept: 'application/json',
        },
        cache: 'no-store',
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`NFL API ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
}

// ── Auth ───────────────────────────────────────────────────────────────────────

// Attempts to log in via NFL Fantasy API and return the `sid` session cookie.
// If the API returns a JSON token instead of a Set-Cookie, returns that value.
export async function nflLogin(email: string, password: string): Promise<string> {
    const res = await fetch(`${NFL_API_BASE}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`NFL login failed (${res.status}): ${text.slice(0, 200)}`);
    }

    // Strategy 1: sid in Set-Cookie header
    const rawCookies: string[] =
        typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
            ? ((res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie())
            : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/);

    const sidEntry = rawCookies.find(c => /(?:^|\s)sid=/i.test(c));
    if (sidEntry) {
        const match = sidEntry.match(/(?:^|\s)sid=([^;,\s]+)/i);
        if (match) return match[1];
    }

    // Strategy 2: token/sid in JSON body
    const body = await res.json() as Record<string, unknown>;
    const token = body.sid ?? body.token ?? body.sessionId ?? body.access_token;
    if (typeof token === 'string' && token.length > 0) return token;

    throw new Error('NFL login succeeded but no session token was returned. Try entering your sid cookie manually.');
}

// ── Leagues ────────────────────────────────────────────────────────────────────

export async function getNFLLeagues(sid: string): Promise<NFLLeague[]> {
    const data = await nflFetch('/users/me/leagues', sid) as { leagues?: NFLLeague[] };
    return data.leagues ?? [];
}

// ── Normalizers ────────────────────────────────────────────────────────────────

export function deriveNFLStatus(league: NFLLeague): string {
    const s = (league.status ?? league.draftStatus ?? '').toLowerCase();
    if (s.includes('pre') && s.includes('draft')) return 'pre_draft';
    if (s.includes('draft'))                      return 'drafting';
    if (s === 'in_season' || s.includes('season'))return 'in_season';
    if (s === 'complete' || s === 'post')         return 'complete';
    return 'pre_draft';
}

export function deriveNFLScoringType(league: NFLLeague): string {
    const s = (league.scoringType ?? '').toLowerCase();
    if (s.includes('half'))  return 'half_ppr';
    if (s.includes('ppr'))   return 'ppr';
    return 'std';
}

export function defaultNFLRosterPositions(): string[] {
    return ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'];
}
