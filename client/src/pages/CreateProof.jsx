import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import MediaPicker from '../components/MediaPicker';
import { Button } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { STATE_META } from '../lib/format';
import { createProof, fetchUserArcs, nextDayNumber } from '../services/data';
import { syncQueue } from '../services/fata';

export default function CreateProof() {
  const { user } = useAuth();
  const { toast } = useUi();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [arcs, setArcs] = useState([]);
  const [arcId, setArcId] = useState(params.get('arc') || '');
  const [state, setState] = useState('success');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUserArcs(user.id)
      .then((list) => {
        const open = list.filter((a) => a.status !== 'completed' && a.status !== 'abandoned' && !a.page_id);
        setArcs(open);
        if (!params.get('arc') && open[0]) setArcId(open[0].id);
      })
      .catch(() => {});
  }, [user.id, params]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!title.trim()) return setError('Donnez un titre à votre preuve.');
    setBusy(true);
    try {
      const day = arcId ? await nextDayNumber(arcId) : null;
      await createProof(user.id, { arc_id: arcId || null, day_number: day, state, title, description, media_url: media?.url, media_type: media?.type });
      // La tâche d'envoi Fata est créée par la base dans la même transaction ;
      // on demande seulement une livraison immédiate (la file réessaie sinon).
      syncQueue().catch(() => {});
      toast('success', 'Preuve publiée', 'Elle apparaît dans le fil et sur votre parcours.');
      navigate(arcId ? `/arc/${arcId}` : `/u/${user.id}`);
    } catch (err) {
      setError(err.message || 'Publication impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar back title="Nouvelle preuve" />
      <main className="main">
        <form className="stack" onSubmit={submit}>
          <div className="field">
            <span className="field-label">Où en êtes-vous ?</span>
            <div className="state-picker" role="radiogroup">
              {Object.entries(STATE_META).map(([key, meta]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={state === key}
                  data-tone={meta.tone}
                  className={state === key ? 'is-active' : ''}
                  onClick={() => setState(key)}
                >
                  <Icon name={meta.icon} filled={state === key} />
                  {meta.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="p-arc">Projet</label>
            {arcs.length ? (
              <select id="p-arc" className="select" value={arcId} onChange={(e) => setArcId(e.target.value)}>
                <option value="">Sans projet</option>
                {arcs.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            ) : (
              <div className="form-note">
                <Icon name="flag" />
                <span>
                  Aucun projet en cours. <Link to="/creer/arc" style={{ fontWeight: 600, color: 'var(--text)' }}>Lancer un ARC</Link>
                </span>
              </div>
            )}
          </div>

          <MediaPicker value={media} onChange={setMedia} />

          <div className="field">
            <label htmlFor="p-title">Titre *</label>
            <input id="p-title" className="input" placeholder="Ex. La synchronisation tient enfin" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
          </div>
          <div className="field">
            <label htmlFor="p-desc">Ce que vous avez fait</label>
            <textarea id="p-desc" className="textarea" placeholder="Racontez l’avancée, l’obstacle ou la pause, avec des détails concrets." value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} />
            <span className="hint">Une preuve avec média et description compte pour le challenge Fata.</span>
          </div>

          {error && (
            <div className="form-error">
              <Icon name="error" />
              <span>{error}</span>
            </div>
          )}
          <div className="sticky-actions">
            <Button variant="primary" size="lg" block icon="send" loading={busy}>
              Publier
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}
