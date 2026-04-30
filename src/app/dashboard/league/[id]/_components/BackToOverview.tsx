import Link from 'next/link';

interface Props {
    leagueId:   string;
    className?: string;
}

export default function BackToOverview({ leagueId, className = '' }: Props) {
    return (
        <Link
            href={`/dashboard/league/${leagueId}/overview`}
            className={`inline-flex items-center gap-1 text-sm text-gray-500 hover:text-yellow-400 transition ${className}`}
        >
            ← Back to Overview
        </Link>
    );
}
