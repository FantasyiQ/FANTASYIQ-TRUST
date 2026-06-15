'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getPusherClient, userChannel } from '@/lib/pusher';

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

function typeIcon(type: string): string {
  if (type.startsWith('dues'))                         return '💰';
  if (type.startsWith('payouts') || type.startsWith('payout')) return '🏆';
  if (type.startsWith('commissioner.alert'))           return '🔔';
  if (type.startsWith('member') || type.startsWith('invite') || type.startsWith('identity')) return '👤';
  if (type.startsWith('season'))                       return '📅';
  if (type.startsWith('plan'))                         return '⚙️';
  if (type.startsWith('league.digest'))                return '📊';
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
  return `${days}d ago`;
}

export default function NotificationBell({ userId }: { userId?: string }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [open, setOpen]                   = useState(false);
  const [loading, setLoading]             = useState(false);
  const containerRef                      = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as { notifications: NotificationItem[]; unreadCount: number };
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // network error — silently ignore
    }
  }, []);

  // Initial fetch + 60-second polling fallback
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Pusher real-time subscription (when configured + userId available)
  useEffect(() => {
    if (!userId) return;
    const pusher  = getPusherClient();
    if (!pusher)  return;

    const channel = pusher.subscribe(userChannel(userId));
    channel.bind('notification', (incoming: NotificationItem) => {
      setNotifications(prev => {
        if (prev.some(n => n.id === incoming.id)) return prev;
        return [incoming, ...prev];
      });
      setUnreadCount(c => c + 1);
    });
    return () => { pusher.unsubscribe(userChannel(userId)); };
  }, [userId]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function markAllReadOnOpen() {
    if (unreadCount === 0) return;
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read-all' }),
      });
      if (!res.ok) return;
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // silently ignore
    }
  }

  async function handleMarkAllRead() {
    setLoading(true);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read-all' }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }

  async function handleClickNotification(n: NotificationItem) {
    // Mark as read
    if (!n.read) {
      await fetch(`/api/notifications/${n.id}`, { method: 'PATCH' }).catch(() => {});
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    // Navigate to specific league or fall back to notifications page
    if (n.data?.leagueId && typeof n.data.leagueId === 'string') {
      router.push(`/dashboard/league/${n.data.leagueId}`);
    } else {
      router.push('/dashboard/notifications');
    }
    setOpen(false);
  }

  async function handleDismiss(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await fetch(`/api/notifications/${id}`, { method: 'DELETE' }).catch(() => {});
    setNotifications(prev => prev.filter(n => n.id !== id));
    setUnreadCount(prev => {
      const removed = notifications.find(n => n.id === id);
      return removed && !removed.read ? Math.max(0, prev - 1) : prev;
    });
  }

  const preview = notifications.slice(0, 8);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Bell animation keyframes */}
      {unreadCount > 0 && (
        <style>{`
          @keyframes bell-ring {
            0%,100% { transform: rotate(0deg); }
            10%      { transform: rotate(14deg); }
            20%      { transform: rotate(-12deg); }
            30%      { transform: rotate(10deg); }
            40%      { transform: rotate(-8deg); }
            50%      { transform: rotate(6deg); }
            60%      { transform: rotate(-4deg); }
            70%      { transform: rotate(2deg); }
            80%      { transform: rotate(-1deg); }
          }
          .bell-ring { animation: bell-ring 2.5s ease-in-out 0.5s 3; transform-origin: top center; }
        `}</style>
      )}

      {/* Bell button */}
      <button
        onClick={() => {
          const willOpen = !open;
          setOpen(willOpen);
          if (willOpen) markAllReadOnOpen();
        }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        style={{
          position:        'relative',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          width:           '36px',
          height:          '36px',
          borderRadius:    '8px',
          background:      open ? '#1f2937' : unreadCount > 0 ? 'rgba(212,175,55,0.1)' : 'transparent',
          border:          unreadCount > 0 ? '1px solid rgba(212,175,55,0.3)' : '1px solid transparent',
          cursor:          'pointer',
          color:           unreadCount > 0 ? '#D4AF37' : '#d1d5db',
          transition:      'background 0.15s, color 0.15s, border-color 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#1f2937'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = open ? '#1f2937' : unreadCount > 0 ? 'rgba(212,175,55,0.1)' : 'transparent'; }}
      >
        {/* Bell SVG */}
        <svg
          width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={unreadCount > 0 ? 'bell-ring' : ''}
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span style={{
            position:        'absolute',
            top:             '-4px',
            right:           '-4px',
            minWidth:        '18px',
            height:          '18px',
            padding:         '0 4px',
            borderRadius:    '999px',
            background:      '#ef4444',
            color:           '#fff',
            fontSize:        '10px',
            fontWeight:      '700',
            lineHeight:      '18px',
            textAlign:       'center',
            border:          '2px solid #030712',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position:        'absolute',
          top:             'calc(100% + 8px)',
          right:           '0',
          width:           '340px',
          maxHeight:       '480px',
          overflowY:       'auto',
          background:      '#111827',
          border:          '1px solid #1f2937',
          borderRadius:    '12px',
          boxShadow:       '0 20px 40px rgba(0,0,0,0.6)',
          zIndex:          50,
        }}>
          {/* Header */}
          <div style={{
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'space-between',
            padding:         '14px 16px 12px',
            borderBottom:    '1px solid #1f2937',
          }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={loading}
                style={{
                  background:  'none',
                  border:      'none',
                  cursor:      'pointer',
                  color:       '#D4AF37',
                  fontSize:    '12px',
                  fontWeight:  600,
                  opacity:     loading ? 0.5 : 1,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          {preview.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
              No notifications
            </div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {preview.map(n => (
                <li
                  key={n.id}
                  onClick={() => handleClickNotification(n)}
                  style={{
                    display:      'flex',
                    alignItems:   'flex-start',
                    gap:          '10px',
                    padding:      '12px 16px',
                    cursor:       'pointer',
                    borderBottom: '1px solid #1f2937',
                    background:   n.read ? 'transparent' : 'rgba(212,175,55,0.04)',
                    transition:   'background 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLLIElement).style.background = '#1f2937'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLLIElement).style.background = n.read ? 'transparent' : 'rgba(212,175,55,0.04)'; }}
                >
                  {/* Category icon + unread dot */}
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', paddingTop: '1px' }}>
                    <span style={{ fontSize: '14px', lineHeight: 1 }}>{typeIcon(n.type)}</span>
                    <div style={{
                      width:        '6px',
                      height:       '6px',
                      borderRadius: '50%',
                      background:   n.read ? 'transparent' : '#D4AF37',
                      border:       n.read ? '1px solid #374151' : 'none',
                    }} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin:      '0 0 2px',
                      color:       n.read ? '#d1d5db' : '#fff',
                      fontSize:    '13px',
                      fontWeight:  n.read ? 400 : 600,
                      overflow:    'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace:  'nowrap',
                    }}>
                      {n.title}
                    </p>
                    <p style={{
                      margin:      '0 0 4px',
                      color:       '#9ca3af',
                      fontSize:    '12px',
                      overflow:    'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace:  'nowrap',
                    }}>
                      {n.body}
                    </p>
                    <span style={{ color: '#6b7280', fontSize: '11px' }}>
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>

                  {/* Dismiss */}
                  <button
                    onClick={e => handleDismiss(e, n.id)}
                    aria-label="Dismiss notification"
                    style={{
                      flexShrink:  0,
                      background:  'none',
                      border:      'none',
                      cursor:      'pointer',
                      color:       '#6b7280',
                      fontSize:    '16px',
                      lineHeight:  1,
                      padding:     '2px',
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Footer */}
          <div style={{ padding: '10px 16px', borderTop: preview.length > 0 ? '1px solid #1f2937' : 'none' }}>
            <a
              href="/dashboard/notifications"
              style={{
                display:    'block',
                textAlign:  'center',
                color:      '#D4AF37',
                fontSize:   '13px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
              onClick={() => setOpen(false)}
            >
              View all notifications
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
