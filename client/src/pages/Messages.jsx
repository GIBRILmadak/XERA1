import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import { Avatar, Button, EmptyState, IconButton, Sheet, Skeleton, UserName } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { displayName, timeAgo } from '../lib/format';
import {
  DM_ACCEPT,
  DM_EDIT_WINDOW_MS,
  DM_MAX_LENGTH,
  DM_REPORT_REASONS,
  deleteMessage,
  editMessage,
  fetchInbox,
  fetchMessages,
  hideConversation,
  loadPrivateMedia,
  lockReason,
  markRead,
  relationship,
  report,
  sendMessage,
  setBlocked,
  setMuted,
  subscribeMessages,
  trustedLegacyMediaUrl,
  typingChannel,
  validateAttachment,
} from '../services/dm';

// ================================================================ Boîte de réception

function previewText(c, meId) {
  const m = c.lastMessage;
  if (!m) return 'Nouvelle conversation';
  const mine = m.sender_id === meId ? 'Vous : ' : '';
  if (m.deleted_at) return `${mine}Message supprimé`;
  if (m.body) return `${mine}${m.body}`;
  if (m.media_type === 'video') return `${mine}Vidéo`;
  if (m.media_type === 'image' || m.media_path || m.media_url) return `${mine}Photo`;
  return mine ? `${mine}…` : '…';
}

export function Inbox() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetchInbox()
      .then((list) => {
        setItems(list);
        setError('');
      })
      .catch((e) => {
        setItems((prev) => prev || []);
        setError(e.message);
      });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 20000);
    return () => clearInterval(t);
  }, [load]);

  const list = (items || []).filter((c) => !q || displayName(c.other).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <TopBar title="Messages" />
      <main className="main">
        <div className="input-wrap" style={{ marginBottom: 12 }}>
          <Icon name="search" />
          <input className="input" type="search" placeholder="Rechercher une conversation" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher une conversation" />
        </div>
        <div className="secure-note">
          <Icon name="lock" size={16} />
          Messages privés : visibles uniquement par les deux participants.
        </div>
        {error && (
          <div className="form-error" style={{ marginBottom: 12 }}>
            <Icon name="error" />
            <span>{error}</span>
          </div>
        )}
        {items === null ? (
          <div className="stack">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={64} radius={10} />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState art="chat" icon="forum" title="Aucune conversation" text="Écrivez à un bâtisseur depuis son profil pour démarrer." />
        ) : (
          <div className="list">
            {list.map((c) => (
              <Link key={c.id} to={`/messages/${c.id}`} className="list-item inbox-item">
                <Avatar user={c.other} size={50} />
                <span className="grow" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
                  <span className="row" style={{ justifyContent: 'space-between', minWidth: 0 }}>
                    <UserName user={c.other} className="title grow" />
                    <span className={`time${c.unreadCount ? ' is-unread' : ''}`} style={{ flexShrink: 0 }}>{timeAgo(c.lastAt)}</span>
                  </span>
                  <span className="preview">
                    {c.lastMessage?.sender_id === user.id && !c.lastMessage?.deleted_at && (
                      <Icon name="done_all" size={16} className={`ticks${c.otherLastReadAt && Date.parse(c.otherLastReadAt) >= Date.parse(c.lastMessage.created_at) ? ' is-read' : ''}`} />
                    )}
                    <span className="sub grow" style={{ color: c.unreadCount ? 'var(--text)' : undefined, fontWeight: c.unreadCount ? 600 : 400 }}>
                      {previewText(c, user.id)}
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

// ================================================================ Conversation

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === y.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

const hhmm = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function PrivateMedia({ message, onOpen }) {
  const [url, setUrl] = useState(() => (message.media_path ? null : trustedLegacyMediaUrl(message.media_url)));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!message.media_path) return undefined;
    let alive = true;
    loadPrivateMedia(message.media_path)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [message.media_path]);
  if (failed || (!message.media_path && !url)) return <div className="dm-media dm-media--missing"><Icon name="broken_image" /> Pièce jointe indisponible</div>;
  if (!url) return <div className="dm-media dm-media--loading"><span className="spinner" /></div>;
  if (message.media_type === 'video') return <video className="dm-media" src={url} controls playsInline preload="metadata" onClick={(e) => e.stopPropagation()} />;
  return (
    <button
      type="button"
      className="dm-media"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(url);
      }}
      aria-label="Agrandir la photo"
    >
      <img src={url} alt={message.media_name || 'Photo'} />
    </button>
  );
}

export function Conversation() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useUi();
  const navigate = useNavigate();
  const [other, setOther] = useState(null);
  const [meta, setMeta] = useState({ muted: false, otherLastReadAt: null });
  const [rel, setRel] = useState({ blockedByMe: false, blockedMe: false, canMessage: true, restricted: false });
  const [messages, setMessages] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [sending, setSending] = useState(false);
  const [typingUntil, setTypingUntil] = useState(0);
  const [actionsFor, setActionsFor] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportFor, setReportFor] = useState(undefined);
  const [viewer, setViewer] = useState(null);
  const end = useRef();
  const typing = useRef(null);
  const fileInput = useRef();
  const textarea = useRef();

  const byId = useMemo(() => Object.fromEntries((messages || []).map((m) => [m.id, m])), [messages]);
  const locked = lockReason(rel);

  const upsert = useCallback((row) => {
    setMessages((list) => {
      if (!list) return list;
      const i = list.findIndex((m) => m.id === row.id);
      if (i === -1) return [...list, row];
      const copy = list.slice();
      copy[i] = { ...copy[i], ...row };
      return copy;
    });
  }, []);

  // Chargement + temps réel
  useEffect(() => {
    let alive = true;
    setMessages(null);
    fetchInbox()
      .then((list) => {
        const c = list.find((x) => x.id === id);
        if (!alive || !c) return;
        setOther(c.other);
        setMeta({ muted: c.muted, otherLastReadAt: c.otherLastReadAt });
        relationship(c.other?.id).then((r) => alive && setRel(r));
      })
      .catch(() => {});
    fetchMessages(id)
      .then((r) => {
        if (!alive) return;
        setMessages(r.messages);
        setHasMore(r.hasMore);
      })
      .catch((e) => {
        if (alive) setMessages([]);
        toast('error', 'Conversation indisponible', e.message);
      });
    markRead(id);
    const unsub = subscribeMessages(id, {
      onInsert: (row) => {
        upsert(row);
        if (row.sender_id !== user.id) {
          setTypingUntil(0);
          markRead(id);
        }
      },
      onUpdate: upsert,
    });
    typing.current = typingChannel(id, user.id, () => setTypingUntil(Date.now() + 4500));
    return () => {
      alive = false;
      unsub();
      typing.current?.close();
    };
  }, [id, user.id, upsert, toast]);

  // Accusés de lecture : rafraîchis régulièrement depuis la boîte de réception.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      fetchInbox()
        .then((list) => {
          const c = list.find((x) => x.id === id);
          if (c) setMeta((m) => ({ ...m, otherLastReadAt: c.otherLastReadAt }));
        })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    if (!typingUntil) return undefined;
    const t = setTimeout(() => setTypingUntil(0), Math.max(0, typingUntil - Date.now()));
    return () => clearTimeout(t);
  }, [typingUntil]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);

  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return undefined;
    }
    const u = URL.createObjectURL(file);
    setFilePreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  async function loadOlder() {
    const first = messages?.[0];
    if (!first) return;
    try {
      const r = await fetchMessages(id, { before: first.created_at });
      setMessages((list) => [...r.messages, ...list]);
      setHasMore(r.hasMore);
    } catch (e) {
      toast('error', 'Chargement impossible', e.message);
    }
  }

  function pickFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const problem = validateAttachment(f);
    if (problem) {
      toast('error', 'Pièce jointe refusée', problem);
      return;
    }
    setFile(f);
  }

  async function submit(e) {
    e?.preventDefault();
    if (sending || locked) return;
    const body = text.trim();
    if (editing) {
      if (!body) return;
      setSending(true);
      try {
        const row = await editMessage(editing.id, body);
        upsert({ ...editing, ...(row || {}), body, edited_at: row?.edited_at || new Date().toISOString() });
        setEditing(null);
        setText('');
      } catch (err) {
        toast('error', 'Modification impossible', err.message);
      } finally {
        setSending(false);
      }
      return;
    }
    if (!body && !file) return;
    setSending(true);
    try {
      const row = await sendMessage({ conversationId: id, senderId: user.id, body, replyToId: replyTo?.id, file });
      upsert(row);
      setText('');
      setFile(null);
      setReplyTo(null);
    } catch (err) {
      toast('error', 'Message non envoyé', err.message);
    } finally {
      setSending(false);
      textarea.current?.focus();
    }
  }

  async function doDelete(m) {
    setActionsFor(null);
    try {
      await deleteMessage(m.id);
      upsert({ ...m, deleted_at: new Date().toISOString(), body: null, media_path: null, media_url: null });
    } catch (err) {
      toast('error', 'Suppression impossible', err.message);
    }
  }

  async function toggleMute() {
    setMenuOpen(false);
    try {
      await setMuted(id, !meta.muted);
      setMeta((m) => ({ ...m, muted: !m.muted }));
      toast('success', meta.muted ? 'Notifications réactivées' : 'Notifications coupées');
    } catch (err) {
      toast('error', 'Action impossible', err.message);
    }
  }

  async function hide() {
    setMenuOpen(false);
    try {
      await hideConversation(id);
      toast('success', 'Conversation masquée', 'Elle réapparaîtra au prochain message.');
      navigate('/messages', { replace: true });
    } catch (err) {
      toast('error', 'Action impossible', err.message);
    }
  }

  async function toggleBlock() {
    setMenuOpen(false);
    if (!other?.id) return;
    const next = !rel.blockedByMe;
    if (next && !window.confirm(`Bloquer ${displayName(other)} ? Vous ne recevrez plus ses messages.`)) return;
    try {
      await setBlocked(other.id, next);
      setRel(await relationship(other.id));
      toast('success', next ? 'Utilisateur bloqué' : 'Utilisateur débloqué');
    } catch (err) {
      toast('error', 'Action impossible', err.message);
    }
  }

  const canEdit = (m) => m.sender_id === user.id && !m.deleted_at && m.body && Date.now() - Date.parse(m.created_at) < DM_EDIT_WINDOW_MS;
  const isTyping = typingUntil > Date.now();

  let lastDay = '';
  return (
    <>
      <TopBar
        back="/messages"
        title={
          other ? (
            <Link to={`/u/${other.id}`} className="row" style={{ gap: 10, minWidth: 0 }}>
              <Avatar user={other} size={34} />
              <span style={{ display: 'grid', minWidth: 0 }}>
                <UserName user={other} />
                <span className={`chat-sub${isTyping ? ' is-typing' : ''}`}>{isTyping ? 'écrit…' : meta.muted ? 'Notifications coupées' : 'Conversation privée'}</span>
              </span>
            </Link>
          ) : (
            'Conversation'
          )
        }
        actions={<IconButton icon="more_vert" label="Options de la conversation" onClick={() => setMenuOpen(true)} />}
      />
      <div className="chat">
        <div className="chat-log">
          {hasMore && (
            <Button size="sm" variant="ghost" onClick={loadOlder} style={{ alignSelf: 'center' }}>
              Messages précédents
            </Button>
          )}
          {messages === null ? (
            <Skeleton height={40} width="60%" radius={14} />
          ) : messages.length === 0 ? (
            <EmptyState art="chat" icon="waving_hand" title="Dites bonjour" text="Présentez-vous et parlez de vos projets." />
          ) : (
            messages.map((m, idx) => {
              const day = dayLabel(m.created_at);
              const showDay = day !== lastDay;
              lastDay = day;
              const mine = m.sender_id === user.id;
              const prev = messages[idx - 1];
              // Bulles consécutives du même auteur (moins de 5 min) : regroupées, sans pointe.
              const cont = !showDay && prev && prev.sender_id === m.sender_id && Date.parse(m.created_at) - Date.parse(prev.created_at) < 5 * 60000;
              const read = mine && meta.otherLastReadAt && Date.parse(meta.otherLastReadAt) >= Date.parse(m.created_at);
              const quoted = m.reply_to_id ? byId[m.reply_to_id] : null;
              return (
                <div key={m.id} style={{ display: 'contents' }}>
                  {showDay && <span className="chat-day">{day}</span>}
                  <div
                    className={`bubble${mine ? ' is-me' : ''}${cont ? ' is-cont' : ''}${m.deleted_at ? ' is-deleted' : ''}`}
                    onClick={() => !m.deleted_at && setActionsFor(m)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (!m.deleted_at) setActionsFor(m);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && !m.deleted_at && setActionsFor(m)}
                  >
                    {m.reply_to_id && (
                      <span className="bubble-quote">
                        {quoted ? (quoted.deleted_at ? 'Message supprimé' : quoted.body || 'Pièce jointe') : 'Message précédent'}
                      </span>
                    )}
                    {m.deleted_at ? (
                      <em>Message supprimé</em>
                    ) : (
                      <>
                        {(m.media_path || m.media_url) && <PrivateMedia message={m} onOpen={setViewer} />}
                        {m.body}
                      </>
                    )}
                    <span className="bubble-meta">
                      {m.edited_at && !m.deleted_at && <em>modifié</em>}
                      {hhmm(m.created_at)}
                      {mine && !m.deleted_at && (
                        <Icon name="done_all" size={16} className={`ticks${read ? ' is-read' : ''}`} label={read ? 'Lu' : 'Envoyé'} />
                      )}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={end} />
        </div>

        <div className="composer">
          {locked ? (
            <div className="composer-locked">
              <Icon name="block" />
              <span className="grow">{locked}</span>
              {rel.blockedByMe && (
                <Button size="sm" onClick={toggleBlock}>
                  Débloquer
                </Button>
              )}
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="composer-stack">
                {(replyTo || editing) && (
                  <div className="composer-context">
                    <Icon name={editing ? 'edit' : 'reply'} size={18} />
                    <span className="grow">
                      <strong>{editing ? 'Modifier le message' : `Réponse à ${replyTo.sender_id === user.id ? 'vous' : displayName(other)}`}</strong>
                      <span>{(editing || replyTo).body || 'Pièce jointe'}</span>
                    </span>
                    <IconButton
                      icon="close"
                      label="Annuler"
                      type="button"
                      onClick={() => {
                        setReplyTo(null);
                        if (editing) setText('');
                        setEditing(null);
                      }}
                    />
                  </div>
                )}
                {file && (
                  <div className="composer-context">
                    {file.type.startsWith('video/') ? <Icon name="movie" /> : <img src={filePreview || ''} alt="" className="composer-thumb" />}
                    <span className="grow">
                      <strong>{file.type.startsWith('video/') ? 'Vidéo' : 'Photo'}</strong>
                      <span>{(file.size / 1024 / 1024).toFixed(1)} Mo · pièce jointe privée</span>
                    </span>
                    <IconButton icon="close" label="Retirer la pièce jointe" type="button" onClick={() => setFile(null)} />
                  </div>
                )}
                <div className="composer-row">
                  {!editing && (
                    <IconButton icon="attach_file" label="Joindre une photo ou une vidéo" type="button" onClick={() => fileInput.current?.click()} />
                  )}
                  <input ref={fileInput} type="file" accept={DM_ACCEPT} hidden onChange={pickFile} />
                  <textarea
                    ref={textarea}
                    className="textarea"
                    rows={1}
                    placeholder={editing ? 'Modifier le message' : 'Votre message'}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      typing.current?.notify();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) submit(e);
                    }}
                    aria-label="Votre message"
                    maxLength={DM_MAX_LENGTH}
                  />
                  <button type="submit" className="send-btn" disabled={sending || (!text.trim() && !file)} aria-label="Envoyer">
                    {sending ? <span className="spinner" /> : <Icon name={editing ? 'check' : 'send'} filled />}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      <Sheet open={Boolean(actionsFor)} onClose={() => setActionsFor(null)} title="Message">
        {actionsFor && (
          <div className="list">
            <button
              className="list-item"
              onClick={() => {
                setReplyTo(actionsFor);
                setEditing(null);
                setActionsFor(null);
                textarea.current?.focus();
              }}
            >
              <Icon name="reply" /> <span className="grow">Répondre</span>
            </button>
            {actionsFor.body && (
              <button
                className="list-item"
                onClick={() => {
                  navigator.clipboard?.writeText(actionsFor.body).then(() => toast('success', 'Message copié'));
                  setActionsFor(null);
                }}
              >
                <Icon name="content_copy" /> <span className="grow">Copier</span>
              </button>
            )}
            {canEdit(actionsFor) && (
              <button
                className="list-item"
                onClick={() => {
                  setEditing(actionsFor);
                  setReplyTo(null);
                  setText(actionsFor.body || '');
                  setActionsFor(null);
                  textarea.current?.focus();
                }}
              >
                <Icon name="edit" /> <span className="grow">Modifier</span>
              </button>
            )}
            {actionsFor.sender_id === user.id ? (
              <button className="list-item" onClick={() => doDelete(actionsFor)} style={{ color: 'var(--failure)' }}>
                <Icon name="delete" /> <span className="grow">Supprimer pour tout le monde</span>
              </button>
            ) : (
              <button
                className="list-item"
                onClick={() => {
                  setReportFor(actionsFor);
                  setActionsFor(null);
                }}
              >
                <Icon name="flag" /> <span className="grow">Signaler ce message</span>
              </button>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Conversation">
        <div className="list">
          {other && (
            <Link className="list-item" to={`/u/${other.id}`}>
              <Icon name="person" /> <span className="grow">Voir le profil</span>
            </Link>
          )}
          <button className="list-item" onClick={toggleMute}>
            <Icon name={meta.muted ? 'notifications_active' : 'notifications_off'} />
            <span className="grow">{meta.muted ? 'Réactiver les notifications' : 'Couper les notifications'}</span>
          </button>
          <button className="list-item" onClick={hide}>
            <Icon name="visibility_off" /> <span className="grow">Masquer la conversation</span>
          </button>
          <button
            className="list-item"
            onClick={() => {
              setMenuOpen(false);
              setReportFor(null);
            }}
          >
            <Icon name="flag" /> <span className="grow">Signaler la conversation</span>
          </button>
          <button className="list-item" onClick={toggleBlock} style={{ color: rel.blockedByMe ? undefined : 'var(--failure)' }}>
            <Icon name="block" />
            <span className="grow">
              {rel.blockedByMe ? 'Débloquer' : 'Bloquer'} {displayName(other)}
            </span>
          </button>
        </div>
      </Sheet>

      <ReportSheet open={reportFor !== undefined} message={reportFor} onClose={() => setReportFor(undefined)} conversationId={id} />

      {viewer && (
        <div className="media-viewer" role="dialog" aria-modal="true" onClick={() => setViewer(null)}>
          <img src={viewer} alt="" />
          <span className="media-viewer-note">
            <Icon name="lock" size={16} /> Visible uniquement dans XERA1
          </span>
        </div>
      )}
    </>
  );
}

function ReportSheet({ open, onClose, message, conversationId }) {
  const { toast } = useUi();
  const [reason, setReason] = useState(DM_REPORT_REASONS[0].value);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setReason(DM_REPORT_REASONS[0].value);
      setDetails('');
    }
  }, [open]);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await report({ conversationId, messageId: message?.id, reason, details });
      toast('success', 'Signalement envoyé', 'L’équipe XERA va examiner la situation.');
      onClose();
    } catch (err) {
      toast('error', 'Signalement impossible', err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={message ? 'Signaler le message' : 'Signaler la conversation'}>
      <form className="stack" onSubmit={submit}>
        <div className="list" role="radiogroup">
          {DM_REPORT_REASONS.map((r) => (
            <label key={r.value} className="list-item" style={{ cursor: 'pointer' }}>
              <input type="radio" name="dm-report" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
              <span className="grow">{r.label}</span>
            </label>
          ))}
        </div>
        <textarea className="textarea" placeholder="Détails (facultatif)" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
        <Button variant="primary" block loading={busy}>
          Envoyer le signalement
        </Button>
      </form>
    </Sheet>
  );
}
