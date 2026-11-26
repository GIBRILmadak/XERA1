import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { Avatar, Button, IconButton, Sheet } from './ui';
import { useAuth } from '../contexts/AuthContext';
import { useUnread } from '../hooks/useUnread';
import FataCelebration from './FataCelebration';

const NAV = [
  { to: '/', icon: 'home', label: 'Accueil', end: true },
  { to: '/explorer', icon: 'explore', label: 'Explorer' },
  { to: '/messages', icon: 'chat_bubble', label: 'Messages', badgeKey: 'messages' },
  { to: '/notifications', icon: 'notifications', label: 'Notifications', badgeKey: 'notifications' },
];

export function Brand({ compact = false }) {
  return (
    <Link to="/" className="brand" aria-label="XERA1, accueil">
      <img src="/icons/logo.png" alt="" />
      {!compact && <span>XERA</span>}
    </Link>
  );
}

/** Barre du haut : titre de page, retour éventuel et actions à droite. */
export function TopBar({ title, back, actions, brand = false }) {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header className={`topbar${scrolled ? ' is-scrolled' : ''}`}>
      {back && (
        <IconButton
          icon="arrow_back"
          label="Retour"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(typeof back === 'string' ? back : '/'))}
        />
      )}
      {brand ? (
        <div className="mobile-only" style={{ flex: 1 }}>
          <Brand />
        </div>
      ) : (
        <div className="page-title">{title}</div>
      )}
      {brand && <div className="page-title desktop-only">{title}</div>}
      {actions}
    </header>
  );
}

function CreateSheet({ open, onClose }) {
  const navigate = useNavigate();
  const go = (path) => {
    onClose();
    navigate(path);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Créer">
      <div className="list">
        <button className="list-item" onClick={() => go('/creer/preuve')}>
          <span className="lead-icon">
            <Icon name="add_photo_alternate" />
          </span>
          <span className="grow">
            <span className="title" style={{ display: 'block' }}>Nouvelle preuve</span>
            <span className="sub">Montrez ce que vous avez fait aujourd'hui</span>
          </span>
          <Icon name="chevron_right" />
        </button>
        <button className="list-item" onClick={() => go('/creer/arc')}>
          <span className="lead-icon">
            <Icon name="flag" />
          </span>
          <span className="grow">
            <span className="title" style={{ display: 'block' }}>Nouvel ARC</span>
            <span className="sub">Lancez un projet avec ses jalons</span>
          </span>
          <Icon name="chevron_right" />
        </button>
        <a className="list-item" href="/create-stream">
          <span className="lead-icon">
            <Icon name="sensors" />
          </span>
          <span className="grow">
            <span className="title" style={{ display: 'block' }}>Lancer un live</span>
            <span className="sub">Construisez en direct avec votre communauté</span>
          </span>
          <Icon name="open_in_new" />
        </a>
      </div>
    </Sheet>
  );
}

export default function Shell() {
  const { user } = useAuth();
  const location = useLocation();
  const unread = useUnread(user);
  const [createOpen, setCreateOpen] = useState(false);
  const meHref = user ? `/u/${user.id}` : '/connexion';

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const requireAuth = (fn) => () => (user ? fn() : null);

  return (
    <div className={`app shell${/^\/messages\/.+/.test(location.pathname) ? ' is-chat' : ''}`}>
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Navigation principale">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `side-link${isActive ? ' is-active' : ''}`}>
              {({ isActive }) => (
                <>
                  <Icon name={item.icon} filled={isActive} />
                  {item.label}
                  {item.badgeKey && unread[item.badgeKey] > 0 && <span className="count">{unread[item.badgeKey]}</span>}
                </>
              )}
            </NavLink>
          ))}
          <NavLink to="/fata" className={({ isActive }) => `side-link${isActive ? ' is-active' : ''}`}>
            {({ isActive }) => (
              <>
                <Icon name="emoji_events" filled={isActive} />
                Challenge Fata
              </>
            )}
          </NavLink>
          <NavLink to="/reglages" className={({ isActive }) => `side-link${isActive ? ' is-active' : ''}`}>
            {({ isActive }) => (
              <>
                <Icon name="settings" filled={isActive} />
                Réglages
              </>
            )}
          </NavLink>
        </nav>
        {user && (
          <Button variant="primary" size="lg" icon="add" className="create-btn" onClick={() => setCreateOpen(true)}>
            Créer
          </Button>
        )}
        <div className="me">
          {user ? (
            <NavLink to={meHref} className={({ isActive }) => `side-link${isActive ? ' is-active' : ''}`} style={{ height: 60 }}>
              <Avatar user={user} size={34} />
              <span className="grow" style={{ overflow: 'hidden' }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name || 'Mon profil'}
                </span>
                <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>
                  Voir mon profil
                </span>
              </span>
            </NavLink>
          ) : (
            <Button variant="primary" block icon="login" onClick={() => (window.location.href = '/connexion')}>
              Se connecter
            </Button>
          )}
        </div>
      </aside>

      <div>
        <Outlet />
      </div>

      <nav className="bottombar" aria-label="Navigation principale">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
          {({ isActive }) => (
            <>
              <span className="pill">
                <Icon name="home" filled={isActive} />
              </span>
              Accueil
            </>
          )}
        </NavLink>
        <NavLink to="/explorer" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          {({ isActive }) => (
            <>
              <span className="pill">
                <Icon name="explore" filled={isActive} />
              </span>
              Explorer
            </>
          )}
        </NavLink>
        {user ? (
          <button className="create" onClick={requireAuth(() => setCreateOpen(true))} aria-label="Créer">
            <span className="pill">
              <Icon name="add" />
            </span>
          </button>
        ) : (
          <NavLink to="/connexion" className="create" aria-label="Se connecter">
            <span className="pill">
              <Icon name="login" />
            </span>
          </NavLink>
        )}
        <NavLink to="/messages" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          {({ isActive }) => (
            <>
              <span className="pill">
                <Icon name="chat_bubble" filled={isActive} />
              </span>
              {unread.messages > 0 && <span className="nav-dot" />}
              Messages
            </>
          )}
        </NavLink>
        <NavLink to={meHref} className={({ isActive }) => (isActive ? 'is-active' : '')}>
          {({ isActive }) => (
            <>
              <span className="pill">
                {user ? <Avatar user={user} size={26} ring={isActive} /> : <Icon name="person" />}
              </span>
              Profil
            </>
          )}
        </NavLink>
      </nav>

      <CreateSheet open={createOpen} onClose={() => setCreateOpen(false)} />
      {user && <FataCelebration />}
    </div>
  );
}
