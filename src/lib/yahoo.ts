// FantasyiQ Trust — Yahoo Fantasy Sports API client

export const YAHOO_AUTH_URL  = 'https://api.login.yahoo.com/oauth2/request_auth';
export const YAHOO_TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token';
export const YAHOO_API_BASE  = 'https://fantasysports.yahooapis.com/fantasy/v2';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface YahooLeague {
    leagueKey:   string;   // e.g. "431.l.123456" — used as leagueId in FiQ DB
    leagueId:    string;   // numeric ID portion e.g. "123456"
    name:        string;
    season:      string;
    numTeams:    number;
    draftStatus: string;   // "predraft" | "drafting" | "postdraft"
    currentWeek: number | null;
    scoringType: string;   // raw Yahoo value e.g. "head"
    isPublic:    boolean;
    gameKey:     string;   // e.g. "431"
}

export interface YahooTokenResponse {
    access_token:  string;
    refresh_token: string;
    expires_in:    number;
    token_type:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Yahoo API returns array-like objects: { "0": ..., "1": ..., count: N }
// This converts them to a real array.
function yahooObjToArray<T>(obj: Record<string, unknown>): T[] {
    const count = (obj['count'] as number) ?? 0;
    const result: T[] = [];
    for (let i = 0; i < count; i++) {
        result.push(obj[String(i)] as T);
    }
    return result;
}

function buildBasicAuth(): string {
    const clientId     = process.env.YAHOO_CLIENT_ID ?? '';
    const clientSecret = process.env.YAHOO_CLIENT_SECRET ?? '';
    return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

export async function yahooFetch(endpoint: string, accessToken: string): Promise<unknown> {
    const url = endpoint.startsWith('http')
        ? endpoint
        : `${YAHOO_API_BASE}/${endpoint}`;

    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept:        'application/json',
        },
        cache: 'no-store',
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Yahoo API error ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
}

// ── OAuth token exchange ──────────────────────────────────────────────────────

export async function exchangeYahooCode(code: string, redirectUri: string): Promise<YahooTokenResponse> {
    const res = await fetch(YAHOO_TOKEN_URL, {
        method: 'POST',
        headers: {
            Authorization:  `Basic ${buildBasicAuth()}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type:   'authorization_code',
            code,
            redirect_uri: redirectUri,
        }).toString(),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Yahoo token exchange failed: ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<YahooTokenResponse>;
}

// ── Token refresh ─────────────────────────────────────────────────────────────

export async function refreshYahooToken(refreshToken: string): Promise<YahooTokenResponse> {
    const res = await fetch(YAHOO_TOKEN_URL, {
        method: 'POST',
        headers: {
            Authorization:  `Basic ${buildBasicAuth()}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type:    'refresh_token',
            redirect_uri:  '', // required field by Yahoo even on refresh
            refresh_token: refreshToken,
        }).toString(),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Yahoo token refresh failed: ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<YahooTokenResponse>;
}

// ── User GUID ─────────────────────────────────────────────────────────────────

export async function getYahooGuid(accessToken: string): Promise<string> {
    const data = await yahooFetch('users;use_login=1?format=json', accessToken) as {
        fantasy_content: {
            users: Record<string, unknown>;
        };
    };

    const userEntry = data.fantasy_content.users['0'] as { user: unknown[] };
    const meta      = userEntry.user[0] as { guid: string };
    return meta.guid;
}

// ── League discovery ──────────────────────────────────────────────────────────

export async function getYahooLeagues(accessToken: string): Promise<YahooLeague[]> {
    const data = await yahooFetch(
        'users;use_login=1/games;game_codes=nfl/leagues?format=json',
        accessToken,
    ) as { fantasy_content: Record<string, unknown> };

    const fc        = data.fantasy_content;
    const users     = fc['users'] as Record<string, unknown>;
    const userEntry = users['0'] as { user: unknown[] };
    const userArr   = userEntry.user;

    // userArr[1] contains the games object
    const gamesContainer = userArr[1] as { games: Record<string, unknown> };
    const games          = gamesContainer.games;
    const gameCount      = (games['count'] as number) ?? 0;

    const leagues: YahooLeague[] = [];

    for (let gi = 0; gi < gameCount; gi++) {
        const gameEntry = games[String(gi)] as { game: unknown[] };
        const gameMeta  = gameEntry.game[0] as { game_key: string; season: string };
        const gameKey   = gameMeta.game_key;

        const leaguesContainer = (gameEntry.game[1] as { leagues?: Record<string, unknown> }).leagues;
        if (!leaguesContainer) continue;

        const leagueCount = (leaguesContainer['count'] as number) ?? 0;
        for (let li = 0; li < leagueCount; li++) {
            const leagueEntry = leaguesContainer[String(li)] as { league: Record<string, unknown>[] };
            const lm          = leagueEntry.league[0];

            leagues.push({
                leagueKey:   lm['league_key']   as string,
                leagueId:    lm['league_id']     as string,
                name:        lm['name']          as string,
                season:      lm['season']        as string,
                numTeams:    lm['num_teams']     as number,
                draftStatus: lm['draft_status']  as string,
                currentWeek: (lm['current_week'] as number | null) ?? null,
                scoringType: lm['scoring_type']  as string,
                isPublic:    lm['is_public_private'] === 'public',
                gameKey,
            });
        }
    }

    // Sort most-recent season first
    leagues.sort((a, b) => parseInt(b.season) - parseInt(a.season));
    return leagues;
}

// ── Derived fields ────────────────────────────────────────────────────────────

export function deriveYahooStatus(league: YahooLeague): string {
    switch (league.draftStatus) {
        case 'predraft': return 'pre_draft';
        case 'drafting': return 'drafting';
        case 'postdraft':
            if (league.currentWeek && league.currentWeek > 17) return 'complete';
            return 'in_season';
        default: return 'pre_draft';
    }
}

// Yahoo doesn't expose PPR/Standard directly in the leagues list endpoint.
// Full scoring type requires a separate /league/{key}/settings call.
// Default to 'std' for Phase 1; the Yahoo cron will update it.
export function deriveYahooScoringType(_league: YahooLeague): 'ppr' | 'half_ppr' | 'std' {
    return 'std';
}

// Basic roster position defaults for Yahoo leagues (refined by cron later)
export function defaultYahooRosterPositions(league: YahooLeague): string[] {
    const base = ['QB', 'WR', 'WR', 'RB', 'RB', 'TE', 'W/R/T', 'K', 'DEF',
                  'BN', 'BN', 'BN', 'BN', 'BN', 'BN'];
    return league.numTeams >= 14 ? [...base, 'BN', 'BN'] : base;
}
