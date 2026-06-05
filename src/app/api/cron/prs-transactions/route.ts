// GET /api/cron/prs-transactions
// Nightly cron (2am UTC) — ingests Sleeper trade and waiver/free-agent activity
// into PrsEvents. Runs before prs-calculate (3am) so scores reflect same-day activity.
//
// Writes:
//   trade_response  — for each FiQ user who consented to a completed trade
//   waiver_active   — for each FiQ user whose waiver/free-agent claim completed
//
// Deduplication: sourceRef = "txn:{transaction_id}:{sleeperUserId}" (trades)
//                           = "txn:{transaction_id}"                 (waivers)
// The partial unique index on (userId, eventType, sourceRef) WHERE sourceRef IS NOT NULL
// means createMany({ skipDuplicates: true }) is fully idempotent.

import { prisma } from '@/lib/prisma';
import {
    getLeagueTransactions,
    getLeagueRosters,
    getNflState,
} from '@/lib/sleeper';
import { captureError } from '@/lib/sentry';

export const maxDuration = 300;

const LEAGUE_BATCH_SIZE = 20; // leagues processed in parallel per batch

type PrsRow = {
    userId:    string;
    eventType: 'trade_response' | 'waiver_active';
    eventDate: Date;
    sourceRef: string;
};

async function processLeague(
    leagueId:     string,
    week:         number,
    sleeperToFiQ: Map<string, string>,
): Promise<{ tradesWritten: number; waiversWritten: number }> {
    const [rosters, transactions] = await Promise.all([
        getLeagueRosters(leagueId),
        getLeagueTransactions(leagueId, week),
    ]);

    const rosterToOwner = new Map(
        rosters
            .filter(r => r.owner_id != null)
            .map(r => [r.roster_id, r.owner_id!]),
    );

    const rows: PrsRow[] = [];

    for (const txn of transactions) {
        if (txn.status !== 'complete') continue;

        if (txn.type === 'trade') {
            const participantIds: string[] = txn.consenter_ids?.length
                ? txn.consenter_ids
                : txn.roster_ids
                    .map(rid => rosterToOwner.get(rid))
                    .filter((id): id is string => id != null);

            for (const sleeperUserId of participantIds) {
                const fiQUserId = sleeperToFiQ.get(sleeperUserId);
                if (!fiQUserId) continue;
                rows.push({
                    userId:    fiQUserId,
                    eventType: 'trade_response',
                    eventDate: new Date(txn.status_updated),
                    sourceRef: `txn:${txn.transaction_id}:${sleeperUserId}`,
                });
            }
        } else if (txn.type === 'waiver' || txn.type === 'free_agent') {
            const sleeperUserId = txn.creator;
            if (!sleeperUserId) continue;
            const fiQUserId = sleeperToFiQ.get(sleeperUserId);
            if (!fiQUserId) continue;
            rows.push({
                userId:    fiQUserId,
                eventType: 'waiver_active',
                eventDate: new Date(txn.status_updated),
                sourceRef: `txn:${txn.transaction_id}`,
            });
        }
    }

    if (rows.length === 0) return { tradesWritten: 0, waiversWritten: 0 };

    const result = await prisma.prsEvent.createMany({ data: rows, skipDuplicates: true });
    if (result.count === 0) return { tradesWritten: 0, waiversWritten: 0 };

    return {
        tradesWritten:  rows.filter(r => r.eventType === 'trade_response').length,
        waiversWritten: rows.filter(r => r.eventType === 'waiver_active').length,
    };
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

        const sleeperUsers = await prisma.user.findMany({
            where:  { sleeperUserId: { not: null } },
            select: { id: true, sleeperUserId: true },
        });
        const sleeperToFiQ = new Map(sleeperUsers.map(u => [u.sleeperUserId!, u.id]));

        const leagues = await prisma.league.findMany({
            where:    { platform: 'sleeper', status: 'in_season' },
            select:   { leagueId: true },
            distinct: ['leagueId'],
        });

        let tradesWritten  = 0;
        let waiversWritten = 0;
        let leaguesFailed  = 0;

        for (let i = 0; i < leagues.length; i += LEAGUE_BATCH_SIZE) {
            const batch   = leagues.slice(i, i + LEAGUE_BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map(({ leagueId }) => processLeague(leagueId, nflState.week, sleeperToFiQ)),
            );
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    tradesWritten  += result.value.tradesWritten;
                    waiversWritten += result.value.waiversWritten;
                } else {
                    captureError(result.reason, { cron: 'prs-transactions' });
                    leaguesFailed++;
                }
            }
        }

        return Response.json({
            ok:            true,
            week:          nflState.week,
            leagues:       leagues.length,
            tradesWritten,
            waiversWritten,
            leaguesFailed,
        });
    } catch (err) {
        captureError(err, { cron: 'prs-transactions' });
        return Response.json({ error: 'Cron failed' }, { status: 500 });
    }
}
