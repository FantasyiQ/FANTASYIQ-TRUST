import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    isCheckoutPaid,
    resolvePaymentMethod,
    hasEnoughBalance,
    dollarsToCents,
} from './webhook-helpers.ts';

// ── isCheckoutPaid ────────────────────────────────────────────────────────────

describe('isCheckoutPaid', () => {
    test('returns true for paid status', () => {
        assert.equal(isCheckoutPaid('paid'), true);
    });

    test('returns false for unpaid status (blocks writing dues records)', () => {
        assert.equal(isCheckoutPaid('unpaid'), false);
    });

    test('returns false for no_payment_required', () => {
        assert.equal(isCheckoutPaid('no_payment_required'), false);
    });
});

// ── resolvePaymentMethod ──────────────────────────────────────────────────────

describe('resolvePaymentMethod', () => {
    test('LEAGUE_DUES resolves to stripe_direct', () => {
        assert.equal(resolvePaymentMethod('LEAGUE_DUES'), 'stripe_direct');
    });

    test('LEAGUE_DUES_ON_BEHALF resolves to stripe_on_behalf', () => {
        assert.equal(resolvePaymentMethod('LEAGUE_DUES_ON_BEHALF'), 'stripe_on_behalf');
    });

    test('FUTURE_DUES resolves to stripe_future_dues', () => {
        assert.equal(resolvePaymentMethod('FUTURE_DUES'), 'stripe_future_dues');
    });
});

// ── hasEnoughBalance ──────────────────────────────────────────────────────────

describe('hasEnoughBalance', () => {
    test('returns true when balance covers pending + new payout exactly', () => {
        // $500 balance, $300 pending, $200 new = exactly covered
        assert.equal(hasEnoughBalance(50000, 30000, 20000), true);
    });

    test('returns true when balance exceeds total required', () => {
        assert.equal(hasEnoughBalance(100000, 10000, 20000), true);
    });

    test('returns false when balance is insufficient (prevents over-disbursement)', () => {
        // $400 balance, $300 pending, $200 new = $100 short
        assert.equal(hasEnoughBalance(40000, 30000, 20000), false);
    });

    test('returns false when balance is zero and payouts are pending', () => {
        assert.equal(hasEnoughBalance(0, 10000, 5000), false);
    });

    test('returns true when no pending payouts and balance covers new payout', () => {
        assert.equal(hasEnoughBalance(20000, 0, 20000), true);
    });
});

// ── dollarsToCents ────────────────────────────────────────────────────────────

describe('dollarsToCents', () => {
    test('converts whole dollars correctly', () => {
        assert.equal(dollarsToCents(100), 10000);
    });

    test('converts fractional dollars without floating point errors', () => {
        assert.equal(dollarsToCents(49.99), 4999);
    });

    test('converts zero', () => {
        assert.equal(dollarsToCents(0), 0);
    });

    test('rounds correctly for sub-cent amounts', () => {
        // $49.995 should round to $50.00 = 5000 cents
        assert.equal(dollarsToCents(49.995), 5000);
    });
});
