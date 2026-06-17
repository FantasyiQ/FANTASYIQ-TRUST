'use client';

import { useState, useId } from 'react';
import Link from 'next/link';
import { FAQ_ITEMS, CATEGORIES, searchFAQs, type FAQCategoryId, type FAQItem } from '@/lib/support/faqs';

// ── FAQ accordion item ────────────────────────────────────────────────────────

function FAQAccordion({ item }: { item: FAQItem }) {
    const [open, setOpen] = useState(false);
    return (
        <div className={`border-b border-gray-800 last:border-0 transition-colors ${open ? 'bg-gray-800/20' : ''}`}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className="w-full text-left px-5 py-4 flex items-start justify-between gap-4 group"
            >
                <span className="text-white text-sm font-medium leading-snug group-hover:text-[#D4AF37] transition-colors">
                    {item.question}
                </span>
                <svg
                    className={`w-4 h-4 text-gray-500 shrink-0 mt-0.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <div className="px-5 pb-4 -mt-1">
                    <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-line">{item.answer}</p>
                </div>
            )}
        </div>
    );
}

// ── Category section ──────────────────────────────────────────────────────────

function FAQSection({ categoryId, items }: { categoryId: FAQCategoryId; items: FAQItem[] }) {
    const cat = CATEGORIES.find(c => c.id === categoryId);
    if (!cat || items.length === 0) return null;
    return (
        <div id={`faq-${categoryId}`} className="scroll-mt-24">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{cat.icon}</span>
                <h2 className="text-base font-bold text-white">{cat.label}</h2>
                <span className="text-[10px] text-gray-600 font-medium ml-1">{items.length} articles</span>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                {items.map(item => <FAQAccordion key={item.id} item={item} />)}
            </div>
        </div>
    );
}

// ── Category nav pill ─────────────────────────────────────────────────────────

function CategoryNav({ activeId, onSelect }: {
    activeId: FAQCategoryId | null;
    onSelect: (id: FAQCategoryId) => void;
}) {
    return (
        <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => (
                <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                        onSelect(cat.id);
                        document.getElementById(`faq-${cat.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                        activeId === cat.id
                            ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#D4AF37]'
                            : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600 hover:text-white'
                    }`}
                >
                    <span>{cat.icon}</span>
                    {cat.label}
                </button>
            ))}
        </div>
    );
}

// ── Search results ────────────────────────────────────────────────────────────

function SearchResults({ query, results }: { query: string; results: FAQItem[] }) {
    return (
        <div className="space-y-4">
            <p className="text-gray-500 text-sm">
                {results.length > 0
                    ? `${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`
                    : `No results for "${query}" — try a different search or browse categories below.`}
            </p>
            {results.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    {results.map(item => <FAQAccordion key={item.id} item={item} />)}
                </div>
            )}
        </div>
    );
}

// ── Main SupportCenter ────────────────────────────────────────────────────────

export default function SupportCenter() {
    const [query,    setQuery]    = useState('');
    const [activeId, setActiveId] = useState<FAQCategoryId | null>(null);
    const inputId = useId();

    const searchResults  = query.trim().length >= 2 ? searchFAQs(query) : [];
    const showSearch     = query.trim().length >= 2;

    // Group items by category
    const byCategory = CATEGORIES.map(cat => ({
        cat,
        items: FAQ_ITEMS.filter(f => f.category === cat.id),
    }));

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-20 px-4">
            <div className="max-w-3xl mx-auto space-y-10">

                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="text-center space-y-3">
                    <p className="text-[10px] font-bold tracking-widest text-gray-500 normal-case">FantasyiQ Trust</p>
                    <h1 className="text-3xl font-extrabold">Support Center</h1>
                    <p className="text-gray-400 text-sm max-w-md mx-auto">
                        Find answers, learn how FantasyiQ Trust works, or chat with our AI assistant.
                    </p>
                </div>

                {/* ── Search ─────────────────────────────────────────────── */}
                <div className="relative">
                    <label htmlFor={inputId} className="sr-only">Search FAQs</label>
                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <circle cx="11" cy="11" r="8" />
                        <path strokeLinecap="round" d="m21 21-4.35-4.35" />
                    </svg>
                    <input
                        id={inputId}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search FAQs — try 'DSS', 'playoff', 'ESPN'…"
                        className="w-full bg-gray-900 border border-gray-700 rounded-2xl pl-11 pr-4 py-3.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#D4AF37]/50 focus:ring-1 focus:ring-[#D4AF37]/20 transition"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition"
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* ── Category nav ───────────────────────────────────────── */}
                {!showSearch && (
                    <CategoryNav activeId={activeId} onSelect={setActiveId} />
                )}

                {/* ── Search results / FAQ sections ──────────────────────── */}
                {showSearch ? (
                    <SearchResults query={query} results={searchResults} />
                ) : (
                    <div className="space-y-8">
                        {byCategory.map(({ cat, items }) => (
                            <FAQSection key={cat.id} categoryId={cat.id} items={items} />
                        ))}
                    </div>
                )}

                {/* ── AI Assistant teaser ─────────────────────────────────── */}
                <div className="bg-gray-900 border border-[#D4AF37]/20 rounded-2xl p-6 flex items-start gap-5">
                    <div className="shrink-0 w-10 h-10 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-lg">
                        💬
                    </div>
                    <div className="flex-1">
                        <p className="font-semibold text-white text-sm">Still need help?</p>
                        <p className="text-gray-500 text-xs mt-1 mb-3">
                            Our FiQ Support Assistant can answer questions about DSS, draft reports, DTV, playoff settings, and commissioner tools — right from any page.
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                // Trigger global launcher
                                window.dispatchEvent(new CustomEvent('fiq:open-assistant'));
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-[#D4AF37] text-black text-xs font-bold rounded-lg hover:bg-[#BF9D2F] transition"
                        >
                            Open FiQ Assistant
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Footer nav ─────────────────────────────────────────── */}
                <div className="text-center text-gray-700 text-xs space-x-4">
                    <Link href="/dashboard" className="hover:text-gray-400 transition">Dashboard</Link>
                    <span>·</span>
                    <Link href="/pricing" className="hover:text-gray-400 transition">Pricing</Link>
                    <span>·</span>
                    <Link href="/privacy" className="hover:text-gray-400 transition">Privacy</Link>
                </div>

            </div>
        </main>
    );
}
