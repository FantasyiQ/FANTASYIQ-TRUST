const BASE = 'https://api.sleeper.app/v1';

export interface SleeperUser {
    user_id: string;
    username: string;
    display_name: string;
    avatar: string | null;
}

export interface SleeperLeague {
    league_id: string;
    name: string;
    season: string;
    status: string; // pre_draft | drafting | in_season | complete
    total_rosters: number;
    avatar: string | null;
    settings: {
        type: number;           // 0 = redraft, 2 = dynasty
        playoff_teams?: number;
        trade_deadline?: number;
    };
    scoring_settings: {
        rec?: number;           // 0 = std, 0.5 = half_ppr, 1 = ppr
    };
    roster_positions: string[];
}

export interface SleeperLeagueMember {
    user_id: string;
    username: string;
    display_name: string;
    avatar: string | null;
    metadata: { team_name?: string };
    is_owner?: boolean;
}

export interface SleeperRoster {
    roster_id: number;
    owner_id: string | null;
    players: string[] | null;
    starters: string[] | null;
    settings: {
        wins: number;
        losses: number;
        ties?: number;
        fpts: number;
        fpts_decimal?: number;
        ppts?: number;
        ppts_decimal?: number;
    };
}

export interface SleeperMatchup {
    matchup_id: number | null; // null = bye week
    roster_id: number;
    points: number;
    custom_points: number | null;
    starters: string[];
    players: string[];
}

export interface SleeperNflState {
    week: number;
    season: string;
    season_type: string; // pre | regular | post
    display_week: number;
}

// revalidate=0 for cron routes (fresh), default 60s for pages
async function sleeperFetch<T>(path: string, revalidate = 60): Promise<T> {
    const res = await fetch(`${BASE}${path}`, { next: { revalidate } });
    if (!res.ok) throw new Error(`Sleeper API ${res.status}: ${path}`);
    return res.json() as Promise<T>;
}

export async function getSleeperUser(username: string): Promise<SleeperUser> {
    return sleeperFetch<SleeperUser>(`/user/${encodeURIComponent(username)}`);
}

export async function getSleeperLeagues(userId: string, season: string): Promise<SleeperLeague[]> {
    return sleeperFetch<SleeperLeague[]>(`/user/${userId}/leagues/nfl/${season}`, 0);
}

export async function getNflState(): Promise<SleeperNflState> {
    return sleeperFetch<SleeperNflState>('/state/nfl', 0);
}

export async function getLeague(leagueId: string): Promise<SleeperLeague> {
    return sleeperFetch<SleeperLeague>(`/league/${leagueId}`);
}

export async function getLeagueUsers(leagueId: string): Promise<SleeperLeagueMember[]> {
    return sleeperFetch<SleeperLeagueMember[]>(`/league/${leagueId}/users`);
}

export async function getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
    return sleeperFetch<SleeperRoster[]>(`/league/${leagueId}/rosters`, 0);
}

export async function getLeagueMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
    return sleeperFetch<SleeperMatchup[]>(`/league/${leagueId}/matchups/${week}`, 0);
}

export interface SleeperTradedPick {
    season:           string;
    round:            number;
    roster_id:        number;  // original team whose pick this is
    previous_owner_id: number;
    owner_id:         number;  // current owner
}

export async function getTradedPicks(leagueId: string): Promise<SleeperTradedPick[]> {
    return sleeperFetch<SleeperTradedPick[]>(`/league/${leagueId}/traded_picks`, 0);
}

// ─── Player cache ──────────────────────────────────────────────────────────────

export interface SlimPlayer {
    full_name: string;
    position: string;
    team: string;
}

/**
 * Look up players by ID from the local DB (populated daily by /api/cron/sleeper-players).
 * Pass an array of IDs to fetch only what you need, or omit to get everything.
 */
export async function getPlayers(ids?: string[]): Promise<Record<string, SlimPlayer>> {
    const { prisma } = await import('./prisma');
    const rows = await prisma.sleeperPlayer.findMany(
        ids?.length ? { where: { playerId: { in: ids } } } : undefined
    );
    const result: Record<string, SlimPlayer> = {};
    for (const r of rows) {
        result[r.playerId] = { full_name: r.fullName, position: r.position, team: r.team };
    }
    return result;
}

// ─── Derived helpers ───────────────────────────────────────────────────────────

export function deriveScoringType(league: SleeperLeague): string {
    const rec = league.scoring_settings?.rec ?? 0;
    if (rec === 1) return 'ppr';
    if (rec === 0.5) return 'half_ppr';
    return 'std';
}

export function scoringLabel(scoringType: string): string {
    switch (scoringType) {
        case 'ppr':      return 'PPR';
        case 'half_ppr': return 'Half PPR';
        default:         return 'Standard';
    }
}

export function summariseRosterPositions(positions: string[]): string {
    const counts = new Map<string, number>();
    for (const pos of positions) counts.set(pos, (counts.get(pos) ?? 0) + 1);
    const order = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'K', 'DEF', 'BN', 'IR'];
    const parts: string[] = [];
    for (const pos of order) {
        const n = counts.get(pos);
        if (n) {
            parts.push(`${n} ${pos === 'SUPER_FLEX' ? 'SF' : pos}`);
            counts.delete(pos);
        }
    }
    for (const [pos, n] of counts) parts.push(`${n} ${pos}`);
    return parts.join(', ');
}

/** Returns total fantasy points as a float */
export function rosterFpts(settings: SleeperRoster['settings']): number {
    return (settings?.fpts ?? 0) + (settings?.fpts_decimal ?? 0) / 100;
}

/** True if we should be polling live matchup scores right now (ET game windows) */
export function isGameWindow(): boolean {
    const etString = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etString);
    const day = et.getDay(); // 0=Sun 1=Mon 4=Thu
    const hour = et.getHours();
    const windows: Record<number, [number, number]> = {
        0: [12, 24], // Sunday noon–midnight
        1: [17, 24], // Monday 5pm–midnight
        4: [17, 24], // Thursday 5pm–midnight
    };
    const w = windows[day];
    return w ? hour >= w[0] && hour < w[1] : false;
}
