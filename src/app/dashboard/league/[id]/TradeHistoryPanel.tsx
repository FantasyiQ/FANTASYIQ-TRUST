'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

interface TradeItem {
    type:               'player' | 'pick';
    playerId?:          string;
    name?:              string;
    position?:          string | null;
    season?:            string;
    round?:             number;
    originalOwnerName?: string;
}

interface TradeSide {
    rosterId:    number;
    displayName: string;
    avatar:      string | null;
    received:    TradeItem[];
}

interface Trade {
    transactionId: string;
    date:          number;
    sides:         TradeSide[];
}

const POS_COLORS: Record<string, string> = {
    QB: 'bg-red-900/40 text-red-300 border-red-800',
    RB: 'bg-green-900/40 text-green-300 border-green-800',
    WR: 'bg-blue-900/40 text-blue-300 border-blue-800',
    TE: 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
};

function Avatar({ avatar, name }: { avatar: string | null; name: string }) {
    if (avatar) {
        return (
            <Image
                src={`https://sleepercdn.com/avatars/thumbs/${avatar}`}
                alt={name}
                width={28}
                height={28}
                className="rounded-full shrink-0"
            />
        );
    }
    return (
        <div className="w-7 h-7 rounded-full bg-gray-800 shrink-0 flex items-center justify-center text-xs font-bold text-gray-500">
            {name[0]?.toUpperCase() ?? '?'}
        </div>
    );
}

function ItemChip({ item }: { item: TradeItem }) {
    if (item.type === 'pick') {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="px-1.5 py-px rounded text-[10px] font-bold border bg-indigo-900/40 text-indigo-300 border-indigo-700">
                    {item.season} R{item.round}
                </span>
                {item.originalOwnerName && (
                    <span className="text-gray-500">from {item.originalOwnerName}</span>
                )}
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-white">
            {item.position && (
                <span className={`px-1.5 py-px rounded text-[10px] font-bold border ${POS_COLORS[item.position] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                    {item.position}
                </span>
            )}
            {item.name ?? item.playerId}
        </span>
    );
}

function TradeCard({ trade }: { trade: Trade }) {
    const date = new Date(trade.date);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
            <p className="text-gray-600 text-xs">{dateStr}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {trade.sides.map(side => (
                    <div key={side.rosterId} className="bg-gray-800/40 rounded-xl p-3 space-y-2">
                        <div className="flex items-center gap-2">
                            <Avatar avatar={side.avatar} name={side.displayName} />
                            <span className="text-sm font-semibold text-white truncate">{side.displayName}</span>
                            <span className="text-gray-600 text-xs ml-auto shrink-0">received</span>
                        </div>
                        {side.received.length === 0 ? (
                            <p className="text-gray-600 text-xs italic">Nothing</p>
                        ) : (
                            <div className="space-y-1.5">
                                {side.received.map((item, i) => (
                                    <div key={i}>
                                        <ItemChip item={item} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function TradeHistoryPanel({ leagueId }: { leagueId: string }) {
    const [trades, setTrades]   = useState<Trade[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [search, setSearch]   = useState('');

    useEffect(() => {
        fetch(`/api/leagues/${leagueId}/trade-history`)
            .then(r => r.json())
            .then((data: { trades: Trade[] }) => setTrades(data.trades ?? []))
            .catch(() => setError('Failed to load trade history.'))
            .finally(() => setLoading(false));
    }, [leagueId]);

    const filtered = search.trim()
        ? trades.filter(t =>
            t.sides.some(s =>
                s.displayName.toLowerCase().includes(search.toLowerCase()) ||
                s.received.some(item => item.name?.toLowerCase().includes(search.toLowerCase()))
            )
        )
        : trades;

    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map(i => (
                    <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl h-28 animate-pulse" />
                ))}
            </div>
        );
    }

    if (error) {
        return <p className="text-red-400 text-sm">{error}</p>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <p className="text-gray-500 text-sm">{trades.length} trades all-time</p>
                <input
                    type="text"
                    placeholder="Search by team or player…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 w-full sm:w-64"
                />
            </div>

            {filtered.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                    <p className="text-gray-500 text-sm">{search ? 'No trades match your search.' : 'No trades yet this season.'}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map(t => <TradeCard key={t.transactionId} trade={t} />)}
                </div>
            )}
        </div>
    );
}
