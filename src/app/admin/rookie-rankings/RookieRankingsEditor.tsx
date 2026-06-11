'use client';

import { useState, useTransition } from 'react';

interface Player {
    id:               string;
    playerName:       string;
    position:         string;
    school:           string;
    overallPick:      number;
    baseFiQScore:     number;
    opportunityScore: number;
    fiqScore:         number;
    fiqTier:          string;
}

const POS_TABS = ['ALL', 'QB', 'RB', 'WR', 'TE'] as const;

const TIER_COLORS: Record<string, string> = {
    'Tier 1': 'text-[#D4AF37]',
    'Tier 2': 'text-green-400',
    'Tier 3': 'text-blue-400',
    'Tier 4': 'text-gray-400',
    'Tier 5': 'text-gray-600',
};

export default function RookieRankingsEditor({ players: initial }: { players: Player[] }) {
    const [players, setPlayers]   = useState(initial);
    const [posFilter, setPosFilter] = useState<string>('RB');
    const [edits, setEdits]       = useState<Record<string, string>>({});
    const [saving, setSaving]     = useState<Record<string, boolean>>({});
    const [saved, setSaved]       = useState<Record<string, boolean>>({});
    const [errors, setErrors]     = useState<Record<string, string>>({});
    const [, startTransition]     = useTransition();

    const filtered = posFilter === 'ALL' ? players : players.filter(p => p.position === posFilter);

    const handleSave = async (player: Player) => {
        const raw = edits[player.id];
        if (raw === undefined) return;

        const val = parseFloat(raw);
        if (isNaN(val) || val < 0 || val > 100) {
            setErrors(e => ({ ...e, [player.id]: 'Must be 0–100' }));
            return;
        }

        setSaving(s => ({ ...s, [player.id]: true }));
        setErrors(e => ({ ...e, [player.id]: '' }));

        try {
            const res = await fetch('/api/admin/rookie-rankings', {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ id: player.id, baseFiQScore: val }),
            });

            if (!res.ok) throw new Error(await res.text());

            const updated = await res.json() as { baseFiQScore: number; fiqScore: number; fiqTier: string };

            startTransition(() => {
                setPlayers(ps => ps.map(p => p.id === player.id
                    ? { ...p, baseFiQScore: updated.baseFiQScore, fiqScore: updated.fiqScore, fiqTier: updated.fiqTier }
                    : p,
                ));
                setEdits(e => { const n = { ...e }; delete n[player.id]; return n; });
                setSaved(s => ({ ...s, [player.id]: true }));
                setTimeout(() => setSaved(s => ({ ...s, [player.id]: false })), 2000);
            });
        } catch {
            setErrors(e => ({ ...e, [player.id]: 'Save failed' }));
        } finally {
            setSaving(s => ({ ...s, [player.id]: false }));
        }
    };

    return (
        <div className="space-y-5">
            {/* Position filter */}
            <div className="flex gap-1.5">
                {POS_TABS.map(pos => (
                    <button
                        key={pos}
                        onClick={() => setPosFilter(pos)}
                        className={[
                            'px-3 py-1.5 rounded-lg text-xs font-semibold border transition',
                            posFilter === pos
                                ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                                : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500',
                        ].join(' ')}
                    >
                        {pos}
                    </button>
                ))}
                <span className="ml-auto text-xs text-gray-600 self-center">{filtered.length} players</span>
            </div>

            {/* Table */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-800 text-left">
                            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-8">#</th>
                            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Player</th>
                            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pos</th>
                            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pick</th>
                            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Base FiQ</th>
                            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Opp Score</th>
                            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">FiQ Score</th>
                            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tier</th>
                            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-20"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                        {filtered.map((p, i) => {
                            const isDirty = edits[p.id] !== undefined;
                            const isSaving = saving[p.id];
                            const isSaved  = saved[p.id];
                            const error    = errors[p.id];

                            return (
                                <tr key={p.id} className={isDirty ? 'bg-yellow-900/10' : 'hover:bg-gray-800/30'}>
                                    <td className="px-4 py-2.5 text-gray-600">{i + 1}</td>
                                    <td className="px-4 py-2.5">
                                        <p className="font-medium text-white">{p.playerName}</p>
                                        <p className="text-xs text-gray-500">{p.school}</p>
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{p.position}</td>
                                    <td className="px-4 py-2.5 text-gray-400">{p.overallPick}</td>
                                    <td className="px-4 py-2.5">
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            step={0.1}
                                            value={edits[p.id] ?? p.baseFiQScore.toFixed(1)}
                                            onChange={e => setEdits(ed => ({ ...ed, [p.id]: e.target.value }))}
                                            className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-sm focus:border-[#D4AF37] focus:outline-none"
                                        />
                                        {error && <p className="text-red-400 text-[10px] mt-0.5">{error}</p>}
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-400">{p.opportunityScore.toFixed(1)}</td>
                                    <td className="px-4 py-2.5 font-semibold text-white">{p.fiqScore.toFixed(1)}</td>
                                    <td className={`px-4 py-2.5 font-semibold text-xs ${TIER_COLORS[p.fiqTier] ?? 'text-gray-500'}`}>
                                        {p.fiqTier}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        {isSaved ? (
                                            <span className="text-green-400 text-xs font-semibold">Saved</span>
                                        ) : isDirty ? (
                                            <button
                                                onClick={() => handleSave(p)}
                                                disabled={isSaving}
                                                className="px-3 py-1 text-xs font-bold rounded-lg bg-[#D4AF37] text-black hover:bg-[#c9a227] disabled:opacity-50 transition"
                                            >
                                                {isSaving ? '…' : 'Save'}
                                            </button>
                                        ) : null}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
