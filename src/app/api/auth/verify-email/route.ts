import type { NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest): Promise<Response> {
    const token = request.nextUrl.searchParams.get('token') ?? '';

    if (!token) {
        redirect('/dashboard?verified=invalid');
    }

    const record = await prisma.emailVerificationToken.findUnique({
        where: { token },
        select: { id: true, userId: true, expiresAt: true },
    });

    if (!record || record.expiresAt < new Date()) {
        redirect('/dashboard?verified=expired');
    }

    await prisma.$transaction([
        prisma.user.update({
            where: { id: record.userId },
            data:  { emailVerified: new Date() },
        }),
        prisma.emailVerificationToken.delete({
            where: { id: record.id },
        }),
    ]);

    redirect('/dashboard?verified=1');
}
