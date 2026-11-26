import { useEffect, useState } from 'react';
import { countUnreadNotifications, fetchInbox } from '../services/data';

/** Compteurs de non-lus (notifications et messages), rafraîchis toutes les 60 s. */
export function useUnread(user) {
  const [state, setState] = useState({ notifications: 0, messages: 0 });
  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;
    const load = async () => {
      try {
        const [notifications, inbox] = await Promise.all([
          countUnreadNotifications(user.id),
          fetchInbox(user.id).catch(() => []),
        ]);
        const messages = inbox.reduce((n, c) => n + (c.muted ? 0 : c.unreadCount), 0);
        if (alive) setState({ notifications, messages });
      } catch {
        /* compteurs facultatifs */
      }
    };
    load();
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user?.id]);
  return state;
}
