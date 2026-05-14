/**
 * Pure display helpers for Player Reliability Score.
 * No prisma dependency — safe to import in client components.
 */

export type PRSTier = 'unproven' | 'developing' | 'reliable' | 'trusted' | 'elite';

export function prsTier(score: number): PRSTier {
    if (score >= 81) return 'elite';
    if (score >= 61) return 'trusted';
    if (score >= 41) return 'reliable';
    if (score >= 21) return 'developing';
    return 'unproven';
}

export const PRS_TIER_LABELS: Record<PRSTier, string> = {
    unproven:   'Unproven',
    developing: 'Developing',
    reliable:   'Reliable',
    trusted:    'Trusted',
    elite:      'Elite',
};

/** Tailwind classes for each tier (bg, text, border). */
export const PRS_TIER_STYLES: Record<PRSTier, string> = {
    unproven:   'bg-gray-800      text-gray-500    border-gray-700',
    developing: 'bg-orange-900/20 text-orange-400  border-orange-800',
    reliable:   'bg-amber-900/20  text-amber-400   border-amber-800',
    trusted:    'bg-emerald-900/20 text-emerald-400 border-emerald-700',
    elite:      'bg-[#D4AF37]/10  text-[#D4AF37]   border-[#D4AF37]/40',
};
