export const dynamic    = 'force-dynamic';
export const maxDuration = 30;

import { notFound, redirect } from 'next/navigation';
import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueDrafts, getLeagueRosters, getLeagueUsers } from '@/lib/sleeper';
import HubTabBar from '../HubTabBar';
import DraftAssistantPanel from './DraftAssistantPanel';

export default async function DraftAssistantPage({
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
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">FantasyiQ Hub</h1>
                        <p className="text-gray-500 text-sm mt-0.5">{league.leagueName}</p>
                    </div>
                </div>
                <HubTabBar leagueId={id} activeTab="draft-assistant" />
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                    <p className="text-gray-400 text-sm">Live Draft Assistant is available for Sleeper Dynasty leagues only.</p>
                </div>
            </div>
        );
    }

    // Fetch drafts + rosters + users in parallel
    let drafts:   Awaited<ReturnType<typeof getLeagueDrafts>>   = [];
    let rosters:  Awaited<ReturnType<typeof getLeagueRosters>>  = [];
    let members:  Awaited<ReturnType<typeof getLeagueUsers>>    = [];

    try {
        [drafts, rosters, members] = await Promise.all([
            getLeagueDrafts(league.leagueId),
            getLeagueRosters(league.leagueId),
            getLeagueUsers(league.leagueId),
        ]);
    } catch { /* Sleeper unreachable — show empty state */ }

    // Filter to startup + rookie drafts that are active or pre_draft
    const relevantDrafts = drafts.filter(d =>
        d.status === 'drafting' || d.status === 'pre_draft'
    );

    // Build user → display name map
    const userDisplayName = new Map(
        members.map(m => [m.user_id, m.metadata?.team_name || m.display_name || m.username])
    );

    // Build roster options: { rosterId, displayName }
    const rosterOptions = rosters.map(r => ({
        rosterId:    String(r.roster_id),
        displayName: r.owner_id ? (userDisplayName.get(r.owner_id) ?? `Team ${r.roster_id}`) : `Team ${r.roster_id}`,
        ownerId:     r.owner_id ?? null,
    }));

    // Identify "my" roster by Sleeper user ID
    const mySleeperUserId = dbUser?.sleeperUserId ?? league.sleeperUserId ?? null;
    const myRosterOption  = mySleeperUserId
        ? rosterOptions.find(r => r.ownerId === mySleeperUserId)
        : null;

    // Draft options for the picker
    const draftOptions = relevantDrafts.map(d => ({
        draftId: d.draft_id,
        label:   d.name ?? d.metadata?.name ?? (d.metadata?.type === 'rookie' ? 'Rookie Draft' : 'Startup Draft'),
        status:  d.status,
        rounds:  d.settings.rounds,
        teams:   d.settings.teams,
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

            <HubTabBar leagueId={id} activeTab="draft-assistant" />

            <DraftAssistantPanel
                leagueId={id}
                draftOptions={draftOptions}
                rosterOptions={rosterOptions}
                myRosterId={myRosterOption?.rosterId ?? null}
            />
        </div>
    );
}
