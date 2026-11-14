import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import { signOut } from '../services/supabase';
import { useState } from 'react';

export default function Navbar() {
  const { user, isPro } = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);

  async function handleProfileNav() {
    if (!user) { navigate('/login'); return; }
    navigate(isPro() ? `/pagepro?user=${user.id}` : `/profile?user=${user.id}`);
  }

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  const avatarSrc = user?.avatar || user?.user_metadata?.avatar_url || `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='40' height='40' rx='20' fill='%231f2937'/><circle cx='20' cy='16' r='6' fill='%23e5e7eb'/><path d='M8 34c2.5-6 8-9 12-9s9.5 3 12 9' fill='%23e5e7eb'/></svg>`;

  return (
    <nav>
      <Link className="logo" to="/">
        <div className="logo-img">
          <img src="/icons/logo.png" alt="XERA - Logo" />
        </div>
        <span>XΞRA</span>
      </Link>

      <div className="nav-links">
        {/* Discover */}
        <Link
          id="nav-discover"
          className="notification-button nav-discover-btn"
          to="/"
          title="Discover"
          aria-label="Discover"
        >
          <svg className="notification-icon nav-discover-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10.5L12 3l9 7.5" />
            <path d="M5 10v10h14V10" />
            <path d="M9 20v-6h6v6" />
          </svg>
        </Link>

        {/* Profile */}
        <div
          className="notification-button profile-nav-button"
          onClick={handleProfileNav}
          id="nav-profile"
          title="My Trajectory"
          aria-label="My Trajectory"
          role="button"
        >
          <img
            id="nav-profile-avatar"
            className="notification-icon profile-nav-avatar"
            src={avatarSrc}
            alt="Avatar utilisateur"
          />
        </div>

        {/* Messages (visible only when logged in) */}
        {user && (
          <div
            className="notification-button messages-nav-button"
            onClick={() => navigate('/?messages=1')}
            id="messages-nav-btn"
            title="Messages"
          >
            <img src="/icons/message.svg" alt="Messages" className="notification-icon" />
            <span id="messages-nav-badge" className="notification-badge"></span>
          </div>
        )}

        {/* Notifications (visible only when logged in) */}
        {user && (
          <div
            className="notification-button"
            onClick={() => setNotifOpen((v) => !v)}
            id="notification-btn"
          >
            <svg className="notification-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span id="notification-badge" className="notification-badge"></span>
          </div>
        )}

        {/* Auth */}
        {!user ? (
          <Link to="/login" id="nav-auth">Login / Register</Link>
        ) : (
          <button
            onClick={handleSignOut}
            id="nav-signout"
            className="nav-signout-btn"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.85rem' }}
          >
            Se déconnecter
          </button>
        )}
      </div>
    </nav>
  );
}
