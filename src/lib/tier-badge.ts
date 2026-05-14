export function tierBadgeProps(tier: string): { label: string; className: string } | null {
    if (tier.includes('ELITE'))   return { label: 'ELITE ✦',  className: 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/40' };
    if (tier.includes('ALL_PRO')) return { label: 'ALL-PRO',  className: 'bg-[#D4AF37]/10 text-[#D4AF37]/80 border-[#D4AF37]/30' };
    if (tier.includes('_PRO'))    return { label: 'PRO',      className: 'bg-blue-900/40 text-blue-400 border-blue-800' };
    return null;
}
