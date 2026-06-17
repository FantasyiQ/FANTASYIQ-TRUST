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
