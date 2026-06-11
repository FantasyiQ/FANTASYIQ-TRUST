'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { TeamRosterData } from './RosterCards';
import RosterCards from './RosterCards';
import type { SlimPlayer } from '@/lib/sleeper';
import type { StandingRow, AnnouncementData, SleeperSettings } from './LeagueDetailTabs';
import type { DuesManagerData } from './DuesManager';
import MembersCard, { type LeagueMemberData } from './MembersCard';

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
    isCommissioner:         boolean;
    currentUserId:          string;
    membersData:            LeagueMemberData[];
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

// ── Card 1: Dues & Payouts nav card ──────────────────────────────────────────

function DuesNavCard({ leagueId, duesData, isCommissioner, leagueName }: {
    leagueId:       string;
    duesData:       DuesManagerData | null;
    isCommissioner: boolean;
    leagueName:     string;
}) {
    const showSetup = isCommissioner && !duesData;
    const cardClass = "rounded-xl border border-[#D4AF37] bg-[#0A0A0A] p-5 md:p-6 transition-all duration-200 hover:border-[#D4AF37] hover:bg-[#111111]";

    // ── Tracker derived values ────────────────────────────────────────────────
    const paidCount   = duesData ? duesData.members.filter(m => m.duesStatus === 'paid').length : 0;
    const totalCount  = duesData ? duesData.teamCount : 0;
    const potTotal    = duesData?.potTotal ?? 0;
    const fullPot     = duesData ? duesData.buyInAmount * duesData.teamCount : 0;
    const progress    = fullPot > 0 ? Math.min(100, Math.round((potTotal / fullPot) * 100)) : 0;
    const allPaid     = duesData ? paidCount >= totalCount && totalCount > 0 : false;

    const inner = (
        <div className="flex items-start justify-between gap-6">
            {/* Left: label + description */}
            <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-semibold text-[#D4AF37]">Dues &amp; Payouts</h2>
                    <span className="text-[22px] leading-none select-none">💰</span>
                </div>
                <p className="text-gray-500 text-sm">
                    {showSetup
                        ? 'Set up dues tracking for your league.'
                        : 'View dues, pot totals, payouts, and history.'}
                </p>
                {showSetup && (
                    <Link
                        href={`/dashboard/commissioner/dues/setup?leagueName=${encodeURIComponent(leagueName)}&leagueId=${leagueId}`}
                        className="inline-block mt-3 text-sm font-semibold text-[#D4AF37] hover:underline"
                        onClick={e => e.stopPropagation()}
                    >
                        Set Up a Dues Tracker →
                    </Link>
                )}
                {isCommissioner && duesData && (
                    <Link
                        href={`/dashboard/league/${leagueId}/commissioner/invite`}
                        className="inline-block mt-2 text-sm font-semibold text-[#D4AF37] hover:underline"
                        onClick={e => e.stopPropagation()}
                    >
                        Invite Members →
                    </Link>
                )}
            </div>

            {/* Right: live tracker (only when dues exist) */}
            {duesData && (
                <div className="shrink-0 min-w-[140px] space-y-2.5">
                    {/* Pot total */}
                    <div className="text-right">
                        <p className="text-xs text-gray-600 uppercase tracking-wider font-semibold">Pot</p>
                        <p className="text-2xl font-extrabold text-white leading-tight">
                            ${potTotal.toFixed(0)}
                            <span className="text-gray-600 text-sm font-normal"> / ${fullPot.toFixed(0)}</span>
                        </p>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                        <div
                            className="h-2 rounded-full transition-all duration-500"
                            style={{
                                width: `${progress}%`,
                                background: allPaid
                                    ? '#4ade80'
                                    : 'linear-gradient(90deg, #D4AF37, #E8C96B)',
                            }}
                        />
                    </div>

                    {/* Paid count */}
                    <div className="flex items-center justify-between text-xs">
                        <span className={`font-semibold ${allPaid ? 'text-green-400' : 'text-[#D4AF37]'}`}>
                            {allPaid ? '✓ All Paid' : `${paidCount} of ${totalCount} paid`}
                        </span>
                        <span className="text-gray-600">{progress}%</span>
                    </div>
                </div>
            )}
        </div>
    );

    if (showSetup) {
        return <div className={cardClass}>{inner}</div>;
    }

    return (
        <Link href={`/dashboard/league/${leagueId}/dues`} className={`group block ${cardClass}`}>
            {inner}
        </Link>
    );
}

// ── Card 2: League Announcements ─────────────────────────────────────────────

function AnnouncementsCard({
    initialAnnouncements,
    leagueId,
    isCommissioner,
}: {
    initialAnnouncements: AnnouncementData[];
    leagueId: string;
    isCommissioner: boolean;
}) {
    const [items, setItems]         = useState<AnnouncementData[]>(initialAnnouncements);
    const [showAll, setShowAll]     = useState(false);
    const [body, setBody]           = useState('');
    const [mediaUrl, setMediaUrl]   = useState('');
    const [posting, setPosting]     = useState(false);
    const [postError, setPostError] = useState('');
    const [showForm, setShowForm]   = useState(false);

    const pinned  = items.filter(a => a.pinned);
    const recents = items.filter(a => !a.pinned);
    const visible = showAll ? items : [...pinned, ...recents.slice(0, 3)];
    const hasMore = items.length > visible.length;

    async function handlePost() {
        if (!body.trim()) return;
        setPosting(true);
        setPostError('');
        try {
            const res = await fetch(`/api/leagues/${leagueId}/announcements`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ body: body.trim(), mediaUrl: mediaUrl.trim() || undefined }),
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
        const res = await fetch(`/api/leagues/${leagueId}/announcements/${id}`, { method: 'PATCH' });
        if (res.ok) {
            const raw = await res.json() as { id: string; pinned: boolean };
            setItems(prev =>
                [...prev.map(a => a.id === raw.id ? { ...a, pinned: raw.pinned } : a)]
                    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            );
        }
    }

    async function handleDelete(id: string) {
        await fetch(`/api/leagues/${leagueId}/announcements/${id}`, { method: 'DELETE' });
        setItems(prev => prev.filter(a => a.id !== id));
    }

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-4">
                <h2 className="font-semibold text-lg">Announcements</h2>
                {isCommissioner && (
                    <button
                        type="button"
                        onClick={() => setShowForm(v => !v)}
                        className="text-sm border border-gray-700 hover:border-[#D4AF37]/50 text-gray-300 font-semibold px-3 py-1.5 rounded-lg transition"
                    >
                        {showForm ? 'Cancel' : '+ Post'}
                    </button>
                )}
            </div>

            <div className="px-6 py-5 space-y-4">
                {isCommissioner && showForm && (
                    <div className="space-y-2 bg-gray-800/40 rounded-xl p-4">
                        <textarea
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            placeholder="Write an announcement…"
                            rows={3}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37]/50 resize-none"
                        />
                        <input
                            value={mediaUrl}
                            onChange={e => setMediaUrl(e.target.value)}
                            placeholder="Image / GIF URL (optional)"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37]/50"
                        />
                        {postError && <p className="text-red-400 text-xs">{postError}</p>}
                        <button
                            onClick={() => { void handlePost(); }}
                            disabled={posting || !body.trim()}
                            className="bg-[#D4AF37] hover:bg-[#BF9D2F] disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm transition"
                        >
                            {posting ? 'Posting…' : 'Post Announcement'}
                        </button>
                    </div>
                )}

                {visible.length === 0 ? (
                    <p className="text-gray-500 text-sm">No announcements yet.</p>
                ) : (
                    <div className="space-y-3">
                        {visible.map(a => (
                            <div key={a.id} className="bg-gray-800/40 rounded-xl p-4">
                                {a.pinned && (
                                    <span className="text-xs font-semibold text-[#D4AF37] mb-1 block">📌 Pinned</span>
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
                                            <button onClick={() => { void handleTogglePin(a.id); }} className="text-xs text-gray-500 hover:text-[#D4AF37] transition">
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
                        className="text-sm text-[#D4AF37]/70 hover:text-[#D4AF37] transition font-medium"
                    >
                        {showAll ? '↑ Show fewer' : `View all announcements (${items.length}) →`}
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LeagueOverviewCards({
    leagueId,
    leagueName,
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
    isCommissioner,
    currentUserId,
    membersData,
}: Props) {

    return (
        <div className="space-y-4">

            {/* Dues & Payouts nav card */}
            <DuesNavCard leagueId={leagueId} duesData={duesData} isCommissioner={isCommissioner} leagueName={leagueName} />

            {/* Members card */}
            <MembersCard members={membersData} />

            {/* Announcements */}
            <AnnouncementsCard
                initialAnnouncements={announcements}
                leagueId={leagueId}
                isCommissioner={isCommissioner}
            />


            {/* Card 4: Player Rankings */}
            <CollapsibleCard title="Player Rankings">
                <div className="px-6 py-5">
                    <p className="text-gray-500 text-sm mb-4">
                        Full DTV-ranked player list with HOT / NEW / TRADED signals, scoped to this league&apos;s settings.
                    </p>
                    <Link
                        href={`/dashboard/league/${leagueId}/rankings`}
                        className="inline-flex items-center text-[#D4AF37] font-semibold text-sm hover:underline"
                    >
                        Open Player Rankings →
                    </Link>
                </div>
            </CollapsibleCard>

            {/* Card 5: Trade History */}
            <CollapsibleCard title="Trade History">
                <div className="px-6 py-5">
                    <p className="text-gray-500 text-sm mb-4">
                        Every trade in this league — players and picks exchanged, by team, searchable.
                    </p>
                    <Link
                        href={`/dashboard/league/${leagueId}/trade-history`}
                        className="inline-flex items-center text-[#D4AF37] font-semibold text-sm hover:underline"
                    >
                        View Trade History →
                    </Link>
                </div>
            </CollapsibleCard>

            {/* Card 6: Trade Evaluator */}
            <CollapsibleCard title="Trade Evaluator">
                <div className="px-6 py-5">
                    <p className="text-gray-500 text-sm mb-4">
                        Analyze trades, compare rosters, and browse dynasty values — scoped to this league.
                    </p>
                    <Link
                        href={`/dashboard/league/${leagueId}/trade`}
                        className="inline-flex items-center text-[#D4AF37] font-semibold text-sm hover:underline"
                    >
                        Open Trade Evaluator →
                    </Link>
                </div>
            </CollapsibleCard>

            {/* Card 6: Standings */}
            <CollapsibleCard title="Standings">
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
                                            'bg-[#D4AF37]/10 text-[#D4AF37]'
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
                                ['Platform',     'Fantasy'],
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
