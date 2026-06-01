/**
 * Creates Live Mode Stripe products + prices for FantasyiQ Trust commissioner plans.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/create-live-prices.mjs
 *
 * Output: JSON block of all 18 price IDs ready to paste into env vars.
 */

import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
    console.error('ERROR: STRIPE_SECRET_KEY env var is required.');
    process.exit(1);
}
if (!key.startsWith('sk_live_')) {
    console.error('ERROR: This script requires a LIVE mode key (sk_live_...). Got:', key.slice(0, 12) + '...');
    process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: '2025-04-30.basil' });

const SIZES = [8, 10, 12, 14, 16, 32];

const PLANS = [
    {
        name:    'Commissioner PRO',
        tier:    'PRO',
        dbTier:  'COMMISSIONER_PRO',
        prices:  { 8: 4499, 10: 5499, 12: 6499, 14: 7499, 16: 8499, 32: 16499 },
    },
    {
        name:    'Commissioner ALL-PRO',
        tier:    'ALLPRO',
        dbTier:  'COMMISSIONER_ALL_PRO',
        prices:  { 8: 5499, 10: 6499, 12: 7499, 14: 8499, 16: 9499, 32: 17499 },
    },
    {
        name:    'Commissioner ELITE',
        tier:    'ELITE',
        dbTier:  'COMMISSIONER_ELITE',
        prices:  { 8: 6499, 10: 7499, 12: 8499, 14: 9499, 16: 10499, 32: 18499 },
    },
];

async function main() {
    console.log('Creating FantasyiQ Trust Live Mode commissioner pricing catalog...\n');

    const result = {};   // { COMMISSIONER_PRO_8: 'price_...', ... }
    const catalog = {};  // { 'price_...': { type, tier, leagueSize } }  — for PLAN_CATALOG paste

    for (const plan of PLANS) {
        console.log(`\n── ${plan.name} ──`);

        // Create product
        const product = await stripe.products.create({
            name:        plan.name,
            description: `FantasyiQ Trust — ${plan.name} annual commissioner plan`,
            metadata: {
                planType: 'commissioner',
                tier:     plan.tier,
                app:      'fantasyiq-trust',
            },
        });
        console.log(`  Product created: ${product.id}`);

        // Create one price per league size
        for (const size of SIZES) {
            const amountCents = plan.prices[size];
            const price = await stripe.prices.create({
                product:    product.id,
                currency:   'usd',
                unit_amount: amountCents,
                recurring:  { interval: 'year' },
                nickname:   `${plan.name} — ${size}-Team`,
                metadata: {
                    planType:   'commissioner',
                    tier:       plan.tier,
                    leagueSize: String(size),
                },
            });

            const key = `${plan.dbTier}_${size}`;
            result[key] = price.id;
            catalog[price.id] = { type: 'commissioner', tier: plan.dbTier, leagueSize: size };

            const dollars = (amountCents / 100).toFixed(2);
            console.log(`  ✓ ${size}-team  $${dollars}/yr  →  ${price.id}`);
        }
    }

    // ── Output ────────────────────────────────────────────────────────────────

    console.log('\n\n══════════════════════════════════════════════════════');
    console.log('LIVE MODE PRICE IDs — paste into Vercel env vars');
    console.log('══════════════════════════════════════════════════════\n');

    console.log('# Commissioner PRO');
    for (const size of SIZES) console.log(`STRIPE_COMM_PRO_${size}="${result[`COMMISSIONER_PRO_${size}`]}"`);

    console.log('\n# Commissioner ALL-PRO');
    for (const size of SIZES) console.log(`STRIPE_COMM_ALLPRO_${size}="${result[`COMMISSIONER_ALL_PRO_${size}`]}"`);

    console.log('\n# Commissioner ELITE');
    for (const size of SIZES) console.log(`STRIPE_COMM_ELITE_${size}="${result[`COMMISSIONER_ELITE_${size}`]}"`);

    console.log('\n\n── PLAN_CATALOG entries (paste into src/lib/stripe.ts) ──\n');
    for (const [priceId, info] of Object.entries(catalog)) {
        console.log(`    '${priceId}': { type: 'commissioner', tier: '${info.tier}', leagueSize: ${info.leagueSize} },`);
    }

    console.log('\n\n── Raw JSON (all 18 IDs) ──\n');
    console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
    console.error('\nFATAL:', err.message);
    process.exit(1);
});
