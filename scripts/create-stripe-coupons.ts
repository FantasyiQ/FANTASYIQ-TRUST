/**
 * One-time setup: create volume-discount coupons in Stripe.
 * Run with: npm run create-coupons
 *
 * Safe to re-run — deletes and recreates if the existing coupon has
 * a currency restriction (which is only valid for amount_off coupons,
 * not percent_off ones).
 */

import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2024-12-18.acacia',
});

const COUPONS = [
    { id: 'MULTI_LEAGUE_15', percent: 15, name: 'Multi-League 15% Discount' },
    { id: 'MULTI_LEAGUE_25', percent: 25, name: 'Multi-League 25% Discount' },
];

async function run() {
    for (const c of COUPONS) {
        let needsCreate = true;

        try {
            const existing = await stripe.coupons.retrieve(c.id);
            // If it was created with a currency restriction (invalid for percent_off),
            // delete it and recreate correctly.
            if (existing.currency) {
                console.log(`⚠  Coupon ${c.id} has currency restriction '${existing.currency}' — deleting and recreating...`);
                await stripe.coupons.del(c.id);
            } else {
                console.log(`✓ Coupon ${c.id} already exists correctly (${existing.percent_off}% off, no currency restriction)`);
                needsCreate = false;
            }
        } catch {
            // Coupon doesn't exist yet — create it
        }

        if (needsCreate) {
            const created = await stripe.coupons.create({
                id: c.id,
                name: c.name,
                percent_off: c.percent,
                duration: 'forever',
                // NOTE: do NOT set currency for percent_off coupons —
                // currency is only valid for amount_off coupons and
                // adds an invoice-currency restriction that causes
                // checkout session creation to fail.
            });
            console.log(`✓ Created coupon ${created.id} — ${created.percent_off}% off forever (no currency restriction)`);
        }
    }
}

run().catch(err => { console.error(err); process.exit(1); });
