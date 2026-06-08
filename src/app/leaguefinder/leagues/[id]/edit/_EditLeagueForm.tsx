'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const PLATFORMS = ['Sleeper', 'ESPN', 'Yahoo', 'NFL Fantasy'];
const FORMATS   = ['Dynasty', 'Redraft', 'Best Ball'];
const SCORINGS  = ['PPR', 'Half PPR', 'Standard', 'TE Premium'];
const SIZES     = [8, 10, 12, 14, 16, 32];
const ACTIVITY  = [
    { value: 1, label: '1 — Very low' },
    { value: 2, label: '2 — Low' },
    { value: 3, label: '3 — Moderate' },
    { value: 4, label: '4 — High' },
    { value: 5, label: '5 — Very high' },
];

interface Props {
    leagueId:         string;
    initialName:      string;
    initialPlatform:  string;
    initialFormat:    string;
    initialScoring:   string;
    initialSize:      number;
    initialBuyIn:     number | null;
    initialSeasons:   number;
    initialActivity:  number; // 1-5
    initialMinPrs:    number | null;
}

export default function EditLeagueForm({
    leagueId,
    initialName,
    initialPlatform,
    initialFormat,
    initialScoring,
    initialSize,
    initialBuyIn,
    initialSeasons,
    initialActivity,
    initialMinPrs,
}: Props) {
    const router = useRouter();

    const [name,             setName]             = useState(initialName);
    const [platform,         setPlatform]         = useState(initialPlatform);
    const [format,           setFormat]           = useState(initialFormat);
    const [scoring,          setScoring]          = useState(initialScoring);
    const [size,             setSize]             = useState(initialSize);
    const [buyIn,            setBuyIn]            = useState(initialBuyIn != null ? String(initialBuyIn) : '');
    const [completedSeasons, setCompletedSeasons] = useState(initialSeasons);
    const [activityLevel,    setActivityLevel]    = useState(initialActivity);
    const [loading,          setLoading]          = useState(false);
    const [error,            setError]            = useState('');

    const valid = name.trim() && platform && format && scoring && size >= 2;

    async function submit() {
        if (!valid) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/lf/leagues/${leagueId}`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    platform,
                    format,
                    scoring,
                    size,
                    buyIn:            buyIn !== '' ? parseInt(buyIn) : null,
                    completedSeasons,
                    activityLevel,
                    requiresMinPrs:   null,
                }),
            });
            if (res.ok) {
                router.push(`/leaguefinder/leagues/${leagueId}`);
                router.refresh();
            } else {
                const data = await res.json() as { error?: string };
                setError(data.error ?? 'Something went wrong');
            }
        } catch {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-5">
            {/* League name */}
            <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1.5">
                    League Name <span className="text-red-500">*</span>
                </label>
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37]/50"
                />
            </div>

            {/* Platform + Format */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1.5">
                        Platform <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={platform}
                        onChange={e => setPlatform(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50"
                    >
                        <option value="">Select…</option>
                        {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1.5">
                        Format <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={format}
                        onChange={e => setFormat(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50"
                    >
                        <option value="">Select…</option>
                        {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                </div>
            </div>

            {/* Scoring + Size */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1.5">
                        Scoring <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={scoring}
                        onChange={e => setScoring(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50"
                    >
                        <option value="">Select…</option>
                        {SCORINGS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1.5">
                        Teams <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={size}
                        onChange={e => setSize(parseInt(e.target.value))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50"
                    >
                        {SIZES.map(s => <option key={s} value={s}>{s} teams</option>)}
                    </select>
                </div>
            </div>

            {/* Buy-in + Completed Seasons */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1.5">
                        Buy-in ($) <span className="text-gray-600">optional</span>
                    </label>
                    <input
                        type="number" min={0}
                        value={buyIn}
                        onChange={e => setBuyIn(e.target.value)}
                        placeholder="0 = free"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37]/50"
                    />
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1.5">
                        Completed Seasons
                    </label>
                    <input
                        type="number" min={0} max={20}
                        value={completedSeasons}
                        onChange={e => setCompletedSeasons(parseInt(e.target.value) || 0)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50"
                    />
                </div>
            </div>

            {/* Activity level */}
            <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1.5">
                    Activity Level
                </label>
                <select
                    value={activityLevel}
                    onChange={e => setActivityLevel(parseInt(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50"
                >
                    {ACTIVITY.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
                <p className="text-[10px] text-gray-600 mt-1">How active is your group? (trades, waivers, chat activity)</p>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="flex-1 py-3 rounded-xl font-bold text-sm border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 transition"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={submit}
                    disabled={loading || !valid}
                    className="flex-1 py-3 rounded-xl font-bold text-sm bg-[#D4AF37] text-gray-950 hover:bg-[#BF9D2F] transition disabled:opacity-50"
                >
                    {loading ? 'Saving…' : 'Save Changes'}
                </button>
            </div>
        </div>
    );
}
