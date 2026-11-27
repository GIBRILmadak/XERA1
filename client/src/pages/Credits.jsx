import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import Art from '../components/Illustrations';

/** Page « XERA1 existe grâce à… » (credits.html), même contenu. */
const SECTIONS = [
  {
    icon: 'eco',
    color: '#10B981',
    title: 'Origine',
    body: [
      'Cette application n’est pas née d’un brainstorming en entreprise ou d’une analyse de marché.',
      'Elle est le fruit de rencontres, de conversations tardives, de doutes partagés et d’espoirs mutuels.',
      'XERA1 a été façonnée par des mains humaines, alimentée par des histoires réelles, et construite sur l’idée simple que chaque trajectoire mérite d’être vue, comprise et célébrée.',
    ],
  },
  {
    icon: 'family_restroom',
    color: '#F5C451',
    title: 'Famille',
    body: ['Sans eux, il n’y aurait ni idée, ni énergie, ni XERA1.'],
    names: ['Jean-Paul Safari — Papa', 'Thérèse Riziki — Maman'],
  },
  {
    icon: 'handshake',
    color: '#60A5FA',
    title: 'Amis',
    body: ['Ceux qui étaient là quand c’était flou, lent, bancal.', 'Ceux qui ont cru avant que ça prenne forme.'],
    names: ['ERNEST HD', 'Jean', 'Julien'],
  },
  {
    icon: 'code',
    color: '#8B5CF6',
    title: 'Créateur',
    body: ['Créé par Gibril, avec beaucoup de doutes, du café, et très peu de nuits de sommeil.'],
  },
];

export default function Credits() {
  useEffect(() => {
    const items = document.querySelectorAll('.reveal:not(.is-in)');
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.1 },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <TopBar back title="Remerciements" />
      <main className="main">
        <section className="credits-hero">
          <Art name="community" size={220} />
          <h1>XERA1 existe grâce à…</h1>
        </section>
        <div className="stack">
          {SECTIONS.map((s, i) => (
            <section key={s.title} className="card card--pad credits-card reveal" style={{ '--d': `${i * 80}ms` }}>
              <span className="credits-icon" style={{ color: s.color, background: `${s.color}22` }}>
                <Icon name={s.icon} />
              </span>
              <h2>{s.title}</h2>
              {s.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
              {s.names && (
                <div className="credits-names">
                  {s.names.map((n) => (
                    <span key={n}>{n}</span>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
        <p className="credits-final reveal">
          XERA1 est public. XERA1 est ouvert.
          <br />
          <strong>Un jour, ton nom sera peut-être ici.</strong>
        </p>
        <div style={{ textAlign: 'center' }}>
          <Link to="/" className="btn btn--primary">
            <Icon name="home" /> Retour à XERA
          </Link>
        </div>
      </main>
    </>
  );
}
