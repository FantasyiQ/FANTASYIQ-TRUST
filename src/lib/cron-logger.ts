import { prisma } from '@/lib/prisma';

export interface CronResult {
    processed?: number;
    errors?:    number;
    message?:   string;
}

/**
 * Wraps a cron handler with execution logging.
 * Records start time, outcome, duration, and item counts to CronLog.
 * Never throws — logging failures are swallowed so crons keep running.
 */
export async function withCronLog<T extends CronResult>(
    cron: string,
    fn: () => Promise<T>,
): Promise<T> {
    const start = Date.now();
    try {
        const result = await fn();
        void prisma.cronLog.create({
            data: {
                cron,
                status:     result.errors && result.errors > 0 ? 'partial' : 'success',
                durationMs: Date.now() - start,
                processed:  result.processed ?? null,
                errors:     result.errors    ?? null,
                message:    result.message   ?? null,
            },
        }).catch(() => {});
        return result;
    } catch (err) {
        void prisma.cronLog.create({
            data: {
                cron,
                status:     'error',
                durationMs: Date.now() - start,
                message:    err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
            },
        }).catch(() => {});
        throw err;
    }
}
