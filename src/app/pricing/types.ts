export interface PlayerSub {
    tier: string;
    stripeSubscriptionId: string;
}

export interface CommSub {
    tier: string;
    leagueSize: number;
    leagueName: string | null;
    stripeSubscriptionId: string;
    discountPct: number;
}
