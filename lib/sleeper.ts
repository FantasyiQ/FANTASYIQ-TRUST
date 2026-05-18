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
        type: number;                    // 0 = redraft, 2 = dynasty
        draft_rounds?: number;           // number of rounds in the rookie/startup draft
        playoff_teams?: number;
        playoff_week_start?: number;     // week number when playoffs begin
        playoff_round_type?: number;     // 0 = 1-week rounds, 1 = 2-week rounds
        trade_deadline?: number;
        commissioner_id?: string;        // Sleeper user_id of the league commissioner
    };
    scoring_settings: {
        rec?:              number;   // PPR value (0 / 0.5 / 1)
        pass_td?:          number;   // passing TD pts (4 or 6)
        bonus_rec_te?:     number;   // TE bonus per reception
        fum_lost?:         number;   // fumble penalty
        int?:              number;   // interception penalty
        rush_td?:          number;   // rushing TD pts
        rec_td?:           number;   // receiving TD pts
        bonus_pass_yd_300?: number;  // 300-yd passing bonus
        bonus_rush_yd_100?: number;  // 100-yd rushing bonus
        bonus_rec_yd_100?:  number;  // 100-yd receiving bonus
    };
    roster_positions: string[];
    previous_league_id?: string | null;
    draft_id?: string | null; // current season's draft ID; null on legacy leagues
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
    // Dynasty: picks this roster currently owns (authoritative — includes cross-season trades)
    draft_picks?: SleeperTradedPick[];
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

export type SafeSleeperLeague = SleeperLeague & {
    settings: NonNullable<SleeperLeague['settings']> & { draft_rounds: number };
    rosters:    SleeperRoster[];
    users:      SleeperLeagueMember[];
    drafts:     SleeperDraft[];
    isDrafting: boolean;
};

/**
 * Fetches league, rosters, users, and drafts in parallel and applies defensive fallbacks.
 * Guarantees: rosters is non-empty, users is an array, settings.draft_rounds is a number.
 * Sets isDrafting=true when any draft is currently in_progress (blackout protection).
 */
export async function getSafeSleeperLeague(leagueId: string): Promise<SafeSleeperLeague> {
    const [sleeperLeague, rosters, users, drafts] = await Promise.all([
        getLeague(leagueId),
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        getLeagueDrafts(leagueId),
    ]);

    const safeRosters: SleeperRoster[] =
        Array.isArray(rosters) && rosters.length > 0
            ? rosters
            : Array.from({ length: sleeperLeague.total_rosters ?? 12 }, (_, i) => ({
                  roster_id: i + 1, owner_id: null, players: null, starters: null,
                  settings: { wins: 0, losses: 0, fpts: 0 },
              }) as SleeperRoster);

    const safeUsers: SleeperLeagueMember[] = Array.isArray(users) ? users : [];
    const safeDrafts: SleeperDraft[]       = Array.isArray(drafts) ? drafts : [];
    const isDrafting                        = safeDrafts.some(d => d.status === 'drafting');

    const draftRounds = (sleeperLeague.settings?.draft_rounds && sleeperLeague.settings.draft_rounds > 0)
        ? sleeperLeague.settings.draft_rounds
        : 5;

    return {
        ...sleeperLeague,
        settings:   { ...(sleeperLeague.settings ?? {}), draft_rounds: draftRounds },
        rosters:    safeRosters,
        users:      safeUsers,
        drafts:     safeDrafts,
        isDrafting,
    };
}

export async function getLeagueMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
    return sleeperFetch<SleeperMatchup[]>(`/league/${leagueId}/matchups/${week}`, 0);
}

export interface SleeperDraft {
    draft_id:    string;
    league_id:   string;
    season:      string;
    status:      string; // pre_draft | drafting | complete
    type:        string; // linear | snake | auction
    start_time:  number | null; // epoch ms; null when not yet scheduled
    name?:       string | null; // e.g. "Startup Draft", "Rookie Draft"
    // user_id → 1-based draft position (1 = picks first).
    // null when the draft hasn't been configured yet.
    draft_order: Record<string, number> | null;
    settings: {
        rounds:     number;
        teams:      number;
        is_auction?: number; // 1 = auction, 0 = snake (not always present)
        type?:      string;  // "rookie" for rookie drafts (not always present)
    };
    metadata?: {
        type?:        string; // "rookie" for rookie drafts
        scoring_type?: string;
        name?:        string;
        [key: string]: string | undefined;
    } | null;
}

export async function getLeagueDrafts(leagueId: string): Promise<SleeperDraft[]> {
    return sleeperFetch<SleeperDraft[]>(`/league/${leagueId}/drafts`, 0);
}

/**
 * Determine the effective draft type to persist for a league.
 * Only two values are valid: 'rookie' and 'snake'.
 *
 * Dynasty rookie drafts: Sleeper reports type='linear' and sets
 * metadata.scoring_type to 'dynasty_*' (e.g. 'dynasty_ppr', 'dynasty_2qb').
 */
export function resolveDraftType(draft: SleeperDraft | null): string {
    if (!draft) return 'snake';

    const scoringType    = draft.metadata?.scoring_type ?? '';
    const isRookieDraft  =
        draft.metadata?.type === 'rookie'                       ||
        draft.settings?.type  === 'rookie'                      ||
        (draft.name?.toLowerCase().includes('rookie') === true) ||
        (draft.type === 'linear' && scoringType.startsWith('dynasty_'));

    return isRookieDraft ? 'rookie' : 'snake';
}

/**
 * Returns individual picks for a draft. Empty array when no picks have been made
 * (e.g. a placeholder future draft Sleeper auto-creates with status "complete").
 * Use this to guard against treating empty placeholder drafts as completed.
 */
export async function getDraftPickCount(draftId: string): Promise<number> {
    const picks = await sleeperFetch<unknown[]>(`/draft/${draftId}/picks`, 0);
    return Array.isArray(picks) ? picks.length : 0;
}

/**
 * Build a map of roster_id → draft slot (1-based pick number within each round).
 * Uses the draft's draft_order when available; falls back to standings rank
 * (worst record = slot 1) and marks the result as projected.
 *
 * Returns { slotMap, projected } where projected=true means no real draft order yet.
 */
export function buildRosterSlotMap(
    rosters: SleeperRoster[],
    draft:   SleeperDraft | null,
    standingsRank: Map<number, number>, // roster_id → rank (1=best)
    totalRosters:  number,
): { slotMap: Map<number, number>; projected: boolean } {
    const slotMap = new Map<number, number>();

    if (draft?.draft_order) {
        // draft_order: user_id → draft_position
        for (const roster of rosters) {
            if (!roster.owner_id) continue;
            const slot = draft.draft_order[roster.owner_id];
            if (slot != null) slotMap.set(roster.roster_id, slot);
        }
        // Fill in any roster without an owner (orphaned) using roster_id order
        for (const roster of rosters) {
            if (!slotMap.has(roster.roster_id)) {
                slotMap.set(roster.roster_id, roster.roster_id);
            }
        }
        return { slotMap, projected: false };
    }

    // Fallback: worst record → slot 1, best record → slot n
    for (const roster of rosters) {
        const rank = standingsRank.get(roster.roster_id) ?? roster.roster_id;
        slotMap.set(roster.roster_id, totalRosters - rank + 1);
    }
    return { slotMap, projected: true };
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

/**
 * Returns current pick ownership for the league — one record per pick with
 * owner_id already resolved to the current holder.  More reliable than
 * /traded_picks for ownership lookups because it gives authoritative state
 * rather than a log of trade events that must be chain-reconstructed.
 */
export async function getDraftPicks(leagueId: string): Promise<SleeperTradedPick[]> {
    return sleeperFetch<SleeperTradedPick[]>(`/league/${leagueId}/draft_picks`, 0);
}

// ─── Live draft picks ──────────────────────────────────────────────────────────

/** A single pick made during a live/completed Sleeper draft. */
export interface SleeperDraftPickEntry {
    player_id:  string;   // Sleeper player_id of the player selected
    picked_by:  string;   // user_id of the manager who made the pick
    roster_id:  number;   // roster that received the player
    round:      number;
    draft_slot: number;   // 1-based draft slot assigned to this team
    pick_no:    number;   // 1-based overall pick number
}

/** Returns all picks made so far in a specific draft. */
export async function getActiveDraftPicks(draftId: string): Promise<SleeperDraftPickEntry[]> {
    return sleeperFetch<SleeperDraftPickEntry[]>(`/draft/${draftId}/picks`, 0);
}

/** Fetch a single draft by its draft_id. */
export async function getSleeperDraft(draftId: string): Promise<SleeperDraft> {
    return sleeperFetch<SleeperDraft>(`/draft/${draftId}`);
}

// ─── Player cache ──────────────────────────────────────────────────────────────

export interface SlimPlayer {
    full_name: string;
    position: string;
    team: string;
    age?: number;
}

/**
 * Look up players by ID from the local DB (populated daily by /api/cron/sleeper-players).
 * Pass an array of IDs to fetch only what you need, or omit to get everything.
 */
export async function getPlayers(ids?: string[]): Promise<Record<string, SlimPlayer>> {
    try {
        const { prisma } = await import('./prisma');
        const rows = await prisma.sleeperPlayer.findMany(
            ids?.length ? { where: { playerId: { in: ids } } } : undefined
        );
        const result: Record<string, SlimPlayer> = {};
        for (const r of rows) {
            result[r.playerId] = { full_name: r.fullName, position: r.position, team: r.team, age: r.age ?? undefined };
        }
        return result;
    } catch {
        return {};
    }
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

export interface PickOwnerEntry {
    owner:          number;    // current owner roster_id
    slot?:          number;    // exact 1-based draft slot when draft_order is known for this season
    tier?:          PickTier;  // tier label when draft_order is unknown
    tierProjected?: boolean;   // true when all teams are 0-0 (no standings data yet)
}

/**
 * Builds a fully resolved pick map: `${season}-${round}-${origRosterId}` → PickOwnerEntry.
 * Covers every combination of future season × round × original roster.
 *
 * - Seasons with a matching draft that has draft_order set → exact slot numbers.
 * - All other seasons → tier labels (Early/Mid/Late) based on original owner's standings.
 *   If all teams are 0-0 (new league) every pick defaults to Mid and tierProjected=true.
 *
 * Ownership prefers roster.draft_picks when populated (authoritative for dynasty leagues);
 * otherwise reconstructs from traded_picks trade events.
 */
export function buildPickOwnerMap(
    rosters:          SleeperRoster[],
    tradedPicks:      SleeperTradedPick[],
    pickSeasons:      string[],
    drafts:           SleeperDraft[],
    draftRounds:      number,
    standingsRosters?: SleeperRoster[], // previous-season rosters for tier computation
): Map<string, PickOwnerEntry> {
    // Guard: Sleeper sometimes returns 0 or omits draft_rounds in the off-season.
    const safeRounds = (draftRounds && draftRounds > 0) ? draftRounds : 5;

    // Guard: Sleeper can return empty rosters during maintenance / league transition.
    // Synthesise placeholder rosters so pick enumeration doesn't silently produce nothing.
    const effectiveRosters = (rosters && rosters.length > 0)
        ? rosters
        : Array.from({ length: 12 }, (_, i) => ({
              roster_id: i + 1,
              owner_id:  null,
              players:   null,
              starters:  null,
              settings:  { wins: 0, losses: 0, fpts: 0 },
          }) as SleeperRoster);

    const rosterIds = effectiveRosters.map(r => r.roster_id);

    // ── Step 1: Raw ownership ─────────────────────────────────────────────────
    const ownerMap = new Map<string, number>();
    const anyHasDraftPicks = rosters.some(r => r.draft_picks && r.draft_picks.length > 0);
    if (anyHasDraftPicks) {
        for (const roster of rosters) {
            for (const dp of roster.draft_picks ?? []) {
                if (!pickSeasons.includes(dp.season)) continue;
                ownerMap.set(`${dp.season}-${Number(dp.round)}-${Number(dp.roster_id)}`, Number(roster.roster_id));
            }
        }
    } else {
        const groups = new Map<string, SleeperTradedPick[]>();
        for (const tp of tradedPicks) {
            const key = `${tp.season}-${Number(tp.round)}-${Number(tp.roster_id)}`;
            const g = groups.get(key) ?? [];
            g.push(tp);
            groups.set(key, g);
        }
        for (const [key, trades] of groups) {
            if (trades.length === 1) {
                ownerMap.set(key, Number(trades[0].owner_id));
            } else {
                const prevOwnerIds = new Set(trades.map(t => Number(t.previous_owner_id)));
                const terminal = trades.find(t => !prevOwnerIds.has(Number(t.owner_id)));
                ownerMap.set(key, Number(terminal?.owner_id ?? trades[trades.length - 1].owner_id));
            }
        }
    }

    // ── Step 2: Season → slotMap (draft_order known) ─────────────────────────
    const seasonSlotMap = new Map<string, Map<number, number>>();
    for (const draft of drafts) {
        if (!draft.draft_order || !pickSeasons.includes(draft.season)) continue;
        const slotMap = new Map<number, number>();
        for (const roster of rosters) {
            if (!roster.owner_id) continue;
            const slot = draft.draft_order[roster.owner_id];
            if (slot != null) slotMap.set(roster.roster_id, slot);
        }
        if (slotMap.size > 0) seasonSlotMap.set(draft.season, slotMap);
    }

    // ── Step 3: Tier map from standings ───────────────────────────────────────
    // Fallback chain:
    //   1. Current season standings exist (not all 0-0) → use them.
    //   2. Current season all 0-0 → use standingsRosters (previous season, matched by owner_id).
    //   3. No previous season data → default all to Mid + tierProjected = true.
    //
    // roster_ids CAN change between seasons; owner_id (user_id) is stable — match on that.
    const currentAllZero = rosters.every(
        r => (r.settings?.wins ?? 0) === 0 && (r.settings?.losses ?? 0) === 0
    );

    const tierSource: SleeperRoster[] = (() => {
        if (!currentAllZero) return rosters; // (1) current season has real data
        if (!standingsRosters || standingsRosters.length === 0) return rosters; // (3) fall to projected
        // (2) build synthetic rosters: current roster_id + previous season's settings
        const prevByOwner = new Map(
            standingsRosters.filter(r => r.owner_id != null).map(r => [r.owner_id!, r])
        );
        return rosters.map(r => {
            const prev = r.owner_id ? prevByOwner.get(r.owner_id) : undefined;
            if (!prev) return r; // expansion team / new owner → stays 0-0 → gets Mid
            return { ...r, settings: prev.settings }; // current roster_id, previous stats
        });
    })();

    const allZero = tierSource.every(r => (r.settings?.wins ?? 0) === 0 && (r.settings?.losses ?? 0) === 0);
    const tierMap  = buildPickTierMap(tierSource);
    // When standings are unknown, buildPickTierMap still distributes Early/Mid/Late by roster_id
    // order — this is a reasonable projected spread. Only set tierProjected=true to signal the UI.

    // ── Step 4: Enumerate every season × round × origId ──────────────────────
    const result  = new Map<string, PickOwnerEntry>();
    const rounds  = Array.from({ length: safeRounds }, (_, i) => i + 1);
    for (const season of pickSeasons) {
        const slotMap = seasonSlotMap.get(season);
        for (const round of rounds) {
            for (const origId of rosterIds) {
                const key   = `${season}-${round}-${origId}`;
                const owner = ownerMap.get(key) ?? origId;
                if (slotMap) {
                    const slot = slotMap.get(origId);
                    if (slot !== undefined) {
                        result.set(key, { owner, slot });
                    } else {
                        // Roster not in draft_order (vacant/expansion team) — fall back to tier
                        result.set(key, { owner, tier: tierMap.get(origId) ?? 'Mid', tierProjected: true });
                    }
                } else {
                    result.set(key, { owner, tier: tierMap.get(origId) ?? 'Mid', tierProjected: allZero });
                }
            }
        }
    }
    return result;
}

// ─── Draft pick tier helpers ───────────────────────────────────────────────────

export type PickTier = 'Early' | 'Mid' | 'Late';

/**
 * Maps roster_id → draft pick tier based on current-season win totals.
 * Bottom third (fewest wins) = Early, top third (most wins) = Late.
 * Used for seasons where draft_order has not been set yet.
 */
export function buildPickTierMap(rosters: SleeperRoster[]): Map<number, PickTier> {
    const n = rosters.length;
    if (n === 0) return new Map();

    const earlyEnd  = Math.ceil(n / 3);           // ranks 1..earlyEnd  → Early
    const lateStart = n - Math.floor(n / 3) + 1;  // ranks lateStart..n → Late

    // Sort ascending: fewest wins first = rank 1 = worst team = picks earliest
    const sorted = [...rosters].sort((a, b) => {
        const wDiff = (a.settings?.wins ?? 0) - (b.settings?.wins ?? 0);
        if (wDiff !== 0) return wDiff;
        const aFpts = (a.settings?.fpts ?? 0) + (a.settings?.fpts_decimal ?? 0) / 100;
        const bFpts = (b.settings?.fpts ?? 0) + (b.settings?.fpts_decimal ?? 0) / 100;
        return aFpts - bFpts;
    });

    const tierMap = new Map<number, PickTier>();
    sorted.forEach((roster, i) => {
        const rank = i + 1;
        const tier: PickTier = rank <= earlyEnd ? 'Early' : rank < lateStart ? 'Mid' : 'Late';
        tierMap.set(roster.roster_id, tier);
    });
    return tierMap;
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
