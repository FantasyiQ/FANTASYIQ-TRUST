'use client';

export interface DraftBoardPick {
    pickOverall: number;
    round:       number;
    rosterId:    string;
    playerId:    string;   // sleeperPlayerId or espnPlayerId, platform-neutral here
    name:        string | null;
    position:    string | null;
}

interface RosterOption {
    rosterId:    string;
    displayName: string;
}

interface Props {
    picksSoFar:         DraftBoardPick[];
    rosterOptions:      RosterOption[];
    totalRounds:        number;
    onTheClockRosterId: string | null;
}

const POS_COLORS: Record<string, string> = {
    QB: 'text-red-300',
    RB: 'text-blue-300',
    WR: 'text-green-300',
    TE: 'text-orange-300',
    K:  'text-gray-400',
};

export default function DraftBoardGrid({ picksSoFar, rosterOptions, totalRounds, onTheClockRosterId }: Props) {
    if (rosterOptions.length === 0) return null;

    // Snake-draft column order stays fixed (draft slot order); pick lookup by
    // [round][rosterId] regardless of which direction that round runs.
    const pickByRoundAndRoster = new Map<string, DraftBoardPick>();
    for (const p of picksSoFar) pickByRoundAndRoster.set(`${p.round}:${p.rosterId}`, p);

    const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-gray-800">
                <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Draft Board</p>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                    <thead>
                        <tr>
                            <th className="sticky left-0 bg-gray-900 px-2 py-2 text-gray-600 text-left w-10">Rd</th>
                            {rosterOptions.map(r => (
                                <th
                                    key={r.rosterId}
                                    className={`px-2 py-2 text-left font-semibold min-w-[110px] max-w-[130px] truncate ${
                                        r.rosterId === onTheClockRosterId ? 'text-[#D4AF37]' : 'text-gray-400'
                                    }`}
                                    title={r.displayName}
                                >
                                    {r.displayName}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rounds.map(round => (
                            <tr key={round} className="border-t border-gray-800/60">
                                <td className="sticky left-0 bg-gray-900 px-2 py-2 text-gray-600 font-mono">{round}</td>
                                {rosterOptions.map(r => {
                                    const pick = pickByRoundAndRoster.get(`${round}:${r.rosterId}`);
                                    const isOnClock = !pick && r.rosterId === onTheClockRosterId;
                                    return (
                                        <td
                                            key={r.rosterId}
                                            className={`px-2 py-2 align-top ${isOnClock ? 'bg-[#D4AF37]/10' : ''}`}
                                        >
                                            {pick ? (
                                                <div className="min-w-0">
                                                    <p className="text-white truncate font-medium">
                                                        {pick.name ?? `Player ${pick.playerId}`}
                                                    </p>
                                                    {pick.position && (
                                                        <p className={`text-[10px] ${POS_COLORS[pick.position] ?? 'text-gray-500'}`}>
                                                            {pick.position} · #{pick.pickOverall}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : isOnClock ? (
                                                <span className="text-[#D4AF37] text-[10px] font-bold uppercase tracking-wide">On Clock</span>
                                            ) : (
                                                <span className="text-gray-700">—</span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
