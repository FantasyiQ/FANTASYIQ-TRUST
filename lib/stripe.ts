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
