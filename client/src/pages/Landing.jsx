import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Code2,
  Compass,
  Flame,
  FolderGit2,
  GitCommitHorizontal,
  Heart,
  Home,
  Lock,
  Mail,
  MessageCircle,
  MessageSquare,
  Plus,
  Radio,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import { Illustration } from '../components/Illustrations';
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

const STEPS = [
  { ill: 'publish', icon: Rocket, title: 'Publiez votre projet', text: 'Créez un ARC : un objectif, une description et les jalons qui mènent au lancement.', mock: 'arc' },
  { ill: 'document', icon: Code2, title: 'Documentez chaque avancée', text: 'Une preuve par jour : capture, extrait de code, démo. Les obstacles et les pauses comptent aussi.', mock: 'proof' },
  { ill: 'validate', icon: CheckCircle2, title: 'Validez vos jalons', text: 'Chaque étape franchie est validée, par vous, par la communauté ou par une page pro.', mock: 'milestones' },
  { ill: 'support', icon: Heart, title: 'Soyez soutenu', text: 'Encouragements, messages privés, soutiens par Mobile Money : votre travail attire les bonnes personnes.', mock: 'support' },
];

const BENTO = [
  { icon: FolderGit2, title: 'ARC et jalons', text: 'Chaque projet a un début, des étapes et une fin. La progression se lit d’un coup d’œil.', size: 'lg' },
  { icon: BarChart3, title: 'Score d’élan', text: 'Régularité, volume, constance : vos statistiques mensuelles.', size: 'sm' },
  { icon: MessageSquare, title: 'Messagerie privée', text: 'Pièces jointes protégées, accusés de lecture, blocage.', size: 'sm' },
  { icon: Radio, title: 'Lives', text: 'Codez en direct, partagez votre écran, répondez dans le chat.', size: 'sm' },
  { icon: Wallet, title: 'Soutiens et retraits', text: 'Recevez des soutiens et retirez vers votre Mobile Money.', size: 'sm' },
  { icon: Search, title: 'Talent Explorer', text: 'Recruteurs et investisseurs trouvent les builders qui avancent vraiment, classés par élan.', size: 'lg' },
];

const FAQ = [
  ['XERA1, c’est quoi exactement ?', 'Une plateforme où les développeurs et builders documentent leurs projets avec des preuves datées. Votre réputation repose sur ce que vous avez réellement construit.'],
  ['Est-ce gratuit ?', 'Oui. Créer un compte, publier des projets et des preuves est gratuit. Les abonnements Standard, Medium et Pro ajoutent le badge vérifié, plus de visibilité et les soutiens.'],
  ['Qu’est-ce qu’un ARC ?', 'Un projet avec un objectif, une description et des jalons. Chaque preuve publiée s’y rattache et fait avancer la progression.'],
  ['Comment obtenir le badge vérifié ?', 'En le demandant depuis vos réglages : l’équipe XERA examine votre profil. Il est aussi inclus dans les abonnements (Gold avec le plan Pro).'],
  ['Comment fonctionnent les soutiens ?', 'Avec un abonnement Medium ou Pro actif, votre communauté peut vous soutenir par Mobile Money. Vous recevez 75 % de chaque soutien confirmé.'],
  ['Les entreprises peuvent-elles rejoindre XERA ?', 'Oui, avec une page pro : actualités, projets d’organisation, équipe certifiée, recrutement et validation des preuves de leurs membres.'],
];

/** Apparition au défilement (désactivée si les animations sont réduites). */
function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll('.reveal:not(.is-in)');
    if (!('IntersectionObserver' in window) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
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
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
}

function Stat({ value, label }) {
  return (
    <div className="lx-stat">
      <strong>{value ? compact(value) : '—'}</strong>
      <span>{label}</span>
    </div>
  );
}

/** Grande maquette du produit (HTML/CSS, aucune image). */
function ProductMock() {
  return (
    <div className="lx-product" aria-hidden="true">
      <div className="lx-product-bar">
        <i />
        <i />
        <i />
        <span>xera1.xyz</span>
      </div>
      <div className="lx-product-body">
        <aside className="lx-side">
          <span className="lx-logo"><img src="/icons/logo.png" alt="" /> XERA</span>
          {[[Home, 'Accueil', true], [Compass, 'Explorer'], [MessageCircle, 'Messages'], [Bell, 'Notifications'], [Trophy, 'Challenge Fata']].map(([I, l, on]) => (
            <span key={l} className={`lx-snav${on ? ' is-on' : ''}`}><I size={16} /> {l}</span>
          ))}
          <span className="lx-create"><Plus size={16} /> Créer</span>
        </aside>
        <main className="lx-feed">
          <article className="lx-post">
            <header>
              <span className="lx-av" />
              <span className="lx-name">Amani K. <BadgeCheck size={15} className="lx-verified" /></span>
              <span className="lx-day">Jour 21</span>
              <span className="lx-state">Avancée</span>
            </header>
            <span className="lx-arc"><FolderGit2 size={14} /> API de paiement open source</span>
            <strong>Webhooks signés en production</strong>
            <p>Signature HMAC, rejeu protégé et tests de bout en bout. Les 3 intégrations pilotes sont passées.</p>
            <pre className="lx-code">
              <span className="k">export async function</span> <span className="f">verify</span>(sig, body) {'{'}
              {'\n'}  <span className="k">return</span> timingSafeEqual(sig, hmac(body));
              {'\n'}{'}'}
            </pre>
            <footer>
              <span><Flame size={15} /> 126</span>
              <span><MessageCircle size={15} /> 18</span>
              <span className="lx-seal"><ShieldCheck size={15} /> Validé par une page pro</span>
            </footer>
          </article>
        </main>
        <aside className="lx-panel">
          <span className="lx-panel-title">Jalons</span>
          {[['Spécification de l’API', true], ['SDK JavaScript', true], ['Webhooks signés', true], ['Bêta publique', false]].map(([t, d], i) => (
            <span key={t} className={`lx-ms${d ? ' is-done' : ''}`}>
              <span className="lx-ms-node">{d ? <CheckCircle2 size={14} /> : i + 1}</span>
              {t}
            </span>
          ))}
          <span className="lx-progress"><i style={{ width: '75%' }} /></span>
          <span className="lx-muted">3 / 4 jalons · score d’élan 82</span>
        </aside>
      </div>
    </div>
  );
}

/** Maquettes d'interface des étapes. */
function StepMock({ kind }) {
  if (kind === 'arc')
    return (
      <div className="lx-mock">
        <span className="lx-chip"><FolderGit2 size={14} /> Nouvel ARC</span>
        <strong>CLI de déploiement pour Next.js</strong>
        <span className="lx-muted">Objectif : déployer en une commande, sans configuration.</span>
        {['Prototype en local', 'Support des variables d’env', 'Version 1.0 publiée'].map((m, i) => (
          <span key={m} className="lx-mock-ms"><span>{i + 1}</span>{m}</span>
        ))}
        <span className="lx-btn">Publier l’ARC</span>
      </div>
    );
  if (kind === 'proof')
    return (
      <div className="lx-mock">
        <span className="lx-chip is-green">Avancée · Jour 8</span>
        <strong>Cache des builds incrémentaux</strong>
        <pre className="lx-code">
          <span className="c"># build 4,1 s → 0,9 s</span>
          {'\n'}$ xera deploy --cache
        </pre>
        <span className="lx-commit"><GitCommitHorizontal size={14} /> a3f9c21 · feat: cache des artefacts</span>
      </div>
    );
  if (kind === 'milestones')
    return (
      <div className="lx-mock">
        {['Prototype en local', 'Support des variables d’env', 'Version 1.0 publiée'].map((m, i) => (
          <span key={m} className={`lx-mock-tl${i < 2 ? ' is-done' : ''}`}>
            <span>{i < 2 ? <CheckCircle2 size={14} /> : 3}</span>
            {m}
          </span>
        ))}
        <span className="lx-seal"><ShieldCheck size={15} /> Sceau accordé par une page pro</span>
      </div>
    );
  return (
    <div className="lx-mock">
      <span className="lx-bubble">Super travail sur le cache, on teste lundi.</span>
      <span className="lx-bubble is-me">Merci ! La doc est en ligne.</span>
      <span className="lx-support"><Heart size={15} /> Soutien reçu · 5 $</span>
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`lx-faq-item${open ? ' is-open' : ''}`}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{q}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      <div className="lx-faq-a">
        <p>{a}</p>
      </div>
    </div>
  );
}

export default function Landing() {
  const [stats, setStats] = useState(null);
  const [arcs, setArcs] = useState([]);
  const [scrolled, setScrolled] = useState(false);
  const top = useRef();
  useReveal();

  useEffect(() => {
    fetchPlatformStats().then(setStats).catch(() => {});
    fetchRecentArcs(12)
      .then((list) => setArcs(list.filter((a) => a.title && a.description !== '').slice(0, 3)))
      .catch(() => {});
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="lx" ref={top}>
      <a href="#contenu" className="lx-skip">Aller au contenu</a>
      <header className={`lx-nav${scrolled ? ' is-scrolled' : ''}`}>
        <div className="lx-wrap lx-nav-in">
          <Link to="/" className="lx-brand" aria-label="XERA, accueil">
            <img src="/icons/logo.png" alt="" />
            XERA
          </Link>
          <nav className="lx-links" aria-label="Sections">
            <a href="#comment">Comment ça marche</a>
            <a href="#badges">Badges</a>
            <a href="#fonctionnalites">Fonctionnalités</a>
            <Link to="/explorer">Explorer</Link>
          </nav>
          <div className="lx-nav-cta">
            <Link to="/connexion" className="lx-btn-ghost">Se connecter</Link>
            <Link to="/connexion?mode=inscription" className="lx-btn-primary">Commencer</Link>
          </div>
        </div>
      </header>

      <main id="contenu">
        {/* Hero */}
        <section className="lx-hero">
          <div className="lx-hero-bg" aria-hidden="true" />
          <div className="lx-wrap lx-hero-in">
            <span className="lx-pill reveal"><Sparkles size={14} /> Proof of Building pour développeurs et builders</span>
            <h1 className="reveal" style={{ '--d': '60ms' }}>Prouvez ce que vous construisez.</h1>
            <p className="lx-lede reveal" style={{ '--d': '120ms' }}>
              Documentez vos projets jour après jour et laissez votre travail parler pour vous.
            </p>
            <div className="lx-hero-cta reveal" style={{ '--d': '180ms' }}>
              <Link to="/connexion?mode=inscription" className="lx-btn-primary lx-lg">
                Créer mon premier projet <ArrowRight size={18} />
              </Link>
              <Link to="/explorer" className="lx-btn-ghost lx-lg">
                <Compass size={18} /> Explorer les projets
              </Link>
            </div>
            <div className="lx-product-wrap reveal" style={{ '--d': '260ms' }}>
              <ProductMock />
            </div>
          </div>
        </section>

        {/* Preuves */}
        <section className="lx-proofband" aria-label="XERA en chiffres">
          <div className="lx-wrap">
            <div className="lx-stats reveal">
              <Stat value={stats?.projects} label="projets publiés" />
              <Stat value={stats?.proofs} label="preuves documentées" />
              <Stat value={stats?.milestones} label="jalons validés" />
              <Stat value={stats?.verified} label="builders vérifiés" />
            </div>
            <p className="lx-partners-title">Ils construisent sur XERA</p>
            <div className="lx-partners">
              {PARTNERS.map((p) => (
                <img key={p.alt} src={p.src} alt={p.alt} loading="lazy" />
              ))}
            </div>
          </div>
        </section>

        {/* Comment ça marche */}
        <section className="lx-section" id="comment">
          <div className="lx-wrap">
            <header className="lx-head reveal">
              <span className="lx-eyebrow">Comment ça marche</span>
              <h2>Quatre étapes, du premier commit au soutien.</h2>
            </header>
            <div className="lx-steps">
              {STEPS.map((s, i) => {
                const I = s.icon;
                return (
                  <article key={s.title} className={`lx-step reveal${i % 2 ? ' is-alt' : ''}`}>
                    <div className="lx-step-text">
                      <span className="lx-step-n">0{i + 1}</span>
                      <span className="lx-step-icon"><I size={20} /></span>
                      <h3>{s.title}</h3>
                      <p>{s.text}</p>
                    </div>
                    <div className="lx-step-visual">
                      <div className="lx-ill-card">
                        <Illustration name={s.ill} className="lx-ill" />
                        <div className="lx-step-mock"><StepMock kind={s.mock} /></div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Badges */}
        <section className="lx-section" id="badges">
          <div className="lx-wrap lx-badges">
            <div className="reveal">
              <span className="lx-eyebrow">Badges</span>
              <h2>La confiance se voit au premier coup d’œil.</h2>
              <p className="lx-muted-p">Les badges sont attribués par l’équipe XERA ou inclus dans les abonnements. Ils apparaissent à côté du nom, partout dans l’appli.</p>
              <ul className="lx-badge-list">
                <li>
                  <img src="/icons/verify-personal.svg" alt="" />
                  <div><strong>Créateur vérifié</strong><span>Identité et travail confirmés par l’équipe XERA, ou plan Standard / Medium.</span></div>
                </li>
                <li>
                  <img src="/icons/verify-personal-gold.svg" alt="" />
                  <div><strong>Pro · Gold</strong><span>Plan Pro actif : badge Gold, soutiens sans seuil, visibilité ×5, lives HD.</span></div>
                </li>
                <li>
                  <img src="/icons/verify-com.svg" alt="" />
                  <div><strong>Équipe vérifiée</strong><span>Entreprises et organisations confirmées.</span></div>
                </li>
                <li>
                  <img src="/icons/verify_page.svg" alt="" />
                  <div><strong>Page pro vérifiée</strong><span>Pages officielles, qui peuvent valider les preuves de leurs membres.</span></div>
                </li>
              </ul>
            </div>
            <div className="lx-ill-card reveal" style={{ '--d': '120ms' }}>
              <Illustration name="badges" className="lx-ill" />
            </div>
          </div>
        </section>

        {/* Fonctionnalités */}
        <section className="lx-section" id="fonctionnalites">
          <div className="lx-wrap">
            <header className="lx-head reveal">
              <span className="lx-eyebrow">Fonctionnalités</span>
              <h2>Tout ce qu’il faut pour construire en public.</h2>
            </header>
            <div className="lx-bento">
              {BENTO.map((b, i) => {
                const I = b.icon;
                return (
                  <article key={b.title} className={`lx-card lx-bento-${b.size} reveal`} style={{ '--d': `${(i % 3) * 80}ms` }}>
                    <span className="lx-card-icon"><I size={20} /></span>
                    <h3>{b.title}</h3>
                    <p>{b.text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Exemples de projets */}
        {arcs.length > 0 && (
          <section className="lx-section">
            <div className="lx-wrap">
              <header className="lx-head lx-head-row reveal">
                <div>
                  <span className="lx-eyebrow">En ce moment sur XERA</span>
                  <h2>Des projets qui avancent.</h2>
                </div>
                <Link to="/explorer" className="lx-btn-ghost">Tout explorer <ArrowRight size={16} /></Link>
              </header>
              <div className="lx-arcs">
                {arcs.map((a, i) => (
                  <div key={a.id} className="reveal" style={{ '--d': `${i * 80}ms` }}>
                    <ArcCard arc={a} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* FAQ */}
        <section className="lx-section" id="faq">
          <div className="lx-wrap lx-faq-wrap">
            <header className="lx-head reveal">
              <span className="lx-eyebrow">Questions fréquentes</span>
              <h2>Bon à savoir.</h2>
            </header>
            <div className="lx-faq reveal">
              {FAQ.map(([q, a]) => (
                <FaqItem key={q} q={q} a={a} />
              ))}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="lx-final">
          <div className="lx-wrap lx-final-in reveal">
            <h2>Votre prochain projet mérite d’être vu.</h2>
            <p>Créez votre compte et publiez votre première preuve en deux minutes.</p>
            <div className="lx-hero-cta">
              <Link to="/connexion?mode=inscription" className="lx-btn-primary lx-lg">Commencer gratuitement <ArrowRight size={18} /></Link>
              <Link to="/abonnements" className="lx-btn-ghost lx-lg">Voir les abonnements</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="lx-footer">
        <div className="lx-wrap lx-footer-grid">
          <div className="lx-footer-brand">
            <span className="lx-brand"><img src="/icons/logo.png" alt="" /> XERA1</span>
            <p>La plateforme Proof of Building des développeurs et builders.</p>
          </div>
          <nav aria-label="Produit">
            <strong>Produit</strong>
            <Link to="/explorer">Explorer</Link>
            <Link to="/abonnements">Abonnements</Link>
            <Link to="/talents">Talent Explorer</Link>
            <Link to="/fata">Challenge Fata</Link>
          </nav>
          <nav aria-label="Ressources">
            <strong>Ressources</strong>
            <a href="https://docs.xera1.xyz" target="_blank" rel="noreferrer"><BookOpen size={14} /> Documentation</a>
            <Link to="/pages/nouvelle">Pages pro</Link>
            <Link to="/credits">Remerciements</Link>
          </nav>
          <nav aria-label="Légal">
            <strong>Légal</strong>
            <Link to="/cgu">Conditions d’utilisation</Link>
            <Link to="/privacy">Confidentialité</Link>
          </nav>
          <nav aria-label="Contact">
            <strong>Contact</strong>
            <a href="mailto:gibril@xera1.xyz"><Mail size={14} /> gibril@xera1.xyz</a>
            <a href="https://wa.me/243849102405" target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a>
            <Link to="/connexion"><Users size={14} /> Rejoindre la communauté</Link>
          </nav>
        </div>
        <div className="lx-wrap lx-footer-bottom">
          <span>© {new Date().getFullYear()} XERA1 · Proof of Building</span>
          <span><Lock size={13} /> Paiements sécurisés par Mobile Money</span>
        </div>
      </footer>
    </div>
  );
}
