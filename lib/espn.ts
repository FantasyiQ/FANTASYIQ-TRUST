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
            scoringItems: Array<{ statId: number; points: number }>;
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
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    pointsAgainst: number;
    roster: EspnNormalizedPlayer[];
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

function espnFetch<T>(path: string, espnS2: string, swid: string): Promise<T> {
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
        `/seasons/${season}/segments/0/leagues/${leagueId}?view=mSettings&view=mTeam&view=mRoster&view=mMatchup&view=mMatchupScore`,
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
    const teams = (raw.teams ?? []).map((t): EspnNormalizedTeam => ({
        teamId:       t.id,
        name:         `${t.location ?? ''} ${t.nickname ?? ''}`.trim(),
        abbrev:       t.abbrev ?? '',
        ownerId:      t.owners?.[0] ?? null,
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
    }));

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

export function deriveEspnStatus(espn: EspnLeagueSettings): string {
    if (espn.status?.isActive) return 'in_season';
    if (espn.scoringPeriodId === 0) return 'pre_draft';
    return 'complete';
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
