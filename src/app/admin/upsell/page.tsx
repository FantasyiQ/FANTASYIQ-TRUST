export const dynamic = 'force-dynamic';

import { getUpsellSummary, UPSELL_LABELS, type UpsellType } from '@/lib/upsell-engine';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-1">
            <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
            <p className="text-3xl font-black text-white tabular-nums">{value}</p>
            {sub && <p className="text-xs text-gray-600">{sub}</p>}
        </div>
    );
}

const TYPE_STYLES: Record<UpsellType, string> = {
    free_to_player:        'bg-blue-900/20 border-blue-700/40 text-blue-400',
    player_to_commissioner:'bg-purple-900/20 border-purple-700/40 text-purple-400',
    commissioner_upgrade:  'bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37]',
};

export default async function AdminUpsellPage() {
    const {
        recentPrompts,
        promptsLast7d,
        promptsLast30d,
        freeEngagedCount,
        playerCommCount,
    } = await getUpsellSummary();

    const readRate = recentPrompts.length > 0
        ? Math.round((recentPrompts.filter(p => p.read).length / recentPrompts.length) * 100)
        : 0;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-black">Upsell & Expansion</h1>
                <p className="text-gray-500 text-sm mt-1">Automated revenue expansion pipeline</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Prompts (7d)"    value={promptsLast7d}    sub="upsell notifications sent" />
                <StatCard label="Prompts (30d)"   value={promptsLast30d}   sub="last 30 days" />
                <StatCard label="Read Rate"        value={`${readRate}%`}   sub="of recent prompts read" />
                <StatCard label="Open Rate"        value={`${readRate}%`}   sub="seen / sent" />
            </div>

            {/* Pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-gray-900 border border-blue-900/30 rounded-xl p-5">
                    <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">Free → Player Pipeline</p>
                    <p className="text-4xl font-black text-white tabular-nums mt-2">{freeEngagedCount}</p>
                    <p className="text-xs text-gray-600 mt-1">FREE users with feature activity this week</p>
                    <p className="text-xs text-gray-500 mt-3">These users are engaged but haven't converted. They receive weekly upsell prompts.</p>
                </div>
                <div className="bg-gray-900 border border-purple-900/30 rounded-xl p-5">
                    <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-1">Player → Commissioner Pipeline</p>
                    <p className="text-4xl font-black text-white tabular-nums mt-2">{playerCommCount}</p>
                    <p className="text-xs text-gray-600 mt-1">Player users showing commissioner behavior</p>
                    <p className="text-xs text-gray-500 mt-3">These users manage leagues or use dues but haven't upgraded to a commissioner plan.</p>
                </div>
                <div className="bg-gray-900 border border-[#D4AF37]/20 rounded-xl p-5">
                    <p className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wider mb-1">Commissioner Upgrade Pipeline</p>
                    <p className="text-4xl font-black text-white tabular-nums mt-2">—</p>
                    <p className="text-xs text-gray-600 mt-1">COMMISSIONER_PRO users with multi-league activity</p>
                    <p className="text-xs text-gray-500 mt-3">These users are running 2+ leagues on the entry-tier plan and are candidates for All-Pro.</p>
                </div>
            </div>

            {/* Recent prompts sent */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                    <p className="text-sm font-semibold text-white">Recent Upsell Prompts</p>
                    <p className="text-xs text-gray-600">Last {recentPrompts.length} sent</p>
                </div>
                {recentPrompts.length === 0 ? (
                    <div className="px-5 py-10 text-center text-gray-600 text-sm">
                        No upsell prompts sent yet. The cron runs daily at 1:00 PM.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {recentPrompts.map(p => {
                            const d          = p.data as Record<string, string> | null;
                            const upsellType = (d?.upsellType ?? 'free_to_player') as UpsellType;
                            const typeStyle  = TYPE_STYLES[upsellType] ?? TYPE_STYLES.free_to_player;
                            return (
                                <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-white truncate">{p.user.email}</p>
                                        <p className="text-xs text-gray-600 truncate mt-0.5">{p.title}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${typeStyle}`}>
                                            {UPSELL_LABELS[upsellType]}
                                        </span>
                                        <span className={`text-[10px] font-semibold ${p.read ? 'text-emerald-400' : 'text-gray-600'}`}>
                                            {p.read ? 'read' : 'unread'}
                                        </span>
                                        <span className="text-[10px] text-gray-600 tabular-nums whitespace-nowrap">
                                            {new Date(p.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
