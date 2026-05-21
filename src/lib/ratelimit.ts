// Rate limiting via Upstash Redis (sliding window algorithm).
// Fails open — if UPSTASH_REDIS_REST_URL/TOKEN are not set, all requests pass.
// Set these env vars in Vercel to activate enforcement.
//
// Free Upstash plan: https://upstash.com — 10k requests/day per database.

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Shared limiter instances (lazily created, reused across warm invocations)
let _search: Ratelimit | null = null;
let _public: Ratelimit | null = null;

function isConfigured(): boolean {
    return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function getRedis(): Redis {
    return new Redis({
        url:   process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
}

/** Player search — tight limit: 30 req / 60 s per IP */
function getSearchLimiter(): Ratelimit {
    if (!_search) {
        _search = new Ratelimit({
            redis:     getRedis(),
            limiter:   Ratelimit.slidingWindow(30, '60 s'),
            prefix:    'rl:search',
            analytics: false,
        });
    }
    return _search;
}

/** General public endpoints — 60 req / 60 s per IP */
function getPublicLimiter(): Ratelimit {
    if (!_public) {
        _public = new Ratelimit({
            redis:     getRedis(),
            limiter:   Ratelimit.slidingWindow(60, '60 s'),
            prefix:    'rl:public',
            analytics: false,
        });
    }
    return _public;
}

export type RateLimitResult =
    | { limited: false }
    | { limited: true; response: Response };

/** Apply player-search rate limit (30/min). Returns a 429 Response if exceeded. */
export async function checkSearchLimit(ip: string): Promise<RateLimitResult> {
    if (!isConfigured()) return { limited: false };
    const { success, limit, remaining, reset } = await getSearchLimiter().limit(ip);
    if (success) return { limited: false };
    return {
        limited: true,
        response: new Response(JSON.stringify({ error: 'Too many requests' }), {
            status:  429,
            headers: {
                'Content-Type':      'application/json',
                'X-RateLimit-Limit': String(limit),
                'X-RateLimit-Remaining': String(remaining),
                'X-RateLimit-Reset': String(reset),
                'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
            },
        }),
    };
}

/** Apply general public-endpoint rate limit (60/min). Returns a 429 Response if exceeded. */
export async function checkPublicLimit(ip: string): Promise<RateLimitResult> {
    if (!isConfigured()) return { limited: false };
    const { success, limit, remaining, reset } = await getPublicLimiter().limit(ip);
    if (success) return { limited: false };
    return {
        limited: true,
        response: new Response(JSON.stringify({ error: 'Too many requests' }), {
            status:  429,
            headers: {
                'Content-Type':      'application/json',
                'X-RateLimit-Limit': String(limit),
                'X-RateLimit-Remaining': String(remaining),
                'X-RateLimit-Reset': String(reset),
                'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
            },
        }),
    };
}

/** Extract the best available IP from a Next.js request. */
export function getClientIp(request: Request): string {
    const h = request.headers;
    return (
        h.get('x-real-ip') ??
        h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        'unknown'
    );
}
