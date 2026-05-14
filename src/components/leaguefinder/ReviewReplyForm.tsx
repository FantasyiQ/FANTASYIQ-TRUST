'use client';

import { useState } from 'react';

interface Reply {
    id:        string;
    text:      string;
    createdAt: string;
}

interface Props {
    reviewId:      string;
    existingReply: Reply | null;
}

export default function ReviewReplyForm({ reviewId, existingReply }: Props) {
    const [editing, setEditing] = useState(!existingReply);
    const [text,    setText]    = useState(existingReply?.text ?? '');
    const [reply,   setReply]   = useState<Reply | null>(existingReply);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState('');

    async function save() {
        if (!text.trim()) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/lf/reviews/${reviewId}/reply`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ text }),
            });
            if (res.ok) {
                const data = await res.json() as Reply;
                setReply(data);
                setEditing(false);
            } else {
                const data = await res.json() as { error?: string };
                setError(data.error ?? 'Error saving reply');
            }
        } catch {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    }

    async function remove() {
        setLoading(true);
        try {
            await fetch(`/api/lf/reviews/${reviewId}/reply`, { method: 'DELETE' });
            setReply(null);
            setText('');
            setEditing(true);
        } finally {
            setLoading(false);
        }
    }

    if (reply && !editing) {
        return (
            <div className="mt-2 pl-3 border-l-2 border-[#D4AF37]/30 space-y-1">
                <p className="text-[10px] font-bold text-[#D4AF37]">Commissioner response</p>
                <p className="text-xs text-gray-400 leading-relaxed">{reply.text}</p>
                <div className="flex gap-3 pt-0.5">
                    <button
                        onClick={() => setEditing(true)}
                        className="text-[10px] text-gray-600 hover:text-gray-400 transition"
                    >
                        Edit
                    </button>
                    <button
                        onClick={remove}
                        disabled={loading}
                        className="text-[10px] text-red-800 hover:text-red-600 transition disabled:opacity-50"
                    >
                        Delete
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-2 space-y-2">
            <p className="text-[10px] font-bold text-[#D4AF37]">
                {reply ? 'Edit your response' : 'Reply as commissioner'}
            </p>
            <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Respond to this review publicly…"
                rows={2}
                className="w-full bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 resize-none focus:outline-none focus:border-[#D4AF37]/50"
            />
            {error && <p className="text-[10px] text-red-400">{error}</p>}
            <div className="flex gap-2">
                <button
                    onClick={save}
                    disabled={loading || !text.trim()}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-[#D4AF37] text-gray-950 hover:bg-[#BF9D2F] transition disabled:opacity-50"
                >
                    {loading ? 'Saving…' : 'Post Reply'}
                </button>
                {reply && (
                    <button
                        onClick={() => { setEditing(false); setText(reply.text); }}
                        className="text-[10px] text-gray-600 hover:text-gray-300 transition"
                    >
                        Cancel
                    </button>
                )}
            </div>
        </div>
    );
}
