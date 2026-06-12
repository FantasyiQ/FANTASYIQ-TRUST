'use client';

import { useState } from 'react';

interface Props {
    leagueId:         string;
    playoffWeekStart: number | null;
    champWeek:        number | null;
}

export default function PhaseSettingsCard({ leagueId, playoffWeekStart, champWeek }: Props) {
    const [pws,     setPws]     = useState(playoffWeekStart ?? '');
    const [cw,      setCw]      = useState(champWeek ?? '');
    const [saving,  setSaving]  = useState(false);
    const [saved,   setSaved]   = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setSaved(false);
        setError(null);

        const body: Record<string, number> = {};
        if (pws !== '') body.playoffWeekStart = Number(pws);
        if (cw  !== '') body.champWeek        = Number(cw);

        try {
            const res = await fetch(`/api/leagues/${leagueId}/phase-settings`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'Save failed');
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    }

    const isConfigured = playoffWeekStart !== null && champWeek !== null;

    return (
        <div className={`bg-gray-900 border rounded-2xl p-5 space-y-4 ${isConfigured ? 'border-gray-800' : 'border-amber-700/40'}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="font-semibold text-white text-sm">Playoff Schedule</h3>
                    <p className="text-gray-500 text-xs mt-0.5">
                        {isConfigured
                            ? `Playoffs start Week ${playoffWeekStart} · Championship Week ${champWeek}`
                            : 'Not configured — required for accurate pick values and phase detection.'}
                    </p>
                </div>
                {!isConfigured && (
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-900/20 text-amber-400 border-amber-700/40">
                        Action Required
                    </span>
                )}
                {isConfigured && (
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border bg-green-900/20 text-green-400 border-green-700/40">
                        Configured
                    </span>
                )}
            </div>

            <form onSubmit={handleSubmit} className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1">
                    <label htmlFor="phase-playoff-week" className="text-gray-500 text-xs block">Playoff Start Week</label>
                    <input
                        id="phase-playoff-week"
                        type="number"
                        min={1}
                        max={18}
                        value={pws}
                        onChange={e => setPws(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 15"
                        className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
                    />
                </div>
                <div className="space-y-1">
                    <label htmlFor="phase-champ-week" className="text-gray-500 text-xs block">Championship Week</label>
                    <input
                        id="phase-champ-week"
                        type="number"
                        min={1}
                        max={18}
                        value={cw}
                        onChange={e => setCw(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 17"
                        className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
                    />
                </div>
                <button
                    type="submit"
                    disabled={saving || (pws === '' && cw === '')}
                    className="px-4 py-1.5 rounded-lg bg-[#D4AF37] text-black text-xs font-bold hover:bg-[#BF9D2F] transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {saving ? 'Saving…' : 'Save'}
                </button>
                {saved  && <span className="text-green-400 text-xs">Saved</span>}
                {error  && <span className="text-red-400 text-xs">{error}</span>}
            </form>

            <p className="text-gray-600 text-[10px]">
                These are auto-populated from Sleeper when available. Set manually for ESPN leagues or when Sleeper doesn&apos;t provide them.
            </p>
        </div>
    );
}
