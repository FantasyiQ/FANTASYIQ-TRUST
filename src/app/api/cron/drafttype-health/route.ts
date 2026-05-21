import { prisma }                          from '@/lib/prisma';
import { getLeague, getLeagueDrafts, resolveDraftType } from '@/lib/sleeper';

export const maxDuration = 300;

/**
 * GET /api/cron/drafttype-health
 * Nightly: checks every Sleeper league's draftType against Sleeper's live draft data.
 * Auto-fixes any stale or missing values. Zero mutations when data is already correct.
 */
export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const leagues = await prisma.league.findMany({
        where:  { platform: 'sleeper' },
        select: { id: true, leagueId: true, leagueName: true, draftType: true },
    });

    const results: { leagueId: string; name: string; stored: string | null; resolved: string; fixed: boolean }[] = [];
    let fixedCount = 0;

    for (const league of leagues) {
        try {
            const [sleeperLeague, drafts] = await Promise.all([
                getLeague(league.leagueId),
                getLeagueDrafts(league.leagueId),
            ]);

            const safeDrafts   = Array.isArray(drafts) ? drafts : [];
            const currentDraft = sleeperLeague.draft_id
                ? safeDrafts.find(d => d.draft_id === sleeperLeague.draft_id) ?? null
                : null;

            const resolved = resolveDraftType(currentDraft);
            const stale    = league.draftType !== resolved;

            if (stale) {
                await prisma.league.update({
                    where: { id: league.id },
                    data:  { draftType: resolved },
                });
                fixedCount++;
            }

            results.push({
                leagueId: league.leagueId,
                name:     league.leagueName,
                stored:   league.draftType,
                resolved,
                fixed:    stale,
            });
        } catch (err) {
            results.push({
                leagueId: league.leagueId,
                name:     league.leagueName,
                stored:   league.draftType,
                resolved: 'error',
                fixed:    false,
            });
            console.error(`drafttype-health: error on ${league.leagueName} (${league.leagueId}):`, err);
        }
    }

    console.log(`drafttype-health: checked ${leagues.length}, fixed ${fixedCount}`);

    return Response.json({
        checked: leagues.length,
        fixed:   fixedCount,
        results,
    });
}
