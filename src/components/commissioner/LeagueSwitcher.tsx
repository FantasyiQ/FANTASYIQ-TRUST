'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';

type LeagueSummary = {
    id:               string;
    leagueName:       string;
    season:           string;
    platform:         string;
    avatar:           string | null;
    duesId: string | null;
};

function LeagueAvatar({ league, size }: { league: LeagueSummary | null; size: number }) {
    const rounded = size <= 24 ? 'rounded-md' : 'rounded-lg';
    const textSize = size <= 24 ? 'text-[9px]' : 'text-xs';

    if (!league) {
        return (
            <div
                style={{ width: size, height: size }}
                className={`${rounded} bg-gray-700 shrink-0 flex items-center justify-center ${textSize} font-bold text-gray-500`}
            >
                FF
            </div>
        );
    }

    if (league.avatar && league.platform !== 'espn') {
        return (
            <Image
                src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                alt={league.leagueName}
                width={size}
                height={size}
                className={`${rounded} shrink-0 object-cover`}
            />
        );
    }

    // ESPN or no avatar — text fallback
    const label = league.platform === 'espn'
        ? 'ESPN'
        : league.leagueName.slice(0, 2).toUpperCase();

    return (
        <div
            style={{ width: size, height: size }}
            className={`${rounded} bg-gray-700 shrink-0 flex items-center justify-center ${textSize} font-bold text-gray-400`}
        >
            {label}
        </div>
    );
}

function getTargetUrl(pathname: string, league: LeagueSummary): string {
    // /dashboard/league/[id]/commissioner (and sub-paths like /invite)
    if (/^\/dashboard\/league\/[^/]+\/commissioner/.test(pathname)) {
        return pathname.replace(
            /^(\/dashboard\/league\/)([^/]+)(\/commissioner.*)/,
            `$1${league.id}$3`,
        );
    }

    // /dashboard/commissioner/calendar/[leagueId]
    if (/^\/dashboard\/commissioner\/calendar\/[^/]+$/.test(pathname)) {
        return `/dashboard/commissioner/calendar/${league.id}`;
    }

    // /dashboard/commissioner/announcements
    if (pathname === '/dashboard/commissioner/announcements') {
        return `/dashboard/commissioner/announcements?leagueId=${league.id}`;
    }

    // /dashboard/commissioner/settings
    if (pathname === '/dashboard/commissioner/settings') {
        return `/dashboard/commissioner/settings?leagueId=${league.id}`;
    }

    // /dashboard/commissioner/dues/[duesId] (any sub-path)
    if (/^\/dashboard\/commissioner\/dues\/[^/]+/.test(pathname)) {
        return league.duesId
            ? `/dashboard/commissioner/dues/${league.duesId}`
            : `/dashboard/league/${league.id}/commissioner`;
    }

    // Fallback → that league's commissioner hub
    return `/dashboard/league/${league.id}/commissioner`;
}

export default function LeagueSwitcher({ currentLeagueId }: { currentLeagueId: string }) {
    const [open,    setOpen]    = useState(false);
    const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
    const [focused, setFocused] = useState<number>(-1);
    const pathname = usePathname();
    const router   = useRouter();
    const rootRef  = useRef<HTMLDivElement>(null);
    const listRef  = useRef<HTMLDivElement>(null);

    // Fetch leagues once on mount
    useEffect(() => {
        fetch('/api/leagues/my-commissioner-leagues')
            .then(r => r.json())
            .then((data: LeagueSummary[]) => setLeagues(data))
            .catch(() => { /* silently fail — switcher just shows nothing */ });
    }, []);

    // Close on outside click
    useEffect(() => {
        function onMouseDown(e: MouseEvent) {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
                setFocused(-1);
            }
        }
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, []);

    // Reset focus when list opens/closes
    useEffect(() => {
        if (open) {
            const idx = leagues.findIndex(l => l.id === currentLeagueId);
            setFocused(idx >= 0 ? idx : 0);
        }
    }, [open, leagues, currentLeagueId]);

    // Scroll focused item into view
    useEffect(() => {
        if (!open || focused < 0) return;
        const item = listRef.current?.children[focused] as HTMLElement | undefined;
        item?.scrollIntoView({ block: 'nearest' });
    }, [open, focused]);

    const select = useCallback((league: LeagueSummary) => {
        setOpen(false);
        setFocused(-1);
        router.push(getTargetUrl(pathname, league));
    }, [pathname, router]);

    function onKeyDown(e: React.KeyboardEvent) {
        if (!open) {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                e.preventDefault();
                setOpen(true);
            }
            return;
        }
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setFocused(f => Math.min(f + 1, leagues.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setFocused(f => Math.max(f - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (focused >= 0 && focused < leagues.length) select(leagues[focused]);
                break;
            case 'Escape':
            case 'Tab':
                setOpen(false);
                setFocused(-1);
                break;
        }
    }

    const current = leagues.find(l => l.id === currentLeagueId);

    // Don't render until we have data
    if (leagues.length === 0) return null;

    return (
        <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
            {/* Trigger */}
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label="Switch league"
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 rounded-xl px-3 py-1.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
            >
                <LeagueAvatar league={current ?? null} size={20} />
                <span className="text-gray-200 font-medium max-w-[180px] truncate">
                    {current?.leagueName ?? 'Switch League'}
                </span>
                {/* Chevron */}
                <svg
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
                    viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                    <path d="M4 6l4 4 4-4" />
                </svg>
            </button>

            {/* Dropdown */}
            {open && (
                <div
                    role="listbox"
                    aria-label="Select league"
                    ref={listRef}
                    className="absolute top-full mt-2 left-0 z-50 w-72 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto"
                >
                    {leagues.map((league, i) => {
                        const isActive  = league.id === currentLeagueId;
                        const isFocused = i === focused;

                        return (
                            <button
                                key={league.id}
                                role="option"
                                aria-selected={isActive}
                                tabIndex={-1}
                                onClick={() => select(league)}
                                onMouseEnter={() => setFocused(i)}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                                    isFocused
                                        ? 'bg-gray-800'
                                        : 'hover:bg-gray-800/60'
                                } ${i < leagues.length - 1 ? 'border-b border-gray-800' : ''}`}
                            >
                                <LeagueAvatar league={league} size={28} />
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium truncate ${isActive ? 'text-[#D4AF37]' : 'text-gray-200'}`}>
                                        {league.leagueName}
                                    </p>
                                    <p className="text-gray-500 text-xs">{league.season} Season</p>
                                </div>
                                {/* Checkmark for active league */}
                                {isActive && (
                                    <svg aria-hidden="true" className="w-4 h-4 text-[#D4AF37] shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 8l3.5 3.5L13 4" />
                                    </svg>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
