export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeague } from '@/lib/sleeper';
import { effectiveTierForLeague, tierLevel } from '@/lib/league-limits';
import { stripe, priceIdToTier } from '@/lib/stripe';
import type { SubscriptionTier } from '@prisma/client';
import { DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { LeagueSettings, LeagueType, PprFormat } from '@/lib/trade-engine';
import PlayerRankings from './PlayerRankings';

function buildLeagueSettings(
    rosterPositions: string[],
    scoringSettings: Record<string, number> | null | undefined,
): LeagueSettings {
    const ss = scoringSettings ?? {};
    let qbSlots = 0, rbSlots = 0, wrSlots = 0, teSlots = 0, flexSlots = 0, sfSlots = 0;
    for (const pos of rosterPositions) {
        switch (pos) {
            case 'QB':         qbSlots++;   break;
            case 'RB':         rbSlots++;   break;
            case 'WR':         wrSlots++;   break;
            case 'TE':         teSlots++;   break;
            case 'FLEX':       flexSlots++; break;
            case 'SUPER_FLEX': sfSlots++;   break;
            case 'REC_FLEX':   flexSlots++; break;
        }
    }
    return {
        passTd:     ss.pass_td      ?? DEFAULT_LEAGUE_SETTINGS.passTd,
        bonusRecTe: ss.bonus_rec_te ?? DEFAULT_LEAGUE_SETTINGS.bonusRecTe,
        qbSlots:    qbSlots  || DEFAULT_LEAGUE_SETTINGS.qbSlots,
        rbSlots:    rbSlots  || DEFAULT_LEAGUE_SETTINGS.rbSlots,
        wrSlots:    wrSlots  || DEFAULT_LEAGUE_SETTINGS.wrSlots,
        teSlots:    teSlots  || DEFAULT_LEAGUE_SETTINGS.teSlots,
        flexSlots,
        sfSlots,
    };
}

export default async function RankingsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const [league, sleeperLeague, dbUser] = await Promise.all([
        prisma.league.findUnique({
            where:  { id },
            select: { id: true, userId: true, leagueId: true, leagueName: true, scoringType: true, rosterPositions: true },
        }),
        // sleeperLeague fetched after league check — hoisted here for parallel
        prisma.league.findUnique({ where: { id }, select: { leagueId: true } })
            .then(l => l ? getLeague(l.leagueId) : null),
        prisma.user.findUnique({
            where:  { id: session.user.id },
            select: {
                connectedLeagues: { select: { leagueName: true } },
                subscriptions: {
                    where:   { status: { in: ['active', 'trialing'] } },
                    orderBy: { createdAt: 'desc' },
                    select:  { id: true, type: true, tier: true, leagueName: true, stripeSubscriptionId: true },
                },
                leagues: { select: { id: true, leagueName: true } },
            },
        }),
    ]);

    if (!league || league.userId !== session.user.id) notFound();

    // ── Tier check ────────────────────────────────────────────────────────────
    const activePlayerSub = dbUser?.subscriptions.find(s => s.type === 'player') ?? null;
    let playerTier = activePlayerSub?.tier ?? 'FREE';
    if (activePlayerSub?.stripeSubscriptionId) {
        try {
            const stripeSub      = await stripe.subscriptions.retrieve(activePlayerSub.stripeSubscriptionId);
            const currentPriceId = stripeSub.items.data[0]?.price.id;
            const stripeTier     = currentPriceId ? priceIdToTier(currentPriceId) : null;
            if (stripeTier) {
                playerTier = stripeTier;
                if (stripeTier !== activePlayerSub.tier) {
                    prisma.subscription.update({
                        where: { id: activePlayerSub.id },
                        data:  { tier: stripeTier as SubscriptionTier },
                    }).catch(() => {});
                }
            }
        } catch { /* fall back to DB */ }
    }

    const commSub = await prisma.subscription.findFirst({
        where: {
            type:       'commissioner',
            leagueName: { equals: league.leagueName, mode: 'insensitive' },
            status:     { in: ['active', 'trialing'] },
        },
        orderBy: { createdAt: 'desc' },
        select:  { tier: true },
    });

    const syncedNameToId  = new Map((dbUser?.leagues ?? []).map(l => [l.leagueName.toLowerCase().trim(), l.id]));
    const leagueConnected = (dbUser?.connectedLeagues ?? []).some(cl => {
        if (cl.leagueName.toLowerCase().trim() === league.leagueName.toLowerCase().trim()) return true;
        return syncedNameToId.get(cl.leagueName.toLowerCase().trim()) === league.id;
    });
    const effectiveTier    = effectiveTierForLeague(playerTier, commSub?.tier ?? null, leagueConnected);
    const canUseRankings   = tierLevel(effectiveTier) >= 2;

    if (!canUseRankings) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-3">
                <p className="text-[#C8A951] font-semibold text-lg">Unlock Player Rankings</p>
                <p className="text-gray-400 text-sm max-w-sm mx-auto">
                    Player Rankings requires an All-Pro plan or higher.
                </p>
                <Link
                    href="/pricing"
                    className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-6 py-2.5 rounded-lg transition text-sm mt-2"
                >
                    View Plans
                </Link>
            </div>
        );
    }

    const rosterPositions = (league.rosterPositions as string[]) ?? sleeperLeague?.roster_positions ?? [];
    const leagueType: LeagueType  = sleeperLeague?.settings?.type === 2 ? 'Dynasty' : 'Redraft';
    const leagueSettings = buildLeagueSettings(rosterPositions, sleeperLeague?.scoring_settings);
    const ppr: PprFormat = league.scoringType === 'ppr' ? 1 : league.scoringType === 'half_ppr' ? 0.5 : 0;

    return (
        <PlayerRankings
            ppr={ppr}
            leagueType={leagueType}
            leagueSettings={leagueSettings}
        />
    );
}
