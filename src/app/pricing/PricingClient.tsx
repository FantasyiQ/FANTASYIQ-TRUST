'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { createCheckoutSession } from '@/app/actions/stripe';
import catalog from '../../../stripe-catalog-ids.json';
import type { PlayerSub, CommSub } from './types';

/* ── Types ────────────────────────────────────────────────────────── */
type Tab = 'player' | 'commissioner';
type TeamSize = 8 | 10 | 12 | 14 | 16 | 32;
interface Feature { name: string; included: boolean }
type CardStatus = 'checkout' | 'upgrade' | 'current' | 'unavailable';

interface PendingUpgrade {
    priceId: string;
    planName: string;
    price: string;
    period: string;
    sourceStripeSubId: string;
    discountNote?: string; // Explains what happens to the discount after upgrade
}

interface Props {
    playerSub: PlayerSub | null;
    commSubs: CommSub[];
    activeCommCount: number;
    activePlayerLeagueCount: number;
    defaultTab: Tab;
    alreadySubscribed?: boolean;
    checkoutError?: string | null;
}

/* ── Tier helpers ─────────────────────────────────────────────────── */
function tierGroupRank(tier: string): number {
    if (tier === 'PLAYER_PRO')           return 1;
    if (tier === 'PLAYER_ALL_PRO')       return 2;
    if (tier === 'PLAYER_ELITE')         return 3;
    if (tier === 'COMMISSIONER_PRO')     return 4;
    if (tier === 'COMMISSIONER_ALL_PRO') return 5;
    if (tier === 'COMMISSIONER_ELITE')   return 6;
    return 0;
}

/* ── Catalog helpers ──────────────────────────────────────────────── */
const TEAM_SIZES: TeamSize[] = [8, 10, 12, 14, 16, 32];

const COMM_PRICES: Record<TeamSize, [string, string, string]> = {
    8:  ['39.99',  '69.99',  '109.99'],
    10: ['49.99',  '89.99',  '129.99'],
    12: ['59.99',  '104.99', '149.99'],
    14: ['69.99',  '124.99', '169.99'],
    16: ['79.99',  '139.99', '189.99'],
    32: ['159.99', '239.99', '299.99'],
};

// Index 0=Pro, 1=All-Pro, 2=Elite
const TIER_INDEX: Record<string, number> = {
    COMMISSIONER_PRO: 0, COMMISSIONER_ALL_PRO: 1, COMMISSIONER_ELITE: 2,
};

function subPrice(tier: string, leagueSize: number): number {
    const idx = TIER_INDEX[tier] ?? 0;
    return parseFloat(COMM_PRICES[leagueSize as TeamSize]?.[idx] ?? '0');
}

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

/* ── Upgrade modal ────────────────────────────────────────────────── */
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
                <p className="text-gray-500 text-xs mb-4">
                    You&apos;ll be charged the prorated difference immediately. Your new plan takes effect right away.
                </p>
                {pending.discountNote && (
                    <div className="mb-4 px-4 py-3 bg-[#C9A227]/10 border border-[#C9A227]/30 rounded-lg text-[#C9A227] text-xs leading-relaxed">
                        {pending.discountNote}
                    </div>
                )}
                {error && (
                    <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
                        {error}
                    </div>
                )}
                <div className="flex gap-3">
                    <button onClick={onCancel} disabled={loading}
                        className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-300 font-semibold text-sm hover:border-gray-500 transition disabled:opacity-50">
                        Cancel
                    </button>
                    <button onClick={onConfirm} disabled={loading}
                        className="flex-1 py-2.5 rounded-xl bg-[#C9A227] text-black font-bold text-sm hover:bg-[#b8912a] transition disabled:opacity-50">
                        {loading ? 'Upgrading…' : 'Confirm Upgrade'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ── Plan card ────────────────────────────────────────────────────── */
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
    // For commissioner cards: the stripe sub ID to upgrade from (if upgrading)
    sourceStripeSubId?: string;
    leagueLimitNote?: string;  // e.g. "Up to 2 Leagues"
    atLeagueLimit?: boolean;   // true when user has maxed leagues on this tier
}

function PlanCard({ name, price, period, badge, badgeGold, ring, features, priceId, tier, cardStatus, onUpgrade, sourceStripeSubId, leagueLimitNote, atLeagueLimit }: CardProps) {
    return (
        <div className={`relative flex flex-col bg-gray-900 rounded-2xl p-6 border transition-shadow hover:shadow-lg hover:shadow-[#C9A227]/5 ${
            ring ? 'border-[#C9A227] shadow-md shadow-[#C9A227]/10' : 'border-gray-800'
        } ${cardStatus === 'unavailable' ? 'opacity-50' : ''}`}>
            {badge && cardStatus !== 'current' && (
                <span className={`absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap ${
                    badgeGold ? 'bg-[#C9A227] text-black' : 'bg-white text-black'
                }`}>{badge}</span>
            )}
            {cardStatus === 'current' && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap bg-green-700 text-white">
                    Current Plan
                </span>
            )}

            <h3 className="text-xl font-bold text-white mt-1">{name}</h3>
            <div className="mt-4 mb-3">
                <span className="text-4xl font-extrabold text-white">${price}</span>
                <span className="text-gray-400 text-sm ml-1.5">{period}</span>
            </div>
            {leagueLimitNote && (
                <div className="mb-4 flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#C9A227] bg-[#C9A227]/10 border border-[#C9A227]/30 px-2.5 py-1 rounded-full">
                        {leagueLimitNote}
                    </span>
                    {atLeagueLimit && (
                        <span className="text-xs text-yellow-500/70">League slots full</span>
                    )}
                </div>
            )}

            <ul className="space-y-0.5 flex-1">
                {features.map((f, i) => <FeatureRow key={i} f={f} />)}
            </ul>

            <div className="mt-8">
                {cardStatus === 'checkout' && (
                    <form action={createCheckoutSession}>
                        <input type="hidden" name="priceId" value={priceId} />
                        <input type="hidden" name="tier" value={tier} />
                        <input type="hidden" name="leagueName" value="" />
                        <button type="submit" disabled={!priceId}
                            className="w-full py-3 rounded-xl font-bold transition-colors bg-[#C9A227] text-black hover:bg-[#b8912a] disabled:opacity-50 disabled:cursor-not-allowed">
                            Get Started
                        </button>
                    </form>
                )}
                {cardStatus === 'upgrade' && (
                    <button
                        onClick={() => onUpgrade({ priceId, planName: name, price, period, sourceStripeSubId: sourceStripeSubId! })}
                        className="w-full py-3 rounded-xl font-bold transition-colors bg-[#C9A227] text-black hover:bg-[#b8912a]">
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

/* ── Commissioner plan card ───────────────────────────────────────── */
interface CommCardProps {
    name: string;
    price: string;
    period: string;
    badge?: string;
    badgeGold?: boolean;
    ring?: boolean;
    features: Feature[];
    priceId: string;
    tier: string;
    leagueName: string;
    discountPct: number;
    discountRedirectNote?: string;
    cardStatus: CardStatus;
    sourceStripeSubId?: string;
    onUpgrade: (upgrade: PendingUpgrade) => void;
}

function CommPlanCard({ name, price, period, badge, badgeGold, ring, features, priceId, tier, leagueName, discountPct, discountRedirectNote, cardStatus, sourceStripeSubId, onUpgrade }: CommCardProps) {
    const canCheckout = leagueName.trim().length > 0 && !!priceId;

    // Discounted price display — only when discount lands HERE, not on an existing plan
    let displayPrice = price;
    if (discountPct > 0 && !discountRedirectNote) {
        const numeric = parseFloat(price);
        const discounted = (numeric * (1 - discountPct / 100)).toFixed(2);
        displayPrice = discounted;
    }

    return (
        <div className={`relative flex flex-col bg-gray-900 rounded-2xl p-6 border transition-shadow hover:shadow-lg hover:shadow-[#C9A227]/5 ${
            ring ? 'border-[#C9A227] shadow-md shadow-[#C9A227]/10' : 'border-gray-800'
        }`}>
            {badge && (
                <span className={`absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap ${
                    badgeGold ? 'bg-[#C9A227] text-black' : 'bg-white text-black'
                }`}>{badge}</span>
            )}

            <h3 className="text-xl font-bold text-white mt-1">{name}</h3>
            <div className="mt-4 mb-1">
                {discountPct > 0 && !discountRedirectNote ? (
                    <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-extrabold text-white">${displayPrice}</span>
                        <span className="text-gray-500 text-sm line-through">${price}</span>
                        <span className="text-gray-400 text-sm ml-0.5">{period}</span>
                    </div>
                ) : (
                    <div>
                        <span className="text-4xl font-extrabold text-white">${price}</span>
                        <span className="text-gray-400 text-sm ml-1.5">{period}</span>
                    </div>
                )}
                {discountPct > 0 && !discountRedirectNote && (
                    <span className="inline-block mt-1.5 text-xs font-semibold bg-green-900/40 text-green-400 border border-green-800 px-2 py-0.5 rounded-full">
                        {discountPct}% multi-league discount
                    </span>
                )}
                {discountRedirectNote && (
                    <p className="mt-2 text-xs text-[#C9A227]/80 bg-[#C9A227]/8 border border-[#C9A227]/20 rounded-lg px-3 py-2 leading-snug">
                        {discountRedirectNote}
                    </p>
                )}
            </div>

            <ul className="space-y-0.5 flex-1 mt-4">
                {features.map((f, i) => <FeatureRow key={i} f={f} />)}
            </ul>

            <div className="mt-8">
                {cardStatus === 'checkout' && (
                    <>
                        <form action={createCheckoutSession}>
                            <input type="hidden" name="priceId" value={priceId} />
                            <input type="hidden" name="tier" value={tier} />
                            <input type="hidden" name="leagueName" value={leagueName.trim()} />
                            <button type="submit" disabled={!canCheckout}
                                className="w-full py-3 rounded-xl font-bold transition-colors bg-[#C9A227] text-black hover:bg-[#b8912a] disabled:opacity-40 disabled:cursor-not-allowed"
                                title={!leagueName.trim() ? 'Enter your league name above' : undefined}>
                                Get Started
                            </button>
                        </form>
                        {!leagueName.trim() && (
                            <p className="text-center text-gray-600 text-xs mt-2">Enter league name to continue</p>
                        )}
                    </>
                )}
                {cardStatus === 'upgrade' && (
                    <button
                        onClick={() => onUpgrade({ priceId, planName: name, price, period, sourceStripeSubId: sourceStripeSubId! })}
                        className="w-full py-3 rounded-xl font-bold transition-colors bg-[#C9A227] text-black hover:bg-[#b8912a]">
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

/* ── Status logic ─────────────────────────────────────────────────── */
function resolvePlayerCardStatus(cardTier: string, playerSub: PlayerSub | null): CardStatus {
    if (!playerSub) return 'checkout';
    const currentRank = tierGroupRank(playerSub.tier);
    const cardRank    = tierGroupRank(cardTier);
    if (cardRank > currentRank)  return 'upgrade';
    if (cardRank === currentRank) return 'current';
    return 'unavailable';
}

function resolveCommCardStatus(cardTier: string, size: TeamSize, commSubs: CommSub[]): CardStatus {
    const match = commSubs.find(s => s.leagueSize === size);
    if (!match) return 'checkout';  // No sub for this size — new purchase
    const currentRank = tierGroupRank(match.tier);
    const cardRank    = tierGroupRank(cardTier);
    if (cardRank > currentRank)  return 'upgrade';
    if (cardRank === currentRank) return 'current';
    return 'unavailable';
}

/* ── Main component ───────────────────────────────────────────────── */
export default function PricingClient({ playerSub, commSubs, activeCommCount, activePlayerLeagueCount, defaultTab, alreadySubscribed, checkoutError }: Props) {
    const { update: updateSession } = useSession();
    const [tab, setTab]       = useState<Tab>(defaultTab);
    const [size, setSize]     = useState<TeamSize>(12);
    const [leagueName, setLeagueName] = useState('');
    const [pending, setPending]       = useState<PendingUpgrade | null>(null);
    const [upgrading, setUpgrading]   = useState(false);
    const [upgradeError, setUpgradeError] = useState<string | null>(null);

    const [proPx, apPx, elPx] = COMM_PRICES[size];

    // 1st league = full price, 2nd = 10%, 3rd+ = 15%
    const discountPct = activeCommCount >= 2 ? 15 : activeCommCount === 1 ? 10 : 0;

    // Which sizes have an active commissioner subscription
    const activeSizes = new Set(commSubs.map(s => s.leagueSize));

    // Find cheapest existing commissioner plan that would absorb the discount
    // instead of the new plan (to prevent gaming via cheap-plan stacking).
    const cheapestExistingSub = discountPct > 0
        ? commSubs
            .map(s => ({ ...s, price: subPrice(s.tier, s.leagueSize) }))
            .sort((a, b) => a.price - b.price)
            .find(s => s.discountPct < discountPct) ?? null
        : null;

    function discountNoteFor(newPlanPrice: number): string | undefined {
        if (!cheapestExistingSub) return undefined;
        if (cheapestExistingSub.price >= newPlanPrice) return undefined;
        const saving = (cheapestExistingSub.price * discountPct / 100).toFixed(2);
        const label = cheapestExistingSub.leagueName ?? 'your cheapest league';
        return `Your ${discountPct}% discount will be applied to "${label}" (saving $${saving}/yr) — this plan is charged at full price.`;
    }

    // For commissioner plan upgrades: explain what happens to the discount
    function upgradeDiscountNote(upgradingSubId: string, newTier: string): string | undefined {
        if (activeCommCount < 2) return undefined;
        const upgradingSub = commSubs.find(s => s.stripeSubscriptionId === upgradingSubId);
        if (!upgradingSub) return undefined;

        const newPrice = subPrice(newTier, upgradingSub.leagueSize);
        const others = commSubs.filter(s => s.stripeSubscriptionId !== upgradingSubId);
        const cheapestOther = others
            .map(s => ({ ...s, price: subPrice(s.tier, s.leagueSize) }))
            .sort((a, b) => a.price - b.price)[0];

        if (!cheapestOther) return undefined;

        const targetPct = activeCommCount >= 4 ? 25 : 15;

        if (newPrice > cheapestOther.price) {
            // Upgraded plan is no longer cheapest — discount moves to cheapest other
            const saving = (cheapestOther.price * targetPct / 100).toFixed(2);
            const label = cheapestOther.leagueName ?? 'your cheapest league';
            return `After upgrading, your ${targetPct}% multi-league discount moves to "${label}" (saving $${saving}/yr). This plan will be charged at full price.`;
        }

        if (upgradingSub.discountPct > 0 && newPrice <= cheapestOther.price) {
            // Upgraded plan stays cheapest — discount stays here
            const saving = (newPrice * targetPct / 100).toFixed(2);
            return `Your ${targetPct}% multi-league discount stays on this plan after upgrading (saving $${saving}/yr on the new price).`;
        }

        return undefined;
    }

    function handleUpgradeClick(upgrade: PendingUpgrade) {
        setUpgradeError(null);
        // Attach discount note for commissioner upgrades so the modal informs the customer
        // Derive tier from catalog name embedded in the plan name (e.g. "Commissioner Elite")
        const newTier =
            upgrade.planName.includes('Elite')   ? 'COMMISSIONER_ELITE'
          : upgrade.planName.includes('All-Pro') ? 'COMMISSIONER_ALL_PRO'
          : upgrade.planName.includes('Pro')     ? 'COMMISSIONER_PRO'
          : '';
        const note = upgrade.sourceStripeSubId && newTier
            ? upgradeDiscountNote(upgrade.sourceStripeSubId, newTier)
            : undefined;
        setPending({ ...upgrade, discountNote: note });
    }

    async function handleUpgradeConfirm() {
        if (!pending) return;
        setUpgrading(true);
        setUpgradeError(null);
        try {
            const res = await fetch('/api/stripe/upgrade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    priceId: pending.priceId,
                    stripeSubscriptionId: pending.sourceStripeSubId,
                }),
            });
            const data = await res.json() as { success?: boolean; error?: string };
            if (!res.ok) {
                setUpgradeError(data.error ?? 'Upgrade failed. Please try again.');
                return;
            }
            setPending(null);
            await updateSession();
            window.location.href = '/dashboard?upgraded=1';
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
                    {/* Error notices */}
                    {alreadySubscribed && (
                        <div className="mb-8 px-4 py-3 bg-yellow-900/20 border border-yellow-800/50 rounded-xl text-yellow-400 text-sm text-center">
                            You already have a Player plan. Use <strong>Upgrade</strong> below to change tiers.
                        </div>
                    )}
                    {checkoutError && (
                        <div className="mb-8 px-4 py-3 bg-red-900/20 border border-red-800/50 rounded-xl text-red-400 text-sm text-center">
                            {checkoutError}
                        </div>
                    )}

                    {/* Header */}
                    <div className="text-center mb-10">
                        <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4">Choose Your Plan</h1>
                        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                            Cross-platform access · Zero Fees Guaranteed · League Dues Protected
                        </p>
                    </div>

                    {/* Tab toggle */}
                    <div className="flex justify-center mb-8">
                        <div className="inline-flex bg-gray-900 rounded-full p-1 border border-gray-800">
                            <button onClick={() => setTab('player')}
                                className={`px-6 py-2 rounded-full text-sm font-semibold transition-colors ${
                                    tab === 'player' ? 'bg-[#C9A227] text-black' : 'text-gray-400 hover:text-white'
                                }`}>
                                Player Plans
                            </button>
                            <button onClick={() => setTab('commissioner')}
                                className={`px-6 py-2 rounded-full text-sm font-semibold transition-colors ${
                                    tab === 'commissioner' ? 'bg-[#C9A227] text-black' : 'text-gray-400 hover:text-white'
                                }`}>
                                Commissioner Plans
                            </button>
                        </div>
                    </div>

                    {/* Commissioner: size selector + league name input */}
                    {tab === 'commissioner' && (
                        <div className="mb-10 max-w-5xl mx-auto space-y-6">
                            {/* Multi-League Savings callout */}
                            {discountPct > 0 && (
                                <div className="bg-[#C9A227]/10 border border-[#C9A227]/30 rounded-xl px-5 py-3 text-sm text-center space-y-0.5">
                                    <p>
                                        <span className="text-[#C9A227] font-bold">Multi-League Savings: </span>
                                        <span className="text-gray-300">{discountPct}% off applied to your cheapest league</span>
                                    </p>
                                    {cheapestExistingSub && (
                                        <p className="text-gray-500 text-xs">
                                            Currently saving on{' '}
                                            <span className="text-gray-300">{cheapestExistingSub.leagueName ?? 'your cheapest league'}</span>
                                            {' '}— adding a pricier league won&apos;t move this discount.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* League name input */}
                            <div>
                                <label htmlFor="leagueName" className="block text-center text-gray-400 text-sm font-medium mb-2">
                                    League Name <span className="text-red-400">*</span>
                                </label>
                                <input
                                    id="leagueName"
                                    type="text"
                                    value={leagueName}
                                    onChange={e => setLeagueName(e.target.value)}
                                    placeholder="e.g. Monday Night Mayhem"
                                    maxLength={80}
                                    className="block mx-auto w-full max-w-sm bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#C9A227]/60"
                                />
                            </div>

                            {/* Size picker */}
                            <div>
                                <p className="text-center text-gray-400 text-sm font-medium mb-3">League Size</p>
                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                    {TEAM_SIZES.map((s) => (
                                        <button key={s} onClick={() => setSize(s)}
                                            className={`relative py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                                                size === s
                                                    ? 'bg-[#C9A227] text-black border-[#C9A227]'
                                                    : 'bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-600 hover:text-white'
                                            }`}>
                                            {s} Teams
                                            {activeSizes.has(s) && (
                                                <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-950" title="Active plan" />
                                            )}
                                        </button>
                                    ))}
                                </div>
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
                                    cardStatus={resolvePlayerCardStatus('PLAYER_PRO', playerSub)}
                                    sourceStripeSubId={playerSub?.stripeSubscriptionId}
                                    onUpgrade={handleUpgradeClick}
                                    leagueLimitNote="Up to 2 Leagues"
                                    atLeagueLimit={resolvePlayerCardStatus('PLAYER_PRO', playerSub) === 'current' && activePlayerLeagueCount >= 2}
                                />
                                <PlanCard
                                    name="All-Pro" price="10.99" period="/yr"
                                    badge="Most Popular" badgeGold ring
                                    features={PLAYER_ALL_PRO_FEATURES}
                                    priceId={PLAYER_PRICE_IDS.all_pro} tier="PLAYER_ALL_PRO"
                                    cardStatus={resolvePlayerCardStatus('PLAYER_ALL_PRO', playerSub)}
                                    sourceStripeSubId={playerSub?.stripeSubscriptionId}
                                    onUpgrade={handleUpgradeClick}
                                    leagueLimitNote="Up to 5 Leagues"
                                    atLeagueLimit={resolvePlayerCardStatus('PLAYER_ALL_PRO', playerSub) === 'current' && activePlayerLeagueCount >= 5}
                                />
                                <PlanCard
                                    name="Elite" price="17.99" period="/yr"
                                    badge="Full Access"
                                    features={PLAYER_ELITE_FEATURES}
                                    priceId={PLAYER_PRICE_IDS.elite} tier="PLAYER_ELITE"
                                    cardStatus={resolvePlayerCardStatus('PLAYER_ELITE', playerSub)}
                                    sourceStripeSubId={playerSub?.stripeSubscriptionId}
                                    onUpgrade={handleUpgradeClick}
                                    leagueLimitNote="Unlimited Leagues"
                                />
                            </>
                        ) : (
                            <>
                                <CommPlanCard
                                    name="Commissioner Pro" price={proPx} period="/year"
                                    features={COMM_PRO_FEATURES}
                                    priceId={commPriceId('Pro', size)} tier="COMMISSIONER_PRO"
                                    leagueName={leagueName}
                                    discountPct={discountPct}
                                    discountRedirectNote={discountNoteFor(parseFloat(proPx))}
                                    cardStatus={resolveCommCardStatus('COMMISSIONER_PRO', size, commSubs)}
                                    sourceStripeSubId={commSubs.find(s => s.leagueSize === size)?.stripeSubscriptionId}
                                    onUpgrade={handleUpgradeClick}
                                />
                                <CommPlanCard
                                    name="Commissioner All-Pro" price={apPx} period="/year"
                                    badge="Most Popular" badgeGold ring
                                    features={COMM_ALL_PRO_FEATURES}
                                    priceId={commPriceId('All-Pro', size)} tier="COMMISSIONER_ALL_PRO"
                                    leagueName={leagueName}
                                    discountPct={discountPct}
                                    discountRedirectNote={discountNoteFor(parseFloat(apPx))}
                                    cardStatus={resolveCommCardStatus('COMMISSIONER_ALL_PRO', size, commSubs)}
                                    sourceStripeSubId={commSubs.find(s => s.leagueSize === size)?.stripeSubscriptionId}
                                    onUpgrade={handleUpgradeClick}
                                />
                                <CommPlanCard
                                    name="Commissioner Elite" price={elPx} period="/year"
                                    badge="Full Access"
                                    features={COMM_ELITE_FEATURES}
                                    priceId={commPriceId('Elite', size)} tier="COMMISSIONER_ELITE"
                                    leagueName={leagueName}
                                    discountPct={discountPct}
                                    discountRedirectNote={discountNoteFor(parseFloat(elPx))}
                                    cardStatus={resolveCommCardStatus('COMMISSIONER_ELITE', size, commSubs)}
                                    sourceStripeSubId={commSubs.find(s => s.leagueSize === size)?.stripeSubscriptionId}
                                    onUpgrade={handleUpgradeClick}
                                />
                            </>
                        )}
                    </div>

                    {/* Commissioner: add-another note */}
                    {tab === 'commissioner' && commSubs.length > 0 && (
                        <p className="text-center text-gray-500 text-sm mt-8">
                            Each commissioner plan covers one league. Select a different size above to add another league.
                        </p>
                    )}
                </div>
            </section>
        </>
    );
}
