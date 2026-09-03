import https from 'https';

const BASE_HOST = 'lm-api-reads.fantasy.espn.com';
const BASE_PATH = '/apis/v3/games/ffl';

// ─── Raw ESPN types ────────────────────────────────────────────────────────────

export interface EspnLeagueSettings {
    id: number;
    seasonId: number;
    scoringPeriodId: number;
    status: {
        currentMatchupPeriod: number;
        isActive: boolean;
        latestScoringPeriod: number;
    };
    settings: {
        name: string;
        size: number;
        scoringSettings: {
            // pointsOverrides keys are ESPN lineup slot IDs — "16" is D/ST.
            // Many defensive stat categories (sacks, INTs, points/yards
            // allowed) carry points:0 with the real value only in the D/ST
            // override, since the same statId definition is shared across
            // positions but only scores for defense.
            scoringItems: Array<{ statId: number; points: number; pointsOverrides?: Record<string, number> }>;
        };
        rosterSettings: {
            lineupSlotCounts: Record<string, number>;
        };
        scheduleSettings: {
            playoffTeamCount: number;
            matchupPeriodCount: number;
        };
    };
    teams?: EspnTeam[];
    members?: EspnMember[];
    schedule?: EspnScheduleEntry[];
    draftDetail?: {
        drafted?:    boolean;
        inProgress?: boolean;
    };
}

export interface EspnTeam {
    id: number;
    location: string;
    nickname: string;
    abbrev: string;
    record: {
        overall: {
            wins: number;
            losses: number;
            ties: number;
            pointsFor: number;
            pointsAgainst: number;
        };
    };
    owners: string[]; // SWID strings
    roster?: {
        entries: EspnRosterEntry[];
    };
}

export interface EspnRosterEntry {
    playerId: number;
    lineupSlotId: number;
    playerPoolEntry: {
        acquisitionType: string;
        player: {
            fullName: string;
            defaultPositionId: number;
            proTeamId: number;
            injured?: boolean;
            injuryStatus?: string;
        };
    };
}

export interface EspnMember {
    id: string; // SWID
    displayName: string;
    firstName?: string;
    lastName?: string;
}

export interface EspnScheduleEntry {
    id: number;
    matchupPeriodId: number;
    home: { teamId: number; totalPoints: number; pointsByScoringPeriod?: Record<string, number> };
    away?: { teamId: number; totalPoints: number; pointsByScoringPeriod?: Record<string, number> };
    winner?: 'HOME' | 'AWAY' | 'UNDECIDED' | 'TIE';
    playoffTierType?: string;
}

export interface EspnTeamResponse {
    id: number;
    seasonId: number;
    teams: EspnTeam[];
    members: EspnMember[];
    settings: { name: string; size: number };
}

// ─── Normalized internal model ─────────────────────────────────────────────────

export interface EspnNormalizedPlayer {
    playerId: number;
    fullName: string;
    position: string;       // QB, RB, WR, TE, K, DEF
    lineupSlot: string;     // BN, IR, QB, FLEX, etc.
    proTeamId: number;
    injured: boolean;
    injuryStatus: string;
    acquisitionType: string;
}

export interface EspnNormalizedTeam {
    teamId: number;
    name: string;
    abbrev: string;
    ownerId: string | null;
    ownerName: string | null;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    pointsAgainst: number;
    roster: EspnNormalizedPlayer[];
}

// ─── Transaction types ─────────────────────────────────────────────────────────

export type EspnTransactionType = 'TRADE_ACCEPT' | 'WAIVER' | 'FREEAGENT' | 'ADD' | 'DROP' | string;

export interface EspnTransactionItem {
    playerId:   number;
    playerName: string;
    type:       'ADD' | 'DROP' | string;
    fromTeamId: number;
    toTeamId:   number;
}

export interface EspnTransaction {
    id:            string;
    type:          EspnTransactionType;
    date:          number; // epoch ms
    teamId:        number;
    items:         EspnTransactionItem[];
}

export interface EspnNormalizedMatchup {
    week: number;
    homeTeamId: number;
    homeScore: number;
    awayTeamId: number | null;
    awayScore: number;
    winner: 'home' | 'away' | 'tie' | null;
    isPlayoff: boolean;
}

export interface EspnNormalizedLeague {
    leagueId: string;
    leagueName: string;
    season: number;
    status: string;
    currentWeek: number;
    totalTeams: number;
    scoringType: string;
    rosterPositions: string[];
    teams: EspnNormalizedTeam[];
    matchups: EspnNormalizedMatchup[];
}

// ─── Fetch helper ──────────────────────────────────────────────────────────────
// Uses Node.js https directly to bypass the Fetch spec's forbidden-header
// restriction which silently strips the Cookie header in some runtimes.

function espnFetch<T>(path: string, espnS2: string, swid: string, extraHeaders?: Record<string, string>): Promise<T> {
    const decodedS2 = espnS2.includes('%') ? decodeURIComponent(espnS2) : espnS2;

    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname: BASE_HOST,
                path:     `${BASE_PATH}${path}`,
                method:   'GET',
                headers: {
                    Cookie:       `espn_s2=${decodedS2}; SWID=${swid};`,
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    Accept:       'application/json',
                    Referer:      'https://fantasy.espn.com/',
                    ...extraHeaders,
                },
            },
            (res) => {
                let data = '';
                res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
                res.on('end', () => {
                    if (data.trim() === 'Redirecting') {
                        reject(new Error('ESPN credentials invalid or expired. Please refresh your espn_s2 and SWID cookies.'));
                        return;
                    }
                    if ((res.statusCode ?? 0) >= 400) {
                        reject(new Error(`ESPN API ${res.statusCode}: ${path}`));
                        return;
                    }
                    try {
                        resolve(JSON.parse(data) as T);
                    } catch {
                        reject(new Error(`ESPN API returned unexpected response: ${data.slice(0, 120)}`));
                    }
                });
            },
        );
        req.on('error', reject);
        req.end();
    });
}

// ─── Retry wrapper ─────────────────────────────────────────────────────────────

async function withRetry<T>(
    fn: () => Promise<T>,
    retries = 3,
    delayMs = 800,
): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            // Don't retry auth errors — credentials are just bad
            if (err instanceof Error && err.message.includes('credentials')) throw err;
            if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs * Math.pow(2, i)));
        }
    }
    throw lastErr;
}

// ─── Season detection ──────────────────────────────────────────────────────────

export async function detectEspnSeason(leagueId: string, espnS2: string, swid: string): Promise<number> {
    const currentYear = new Date().getFullYear();
    for (const season of [currentYear, currentYear - 1, currentYear - 2]) {
        try {
            const data = await espnFetch<EspnLeagueSettings>(
                `/seasons/${season}/segments/0/leagues/${leagueId}?view=mSettings`,
                espnS2,
                swid,
            );
            if (data?.settings?.name) return season;
        } catch (err) {
            if (err instanceof Error && err.message.includes('credentials')) throw err;
        }
    }
    throw new Error('Could not detect ESPN season — double-check your League ID.');
}

// ─── API functions ─────────────────────────────────────────────────────────────

export async function getEspnLeagueSettings(
    leagueId: string, season: number, espnS2: string, swid: string,
): Promise<EspnLeagueSettings> {
    return withRetry(() => espnFetch<EspnLeagueSettings>(
        `/seasons/${season}/segments/0/leagues/${leagueId}?view=mSettings`,
        espnS2, swid,
    ));
}

export async function getEspnTeams(
    leagueId: string, season: number, espnS2: string, swid: string,
): Promise<EspnTeamResponse> {
    return withRetry(() => espnFetch<EspnTeamResponse>(
        `/seasons/${season}/segments/0/leagues/${leagueId}?view=mTeam`,
        espnS2, swid,
    ));
}

/** Fetches teams + rosters in a single ESPN request */
export async function getEspnRosters(
    leagueId: string, season: number, espnS2: string, swid: string,
): Promise<EspnLeagueSettings> {
    return withRetry(() => espnFetch<EspnLeagueSettings>(
        `/seasons/${season}/segments/0/leagues/${leagueId}?view=mTeam&view=mRoster`,
        espnS2, swid,
    ));
}

/** Fetches all matchups for a given scoring period (week) */
export async function getEspnMatchups(
    leagueId: string, season: number, week: number, espnS2: string, swid: string,
): Promise<EspnLeagueSettings> {
    return withRetry(() => espnFetch<EspnLeagueSettings>(
        `/seasons/${season}/segments/0/leagues/${leagueId}?view=mMatchup&view=mMatchupScore&scoringPeriodId=${week}`,
        espnS2, swid,
    ));
}

/**
 * Single call that fetches settings + teams + rosters + current week matchups.
 * Minimizes round-trips by combining ESPN views.
 */
export async function getEspnFullSync(
    leagueId: string, season: number, espnS2: string, swid: string,
): Promise<EspnLeagueSettings> {
    return withRetry(() => espnFetch<EspnLeagueSettings>(
        `/seasons/${season}/segments/0/leagues/${leagueId}?view=mSettings&view=mTeam&view=mRoster&view=mMatchup&view=mMatchupScore&view=mDraftDetail`,
        espnS2, swid,
    ));
}

// ─── Normalizers ───────────────────────────────────────────────────────────────

const SLOT_MAP: Record<number, string> = {
    0: 'QB', 2: 'RB', 4: 'WR', 6: 'TE',
    16: 'DEF', 17: 'K', 20: 'BN', 21: 'IR',
    23: 'FLEX', 24: 'SUPER_FLEX',
};

const POSITION_MAP: Record<number, string> = {
    1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF',
};

export function normalizeEspnLeague(raw: EspnLeagueSettings, leagueId: string): EspnNormalizedLeague {
    // Build SWID → displayName map from members array
    const memberMap = new Map<string, string>();
    for (const m of (raw.members ?? [])) {
        if (m.id && m.displayName) memberMap.set(m.id, m.displayName);
    }

    const teams = (raw.teams ?? []).map((t): EspnNormalizedTeam => {
        const ownerId   = t.owners?.[0] ?? null;
        const ownerName = ownerId ? (memberMap.get(ownerId) ?? null) : null;
        // ESPN leaves location+nickname both blank whenever an owner never
        // customized their team name (common, not an edge case — verified
        // live: an entire real 10-team league had every team come back
        // empty) — falling straight through to '' broke the dues "which
        // team are you?" picker (every slot rendered blank). Real owner
        // display name is a far better fallback than a raw team ID.
        const rawName   = `${t.location ?? ''} ${t.nickname ?? ''}`.trim();
        return {
        teamId:    t.id,
        name:      rawName || ownerName || `Team ${t.id}`,
        abbrev:    t.abbrev ?? '',
        ownerId,
        ownerName,
        wins:         t.record?.overall?.wins ?? 0,
        losses:       t.record?.overall?.losses ?? 0,
        ties:         t.record?.overall?.ties ?? 0,
        pointsFor:    t.record?.overall?.pointsFor ?? 0,
        pointsAgainst: t.record?.overall?.pointsAgainst ?? 0,
        roster: (t.roster?.entries ?? []).map((e): EspnNormalizedPlayer => ({
            playerId:        e.playerId,
            fullName:        e.playerPoolEntry?.player?.fullName ?? 'Unknown',
            position:        POSITION_MAP[e.playerPoolEntry?.player?.defaultPositionId] ?? 'N/A',
            lineupSlot:      SLOT_MAP[e.lineupSlotId] ?? String(e.lineupSlotId),
            proTeamId:       e.playerPoolEntry?.player?.proTeamId ?? 0,
            injured:         e.playerPoolEntry?.player?.injured ?? false,
            injuryStatus:    e.playerPoolEntry?.player?.injuryStatus ?? '',
            acquisitionType: e.playerPoolEntry?.acquisitionType ?? '',
        })),
        };
    });

    const matchups = (raw.schedule ?? []).map((s): EspnNormalizedMatchup => ({
        week:        s.matchupPeriodId,
        homeTeamId:  s.home?.teamId,
        homeScore:   s.home?.totalPoints ?? 0,
        awayTeamId:  s.away?.teamId ?? null,
        awayScore:   s.away?.totalPoints ?? 0,
        winner:      s.winner === 'HOME' ? 'home'
                   : s.winner === 'AWAY' ? 'away'
                   : s.winner === 'TIE'  ? 'tie'
                   : null,
        isPlayoff:   !!s.playoffTierType && s.playoffTierType !== 'NONE',
    }));

    return {
        leagueId,
        leagueName:      raw.settings?.name ?? '',
        season:          raw.seasonId,
        status:          deriveEspnStatus(raw),
        currentWeek:     raw.status?.currentMatchupPeriod ?? 0,
        totalTeams:      raw.settings?.size ?? teams.length,
        scoringType:     deriveEspnScoringType(raw.settings),
        rosterPositions: deriveEspnRosterPositions(raw.settings),
        teams,
        matchups,
    };
}

// ─── Derived helpers ───────────────────────────────────────────────────────────

export function deriveEspnScoringType(settings: EspnLeagueSettings['settings']): string {
    const items = settings?.scoringSettings?.scoringItems ?? [];
    const rec   = items.find(i => i.statId === 53);
    if (!rec || rec.points === 0) return 'std';
    if (rec.points >= 1) return 'ppr';
    return 'half_ppr';
}

// ESPN statId -> our canonical (Sleeper-vocabulary) scoring key, so the same
// generic computeRealPoints() dot-product works for ESPN leagues too. Built
// and verified 2026-08-14 against real scoringItems from 3 live ESPN leagues,
// cross-checked against each league's own human-readable Scoring settings
// page (exact point values, not guessed). D/ST-only stats read from
// pointsOverrides['16'] (ESPN's D/ST lineup slot) when the base `points` is 0.
//
// CONFIDENCE: offense (passing/rushing/receiving) is exact — numerically
// verified against the readable label list with zero ambiguity. D/ST and
// kicking are verified for categories with a unique point value; a few ESPN
// categories share an identical point value with no other distinguishing
// signal available from the API (e.g. "Blocked Punt/PAT/FG" vs "Each Safety"
// are both worth 2 in a league that scores them the same) — those are marked
// below and best-effort, not guaranteed to the exact sub-category.
const ESPN_STAT_MAP: Record<number, string> = {
    // Passing — exact, numerically confirmed
    3:  'pass_yd',
    4:  'pass_td',
    19: 'pass_2pt',
    20: 'pass_int',
    // Rushing — exact
    24: 'rush_yd',
    25: 'rush_td',
    26: 'rush_2pt',
    // Receiving — exact
    42: 'rec_yd',
    43: 'rec_td',
    44: 'rec_2pt',
    53: 'rec',
    // Fumbles — exact ("Total Fumbles Lost" matches -2 precisely)
    72: 'fum_lost',
    // Defense — exact (flat, non-position-scoped values with a unique point
    // value matching exactly one labeled category)
    209: 'sack',        // "Each Sack": 1
    206: 'int',         // "Each Interception" (defensive): 2
    // Defense — best-effort: TD-type bonuses. ESPN itemizes 5 distinct return/
    // recovery TD types (kickoff, punt, INT, fumble, blocked-kick-return),
    // all worth the same 6 points in every league observed so far (verified:
    // every statId below carries exactly 6, matching the labeled TD list —
    // 201/198 are excluded here despite being TD-adjacent since they're
    // actually the FG50/FG60 kicking stats at a coincidental different value,
    // handled separately below). Bucketed to a single canonical key since
    // Sleeper's real per-team stat blob tracks an aggregate defensive-TD
    // count under this key.
    93: 'def_td', 101: 'def_td', 102: 'def_td', 103: 'def_td', 104: 'def_td', 63: 'def_td',
    // Genuinely ambiguous: 95/96/97/98 all carry the same D/ST-override
    // value (2) and correspond to 4 distinct labeled categories (Blocked
    // Punt/PAT/FG, Fumble Recovered, Safety, 2pt Return) with no further
    // signal available to tell them apart. Only mapping the one most
    // impactful/common (fumble recovery) rather than guess all four —
    // deliberately leaving 96/97/98 out entirely rather than risk
    // misattributing a rare event to the wrong stat.
    95: 'fum_rec',
    // Points allowed tiers — statIds 89-92 form one clean sequential family
    // whose D/ST-override values (5,4,3,1) exactly match the labeled tier
    // list (PA0=5, PA1=4, PA7=3, PA14=1) with no remaining ties inside the
    // family, once yards-allowed (a separate 128-130 family, below) is split
    // out. Verified against the real Scoring settings page, not guessed.
    89:  'pts_allow_0',
    90:  'pts_allow_1_6',
    91:  'pts_allow_7_13',
    92:  'pts_allow_14_20',
    // Higher-points-allowed penalty tiers only appear in leagues that
    // actually penalize them (not present in every league's scoringItems).
    123: 'pts_allow_28_34',
    132: 'pts_allow_28_34',
    124: 'pts_allow_35p',
    133: 'pts_allow_35p',
    // Yards allowed tiers — separate sequential family (128-130), matches
    // the labeled tier list (<100yd=5, 100-199=3, 200-299=2) with no
    // remaining ties.
    128: 'yds_allow_0_99',
    129: 'yds_allow_100_199',
    130: 'yds_allow_200_299',
    135: 'yds_allow_300_349',
    136: 'yds_allow_350_399',
    // Kicking — exact where the label list gives a unique value; FG buckets
    // are coarser in ESPN (e.g. "0-39 yards" as one bucket) than Sleeper's
    // finer tiers, so one ESPN category maps to several Sleeper keys at the
    // same point value — mathematically correct: paying 3pts for a 25-yard
    // and a 35-yard FG alike is exactly what "0-39yd = 3pts" means.
    86: 'xpm',                                                    // "Each PAT Made": 1
    85: 'xpmiss',                                                  // "Each PAT Missed": -1 (tied with FG Missed; both -1)
    88: 'fgmiss',                                                  // "Total FG Missed": -1
    80: 'fgm_0_19',                                                // "FG Made 0-39yd": 3 — also apply to 20-29/30-39
    77: 'fgm_40_49',                                               // "FG Made 40-49yd": 4
    // FG 50-59 / 60+ both worth 5 in this league — no distinguishing signal
    // available; mapped to Sleeper's fgm_50p bucket which covers 50+ anyway.
};

// Duplicate-target entries above are intentional (one ESPN coarse bucket
// pays the same rate as several Sleeper fine-grained buckets) — build the
// FG 0-39 spread and the 50+ alias explicitly since object literals can't
// repeat a key.
const ESPN_FG_0_39_ALIASES = ['fgm_0_19', 'fgm_20_29', 'fgm_30_39'];

export function translateEspnScoring(settings: EspnLeagueSettings['settings']): Record<string, number> {
    const items = settings?.scoringSettings?.scoringItems ?? [];
    const result: Record<string, number> = {};

    for (const item of items) {
        const key = ESPN_STAT_MAP[item.statId];
        if (!key) continue;
        // D/ST-scoped stats carry their real value in pointsOverrides['16'];
        // everything else uses the flat points value.
        const value = item.points !== 0 ? item.points : (item.pointsOverrides?.['16'] ?? item.points);
        if (value === 0) continue;

        if (key === 'fgm_0_19') {
            for (const alias of ESPN_FG_0_39_ALIASES) result[alias] = value;
        } else {
            result[key] = value;
        }
    }

    // FG 50-59 and 60+ share one ESPN category in every league observed —
    // both fold into Sleeper's fgm_50p (50+) bucket at whichever point value
    // is higher, so a real 50+ make is never undercounted.
    const fg50 = items.find(i => i.statId === 201)?.points;
    const fg60 = items.find(i => i.statId === 198)?.points;
    const fgm50p = Math.max(fg50 ?? 0, fg60 ?? 0);
    if (fgm50p > 0) result.fgm_50p = fgm50p;

    return result;
}

export function deriveEspnRosterPositions(settings: EspnLeagueSettings['settings']): string[] {
    const counts    = settings?.rosterSettings?.lineupSlotCounts ?? {};
    const positions: string[] = [];
    for (const [slotId, count] of Object.entries(counts)) {
        const label = SLOT_MAP[Number(slotId)];
        if (label && count > 0) {
            for (let i = 0; i < count; i++) positions.push(label);
        }
    }
    return positions;
}

// Mirrors Sleeper's draftStatus values ('pre_draft' | 'drafting' | 'complete')
// so the shared League Phase Engine (src/lib/leaguePhase.ts) works the same
// way for both platforms — it was previously ESPN-blind (this field was only
// ever written by Sleeper sync paths), which forced every ESPN league into
// PRE_DRAFT phase permanently, regardless of actual season progress.
export function deriveEspnDraftStatus(espn: EspnLeagueSettings): string {
    if (espn.draftDetail?.drafted)    return 'complete';
    if (espn.draftDetail?.inProgress) return 'drafting';
    return 'pre_draft';
}

export function deriveEspnStatus(espn: EspnLeagueSettings): string {
    if (espn.status?.isActive) return 'in_season';
    if (espn.scoringPeriodId === 0) return 'pre_draft';
    return 'complete';
}

/**
 * The core real-data fields every ESPN league sync path must write. Same
 * rationale as buildCoreSleeperLeagueFields (lib/sleeper.ts) — never
 * hand-roll scoringSettings/rosterPositions/scoringType/status inline
 * again; reach for this instead so a new sync path can't quietly omit one.
 */
export function buildCoreEspnLeagueFields(espn: EspnLeagueSettings) {
    return {
        scoringSettings: translateEspnScoring(espn.settings),
        rosterPositions: deriveEspnRosterPositions(espn.settings),
        scoringType:     deriveEspnScoringType(espn.settings),
        status:          deriveEspnStatus(espn),
        draftStatus:     deriveEspnDraftStatus(espn),
    };
}

export function buildEspnStandings(teams: EspnTeam[]): Array<{
    teamId: number; abbrev: string; name: string;
    wins: number; losses: number; ties: number;
    fpts: number; fptsAgainst: number; ownerId: string | null;
}> {
    return [...teams]
        .sort((a, b) => {
            const wDiff = (b.record?.overall?.wins ?? 0) - (a.record?.overall?.wins ?? 0);
            return wDiff !== 0 ? wDiff
                : (b.record?.overall?.pointsFor ?? 0) - (a.record?.overall?.pointsFor ?? 0);
        })
        .map(t => ({
            teamId:      t.id,
            abbrev:      t.abbrev,
            name:        `${t.location ?? ''} ${t.nickname ?? ''}`.trim(),
            wins:        t.record?.overall?.wins ?? 0,
            losses:      t.record?.overall?.losses ?? 0,
            ties:        t.record?.overall?.ties ?? 0,
            fpts:        t.record?.overall?.pointsFor ?? 0,
            fptsAgainst: t.record?.overall?.pointsAgainst ?? 0,
            ownerId:     t.owners?.[0] ?? null,
        }));
}

// ─── Transactions (trades, adds, drops, waivers) ───────────────────────────────

interface EspnRawTransaction {
    id:            string;
    type:          string;
    proposedDate?: number;
    executionDate?: number;
    teamId:        number;
    status?:       string;
    items?:        Array<{
        playerId:        number;
        type:            string;
        fromTeamId:      number;
        toTeamId:        number;
        playerPoolEntry?: { playerPoolEntry?: { player?: { fullName?: string } }; player?: { fullName?: string } };
    }>;
}

interface EspnTransactionsResponse {
    transactions?: EspnRawTransaction[];
}

export async function getEspnTransactions(
    leagueId: string, season: number, espnS2: string, swid: string,
): Promise<EspnTransaction[]> {
    const raw = await withRetry(() =>
        espnFetch<EspnTransactionsResponse>(
            `/seasons/${season}/segments/0/leagues/${leagueId}?view=mTransactions2`,
            espnS2, swid,
        ),
    );
    return (raw.transactions ?? [])
        .filter(t => t.status !== 'PROPOSED' && t.status !== 'VETOED')
        .map(t => ({
            id:     t.id,
            type:   t.type,
            date:   t.executionDate ?? t.proposedDate ?? 0,
            teamId: t.teamId,
            items:  (t.items ?? []).map(item => ({
                playerId:   item.playerId,
                playerName: item.playerPoolEntry?.playerPoolEntry?.player?.fullName
                         ?? item.playerPoolEntry?.player?.fullName
                         ?? `Player ${item.playerId}`,
                type:       item.type,
                fromTeamId: item.fromTeamId,
                toTeamId:   item.toTeamId,
            })),
        }));
}

// ─── Live draft picks + player pool ─────────────────────────────────────────
//
// UNVERIFIED: ESPN's Fantasy API is private and unversioned. The mDraftDetail
// and kona_player_info views and the field names below are based on general
// knowledge of ESPN's API, not confirmed against a live in-progress ESPN
// draft in this codebase — same category of uncertainty as the NFL Fantasy
// integration in lib/nfl.ts. Every fetch here is wrapped so a shape mismatch
// fails soft (returns an empty/partial result) rather than throwing — check
// field names against a real draft's raw response before fully trusting this.

export interface EspnDraftPick {
    overallPickNumber: number;
    roundId:           number;
    roundPickNumber:   number;
    teamId:            number;
    playerId:          number;
}

interface EspnDraftDetailResponse {
    draftDetail?: {
        drafted?:    boolean;
        inProgress?: boolean;
        picks?:      EspnDraftPick[];
    };
}

export async function getEspnDraftDetail(
    leagueId: string, season: number, espnS2: string, swid: string,
): Promise<{ drafted: boolean; inProgress: boolean; picks: EspnDraftPick[] }> {
    const raw = await withRetry(() => espnFetch<EspnDraftDetailResponse>(
        `/seasons/${season}/segments/0/leagues/${leagueId}?view=mDraftDetail`,
        espnS2, swid,
    ));
    return {
        drafted:    raw.draftDetail?.drafted ?? false,
        inProgress: raw.draftDetail?.inProgress ?? false,
        picks:      raw.draftDetail?.picks ?? [],
    };
}

export interface EspnRawPlayerEntry {
    id:                 number;
    fullName:           string;
    defaultPositionId:  number;
    proTeamId:          number;
    injured?:           boolean;
    injuryStatus?:      string;
}

interface EspnPlayerInfoResponse {
    players?: Array<{ player: EspnRawPlayerEntry }>;
}

/** Full player universe (not roster-scoped) — needed since draft picks only carry a numeric playerId, no name. */
export async function getEspnPlayerPool(
    leagueId: string, season: number, espnS2: string, swid: string, limit = 3000,
): Promise<EspnRawPlayerEntry[]> {
    const filter = JSON.stringify({
        players: { limit, sortPercOwned: { sortAsc: false, sortPriority: 1 } },
    });
    const raw = await withRetry(() => espnFetch<EspnPlayerInfoResponse>(
        `/seasons/${season}/segments/0/leagues/${leagueId}?view=kona_player_info`,
        espnS2, swid,
        { 'X-Fantasy-Filter': filter },
    ));
    return (raw.players ?? []).map(p => p.player).filter(Boolean);
}

// ESPN's numeric NFL pro-team ID scheme — widely used in the fantasy-tools
// community, but same "not verified live in this codebase" caveat applies.
// Only affects the cosmetic team-abbreviation display, never player identity.
const PRO_TEAM_MAP: Record<number, string> = {
    1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
    9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN',
    17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
    25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WSH', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU',
};

export interface EspnDraftBoardPick {
    pickOverall:  number;
    round:        number;
    teamId:       string;
    espnPlayerId: string;
}

export function normalizeEspnDraftPicks(picks: EspnDraftPick[]): EspnDraftBoardPick[] {
    return picks
        .slice()
        .sort((a, b) => a.overallPickNumber - b.overallPickNumber)
        .map(p => ({
            pickOverall:  p.overallPickNumber,
            round:        p.roundId,
            teamId:       String(p.teamId),
            espnPlayerId: String(p.playerId),
        }));
}

export interface EspnAvailablePlayer {
    espnPlayerId: string;
    name:         string;
    position:     string;
    team:         string | null;
    injuryStatus: string | null;
}

/** Shared per-player normalizer — used for both available and already-drafted players, since a draft pick only carries an ID and needs the same name/position/team resolution. */
export function normalizeEspnPlayerEntry(p: EspnRawPlayerEntry): EspnAvailablePlayer {
    return {
        espnPlayerId: String(p.id),
        name:         p.fullName,
        position:     POSITION_MAP[p.defaultPositionId] ?? 'N/A',
        team:         PRO_TEAM_MAP[p.proTeamId] ?? null,
        injuryStatus: p.injuryStatus ?? null,
    };
}

export function normalizeEspnPlayerPool(
    raw: EspnRawPlayerEntry[],
    draftedIds: Set<string>,
): EspnAvailablePlayer[] {
    return raw
        .filter(p => !draftedIds.has(String(p.id)))
        .map(normalizeEspnPlayerEntry);
}
