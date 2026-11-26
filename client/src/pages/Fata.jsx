import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapApp } from '@capacitor/app';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import { Badge, Button, EmptyState, IconButton, Skeleton } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import {
  describeFailure,
  FATA_STEPS,
  getStatus,
  isRevoked,
  listEligibleArcs,
  participate,
  readChallengeFromUrl,
  selectArc,
  startLink,
  stepStates,
  syncQueue,
} from '../services/fata';

const STEP_LABEL = {
  done: { text: 'Confirmée par Fata', tone: 'success', icon: 'check_circle' },
  queued: { text: 'En file d’envoi', tone: 'pause', icon: 'schedule' },
  failed: { text: 'Refusée', tone: 'failure', icon: 'error' },
  todo: { text: 'À faire', tone: undefined, icon: 'radio_button_unchecked' },
};

function LinkCard({ status, revoked, onLink, linking }) {
  const linkage = status?.linkage;
  if (!status?.connected) {
    return (
      <div className="card link-card">
        <span className="state-icon">
          <Icon name="link" />
        </span>
        <div className="grow">
          <strong>Compte Fata non relié</strong>
          <small>Reliez votre compte pour que vos actions XERA comptent dans le challenge.</small>
        </div>
      </div>
    );
  }
  return (
    <div className="card link-card">
      <span className={`state-icon ${revoked ? 'is-warn' : 'is-ok'}`}>
        <Icon name={revoked ? 'link_off' : 'verified_user'} filled />
      </span>
      <div className="grow">
        <strong>{revoked ? 'Autorisation retirée dans Fata' : 'Compte Fata relié'}</strong>
        <small>
          {linkage?.preferred_username ? `@${linkage.preferred_username}` : 'Compte lié'}
          {linkage?.fata_sub ? ` · ${linkage.fata_sub.slice(0, 14)}…` : ''}
        </small>
      </div>
      {revoked && (
        <Button size="sm" variant="primary" loading={linking} onClick={onLink}>
          Relier
        </Button>
      )}
    </div>
  );
}

export default function Fata() {
  const { user } = useAuth();
  const { toast } = useUi();
  const location = useLocation();
  const navigate = useNavigate();
  const ctx = useMemo(() => readChallengeFromUrl(location.search), [location.search]);

  const [status, setStatus] = useState(undefined);
  const [arcData, setArcData] = useState(null);
  const [arcError, setArcError] = useState('');
  const [picked, setPicked] = useState('');
  const [linking, setLinking] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const challengeId = ctx.challengeId || status?.challengeId || '';

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const s = await getStatus();
      setStatus(s);
      const cid = ctx.challengeId || s?.challengeId;
      if (s?.connected && cid) {
        try {
          await participate(cid);
          const data = await listEligibleArcs(cid);
          setArcData(data);
          setArcError('');
          setPicked(data.selection?.arc_id || data.arcs?.find((a) => a.eligible)?.id || '');
        } catch (error) {
          setArcError(error.message);
        }
      }
    } catch (error) {
      setStatus(null);
      toast('error', 'Statut Fata indisponible', error.message);
    }
  }, [user, ctx.challengeId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Retour de Fata (contrat §4) : succès ou erreur signalés par le serveur dans l'URL.
  useEffect(() => {
    if (ctx.fata === 'success' && status?.connected) toast('success', 'Compte Fata relié', 'Vos actions XERA peuvent maintenant compter.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.fata, status?.connected]);

  // Dans l'APK, la connexion Fata s'ouvre dans le navigateur : on rafraîchit au retour.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const handle = CapApp.addListener('resume', () => load());
    return () => {
      handle.then((h) => h.remove());
    };
  }, [load]);

  async function link() {
    if (!user) return navigate(`/connexion?redirect=${encodeURIComponent(`/fata${location.search}`)}`);
    setLinking(true);
    try {
      const url = await startLink(challengeId);
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url });
        setLinking(false);
      } else {
        window.location.assign(url);
      }
    } catch (error) {
      setLinking(false);
      toast('error', 'Connexion Fata impossible', error.message);
    }
  }

  async function confirmArc() {
    if (!picked) return;
    setSelecting(true);
    try {
      const res = await selectArc(challengeId, picked);
      if (res.delivery?.status === 'failed') toast('error', 'ARC non confirmé', describeFailure(res.delivery.error));
      else if (res.delivery?.status === 'delivered') toast('success', 'ARC transmis à Fata', res.arc?.title);
      else toast('info', 'ARC sélectionné', 'Sa confirmation part depuis la file XERA1.');
      await load();
    } catch (error) {
      toast('error', 'Sélection impossible', error.message);
    } finally {
      setSelecting(false);
    }
  }

  async function refresh() {
    setSyncing(true);
    try {
      await syncQueue();
    } catch {
      /* la file réessaiera seule */
    }
    await load();
    setSyncing(false);
  }

  const events = status?.pendingEvents || [];
  const states = stepStates(events);
  const revoked = isRevoked(events);
  const doneCount = Object.values(states).filter((s) => s === 'done').length;
  const latestFailure = events
    .filter((e) => e.status === 'failed')
    .sort((a, b) => Date.parse(b.updated_at || '') - Date.parse(a.updated_at || ''))[0];
  const selection = arcData?.selection;
  const selectedArc = arcData?.arcs?.find((a) => a.id === selection?.arc_id);
  const qualification = status?.qualification;

  return (
    <>
      <TopBar
        back="/"
        title="Challenge Fata"
        actions={user && status?.connected && <IconButton icon={syncing ? 'progress_activity' : 'refresh'} label="Actualiser" onClick={refresh} className={syncing ? 'is-spinning' : ''} />}
      />
      <main className="main">
        <section className="card fata-hero">
          <div className="fata-logos">
            <img src="/icons/fata.webp" alt="Fata" />
            <span className="x">×</span>
            <img src="/icons/logo.png" alt="XERA1" />
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">Partenariat</span>
            <h1>Challenge Fata × XERA1</h1>
            <p>Construisez un vrai projet sur XERA : trois actions, confirmées automatiquement auprès de Fata.</p>
          </div>
          {challengeId && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <Badge icon="sell">{challengeId}</Badge>
              {user && status?.connected && (
                <Badge tone={doneCount === 3 ? 'success' : undefined} icon="checklist">
                  {doneCount}/3 étapes
                </Badge>
              )}
            </div>
          )}
          {user && status?.connected && (
            <div className="progress" aria-label={`${doneCount} étapes sur 3`}>
              <span style={{ width: `${(doneCount / 3) * 100}%` }} />
            </div>
          )}
        </section>

        {ctx.fata === 'error' && (
          <div className="form-error" style={{ marginTop: 14 }}>
            <Icon name="error" />
            <span>
              {/access_denied/i.test(ctx.reason || '')
                ? 'Vous avez refusé l’autorisation sur Fata : aucune liaison n’a été créée. Vous pouvez réessayer quand vous voulez.'
                : ctx.reason || 'La connexion Fata a échoué. Aucune liaison n’a été créée.'}
            </span>
          </div>
        )}

        {!user ? (
          <div className="card card--pad stack" style={{ marginTop: 14 }}>
            <p>Connectez-vous à XERA1 pour relier votre compte Fata.</p>
            <Link className="btn btn--primary btn--lg btn--block" to={`/connexion?redirect=${encodeURIComponent(`/fata${location.search}`)}`}>
              <Icon name="login" /> Se connecter à XERA1
            </Link>
          </div>
        ) : status === undefined ? (
          <div className="stack" style={{ marginTop: 14 }}>
            <Skeleton height={78} radius={22} />
            <Skeleton height={220} radius={22} />
          </div>
        ) : status === null ? (
          <EmptyState icon="cloud_off" title="Service indisponible" text="Le statut du challenge n’a pas pu être chargé." action={<Button onClick={load}>Réessayer</Button>} />
        ) : (
          <>
            <div className="section-title">
              <h2>1. Compte Fata</h2>
            </div>
            <LinkCard status={status} revoked={revoked} onLink={link} linking={linking} />
            {!status.connected && (
              <div className="stack" style={{ marginTop: 12 }}>
                <Button variant="primary" size="lg" block loading={linking} onClick={link}>
                  <img src="/icons/fata.webp" alt="" style={{ width: 22, height: 22, borderRadius: 6 }} />
                  Connecter mon compte Fata
                </Button>
                <p className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>
                  Fata ne transmet que votre identifiant et votre pseudo. Aucun mot de passe, aucun e-mail.
                </p>
              </div>
            )}

            {status.connected && (
              <>
                <div className="section-title">
                  <h2>2. ARC du challenge</h2>
                </div>
                {!challengeId ? (
                  <div className="form-note">
                    <Icon name="info" />
                    <span>Ouvrez le challenge sur Fata puis touchez « Continuer sur XERA1 » pour charger son contexte.</span>
                  </div>
                ) : arcError ? (
                  <div className="form-error">
                    <Icon name="error" />
                    <span>{arcError}</span>
                  </div>
                ) : !arcData ? (
                  <Skeleton height={140} radius={16} />
                ) : selection?.arc_id ? (
                  <Link to={`/arc/${selection.arc_id}`} className="arc-option is-selected">
                    <span className="radio" />
                    <span className="grow">
                      <strong style={{ display: 'block' }}>{selectedArc?.title || 'ARC sélectionné'}</strong>
                      <small className="muted">Conservé pour tout le challenge</small>
                    </span>
                    <Icon name="lock" />
                  </Link>
                ) : (
                  <div className="stack">
                    {arcData.arcs?.length ? (
                      <div className="arc-choice" role="radiogroup" aria-label="Choisir l’ARC du challenge">
                        {arcData.arcs.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            role="radio"
                            aria-checked={picked === a.id}
                            disabled={!a.eligible}
                            className={`arc-option${picked === a.id ? ' is-selected' : ''}`}
                            onClick={() => setPicked(a.id)}
                          >
                            <span className="radio" />
                            <span className="grow">
                              <strong style={{ display: 'block' }}>{a.title || 'ARC sans titre'}</strong>
                              <small className="muted">
                                {a.milestoneCount} jalon{a.milestoneCount > 1 ? 's' : ''}
                                {a.eligible ? '' : ' · à compléter (titre, description, 3 jalons)'}
                              </small>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="form-note">
                        <Icon name="flag" />
                        <span>Aucun ARC personnel pour l’instant. Créez-en un avec au moins trois jalons.</span>
                      </div>
                    )}
                    <div className="row">
                      <Link to={`/creer/arc?fata=${encodeURIComponent(challengeId)}`} className="btn grow">
                        <Icon name="add" /> Nouvel ARC
                      </Link>
                      <Button variant="primary" className="grow" disabled={!picked} loading={selecting} onClick={confirmArc}>
                        Choisir cet ARC
                      </Button>
                    </div>
                    <p className="muted" style={{ fontSize: 12.5 }}>
                      Le choix est définitif pour ce challenge : les trois étapes portent sur le même ARC.
                    </p>
                  </div>
                )}

                <div className="section-title">
                  <h2>3. Les trois étapes</h2>
                </div>
                <div className="steps">
                  {FATA_STEPS.map((step, i) => {
                    const st = states[step.key];
                    const meta = STEP_LABEL[st];
                    return (
                      <div key={step.key} className={`step is-${st}`}>
                        <span className="num">
                          <Icon name={st === 'done' ? 'check' : step.icon} filled={st === 'done'} />
                        </span>
                        <div>
                          <strong>
                            {i + 1}. {step.title}
                          </strong>
                          <small>{step.detail}</small>
                        </div>
                        <Badge tone={meta.tone} icon={meta.icon}>
                          <span className="desktop-only">{meta.text}</span>
                          <span className="mobile-only-inline">{st === 'done' ? 'OK' : st === 'queued' ? 'Envoi' : st === 'failed' ? 'Refus' : 'À faire'}</span>
                        </Badge>
                      </div>
                    );
                  })}
                </div>
                {latestFailure && (
                  <div className="form-error" style={{ marginTop: 12 }}>
                    <Icon name="error" />
                    <span>{describeFailure(latestFailure.last_error)}</span>
                  </div>
                )}
                {selection?.arc_id && doneCount < 3 && (
                  <div className="row" style={{ marginTop: 12 }}>
                    <Link to={`/creer/preuve?arc=${selection.arc_id}`} className="btn grow">
                      <Icon name="add_photo_alternate" /> Publier une preuve
                    </Link>
                    <Link to={`/arc/${selection.arc_id}`} className="btn grow">
                      <Icon name="task_alt" /> Valider un jalon
                    </Link>
                  </div>
                )}
                {doneCount === 3 && !qualification && (
                  <div className="form-note" style={{ marginTop: 12 }}>
                    <Icon name="hourglass_top" />
                    <span>Les trois étapes XERA sont confirmées. Terminez les conditions restantes sur Fata (XP, profil) pour réussir le challenge.</span>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <div className="section-title">
          <h2>Récompenses</h2>
        </div>
        <div className="reward-grid">
          <div className="reward">
            <Icon name="workspace_premium" filled />
            <strong>6 mois de Fata Pro</strong>
            <span>Offerts par Fata aux participants qualifiés.</span>
          </div>
          <div className="reward">
            <Icon name="emoji_events" filled />
            <strong>Badge Fata</strong>
            <span>{qualification?.badge_awarded ? 'Attribué sur votre profil.' : 'Affiché sur votre profil XERA.'}</span>
          </div>
          <div className="reward">
            <Icon name="trending_up" />
            <strong>Visibilité ×{qualification?.visibility_multiplier || 5}</strong>
            <span>{qualification?.visibility_boost_active ? 'Active dans le fil.' : 'Vos projets mis en avant.'}</span>
          </div>
          <div className="reward">
            <Icon name="picture_as_pdf" />
            <strong>Certificat</strong>
            <span>PDF aux logos Fata et XERA1.</span>
          </div>
        </div>

        <div className="section-title">
          <h2>Comment ça marche</h2>
        </div>
        <ol className="timeline card card--pad">
          {[
            ['Inscrivez-vous au challenge sur Fata', 'Puis touchez « Continuer sur XERA1 ».'],
            ['Reliez votre compte Fata', 'Une seule fois, réutilisable pour les prochains challenges.'],
            ['Réalisez les trois actions sur le même ARC', 'XERA les confirme à Fata automatiquement, même si vous fermez l’appli.'],
            ['Terminez les conditions Fata', 'Fata valide le challenge et attribue les récompenses.'],
          ].map(([title, sub], i) => (
            <li key={i}>
              <span className="node">{i + 1}</span>
              <span className="label">
                {title}
                <small>{sub}</small>
              </span>
            </li>
          ))}
        </ol>
        {challengeId && (
          <a className="btn btn--block" style={{ marginTop: 14 }} href={`https://fata.app/challenge/${encodeURIComponent(challengeId)}`} target="_blank" rel="noreferrer">
            <Icon name="open_in_new" /> Ouvrir le challenge sur Fata
          </a>
        )}
      </main>
    </>
  );
}
