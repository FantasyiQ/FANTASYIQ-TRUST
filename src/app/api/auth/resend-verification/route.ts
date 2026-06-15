import type { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/notifications/email';
import { renderTemplate } from '@/lib/notifications/templates';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;

    const user = await prisma.user.findUnique({
        where:  { id: session.user.id },
        select: { id: true, email: true, emailVerified: true, name: true },
    });

    if (!user?.email) {
        return Response.json({ error: 'User not found' }, { status: 404 });
    }
    if (user.emailVerified) {
        return Response.json({ ok: true, alreadyVerified: true });
    }

    const token     = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + EXPIRY_MS);

    await prisma.emailVerificationToken.create({
        data: { userId: user.id, token, expiresAt },
    });

    const appUrl    = process.env.NEXTAUTH_URL ?? 'https://fantasyiqtrust.com';
    const verifyUrl = `${appUrl}/api/auth/verify-email?token=${token}`;

    const html = renderTemplate('account.email_verification', {
        title: 'Verify your FantasyiQ Trust email',
        body:  'Click below to verify your email address.',
        data:  { verifyUrl },
    });

    await sendEmail({
        to:      user.email,
        subject: 'Verify your FantasyiQ Trust email address',
        html,
    });

    return Response.json({ ok: true });
}
