'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
    isElite:       boolean;
    tier:          string | null; // e.g. 'PLAYER_PRO', 'PLAYER_ALL_PRO', 'PLAYER_ELITE', etc.
    signOutAction: () => Promise<void>;
}

function navLinkClass(active: boolean) {
    return active
        ? 'text-[#C9A227] font-semibold transition'
        : 'text-gray-300 hover:text-white transition';
}

function TierBadge({ tier }: { tier: string | null }) {
    if (!tier || tier === 'FREE') return null;

    if (tier === 'PLAYER_ELITE' || tier === 'COMMISSIONER_ELITE') {
        return (
            <span className="shrink-0 whitespace-nowrap bg-[#C9A227]/15 border border-[#C9A227]/50 text-[#C9A227] font-bold px-3 py-1 rounded-lg text-sm">
                Elite ✦
            </span>
        );
    }
    if (tier === 'PLAYER_ALL_PRO' || tier === 'COMMISSIONER_ALL_PRO') {
        return (
            <span className="shrink-0 whitespace-nowrap bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227]/80 font-bold px-3 py-1 rounded-lg text-sm">
                All-Pro ✦
            </span>
        );
    }
    if (tier === 'PLAYER_PRO' || tier === 'COMMISSIONER_PRO') {
        return (
            <span className="shrink-0 whitespace-nowrap bg-gray-800 border border-gray-600 text-gray-300 font-bold px-3 py-1 rounded-lg text-sm">
                Pro
            </span>
        );
    }
    return null;
}

export default function NavClient({ tier, signOutAction }: Props) {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);

    // Close menu on route change
    useEffect(() => { setMobileOpen(false); }, [pathname]);

    // Lock body scroll while mobile menu is open
    useEffect(() => {
        document.body.style.overflow = mobileOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [mobileOpen]);

    const isHomeActive   = pathname === '/';
    const isLeagActive   = pathname.startsWith('/my-leagues') || pathname.startsWith('/dashboard/league') || pathname === '/dashboard/sync';
    const isCommActive   = pathname.startsWith('/dashboard/commissioner');

    const badge = <TierBadge tier={tier} />;

    return (
        <>
            {/* ── Desktop nav ─────────────────────────────────────────── */}
            <div className="hidden md:flex items-center gap-7">
                <Link href="/"               className={navLinkClass(isHomeActive)}>Home</Link>
                <Link href="/my-leagues"     className={navLinkClass(isLeagActive)}>My Leagues</Link>
                <Link href="/dashboard/commissioner" className={navLinkClass(isCommActive)}>Commissioner Hub</Link>

                {badge}

                <form action={signOutAction}>
                    <button type="submit" className="bg-gray-800 hover:bg-gray-700 text-white font-semibold px-5 py-2 rounded-lg transition text-sm">
                        Sign Out
                    </button>
                </form>
            </div>

            {/* ── Mobile hamburger ────────────────────────────────────── */}
            <button
                className="md:hidden text-gray-300 hover:text-white p-2 shrink-0"
                onClick={() => setMobileOpen(v => !v)}
                aria-label="Toggle menu"
            >
                {mobileOpen
                    ? <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    : <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                }
            </button>

            {/* ── Mobile full-screen overlay ──────────────────────────── */}
            {mobileOpen && (
                <div className="md:hidden fixed inset-0 top-16 bg-gray-950 z-50 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <div className="px-6 py-4 space-y-1">
                        <Link href="/"               className={`flex items-center min-h-[44px] py-2.5 text-sm ${navLinkClass(isHomeActive)}`}>Home</Link>
                        <Link href="/my-leagues"     className={`flex items-center min-h-[44px] py-2.5 text-sm ${navLinkClass(isLeagActive)}`}>My Leagues</Link>
                        <Link href="/dashboard/commissioner" className={`flex items-center min-h-[44px] py-2.5 text-sm ${navLinkClass(isCommActive)}`}>Commissioner Hub</Link>

                        {badge && (
                            <div className="flex items-center min-h-[44px] py-2.5">
                                {badge}
                            </div>
                        )}

                        <div className="pt-3 border-t border-gray-800">
                            <form action={signOutAction}>
                                <button type="submit" className="flex items-center min-h-[44px] py-2.5 text-sm text-gray-300 hover:text-white transition">
                                    Sign Out
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
