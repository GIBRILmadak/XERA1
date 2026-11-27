import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import Art from '../components/Illustrations';
import ArcCard from '../components/ArcCard';
import { fetchPlatformStats, fetchRecentArcs } from '../services/data';
import { compact } from '../lib/format';

const PARTNERS = [
  { src: '/icons/Impact_Hub.webp', alt: 'Impact Hub' },
  { src: '/icons/station-f.png', alt: 'Station F' },
  { src: '/icons/fata.webp', alt: 'Fata' },
  { src: '/icons/neddigi.jpeg', alt: 'Neddigi' },
  { src: '/icons/electrical service.jpeg', alt: 'Electrical Service' },
];

/** Étapes du tutoriel défilant : illustration + maquette d'interface animée. */
const STEPS = [
  { art: 'build', color: '#8B5CF6', icon: 'flag', kicker: 'Étape 1', title: 'Créez votre ARC', text: 'Un ARC, c’est votre projet : un objectif clair, une description et des jalons du début à la fin.', mock: 'arc' },
  { art: 'proof', color: '#10B981', icon: 'add_photo_alternate', kicker: 'Étape 2', title: 'Publiez une preuve chaque jour', text: 'Photo, vidéo ou texte : une avancée, un obstacle ou une pause. Votre progression devient visible et vérifiable.', mock: 'proof' },
  { art: 'milestone', color: '#F5C451', icon: 'task_alt', kicker: 'Étape 3', title: 'Validez vos jalons', text: 'Chaque étape franchie est validée par vous, par la communauté ou par une page pro qui vous accorde son sceau.', mock: 'milestone' },
  { art: 'support', color: '#FB7185', icon: 'favorite', kicker: 'Étape 4', title: 'Recevez encouragements et soutiens', text: 'Votre communauté vous encourage, vous écrit en privé et peut vous soutenir financièrement par Mobile Money.', mock: 'support' },
  { art: 'analytics', color: '#60A5FA', icon: 'person_search', kicker: 'Étape 5', title: 'Faites-vous repérer', text: 'Badges vérifiés, score d’élan, paliers de contributeur : recruteurs et investisseurs trouvent ceux qui avancent vraiment.', mock: 'talent' },
  { art: 'live', color: '#EF4444', icon: 'sensors', kicker: 'Étape 6', title: 'Construisez en direct', text: 'Lancez un live, partagez votre écran et répondez à votre communauté dans le chat.', mock: 'live' },
];

const TIERS = [
  ['⭐', 'Silex', '20 preuves'],
  ['🥉', 'Séquoia', '50 preuves'],
  ['🥈', 'Forgeron', '50 preuves · 500 abonnés'],
  ['🏆', 'Ingénieur', '70 preuves · 1 000 abonnés'],
  ['🌟', 'Bâtisseur', '100 preuves · 10 k abonnés'],
  ['👑', 'Empereur', '200 preuves · 100 k abonnés'],
  ['💎', 'Architecte', '300 preuves · 1 M abonnés'],
];

const FEATURES = [
  { art: 'chat', title: 'Messagerie privée', text: 'Pièces jointes protégées, réponses, accusés de lecture, blocage et signalement.' },
  { art: 'verified', title: 'Badges vérifiés', text: 'Créateurs, équipes, pages et lauréats Fata : la confiance se voit au premier coup d’œil.' },
  { art: 'payment', title: 'Abonnements et soutiens', text: 'Standard, Medium, Pro ou Elite, et des soutiens reçus directement par Mobile Money.' },
  { art: 'community', title: 'Pages pro', text: 'Entreprises et organisations publient, recrutent et certifient leurs équipes.' },
  { art: 'trophy', title: 'Challenges partenaires', text: 'Relevez le challenge Fata × XERA1 et gagnez 6 mois de Fata Pro.' },
  { art: 'launch', title: 'Un fil qui apprend', text: 'Votre fil s’adapte à ce que vous encouragez, regardez et recherchez.' },
];

/** Apparition au défilement. */
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

function Counter({ value, label, icon }) {
  const ref = useRef();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!value) return undefined;
    let raf;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / 1400);
        setShown(Math.round(value * (1 - (1 - p) ** 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(ref.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);
  return (
    <div className="lp-stat" ref={ref}>
      <Icon name={icon} />
      <strong>{value ? compact(shown || value) : '—'}</strong>
      <span>{label}</span>
    </div>
  );
}

/** Maquettes d'interface animées de chaque étape. */
function Mock({ kind }) {
  if (kind === 'arc')
    return (
      <div className="mock">
        <span className="mock-chip"><Icon name="flag" size={16} /> Nouvel ARC</span>
        <strong className="mock-type">Caisse mobile hors-ligne</strong>
        <div className="mock-lines"><i style={{ width: '90%' }} /><i style={{ width: '70%' }} /></div>
        {['Maquettes', 'Ventes hors-ligne', 'Pilote 6 boutiques'].map((m, i) => (
          <div key={m} className="mock-ms" style={{ animationDelay: `${0.3 + i * 0.25}s` }}>
            <span>{i + 1}</span>
            {m}
          </div>
        ))}
        <span className="mock-btn">Lancer le projet</span>
      </div>
    );
  if (kind === 'proof')
    return (
      <div className="mock">
        <div className="mock-head"><i className="mock-av" /> <b>Amani</b> <span className="mock-state">Avancée</span></div>
        <div className="mock-photo"><Icon name="image" size={30} /></div>
        <strong>La synchronisation tient enfin</strong>
        <div className="mock-react"><span className="mock-fire"><Icon name="local_fire_department" filled size={18} /> 126</span><span><Icon name="visibility" size={18} /> 1,8 k</span></div>
      </div>
    );
  if (kind === 'milestone')
    return (
      <div className="mock">
        {['Maquettes validées', 'Ventes hors-ligne', 'Pilote 6 boutiques'].map((m, i) => (
          <div key={m} className={`mock-tl${i < 2 ? ' is-done' : ''}`} style={{ animationDelay: `${i * 0.35}s` }}>
            <span className="mock-node">{i < 2 ? <Icon name="check" size={16} /> : 3}</span>
            <div><b>{m}</b><small>{i < 2 ? 'Validé' : 'Prochaine étape'}</small></div>
          </div>
        ))}
        <span className="mock-seal"><Icon name="workspace_premium" filled size={16} /> Validé par Studio Lumbi</span>
      </div>
    );
  if (kind === 'support')
    return (
      <div className="mock">
        <div className="mock-bubble">Bravo pour le pilote ! 👏</div>
        <div className="mock-bubble is-me">Merci, on lance la suite lundi. <span className="mock-ticks">✓✓</span></div>
        <div className="mock-gift"><Icon name="favorite" filled /> Soutien reçu · <b>5 $</b></div>
      </div>
    );
  if (kind === 'talent')
    return (
      <div className="mock">
        {[92, 84, 77].map((s, i) => (
          <div key={s} className="mock-row" style={{ animationDelay: `${i * 0.25}s` }}>
            <i className="mock-av" />
            <div className="grow"><b>{['Amani K.', 'Jonas M.', 'Grace N.'][i]}</b><div className="mock-bar"><i style={{ width: `${s}%` }} /></div></div>
            <strong>{s}</strong>
          </div>
        ))}
      </div>
    );
  return (
    <div className="mock">
      <span className="mock-live-badge"><i /> EN DIRECT</span>
      <div className="mock-screen"><Icon name="code" size={34} /></div>
      <div className="mock-chat"><span>Jonas : super live 🔥</span><span>Grace : quelle base ?</span></div>
    </div>
  );
}

/** Tutoriel : la scène reste fixe pendant que les étapes défilent. */
function ScrollTutorial() {
  const [active, setActive] = useState(0);
  const refs = useRef([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(Number(e.target.dataset.i));
        }),
      { rootMargin: '-45% 0px -45% 0px' },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  const step = STEPS[active];
  return (
    <section className="lp-tuto" id="comment">
      <div className="lp-wrap">
        <div className="lp-head reveal">
          <span className="eyebrow">Comment ça marche</span>
          <h2>De l’idée à la preuve, en six étapes.</h2>
        </div>
        <div className="lp-tuto-grid">
          <div className="lp-stage" style={{ '--accent': step.color }}>
            <div className="lp-stage-glow" />
            <div className="lp-stage-art" key={`a${active}`}>
              <Art name={step.art} size={300} />
            </div>
            <div className="lp-stage-mock" key={`m${active}`}>
              <Mock kind={step.mock} />
            </div>
            <div className="lp-stage-dots">
              {STEPS.map((s, i) => (
                <button key={s.title} className={i === active ? 'is-on' : ''} aria-label={s.title} onClick={() => refs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
              ))}
            </div>
          </div>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <article key={s.title} ref={(el) => (refs.current[i] = el)} data-i={i} className={`lp-step${i === active ? ' is-active' : ''}`} style={{ '--accent': s.color }}>
                <span className="lp-step-icon"><Icon name={s.icon} /></span>
                <span className="lp-step-kicker">{s.kicker}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <div className="lp-step-inline">
                  <Art name={s.art} size={220} />
                  <Mock kind={s.mock} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const [stats, setStats] = useState(null);
  const [arcs, setArcs] = useState([]);
  const [scrolled, setScrolled] = useState(false);
  useReveal();

  useEffect(() => {
    fetchPlatformStats().then(setStats).catch(() => {});
    fetchRecentArcs(9)
      .then((list) => setArcs(list.filter((a) => a.title).slice(0, 3)))
      .catch(() => {});
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
            <a href="#badges">Badges</a>
            <a href="#fonctions">Fonctionnalités</a>
            <Link to="/explorer">Explorer</Link>
          </nav>
          <div className="row" style={{ gap: 8 }}>
            <Link to="/connexion" className="btn btn--ghost btn--sm lp-login">Se connecter</Link>
            <Link to="/connexion?mode=inscription" className="btn btn--primary btn--sm">Commencer</Link>
          </div>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-wrap lp-hero-in">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow lp-anim" style={{ '--d': '0ms' }}>
              <span className="lp-dot" /> Proof of Building
            </span>
            <h1 className="lp-title">
              {['Transformez', 'votre', 'progression', 'en', 'opportunités.'].map((w, i) => (
                <span key={w} className="lp-word" style={{ '--d': `${80 + i * 70}ms` }}>{w}</span>
              ))}
            </h1>
            <p className="lp-lede lp-anim" style={{ '--d': '480ms' }}>
              XERA1 est l’infrastructure de progression des bâtisseurs : documentez votre travail, attirez investisseurs,
              collaborateurs et communauté, et transformez vos avancées en réputation réelle.
            </p>
            <div className="lp-cta lp-anim" style={{ '--d': '580ms' }}>
              <Link to="/connexion?mode=inscription" className="btn btn--primary btn--lg">
                Lancez votre premier projet <Icon name="arrow_forward" />
              </Link>
              <a href="#comment" className="btn btn--lg">
                <Icon name="play_arrow" filled /> Voir comment ça marche
              </a>
            </div>
          </div>
          <div className="lp-hero-scene lp-anim" style={{ '--d': '250ms' }}>
            <Art name="build" size={420} className="lp-hero-art" />
            <div className="lp-float lp-float--a">
              <span className="lp-float-icon is-success"><Icon name="task_alt" size={18} /></span>
              <div><strong>Jalon validé</strong><span>Pilote 6 boutiques</span></div>
            </div>
            <div className="lp-float lp-float--b">
              <span className="lp-float-icon"><Icon name="local_fire_department" size={18} filled /></span>
              <div><strong>+126 encouragements</strong><span>Jour 21</span></div>
            </div>
            <div className="lp-float lp-float--c">
              <span className="lp-float-icon is-violet"><Icon name="verified" size={18} filled /></span>
              <div><strong>Badge Silex débloqué</strong><span>20 preuves publiées</span></div>
            </div>
          </div>
        </div>
        <a href="#comment" className="lp-scroll-cue" aria-label="Défiler vers le tutoriel">
          <Icon name="expand_more" />
        </a>
      </section>

      <div className="lp-wrap lp-partners reveal">
        <p>Ils accompagnent XERA1</p>
        <div className="lp-marquee">
          <div className="lp-marquee-track">
            {[...PARTNERS, ...PARTNERS].map((p, i) => (
              <img key={i} src={p.src} alt={i < PARTNERS.length ? p.alt : ''} aria-hidden={i >= PARTNERS.length} loading="lazy" />
            ))}
          </div>
        </div>
      </div>

      <ScrollTutorial />

      <section className="lp-stats-band">
        <div className="lp-wrap lp-stats reveal">
          <Counter icon="group" value={stats?.builders} label="bâtisseurs" />
          <Counter icon="flag" value={stats?.projects} label="projets lancés" />
          <Counter icon="photo_library" value={stats?.proofs} label="preuves publiées" />
        </div>
      </section>

      <section className="lp-section" id="badges">
        <div className="lp-wrap">
          <div className="lp-head reveal">
            <span className="eyebrow">Paliers de contributeur</span>
            <h2>De Silex à Architecte, chaque preuve vous fait grimper.</h2>
          </div>
          <div className="lp-tiers">
            {TIERS.map(([e, name, req], i) => (
              <div key={name} className="lp-tier reveal" style={{ '--d': `${i * 80}ms`, '--h': `${36 + i * 16}px` }}>
                <span className="lp-tier-emoji">{e}</span>
                <div className="lp-tier-bar" />
                <strong>{name}</strong>
                <small>{req}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" id="fonctions">
        <div className="lp-wrap">
          <div className="lp-head reveal">
            <span className="eyebrow">Fonctionnalités</span>
            <h2>Tout ce qu’il faut pour construire en public.</h2>
          </div>
          <div className="lp-features">
            {FEATURES.map((f, i) => (
              <article key={f.title} className="lp-feature reveal" style={{ '--d': `${(i % 3) * 100}ms` }}>
                <Art name={f.art} size={170} />
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {arcs.length > 0 && (
        <section className="lp-section">
          <div className="lp-wrap">
            <div className="lp-head lp-head--row reveal">
              <div>
                <span className="eyebrow">En ce moment</span>
                <h2>Des projets qui avancent.</h2>
              </div>
              <Link to="/explorer" className="btn btn--sm">Tout explorer <Icon name="arrow_forward" /></Link>
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

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-final reveal">
            <Art name="signup" size={230} />
            <h2>Votre prochaine étape commence aujourd’hui.</h2>
            <p>Créez votre compte gratuitement et publiez votre première preuve en moins de deux minutes.</p>
            <div className="lp-cta" style={{ justifyContent: 'center' }}>
              <Link to="/connexion?mode=inscription" className="btn btn--primary btn--lg">Créer mon compte</Link>
              <Link to="/explorer" className="btn btn--lg">Explorer les projets</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <span className="brand" style={{ fontSize: 16 }}>
            <img src="/icons/logo.png" alt="" style={{ width: 22, height: 22 }} /> XERA1
          </span>
          <nav>
            <a href="https://docs.xera1.xyz" target="_blank" rel="noreferrer">Documentation</a>
            <Link to="/credits">Remerciements</Link>
            <Link to="/cgu">Conditions</Link>
            <Link to="/privacy">Confidentialité</Link>
          </nav>
          <span className="muted">© {new Date().getFullYear()} XERA1 · Proof of Building</span>
        </div>
      </footer>
    </div>
  );
}
