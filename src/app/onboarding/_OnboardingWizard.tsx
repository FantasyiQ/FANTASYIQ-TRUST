'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Role = 'commissioner' | 'player';
type Step = 'welcome' | 'role' | 'connect';

const PLATFORMS = [
    {
        id:    'sleeper',
        name:  'Sleeper',
        icon:  '😴',
        desc:  'Most popular — connect instantly with your username',
        href:  '/dashboard/sync',
        color: 'border-emerald-800 hover:border-emerald-600',
    },
    {
        id:    'espn',
        name:  'ESPN',
        icon:  '📺',
        desc:  'Connect via the FiQ browser extension',
        href:  '/dashboard/sync/espn',
        color: 'border-red-900 hover:border-red-700',
    },
    {
        id:    'nfl',
        name:  'NFL Fantasy',
        icon:  '🏈',
        desc:  'Connect your NFL.com fantasy league',
        href:  '/dashboard/sync/nfl',
        color: 'border-blue-900 hover:border-blue-700',
    },
    {
        id:    'yahoo',
        name:  'Yahoo Fantasy',
        icon:  '🟣',
        desc:  'Connect via Yahoo OAuth',
        href:  '/dashboard/sync/yahoo',
        color: 'border-purple-900 hover:border-purple-700',
    },
];

export default function OnboardingWizard({ userName }: { userName: string | null }) {
    const router   = useRouter();
    const [step,     setStep]    = useState<Step>('welcome');
    const [roles,    setRoles]   = useState<Set<Role>>(new Set());
    const [skipping, setSkipping] = useState(false);

    function toggleRole(r: Role) {
        setRoles(prev => {
            const next = new Set(prev);
            next.has(r) ? next.delete(r) : next.add(r);
            return next;
        });
    }

    async function handleSkip() {
        setSkipping(true);
        await fetch('/api/onboarding/complete', { method: 'POST' });
        router.replace('/dashboard');
    }

    function handlePlatform(href: string) {
        // Fire-and-forget mark complete — they've started the process
        void fetch('/api/onboarding/complete', { method: 'POST' });
        router.push(href);
    }

    const firstName = userName?.split(' ')[0] ?? 'there';

    return (
        <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4 py-16">
            <div className="w-full max-w-lg space-y-6">

                {/* Progress dots */}
                <div className="flex items-center justify-center gap-2">
                    {(['welcome', 'role', 'connect'] as Step[]).map(s => (
                        <div
                            key={s}
                            className={`h-1.5 rounded-full transition-all ${
                                s === step              ? 'w-8 bg-[#D4AF37]'   :
                                stepIndex(s) < stepIndex(step) ? 'w-4 bg-[#D4AF37]/50' :
                                                          'w-4 bg-gray-800'
                            }`}
                        />
                    ))}
                </div>

                {/* ── Step 1: Welcome ───────────────────────────────── */}
                {step === 'welcome' && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-6 text-center">
                        <div className="text-5xl">🏆</div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Welcome to FantasyiQ Trust, {firstName}!</h1>
                            <p className="text-gray-400 text-sm mt-2 leading-relaxed">
                                Connect your fantasy leagues, protect your dues, and find your next league — all in one place.
                            </p>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-xs text-gray-500">
                            <div className="bg-gray-800/60 rounded-xl p-3 space-y-1">
                                <div className="text-xl">📊</div>
                                <div className="text-white font-semibold">Analytics</div>
                                <div>Live scores, projections & standings</div>
                            </div>
                            <div className="bg-gray-800/60 rounded-xl p-3 space-y-1">
                                <div className="text-xl">💰</div>
                                <div className="text-white font-semibold">Dues Protection</div>
                                <div>Transparent tracking & payout trust</div>
                            </div>
                            <div className="bg-gray-800/60 rounded-xl p-3 space-y-1">
                                <div className="text-xl">🔍</div>
                                <div className="text-white font-semibold">League Finder</div>
                                <div>Find & join vetted leagues</div>
                            </div>
                        </div>
                        <button
                            onClick={() => setStep('role')}
                            className="w-full bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold py-3 rounded-xl transition text-sm"
                        >
                            Get Started →
                        </button>
                        <button
                            onClick={() => { void handleSkip(); }}
                            disabled={skipping}
                            className="w-full text-gray-600 hover:text-gray-400 text-xs transition"
                        >
                            Skip setup
                        </button>
                    </div>
                )}

                {/* ── Step 2: Role ──────────────────────────────────── */}
                {step === 'role' && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-6">
                        <div>
                            <h2 className="text-xl font-bold text-white">What best describes you?</h2>
                            <p className="text-gray-500 text-sm mt-1">Select all that apply — many people are both.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <RoleCard
                                icon="📋"
                                title="Commissioner"
                                desc="I run one or more leagues"
                                selected={roles.has('commissioner')}
                                onClick={() => toggleRole('commissioner')}
                            />
                            <RoleCard
                                icon="🏅"
                                title="Player"
                                desc="I play in leagues run by others"
                                selected={roles.has('player')}
                                onClick={() => toggleRole('player')}
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep('welcome')}
                                className="border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold px-5 py-2.5 rounded-xl transition text-sm"
                            >
                                Back
                            </button>
                            <button
                                onClick={() => setStep('connect')}
                                disabled={roles.size === 0}
                                className="flex-1 bg-[#D4AF37] hover:bg-[#BF9D2F] disabled:opacity-40 disabled:cursor-not-allowed text-gray-950 font-bold py-2.5 rounded-xl transition text-sm"
                            >
                                Continue →
                            </button>
                        </div>
                        <button
                            onClick={() => { void handleSkip(); }}
                            disabled={skipping}
                            className="w-full text-gray-600 hover:text-gray-400 text-xs transition"
                        >
                            Skip setup
                        </button>
                    </div>
                )}

                {/* ── Step 3: Connect League ────────────────────────── */}
                {step === 'connect' && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-6">
                        <div>
                            <h2 className="text-xl font-bold text-white">Connect your first league</h2>
                            <p className="text-gray-500 text-sm mt-1">
                                {roles.has('commissioner') && roles.has('player')
                                    ? 'Sync your leagues to unlock analytics, dues tracking, and commissioner tools.'
                                    : roles.has('commissioner')
                                    ? 'Sync the league you run to unlock dues tracking and commissioner tools.'
                                    : 'Sync the league you play in to see analytics, projections, and standings.'}
                            </p>
                        </div>
                        <div className="space-y-2">
                            {PLATFORMS.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => handlePlatform(p.href)}
                                    className={`w-full flex items-center gap-4 p-4 rounded-xl border bg-gray-800/40 hover:bg-gray-800/80 transition text-left ${p.color}`}
                                >
                                    <span className="text-2xl">{p.icon}</span>
                                    <div className="flex-1">
                                        <div className="text-sm font-bold text-white">{p.name}</div>
                                        <div className="text-[11px] text-gray-500 mt-0.5">{p.desc}</div>
                                    </div>
                                    <span className="text-gray-600 text-sm">→</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep('role')}
                                className="border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold px-5 py-2.5 rounded-xl transition text-sm"
                            >
                                Back
                            </button>
                            <button
                                onClick={() => { void handleSkip(); }}
                                disabled={skipping}
                                className="flex-1 border border-gray-700 hover:border-gray-500 text-gray-400 font-semibold py-2.5 rounded-xl transition text-sm"
                            >
                                {skipping ? 'Saving…' : 'Skip for now'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}

function stepIndex(s: Step): number {
    return ['welcome', 'role', 'connect'].indexOf(s);
}

function RoleCard({
    icon, title, desc, selected, onClick,
}: {
    icon: string; title: string; desc: string; selected: boolean; onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`rounded-xl border p-4 text-left transition space-y-1 w-full ${
                selected
                    ? 'border-[#D4AF37]/60 bg-[#D4AF37]/10'
                    : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
            }`}
        >
            <div className="text-2xl">{icon}</div>
            <div className={`text-sm font-bold ${selected ? 'text-[#D4AF37]' : 'text-white'}`}>{title}</div>
            <div className="text-[11px] text-gray-500 leading-snug">{desc}</div>
        </button>
    );
}
