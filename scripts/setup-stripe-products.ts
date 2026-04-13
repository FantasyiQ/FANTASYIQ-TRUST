/**
 * Resets and recreates all Stripe products/prices for FantasyIQ.
 * Runs against .env.local — test mode only.
 *
 * Run with: npx tsx scripts/setup-stripe-products.ts
 */

import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const key = process.env.STRIPE_SECRET_KEY!;
if (!key.startsWith('sk_test_')) {
    console.error('ERROR: STRIPE_SECRET_KEY is not a test key. Aborting.');
    process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' });

// ── Pricing definitions ───────────────────────────────────────────────────────

const PLAYER_PLANS = [
    { name: 'Player Pro',     amount: 9.99  },
    { name: 'Player All-Pro', amount: 14.99 },
    { name: 'Player Elite',   amount: 24.99 },
] as const;

const SIZES = [8, 10, 12, 14, 16, 32] as const;
type Size = typeof SIZES[number];

const COMM_PRICES: Record<string, Record<Size, number>> = {
    'Pro':     { 8: 39.99, 10: 49.99, 12: 59.99, 14: 69.99, 16: 79.99, 32: 159.99 },
    'All-Pro': { 8: 49.99, 10: 59.99, 12: 69.99, 14: 79.99, 16: 89.99, 32: 169.99 },
    'Elite':   { 8: 59.99, 10: 69.99, 12: 79.99, 14: 89.99, 16: 99.99, 32: 179.99 },
};

// ── Step 1: archive all existing products & prices ────────────────────────────

async function archiveAll() {
    console.log('\n── Archiving existing products ──');
    let startingAfter: string | undefined;

    while (true) {
        const page = await stripe.products.list({ limit: 100, starting_after: startingAfter });
        if (page.data.length === 0) break;

        for (const product of page.data) {
            // Clear default_price so we can archive all prices
            if (product.default_price) {
                await stripe.products.update(product.id, { default_price: '' } as Parameters<typeof stripe.products.update>[1]);
            }
            // Archive all active prices
            const prices = await stripe.prices.list({ product: product.id, limit: 100, active: true });
            for (const price of prices.data) {
                await stripe.prices.update(price.id, { active: false });
            }
            if (prices.data.length) {
                console.log(`  archived ${prices.data.length} price(s) on "${product.name}"`);
            }
            // Archive the product
            await stripe.products.update(product.id, { active: false });
            console.log(`  archived product "${product.name}"`);
        }

        if (!page.has_more) break;
        startingAfter = page.data[page.data.length - 1].id;
    }

    console.log('Done archiving.\n');
}

// ── Step 2: create fresh products & prices ────────────────────────────────────

type CatalogEntry = { name: string; productId: string; priceId: string };

async function createAll(): Promise<CatalogEntry[]> {
    const catalog: CatalogEntry[] = [];

    console.log('── Creating player plans ──');
    for (const plan of PLAYER_PLANS) {
        const product = await stripe.products.create({ name: plan.name });
        const price = await stripe.prices.create({
            product: product.id,
            unit_amount: Math.round(plan.amount * 100),
            currency: 'usd',
            recurring: { interval: 'year' },
            nickname: plan.name,
        });
        catalog.push({ name: plan.name, productId: product.id, priceId: price.id });
        console.log(`  ${plan.name}: ${price.id}`);
    }

    console.log('\n── Creating commissioner plans ──');
    for (const tier of ['Pro', 'All-Pro', 'Elite'] as const) {
        const product = await stripe.products.create({ name: `Commissioner ${tier}` });
        console.log(`  Product "Commissioner ${tier}": ${product.id}`);

        for (const size of SIZES) {
            const amount = COMM_PRICES[tier][size];
            const nickname = `Commissioner ${tier} — ${size} Team`;
            const price = await stripe.prices.create({
                product: product.id,
                unit_amount: Math.round(amount * 100),
                currency: 'usd',
                recurring: { interval: 'year' },
                nickname,
                metadata: { leagueSize: String(size) },
            });
            catalog.push({ name: nickname, productId: product.id, priceId: price.id });
            console.log(`    ${nickname}: ${price.id}`);
        }
    }

    return catalog;
}

// ── Step 3: write stripe-catalog-ids.json ────────────────────────────────────

function writeCatalogJson(catalog: CatalogEntry[]) {
    const outPath = path.resolve(__dirname, '../stripe-catalog-ids.json');
    fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2) + '\n');
    console.log('\nWrote stripe-catalog-ids.json');
}

// ── Step 4: update PLAN_CATALOG in src/lib/stripe.ts ────────────────────────

const TIER_MAP: Record<string, string> = {
    'Player Pro':     'PLAYER_PRO',
    'Player All-Pro': 'PLAYER_ALL_PRO',
    'Player Elite':   'PLAYER_ELITE',
};
const COMM_TIER_MAP: Record<string, string> = {
    'Pro':     'COMMISSIONER_PRO',
    'All-Pro': 'COMMISSIONER_ALL_PRO',
    'Elite':   'COMMISSIONER_ELITE',
};

function buildPlanCatalog(catalog: CatalogEntry[]): string {
    const lines: string[] = [];
    lines.push('    // Player plans');
    for (const entry of catalog.filter(e => e.name.startsWith('Player'))) {
        const tier = TIER_MAP[entry.name];
        lines.push(`    '${entry.priceId}': { type: 'player', tier: '${tier}', leagueSize: null },`);
    }

    for (const tier of ['Pro', 'All-Pro', 'Elite'] as const) {
        lines.push(`    // Commissioner ${tier}`);
        const entries = catalog.filter(e => e.name.startsWith(`Commissioner ${tier} —`));
        for (const entry of entries) {
            const match = entry.name.match(/— (\d+) Team/);
            const size = match ? parseInt(match[1]) : 0;
            const commTier = COMM_TIER_MAP[tier];
            lines.push(`    '${entry.priceId}': { type: 'commissioner', tier: '${commTier}', leagueSize: ${size} },`);
        }
    }

    return lines.join('\n');
}

function updateStripeSrcTs(catalog: CatalogEntry[]) {
    const filePath = path.resolve(__dirname, '../src/lib/stripe.ts');
    let content = fs.readFileSync(filePath, 'utf-8');

    const newCatalogBody = buildPlanCatalog(catalog);
    const newCatalog = `export const PLAN_CATALOG: Record<string, PlanInfo> = {\n${newCatalogBody}\n};`;

    // Replace the entire PLAN_CATALOG block
    content = content.replace(
        /export const PLAN_CATALOG: Record<string, PlanInfo> = \{[\s\S]*?\};/,
        newCatalog
    );

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('Updated src/lib/stripe.ts PLAN_CATALOG');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
    await archiveAll();
    const catalog = await createAll();
    writeCatalogJson(catalog);
    updateStripeSrcTs(catalog);
    console.log('\nAll done. Commit stripe-catalog-ids.json and src/lib/stripe.ts, then deploy.');
}

run().catch(err => { console.error(err); process.exit(1); });
