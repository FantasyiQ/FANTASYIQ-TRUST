import Image from 'next/image';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tierBadgeProps } from '@/lib/tier-badge';
import LeagueResyncButton from '@/app/dashboard/league/[id]/LeagueResyncButton';
import EspnRefreshButton from '@/app/dashboard/league/[id]/EspnRefreshButton';

type DraftVariant = 'none' | 'upcoming' | 'urgent' | 'done';

function getDraftDisplay(
    draftStartTime: bigint | null,
    draftStatus: string | null,
    now: number,
): { text: string; variant: DraftVariant } {
    if (!draftStartTime) return { text: 'Draft Date: Not Scheduled', variant: 'none' };

    if (draftStatus === 'complete') return { text: 'Draft Completed', variant: 'done' };

    const draftMs  = Number(draftStartTime);
    const msUntil  = draftMs - now;

    // Draft time already passed and not yet marked complete — treat as done
    if (msUntil <= 0 && draftStatus !== 'drafting') return { text: 'Draft Completed', variant: 'done' };

    if (draftStatus === 'drafting') return { text: 'Draft In Progress', variant: 'urgent' };

    const draftDate = new Date(draftMs);
    const timeStr   = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short',
    }).format(draftDate);

    const hoursUntil = msUntil / (1000 * 60 * 60);
    const daysUntil  = Math.floor(msUntil / (1000 * 60 * 60 * 24));

    if (hoursUntil < 24) {
        return { text: `Draft Today · ${timeStr}`, variant: 'urgent' };
    }

    if (daysUntil < 30) {
        return { text: `Draft in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`, variant: 'upcoming' };
    }

    const dateStr = new Intl.DateTimeFormat('en-US', {
        month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
    }).format(draftDate);

    return { text: `Draft Date: ${dateStr} · ${timeStr}`, variant: 'upcoming' };
}

function draftBadgeClass(variant: DraftVariant) {
    switch (variant) {
        case 'upcoming': return 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/40';
        case 'urgent':   return 'bg-red-900/30 text-red-400 border-red-800';
        case 'done':     return 'bg-gray-800 text-gray-500 border-gray-700';
        default:         return 'bg-gray-800/50 text-gray-600 border-gray-700/50';
    }
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

export default async function LeagueHeader({ leagueId }: { leagueId: string }) {
    const session = await auth();

    const [league, dbUser] = await Promise.all([
        prisma.league.findUnique({
            where:  { id: leagueId },
            select: {
                leagueName: true, season: true, status: true,
                totalRosters: true, scoringType: true,
                avatar: true, lastSyncedAt: true,
                sleeperUserId: true, platform: true, userId: true,
                draftStartTime: true, draftStatus: true, draftType: true,
            },
        }),
        session?.user?.id
            ? prisma.user.findUnique({
                where:  { id: session.user.id },
                select: { subscriptionTier: true, sleeperUserId: true },
            })
            : null,
    ]);

    if (!league) return null;

    const scoringDisplay =
        league.scoringType === 'ppr'      ? 'PPR'   :
        league.scoringType === 'half_ppr' ? '½ PPR' : 'Standard';

    const tierStr = dbUser?.subscriptionTier ?? 'FREE';
    const badge   = tierBadgeProps(tierStr);
    const isElite = tierStr.includes('ELITE');

    const isCommissioner = league.platform === 'espn'
        ? league.userId === session?.user?.id
        : !!league.sleeperUserId &&
          !!dbUser?.sleeperUserId &&
          String(league.sleeperUserId).trim() === String(dbUser.sleeperUserId).trim();

    // Fetch dues status for this member
    const dues = session?.user?.id ? await prisma.leagueDues.findFirst({
        where:  { leagueName: { equals: league.leagueName, mode: 'insensitive' }, season: league.season },
        select: {
            id:      true,
            members: {
                where:  { userId: session.user.id },
                select: { duesStatus: true },
                take:   1,
            },
        },
    }) : null;

    const memberStatus  = dues?.members?.[0]?.duesStatus ?? null;
    const duesPaid      = memberStatus === 'paid';
    const duesOwed      = dues && !duesPaid;

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4">
            {/* Top row: avatar + league name + info pills (left) · tier badge (right) */}
            <div className="flex items-start gap-4">
                {league.avatar && league.platform !== 'espn' ? (
                    <Image
                        src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                        alt={league.leagueName}
                        width={64} height={64}
                        className="rounded-xl shrink-0"
                    />
                ) : (
                    <div className="w-16 h-16 rounded-xl bg-gray-800 shrink-0 flex items-center justify-center text-2xl font-bold text-gray-600">
                        {league.platform === 'espn' ? 'ESPN' : 'FF'}
                    </div>
                )}

                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-bold truncate">
                        <Link href={`/dashboard/league/${leagueId}/overview`} className="hover:text-yellow-400 transition">
                            {league.leagueName}
                        </Link>
                    </h1>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-xs font-semibold text-gray-300">
                            {league.platform === 'espn' ? 'ESPN' : 'Fantasy'}
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

            {/* Bottom row: sync (left) · draft date (center) · dues pill (right) */}
            <div className="flex items-center gap-3 flex-wrap">
                {league.platform === 'espn' ? (
                    <EspnRefreshButton leagueDbId={leagueId} />
                ) : (
                    <LeagueResyncButton
                        leagueId={leagueId}
                        lastSyncedAt={league.lastSyncedAt?.toISOString() ?? null}
                    />
                )}

                {/* Draft date — Sleeper only */}
                {league.platform !== 'espn' && (() => {
                    const { text, variant } = getDraftDisplay(
                        league.draftStartTime ?? null,
                        league.draftStatus ?? null,
                        Date.now(),
                    );
                    return (
                        <span
                            title={
                                league.draftStartTime
                                    ? new Date(Number(league.draftStartTime)).toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'long' })
                                    : undefined
                            }
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${draftBadgeClass(variant)} ${variant === 'urgent' ? 'animate-pulse' : ''}`}
                        >
                            {variant === 'upcoming' && <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] shrink-0" />}
                            {variant === 'urgent'   && <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />}
                            {text}
                        </span>
                    );
                })()}

                <div className="ml-auto">
                    {duesPaid ? (
                        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border bg-green-900/40 text-green-400 border-green-800">
                            Dues Paid ✓
                        </span>
                    ) : duesOwed ? (
                        <Link
                            href={`/dashboard/league/${leagueId}/dues/pay`}
                            className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/40 hover:bg-[#D4AF37]/20 transition"
                        >
                            Pay Dues →
                        </Link>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
