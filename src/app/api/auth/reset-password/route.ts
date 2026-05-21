import type { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

export async function POST(request: NextRequest): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;

    let token: string, password: string;
    try {
        const body = await request.json();
        token    = typeof body.token    === 'string' ? body.token.trim()    : '';
        password = typeof body.password === 'string' ? body.password        : '';
    } catch {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!token) {
        return Response.json({ error: 'Token is required' }, { status: 400 });
    }
    if (!password || password.length < 8) {
        return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const record = await prisma.passwordResetToken.findUnique({
        where: { token },
        select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!record) {
        return Response.json({ error: 'Invalid or expired reset link' }, { status: 400 });
    }
    if (record.usedAt || record.expiresAt < new Date()) {
        return Response.json({ error: 'This reset link has expired or already been used' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.$transaction([
        prisma.user.update({
            where: { id: record.userId },
            data:  { hashedPassword },
        }),
        prisma.passwordResetToken.update({
            where: { id: record.id },
            data:  { usedAt: new Date() },
        }),
    ]);

    return Response.json({ ok: true });
}
