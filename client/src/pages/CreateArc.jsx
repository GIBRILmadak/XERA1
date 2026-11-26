import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import MediaPicker from '../components/MediaPicker';
import { Button, IconButton } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { ARC_STAGES } from '../lib/format';
import { createArc, createProof } from '../services/data';
import { describeFailure, getStoredChallenge, selectArc } from '../services/fata';

export default function CreateArc() {
  const { user } = useAuth();
  const { toast } = useUi();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fataChallenge = params.get('fata') || '';
  const minMilestones = fataChallenge ? 3 : 1;

  const [form, setForm] = useState({ title: '', goal: '', description: '', stage_level: 'idee', end: '' });
  const [milestones, setMilestones] = useState(['', '', '']);
  const [cover, setCover] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const named = milestones.map((m) => m.trim()).filter(Boolean);
  const valid =
    form.title.trim() && named.length >= minMilestones && (!fataChallenge || form.description.trim());

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!valid) {
      setError(
        fataChallenge
          ? 'Pour le challenge Fata : un titre, une description et au moins trois jalons nommés.'
          : 'Donnez un titre et au moins un jalon.',
      );
      return;
    }
    setBusy(true);
    try {
      const start = new Date();
      const duration = form.end ? Math.max(1, Math.ceil((new Date(form.end) - start) / 86400000)) : null;
      const arc = await createArc(user.id, {
        ...form,
        milestones: named,
        duration_days: duration,
        start_date: start.toISOString(),
        media_url: cover?.url,
        media_type: cover?.type,
      });
      // Trace de lancement (jour 0), comme l'ancienne interface. Sans média :
      // elle ne doit jamais compter comme preuve pour un challenge.
      createProof(user.id, {
        arc_id: arc.id,
        day_number: 0,
        state: 'pause',
        title: `NOUVEAU PROJET: ${form.title.trim()}`,
        description: [form.goal.trim() && `Objectif: ${form.goal.trim()}`, form.description.trim()].filter(Boolean).join('\n\n') || "Début d'un nouveau projet.",
      }).catch(() => {});

      if (fataChallenge) {
        try {
          const res = await selectArc(fataChallenge, arc.id);
          if (res.delivery?.status === 'failed') toast('error', 'ARC créé, mais refusé par Fata', describeFailure(res.delivery.error));
          else toast('success', 'ARC créé et associé au challenge');
        } catch (err) {
          toast('error', 'ARC créé, association à refaire', err.message);
        }
        navigate(`/fata?challengeId=${encodeURIComponent(fataChallenge)}`);
      } else {
        toast('success', 'Projet lancé', 'Publiez votre première preuve quand vous êtes prêt.');
        navigate(`/arc/${arc.id}`);
      }
    } catch (err) {
      setError(err.message || 'Création impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar back title="Nouvel ARC" />
      <main className="main">
        <form className="stack" onSubmit={submit} noValidate>
          {fataChallenge && (
            <div className="fata-strip" style={{ cursor: 'default' }}>
              <img src="/icons/fata.webp" alt="" />
              <div className="grow">
                <strong>ARC pour le challenge Fata</strong>
                <span>Il sera associé automatiquement à « {fataChallenge || getStoredChallenge()} ».</span>
              </div>
            </div>
          )}
          <MediaPicker value={cover} onChange={setCover} folder="arcs" label="Image de couverture (facultatif)" />
          <div className="field">
            <label htmlFor="a-title">Titre du projet *</label>
            <input id="a-title" className="input" placeholder="Ex. Caisse mobile hors-ligne" value={form.title} onChange={set('title')} maxLength={90} required />
          </div>
          <div className="field">
            <label htmlFor="a-goal">Objectif</label>
            <input id="a-goal" className="input" placeholder="Le résultat concret que vous visez" value={form.goal} onChange={set('goal')} maxLength={160} />
          </div>
          <div className="field">
            <label htmlFor="a-desc">Description{fataChallenge ? ' *' : ''}</label>
            <textarea id="a-desc" className="textarea" placeholder="Le problème, votre approche, pour qui…" value={form.description} onChange={set('description')} maxLength={2000} />
          </div>

          <div className="field">
            <span className="field-label">
              Jalons {fataChallenge ? '(3 minimum) *' : '*'}
            </span>
            <div className="stack" style={{ gap: 8 }}>
              {milestones.map((m, i) => (
                <div key={i} className="milestone-input">
                  <span className="n">{i + 1}</span>
                  <input
                    className="input"
                    placeholder={['Ex. Maquette terminée', 'Ex. Première version fonctionnelle', 'Ex. Mise en ligne'][i] || 'Jalon suivant'}
                    value={m}
                    onChange={(e) => setMilestones((list) => list.map((v, j) => (j === i ? e.target.value : v)))}
                    aria-label={`Jalon ${i + 1}`}
                    maxLength={120}
                  />
                  {milestones.length > 1 && (
                    <IconButton type="button" icon="do_not_disturb_on" label="Retirer ce jalon" onClick={() => setMilestones((list) => list.filter((_, j) => j !== i))} />
                  )}
                </div>
              ))}
              {milestones.length < 12 && (
                <Button type="button" variant="ghost" icon="add" onClick={() => setMilestones((l) => [...l, ''])} style={{ justifySelf: 'start' }}>
                  Ajouter un jalon
                </Button>
              )}
            </div>
          </div>

          <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div className="field grow">
              <label htmlFor="a-stage">Étape actuelle</label>
              <select id="a-stage" className="select" value={form.stage_level} onChange={set('stage_level')}>
                {ARC_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field grow">
              <label htmlFor="a-end">Date visée</label>
              <input id="a-end" type="date" className="input" value={form.end} onChange={set('end')} min={new Date().toISOString().slice(0, 10)} />
            </div>
          </div>

          {error && (
            <div className="form-error">
              <Icon name="error" />
              <span>{error}</span>
            </div>
          )}
          <div className="sticky-actions">
            <Button variant="primary" size="lg" block icon="rocket_launch" loading={busy}>
              Lancer le projet
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}
