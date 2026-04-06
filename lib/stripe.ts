import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-18.acacia",
});

export const PLAYER_TIERS = {
    pro: {
        name: "Pro",
        price: 5.99,
        leagueMin: 1,
        leagueMax: 2,
        priceId: process.env.STRIPE_PRICE_PRO!,
    },
    all_pro: {
        name: "All-Pro",
        price: 10.99,
        leagueMin: 3,
        leagueMax: 5,
        priceId: process.env.STRIPE_PRICE_ALL_PRO!,
    },
    elite: {
        name: "Elite",
        price: 17.99,
        leagueMin: 1,
        leagueMax: Infinity,
        priceId: process.env.STRIPE_PRICE_ELITE!,
    },
} as const;

export const COMMISSIONER_PRICING = {
    pro: {
        name: "Commissioner Pro",
        sizes: { 8: 39.99, 10: 49.99, 12: 59.99, 14: 69.99, 16: 79.99, 32: 159.99 },
    },
    all_pro: {
        name: "Commissioner All-Pro",
        sizes: { 8: 69.99, 10: 89.99, 12: 104.99, 14: 124.99, 16: 139.99, 32: 239.99 },
    },
    elite: {
        name: "Commissioner Elite",
        sizes: { 8: 109.99, 10: 129.99, 12: 149.99, 14: 169.99, 16: 189.99, 32: 299.99 },
    },
} as const;
