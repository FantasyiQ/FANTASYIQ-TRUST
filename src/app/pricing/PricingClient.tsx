'use client';

import { useState, useId } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { createCheckoutSession } from '@/app/actions/stripe';
import catalog from '../../../stripe-catalog-ids.json';
import type { PlayerSub, CommSub } from './types';

/* ── Types ────────────────────────────────────────────────────────── */
type Tab = 'player' | 'commissioner';
type TeamSize = 8 | 10 | 12 | 14 | 16 | 32;
interface Feature { name: string; included: boolean; tooltip?: string }
type CardStatus = 'checkout' | 'upgrade' | 'current' | 'unavailable';

interface PendingUpgrade {
    priceId: string;
    planName: string;
    price: string;
    period: string;
    sourceStripeSubId: string;
}

interface Props {
    playerSub: PlayerSub | null;
    commSubs: CommSub[];
    activeCommCount: number;
    activePlayerLeagueCount: number;
    defaultTab: Tab;
    defaultSize?: number | null;
    defaultLeagueName?: string;
    newLeague?: boolean;
    alreadySubscribed?: boolean;
    checkoutError?: string | null;
    returnTo?: string | null;
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

// [Pro, All-Pro, Elite]
const COMM_PRICES: Record<TeamSize, [string, string, string]> = {
    8:  ['44.99',  '54.99',  '64.99' ],
    10: ['54.99',  '64.99',  '74.99' ],
    12: ['64.99',  '74.99',  '84.99' ],
    14: ['74.99',  '84.99',  '94.99' ],
    16: ['84.99',  '94.99',  '104.99'],
    32: ['164.99', '174.99', '184.99'],
};

// Index 0=Pro, 1=All-Pro, 2=Elite
const TIER_INDEX: Record<string, number> = {
    COMMISSIONER_PRO: 0, COMMISSIONER_ALL_PRO: 1, COMMISSIONER_ELITE: 2,
};

function subPrice(tier: string, leagueSize: number): number {
    const idx = TIER_INDEX[tier] ?? 0;
    return parseFloat(COMM_PRICES[leagueSize as TeamSize]?.[idx] ?? '0');
}

function proAvailable(_size: TeamSize): boolean {
    return true;
}

function findPriceId(name: string): string {
    return catalog.find((p) => p.name === name)?.priceId ?? '';
}

const PLAYER_PRICE_IDS = {
    pro:      findPriceId('Player Pro'),
    all_pro:  findPriceId('Player All-Pro'),
    elite:    findPriceId('Player Elite'),
};

function commPriceId(tier: 'Pro' | 'All-Pro' | 'Elite', size: TeamSize): string {
    return findPriceId(`Commissioner ${tier} — ${size} Team`);
}

/* ── Feature lists ────────────────────────────────────────────────── */
const FEATURE_TOOLTIPS: Record<string, string> = {
    'Zero Fees':                     'No transaction fees on dues collection or payouts. What your league collects is what it keeps.',
    'League Funds Secured':          'League money is held securely through Stripe with bank-level, 256-bit encryption.',
    'League Dues & Payouts Tracked': 'Full visibility into who has paid, who owes, and a complete audit trail of every dollar.',
    'Immediate Payouts':             'Once the commissioner approves payouts, winners are paid out instantly with no delays.',
    'Commissioner Hub':              'Full commissioner toolset — manage dues, payouts, polls, announcements, and league documents.',
    'League Finder':                 'Discover and join new fantasy leagues, or list yours to attract competitive players from the FiQ community.',
    'Commish Reviews':               'Rate and review commissioners after each season. Helps the community identify great leagues — and flag ones to avoid.',
    'Dynasty Skill Score (DSS)': 'DSS measures your long-term dynasty performance — roster strength, draft efficiency, trade impact, lineup optimization, and season-over-season improvement. It reflects dynasty skill, not just win totals.',
    'Platform Handles':              'Link your Sleeper, ESPN, Yahoo, and NFL Fantasy handles to your FiQ profile so commissioners and league-mates can find and verify you across platforms.',
    'Weekly DFS Challenge':          'Compete in weekly DFS contests against other FiQ members for bragging rights and leaderboard glory.',
    'Optimized Lineups':             'Every week FiQ scans your roster and surfaces the highest-projected valid lineup — with a one-click swap summary.',
    'Waiver Wire Intelligence':      'Every week FiQ scans every free agent in your league and tells you exactly which pickups would improve your optimized lineup — and by how much.',
    'Start/Sit Intelligence':        'Compares projections, matchup difficulty, injury risk, volatility, and win probability impact to recommend your best lineup each week.',
    'Draft Strategy':                'Personalized draft prep — tier-based rankings and round-by-round guidance to help you draft with confidence.',
    'Draft Report':                  'Post-draft grade card analyzing your picks against ADP and projected value.',
    'Player Rankings':               'Values adjust for age curve, position scarcity, and your league\'s roster construction and scoring settings — updated regularly throughout the season.',
    'Team DTV Rankings':             'Ranks every team by their total roster trade value. Each team is graded Elite, Contender, Competitive, or Rebuilding so you always know where you stand.',
    'League Power Rankings':         'Weekly power score blending win percentage (40%), points scored (30%), and total roster DTV (30%) — a truer picture than standings alone.',
    'Dynamic Trade Evaluator':       'Real-time trade analysis that shows you exactly who wins and loses before you accept.',
    'Trade Insights':                'Each week FiQ surfaces win-win 1-for-1 trades between teams — simulating every eligible swap and keeping only the ones that improve both rosters\' optimized projected lineups simultaneously.',
    'Roster Intelligence':           'RosteriQ grades your team A–D each week, maps positional strengths and weaknesses against league averages, tracks bench depth, and recommends your best path forward.',
    'Live Draft':                    'Real-time draft board that ranks available players by FiQ score so you always know who the best pick is.',
};

function tip(name: string): string | undefined {
    return FEATURE_TOOLTIPS[name];
}

const PLAYER_PRO_FEATURES: Feature[] = [
    { name: 'Sync Up to 2 Leagues',          included: true,  tooltip: 'Connect up to 2 fantasy leagues from Sleeper, ESPN, Yahoo, or NFL Fantasy.' },
    { name: 'League Finder',                 included: true,  tooltip: tip('League Finder') },
    { name: 'Commish Reviews',               included: true,  tooltip: tip('Commish Reviews') },
    { name: 'Dynasty Skill Score (DSS) — Coming Soon', included: true,  tooltip: 'DSS will measure your long-term dynasty skill — roster strength, draft efficiency, trade impact, lineup optimization, and season-over-season improvement. Launching soon.' },
    { name: 'Platform Handles',              included: true,  tooltip: tip('Platform Handles') },
    { name: 'Weekly DFS Challenge',          included: true,  tooltip: tip('Weekly DFS Challenge') },
    { name: 'Optimized Lineups',             included: false, tooltip: tip('Optimized Lineups') },
    { name: 'Waiver Wire Intelligence',      included: false, tooltip: tip('Waiver Wire Intelligence') },
    { name: 'Start/Sit Intelligence',        included: false, tooltip: tip('Start/Sit Intelligence') },
    { name: 'Draft Strategy',                included: false, tooltip: tip('Draft Strategy') },
    { name: 'Player Rankings',               included: false, tooltip: tip('Player Rankings') },
    { name: 'Team DTV Rankings',             included: false, tooltip: tip('Team DTV Rankings') },
    { name: 'League Power Rankings',         included: false, tooltip: tip('League Power Rankings') },
    { name: 'Dynamic Trade Evaluator',       included: false, tooltip: tip('Dynamic Trade Evaluator') },
    { name: 'Trade Insights',                included: false, tooltip: tip('Trade Insights') },
    { name: 'Roster Intelligence',           included: false, tooltip: tip('Roster Intelligence') },
    { name: 'Live Draft',                    included: false, tooltip: tip('Live Draft') },
];

const PLAYER_ALL_PRO_FEATURES: Feature[] = [
    { name: 'Sync Up to 5 Leagues',          included: true,  tooltip: 'Connect up to 5 fantasy leagues from Sleeper, ESPN, Yahoo, or NFL Fantasy.' },
    { name: 'League Finder',                 included: true,  tooltip: tip('League Finder') },
    { name: 'Commish Reviews',               included: true,  tooltip: tip('Commish Reviews') },
    { name: 'Dynasty Skill Score (DSS) — Coming Soon', included: true,  tooltip: 'DSS will measure your long-term dynasty skill — roster strength, draft efficiency, trade impact, lineup optimization, and season-over-season improvement. Launching soon.' },
    { name: 'Platform Handles',              included: true,  tooltip: tip('Platform Handles') },
    { name: 'Weekly DFS Challenge',          included: true,  tooltip: tip('Weekly DFS Challenge') },
    { name: 'Optimized Lineups',             included: true,  tooltip: tip('Optimized Lineups') },
    { name: 'Waiver Wire Intelligence',      included: true,  tooltip: tip('Waiver Wire Intelligence') },
    { name: 'Start/Sit Intelligence',        included: true,  tooltip: tip('Start/Sit Intelligence') },
    { name: 'Draft Strategy',                included: true,  tooltip: tip('Draft Strategy') },
    { name: 'Draft Report',                  included: true,  tooltip: tip('Draft Report') },
    { name: 'Player Rankings',               included: true,  tooltip: tip('Player Rankings') },
    { name: 'Team DTV Rankings',             included: true,  tooltip: tip('Team DTV Rankings') },
    { name: 'League Power Rankings',         included: true,  tooltip: tip('League Power Rankings') },
    { name: 'Dynamic Trade Evaluator',       included: true,  tooltip: tip('Dynamic Trade Evaluator') },
    { name: 'Trade Insights',                included: false, tooltip: tip('Trade Insights') },
    { name: 'Roster Intelligence',           included: false, tooltip: tip('Roster Intelligence') },
    { name: 'Live Draft',                    included: false, tooltip: tip('Live Draft') },
];

const PLAYER_ELITE_FEATURES: Feature[] = [
    { name: 'Unlimited League Syncs',        included: true, tooltip: 'Connect unlimited fantasy leagues from Sleeper, ESPN, Yahoo, or NFL Fantasy.' },
    { name: 'League Finder',                 included: true, tooltip: tip('League Finder') },
    { name: 'Commish Reviews',               included: true, tooltip: tip('Commish Reviews') },
    { name: 'Dynasty Skill Score (DSS) — Coming Soon', included: true, tooltip: 'DSS will measure your long-term dynasty skill — roster strength, draft efficiency, trade impact, lineup optimization, and season-over-season improvement. Launching soon.' },
    { name: 'Platform Handles',              included: true, tooltip: tip('Platform Handles') },
    { name: 'Weekly DFS Challenge',          included: true, tooltip: tip('Weekly DFS Challenge') },
    { name: 'Optimized Lineups',             included: true, tooltip: tip('Optimized Lineups') },
    { name: 'Waiver Wire Intelligence',      included: true, tooltip: tip('Waiver Wire Intelligence') },
    { name: 'Start/Sit Intelligence',        included: true, tooltip: tip('Start/Sit Intelligence') },
    { name: 'Draft Strategy',                included: true, tooltip: tip('Draft Strategy') },
    { name: 'Draft Report',                  included: true, tooltip: tip('Draft Report') },
    { name: 'Player Rankings',               included: true, tooltip: tip('Player Rankings') },
    { name: 'Team DTV Rankings',             included: true, tooltip: tip('Team DTV Rankings') },
    { name: 'League Power Rankings',         included: true, tooltip: tip('League Power Rankings') },
    { name: 'Dynamic Trade Evaluator',       included: true, tooltip: tip('Dynamic Trade Evaluator') },
    { name: 'Trade Insights',                included: true, tooltip: tip('Trade Insights') },
    { name: 'Roster Intelligence',           included: true, tooltip: tip('Roster Intelligence') },
    { name: 'Live Draft',                    included: true, tooltip: tip('Live Draft') },
];


const COMM_PRO_FEATURES: Feature[] = [
    { name: 'Zero Fees',                     included: true,  tooltip: tip('Zero Fees') },
    { name: 'League Funds Secured',          included: true,  tooltip: tip('League Funds Secured') },
    { name: 'League Dues & Payouts Tracked', included: true,  tooltip: tip('League Dues & Payouts Tracked') },
    { name: 'Immediate Payouts',             included: true,  tooltip: tip('Immediate Payouts') },
    { name: 'Commissioner Hub',              included: true,  tooltip: tip('Commissioner Hub') },
    { name: 'League Finder',                 included: true,  tooltip: tip('League Finder') },
    { name: 'Commish Reviews',               included: true,  tooltip: tip('Commish Reviews') },
    { name: 'Dynasty Skill Score (DSS) — Coming Soon', included: true,  tooltip: 'DSS will measure your long-term dynasty skill — roster strength, draft efficiency, trade impact, lineup optimization, and season-over-season improvement. Launching soon.' },
    { name: 'Platform Handles',              included: true,  tooltip: tip('Platform Handles') },
    { name: 'Optimized Lineups',             included: false, tooltip: tip('Optimized Lineups') },
    { name: 'Waiver Wire Intelligence',      included: false, tooltip: tip('Waiver Wire Intelligence') },
    { name: 'Start/Sit Intelligence',        included: false, tooltip: tip('Start/Sit Intelligence') },
    { name: 'Player Rankings',               included: false, tooltip: tip('Player Rankings') },
    { name: 'Team DTV Rankings',             included: false, tooltip: tip('Team DTV Rankings') },
    { name: 'League Power Rankings',         included: false, tooltip: tip('League Power Rankings') },
    { name: 'Dynamic Trade Evaluator',       included: false, tooltip: tip('Dynamic Trade Evaluator') },
    { name: 'Trade Insights',                included: false, tooltip: tip('Trade Insights') },
    { name: 'Roster Intelligence',           included: false, tooltip: tip('Roster Intelligence') },
    { name: 'Live Draft',                    included: false, tooltip: tip('Live Draft') },
];

const COMM_ALL_PRO_FEATURES: Feature[] = [
    { name: 'Zero Fees',                     included: true,  tooltip: tip('Zero Fees') },
    { name: 'League Funds Secured',          included: true,  tooltip: tip('League Funds Secured') },
    { name: 'League Dues & Payouts Tracked', included: true,  tooltip: tip('League Dues & Payouts Tracked') },
    { name: 'Immediate Payouts',             included: true,  tooltip: tip('Immediate Payouts') },
    { name: 'Commissioner Hub',              included: true,  tooltip: tip('Commissioner Hub') },
    { name: 'League Finder',                 included: true,  tooltip: tip('League Finder') },
    { name: 'Commish Reviews',               included: true,  tooltip: tip('Commish Reviews') },
    { name: 'Dynasty Skill Score (DSS) — Coming Soon', included: true,  tooltip: 'DSS will measure your long-term dynasty skill — roster strength, draft efficiency, trade impact, lineup optimization, and season-over-season improvement. Launching soon.' },
    { name: 'Platform Handles',              included: true,  tooltip: tip('Platform Handles') },
    { name: 'Optimized Lineups',             included: true,  tooltip: tip('Optimized Lineups') },
    { name: 'Waiver Wire Intelligence',      included: true,  tooltip: tip('Waiver Wire Intelligence') },
    { name: 'Start/Sit Intelligence',        included: true,  tooltip: tip('Start/Sit Intelligence') },
    { name: 'Player Rankings',               included: true,  tooltip: tip('Player Rankings') },
    { name: 'Team DTV Rankings',             included: true,  tooltip: tip('Team DTV Rankings') },
    { name: 'League Power Rankings',         included: true,  tooltip: tip('League Power Rankings') },
    { name: 'Dynamic Trade Evaluator',       included: true,  tooltip: tip('Dynamic Trade Evaluator') },
    { name: 'Trade Insights',                included: false, tooltip: tip('Trade Insights') },
    { name: 'Roster Intelligence',           included: false, tooltip: tip('Roster Intelligence') },
    { name: 'Live Draft',                    included: false, tooltip: tip('Live Draft') },
];

const COMM_ELITE_FEATURES: Feature[] = [
    { name: 'Zero Fees',                     included: true, tooltip: tip('Zero Fees') },
    { name: 'League Funds Secured',          included: true, tooltip: tip('League Funds Secured') },
    { name: 'League Dues & Payouts Tracked', included: true, tooltip: tip('League Dues & Payouts Tracked') },
    { name: 'Immediate Payouts',             included: true, tooltip: tip('Immediate Payouts') },
    { name: 'Commissioner Hub',              included: true, tooltip: tip('Commissioner Hub') },
    { name: 'League Finder',                 included: true, tooltip: tip('League Finder') },
    { name: 'Commish Reviews',               included: true, tooltip: tip('Commish Reviews') },
    { name: 'Dynasty Skill Score (DSS) — Coming Soon', included: true, tooltip: 'DSS will measure your long-term dynasty skill — roster strength, draft efficiency, trade impact, lineup optimization, and season-over-season improvement. Launching soon.' },
    { name: 'Platform Handles',              included: true, tooltip: tip('Platform Handles') },
    { name: 'Optimized Lineups',             included: true, tooltip: tip('Optimized Lineups') },
    { name: 'Waiver Wire Intelligence',      included: true, tooltip: tip('Waiver Wire Intelligence') },
    { name: 'Start/Sit Intelligence',        included: true, tooltip: tip('Start/Sit Intelligence') },
    { name: 'Player Rankings',               included: true, tooltip: tip('Player Rankings') },
    { name: 'Team DTV Rankings',             included: true, tooltip: tip('Team DTV Rankings') },
    { name: 'League Power Rankings',         included: true, tooltip: tip('League Power Rankings') },
    { name: 'Dynamic Trade Evaluator',       included: true, tooltip: tip('Dynamic Trade Evaluator') },
    { name: 'Trade Insights',                included: true, tooltip: tip('Trade Insights') },
    { name: 'Roster Intelligence',           included: true, tooltip: tip('Roster Intelligence') },
    { name: 'Live Draft',                    included: true, tooltip: tip('Live Draft') },
];

/* ── Feature row ──────────────────────────────────────────────────── */
function FeatureRow({ f }: { f: Feature }) {
    return (
        <li className="flex items-center gap-2.5 py-1.5">
            {f.included ? (
                <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            ) : (
                <svg className="w-4 h-4 text-red-500/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            )}
            <span className={`text-sm ${f.included ? 'text-gray-200' : 'text-gray-600'}`}>{f.name}</span>
            {f.tooltip && (
                <span className="relative group ml-auto shrink-0">
                    <svg className="w-3.5 h-3.5 text-gray-600 hover:text-gray-400 cursor-default transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01" />
                    </svg>
                    <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 w-52 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-xs text-gray-300 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl">
                        {f.tooltip}
                    </span>
                </span>
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
    const [acceptTerms, setAcceptTerms] = useState(false);
    const checkboxId = useId();
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-md w-full shadow-2xl">
                <h2 className="text-xl font-bold text-white mb-2">Confirm Upgrade</h2>
                <p className="text-gray-400 text-sm mb-4">
                    Upgrade to <span className="text-white font-semibold">{pending.planName}</span> for{' '}
                    <span className="text-[#D4AF37] font-bold">${pending.price}{pending.period}</span>?
                </p>
                <p className="text-gray-500 text-xs mb-4">
                    You&apos;ll be charged the prorated difference immediately. Your new plan takes effect right away.
                </p>
                <div className="flex items-start gap-2 mb-4">
                    <input
                        id={checkboxId}
                        type="checkbox"
                        checked={acceptTerms}
                        onChange={e => setAcceptTerms(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4AF37] cursor-pointer"
                    />
                    <label htmlFor={checkboxId} className="text-xs text-gray-400 leading-snug cursor-pointer">
                        I agree to the{' '}
                        <Link href="/terms" className="text-[#D4AF37] underline" target="_blank">Terms of Service</Link>
                        , including the <strong className="text-gray-300">No-Refund Policy</strong>.
                    </label>
                </div>
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
                    <button onClick={onConfirm} disabled={loading || !acceptTerms}
                        className="flex-1 py-2.5 rounded-xl bg-[#D4AF37] text-black font-bold text-sm hover:bg-[#b8912a] transition disabled:opacity-50">
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
    returnTo?: string | null;
}

function PlanCard({ name, price, period, badge, badgeGold, ring, features, priceId, tier, cardStatus, onUpgrade, sourceStripeSubId, leagueLimitNote, atLeagueLimit, returnTo }: CardProps) {
    const [acceptTerms, setAcceptTerms] = useState(false);
    const checkboxId = useId();
    return (
        <div className={`relative flex flex-col bg-gray-900 rounded-2xl p-6 border transition-shadow hover:shadow-lg hover:shadow-[#D4AF37]/5 ${
            ring ? 'border-[#D4AF37] shadow-md shadow-[#D4AF37]/10' : 'border-gray-800'
        } ${cardStatus === 'unavailable' ? 'opacity-50' : ''}`}>
            {badge && cardStatus !== 'current' && (
                <span className={`absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap ${
                    badgeGold ? 'bg-[#D4AF37] text-black' : 'bg-white text-black'
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
                    <span className="text-xs font-semibold text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-2.5 py-1 rounded-full">
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
                        <input type="hidden" name="acceptTerms" value={acceptTerms ? 'true' : 'false'} />
                        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
                        <div className="flex items-start gap-2 mb-3">
                            <input
                                id={checkboxId}
                                type="checkbox"
                                checked={acceptTerms}
                                onChange={e => setAcceptTerms(e.target.checked)}
                                className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4AF37] cursor-pointer"
                            />
                            <label htmlFor={checkboxId} className="text-xs text-gray-400 leading-snug cursor-pointer">
                                I agree to the{' '}
                                <Link href="/terms" className="text-[#D4AF37] underline" target="_blank">Terms of Service</Link>
                                , including the <strong className="text-gray-300">No-Refund Policy</strong>.
                            </label>
                        </div>
                        <button type="submit" disabled={!priceId || !acceptTerms}
                            className="w-full py-3 rounded-xl font-bold transition-colors bg-[#D4AF37] text-black hover:bg-[#b8912a] disabled:opacity-40 disabled:cursor-not-allowed">
                            Get Started
                        </button>
                    </form>
                )}
                {cardStatus === 'upgrade' && (
                    <button
                        onClick={() => onUpgrade({ priceId, planName: name, price, period, sourceStripeSubId: sourceStripeSubId! })}
                        className="w-full py-3 rounded-xl font-bold transition-colors bg-[#D4AF37] text-black hover:bg-[#b8912a]">
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
    cardStatus: CardStatus;
    sourceStripeSubId?: string;
    onUpgrade: (upgrade: PendingUpgrade) => void;
    returnTo?: string | null;
}

function CommPlanCard({ name, price, period, badge, badgeGold, ring, features, priceId, tier, leagueName, cardStatus, sourceStripeSubId, onUpgrade, returnTo }: CommCardProps) {
    const [acceptTerms, setAcceptTerms] = useState(false);
    const checkboxId = useId();
    const canCheckout = leagueName.trim().length > 0 && !!priceId && acceptTerms;

    return (
        <div className={`relative flex flex-col bg-gray-900 rounded-2xl p-6 border transition-shadow hover:shadow-lg hover:shadow-[#D4AF37]/5 ${
            ring ? 'border-[#D4AF37] shadow-md shadow-[#D4AF37]/10' : 'border-gray-800'
        }`}>
            {badge && (
                <span className={`absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap ${
                    badgeGold ? 'bg-[#D4AF37] text-black' : 'bg-white text-black'
                }`}>{badge}</span>
            )}

            <h3 className="text-xl font-bold text-white mt-1">{name}</h3>
            <div className="mt-4 mb-1">
                <span className="text-4xl font-extrabold text-white">${price}</span>
                <span className="text-gray-400 text-sm ml-1.5">{period}</span>
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
                            <input type="hidden" name="acceptTerms" value={acceptTerms ? 'true' : 'false'} />
                            {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
                            <div className="flex items-start gap-2 mb-3">
                                <input
                                    id={checkboxId}
                                    type="checkbox"
                                    checked={acceptTerms}
                                    onChange={e => setAcceptTerms(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4AF37] cursor-pointer"
                                />
                                <label htmlFor={checkboxId} className="text-xs text-gray-400 leading-snug cursor-pointer">
                                    I agree to the{' '}
                                    <Link href="/terms" className="text-[#D4AF37] underline" target="_blank">Terms of Service</Link>
                                    , including the <strong className="text-gray-300">No-Refund Policy</strong>.
                                </label>
                            </div>
                            <button type="submit" disabled={!canCheckout}
                                className="w-full py-3 rounded-xl font-bold transition-colors bg-[#D4AF37] text-black hover:bg-[#b8912a] disabled:opacity-40 disabled:cursor-not-allowed"
                                title={!leagueName.trim() ? 'Enter your league name above' : !acceptTerms ? 'Accept Terms of Service to continue' : undefined}>
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
                        className="w-full py-3 rounded-xl font-bold transition-colors bg-[#D4AF37] text-black hover:bg-[#b8912a]">
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

function resolveCommCardStatus(cardTier: string, size: TeamSize, commSubs: CommSub[], forceCheckout = false): CardStatus {
    if (forceCheckout) return 'checkout';
    const existing = commSubs.find(s => s.leagueSize === size);
    if (!existing) return 'checkout';
    const currentRank = tierGroupRank(existing.tier);
    const cardRank    = tierGroupRank(cardTier);
    if (cardRank > currentRank)  return 'upgrade';
    if (cardRank === currentRank) return 'current';
    return 'unavailable';
}

/* ── Main component ───────────────────────────────────────────────── */
export default function PricingClient({ playerSub, commSubs, activeCommCount, activePlayerLeagueCount, defaultTab, defaultSize, defaultLeagueName, newLeague, alreadySubscribed, checkoutError, returnTo }: Props) {
    const { update: updateSession } = useSession();
    const [tab, setTab]       = useState<Tab>(defaultTab);
    const [size, setSize]     = useState<TeamSize>((TEAM_SIZES.includes(defaultSize as TeamSize) ? defaultSize : 12) as TeamSize);
    const [leagueName, setLeagueName] = useState(defaultLeagueName ?? '');
    const leagueNameLocked = !!defaultLeagueName;
    const [pending, setPending]       = useState<PendingUpgrade | null>(null);
    const [upgrading, setUpgrading]   = useState(false);
    const [upgradeError, setUpgradeError] = useState<string | null>(null);

    const [proPx, apPx, elPx] = COMM_PRICES[size];

    // Which sizes have an active commissioner subscription
    const activeSizes = new Set(commSubs.map(s => s.leagueSize));

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
                body: JSON.stringify({
                    priceId: pending.priceId,
                    stripeSubscriptionId: pending.sourceStripeSubId,
                }),
            });
            let data: { success?: boolean; error?: string } = {};
            try { data = await res.json() as typeof data; } catch { /* non-JSON response */ }
            if (!res.ok) {
                setUpgradeError(data.error ?? `Upgrade failed (${res.status}). Please try again.`);
                return;
            }
            setPending(null);
            await updateSession();
            window.location.href = '/dashboard?upgraded=1';
        } catch {
            setUpgradeError('Could not reach the server. Check your connection and try again.');
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
                            {checkoutError === 'terms-required'
                                ? 'You must accept the Terms of Service before purchasing.'
                                : checkoutError}
                        </div>
                    )}

                    {/* Header */}
                    <div className="text-center mb-10">
                        <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4">Choose Your Plan</h1>
                        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                            Cross-platform access · Personal analytics for every league you play in
                        </p>
                    </div>

                    {/* Tab toggle */}
                    <div className="flex justify-center mb-8">
                        <div className="inline-flex bg-gray-900 rounded-full p-1 border border-gray-800">
                            <button onClick={() => setTab('player')}
                                className={`px-6 py-2 rounded-full text-sm font-semibold transition-colors ${
                                    tab === 'player' ? 'bg-[#D4AF37] text-black' : 'text-gray-400 hover:text-white'
                                }`}>
                                Player Plans
                            </button>
                            <button onClick={() => setTab('commissioner')}
                                className={`px-6 py-2 rounded-full text-sm font-semibold transition-colors ${
                                    tab === 'commissioner' ? 'bg-[#D4AF37] text-black' : 'text-gray-400 hover:text-white'
                                }`}>
                                Commissioner Plans
                            </button>
                        </div>
                    </div>

                    {/* Player plan explainer */}
                    {tab === 'player' && (
                        <div className="mb-10 max-w-5xl mx-auto bg-gray-900/60 border border-gray-800 rounded-xl px-5 py-4 text-sm text-gray-300 space-y-2">
                            <p><span className="text-white font-semibold">Player Plans are personal — not league-wide.</span> You&apos;re buying analytics tools for yourself, not your entire league.</p>
                            <p><span className="text-[#D4AF37] font-semibold">Already in a commissioner-paid league?</span> You don&apos;t need to buy anything. If your commissioner has a FiQ Commissioner Plan, you already have access to league tools — no purchase required on your end.</p>
                            <p>Player Plans let you sync <span className="text-white font-semibold">any league you play in</span> — regardless of whether that league uses FiQ or not. Use your personal analytics across all your leagues, on any platform (Sleeper, ESPN, Yahoo, NFL Fantasy).</p>
                            <p><span className="text-white font-semibold">Your plan stacks on top of your commissioner&apos;s.</span> If your commissioner has PRO but you have All-Pro, you get <span className="text-[#D4AF37] font-semibold">All-Pro features</span> in that league. Your plan always sets the floor — never a ceiling.</p>
                            <p className="text-gray-500 text-xs pt-1 border-t border-gray-800">Player Plans do not include dues collection, payouts, or commissioner tools. Those are exclusive to Commissioner Plans.</p>
                        </div>
                    )}

                    {/* Commissioner: size selector + league name input */}
                    {tab === 'commissioner' && (
                        <div className="mb-10 max-w-5xl mx-auto space-y-6">

                            {/* How commissioner plans work */}
                            <div className="bg-[#D4AF37]/8 border border-[#D4AF37]/25 rounded-xl px-5 py-4 text-sm text-gray-300 space-y-1.5">
                                <p><span className="text-[#D4AF37] font-semibold">Commissioner Plans cover the entire league.</span> All members get access at no additional cost.</p>
                                <p>Commissioners must send invites for members to join a commissioner‑paid league.</p>
                                <p>Your plan is the <span className="text-white font-semibold">minimum floor for every member</span>. If any member has a higher-tier Player Plan of their own, they keep their higher tier — your plan never caps theirs.</p>
                                <p className="text-gray-500 text-xs pt-1 border-t border-[#D4AF37]/15">Player Plans are optional personal upgrades and are never required to use commissioner‑paid tools.</p>
                            </div>

                            {/* League name input */}
                            <div>
                                <label htmlFor="leagueName" className="block text-center text-gray-400 text-sm font-medium mb-2">
                                    League Name {!leagueNameLocked && <span className="text-red-400">*</span>}
                                </label>
                                {leagueNameLocked ? (
                                    <p className="text-center text-white font-semibold text-sm">{leagueName}</p>
                                ) : (
                                    <input
                                        id="leagueName"
                                        type="text"
                                        value={leagueName}
                                        onChange={e => setLeagueName(e.target.value)}
                                        placeholder="e.g. Monday Night Mayhem"
                                        maxLength={80}
                                        className="block mx-auto w-full max-w-sm bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#D4AF37]/60"
                                    />
                                )}
                            </div>

                            {/* Size picker */}
                            <div>
                                <p className="text-center text-gray-400 text-sm font-medium mb-3">League Size</p>
                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                    {TEAM_SIZES.map((s) => (
                                        <button key={s} onClick={() => setSize(s)}
                                            className={`relative py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                                                size === s
                                                    ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
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
                                    name="Pro" price="9.99" period="/yr"
                                    features={PLAYER_PRO_FEATURES}
                                    priceId={PLAYER_PRICE_IDS.pro} tier="PLAYER_PRO"
                                    cardStatus={resolvePlayerCardStatus('PLAYER_PRO', playerSub)}
                                    sourceStripeSubId={playerSub?.stripeSubscriptionId}
                                    onUpgrade={handleUpgradeClick}
                                    leagueLimitNote="Up to 2 Leagues"
                                    atLeagueLimit={resolvePlayerCardStatus('PLAYER_PRO', playerSub) === 'current' && activePlayerLeagueCount >= 2}
                                    returnTo={returnTo}
                                />
                                <PlanCard
                                    name="All-Pro" price="24.99" period="/yr"
                                    badge="Most Popular" badgeGold ring
                                    features={PLAYER_ALL_PRO_FEATURES}
                                    priceId={PLAYER_PRICE_IDS.all_pro} tier="PLAYER_ALL_PRO"
                                    cardStatus={resolvePlayerCardStatus('PLAYER_ALL_PRO', playerSub)}
                                    sourceStripeSubId={playerSub?.stripeSubscriptionId}
                                    onUpgrade={handleUpgradeClick}
                                    leagueLimitNote="Up to 5 Leagues"
                                    atLeagueLimit={resolvePlayerCardStatus('PLAYER_ALL_PRO', playerSub) === 'current' && activePlayerLeagueCount >= 5}
                                    returnTo={returnTo}
                                />
                                <PlanCard
                                    name="Elite" price="44.99" period="/yr"
                                    badge="Full Access"
                                    features={PLAYER_ELITE_FEATURES}
                                    priceId={PLAYER_PRICE_IDS.elite} tier="PLAYER_ELITE"
                                    cardStatus={resolvePlayerCardStatus('PLAYER_ELITE', playerSub)}
                                    sourceStripeSubId={playerSub?.stripeSubscriptionId}
                                    onUpgrade={handleUpgradeClick}
                                    leagueLimitNote="Unlimited Leagues"
                                    returnTo={returnTo}
                                />
                            </>
                        ) : (
                            <>
                                <CommPlanCard
                                    name="Commissioner Pro" price={proPx} period="/year"
                                    features={COMM_PRO_FEATURES}
                                    priceId={commPriceId('Pro', size)} tier="COMMISSIONER_PRO"
                                    leagueName={leagueName}
                                    cardStatus={proAvailable(size) ? resolveCommCardStatus('COMMISSIONER_PRO', size, commSubs, newLeague) : 'unavailable'}
                                    sourceStripeSubId={commSubs.find(s => s.leagueSize === size)?.stripeSubscriptionId}
                                    onUpgrade={handleUpgradeClick}
                                    returnTo={returnTo}
                                />
                                <CommPlanCard
                                    name="Commissioner All-Pro" price={apPx} period="/year"
                                    badge="Most Popular" badgeGold ring
                                    features={COMM_ALL_PRO_FEATURES}
                                    priceId={commPriceId('All-Pro', size)} tier="COMMISSIONER_ALL_PRO"
                                    leagueName={leagueName}
                                    cardStatus={resolveCommCardStatus('COMMISSIONER_ALL_PRO', size, commSubs, newLeague)}
                                    sourceStripeSubId={commSubs.find(s => s.leagueSize === size)?.stripeSubscriptionId}
                                    onUpgrade={handleUpgradeClick}
                                    returnTo={returnTo}
                                />
                                <CommPlanCard
                                    name="Commissioner Elite" price={elPx} period="/year"
                                    badge="Full Access"
                                    features={COMM_ELITE_FEATURES}
                                    priceId={commPriceId('Elite', size)} tier="COMMISSIONER_ELITE"
                                    leagueName={leagueName}
                                    cardStatus={resolveCommCardStatus('COMMISSIONER_ELITE', size, commSubs, newLeague)}
                                    sourceStripeSubId={commSubs.find(s => s.leagueSize === size)?.stripeSubscriptionId}
                                    onUpgrade={handleUpgradeClick}
                                    returnTo={returnTo}
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
