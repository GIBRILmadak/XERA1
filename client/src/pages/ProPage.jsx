import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import ArcCard from '../components/ArcCard';
import MediaPicker from '../components/MediaPicker';
import { Avatar, Badge, Button, CardSkeleton, EmptyState, Sheet, UserName } from '../components/ui';
import { useBadgeSets } from '../components/Badges';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { compact, timeAgo } from '../lib/format';
import { isPlanActive } from '../services/badges';
import {
  CERT_TYPES,
  certifyUser,
  createPagePost,
  getPage,
  pageArcs,
  pageCta,
  pageFollowState,
  pageLeads,
  pagePosts,
  pageTeam,
  recommendedProfiles,
  revokeCertification,
  scoreUserAgainstPage,
  searchUsers,
  setPageFollow,
  submitLead,
  updatePage,
} from '../services/pages';

function PostCard({ post }) {
  const event = post.metadata?.sub_type === 'event';
  return (
    <article className="card page-post">
      {post.media_url && <img src={post.media_url} alt="" loading="lazy" />}
      <div className="page-post-body">
        <Badge tone={event ? 'gold' : 'violet'} icon={event ? 'event' : 'campaign'}>
          {event ? 'Événement' : 'Actualité'}
        </Badge>
        <h3>{post.title}</h3>
        {event && (post.metadata?.event_date || post.metadata?.location) && (
          <p className="page-post-meta">
            {post.metadata.event_date && (
              <span>
                <Icon name="calendar_month" size={16} /> {new Date(post.metadata.event_date).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            )}
            {post.metadata.location && (
              <span>
                <Icon name="location_on" size={16} /> {post.metadata.location}
              </span>
            )}
          </p>
        )}
        <p className="muted" style={{ whiteSpace: 'pre-line' }}>{post.description}</p>
        <small className="muted">{timeAgo(post.created_at)}</small>
      </div>
    </article>
  );
}

function PostSheet({ open, onClose, page, onCreated }) {
  const { user } = useAuth();
  const { toast } = useUi();
  const [kind, setKind] = useState('news');
  const [f, setF] = useState({ title: '', description: '', media: null, date: '', time: '', location: '' });
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!f.title.trim() || !f.description.trim()) return toast('error', 'Titre et texte requis');
    setBusy(true);
    try {
      const post = await createPagePost(page, user.id, { kind, title: f.title, description: f.description, media_url: f.media?.url, eventDate: f.date ? `${f.date}T${f.time || '00:00'}` : null, location: f.location });
      onCreated(post);
      toast('success', kind === 'event' ? 'Événement publié' : 'Actualité publiée');
      setF({ title: '', description: '', media: null, date: '', time: '', location: '' });
      onClose();
    } catch (err) {
      toast('error', 'Publication impossible', err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Publier sur la page">
      <form className="stack" onSubmit={submit}>
        <div className="tabs">
          <button type="button" className={`tab${kind === 'news' ? ' is-active' : ''}`} onClick={() => setKind('news')}>
            <Icon name="campaign" /> Actualité
          </button>
          <button type="button" className={`tab${kind === 'event' ? ' is-active' : ''}`} onClick={() => setKind('event')}>
            <Icon name="event" /> Événement
          </button>
        </div>
        <input className="input" placeholder={kind === 'event' ? 'Ex. Meetup XERA1 à Goma' : 'Titre de votre actualité'} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={140} aria-label="Titre" />
        {kind === 'event' && (
          <>
            <div className="row">
              <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Date" />
              <input className="input" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} aria-label="Heure" />
            </div>
            <input className="input" placeholder="Lieu ou lien de visio" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} aria-label="Lieu" />
          </>
        )}
        <textarea className="textarea" placeholder={kind === 'event' ? 'Détails, agenda, intervenants…' : 'Votre annonce officielle…'} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={3000} aria-label="Texte" />
        {kind === 'news' && <MediaPicker value={f.media} onChange={(v) => setF({ ...f, media: v })} folder="pages" label="Ajouter une image (facultatif)" />}
        <Button variant="primary" block loading={busy} icon="send">Publier maintenant</Button>
      </form>
    </Sheet>
  );
}

function SettingsSheet({ open, onClose, page, onSaved }) {
  const { toast } = useUi();
  const cta = page.metadata?.professional_cta || {};
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF({ name: page.name, bio: page.bio || '', description: page.description || '', location: page.location || '', website_url: page.website_url || '', industry: page.industry || '', needs: (page.hiring_needs || []).join(', '), ctaLabel: cta.label || '', ctaUrl: cta.url || '', avatar: page.avatar_url ? { url: page.avatar_url } : null, banner: page.banner_url ? { url: page.banner_url } : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await updatePage(page.id, {
        name: f.name.trim(),
        bio: f.bio,
        description: f.description,
        location: f.location || null,
        website_url: f.website_url,
        industry: f.industry || null,
        hiring_needs: f.needs.split(',').map((x) => x.trim()).filter(Boolean),
        avatar_url: f.avatar?.url || null,
        banner_url: f.banner?.url || null,
        metadata: { ...(page.metadata || {}), professional_cta: { ...cta, label: f.ctaLabel || 'Visiter le site', url: f.ctaUrl || f.website_url } },
      });
      onSaved(saved);
      toast('success', 'Page mise à jour');
      onClose();
    } catch (err) {
      toast('error', 'Enregistrement impossible', err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Paramètres de la page">
      <form className="stack" onSubmit={save}>
        {[
          ['name', 'Nom'],
          ['bio', 'Slogan'],
          ['location', 'Localisation'],
          ['industry', 'Secteurs'],
          ['website_url', 'Site web'],
          ['needs', 'Compétences recherchées (séparées par des virgules)'],
          ['ctaLabel', 'Texte du bouton d’action'],
          ['ctaUrl', 'Lien ou numéro du bouton'],
        ].map(([k, l]) => (
          <div className="field" key={k}>
            <label htmlFor={`ps-${k}`}>{l}</label>
            <input id={`ps-${k}`} className="input" value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
        <div className="field">
          <label htmlFor="ps-desc">Description</label>
          <textarea id="ps-desc" className="textarea" value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </div>
        <div className="field">
          <span className="field-label">Logo</span>
          <MediaPicker value={f.avatar} onChange={(v) => setF({ ...f, avatar: v })} folder="pages" label="Changer le logo" />
        </div>
        <div className="field">
          <span className="field-label">Bannière</span>
          <MediaPicker value={f.banner} onChange={(v) => setF({ ...f, banner: v })} folder="pages" label="Changer la bannière" />
        </div>
        <Button variant="primary" block loading={busy}>Enregistrer</Button>
      </form>
    </Sheet>
  );
}

function TeamSheet({ open, onClose, page }) {
  const { toast } = useUi();
  const [team, setTeam] = useState(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [type, setType] = useState('employee');
  const [title, setTitle] = useState('');
  const load = useCallback(() => pageTeam(page.id).then(setTeam), [page.id]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);
  useEffect(() => {
    const t = setTimeout(() => searchUsers(q).then(setFound), 280);
    return () => clearTimeout(t);
  }, [q]);
  async function add(u) {
    try {
      await certifyUser(page.id, u.id, type, title.trim());
      toast('success', 'Membre certifié', u.name);
      setQ('');
      setTitle('');
      load();
    } catch (e) {
      toast('error', 'Certification impossible', e.message);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Équipe certifiée">
      <div className="stack">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <select className="select" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
            {CERT_TYPES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <input className="input grow" placeholder="Poste (ex. Designer)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Poste" />
        </div>
        <div className="input-wrap">
          <Icon name="person_search" />
          <input className="input" placeholder="Rechercher un membre XERA" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un membre" />
        </div>
        {found.length > 0 && (
          <div className="list">
            {found.map((u) => (
              <button key={u.id} className="list-item" onClick={() => add(u)}>
                <Avatar user={u} size={34} />
                <UserName user={u} className="title grow" />
                <Icon name="verified_user" />
              </button>
            ))}
          </div>
        )}
        <div className="divider" />
        {team === null ? (
          <p className="muted">Chargement…</p>
        ) : team.length === 0 ? (
          <p className="muted">Aucun membre certifié pour l’instant.</p>
        ) : (
          <div className="list">
            {team.map((c) => (
              <div key={c.id} className="list-item">
                <Avatar user={c.users || {}} size={34} />
                <span className="grow">
                  <UserName user={c.users || {}} className="title" />
                  <span className="sub" style={{ display: 'block' }}>{c.title} · {CERT_TYPES.find(([v]) => v === c.type)?.[1] || c.type}</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="btn--danger"
                  onClick={async () => {
                    await revokeCertification(c.id);
                    load();
                  }}
                >
                  Retirer
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function LeadSheet({ open, onClose, page }) {
  const { toast } = useUi();
  const [f, setF] = useState({ name: '', company: '', email: '' });
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await submitLead(page, f);
      toast('success', 'Demande envoyée', `${page.name} vous répondra par e-mail.`);
      onClose();
    } catch (err) {
      toast('error', err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={pageCta(page).label}>
      <form className="stack" onSubmit={submit}>
        <p className="muted">Recevez une réponse de {page.name}.</p>
        <input className="input" required placeholder="Nom complet" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="input" required placeholder="Entreprise / fonds" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
        <input className="input" type="email" required placeholder="E-mail professionnel" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Button variant="primary" block loading={busy}>Envoyer ma demande</Button>
      </form>
    </Sheet>
  );
}

export default function ProPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const { toast } = useUi();
  const navigate = useNavigate();
  const badgeSets = useBadgeSets();
  const [page, setPage] = useState(undefined);
  const [follow, setFollow] = useState({ following: false, count: 0 });
  const [posts, setPosts] = useState(null);
  const [arcs, setArcs] = useState([]);
  const [team, setTeam] = useState([]);
  const [tab, setTab] = useState('posts');
  const [sheet, setSheet] = useState('');
  const [recos, setRecos] = useState([]);
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    let alive = true;
    setPage(undefined);
    getPage(slug).then(async (p) => {
      if (!alive) return;
      setPage(p || null);
      if (!p) return;
      const [f, po, ar, te] = await Promise.all([pageFollowState(p.id, user?.id), pagePosts(p.id), pageArcs(p.id), pageTeam(p.id)]);
      if (!alive) return;
      setFollow(f);
      setPosts(po);
      setArcs(ar);
      setTeam(te);
    });
    return () => {
      alive = false;
    };
  }, [slug, user?.id]);

  const isOwner = Boolean(user && page && user.id === page.owner_id);
  const verified = Boolean(page && (page.is_verified || badgeSets.pages.has(page.id)));
  const entitled = verified || isPlanActive(user);

  useEffect(() => {
    if (!isOwner || !page) return;
    if (entitled) recommendedProfiles(page, team.map((t) => t.user_id)).then(setRecos);
    pageLeads(page.id).then(setLeads);
  }, [isOwner, page, entitled, team]);

  async function toggleFollow() {
    if (!user) return navigate(`/connexion?redirect=${encodeURIComponent(`/page/${slug}`)}`);
    const next = !follow.following;
    setFollow((f) => ({ following: next, count: f.count + (next ? 1 : -1) }));
    try {
      await setPageFollow(page.id, user.id, next);
    } catch {
      setFollow((f) => ({ following: !next, count: f.count + (next ? -1 : 1) }));
      toast('error', 'Action impossible');
    }
  }

  if (page === undefined)
    return (
      <>
        <TopBar back title="Page pro" />
        <main className="main"><CardSkeleton /></main>
      </>
    );
  if (!page)
    return (
      <>
        <TopBar back title="Page pro" />
        <main className="main"><EmptyState art="empty" title="Page introuvable" /></main>
      </>
    );

  const cta = pageCta(page);
  const mine = user && !isOwner ? scoreUserAgainstPage(user, page) : null;

  return (
    <>
      <TopBar back title={page.name} />
      <main className="main">
        <div className="profile-cover">{page.banner_url && <img src={page.banner_url} alt="" />}</div>
        <div className="profile-id">
          {page.avatar_url ? <img className="page-logo" src={page.avatar_url} alt="" /> : <span className="page-logo page-logo--empty"><Icon name="apartment" size={36} /></span>}
          {isOwner && (
            <div className="profile-actions">
              <Button icon="settings" onClick={() => setSheet('settings')}>Paramètres</Button>
            </div>
          )}
        </div>
        <div className="profile-name">
          <h1>
            {page.name}
            {verified && <img src="/icons/verify_page.svg" alt="Page vérifiée" title="Page vérifiée" style={{ width: 20, height: 20 }} />}
            <span className="pro-tag">PRO</span>
          </h1>
          {page.bio && <span className="headline">{page.bio}</span>}
          <span className="muted" style={{ fontSize: 13.5 }}>
            {[page.industry, page.location].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className="profile-counts">
          <span><strong>{compact(follow.count)}</strong>abonnés</span>
          <span><strong>{team.length}</strong>membres certifiés</span>
          <span><strong>{posts?.length || 0}</strong>publications</span>
        </div>
        <div className="profile-cta">
          {isOwner ? (
            <>
              <Button variant="primary" icon="edit_square" onClick={() => setSheet('post')}>Publier</Button>
              <Button icon="groups" onClick={() => setSheet('team')}>Équipe</Button>
              <Link className="btn" to={`/creer/arc?page=${page.id}`}><Icon name="flag" /> Projet</Link>
            </>
          ) : (
            <>
              <Button variant={follow.following ? undefined : 'primary'} icon={follow.following ? 'check' : 'add'} onClick={toggleFollow}>
                {follow.following ? 'Abonné' : 'S’abonner'}
              </Button>
              {cta.url ? (
                <a className="btn" href={cta.url} target={cta.type === 'phone' ? undefined : '_blank'} rel="noreferrer">
                  <Icon name={cta.type === 'phone' ? 'call' : 'open_in_new'} /> {cta.label}
                </a>
              ) : (
                <Button icon="mail" onClick={() => setSheet('lead')}>{cta.label === 'Visiter le site' ? 'Contacter' : cta.label}</Button>
              )}
            </>
          )}
        </div>

        {mine && (page.hiring_needs || []).length > 0 && (
          <section className="card card--pad versus" style={{ marginTop: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16 }}>Moi vs eux</h3>
              <Badge tone="violet" icon="insights">Correspondance</Badge>
            </div>
            <div className={entitled ? '' : 'versus-locked'}>
              <div className="versus-row"><span>Moi</span><div className="progress"><span style={{ width: `${Math.max(4, mine.score)}%` }} /></div><strong>{mine.score} %</strong></div>
              <div className="chip-wrap" style={{ marginTop: 10 }}>
                {(mine.matched.length ? mine.matched : ['aucun match direct']).slice(0, 4).map((t) => <span key={t} className="chip is-active">{t}</span>)}
                {mine.missing.slice(0, 4).map((t) => <span key={t} className="chip">{t}</span>)}
              </div>
            </div>
            {!entitled && (
              <Link to="/abonnements" className="versus-unlock">
                <Icon name="lock" /> Débloquez les analyses de correspondance
              </Link>
            )}
          </section>
        )}

        <div className="underline-tabs" role="tablist" style={{ marginTop: 18 }}>
          {[
            ['posts', 'Actualités'],
            ['arcs', 'Projets'],
            ['team', 'Équipe'],
            ['about', 'À propos'],
            ...(isOwner ? [['manage', 'Gestion']] : []),
          ].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-active' : ''} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 16 }} className="stack">
          {tab === 'posts' &&
            (posts === null ? <CardSkeleton /> : posts.length === 0 ? <EmptyState art="launch" title="Aucune publication" text={isOwner ? 'Publiez une actualité ou un événement.' : 'Revenez bientôt.'} /> : posts.map((p) => <PostCard key={p.id} post={p} />))}
          {tab === 'arcs' && (arcs.length === 0 ? <EmptyState art="launch" title="Aucun projet d’organisation" /> : <div className="arc-grid">{arcs.map((a) => <ArcCard key={a.id} arc={a} showAuthor={false} />)}</div>)}
          {tab === 'team' &&
            (team.length === 0 ? (
              <EmptyState art="community" title="Aucun membre certifié" />
            ) : (
              <div className="card list" style={{ padding: 6 }}>
                {team.map((c) => (
                  <Link key={c.id} to={`/u/${c.user_id}`} className="list-item">
                    <Avatar user={c.users || {}} size={40} />
                    <span className="grow">
                      <UserName user={c.users || {}} className="title" />
                      <span className="sub" style={{ display: 'block' }}>{c.title}</span>
                    </span>
                    <Badge tone="success" icon="verified_user">{CERT_TYPES.find(([v]) => v === c.type)?.[1] || 'Certifié'}</Badge>
                  </Link>
                ))}
              </div>
            ))}
          {tab === 'about' && (
            <section className="card card--pad stack">
              {page.description ? <p style={{ whiteSpace: 'pre-line', color: 'var(--text-2)' }}>{page.description}</p> : <p className="muted">Pas encore de description.</p>}
              {(page.hiring_needs || []).length > 0 && (
                <div>
                  <span className="field-label">Recherche</span>
                  <div className="chip-wrap" style={{ marginTop: 6 }}>{page.hiring_needs.map((n) => <span key={n} className="chip">{n}</span>)}</div>
                </div>
              )}
              {page.website_url && (
                <a href={pageCta({ website_url: page.website_url }).url} target="_blank" rel="noreferrer" className="row" style={{ color: 'var(--text)' }}>
                  <Icon name="language" /> {page.website_url}
                </a>
              )}
            </section>
          )}
          {tab === 'manage' && isOwner && (
            <>
              <section className="card card--pad">
                <h3 style={{ fontSize: 16, marginBottom: 10 }}>Profils recommandés</h3>
                {!entitled ? (
                  <p className="muted">
                    Disponible pour les pages vérifiées ou avec un abonnement actif. <Link to="/abonnements" style={{ textDecoration: 'underline' }}>Vérifier la page</Link>
                  </p>
                ) : recos.length === 0 ? (
                  <p className="muted">Ajoutez des compétences recherchées dans les paramètres pour recevoir des recommandations.</p>
                ) : (
                  <div className="list">
                    {recos.map((u) => (
                      <Link key={u.id} to={`/u/${u.id}`} className="list-item">
                        <Avatar user={u} size={38} />
                        <span className="grow">
                          <UserName user={u} className="title" />
                          <span className="sub" style={{ display: 'block' }}>{u.title || 'Membre XERA'}</span>
                        </span>
                        <Badge tone="success">{u.matchScore} %</Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
              <section className="card card--pad">
                <h3 style={{ fontSize: 16, marginBottom: 10 }}>Demandes reçues ({leads.length})</h3>
                {leads.length === 0 ? (
                  <p className="muted">Les demandes envoyées via votre bouton d’action apparaîtront ici.</p>
                ) : (
                  <div className="list">
                    {leads.map((l) => (
                      <a key={l.id} href={`mailto:${l.email}`} className="list-item">
                        <span className="lead-icon"><Icon name="mail" /></span>
                        <span className="grow">
                          <span className="title" style={{ display: 'block' }}>{l.name} · {l.company}</span>
                          <span className="sub">{l.email} · {timeAgo(l.created_at)}</span>
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </section>
              <Link to="/partenaires" className="card list-item" style={{ padding: 16 }}>
                <span className="lead-icon"><Icon name="handshake" /></span>
                <span className="grow">
                  <span className="title" style={{ display: 'block' }}>Console partenaire</span>
                  <span className="sub">Commissions et code de parrainage</span>
                </span>
                <Icon name="chevron_right" />
              </Link>
            </>
          )}
        </div>
      </main>

      {isOwner && (
        <>
          <PostSheet open={sheet === 'post'} onClose={() => setSheet('')} page={page} onCreated={(p) => setPosts((list) => [p, ...(list || [])])} />
          <SettingsSheet open={sheet === 'settings'} onClose={() => setSheet('')} page={page} onSaved={setPage} />
          <TeamSheet open={sheet === 'team'} onClose={() => setSheet('')} page={page} />
        </>
      )}
      <LeadSheet open={sheet === 'lead'} onClose={() => setSheet('')} page={page} />
    </>
  );
}
