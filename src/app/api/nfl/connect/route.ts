// POST /api/nfl/connect — authenticate with NFL.com and store the sid cookie
// Accepts either { email, password } (auto-login) or { sid } (manual paste).
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { nflLogin } from '@/lib/nfl';

export async function POST(request: Request): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const body = await request.json() as { email?: string; password?: string; sid?: string };

    let sid: string;

    if (body.sid) {
        // Manual paste — validate it's a non-empty string
        sid = body.sid.trim();
        if (!sid) return Response.json({ error: 'sid is required' }, { status: 400 });
    } else if (body.email && body.password) {
        try {
            sid = await nflLogin(body.email.trim(), body.password);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'NFL login failed';
            return Response.json({ error: message }, { status: 400 });
        }
    } else {
        return Response.json({ error: 'Provide either { sid } or { email, password }' }, { status: 400 });
    }

    await prisma.user.update({
        where: { id: userId },
        data:  { nflSid: sid },
    });

    return Response.json({ ok: true });
}

// DELETE /api/nfl/connect — disconnect NFL.com
export async function DELETE(): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    await prisma.user.update({
        where: { id: userId },
        data:  { nflSid: null },
    });

    return Response.json({ ok: true });
}
