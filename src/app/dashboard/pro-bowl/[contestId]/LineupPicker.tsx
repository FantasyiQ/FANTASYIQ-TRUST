'use client';

import { useState } from 'react';

interface LineupSlot {
    position: string;
    playerName: string;
    nflTeam: string;
}

// Client-side team normalization (mirrors server-side logic)
const ALIASES: Record<string, string> = {
    ari:'ARI',arizona:'ARI',cardinals:'ARI',
    atl:'ATL',atlanta:'ATL',falcons:'ATL',
    bal:'BAL',baltimore:'BAL',ravens:'BAL',
    buf:'BUF',buffalo:'BUF',bills:'BUF',
    car:'CAR',carolina:'CAR',panthers:'CAR',
    chi:'CHI',chicago:'CHI',bears:'CHI',
    cin:'CIN',cincinnati:'CIN',bengals:'CIN',
    cle:'CLE',cleveland:'CLE',browns:'CLE',
    dal:'DAL',dallas:'DAL',cowboys:'DAL',
    den:'DEN',denver:'DEN',broncos:'DEN',
    det:'DET',detroit:'DET',lions:'DET',
    gb:'GB','green bay':'GB',packers:'GB',
    hou:'HOU',houston:'HOU',texans:'HOU',
    ind:'IND',indianapolis:'IND',colts:'IND',
    jax:'JAX',jac:'JAX',jacksonville:'JAX',jaguars:'JAX',
    kc:'KC','kansas city':'KC',chiefs:'KC',
    lv:'LV','las vegas':'LV',raiders:'LV',
    lac:'LAC',chargers:'LAC','la chargers':'LAC',
    lar:'LAR',rams:'LAR','la rams':'LAR',
    mia:'MIA',miami:'MIA',dolphins:'MIA',
    min:'MIN',minnesota:'MIN',vikings:'MIN',
    ne:'NE','new england':'NE',patriots:'NE',
    no:'NO','new orleans':'NO',saints:'NO',
    nyg:'NYG',giants:'NYG',
    nyj:'NYJ',jets:'NYJ',
    phi:'PHI',philadelphia:'PHI',eagles:'PHI',
    pit:'PIT',pittsburgh:'PIT',steelers:'PIT',
    sf:'SF','san francisco':'SF','49ers':'SF',niners:'SF',
    sea:'SEA',seattle:'SEA',seahawks:'SEA',
    tb:'TB',tampa:'TB','tampa bay':'TB',buccaneers:'TB',bucs:'TB',
    ten:'TEN',tennessee:'TEN',titans:'TEN',
    was:'WAS',wsh:'WAS',washington:'WAS',commanders:'WAS',
};

function normalizeTeam(input: string): string | null {
    if (!input) return null;
    const clean = input.toLowerCase().replace(/\s*d\/?s[t]?\s*$/, '').trim();
    return ALIASES[clean] ?? null;
}

function isSlotLocked(nflTeam: string, lockedTeams: string[]): boolean {
    if (lockedTeams.length === 0) return false;
    const abbrev = normalizeTeam(nflTeam);
    return abbrev ? lockedTeams.includes(abbrev) : false;
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
    lockedTeams,
    existingLineup,
}: {
    contestId:       string;
    rosterPositions: string[];
    lockedTeams:     string[];
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

        // Only validate unlocked slots
        for (const slot of lineup) {
            const locked = isSlotLocked(slot.nflTeam, lockedTeams);
            if (!locked) {
                if (!slot.playerName.trim()) {
                    setError(`Fill in the player name for the ${slot.position} slot.`);
                    return;
                }
                if (!slot.nflTeam.trim()) {
                    setError(`Fill in the NFL team for the ${slot.position} slot.`);
                    return;
                }
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

    const unlockedSlots = lineup.filter(s => !isSlotLocked(s.nflTeam, lockedTeams));
    const allUnlockedFilled = unlockedSlots.every(s => s.playerName.trim() && s.nflTeam.trim());
    const lockedCount = lineup.filter(s => isSlotLocked(s.nflTeam, lockedTeams)).length;
    // Count slots locked by team even when nflTeam is blank (new entries during active games)
    const note = flexNote(rosterPositions);

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {lockedCount > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-xl px-4 py-3 text-yellow-400 text-sm">
                    🔒 {lockedCount} slot{lockedCount !== 1 ? 's' : ''} locked — game{lockedCount !== 1 ? 's' : ''} in progress. Remaining picks can still be saved.
                </div>
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                    <h2 className="font-bold">Pick Your Lineup</h2>
                    <p className="text-gray-500 text-xs mt-1">No salary cap — pick any NFL player. Slots lock automatically when that team&apos;s game kicks off.</p>
                </div>

                <div className="divide-y divide-gray-800/50">
                    {lineup.map((slot, i) => {
                        const locked = isSlotLocked(slot.nflTeam, lockedTeams);
                        return (
                            <div key={i} className={`px-6 py-4 flex items-center gap-4 ${locked ? 'opacity-60' : ''}`}>
                                <div className="flex items-center gap-1.5 w-16 shrink-0">
                                    <span className={`text-xs font-bold ${positionColor(slot.position)}`}>
                                        {slot.position}
                                    </span>
                                    {locked && <span className="text-xs text-gray-500">🔒</span>}
                                </div>
                                <div className="flex-1 grid sm:grid-cols-2 gap-2">
                                    <input
                                        type="text"
                                        placeholder={locked ? '—' : 'Player name'}
                                        value={slot.playerName}
                                        onChange={e => update(i, 'playerName', e.target.value)}
                                        disabled={locked}
                                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60 w-full disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                    <input
                                        type="text"
                                        placeholder={locked ? '—' : slot.position === 'DEF' ? 'Team (e.g. Cowboys)' : 'NFL team (e.g. DAL)'}
                                        value={slot.nflTeam}
                                        onChange={e => update(i, 'nflTeam', e.target.value)}
                                        disabled={locked}
                                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60 w-full disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {note && <p className="text-xs text-gray-600 px-1">{note}</p>}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            {saved && (
                <p className="text-green-400 text-sm font-medium">
                    Lineup saved! {lockedCount > 0 ? 'Locked slots are final.' : 'You can edit until games begin.'}
                </p>
            )}

            <button
                type="submit"
                disabled={loading || !allUnlockedFilled}
                className="w-full bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black font-bold py-3 rounded-xl text-sm transition">
                {loading ? 'Saving…' : existingLineup ? 'Update Lineup' : 'Submit Lineup'}
            </button>
        </form>
    );
}
