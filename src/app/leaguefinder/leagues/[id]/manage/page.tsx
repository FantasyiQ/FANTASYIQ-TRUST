export const dynamic = 'force-dynamic';

import { redirect, notFound } from 'next/navigation';
import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Link                from 'next/link';
import WaitlistManager     from './_WaitlistManager';
import SeasonManager       from './_SeasonManager';
import PRSBadge            from '@/components/leaguefinder/PRSBadge';
import HistoryImportForm   from './_HistoryImportForm';
import DelistButton        from './_DelistButton';

export default async function ManageLeaguePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id }  = await params;
    const session = await auth();

    if (!session?.user) redirect(`/sign-in`);

    const league = await prisma.lFLeague.findUnique({
        where:   { id },
        include: {
            commissioner: { select: { id: true, ownerId: true, displayName: true } },
            joinRequests: {
                orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
                include: {
                    user: {
                        select: {
                            id: true, name: true, trustScore: true, prsScore: true,
                            lfReviews: { where: { verified: true }, select: { id: true }, take: 100 },
                        },
                    },
                },
            },
            seasons:       { orderBy: { year: 'desc' } },
            historyImport: { select: { submittedAt: true, memberCount: true } },
        },
    });

    if (!league) notFound();
    if (league.commissioner.ownerId !== session.user.id) {
        redirect(`/leaguefinder/leagues/${id}`);
    }

    const pending = league.joinRequests.filter(r => r.status === 'PENDING' || r.status === 'PINNED');
    const handled = league.joinRequests.filter(r => r.status === 'ACCEPTED' || r.status === 'REJECTED');

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">

                {/* ── Header ─────────────────────────────────────────── */}
                <div>
                    <nav className="text-xs text-gray-600 flex items-center gap-1.5 mb-4">
                        <Link href="/leaguefinder" className="hover:text-gray-400 transition">League Finder</Link>
                        <span>/</span>
                        <Link href={`/leaguefinder/leagues/${id}`} className="hover:text-gray-400 transition">{league.name}</Link>
                        <span>/</span>
                        <span className="text-white">Manage</span>
                    </nav>
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <h1 className="text-2xl font-bold text-white">{league.name}</h1>
                        <div className="flex items-center gap-3">
                            <Link
                                href={`/leaguefinder/leagues/${id}/edit`}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 transition"
                            >
                                Edit Listing
                            </Link>
                            <Link
                                href={`/leaguefinder/leagues/${id}`}
                                className="text-xs text-gray-500 hover:text-gray-300 transition"
                            >
                                ← View public page
                            </Link>
                        </div>
                    </div>
                </div>

                {/* ── PRS explainer (commissioner context) ────────────── */}
                <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3 text-xs text-gray-500 space-y-1">
                    <span className="font-bold text-gray-400">What does the Trust Score mean?</span>
                    <span className="mx-1">·</span>
                    <span className="text-[#D4AF37] font-bold">5 = Elite</span> (PRS 81–100) —
                    <span className="text-emerald-400 font-bold mx-1">4 = Trusted</span> (61–80) —
                    <span className="text-amber-400 font-bold mx-1">3 = Reliable</span> (41–60) —
                    <span className="text-orange-400 font-bold mx-1">2 = Developing</span> (21–40) —
                    <span className="text-gray-500 font-bold mx-1">1 = Unproven</span> (0–20).
                    Built from verified seasons, league retention, lineup consistency, and commissioner endorsements.
                </div>

                {/* ── Waitlist ────────────────────────────────────────── */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Waitlist</h2>
                        {pending.length > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#D4AF37] text-gray-950">
                                {pending.length}
                            </span>
                        )}
                    </div>
                    {pending.length === 0 ? (
                        <p className="text-gray-600 text-sm">No pending join requests.</p>
                    ) : (
                        <WaitlistManager requests={pending.map(r => ({
                            id:          r.id,
                            status:      r.status,
                            introMessage: r.introMessage,
                            createdAt:   r.createdAt.toISOString(),
                            user: {
                                id:              r.user.id,
                                name:            r.user.name,
                                trustScore:      r.user.trustScore,
                                prsScore:        r.user.prsScore,
                                verifiedSeasons: r.user.lfReviews.length,
                            },
                        }))} />
                    )}
                </section>

                {/* ── Past requests ───────────────────────────────────── */}
                {handled.length > 0 && (
                    <section className="space-y-2">
                        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider">Handled</h2>
                        <div className="space-y-2">
                            {handled.map(r => (
                                <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold text-gray-400">{r.user.name ?? 'User'}</span>
                                        <PRSBadge score={r.user.prsScore} compact />
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                        r.status === 'ACCEPTED'
                                            ? 'text-emerald-400 border-emerald-800 bg-emerald-900/20'
                                            : 'text-gray-500 border-gray-700 bg-gray-800'
                                    }`}>
                                        {r.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── Member History Import ───────────────────────────── */}
                <section className="space-y-3">
                    <div>
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Member History</h2>
                        <p className="text-xs text-gray-600 mt-1">
                            Import prior-season history for members to improve their FiQ Trust Scores.
                            Each member is notified. One-time, cannot be undone.
                        </p>
                    </div>
                    {league.joinRequests.length === 0 ? (
                        <p className="text-gray-600 text-sm">No members have applied yet. History import becomes available once players join the waitlist.</p>
                    ) : (
                        <HistoryImportForm
                            leagueId={id}
                            members={league.joinRequests.map(r => ({
                                userId: r.user.id,
                                name:   r.user.name,
                            }))}
                            lockedImport={league.historyImport
                                ? {
                                    submittedAt:  league.historyImport.submittedAt.toISOString(),
                                    memberCount:  league.historyImport.memberCount,
                                  }
                                : null
                            }
                        />
                    )}
                </section>

                {/* ── Season History ──────────────────────────────────── */}
                <section className="space-y-3">
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Season History</h2>
                    <SeasonManager
                        leagueId={id}
                        initialSeasons={league.seasons.map(s => ({
                            id:          s.id,
                            year:        s.year,
                            champion:    s.champion,
                            payoutSent:  s.payoutSent,
                            payoutDate:  s.payoutDate?.toISOString() ?? null,
                            notes:       s.notes,
                        }))}
                    />
                </section>

                {/* ── Danger Zone ─────────────────────────────────────── */}
                <section className="space-y-3 pt-4 border-t border-gray-800">
                    <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider">Danger Zone</h2>
                    <DelistButton leagueId={id} leagueName={league.name} />
                </section>
            </div>
        </div>
    );
}
