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
        price: 24.99,
        leagueMin: 1,
        leagueMax: 5,
        priceId: process.env.STRIPE_PRICE_ALL_PRO!,
    },
    elite: {
        name: "Elite",
        price: 44.99,
        leagueMin: 1,
        leagueMax: Infinity,
        priceId: process.env.STRIPE_PRICE_ELITE!,
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
        8:  'price_1TdaUu2RJtQwVGBEKnxmmLyV',
        10: 'price_1TdaUu2RJtQwVGBE1nHiB9bp',
        12: 'price_1TdaUu2RJtQwVGBEyfsYVFhy',
        14: 'price_1TdaUv2RJtQwVGBECAjeSPB7',
        16: 'price_1TdaUv2RJtQwVGBESKhTPasu',
        32: 'price_1TdaUv2RJtQwVGBEcNjocQ9I',
    },
    COMMISSIONER_ALL_PRO: {
        8:  'price_1TdaUw2RJtQwVGBEY5mSAgVd',
        10: 'price_1TdaUw2RJtQwVGBE3Z2FDlr2',
        12: 'price_1TdaUw2RJtQwVGBET24DOREW',
        14: 'price_1TdaUw2RJtQwVGBEuDgcM0DE',
        16: 'price_1TdaUx2RJtQwVGBEoAWaFmgc',
        32: 'price_1TdaUx2RJtQwVGBEfxTks3Mv',
    },
    COMMISSIONER_ELITE: {
        8:  'price_1TdaUx2RJtQwVGBEOzDxXCcW',
        10: 'price_1TdaUy2RJtQwVGBE61Coj8Nc',
        12: 'price_1TdaUy2RJtQwVGBEVurn54N9',
        14: 'price_1TdaUy2RJtQwVGBEvpi1Zo9A',
        16: 'price_1TdaUy2RJtQwVGBEY3YgY66l',
        32: 'price_1TdaUz2RJtQwVGBEPaabRilV',
    },
};
