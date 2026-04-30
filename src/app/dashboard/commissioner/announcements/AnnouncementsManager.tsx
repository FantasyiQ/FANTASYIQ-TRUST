'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import Image from 'next/image';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Author {
    name:  string | null;
    image: string | null;
}

export interface Post {
    id:        string;
    body:      string;
    mediaUrl:  string | null;
    pinned:    boolean;
    createdAt: Date | string;
    author:    Author;
}

interface GifResult {
    id:         string;
    url:        string;
    previewUrl: string;
}

export interface AnnouncementsManagerProps {
    duesId:     string;
    leagueName: string;
    initial:    Post[];
}

type MediaTab = 'gif' | 'upload';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(date: Date | string): string {
    const diff  = Date.now() - new Date(date).getTime();
    const mins  = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days  = Math.floor(diff / 86_400_000);
    if (mins  <  1) return 'just now';
    if (mins  < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days  <  7) return `${days}d ago`;
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isDirectMedia(url: string): boolean {
    try {
        const u = new URL(url);
        if (/\.(gif|jpg|jpeg|png|webp|svg)(\?.*)?$/i.test(u.pathname)) return true;
        if (u.hostname.includes('media.giphy.com')) return true;
        if (u.hostname.includes('media.tenor.com')) return true;
        if (u.hostname.includes('i.imgur.com')) return true;
        if (u.hostname.includes('vercel-storage.com')) return true;
        if (u.hostname.includes('public.blob.vercel')) return true;
    } catch { /* invalid URL */ }
    return false;
}

// ---------------------------------------------------------------------------
// MediaPreview
// ---------------------------------------------------------------------------

function MediaPreview({ url, alt = '' }: { url: string; alt?: string }) {
    const [errored, setErrored] = useState(false);
    if (errored) return (
        <a href={url} target="_blank" rel="noopener noreferrer"
            className="text-[#C8A951] text-xs hover:underline break-all">{url}</a>
    );
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} onError={() => setErrored(true)}
        className="rounded-xl max-h-72 max-w-full object-contain bg-gray-800" />;
}

// ---------------------------------------------------------------------------
// PostCard
// ---------------------------------------------------------------------------

function PostCard({ post, duesId, onPin, onDelete }: {
    post:     Post;
    duesId:   string;
    onPin:    (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const [busy, setBusy] = useState(false);

    async function handlePin() {
        setBusy(true);
        await fetch(`/api/dues/${duesId}/announcements/${post.id}`, { method: 'PATCH' });
        onPin(post.id);
        setBusy(false);
    }

    async function handleDelete() {
        if (!confirm('Delete this announcement?')) return;
        setBusy(true);
        await fetch(`/api/dues/${duesId}/announcements/${post.id}`, { method: 'DELETE' });
        onDelete(post.id);
    }

    const initials = (post.author.name ?? 'C').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    return (
        <div className={`bg-gray-900 border rounded-2xl p-5 space-y-3 transition ${post.pinned ? 'border-[#C8A951]/40' : 'border-gray-800'}`}>
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    {post.author.image ? (
                        <Image src={post.author.image} alt={post.author.name ?? ''} width={36} height={36}
                            className="rounded-full shrink-0" />
                    ) : (
                        <div className="w-9 h-9 rounded-full bg-[#C8A951]/20 text-[#C8A951] flex items-center justify-center text-xs font-bold shrink-0">
                            {initials}
                        </div>
                    )}
                    <div>
                        <p className="text-white text-sm font-semibold">{post.author.name ?? 'Commissioner'}</p>
                        <div className="flex items-center gap-2">
                            <p className="text-gray-600 text-xs">{timeAgo(post.createdAt)}</p>
                            {post.pinned && (
                                <span className="text-[#C8A951] text-[10px] font-bold uppercase tracking-wide">📌 Pinned</span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button onClick={handlePin} disabled={busy} title={post.pinned ? 'Unpin' : 'Pin to top'}
                        className={`p-1.5 rounded-lg text-sm transition disabled:opacity-40 ${
                            post.pinned
                                ? 'text-[#C8A951] hover:bg-[#C8A951]/10'
                                : 'text-gray-700 hover:text-[#C8A951] hover:bg-[#C8A951]/10'
                        }`}>
                        📌
                    </button>
                    <button onClick={handleDelete} disabled={busy} title="Delete"
                        className="p-1.5 rounded-lg text-sm text-gray-700 hover:text-red-400 hover:bg-red-400/10 transition disabled:opacity-40">
                        🗑️
                    </button>
                </div>
            </div>

            {/* Body */}
            {post.body && (
                <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{post.body}</p>
            )}

            {/* Media */}
            {post.mediaUrl && (
                <div className="mt-1">
                    {isDirectMedia(post.mediaUrl) ? (
                        <MediaPreview url={post.mediaUrl} alt="announcement media" />
                    ) : (
                        <a href={post.mediaUrl} target="_blank" rel="noopener noreferrer"
                            className="text-[#C8A951] text-xs hover:underline break-all">{post.mediaUrl}</a>
                    )}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// AnnouncementsManager
// ---------------------------------------------------------------------------

export default function AnnouncementsManager({ duesId, leagueName, initial }: AnnouncementsManagerProps) {
    const [posts, setPosts]         = useState<Post[]>(initial);
    const [body, setBody]           = useState('');
    const [isPending, startTransition] = useTransition();
    const [error, setError]         = useState('');

    // Media panel
    const [mediaTab, setMediaTab]   = useState<MediaTab | null>(null);

    // GIF search
    const [gifQuery, setGifQuery]   = useState('');
    const [gifResults, setGifResults] = useState<GifResult[]>([]);
    const [gifSearching, setGifSearching] = useState(false);
    const [gifError, setGifError]   = useState('');

    // Image upload
    const fileRef                   = useRef<HTMLInputElement>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadError, setUploadError] = useState('');

    // Selected media (gif or uploaded image — mutually exclusive)
    const [selectedMedia, setSelectedMedia] = useState<{ url: string; type: 'gif' | 'image' } | null>(null);

    // ---------------------------------------------------------------------------
    // GIF search — debounced
    // ---------------------------------------------------------------------------

    useEffect(() => {
        if (!gifQuery.trim()) { setGifResults([]); return; }
        const t = setTimeout(async () => {
            setGifSearching(true);
            setGifError('');
            try {
                const res  = await fetch(`/api/giphy/search?q=${encodeURIComponent(gifQuery.trim())}`);
                const data = await res.json() as { results?: GifResult[]; error?: string };
                if (!res.ok) { setGifError(data.error ?? 'Search failed.'); }
                else setGifResults(data.results ?? []);
            } catch {
                setGifError('Search failed.');
            } finally {
                setGifSearching(false);
            }
        }, 400);
        return () => clearTimeout(t);
    }, [gifQuery]);

    // ---------------------------------------------------------------------------
    // Image upload
    // ---------------------------------------------------------------------------

    async function handleImageFile(file: File) {
        setUploadError('');
        setUploadingImage(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res  = await fetch(`/api/dues/${duesId}/announcements/upload`, { method: 'POST', body: fd });
            const data = await res.json() as { url?: string; error?: string };
            if (!res.ok) { setUploadError(data.error ?? 'Upload failed.'); return; }
            setSelectedMedia({ url: data.url!, type: 'image' });
            setMediaTab(null); // collapse panel after selection
        } catch {
            setUploadError('Upload failed.');
        } finally {
            setUploadingImage(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    }

    // ---------------------------------------------------------------------------
    // Post
    // ---------------------------------------------------------------------------

    function handlePost() {
        if (!body.trim() && !selectedMedia) return;
        setError('');
        startTransition(async () => {
            const res = await fetch(`/api/dues/${duesId}/announcements`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    body:     body.trim(),
                    mediaUrl: selectedMedia?.url ?? undefined,
                }),
            });
            const data = await res.json() as Post & { error?: string };
            if (!res.ok) { setError(data.error ?? 'Failed to post.'); return; }
            setPosts(prev => [data, ...prev]);
            setBody('');
            setSelectedMedia(null);
            setGifQuery('');
            setGifResults([]);
            setMediaTab(null);
        });
    }

    // ---------------------------------------------------------------------------
    // Pin / delete
    // ---------------------------------------------------------------------------

    function handlePin(id: string) {
        setPosts(prev => {
            const updated = prev.map(p => p.id === id ? { ...p, pinned: !p.pinned } : p);
            return [...updated].sort((a, b) => {
                if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
        });
    }

    function handleDelete(id: string) {
        setPosts(prev => prev.filter(p => p.id !== id));
    }

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    const canPost = (body.trim().length > 0 || !!selectedMedia) && !isPending;

    return (
        <div className="space-y-4">

            {/* ── Composer ──────────────────────────────────────────────── */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">

                {/* Text area */}
                <div className="px-5 pt-5 pb-3 border-b border-gray-800">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">{leagueName}</p>
                    <textarea
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost(); }}
                        placeholder="Write an announcement… (⌘+Enter to post)"
                        rows={3}
                        maxLength={2000}
                        className="w-full bg-transparent text-white text-sm placeholder-gray-600 resize-none focus:outline-none leading-relaxed"
                    />

                    {/* Selected media preview */}
                    {selectedMedia && (
                        <div className="mt-3 relative inline-block">
                            <MediaPreview url={selectedMedia.url} alt="selected media" />
                            <button
                                onClick={() => setSelectedMedia(null)}
                                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/70 text-white text-xs flex items-center justify-center hover:bg-black/90 transition">
                                ×
                            </button>
                        </div>
                    )}
                </div>

                {/* Media panel */}
                {mediaTab && (
                    <div className="border-b border-gray-800 bg-gray-800/30">
                        {/* Tab switcher */}
                        <div className="flex border-b border-gray-800">
                            {(['gif', 'upload'] as MediaTab[]).map(tab => (
                                <button key={tab} type="button" onClick={() => setMediaTab(tab)}
                                    className={`px-5 py-2.5 text-xs font-semibold transition border-b-2 -mb-px ${
                                        mediaTab === tab
                                            ? 'border-[#C8A951] text-[#C8A951]'
                                            : 'border-transparent text-gray-500 hover:text-gray-300'
                                    }`}>
                                    {tab === 'gif' ? '🎭 Search GIFs' : '📸 Upload Image'}
                                </button>
                            ))}
                        </div>

                        {/* GIF search */}
                        {mediaTab === 'gif' && (
                            <div className="px-5 py-4 space-y-3">
                                <input
                                    type="text"
                                    value={gifQuery}
                                    onChange={e => setGifQuery(e.target.value)}
                                    placeholder="Search Giphy… (e.g. touchdown, trade, sad)"
                                    autoFocus
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60"
                                />
                                {gifError && <p className="text-red-400 text-xs">{gifError}</p>}
                                {gifSearching && (
                                    <p className="text-gray-600 text-xs">Searching…</p>
                                )}
                                {gifResults.length > 0 && (
                                    <div className="grid grid-cols-4 gap-2">
                                        {gifResults.map(gif => (
                                            <button
                                                key={gif.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedMedia({ url: gif.url, type: 'gif' });
                                                    setMediaTab(null);
                                                }}
                                                className="aspect-square rounded-lg overflow-hidden border border-transparent hover:border-[#C8A951]/60 transition focus:outline-none">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={gif.previewUrl} alt="gif" className="w-full h-full object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {!gifSearching && gifQuery && gifResults.length === 0 && (
                                    <p className="text-gray-600 text-xs">No results for &ldquo;{gifQuery}&rdquo;</p>
                                )}
                                {!gifQuery && (
                                    <p className="text-gray-700 text-xs">Type to search thousands of GIFs via Giphy.</p>
                                )}
                            </div>
                        )}

                        {/* Image upload */}
                        {mediaTab === 'upload' && (
                            <div className="px-5 py-4 space-y-3">
                                <div
                                    onClick={() => fileRef.current?.click()}
                                    className="border-2 border-dashed border-gray-700 hover:border-[#C8A951]/50 rounded-xl p-8 text-center cursor-pointer transition">
                                    <p className="text-gray-400 text-sm">
                                        Click to select an image
                                    </p>
                                    <p className="text-gray-700 text-xs mt-1">PNG, JPEG, GIF, WebP — max 5 MB</p>
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept="image/png,image/jpeg,image/gif,image/webp"
                                        className="hidden"
                                        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
                                    />
                                </div>
                                {uploadingImage && <p className="text-gray-500 text-xs text-center">Uploading…</p>}
                                {uploadError   && <p className="text-red-400 text-xs">{uploadError}</p>}
                            </div>
                        )}
                    </div>
                )}

                {/* Toolbar */}
                <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setMediaTab(t => t ? null : 'gif')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                mediaTab
                                    ? 'border-[#C8A951]/50 text-[#C8A951] bg-[#C8A951]/10'
                                    : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                            }`}>
                            <span>🖼️</span> Image / GIF
                        </button>
                        {body.length > 0 && (
                            <span className="text-gray-700 text-xs">{2000 - body.length} left</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {error && <p className="text-red-400 text-xs">{error}</p>}
                        <button
                            onClick={handlePost}
                            disabled={!canPost}
                            className="bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-5 py-2 rounded-lg text-sm transition disabled:opacity-40 disabled:cursor-not-allowed">
                            {isPending ? 'Posting…' : 'Post →'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Feed ──────────────────────────────────────────────────── */}
            {posts.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl py-12 text-center">
                    <p className="text-4xl mb-3">📣</p>
                    <p className="text-gray-500 text-sm">No announcements yet. Post your first one above.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {posts.map(post => (
                        <PostCard
                            key={post.id}
                            post={post}
                            duesId={duesId}
                            onPin={handlePin}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
