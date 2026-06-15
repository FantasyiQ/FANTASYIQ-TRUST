import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/notifications/email';

export async function POST(): Promise<Response> {
    try {
        const session = await auth();
        if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const user = await prisma.user.findUnique({
            where:  { id: session.user.id },
            select: { isAdmin: true, email: true },
        });
        if (!user?.isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

        await sendEmail({
            to:      user.email!,
            subject: 'FiQ webhook test — delivery tracking check',
            html:    '<p>This is a test email to verify Resend webhook delivery tracking is working on <strong>FantasyiQ Trust</strong>.</p>',
            type:    'test',
        });

        return Response.json({ ok: true, to: user.email });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[test-email] uncaught error:', message);
        return Response.json({ error: message }, { status: 500 });
    }
}
