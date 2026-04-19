'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import type { TeamRosterData } from './RosterCards';
import RosterCards from './RosterCards';
import type { SlimPlayer } from '@/lib/sleeper';
import { PLAYERS, calcDtv, DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { LeagueSettings, LeagueType, PprFormat } from '@/lib/trade-engine';
import DuesManager from './DuesManager';
import type { DuesManagerData, SleeperMember } from './DuesManager';

// ── Serialisable prop types ──────────────────────────────────────────────────

export interface StandingRow {
    rosterId:  number;
    rank:      number;
    teamName:  string;
    username?: string;
    avatar?:   string | null;
    wins:      number;
    losses:    number;
    ties:      number;
    fpts:      number;
}

// DuesData is now DuesManagerData (re-exported for page.tsx compatibility)
export type { DuesManagerData as DuesData } from './DuesManager';

export interface AnnouncementData {
    id:          string;
    body:        string;
    mediaUrl?:   string | null;
    pinned:      boolean;
    createdAt:   string; // ISO string
    authorName?: string | null;
}

export interface SleeperSettings {
    playoff_teams?:  number;
    type?:           number;
    trade_deadline?: number;
}

interface Props {
    leagueId:               string;
    leagueName:             string;
    season:                 string;
    scoringType:            string | null;
    totalRosters:           number;
    leagueType:             LeagueType;
    leagueSettings:         LeagueSettings;
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
    tradeEvaluatorContent:  React.ReactNode;
    isCommissioner:         boolean;
    currentUserId:          string;
    canUsePlayerRankings:   boolean;
    sleeperLeagueId:        string;
    sleeperMembers:         SleeperMember[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'trade' | 'commish' | 'roster-values';

const TABS: { id: Tab; label: string }[] = [
    { id: 'overview',      label: 'League Overview' },
    { id: 'commish',       label: 'Commissioner Hub' },
    { id: 'trade',         label: 'Trade Evaluator' },
    { id: 'roster-values', label: 'Roster Values' },
];

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

// ── Collapsible wrapper ───────────────────────────────────────────────────────

function CollapsibleCard({ title, children }: { title: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-800/40 transition text-left"
            >
                <h2 className="font-semibold text-lg">{title}</h2>
                {chevron(open)}
            </button>
            <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${open ? 'max-h-[9999px] opacity-100' : 'max-h-0 opacity-0'}`}
            >
                <div className="border-t border-gray-800">
                    {children}
                </div>
            </div>
        </div>
    );
}

// ── Collapsible Player Rankings card (mini DTV table) ────────────────────────

const POS_FILTER_OPTIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'PICK'];

const TIER_COLORS: Record<string, string> = {
    Elite:   'text-[#C8A951]',
    Star:    'text-green-400',
    Starter: 'text-blue-400',
    Flex:    'text-gray-300',
    Bench:   'text-orange-400',
    Waiver:  'text-red-400',
};

const POS_COLORS: Record<string, string> = {
    QB:   'bg-red-900/40 text-red-300 border-red-800',
    RB:   'bg-green-900/40 text-green-300 border-green-800',
    WR:   'bg-blue-900/40 text-blue-300 border-blue-800',
    TE:   'bg-yellow-900/40 text-yellow-300 border-yellow-800',
    PICK: 'bg-indigo-900/40 text-indigo-300 border-indigo-700',
};

function PlayerRankingsCard({
    ppr, leagueType, leagueSettings,
}: {
    ppr: PprFormat; leagueType: LeagueType; leagueSettings: LeagueSettings;
}) {
    const [posFilter, setPosFilter] = useState('All');
    const [search, setSearch] = useState('');

    const ranked = useMemo(() => {
        return PLAYERS
            .map(p => ({ p, dtv: calcDtv(p, ppr, leagueType, undefined, leagueSettings) }))
            .sort((a, b) => b.dtv.finalDtv - a.dtv.finalDtv || a.p.name.localeCompare(b.p.name));
    }, [ppr, leagueType, leagueSettings]);

    const filtered = useMemo(() => {
        let list = ranked;
        if (posFilter !== 'All') list = list.filter(({ p }) => p.position === posFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(({ p }) => p.name.toLowerCase().includes(q));
        }
        return list.slice(0, 100);
    }, [ranked, posFilter, search]);

    return (
        <>
            <p className="text-gray-500 text-xs px-6 pt-4 pb-2">DTV values scoped to this league&apos;s roster and scoring settings.</p>
            <div className="px-6 pb-3 border-b border-gray-800 flex items-center justify-between flex-wrap gap-3">
                <div className="flex gap-2 flex-wrap">
                    {POS_FILTER_OPTIONS.map(pos => (
                        <button key={pos} onClick={() => setPosFilter(pos)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${posFilter === pos ? 'bg-[#C8A951] text-black border-[#C8A951]' : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500'}`}>
                            {pos}
                        </button>
                    ))}
                </div>
                <input
                    type="text"
                    placeholder="Search players…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 w-48"
                />
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-gray-500 text-left border-b border-gray-800">
                            <th className="text-left px-4 py-3 font-medium w-10">#</th>
                            <th className="text-left px-3 py-3 font-medium">Player</th>
                            <th className="text-left px-3 py-3 font-medium">Pos</th>
                            <th className="text-left px-3 py-3 font-medium">Team</th>
                            <th className="text-right px-3 py-3 font-medium">DTV</th>
                            <th className="text-right px-4 py-3 font-medium">Tier</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(({ p, dtv }, i) => (
                            <tr key={p.name} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20 transition-colors">
                                <td className="px-4 py-2.5 text-gray-600 text-xs">{i + 1}</td>
                                <td className="px-3 py-2.5 text-white font-medium text-sm">{p.name}</td>
                                <td className="px-3 py-2.5">
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md border ${POS_COLORS[p.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                                        {p.position}
                                    </span>
                                </td>
                                <td className="px-3 py-2.5 text-gray-400 text-sm">{p.team}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-white">{dtv.finalDtv}</td>
                                <td className={`px-4 py-2.5 text-right font-semibold text-xs ${TIER_COLORS[dtv.tier] ?? 'text-gray-400'}`}>{dtv.tier}</td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-600">No players match your filter.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {filtered.length >= 100 && (
                <div className="px-6 py-3 border-t border-gray-800 text-center text-gray-600 text-xs">
                    Showing top 100 — use the Trade Evaluator tab for full rankings and trade analysis.
                </div>
            )}
        </>
    );
}

// ── Inline Announcements Section ─────────────────────────────────────────────

function AnnouncementsSection({
    initialAnnouncements,
    duesId,
    isCommissioner,
}: {
    initialAnnouncements: AnnouncementData[];
    duesId: string | null;
    isCommissioner: boolean;
}) {
    const [items, setItems] = useState<AnnouncementData[]>(initialAnnouncements);
    const [body, setBody] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [posting, setPosting] = useState(false);
    const [postError, setPostError] = useState('');

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
                const data = await res.json() as { error?: string };
                setPostError(data.error ?? 'Failed to post.');
                return;
            }
            const raw = await res.json() as { id: string; body: string; mediaUrl?: string | null; pinned: boolean; createdAt: string; author?: { name?: string | null } };
            const ann: AnnouncementData = {
                id: raw.id, body: raw.body, mediaUrl: raw.mediaUrl ?? null,
                pinned: raw.pinned, createdAt: raw.createdAt, authorName: raw.author?.name ?? null,
            };
            setItems(prev => [ann, ...prev]);
            setBody('');
            setMediaUrl('');
        } finally {
            setPosting(false);
        }
    }

    async function handleDelete(id: string) {
        if (!duesId) return;
        await fetch(`/api/dues/${duesId}/announcements/${id}`, { method: 'DELETE' });
        setItems(prev => prev.filter(a => a.id !== id));
    }

    async function handleTogglePin(id: string) {
        if (!duesId) return;
        const res = await fetch(`/api/dues/${duesId}/announcements/${id}`, { method: 'PATCH' });
        if (res.ok) {
            const raw = await res.json() as { id: string; pinned: boolean };
            setItems(prev =>
                [...prev.map(a => a.id === raw.id ? { ...a, pinned: raw.pinned } : a)]
                    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            );
        }
    }

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="font-semibold text-lg mb-4">League Announcements</h2>

            {isCommissioner && duesId && (
                <div className="mb-6 space-y-3 bg-gray-800/40 rounded-xl p-4">
                    <textarea
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        placeholder="Write an announcement for your league…"
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
                        onClick={handlePost}
                        disabled={posting || !body.trim()}
                        className="bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm transition"
                    >
                        {posting ? 'Posting…' : '+ Post Announcement'}
                    </button>
                </div>
            )}

            {items.length > 0 ? (
                <div className="space-y-4">
                    {items.map(a => (
                        <div key={a.id} className="bg-gray-800/40 rounded-xl p-4">
                            {a.pinned && (
                                <span className="text-xs font-semibold text-[#C8A951] mb-1 block">📌 Pinned</span>
                            )}
                            <p className="text-gray-200 text-sm leading-relaxed">{a.body}</p>
                            {a.mediaUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={a.mediaUrl} alt="announcement media"
                                    className="mt-3 max-h-40 rounded-lg object-contain" />
                            )}
                            <div className="flex items-center justify-between mt-2">
                                <p className="text-gray-600 text-xs">
                                    {a.authorName && `${a.authorName} · `}
                                    {new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                                {isCommissioner && (
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => handleTogglePin(a.id)}
                                            className="text-xs text-gray-500 hover:text-[#C8A951] transition"
                                        >
                                            {a.pinned ? 'Unpin' : 'Pin'}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(a.id)}
                                            className="text-xs text-red-500 hover:text-red-400 transition"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-gray-500 text-sm">No announcements yet.</p>
            )}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LeagueDetailTabs({
    leagueId: _leagueId,
    leagueName,
    season,
    scoringType,
    totalRosters,
    leagueType,
    leagueSettings,
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
    tradeEvaluatorContent,
    isCommissioner,
    currentUserId,
    canUsePlayerRankings,
    sleeperLeagueId,
    sleeperMembers,
}: Props) {
    const [activeTab, setActiveTab] = useState<Tab>('overview');

    const ppr: PprFormat = scoringType === 'ppr' ? 1 : scoringType === 'half_ppr' ? 0.5 : 0;

    return (
        <div>
            {/* ── Tab bar ──────────────────────────────────────────────── */}
            <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-800">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition border-b-2 -mb-px ${
                            activeTab === tab.id
                                ? 'text-[#C8A951] border-[#C8A951]'
                                : 'text-gray-400 hover:text-white border-transparent'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ── Overview tab ─────────────────────────────────────────── */}
            {activeTab === 'overview' && (
                <div className="space-y-4">

                    {/* Card 1: Standings (collapsible) */}
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

                    {/* Card 5: Team Rosters (collapsible) */}
                    <CollapsibleCard title="Team Rosters">
                        <div className="p-4">
                            <RosterCards teams={teamRosters} players={players} />
                        </div>
                    </CollapsibleCard>

                    {/* Card 5: League Settings (collapsible, merged — roster slots + settings) */}
                    <CollapsibleCard title="League Settings">
                        <div className="p-6 space-y-5">

                            {/* Roster Slots section */}
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

                            {/* Settings key-value section */}
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

                    {/* Card 6: Trade Evaluator (embedded) */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                            <h2 className="font-semibold text-lg">Trade Evaluator</h2>
                            <button
                                onClick={() => setActiveTab('trade')}
                                className="text-xs text-[#C8A951]/70 hover:text-[#C8A951] font-medium transition"
                            >
                                Open full view →
                            </button>
                        </div>
                        <div className="p-4">{tradeEvaluatorContent}</div>
                    </div>

                    {/* Card 7: Player Rankings — gated behind All-Pro+ */}
                    {canUsePlayerRankings ? (
                        <CollapsibleCard title="Player Rankings">
                            <PlayerRankingsCard
                                ppr={ppr}
                                leagueType={leagueType}
                                leagueSettings={leagueSettings}
                            />
                        </CollapsibleCard>
                    ) : (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                            <p className="text-gray-400 text-sm mb-1">Player Rankings requires All-Pro or higher.</p>
                            <p className="text-gray-600 text-xs mb-4">
                                Upgrade your player plan, or the commissioner can upgrade their league plan —{' '}
                                and connect this league to your player plan to unlock it.
                            </p>
                            <a href="/pricing" className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-5 py-2.5 rounded-lg transition text-sm">
                                View Plans
                            </a>
                        </div>
                    )}

                </div>
            )}

            {/* ── Trade Evaluator tab ───────────────────────────────────── */}
            {activeTab === 'trade' && (
                <div>{tradeEvaluatorContent}</div>
            )}

            {/* ── Commissioner Hub tab ─────────────────────────────────── */}
            {activeTab === 'commish' && (
                <div className="space-y-4">

                    {/* Dues & Payouts */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <h2 className="font-semibold text-lg mb-4">League Dues & Payouts</h2>
                        <DuesManager
                            initialDuesData={duesData}
                            isCommissioner={isCommissioner}
                            currentUserId={currentUserId}
                            canInvite={isCommissioner}
                            leagueName={leagueName}
                            season={season}
                            sleeperLeagueId={sleeperLeagueId}
                            totalRosters={totalRosters}
                            sleeperMembers={sleeperMembers}
                        />
                    </div>

                    {/* Announcements */}
                    <AnnouncementsSection
                        initialAnnouncements={announcements}
                        duesId={duesData?.id ?? null}
                        isCommissioner={isCommissioner}
                    />

                    {/* Season Calendar placeholder */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center space-y-3">
                        <div className="text-3xl">📅</div>
                        <h3 className="font-semibold text-base">Season Calendar</h3>
                        <p className="text-gray-500 text-sm max-w-sm mx-auto">
                            Key dates, trade deadlines, and playoff schedules — coming soon.
                        </p>
                    </div>

                    {/* Pro Bowl Contest placeholder */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center space-y-3">
                        <div className="text-3xl">🏆</div>
                        <h3 className="font-semibold text-base">Pro Bowl Contest</h3>
                        <p className="text-gray-500 text-sm max-w-sm mx-auto">
                            Week 18 DK-style free contest for your league — coming soon.
                        </p>
                    </div>

                </div>
            )}

            {/* ── Roster Values tab ─────────────────────────────────────── */}
            {activeTab === 'roster-values' && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center space-y-3">
                    <div className="text-4xl">📊</div>
                    <h2 className="text-xl font-bold">Roster Values</h2>
                    <p className="text-gray-400 text-sm max-w-sm mx-auto">
                        Team-by-team DTV grades and roster strength rankings — coming soon.
                    </p>
                    <p className="text-gray-600 text-xs">
                        In the meantime, use the Trade Evaluator tab to assess individual players and picks.
                    </p>
                </div>
            )}

        </div>
    );
}
