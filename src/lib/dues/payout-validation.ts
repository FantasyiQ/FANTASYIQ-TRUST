/**
 * Pure validation helpers for dues payout approval.
 * Extracted so they can be unit-tested without DB or HTTP dependencies.
 */

export interface PayoutValidationResult {
    valid: true;
}
export interface PayoutValidationError {
    valid:  false;
    error:  string;
    status: number;
}
export type PayoutValidation = PayoutValidationResult | PayoutValidationError;

/**
 * Enforces the core financial invariant: assigned payout total must equal
 * the league pot within a $0.02 floating-point rounding tolerance.
 */
export function validatePayoutTotal(
    payoutTotal: number,
    potTotal:    number,
    toleranceDollars = 0.02,
): PayoutValidation {
    if (Math.abs(payoutTotal - potTotal) > toleranceDollars) {
        return {
            valid:  false,
            error:  `Payout total ($${payoutTotal.toFixed(2)}) does not match the league pot ($${potTotal.toFixed(2)}). Adjust payout spots before approving.`,
            status: 400,
        };
    }
    return { valid: true };
}

/**
 * Guards against double-paying a dues member (idempotency for webhook replays).
 */
export function isDuesPaymentIdempotent(duesStatus: string): boolean {
    return duesStatus === 'paid';
}

/**
 * Validates that required dues metadata fields are present on a Stripe event.
 */
export function extractDuesMetadata(
    metadata: Record<string, string> | null | undefined,
): { duesId: string; memberId: string } | null {
    const duesId   = metadata?.duesId;
    const memberId = metadata?.memberId;
    if (!duesId || !memberId) return null;
    return { duesId, memberId };
}

/**
 * Validates that the dues member belongs to the correct dues record
 * before updating their status (prevents cross-league data corruption).
 */
export function isMemberInDues(memberLeagueDuesId: string, duesId: string): boolean {
    return memberLeagueDuesId === duesId;
}
