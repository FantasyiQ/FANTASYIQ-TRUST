'use client';

import { useState } from 'react';
import { createCheckoutSession } from '@/app/actions/stripe';
import catalog from '../../../stripe-catalog-ids.json';

/* ── Types ────────────────────────────────────────────────────────── */
type Tab = 'player' | 'commissioner';
type TeamSize = 8 | 10 | 12 | 14 | 16 | 32;
interface Feature {
  name: string;
  included: boolean;
  inherit?: boolean;
}

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

/* ── Catalog helpers ──────────────────────────────────────────────── */
function findPriceId(name: string): string {
  return catalog.find((p) => p.name === name)?.priceId ?? '';
}

const PLAYER_PRICE_IDS = {
  pro:     findPriceId('Player Pro'),
  all_pro: findPriceId('Player All-Pro'),
  elite:   findPriceId('Player Elite'),
};

function commPriceId(
  tier: 'Pro' | 'All-Pro' | 'Elite',
  size: TeamSize
): string {
  return findPriceId(`Commissioner ${tier} — ${size} Team`);
}

/* ── Feature lists ────────────────────────────────────────────────── */
const PRO_FEATURES: Feature[] = [
  { name: 'Zero Fees', included: true },
  { name: 'League Funds Secured', included: true },
  { name: 'League Dues & Payouts Tracked', included: true },
  { name: 'Immediate Payouts', included: true },
  { name: 'Commissioner Hub', included: true },
  { name: 'Sync Up to 2 Leagues', included: true },
  { name: 'Optimized Lineups', included: true },
  { name: 'Player Rankings & Auction Values', included: true },
  { name: 'Personalized Waiver Wire Strategy', included: false },
  { name: 'Dynamic Trade Calculator', included: false },
  { name: 'Power League Rankings', included: false },
  { name: 'Player Indicators & Mock Drafts', included: false },
  { name: 'Dynamic Mock Drafts', included: false },
  { name: 'League Analysis & Team Builder', included: false },
];

const ALL_PRO_FEATURES: Feature[] = [
  { name: 'Everything in Pro', included: true, inherit: true },
  { name: 'Sync Up to 5 Leagues', included: true },
  { name: 'Personalized Waiver Wire Strategy', included: true },
  { name: 'Dynamic Trade Calculator', included: true },
  { name: 'Power League Rankings', included: true },
  { name: 'Player Indicators & Mock Drafts', included: true },
  { name: 'Dynamic Mock Drafts', included: false },
  { name: 'League Analysis & Team Builder', included: false },
];

const ELITE_FEATURES: Feature[] = [
  { name: 'Everything in All-Pro', included: true, inherit: true },
  { name: 'Unlimited League Syncs', included: true },
  { name: 'Dynamic Mock Drafts', included: true },
  { name: 'League Analysis & Team Builder', included: true },
];

/* ── Sub-components ───────────────────────────────────────────────── */
function FeatureRow({ f }: { f: Feature }) {
  if (f.inherit) {
    return (
      <li className="flex items-center gap-2.5 py-1.5">
        <span className="text-[#C9A227] text-sm">★</span>
        <span className="text-[#C9A227] font-semibold text-sm">{f.name}</span>
      </li>
    );
  }
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
          <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-gray-500 text-sm line-through">{f.name}</span>
        </>
      )}
    </li>
  );
}

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
}

function PlanCard({ name, price, period, badge, badgeGold, ring, features, priceId, tier }: CardProps) {
  return (
    <div
      className={`relative flex flex-col bg-gray-900 rounded-2xl p-6 border transition-shadow hover:shadow-lg hover:shadow-[#C9A227]/5 ${
        ring ? 'border-[#C9A227] shadow-md shadow-[#C9A227]/10' : 'border-gray-800'
      }`}
    >
      {badge && (
        <span
          className={`absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap ${
            badgeGold ? 'bg-[#C9A227] text-black' : 'bg-white text-black'
          }`}
        >
          {badge}
        </span>
      )}

      <h3 className="text-xl font-bold text-white mt-1">{name}</h3>

      <div className="mt-4 mb-6">
        <span className="text-4xl font-extrabold text-white">${price}</span>
        <span className="text-gray-400 text-sm ml-1.5">{period}</span>
      </div>

      <ul className="space-y-0.5 flex-1">
        {features.map((f, i) => (
          <FeatureRow key={i} f={f} />
        ))}
      </ul>

      <form action={createCheckoutSession} className="mt-8">
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
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */
export default function PricingPage() {
  const [tab, setTab] = useState<Tab>('player');
  const [size, setSize] = useState<TeamSize>(12);

  const [proPx, apPx, elPx] = COMM_PRICES[size];

  return (
    <section className="min-h-screen bg-gray-950 pt-28 pb-20 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4">
            Choose Your Plan
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Cross-platform access · Unlimited league syncing · One price per year
          </p>
        </div>

        {/* Tab Toggle */}
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

        {/* Team-size selector (commissioner only) */}
        {tab === 'commissioner' && (
          <div className="flex justify-center mb-10">
            <div className="flex items-center gap-3 flex-wrap justify-center">
              <span className="text-gray-400 text-sm font-medium">League Size:</span>
              <div className="inline-flex bg-gray-900 rounded-lg p-1 border border-gray-800">
                {TEAM_SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                      size === s ? 'bg-[#C9A227] text-black' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {s}T
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
                name="Pro"
                price="5.99"
                period="/yr"
                features={PRO_FEATURES}
                priceId={PLAYER_PRICE_IDS.pro}
                tier="PLAYER_PRO"
              />
              <PlanCard
                name="All-Pro"
                price="10.99"
                period="/yr"
                badge="Most Popular"
                badgeGold
                ring
                features={ALL_PRO_FEATURES}
                priceId={PLAYER_PRICE_IDS.all_pro}
                tier="PLAYER_ALL_PRO"
              />
              <PlanCard
                name="Elite"
                price="17.99"
                period="/yr"
                badge="Full Access"
                features={ELITE_FEATURES}
                priceId={PLAYER_PRICE_IDS.elite}
                tier="PLAYER_ELITE"
              />
            </>
          ) : (
            <>
              <PlanCard
                name="Commissioner Pro"
                price={proPx}
                period="/season"
                features={PRO_FEATURES}
                priceId={commPriceId('Pro', size)}
                tier="COMMISSIONER_PRO"
              />
              <PlanCard
                name="Commissioner All-Pro"
                price={apPx}
                period="/season"
                badge="Most Popular"
                badgeGold
                ring
                features={ALL_PRO_FEATURES}
                priceId={commPriceId('All-Pro', size)}
                tier="COMMISSIONER_ALL_PRO"
              />
              <PlanCard
                name="Commissioner Elite"
                price={elPx}
                period="/season"
                badge="Full Access"
                features={ELITE_FEATURES}
                priceId={commPriceId('Elite', size)}
                tier="COMMISSIONER_ELITE"
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
