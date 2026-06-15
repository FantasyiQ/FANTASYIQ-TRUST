'use client';

import { useState } from 'react';

export default function ManageBillingButton() {
    const [loading, setLoading] = useState(false);

    async function handleClick() {
        setLoading(true);
        try {
            const res = await fetch('/api/stripe/portal', { method: 'POST' });
            const { url, error } = await res.json();
            if (url) {
                window.location.href = url;
            } else {
                alert(error ?? 'Could not open billing portal');
                setLoading(false);
            }
        } catch {
            alert('Could not open billing portal');
            setLoading(false);
        }
    }

    return (
        <button
            onClick={handleClick}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition border border-gray-700"
        >
            {loading ? 'Opening…' : 'Manage Billing →'}
        </button>
    );
}
