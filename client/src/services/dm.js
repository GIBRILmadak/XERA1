/**
 * Messagerie privée sécurisée (même protocole que js/messages.js et
 * sql/20261005_dm_secure_messaging.sql) :
 * - lecture/écriture limitées aux membres (RLS + fonctions SECURITY DEFINER) ;
 * - pièces jointes dans le bucket PRIVÉ « dm-media », chemin
 *   <conversation>/<expéditeur>/<fichier>, lues par téléchargement authentifié ;
 * - anti-spam, blocage, confidentialité et signalement appliqués côté base.
 */
import { supabase } from './supabase';
import { USER_BADGE_COLUMNS } from './badges';
import { DEMO, demoInbox, demoMessages } from './demo';

export const DM_MEDIA_BUCKET = 'dm-media';
export const DM_MEDIA_MAX_BYTES = 50 * 1024 * 1024;
export const DM_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
export const DM_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
export const DM_ACCEPT = [...DM_IMAGE_TYPES, ...DM_VIDEO_TYPES].join(',');
export const DM_EDIT_WINDOW_MS = 15 * 60 * 1000;
export const DM_MAX_LENGTH = 4000;
export const DM_REPORT_REASONS = [
  { value: 'spam', label: 'Spam ou publicité' },
  { value: 'harassment', label: 'Harcèlement ou menaces' },
  { value: 'inappropriate', label: 'Contenu inapproprié' },
  { value: 'scam', label: 'Arnaque ou usurpation' },
  { value: 'other', label: 'Autre' },
];

const MESSAGE_COLUMNS =
  'id, conversation_id, sender_id, body, media_url, media_path, media_type, media_name, media_size_bytes, reply_to_id, created_at, edited_at, deleted_at';
const PAGE = 50;

const ERRORS = {
  DM_PRIVACY_RESTRICTED: "Cet utilisateur n'accepte pas de nouveaux messages de votre part.",
  DM_RATE_LIMIT: 'Vous envoyez trop de messages. Patientez quelques secondes.',
  DM_NOT_PARTICIPANT: 'Vous ne faites pas partie de cette conversation.',
  DM_SENDER_MISMATCH: 'Session invalide. Rechargez la page.',
  DM_MEDIA_URL_FORBIDDEN: "Votre application n'est pas à jour. Rechargez la page.",
  DM_MEDIA_PATH_INVALID: 'Pièce jointe invalide. Réessayez.',
  DM_MEDIA_NOT_FOUND: "La pièce jointe n'a pas été envoyée. Réessayez.",
  DM_MEDIA_TYPE_INVALID: 'Format de pièce jointe non pris en charge.',
  DM_REPLY_INVALID: "Le message auquel vous répondez n'existe plus.",
  DM_EDIT_WINDOW_EXPIRED: 'Un message ne peut être modifié que dans les 15 minutes après son envoi.',
  DM_MESSAGE_DELETED: 'Ce message a été supprimé.',
  DM_MESSAGE_NOT_FOUND: 'Message introuvable.',
  DM_EMPTY_MESSAGE: 'Le message ne peut pas être vide.',
  DM_MESSAGE_TOO_LONG: 'Message trop long (4000 caractères maximum).',
  DM_REPORT_SELF: 'Vous ne pouvez pas signaler votre propre message.',
  DM_REPORT_REASON_INVALID: 'Choisissez un motif de signalement.',
};

export function dmError(error, fallback = 'Action impossible. Réessayez.') {
  const raw = String(error?.message || '').toUpperCase();
  const code = Object.keys(ERRORS).find((c) => raw.includes(c));
  if (code) return ERRORS[code];
  if (raw.includes('DM_BLOCKED')) return 'Cette conversation est bloquée. Débloquez l’utilisateur pour reprendre la discussion.';
  if (raw.includes('SELF_CONVERSATION_NOT_ALLOWED')) return 'Vous ne pouvez pas ouvrir une conversation avec vous-même.';
  if (raw.includes('OTHER_USER_REQUIRED')) return 'Utilisateur introuvable.';
  if (raw.includes('NOT_AUTHENTICATED') || raw.includes('JWT')) return 'Votre session a expiré. Reconnectez-vous puis réessayez.';
  return fallback;
}

function rpcError(error) {
  if (error) throw new Error(dmError(error, error.message));
}

// ---------------------------------------------------------------- Boîte de réception

export async function fetchInbox() {
  if (DEMO) return demoInbox;
  const { data: rows, error } = await supabase.rpc('get_dm_inbox');
  rpcError(error);
  const ids = [...new Set((rows || []).map((r) => r.other_user_id).filter(Boolean))];
  const { data: users } = ids.length
    ? await supabase.from('users').select(USER_BADGE_COLUMNS).in('id', ids)
    : { data: [] };
  const byId = Object.fromEntries((users || []).map((u) => [u.id, u]));
  return (rows || [])
    .filter((r) => {
      // Une conversation masquée réapparaît dès qu'un nouveau message arrive.
      if (!r.hidden_at) return true;
      return Date.parse(r.last_message_at || 0) > Date.parse(r.hidden_at);
    })
    .map((r) => ({
      id: r.conversation_id,
      other: byId[r.other_user_id] || { id: r.other_user_id, name: 'Membre XERA' },
      unreadCount: Number(r.unread_count) || 0,
      muted: r.muted === true,
      lastMessage: r.last_message || null,
      lastAt: r.last_message_at || r.updated_at || r.created_at,
      otherLastReadAt: r.other_last_read_at || null,
    }))
    .sort((a, b) => Date.parse(b.lastAt || 0) - Date.parse(a.lastAt || 0));
}

export async function openConversation(otherUserId) {
  if (DEMO) return 'd1';
  const { data, error } = await supabase.rpc('get_or_create_dm_conversation', { p_other_user_id: otherUserId });
  rpcError(error);
  if (!data) throw new Error('Impossible de créer la conversation.');
  return data;
}

// ---------------------------------------------------------------- Messages

export async function fetchMessages(conversationId, { before } = {}) {
  if (DEMO) return { messages: [...demoMessages].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)), hasMore: false };
  let query = supabase
    .from('dm_messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(PAGE);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  rpcError(error);
  return { messages: (data || []).reverse(), hasMore: (data || []).length === PAGE };
}

function extensionFor(file) {
  const fromName = String(file.name || '').split('.').pop().toLowerCase();
  if (/^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' }[file.type] || 'bin';
}

export function validateAttachment(file) {
  if (!file) return null;
  if (![...DM_IMAGE_TYPES, ...DM_VIDEO_TYPES].includes(file.type)) return 'Format non pris en charge (photo JPG/PNG/WebP/GIF ou vidéo MP4/MOV/WebM).';
  if (file.size > DM_MEDIA_MAX_BYTES) return 'Fichier trop lourd (50 Mo maximum).';
  return null;
}

export async function sendMessage({ conversationId, senderId, body, replyToId, file }) {
  const text = String(body || '').trim();
  if (!text && !file) throw new Error(ERRORS.DM_EMPTY_MESSAGE);
  if (text.length > DM_MAX_LENGTH) throw new Error(ERRORS.DM_MESSAGE_TOO_LONG);
  if (DEMO) return { id: `m${Date.now()}`, conversation_id: conversationId, sender_id: senderId, body: text, created_at: new Date().toISOString(), reply_to_id: replyToId || null };

  const payload = { conversation_id: conversationId, sender_id: senderId, body: text || null };
  if (replyToId) payload.reply_to_id = replyToId;

  let uploadedPath = null;
  if (file) {
    const problem = validateAttachment(file);
    if (problem) throw new Error(problem);
    uploadedPath = `${conversationId}/${senderId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extensionFor(file)}`;
    const { error: upErr } = await supabase.storage.from(DM_MEDIA_BUCKET).upload(uploadedPath, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: '3600',
    });
    if (upErr) throw new Error("La pièce jointe n'a pas pu être envoyée. Réessayez.");
    Object.assign(payload, {
      media_path: uploadedPath,
      media_type: file.type.startsWith('video/') ? 'video' : 'image',
      media_name: (file.name || '').slice(0, 200) || null,
      media_size_bytes: file.size || null,
    });
  }

  const { data, error } = await supabase.from('dm_messages').insert(payload).select(MESSAGE_COLUMNS).single();
  if (error) {
    // Message refusé : on retire le fichier orphelin.
    if (uploadedPath) supabase.storage.from(DM_MEDIA_BUCKET).remove([uploadedPath]).catch(() => {});
    throw new Error(dmError(error, "Message non envoyé."));
  }
  if (file && uploadedPath) rememberLocalMedia(uploadedPath, file);
  return data;
}

export async function editMessage(messageId, body) {
  const text = String(body || '').trim();
  if (!text) throw new Error(ERRORS.DM_EMPTY_MESSAGE);
  if (DEMO) return { id: messageId, body: text, edited_at: new Date().toISOString() };
  const { data, error } = await supabase.rpc('edit_dm_message', { p_message_id: messageId, p_body: text });
  rpcError(error);
  return data;
}

export async function deleteMessage(messageId) {
  if (DEMO) return;
  const { error } = await supabase.rpc('delete_dm_message', { p_message_id: messageId });
  rpcError(error);
}

export async function markRead(conversationId) {
  if (DEMO) return;
  await supabase.rpc('mark_dm_conversation_read', { p_conversation_id: conversationId });
}

// ---------------------------------------------------------------- Réglages de conversation

export async function setMuted(conversationId, muted) {
  if (DEMO) return;
  const { error } = await supabase.rpc('set_dm_conversation_muted', { p_conversation_id: conversationId, p_muted: muted });
  rpcError(error);
}

export async function hideConversation(conversationId) {
  if (DEMO) return;
  const { error } = await supabase.rpc('hide_dm_conversation', { p_conversation_id: conversationId });
  rpcError(error);
}

export async function relationship(otherUserId) {
  const neutral = { blockedByMe: false, blockedMe: false, canMessage: true, restricted: false };
  if (DEMO || !otherUserId) return neutral;
  const { data, error } = await supabase.rpc('get_dm_relationship_status', { p_other_user_id: otherUserId });
  if (error) return neutral;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return neutral;
  return {
    blockedByMe: row.blocked_by_me === true,
    blockedMe: row.blocked_me === true,
    canMessage: row.can_message !== false,
    restricted: row.messages_restricted === true,
  };
}

export async function setBlocked(otherUserId, blocked) {
  if (DEMO) return;
  const { error } = await supabase.rpc(blocked ? 'block_dm_user' : 'unblock_dm_user', { p_other_user_id: otherUserId });
  rpcError(error);
}

export async function report({ conversationId, messageId, reason, details }) {
  if (DEMO) return;
  const { error } = await supabase.rpc('report_dm', {
    p_conversation_id: conversationId,
    p_message_id: messageId || null,
    p_reason: reason,
    p_details: details?.trim() || null,
  });
  rpcError(error);
}

export function lockReason(rel) {
  if (rel.blockedByMe) return 'Vous avez bloqué cet utilisateur. Débloquez-le pour reprendre la discussion.';
  if (rel.blockedMe) return 'Cet utilisateur vous a bloqué. Vous ne pouvez plus lui envoyer de messages.';
  if (rel.restricted || !rel.canMessage) return "Cet utilisateur n'accepte pas de nouveaux messages de votre part.";
  return '';
}

// ---------------------------------------------------------------- Médias privés

const mediaCache = new Map();

function rememberLocalMedia(path, file) {
  try {
    mediaCache.set(path, Promise.resolve(URL.createObjectURL(file)));
  } catch {
    /* aperçu local facultatif */
  }
}

/** URL locale (blob) d'une pièce jointe privée, téléchargée avec la session de l'utilisateur. */
export function loadPrivateMedia(path) {
  if (!path) return Promise.resolve(null);
  if (!mediaCache.has(path)) {
    const p = supabase.storage
      .from(DM_MEDIA_BUCKET)
      .download(path)
      .then(({ data, error }) => {
        if (error || !data) throw error || new Error('media');
        return URL.createObjectURL(data);
      })
      .catch((e) => {
        mediaCache.delete(path);
        throw e;
      });
    mediaCache.set(path, p);
  }
  return mediaCache.get(path);
}

/** Anciens messages (avant le bucket privé) : seulement les fichiers de notre propre Storage. */
export function trustedLegacyMediaUrl(url) {
  const base = String(supabase.supabaseUrl || '').replace(/\/+$/, '');
  return typeof url === 'string' && base && url.startsWith(`${base}/storage/v1/object/`) ? url : null;
}

// ---------------------------------------------------------------- Temps réel

export function subscribeMessages(conversationId, { onInsert, onUpdate }) {
  if (DEMO) return () => {};
  const filter = `conversation_id=eq.${conversationId}`;
  const channel = supabase
    .channel(`dm-live-${conversationId}-${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages', filter }, (p) => onInsert?.(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dm_messages', filter }, (p) => onUpdate?.(p.new))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/** Indicateur « en train d'écrire » : canal privé dm:<id>, autorisé par dm_realtime_topic_allowed. */
export function typingChannel(conversationId, userId, onTyping) {
  if (DEMO) return { notify() {}, close() {} };
  let lastSent = 0;
  let channel = null;
  try {
    channel = supabase.channel(`dm:${conversationId}`, { config: { private: true, broadcast: { self: false } } });
    channel.on('broadcast', { event: 'typing' }, (msg) => {
      if (msg?.payload?.userId && msg.payload.userId !== userId) onTyping();
    });
    channel.subscribe();
  } catch {
    channel = null;
  }
  return {
    notify() {
      if (!channel || Date.now() - lastSent < 2500) return;
      lastSent = Date.now();
      Promise.resolve(channel.send({ type: 'broadcast', event: 'typing', payload: { userId } })).catch(() => {});
    },
    close() {
      if (channel) supabase.removeChannel(channel);
    },
  };
}
