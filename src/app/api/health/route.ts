export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';

export async function GET() {
    const start = Date.now();

    try {
        await prisma.$queryRaw`SELECT 1`;
        const latency = Date.now() - start;

        return Response.json(
            { ok: true, db: 'connected', latencyMs: latency },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { ok: false, db: 'unreachable' },
            { status: 503 }
        );
    }
}
