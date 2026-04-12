'use client';

import { useState, useRef } from 'react';

interface Doc {
    id:        string;
    label:     string;
    url:       string;
    createdAt: Date;
}

interface Props {
    duesId:           string;
    leagueName:       string;
    initialDocuments: Doc[];
}

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp';

function fileIcon(url: string): string {
    const u = url.toLowerCase();
    if (u.includes('.pdf'))                       return '📄';
    if (u.includes('.doc'))                       return '📝';
    if (u.includes('.xls') || u.includes('.csv')) return '📊';
    if (/\.(png|jpg|jpeg|gif|webp)/.test(u))      return '🖼️';
    return '🔗';
}

function isBlobUrl(url: string): boolean {
    return url.includes('vercel-storage.com') || url.includes('public.blob.vercel');
}

export default function DocumentsManager({ duesId, leagueName, initialDocuments }: Props) {
    const [docs, setDocs]         = useState<Doc[]>(initialDocuments);
    const [mode, setMode]         = useState<'link' | 'upload'>('upload');
    const [showForm, setShowForm] = useState(false);
    const [busy, setBusy]         = useState(false);
    const [error, setError]       = useState('');

    // Link form
    const [label, setLabel] = useState('');
    const [url, setUrl]     = useState('');

    // Upload form
    const [uploadLabel, setUploadLabel] = useState('');
    const [file, setFile]               = useState<File | null>(null);
    const [dragOver, setDragOver]       = useState(false);
    const fileRef                       = useRef<HTMLInputElement>(null);

    function reset() {
        setLabel(''); setUrl('');
        setUploadLabel(''); setFile(null);
        setShowForm(false); setError('');
        if (fileRef.current) fileRef.current.value = '';
    }

    function handleFilePick(f: File) {
        setFile(f);
        if (!uploadLabel) setUploadLabel(f.name.replace(/\.[^.]+$/, ''));
    }

    async function handleLinkAdd(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setBusy(true);
        const res = await fetch(`/api/dues/${duesId}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: label.trim(), url: url.trim() }),
        });
        const data = await res.json();
        setBusy(false);
        if (!res.ok) { setError(data.error ?? 'Failed to add document.'); return; }
        setDocs(prev => [...prev, data.document]);
        reset();
    }

    async function handleUpload(e: React.FormEvent) {
        e.preventDefault();
        if (!file) return;
        setError('');
        setBusy(true);
        const fd = new FormData();
        fd.append('file', file);
        fd.append('label', uploadLabel.trim() || file.name);
        const res = await fetch(`/api/dues/${duesId}/documents/upload`, {
            method: 'POST',
            body: fd,
        });
        const data = await res.json();
        setBusy(false);
        if (!res.ok) { setError(data.error ?? 'Upload failed.'); return; }
        setDocs(prev => [...prev, data.document]);
        reset();
    }

    async function handleDelete(docId: string) {
        const res = await fetch(`/api/dues/${duesId}/documents/${docId}`, { method: 'DELETE' });
        if (res.ok) setDocs(prev => prev.filter(d => d.id !== docId));
    }

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                <h3 className="font-bold text-white">{leagueName}</h3>
                <button
                    onClick={() => { setShowForm(f => !f); setError(''); }}
                    className="text-[#C8A951] hover:text-[#b8992f] text-sm font-semibold transition">
                    {showForm ? 'Cancel' : '+ Add Document'}
                </button>
            </div>

            {/* Form */}
            {showForm && (
                <div className="border-b border-gray-800 bg-gray-800/30">
                    {/* Tab switcher */}
                    <div className="flex border-b border-gray-800">
                        {(['upload', 'link'] as const).map(m => (
                            <button key={m} type="button" onClick={() => { setMode(m); setError(''); }}
                                className={`px-5 py-2.5 text-xs font-semibold transition border-b-2 -mb-px ${
                                    mode === m
                                        ? 'border-[#C8A951] text-[#C8A951]'
                                        : 'border-transparent text-gray-500 hover:text-gray-300'
                                }`}>
                                {m === 'upload' ? '📎 Upload File' : '🔗 Add Link'}
                            </button>
                        ))}
                    </div>

                    {/* Upload form */}
                    {mode === 'upload' && (
                        <form onSubmit={handleUpload} className="px-6 py-4 space-y-3">
                            {/* Drop zone */}
                            <div
                                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={e => {
                                    e.preventDefault(); setDragOver(false);
                                    const f = e.dataTransfer.files[0];
                                    if (f) handleFilePick(f);
                                }}
                                onClick={() => fileRef.current?.click()}
                                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                                    dragOver
                                        ? 'border-[#C8A951] bg-[#C8A951]/5'
                                        : file
                                            ? 'border-green-700 bg-green-900/10'
                                            : 'border-gray-700 hover:border-gray-600'
                                }`}>
                                {file ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="text-xl">{fileIcon(file.name)}</span>
                                        <div className="text-left">
                                            <p className="text-white text-sm font-medium">{file.name}</p>
                                            <p className="text-gray-500 text-xs">{(file.size / 1024).toFixed(1)} KB</p>
                                        </div>
                                        <button type="button" onClick={e => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                                            className="ml-2 text-gray-600 hover:text-red-400 text-sm transition">×</button>
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-gray-400 text-sm">Drop file here or <span className="text-[#C8A951]">browse</span></p>
                                        <p className="text-gray-700 text-xs mt-1">PDF, Word, Excel, TXT, CSV, images — max 10 MB</p>
                                    </>
                                )}
                                <input ref={fileRef} type="file" accept={ACCEPT} className="hidden"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFilePick(f); }} />
                            </div>

                            <input type="text" placeholder="Label (e.g. Rulebook 2025)"
                                value={uploadLabel} onChange={e => setUploadLabel(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60" />

                            {error && <p className="text-red-400 text-sm">{error}</p>}
                            <button type="submit" disabled={busy || !file}
                                className="bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black font-bold px-5 py-2 rounded-lg text-sm transition">
                                {busy ? 'Uploading…' : 'Upload'}
                            </button>
                        </form>
                    )}

                    {/* Link form */}
                    {mode === 'link' && (
                        <form onSubmit={handleLinkAdd} className="px-6 py-4 space-y-3">
                            <div className="grid sm:grid-cols-2 gap-3">
                                <input type="text" placeholder="Label (e.g. Rulebook 2025)"
                                    value={label} onChange={e => setLabel(e.target.value)} required
                                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60 w-full" />
                                <input type="url" placeholder="https://drive.google.com/…"
                                    value={url} onChange={e => setUrl(e.target.value)} required
                                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60 w-full" />
                            </div>
                            {error && <p className="text-red-400 text-sm">{error}</p>}
                            <button type="submit" disabled={busy}
                                className="bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-black font-bold px-5 py-2 rounded-lg text-sm transition">
                                {busy ? 'Saving…' : 'Save Link'}
                            </button>
                        </form>
                    )}
                </div>
            )}

            {/* Document list */}
            {docs.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-600 text-sm">
                    No documents yet. Upload a file or add a link above.
                </div>
            ) : (
                <ul className="divide-y divide-gray-800/50">
                    {docs.map(doc => (
                        <li key={doc.id} className="px-6 py-3.5 flex items-center justify-between gap-4">
                            <div className="min-w-0 flex items-center gap-3">
                                <span className="text-lg shrink-0">{fileIcon(doc.url)}</span>
                                <div className="min-w-0">
                                    <p className="text-white text-sm font-medium truncate">{doc.label}</p>
                                    <a href={doc.url} target="_blank" rel="noopener noreferrer"
                                        className="text-[#C8A951]/70 hover:text-[#C8A951] text-xs truncate block transition max-w-xs">
                                        {isBlobUrl(doc.url) ? '↓ Download / View' : doc.url}
                                    </a>
                                </div>
                            </div>
                            <button onClick={() => handleDelete(doc.id)}
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
