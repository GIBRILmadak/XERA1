import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import legal from '../lib/legal.json';

/** CGU et politique de confidentialité (texte repris des anciennes pages). */
export default function Legal({ doc }) {
  const blocks = legal[doc] || [];
  const title = blocks.find(([t]) => t === 'h1')?.[1] || (doc === 'cgu' ? 'Conditions d’utilisation' : 'Confidentialité');
  const sections = blocks.filter(([t]) => t === 'h2');
  return (
    <>
      <TopBar back title={doc === 'cgu' ? 'Conditions d’utilisation' : 'Confidentialité'} />
      <main className="main legal">
        <span className="legal-icon">
          <Icon name={doc === 'cgu' ? 'gavel' : 'shield_person'} />
        </span>
        <h1>{title}</h1>
        {sections.length > 3 && (
          <nav className="card card--pad legal-toc" aria-label="Sommaire">
            <span className="eyebrow">Sommaire</span>
            {sections.map(([, t], i) => (
              <a key={i} href={`#s${i}`}>{t}</a>
            ))}
          </nav>
        )}
        {blocks
          .filter(([t]) => t !== 'h1')
          .map(([t, text], i) => {
            if (t === 'h2') {
              const n = sections.findIndex(([, s]) => s === text);
              return <h2 key={i} id={`s${n}`}>{text}</h2>;
            }
            if (t === 'h3' || t === 'h4') return <h3 key={i}>{text}</h3>;
            if (t === 'li') return <p key={i} className="legal-li">{text}</p>;
            return <p key={i}>{text}</p>;
          })}
      </main>
    </>
  );
}
