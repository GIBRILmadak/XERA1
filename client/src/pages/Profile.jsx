import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/useAuth';

/**
 * Profile page
 * Supports both personal profiles (/profile?user=ID) and pro pages (/pagepro?user=ID).
 * The heavy rendering is delegated to legacy JS (app-supabase.js, professional-pages.js, etc.)
 * which targets the DOM containers below.
 */
export default function Profile() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const targetUserId = searchParams.get('user');
  const isPro = searchParams.get('pro') === '1';

  useEffect(() => {
    // Notify legacy JS that the profile page has mounted
    if (typeof window.loadProfilePage === 'function') {
      window.loadProfilePage(targetUserId || user?.id);
    } else {
      // Dispatch a custom event for app-supabase.js to listen to
      window.dispatchEvent(new CustomEvent('xera:profile-mounted', {
        detail: { userId: targetUserId || user?.id }
      }));
    }
  }, [targetUserId, user]);

  return (
    <>
      <Navbar />

      {/* Global overlays */}
      <div id="toast-container"></div>
      <div id="immersive-overlay" className="immersive-overlay" style={{ display: 'none' }}></div>
      <div id="settings-modal" className="modal" style={{ display: 'none' }}></div>
      <div id="create-modal" className="modal" style={{ display: 'none' }}></div>
      <div id="notification-panel" className="notification-panel" style={{ display: 'none' }}>
        <div className="notification-panel-header">
          <h3>Notifications</h3>
          <button id="mark-all-read-btn" className="mark-all-btn">Tout marquer comme lu</button>
        </div>
        <div id="notification-list" className="notification-list"></div>
      </div>

      {/* Settings button injected by JS */}
      <div id="settings-button-container"></div>

      {/* Profile section — content injected by app-supabase.js */}
      <section id="profile" className="profile-section" style={{ display: isPro ? 'none' : undefined }}>
        <div className="profile-container"></div>
      </section>

      {/* Pro page section — content injected by professional-pages.js */}
      <section id="pro-page" className="pro-page-section" style={{ display: !isPro ? 'none' : undefined }}>
        <div className="pro-page-container"></div>
      </section>

      {/* Pro settings section */}
      <section id="pro-settings-page" className="pro-settings-section" style={{ display: 'none' }}>
        <div className="pro-settings-page-container"></div>
      </section>

      {/* Messages section */}
      <section id="messages" className="messages-section" style={{ display: 'none' }}>
        <div id="messages-mount" className="messages-mount"></div>
      </section>
    </>
  );
}
