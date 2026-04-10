'use client';

import { useState } from 'react';

interface Doc {
    id: string;
    label: string;
    url: string;
    createdAt: Date;
}

interface Props {
    duesId: string;
    leagueName: string;
    initialDocuments: Doc[];
}

export default function DocumentsManager({ duesId, leagueName, initialDocuments }: Props) {
    const [docs, setDocs]       = useState<Doc[]>(initialDocuments);
    const [label, setLabel]     = useState('');
    const [url, setUrl]         = useState('');
    const [adding, setAdding]   = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [error, setError]     = useState('');

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setAdding(true);
        const res = await fetch(`/api/dues/${duesId}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: label.trim(), url: url.trim() }),
        });
        const data = await res.json();
        setAdding(false);
        if (!res.ok) { setError(data.error ?? 'Failed to add document.'); return; }
        setDocs(prev => [...prev, data.document]);
        setLabel('');
        setUrl('');
        setShowForm(false);
    }

    async function handleDelete(docId: string) {
        const res = await fetch(`/api/dues/${duesId}/documents/${docId}`, { method: 'DELETE' });
        if (res.ok) setDocs(prev => prev.filter(d => d.id !== docId));
    }

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                <h3 className="font-bold text-white">{leagueName}</h3>
                <button
                    onClick={() => { setShowForm(f => !f); setError(''); }}
                    className="text-[#C8A951] hover:text-[#b8992f] text-sm font-semibold transition">
                    {showForm ? 'Cancel' : '+ Add Document'}
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleAdd} className="px-6 py-4 border-b border-gray-800 space-y-3 bg-gray-800/30">
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                    <div className="grid sm:grid-cols-2 gap-3">
                        <input
                            type="text"
                            placeholder="Label (e.g. Rulebook 2025)"
                            value={label}
                            onChange={e => setLabel(e.target.value)}
                            required
                            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60 w-full"
                        />
                        <input
                            type="url"
                            placeholder="https://drive.google.com/..."
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                            required
                            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60 w-full"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={adding}
                        className="bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black font-bold px-5 py-2 rounded-lg text-sm transition">
                        {adding ? 'Saving…' : 'Save Document'}
                    </button>
                </form>
            )}

            {docs.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-600 text-sm">
                    No documents added yet. Add a Google Drive or Dropbox share link above.
                </div>
            ) : (
                <ul className="divide-y divide-gray-800/50">
                    {docs.map(doc => (
                        <li key={doc.id} className="px-6 py-3.5 flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-white text-sm font-medium truncate">{doc.label}</p>
                                <a
                                    href={doc.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#C8A951]/70 hover:text-[#C8A951] text-xs truncate block transition">
                                    {doc.url}
                                </a>
                            </div>
                            <button
                                onClick={() => handleDelete(doc.id)}
                                className="text-gray-700 hover:text-red-400 text-xs transition shrink-0">
                                Remove
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
