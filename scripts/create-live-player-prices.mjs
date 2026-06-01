/**
 * Creates Live Mode Stripe products + prices for FantasyiQ Trust player plans.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/create-live-player-prices.mjs
 *
 * Output: price IDs ready to paste into env vars and src/lib/stripe.ts.
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

const PLANS = [
    { name: 'Player Pro',     tier: 'PLAYER_PRO',     amountCents: 999,  leagueNote: 'Up to 2 leagues' },
    { name: 'Player All-Pro', tier: 'PLAYER_ALL_PRO',  amountCents: 2499, leagueNote: 'Up to 5 leagues' },
    { name: 'Player Elite',   tier: 'PLAYER_ELITE',    amountCents: 4499, leagueNote: 'Unlimited leagues' },
];

async function main() {
    console.log('Creating FantasyiQ Trust Live Mode player pricing catalog...\n');

    const result = [];

    for (const plan of PLANS) {
        const product = await stripe.products.create({
            name:        plan.name,
            description: `FantasyiQ Trust — ${plan.name} monthly player plan. ${plan.leagueNote}.`,
            metadata: {
                planType: 'player',
                tier:     plan.tier,
                app:      'fantasyiq-trust',
            },
        });

        const price = await stripe.prices.create({
            product:     product.id,
            currency:    'usd',
            unit_amount: plan.amountCents,
            recurring:   { interval: 'month' },
            nickname:    plan.name,
            metadata: {
                planType: 'player',
                tier:     plan.tier,
            },
        });

        const dollars = (plan.amountCents / 100).toFixed(2);
        console.log(`✓ ${plan.name}  $${dollars}/mo  →  product: ${product.id}  price: ${price.id}`);
        result.push({ name: plan.name, tier: plan.tier, productId: product.id, priceId: price.id });
    }

    console.log('\n\n══════════════════════════════════════════════════════');
    console.log('LIVE MODE PRICE IDs — paste into Vercel env vars');
    console.log('══════════════════════════════════════════════════════\n');
    for (const p of result) {
        console.log(`STRIPE_PRICE_${p.tier.replace('PLAYER_', '')}="${p.priceId}"`);
    }

    console.log('\n\n── PLAN_CATALOG entries (add to src/lib/stripe.ts) ──\n');
    for (const p of result) {
        console.log(`    '${p.priceId}': { type: 'player', tier: '${p.tier}', leagueSize: null },`);
    }

    console.log('\n\n── Raw JSON ──\n');
    console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
    console.error('\nFATAL:', err.message);
    process.exit(1);
});
