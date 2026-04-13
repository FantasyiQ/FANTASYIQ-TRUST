'use client';

import { useState } from 'react';

interface LineupSlot {
    position: string;
    playerName: string;
    nflTeam: string;
}

function positionColor(pos: string) {
    switch (pos) {
        case 'QB':         return 'text-red-400';
        case 'RB':         return 'text-green-400';
        case 'WR':         return 'text-blue-400';
        case 'TE':         return 'text-yellow-400';
        case 'FLEX':       return 'text-purple-400';
        case 'SUPER_FLEX': return 'text-pink-400';
        case 'K':          return 'text-gray-400';
        case 'DEF':        return 'text-orange-400';
        default:           return 'text-gray-400';
    }
}

function flexNote(positions: string[]): string {
    const notes: string[] = [];
    if (positions.includes('FLEX'))       notes.push('FLEX can be RB, WR, or TE.');
    if (positions.includes('SUPER_FLEX')) notes.push('SUPER_FLEX can be QB, RB, WR, or TE.');
    if (positions.includes('DEF'))        notes.push('DEF: enter team name (e.g. Cowboys D/ST).');
    return notes.join('  ');
}

export default function LineupPicker({
    contestId,
    rosterPositions,
    existingLineup,
}: {
    contestId:       string;
    rosterPositions: string[];
    existingLineup:  LineupSlot[] | null;
}) {
    const blankRoster: LineupSlot[] = rosterPositions.map(p => ({ position: p, playerName: '', nflTeam: '' }));

    const [lineup, setLineup] = useState<LineupSlot[]>(existingLineup ?? blankRoster);
    const [loading, setLoading] = useState(false);
    const [error, setError]    = useState('');
    const [saved, setSaved]    = useState(false);

    function update(index: number, field: 'playerName' | 'nflTeam', value: string) {
        setSaved(false);
        setLineup(prev => prev.map((slot, i) => i === index ? { ...slot, [field]: value } : slot));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setSaved(false);

        for (const slot of lineup) {
            if (!slot.playerName.trim()) {
                setError(`Please fill in the player name for the ${slot.position} slot.`);
                return;
            }
            if (!slot.nflTeam.trim()) {
                setError(`Please fill in the NFL team for the ${slot.position} slot.`);
                return;
            }
        }

        setLoading(true);
        const res = await fetch(`/api/pro-bowl/${contestId}/entry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lineup }),
        });
        const data = await res.json();
        setLoading(false);
        if (!res.ok) { setError(data.error ?? 'Failed to save lineup.'); return; }
        setSaved(true);
    }

    const allFilled = lineup.every(s => s.playerName.trim() && s.nflTeam.trim());
    const note = flexNote(rosterPositions);

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                    <h2 className="font-bold">Pick Your Lineup</h2>
                    <p className="text-gray-500 text-xs mt-1">No salary cap — pick any NFL player for each slot. You can edit until entries lock.</p>
                </div>

                <div className="divide-y divide-gray-800/50">
                    {lineup.map((slot, i) => (
                        <div key={i} className="px-6 py-4 flex items-center gap-4">
                            <span className={`text-xs font-bold w-14 shrink-0 ${positionColor(slot.position)}`}>
                                {slot.position}
                            </span>
                            <div className="flex-1 grid sm:grid-cols-2 gap-2">
                                <input
                                    type="text"
                                    placeholder="Player name"
                                    value={slot.playerName}
                                    onChange={e => update(i, 'playerName', e.target.value)}
                                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60 w-full"
                                />
                                <input
                                    type="text"
                                    placeholder={slot.position === 'DEF' ? 'Team name (e.g. Cowboys)' : 'NFL team (e.g. DAL)'}
                                    value={slot.nflTeam}
                                    onChange={e => update(i, 'nflTeam', e.target.value)}
                                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60 w-full"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {note && <p className="text-xs text-gray-600 px-1">{note}</p>}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            {saved && (
                <p className="text-green-400 text-sm font-medium">Lineup saved! You can edit until entries lock.</p>
            )}

            <button
                type="submit"
                disabled={loading || !allFilled}
                className="w-full bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black font-bold py-3 rounded-xl text-sm transition">
                {loading ? 'Saving…' : existingLineup ? 'Update Lineup' : 'Submit Lineup'}
            </button>
        </form>
    );
}
