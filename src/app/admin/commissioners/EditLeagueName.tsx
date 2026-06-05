'use client';

import { useRef, useState, useTransition } from 'react';
import { adminSetSubscriptionLeagueName } from '@/app/admin/actions';

export default function EditLeagueName({
    subId,
    current,
}: {
    subId: string;
    current: string | null;
}) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(current ?? '');
    const [saved, setSaved] = useState(current);
    const [pending, startTransition] = useTransition();
    const inputRef = useRef<HTMLInputElement>(null);

    function open() {
        setEditing(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    }

    function save() {
        startTransition(async () => {
            await adminSetSubscriptionLeagueName(subId, value.trim() || null);
            setSaved(value.trim() || null);
            setEditing(false);
        });
    }

    function clear() {
        startTransition(async () => {
            await adminSetSubscriptionLeagueName(subId, null);
            setSaved(null);
            setValue('');
            setEditing(false);
        });
    }

    if (!editing) {
        return (
            <button
                onClick={open}
                className="text-left hover:text-white transition text-sm text-white truncate max-w-[200px]"
                title="Click to edit league name"
            >
                {saved ?? <span className="italic text-red-400">missing — click to fix</span>}
            </button>
        );
    }

    return (
        <form
            onSubmit={e => { e.preventDefault(); save(); }}
            className="flex items-center gap-1"
        >
            <input
                ref={inputRef}
                value={value}
                onChange={e => setValue(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-sm text-white w-40 focus:outline-none focus:border-[#D4AF37]/60"
                placeholder="League name"
                disabled={pending}
            />
            <button
                type="submit"
                disabled={pending}
                className="text-xs text-[#D4AF37] hover:text-[#D4AF37]/80 font-semibold px-1 disabled:opacity-50"
            >
                {pending ? '…' : 'Save'}
            </button>
            <button
                type="button"
                onClick={clear}
                disabled={pending}
                className="text-xs text-red-500 hover:text-red-400 px-1 disabled:opacity-50"
            >
                Remove
            </button>
            <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-xs text-gray-500 hover:text-gray-300 px-1"
            >
                Cancel
            </button>
        </form>
    );
}
