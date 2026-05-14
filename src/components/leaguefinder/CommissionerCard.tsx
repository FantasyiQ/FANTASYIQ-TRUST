import Link from 'next/link';
import { RatingLabel } from './StarRating';

interface Props {
    id:             string;
    displayName:    string;
    avgRating:      number;
    reviewsCount:   number;
    flagsCount:     number;
    platformHandles: Record<string, string>;
}

const PLATFORM_COLORS: Record<string, string> = {
    sleeper: 'bg-yellow-900/30 text-yellow-400 border-yellow-800',
    espn:    'bg-red-900/30   text-red-400    border-red-800',
    yahoo:   'bg-purple-900/30 text-purple-400 border-purple-800',
};

export default function CommissionerCard({
    id, displayName, avgRating, reviewsCount, flagsCount, platformHandles,
}: Props) {
    const handles = Object.entries(platformHandles ?? {}).filter(([, v]) => v);

    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <Link
                        href={`/leaguefinder/commissioners/${id}`}
                        className="text-base font-bold text-white hover:text-[#D4AF37] transition"
                    >
                        {displayName}
                    </Link>
                    <div className="mt-1">
                        <RatingLabel avg={avgRating} count={reviewsCount} />
                    </div>
                </div>
                {flagsCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-red-900/30 text-red-400 border-red-800 shrink-0">
                        {flagsCount} flag{flagsCount !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {handles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {handles.map(([platform, handle]) => (
                        <span
                            key={platform}
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${PLATFORM_COLORS[platform.toLowerCase()] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}
                        >
                            {platform.charAt(0).toUpperCase() + platform.slice(1)}: {handle}
                        </span>
                    ))}
                </div>
            )}

            <Link
                href={`/leaguefinder/commissioners/${id}`}
                className="text-xs text-[#D4AF37] hover:underline self-start"
            >
                View profile →
            </Link>
        </div>
    );
}
