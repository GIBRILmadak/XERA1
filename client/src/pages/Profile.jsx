import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import ContentCard from '../components/ContentCard';
import ArcCard from '../components/ArcCard';
import { Avatar, Badge, Button, CardSkeleton, EmptyState, IconLink, Sheet } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { compact, isVerified } from '../lib/format';
import {
  fetchBadges,
  fetchFollowCounts,
  fetchUser,
  fetchUserArcs,
  fetchUserContent,
  isFollowing,
  openConversation,
  setFollow,
  updateProfile,
  uploadMedia,
} from '../services/data';
import { PUBLIC_SITE } from '../services/api';

function EditProfileSheet({ open, onClose, profile, onSaved }) {
  const { user } = useAuth();
  const { toast } = useUi();
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm({ name: profile.name || '', title: profile.title || '', bio: profile.bio || '', avatar: profile.avatar || '' });
  }, [open, profile]);

  async function pickAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { url } = await uploadMedia(user.id, file, 'avatars');
      setForm((f) => ({ ...f, avatar: url }));
    } catch (error) {
      toast('error', 'Photo non envoyée', error.message);
    }
  }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const saved = await updateProfile(user.id, {
        name: form.name.trim(),
        title: form.title.trim() || null,
        bio: form.bio.trim() || null,
        avatar: form.avatar || null,
      });
      onSaved(saved);
      toast('success', 'Profil mis à jour');
      onClose();
    } catch (error) {
      toast('error', 'Enregistrement impossible', error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Modifier le profil">
      <form className="stack" onSubmit={save}>
        <label className="row" style={{ gap: 14, cursor: 'pointer' }}>
          <Avatar user={{ ...profile, avatar: form.avatar }} size={64} />
          <span className="btn btn--sm">
            <Icon name="photo_camera" /> Changer la photo
          </span>
          <input type="file" accept="image/*" hidden onChange={pickAvatar} />
        </label>
        <div className="field">
          <label htmlFor="p-name">Nom</label>
          <input id="p-name" className="input" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={60} />
        </div>
        <div className="field">
          <label htmlFor="p-title">Titre</label>
          <input id="p-title" className="input" placeholder="Ex. Développeuse mobile · Goma" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="p-bio">Bio</label>
          <textarea id="p-bio" className="textarea" value={form.bio || ''} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={400} />
        </div>
        <Button variant="primary" size="lg" block loading={busy}>
          Enregistrer
        </Button>
      </form>
    </Sheet>
  );
}

export default function Profile() {
  const { id } = useParams();
  const { user, setUser } = useAuth();
  const { toast } = useUi();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(undefined);
  const [content, setContent] = useState(null);
  const [arcs, setArcs] = useState([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [badges, setBadges] = useState([]);
  const [following, setFollowing] = useState(false);
  const [tab, setTab] = useState('proofs');
  const [editing, setEditing] = useState(false);

  const isMe = user?.id === id;

  useEffect(() => {
    let alive = true;
    setProfile(undefined);
    setContent(null);
    (async () => {
      try {
        const p = await fetchUser(id);
        if (!alive) return;
        setProfile(p);
        if (!p) return;
        const [c, a, n, b, f] = await Promise.all([
          fetchUserContent(id),
          fetchUserArcs(id),
          fetchFollowCounts(id),
          fetchBadges(id),
          user && user.id !== id ? isFollowing(user.id, id) : false,
        ]);
        if (!alive) return;
        setContent(c);
        setArcs(a);
        setCounts(n);
        setBadges(b);
        setFollowing(f);
      } catch {
        if (alive) setProfile(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, user]);

  async function toggleFollow() {
    if (!user) return navigate('/connexion');
    const next = !following;
    setFollowing(next);
    setCounts((c) => ({ ...c, followers: c.followers + (next ? 1 : -1) }));
    try {
      await setFollow(user.id, id, next);
    } catch {
      setFollowing(!next);
      setCounts((c) => ({ ...c, followers: c.followers + (next ? -1 : 1) }));
      toast('error', 'Action impossible');
    }
  }

  async function message() {
    if (!user) return navigate('/connexion');
    try {
      const conversationId = await openConversation(id);
      navigate(`/messages/${conversationId}`);
    } catch (error) {
      toast('error', 'Conversation impossible', error.message);
    }
  }

  async function share() {
    const url = `${PUBLIC_SITE}/profile/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: profile?.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('success', 'Lien du profil copié');
      }
    } catch {
      /* annulé */
    }
  }

  if (profile === undefined)
    return (
      <>
        <TopBar back title="Profil" />
        <main className="main">
          <CardSkeleton />
        </main>
      </>
    );
  if (!profile)
    return (
      <>
        <TopBar back title="Profil" />
        <main className="main">
          <EmptyState icon="person_off" title="Profil introuvable" />
        </main>
      </>
    );

  const hasFata = badges.some((b) => String(b.type).toLowerCase() === 'fata');
  const wins = (content || []).filter((c) => c.state === 'success').length;

  return (
    <>
      <TopBar
        back={!isMe}
        title={profile.name}
        actions={
          <>
            <button className="icon-btn" onClick={share} aria-label="Partager le profil">
              <Icon name="share" />
            </button>
            {isMe && <IconLink to="/reglages" icon="settings" label="Réglages" />}
          </>
        }
      />
      <main className="main">
        <div className="profile-cover">{profile.banner && <img src={profile.banner} alt="" />}</div>
        <div className="profile-id">
          <Avatar user={profile} size={92} />
          <div className="profile-actions">
            {isMe ? (
              <Button icon="edit" onClick={() => setEditing(true)}>
                Modifier
              </Button>
            ) : (
              <>
                <Button icon="mail" onClick={message} aria-label="Envoyer un message">
                  <span className="desktop-only">Message</span>
                </Button>
                <Button variant={following ? undefined : 'primary'} icon={following ? 'check' : 'person_add'} onClick={toggleFollow}>
                  {following ? 'Suivi' : 'Suivre'}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="profile-name">
          <h1>
            {profile.name}
            {isVerified(profile) && <Icon name="verified" filled className="verified" label="Compte vérifié" />}
          </h1>
          {profile.title && <span className="headline">{profile.title}</span>}
        </div>
        {(hasFata || profile.plan === 'pro' || profile.plan === 'elite') && (
          <div className="profile-badges">
            {hasFata && (
              <Badge tone="gold" icon="emoji_events">
                Badge Fata
              </Badge>
            )}
            {(profile.plan === 'pro' || profile.plan === 'elite') && (
              <Badge tone="violet" icon="workspace_premium">
                {profile.plan === 'elite' ? 'Elite' : 'Pro'}
              </Badge>
            )}
          </div>
        )}
        {profile.bio && <p className="profile-bio">{profile.bio}</p>}
        <div className="profile-counts">
          <span><strong>{compact(counts.followers)}</strong>abonnés</span>
          <span><strong>{compact(counts.following)}</strong>abonnements</span>
          <span><strong>{wins}</strong>{wins > 1 ? 'avancées' : 'avancée'}</span>
        </div>

        {isMe && (
          <Link to="/fata" className="fata-strip" style={{ marginTop: 18 }}>
            <img src="/icons/fata.webp" alt="" />
            <div className="grow">
              <strong>Challenge Fata × XERA1</strong>
              <span>Reliez votre compte Fata et suivez vos trois étapes.</span>
            </div>
            <Icon name="chevron_right" />
          </Link>
        )}

        <div className="underline-tabs" role="tablist" style={{ marginTop: 18 }}>
          {[
            ['proofs', 'Preuves', content?.length],
            ['arcs', 'Projets', arcs.length],
          ].map(([key, label, n]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>
              {label} {n ? <span className="muted">· {n}</span> : null}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          {tab === 'proofs' ? (
            content === null ? (
              <CardSkeleton />
            ) : content.length === 0 ? (
              <EmptyState
                icon="photo_camera"
                title={isMe ? 'Publiez votre première preuve' : 'Aucune preuve publiée'}
                action={isMe && <Link to="/creer/preuve" className="btn btn--primary"><Icon name="add" /> Publier</Link>}
              />
            ) : (
              content.map((c, i) => <ContentCard key={c.id} content={c} index={i} />)
            )
          ) : arcs.length === 0 ? (
            <EmptyState
              icon="flag"
              title={isMe ? 'Lancez votre premier projet' : 'Aucun projet'}
              action={isMe && <Link to="/creer/arc" className="btn btn--primary"><Icon name="add" /> Nouvel ARC</Link>}
            />
          ) : (
            <div className="arc-grid">
              {arcs.map((a) => (
                <ArcCard key={a.id} arc={{ ...a, users: null }} showAuthor={false} />
              ))}
            </div>
          )}
        </div>
      </main>
      {isMe && (
        <EditProfileSheet
          open={editing}
          onClose={() => setEditing(false)}
          profile={profile}
          onSaved={(saved) => {
            setProfile((p) => ({ ...p, ...saved }));
            setUser((u) => ({ ...u, ...saved }));
          }}
        />
      )}
    </>
  );
}
