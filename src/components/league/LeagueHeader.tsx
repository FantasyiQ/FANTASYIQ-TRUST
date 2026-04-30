import Image from 'next/image';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tierBadgeProps } from '@/lib/tier-badge';
import LeagueResyncButton from '@/app/dashboard/league/[id]/LeagueResyncButton';

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

export default async function LeagueHeader({ leagueId }: { leagueId: string }) {
    const session = await auth();

    const [league, dbUser] = await Promise.all([
        prisma.league.findUnique({
            where:  { id: leagueId },
            select: {
                leagueName: true, season: true, status: true,
                totalRosters: true, scoringType: true,
                avatar: true, lastSyncedAt: true,
            },
        }),
        session?.user?.id
            ? prisma.user.findUnique({
                where:  { id: session.user.id },
                select: { subscriptionTier: true },
            })
            : null,
    ]);

    if (!league) return null;

    const scoringDisplay =
        league.scoringType === 'ppr'      ? 'PPR'   :
        league.scoringType === 'half_ppr' ? '½ PPR' : 'Standard';

    const tierStr  = dbUser?.subscriptionTier ?? 'FREE';
    const badge    = tierBadgeProps(tierStr);
    const isElite  = tierStr.includes('ELITE');

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4">
            {/* Top row: avatar + league info (left) · tier badge (right) */}
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

                {/* Tier badge — top-right */}
                <div className="shrink-0">
                    {badge ? (
                        isElite ? (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.className}`}>
                                {badge.label}
                            </span>
                        ) : (
                            <Link href="/pricing" className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border hover:opacity-80 transition ${badge.className}`}>
                                {badge.label} ↑
                            </Link>
                        )
                    ) : (
                        <Link href="/pricing" className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-gray-800 text-gray-400 border-gray-700 hover:opacity-80 transition">
                            Upgrade ↑
                        </Link>
                    )}
                </div>
            </div>

            {/* Bottom row: sync (left) · Pay Dues (right) */}
            <div className="flex items-center justify-between">
                <LeagueResyncButton
                    leagueId={leagueId}
                    lastSyncedAt={league.lastSyncedAt?.toISOString() ?? null}
                />
                <Link
                    href={`/dashboard/league/${leagueId}/dues/pay`}
                    className="text-sm font-medium text-[#C8A951] hover:underline"
                >
                    Pay Dues →
                </Link>
            </div>
        </div>
    );
}
