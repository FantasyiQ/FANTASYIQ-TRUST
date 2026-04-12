'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function unsyncLeague(leagueId: string): Promise<void> {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    await prisma.league.delete({
        where: {
            userId_platform_leagueId: {
                userId: session.user.id,
                platform: 'sleeper',
                leagueId,
            },
        },
    });

    redirect('/dashboard');
}
