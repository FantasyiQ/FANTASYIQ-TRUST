/**
 * One-time setup: create volume-discount coupons in Stripe.
 * Run with: npx ts-node --project tsconfig.json scripts/create-stripe-coupons.ts
 * Or:       npx tsx scripts/create-stripe-coupons.ts
 */

import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2024-12-18.acacia',
});

async function run() {
    const coupons = [
        { id: 'MULTI_LEAGUE_15', percent: 15, name: 'Multi-League 15% Discount' },
        { id: 'MULTI_LEAGUE_25', percent: 25, name: 'Multi-League 25% Discount' },
    ];

    for (const c of coupons) {
        try {
            const existing = await stripe.coupons.retrieve(c.id);
            console.log(`✓ Coupon ${c.id} already exists (${existing.percent_off}% off)`);
        } catch {
            const created = await stripe.coupons.create({
                id: c.id,
                name: c.name,
                percent_off: c.percent,
                duration: 'forever',
                currency: 'usd',
            });
            console.log(`✓ Created coupon ${created.id} — ${created.percent_off}% off forever`);
        }
    }
}

run().catch(err => { console.error(err); process.exit(1); });
