import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
    title: 'FantasyiQ Trust — Your League Dues. Protected.',
    description: 'FantasyiQ Trust is the league-aware dues, payouts, and sync engine built for commissioners who run real leagues. Sync ESPN, Sleeper, Yahoo, or NFL Fantasy. Zero fees.',
    openGraph: {
        title:       'FantasyiQ Trust — Your League Dues. Protected.',
        description: 'Sync your league, collect buy-ins automatically, and pay winners instantly — with zero fees and zero headaches.',
        url:         'https://fantasyiqtrust.com',
        siteName:    'FantasyiQ Trust',
        type:        'website',
    },
    twitter: {
        card:        'summary_large_image',
        title:       'FantasyiQ Trust — Your League Dues. Protected.',
        description: 'Sync your league, collect buy-ins automatically, and pay winners instantly — with zero fees and zero headaches.',
    },
};

const WHY_ITEMS = [
    {
        icon: '🏆',
        title: 'Commissioner-First Design',
        body: 'FantasyiQ Trust eliminates the worst part of running a league — chasing money. You get a clean dashboard showing every league, every team, every balance, and every payout.',
    },
    {
        icon: '🔗',
        title: 'League-Aware, Not Generic Payments',
        body: 'FantasyiQ Trust understands fantasy leagues: buy-ins, pot size, payout tiers, league structure, and eligibility rules. This is a commissioner control panel — not a payment app.',
    },
    {
        icon: '🔄',
        title: 'ESPN, Sleeper, Yahoo & NFL Fantasy Sync',
        body: 'Your league stays synced automatically — standings, teams, payouts, everything. Our ESPN Chrome extension handles what ESPN doesn\'t expose natively.',
    },
    {
        icon: '🛡️',
        title: 'Zero-Fee Payment Rails',
        body: 'Stop losing a chunk of the pot to payment app fees. FantasyiQ Trust keeps your league\'s money in your league — every dollar, every time.',
    },
    {
        icon: '📋',
        title: 'Multi-League Management',
        body: 'Run multiple leagues? FantasyiQ Trust gives you one dashboard to manage all of them — dues, payouts, sync, and owners — without switching between apps.',
    },
];

const TOOLS = [
    'Weekly projections',
    'Matchup analytics',
    'Waiver optimization',
    'Trade evaluation tools',
    'Dynasty & keeper insights',
    'League health analytics',
    'Team stability scoring',
];

const TRUST_ITEMS = [
    'A complete audit trail',
    'Locked-in pot size',
    'Verified payouts',
    'Commissioner transparency',
    'PRS-powered player insights (All-Pro & Elite)',
];

const STEPS = [
    {
        number: '01',
        title: 'Sync Your League',
        body: 'FantasyiQ Trust connects to ESPN (via our Chrome extension), Sleeper, Yahoo, and NFL Fantasy to pull in your league, teams, and payouts automatically. Your league stays synced all season — no manual updates, no rosters to copy, no mistakes.',
    },
    {
        number: '02',
        title: 'Set Dues and Payouts',
        body: 'Define your buy-ins, deadlines, and payout structure once. FantasyiQ Trust tracks who\'s paid, who hasn\'t, and what each team is owed at season\'s end.',
    },
    {
        number: '03',
        title: 'Collect and Pay Automatically',
        body: 'Owners pay securely through FantasyiQ Trust. We track every payment, lock in eligibility, and calculate final payouts so you can pay winners instantly and transparently.',
    },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="pt-16 pb-20 px-6 bg-black">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-6">
            <Image src="/logo.png" alt="FantasyiQ Trust" width={300} height={300} className="w-44 h-44 md:w-56 md:h-56 object-contain" style={{ mixBlendMode: 'lighten' }} priority />
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight tracking-tight">
            Stop chasing dues.<br />
            <span className="text-[#D4AF37]">Start running leagues.</span>
          </h1>

          <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-3xl mx-auto leading-relaxed">
            FantasyiQ Trust is the league-aware dues, payouts, and sync engine built for commissioners who run real leagues — not group chats. Sync your ESPN, Sleeper, Yahoo, or NFL Fantasy league, collect buy-ins automatically, and pay winners instantly with <span className="text-white font-semibold">zero fees</span> and zero headaches.
          </p>

          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/sign-up" className="bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold px-8 py-4 rounded-lg text-lg transition">
              Start with FantasyiQ Trust
            </Link>
            <a href="#how-it-works" className="border border-gray-700 hover:border-[#D4AF37]/50 text-white font-semibold px-8 py-4 rounded-lg text-lg transition">
              See how league sync works
            </a>
          </div>
        </div>
      </section>

      {/* ── Social Proof ─────────────────────────────────────────────── */}
      <section className="bg-[#050505] border-y border-gray-900 py-10 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-gray-400 text-base leading-relaxed">
            Trusted by commissioners who want integration that streamlines dues, payouts, and league management — without wasting time or testing their memory.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
            <span className="flex items-center gap-2"><span className="text-[#D4AF37]">✓</span> ESPN via Chrome Extension</span>
            <span className="flex items-center gap-2"><span className="text-[#D4AF37]">✓</span> Sleeper</span>
            <span className="flex items-center gap-2"><span className="text-[#D4AF37]">✓</span> Yahoo Fantasy</span>
            <span className="flex items-center gap-2"><span className="text-[#D4AF37]">✓</span> NFL Fantasy</span>
            <span className="flex items-center gap-2"><span className="text-[#D4AF37]">✓</span> Zero fees on every dollar</span>
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-black py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">Up and running in minutes</h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">No setup headaches. No learning curve. Just sync your league and go.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step) => (
              <div key={step.number} className="bg-[#0A0A0A] border border-gray-800 rounded-2xl p-8">
                <div className="text-5xl font-black text-[#D4AF37]/20 mb-4 leading-none">{step.number}</div>
                <h3 className="text-lg font-bold text-white mb-3">{step.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Commissioners Choose FiQ ─────────────────────────────── */}
      <section className="bg-[#050505] border-t border-gray-900 py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
              Why commissioners choose<br />
              <span className="text-[#D4AF37]">FantasyiQ Trust</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {WHY_ITEMS.map((item) => (
              <div key={item.title} className="bg-[#0A0A0A] border border-gray-800 hover:border-[#D4AF37]/40 rounded-xl p-7 transition-all duration-200">
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="text-base font-bold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRS Commissioner Card ────────────────────────────────────── */}
      <section className="bg-black border-t border-gray-900 py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative bg-[#0A0A0A] border border-[#D4AF37]/40 rounded-2xl p-8 md:p-12 overflow-hidden">
            {/* Background accent */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#D4AF37]/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

            <div className="relative">
              <div className="inline-block mb-4 px-3 py-1 rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#D4AF37] text-xs font-bold tracking-widest uppercase">
                Player Reliability Score — PRS
              </div>

              <h2 className="text-3xl md:text-4xl font-black text-white mb-4 leading-tight">
                Tired of members leaving a team<br className="hidden md:block" />
                <span className="text-[#D4AF37]"> you had to give away?</span>
              </h2>

              <p className="text-gray-400 text-lg leading-relaxed mb-8 max-w-2xl">
                PRS is FantasyiQ Trust&apos;s reliability score for every player on the platform. Members earn points by <span className="text-white font-semibold">completing full seasons</span>, staying active, and showing up — and lose points when they ghost, abandon teams, or go dark mid-season.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-black/50 border border-gray-800 rounded-xl p-5">
                  <div className="text-2xl mb-2">✅</div>
                  <p className="text-white font-semibold text-sm mb-1">Earns Points</p>
                  <p className="text-gray-500 text-xs leading-relaxed">Completing seasons, active lineups, timely dues payments, consistent engagement</p>
                </div>
                <div className="bg-black/50 border border-gray-800 rounded-xl p-5">
                  <div className="text-2xl mb-2">❌</div>
                  <p className="text-white font-semibold text-sm mb-1">Loses Points</p>
                  <p className="text-gray-500 text-xs leading-relaxed">Abandoning teams, ghosting mid-season, missing dues, inactive lineups</p>
                </div>
                <div className="bg-black/50 border border-gray-800 rounded-xl p-5">
                  <div className="text-2xl mb-2">🏆</div>
                  <p className="text-white font-semibold text-sm mb-1">Commissioner Control</p>
                  <p className="text-gray-500 text-xs leading-relaxed">Set a minimum PRS to join your league. Flaky members can&apos;t get in.</p>
                </div>
              </div>

              <p className="text-gray-500 text-sm italic">
                Players must earn their spot. Your league stays competitive — and full.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Fantasy Tools ────────────────────────────────────────────── */}
      <section className="bg-black border-t border-gray-900 py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-block mb-4 px-3 py-1 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37] text-xs font-semibold tracking-widest uppercase">
                All-Pro &amp; Elite Plans
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Fantasy Tools for the<br />
                <span className="text-[#D4AF37]">Competitive Edge</span>
              </h2>
              <p className="text-gray-400 text-base leading-relaxed mb-6">
                Commissioners who upgrade unlock the full FantasyiQ analytics suite. FantasyiQ Trust isn&apos;t just a dues engine — it&apos;s a competitive advantage.
              </p>
              <Link href="/pricing" className="inline-flex items-center gap-2 text-[#D4AF37] hover:underline font-semibold text-sm">
                See all plan features →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {TOOLS.map((tool) => (
                <div key={tool} className="flex items-center gap-3 bg-[#0A0A0A] border border-gray-800 rounded-lg px-4 py-3">
                  <span className="text-[#D4AF37] font-bold text-sm">✓</span>
                  <span className="text-white text-sm font-medium">{tool}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── League Finder Commissioner Card ──────────────────────────── */}
      <section className="bg-[#050505] border-t border-gray-900 py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative bg-[#0A0A0A] border border-[#D4AF37]/40 rounded-2xl p-8 md:p-12 overflow-hidden">
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#D4AF37]/5 rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none" />

            <div className="relative">
              <div className="inline-block mb-4 px-3 py-1 rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#D4AF37] text-xs font-bold tracking-widest uppercase">
                League Finder
              </div>

              <h2 className="text-3xl md:text-4xl font-black text-white mb-4 leading-tight">
                Do you ever get members who leave<br className="hidden md:block" />
                <span className="text-[#D4AF37]"> last minute and hold up your draft?</span>
              </h2>

              <p className="text-gray-400 text-lg leading-relaxed mb-8 max-w-2xl">
                Build a waitlist for your league and set a minimum PRS requirement. When a spot opens up, you&apos;re not scrambling through group chats — you&apos;re pulling from a list of <span className="text-white font-semibold">vetted, reliable players who actually want in</span>. Stop giving teams away. Players will pay to join great leagues.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <div className="bg-black/50 border border-gray-800 rounded-xl p-5">
                  <div className="text-2xl mb-2">📋</div>
                  <p className="text-white font-semibold text-sm mb-1">Built-In Waitlist</p>
                  <p className="text-gray-500 text-xs leading-relaxed">Players apply to join your league through League Finder. You approve. Draft day never waits on a missing owner again.</p>
                </div>
                <div className="bg-black/50 border border-gray-800 rounded-xl p-5">
                  <div className="text-2xl mb-2">🎯</div>
                  <p className="text-white font-semibold text-sm mb-1">Set a Minimum PRS</p>
                  <p className="text-gray-500 text-xs leading-relaxed">Filter applicants by reliability score. Only players with a proven track record of completing seasons can get through the door.</p>
                </div>
                <div className="bg-black/50 border border-gray-800 rounded-xl p-5">
                  <div className="text-2xl mb-2">💪</div>
                  <p className="text-white font-semibold text-sm mb-1">Strengthen Your League</p>
                  <p className="text-gray-500 text-xs leading-relaxed">Replace dropouts with players who will compete, pay on time, and show up every week — not split your league apart.</p>
                </div>
                <div className="bg-black/50 border border-gray-800 rounded-xl p-5">
                  <div className="text-2xl mb-2">💰</div>
                  <p className="text-white font-semibold text-sm mb-1">Players Pay to Join</p>
                  <p className="text-gray-500 text-xs leading-relaxed">Great leagues attract serious players. Stop giving spots away. List your league, set your price, and let the right players find you.</p>
                </div>
              </div>

              <Link href="/leaguefinder" className="inline-flex items-center gap-2 bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold px-6 py-3 rounded-lg text-sm transition">
                List My League on League Finder
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── For League Members ───────────────────────────────────────── */}
      <section className="bg-[#050505] border-t border-gray-900 py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            One place to pay.<br />
            <span className="text-[#D4AF37]">One place to get paid.</span>
          </h2>
          <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto">
            Owners see exactly what they owe, when it&apos;s due, and how much they&apos;ll win if they cash. No more &ldquo;did you send it.&rdquo; No more random payment apps. No more confusion.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
            {['What they owe', 'When it\'s due', 'How much they\'ll win'].map((item) => (
              <div key={item} className="bg-[#0A0A0A] border border-gray-800 rounded-xl p-5 text-center">
                <p className="text-white font-semibold text-sm">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust & Transparency ─────────────────────────────────────── */}
      <section className="bg-black border-t border-gray-900 py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Your league stops running on blind trust.<br />
            <span className="text-[#D4AF37]">Starts running on FantasyiQ Trust.</span>
          </h2>
          <p className="text-gray-400 text-lg mb-10">FantasyiQ Trust gives your league:</p>
          <div className="flex flex-col gap-3 max-w-sm mx-auto text-left">
            {TRUST_ITEMS.map((item) => (
              <div key={item} className="flex items-center gap-3">
                <span className="text-[#D4AF37] font-bold">✓</span>
                <span className="text-white text-sm font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section className="bg-[#050505] border-t border-gray-900 py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-block mb-4 px-3 py-1 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37] text-xs font-semibold tracking-widest uppercase">
            Simple Pricing
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Commissioner-friendly pricing.<br />
            <span className="text-[#D4AF37]">No surprises.</span>
          </h2>
          <p className="text-gray-400 text-lg mb-8 max-w-xl mx-auto">Flat, transparent pricing with no per-team fees, no per-transaction fees, no hidden charges, and no premium tiers for basic features.</p>
          <Link href="/pricing" className="bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold px-8 py-4 rounded-lg text-lg transition inline-block">
            View Pricing
          </Link>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────── */}
      <section className="bg-black border-t border-[#D4AF37]/20 py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-black mb-6 leading-tight">
            Your league deserves better<br />than a group chat and a prayer.
          </h2>
          <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto">
            You&apos;ve already built the league.<br />
            Let FantasyiQ Trust handle the money, the sync, and the receipts.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/sign-up" className="bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-black px-10 py-4 rounded-lg text-lg transition">
              Start your first league with FantasyiQ Trust
            </Link>
            <Link href="/dashboard" className="border border-gray-700 hover:border-[#D4AF37]/50 text-white font-semibold px-8 py-4 rounded-lg text-lg transition">
              See a sample commissioner dashboard
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-900 py-8 px-6 bg-black">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-gray-600 text-sm">
          <span>© {new Date().getFullYear()} FantasyiQ Trust. All rights reserved.</span>
          <div className="flex gap-6">
            <a href="/pricing" className="hover:text-white transition">Pricing</a>
            <a href="/support" className="hover:text-white transition">Support</a>
            <a href="/privacy" className="hover:text-white transition">Privacy</a>
            <a href="/terms" className="hover:text-white transition">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
