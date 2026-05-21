/**
 * Thin wrapper around Sentry's captureException.
 * Fail-safe: if Sentry is not initialised (no DSN / dev environment),
 * this is a no-op so crons and routes can call it unconditionally.
 */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
    try {
        // Dynamic import keeps Sentry out of the critical path if DSN is absent.
        // We fire-and-forget: this never throws to the caller.
        import('@sentry/nextjs').then(({ captureException, withScope }) => {
            if (context) {
                withScope(scope => {
                    scope.setExtras(context);
                    captureException(err);
                });
            } else {
                captureException(err);
            }
        }).catch(() => {/* Sentry unavailable — ignore */});
    } catch {
        // Never let monitoring code break the app
    }
}
