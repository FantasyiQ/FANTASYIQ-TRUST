const BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

export interface EspnMember {
    id: string; // SWID
    displayName: string;
    firstName?: string;
    lastName?: string;
}

export interface EspnTeamResponse {
    id: number;
    seasonId: number;
    teams: EspnTeam[];
    members: EspnMember[];
    settings: {
        name: string;
        size: number;
    };
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function espnFetch<T>(path: string, espnS2: string, swid: string): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        headers: {
            Cookie: `espn_s2=${espnS2}; SWID=${swid};`,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'application/json',
            Referer: 'https://fantasy.espn.com/',
        },
        cache: 'no-store',
    });

    if (!res.ok) throw new Error(`ESPN API ${res.status}: ${path}`);
    const text = await res.text();
    if (text.trim() === 'Redirecting') {
        throw new Error('ESPN credentials invalid or expired. Please refresh your espn_s2 and SWID cookies from your browser.');
    }
    return JSON.parse(text) as T;
}

// ─── Season detection ─────────────────────────────────────────────────────────

/**
 * Tries seasons from most recent backwards until we get a valid response.
 * ESPN uses the calendar year the season starts (2025 = Sep 2025 – Feb 2026).
 */
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
        } catch {
            // try next year
        }
    }
    throw new Error('Could not detect ESPN season — is the league ID correct?');
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getEspnLeagueSettings(
    leagueId: string,
    season: number,
    espnS2: string,
    swid: string,
): Promise<EspnLeagueSettings> {
    return espnFetch<EspnLeagueSettings>(
        `/seasons/${season}/segments/0/leagues/${leagueId}?view=mSettings`,
        espnS2,
        swid,
    );
}

export async function getEspnTeams(
    leagueId: string,
    season: number,
    espnS2: string,
    swid: string,
): Promise<EspnTeamResponse> {
    return espnFetch<EspnTeamResponse>(
        `/seasons/${season}/segments/0/leagues/${leagueId}?view=mTeam`,
        espnS2,
        swid,
    );
}

// ─── Derived helpers ──────────────────────────────────────────────────────────

// ESPN stat IDs: 53 = receptions (PPR scoring)
export function deriveEspnScoringType(settings: EspnLeagueSettings['settings']): string {
    const items = settings.scoringSettings?.scoringItems ?? [];
    const recItem = items.find(i => i.statId === 53);
    if (!recItem || recItem.points === 0) return 'std';
    if (recItem.points >= 1) return 'ppr';
    return 'half_ppr';
}

// ESPN lineup slot IDs → position labels
const SLOT_MAP: Record<number, string> = {
    0: 'QB', 2: 'RB', 4: 'WR', 6: 'TE',
    16: 'DEF', 17: 'K', 20: 'BN', 21: 'IR',
    23: 'FLEX', 24: 'SUPER_FLEX',
};

export function deriveEspnRosterPositions(settings: EspnLeagueSettings['settings']): string[] {
    const counts = settings.rosterSettings?.lineupSlotCounts ?? {};
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
    if (espn.status.isActive) return 'in_season';
    if (espn.scoringPeriodId === 0) return 'pre_draft';
    return 'complete';
}

/**
 * Builds standings array from ESPN teams (sorted by wins desc, then points for desc).
 */
export function buildEspnStandings(teams: EspnTeam[]): Array<{
    teamId: number;
    abbrev: string;
    name: string;
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fptsAgainst: number;
    ownerId: string | null;
}> {
    return [...teams]
        .sort((a, b) => {
            const wDiff = (b.record.overall.wins ?? 0) - (a.record.overall.wins ?? 0);
            if (wDiff !== 0) return wDiff;
            return (b.record.overall.pointsFor ?? 0) - (a.record.overall.pointsFor ?? 0);
        })
        .map(t => ({
            teamId:     t.id,
            abbrev:     t.abbrev,
            name:       `${t.location} ${t.nickname}`.trim(),
            wins:       t.record.overall.wins ?? 0,
            losses:     t.record.overall.losses ?? 0,
            ties:       t.record.overall.ties ?? 0,
            fpts:       t.record.overall.pointsFor ?? 0,
            fptsAgainst: t.record.overall.pointsAgainst ?? 0,
            ownerId:    t.owners?.[0] ?? null,
        }));
}
