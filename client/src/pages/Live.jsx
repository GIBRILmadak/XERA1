import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import Art from '../components/Illustrations';
import { Avatar, Button, EmptyState, IconButton, Sheet, Skeleton, UserName } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { canReceiveSupport } from '../services/badges';
import { openSupport } from '../services/payments';
import { displayName } from '../lib/format';
import {
  composeScreenWithCamera,
  endSession,
  getStream,
  hostSignaling,
  isFollower,
  listViewers,
  loadChat,
  sendChat,
  startPresence,
  subscribeChat,
  takePreparedStream,
  videoConstraints,
  viewerSignaling,
  watchSession,
} from '../services/live';

const elapsed = (from) => {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(from || Date.now())) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function Chat({ streamId, user, host }) {
  const { toast } = useUi();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const log = useRef();
  useEffect(() => {
    loadChat(streamId).then(setMessages);
    return subscribeChat(streamId, (m) => setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list.slice(-199), m])));
  }, [streamId]);
  useEffect(() => {
    const el = log.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [messages.length]);
  async function send(e) {
    e.preventDefault();
    if (!user) return toast('info', 'Connectez-vous pour discuter');
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      const row = await sendChat(streamId, user.id, body);
      if (row) setMessages((list) => (list.some((x) => x.id === row.id) ? list : [...list, { ...row, users: row.users || { name: user.name, avatar: user.avatar } }]));
    } catch (err) {
      setText(body);
      toast('error', 'Message non envoyé', err.message);
    }
  }
  return (
    <section className="live-chat">
      <header>
        <Icon name="forum" size={18} /> Chat en direct
      </header>
      <div className="live-chat-log" ref={log}>
        {messages.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, textAlign: 'center', padding: 20 }}>Soyez le premier à écrire.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="live-msg">
              <Avatar user={m.users || {}} size={26} />
              <p>
                <strong className={m.user_id === host?.id ? 'is-host' : ''}>
                  {displayName(m.users || {})}
                  {m.user_id === host?.id && <span className="host-tag">Hôte</span>}
                </strong>{' '}
                {m.message}
              </p>
            </div>
          ))
        )}
      </div>
      <form className="live-chat-form" onSubmit={send}>
        <input className="input" placeholder={user ? 'Écrire un message…' : 'Connectez-vous pour discuter'} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} disabled={!user} aria-label="Message du chat" />
        <IconButton icon="send" label="Envoyer" type="submit" filled disabled={!text.trim()} />
      </form>
    </section>
  );
}

export default function Live() {
  const { id } = useParams();
  const { user, loading } = useAuth();
  const { toast } = useUi();
  const navigate = useNavigate();
  const video = useRef();
  const host = useRef({ media: null, signaling: null });
  const [stream, setStream] = useState(undefined);
  const [viewers, setViewers] = useState(0);
  const [, tick] = useState(0);
  const [locked, setLocked] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [muted, setMuted] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [viewerList, setViewerList] = useState(null);

  const isHost = Boolean(user && stream && user.id === stream.user_id);

  useEffect(() => {
    getStream(id).then((s) => setStream(s || null));
    const stop = watchSession(id, (row) => setStream((s) => (s ? { ...s, ...row } : s)));
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      stop();
      clearInterval(t);
    };
  }, [id]);

  // ---------------- Hôte : diffusion
  useEffect(() => {
    if (!isHost || stream?.status !== 'live') return undefined;
    let cancelled = false;
    (async () => {
      let prepared = takePreparedStream();
      if (!prepared?.out) {
        try {
          const cam = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(user), audio: { echoCancellation: true, noiseSuppression: true } });
          prepared = { camera: cam, out: cam };
        } catch {
          toast('error', 'Caméra indisponible', 'Autorisez la caméra et le micro pour reprendre le live.');
          return;
        }
      }
      if (cancelled) return;
      host.current.media = prepared;
      setSharing(Boolean(prepared.screen));
      if (video.current) video.current.srcObject = prepared.out;
      host.current.signaling = hostSignaling(id, user.id, () => host.current.media?.out);
      setWaiting(false);
    })();
    const stopPresence = startPresence(id, user.id, setViewers, { isHost: true });
    const onUnload = () => endSession(stream, user.id);
    window.addEventListener('pagehide', onUnload);
    return () => {
      cancelled = true;
      stopPresence();
      window.removeEventListener('pagehide', onUnload);
      host.current.signaling?.close();
      const m = host.current.media;
      m?.composite?.stop();
      [m?.camera, m?.screen].forEach((s) => s?.getTracks().forEach((t) => t.stop()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, stream?.status, id]);

  // ---------------- Spectateur : réception
  useEffect(() => {
    if (loading || !stream || isHost || stream.status !== 'live') return undefined;
    let sig = null;
    let stopPresence = () => {};
    let retry = null;
    let cancelled = false;
    (async () => {
      if (stream.is_private && (!user || !(await isFollower(user.id, stream.user_id)))) {
        setLocked(true);
        return;
      }
      if (cancelled) return;
      const viewerId = user?.id || `invite-${Math.random().toString(36).slice(2, 10)}`;
      sig = viewerSignaling(id, viewerId, (remote) => {
        if (video.current) {
          video.current.srcObject = remote;
          video.current.play().catch(() => {});
        }
        setWaiting(false);
      });
      // L'hôte n'a peut-être pas encore entendu notre arrivée : on la redit tant que rien n'arrive.
      retry = setInterval(() => {
        if (!video.current?.srcObject) sig?.rejoin();
      }, 6000);
      if (user) stopPresence = startPresence(id, user.id, setViewers);
    })();
    return () => {
      cancelled = true;
      clearInterval(retry);
      sig?.close();
      stopPresence();
    };
  }, [loading, stream?.id, stream?.status, isHost, user, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------- Commandes de l'hôte
  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    host.current.media?.out?.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
  };
  const toggleCam = () => {
    const next = !camOn;
    setCamOn(next);
    host.current.media?.out?.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
  };
  const toggleScreen = useCallback(async () => {
    const m = host.current.media;
    if (!m) return;
    try {
      let track;
      if (!sharing) {
        m.screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
        if (m.camera?.getVideoTracks().length) {
          m.composite = composeScreenWithCamera(m.screen, m.camera);
          track = m.composite.track;
        } else track = m.screen.getVideoTracks()[0];
        m.screen.getVideoTracks()[0].onended = () => toggleScreen();
      } else {
        m.composite?.stop();
        m.composite = null;
        m.screen?.getTracks().forEach((t) => t.stop());
        m.screen = null;
        if (!m.camera?.getVideoTracks().length) {
          const cam = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(user) });
          m.camera = new MediaStream([...cam.getVideoTracks(), ...(m.camera?.getAudioTracks() || [])]);
        }
        track = m.camera.getVideoTracks()[0];
      }
      const audio = m.out.getAudioTracks();
      m.out = new MediaStream([track, ...audio]);
      if (video.current) video.current.srcObject = m.out;
      host.current.signaling?.replaceVideoTrack(track);
      setSharing(!sharing);
    } catch {
      toast('error', 'Partage d’écran impossible');
    }
  }, [sharing, toast, user]);

  async function end() {
    if (!window.confirm('Terminer le live pour tout le monde ?')) return;
    await endSession(stream, user.id);
    setStream((s) => ({ ...s, status: 'ended', ended_at: new Date().toISOString() }));
    toast('success', 'Live terminé', 'Merci d’avoir construit en direct !');
  }

  async function openViewers() {
    setViewerList([]);
    setViewerList(await listViewers(id));
  }

  if (stream === undefined)
    return (
      <>
        <TopBar back title="Live" />
        <main className="main main--wide">
          <Skeleton height={360} radius={12} />
        </main>
      </>
    );
  if (!stream)
    return (
      <>
        <TopBar back title="Live" />
        <main className="main">
          <EmptyState art="live" title="Live introuvable" action={<Link to="/explorer" className="btn">Voir les lives</Link>} />
        </main>
      </>
    );

  const ended = stream.status !== 'live';
  const hostUser = stream.users || { id: stream.user_id };

  return (
    <>
      <TopBar back title={stream.title} />
      <main className="main main--wide">
        <div className="live-layout">
          <div>
            <div className="live-stage">
              {ended ? (
                <div className="live-stage-empty">
                  <Art name="live" size={150} />
                  <strong>Ce live est terminé</strong>
                  {stream.ended_at && <span>Durée : {Math.max(1, Math.round((Date.parse(stream.ended_at) - Date.parse(stream.started_at || stream.created_at)) / 60000))} min</span>}
                </div>
              ) : locked ? (
                <div className="live-stage-empty">
                  <Icon name="lock" size={34} />
                  <strong>Live privé</strong>
                  <span>Réservé aux abonnés de {displayName(hostUser)}.</span>
                  <Link to={`/u/${stream.user_id}`} className="btn btn--primary btn--sm">Voir le profil</Link>
                </div>
              ) : (
                <>
                  <video ref={video} autoPlay playsInline muted={isHost || muted} className={isHost && !sharing ? 'is-mirror' : ''} />
                  {waiting && (
                    <div className="live-stage-empty">
                      <span className="spinner" style={{ width: 28, height: 28 }} />
                      <span>{isHost ? 'Préparation de la diffusion…' : 'Connexion au live…'}</span>
                    </div>
                  )}
                  {!isHost && !waiting && muted && (
                    <button className="live-unmute" onClick={() => setMuted(false)}>
                      <Icon name="volume_up" /> Activer le son
                    </button>
                  )}
                </>
              )}
              {!ended && (
                <div className="live-overlay">
                  <span className="live-badge">
                    <i /> EN DIRECT
                  </span>
                  <span className="live-pill">{elapsed(stream.started_at || stream.created_at)}</span>
                  <button className="live-pill" onClick={isHost ? openViewers : undefined} disabled={!isHost}>
                    <Icon name="visibility" size={15} /> {viewers || stream.viewer_count || 0}
                  </button>
                  {stream.quality === 'hd' && <span className="live-pill">HD</span>}
                  {stream.is_private && (
                    <span className="live-pill">
                      <Icon name="lock" size={14} /> Privé
                    </span>
                  )}
                </div>
              )}
            </div>

            {isHost && !ended && (
              <div className="live-controls">
                <button className={micOn ? '' : 'is-off'} onClick={toggleMic} aria-label={micOn ? 'Couper le micro' : 'Activer le micro'}>
                  <Icon name={micOn ? 'mic' : 'mic_off'} />
                  <span>{micOn ? 'Micro' : 'Muet'}</span>
                </button>
                <button className={camOn ? '' : 'is-off'} onClick={toggleCam} aria-label={camOn ? 'Couper la vidéo' : 'Activer la vidéo'}>
                  <Icon name={camOn ? 'videocam' : 'videocam_off'} />
                  <span>Vidéo</span>
                </button>
                <button className={sharing ? 'is-on' : ''} onClick={toggleScreen} aria-label="Partager l’écran">
                  <Icon name="screen_share" />
                  <span>{sharing ? 'Arrêter' : 'Écran'}</span>
                </button>
                <button onClick={openViewers} aria-label="Spectateurs">
                  <Icon name="group" />
                  <span>{viewers}</span>
                </button>
                <button className="is-end" onClick={end}>
                  <Icon name="call_end" />
                  <span>Terminer</span>
                </button>
              </div>
            )}

            <div className="live-info">
              <Link to={`/u/${stream.user_id}`} className="row" style={{ gap: 10, minWidth: 0 }}>
                <Avatar user={hostUser} size={44} />
                <span style={{ display: 'grid', minWidth: 0 }}>
                  <UserName user={hostUser} />
                  <span className="muted" style={{ fontSize: 12.5 }}>{ended ? 'Live terminé' : 'En direct maintenant'}</span>
                </span>
              </Link>
              {!isHost && canReceiveSupport(hostUser) && (
                <Button
                  size="sm"
                  icon="favorite"
                  className="support-btn"
                  onClick={async () => {
                    if (!user) return navigate(`/connexion?redirect=${encodeURIComponent(`/live/${id}`)}`);
                    try {
                      await openSupport({ creatorId: stream.user_id, creatorName: displayName(hostUser), onSuccess: () => toast('success', 'Soutien envoyé', 'Merci !') });
                    } catch (e) {
                      toast('error', 'Soutien indisponible', e.message);
                    }
                  }}
                >
                  Soutenir
                </Button>
              )}
            </div>
            <h1 className="live-title">{stream.title}</h1>
            {stream.description && <p className="muted" style={{ whiteSpace: 'pre-line' }}>{stream.description}</p>}
          </div>
          <Chat streamId={id} user={user} host={hostUser} />
        </div>
      </main>

      <Sheet open={viewerList !== null} onClose={() => setViewerList(null)} title={`Spectateurs (${viewerList?.length || 0})`}>
        {viewerList?.length ? (
          <div className="list">
            {viewerList.map((v) => (
              <Link key={v.id} to={`/u/${v.id}`} className="list-item">
                <Avatar user={v} size={36} />
                <UserName user={v} className="title grow" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ padding: 12 }}>Aucun spectateur connecté pour l’instant.</p>
        )}
      </Sheet>
    </>
  );
}
