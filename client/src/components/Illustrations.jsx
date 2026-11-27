/**
 * Illustrations XERA — compositions abstraites, style Material :
 * formes géométriques arrondies + fragments d'interface XERA qui flottent.
 * Aplats uniquement, 4 couleurs max (violet XERA, or réservé aux validations,
 * une teinte froide, un neutre zinc), aucun personnage.
 * Couleurs via variables CSS (--ill-*) pour suivre le thème.
 *
 * <Illustration name="publish" />  — viewBox 640×480, role="img" + <title>.
 * <Art name="…" size={…} />        — alias utilisé dans l'appli (anciens noms conservés).
 */

const V = 'var(--ill-violet)';
const VS = 'var(--ill-violet-soft)';
const G = 'var(--ill-gold)';
const C = 'var(--ill-cool)';
const N1 = 'var(--ill-n1)'; // surface des fragments
const N2 = 'var(--ill-n2)'; // lignes / détails
const N3 = 'var(--ill-n3)'; // texte simulé clair

const Line = ({ x, y, w, c = N2, h = 10 }) => <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={c} />;
const Check = ({ x, y, s = 1, c = '#fff' }) => (
  <path d={`M${x - 8 * s} ${y} l${6 * s} ${6 * s} l${11 * s} ${-12 * s}`} stroke={c} strokeWidth={4 * s} fill="none" strokeLinecap="round" strokeLinejoin="round" />
);

/** 1. Publier : carte projet + flèche de mise en ligne. */
function Publish() {
  return (
    <>
      <circle cx="470" cy="140" r="96" fill={VS} />
      <path d="M96 400 a120 120 0 0 1 120 -120 v120 z" fill={C} opacity=".22" />
      <g className="ill-float">
        <rect x="120" y="150" width="300" height="210" rx="22" fill={N1} />
        <circle cx="158" cy="190" r="16" fill={V} />
        <Line x={184} y={180} w={120} c={N3} />
        <Line x={184} y={198} w={70} />
        <rect x="140" y="226" width="260" height="70" rx="14" fill={N2} opacity=".55" />
        <Line x={156} y={244} w={150} c={N3} />
        <Line x={156} y={264} w={100} />
        <rect x="140" y="312" width="110" height="30" rx="15" fill={V} />
        <Line x={158} y={322} w={74} c="#fff" />
      </g>
      <g className="ill-float" style={{ animationDelay: '1.2s' }}>
        <path d="M396 204 C 450 196 478 170 498 128" stroke={V} strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M478 128 h22 v22" stroke={V} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="430" y="64" width="118" height="44" rx="22" fill={N1} />
        <circle cx="454" cy="86" r="7" fill={C} />
        <Line x={470} y={81} w={60} c={N3} />
      </g>
    </>
  );
}

/** 2. Documenter : blocs de code et notes empilés. */
function Document() {
  return (
    <>
      <rect x="380" y="70" width="170" height="170" rx="85" fill={VS} />
      <path d="M90 120 a90 90 0 0 0 90 90 v-90 z" fill={C} opacity=".2" />
      <g className="ill-float" style={{ animationDelay: '.6s' }}>
        <rect x="250" y="120" width="290" height="190" rx="20" fill={N2} opacity=".55" />
      </g>
      <g className="ill-float">
        <rect x="140" y="160" width="300" height="210" rx="20" fill={N1} />
        <circle cx="166" cy="186" r="6" fill={N2} />
        <circle cx="186" cy="186" r="6" fill={N2} />
        <circle cx="206" cy="186" r="6" fill={N2} />
        <Line x={166} y={218} w={60} c={V} />
        <Line x={234} y={218} w={110} c={N3} />
        <Line x={186} y={242} w={90} c={C} />
        <Line x={284} y={242} w={70} c={N2} />
        <Line x={186} y={266} w={130} c={N3} />
        <Line x={166} y={290} w={40} c={V} />
        <Line x={214} y={290} w={90} c={N2} />
        <Line x={186} y={314} w={150} c={C} />
      </g>
      <g className="ill-float" style={{ animationDelay: '1.4s' }}>
        <rect x="380" y="300" width="160" height="100" rx="18" fill={N1} />
        <rect x="398" y="318" width="40" height="18" rx="9" fill={V} />
        <Line x={398} y={350} w={120} c={N3} />
        <Line x={398} y={370} w={84} />
      </g>
    </>
  );
}

/** 3. Valider les jalons : timeline cochée + sceau doré. */
function Validate() {
  const rows = [
    [150, true],
    [230, true],
    [310, false],
  ];
  return (
    <>
      <circle cx="160" cy="130" r="70" fill={VS} />
      <path d="M470 420 a110 110 0 0 1 110 -110 v110 z" fill={C} opacity=".2" />
      <g className="ill-float">
        <rect x="150" y="110" width="330" height="270" rx="22" fill={N1} />
        <rect x="203" y="168" width="6" height="170" rx="3" fill={N2} />
        {rows.map(([y, done]) => (
          <g key={y}>
            <rect x="186" y={y} width="40" height="40" rx="12" fill={done ? V : N2} />
            {done && <Check x={206} y={y + 20} s={1} />}
            <Line x={246} y={y + 8} w={done ? 150 : 120} c={N3} />
            <Line x={246} y={y + 26} w={done ? 90 : 70} />
          </g>
        ))}
      </g>
      <g className="ill-float" style={{ animationDelay: '1s' }}>
        <circle cx="470" cy="150" r="56" fill={G} />
        <circle cx="470" cy="150" r="42" fill="none" stroke="#fff" strokeWidth="3" opacity=".55" strokeDasharray="4 8" />
        <Check x={470} y={150} s={1.6} c="#1c1917" />
      </g>
    </>
  );
}

/** 4. Être soutenu : bulles de conversation et cœur discret. */
function Support() {
  return (
    <>
      <circle cx="480" cy="330" r="88" fill={VS} />
      <path d="M110 110 a100 100 0 0 1 100 100 h-100 z" fill={C} opacity=".2" />
      <g className="ill-float">
        <rect x="110" y="150" width="270" height="96" rx="24" fill={N1} />
        <path d="M140 246 l-12 26 32-26 z" fill={N1} />
        <circle cx="150" cy="198" r="18" fill={C} />
        <Line x={182} y={186} w={150} c={N3} />
        <Line x={182} y={206} w={100} />
      </g>
      <g className="ill-float" style={{ animationDelay: '1.1s' }}>
        <rect x="250" y="280" width="270" height="86" rx="24" fill={V} />
        <path d="M490 366 l12 24 -32-24 z" fill={V} />
        <Line x={278} y={306} w={170} c="#fff" />
        <Line x={278} y={328} w={110} c="#ffffff" />
      </g>
      <g className="ill-float" style={{ animationDelay: '.5s' }}>
        <rect x="420" y="120" width="120" height="56" rx="28" fill={N1} />
        <path d="M456 136 c-8-9-23-3-18 9 c3 7 18 15 18 15 s15-8 18-15 c5-12-10-18-18-9 z" fill={V} />
        <Line x={486} y={143} w={34} c={N3} />
      </g>
    </>
  );
}

/** 5. Badges : badge vérifié + badge Gold. */
function Badges() {
  const scallop = (cx, cy, r) => {
    const pts = [];
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      const rr = i % 2 ? r * 0.88 : r;
      pts.push(`${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`);
    }
    return pts.join(' ');
  };
  return (
    <>
      <rect x="100" y="90" width="190" height="190" rx="95" fill={VS} />
      <path d="M470 420 a120 120 0 0 1 120 -120 v120 z" fill={C} opacity=".2" />
      <g className="ill-float">
        <rect x="150" y="270" width="340" height="110" rx="22" fill={N1} />
        <circle cx="200" cy="325" r="26" fill={N2} />
        <Line x={244} y={306} w={140} c={N3} />
        <rect x="244" y="330" width="130" height="26" rx="13" fill={V} />
        <Line x={258} y={338} w={100} c="#fff" />
      </g>
      <g className="ill-float" style={{ animationDelay: '.8s' }}>
        <polygon points={scallop(250, 170, 74)} fill={C} strokeLinejoin="round" />
        <Check x={250} y={170} s={2.2} />
      </g>
      <g className="ill-float" style={{ animationDelay: '1.6s' }}>
        <polygon points={scallop(420, 160, 64)} fill={G} />
        <Check x={420} y={160} s={1.9} c="#1c1917" />
      </g>
    </>
  );
}

/** Vide : carte en pointillés + loupe. */
function Empty() {
  return (
    <>
      <circle cx="420" cy="150" r="80" fill={VS} />
      <g className="ill-float">
        <rect x="170" y="140" width="300" height="200" rx="22" fill="none" stroke={N2} strokeWidth="4" strokeDasharray="12 12" />
        <Line x={210} y={190} w={140} c={N2} />
        <Line x={210} y={214} w={90} c={N2} />
      </g>
      <g className="ill-float" style={{ animationDelay: '1s' }}>
        <circle cx="430" cy="300" r="42" fill={N1} stroke={V} strokeWidth="8" />
        <path d="M460 330 l38 38" stroke={V} strokeWidth="12" strokeLinecap="round" />
      </g>
    </>
  );
}

const SETS = {
  publish: [Publish, 'Publier un projet'],
  document: [Document, 'Documenter son travail'],
  validate: [Validate, 'Valider ses jalons'],
  support: [Support, 'Être soutenu par la communauté'],
  badges: [Badges, 'Badges vérifiés'],
  empty: [Empty, 'Rien à afficher'],
};

/** Anciens noms utilisés dans l'appli → illustration abstraite correspondante. */
const ALIASES = {
  build: 'publish',
  launch: 'publish',
  signup: 'publish',
  live: 'publish',
  proof: 'document',
  analytics: 'document',
  milestone: 'validate',
  trophy: 'validate',
  chat: 'support',
  community: 'support',
  verified: 'badges',
  payment: 'badges',
};

export function Illustration({ name, className = '', title, decorative = false, style }) {
  const key = SETS[name] ? name : ALIASES[name] || 'empty';
  const [Draw, label] = SETS[key];
  const t = title || label;
  return (
    <svg
      className={`ill ${className}`}
      viewBox="0 0 640 480"
      style={style}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={decorative ? undefined : t}
    >
      {!decorative && <title>{t}</title>}
      <Draw />
    </svg>
  );
}

/** Compatibilité : <Art name size /> dans le reste de l'appli. */
export default function Art({ name, size = 220, className = '', title }) {
  return <Illustration name={name} title={title} decorative={!title} className={`art ${className}`} style={{ width: size, height: (size * 480) / 640 }} />;
}
