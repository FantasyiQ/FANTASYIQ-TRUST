'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export type FeatureName =
    | 'trade_evaluator'
    | 'draft_report'
    | 'draft_assistant'
    | 'roster_values'
    | 'league_refresh'
    | 'power_rankings'
    | 'player_rankings'
    | 'start_sit'
    | 'league_finder_search'
    | 'dues_setup'
    | 'announcement_posted'
    | 'calendar_saved'
    | 'espn_sync'
    | 'sleeper_sync'
    | 'yahoo_sync'
    | 'nfl_sync';

/**
 * Fire-and-forget feature usage event.
 * Call this from server actions or server components after meaningful user interactions.
 * Never awaited in the calling component — errors are swallowed to avoid disrupting UX.
 */
export async function trackFeature(
    feature: FeatureName,
    metadata?: Record<string, string | number | boolean | null>,
): Promise<void> {
    try {
        const session = await auth();
        if (!session?.user?.id) return;

        await prisma.featureUsageEvent.create({
            data: {
                userId:  session.user.id,
                feature,
                metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
            },
        });
    } catch {
        // Never throw — analytics must not break user flows
    }
}
