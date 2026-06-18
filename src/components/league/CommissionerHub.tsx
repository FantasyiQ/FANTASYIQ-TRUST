'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import type { LeagueData } from '@/lib/league/getLeagueData';
import LeagueSwitcher from '@/components/commissioner/LeagueSwitcher';

// ── ESPN history sync widget ──────────────────────────────────────────────────

function EspnHistorySync({ leagueId }: { leagueId: string }) {
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];
    const [selected, setSelected] = useState<number[]>([]);
    const [loading, setLoading]   = useState(false);
    const [result, setResult]     = useState<string | null>(null);

    async function sync() {
        if (!selected.length) return;
        setLoading(true);
        setResult(null);
        try {
            const res  = await fetch('/api/espn/sync-history', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ leagueId, seasons: selected }),
            });
            const data = await res.json() as { synced?: number; total?: number; error?: string };
            if (!res.ok) setResult(`Error: ${data.error ?? 'Sync failed'}`);
            else         setResult(`✓ Synced ${data.synced}/${data.total} season${(data.total ?? 0) !== 1 ? 's' : ''}`);
        } catch {
            setResult('Network error — try again');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex-1">
                <p className="font-semibold text-white">Import Season History</p>
                <p className="text-gray-500 text-sm mt-1">Pull previous ESPN seasons so your history and standings are on record.</p>
            </div>
            <div className="flex flex-wrap gap-2">
                {years.map(y => (
                    <button
                        key={y}
                        type="button"
                        onClick={() => setSelected(s => s.includes(y) ? s.filter(x => x !== y) : [...s, y])}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                            selected.includes(y)
                                ? 'bg-[#D4AF37]/20 border-[#D4AF37]/50 text-[#D4AF37]'
                                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                        }`}
                    >
                        {y}
                    </button>
                ))}
            </div>
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => { void sync(); }}
                    disabled={loading || !selected.length}
                    className="self-start text-sm font-medium text-[#D4AF37] hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {loading ? 'Syncing…' : `Import ${selected.length ? `${selected.length} season${selected.length !== 1 ? 's' : ''}` : 'seasons'} →`}
                </button>
                {result && <span className={`text-xs ${result.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{result}</span>}
            </div>
        </div>
    );
}

export default function CommissionerHub({ league, dues }: LeagueData) {
    const TOOLS = [
        {
            label:       'Dues Manager',
            description: dues
                ? 'Manage buy-ins, mark payments, and set payout structure.'
                : 'Set up dues tracking for this league.',
            href: dues
                ? `/dashboard/commissioner/dues/${dues.id}?leagueId=${league.id}`
                : `/dashboard/commissioner/dues/setup?leagueName=${encodeURIComponent(league.leagueName)}&leagueId=${league.id}`,
            cta: dues ? 'Manage Dues →' : 'Set Up Dues →',
        },
        {
            label:       'Announcements Manager',
            description: 'Post updates and pin important messages for your league.',
            href:        `/dashboard/commissioner/announcements?leagueId=${league.id}`,
            cta:         'Manage Announcements →',
        },
        {
            label:       'League Documents',
            description: 'Upload your rulebook, bylaws, or any league docs. Members can view them on the league page.',
            href:        `/dashboard/commissioner/documents?leagueId=${league.id}`,
            cta:         'Manage Documents →',
        },
        {
            label:       'Calendar Manager',
            description: 'Set playoff schedule, draft date, trade deadline, and key season dates.',
            href:        `/dashboard/commissioner/calendar/${league.id}`,
            cta:         'Manage Calendar →',
        },
        {
            label:       'Invite Members',
            description: 'Generate an invite link to bring league members into FantasyiQ Trust.',
            href:        `/dashboard/league/${league.id}/commissioner/invite`,
            cta:         'Invite Members →',
        },
        {
            label:       'Commissioner Settings',
            description: 'Review and manage league settings, scoring, and roster config.',
            href:        `/dashboard/commissioner/settings?leagueId=${league.id}`,
            cta:         'View Settings →',
        },
    ];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold">Commissioner Hub</h2>
                    <p className="text-gray-500 text-sm mt-0.5">{league.season} Season</p>
                </div>
                <Suspense>
                    <LeagueSwitcher currentLeagueId={league.id} />
                </Suspense>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
                {TOOLS.map(tool => (
                    <div key={tool.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-3">
                        <div className="flex-1">
                            <p className="font-semibold text-white">{tool.label}</p>
                            <p className="text-gray-500 text-sm mt-1">{tool.description}</p>
                        </div>
                        <Link href={tool.href} className="self-start text-sm font-medium text-[#D4AF37] hover:underline">
                            {tool.cta}
                        </Link>
                    </div>
                ))}
                {league.platform === 'espn' && (
                    <EspnHistorySync leagueId={league.leagueId} />
                )}
            </div>
        </div>
    );
}
