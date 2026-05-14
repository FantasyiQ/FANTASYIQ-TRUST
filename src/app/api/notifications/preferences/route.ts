import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NotificationType } from '@/lib/notifications/types';

// GET — return all pref rows for this user (missing rows = default on/on)
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const prefs = await prisma.notificationPreference.findMany({
        where:  { userId: session.user.id },
        select: { type: true, email: true, inApp: true },
    });

    return Response.json({ prefs });
}

// PATCH — upsert one or many preference rows
// Body: { updates: { type: string; email?: boolean; inApp?: boolean }[] }
export async function PATCH(req: Request) {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as { updates: { type: string; email?: boolean; inApp?: boolean }[] };
    if (!Array.isArray(body?.updates)) return Response.json({ error: 'Invalid body' }, { status: 400 });

    const validTypes = new Set<string>(Object.values(NotificationType));
    validTypes.add('*'); // global opt-out

    const ops = body.updates.filter(u => validTypes.has(u.type));

    await Promise.all(ops.map(u =>
        prisma.notificationPreference.upsert({
            where:  { userId_type: { userId: session.user!.id!, type: u.type } },
            create: {
                userId:  session.user!.id!,
                type:    u.type,
                email:   u.email  ?? true,
                inApp:   u.inApp  ?? true,
            },
            update: {
                ...(u.email  !== undefined && { email: u.email }),
                ...(u.inApp  !== undefined && { inApp: u.inApp }),
            },
        })
    ));

    return Response.json({ ok: true });
}
