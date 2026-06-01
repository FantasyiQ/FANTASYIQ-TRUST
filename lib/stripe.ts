import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-18.acacia",
});

export const PLAYER_TIERS = {
    pro: {
        name: "Pro",
        price: 9.99,
        leagueMin: 1,
        leagueMax: 2,
        priceId: process.env.STRIPE_PRICE_PRO!,
    },
    all_pro: {
        name: "All-Pro",
        price: 19.99,
        leagueMin: 1,
        leagueMax: 4,
        priceId: process.env.STRIPE_PRICE_ALL_PRO!,
    },
    elite: {
        name: "Elite",
        price: 34.99,
        leagueMin: 1,
        leagueMax: 7,
        priceId: process.env.STRIPE_PRICE_ELITE!,
    },
    eliteiq: {
        name: "ELITEiQ",
        price: 59.99,
        leagueMin: 1,
        leagueMax: Infinity,
        priceId: process.env.STRIPE_PRICE_ELITEIQ!,
    },
} as const;

export const COMMISSIONER_PRICING = {
    pro: {
        name: "Commissioner Pro",
        sizes: { 8: 44.99, 10: 54.99, 12: 64.99, 14: 74.99, 16: 84.99, 32: 164.99 },
    },
    all_pro: {
        name: "Commissioner All-Pro",
        sizes: { 8: 54.99, 10: 64.99, 12: 74.99, 14: 84.99, 16: 94.99, 32: 174.99 },
    },
    elite: {
        name: "Commissioner Elite",
        sizes: { 8: 64.99, 10: 74.99, 12: 84.99, 14: 94.99, 16: 104.99, 32: 184.99 },
    },
} as const;

// Live-mode commissioner price IDs keyed by tier and league size.
// Used by checkout to select the correct Stripe price.
export const COMMISSIONER_LIVE_PRICE_IDS: Record<string, Record<number, string>> = {
    COMMISSIONER_PRO: {
        8:  'price_1TdXEW2RJtQwVGBE2vjFUha2',
        10: 'price_1TdXEX2RJtQwVGBE8pftRrkW',
        12: 'price_1TdXEX2RJtQwVGBEpaNdJgv2',
        14: 'price_1TdXEX2RJtQwVGBE5FUPtQc8',
        16: 'price_1TdXEX2RJtQwVGBEB15esbnp',
        32: 'price_1TdXEY2RJtQwVGBEZ5KNgszA',
    },
    COMMISSIONER_ALL_PRO: {
        8:  'price_1TdXEY2RJtQwVGBEArj5zJLM',
        10: 'price_1TdXEY2RJtQwVGBEdjMVSqTh',
        12: 'price_1TdXEY2RJtQwVGBEx0kzx5FZ',
        14: 'price_1TdXEZ2RJtQwVGBEFhUuriBj',
        16: 'price_1TdXEZ2RJtQwVGBEESYKD8bu',
        32: 'price_1TdXEZ2RJtQwVGBE5NsAAPCf',
    },
    COMMISSIONER_ELITE: {
        8:  'price_1TdXEa2RJtQwVGBETWXVX3LP',
        10: 'price_1TdXEa2RJtQwVGBEp1dPFsoy',
        12: 'price_1TdXEa2RJtQwVGBEf8FDHiDa',
        14: 'price_1TdXEa2RJtQwVGBEOfAx6MT3',
        16: 'price_1TdXEb2RJtQwVGBE2qm5a8dK',
        32: 'price_1TdXEb2RJtQwVGBEyVHZUI5P',
    },
};
