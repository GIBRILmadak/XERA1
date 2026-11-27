import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import { Avatar, Button, EmptyState, Skeleton } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { timeAgo } from '../lib/format';
import { fetchNotifications, markAllNotificationsRead } from '../services/data';

const TYPE_ICON = {
  follow: 'person_add',
  encouragement: 'local_fire_department',
  comment: 'chat',
  message: 'mail',
  milestone: 'task_alt',
  fata: 'emoji_events',
  live: 'sensors',
  live_start: 'sensors',
  collaboration: 'handshake',
  badge: 'verified',
  payment: 'payments',
};

function target(n) {
  if (n.link && n.link.startsWith('/')) return n.link;
  const legacyLive = String(n.link || '').match(/stream\.html\?id=([^&]+)/);
  if (legacyLive) return `/live/${legacyLive[1]}`;
  if (n.type === 'fata') return '/fata';
  if (n.actor?.id) return `/u/${n.actor.id}`;
  return null;
}

export default function Notifications() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);

  useEffect(() => {
    fetchNotifications(user.id)
      .then(setItems)
      .catch(() => setItems([]));
  }, [user.id]);

  const unread = (items || []).filter((n) => !n.read).length;

  async function readAll() {
    await markAllNotificationsRead(user.id);
    setItems((list) => list.map((n) => ({ ...n, read: true })));
  }

  return (
    <>
      <TopBar
        title="Notifications"
        actions={
          unread > 0 && (
            <Button size="sm" variant="ghost" icon="done_all" onClick={readAll}>
              Tout lire
            </Button>
          )
        }
      />
      <main className="main">
        {items === null ? (
          <div className="stack">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={60} radius={16} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState art="empty" icon="notifications" title="Tout est calme" text="Les encouragements, abonnements et validations apparaîtront ici." />
        ) : (
          <div className="list">
            {items.map((n) => {
              const to = target(n);
              const inner = (
                <>
                  {n.actor ? (
                    <span style={{ position: 'relative' }}>
                      <Avatar user={n.actor} size={44} />
                      <span className="lead-icon" style={{ position: 'absolute', right: -4, bottom: -4, width: 22, height: 22, borderRadius: 8, border: '2px solid var(--bg)' }}>
                        <Icon name={TYPE_ICON[n.type] || 'notifications'} size={14} filled />
                      </span>
                    </span>
                  ) : (
                    <span className="lead-icon" style={{ width: 44, height: 44 }}>
                      <Icon name={TYPE_ICON[n.type] || 'notifications'} filled />
                    </span>
                  )}
                  <span className="grow">
                    <span style={{ display: 'block', fontSize: 14.5 }}>{n.message || n.title || 'Nouvelle activité'}</span>
                    <span className="sub">{timeAgo(n.created_at)}</span>
                  </span>
                </>
              );
              const cls = `list-item notif-item${n.read ? '' : ' is-unread'}`;
              return to ? (
                <Link key={n.id} to={to} className={cls}>
                  {inner}
                </Link>
              ) : (
                <div key={n.id} className={cls}>
                  {inner}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
