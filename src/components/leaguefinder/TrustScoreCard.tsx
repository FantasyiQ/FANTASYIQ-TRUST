'use client';

import { prsTier, PRS_TIER_STYLES } from '@/lib/lf-prs-display';

// ── Data ─────────────────────────────────────────────────────────────────────

const TRUST_LEVELS = [
    {
        score: 1,
        tier:  'unproven',
        label: 'Unproven',
        headline: "You're new to FiQ or haven't built a track record yet.",
        detail: 'Join free leagues, complete seasons, and stay active to increase your score.',
    },
    {
        score: 2,
        tier:  'developing',
        label: 'Developing',
        headline: "You've started building reliability.",
        detail: 'Keep setting lineups and returning to leagues.',
    },
    {
        score: 3,
        tier:  'reliable',
        label: 'Reliable',
        headline: 'You consistently show up, finish seasons, and stay engaged.',
        detail: 'Most leagues will accept you.',
    },
    {
        score: 4,
        tier:  'trusted',
        label: 'Trusted',
        headline: 'Commissioners trust you.',
        detail: 'You have strong retention and positive behavior across leagues.',
    },
    {
        score: 5,
        tier:  'elite',
        label: 'Elite',
        headline: "You're one of the most reliable players on FiQ.",
        detail: 'Multiple seasons, strong engagement, and commissioner endorsements.',
    },
] as const;

const IMPROVE_STEPS = [
    'Finish every season',
    'Return to leagues next year',
    'Set your lineup every week',
    'Respond to trades',
    'Stay active on waivers',
    'Avoid penalties',
    'Earn commissioner approvals',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function prsToTrustScore(prs: number): 1 | 2 | 3 | 4 | 5 {
    if (prs >= 81) return 5;
    if (prs >= 61) return 4;
    if (prs >= 41) return 3;
    if (prs >= 21) return 2;
    return 1;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
    prsScore:     number;
    /** Show the "How to Improve" section (default: true) */
    showImprove?: boolean;
    /** Compact inline variant — no improve section, tighter layout */
    compact?:     boolean;
}

export default function TrustScoreCard({ prsScore, showImprove = true, compact = false }: Props) {
    const trustScore = prsToTrustScore(prsScore);
    const current    = TRUST_LEVELS[trustScore - 1];
    const tier       = prsTier(prsScore);
    const tierStyles = PRS_TIER_STYLES[tier];

    if (compact) {
        return (
            <div className={`rounded-xl border px-4 py-3 space-y-1 ${tierStyles}`}>
                <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider font-bold opacity-60">Trust Score</span>
                    <Stars score={trustScore} />
                </div>
                <p className="text-xs font-semibold">{current.headline}</p>
                <p className="text-[11px] opacity-70">{current.detail}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Score header */}
            <div className={`rounded-xl border px-5 py-4 space-y-3 ${tierStyles}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <div className="text-[10px] uppercase tracking-widest font-bold opacity-60 mb-1">
                            Your Trust Score
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black tabular-nums">{trustScore}</span>
                            <span className="text-base font-bold opacity-60">/ 5</span>
                        </div>
                        <div className="text-xs font-bold mt-0.5 opacity-80">{current.label}</div>
                    </div>
                    <div className="space-y-1">
                        <Stars score={trustScore} large />
                        <div className="text-[10px] opacity-50 text-right">PRS {prsScore}/100</div>
                    </div>
                </div>
                <div>
                    <p className="text-sm font-semibold">{current.headline}</p>
                    <p className="text-xs opacity-70 mt-0.5">{current.detail}</p>
                </div>
            </div>

            {/* All tiers ladder */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 divide-y divide-gray-800 overflow-hidden">
                {TRUST_LEVELS.map(level => {
                    const isActive  = level.score === trustScore;
                    const isPast    = level.score < trustScore;
                    const styles    = PRS_TIER_STYLES[level.tier];
                    return (
                        <div
                            key={level.score}
                            className={`flex items-start gap-3 px-4 py-3 transition ${
                                isActive ? `${styles} opacity-100` : 'opacity-40'
                            }`}
                        >
                            <div className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-black mt-0.5 ${
                                isActive || isPast ? styles : 'border-gray-700 text-gray-600'
                            }`}>
                                {isPast ? '✓' : level.score}
                            </div>
                            <div className="min-w-0">
                                <div className="text-xs font-bold">{level.label}</div>
                                <div className="text-[11px] opacity-70 mt-0.5">{level.headline}</div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* How to improve */}
            {showImprove && trustScore < 5 && (
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2.5">
                    <div className="text-xs font-bold text-white uppercase tracking-wider">
                        How to Improve Your Trust Score
                    </div>
                    <ul className="space-y-1.5">
                        {IMPROVE_STEPS.map(step => (
                            <li key={step} className="flex items-center gap-2 text-xs text-gray-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] shrink-0" />
                                {step}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

// ── Stars sub-component ───────────────────────────────────────────────────────

function Stars({ score, large = false }: { score: number; large?: boolean }) {
    return (
        <div className={`flex items-center gap-0.5 ${large ? 'text-lg' : 'text-sm'}`}>
            {TRUST_LEVELS.map(level => (
                <span key={level.score} className={level.score <= score ? 'opacity-100' : 'opacity-20'}>
                    ★
                </span>
            ))}
        </div>
    );
}
