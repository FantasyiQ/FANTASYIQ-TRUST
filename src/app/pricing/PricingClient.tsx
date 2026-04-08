'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCheckoutSession } from '@/app/actions/stripe';
import catalog from '../../../stripe-catalog-ids.json';

/* ── Types ────────────────────────────────────────────────────────── */
type Tab = 'player' | 'commissioner';
type TeamSize = 8 | 10 | 12 | 14 | 16 | 32;
interface Feature { name: string; included: boolean }

interface ActiveSub {
    tier: string;               // e.g. 'COMMISSIONER_PRO'
    stripeSubscriptionId: string;
}

interface Props {
    activeSub: ActiveSub | null;
}

/* ── Tier helpers ─────────────────────────────────────────────────── */
// Group rank — higher = more premium within the same plan family
function tierGroupRank(tier: string): number {
    if (tier === 'PLAYER_PRO')           return 1;
    if (tier === 'PLAYER_ALL_PRO')       return 2;
    if (tier === 'PLAYER_ELITE')         return 3;
    if (tier === 'COMMISSIONER_PRO')     return 4;
    if (tier === 'COMMISSIONER_ALL_PRO') return 5;
    if (tier === 'COMMISSIONER_ELITE')   return 6;
    return 0;
}

function isPlayerTier(tier: string)      { return tier.startsWith('PLAYER'); }
function isCommTier(tier: string)        { return tier.startsWith('COMMISSIONER'); }

/* ── Data ─────────────────────────────────────────────────────────── */
const TEAM_SIZES: TeamSize[] = [8, 10, 12, 14, 16, 32];

const COMM_PRICES: Record<TeamSize, [string, string, string]> = {
    8:  ['39.99',  '69.99',  '109.99'],
    10: ['49.99',  '89.99',  '129.99'],
    12: ['59.99',  '104.99', '149.99'],
    14: ['69.99',  '124.99', '169.99'],
    16: ['79.99',  '139.99', '189.99'],
    32: ['159.99', '239.99', '299.99'],
};

function findPriceId(name: string): string {
    return catalog.find((p) => p.name === name)?.priceId ?? '';
}

const PLAYER_PRICE_IDS = {
    pro:     findPriceId('Player Pro'),
    all_pro: findPriceId('Player All-Pro'),
    elite:   findPriceId('Player Elite'),
};

function commPriceId(tier: 'Pro' | 'All-Pro' | 'Elite', size: TeamSize): string {
    return findPriceId(`Commissioner ${tier} — ${size} Team`);
}

/* ── Feature lists ────────────────────────────────────────────────── */
const PLAYER_PRO_FEATURES: Feature[] = [
    { name: 'Zero Fees',                         included: true  },
    { name: 'League Funds Secured',              included: true  },
    { name: 'League Dues & Payouts Tracked',     included: true  },
    { name: 'Immediate Payouts',                 included: true  },
    { name: 'Commissioner Hub',                  included: true  },
    { name: 'Optimized Lineups',                 included: true  },
    { name: 'Player Rankings & Auction Values',  included: true  },
    { name: 'Sync Up to 2 Leagues',              included: true  },
    { name: 'Personalized Waiver Wire Strategy', included: false },
    { name: 'Dynamic Trade Calculator',          included: false },
    { name: 'Power League Rankings',             included: false },
    { name: 'Player Indicators & Mock Drafts',   included: false },
    { name: 'Dynamic Mock Drafts',               included: false },
    { name: 'League Analysis',                   included: false },
    { name: 'Team Builder',                      included: false },
];

const PLAYER_ALL_PRO_FEATURES: Feature[] = [
    { name: 'Zero Fees',                         included: true  },
    { name: 'League Funds Secured',              included: true  },
    { name: 'League Dues & Payouts Tracked',     included: true  },
    { name: 'Immediate Payouts',                 included: true  },
    { name: 'Commissioner Hub',                  included: true  },
    { name: 'Optimized Lineups',                 included: true  },
    { name: 'Player Rankings & Auction Values',  included: true  },
    { name: 'Sync Up to 5 Leagues',              included: true  },
    { name: 'Personalized Waiver Wire Strategy', included: true  },
    { name: 'Dynamic Trade Calculator',          included: true  },
    { name: 'Power League Rankings',             included: true  },
    { name: 'Player Indicators & Mock Drafts',   included: true  },
    { name: 'Dynamic Mock Drafts',               included: false },
    { name: 'League Analysis',                   included: false },
    { name: 'Team Builder',                      included: false },
];

const PLAYER_ELITE_FEATURES: Feature[] = [
    { name: 'Zero Fees',                         included: true },
    { name: 'League Funds Secured',              included: true },
    { name: 'League Dues & Payouts Tracked',     included: true },
    { name: 'Immediate Payouts',                 included: true },
    { name: 'Commissioner Hub',                  included: true },
    { name: 'Optimized Lineups',                 included: true },
    { name: 'Player Rankings & Auction Values',  included: true },
    { name: 'Unlimited League Syncs',            included: true },
    { name: 'Personalized Waiver Wire Strategy', included: true },
    { name: 'Dynamic Trade Calculator',          included: true },
    { name: 'Power League Rankings',             included: true },
    { name: 'Player Indicators & Mock Drafts',   included: true },
    { name: 'Dynamic Mock Drafts',               included: true },
    { name: 'League Analysis',                   included: true },
    { name: 'Team Builder',                      included: true },
];

const COMM_PRO_FEATURES: Feature[] = [
    { name: 'Zero Fees',                         included: true  },
    { name: 'League Funds Secured',              included: true  },
    { name: 'League Dues & Payouts Tracked',     included: true  },
    { name: 'Immediate Payouts',                 included: true  },
    { name: 'Commissioner Hub',                  included: true  },
    { name: 'Optimized Lineups',                 included: true  },
    { name: 'Player Rankings & Auction Values',  included: true  },
    { name: 'Personalized Waiver Wire Strategy', included: false },
    { name: 'Dynamic Trade Calculator',          included: false },
    { name: 'Power League Rankings',             included: false },
    { name: 'Player Indicators & Mock Drafts',   included: false },
    { name: 'Dynamic Mock Drafts',               included: false },
    { name: 'League Analysis',                   included: false },
    { name: 'Team Builder',                      included: false },
];

const COMM_ALL_PRO_FEATURES: Feature[] = [
    { name: 'Zero Fees',                         included: true  },
    { name: 'League Funds Secured',              included: true  },
    { name: 'League Dues & Payouts Tracked',     included: true  },
    { name: 'Immediate Payouts',                 included: true  },
    { name: 'Commissioner Hub',                  included: true  },
    { name: 'Optimized Lineups',                 included: true  },
    { name: 'Player Rankings & Auction Values',  included: true  },
    { name: 'Personalized Waiver Wire Strategy', included: true  },
    { name: 'Dynamic Trade Calculator',          included: true  },
    { name: 'Power League Rankings',             included: true  },
    { name: 'Player Indicators & Mock Drafts',   included: true  },
    { name: 'Dynamic Mock Drafts',               included: false },
    { name: 'League Analysis',                   included: false },
    { name: 'Team Builder',                      included: false },
];

const COMM_ELITE_FEATURES: Feature[] = [
    { name: 'Zero Fees',                         included: true },
    { name: 'League Funds Secured',              included: true },
    { name: 'League Dues & Payouts Tracked',     included: true },
    { name: 'Immediate Payouts',                 included: true },
    { name: 'Commissioner Hub',                  included: true },
    { name: 'Optimized Lineups',                 included: true },
    { name: 'Player Rankings & Auction Values',  included: true },
    { name: 'Personalized Waiver Wire Strategy', included: true },
    { name: 'Dynamic Trade Calculator',          included: true },
    { name: 'Power League Rankings',             included: true },
    { name: 'Player Indicators & Mock Drafts',   included: true },
    { name: 'Dynamic Mock Drafts',               included: true },
    { name: 'League Analysis',                   included: true },
    { name: 'Team Builder',                      included: true },
];

/* ── Feature row ──────────────────────────────────────────────────── */
function FeatureRow({ f }: { f: Feature }) {
    return (
        <li className="flex items-center gap-2.5 py-1.5">
            {f.included ? (
                <>
                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-200 text-sm">{f.name}</span>
                </>
            ) : (
                <>
                    <svg className="w-4 h-4 text-red-500/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-gray-600 text-sm">{f.name}</span>
                </>
            )}
        </li>
    );
}

/* ── Upgrade confirmation modal ───────────────────────────────────── */
interface PendingUpgrade { priceId: string; planName: string; price: string; period: string }

function UpgradeModal({
    pending,
    onCancel,
    onConfirm,
    loading,
    error,
}: {
    pending: PendingUpgrade;
    onCancel: () => void;
    onConfirm: () => void;
    loading: boolean;
    error: string | null;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-md w-full shadow-2xl">
                <h2 className="text-xl font-bold text-white mb-2">Confirm Upgrade</h2>
                <p className="text-gray-400 text-sm mb-4">
                    Upgrade to <span className="text-white font-semibold">{pending.planName}</span> for{' '}
                    <span className="text-[#C9A227] font-bold">${pending.price}{pending.period}</span>?
                </p>
                <p className="text-gray-500 text-xs mb-6">
                    You'll be charged the prorated difference immediately. Your new plan takes effect right away.
                </p>
                {error && (
                    <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
                        {error}
                    </div>
                )}
                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-300 font-semibold text-sm hover:border-gray-500 transition disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className="flex-1 py-2.5 rounded-xl bg-[#C9A227] text-black font-bold text-sm hover:bg-[#b8912a] transition disabled:opacity-50"
                    >
                        {loading ? 'Upgrading…' : 'Confirm Upgrade'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ── Plan card ────────────────────────────────────────────────────── */
type CardStatus = 'checkout' | 'upgrade' | 'current' | 'unavailable';

interface CardProps {
    name: string;
    price: string;
    period: string;
    badge?: string;
    badgeGold?: boolean;
    ring?: boolean;
    features: Feature[];
    priceId: string;
    tier: string;
    cardStatus: CardStatus;
    onUpgrade: (upgrade: PendingUpgrade) => void;
}

function PlanCard({
    name, price, period, badge, badgeGold, ring,
    features, priceId, tier, cardStatus, onUpgrade,
}: CardProps) {
    return (
        <div
            className={`relative flex flex-col bg-gray-900 rounded-2xl p-6 border transition-shadow hover:shadow-lg hover:shadow-[#C9A227]/5 ${
                ring ? 'border-[#C9A227] shadow-md shadow-[#C9A227]/10' : 'border-gray-800'
            } ${cardStatus === 'unavailable' ? 'opacity-50' : ''}`}
        >
            {badge && (
                <span className={`absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap ${
                    badgeGold ? 'bg-[#C9A227] text-black' : 'bg-white text-black'
                }`}>
                    {badge}
                </span>
            )}
            {cardStatus === 'current' && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap bg-green-700 text-white">
                    Current Plan
                </span>
            )}

            <h3 className="text-xl font-bold text-white mt-1">{name}</h3>

            <div className="mt-4 mb-6">
                <span className="text-4xl font-extrabold text-white">${price}</span>
                <span className="text-gray-400 text-sm ml-1.5">{period}</span>
            </div>

            <ul className="space-y-0.5 flex-1">
                {features.map((f, i) => <FeatureRow key={i} f={f} />)}
            </ul>

            <div className="mt-8">
                {cardStatus === 'checkout' && (
                    <form action={createCheckoutSession}>
                        <input type="hidden" name="priceId" value={priceId} />
                        <input type="hidden" name="tier" value={tier} />
                        <button
                            type="submit"
                            disabled={!priceId}
                            className="w-full py-3 rounded-xl font-bold transition-colors bg-[#C9A227] text-black hover:bg-[#b8912a] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Get Started
                        </button>
                    </form>
                )}
                {cardStatus === 'upgrade' && (
                    <button
                        onClick={() => onUpgrade({ priceId, planName: name, price, period })}
                        className="w-full py-3 rounded-xl font-bold transition-colors bg-[#C9A227] text-black hover:bg-[#b8912a]"
                    >
                        Upgrade
                    </button>
                )}
                {cardStatus === 'current' && (
                    <div className="w-full py-3 rounded-xl text-center text-sm font-semibold text-green-400 bg-green-900/20 border border-green-800/50">
                        Current Plan
                    </div>
                )}
                {cardStatus === 'unavailable' && (
                    <div className="w-full py-3 rounded-xl text-center text-sm font-semibold text-gray-600 bg-gray-800/50 cursor-not-allowed">
                        Not Available
                    </div>
                )}
            </div>
        </div>
    );
}

/* ── Card status logic ────────────────────────────────────────────── */
function resolveCardStatus(
    cardTier: string,
    tab: Tab,
    activeSub: ActiveSub | null,
): CardStatus {
    if (!activeSub) return 'checkout';

    const currentTier = activeSub.tier;
    const currentRank = tierGroupRank(currentTier);
    const cardRank    = tierGroupRank(cardTier);

    // Cross-type: player ↔ commissioner — treat as checkout (user needs to cancel first)
    const currentIsPlayer = isPlayerTier(currentTier);
    const cardIsPlayer    = tab === 'player';
    if (currentIsPlayer !== cardIsPlayer) return 'checkout';

    if (cardRank > currentRank)  return 'upgrade';
    if (cardRank === currentRank) return 'current';
    return 'unavailable';
}

/* ── Main component ───────────────────────────────────────────────── */
export default function PricingClient({ activeSub }: Props) {
    const router = useRouter();
    const [tab, setTab]       = useState<Tab>('player');
    const [size, setSize]     = useState<TeamSize>(12);
    const [pending, setPending] = useState<PendingUpgrade | null>(null);
    const [upgrading, setUpgrading] = useState(false);
    const [upgradeError, setUpgradeError] = useState<string | null>(null);

    const [proPx, apPx, elPx] = COMM_PRICES[size];

    const hasActiveSub = !!activeSub;
    const hasCrossPlanNote =
        hasActiveSub && (
            (isPlayerTier(activeSub.tier) && tab === 'commissioner') ||
            (isCommTier(activeSub.tier)   && tab === 'player')
        );

    function handleUpgradeClick(upgrade: PendingUpgrade) {
        setUpgradeError(null);
        setPending(upgrade);
    }

    async function handleUpgradeConfirm() {
        if (!pending) return;
        setUpgrading(true);
        setUpgradeError(null);
        try {
            const res = await fetch('/api/stripe/upgrade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priceId: pending.priceId }),
            });
            const data = await res.json() as { success?: boolean; error?: string };
            if (!res.ok) {
                setUpgradeError(data.error ?? 'Upgrade failed. Please try again.');
                return;
            }
            setPending(null);
            router.push('/dashboard?upgraded=1');
        } catch {
            setUpgradeError('Network error. Please try again.');
        } finally {
            setUpgrading(false);
        }
    }

    return (
        <>
            {pending && (
                <UpgradeModal
                    pending={pending}
                    onCancel={() => { if (!upgrading) setPending(null); }}
                    onConfirm={() => { void handleUpgradeConfirm(); }}
                    loading={upgrading}
                    error={upgradeError}
                />
            )}

            <section className="min-h-screen bg-gray-950 pt-28 pb-20 px-4">
                <div className="max-w-6xl mx-auto">
                    {/* Header */}
                    <div className="text-center mb-10">
                        <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4">Choose Your Plan</h1>
                        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                            Cross-platform access · Unlimited league syncing · One price per year
                        </p>
                    </div>

                    {/* Tab toggle */}
                    <div className="flex justify-center mb-8">
                        <div className="inline-flex bg-gray-900 rounded-full p-1 border border-gray-800">
                            <button
                                onClick={() => setTab('player')}
                                className={`px-6 py-2 rounded-full text-sm font-semibold transition-colors ${
                                    tab === 'player' ? 'bg-[#C9A227] text-black' : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                Player Plans
                            </button>
                            <button
                                onClick={() => setTab('commissioner')}
                                className={`px-6 py-2 rounded-full text-sm font-semibold transition-colors ${
                                    tab === 'commissioner' ? 'bg-[#C9A227] text-black' : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                Commissioner Plans
                            </button>
                        </div>
                    </div>

                    {/* Cross-plan-type note */}
                    {hasCrossPlanNote && (
                        <div className="max-w-5xl mx-auto mb-6">
                            <div className="bg-gray-900 border border-gray-700 rounded-xl px-5 py-3 text-sm text-gray-400 text-center">
                                You have an active {isPlayerTier(activeSub!.tier) ? 'Player' : 'Commissioner'} plan.
                                To switch plan types, cancel your current subscription from your{' '}
                                <a href="/dashboard" className="text-[#C9A227] hover:underline">dashboard</a> first.
                            </div>
                        </div>
                    )}

                    {/* Size selector — commissioner only */}
                    {tab === 'commissioner' && (
                        <div className="mb-10 max-w-5xl mx-auto">
                            <p className="text-center text-gray-400 text-sm font-medium mb-3">League Size</p>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                {TEAM_SIZES.map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setSize(s)}
                                        className={`py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                                            size === s
                                                ? 'bg-[#C9A227] text-black border-[#C9A227]'
                                                : 'bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-600 hover:text-white'
                                        }`}
                                    >
                                        {s} Teams
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Cards */}
                    <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
                        {tab === 'player' ? (
                            <>
                                <PlanCard
                                    name="Pro" price="5.99" period="/yr"
                                    features={PLAYER_PRO_FEATURES}
                                    priceId={PLAYER_PRICE_IDS.pro} tier="PLAYER_PRO"
                                    cardStatus={resolveCardStatus('PLAYER_PRO', tab, activeSub)}
                                    onUpgrade={handleUpgradeClick}
                                />
                                <PlanCard
                                    name="All-Pro" price="10.99" period="/yr"
                                    badge="Most Popular" badgeGold ring
                                    features={PLAYER_ALL_PRO_FEATURES}
                                    priceId={PLAYER_PRICE_IDS.all_pro} tier="PLAYER_ALL_PRO"
                                    cardStatus={resolveCardStatus('PLAYER_ALL_PRO', tab, activeSub)}
                                    onUpgrade={handleUpgradeClick}
                                />
                                <PlanCard
                                    name="Elite" price="17.99" period="/yr"
                                    badge="Full Access"
                                    features={PLAYER_ELITE_FEATURES}
                                    priceId={PLAYER_PRICE_IDS.elite} tier="PLAYER_ELITE"
                                    cardStatus={resolveCardStatus('PLAYER_ELITE', tab, activeSub)}
                                    onUpgrade={handleUpgradeClick}
                                />
                            </>
                        ) : (
                            <>
                                <PlanCard
                                    name="Commissioner Pro" price={proPx} period="/year"
                                    features={COMM_PRO_FEATURES}
                                    priceId={commPriceId('Pro', size)} tier="COMMISSIONER_PRO"
                                    cardStatus={resolveCardStatus('COMMISSIONER_PRO', tab, activeSub)}
                                    onUpgrade={handleUpgradeClick}
                                />
                                <PlanCard
                                    name="Commissioner All-Pro" price={apPx} period="/year"
                                    badge="Most Popular" badgeGold ring
                                    features={COMM_ALL_PRO_FEATURES}
                                    priceId={commPriceId('All-Pro', size)} tier="COMMISSIONER_ALL_PRO"
                                    cardStatus={resolveCardStatus('COMMISSIONER_ALL_PRO', tab, activeSub)}
                                    onUpgrade={handleUpgradeClick}
                                />
                                <PlanCard
                                    name="Commissioner Elite" price={elPx} period="/year"
                                    badge="Full Access"
                                    features={COMM_ELITE_FEATURES}
                                    priceId={commPriceId('Elite', size)} tier="COMMISSIONER_ELITE"
                                    cardStatus={resolveCardStatus('COMMISSIONER_ELITE', tab, activeSub)}
                                    onUpgrade={handleUpgradeClick}
                                />
                            </>
                        )}
                    </div>
                </div>
            </section>
        </>
    );
}
