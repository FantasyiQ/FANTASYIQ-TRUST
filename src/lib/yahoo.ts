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

// Basic roster position defaults for Yahoo leagues (used only until the
// first real settings fetch — getYahooLeagueSettings — lands via sync/cron)
export function defaultYahooRosterPositions(league: YahooLeague): string[] {
    const base = ['QB', 'WR', 'WR', 'RB', 'RB', 'TE', 'W/R/T', 'K', 'DEF',
                  'BN', 'BN', 'BN', 'BN', 'BN', 'BN'];
    return league.numTeams >= 14 ? [...base, 'BN', 'BN'] : base;
}

// ── Standings ─────────────────────────────────────────────────────────────────

export interface YahooTeamStanding {
    teamKey:       string;
    teamId:        string;
    name:          string;
    ownerName:     string | null;
    wins:          number;
    losses:        number;
    ties:          number;
    pointsFor:     number;
    pointsAgainst: number;
    rank:          number;
}

export async function getYahooStandings(leagueKey: string, accessToken: string): Promise<YahooTeamStanding[]> {
    const data = await yahooFetch(`league/${leagueKey}/standings?format=json`, accessToken) as {
        fantasy_content: { league: unknown[] };
    };

    const standingsHolder = data.fantasy_content.league[1] as { standings?: unknown[] } | undefined;
    const teamsContainer  = (standingsHolder?.standings?.[0] as { teams?: Record<string, unknown> } | undefined)?.teams;
    if (!teamsContainer) return [];

    const teamCount = (teamsContainer['count'] as number) ?? 0;
    const result: YahooTeamStanding[] = [];

    for (let i = 0; i < teamCount; i++) {
        const teamEntry = teamsContainer[String(i)] as { team: unknown[] } | undefined;
        if (!teamEntry) continue;

        const meta = teamEntry.team[0] as {
            team_key: string;
            team_id:  string;
            name:     string;
            managers?: { manager: { nickname?: string } | { nickname?: string }[] };
        };
        const standingsBlock = (teamEntry.team[1] as {
            team_standings?: {
                rank?:            number | string;
                outcome_totals?:  { wins?: number | string; losses?: number | string; ties?: number | string };
                points_for?:      number | string;
                points_against?:  number | string;
            };
        } | undefined)?.team_standings ?? {};

        const managerEntry = Array.isArray(meta.managers?.manager)
            ? meta.managers?.manager[0]
            : meta.managers?.manager;

        result.push({
            teamKey:       meta.team_key,
            teamId:        meta.team_id,
            name:          meta.name,
            ownerName:     managerEntry?.nickname ?? null,
            wins:          Number(standingsBlock.outcome_totals?.wins ?? 0),
            losses:        Number(standingsBlock.outcome_totals?.losses ?? 0),
            ties:          Number(standingsBlock.outcome_totals?.ties ?? 0),
            pointsFor:     Number(standingsBlock.points_for ?? 0),
            pointsAgainst: Number(standingsBlock.points_against ?? 0),
            rank:          Number(standingsBlock.rank ?? 0),
        });
    }

    return result;
}

// ── League settings (real roster positions + PPR/standard scoring) ────────────

export interface YahooLeagueSettings {
    rosterPositions: string[];
    scoringType:     'ppr' | 'half_ppr' | 'std';
}

// Yahoo's own position codes map fairly directly onto FiQ's vocabulary —
// the flex slot is the one real divergence ("W/R/T" etc. rather than "FLEX").
const YAHOO_POSITION_MAP: Record<string, string> = {
    QB: 'QB', WR: 'WR', RB: 'RB', TE: 'TE', K: 'K', DEF: 'DEF',
    DL: 'DL', LB: 'LB', DB: 'DB', DP: 'DP',
    'W/R/T': 'FLEX', 'W/R': 'FLEX', 'W/T': 'FLEX', 'Q/W/R/T': 'FLEX', 'R/W': 'FLEX', 'R/T': 'FLEX',
    BN: 'BN', IR: 'IR',
};

export async function getYahooLeagueSettings(leagueKey: string, accessToken: string): Promise<YahooLeagueSettings> {
    const data = await yahooFetch(`league/${leagueKey}/settings?format=json`, accessToken) as {
        fantasy_content: { league: unknown[] };
    };

    const settingsHolder = data.fantasy_content.league[1] as { settings?: unknown[] } | undefined;
    const settings = settingsHolder?.settings?.[0] as {
        roster_positions?: { roster_position: { position: string; count: number | string } | { position: string; count: number | string }[] };
        stat_categories?:  { stats: { stat: { stat_id: number; name: string }[] } };
        stat_modifiers?:   { stats: { stat: { stat_id: number; value: number | string }[] } };
    } | undefined;

    const rosterPositions: string[] = [];
    const rawPositions = settings?.roster_positions?.roster_position;
    const positionList = rawPositions ? (Array.isArray(rawPositions) ? rawPositions : [rawPositions]) : [];
    for (const p of positionList) {
        const label = YAHOO_POSITION_MAP[p.position] ?? p.position;
        const count = Number(p.count ?? 0);
        for (let i = 0; i < count; i++) rosterPositions.push(label);
    }

    // Yahoo doesn't expose a top-level "is this PPR" flag — it's derived from
    // the scoring modifier on the Reception stat itself (0 = std, 0.5 = half
    // PPR, 1+ = full PPR), same signal ESPN exposes via statId 53.
    const statCategories = settings?.stat_categories?.stats?.stat ?? [];
    const statModifiers  = settings?.stat_modifiers?.stats?.stat ?? [];
    const receptionStat  = statCategories.find(s => /reception/i.test(s.name));
    const receptionMod   = receptionStat
        ? statModifiers.find(m => m.stat_id === receptionStat.stat_id)
        : undefined;
    const recValue = Number(receptionMod?.value ?? 0);

    const scoringType: YahooLeagueSettings['scoringType'] =
        recValue >= 1 ? 'ppr' : recValue > 0 ? 'half_ppr' : 'std';

    return { rosterPositions, scoringType };
}

// ── Combined full sync ──────────────────────────────────────────────────────────

export interface YahooFullSync {
    standings: YahooTeamStanding[];
    settings:  YahooLeagueSettings;
}

export async function getYahooFullSync(leagueKey: string, accessToken: string): Promise<YahooFullSync> {
    const [standings, settings] = await Promise.all([
        getYahooStandings(leagueKey, accessToken),
        getYahooLeagueSettings(leagueKey, accessToken),
    ]);
    return { standings, settings };
}

/**
 * The core real-data fields every Yahoo league sync path must write. Same
 * rationale as buildCoreEspnLeagueFields/buildCoreSleeperLeagueFields —
 * never hand-roll scoringType/rosterPositions/standings inline again.
 */
export function buildCoreYahooLeagueFields(full: YahooFullSync) {
    return {
        scoringType:     full.settings.scoringType,
        rosterPositions: full.settings.rosterPositions,
        standings:       full.standings.map(t => ({
            teamId:        t.teamKey,
            name:          t.name,
            ownerName:     t.ownerName,
            wins:          t.wins,
            losses:        t.losses,
            ties:          t.ties,
            fpts:          t.pointsFor,
            fptsAgainst:   t.pointsAgainst,
            rank:          t.rank,
        })),
    };
}
