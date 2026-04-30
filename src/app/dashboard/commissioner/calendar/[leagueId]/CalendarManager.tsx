'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarEvent {
    id:          string;
    title:       string;
    date:        string;
    endDate:     string | null;
    type:        string;
    description: string | null;
    allDay:      boolean;
}

export interface CalendarManagerProps {
    leagueId:   string;
    leagueName: string;
    initial:    CalendarEvent[];
}

type EventType = 'draft' | 'trade_deadline' | 'waiver_deadline' | 'regular_season_end' | 'playoff_start' | 'championship' | 'custom';

// ---------------------------------------------------------------------------
// Event metadata
// ---------------------------------------------------------------------------

const EVENT_META: Record<string, { label: string; icon: string; color: string; border: string }> = {
    draft:               { label: 'Draft',              icon: '📝', color: 'text-blue-400',   border: 'border-blue-800'   },
    trade_deadline:      { label: 'Trade Deadline',     icon: '🔒', color: 'text-red-400',    border: 'border-red-800'    },
    waiver_deadline:     { label: 'Waiver Deadline',    icon: '📋', color: 'text-yellow-400', border: 'border-yellow-800' },
    regular_season_end:  { label: 'Regular Season End', icon: '🏁', color: 'text-gray-400',   border: 'border-gray-700'   },
    playoff_start:       { label: 'Playoffs Begin',     icon: '🏆', color: 'text-[#C8A951]',  border: 'border-[#C8A951]/50' },
    championship:        { label: 'Championship',       icon: '🥇', color: 'text-[#C8A951]',  border: 'border-[#C8A951]/50' },
    custom:              { label: 'Custom Event',       icon: '📅', color: 'text-gray-300',   border: 'border-gray-700'   },
};

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
    { value: 'draft',              label: '📝 Draft'              },
    { value: 'trade_deadline',     label: '🔒 Trade Deadline'     },
    { value: 'waiver_deadline',    label: '📋 Waiver Deadline'    },
    { value: 'regular_season_end', label: '🏁 Regular Season End' },
    { value: 'playoff_start',      label: '🏆 Playoffs Begin'     },
    { value: 'championship',       label: '🥇 Championship'       },
    { value: 'custom',             label: '📅 Custom Event'       },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
}

function monthKey(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function isPast(iso: string): boolean {
    return new Date(iso) < new Date(new Date().toDateString());
}

function groupByMonth(events: CalendarEvent[]): [string, CalendarEvent[]][] {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
        const key = monthKey(e.date);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(e);
    }
    return Array.from(map.entries());
}

function toDateInputValue(iso: string): string {
    return iso.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Blank form state
// ---------------------------------------------------------------------------

interface FormState {
    title:       string;
    date:        string;
    type:        EventType;
    description: string;
}

function blankForm(): FormState {
    return { title: '', date: '', type: 'custom', description: '' };
}

// ---------------------------------------------------------------------------
// EventRow
// ---------------------------------------------------------------------------

function EventRow({ event, leagueId, onUpdate, onDelete }: {
    event:    CalendarEvent;
    leagueId: string;
    onUpdate: (e: CalendarEvent) => void;
    onDelete: (id: string) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [form, setForm]       = useState<FormState>({
        title:       event.title,
        date:        toDateInputValue(event.date),
        type:        event.type as EventType,
        description: event.description ?? '',
    });
    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState('');

    const meta    = EVENT_META[event.type] ?? EVENT_META.custom;
    const past    = isPast(event.date);

    async function handleSave() {
        if (!form.title.trim() || !form.date) return;
        setSaving(true);
        setError('');
        try {
            const res = await fetch(`/api/leagues/${leagueId}/calendar/${event.id}`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    title:       form.title.trim(),
                    date:        form.date,
                    type:        form.type,
                    description: form.description.trim() || null,
                }),
            });
            const data = await res.json() as CalendarEvent & { error?: string };
            if (!res.ok) { setError(data.error ?? 'Failed to save.'); return; }
            onUpdate(data);
            setEditing(false);
        } catch {
            setError('Something went wrong.');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!confirm(`Delete "${event.title}"?`)) return;
        await fetch(`/api/leagues/${leagueId}/calendar/${event.id}`, { method: 'DELETE' });
        onDelete(event.id);
    }

    if (editing) {
        return (
            <div className="px-5 py-4 bg-gray-800/40 border-b border-gray-800 last:border-0 space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                    <input
                        type="text"
                        value={form.title}
                        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                        placeholder="Event title"
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60"
                    />
                    <input
                        type="date"
                        value={form.date}
                        onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#C8A951]/60"
                    />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                    <select
                        value={form.type}
                        onChange={e => setForm(f => ({ ...f, type: e.target.value as EventType }))}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#C8A951]/60">
                        {EVENT_TYPE_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Notes (optional)"
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60"
                    />
                </div>
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <div className="flex items-center gap-2">
                    <button onClick={handleSave} disabled={saving || !form.title.trim() || !form.date}
                        className="bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-4 py-1.5 rounded-lg text-sm transition disabled:opacity-40">
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setEditing(false)}
                        className="text-gray-500 hover:text-gray-300 text-sm transition">
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`px-5 py-4 flex items-start gap-4 border-b border-gray-800 last:border-0 group transition ${past ? 'opacity-50' : ''}`}>
            {/* Date badge */}
            <div className="shrink-0 w-12 text-center">
                <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">
                    {new Date(event.date).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}
                </p>
                <p className="text-xl font-extrabold text-white leading-none">
                    {new Date(event.date).getUTCDate()}
                </p>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm">{meta.icon}</span>
                    <p className="text-white text-sm font-semibold">{event.title}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${meta.color}`}>
                        {meta.label}
                    </span>
                    {past && (
                        <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Past</span>
                    )}
                </div>
                {event.description && (
                    <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{event.description}</p>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                <button onClick={() => setEditing(true)}
                    className="p-1.5 rounded-lg text-gray-600 hover:text-[#C8A951] hover:bg-[#C8A951]/10 transition text-sm">
                    ✏️
                </button>
                <button onClick={handleDelete}
                    className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition text-sm">
                    🗑️
                </button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// AddEventForm
// ---------------------------------------------------------------------------

function AddEventForm({ leagueId, onAdd, onClose }: {
    leagueId: string;
    onAdd:    (e: CalendarEvent) => void;
    onClose:  () => void;
}) {
    const [form, setForm]   = useState<FormState>(blankForm());
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    async function handleSubmit(ev: React.FormEvent) {
        ev.preventDefault();
        if (!form.title.trim() || !form.date) return;
        setSaving(true);
        setError('');
        try {
            const res = await fetch(`/api/leagues/${leagueId}/calendar`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    title:       form.title.trim(),
                    date:        form.date,
                    type:        form.type,
                    description: form.description.trim() || null,
                    allDay:      true,
                }),
            });
            const data = await res.json() as CalendarEvent & { error?: string };
            if (!res.ok) { setError(data.error ?? 'Failed to add.'); return; }
            onAdd(data);
            setForm(blankForm());
        } catch {
            setError('Something went wrong.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="bg-gray-800/30 border-b border-gray-800 px-5 py-4 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">New Event</p>
            <div className="grid sm:grid-cols-2 gap-3">
                <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Event title"
                    required
                    autoFocus
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60"
                />
                <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    required
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#C8A951]/60"
                />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
                <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as EventType }))}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#C8A951]/60">
                    {EVENT_TYPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
                <input
                    type="text"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Notes (optional)"
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#C8A951]/60"
                />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex items-center gap-2">
                <button type="submit" disabled={saving || !form.title.trim() || !form.date}
                    className="bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-5 py-2 rounded-lg text-sm transition disabled:opacity-40">
                    {saving ? 'Adding…' : 'Add Event'}
                </button>
                <button type="button" onClick={onClose}
                    className="text-gray-500 hover:text-gray-300 text-sm transition">
                    Cancel
                </button>
            </div>
        </form>
    );
}

// ---------------------------------------------------------------------------
// CalendarManager
// ---------------------------------------------------------------------------

export default function CalendarManager({ leagueId, leagueName, initial }: CalendarManagerProps) {
    const [events, setEvents]       = useState<CalendarEvent[]>(
        [...initial].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    );
    const [showAddForm, setShowAddForm] = useState(false);

    function handleAdd(e: CalendarEvent) {
        setEvents(prev =>
            [...prev, e].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        );
        setShowAddForm(false);
    }

    function handleUpdate(updated: CalendarEvent) {
        setEvents(prev =>
            prev.map(e => e.id === updated.id ? updated : e)
               .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        );
    }

    function handleDelete(id: string) {
        setEvents(prev => prev.filter(e => e.id !== id));
    }

    const upcomingEvents = events.filter(e => !isPast(e.date));
    const pastEvents     = events.filter(e => isPast(e.date));
    const grouped        = groupByMonth(events);

    return (
        <div className="space-y-6">

            {/* Quick stats strip */}
            {events.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-white">{events.length}</p>
                        <p className="text-gray-500 text-xs mt-0.5">Total Events</p>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-[#C8A951]">{upcomingEvents.length}</p>
                        <p className="text-gray-500 text-xs mt-0.5">Upcoming</p>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-gray-500">{pastEvents.length}</p>
                        <p className="text-gray-500 text-xs mt-0.5">Past</p>
                    </div>
                </div>
            )}

            {/* Main card */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                {/* Card header */}
                <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between gap-4">
                    <div>
                        <h2 className="font-bold">{leagueName}</h2>
                        <p className="text-gray-500 text-xs mt-0.5">
                            {events.length === 0 ? 'No events yet' : `${events.length} event${events.length !== 1 ? 's' : ''}`}
                        </p>
                    </div>
                    {!showAddForm && (
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-4 py-2 rounded-lg text-sm transition">
                            + Add Event
                        </button>
                    )}
                </div>

                {/* Add form */}
                {showAddForm && (
                    <AddEventForm
                        leagueId={leagueId}
                        onAdd={handleAdd}
                        onClose={() => setShowAddForm(false)}
                    />
                )}

                {/* Event list */}
                {events.length === 0 ? (
                    <div className="px-5 py-16 text-center space-y-3">
                        <p className="text-4xl">📅</p>
                        <p className="text-gray-400 text-sm">No events yet.</p>
                        <p className="text-gray-600 text-xs max-w-xs mx-auto">
                            Add trade deadlines, draft dates, playoff schedules — anything your league needs to track.
                        </p>
                        {!showAddForm && (
                            <button
                                onClick={() => setShowAddForm(true)}
                                className="inline-block border border-gray-700 hover:border-[#C8A951]/50 text-gray-300 font-semibold px-4 py-2 rounded-lg text-sm transition">
                                Add First Event
                            </button>
                        )}
                    </div>
                ) : (
                    grouped.map(([month, monthEvents]) => (
                        <div key={month}>
                            <div className="px-5 py-2 bg-gray-800/30 border-b border-gray-800">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{month}</p>
                            </div>
                            {monthEvents.map(event => (
                                <EventRow
                                    key={event.id}
                                    event={event}
                                    leagueId={leagueId}
                                    onUpdate={handleUpdate}
                                    onDelete={handleDelete}
                                />
                            ))}
                        </div>
                    ))
                )}
            </div>

            {/* Legend */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Event Types</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {EVENT_TYPE_OPTIONS.map(o => {
                        const meta = EVENT_META[o.value];
                        return (
                            <div key={o.value} className="flex items-center gap-2">
                                <span className="text-sm shrink-0">{meta.icon}</span>
                                <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
