export const dynamic    = 'force-dynamic';
export const maxDuration = 30;

import { notFound, redirect } from 'next/navigation';
import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueDrafts, getLeagueRosters, getLeagueUsers } from '@/lib/sleeper';
import HubTabBar  from '../HubTabBar';
import DraftReportPanel from './DraftReportPanel';

export default async function DraftReportPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const [league, dbUser] = await Promise.all([
        prisma.league.findUnique({
            where:  { id },
            select: {
                id: true, userId: true, leagueName: true, leagueId: true,
                platform: true, leagueType: true, sleeperUserId: true,
            },
        }),
        prisma.user.findUnique({
            where:  { id: session.user.id },
            select: { sleeperUserId: true },
        }),
    ]);

    if (!league || league.userId !== session.user.id) notFound();

    if (league.platform !== 'sleeper' || league.leagueType !== 'Dynasty') {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">FantasyiQ Hub</h1>
                    <p className="text-gray-500 text-sm mt-0.5">{league.leagueName}</p>
                </div>
                <HubTabBar leagueId={id} activeTab="draft-report" />
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                    <p className="text-gray-400 text-sm">Draft Report Card is available for Sleeper Dynasty leagues only.</p>
                </div>
            </div>
        );
    }

    let drafts:  Awaited<ReturnType<typeof getLeagueDrafts>>  = [];
    let rosters: Awaited<ReturnType<typeof getLeagueRosters>> = [];
    let members: Awaited<ReturnType<typeof getLeagueUsers>>   = [];

    try {
        [drafts, rosters, members] = await Promise.all([
            getLeagueDrafts(league.leagueId),
            getLeagueRosters(league.leagueId),
            getLeagueUsers(league.leagueId),
        ]);
    } catch { /* Sleeper unreachable */ }

    // Show only completed drafts
    const completedDrafts = drafts.filter(d => d.status === 'complete');

    const userDisplayName = new Map(
        members.map(m => [m.user_id, m.metadata?.team_name || m.display_name || m.username])
    );

    const rosterOptions = rosters.map(r => ({
        rosterId:    String(r.roster_id),
        displayName: r.owner_id ? (userDisplayName.get(r.owner_id) ?? `Team ${r.roster_id}`) : `Team ${r.roster_id}`,
        ownerId:     r.owner_id ?? null,
    }));

    const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId ?? null;
    const myRosterOption  = mySleeperUserId
        ? rosterOptions.find(r => r.ownerId === mySleeperUserId)
        : null;

    const draftOptions = completedDrafts.map(d => ({
        draftId: d.draft_id,
        label:   d.name ?? d.metadata?.name ?? (d.metadata?.type === 'rookie' ? 'Rookie Draft' : 'Startup Draft'),
        status:  d.status,
        rounds:  d.settings.rounds,
        teams:   d.settings.teams,
        season:  d.season,
    }));

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">FantasyiQ Hub</h1>
                    <p className="text-gray-500 text-sm mt-0.5">{league.leagueName}</p>
                </div>
                <div className="shrink-0 text-right">
                    <div className="text-[10px] font-bold tracking-widest text-[#D4AF37]">FantasyiQ</div>
                </div>
            </div>

            <HubTabBar leagueId={id} activeTab="draft-report" />

            <DraftReportPanel
                leagueId={id}
                draftOptions={draftOptions}
                rosterOptions={rosterOptions}
                myRosterId={myRosterOption?.rosterId ?? null}
            />
        </div>
    );
}
