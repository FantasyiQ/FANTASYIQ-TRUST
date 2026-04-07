const fs = require('fs');
const path = require('path');

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.trimStart());
  console.log('✅ Created ' + filePath);
}

writeFile('src/components/Navbar.tsx', `'use client';
import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-gray-950/90 backdrop-blur-sm border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold text-white">
          Fantasy<span className="text-[#C9A227]">i</span>Q Trust
        </Link>
        <div className="flex items-center gap-8">
          <Link href="/" className="text-gray-300 hover:text-white transition">Home</Link>
          <Link href="/pricing" className="text-gray-300 hover:text-white transition">Pricing</Link>
          <Link href="/signin" className="bg-[#C9A227] hover:bg-[#B8911F] text-gray-950 font-semibold px-5 py-2 rounded-lg transition">
            Sign In
          </Link>
        </div>
      </div>
    </nav>
  );
}
`);

writeFile('src/app/globals.css', `@import "tailwindcss";

html {
  scroll-behavior: smooth;
}
`);

writeFile('src/app/layout.tsx', `import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'FantasyiQ Trust — Your League Dues. Protected.',
  description: 'The fantasy football platform that never touches your money. Zero fees. Zero skimming. Total trust.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className + ' bg-gray-950'}>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
`);

writeFile('src/app/page.tsx', `import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block mb-6 px-4 py-1.5 rounded-full border border-[#C9A227]/30 bg-[#C9A227]/10 text-[#C9A227] text-sm font-medium">
            ★★★★★ Trusted by Commissioners
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Your League Dues.{' '}
            <span className="text-[#C9A227]">Protected.</span>
          </h1>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            The fantasy football platform that never touches your money. Zero fees. Zero skimming. Total trust.
          </p>
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
        <div className="max-w-6xl mx-auto text-center text-gray-500 text-sm">© 2026 FantasyiQ Trust LLC. All rights reserved.</div>
      </footer>
    </main>
  );
}
`);

writeFile('src/app/pricing/page.tsx', `export default function Pricing() {
  return (
    <main className="min-h-screen bg-gray-950 text-white pt-24 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4">Pricing</h1>
        <p className="text-gray-400 text-lg">Coming soon — this is where your 3 Player tiers will live.</p>
      </div>
    </main>
  );
}
`);

writeFile('src/app/signin/page.tsx', `export default function SignIn() {
  return (
    <main className="min-h-screen bg-gray-950 text-white pt-24 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4">Sign In</h1>
        <p className="text-gray-400 text-lg">Coming soon — Google and email sign-in will go here.</p>
      </div>
    </main>
  );
}
`);

console.log('');
console.log('🏈 ALL FILES CREATED! Refresh http://localhost:3000');
