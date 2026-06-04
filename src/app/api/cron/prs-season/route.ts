// GET /api/cron/prs-season
// Daily cron (1am UTC) — detects leagues that have reached status "complete"
// and writes a verified_season PrsEvent for every participating FiQ user.
//
// The sleeper-sync cron (runs hourly) keeps League.status current, so within
// one hour of a championship game ending the league flips to "complete" in our DB.
// This cron runs at 1am UTC, before prs-calculate at 3am.
//
// Deduplication: sourceRef = "season:{leagueId}:{season}"
// Because userId is part of the unique key, each user gets exactly one event
// per (leagueId, season) regardless of how many times this cron runs.
//
// NOT YET IMPLEMENTED (future work):
//   season_abandoned  — requires tracking historical roster ownership mid-season
//   retention_stayed/retention_left — requires cross-season membership comparison

import { prisma } from '@/lib/prisma';
import { getLeagueRosters } from '@/lib/sleeper';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Build sleeperUserId → FiQ userId lookup
        const sleeperUsers = await prisma.user.findMany({
            where:  { sleeperUserId: { not: null } },
            select: { id: true, sleeperUserId: true },
        });
        const sleeperToFiQ = new Map(sleeperUsers.map(u => [u.sleeperUserId!, u.id]));

        const leagues = await prisma.league.findMany({
            where:  { platform: 'sleeper', status: 'complete' },
            select: { leagueId: true, season: true },
            distinct: ['leagueId'],
        });

        let seasonsWritten = 0;
        let leaguesFailed  = 0;
        const now = new Date();

        for (const { leagueId, season } of leagues) {
            try {
                const sourceRef = `season:${leagueId}:${season}`;
                const rosters   = await getLeagueRosters(leagueId);

                type PrsRow = {
                    userId:    string;
                    eventType: 'verified_season';
                    eventDate: Date;
                    sourceRef: string;
                };
                const rows: PrsRow[] = [];

                for (const roster of rosters) {
                    if (!roster.owner_id) continue; // orphaned roster — owner left mid-season
                    const fiQUserId = sleeperToFiQ.get(roster.owner_id);
                    if (!fiQUserId) continue;
                    rows.push({ userId: fiQUserId, eventType: 'verified_season', eventDate: now, sourceRef });
                }

                if (rows.length > 0) {
                    const result = await prisma.prsEvent.createMany({
                        data: rows,
                        skipDuplicates: true,
                    });
                    seasonsWritten += result.count;
                }
            } catch (err) {
                captureError(err, { cron: 'prs-season', leagueId });
                leaguesFailed++;
            }
        }

        return Response.json({
            ok:            true,
            leagues:       leagues.length,
            seasonsWritten,
            leaguesFailed,
        });
    } catch (err) {
        captureError(err, { cron: 'prs-season' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
