import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'FantasyIQ Trust — Your League Dues. Protected.',
    description: 'The fantasy football platform that never touches your money. Zero fees. Zero skimming. Total trust.',
    openGraph: {
        title:       'FantasyIQ Trust — Your League Dues. Protected.',
        description: 'Sync your Sleeper, ESPN, or Yahoo league. Protect your buy-ins. Zero fees.',
        url:         'https://fantasyiq.app',
        siteName:    'FantasyIQ Trust',
        type:        'website',
    },
    twitter: {
        card:        'summary_large_image',
        title:       'FantasyIQ Trust — Your League Dues. Protected.',
        description: 'Sync your Sleeper, ESPN, or Yahoo league. Protect your buy-ins. Zero fees.',
    },
};

const FEATURES = [
    {
        icon: '⚡',
        title: 'Instant League Setup',
        body:  'Sync your league in seconds. No spreadsheets, no manual entry, no setup headaches.',
    },
    {
        icon: '🔄',
        title: 'Cross-Platform Sync',
        body:  'Your fantasy leagues sync automatically into one unified dashboard.',
    },
    {
        icon: '🛠️',
        title: 'Commissioner Hub',
        body:  'All commissioner tools in one place. Total control, zero friction.',
    },
    {
        icon: '📊',
        title: 'Track Dues & Payouts',
        body:  'Every payment logged. Every payout tracked. Full transparency for every member.',
    },
    {
        icon: '💳',
        title: 'No More Digital Currency Chaos',
        body:  'No more juggling Venmo, Cash App, Zelle, PayPal, or missing funds. One clean, secure system to streamline everything.',
    },
    {
        icon: '🔔',
        title: 'Auto-Reminders',
        body:  'Players get notified until they pay. You stop chasing people.',
    },
    {
        icon: '🛡️',
        title: 'Zero Fees Guaranteed',
        body:  'Every dollar goes to your league — not to fees.',
    },
    {
        icon: '💰',
        title: 'Immediate Payouts',
        body:  'Winners get paid instantly. No delays, no holds, no fees.',
    },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-20 px-6 bg-black">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block mb-6 px-4 py-1.5 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37] text-sm font-medium">
            ★★★★★ Trusted by Commissioners
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Your League Dues{' '}
            <span className="text-[#D4AF37]">Protected.</span>
          </h1>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            ZERO FEES GUARANTEED.
          </p>

          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/pricing" className="bg-[#D4AF37] hover:bg-[#D4AF37] text-gray-950 font-bold px-8 py-4 rounded-lg text-lg transition">
              Get Started
            </Link>
            <a href="#features" className="border border-gray-700 hover:border-[#D4AF37]/50 text-white font-semibold px-8 py-4 rounded-lg text-lg transition">
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* ── Feature Grid ─────────────────────────────────────────────── */}
      <section id="features" className="bg-black pt-24 pb-24 px-6">
        <div className="max-w-[1320px] mx-auto">

          {/* Headline */}
          <div className="text-center mb-12">
            <h2 className="text-[44px] leading-tight font-bold text-[#D4AF37] mb-3">
              Why Commissioners Trust Us
            </h2>
            <p className="text-[21px] text-[#A1A1A1] max-w-3xl mx-auto leading-relaxed">
              Built by a commissioner who wanted to streamline league dues and payouts with <span className="text-[#D4AF37] font-semibold">ZERO FEES</span> and the ability to sync all your fantasy leagues into one clean, unified place.
            </p>
          </div>

          {/* 4×2 Grid — desktop / 2×4 — mobile */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group bg-[#0A0A0A] border border-[#D4AF37] rounded-xl p-5 md:p-7 cursor-default transition-all duration-200 hover:bg-[#111111] hover:border-[#D4AF37]"
              >
                {/* Icon */}
                <div className="text-[30px] mb-4 inline-block transition-transform duration-200 group-hover:scale-105 leading-none">
                  {f.icon}
                </div>

                {/* Title */}
                <h3 className="text-[18px] md:text-[19px] font-semibold text-[#D4AF37] group-hover:text-[#D4AF37] transition-colors duration-200 mb-2 leading-snug">
                  {f.title}
                </h3>

                {/* Body */}
                <p className="text-[15px] text-[#E5E5E5] leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 border-t border-[#D4AF37]/20 bg-black">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to Protect Your League?</h2>
          <p className="text-[#A1A1A1] text-lg mb-10">Join commissioners who trust FantasyiQ Trust to keep their leagues fair and their money safe.</p>
          <Link href="/pricing" className="bg-[#D4AF37] hover:bg-[#D4AF37] text-gray-950 font-bold px-10 py-4 rounded-lg text-lg transition inline-block">
            View Pricing
          </Link>
        </div>
      </section>

      <footer className="border-t border-gray-800 py-8 px-6 bg-black">
        <div className="max-w-6xl mx-auto text-center text-gray-500 text-sm">© 2026 FantasyiQ Trust. All rights reserved.</div>
      </footer>
    </main>
  );
}
