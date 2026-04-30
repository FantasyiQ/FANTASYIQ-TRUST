import { notFound, redirect } from 'next/navigation';
import Image from 'next/image';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import LeagueResyncButton from './LeagueResyncButton';
import LeagueTabs from './LeagueTabs';

function statusBadge(status: string) {
    switch (status) {
        case 'in_season': return 'bg-green-900/40 text-green-400 border-green-800';
        case 'drafting':  return 'bg-blue-900/40 text-blue-400 border-blue-800';
        case 'pre_draft': return 'bg-yellow-900/40 text-yellow-400 border-yellow-800';
        default:          return 'bg-gray-800 text-gray-500 border-gray-700';
    }
}

function statusLabel(status: string) {
    switch (status) {
        case 'in_season': return 'In Season';
        case 'drafting':  return 'Drafting';
        case 'pre_draft': return 'Pre-Draft';
        case 'complete':  return 'Complete';
        default:          return status;
    }
}

export default async function LeagueLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params:   Promise<{ id: string }>;
}) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where:  { id },
        select: {
            id: true, userId: true, leagueName: true, season: true,
            status: true, totalRosters: true, scoringType: true,
            avatar: true, lastSyncedAt: true,
        },
    });

    if (!league || league.userId !== session.user.id) notFound();

    const scoringDisplay =
        league.scoringType === 'ppr'      ? 'PPR'      :
        league.scoringType === 'half_ppr' ? '½ PPR'    : 'Standard';

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* League header */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <div className="flex items-start gap-4">
                        {league.avatar ? (
                            <Image
                                src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                                alt={league.leagueName}
                                width={64} height={64}
                                className="rounded-xl shrink-0"
                            />
                        ) : (
                            <div className="w-16 h-16 rounded-xl bg-gray-800 shrink-0 flex items-center justify-center text-2xl font-bold text-gray-600">
                                FF
                            </div>
                        )}

                        <div className="flex-1 min-w-0">
                            <h1 className="text-2xl font-bold truncate">{league.leagueName}</h1>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-xs font-semibold text-gray-300">
                                    Sleeper
                                </span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-xs font-semibold text-gray-300">
                                    {scoringDisplay}
                                </span>
                                <span className="text-gray-500 text-xs">
                                    {league.totalRosters} teams · {league.season}
                                </span>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadge(league.status)}`}>
                                    {statusLabel(league.status)}
                                </span>
                            </div>
                        </div>

                        <div className="shrink-0">
                            <LeagueResyncButton
                                leagueId={id}
                                lastSyncedAt={league.lastSyncedAt?.toISOString() ?? null}
                            />
                        </div>
                    </div>
                </div>

                {/* Tab bar */}
                <LeagueTabs leagueId={id} />

                {/* Active tab content */}
                {children}

            </div>
        </main>
    );
}
