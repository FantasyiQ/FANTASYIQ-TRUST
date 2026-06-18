import { prisma } from '@/lib/prisma';
import { getLeagueRosters, getLeagueUsers, getNflState } from '@/lib/sleeper';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

const LEAGUE_BATCH_SIZE = 15;

// PF 50% · Win% 30% · SOS (points against, normalized) 20%
// Pre-season (no games played, no points): return neutral 50.
// When maxPa is 0 (no PA data), redistribute SOS weight proportionally to PF and Win%.
function computePowerScore(
    wins: number, losses: number, pf: number, pa: number,
    maxPf: number, maxPa: number,
): number {
    if (wins === 0 && losses === 0 && pf === 0) return 50;
    const pfNorm  = maxPf > 0 ? pf / maxPf : 0;
    const winPct  = (wins + losses) > 0 ? wins / (wins + losses) : 0;
    if (maxPa === 0) {
        return Math.round(pfNorm * 62.5 + winPct * 37.5);
    }
    const sosNorm = pa / maxPa;
    return Math.round(pfNorm * 50 + winPct * 30 + sosNorm * 20);
}

type UniqueLeague = {
    leagueId:        string;
    leagueType:      string | null;
    scoringType:     string | null;
    scoringSettings: unknown;
    rosterPositions: unknown;
    totalRosters:    number;
};

async function processLeague(league: UniqueLeague, week: number): Promise<void> {
    const [rosters, members] = await Promise.all([
        getLeagueRosters(league.leagueId),
        getLeagueUsers(league.leagueId),
    ]);

    const ownerName = new Map(members.map(m => [m.user_id, m.display_name ?? `Team ${m.user_id}`]));

    const rosterRows = rosters.map(r => ({
        rosterId:  r.roster_id,
        ownerName: r.owner_id ? (ownerName.get(r.owner_id) ?? `Team ${r.roster_id}`) : `Team ${r.roster_id}`,
        wins:   r.settings?.wins   ?? 0,
        losses: r.settings?.losses ?? 0,
        pf: Math.round(((r.settings?.fpts          ?? 0) + (r.settings?.fpts_decimal          ?? 0) / 100) * 10) / 10,
        pa: Math.round(((r.settings?.fpts_against  ?? 0) + (r.settings?.fpts_against_decimal  ?? 0) / 100) * 10) / 10,
    }));

    const maxPf = Math.max(...rosterRows.map(r => r.pf), 1);
    const maxPa = Math.max(...rosterRows.map(r => r.pa), 0);

    const data = rosterRows
        .map(r => ({ ...r, powerScore: computePowerScore(r.wins, r.losses, r.pf, r.pa, maxPf, maxPa) }))
        .sort((a, b) => b.powerScore - a.powerScore || b.pf - a.pf)
        .map((r, i) => ({ rank: i + 1, ...r }));

    await prisma.powerRankingSnapshot.upsert({
        where:  { leagueId_week: { leagueId: league.leagueId, week } },
        update: { data },
        create: { leagueId: league.leagueId, week, data },
    });
}

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const nflState = await getNflState();
        if (nflState.season_type === 'pre') {
            return Response.json({ skipped: true, reason: 'preseason' });
        }
        const week = nflState.week;

        const leagues = await prisma.league.findMany({
            where:  { status: 'in_season' },
            select: { leagueId: true, leagueType: true, scoringType: true, scoringSettings: true, rosterPositions: true, totalRosters: true },
        });
        const uniqueLeagues = [...new Map(leagues.map(l => [l.leagueId, l])).values()];

        if (!uniqueLeagues.length) {
            return Response.json({ ok: true, message: 'No in-season leagues', week });
        }

        let saved = 0, errors = 0;
        for (let i = 0; i < uniqueLeagues.length; i += LEAGUE_BATCH_SIZE) {
            const batch   = uniqueLeagues.slice(i, i + LEAGUE_BATCH_SIZE);
            const results = await Promise.allSettled(batch.map(league => processLeague(league, week)));
            for (const result of results) {
                if (result.status === 'fulfilled') saved++;
                else errors++;
            }
        }

        return Response.json({ ok: true, week, saved, errors });
    } catch (err) {
        captureError(err, { cron: 'power-rankings' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
