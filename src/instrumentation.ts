const REQUIRED_ENV_VARS = [
    'AUTH_SECRET',
    'DATABASE_URL',
    'NEXTAUTH_URL',
    'RESEND_API_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'CRON_SECRET',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
] as const;

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // Validate required env vars at startup — fail loudly before serving any requests
        const missing = REQUIRED_ENV_VARS.filter(k => !process.env[k]);
        if (missing.length > 0) {
            throw new Error(
                `[startup] Missing required environment variables:\n${missing.map(k => `  - ${k}`).join('\n')}`
            );
        }

        await import('../sentry.server.config');
    }
    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('../sentry.edge.config');
    }
}
