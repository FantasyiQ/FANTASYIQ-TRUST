import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function scoringLabel(scoringType: string | null): string {
    if (scoringType === 'ppr')      return 'PPR';
    if (scoringType === 'half_ppr') return '½ PPR';
    return 'Standard';
}

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

export default async function MyLeaguesPage() {
    const session = await auth();
    if (!session?.user?.email) redirect('/sign-in');

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
            subscriptionTier: true,
            connectedLeagues: {
                select: { leagueName: true },
            },
            subscriptions: {
                where: { status: { in: ['active', 'trialing'] } },
                select: { type: true, tier: true, leagueName: true },
            },
            leagues: {
                orderBy: { leagueName: 'asc' },
                select: {
                    id: true, leagueName: true, platform: true,
                    season: true, status: true, totalRosters: true,
                    scoringType: true, avatar: true,
                },
            },
        },
    });

    if (!user) redirect('/sign-in');

    const { leagues, connectedLeagues, subscriptions } = user;

    // Set of league names connected to a player plan slot
    const connectedNames = new Set(connectedLeagues.map(cl => cl.leagueName.toLowerCase().trim()));

    // Active commissioner subscription league names
    const commSubNames = new Set(
        subscriptions
            .filter(s => s.type === 'commissioner' && s.leagueName)
            .map(s => s.leagueName!.toLowerCase().trim())
    );

    // Split leagues into sections
    const playerLeagues   = leagues.filter(l => connectedNames.has(l.leagueName.toLowerCase().trim()));
    const commLeagues     = leagues.filter(l =>
        commSubNames.has(l.leagueName.toLowerCase().trim()) &&
        !connectedNames.has(l.leagueName.toLowerCase().trim()) // avoid double-listing
    );
    const unclassified    = leagues.filter(l =>
        !connectedNames.has(l.leagueName.toLowerCase().trim()) &&
        !commSubNames.has(l.leagueName.toLowerCase().trim())
    );

    const allGrouped = [
        { title: 'Player Plan Leagues',       items: playerLeagues },
        { title: 'Commissioner Plan Leagues',  items: commLeagues  },
        { title: 'Synced Leagues',             items: unclassified  },
    ].filter(g => g.items.length > 0);

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-4xl mx-auto space-y-8">

                <div className="flex items-center justify-between flex-wrap gap-4">
                    <h1 className="text-3xl font-bold">My Leagues</h1>
                    <Link
                        href="/dashboard/sync"
                        className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold px-4 py-2 rounded-lg transition"
                    >
                        + Sync League
                    </Link>
                </div>

                {leagues.length === 0 ? (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center">
                        <div className="text-5xl mb-4">🏈</div>
                        <h2 className="text-xl font-bold mb-2">No leagues connected yet</h2>
                        <p className="text-gray-400 text-sm mb-6">
                            Sync your Sleeper account to get started. It only takes a minute.
                        </p>
                        <Link
                            href="/dashboard/sync"
                            className="inline-block bg-[#C9A227] hover:bg-[#B8911F] text-gray-950 font-bold px-6 py-3 rounded-xl transition"
                        >
                            Connect Your League
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {allGrouped.map(group => (
                            <section key={group.title}>
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                                    {group.title}
                                </h2>
                                <div className="space-y-3">
                                    {group.items.map(league => (
                                        <Link
                                            key={league.id}
                                            href={`/dashboard/league/${league.id}`}
                                            className="flex items-center gap-4 bg-gray-900 border border-gray-800 hover:border-[#C9A227]/50 rounded-2xl p-5 transition group"
                                        >
                                            {league.avatar ? (
                                                <Image
                                                    src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                                                    alt={league.leagueName}
                                                    width={52} height={52}
                                                    className="rounded-xl shrink-0"
                                                />
                                            ) : (
                                                <div className="w-[52px] h-[52px] rounded-xl bg-gray-800 shrink-0 flex items-center justify-center text-xl font-bold text-gray-600">
                                                    FF
                                                </div>
                                            )}

                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-white group-hover:text-[#C9A227] transition truncate">
                                                    {league.leagueName}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500">
                                                    <span>{league.season}</span>
                                                    <span>·</span>
                                                    <span>{league.totalRosters} teams</span>
                                                    <span>·</span>
                                                    <span>{scoringLabel(league.scoringType)}</span>
                                                    <span>·</span>
                                                    <span className="capitalize">{league.platform}</span>
                                                    <span
                                                        className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold border ${statusBadge(league.status)}`}
                                                    >
                                                        {statusLabel(league.status)}
                                                    </span>
                                                </div>
                                            </div>

                                            <svg className="w-5 h-5 text-gray-600 group-hover:text-[#C9A227] transition shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </svg>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                )}

            </div>
        </main>
    );
}
