// Temporary containment measure: dues money currently pools in FiQ's own
// Stripe balance with no per-league fund separation (see project memory —
// Stripe pooled-balance hold risk). Until that's reworked, new dues trackers
// are limited to the founder's own leagues so the blast radius of that risk
// stays contained to known, already-collected money.
const DUES_CREATION_ALLOWLIST = new Set([
    'russell@fantasyiqtrust.com',
]);

export function canCreateDuesTracker(email: string | null | undefined): boolean {
    if (!email) return false;
    return DUES_CREATION_ALLOWLIST.has(email.toLowerCase());
}
