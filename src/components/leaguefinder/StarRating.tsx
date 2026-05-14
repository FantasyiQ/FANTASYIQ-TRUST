'use client';

/** Renders filled/empty stars for a 1–5 rating. */
export function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
    const px = size === 'md' ? 'w-4 h-4' : 'w-3 h-3';
    return (
        <span className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(i => (
                <svg
                    key={i}
                    className={`${px} ${i <= Math.round(rating) ? 'text-[#D4AF37]' : 'text-gray-700'}`}
                    viewBox="0 0 20 20" fill="currentColor"
                >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
            ))}
        </span>
    );
}

/** Inline label: "4.2 ★ (18)" */
export function RatingLabel({ avg, count }: { avg: number; count: number }) {
    return (
        <span className="flex items-center gap-1.5 text-sm">
            <StarRating rating={avg} />
            <span className="text-white font-semibold">{avg.toFixed(1)}</span>
            <span className="text-gray-500">({count})</span>
        </span>
    );
}
