'use client';

import { useRouter } from 'next/navigation';

interface Props {
    leagueId:   string;
    className?: string;
}

export default function BackToOverview({ leagueId, className = '' }: Props) {
    const router = useRouter();

    const handleBack = () => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
        } else {
            router.push(`/dashboard/league/${leagueId}/overview`);
        }
    };

    return (
        <button
            onClick={handleBack}
            className={`inline-flex items-center gap-1 text-sm text-gray-500 hover:text-yellow-400 transition ${className}`}
        >
            ← Back to Overview
        </button>
    );
}
