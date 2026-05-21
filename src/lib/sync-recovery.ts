// FantasyiQ Trust — Sync Failure Auto-Recovery Engine (Phase 3, Engine 1)

import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';

// ── Error classification ──────────────────────────────────────────────────────

export type SyncErrorType = 'auth' | 'rate_limit' | 'network' | 'data' | 'unknown';

const AUTH_PATTERNS    = /credential|unauthorized|401|invalid.*token|swid|espn_s2|forbidden|403/i;
const RATE_PATTERNS    = /rate.?limit|429|too many request/i;
const NETWORK_PATTERNS = /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|fetch failed|network|socket|timeout/i;
const DATA_PATTERNS    = /cannot read|undefined is not|json|parse|unexpected token/i;

export function classifyError(err: unknown): SyncErrorType {
    const msg = err instanceof Error ? `${err.message} ${err.name}` : String(err);
    if (AUTH_PATTERNS.test(msg))    return 'auth';
    if (RATE_PATTERNS.test(msg))    return 'rate_limit';
    if (NETWORK_PATTERNS.test(msg)) return 'network';
    if (DATA_PATTERNS.test(msg))    return 'data';
    return 'unknown';
}

export function isTransient(type: SyncErrorType): boolean {
    return type === 'network' || type === 'rate_limit';
}

export function isPermanent(type: SyncErrorType): boolean {
    return type === 'auth';
}

// ── Exponential backoff ───────────────────────────────────────────────────────

// Within-cron delays (ms): attempt 1→2s, 2→4s, 3→8s
export function backoffMs(attempt: number): number {
    return Math.min(2 ** attempt * 1000, 8000);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Retry wrapper ─────────────────────────────────────────────────────────────

interface RetryOpts {
    maxAttempts?: number;   // default 3
    onRetry?:    (attempt: number, err: unknown) => void;
}

/**
 * Wraps an async function with retry + exponential backoff.
 * Only retries transient errors (network, rate_limit).
 * Auth and permanent errors throw immediately.
 */
export async function withRetry<T>(
    fn:   () => Promise<T>,
    opts: RetryOpts = {},
): Promise<T> {
    const max = opts.maxAttempts ?? 3;

    for (let attempt = 1; attempt <= max; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const type = classifyError(err);

            // Never retry auth errors
            if (isPermanent(type) || attempt >= max) throw err;

            // Only retry transient errors
            if (!isTransient(type)) throw err;

            opts.onRetry?.(attempt, err);
            await sleep(backoffMs(attempt));
        }
    }

    // TypeScript satisfaction — unreachable
    throw new Error('Retry loop exhausted');
}

// ── Cross-run backoff (should this league be skipped this cron run?) ──────────

const BACKOFF_WINDOWS_MS: Record<number, number> = {
    1: 5  * 60 * 1000,  // 1 error  → wait 5 min
    2: 30 * 60 * 1000,  // 2 errors → wait 30 min
    3: 60 * 60 * 1000,  // 3 errors → wait 1 hour
};
const MAX_AUTO_RETRIES = 3;

export function shouldSkipLeague(league: {
    syncStatus:      string;
    syncErrorCount:  number;
    syncLastErrorAt: Date | null;
}): boolean {
    if (league.syncStatus === 'ok') return false;
    if (league.syncErrorCount >= MAX_AUTO_RETRIES) return true; // permanent failure

    const lastErr = league.syncLastErrorAt?.getTime() ?? 0;
    const window  = BACKOFF_WINDOWS_MS[league.syncErrorCount] ?? 0;
    return Date.now() < lastErr + window;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

export async function recordSyncFailure({
    userId,
    leagueDbId,
    platform,
    err,
    attempt = 1,
}: {
    userId:      string;
    leagueDbId?: string;
    platform:    string;
    err:         unknown;
    attempt?:    number;
}): Promise<void> {
    const errorType = classifyError(err);
    const errorMsg  = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);

    // Report unknown / data errors to Sentry — transient network/rate-limit errors are expected
    if (errorType === 'unknown' || errorType === 'data') {
        captureError(err, { userId, leagueDbId, platform, errorType, attempt });
    }

    await Promise.all([
        // Log the recovery event
        prisma.syncRecoveryEvent.create({
            data: {
                userId,
                leagueDbId: leagueDbId ?? null,
                platform,
                errorType,
                errorMsg,
                attempt,
                resolved: false,
            },
        }),
        // Update league sync health
        leagueDbId
            ? prisma.league.update({
                where: { id: leagueDbId },
                data:  {
                    syncErrorCount:  { increment: 1 },
                    syncLastError:   errorMsg,
                    syncLastErrorAt: new Date(),
                    syncStatus:      isPermanent(errorType) ? 'failed' : 'failing',
                },
            }).then(async league => {
                // Create in-app notification if permanently failed
                if (league.syncErrorCount >= MAX_AUTO_RETRIES || isPermanent(errorType)) {
                    const msgMap: Record<string, string> = {
                        auth:    `Your ${platform.toUpperCase()} credentials have expired for "${league.leagueName}". Update them to resume syncing.`,
                        default: `Sync failed for "${league.leagueName}" after multiple attempts. Try a manual refresh.`,
                    };
                    const body = msgMap[errorType] ?? msgMap.default;
                    await prisma.notification.create({
                        data: {
                            userId,
                            type:  'sync_failure',
                            title: 'League sync failed',
                            body,
                            data:  { leagueId: leagueDbId, platform, errorType },
                        },
                    }).catch(() => {}); // never block on notification failure
                }
            }).catch(() => {})
            : Promise.resolve(),
    ]).catch(() => {}); // recovery logging must never crash the cron
}

export async function recordSyncRecovered(leagueDbId: string): Promise<void> {
    await Promise.all([
        // Resolve open events for this league
        prisma.syncRecoveryEvent.updateMany({
            where:  { leagueDbId, resolved: false },
            data:   { resolved: true, resolvedAt: new Date() },
        }),
        // Reset league sync health
        prisma.league.update({
            where: { id: leagueDbId },
            data:  { syncStatus: 'ok', syncErrorCount: 0, syncLastError: null, syncLastErrorAt: null },
        }),
    ]).catch(() => {});
}

// ── Summary for admin ─────────────────────────────────────────────────────────

export async function getSyncFailureSummary() {
    const [unresolvedCount, failingLeagues, recentEvents] = await Promise.all([
        prisma.syncRecoveryEvent.count({ where: { resolved: false } }),
        prisma.league.findMany({
            where:   { syncStatus: { not: 'ok' } },
            select:  { id: true, leagueName: true, platform: true, syncStatus: true, syncErrorCount: true, syncLastError: true, syncLastErrorAt: true },
            orderBy: { syncLastErrorAt: 'desc' },
        }),
        prisma.syncRecoveryEvent.findMany({
            where:   { resolved: false },
            orderBy: { createdAt: 'desc' },
            take:    20,
            select:  { id: true, platform: true, errorType: true, errorMsg: true, attempt: true, createdAt: true, leagueDbId: true },
        }),
    ]);

    return { unresolvedCount, failingLeagues, recentEvents };
}
