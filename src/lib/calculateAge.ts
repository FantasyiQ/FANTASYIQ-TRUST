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
