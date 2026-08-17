/**
 * Computes precise age with one decimal (e.g. 24.2) from a birth date string.
 * The fraction represents how far through the current year of life the player is.
 */
export function calculatePreciseAge(birthDate: string | null | undefined): number | null {
    if (!birthDate || birthDate === '0000-00-00' || !birthDate.trim()) return null;
    const dob = new Date(birthDate);
    if (isNaN(dob.getTime())) return null;
    const now = new Date();
    let fullYears = now.getFullYear() - dob.getFullYear();
    const mDiff = now.getMonth() - dob.getMonth();
    if (mDiff < 0 || (mDiff === 0 && now.getDate() < dob.getDate())) fullYears--;
    if (fullYears < 0 || fullYears > 80) return null;
    const lastBirthday = new Date(dob.getFullYear() + fullYears, dob.getMonth(), dob.getDate());
    const nextBirthday = new Date(dob.getFullYear() + fullYears + 1, dob.getMonth(), dob.getDate());
    const daysPast  = Math.floor((now.getTime() - lastBirthday.getTime()) / 86_400_000);
    const daysInYear = Math.floor((nextBirthday.getTime() - lastBirthday.getTime()) / 86_400_000);
    return Math.round((fullYears + daysPast / daysInYear) * 10) / 10;
}

/**
 * Computes age in whole years from an ISO date string (e.g. "1998-05-15").
 * Returns null when the DOB is missing, invalid, or yields an implausible value.
 * Server-safe — no browser APIs.
 */
export function calculateAge(birthDate: string | null | undefined): number | null {
    if (!birthDate || birthDate === '0000-00-00' || !birthDate.trim()) return null;
    const dob = new Date(birthDate);
    if (isNaN(dob.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    if (age < 0 || age > 80) return null; // implausible — likely bad data
    return age;
}

// No real NFL player plays past their mid-40s — catches long-retired players
// Sleeper's free feed still leaves marked team!=FA/active:true.
export const MAX_PLAUSIBLE_AGE = 45;

// A player with a long career who never appears on any current team's real
// depth chart is almost always actually out of the league, not deep bench —
// depth charts cover full 53-man rosters, not just starters, so a legitimately
// active player with this much experience always shows up somewhere on one.
export const STALE_VETERAN_YEARS_EXP = 5;

/**
 * Whether a Sleeper player record plausibly represents a currently active NFL
 * player, beyond just team/active flags — Sleeper occasionally leaves BOTH
 * team and birthDate stale for a long-retired player (e.g. Ben Roethlisberger:
 * team frozen at 'PIT', birthDate off by ~5 years, landing his computed age
 * just under the plausible-age cutoff too — see feedback_stale_sleeper_player_data).
 * `age` should already be resolved (calculateAge(birthDate) ?? storedAge).
 */
export function isPlausiblyActivePlayer(p: {
    team:            string | null | undefined;
    age?:            number | null;
    depthChartOrder?: number | null;
    yearsExp?:       number | null;
}): boolean {
    if (!p.team || p.team === 'FA') return false;
    if (p.age != null && p.age > MAX_PLAUSIBLE_AGE) return false;
    if ((p.depthChartOrder == null) && (p.yearsExp ?? 0) >= STALE_VETERAN_YEARS_EXP) return false;
    return true;
}
