'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect, notFound } from 'next/navigation';

async function requireAdmin() {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isAdmin: true },
    });
    if (!user?.isAdmin) redirect('/dashboard');
}

export async function adminDeleteSubscription(subId: string): Promise<void> {
    await requireAdmin();

    const sub = await prisma.subscription.findUnique({ where: { id: subId } });
    if (!sub) notFound();

    await prisma.subscription.delete({ where: { id: subId } });
}

export async function adminSetSubscriptionLeagueName(
    subId: string,
    leagueName: string | null,
): Promise<void> {
    await requireAdmin();

    const sub = await prisma.subscription.findUnique({ where: { id: subId } });
    if (!sub) notFound();

    await prisma.subscription.update({
        where: { id: subId },
        data: { leagueName: leagueName === null ? null : leagueName.trim() || null },
    });
}
