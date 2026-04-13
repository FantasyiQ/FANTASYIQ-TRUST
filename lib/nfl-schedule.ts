/**
 * NFL game schedule utilities — uses the ESPN public scoreboard API.
 * Returns locked team abbreviations so lineup slots can be locked once a game starts.
 */

// Canonical NFL abbreviations and all common aliases that map to them
const TEAM_ALIASES: Record<string, string> = {
    // Arizona Cardinals
    ari:'ARI', arizona:'ARI', cardinals:'ARI', 'arizona cardinals':'ARI',
    // Atlanta Falcons
    atl:'ATL', atlanta:'ATL', falcons:'ATL', 'atlanta falcons':'ATL',
    // Baltimore Ravens
    bal:'BAL', baltimore:'BAL', ravens:'BAL', 'baltimore ravens':'BAL',
    // Buffalo Bills
    buf:'BUF', buffalo:'BUF', bills:'BUF', 'buffalo bills':'BUF',
    // Carolina Panthers
    car:'CAR', carolina:'CAR', panthers:'CAR', 'carolina panthers':'CAR',
    // Chicago Bears
    chi:'CHI', chicago:'CHI', bears:'CHI', 'chicago bears':'CHI',
    // Cincinnati Bengals
    cin:'CIN', cincinnati:'CIN', bengals:'CIN', 'cincinnati bengals':'CIN',
    // Cleveland Browns
    cle:'CLE', cleveland:'CLE', browns:'CLE', 'cleveland browns':'CLE',
    // Dallas Cowboys
    dal:'DAL', dallas:'DAL', cowboys:'DAL', 'dallas cowboys':'DAL',
    // Denver Broncos
    den:'DEN', denver:'DEN', broncos:'DEN', 'denver broncos':'DEN',
    // Detroit Lions
    det:'DET', detroit:'DET', lions:'DET', 'detroit lions':'DET',
    // Green Bay Packers
    gb:'GB', 'green bay':'GB', packers:'GB', 'green bay packers':'GB',
    // Houston Texans
    hou:'HOU', houston:'HOU', texans:'HOU', 'houston texans':'HOU',
    // Indianapolis Colts
    ind:'IND', indianapolis:'IND', colts:'IND', 'indianapolis colts':'IND',
    // Jacksonville Jaguars
    jax:'JAX', jac:'JAX', jacksonville:'JAX', jaguars:'JAX', 'jacksonville jaguars':'JAX',
    // Kansas City Chiefs
    kc:'KC', 'kansas city':'KC', chiefs:'KC', 'kansas city chiefs':'KC',
    // Las Vegas Raiders
    lv:'LV', 'las vegas':'LV', raiders:'LV', 'las vegas raiders':'LV', oak:'LV',
    // Los Angeles Chargers
    lac:'LAC', chargers:'LAC', 'los angeles chargers':'LAC', 'la chargers':'LAC',
    // Los Angeles Rams
    lar:'LAR', 'la rams':'LAR', rams:'LAR', 'los angeles rams':'LAR',
    // Miami Dolphins
    mia:'MIA', miami:'MIA', dolphins:'MIA', 'miami dolphins':'MIA',
    // Minnesota Vikings
    min:'MIN', minnesota:'MIN', vikings:'MIN', 'minnesota vikings':'MIN',
    // New England Patriots
    ne:'NE', 'new england':'NE', patriots:'NE', 'new england patriots':'NE',
    // New Orleans Saints
    no:'NO', 'new orleans':'NO', saints:'NO', 'new orleans saints':'NO',
    // New York Giants
    nyg:'NYG', giants:'NYG', 'new york giants':'NYG',
    // New York Jets
    nyj:'NYJ', jets:'NYJ', 'new york jets':'NYJ',
    // Philadelphia Eagles
    phi:'PHI', philadelphia:'PHI', eagles:'PHI', 'philadelphia eagles':'PHI',
    // Pittsburgh Steelers
    pit:'PIT', pittsburgh:'PIT', steelers:'PIT', 'pittsburgh steelers':'PIT',
    // San Francisco 49ers
    sf:'SF', 'san francisco':'SF', '49ers':'SF', 'san francisco 49ers':'SF', 'niners':'SF',
    // Seattle Seahawks
    sea:'SEA', seattle:'SEA', seahawks:'SEA', 'seattle seahawks':'SEA',
    // Tampa Bay Buccaneers
    tb:'TB', tampa:'TB', 'tampa bay':'TB', buccaneers:'TB', bucs:'TB', 'tampa bay buccaneers':'TB',
    // Tennessee Titans
    ten:'TEN', tennessee:'TEN', titans:'TEN', 'tennessee titans':'TEN',
    // Washington Commanders
    was:'WAS', wsh:'WAS', washington:'WAS', commanders:'WAS', 'washington commanders':'WAS',
};

/** Normalize a user-entered team name to an NFL abbreviation, or null if unknown. */
export function normalizeTeam(input: string): string | null {
    if (!input) return null;
    // Strip D/ST suffix (e.g. "Cowboys D/ST", "DAL DST", "SF D/ST")
    const clean = input.toLowerCase().replace(/\s*d\/?s[t]?\s*$/, '').trim();
    return TEAM_ALIASES[clean] ?? null;
}

interface EspnGame {
    date: string;           // ISO game start time
    status: string;         // "pre" | "in" | "post"
    teams: string[];        // team abbreviations
}

interface EspnScoreboard {
    events?: Array<{
        competitions?: Array<{
            date: string;
            status: { type: { state: string } };
            competitors: Array<{ team: { abbreviation: string } }>;
        }>;
    }>;
}

/** Fetch Week 18 (or given week) game info from ESPN public API. */
async function fetchEspnGames(season: string, week: number): Promise<EspnGame[]> {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`;
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return [];
    const data = await res.json() as EspnScoreboard;
    const games: EspnGame[] = [];
    for (const event of data.events ?? []) {
        for (const comp of event.competitions ?? []) {
            games.push({
                date:   comp.date,
                status: comp.status?.type?.state ?? 'pre',
                teams:  comp.competitors.map(c => c.team.abbreviation.toUpperCase()),
            });
        }
    }
    return games;
}

/**
 * Returns the set of NFL team abbreviations whose Week-18 game has started.
 * A game is "started" when its ESPN status is "in"/"post" OR current UTC time >= kickoff.
 */
export async function getLockedTeams(season: string, week = 18): Promise<Set<string>> {
    const locked = new Set<string>();
    try {
        const games = await fetchEspnGames(season, week);
        const now = Date.now();
        for (const g of games) {
            const kickoff = new Date(g.date).getTime();
            if (g.status !== 'pre' || now >= kickoff) {
                for (const team of g.teams) locked.add(team);
            }
        }
    } catch {
        // Non-fatal: return empty set → no slots locked
    }
    return locked;
}
