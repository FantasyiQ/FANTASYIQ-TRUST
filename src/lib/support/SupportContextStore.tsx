'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { usePathname, useParams } from 'next/navigation';

// ── Types ──────────────────────────────────────────────────────────────────────

export type SupportPage =
    | 'draft-report'
    | 'members'
    | 'calendar'
    | 'commissioner'
    | 'league-sync'
    | 'roster'
    | 'support'
    | 'other';

export type SupportPlatform = 'SLEEPER' | 'ESPN' | 'OTHER';
export type SupportSeasonPhase = 'PRE_DRAFT' | 'OFFSEASON' | 'REGULAR_SEASON' | 'PLAYOFFS' | 'CHAMPIONSHIP';

export interface SupportContext {
    route:             string;
    page:              SupportPage;
    leagueId?:         string;
    platform?:         SupportPlatform;
    seasonPhase?:      SupportSeasonPhase;
    playoffStartWeek?: number;
    championshipWeek?: number;
    draftCompleted?:   boolean;
    hasDraftReport?:   boolean;
    hasPRS?:           boolean;
    hasDTVSnapshot?:   boolean;
}

interface SupportContextValue {
    context:    SupportContext;
    setContext: (patch: Partial<SupportContext>) => void;
}

const Ctx = createContext<SupportContextValue | null>(null);

// ── Route → page derivation ───────────────────────────────────────────────────

function derivePage(pathname: string): SupportPage {
    if (pathname.includes('/draft-report'))       return 'draft-report';
    if (pathname.includes('/calendar'))           return 'calendar';
    if (pathname.includes('/commissioner'))       return 'commissioner';
    if (pathname.includes('/support'))            return 'support';
    // Check for league-level pages (members card is on the league overview)
    if (pathname.match(/\/dashboard\/league\/[^/]+$/)) return 'members';
    if (pathname.includes('/roster'))             return 'roster';
    if (pathname.includes('/dashboard/league/'))  return 'league-sync';
    return 'other';
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function SupportContextProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const params   = useParams();

    const leagueId = (params?.id as string) ?? (params?.leagueId as string) ?? undefined;

    const [ctx, setCtx] = useState<SupportContext>({
        route:    pathname ?? '',
        page:     derivePage(pathname ?? ''),
        leagueId,
    });

    // Keep auto-derived fields in sync as user navigates
    useEffect(() => {
        setCtx(prev => ({
            ...prev,
            route:    pathname ?? '',
            page:     derivePage(pathname ?? ''),
            leagueId: (params?.id as string) ?? (params?.leagueId as string) ?? undefined,
        }));
    }, [pathname, params]);

    function setContext(patch: Partial<SupportContext>) {
        setCtx(prev => ({ ...prev, ...patch }));
    }

    return <Ctx.Provider value={{ context: ctx, setContext }}>{children}</Ctx.Provider>;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useSupportContext(): SupportContext {
    const val = useContext(Ctx);
    // Safe outside provider — returns a shell context
    if (!val) return { route: '', page: 'other' };
    return val.context;
}

export function useSupportContextUpdater(): (patch: Partial<SupportContext>) => void {
    const val = useContext(Ctx);
    return val?.setContext ?? (() => {});
}
