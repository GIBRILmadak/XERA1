import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import ContentCard from '../components/ContentCard';
import MediaViewer from '../components/MediaViewer';
import { Avatar, Badge, Button, CardSkeleton, EmptyState, IconLink, Sheet, UserName } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { ARC_STAGES, ARC_STATUS, stageLabel } from '../lib/format';
import { deleteArc, fetchArc, fetchArcContent, fetchArcValidations, milestoneList, updateArc, validateMilestone } from '../services/data';
import { syncQueue } from '../services/fata';

/** Modifier un ARC (mêmes champs que l'ancienne interface) ou le supprimer. */
function ArcEditSheet({ open, onClose, arc, onSaved }) {
  const { toast } = useUi();
  const navigate = useNavigate();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF({ title: arc.title || '', goal: arc.goal || '', description: arc.description || '', milestones: milestoneList(arc).map((m) => m.title).join('\n'), status: arc.status || 'in_progress', stage_level: arc.stage_level || 'idee' });
  }, [open, arc]);
  if (!f) return null;
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await updateArc(arc.id, {
        title: f.title.trim(),
        goal: f.goal.trim() || null,
        description: f.description.trim() || null,
        milestones: f.milestones.split(/\r?\n/).map((t) => t.trim()).filter(Boolean).map((title) => ({ title })),
        status: f.status,
        stage_level: f.stage_level,
      });
      onSaved(saved);
      toast('success', 'Projet mis à jour');
      onClose();
    } catch (err) {
      toast('error', 'Modification impossible', err.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!window.confirm('Supprimer ce projet ? Ses preuves resteront sur votre profil.')) return;
    try {
      await deleteArc(arc.id);
      toast('success', 'Projet supprimé');
      navigate(`/u/${arc.user_id}`, { replace: true });
    } catch (err) {
      toast('error', 'Suppression impossible', err.message);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Modifier le projet">
      <form className="stack" onSubmit={save}>
        <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={90} aria-label="Titre" />
        <input className="input" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} placeholder="Objectif" maxLength={160} aria-label="Objectif" />
        <textarea className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Description" aria-label="Description" />
        <div className="field">
          <label htmlFor="ae-ms">Jalons (un par ligne)</label>
          <textarea id="ae-ms" className="textarea" value={f.milestones} onChange={(e) => setF({ ...f, milestones: e.target.value })} />
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <select className="select grow" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Statut">
            {Object.entries(ARC_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="select grow" value={f.stage_level} onChange={(e) => setF({ ...f, stage_level: e.target.value })} aria-label="Étape">
            {ARC_STAGES.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
          </select>
        </div>
        <Button variant="primary" block loading={busy} icon="save">Enregistrer</Button>
        <Button type="button" variant="ghost" block className="btn--danger" icon="delete" onClick={remove}>Supprimer le projet</Button>
      </form>
    </Sheet>
  );
}

function ValidateSheet({ open, onClose, arc, proofs, isOwner, onDone }) {
  const { user } = useAuth();
  const { toast } = useUi();
  const eligible = proofs.filter((p) => (p.media_url || p.media_urls?.length) && String(p.description || '').trim());
  const [contentId, setContentId] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setContentId(eligible[0]?.id || '');
      setComment('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit(e) {
    e.preventDefault();
    if (isOwner && !comment.trim()) return;
    setBusy(true);
    try {
      const res = await validateMilestone({ arcId: arc.id, contentId, validatorId: user.id, isOwner, comment });
      if (res?.duplicate) toast('info', 'Déjà validé', 'Votre validation existe déjà pour cette preuve.');
      else {
        toast('success', 'Jalon validé', isOwner ? 'La confirmation part vers Fata si cet ARC est inscrit au challenge.' : 'Merci pour votre retour.');
        if (isOwner) syncQueue().catch(() => {});
      }
      onDone();
      onClose();
    } catch (error) {
      toast('error', 'Validation impossible', error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Valider un jalon">
      {eligible.length === 0 ? (
        <EmptyState art="proof"
          icon="add_photo_alternate"
          title="Il faut d'abord une preuve"
          text="Un jalon se valide avec une preuve qui a un média et une description."
          action={
            <Link to={`/creer/preuve?arc=${arc.id}`} className="btn btn--primary">
              <Icon name="add" /> Publier une preuve
            </Link>
          }
        />
      ) : (
        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label htmlFor="v-proof">Preuve qui montre le résultat</label>
            <select id="v-proof" className="select" value={contentId} onChange={(e) => setContentId(e.target.value)}>
              {eligible.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || 'Preuve'} {p.day_number != null ? `· jour ${p.day_number}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="v-comment">{isOwner ? 'Résultat obtenu *' : 'Votre retour (facultatif)'}</label>
            <textarea
              id="v-comment"
              className="textarea"
              placeholder={isOwner ? 'Ex. La synchronisation fonctionne avec 6 boutiques, sans doublon.' : 'Ce que vous avez constaté'}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              required={isOwner}
            />
            {isOwner && <span className="hint">Cette description accompagne la validation du jalon.</span>}
          </div>
          <Button variant="primary" size="lg" block icon="task_alt" loading={busy} disabled={isOwner && !comment.trim()}>
            Valider le jalon
          </Button>
        </form>
      )}
    </Sheet>
  );
}

export default function ArcDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [arc, setArc] = useState(undefined);
  const [proofs, setProofs] = useState([]);
  const [validations, setValidations] = useState([]);
  const [sheet, setSheet] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [editArc, setEditArc] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, p, v] = await Promise.all([fetchArc(id), fetchArcContent(id), fetchArcValidations(id)]);
      setArc(a);
      setProofs(p);
      setValidations(v);
    } catch {
      setArc(null);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (arc === undefined)
    return (
      <>
        <TopBar back title="Projet" />
        <main className="main">
          <CardSkeleton />
        </main>
      </>
    );
  if (!arc)
    return (
      <>
        <TopBar back title="Projet" />
        <main className="main">
          <EmptyState art="launch" icon="flag" title="Projet introuvable" text="Il a peut-être été supprimé ou rendu privé." />
        </main>
      </>
    );

  const isOwner = user?.id === arc.user_id;
  const milestones = milestoneList(arc);
  const validatedIds = new Set(validations.map((v) => v.content_id));
  const doneCount = Math.min(arc.validated ?? new Set(validations.filter((v) => v.validation_type === 'self_reported').map((v) => v.content_id)).size, milestones.length);
  const status = ARC_STATUS[arc.status] || ARC_STATUS.in_progress;
  const wins = proofs.filter((p) => p.state === 'success').length;

  return (
    <>
      <TopBar
        back
        title={arc.title}
        actions={
          isOwner && (
            <>
              <IconLink to={`/creer/preuve?arc=${arc.id}`} icon="add_photo_alternate" label="Ajouter une preuve" />
              <button className="icon-btn" onClick={() => setEditArc(true)} aria-label="Modifier le projet"><Icon name="edit" /></button>
            </>
          )
        }
      />
      {isOwner && <ArcEditSheet open={editArc} onClose={() => setEditArc(false)} arc={arc} onSaved={(saved) => setArc((a) => ({ ...a, ...saved }))} />}
      <main className="main">
        <section className="arc-hero">
          <div className="cover" onClick={() => arc.media_url && setViewer(arc.media_url)} role={arc.media_url ? 'button' : undefined} aria-label={arc.media_url ? 'Voir la couverture en grand' : undefined}>
            {arc.media_url ? <img src={arc.media_url} alt="" /> : <div className="arc-cover-fallback" style={{ height: '100%' }}><Icon name="flag" size={48} /></div>}
          </div>
          <MediaViewer src={viewer} alt={arc.title} onClose={() => setViewer(null)} />
        </section>
        <div className="arc-title-block">
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <Badge tone={status.tone} icon={status.icon}>{status.label}</Badge>
            {stageLabel(arc.stage_level) && <Badge icon="stairs">{stageLabel(arc.stage_level)}</Badge>}
          </div>
          <h1>{arc.title}</h1>
          {arc.goal && <p className="goal">{arc.goal}</p>}
          {arc.users && (
            <Link to={`/u/${arc.user_id}`} className="row" style={{ gap: 10 }}>
              <Avatar user={arc.users} size={32} />
              <UserName user={arc.users} />
            </Link>
          )}
        </div>

        {arc.description && <p style={{ color: 'var(--text-2)', marginTop: 16, whiteSpace: 'pre-line' }}>{arc.description}</p>}

        <div className="stats" style={{ marginTop: 18 }}>
          <div className="stat"><strong>{proofs.length}</strong><span>Preuves</span></div>
          <div className="stat"><strong>{wins}</strong><span>Avancées</span></div>
          <div className="stat"><strong>{doneCount}/{milestones.length}</strong><span>Jalons</span></div>
        </div>

        <div className="section-title">
          <h2>Jalons</h2>
          {user && proofs.length > 0 && (
            <Button size="sm" icon="task_alt" onClick={() => setSheet(true)}>
              {isOwner ? 'Valider un jalon' : 'Témoigner'}
            </Button>
          )}
        </div>
        {milestones.length ? (
          <ol className="timeline card card--pad">
            {milestones.map((m, i) => (
              <li key={i} className={i < doneCount ? 'is-done' : ''}>
                <span className="node">{i < doneCount ? <Icon name="check" size={18} /> : i + 1}</span>
                <span className="label">
                  {m.title}
                  <small>{i < doneCount ? 'Validé' : i === doneCount ? 'Prochaine étape' : 'À venir'}</small>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">Aucun jalon défini.</p>
        )}

        <div className="section-title">
          <h2>Parcours</h2>
          <span className="muted" style={{ fontSize: 13 }}>{proofs.length} preuve{proofs.length > 1 ? 's' : ''}</span>
        </div>
        {proofs.length === 0 ? (
          <EmptyState art="proof"
            icon="photo_camera"
            title="Pas encore de preuve"
            text={isOwner ? 'Publiez votre première preuve pour lancer le parcours.' : 'Le parcours de ce projet commence bientôt.'}
            action={isOwner && <Link to={`/creer/preuve?arc=${arc.id}`} className="btn btn--primary"><Icon name="add" /> Publier une preuve</Link>}
          />
        ) : (
          proofs.map((p, i) => <ContentCard key={p.id} content={{ ...p, arcs: null }} index={i} milestone={validatedIds.has(p.id)} allowValidation />)
        )}
      </main>
      {user && <ValidateSheet open={sheet} onClose={() => setSheet(false)} arc={arc} proofs={proofs} isOwner={isOwner} onDone={load} />}
    </>
  );
}
