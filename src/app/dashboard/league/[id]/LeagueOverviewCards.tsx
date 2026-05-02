'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { TeamRosterData } from './RosterCards';
import RosterCards from './RosterCards';
import type { SlimPlayer } from '@/lib/sleeper';
import type { StandingRow, AnnouncementData, SleeperSettings } from './LeagueDetailTabs';
import type { DuesManagerData } from './DuesManager';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
    leagueId:               string;
    leagueName:             string;
    season:                 string;
    scoringType:            string | null;
    totalRosters:           number;
    standingRows:           StandingRow[];
    hasTies:                boolean;
    hasPA:                  boolean;
    teamRosters:            TeamRosterData[];
    players:                Record<string, SlimPlayer>;
    rosterPositions:        string[];
    rosterPositionsSummary: string;
    sleeperSettings:        SleeperSettings;
    duesData:               DuesManagerData | null;
    announcements:          AnnouncementData[];
    proBowlContest:         { id: string; name: string; openAt: string; lockAt: string; endAt: string } | null;
    isCommissioner:         boolean;
    currentUserId:          string;
    leaguePayouts:          { rank: number; amount: number; teamName: string; paidAt: string | null }[] | null;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function chevron(open: boolean) {
    return (
        <svg
            className={`w-4 h-4 text-gray-500 transition-transform duration-200 shrink-0 ${open ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
    );
}

function CollapsibleCard({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-800/40 transition text-left"
            >
                <h2 className="font-semibold text-lg">{title}</h2>
                {chevron(open)}
            </button>
            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${open ? 'max-h-[9999px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="border-t border-gray-800">
                    {children}
                </div>
            </div>
        </div>
    );
}

// ── Card 1: League Dues & Payouts ─────────────────────────────────────────────

function DuesCard({
    leagueId,
    duesData,
    isCommissioner,
    currentUserId,
}: {
    leagueId:       string;
    duesData:       DuesManagerData | null;
    isCommissioner: boolean;
    currentUserId:  string;
}) {
    const myMember = duesData?.members.find(m => m.userId === currentUserId) ?? null;
    const amountLabel = duesData ? `$${duesData.buyInAmount}` : '';

    return (
        <div className="group rounded-xl border border-[#CBA135] bg-[#0A0A0A] p-5 md:p-7 transition-all duration-200 hover:border-[#E2B857] hover:bg-[#111111]">

            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[#CBA135] transition-colors duration-200 group-hover:text-[#E2B857]">
                    League Dues &amp; Payouts
                </h2>
                <span className="text-[28px] leading-none transition-transform duration-200 group-hover:scale-105 select-none">💰</span>
            </div>

            {/* No dues set up yet */}
            {!duesData && (
                isCommissioner ? (
                    <div>
                        <p className="text-[15px] text-[#E5E5E5] leading-relaxed mb-6">
                            Track buy-ins, pot totals, and payouts for your league.
                        </p>
                        <Link
                            href="/dashboard/commissioner/dues"
                            className="text-sm font-semibold text-[#CBA135] hover:text-[#E2B857] transition-colors duration-200"
                        >
                            Set up dues →
                        </Link>
                    </div>
                ) : (
                    <p className="text-[15px] text-[#E5E5E5]/60 leading-relaxed">
                        No dues tracking for this league yet.
                    </p>
                )
            )}

            {/* Dues exist */}
            {duesData && (
                <div>
                    {/* Stats row — always shown */}
                    <div className="grid grid-cols-3 gap-3 mb-5">
                        {[
                            { label: 'Buy-In',    value: `$${duesData.buyInAmount}` },
                            { label: 'Pot Total', value: `$${duesData.potTotal.toFixed(0)}` },
                            { label: 'Paid',      value: `${duesData.members.filter(m => m.duesStatus === 'paid').length}/${duesData.teamCount}` },
                        ].map(stat => (
                            <div key={stat.label} className="rounded-lg border border-[#CBA135]/25 bg-[#CBA135]/5 p-3 text-center">
                                <p className="text-[11px] text-[#A1A1A1] mb-1 uppercase tracking-wider">{stat.label}</p>
                                <p className="text-white font-bold text-base">{stat.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Payout spots */}
                    {duesData.payoutSpots.length > 0 && (
                        <div className="mb-5 space-y-1.5">
                            <p className="text-[11px] text-[#A1A1A1] font-semibold uppercase tracking-wider mb-2">Payouts</p>
                            {duesData.payoutSpots.map((spot, i) => (
                                <div key={i} className="flex items-center justify-between text-sm">
                                    <span className="text-[#E5E5E5]/70">{spot.label}</span>
                                    <span className="text-[#E5E5E5] font-medium">${spot.amount.toFixed(0)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Commissioner action */}
                    {isCommissioner && (
                        <Link
                            href={`/dashboard/league/${leagueId}/dues`}
                            className="text-sm font-semibold text-[#CBA135] hover:text-[#E2B857] transition-colors duration-200"
                        >
                            Manage dues →
                        </Link>
                    )}

                    {/* Member: unpaid */}
                    {!isCommissioner && myMember && myMember.duesStatus !== 'paid' && (
                        <div>
                            <p className="text-[15px] text-[#E5E5E5] leading-relaxed mb-4">
                                Your league buy-in is <span className="font-semibold text-white">{amountLabel}</span>.
                            </p>
                            <Link
                                href={`/dashboard/league/${leagueId}/dues/pay`}
                                className="inline-flex flex-col items-center rounded-lg border border-[#CBA135] bg-[#CBA135] px-5 py-3 text-sm font-semibold text-black transition-all duration-200 hover:border-[#E2B857] hover:bg-[#E2B857] hover:-translate-y-px"
                            >
                                Pay Dues — {amountLabel}
                                <span className="mt-0.5 text-[11px] font-normal text-black/70">
                                    Secure · Instant · ZERO FEES
                                </span>
                            </Link>
                        </div>
                    )}

                    {/* Member: paid */}
                    {!isCommissioner && myMember?.duesStatus === 'paid' && (
                        <div>
                            <p className="flex items-center gap-2 text-[15px] text-emerald-300 font-medium mb-3">
                                <span>✓</span> Dues paid — you&apos;re all set!
                            </p>
                            {myMember.receiptUrl && (
                                <a
                                    href={myMember.receiptUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-semibold text-[#CBA135] hover:text-[#E2B857] transition-colors duration-200"
                                >
                                    View receipt →
                                </a>
                            )}
                        </div>
                    )}

                    {/* Member: not in dues tracker yet */}
                    {!isCommissioner && !myMember && (
                        <p className="text-[15px] text-[#E5E5E5]/60 leading-relaxed">
                            You haven&apos;t been added to the dues tracker yet. Ask your commissioner.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Card 2: Payouts ───────────────────────────────────────────────────────────

function PayoutsCard({
    leagueId,
    duesData,
    isCommissioner,
    leaguePayouts,
}: {
    leagueId:      string;
    duesData:      DuesManagerData;
    isCommissioner: boolean;
    leaguePayouts: { rank: number; amount: number; teamName: string; paidAt: string | null }[] | null;
}) {
    // Prefer new LeaguePayout data; fall back to old payoutSpots structure
    const hasNewPayouts  = !!leaguePayouts && leaguePayouts.length > 0;
    const hasSpots       = duesData.payoutSpots.length > 0;

    if (!hasNewPayouts && !hasSpots) return null;

    // ── Local optimistic state for mark-as-paid ───────────────────────────────
    const [localPaidAt, setLocalPaidAt] = useState<Record<number, string>>(() => {
        const m: Record<number, string> = {};
        leaguePayouts?.forEach(p => { if (p.paidAt) m[p.rank] = p.paidAt; });
        return m;
    });
    const [markingRank, setMarkingRank] = useState<number | null>(null);

    async function handleMarkPaid(rank: number) {
        setMarkingRank(rank);
        try {
            const res = await fetch(`/api/leagues/${leagueId}/payouts/mark-paid`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ rank }),
            });
            if (res.ok) setLocalPaidAt(prev => ({ ...prev, [rank]: new Date().toISOString() }));
        } finally {
            setMarkingRank(null);
        }
    }

    // ── Derived ───────────────────────────────────────────────────────────────
    const allPaidOut = hasNewPayouts && leaguePayouts!.every(p => localPaidAt[p.rank] ?? p.paidAt);
    const winnerByRank = new Map(duesData.winners.map(w => [w.rank, w]));

    return (
        <div className="group rounded-xl border border-[#CBA135] bg-[#0A0A0A] p-5 md:p-7 transition-all duration-200 hover:border-[#E2B857] hover:bg-[#111111]">

            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[#CBA135] transition-colors duration-200 group-hover:text-[#E2B857]">
                    Payouts
                </h2>
                <span className="text-[28px] leading-none transition-transform duration-200 group-hover:scale-105 select-none">🏆</span>
            </div>

            {/* Total Pot */}
            <div className="mb-4">
                <div className="rounded-lg border border-[#CBA135]/25 bg-[#CBA135]/5 px-4 py-3 flex items-center justify-between">
                    <span className="text-[11px] text-[#A1A1A1] uppercase tracking-wider font-semibold">Total Pot</span>
                    <span className="text-white font-bold text-base">${duesData.potTotal.toFixed(0)}</span>
                </div>
            </div>

            {/* New-model payouts rows: winner names + paid status */}
            {hasNewPayouts ? (
                <div className="mb-5 space-y-1.5">
                    {leaguePayouts!.map(p => {
                        const paidAt = localPaidAt[p.rank] ?? p.paidAt;
                        const isPaid = !!paidAt;
                        return (
                            <div key={p.rank} className="flex items-center justify-between bg-[#111111] border border-[#CBA135]/10 rounded-lg px-4 py-2.5 gap-3">
                                <div className="min-w-0 flex-1">
                                    <span className="text-[#E5E5E5]/70 text-sm">
                                        {['1st', '2nd', '3rd', '4th', '5th'][p.rank - 1] ?? `#${p.rank}`}
                                    </span>
                                    {p.teamName && (
                                        <span className="ml-2 text-[#E5E5E5] text-sm font-medium">— {p.teamName}</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-[#E5E5E5] font-medium text-sm">${p.amount.toFixed(0)}</span>
                                    {isPaid ? (
                                        <span className="inline-flex items-center gap-1 bg-[#0F3D2E] border border-emerald-500/40 text-emerald-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                                            ✓ Paid
                                        </span>
                                    ) : isCommissioner ? (
                                        <button
                                            type="button"
                                            disabled={markingRank === p.rank}
                                            onClick={() => { void handleMarkPaid(p.rank); }}
                                            className="text-[#CBA135] hover:text-[#E2B857] text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
                                        >
                                            {markingRank === p.rank ? '…' : 'Mark paid →'}
                                        </button>
                                    ) : (
                                        <span className="text-amber-400 text-xs">Pending</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* Fallback: old payoutSpots structure without winners */
                <div className="mb-5 space-y-1.5">
                    {duesData.payoutSpots
                        .slice()
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((spot, i) => {
                            const winner = winnerByRank.get(i + 1);
                            return (
                                <div key={i} className="flex items-center justify-between bg-[#111111] border border-[#CBA135]/10 rounded-lg px-4 py-2.5 gap-3">
                                    <div className="min-w-0 flex-1">
                                        <span className="text-[#E5E5E5]/70 text-sm">{spot.label}</span>
                                        {winner && (
                                            <span className="ml-2 text-[#E5E5E5] text-sm font-medium">
                                                — {winner.teamName}
                                                {winner.displayName && <span className="text-[#A1A1A1] text-xs ml-1">({winner.displayName})</span>}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[#E5E5E5] font-medium text-sm shrink-0">${spot.amount.toFixed(0)}</span>
                                </div>
                            );
                        })}
                </div>
            )}

            {/* Status banner */}
            {allPaidOut ? (
                <div className="rounded-lg bg-[#0F3D2E] border border-emerald-500/40 px-4 py-2.5 mb-4">
                    <p className="text-emerald-400 text-sm font-medium">Payouts completed — all winners have been paid.</p>
                </div>
            ) : hasNewPayouts ? (
                <div className="rounded-lg bg-[#3D2F0F] border border-amber-500/40 px-4 py-2.5 mb-4">
                    <p className="text-amber-400 text-sm font-medium">Payouts recorded — pending distribution.</p>
                </div>
            ) : (
                <div className="rounded-lg bg-yellow-900/20 border border-yellow-800/40 px-4 py-2.5 mb-4">
                    <p className="text-yellow-400 text-sm font-medium">Payouts pending — season results not yet recorded.</p>
                </div>
            )}

            {/* Commissioner links */}
            {isCommissioner && (
                <div className="flex items-center justify-between gap-4">
                    <Link
                        href={`/dashboard/league/${leagueId}/payouts`}
                        className="text-sm font-semibold text-[#CBA135] hover:text-[#E2B857] transition-colors duration-200"
                    >
                        {hasNewPayouts ? 'Manage payouts →' : 'Record payouts →'}
                    </Link>
                    <Link
                        href={`/dashboard/league/${leagueId}/payouts/history`}
                        className="text-xs text-gray-500 hover:text-[#CBA135] transition-colors duration-200"
                    >
                        View history →
                    </Link>
                </div>
            )}
        </div>
    );
}

// ── Card 3: League Announcements ──────────────────────────────────────────────

function AnnouncementsCard({
    initialAnnouncements,
    duesId,
    isCommissioner,
}: {
    initialAnnouncements: AnnouncementData[];
    duesId: string | null;
    isCommissioner: boolean;
}) {
    const [items, setItems]         = useState<AnnouncementData[]>(initialAnnouncements);
    const [showAll, setShowAll]     = useState(false);
    const [body, setBody]           = useState('');
    const [mediaUrl, setMediaUrl]   = useState('');
    const [posting, setPosting]     = useState(false);
    const [postError, setPostError] = useState('');
    const [showForm, setShowForm]   = useState(false);

    const pinned   = items.filter(a => a.pinned);
    const recents  = items.filter(a => !a.pinned);
    const visible  = showAll ? items : [...pinned, ...recents.slice(0, 3)];
    const hasMore  = items.length > visible.length;

    async function handlePost() {
        if (!body.trim() || !duesId) return;
        setPosting(true);
        setPostError('');
        try {
            const res = await fetch(`/api/dues/${duesId}/announcements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: body.trim(), mediaUrl: mediaUrl.trim() || undefined }),
            });
            if (!res.ok) {
                const d = await res.json() as { error?: string };
                setPostError(d.error ?? 'Failed to post.');
                return;
            }
            const raw = await res.json() as { id: string; body: string; mediaUrl?: string | null; pinned: boolean; createdAt: string; author?: { name?: string | null } };
            setItems(prev => [{ id: raw.id, body: raw.body, mediaUrl: raw.mediaUrl ?? null, pinned: raw.pinned, createdAt: raw.createdAt, authorName: raw.author?.name ?? null }, ...prev]);
            setBody('');
            setMediaUrl('');
            setShowForm(false);
        } finally {
            setPosting(false);
        }
    }

    async function handleTogglePin(id: string) {
        if (!duesId) return;
        const res = await fetch(`/api/dues/${duesId}/announcements/${id}`, { method: 'PATCH' });
        if (res.ok) {
            const raw = await res.json() as { id: string; pinned: boolean };
            setItems(prev =>
                [...prev.map(a => a.id === raw.id ? { ...a, pinned: raw.pinned } : a)]
                    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            );
        }
    }

    async function handleDelete(id: string) {
        if (!duesId) return;
        await fetch(`/api/dues/${duesId}/announcements/${id}`, { method: 'DELETE' });
        setItems(prev => prev.filter(a => a.id !== id));
    }

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-4">
                <h2 className="font-semibold text-lg">Announcements</h2>
                {isCommissioner && duesId && (
                    <button
                        type="button"
                        onClick={() => setShowForm(v => !v)}
                        className="text-sm border border-gray-700 hover:border-[#C8A951]/50 text-gray-300 font-semibold px-3 py-1.5 rounded-lg transition"
                    >
                        {showForm ? 'Cancel' : '+ Post'}
                    </button>
                )}
            </div>

            <div className="px-6 py-5 space-y-4">
                {isCommissioner && showForm && duesId && (
                    <div className="space-y-2 bg-gray-800/40 rounded-xl p-4">
                        <textarea
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            placeholder="Write an announcement…"
                            rows={3}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/50 resize-none"
                        />
                        <input
                            value={mediaUrl}
                            onChange={e => setMediaUrl(e.target.value)}
                            placeholder="Image / GIF URL (optional)"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/50"
                        />
                        {postError && <p className="text-red-400 text-xs">{postError}</p>}
                        <button
                            onClick={() => { void handlePost(); }}
                            disabled={posting || !body.trim()}
                            className="bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm transition"
                        >
                            {posting ? 'Posting…' : 'Post Announcement'}
                        </button>
                    </div>
                )}

                {isCommissioner && !duesId && (
                    <div className="text-center py-4 space-y-2">
                        <p className="text-gray-400 text-sm">Announcements require a dues tracker.</p>
                        <Link href="/dashboard/commissioner/dues"
                            className="text-[#C8A951] text-sm hover:underline">Set up a dues tracker →</Link>
                    </div>
                )}

                {visible.length === 0 ? (
                    <p className="text-gray-500 text-sm">No announcements yet.</p>
                ) : (
                    <div className="space-y-3">
                        {visible.map(a => (
                            <div key={a.id} className="bg-gray-800/40 rounded-xl p-4">
                                {a.pinned && (
                                    <span className="text-xs font-semibold text-[#C8A951] mb-1 block">📌 Pinned</span>
                                )}
                                <p className="text-gray-200 text-sm leading-relaxed">{a.body}</p>
                                {a.mediaUrl && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={a.mediaUrl} alt="announcement media" className="mt-3 max-h-40 rounded-lg object-contain" />
                                )}
                                <div className="flex items-center justify-between mt-2">
                                    <p className="text-gray-600 text-xs">
                                        {a.authorName && `${a.authorName} · `}
                                        {new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                    {isCommissioner && (
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => { void handleTogglePin(a.id); }} className="text-xs text-gray-500 hover:text-[#C8A951] transition">
                                                {a.pinned ? 'Unpin' : 'Pin'}
                                            </button>
                                            <button onClick={() => { void handleDelete(a.id); }} className="text-xs text-red-500 hover:text-red-400 transition">Delete</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {(hasMore || showAll) && (
                    <button
                        type="button"
                        onClick={() => setShowAll(v => !v)}
                        className="text-sm text-[#C8A951]/70 hover:text-[#C8A951] transition font-medium"
                    >
                        {showAll ? '↑ Show fewer' : `View all announcements (${items.length}) →`}
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Pro Bowl row ──────────────────────────────────────────────────────────────

type ProBowlContest = { id: string; name: string; openAt: string; lockAt: string; endAt: string };

function proBowlLabels(contest: ProBowlContest): { statusLabel: string; ctaLabel: string } {
    const now    = new Date();
    const openAt = new Date(contest.openAt);
    const lockAt = new Date(contest.lockAt);
    const endAt  = new Date(contest.endAt);

    if (now < openAt)                   return { statusLabel: 'Opens soon', ctaLabel: 'View Details' };
    if (now >= openAt && now < lockAt)  return { statusLabel: 'Open',       ctaLabel: 'Set Your Lineup' };
    if (now >= lockAt && now < endAt)   return { statusLabel: 'Locked',     ctaLabel: 'View Lineups & Leaderboard' };
    return                                     { statusLabel: 'Final',      ctaLabel: 'View Results' };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LeagueOverviewCards({
    leagueId,
    leagueName: _leagueName,
    season: _season,
    scoringType,
    totalRosters: _totalRosters,
    standingRows,
    hasTies,
    hasPA,
    teamRosters,
    players,
    rosterPositions,
    rosterPositionsSummary,
    sleeperSettings,
    duesData,
    announcements,
    proBowlContest,
    isCommissioner,
    currentUserId,
    leaguePayouts,
}: Props) {

    return (
        <div className="space-y-4">

            {/* Card 1: Dues & Payouts */}
            <DuesCard
                leagueId={leagueId}
                duesData={duesData}
                isCommissioner={isCommissioner}
                currentUserId={currentUserId}
            />

            {/* Card 2: Payouts */}
            {duesData && (duesData.payoutSpots.length > 0 || (leaguePayouts && leaguePayouts.length > 0)) && (
                <PayoutsCard
                    leagueId={leagueId}
                    duesData={duesData}
                    isCommissioner={isCommissioner}
                    leaguePayouts={leaguePayouts ?? null}
                />
            )}

            {/* Card 3: Announcements */}
            <AnnouncementsCard
                initialAnnouncements={announcements}
                duesId={duesData?.id ?? null}
                isCommissioner={isCommissioner}
            />

            {/* Card 3: Pro Bowl Contest */}
            {proBowlContest && (() => {
                const { statusLabel, ctaLabel } = proBowlLabels(proBowlContest);
                return (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-4 flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-white">Pro‑Bowl Contest</p>
                            <p className="text-xs text-gray-500">
                                {statusLabel} · Locks {new Date(proBowlContest.lockAt).toLocaleString()}
                            </p>
                        </div>
                        <Link
                            href={`/dashboard/pro-bowl/${proBowlContest.id}`}
                            className="text-xs font-medium text-[#C8A951] hover:underline shrink-0"
                        >
                            {ctaLabel} →
                        </Link>
                    </div>
                );
            })()}

            {/* Card 4: Trade Evaluator launch */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-5 flex items-center justify-between gap-6">
                <div>
                    <h2 className="font-semibold text-base">Trade Evaluator</h2>
                    <p className="text-gray-500 text-sm mt-0.5">
                        Analyze trades, compare rosters, and browse dynasty values — scoped to this league.
                    </p>
                </div>
                <Link
                    href={`/dashboard/league/${leagueId}/trade`}
                    className="shrink-0 bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-5 py-2 rounded-xl transition text-sm"
                >
                    Open →
                </Link>
            </div>

            {/* Card 5: Player Rankings launch */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-5 flex items-center justify-between gap-6">
                <div>
                    <h2 className="font-semibold text-base">Player Rankings</h2>
                    <p className="text-gray-500 text-sm mt-0.5">
                        Full DTV-ranked player list with HOT / NEW / TRADED signals, scoped to this league&apos;s settings.
                    </p>
                </div>
                <Link
                    href={`/dashboard/league/${leagueId}/rankings`}
                    className="shrink-0 border border-gray-700 hover:border-[#C8A951]/50 text-gray-300 hover:text-[#C8A951] font-semibold px-5 py-2 rounded-xl transition text-sm"
                >
                    Open →
                </Link>
            </div>

            {/* Card 6: Standings */}
            <CollapsibleCard title="Standings" defaultOpen>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-gray-400 text-left border-b border-gray-800">
                                <th className="px-6 py-3 font-medium w-12">#</th>
                                <th className="px-4 py-3 font-medium">Team</th>
                                <th className="px-4 py-3 font-medium text-center">W</th>
                                <th className="px-4 py-3 font-medium text-center">L</th>
                                {hasTies && <th className="px-4 py-3 font-medium text-center">T</th>}
                                {hasPA && <th className="px-4 py-3 font-medium text-right pr-6">PF</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {standingRows.map(row => (
                                <tr key={row.rosterId} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20 transition-colors">
                                    <td className="px-6 py-4 text-gray-500 font-medium">{row.rank}</td>
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-3">
                                            {row.avatar ? (
                                                <Image src={`https://sleepercdn.com/avatars/thumbs/${row.avatar}`}
                                                    alt={row.teamName} width={28} height={28} className="rounded-full shrink-0" />
                                            ) : (
                                                <div className="w-7 h-7 rounded-full bg-gray-800 shrink-0 flex items-center justify-center text-xs font-bold text-gray-600">
                                                    {row.teamName[0]?.toUpperCase() ?? '?'}
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-medium text-white">{row.teamName}</p>
                                                {row.username && <p className="text-gray-600 text-xs">@{row.username}</p>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-center font-semibold text-white">{row.wins}</td>
                                    <td className="px-4 py-4 text-center text-gray-400">{row.losses}</td>
                                    {hasTies && <td className="px-4 py-4 text-center text-gray-500">{row.ties}</td>}
                                    {hasPA && <td className="px-4 py-4 text-right text-gray-300 pr-6">{row.fpts.toFixed(2)}</td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CollapsibleCard>

            {/* Card 7: Team Rosters */}
            <CollapsibleCard title="Team Rosters">
                <div className="p-4">
                    <RosterCards teams={teamRosters} players={players} />
                </div>
            </CollapsibleCard>

            {/* Card 8: League Settings */}
            <CollapsibleCard title="League Settings">
                <div className="p-6 space-y-5">
                    <div>
                        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Roster Slots</p>
                        {rosterPositions.length > 0 ? (
                            <>
                                <p className="text-gray-300 text-sm leading-relaxed mb-3">{rosterPositionsSummary}</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {rosterPositions.map((pos, i) => (
                                        <span key={i} className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                            pos === 'BN' ? 'bg-gray-800 text-gray-500' :
                                            pos === 'IR' ? 'bg-red-900/30 text-red-500' :
                                            'bg-[#C8A951]/10 text-[#C8A951]'
                                        }`}>{pos}</span>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="text-gray-600 text-sm">No roster data available.</p>
                        )}
                    </div>
                    <div className="border-t border-gray-800" />
                    <div>
                        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Configuration</p>
                        <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                            {[
                                ['Scoring',      scoringType === 'ppr' ? 'PPR' : scoringType === 'half_ppr' ? '½ PPR' : 'Standard'],
                                ['Type',         sleeperSettings.type === 2 ? 'Dynasty' : 'Redraft'],
                                ['Platform',     'Sleeper'],
                                ['Roster Size',  rosterPositions.length > 0 ? String(rosterPositions.length) : '—'],
                                ...(sleeperSettings.playoff_teams != null ? [['Playoff Teams', String(sleeperSettings.playoff_teams)]] : []),
                                ...(sleeperSettings.trade_deadline != null ? [['Trade Deadline', `Week ${sleeperSettings.trade_deadline}`]] : []),
                            ].map(([label, value]) => (
                                <div key={label} className="flex justify-between border-b border-gray-800/50 pb-2 last:border-0">
                                    <dt className="text-gray-500">{label}</dt>
                                    <dd className="text-gray-200 font-medium">{value}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                </div>
            </CollapsibleCard>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 pb-4">
                <Link href="/dashboard"
                    className="text-gray-500 hover:text-gray-300 text-sm transition">
                    ← My Leagues
                </Link>
                <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span>League ID: <code className="text-gray-600 text-xs">{leagueId.slice(-8)}</code></span>
                </div>
            </div>
        </div>
    );
}
