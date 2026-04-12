'use client';

import { useState, useRef, useTransition } from 'react';
import Image from 'next/image';

interface Author {
    name:  string | null;
    image: string | null;
}

interface Post {
    id:        string;
    body:      string;
    mediaUrl:  string | null;
    pinned:    boolean;
    createdAt: Date | string;
    author:    Author;
}

interface Props {
    duesId:    string;
    leagueName: string;
    initial:   Post[];
}

function timeAgo(date: Date | string): string {
    const diff = Date.now() - new Date(date).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins  <  1) return 'just now';
    if (mins  < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days  <  7) return `${days}d ago`;
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Returns true if the URL likely points to an image/GIF we can render inline. */
function isDirectMedia(url: string): boolean {
    try {
        const u = new URL(url);
        if (/\.(gif|jpg|jpeg|png|webp|svg)(\?.*)?$/i.test(u.pathname)) return true;
        if (u.hostname.includes('media.giphy.com')) return true;
        if (u.hostname.includes('media.tenor.com')) return true;
        if (u.hostname.includes('i.imgur.com')) return true;
        if (u.hostname.includes('cdn.discordapp.com')) return true;
    } catch { /* invalid URL */ }
    return false;
}

function MediaPreview({ url, alt = '' }: { url: string; alt?: string }) {
    const [errored, setErrored] = useState(false);
    if (errored) return (
        <a href={url} target="_blank" rel="noopener noreferrer"
            className="text-[#C8A951] text-xs hover:underline break-all">{url}</a>
    );
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt}
            onError={() => setErrored(true)}
            className="rounded-xl max-h-80 max-w-full object-contain bg-gray-800" />
    );
}

function PostCard({
    post, duesId, onPin, onDelete,
}: { post: Post; duesId: string; onPin: (id: string) => void; onDelete: (id: string) => void }) {
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
            {/* Header */}
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
                                <span className="text-[#C8A951] text-[10px] font-bold uppercase tracking-wide">
                                    📌 Pinned
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                {/* Actions */}
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
            <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{post.body}</p>

            {/* Media */}
            {post.mediaUrl && (
                <div className="mt-1">
                    {isDirectMedia(post.mediaUrl) ? (
                        <MediaPreview url={post.mediaUrl} alt="announcement media" />
                    ) : (
                        <a href={post.mediaUrl} target="_blank" rel="noopener noreferrer"
                            className="text-[#C8A951] text-xs hover:underline break-all">
                            {post.mediaUrl}
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}

export default function AnnouncementBoard({ duesId, leagueName, initial }: Props) {
    const [posts, setPosts]             = useState<Post[]>(initial);
    const [body, setBody]               = useState('');
    const [mediaUrl, setMediaUrl]       = useState('');
    const [showMedia, setShowMedia]     = useState(false);
    const [mediaPreview, setMediaPreview] = useState('');
    const [isPending, startTransition]  = useTransition();
    const [error, setError]             = useState('');
    const textareaRef                   = useRef<HTMLTextAreaElement>(null);

    function handleMediaInput(val: string) {
        setMediaUrl(val);
        // Normalise Giphy share links client-side for immediate preview
        let preview = val.trim();
        try {
            const u = new URL(preview);
            if (u.hostname === 'giphy.com') {
                const m = u.pathname.match(/\/gifs\/(?:[^/]+-)?([a-zA-Z0-9]+)\/?$/);
                if (m) preview = `https://media.giphy.com/media/${m[1]}/giphy.gif`;
            }
        } catch { /* not a URL yet */ }
        setMediaPreview(preview);
    }

    function handlePost() {
        if (!body.trim()) return;
        setError('');
        startTransition(async () => {
            const res = await fetch(`/api/dues/${duesId}/announcements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: body.trim(), mediaUrl: mediaUrl.trim() || undefined }),
            });
            const data = await res.json() as Post & { error?: string };
            if (!res.ok) { setError(data.error ?? 'Failed to post.'); return; }
            setPosts(prev => [data, ...prev]);
            setBody('');
            setMediaUrl('');
            setMediaPreview('');
            setShowMedia(false);
        });
    }

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

    return (
        <div className="space-y-4">
            {/* Compose */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-5 pt-5 pb-3 border-b border-gray-800">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">{leagueName}</p>
                    <textarea
                        ref={textareaRef}
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost(); }}
                        placeholder="Write an announcement… (Cmd+Enter to post)"
                        rows={3}
                        maxLength={2000}
                        className="w-full bg-transparent text-white text-sm placeholder-gray-600 resize-none focus:outline-none leading-relaxed"
                    />

                    {/* Media URL input */}
                    {showMedia && (
                        <div className="mt-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={mediaUrl}
                                    onChange={e => handleMediaInput(e.target.value)}
                                    placeholder="Paste image or GIF URL (Giphy, Tenor, Imgur, any direct link…)"
                                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60"
                                />
                                <button onClick={() => { setShowMedia(false); setMediaUrl(''); setMediaPreview(''); }}
                                    className="text-gray-600 hover:text-gray-400 text-lg leading-none px-1">×</button>
                            </div>
                            <p className="text-gray-700 text-xs">
                                Tip: on Giphy — find a GIF → share → copy link. On Tenor — right-click the GIF → copy image address.
                            </p>
                            {mediaPreview && (
                                <div className="mt-2">
                                    {isDirectMedia(mediaPreview) ? (
                                        <MediaPreview url={mediaPreview} alt="preview" />
                                    ) : (
                                        <p className="text-gray-600 text-xs italic">Preview not available — URL will be shown as a link.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Toolbar */}
                <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowMedia(v => !v)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                showMedia
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
                            disabled={isPending || !body.trim()}
                            className="bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-5 py-2 rounded-lg text-sm transition disabled:opacity-40 disabled:cursor-not-allowed">
                            {isPending ? 'Posting…' : 'Post →'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Feed */}
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
