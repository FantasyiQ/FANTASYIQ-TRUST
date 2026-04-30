import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

interface GiphyImage {
    url: string;
}
interface GiphyGif {
    id: string;
    images: {
        fixed_height:       GiphyImage;
        fixed_height_small?: GiphyImage;
    };
}
interface GiphyResponse {
    data: GiphyGif[];
}

export async function GET(req: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const q = req.nextUrl.searchParams.get('q')?.trim();
    if (!q) return Response.json({ results: [] });

    const key = process.env.GIPHY_API_KEY;
    if (!key) return Response.json({ error: 'Giphy not configured.' }, { status: 503 });

    const giphyUrl = `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=12&rating=pg`;
    const res = await fetch(giphyUrl, { next: { revalidate: 30 } });
    if (!res.ok) return Response.json({ error: 'Giphy request failed.' }, { status: 502 });

    const data = await res.json() as GiphyResponse;

    const results = data.data.map(gif => ({
        id:         gif.id,
        url:        gif.images.fixed_height.url,
        previewUrl: gif.images.fixed_height_small?.url ?? gif.images.fixed_height.url,
    }));

    return Response.json({ results });
}
