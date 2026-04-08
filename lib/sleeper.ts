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
        scoring_type?: string;
        playoff_teams?: number;
        trade_deadline?: number;
        num_teams?: number;
        roster_positions?: string[];
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
    metadata: {
        team_name?: string;
    };
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

export interface SleeperNflState {
    week: number;
    season: string;
    season_type: string; // pre | regular | post
    display_week: number;
}

async function sleeperFetch<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE}${path}`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`Sleeper API error ${res.status}: ${path}`);
    return res.json() as Promise<T>;
}

export async function getSleeperUser(username: string): Promise<SleeperUser> {
    return sleeperFetch<SleeperUser>(`/user/${encodeURIComponent(username)}`);
}

export async function getSleeperLeagues(userId: string, season: string): Promise<SleeperLeague[]> {
    return sleeperFetch<SleeperLeague[]>(`/user/${userId}/leagues/nfl/${season}`);
}

export async function getNflState(): Promise<SleeperNflState> {
    return sleeperFetch<SleeperNflState>('/state/nfl');
}

export async function getLeague(leagueId: string): Promise<SleeperLeague> {
    return sleeperFetch<SleeperLeague>(`/league/${leagueId}`);
}

export async function getLeagueUsers(leagueId: string): Promise<SleeperLeagueMember[]> {
    return sleeperFetch<SleeperLeagueMember[]>(`/league/${leagueId}/users`);
}

export async function getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
    return sleeperFetch<SleeperRoster[]>(`/league/${leagueId}/rosters`);
}

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

/** Summarise roster_positions into "1 QB, 2 RB, …, 6 BN" */
export function summariseRosterPositions(positions: string[]): string {
    const counts = new Map<string, number>();
    for (const pos of positions) {
        counts.set(pos, (counts.get(pos) ?? 0) + 1);
    }
    // Preferred display order
    const order = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'K', 'DEF', 'IDP_FLEX', 'BN', 'IR'];
    const parts: string[] = [];
    for (const pos of order) {
        const n = counts.get(pos);
        if (n) {
            const label = pos === 'SUPER_FLEX' ? 'SF' : pos === 'IDP_FLEX' ? 'IDP' : pos;
            parts.push(`${n} ${label}`);
            counts.delete(pos);
        }
    }
    // Remaining unknown positions
    for (const [pos, n] of counts) {
        parts.push(`${n} ${pos}`);
    }
    return parts.join(', ');
}
