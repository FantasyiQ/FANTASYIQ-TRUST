'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function unsyncLeague(dbId: string, leagueId: string, platform = 'sleeper'): Promise<void> {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    await prisma.$transaction([
        // Deleted by the League row's own id — leagueId+platform alone is no
        // longer unique per user now that a league can have multiple season
        // rows (see the historical-season sync features).
        prisma.league.deleteMany({
            where: { id: dbId, userId: session.user.id },
        }),
        // Record the exclusion so re-sync never recreates this league
        prisma.syncExclusion.upsert({
            where: {
                userId_platform_leagueId: {
                    userId: session.user.id,
                    platform,
                    leagueId,
                },
            },
            create: { userId: session.user.id, platform, leagueId },
            update: {},
        }),
    ]);

    redirect('/dashboard');
}
