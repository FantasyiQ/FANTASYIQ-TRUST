'use client';

import { useState, useTransition } from 'react';

interface Props {
    leagueId:      string;
    commissionerId: string;
    onSuccess?:    () => void;
}

const CURRENT_YEAR = new Date().getFullYear();

function RatingRow({
    label,
    name,
    value,
    onChange,
}: {
    label:    string;
    name:     string;
    value:    number;
    onChange: (v: number) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <label className="text-sm text-gray-300 w-28 shrink-0">{label}</label>
            <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                    <button
                        key={star}
                        type="button"
                        onClick={() => onChange(star)}
                        className={`w-7 h-7 rounded flex items-center justify-center transition ${
                            star <= value
                                ? 'text-[#D4AF37]'
                                : 'text-gray-700 hover:text-gray-500'
                        }`}
                        aria-label={`${name} ${star} stars`}
                    >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                    </button>
                ))}
                <span className="text-xs text-gray-500 ml-1 w-4">{value}/5</span>
            </div>
        </div>
    );
}

export default function ReviewForm({ leagueId, commissionerId, onSuccess }: Props) {
    const [pending, startTransition] = useTransition();
    const [error,   setError]   = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [ratingOverall,   setRatingOverall]   = useState(5);
    const [ratingFairness,  setRatingFairness]  = useState(5);
    const [ratingComm,      setRatingComm]      = useState(5);
    const [ratingStability, setRatingStability] = useState(5);
    const [text,      setText]      = useState('');
    const [seasonYear, setSeasonYear] = useState(CURRENT_YEAR);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        startTransition(async () => {
            try {
                const res = await fetch('/api/lf/reviews', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        leagueId, commissionerId,
                        ratingOverall, ratingFairness, ratingComm, ratingStability,
                        text: text.trim() || null,
                        seasonYear,
                    }),
                });

                if (!res.ok) {
                    const data = await res.json() as { error?: string };
                    setError(data.error ?? 'Something went wrong');
                    return;
                }

                setSuccess(true);
                onSuccess?.();
            } catch {
                setError('Network error — please try again');
            }
        });
    };

    if (success) {
        return (
            <div className="rounded-xl border border-emerald-800 bg-emerald-900/20 px-5 py-4 text-center">
                <div className="text-emerald-400 font-semibold text-sm">Review submitted!</div>
                <p className="text-gray-500 text-xs mt-1">Thank you for helping the community.</p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-3">
                <RatingRow label="Overall"      name="overall"   value={ratingOverall}   onChange={setRatingOverall}   />
                <RatingRow label="Fairness"     name="fairness"  value={ratingFairness}  onChange={setRatingFairness}  />
                <RatingRow label="Communication" name="comm"     value={ratingComm}      onChange={setRatingComm}      />
                <RatingRow label="Stability"    name="stability" value={ratingStability} onChange={setRatingStability} />
            </div>

            <div>
                <label htmlFor="review-season-year" className="block text-sm text-gray-400 mb-1.5">Season Year</label>
                <select
                    id="review-season-year"
                    value={seasonYear}
                    onChange={e => setSeasonYear(Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#D4AF37]/60"
                >
                    {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3].map(y => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>
            </div>

            <div>
                <label htmlFor="review-text" className="block text-sm text-gray-400 mb-1.5">Your review (optional)</label>
                <textarea
                    id="review-text"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    rows={3}
                    placeholder="Describe your experience in this league..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-[#D4AF37]/60 placeholder:text-gray-600"
                />
            </div>

            {error && (
                <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                    {error}
                </p>
            )}

            <button
                type="submit"
                disabled={pending}
                className="w-full py-2.5 rounded-lg bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {pending ? 'Submitting…' : 'Submit Review'}
            </button>
        </form>
    );
}
