import type { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/notifications/email';
import { renderTemplate } from '@/lib/notifications/templates';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: NextRequest): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;

    let email: string;
    try {
        const body = await request.json();
        email = (typeof body.email === 'string' ? body.email : '').trim().toLowerCase();
    } catch {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return Response.json({ error: 'Invalid email address' }, { status: 400 });
    }

    // Always return success — prevents email enumeration
    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, hashedPassword: true },
    });

    if (user?.hashedPassword) {
        // Only send reset for credentials accounts (not Google-only accounts)
        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + EXPIRY_MS);

        await prisma.passwordResetToken.create({
            data: { userId: user.id, token, expiresAt },
        });

        const appUrl = process.env.NEXTAUTH_URL ?? 'https://fantasyiq.app';
        const resetUrl = `${appUrl}/reset-password?token=${token}`;

        const html = renderTemplate('account.password_reset', {
            title: 'Reset your FantasyIQ password',
            body:  'Click below to reset your password.',
            data:  { resetUrl },
        });

        sendEmail({
            to:      email,
            subject: 'Reset your FantasyIQ password',
            html,
        }).catch(() => {});
    }

    return Response.json({ ok: true });
}
