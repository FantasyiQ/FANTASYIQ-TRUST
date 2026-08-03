// Backend-to-backend asset uploader for large static assets (e.g. self-hosted
// how-to videos) that don't fit the browser-based upload flows elsewhere.
// Bearer-secured with CRON_SECRET, same convention as the cron routes — not a
// user-facing endpoint.
//
// Files small enough for a serverless function body go straight through POST.
// Larger files (Vercel functions reject request bodies above a few MB) instead
// request a client token here, then upload directly to Blob storage from the
// caller — the bytes never pass through this function.
export const maxDuration = 120;

import type { NextRequest } from 'next/server';
import { put } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB

function authorized(request: NextRequest): boolean {
    return request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
}

// GET /api/admin/upload-asset?pathname=videos/foo.mp4&contentType=video/mp4
// Returns a short-lived client token for a direct-to-Blob upload.
export async function GET(request: NextRequest): Promise<Response> {
    if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const pathname    = searchParams.get('pathname')?.trim();
    const contentType = searchParams.get('contentType')?.trim() || undefined;
    if (!pathname) return Response.json({ error: 'pathname is required' }, { status: 400 });

    const clientToken = await generateClientTokenFromReadWriteToken({
        pathname,
        addRandomSuffix: false,
        allowedContentTypes: contentType ? [contentType] : undefined,
        validUntil: Date.now() + 15 * 60 * 1000, // 15 minutes
    });

    return Response.json({ clientToken });
}

export async function POST(request: NextRequest): Promise<Response> {
    if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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
