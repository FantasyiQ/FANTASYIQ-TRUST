'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface SyncedLeague {
    id: string;
    leagueName: string;
    totalRosters: number;
    season: string;
    scoringType: string | null;
}

export default function SyncedLeaguePicker({ leagues }: { leagues: SyncedLeague[] }) {
    const router  = useRouter();
    const [open, setOpen] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);

    // Focus the dialog when it opens; restore focus when it closes
    useEffect(() => {
        if (open) {
            dialogRef.current?.focus();
        }
    }, [open]);

    // Close on Escape; trap Tab within the dialog
    useEffect(() => {
        if (!open) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') { setOpen(false); return; }
            if (e.key !== 'Tab' || !dialogRef.current) return;
            const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            const first = focusable[0];
            const last  = focusable[focusable.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
            } else {
                if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
            }
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    if (leagues.length === 0) return null;

    function handlePick(league: SyncedLeague) {
        setOpen(false);
        router.push(
            `/pricing?tab=commissioner&mode=new&size=${league.totalRosters}&leagueName=${encodeURIComponent(league.leagueName)}`
        );
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="text-sm border border-[#D4AF37]/40 hover:border-[#D4AF37] text-[#D4AF37] font-semibold px-4 py-1.5 rounded-lg transition">
                + Synced League
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                    {/* Accessible backdrop */}
                    <button
                        aria-label="Close dialog"
                        onClick={() => setOpen(false)}
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default" />
                    <div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="league-picker-title"
                        tabIndex={-1}
                        className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl focus:outline-none">
                        <h2 id="league-picker-title" className="text-lg font-bold text-white mb-1">Pick a Synced League</h2>
                        <p className="text-gray-400 text-sm mb-4">Select a league to start a commissioner plan for.</p>

                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {leagues.map((league) => (
                                <button
                                    key={league.id}
                                    onClick={() => handlePick(league)}
                                    className="w-full text-left px-4 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-[#D4AF37]/50 rounded-xl transition group">
                                    <p className="text-white font-semibold text-sm group-hover:text-[#D4AF37] transition">
                                        {league.leagueName}
                                    </p>
                                    <p className="text-gray-500 text-xs mt-0.5">
                                        {league.totalRosters} teams · {league.season}{league.scoringType ? ` · ${league.scoringType.toUpperCase()}` : ''}
                                    </p>
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => setOpen(false)}
                            className="mt-4 w-full py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white text-sm font-semibold transition">
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
