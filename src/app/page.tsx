import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block mb-6 px-4 py-1.5 rounded-full border border-[#C9A227]/30 bg-[#C9A227]/10 text-[#C9A227] text-sm font-medium">
            ★★★★★ Trusted by Commissioners
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Your League Dues{' '}
            <span className="text-[#C9A227]">Protected.</span>
          </h1>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            ZERO FEES GUARANTEED.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-3 mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#C9A227] text-gray-950 text-sm font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-950 shrink-0" />
              IMMEDIATE PAYOUTS
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 bg-white/5 text-white text-sm font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
              COMMISSIONER HUB
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#C9A227]/40 bg-[#C9A227]/10 text-[#C9A227] text-sm font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C9A227] shrink-0" />
              TRACK LEAGUE DUES &amp; PAYOUTS
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-gray-900 text-gray-300 text-sm font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
              SYNC LEAGUES CROSS-PLATFORM
            </span>
          </div>

          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/pricing" className="bg-[#C9A227] hover:bg-[#B8911F] text-gray-950 font-bold px-8 py-4 rounded-lg text-lg transition">
              Get Started
            </Link>
            <a href="#features" className="border border-gray-700 hover:border-gray-500 text-white font-semibold px-8 py-4 rounded-lg text-lg transition">
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-6 border-t border-gray-800">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Why Commissioners <span className="text-[#C9A227]">Trust</span> Us
          </h2>
          <p className="text-gray-400 text-center mb-16 text-lg">
            Built by a commissioner who was tired of platforms skimming league dues.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 hover:border-[#C9A227]/50 transition">
              <div className="text-4xl mb-4">🛡️</div>
              <h3 className="text-xl font-bold mb-3">Zero Fee Guarantee</h3>
              <p className="text-gray-400 leading-relaxed">Your league dues go where they belong — to your league. We never take a cut. Ever.</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 hover:border-[#C9A227]/50 transition">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-bold mb-3">Dynamic Trade Values</h3>
              <p className="text-gray-400 leading-relaxed">Player valuations that adapt to your league settings, scoring format, and roster construction in real time.</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 hover:border-[#C9A227]/50 transition">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-xl font-bold mb-3">One Price. All Access.</h3>
              <p className="text-gray-400 leading-relaxed">One annual subscription. Every tool. Every platform. No hidden fees. No surprises.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 border-t border-gray-800">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to Protect Your League?</h2>
          <p className="text-gray-400 text-lg mb-10">Join commissioners who trust FantasyiQ Trust to keep their leagues fair and their money safe.</p>
          <Link href="/pricing" className="bg-[#C9A227] hover:bg-[#B8911F] text-gray-950 font-bold px-10 py-4 rounded-lg text-lg transition inline-block">
            View Pricing
          </Link>
        </div>
      </section>

      <footer className="border-t border-gray-800 py-8 px-6">
        <div className="max-w-6xl mx-auto text-center text-gray-500 text-sm">© 2026 FantasyiQ Trust. All rights reserved.</div>
      </footer>
    </main>
  );
}
