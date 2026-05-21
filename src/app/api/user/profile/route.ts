import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PATCH /api/user/profile — update mutable profile fields (currently: email, name)
export async function PATCH(request: Request): Promise<Response> {
    const limited = await checkMutationLimit(getClientIp(request));
    if (limited) return limited;

    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const updates: { email?: string; name?: string } = {};

    if ('email' in body) {
        const email = String(body.email ?? '').trim().toLowerCase();
        if (!email) return Response.json({ error: 'Email is required' }, { status: 400 });
        if (!EMAIL_RE.test(email)) return Response.json({ error: 'Invalid email address' }, { status: 400 });
        if (email.length > 254) return Response.json({ error: 'Email too long' }, { status: 400 });

        // Check uniqueness (exclude current user)
        const existing = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });
        if (existing && existing.id !== session.user.id) {
            return Response.json({ error: 'That email is already in use' }, { status: 409 });
        }
        updates.email = email;
    }

    if ('name' in body) {
        const name = String(body.name ?? '').trim();
        if (name.length > 100) return Response.json({ error: 'Name too long' }, { status: 400 });
        updates.name = name || null as unknown as string;
    }

    if (Object.keys(updates).length === 0) {
        return Response.json({ error: 'Nothing to update' }, { status: 400 });
    }

    await prisma.user.update({
        where: { id: session.user.id },
        data:  updates,
    });

    return Response.json({ ok: true });
}
