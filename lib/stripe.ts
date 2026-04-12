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
        price: 14.99,
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
        sizes: { 8: 39.99, 10: 49.99, 12: 59.99, 14: 69.99, 16: 79.99, 32: 159.99 },
    },
    all_pro: {
        name: "Commissioner All-Pro",
        sizes: { 8: 49.99, 10: 59.99, 12: 69.99, 14: 79.99, 16: 89.99, 32: 169.99 },
    },
    elite: {
        name: "Commissioner Elite",
        sizes: { 8: 59.99, 10: 69.99, 12: 79.99, 14: 89.99, 16: 99.99, 32: 179.99 },
    },
} as const;
