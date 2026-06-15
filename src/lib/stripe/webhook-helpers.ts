/**
 * Pure helper functions for Stripe webhook processing.
 * Extracted for testability — no Stripe SDK or DB dependencies.
 */

/**
 * Validates that a checkout session carries the right payment_status
 * before writing any dues records (prevents logging failed payments as paid).
 */
export function isCheckoutPaid(paymentStatus: string): boolean {
    return paymentStatus === 'paid';
}

/**
 * Determines the correct paymentMethod string for dues member records
 * based on the Stripe checkout session type.
 */
export function resolvePaymentMethod(
    type: 'LEAGUE_DUES' | 'LEAGUE_DUES_ON_BEHALF' | 'FUTURE_DUES',
): string {
    switch (type) {
        case 'LEAGUE_DUES':             return 'stripe_direct';
        case 'LEAGUE_DUES_ON_BEHALF':   return 'stripe_on_behalf';
        case 'FUTURE_DUES':             return 'stripe_future_dues';
    }
}

/**
 * Checks whether a Stripe balance (in cents) is sufficient to cover
 * total pending payouts plus the new payout being approved.
 */
export function hasEnoughBalance(
    availableBalanceCents: number,
    pendingPayoutsCents:   number,
    newPayoutCents:        number,
): boolean {
    return availableBalanceCents >= pendingPayoutsCents + newPayoutCents;
}

/**
 * Converts a dollar amount to Stripe cents (integer, no float rounding issues).
 */
export function dollarsToCents(dollars: number): number {
    return Math.round(dollars * 100);
}
