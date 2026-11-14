import { useEffect, useRef } from 'react';
import Navbar from '../components/Navbar';

/**
 * Home (Discover) page
 * 
 * The main SPA shell — hosts the hero section + the discover feed.
 * The heavy JS logic from app-supabase.js, search.js, messages.js, 
 * notifications.js, etc. still runs from public/js/ loaded via index.html
 * until they are fully migrated to React.
 * 
 * This component renders the structural HTML as faithfully as the original 
 * index.html, and exposes the same DOM IDs so the legacy JS files continue to work.
 */
export default function Home() {
  const videoRef = useRef(null);

  useEffect(() => {
    // Trigger legacy DOMContentLoaded-like init if app-supabase.js is loaded
    if (typeof window.initXeraApp === 'function') {
      window.initXeraApp();
    }
  }, []);

  function handleUnmute() {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
    }
  }

  return (
    <>
      <Navbar />

      {/* Global overlays — kept for legacy JS compatibility */}
      <div id="global-progress-bar-placeholder"></div>
      <div id="toast-container"></div>
      <div id="immersive-overlay" className="immersive-overlay" style={{ display: 'none' }}></div>
      <div id="settings-modal" className="modal" style={{ display: 'none' }}></div>
      <div id="create-modal" className="modal" style={{ display: 'none' }}></div>

      {/* Notification panel */}
      <div id="notification-panel" className="notification-panel">
        <div className="notification-panel-header">
          <h3>Notifications</h3>
          <button id="mark-all-read-btn" className="mark-all-btn">Tout marquer comme lu</button>
        </div>
        <div id="notification-list" className="notification-list"></div>
      </div>

      {/* ═══════════════════════════════════════
          HERO SECTION
      ═══════════════════════════════════════ */}
      <section id="hero" className="hero-section">
        <div className="hero-content">
          <p className="hero-eyebrow">La plateforme de progression authentique</p>
          <h1 className="hero-title">Tracez votre progression.<br />Inspirez les autres.</h1>
          <p className="hero-lede">
            Documentez chaque étape de vos projets en temps réel. Rejoignez des milliers de builders qui construisent en public.
          </p>
          <div className="hero-bullets">
            <div className="hero-bullet">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
              <span>Créez un projet et invitez votre communauté</span>
            </div>
            <div className="hero-bullet">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              <span>Publiez une trace quotidienne de votre avancement</span>
            </div>
            <div className="hero-bullet">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>
              <span>Suivez vos KPIs sur votre tableau de bord</span>
            </div>
          </div>
          <div className="hero-cta-group">
            <button className="btn-hero-primary" id="hero-cta-btn" onClick={() => window.navigateTo?.('login')}>
              Démarrez votre premier projet
            </button>
            <button className="btn-hero-secondary" id="hero-demo-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              Voir la démo (60s)
            </button>
          </div>
        </div>

        {/* Hero video */}
        <div className="hero-media">
          <video
            ref={videoRef}
            id="hero-video"
            autoPlay
            muted
            loop
            playsInline
            className="hero-video"
          >
            <source src="/medias/Create arc.MOV" type="video/mp4" />
          </video>
          <button className="hero-unmute-btn" id="hero-unmute-btn" onClick={handleUnmute} title="Activer / couper le son">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M23 9l-6 6M17 9l6 6" />
            </svg>
          </button>
        </div>

        {/* Partners marquee */}
        <div className="partners-marquee">
          <div className="partners-track">
            {['Impact Hub', 'Station F', 'Fata School', 'Neddigi', 'Electrical Service', 'Impact Hub', 'Station F', 'Fata School', 'Neddigi', 'Electrical Service'].map((p, i) => (
              <span key={i} className="partner-name">{p}</span>
            ))}
          </div>
        </div>

        {/* Scroll cue */}
        <button className="scroll-cue-btn" id="scroll-cue-btn" onClick={() => document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth' })}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
      </section>

      {/* ═══════════════════════════════════════
          DISCOVER / FEED SECTION
      ═══════════════════════════════════════ */}
      <section id="discover" className="discover-section">
        <div className="discover-header">
          <div className="search-container">
            <input type="text" id="search-input" className="search-input" placeholder="Rechercher des projets, créateurs..." />
          </div>
          <div className="filter-buttons" id="filter-buttons">
            <button className="filter-btn active" data-filter="all">Tout</button>
            <button className="filter-btn" data-filter="lives">Lives</button>
            <button className="filter-btn" data-filter="videos">Vidéos</button>
            <button className="filter-btn" data-filter="projects">Projets</button>
            <button className="filter-btn" data-filter="following">Suivis</button>
            <button className="filter-btn" data-filter="recent">Récent</button>
          </div>
        </div>
        <div id="announcements-container" className="announcements-container"></div>
        <div id="discover-grid" className="discover-grid"></div>
      </section>

      {/* ═══════════════════════════════════════
          MESSAGES SECTION (shown/hidden by JS)
      ═══════════════════════════════════════ */}
      <section id="messages" className="messages-section" style={{ display: 'none' }}>
        <div id="messages-mount" className="messages-mount"></div>
      </section>

      {/* ═══════════════════════════════════════
          PRO PAGE SECTION
      ═══════════════════════════════════════ */}
      <section id="pro-page" className="pro-page-section" style={{ display: 'none' }}>
        <div className="pro-page-container"></div>
      </section>

      {/* Floating create button */}
      <button id="floating-create-btn" className="floating-create-btn" style={{ display: 'none' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </>
  );
}
