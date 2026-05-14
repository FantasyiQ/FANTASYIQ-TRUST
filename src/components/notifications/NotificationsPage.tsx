'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

interface NotificationItem {
  id:        string;
  type:      string;
  title:     string;
  body:      string;
  data:      Record<string, unknown> | null;
  read:      boolean;
  readAt:    string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  'dues.reminder.weekly':               'Dues',
  'dues.reminder.three_per_week':       'Dues',
  'dues.reminder.daily':                'Dues',
  'dues.reminder.final_hours':          'Urgent',
  'dues.payment.confirmed':             'Payment',
  'dues.payment.manual_recorded':       'Payment',
  'dues.payment.removed':               'Payment',
  'dues.updated':                       'Dues',
  'member.joined_league':               'Member',
  'member.linked_to_dues_slot':         'Member',
  'member.not_enrolled_warning':        'Warning',
  'payouts.released':                   'Payouts',
  'payout.failed':                      'Alert',
  'commissioner.alert.sync_failed':     'Alert',
  'commissioner.alert.payout_account_missing': 'Alert',
  'commissioner.alert.unpaid_members_digest':  'Digest',
  'league.digest.weekly':               'Digest',
  'season.draft_reminder':              'Season',
  'season.playoffs_released':           'Season',
  'season.championship_week':           'Season',
  'season.final_recap':                 'Season',
  'plan.limit_reached':                 'Plan',
  'plan.renewal_upcoming':              'Plan',
  'plan.payment_failed':                'Plan',
  'invite.progress':                    'Invite',
  'invite.reminder':                    'Invite',
  'identity.needs_confirmation':        'Account',
};

const TYPE_COLORS: Record<string, string> = {
  'Urgent': '#ef4444',
  'Alert':  '#f97316',
  'Dues':   '#D4AF37',
  'Payment':'#22c55e',
  'Payouts':'#22c55e',
  'Digest': '#8b5cf6',
  'Member': '#3b82f6',
  'Season': '#06b6d4',
  'Plan':   '#ec4899',
  'Invite': '#a78bfa',
  'Account':'#64748b',
  'Warning':'#f97316',
};

function typeIcon(type: string): string {
  if (type.startsWith('dues'))                                   return '💰';
  if (type.startsWith('payouts') || type.startsWith('payout'))  return '🏆';
  if (type.startsWith('commissioner.alert'))                     return '🔔';
  if (type.startsWith('member') || type.startsWith('invite') || type.startsWith('identity')) return '👤';
  if (type.startsWith('season'))                                 return '📅';
  if (type.startsWith('plan'))                                   return '⚙️';
  if (type.startsWith('league.digest'))                          return '📊';
  return '🔔';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1)  return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)   return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30)    return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function TypeBadge({ type }: { type: string }) {
  const label = TYPE_LABELS[type] ?? 'Info';
  const color = TYPE_COLORS[label] ?? '#6b7280';
  return (
    <span style={{
      display:      'inline-block',
      padding:      '2px 8px',
      borderRadius: '999px',
      fontSize:     '11px',
      fontWeight:   700,
      background:   `${color}20`,
      color,
      border:       `1px solid ${color}40`,
      whiteSpace:   'nowrap',
    }}>
      {label}
    </span>
  );
}

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [total, setTotal]                 = useState(0);
  const [loading, setLoading]             = useState(true);
  const [loadingMore, setLoadingMore]     = useState(false);
  const offset                            = useRef(0);

  const fetchPage = useCallback(async (off: number, append = false) => {
    try {
      const res = await fetch(`/api/notifications?offset=${off}&limit=${PAGE_SIZE}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as {
        notifications: NotificationItem[];
        unreadCount:   number;
        total:         number;
      };
      setNotifications(prev => append ? [...prev, ...data.notifications] : data.notifications);
      setUnreadCount(data.unreadCount ?? 0);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    offset.current = 0;
    fetchPage(0);
    // Auto-mark all as read when the page is visited
    fetch('/api/notifications', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'read-all' }),
    }).catch(() => {});
  }, [fetchPage]);

  async function loadMore() {
    setLoadingMore(true);
    const next = offset.current + PAGE_SIZE;
    offset.current = next;
    await fetchPage(next, true);
  }

  async function handleMarkAllRead() {
    await fetch('/api/notifications', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'read-all' }),
    });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  async function handleMarkRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' }).catch(() => {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => {
      const n = notifications.find(x => x.id === id);
      return n && !n.read ? Math.max(0, prev - 1) : prev;
    });
  }

  async function handleDismiss(id: string) {
    await fetch(`/api/notifications/${id}`, { method: 'DELETE' }).catch(() => {});
    const removed = notifications.find(n => n.id === id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    setTotal(t => t - 1);
    if (removed && !removed.read) setUnreadCount(prev => Math.max(0, prev - 1));
  }

  const hasMore = notifications.length < total;

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 16px' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', gap: '16px' }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 700, margin: 0 }}>Notifications</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px' }}>
            <a href="/dashboard/notifications/preferences" style={{ color: '#D4AF37', fontSize: '12px', textDecoration: 'none' }}>
              Preferences →
            </a>
            {total > 0 && (
              <span style={{ color: '#6b7280', fontSize: '12px' }}>
                {total} total{unreadCount > 0 ? ` · ${unreadCount} unread` : ''}
              </span>
            )}
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            style={{
              flexShrink:   0,
              background:   'transparent',
              border:       '1px solid #374151',
              color:        '#D4AF37',
              padding:      '8px 16px',
              borderRadius: '8px',
              cursor:       'pointer',
              fontSize:     '13px',
              fontWeight:   600,
            }}
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#6b7280', padding: '48px 0' }}>Loading…</div>
      ) : notifications.length === 0 ? (
        <div style={{
          textAlign:    'center',
          color:        '#6b7280',
          padding:      '64px 16px',
          background:   '#111827',
          borderRadius: '12px',
          border:       '1px solid #1f2937',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px' }}>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <p style={{ margin: 0, fontSize: '15px' }}>You&apos;re all caught up!</p>
        </div>
      ) : (
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', overflow: 'hidden' }}>
          {notifications.map((n, i) => (
            <div
              key={n.id}
              style={{
                display:      'flex',
                alignItems:   'flex-start',
                gap:          '12px',
                padding:      '16px',
                borderBottom: i < notifications.length - 1 ? '1px solid #1f2937' : 'none',
                background:   n.read ? 'transparent' : 'rgba(212,175,55,0.03)',
              }}
            >
              {/* Icon + unread dot */}
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', paddingTop: '2px' }}>
                <span style={{ fontSize: '16px', lineHeight: 1 }}>{typeIcon(n.type)}</span>
                <div style={{
                  width:        '6px',
                  height:       '6px',
                  borderRadius: '50%',
                  background:   n.read ? 'transparent' : '#D4AF37',
                  border:       n.read ? '1px solid #374151' : 'none',
                }} />
              </div>

              {/* Main content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <TypeBadge type={n.type} />
                  <span style={{ color: '#6b7280', fontSize: '11px' }}>{timeAgo(n.createdAt)}</span>
                </div>
                <p style={{
                  margin:     '0 0 4px',
                  color:      n.read ? '#d1d5db' : '#fff',
                  fontSize:   '14px',
                  fontWeight: n.read ? 400 : 600,
                }}>
                  {n.title}
                </p>
                <p style={{ margin: 0, color: '#9ca3af', fontSize: '13px', lineHeight: '1.5' }}>
                  {n.body}
                </p>
              </div>

              {/* Actions */}
              <div style={{ flexShrink: 0, display: 'flex', gap: '6px', alignItems: 'center' }}>
                {!n.read && (
                  <button
                    onClick={() => handleMarkRead(n.id)}
                    title="Mark as read"
                    style={{
                      background:   'none',
                      border:       '1px solid #374151',
                      borderRadius: '6px',
                      color:        '#9ca3af',
                      cursor:       'pointer',
                      padding:      '4px 8px',
                      fontSize:     '11px',
                    }}
                  >
                    Read
                  </button>
                )}
                <button
                  onClick={() => handleDismiss(n.id)}
                  title="Dismiss"
                  style={{
                    background: 'none',
                    border:     'none',
                    color:      '#6b7280',
                    cursor:     'pointer',
                    fontSize:   '18px',
                    lineHeight: 1,
                    padding:    '2px',
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <div style={{ padding: '14px', textAlign: 'center', borderTop: '1px solid #1f2937' }}>
              <button
                onClick={loadMore}
                disabled={loadingMore}
                style={{
                  background:   'none',
                  border:       '1px solid #374151',
                  color:        '#D4AF37',
                  padding:      '8px 24px',
                  borderRadius: '8px',
                  cursor:       loadingMore ? 'default' : 'pointer',
                  fontSize:     '13px',
                  fontWeight:   600,
                  opacity:      loadingMore ? 0.5 : 1,
                }}
              >
                {loadingMore ? 'Loading…' : `Load more (${total - notifications.length} remaining)`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
