/**
 * Auto-assignment utility — shared by sync routes and dashboard load.
 *
 * Pure computation: given unassigned leagues + user subscriptions + current
 * player slot usage, returns what each league should be assigned to.
 * No DB calls — callers persist the results.
 */

import { getLeagueLimit, tierToLimitKey } from './league-limits';

export interface LeagueToAssign {
    id:          string;   // League.id (DB primary key)
    leagueName:  string;
}

export interface PlanOption {
    id:          string;
    type:        'player' | 'commissioner';
    tier:        string;
    leagueName:  string | null;
}

export interface AssignmentResult {
    leagueDbId:   string;
    planId:       string | null;
    planType:     'player' | 'commissioner' | null;
    /** True when a player plan exists but all slots are consumed. */
    limitReached: boolean;
}

/**
 * Compute assignments for a batch of unassigned leagues.
 *
 * Priority order per league:
 *   1. Matching commissioner sub (by league name)
 *   2. Player plan with available slots
 *   3. Unassigned — no plan or limit reached
 *
 * Player slot counter is incremented as assignments are made so the limit
 * is respected across the whole batch.
 */
export function computeAutoAssignments(
    leagues:         LeagueToAssign[],
    subscriptions:   PlanOption[],
    playerSlotsUsed: number,
): AssignmentResult[] {
    const playerSub = subscriptions.find(s => s.type === 'player') ?? null;
    const commSubs  = subscriptions.filter(s => s.type === 'commissioner');
    let   slots     = playerSlotsUsed;

    return leagues.map(league => {
        // 1. Commissioner sub matching this league name
        const commSub = commSubs.find(
            s => s.leagueName?.toLowerCase().trim() === league.leagueName.toLowerCase().trim()
        );
        if (commSub) {
            return {
                leagueDbId:   league.id,
                planId:       commSub.id,
                planType:     'commissioner',
                limitReached: false,
            };
        }

        // 2. Player plan with available slot
        if (playerSub) {
            const limit = getLeagueLimit(tierToLimitKey(playerSub.tier));
            if (slots < limit) {
                slots++;
                return {
                    leagueDbId:   league.id,
                    planId:       playerSub.id,
                    planType:     'player',
                    limitReached: false,
                };
            }
            return {
                leagueDbId:   league.id,
                planId:       null,
                planType:     null,
                limitReached: true,
            };
        }

        // 3. No plan at all
        return {
            leagueDbId:   league.id,
            planId:       null,
            planType:     null,
            limitReached: false,
        };
    });
}
