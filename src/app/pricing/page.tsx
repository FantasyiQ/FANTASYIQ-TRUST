'use client';

import { useState } from 'react';
import Link from 'next/link';

const playerTiers = [
  {
    name: 'Player Pro',
    price: '5.99',
    period: '/yr',
    description: 'Essential tools for the competitive player.',
    features: [
      'Cross-Platform Access',
      'Up to 2 Leagues Synced',
      'Basic Player Rankings',
    ],
    highlight: false,
    badge: null,
  },
  {
    name: 'Player All-Pro',
    price: '10.99',
    period: '/yr',
    description: 'Advanced tools for the serious competitor.',
    features: [
      'Everything in Pro',
      'Up to 5 League Syncs',
      'Dynamic Trade Values',
      'PPR Boost Engine',
    ],
    highlight: true,
    badge: 'Most Popular',
  },
  {
    name: 'Player Elite',
    price: '17.99',
    period: '/yr',
    description: 'The ultimate edge. Every tool. No limits.',
    features: [
      'Everything in All-Pro',
      'Unlimited League Sync',
      'Position Scarcity Multipliers',
    ],
    highlight: false,
    badge: 'Full Access',
  },
];

const teamSizes = ['8', '10', '12', '14', '16', '32'] as const;

const commissionerPricing: Record<string, { pro: string; allPro: string; elite: string }> = {
  '8': { pro: '39.99', allPro: '69.99', elite: '109.99' },
  '10': { pro: '49.99', allPro: '89.99', elite: '129.99' },
  '12': { pro: '59.99', allPro: '104.99', elite: '149.99' },
  '14': { pro: '69.99', allPro: '124.99', elite: '169.99' },
  '16': { pro: '79.99', allPro: '139.99', elite: '189.99' },
  '32': { pro: '159.99', allPro: '239.99', elite: '299.99' },
};

const commissionerTiers = [
  {
    name: 'Commissioner Pro',
    key: 'pro' as const,
    description: 'Run your league with confidence.',
    features: [
      'League Dashboard',
      'Due Collection Tools',
    ],
    highlight: false,
    badge: null,
  },
  {
    name: 'Commissioner All-Pro',
    key: 'allPro' as const,
    description: 'The complete commissioner toolkit.',
    features: [
      'Everything in Pro',
      'Dynamic Trade Chart',
      'Trade Grade Engine',
    ],
    highlight: true,
    badge: 'Most Popular',
  },
  {
    name: 'Commissioner Elite',
    key: 'elite' as const,
    description: 'Maximum power. Maximum trust.',
    features: [
      'Everything in All-Pro',
      'Advanced League Analytics',
      'Priority Support',
    ],
    highlight: false,
    badge: 'Full Access',
  },
];

export default function Pricing() {
  const [activeTab, setActiveTab] = useState<'player' | 'commissioner'>('player');
  const [teamSize, setTeamSize] = useState('12');

  const prices = commissionerPricing[teamSize];

  return (
    <main className="min-h-screen bg-gray-950 text-white pt-24 pb-20">
      {/* Hero */}
      <section className="px-6 mb-16">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block mb-6 px-4 py-1.5 rounded-full border border-[#C9A227]/30 bg-[#C9A227]/10 text-[#C9A227] text-sm font-medium">
            One Price. Every Platform. All Year.
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-4 leading-tight">
            Choose Your <span className="text-[#C9A227]">Plan</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Cross-platform access, unlimited league syncing, one price per year. No hidden fees. No surprises.
          </p>
        </div>
      </section>

      {/* Tab Toggle */}
      <section className="px-6 mb-12">
        <div className="max-w-md mx-auto">
          <div className="flex bg-gray-900 rounded-xl p-1 border border-gray-800">
            <button
              onClick={() => setActiveTab('player')}
              className={`flex-1 py-3 px-4 rounded-lg text-sm font-semibold transition ${
                activeTab === 'player'
                  ? 'bg-[#C9A227] text-gray-950'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Player Plans
            </button>
            <button
              onClick={() => setActiveTab('commissioner')}
              className={`flex-1 py-3 px-4 rounded-lg text-sm font-semibold transition ${
                activeTab === 'commissioner'
                  ? 'bg-[#C9A227] text-gray-950'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Commissioner Plans
            </button>
          </div>
        </div>
      </section>

      {/* Player Plans */}
      {activeTab === 'player' && (
        <section className="px-6 mb-20">
          <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6 items-start">
            {playerTiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative bg-gray-900 rounded-2xl p-8 border ${
                  tier.highlight
                    ? 'border-[#C9A227] shadow-lg shadow-[#C9A227]/10'
                    : 'border-gray-800'
                } hover:border-[#C9A227]/50 transition`}
              >
                {tier.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[#C9A227] text-gray-950 text-xs font-bold px-4 py-1 rounded-full">
                      {tier.badge}
                    </span>
                  </div>
                )}
                <h3 className="text-xl font-bold mb-2">{tier.name}</h3>
                <p className="text-gray-400 text-sm mb-6">{tier.description}</p>
                <div className="mb-8">
                  <span className="text-4xl font-bold">${tier.price}</span>
                  <span className="text-gray-400 text-sm">{tier.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm">
                      <span className="text-[#C9A227] text-lg">&#10003;</span>
                      <span className="text-gray-200">{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className={`w-full py-3 rounded-lg font-semibold transition ${
                    tier.highlight
                      ? 'bg-[#C9A227] hover:bg-[#B8911F] text-gray-950'
                      : 'border border-gray-700 hover:border-[#C9A227] text-white'
                  }`}
                >
                  Get Started
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Commissioner Plans */}
      {activeTab === 'commissioner' && (
        <section className="px-6 mb-20">
          {/* Team Size Selector */}
          <div className="max-w-6xl mx-auto mb-10">
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <span className="text-gray-400 text-sm font-medium">League Size:</span>
              <div className="flex gap-2 flex-wrap justify-center">
                {teamSizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => setTeamSize(size)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                      teamSize === size
                        ? 'bg-[#C9A227] text-gray-950'
                        : 'bg-gray-900 border border-gray-800 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {size} Teams
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6 items-start">
            {commissionerTiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative bg-gray-900 rounded-2xl p-8 border ${
                  tier.highlight
                    ? 'border-[#C9A227] shadow-lg shadow-[#C9A227]/10'
                    : 'border-gray-800'
                } hover:border-[#C9A227]/50 transition`}
              >
                {tier.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[#C9A227] text-gray-950 text-xs font-bold px-4 py-1 rounded-full">
                      {tier.badge}
                    </span>
                  </div>
                )}
                <h3 className="text-xl font-bold mb-2">{tier.name}</h3>
                <p className="text-gray-400 text-sm mb-6">{tier.description}</p>
                <div className="mb-2">
                  <span className="text-4xl font-bold">${prices[tier.key]}</span>
                  <span className="text-gray-400 text-sm">/yr</span>
                </div>
                <p className="text-gray-500 text-xs mb-8">{teamSize}-team league</p>
                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm">
                      <span className="text-[#C9A227] text-lg">&#10003;</span>
                      <span className="text-gray-200">{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className={`w-full py-3 rounded-lg font-semibold transition ${
                    tier.highlight
                      ? 'bg-[#C9A227] hover:bg-[#B8911F] text-gray-950'
                      : 'border border-gray-700 hover:border-[#C9A227] text-white'
                  }`}
                >
                  Get Started
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* All Plans Include */}
      <section className="px-6 mb-20">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10">
            <h2 className="text-2xl font-bold text-center mb-8">
              All Plans <span className="text-[#C9A227]">Include</span>
            </h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <div>
                <div className="text-3xl mb-2">🛡️</div>
                <p className="text-sm font-semibold">Zero Fee Guarantee</p>
                <p className="text-gray-500 text-xs mt-1">We never touch your league dues</p>
              </div>
              <div>
                <div className="text-3xl mb-2">📱</div>
                <p className="text-sm font-semibold">Cross-Platform Access</p>
                <p className="text-gray-500 text-xs mt-1">Desktop, tablet, and mobile</p>
              </div>
              <div>
                <div className="text-3xl mb-2">🔄</div>
                <p className="text-sm font-semibold">Sync Any League</p>
                <p className="text-gray-500 text-xs mt-1">ESPN, Yahoo, Sleeper, and more</p>
              </div>
              <div>
                <div className="text-3xl mb-2">🔒</div>
                <p className="text-sm font-semibold">Bank-Level Security</p>
                <p className="text-gray-500 text-xs mt-1">Your data stays yours</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Protect Your League?
          </h2>
          <p className="text-gray-400 text-lg mb-8">
            Join commissioners who trust FantasyiQ Trust to keep their leagues fair and their money safe.
          </p>
          <Link
            href="/signin"
            className="bg-[#C9A227] hover:bg-[#B8911F] text-gray-950 font-bold px-10 py-4 rounded-lg text-lg transition inline-block"
          >
            Get Started Today
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-20 py-8 px-6">
        <div className="max-w-6xl mx-auto text-center text-gray-500 text-sm">
          &copy; 2026 FantasyiQ Trust LLC. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
