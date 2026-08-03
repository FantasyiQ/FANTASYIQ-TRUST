// Backend-to-backend asset uploader for large static assets (e.g. self-hosted
// how-to videos) that don't fit the browser-based upload flows elsewhere.
// Bearer-secured with CRON_SECRET, same convention as the cron routes — not a
// user-facing endpoint.
export const maxDuration = 120;

import type { NextRequest } from 'next/server';
import { put } from '@vercel/blob';

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB

export async function POST(request: NextRequest): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file     = formData.get('file') as File | null;
    const pathname = (formData.get('pathname') as string | null)?.trim();

    if (!file)     return Response.json({ error: 'No file provided' }, { status: 400 });
    if (!pathname) return Response.json({ error: 'pathname is required' }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: 'File exceeds 200 MB limit.' }, { status: 413 });

    const blob = await put(pathname, file, {
        access: 'public',
        contentType: file.type || 'application/octet-stream',
        addRandomSuffix: false,
    });

    return Response.json({ url: blob.url });
}
