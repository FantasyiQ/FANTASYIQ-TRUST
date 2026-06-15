// POST /api/webhooks/resend
// Receives delivery status events from Resend and updates EmailLog records.
// Configure in Resend Dashboard → Webhooks → https://fantasyiqtrust.com/api/webhooks/resend
import { Webhook } from 'svix';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const EVENT_STATUS: Record<string, string> = {
    'email.sent':              'sent',
    'email.scheduled':         'scheduled',
    'email.delivered':         'delivered',
    'email.delivery_delayed':  'delayed',
    'email.bounced':           'bounced',
    'email.complained':        'complained',
    'email.failed':            'failed',
    'email.suppressed':        'suppressed',
    'email.opened':            'opened',
    'email.clicked':           'clicked',
};

export async function POST(request: Request): Promise<Response> {
    const secret = process.env.RESEND_WEBHOOK_SECRET;

    const svixId        = request.headers.get('svix-id')        ?? '';
    const svixTimestamp = request.headers.get('svix-timestamp') ?? '';
    const svixSignature = request.headers.get('svix-signature') ?? '';
    const rawBody       = await request.text();

    // Verify signature if secret is configured
    if (secret) {
        try {
            const wh = new Webhook(secret);
            wh.verify(rawBody, {
                'svix-id':        svixId,
                'svix-timestamp': svixTimestamp,
                'svix-signature': svixSignature,
            });
        } catch {
            return Response.json({ error: 'Invalid signature' }, { status: 401 });
        }
    }

    let body: unknown;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const event = body as {
        type?:    string;
        data?: {
            email_id?: string;
            created_at?: string;
        };
    };

    const eventType = event?.type;
    const emailId   = event?.data?.email_id;

    if (!eventType || !emailId) {
        return Response.json({ ok: true, ignored: true });
    }

    const status = EVENT_STATUS[eventType];
    if (!status) {
        return Response.json({ ok: true, ignored: true });
    }

    // Update the EmailLog record matching this Resend message ID
    try {
        await prisma.emailLog.updateMany({
            where: { resendId: emailId },
            data:  { status, updatedAt: new Date() },
        });
    } catch {
        // Log doesn't exist yet — silently ignore (race condition on first send)
    }

    return Response.json({ ok: true });
}
