export interface PricingTier {
    name: string;
    price: number;
    leagueMin: number;
    leagueMax: number;
    priceId: string;
}

export interface CommissionerTier {
    name: string;
    sizes: Record<number, number>;
}

export interface LeagueData {
    id: string;
    platform: string;
    platformLeagueId: string;
    leagueName: string;
    seasonYear: number;
    leagueSize?: number;
    scoringFormat?: string;
    lastSyncedAt?: Date;
}

export interface UserProfile {
    id: string;
    email: string;
    name?: string;
    subscriptionTier: string;
    subscriptionStatus: string;
    leagueCount: number;
}

export type SubscriptionTier = "free" | "pro" | "all_pro" | "elite";
export type SubscriptionStatus = "active" | "inactive" | "past_due" | "canceled";
