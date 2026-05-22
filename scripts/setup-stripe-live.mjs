#!/usr/bin/env node
/**
 * One-shot Stripe live mode setup.
 * Creates all products, prices, webhook endpoint, and coupons.
 *
 * Usage:
 *   STRIPE_LIVE_KEY=sk_live_xxx node scripts/setup-stripe-live.mjs
 *
 * Safe to re-run: idempotent via metadata lookup (won't duplicate).
 */

import Stripe from 'stripe';

const key = process.env.STRIPE_LIVE_KEY ?? process.env.STRIPE_SECRET_KEY;
if (!key) {
    console.error('ERROR: Set STRIPE_LIVE_KEY=sk_live_xxx (or STRIPE_SECRET_KEY) before running.');
    process.exit(1);
}
const isLive = key.startsWith('sk_live_');
if (!isLive) {
    console.log('⚠️  Running in TEST mode (key starts with sk_test_). Use STRIPE_LIVE_KEY=sk_live_... for production.\n');
}

const stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' });
const APP_URL = process.env.APP_URL ?? 'https://fantasyiq-trust.vercel.app';

// ─── Helper: find or create a product ────────────────────────────────────────
async function findOrCreateProduct(slug, name, description) {
    const existing = await stripe.products.search({ query: `metadata['slug']:'${slug}'`, limit: 1 });
    if (existing.data.length > 0) return existing.data[0];
    return stripe.products.create({
        name,
        description,
        metadata: { slug },
    });
}

// ─── Helper: find or create a recurring price ────────────────────────────────
async function findOrCreatePrice(productId, amountCents, slug) {
    const existing = await stripe.prices.search({ query: `metadata['slug']:'${slug}'`, limit: 1 });
    if (existing.data.length > 0) return existing.data[0];
    return stripe.prices.create({
        product:    productId,
        unit_amount: amountCents,
        currency:   'usd',
        recurring:  { interval: 'month' },
        metadata:   { slug },
    });
}

// ─── Helper: find or create a coupon ─────────────────────────────────────────
async function findOrCreateCoupon(id, params) {
    try {
        return await stripe.coupons.retrieve(id);
    } catch {
        return stripe.coupons.create({ id, ...params });
    }
}

console.log('\n🏈 FiQ — Stripe Live Mode Setup\n');
console.log(`App URL: ${APP_URL}`);
console.log(`Using key: ${key.slice(0, 12)}...\n`);

const priceMap = {};

// ─── 1. Player Plans ──────────────────────────────────────────────────────────
console.log('── Player Plans ──');

const playerPro     = await findOrCreateProduct('player_pro',     'FiQ Player Pro',      'Player plan — up to 2 leagues');
const playerAllPro  = await findOrCreateProduct('player_all_pro', 'FiQ Player All-Pro',  'Player plan — up to 4 leagues');
const playerElite   = await findOrCreateProduct('player_elite',   'FiQ Player Elite',    'Player plan — up to 7 leagues');
const playerEliteIQ = await findOrCreateProduct('player_eliteiq', 'FiQ Player ELITEiQ',  'Player plan — unlimited leagues');

priceMap.PLAYER_PRO      = (await findOrCreatePrice(playerPro.id,     999,  'player_pro_monthly')).id;
priceMap.PLAYER_ALL_PRO  = (await findOrCreatePrice(playerAllPro.id,  1999, 'player_all_pro_monthly')).id;
priceMap.PLAYER_ELITE    = (await findOrCreatePrice(playerElite.id,   3499, 'player_elite_monthly')).id;
priceMap.PLAYER_ELITEIQ  = (await findOrCreatePrice(playerEliteIQ.id, 5999, 'player_eliteiq_monthly')).id;

console.log(`  Player Pro     : ${priceMap.PLAYER_PRO}`);
console.log(`  Player All-Pro : ${priceMap.PLAYER_ALL_PRO}`);
console.log(`  Player Elite   : ${priceMap.PLAYER_ELITE}`);
console.log(`  Player ELITEiQ : ${priceMap.PLAYER_ELITEIQ}`);

// ─── 2. Commissioner Plans ────────────────────────────────────────────────────
const commSizes = [
    { size: 8,  pro: 4499,  allPro: 5499,  elite: 6499  },
    { size: 10, pro: 5499,  allPro: 6499,  elite: 7499  },
    { size: 12, pro: 6499,  allPro: 7499,  elite: 8499  },
    { size: 14, pro: 7499,  allPro: 8499,  elite: 9499  },
    { size: 16, pro: 8499,  allPro: 9499,  elite: 10499 },
    { size: 32, pro: 16499, allPro: 17499, elite: 18499 },
];

console.log('\n── Commissioner Pro ──');
const commPro = await findOrCreateProduct('commissioner_pro', 'FiQ Commissioner Pro', 'Commissioner plan — Pro tier');
for (const { size, pro } of commSizes) {
    const slug = `comm_pro_${size}`;
    priceMap[`COMM_PRO_${size}`] = (await findOrCreatePrice(commPro.id, pro, slug)).id;
    console.log(`  Pro ${size.toString().padStart(2)} teams : ${priceMap[`COMM_PRO_${size}`]}`);
}

console.log('\n── Commissioner All-Pro ──');
const commAllPro = await findOrCreateProduct('commissioner_all_pro', 'FiQ Commissioner All-Pro', 'Commissioner plan — All-Pro tier');
for (const { size, allPro } of commSizes) {
    const slug = `comm_all_pro_${size}`;
    priceMap[`COMM_ALL_PRO_${size}`] = (await findOrCreatePrice(commAllPro.id, allPro, slug)).id;
    console.log(`  All-Pro ${size.toString().padStart(2)} teams : ${priceMap[`COMM_ALL_PRO_${size}`]}`);
}

console.log('\n── Commissioner Elite ──');
const commElite = await findOrCreateProduct('commissioner_elite', 'FiQ Commissioner Elite', 'Commissioner plan — Elite tier');
for (const { size, elite } of commSizes) {
    const slug = `comm_elite_${size}`;
    priceMap[`COMM_ELITE_${size}`] = (await findOrCreatePrice(commElite.id, elite, slug)).id;
    console.log(`  Elite ${size.toString().padStart(2)} teams : ${priceMap[`COMM_ELITE_${size}`]}`);
}

// ─── 3. Webhook Endpoint ──────────────────────────────────────────────────────
console.log('\n── Webhook Endpoint ──');
const webhookUrl = `${APP_URL}/api/webhooks/stripe`;
const enabledEvents = [
    'checkout.session.completed',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.trial_will_end',
    'invoice.payment_failed',
    'invoice.payment_succeeded',
    'invoice.payment_action_required',
];

let webhook;
const existingWebhooks = await stripe.webhookEndpoints.list({ limit: 20 });
const existingWebhook  = existingWebhooks.data.find(w => w.url === webhookUrl);

if (existingWebhook) {
    webhook = existingWebhook;
    console.log(`  Already exists: ${webhookUrl}`);
    console.log('  ⚠️  Cannot retrieve signing secret for existing webhooks — check Stripe Dashboard.');
} else {
    webhook = await stripe.webhookEndpoints.create({
        url:             webhookUrl,
        enabled_events:  enabledEvents,
        description:     'FiQ production webhook',
    });
    console.log(`  Created: ${webhookUrl}`);
    console.log(`  STRIPE_WEBHOOK_SECRET=${webhook.secret}`);
}

// ─── 4. Coupons ───────────────────────────────────────────────────────────────
console.log('\n── Coupons ──');

const allpro100 = await findOrCreateCoupon('ALLPRO100', {
    name:               'ALLPRO100 — Free Commissioner Year 1',
    percent_off:        100,
    duration:           'once',
    max_redemptions:    500,
});
console.log(`  ALLPRO100       : ${allpro100.id} (${allpro100.percent_off}% off, ${allpro100.duration})`);

const multi10 = await findOrCreateCoupon('MULTI_LEAGUE_10', {
    name:        'Multi-League 10% Off',
    percent_off: 10,
    duration:    'forever',
});
console.log(`  MULTI_LEAGUE_10 : ${multi10.id} (${multi10.percent_off}% off, ${multi10.duration})`);

const multi15 = await findOrCreateCoupon('MULTI_LEAGUE_15', {
    name:        'Multi-League 15% Off',
    percent_off: 15,
    duration:    'forever',
});
console.log(`  MULTI_LEAGUE_15 : ${multi15.id} (${multi15.percent_off}% off, ${multi15.duration})`);

// ─── 5. Output env vars and PLAN_CATALOG ─────────────────────────────────────
console.log('\n\n════════════════════════════════════════════════════════════════');
console.log('COPY THESE INTO VERCEL ENV VARS (production):');
console.log('════════════════════════════════════════════════════════════════\n');

console.log(`STRIPE_PRICE_PRO=${priceMap.PLAYER_PRO}`);
console.log(`STRIPE_PRICE_ALL_PRO=${priceMap.PLAYER_ALL_PRO}`);
console.log(`STRIPE_PRICE_ELITE=${priceMap.PLAYER_ELITE}`);
console.log(`STRIPE_PRICE_ELITEIQ=${priceMap.PLAYER_ELITEIQ}`);
if (webhook.secret) {
    console.log(`STRIPE_WEBHOOK_SECRET=${webhook.secret}`);
}

console.log('\n\n════════════════════════════════════════════════════════════════');
console.log('PLAN_CATALOG for src/lib/stripe.ts:');
console.log('════════════════════════════════════════════════════════════════\n');

const catalog = [
    `    '${priceMap.PLAYER_PRO}':      { type: 'player', tier: 'PLAYER_PRO',      leagueSize: null },`,
    `    '${priceMap.PLAYER_ALL_PRO}':  { type: 'player', tier: 'PLAYER_ALL_PRO',  leagueSize: null },`,
    `    '${priceMap.PLAYER_ELITE}':    { type: 'player', tier: 'PLAYER_ELITE',    leagueSize: null },`,
    `    '${priceMap.PLAYER_ELITEIQ}':  { type: 'player', tier: 'PLAYER_ELITEIQ',  leagueSize: null },`,
];
for (const { size } of commSizes) {
    catalog.push(`    '${priceMap[`COMM_PRO_${size}`]}':     { type: 'commissioner', tier: 'COMMISSIONER_PRO',      leagueSize: ${size} },`);
}
for (const { size } of commSizes) {
    catalog.push(`    '${priceMap[`COMM_ALL_PRO_${size}`]}': { type: 'commissioner', tier: 'COMMISSIONER_ALL_PRO', leagueSize: ${size} },`);
}
for (const { size } of commSizes) {
    catalog.push(`    '${priceMap[`COMM_ELITE_${size}`]}':   { type: 'commissioner', tier: 'COMMISSIONER_ELITE',   leagueSize: ${size} },`);
}

console.log('export const PLAN_CATALOG: Record<string, PlanInfo> = {');
catalog.forEach(l => console.log(l));
console.log('};');

console.log('\n✅ Done. Update src/lib/stripe.ts with the catalog above, then run:');
console.log('   npx vercel env add STRIPE_SECRET_KEY production');
console.log('   npx vercel env add STRIPE_PUBLISHABLE_KEY production');
console.log('   npx vercel env add STRIPE_WEBHOOK_SECRET production');
console.log('   npx vercel env add STRIPE_PRICE_PRO production');
console.log('   npx vercel env add STRIPE_PRICE_ALL_PRO production');
console.log('   npx vercel env add STRIPE_PRICE_ELITE production');
console.log('   npx vercel env add STRIPE_PRICE_ELITEIQ production\n');
