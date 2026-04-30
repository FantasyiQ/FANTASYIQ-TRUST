import type { LeagueCalendarData } from '@/lib/league/getLeagueCalendar';

const EVENT_META: Record<string, { label: string; icon: string; color: string }> = {
    draft:               { label: 'Draft',              icon: '📝', color: 'text-blue-400'   },
    trade_deadline:      { label: 'Trade Deadline',     icon: '🔒', color: 'text-red-400'    },
    waiver_deadline:     { label: 'Waiver Deadline',    icon: '📋', color: 'text-yellow-400' },
    regular_season_end:  { label: 'Regular Season End', icon: '🏁', color: 'text-gray-400'   },
    playoff_start:       { label: 'Playoffs Begin',     icon: '🏆', color: 'text-[#C8A951]'  },
    championship:        { label: 'Championship',       icon: '🥇', color: 'text-[#C8A951]'  },
    custom:              { label: 'Event',              icon: '📅', color: 'text-gray-300'   },
};

function isPast(date: Date): boolean {
    return date < new Date(new Date().toDateString());
}

function monthLabel(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function daysUntil(date: Date): number {
    const today = new Date(new Date().toDateString());
    return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

export default function LeagueCalendar({ league, timeline, keyDates }: LeagueCalendarData) {
    const today   = new Date(new Date().toDateString());
    const upcoming = keyDates;
    const past     = timeline.filter(e => isPast(e.date));
    const nextEvent = upcoming[0] ?? null;

    const monthMap = new Map<string, typeof timeline>();
    for (const e of timeline) {
        const key = monthLabel(e.date);
        if (!monthMap.has(key)) monthMap.set(key, []);
        monthMap.get(key)!.push(e);
    }
    const grouped = Array.from(monthMap.entries());

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Season Calendar</h1>
                <p className="text-gray-400 text-sm mt-0.5">{league.leagueName} · {league.season} Season</p>
            </div>

            {timeline.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center space-y-3">
                    <p className="text-4xl">📅</p>
                    <p className="text-gray-400 text-sm font-medium">No calendar yet</p>
                    <p className="text-gray-600 text-xs max-w-xs mx-auto">
                        Your commissioner hasn&apos;t added any dates yet.
                    </p>
                </div>
            ) : (
                <>
                    {nextEvent && (() => {
                        const meta  = EVENT_META[nextEvent.type] ?? EVENT_META.custom;
                        const delta = daysUntil(nextEvent.date);
                        return (
                            <div className="bg-gray-900 border border-[#C8A951]/30 rounded-2xl p-5">
                                <p className="text-xs font-semibold text-[#C8A951] uppercase tracking-wider mb-3">Next Up</p>
                                <div className="flex items-start gap-4">
                                    <div className="shrink-0 w-14 text-center bg-gray-800 rounded-xl py-2">
                                        <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">
                                            {nextEvent.date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}
                                        </p>
                                        <p className="text-2xl font-extrabold text-white leading-none">
                                            {nextEvent.date.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })}
                                        </p>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-base">{meta.icon}</span>
                                            <p className="text-white font-bold">{nextEvent.title}</p>
                                            <span className={`text-[10px] font-bold uppercase tracking-wide ${meta.color}`}>{meta.label}</span>
                                        </div>
                                        {nextEvent.description && (
                                            <p className="text-gray-500 text-xs mt-1">{nextEvent.description}</p>
                                        )}
                                        <p className="text-gray-600 text-xs mt-1.5">
                                            {delta === 0 ? 'Today' : delta === 1 ? 'Tomorrow' : `In ${delta} days`}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-800">
                            <h2 className="font-bold">Full Schedule</h2>
                            <p className="text-gray-500 text-xs mt-0.5">{upcoming.length} upcoming · {past.length} past</p>
                        </div>

                        {grouped.map(([month, monthEvents]) => (
                            <div key={month}>
                                <div className="px-5 py-2 bg-gray-800/30 border-b border-gray-800">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{month}</p>
                                </div>
                                {monthEvents.map(event => {
                                    const meta    = EVENT_META[event.type] ?? EVENT_META.custom;
                                    const pastEvt = isPast(event.date);
                                    const isToday = event.date.toDateString() === today.toDateString();
                                    const delta   = daysUntil(event.date);
                                    return (
                                        <div key={event.id} className={`px-5 py-4 flex items-start gap-4 border-b border-gray-800 last:border-0 ${pastEvt ? 'opacity-40' : ''}`}>
                                            <div className="shrink-0 w-12 text-center">
                                                <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">
                                                    {event.date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}
                                                </p>
                                                <p className={`text-xl font-extrabold leading-none ${isToday ? 'text-[#C8A951]' : 'text-white'}`}>
                                                    {event.date.getUTCDate()}
                                                </p>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm">{meta.icon}</span>
                                                    <p className="text-white text-sm font-semibold">{event.title}</p>
                                                    <span className={`text-[10px] font-bold uppercase tracking-wide ${meta.color}`}>{meta.label}</span>
                                                </div>
                                                {event.description && (
                                                    <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{event.description}</p>
                                                )}
                                                {!pastEvt && (
                                                    <p className="text-gray-700 text-xs mt-1">
                                                        {isToday ? 'Today' : delta === 1 ? 'Tomorrow' : `In ${delta} days`}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
