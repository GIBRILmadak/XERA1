/**
 * Lives XERA1 — même protocole que js/streaming.js :
 * - session dans streaming_sessions (status live/ended, is_private, quality) ;
 * - vidéo pair-à-pair hôte → chaque spectateur (WebRTC), signalisation par le
 *   canal Realtime « stream-signal-<id> » (viewer-join / offer / answer / ice) ;
 * - chat dans stream_messages (+ canal « stream-chat-<id> ») ;
 * - présence dans stream_viewers (battement toutes les 20 s, actif < 30 s).
 */
import { supabase } from './supabase';
import { USER_BADGE_COLUMNS, isPlanActive } from './badges';
import { DEMO, demoUsers } from './demo';

const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

/** Flux préparé sur la page de création, repris par la page du live (navigation sans rechargement). */
let preparedStream = null;
export const setPreparedStream = (s) => {
  preparedStream = s;
};
export const takePreparedStream = () => {
  const s = preparedStream;
  preparedStream = null;
  return s;
};

export const hasHD = (u) => ['pro', 'elite'].includes(String(u?.plan || '').toLowerCase()) && isPlanActive(u);
export const hasPrivateLive = hasHD;

export function videoConstraints(user, facingMode = 'user') {
  return hasHD(user)
    ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode }
    : { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 }, facingMode };
}

export async function getLiveStreams() {
  if (DEMO) {
    return [{ id: 'l1', title: 'Je code la synchro en direct', status: 'live', viewer_count: 23, started_at: new Date(Date.now() - 18 * 6e4).toISOString(), user_id: 'u3', users: demoUsers[2] }];
  }
  const { data } = await supabase
    .from('streaming_sessions')
    .select(`id, title, description, thumbnail_url, status, viewer_count, started_at, created_at, is_private, quality, user_id, users(${USER_BADGE_COLUMNS})`)
    .eq('status', 'live')
    .order('started_at', { ascending: false });
  return data || [];
}

export async function getStream(id) {
  if (DEMO) return { id, title: 'Je code la synchro en direct', description: 'Questions bienvenues !', status: 'live', viewer_count: 23, started_at: new Date(Date.now() - 18 * 6e4).toISOString(), user_id: 'u3', users: demoUsers[2] };
  const { data } = await supabase.from('streaming_sessions').select(`*, users(${USER_BADGE_COLUMNS})`).eq('id', id).maybeSingle();
  return data;
}

export async function createSession(user, { title, description, thumbnailUrl, private: wantsPrivate, hd }) {
  const payload = {
    user_id: user.id,
    title: title.trim(),
    description: description?.trim() || null,
    thumbnail_url: thumbnailUrl || null,
    status: 'live',
    is_private: hasPrivateLive(user) && Boolean(wantsPrivate),
    quality: hasHD(user) && hd !== false ? 'hd' : 'sd',
  };
  if (DEMO) return { id: 'l-demo', ...payload, started_at: new Date().toISOString() };
  const { data, error } = await supabase.from('streaming_sessions').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

/** Notifie les abonnés (plans Standard, Medium ou Pro actifs, comme avant). */
export async function notifyFollowers(user, stream) {
  if (DEMO) return;
  const plan = String(user.plan || '').toLowerCase();
  if (!(isPlanActive(user) && ['standard', 'medium', 'pro'].includes(plan))) return;
  const { data: followers } = await supabase.from('followers').select('follower_id').eq('following_id', user.id);
  const ids = (followers || []).map((f) => f.follower_id);
  for (let i = 0; i < ids.length; i += 100) {
    const rows = ids.slice(i, i + 100).map((fid) => ({
      user_id: fid,
      type: 'live_start',
      message: `🔴 ${user.name || 'Un créateur'} a commencé un live : « ${stream.title} »`,
      link: `/live/${stream.id}`,
      read: false,
    }));
    await supabase.from('notifications').upsert(rows, { onConflict: 'user_id,type,link' });
  }
}

export async function endSession(stream, userId) {
  if (DEMO || !stream?.id) return;
  await supabase
    .from('streaming_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', stream.id)
    .eq('user_id', userId)
    .eq('status', 'live');
}

export async function isFollower(viewerId, hostId) {
  if (DEMO) return true;
  const { count } = await supabase.from('followers').select('id', { count: 'exact', head: true }).eq('follower_id', viewerId).eq('following_id', hostId);
  return (count || 0) > 0;
}

// ---------------------------------------------------------------- Présence

export function startPresence(streamId, userId, onCount, { isHost } = {}) {
  if (DEMO) {
    onCount(23);
    return () => {};
  }
  const touch = () =>
    userId &&
    supabase.from('stream_viewers').upsert({ stream_id: streamId, user_id: userId, last_seen: new Date().toISOString() }, { onConflict: 'stream_id,user_id' }).then(() => {});
  const count = async () => {
    const { count: n } = await supabase
      .from('stream_viewers')
      .select('user_id', { count: 'exact', head: true })
      .eq('stream_id', streamId)
      .gte('last_seen', new Date(Date.now() - 30000).toISOString());
    if (typeof n === 'number') {
      onCount(n);
      if (isHost) supabase.from('streaming_sessions').update({ viewer_count: n }).eq('id', streamId).then(() => {});
    }
  };
  touch();
  count();
  const a = setInterval(touch, 20000);
  const b = setInterval(count, 10000);
  return () => {
    clearInterval(a);
    clearInterval(b);
  };
}

export async function listViewers(streamId) {
  if (DEMO) return demoUsers.slice(0, 4);
  const { data } = await supabase
    .from('stream_viewers')
    .select(`user_id, last_seen, users(${USER_BADGE_COLUMNS})`)
    .eq('stream_id', streamId)
    .gte('last_seen', new Date(Date.now() - 30000).toISOString());
  return (data || []).map((r) => r.users).filter(Boolean);
}

/** Suit le statut de la session (fin du live). */
export function watchSession(streamId, onUpdate) {
  if (DEMO) return () => {};
  const ch = supabase
    .channel(`stream-${streamId}-${Date.now()}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'streaming_sessions', filter: `id=eq.${streamId}` }, (p) => onUpdate(p.new))
    .subscribe();
  return () => supabase.removeChannel(ch);
}

// ---------------------------------------------------------------- Chat

export async function loadChat(streamId) {
  if (DEMO) {
    return [
      { id: 'c1', user_id: 'u1', message: 'Salut ! Tu utilises quelle base de données ?', created_at: new Date(Date.now() - 5 * 6e4).toISOString(), users: demoUsers[0] },
      { id: 'c2', user_id: 'u4', message: 'Super live 🔥', created_at: new Date(Date.now() - 2 * 6e4).toISOString(), users: demoUsers[3] },
    ];
  }
  const { data } = await supabase.from('stream_messages').select('*, users(name, avatar)').eq('stream_id', streamId).order('created_at', { ascending: false }).limit(50);
  return (data || []).reverse();
}

export async function sendChat(streamId, userId, message) {
  const text = String(message || '').trim().slice(0, 500);
  if (!text) return null;
  if (DEMO) return { id: `c${Date.now()}`, user_id: userId, message: text, created_at: new Date().toISOString() };
  const { data, error } = await supabase.from('stream_messages').insert({ stream_id: streamId, user_id: userId, message: text }).select('*, users(name, avatar)').single();
  if (error) throw new Error('Message non envoyé.');
  return data;
}

export function subscribeChat(streamId, onMessage) {
  if (DEMO) return () => {};
  let channel = null;
  let poll = null;
  let last = new Date().toISOString();
  const open = () => {
    channel = supabase
      .channel(`stream-chat-${streamId}-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stream_messages', filter: `stream_id=eq.${streamId}` }, async (p) => {
        last = p.new.created_at || last;
        const { data } = await supabase.from('users').select('name, avatar').eq('id', p.new.user_id).maybeSingle();
        onMessage({ ...p.new, users: data || null });
      })
      .subscribe((status) => {
        // Repli : si le temps réel tombe, on interroge la table (comme l'ancienne version).
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status) && !poll) {
          poll = setInterval(async () => {
            const { data } = await supabase.from('stream_messages').select('*, users(name, avatar)').eq('stream_id', streamId).gt('created_at', last).order('created_at').limit(50);
            (data || []).forEach((m) => {
              last = m.created_at;
              onMessage(m);
            });
          }, 3000);
        }
      });
  };
  open();
  return () => {
    if (poll) clearInterval(poll);
    if (channel) supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------- WebRTC

/**
 * Hôte : envoie le flux à chaque spectateur qui annonce « viewer-join ».
 * Retourne { replaceVideoTrack, close }.
 */
export function hostSignaling(streamId, hostId, getStream) {
  const peers = new Map();
  const channel = supabase.channel(`stream-signal-${streamId}`);
  const send = (payload) => channel.send({ type: 'broadcast', event: 'signal', payload: { streamId, from: hostId, ...payload } });

  async function onViewer(viewerId) {
    const stream = getStream();
    if (!viewerId || !stream) return;
    peers.get(viewerId)?.close();
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peers.set(viewerId, pc);
    pc.onicecandidate = (e) => e.candidate && send({ type: 'ice', to: viewerId, candidate: e.candidate });
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        pc.close();
        peers.delete(viewerId);
      }
    };
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: 'offer', to: viewerId, sdp: pc.localDescription });
  }

  channel
    .on('broadcast', { event: 'signal' }, async ({ payload }) => {
      if (!payload || payload.streamId !== streamId) return;
      if (payload.to && payload.to !== hostId) return;
      try {
        if (payload.type === 'viewer-join') await onViewer(payload.from);
        else if (payload.type === 'answer') await peers.get(payload.from)?.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        else if (payload.type === 'ice') await peers.get(payload.from)?.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch {
        /* négociation ratée : le spectateur relancera */
      }
    })
    .subscribe();

  return {
    peerCount: () => peers.size,
    /** Remplace la piste vidéo envoyée (caméra ↔ écran) sans renégocier. */
    replaceVideoTrack(track) {
      peers.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        sender?.replaceTrack(track).catch(() => {});
      });
    },
    close() {
      peers.forEach((pc) => pc.close());
      peers.clear();
      supabase.removeChannel(channel);
    },
  };
}

/** Spectateur : annonce son arrivée et reçoit le flux de l'hôte. */
export function viewerSignaling(streamId, viewerId, onStream) {
  let pc = null;
  const channel = supabase.channel(`stream-signal-${streamId}`);
  const send = (payload) => channel.send({ type: 'broadcast', event: 'signal', payload: { streamId, from: viewerId, ...payload } });
  channel
    .on('broadcast', { event: 'signal' }, async ({ payload }) => {
      if (!payload || payload.streamId !== streamId) return;
      if (payload.to && payload.to !== viewerId) return;
      try {
        if (payload.type === 'offer') {
          pc?.close();
          pc = new RTCPeerConnection(RTC_CONFIG);
          const hostId = payload.from;
          pc.onicecandidate = (e) => e.candidate && send({ type: 'ice', to: hostId, candidate: e.candidate });
          pc.ontrack = (e) => e.streams?.[0] && onStream(e.streams[0]);
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ type: 'answer', to: hostId, sdp: pc.localDescription });
        } else if (payload.type === 'ice') {
          await pc?.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      } catch {
        /* nouvelle tentative au prochain « viewer-join » */
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') send({ type: 'viewer-join', to: null });
    });
  return {
    rejoin: () => send({ type: 'viewer-join', to: null }),
    close() {
      pc?.close();
      supabase.removeChannel(channel);
    },
  };
}

/**
 * Écran partagé + caméra en incrustation (comme le mode PiP de l'ancienne page) :
 * composition sur un canvas, renvoyée comme piste vidéo.
 */
export function composeScreenWithCamera(screenStream, cameraStream, { position = 'bottom-right', size = 0.24 } = {}) {
  const screen = document.createElement('video');
  const cam = document.createElement('video');
  [screen, cam].forEach((v) => {
    v.muted = true;
    v.playsInline = true;
  });
  screen.srcObject = screenStream;
  cam.srcObject = cameraStream;
  screen.play().catch(() => {});
  cam.play().catch(() => {});
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let raf;
  const draw = () => {
    const w = screen.videoWidth || 1280;
    const h = screen.videoHeight || 720;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    ctx.drawImage(screen, 0, 0, w, h);
    if (cam.videoWidth) {
      const cw = Math.round(w * size);
      const ch = Math.round((cw * cam.videoHeight) / cam.videoWidth);
      const m = Math.round(w * 0.02);
      const x = position.includes('left') ? m : w - cw - m;
      const y = position.includes('top') ? m : h - ch - m;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect?.(x, y, cw, ch, 12);
      ctx.clip();
      ctx.drawImage(cam, x, y, cw, ch);
      ctx.restore();
    }
    raf = requestAnimationFrame(draw);
  };
  draw();
  const track = canvas.captureStream(30).getVideoTracks()[0];
  return {
    track,
    stop() {
      cancelAnimationFrame(raf);
      track.stop();
    },
  };
}
