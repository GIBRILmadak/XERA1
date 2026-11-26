import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import { Avatar, EmptyState, IconButton, Skeleton, UserName } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { timeAgo } from '../lib/format';
import { fetchInbox, fetchMessages, markConversationRead, sendMessage, subscribeToConversation } from '../services/data';

export function Inbox() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    fetchInbox(user.id)
      .then(setItems)
      .catch(() => setItems([]));
  }, [user.id]);

  const list = (items || []).filter((c) => !q || c.other?.name?.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <TopBar title="Messages" actions={<a className="icon-btn" href="/messages.html" aria-label="Messagerie complète" title="Messagerie complète (pièces jointes, appels)"><Icon name="open_in_new" /></a>} />
      <main className="main">
        <div className="input-wrap" style={{ marginBottom: 12 }}>
          <Icon name="search" />
          <input className="input" type="search" placeholder="Rechercher une conversation" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher une conversation" />
        </div>
        {items === null ? (
          <div className="stack">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={64} radius={16} />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon="forum" title="Aucune conversation" text="Écrivez à un bâtisseur depuis son profil pour démarrer." />
        ) : (
          <div className="list">
            {list.map((c) => (
              <Link key={c.id} to={`/messages/${c.id}`} className="list-item inbox-item">
                <Avatar user={c.other} size={50} />
                <span className="grow" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
                  <span className="row" style={{ justifyContent: 'space-between', minWidth: 0 }}>
                    <UserName user={c.other} className="title grow" />
                    <span className="time" style={{ flexShrink: 0 }}>{timeAgo(c.lastMessage?.created_at || c.lastAt)}</span>
                  </span>
                  <span className="preview">
                    <span className="sub grow" style={{ color: c.unreadCount ? 'var(--text)' : undefined, fontWeight: c.unreadCount ? 600 : 400 }}>
                      {c.lastMessage?.body || (c.lastMessage?.media_url ? 'Pièce jointe' : 'Nouvelle conversation')}
                    </span>
                    {c.muted && <Icon name="notifications_off" size={16} className="muted" />}
                    {c.unreadCount > 0 && <span className="unread">{c.unreadCount}</span>}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === y.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function Conversation() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useUi();
  const [other, setOther] = useState(null);
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const end = useRef();

  useEffect(() => {
    let alive = true;
    fetchInbox(user.id)
      .then((list) => alive && setOther(list.find((c) => c.id === id)?.other || null))
      .catch(() => {});
    fetchMessages(id)
      .then((m) => alive && setMessages(m))
      .catch(() => alive && setMessages([]));
    markConversationRead(id);
    const unsub = subscribeToConversation(id, (row) =>
      setMessages((list) => (list && !list.some((m) => m.id === row.id) ? [...list, row] : list)),
    );
    return () => {
      alive = false;
      unsub();
    };
  }, [id, user.id]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);

  async function send(e) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    try {
      const row = await sendMessage(id, user.id, body);
      setMessages((list) => (list.some((m) => m.id === row.id) ? list : [...list, row]));
    } catch (error) {
      setText(body);
      toast('error', 'Message non envoyé', error.message);
    } finally {
      setSending(false);
    }
  }

  let lastDay = '';
  return (
    <>
      <TopBar
        back="/messages"
        title={
          other ? (
            <Link to={`/u/${other.id}`} className="row" style={{ gap: 10 }}>
              <Avatar user={other} size={32} />
              <UserName user={other} />
            </Link>
          ) : (
            'Conversation'
          )
        }
      />
      <div className="chat">
        <div className="chat-log">
          {messages === null ? (
            <Skeleton height={40} width="60%" radius={20} />
          ) : messages.length === 0 ? (
            <EmptyState icon="waving_hand" title="Dites bonjour" text="Présentez-vous et parlez de vos projets." />
          ) : (
            messages.map((m) => {
              const day = dayLabel(m.created_at);
              const showDay = day !== lastDay;
              lastDay = day;
              return (
                <div key={m.id} style={{ display: 'contents' }}>
                  {showDay && <span className="chat-day">{day}</span>}
                  <div className={`bubble${m.sender_id === user.id ? ' is-me' : ''}`}>
                    {m.deleted_at ? <em className="muted">Message supprimé</em> : m.body}
                    {m.media_url && !m.deleted_at && (
                      <a href={m.media_url} target="_blank" rel="noreferrer" className="row" style={{ gap: 4, marginTop: 4 }}>
                        <Icon name="attachment" size={18} /> Pièce jointe
                      </a>
                    )}
                    <time>{new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>
                  </div>
                </div>
              );
            })
          )}
          <div ref={end} />
        </div>
        <div className="composer">
          <form onSubmit={send}>
            <textarea
              className="textarea"
              rows={1}
              placeholder="Votre message"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) send(e);
              }}
              aria-label="Votre message"
              maxLength={4000}
            />
            <IconButton icon="send" label="Envoyer" filled type="submit" disabled={!text.trim() || sending} style={{ background: 'var(--accent)', color: 'var(--on-accent)', width: 44, height: 44 }} />
          </form>
        </div>
      </div>
    </>
  );
}
