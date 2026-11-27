import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import ContentCard from '../components/ContentCard';
import ArcCard from '../components/ArcCard';
import { Avatar, Button, CardSkeleton, EmptyState, IconLink, Sheet } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { compact, displayName } from '../lib/format';
import { NameBadges, ProfileBadges } from '../components/Badges';
import { canReceiveSupport } from '../services/badges';
import { openSupport } from '../services/payments';
import { userCertifications } from '../services/pages';
import { SOCIALS, normalizePrefs, socialHref } from '../lib/profilePrefs';

const SOCIAL_ICONS = { github: '/icons/github.svg', linkedin: '/icons/linkedin.svg', instagram: '/icons/instagram.svg', discord: '/icons/discord.svg', facebook: '/icons/facebook.svg', email: '/icons/email.svg' };
import {
  countUserContent,
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
  const [contentCount, setContentCount] = useState(0);
  const [certs, setCerts] = useState([]);
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
          countUserContent(id),
          user && user.id !== id ? isFollowing(user.id, id) : false,
        ]);
        if (!alive) return;
        setContent(c);
        setArcs(a);
        setCounts(n);
        setContentCount(b);
        userCertifications(id).then((c) => alive && setCerts(c)).catch(() => {});
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

  async function support() {
    if (!user) return navigate(`/connexion?redirect=${encodeURIComponent(`/u/${id}`)}`);
    try {
      await openSupport({ creatorId: id, creatorName: displayName(profile), onSuccess: () => toast('success', 'Soutien envoyé', 'Merci pour ce créateur !') });
    } catch (error) {
      toast('error', 'Soutien indisponible', error.message);
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
          <EmptyState art="empty" icon="person_off" title="Profil introuvable" />
        </main>
      </>
    );

  const wins = (content || []).filter((c) => c.state === 'success').length;
  const prefs = normalizePrefs(profile.profile_preferences);
  const socials = SOCIALS.map(([k, label]) => [k, label, socialHref(k, profile.social_links?.[k])]).filter(([, , h]) => h);
  const hiddenForMe = !isMe && (prefs.privacy.visibility === 'private' || (prefs.privacy.visibility === 'followers' && !following));

  return (
    <>
      <TopBar
        back={!isMe}
        title={displayName(profile)}
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
        <div className={`profile-cover is-${prefs.appearance.bannerStyle}`} style={{ '--pa': prefs.appearance.accent, '--ps': prefs.appearance.secondary }}>
          {profile.banner && <img src={profile.banner} alt="" />}
        </div>
        <div className="profile-id">
          <Avatar user={profile} size={92} />
          {isMe && (
            <div className="profile-actions">
              <Button icon="edit" onClick={() => navigate('/reglages/profil')}>
                Modifier
              </Button>
            </div>
          )}
        </div>

        <div className="profile-name">
          <h1>
            {displayName(profile)}
            <NameBadges user={profile} size={20} />
          </h1>
          {profile.title && <span className="headline">{profile.title}</span>}
        </div>
        {!isMe && (
          <div className="profile-cta">
            <Button variant={following ? undefined : 'primary'} icon={following ? 'check' : 'person_add'} onClick={toggleFollow}>
              {following ? 'Suivi' : 'Suivre'}
            </Button>
            <Button icon="mail" onClick={message}>
              Message
            </Button>
            <Button
              icon={canReceiveSupport(profile) ? 'favorite' : 'lock'}
              onClick={canReceiveSupport(profile) ? support : () => toast('info', 'Soutien indisponible', 'Ce créateur n’a pas encore activé les soutiens (abonnement Medium ou Pro, ou 1 000 abonnés).')}
              className={`support-btn${canReceiveSupport(profile) ? '' : ' is-locked'}`}
            >
              Soutenir
            </Button>
          </div>
        )}
        <ProfileBadges user={profile} contentCount={contentCount} followers={counts.followers} />
        {certs.length > 0 && (
          <div className="profile-badges">
            {certs.map((c) => (
              <Link key={c.id} to={`/page/${c.professional_pages?.slug || c.page_id}`} className="profile-chip cert-chip">
                <Icon name="verified_user" size={15} />
                {c.title} · {c.professional_pages?.name || 'Page pro'}
              </Link>
            ))}
          </div>
        )}
        {profile.bio && <p className="profile-bio">{profile.bio}</p>}
        {prefs.privacy.showSocials && socials.length > 0 && (
          <div className="profile-socials">
            {socials.map(([k, label, href]) => (
              <a key={k} href={href} target={k === 'email' ? undefined : '_blank'} rel="noreferrer" title={label} aria-label={label}>
                {SOCIAL_ICONS[k] ? <img src={SOCIAL_ICONS[k]} alt="" /> : <Icon name={k === 'site' ? 'language' : 'link'} size={18} />}
                <span>{label}</span>
              </a>
            ))}
          </div>
        )}
        {(isMe || prefs.privacy.showStats) && (
        <div className="profile-counts">
          <span><strong>{compact(counts.followers)}</strong>abonnés</span>
          <span><strong>{compact(counts.following)}</strong>abonnements</span>
          <span><strong>{wins}</strong>{wins > 1 ? 'avancées' : 'avancée'}</span>
        </div>
        )}

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
          {hiddenForMe ? (
            <EmptyState art="empty" icon="lock" title="Profil privé" text={prefs.privacy.visibility === 'followers' ? 'Suivez ce membre pour voir ses preuves et ses projets.' : 'Ce membre a choisi de garder son activité privée.'} />
          ) : tab === 'proofs' ? (
            content === null ? (
              <CardSkeleton />
            ) : content.length === 0 ? (
              <EmptyState art="proof"
                icon="photo_camera"
                title={isMe ? 'Publiez votre première preuve' : 'Aucune preuve publiée'}
                action={isMe && <Link to="/creer/preuve" className="btn btn--primary"><Icon name="add" /> Publier</Link>}
              />
            ) : (
              content.map((c, i) => <ContentCard key={c.id} content={c} index={i} allowValidation />)
            )
          ) : arcs.length === 0 ? (
            <EmptyState art="launch"
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
