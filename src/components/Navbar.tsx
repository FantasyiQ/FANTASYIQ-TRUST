'use client';
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
