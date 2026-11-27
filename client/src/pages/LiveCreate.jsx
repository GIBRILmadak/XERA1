import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import Art from '../components/Illustrations';
import { Badge, Button } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { composeScreenWithCamera, createSession, hasHD, hasPrivateLive, notifyFollowers, setPreparedStream, videoConstraints } from '../services/live';

const SOURCES = [
  { id: 'camera', icon: 'videocam', label: 'Caméra' },
  { id: 'screen', icon: 'screen_share', label: 'Écran' },
  { id: 'pip', icon: 'picture_in_picture', label: 'Écran + caméra' },
];

export default function LiveCreate() {
  const { user } = useAuth();
  const { toast } = useUi();
  const navigate = useNavigate();
  const video = useRef();
  const media = useRef({ camera: null, screen: null, composite: null, out: null });
  const [source, setSource] = useState('camera');
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const secure = window.isSecureContext && navigator.mediaDevices?.getUserMedia;

  function stopAll(keep) {
    const m = media.current;
    m.composite?.stop();
    [m.camera, m.screen].forEach((s) => s !== keep && s?.getTracks().forEach((t) => t.stop()));
  }

  async function prepare(nextSource = source, deviceId = cameraId) {
    setError('');
    setReady(false);
    const m = media.current;
    try {
      stopAll();
      m.camera = m.screen = m.composite = null;
      const audio = { echoCancellation: true, noiseSuppression: true };
      if (nextSource === 'camera' || nextSource === 'pip') {
        m.camera = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { ...videoConstraints(user), deviceId: { exact: deviceId } } : videoConstraints(user),
          audio,
        });
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCameras(devices.filter((d) => d.kind === 'videoinput'));
      }
      if (nextSource === 'screen' || nextSource === 'pip') {
        m.screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      }
      let videoTrack;
      if (nextSource === 'pip') {
        m.composite = composeScreenWithCamera(m.screen, m.camera);
        videoTrack = m.composite.track;
      } else {
        videoTrack = (m.screen || m.camera).getVideoTracks()[0];
      }
      // Son : micro (caméra) sinon son de l'écran partagé.
      const audioTrack = m.camera?.getAudioTracks()[0] || m.screen?.getAudioTracks()[0] || null;
      if (!audioTrack && nextSource === 'screen') {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio });
          m.camera = mic;
        } catch {
          /* live sans micro */
        }
      }
      const finalAudio = m.camera?.getAudioTracks()[0] || m.screen?.getAudioTracks()[0];
      if (finalAudio) finalAudio.enabled = micOn;
      m.out = new MediaStream([videoTrack, finalAudio].filter(Boolean));
      if (video.current) video.current.srcObject = m.out;
      setReady(true);
    } catch (e) {
      setError(e?.name === 'NotAllowedError' ? 'Autorisez l’accès à la caméra / au micro dans votre navigateur.' : 'Impossible d’accéder à la caméra ou à l’écran.');
    }
  }

  useEffect(() => {
    if (secure) prepare('camera');
    return () => {
      // Arrêt seulement si on quitte sans lancer le live.
      if (!media.current.launched) stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    media.current.out?.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
  }

  async function start(e) {
    e.preventDefault();
    if (!title.trim()) return toast('error', 'Titre requis', 'Donnez un titre à votre live.');
    if (!ready) return toast('error', 'Aperçu indisponible', 'Autorisez la caméra ou le partage d’écran.');
    setBusy(true);
    try {
      const stream = await createSession(user, { title, description, private: isPrivate });
      notifyFollowers(user, stream).catch(() => {});
      media.current.launched = true;
      setPreparedStream({ ...media.current });
      navigate(`/live/${stream.id}`, { replace: true });
    } catch (err) {
      toast('error', 'Live impossible', err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar back title="Lancer un live" />
      <main className="main main--wide">
        {!secure ? (
          <div className="card card--pad" style={{ textAlign: 'center' }}>
            <Art name="live" size={180} />
            <p className="muted">Le live nécessite une connexion sécurisée (https) et un navigateur compatible.</p>
          </div>
        ) : (
          <div className="live-create">
            <section>
              <div className="live-stage">
                <video ref={video} autoPlay playsInline muted className={source === 'camera' ? 'is-mirror' : ''} />
                {!ready && (
                  <div className="live-stage-empty">
                    {error ? (
                      <>
                        <Icon name="videocam_off" size={34} />
                        <span>{error}</span>
                        <Button size="sm" onClick={() => prepare(source)}>Réessayer</Button>
                      </>
                    ) : (
                      <span className="spinner" style={{ width: 28, height: 28 }} />
                    )}
                  </div>
                )}
                <span className="live-preview-tag">Aperçu</span>
              </div>
              <div className="live-sources" role="radiogroup" aria-label="Source vidéo">
                {SOURCES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={source === s.id}
                    className={source === s.id ? 'is-on' : ''}
                    onClick={() => {
                      setSource(s.id);
                      prepare(s.id);
                    }}
                  >
                    <Icon name={s.icon} />
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                <Button size="sm" icon={micOn ? 'mic' : 'mic_off'} onClick={toggleMic} type="button">
                  {micOn ? 'Micro activé' : 'Micro coupé'}
                </Button>
                {cameras.length > 1 && source !== 'screen' && (
                  <select
                    className="select"
                    style={{ width: 'auto', minHeight: 34, padding: '4px 10px' }}
                    value={cameraId}
                    onChange={(e) => {
                      setCameraId(e.target.value);
                      prepare(source, e.target.value);
                    }}
                    aria-label="Caméra"
                  >
                    <option value="">Caméra par défaut</option>
                    {cameras.map((c, i) => (
                      <option key={c.deviceId} value={c.deviceId}>
                        {c.label || `Caméra ${i + 1}`}
                      </option>
                    ))}
                  </select>
                )}
                <Badge tone={hasHD(user) ? 'gold' : undefined} icon="hd">
                  {hasHD(user) ? 'HD 720p' : 'Qualité standard'}
                </Badge>
              </div>
            </section>

            <form className="card card--pad stack" onSubmit={start}>
              <div className="field">
                <label htmlFor="lv-title">Titre du live *</label>
                <input id="lv-title" className="input" placeholder="Ex. Je code la synchronisation en direct" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
              </div>
              <div className="field">
                <label htmlFor="lv-desc">Description</label>
                <textarea id="lv-desc" className="textarea" placeholder="Ce que vous allez construire, ce qu’on peut vous demander…" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} />
              </div>
              <button type="button" className="list-item" disabled={!hasPrivateLive(user)} onClick={() => setIsPrivate((v) => !v)} style={{ padding: '10px 4px', opacity: hasPrivateLive(user) ? 1 : 0.6 }}>
                <span className="lead-icon"><Icon name="lock" /></span>
                <span className="grow">
                  <span className="title" style={{ display: 'block' }}>Live privé</span>
                  <span className="sub">{hasPrivateLive(user) ? 'Réservé à vos abonnés' : 'Disponible avec le plan Pro'}</span>
                </span>
                <span className={`switch${isPrivate ? ' is-on' : ''}`} role="switch" aria-checked={isPrivate} />
              </button>
              {!hasHD(user) && (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  Lives HD et privés avec le plan <Link to="/abonnements" style={{ textDecoration: 'underline' }}>Pro</Link>.
                </p>
              )}
              <Button variant="primary" size="lg" block icon="sensors" loading={busy} disabled={!ready}>
                Démarrer le live
              </Button>
              <p className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>Vos abonnés sont prévenus au lancement.</p>
            </form>
          </div>
        )}
      </main>
    </>
  );
}
