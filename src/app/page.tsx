import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
    title: 'FantasyiQ Trust — Your League Dues. Protected.',
    description: 'Stop chasing dues. Sync your Sleeper, ESPN, NFL, or Yahoo league and let FantasyiQ Trust handle collections, reminders, and payouts — with zero fees.',
    openGraph: {
        title:       'FantasyiQ Trust — Your League Dues. Protected.',
        description: 'Stop chasing dues. Sync your league and let FantasyiQ Trust handle collections, reminders, and payouts — with zero fees.',
        url:         'https://fantasyiqtrust.com',
        siteName:    'FantasyiQ Trust',
        type:        'website',
    },
    twitter: {
        card:        'summary_large_image',
        title:       'FantasyiQ Trust — Your League Dues. Protected.',
        description: 'Stop chasing dues. Sync your league and let FantasyiQ Trust handle collections, reminders, and payouts — with zero fees.',
    },
};

const FEATURES = [
    {
        icon: '⚡',
        title: 'Sync in Seconds',
        body:  'Connect your Sleeper, ESPN, NFL, or Yahoo league instantly. No spreadsheets, no manual entry.',
    },
    {
        icon: '🔔',
        title: 'Automatic Reminders',
        body:  'Members get notified until they pay. You stop chasing people and start enjoying the season.',
    },
    {
        icon: '📊',
        title: 'Full Transparency',
        body:  'Every dollar logged. Every payout tracked. Your whole league can see exactly where the money stands.',
    },
    {
        icon: '💰',
        title: 'Instant Payouts',
        body:  'Winners get paid the moment the season ends. No holds, no delays, no awkward Venmo requests.',
    },
    {
        icon: '🛠️',
        title: 'Commissioner Hub',
        body:  'Dues, payouts, announcements, and league settings — all in one place. Total control, zero friction.',
    },
    {
        icon: '💳',
        title: 'One System, Every App',
        body:  'Replace the Venmo/Cash App/Zelle juggling act with a single clean platform your whole league uses.',
    },
    {
        icon: '🛡️',
        title: 'Zero Fees. Always.',
        body:  'We charge commissioners a flat plan fee. Every buy-in dollar goes to your league — not to us.',
    },
    {
        icon: '🔄',
        title: 'Multi-League Ready',
        body:  'Run dynasty, redraft, and best ball leagues simultaneously. One dashboard, every league.',
    },
];

const STEPS = [
    {
        number: '01',
        title: 'Sync Your League',
        body: 'Connect your Sleeper, ESPN, NFL, or Yahoo league in seconds. Your roster, members, and settings import automatically.',
    },
    {
        number: '02',
        title: 'Set Your Dues',
        body: 'Enter your buy-in amount and payout structure. We handle collection, reminders, and tracking from there.',
    },
    {
        number: '03',
        title: 'Pay Winners Instantly',
        body: 'When the season ends, generate a payout proposal and send winners their money in one click.',
    },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="pt-16 pb-20 px-6 bg-black">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-4">
            <Image src="/logo.png" alt="FantasyiQ Trust" width={300} height={300} className="w-44 h-44 md:w-56 md:h-56 object-contain" style={{ mixBlendMode: 'lighten' }} priority />
          </div>

          <div className="inline-block mb-5 px-4 py-1.5 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37] text-sm font-medium tracking-wide">
            Built by a commissioner, for commissioners
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-5 leading-tight tracking-tight">
            Stop Chasing Dues.<br />
            <span className="text-[#D4AF37]">Start Running Leagues.</span>
          </h1>

          <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Sync your fantasy league, automate dues collection, and pay out winners — all with <span className="text-white font-semibold">zero fees</span> on every dollar.
          </p>

          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/sign-up" className="bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold px-8 py-4 rounded-lg text-lg transition">
              Protect My League
            </Link>
            <a href="#how-it-works" className="border border-gray-700 hover:border-[#D4AF37]/50 text-white font-semibold px-8 py-4 rounded-lg text-lg transition">
              See How It Works
            </a>
          </div>

          {/* Trust bar */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
            <span className="flex items-center gap-2"><span className="text-[#D4AF37]">✓</span> Sleeper, ESPN, NFL &amp; Yahoo</span>
            <span className="flex items-center gap-2"><span className="text-[#D4AF37]">✓</span> Zero fees on every dollar</span>
            <span className="flex items-center gap-2"><span className="text-[#D4AF37]">✓</span> No contracts, cancel anytime</span>
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-[#050505] border-t border-gray-900 py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">Up and running in no time</h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">No setup headaches. No learning curve. Just sync your league and go.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step) => (
              <div key={step.number} className="relative bg-[#0A0A0A] border border-gray-800 rounded-2xl p-8">
                <div className="text-5xl font-black text-[#D4AF37]/20 mb-4 leading-none">{step.number}</div>
                <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section id="features" className="bg-black py-24 px-6">
        <div className="max-w-[1320px] mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
              Everything your league needs.<br />
              <span className="text-[#D4AF37]">Nothing it doesn&apos;t.</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              We built FantasyiQ Trust because every season looked the same — juggling dues across multiple leagues, no idea who actually paid, payouts handled on a handshake, and the commissioner doing all of it manually with zero tools. Nothing was integrated. Nothing was simple. We fixed that.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group bg-[#0A0A0A] border border-gray-800 hover:border-[#D4AF37]/60 rounded-xl p-6 cursor-default transition-all duration-200 hover:bg-[#0f0f0f]"
              >
                <div className="text-3xl mb-4 leading-none">{f.icon}</div>
                <h3 className="text-base font-bold text-white mb-2 leading-snug">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ───────────────────────────────────────────── */}
      <section className="bg-[#050505] border-t border-gray-900 py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-block mb-4 px-3 py-1 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37] text-xs font-semibold tracking-widest uppercase">
            Flat Rate. No Surprises.
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            We charge commissioners a flat fee.<br />
            <span className="text-[#D4AF37]">Your players pay nothing extra.</span>
          </h2>
          <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto">
            No per-transaction cuts. No percentage skimmed off dues. A predictable plan price so your league keeps every dollar it puts in.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/pricing" className="bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold px-8 py-4 rounded-lg text-lg transition">
              View Pricing
            </Link>
            <Link href="/sign-up" className="border border-gray-700 hover:border-[#D4AF37]/50 text-white font-semibold px-8 py-4 rounded-lg text-lg transition">
              Start for Free
            </Link>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────── */}
      <section className="bg-black border-t border-[#D4AF37]/20 py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-black mb-4 leading-tight">
            Your league deserves better<br />than a group chat and a prayer.
          </h2>
          <p className="text-gray-400 text-lg mb-10">
            Join commissioners who&apos;ve moved on from chasing dues and disputing payouts. Set it up once. Run it forever.
          </p>
          <Link href="/sign-up" className="bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-black px-12 py-5 rounded-lg text-xl transition inline-block">
            Protect My League — Free
          </Link>
          <p className="mt-4 text-gray-600 text-sm">No credit card required to get started.</p>
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
