import * as Sentry from '@sentry/nextjs';

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Only send errors in production
    enabled: process.env.NODE_ENV === 'production',
    // Capture 10% of sessions for performance — adjust upward as needed
    tracesSampleRate: 0.1,
    // Replay 1% of sessions, 100% on error
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
});
