'use client';

import { useState } from 'react';

const APP_URL = 'https://fantasyiqtrust.com';

export default function ShareAppButton() {
    const [copied, setCopied] = useState(false);
    const canShare = typeof navigator !== 'undefined' && !!navigator.share;

    async function share() {
        if (canShare) {
            try {
                await navigator.share({
                    title: 'FantasyiQ Trust',
                    text:  'The fantasy football platform that never touches your money. Zero fees. Zero skimming.',
                    url:   APP_URL,
                });
            } catch {
                // user cancelled — no-op
            }
            return;
        }
        await navigator.clipboard.writeText(APP_URL);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <button
            onClick={share}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
        >
            {copied ? 'Link copied!' : canShare ? 'Share App' : 'Copy Link'}
        </button>
    );
}
