/**
 * Creates live mode Stripe coupons for FantasyiQ Trust.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/create-live-coupons.mjs
 */

import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error('ERROR: STRIPE_SECRET_KEY required.'); process.exit(1); }
if (!key.startsWith('sk_live_')) { console.error('ERROR: Live key required (sk_live_...).'); process.exit(1); }

const stripe = new Stripe(key, { apiVersion: '2025-04-30.basil' });

async function main() {
    const coupon = await stripe.coupons.create({
        id:                 'ELITE100',
        name:               'Year 1 Free — Commissioner Elite',
        percent_off:        100,
        duration:           'once',          // applies to first billing cycle only
        max_redemptions:    100,             // hard cap at 100 leagues
        applies_to: {
            products: [
                'prod_UcqB3Yj9YJJrg2',      // Commissioner Elite (live)
            ],
        },
        metadata: {
            app:    'fantasyiq-trust',
            notes:  'Year 1 free for Commissioner Elite — limited to 100 leagues',
        },
    });

    console.log('\n✓ Coupon created:');
    console.log(`  ID:              ${coupon.id}`);
    console.log(`  Discount:        ${coupon.percent_off}% off`);
    console.log(`  Duration:        ${coupon.duration} (first year only)`);
    console.log(`  Max redemptions: ${coupon.max_redemptions}`);
    console.log(`  Applies to:      Commissioner Elite product`);
}

main().catch(err => {
    console.error('\nFATAL:', err.message);
    process.exit(1);
});
