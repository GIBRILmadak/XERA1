import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import Art from '../components/Illustrations';
import MediaPicker from '../components/MediaPicker';
import { Avatar, Button, UserName } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { supabase } from '../services/supabase';
import { updateProfile } from '../services/data';
import { setBlocked } from '../services/dm';
import { USER_BADGE_COLUMNS } from '../services/badges';
import { DEMO } from '../services/demo';
import { PROFILE_THEMES, SOCIALS, normalizePrefs } from '../lib/profilePrefs';

const SECTIONS = [
  ['identity', 'badge', 'Identité'],
  ['role', 'work', 'Type de compte'],
  ['socials', 'link', 'Réseaux'],
  ['appearance', 'palette', 'Apparence'],
  ['privacy', 'lock', 'Confidentialité'],
  ['preferences', 'tune', 'Préférences'],
  ['verification', 'verified', 'Vérification'],
  ['blocked', 'block', 'Bloqués'],
];

const ROLES = [
  ['fan', 'Fan', 'Je suis les bâtisseurs et leurs projets.', 'favorite'],
  ['recruiter', 'Recruteur', 'Je cherche des talents à recruter.', 'person_search'],
  ['investor', 'Investisseur', 'Je repère des projets à financer.', 'trending_up'],
];

function Toggle({ label, hint, value, onChange }) {
  return (
    <button type="button" className="list-item" onClick={() => onChange(!value)} style={{ padding: '12px 4px' }}>
      <span className="grow">
        <span className="title" style={{ display: 'block', whiteSpace: 'normal' }}>{label}</span>
        {hint && <span className="sub" style={{ whiteSpace: 'normal' }}>{hint}</span>}
      </span>
      <span className={`switch${value ? ' is-on' : ''}`} role="switch" aria-checked={value} />
    </button>
  );
}

function Choice({ options, value, onChange }) {
  return (
    <div className="tabs" style={{ flexWrap: 'wrap' }}>
      {options.map(([v, l]) => (
        <button key={v} type="button" className={`tab${value === v ? ' is-active' : ''}`} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export default function ProfileSettings() {
  const { user, setUser, signOut } = useAuth();
  const { toast } = useUi();
  const navigate = useNavigate();
  const [tab, setTab] = useState('identity');
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlockedList] = useState(null);
  const [vreq, setVreq] = useState(null);
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('rize_lang') || 'fr';
    } catch {
      return 'fr';
    }
  });

  useEffect(() => {
    if (!user) return;
    setF({
      name: user.name || '',
      title: user.title || '',
      bio: user.bio || '',
      avatar: user.avatar ? { url: user.avatar } : null,
      banner: user.banner ? { url: user.banner } : null,
      account_subtype: ['recruiter', 'investor'].includes(String(user.account_subtype || '').toLowerCase()) ? String(user.account_subtype).toLowerCase() : 'fan',
      social_links: { ...(user.social_links || {}) },
      prefs: normalizePrefs(user.profile_preferences),
      email_reminder_enabled: user.email_reminder_enabled !== false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (tab === 'blocked' && blocked === null && !DEMO) {
      supabase
        .from('user_blocks')
        .select(`blocked_user_id, created_at, users:blocked_user_id(${USER_BADGE_COLUMNS})`)
        .eq('blocker_id', user.id)
        .then(({ data }) => setBlockedList(data || []));
    }
    if (tab === 'verification' && vreq === null && !DEMO) {
      supabase.from('verification_requests').select('type, status, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data }) => setVreq(data || []));
    }
  }, [tab, blocked, vreq, user.id]);

  const setPref = (group, key, value) => setF((x) => ({ ...x, prefs: { ...x.prefs, [group]: { ...x.prefs[group], [key]: value } } }));
  const theme = useMemo(() => PROFILE_THEMES[f?.prefs.appearance.theme] || PROFILE_THEMES.xera, [f?.prefs.appearance.theme]);

  async function save() {
    if (!f.name.trim()) return toast('error', 'Nom requis');
    setBusy(true);
    try {
      const socials = Object.fromEntries(Object.entries(f.social_links).map(([k, v]) => [k, String(v || '').trim()]).filter(([, v]) => v));
      const saved = await updateProfile(user.id, {
        name: f.name.trim(),
        title: f.title.trim() || null,
        bio: f.bio.trim() || null,
        avatar: f.avatar?.url || null,
        banner: f.banner?.url || null,
        account_subtype: f.account_subtype,
        social_links: socials,
        profile_preferences: f.prefs,
        email_reminder_enabled: f.email_reminder_enabled,
      });
      setUser((u) => ({ ...u, ...saved }));
      try {
        localStorage.setItem('rize_lang', lang);
      } catch {
        /* langue non mémorisée */
      }
      toast('success', 'Profil enregistré');
    } catch (e) {
      toast('error', 'Enregistrement impossible', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestVerification(type) {
    try {
      if (!DEMO) {
        const { error } = await supabase.from('verification_requests').insert({ user_id: user.id, type, status: 'pending' });
        if (error) throw error;
      }
      setVreq((l) => [{ type, status: 'pending', created_at: new Date().toISOString() }, ...(l || [])]);
      toast('success', 'Demande envoyée', 'L’équipe XERA va examiner votre profil.');
    } catch (e) {
      toast('error', 'Demande impossible', e.message);
    }
  }

  if (!f) return null;
  const a = f.prefs.appearance;
  const p = f.prefs.privacy;

  return (
    <>
      <TopBar back title="Modifier mon profil" actions={<Button size="sm" variant="primary" loading={busy} onClick={save}>Enregistrer</Button>} />
      <main className="main main--wide">
        <div className="ps-layout">
          <nav className="ps-nav chip-row" aria-label="Rubriques">
            {SECTIONS.map(([k, icon, label]) => (
              <button key={k} className={`chip${tab === k ? ' is-active' : ''}`} onClick={() => setTab(k)}>
                <Icon name={icon} />
                {label}
              </button>
            ))}
          </nav>

          <section className="card card--pad stack ps-panel" key={tab}>
            {tab === 'identity' && (
              <>
                <div className="ps-preview" style={{ '--pa': a.accent, '--ps': a.secondary }}>
                  <div className={`ps-preview-banner is-${a.bannerStyle}`}>{f.banner?.url && <img src={f.banner.url} alt="" />}</div>
                  <Avatar user={{ name: f.name, avatar: f.avatar?.url }} size={72} />
                  <strong>{f.name || 'Votre nom'}</strong>
                  <span className="muted">{f.title || 'Votre titre'}</span>
                </div>
                <div className="ps-two">
                  <div className="field"><span className="field-label">Photo de profil</span><MediaPicker value={f.avatar} onChange={(v) => setF({ ...f, avatar: v })} folder="avatars" label="Changer la photo" /></div>
                  <div className="field"><span className="field-label">Bannière</span><MediaPicker value={f.banner} onChange={(v) => setF({ ...f, banner: v })} folder="banners" label="Changer la bannière" /></div>
                </div>
                <div className="field"><label htmlFor="ps-name">Nom d’affichage</label><input id="ps-name" className="input" value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
                <div className="field"><label htmlFor="ps-title">Titre / rôle</label><input id="ps-title" className="input" value={f.title} maxLength={80} placeholder="Ex. Développeuse mobile · Goma" onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
                <div className="field"><label htmlFor="ps-bio">Bio</label><textarea id="ps-bio" className="textarea" value={f.bio} maxLength={400} onChange={(e) => setF({ ...f, bio: e.target.value })} /><span className="hint">{f.bio.length}/400</span></div>
              </>
            )}

            {tab === 'role' && (
              <div className="ps-roles">
                {ROLES.map(([v, l, d, icon]) => (
                  <button key={v} type="button" className={`ps-role${f.account_subtype === v ? ' is-on' : ''}`} onClick={() => setF({ ...f, account_subtype: v })}>
                    <Icon name={icon} size={28} />
                    <strong>{l}</strong>
                    <span>{d}</span>
                  </button>
                ))}
                <p className="muted" style={{ fontSize: 13 }}>Les recruteurs et investisseurs voient le fil classé selon les signaux des projets (recrutement, investissement).</p>
              </div>
            )}

            {tab === 'socials' && (
              <div className="ps-two">
                {SOCIALS.map(([k, label, ph]) => (
                  <div key={k} className="field">
                    <label htmlFor={`so-${k}`}>{label}</label>
                    <input id={`so-${k}`} className="input" placeholder={ph} value={f.social_links[k] || ''} onChange={(e) => setF({ ...f, social_links: { ...f.social_links, [k]: e.target.value } })} />
                  </div>
                ))}
              </div>
            )}

            {tab === 'appearance' && (
              <>
                <span className="field-label">Thème du profil</span>
                <div className="ps-themes">
                  {Object.entries(PROFILE_THEMES).map(([k, t]) => (
                    <button key={k} type="button" className={`ps-theme${a.theme === k ? ' is-on' : ''}`} onClick={() => setF({ ...f, prefs: { ...f.prefs, appearance: { ...a, theme: k, accent: t.accent, secondary: t.secondary } } })}>
                      <span style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.secondary})` }} />
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="ps-two">
                  <div className="field"><label htmlFor="ps-acc">Couleur principale</label><input id="ps-acc" type="color" className="input ps-color" value={a.accent} onChange={(e) => setPref('appearance', 'accent', e.target.value)} /></div>
                  <div className="field"><label htmlFor="ps-sec">Couleur secondaire</label><input id="ps-sec" type="color" className="input ps-color" value={a.secondary} onChange={(e) => setPref('appearance', 'secondary', e.target.value)} /></div>
                </div>
                <span className="field-label">Mise en page</span>
                <Choice value={a.layout} onChange={(v) => setPref('appearance', 'layout', v)} options={[['balanced', 'Équilibrée'], ['showcase', 'Vitrine'], ['compact', 'Compacte']]} />
                <span className="field-label">Bannière</span>
                <Choice value={a.bannerStyle} onChange={(v) => setPref('appearance', 'bannerStyle', v)} options={[['cover', 'Pleine'], ['contain', 'Entière'], ['soft', 'Douce']]} />
                <span className="field-label">Cartes</span>
                <Choice value={a.panelStyle} onChange={(v) => setPref('appearance', 'panelStyle', v)} options={[['glass', 'Verre'], ['solid', 'Pleines'], ['minimal', 'Minimal']]} />
                <p className="muted" style={{ fontSize: 13 }}>Aperçu de vos couleurs : <span className="ps-swatch" style={{ background: theme ? a.accent : undefined }} /> <span className="ps-swatch" style={{ background: a.secondary }} /></p>
              </>
            )}

            {tab === 'privacy' && (
              <>
                <span className="field-label">Qui peut voir mon profil</span>
                <Choice value={p.visibility} onChange={(v) => setPref('privacy', 'visibility', v)} options={[['public', 'Tout le monde'], ['followers', 'Abonnés'], ['private', 'Moi seul']]} />
                <span className="field-label">Qui peut m’écrire</span>
                <Choice value={p.allowMessages} onChange={(v) => setPref('privacy', 'allowMessages', v)} options={[['everyone', 'Tout le monde'], ['followers', 'Abonnés'], ['none', 'Personne']]} />
                <Toggle label="Apparaître dans les recherches et suggestions" value={p.discoverable} onChange={(v) => setPref('privacy', 'discoverable', v)} />
                <Toggle label="Afficher mes statistiques" value={p.showStats} onChange={(v) => setPref('privacy', 'showStats', v)} />
                <Toggle label="Afficher mes réseaux sociaux" value={p.showSocials} onChange={(v) => setPref('privacy', 'showSocials', v)} />
                <Toggle label="Afficher mon activité" value={p.showActivity} onChange={(v) => setPref('privacy', 'showActivity', v)} />
              </>
            )}

            {tab === 'preferences' && (
              <>
                <span className="field-label">Langue</span>
                <Choice value={lang} onChange={setLang} options={[['fr', 'Français'], ['en', 'English']]} />
                <Toggle label="Rappels par e-mail" hint="Un petit rappel quand vous n’avez rien publié depuis un moment." value={f.email_reminder_enabled} onChange={(v) => setF({ ...f, email_reminder_enabled: v })} />
                <Link to="/reglages" className="list-item" style={{ padding: '12px 4px' }}>
                  <span className="grow"><span className="title" style={{ display: 'block' }}>Thème clair / sombre</span><span className="sub">Dans les réglages de l’appli</span></span>
                  <Icon name="chevron_right" />
                </Link>
              </>
            )}

            {tab === 'verification' && (
              <>
                <Art name="verified" size={170} />
                <p className="muted">Le badge vérifié rassure votre communauté. Il est attribué par l’équipe XERA, ou automatiquement avec un abonnement (bleu, ou Gold avec Pro).</p>
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <Button icon="verified" onClick={() => requestVerification('creator')}>Demander : créateur</Button>
                  <Button icon="groups" onClick={() => requestVerification('staff')}>Demander : équipe / entreprise</Button>
                  <Link to="/abonnements" className="btn btn--primary"><Icon name="workspace_premium" /> Via un abonnement</Link>
                </div>
                {(vreq || []).map((r, i) => (
                  <div key={i} className="list-item" style={{ padding: '8px 4px' }}>
                    <Icon name={r.status === 'approved' ? 'check_circle' : r.status === 'rejected' ? 'cancel' : 'schedule'} />
                    <span className="grow">{r.type === 'staff' ? 'Équipe / entreprise' : 'Créateur'} · {r.status === 'approved' ? 'Approuvée' : r.status === 'rejected' ? 'Refusée' : 'En attente'}</span>
                  </div>
                ))}
              </>
            )}

            {tab === 'blocked' &&
              (blocked === null ? (
                <p className="muted">Chargement…</p>
              ) : blocked.length === 0 ? (
                <p className="muted">Vous n’avez bloqué personne.</p>
              ) : (
                <div className="list">
                  {blocked.map((b) => (
                    <div key={b.blocked_user_id} className="list-item">
                      <Avatar user={b.users || {}} size={34} />
                      <UserName user={b.users || {}} className="title grow" />
                      <Button
                        size="sm"
                        onClick={async () => {
                          await setBlocked(b.blocked_user_id, false);
                          setBlockedList((l) => l.filter((x) => x.blocked_user_id !== b.blocked_user_id));
                          toast('success', 'Débloqué');
                        }}
                      >
                        Débloquer
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
          </section>
        </div>
        <div className="row ps-footer">
          <Button variant="primary" size="lg" loading={busy} icon="save" onClick={save}>Enregistrer les modifications</Button>
          <Button
            variant="ghost"
            className="btn--danger"
            icon="logout"
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
          >
            Se déconnecter
          </Button>
        </div>
      </main>
    </>
  );
}
