export function tierBadgeProps(tier: string): { label: string; className: string } | null {
    if (tier.includes('ELITE'))   return { label: 'ELITE ✦',  className: 'bg-[#C8A951]/20 text-[#C8A951] border-[#C8A951]/40' };
    if (tier.includes('ALL_PRO')) return { label: 'ALL-PRO',  className: 'bg-[#C8A951]/10 text-[#C8A951]/80 border-[#C8A951]/30' };
    if (tier.includes('_PRO'))    return { label: 'PRO',      className: 'bg-blue-900/40 text-blue-400 border-blue-800' };
    return null;
}
