import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import ArcCard from '../components/ArcCard';
import { fetchPlatformStats, fetchRecentArcs } from '../services/data';
import { compact } from '../lib/format';

const DEMO_VIDEO = '/medias/create-arc-demo.mp4';
const DEMO_POSTER = '/medias/create-arc-demo.webp';

const PARTNERS = [
  { src: '/icons/Impact_Hub.webp', alt: 'Impact Hub' },
  { src: '/icons/station-f.png', alt: 'Station F' },
  { src: '/icons/fata.webp', alt: 'Fata' },
  { src: '/icons/neddigi.jpeg', alt: 'Neddigi' },
  { src: '/icons/electrical service.jpeg', alt: 'Electrical Service' },
];

const STEPS = [
  { icon: 'flag', title: 'Créez un projet', text: 'Un ARC, c’est un objectif, une description et des jalons, du début à la fin.' },
  { icon: 'add_photo_alternate', title: 'Publiez vos preuves', text: 'Chaque jour, une trace : avancée, obstacle ou pause, avec photo ou vidéo.' },
  { icon: 'insights', title: 'Bâtissez votre réputation', text: 'Votre parcours attire collaborateurs, investisseurs et soutien financier.' },
];

const FEATURES = [
  { icon: 'timeline', title: 'Parcours transparent', text: 'Réussites, obstacles et pauses : une progression honnête, jour après jour.' },
  { icon: 'task_alt', title: 'Jalons validés', text: 'Validez vos étapes avec des preuves, et laissez la communauté en témoigner.' },
  { icon: 'verified', title: 'Badges vérifiés', text: 'Créateurs, équipes et partenaires vérifiés, paliers de contributeur.' },
  { icon: 'lock', title: 'Messagerie privée', text: 'Échangez en privé avec pièces jointes protégées, blocage et signalement.' },
  { icon: 'payments', title: 'Soutien Mobile Money', text: 'Recevez le soutien de votre communauté directement par Mobile Money.' },
  { icon: 'emoji_events', title: 'Challenges partenaires', text: 'Relevez le challenge Fata × XERA1 et gagnez des récompenses.' },
];

/** Apparition au défilement (désactivée si l'utilisateur réduit les animations). */
function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll('.reveal:not(.is-in)');
    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-in'));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
}

function Counter({ value, label }) {
  const ref = useRef();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!value) return undefined;
    let raf;
    const el = ref.current;
    const start = () => {
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / 1400);
        setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        start();
        io.disconnect();
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);
  return (
    <div className="lp-stat" ref={ref}>
      <strong>{value ? compact(shown) : '—'}</strong>
      <span>{label}</span>
    </div>
  );
}

function DemoModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="lp-modal" role="dialog" aria-modal="true" aria-label="Démo de XERA en 60 secondes" onClick={onClose}>
      <div className="lp-modal-box" onClick={(e) => e.stopPropagation()}>
        <video src={DEMO_VIDEO} poster={DEMO_POSTER} controls autoPlay playsInline />
        <button className="icon-btn lp-modal-close" onClick={onClose} aria-label="Fermer la démo">
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}

export default function Landing() {
  const [muted, setMuted] = useState(true);
  const [demo, setDemo] = useState(false);
  const [stats, setStats] = useState(null);
  const [arcs, setArcs] = useState([]);
  const [scrolled, setScrolled] = useState(false);
  const video = useRef();
  useReveal();

  useEffect(() => {
    fetchPlatformStats().then(setStats).catch(() => {});
    fetchRecentArcs(6)
      .then((list) => setArcs(list.filter((a) => a.title && a.media_url).slice(0, 3)))
      .catch(() => {});
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function toggleSound() {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) v.play().catch(() => {});
    setMuted(v.muted);
  }

  return (
    <div className="lp">
      <header className={`lp-nav${scrolled ? ' is-scrolled' : ''}`}>
        <div className="lp-wrap lp-nav-in">
          <Link to="/" className="brand">
            <img src="/icons/logo.png" alt="" />
            <span>XERA</span>
          </Link>
          <nav className="lp-nav-links">
            <a href="#comment">Comment ça marche</a>
            <a href="#fonctions">Fonctionnalités</a>
            <Link to="/fata">Challenge Fata</Link>
          </nav>
          <div className="row" style={{ gap: 8 }}>
            <Link to="/connexion" className="btn btn--ghost btn--sm lp-login">
              Se connecter
            </Link>
            <Link to="/connexion?mode=inscription" className="btn btn--primary btn--sm">
              Commencer
            </Link>
          </div>
        </div>
      </header>

      {/* ---------- Héros ---------- */}
      <section className="lp-hero">
        <div className="lp-grid-bg" aria-hidden="true" />
        <div className="lp-wrap lp-hero-in">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow lp-anim" style={{ '--d': '0ms' }}>
              <span className="lp-dot" /> Suivez vos objectifs avec les projets
            </span>
            <h1 className="lp-title">
              {['Transformez', 'votre', 'progression', 'en', 'opportunités.'].map((w, i) => (
                <span key={w} className="lp-word" style={{ '--d': `${80 + i * 70}ms` }}>
                  {w}
                </span>
              ))}
            </h1>
            <p className="lp-lede lp-anim" style={{ '--d': '480ms' }}>
              XERA1 est une infrastructure de progression où les bâtisseurs documentent leur travail, attirent les bonnes
              audiences (investisseurs, collaborateurs, communauté) et transforment leurs avancées en réputation réelle.
            </p>
            <div className="lp-cta lp-anim" style={{ '--d': '580ms' }}>
              <Link to="/connexion?mode=inscription" className="btn btn--primary btn--lg">
                Lancez votre premier projet
                <Icon name="arrow_forward" />
              </Link>
              <button className="btn btn--lg" onClick={() => setDemo(true)}>
                <Icon name="play_arrow" filled />
                Voir la démo 60 s
              </button>
            </div>
            <p className="lp-meta lp-anim" style={{ '--d': '680ms' }}>
              Création de projet → mise à jour quotidienne → tableau de bord.
            </p>
          </div>

          <div className="lp-hero-media lp-anim" style={{ '--d': '300ms' }}>
            <div className="lp-window">
              <div className="lp-window-bar" aria-hidden="true">
                <i />
                <i />
                <i />
                <span>xera1.xyz</span>
              </div>
              <video
                ref={video}
                src={DEMO_VIDEO}
                poster={DEMO_POSTER}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label="Démo : créer un projet sur XERA"
              />
              <button className="lp-sound" onClick={toggleSound} aria-pressed={!muted}>
                <Icon name={muted ? 'volume_off' : 'volume_up'} size={18} />
                {muted ? 'Activer le son' : 'Son activé'}
              </button>
            </div>
            <div className="lp-float lp-float--a">
              <span className="lp-float-icon is-success">
                <Icon name="task_alt" size={18} />
              </span>
              <div>
                <strong>Jalon validé</strong>
                <span>Pilote 6 boutiques</span>
              </div>
            </div>
            <div className="lp-float lp-float--b">
              <span className="lp-float-icon">
                <Icon name="local_fire_department" size={18} filled />
              </span>
              <div>
                <strong>+126 encouragements</strong>
                <span>Jour 21</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lp-wrap lp-partners reveal">
          <p>Nos partenaires</p>
          <div className="lp-marquee">
            <div className="lp-marquee-track">
              {[...PARTNERS, ...PARTNERS].map((p, i) => (
                <img key={i} src={p.src} alt={i < PARTNERS.length ? p.alt : ''} aria-hidden={i >= PARTNERS.length} loading="lazy" />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Comment ça marche ---------- */}
      <section className="lp-section" id="comment">
        <div className="lp-wrap">
          <div className="lp-head reveal">
            <span className="eyebrow">Comment ça marche</span>
            <h2>De l’idée à la preuve, en trois étapes.</h2>
          </div>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <div key={s.title} className="lp-step reveal" style={{ '--d': `${i * 120}ms` }}>
                <span className="lp-step-n">0{i + 1}</span>
                <span className="lp-step-icon">
                  <Icon name={s.icon} />
                </span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Chiffres ---------- */}
      <section className="lp-section lp-stats-band">
        <div className="lp-wrap lp-stats reveal">
          <Counter value={stats?.builders} label="bâtisseurs" />
          <Counter value={stats?.projects} label="projets lancés" />
          <Counter value={stats?.proofs} label="preuves publiées" />
        </div>
      </section>

      {/* ---------- Fonctionnalités ---------- */}
      <section className="lp-section" id="fonctions">
        <div className="lp-wrap">
          <div className="lp-head reveal">
            <span className="eyebrow">Fonctionnalités</span>
            <h2>Tout ce qu’il faut pour construire en public.</h2>
          </div>
          <div className="lp-features">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="lp-feature reveal" style={{ '--d': `${(i % 3) * 100}ms` }}>
                <Icon name={f.icon} />
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Projets récents ---------- */}
      {arcs.length > 0 && (
        <section className="lp-section">
          <div className="lp-wrap">
            <div className="lp-head lp-head--row reveal">
              <div>
                <span className="eyebrow">En ce moment</span>
                <h2>Des projets qui avancent.</h2>
              </div>
              <Link to="/explorer" className="btn btn--sm">
                Tout explorer <Icon name="arrow_forward" />
              </Link>
            </div>
            <div className="lp-arcs">
              {arcs.map((a, i) => (
                <div key={a.id} className="reveal" style={{ '--d': `${i * 100}ms` }}>
                  <ArcCard arc={a} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- Appel final ---------- */}
      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-final reveal">
            <h2>Votre prochaine étape commence aujourd’hui.</h2>
            <p>Créez votre compte gratuitement et publiez votre première preuve en moins de deux minutes.</p>
            <div className="lp-cta" style={{ justifyContent: 'center' }}>
              <Link to="/connexion?mode=inscription" className="btn btn--primary btn--lg">
                Créer mon compte
              </Link>
              <Link to="/explorer" className="btn btn--lg">
                Explorer les projets
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <span className="brand" style={{ fontSize: 16 }}>
            <img src="/icons/logo.png" alt="" style={{ width: 22, height: 22 }} />
            XERA1
          </span>
          <nav>
            <a href="https://docs.xera1.xyz" target="_blank" rel="noreferrer">Documentation</a>
            <a href="/cgu">Conditions</a>
            <a href="/privacy">Confidentialité</a>
          </nav>
          <span className="muted">© {new Date().getFullYear()} XERA1 · Proof of Building</span>
        </div>
      </footer>

      <DemoModal open={demo} onClose={() => setDemo(false)} />
    </div>
  );
}
