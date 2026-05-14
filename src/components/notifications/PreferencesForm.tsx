'use client';

import { useState, useTransition, useCallback } from 'react';

interface PrefRow {
    type:  string;
    email: boolean;
    inApp: boolean;
}

interface Group {
    label:    string;
    commish?: boolean; // show only to commissioners
    items: {
        type:  string;
        label: string;
        desc:  string;
    }[];
}

const GROUPS: Group[] = [
    {
        label: 'Dues & Payments',
        items: [
            { type: 'dues.reminder.weekly',         label: 'Dues reminders',         desc: 'Periodic nudges when your dues are unpaid.' },
            { type: 'dues.payment.confirmed',        label: 'Payment confirmations',  desc: 'Receipt when a dues payment clears.' },
            { type: 'dues.payment.manual_recorded',  label: 'Manual payment notices', desc: 'When a commissioner records cash received for you.' },
            { type: 'dues.updated',                  label: 'Dues changes',           desc: 'When the commissioner edits the amount or deadline.' },
        ],
    },
    {
        label: 'Payouts',
        items: [
            { type: 'payouts.released', label: 'Payout released', desc: 'When your commissioner finalises the season payouts.' },
        ],
    },
    {
        label: 'Season Milestones',
        items: [
            { type: 'season.draft_reminder',    label: 'Draft reminders',    desc: '24h before your draft starts.' },
            { type: 'season.playoffs_released', label: 'Playoff bracket',    desc: 'When the playoff bracket is set.' },
            { type: 'season.championship_week', label: 'Championship week',  desc: 'Start of the championship matchup.' },
            { type: 'season.final_recap',       label: 'Season recap',       desc: 'End-of-season summary.' },
        ],
    },
    {
        label: 'League Activity',
        items: [
            { type: 'league.digest.weekly', label: 'Weekly digest', desc: 'Standings, trades, and dues status summary.' },
        ],
    },
    {
        label: 'Invite & Identity',
        items: [
            { type: 'invite.reminder',              label: 'Invite reminders',         desc: 'When the commissioner sends a bulk invite nudge.' },
            { type: 'identity.needs_confirmation',  label: 'Account link requests',    desc: 'When your dues slot needs to be manually matched.' },
        ],
    },
    {
        label: 'Commissioner Alerts',
        commish: true,
        items: [
            { type: 'commissioner.alert.unpaid_members_digest', label: 'Weekly unpaid digest',   desc: 'Monday summary of members who haven\'t paid.' },
            { type: 'commissioner.alert.sync_failed',           label: 'Sync failure alerts',    desc: 'When a Sleeper or ESPN sync errors out.' },
            { type: 'commissioner.alert.payout_account_missing',label: 'Payout account missing', desc: 'Reminder to connect Stripe before paying out.' },
            { type: 'member.joined_league',                     label: 'Member joined',          desc: 'When someone accepts your invite link.' },
            { type: 'invite.progress',                          label: 'Invite progress',        desc: 'Running count of who has and hasn\'t joined.' },
        ],
    },
];

// Default: everything on
function getPref(prefs: PrefRow[], type: string): { email: boolean; inApp: boolean } {
    const row = prefs.find(p => p.type === type);
    return { email: row?.email ?? true, inApp: row?.inApp ?? true };
}

export default function PreferencesForm({
    initialPrefs,
    isCommissioner,
}: {
    initialPrefs:   PrefRow[];
    isCommissioner: boolean;
}) {
    const [prefs,   setPrefs]   = useState<PrefRow[]>(initialPrefs);
    const [saved,   setSaved]   = useState(false);
    const [error,   setError]   = useState('');
    const [pending, startTransition] = useTransition();

    function toggle(type: string, channel: 'email' | 'inApp') {
        setPrefs(prev => {
            const existing = prev.find(p => p.type === type);
            if (existing) {
                return prev.map(p => p.type === type ? { ...p, [channel]: !p[channel] } : p);
            }
            return [...prev, { type, email: true, inApp: true, [channel]: false }];
        });
        setSaved(false);
    }

    function handleSave() {
        setError('');
        startTransition(async () => {
            try {
                const res = await fetch('/api/notifications/preferences', {
                    method:  'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ updates: prefs }),
                });
                if (!res.ok) throw new Error('Save failed');
                setSaved(true);
            } catch {
                setError('Failed to save. Please try again.');
            }
        });
    }

    const visibleGroups = GROUPS.filter(g => !g.commish || isCommissioner);

    // ── Test notification ──────────────────────────────────────────────────
    const [testIdx,    setTestIdx]    = useState(0);
    const [testResult, setTestResult] = useState('');
    const [testTypes,  setTestTypes]  = useState<{ index: number; type: string; title: string }[]>([]);
    const [testSending, setTestSending] = useState(false);

    const loadTestTypes = useCallback(async () => {
        if (testTypes.length > 0) return;
        const res = await fetch('/api/notifications/test').catch(() => null);
        if (res?.ok) {
            const data = await res.json() as { types: { index: number; type: string; title: string }[] };
            setTestTypes(data.types ?? []);
        }
    }, [testTypes.length]);

    async function sendTest() {
        setTestSending(true);
        setTestResult('');
        try {
            const res = await fetch('/api/notifications/test', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ typeIndex: testIdx }),
            });
            if (res.ok) {
                const d = await res.json() as { title: string };
                setTestResult(`Sent: "${d.title}" — check your bell ↗`);
            } else {
                setTestResult('Failed to send.');
            }
        } finally {
            setTestSending(false);
        }
    }

    return (
        <div className="space-y-8 max-w-2xl">
            {/* Legend */}
            <div className="flex items-center gap-6 text-xs text-gray-500 font-semibold uppercase tracking-wider">
                <span className="flex-1" />
                <span className="w-16 text-center">Email</span>
                <span className="w-16 text-center">In‑App</span>
            </div>

            {visibleGroups.map(group => (
                <div key={group.label} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-800">
                        <h3 className="font-semibold text-sm text-gray-300">{group.label}</h3>
                    </div>
                    <div className="divide-y divide-gray-800/60">
                        {group.items.map(item => {
                            const { email, inApp } = getPref(prefs, item.type);
                            return (
                                <div key={item.type} className="flex items-center gap-4 px-5 py-3.5">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-200">{item.label}</p>
                                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
                                    </div>
                                    {/* Email toggle */}
                                    <div className="w-16 flex justify-center">
                                        <Toggle on={email} onChange={() => toggle(item.type, 'email')} />
                                    </div>
                                    {/* In-app toggle */}
                                    <div className="w-16 flex justify-center">
                                        <Toggle on={inApp} onChange={() => toggle(item.type, 'inApp')} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {/* Save */}
            <div className="flex items-center gap-4">
                <button
                    onClick={handleSave}
                    disabled={pending}
                    className="bg-[#D4AF37] hover:bg-[#BF9D2F] disabled:opacity-50 text-gray-950 font-bold px-6 py-2.5 rounded-xl text-sm transition"
                >
                    {pending ? 'Saving…' : 'Save Preferences'}
                </button>
                {saved  && <span className="text-green-400 text-sm font-medium">Saved ✓</span>}
                {error  && <span className="text-red-400 text-sm">{error}</span>}
            </div>

            {/* Test notification */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                <div>
                    <h3 className="font-semibold text-sm text-gray-300">Send a Test Notification</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Fires an in-app notification so you can see how it looks. No email is sent.</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <select
                        value={testIdx}
                        onChange={e => setTestIdx(Number(e.target.value))}
                        onFocus={loadTestTypes}
                        className="bg-gray-800 border border-gray-700 text-sm text-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#D4AF37]/50 flex-1 min-w-0"
                    >
                        {testTypes.length === 0
                            ? <option value={0}>Loading…</option>
                            : testTypes.map(t => <option key={t.index} value={t.index}>{t.title.replace('Test: ', '')}</option>)
                        }
                    </select>
                    <button
                        onClick={sendTest}
                        disabled={testSending}
                        onMouseEnter={loadTestTypes}
                        className="shrink-0 border border-gray-700 hover:border-[#D4AF37]/40 text-gray-300 hover:text-[#D4AF37] font-semibold px-4 py-2 rounded-xl text-sm transition disabled:opacity-50"
                    >
                        {testSending ? 'Sending…' : 'Send Test'}
                    </button>
                </div>
                {testResult && <p className="text-xs text-green-400">{testResult}</p>}
            </div>
        </div>
    );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={onChange}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 transition-colors duration-200 focus:outline-none ${
                on ? 'bg-[#D4AF37] border-[#D4AF37]' : 'bg-gray-700 border-gray-700'
            }`}
        >
            <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                    on ? 'translate-x-4' : 'translate-x-0'
                }`}
            />
        </button>
    );
}
