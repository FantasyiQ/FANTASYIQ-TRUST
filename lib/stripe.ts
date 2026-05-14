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
        price: 17.99,
        leagueMin: 3,
        leagueMax: 5,
        priceId: process.env.STRIPE_PRICE_ALL_PRO!,
    },
    elite: {
        name: "Elite",
        price: 24.99,
        leagueMin: 1,
        leagueMax: Infinity,
        priceId: process.env.STRIPE_PRICE_ELITE!,
    },
} as const;

export const COMMISSIONER_PRICING = {
    pro: {
        name: "Commissioner Pro",
        sizes: { 8: 54.99, 10: 64.99, 12: 74.99, 14: 84.99, 16: 94.99, 32: 174.99 },
    },
    all_pro: {
        name: "Commissioner All-Pro",
        sizes: { 8: 64.99, 10: 74.99, 12: 84.99, 14: 94.99, 16: 104.99, 32: 184.99 },
    },
    elite: {
        name: "Commissioner Elite",
        sizes: { 8: 74.99, 10: 84.99, 12: 94.99, 14: 104.99, 16: 114.99, 32: 194.99 },
    },
} as const;
