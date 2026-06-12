'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { type FAQItem } from '@/lib/support/faqs';
import { useSupportContext } from '@/lib/support/SupportContextStore';
import { generateAssistantReply, getContextHint } from '@/lib/support/assistantEngine';

// ── Types ──────────────────────────────────────────────────────────────────────

type Message = {
    role:    'user' | 'assistant';
    content: string;
    faq?:    FAQItem | null;
};

// ── Chat panel ────────────────────────────────────────────────────────────────

function SupportAssistantPanel({ onClose }: { onClose: () => void }) {
    const context = useSupportContext();
    const hint    = getContextHint(context);

    const [messages, setMessages] = useState<Message[]>([
        {
            role:    'assistant',
            content: 'Hi! Ask me anything about FantasyiQ Trust — PRS, draft reports, DTV, playoff settings, or commissioner tools.',
            faq:     null,
        },
    ]);
    const [input,   setInput]   = useState('');
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    function handleSend() {
        const text = input.trim();
        if (!text || loading) return;

        const userMsg: Message = { role: 'user', content: text, faq: null };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        // Brief thinking delay, then context-aware response
        setTimeout(() => {
            const { content, faq } = generateAssistantReply(text, context);
            setMessages(prev => [...prev, { role: 'assistant', content, faq }]);
            setLoading(false);
        }, 400);
    }

    function handleKey(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    }

    return (
        <div
            className="fixed bottom-28 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] max-w-sm flex flex-col bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden"
            style={{ maxHeight: 'min(520px, calc(100vh - 170px))' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">💬</span>
                    <div className="min-w-0">
                        <p className="text-white text-sm font-semibold leading-none">FiQ Assistant</p>
                        {hint ? (
                            <p className="text-[#D4AF37]/60 text-[10px] mt-0.5 truncate">{hint}</p>
                        ) : (
                            <p className="text-gray-600 text-[10px] mt-0.5">Support · FAQ-powered</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Link
                        href="/support"
                        className="text-[10px] text-gray-500 hover:text-[#D4AF37] transition"
                        onClick={onClose}
                    >
                        Browse FAQs →
                    </Link>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-600 hover:text-white transition p-1"
                        aria-label="Close assistant"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] space-y-1.5 flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                                msg.role === 'user'
                                    ? 'bg-[#D4AF37] text-black font-medium rounded-br-sm'
                                    : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                            }`}>
                                {msg.content}
                            </div>
                            {/* FAQ link for assistant messages */}
                            {msg.role === 'assistant' && msg.faq && (
                                <Link
                                    href={`/support#faq-${msg.faq.category}`}
                                    className="text-[10px] text-[#D4AF37]/70 hover:text-[#D4AF37] transition ml-1"
                                >
                                    See full answer in Support Center →
                                </Link>
                            )}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                            {[0, 1, 2].map(i => (
                                <span
                                    key={i}
                                    className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"
                                    style={{ animationDelay: `${i * 0.15}s` }}
                                />
                            ))}
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-800 px-3 py-3 shrink-0">
                <div className="flex items-end gap-2">
                    <textarea
                        rows={1}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKey}
                        placeholder="Ask a question…"
                        aria-label="Ask FiQ Support a question"
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37]/50 resize-none leading-relaxed"
                        style={{ maxHeight: 80 }}
                    />
                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={!input.trim() || loading}
                        className="shrink-0 w-8 h-8 rounded-xl bg-[#D4AF37] text-black flex items-center justify-center hover:bg-[#BF9D2F] transition disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Send"
                    >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
                <p className="text-[10px] text-gray-700 mt-1.5 text-center">
                    Powered by FAQ matching · <Link href="/support" className="hover:text-gray-500 transition">Browse full Support Center</Link>
                </p>
            </div>
        </div>
    );
}

// ── Launcher button ───────────────────────────────────────────────────────────

export default function SupportAssistantLauncher() {
    const [open, setOpen] = useState(false);

    // Listen for the custom event fired from the Support Center teaser button
    useEffect(() => {
        const handler = () => setOpen(true);
        window.addEventListener('fiq:open-assistant', handler);
        return () => window.removeEventListener('fiq:open-assistant', handler);
    }, []);

    return (
        <>
            {open && <SupportAssistantPanel onClose={() => setOpen(false)} />}

            {/* Floating launcher button */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-label="Open FiQ Support Assistant"
                className={`fixed bottom-16 right-4 sm:right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all duration-200 ${
                    open
                        ? 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-white'
                        : 'bg-[#D4AF37] text-black hover:bg-[#BF9D2F]'
                }`}
            >
                {open ? (
                    <>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span className="text-xs font-semibold">Close</span>
                    </>
                ) : (
                    <>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        <span className="text-xs font-bold normal-case">FiQ Help</span>
                    </>
                )}
            </button>
        </>
    );
}
