/**
 * Illustrations XERA — scènes de personnages en action, dessin plat sans fond
 * (dans l'esprit des illustrations produit de Google, au style propre de XERA).
 * Usage : <Art name="build" size={260} />
 */
const C = {
  violet: '#8B5CF6',
  violetD: '#6D28D9',
  violetL: '#C4B5FD',
  green: '#10B981',
  greenL: '#6EE7B7',
  amber: '#F5C451',
  amberD: '#D97706',
  blue: '#60A5FA',
  blueD: '#2563EB',
  blueL: '#BFDBFE',
  coral: '#FB7185',
  ink: '#1E1B2E',
  paper: '#F8FAFC',
  line: '#CBD5E1',
  shadow: 'rgba(15, 23, 42, 0.16)',
};
const SKIN = ['#8D5524', '#C68642', '#E0AC69', '#5C3A21', '#F1C27D'];
const HAIR = ['#1F1A17', '#2B1B12', '#3B2416', '#111827'];

/**
 * Personnage plat. pose : stand | wave | hold | point | cheer | sit | type
 */
function Person({ x = 0, y = 0, s = 1, skin = SKIN[0], hair = HAIR[0], shirt = C.violet, pants = C.ink, pose = 'stand', hairStyle = 'short', flip = false, className = '' }) {
  const arm = (d, key) => <path key={key} d={d} stroke={skin} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
  const sleeve = (d, key) => <path key={key} d={d} stroke={shirt} strokeWidth="12" strokeLinecap="round" fill="none" />;
  const ARMS = {
    stand: [['M-16 -58 L-24 -30', 'M-24 -30 L-24 -12'], ['M16 -58 L24 -30', 'M24 -30 L24 -12']],
    wave: [['M-16 -58 L-24 -30', 'M-24 -30 L-24 -12'], ['M16 -58 L30 -76', 'M30 -76 L34 -98']],
    hold: [['M-16 -58 L-20 -36', 'M-20 -36 L4 -40'], ['M16 -58 L20 -36', 'M20 -36 L8 -42']],
    point: [['M-16 -58 L-24 -30', 'M-24 -30 L-24 -12'], ['M16 -58 L36 -60', 'M36 -60 L56 -64']],
    cheer: [['M-16 -58 L-32 -78', 'M-32 -78 L-38 -100'], ['M16 -58 L32 -78', 'M32 -78 L38 -100']],
    type: [['M-16 -58 L-18 -34', 'M-18 -34 L4 -30'], ['M16 -58 L20 -34', 'M20 -34 L36 -30']],
    sit: [['M-16 -58 L-18 -34', 'M-18 -34 L2 -30'], ['M16 -58 L20 -34', 'M20 -34 L34 -28']],
  };
  const arms = ARMS[pose] || ARMS.stand;
  const sitting = pose === 'sit' || pose === 'type';
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} className={className}>
      {/* ombre */}
      <ellipse cx="0" cy="2" rx="26" ry="5" fill={C.shadow} />
      {/* jambes */}
      {sitting ? (
        <>
          <path d="M-8 -14 L-8 0 M8 -14 L22 -14 L22 0" stroke={pants} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M-14 0 h12 M16 0 h12" stroke={C.ink} strokeWidth="6" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M-8 -16 L-10 -2 M8 -16 L10 -2" stroke={pants} strokeWidth="11" strokeLinecap="round" fill="none" />
          <path d="M-18 0 h12 M8 0 h12" stroke={C.ink} strokeWidth="6" strokeLinecap="round" />
        </>
      )}
      {/* bras arrière */}
      {sleeve(arms[0][0], 'sa')}
      {arm(arms[0][1], 'aa')}
      {/* buste */}
      <path d="M-18 -60 Q0 -68 18 -60 L16 -16 Q0 -10 -16 -16 Z" fill={shirt} />
      <path d="M-6 -62 L0 -54 L6 -62" stroke={C.paper} strokeWidth="2.5" fill="none" opacity=".7" />
      {/* cou + tête */}
      <rect x="-5" y="-72" width="10" height="10" rx="4" fill={skin} />
      <circle cx="0" cy="-84" r="15" fill={skin} />
      {hairStyle === 'long' ? (
        <path d="M-17 -84 Q-18 -104 0 -102 Q18 -104 17 -84 L19 -62 Q12 -66 12 -80 Q4 -90 -12 -82 L-12 -66 Q-19 -66 -19 -76 Z" fill={hair} />
      ) : hairStyle === 'puff' ? (
        <>
          <circle cx="0" cy="-100" r="11" fill={hair} />
          <path d="M-15 -86 Q-14 -100 0 -100 Q14 -100 15 -86 Q6 -94 -15 -86 Z" fill={hair} />
        </>
      ) : (
        <path d="M-15 -86 Q-16 -102 0 -101 Q16 -102 15 -86 Q8 -94 -2 -92 Q-10 -92 -15 -86 Z" fill={hair} />
      )}
      <circle cx="-5" cy="-84" r="1.6" fill={C.ink} />
      <circle cx="5" cy="-84" r="1.6" fill={C.ink} />
      <path d="M-4 -78 Q0 -75 4 -78" stroke={C.ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* bras avant */}
      {sleeve(arms[1][0], 'sb')}
      {arm(arms[1][1], 'ab')}
    </g>
  );
}

const Sparkle = ({ x, y, c = C.amber, r = 6, d = 0 }) => (
  <path className="art-twinkle" style={{ animationDelay: `${d}s` }} d={`M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3} Z`} fill={c} />
);

/* ---------------- Scènes ---------------- */

/** Construire : une personne pose un bloc sur une pile de projet. */
function Build() {
  return (
    <>
      <rect x="132" y="150" width="54" height="34" rx="6" fill={C.violetL} />
      <rect x="138" y="118" width="46" height="32" rx="6" fill={C.blue} />
      <rect x="146" y="88" width="34" height="30" rx="6" fill={C.green} />
      <g className="art-bob">
        <rect x="150" y="46" width="30" height="28" rx="6" fill={C.amber} />
        <path d="M158 60h14" stroke="#92400E" strokeWidth="3" strokeLinecap="round" />
      </g>
      <Person x={96} y={184} skin={SKIN[0]} hair={HAIR[0]} shirt={C.violet} pose="wave" />
      <Sparkle x={206} y={54} />
      <Sparkle x={124} y={70} c={C.violetL} r={5} d={0.8} />
      <path d="M30 184 H220" stroke={C.line} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

/** Preuve : une personne photographie son travail, la photo s'envole dans une carte. */
function Proof() {
  return (
    <>
      <g className="art-bob" style={{ animationDelay: '.4s' }}>
        <rect x="126" y="34" width="86" height="96" rx="10" fill={C.paper} stroke={C.line} strokeWidth="2" />
        <rect x="134" y="42" width="70" height="48" rx="6" fill={C.blueL} />
        <path d="M134 90 L156 66 L172 82 L184 72 L204 90 Z" fill={C.blue} />
        <circle cx="190" cy="56" r="7" fill={C.amber} />
        <rect x="134" y="98" width="50" height="6" rx="3" fill={C.line} />
        <rect x="134" y="110" width="34" height="6" rx="3" fill={C.line} />
        <circle cx="204" cy="122" r="13" fill={C.green} />
        <path d="M197 122 l5 5 9-10" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <Person x={80} y={190} skin={SKIN[1]} hair={HAIR[1]} shirt={C.green} pose="hold" hairStyle="long" />
      <g transform="translate(82 140)">
        <rect x="-12" y="-14" width="24" height="18" rx="4" fill={C.ink} />
        <circle cx="0" cy="-5" r="5" fill={C.blueL} />
      </g>
      <path d="M100 122 Q112 96 124 86" stroke={C.violetL} strokeWidth="3" strokeDasharray="3 7" strokeLinecap="round" fill="none" />
      <Sparkle x={112} y={70} c={C.coral} r={5} d={0.6} />
    </>
  );
}

/** Jalon : une personne plante un drapeau au sommet d'une colline. */
function Milestone() {
  return (
    <>
      <path d="M20 190 Q90 150 130 120 Q170 150 230 190 Z" fill={C.greenL} />
      <path d="M60 190 Q120 140 170 160 Q200 172 230 190 Z" fill={C.green} opacity=".55" />
      <path d="M44 184 C70 176 84 168 100 158" stroke={C.paper} strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" fill="none" />
      <circle cx="52" cy="182" r="5" fill={C.violet} />
      <circle cx="86" cy="166" r="5" fill={C.violet} />
      <g className="art-wave">
        <path d="M150 54 V120" stroke={C.ink} strokeWidth="4" strokeLinecap="round" />
        <path d="M152 56 H186 L178 68 L186 80 H152 Z" fill={C.coral} />
      </g>
      <Person x={122} y={126} s={0.82} skin={SKIN[3]} hair={HAIR[0]} shirt={C.amber} pants={C.violetD} pose="cheer" hairStyle="puff" />
      <Sparkle x={196} y={40} />
      <Sparkle x={104} y={40} c={C.violetL} d={0.7} />
    </>
  );
}

/** Messagerie : deux personnes échangent des messages. */
function Chat() {
  return (
    <>
      <g className="art-bob">
        <rect x="60" y="30" width="78" height="40" rx="14" fill={C.paper} stroke={C.line} strokeWidth="2" />
        <path d="M76 70 l-6 12 16-12z" fill={C.paper} />
        <rect x="72" y="44" width="46" height="6" rx="3" fill={C.line} />
        <rect x="72" y="54" width="30" height="6" rx="3" fill={C.line} />
      </g>
      <g className="art-bob" style={{ animationDelay: '.8s' }}>
        <rect x="128" y="74" width="72" height="36" rx="14" fill={C.green} />
        <path d="M186 110 l6 10 -16-10z" fill={C.green} />
        <circle cx="148" cy="92" r="4" fill="#fff" />
        <circle cx="164" cy="92" r="4" fill="#fff" opacity=".8" />
        <circle cx="180" cy="92" r="4" fill="#fff" opacity=".6" />
      </g>
      <Person x={66} y={190} skin={SKIN[2]} hair={HAIR[2]} shirt={C.blue} pose="hold" hairStyle="long" />
      <rect x="58" y="138" width="14" height="22" rx="3" fill={C.ink} />
      <Person x={184} y={190} skin={SKIN[0]} hair={HAIR[0]} shirt={C.coral} pose="hold" flip />
      <rect x="176" y="138" width="14" height="22" rx="3" fill={C.ink} />
      <g transform="translate(124 150)">
        <rect x="-9" y="-2" width="18" height="15" rx="3" fill={C.amber} />
        <path d="M-5 -2 v-5 a5 5 0 0 1 10 0 v5" stroke={C.amber} strokeWidth="3" fill="none" />
      </g>
    </>
  );
}

/** Soutien : une personne envoie un cœur et des pièces à une créatrice. */
function Support() {
  return (
    <>
      <Person x={60} y={190} skin={SKIN[4]} hair={HAIR[3]} shirt={C.blue} pose="point" />
      <g className="art-fly">
        <path d="M124 92 c-10-12-28-4-22 10 c4 8 22 18 22 18 s18-10 22-18 c6-14-12-22-22-10z" fill={C.coral} />
      </g>
      <g className="art-fly" style={{ animationDelay: '.5s' }}>
        <circle cx="140" cy="62" r="11" fill={C.amber} />
        <text x="140" y="67" textAnchor="middle" fontSize="13" fontWeight="800" fill="#92400E" fontFamily="sans-serif">$</text>
      </g>
      <Person x={190} y={190} skin={SKIN[3]} hair={HAIR[0]} shirt={C.violet} pose="cheer" hairStyle="puff" flip />
      <Sparkle x={212} y={70} />
      <Sparkle x={168} y={40} c={C.coral} r={5} d={0.6} />
    </>
  );
}

/** Live : une personne filme et des réactions montent. */
function Live() {
  return (
    <>
      <g transform="translate(70 120)">
        <path d="M0 0 L-12 70 M0 0 L12 70 M0 0 V70" stroke={C.ink} strokeWidth="3" strokeLinecap="round" />
        <rect x="-22" y="-24" width="44" height="28" rx="6" fill={C.ink} />
        <circle cx="0" cy="-10" r="9" fill={C.blueL} />
        <circle cx="16" cy="-18" r="3" fill={C.coral} className="art-twinkle" />
      </g>
      <Person x={168} y={190} skin={SKIN[1]} hair={HAIR[1]} shirt={C.coral} pose="wave" hairStyle="long" />
      <rect x="120" y="30" width="56" height="22" rx="6" fill={C.coral} />
      <circle cx="132" cy="41" r="4" fill="#fff" className="art-twinkle" />
      <text x="156" y="45.5" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff" fontFamily="sans-serif">LIVE</text>
      {[0, 1, 2].map((i) => (
        <path key={i} className="art-rise" style={{ animationDelay: `${i * 0.7}s` }} d={`M${206 + i * 6} ${120 - i * 4} c-4-5-11-1-9 4 c2 3 9 7 9 7 s7-4 9-7 c2-5-5-9-9-4z`} fill={[C.coral, C.amber, C.violet][i]} />
      ))}
    </>
  );
}

/** Recruteur : une personne assise analyse des profils et des graphiques. */
function Analytics() {
  return (
    <>
      <rect x="104" y="40" width="118" height="84" rx="10" fill={C.paper} stroke={C.line} strokeWidth="2" />
      <rect x="116" y="94" width="12" height="20" rx="3" fill={C.blueL} />
      <rect x="134" y="80" width="12" height="34" rx="3" fill={C.blue} className="art-grow" />
      <rect x="152" y="88" width="12" height="26" rx="3" fill={C.violetL} />
      <rect x="170" y="66" width="12" height="48" rx="3" fill={C.violet} className="art-grow" style={{ animationDelay: '.3s' }} />
      <rect x="188" y="74" width="12" height="40" rx="3" fill={C.green} className="art-grow" style={{ animationDelay: '.6s' }} />
      <path d="M118 72 l20-12 18 6 20-16 24 6" stroke={C.coral} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="116" y="50" width="40" height="6" rx="3" fill={C.line} />
      <rect x="40" y="150" width="96" height="8" rx="4" fill={C.ink} />
      <rect x="56" y="122" width="56" height="28" rx="4" fill="#334155" />
      <Person x={70} y={190} skin={SKIN[0]} hair={HAIR[0]} shirt={C.green} pants={C.blueD} pose="type" hairStyle="long" />
      <Sparkle x={224} y={34} />
    </>
  );
}

/** Célébration : une personne brandit un trophée, confettis. */
function Trophy() {
  return (
    <>
      <Person x={120} y={190} skin={SKIN[1]} hair={HAIR[2]} shirt={C.violet} pose="cheer" />
      <g className="art-bob" transform="translate(120 52)">
        <path d="M-20 0 h40 v14 c0 14-9 24-20 24 s-20-10-20-24z" fill={C.amber} />
        <path d="M-20 4 h-10 c0 12 6 18 14 18 M20 4 h10 c0 12-6 18-14 18" stroke={C.amber} strokeWidth="4" fill="none" />
        <rect x="-5" y="38" width="10" height="10" fill={C.amberD} />
        <rect x="-14" y="46" width="28" height="7" rx="2" fill={C.ink} />
        <path d="M0 8 l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z" fill="#fff" />
      </g>
      {[[44, 50, C.coral], [196, 40, C.green], [70, 100, C.blue], [180, 104, C.violetL], [210, 140, C.amber], [34, 140, C.violet]].map(([x, y, c], i) => (
        <rect key={i} className="art-confetti" style={{ animationDelay: `${i * 0.35}s` }} x={x} y={y} width="8" height="12" rx="2" fill={c} transform={`rotate(${i * 37} ${x} ${y})`} />
      ))}
    </>
  );
}

/** Communauté : trois personnes reliées autour d'un projet. */
function Community() {
  return (
    <>
      <path d="M70 120 Q120 70 170 120" stroke={C.violetL} strokeWidth="3" strokeDasharray="3 7" fill="none" strokeLinecap="round" />
      <g className="art-bob">
        <circle cx="120" cy="66" r="20" fill={C.amber} />
        <path d="M112 66 l6 6 11-12" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <Person x={60} y={190} s={0.9} skin={SKIN[2]} hair={HAIR[3]} shirt={C.blue} pose="wave" hairStyle="long" />
      <Person x={120} y={196} s={1} skin={SKIN[0]} hair={HAIR[0]} shirt={C.violet} pose="stand" />
      <Person x={182} y={190} s={0.9} skin={SKIN[3]} hair={HAIR[1]} shirt={C.green} pose="wave" hairStyle="puff" flip />
      <Sparkle x={200} y={56} />
    </>
  );
}

/** Vérifié : une personne tient un bouclier coché. */
function Verified() {
  return (
    <>
      <Person x={88} y={190} skin={SKIN[1]} hair={HAIR[0]} shirt={C.ink} pants={C.blueD} pose="point" />
      <g className="art-bob" transform="translate(164 92)">
        <path d="M0 -44 l40 14 v28 c0 26-18 42-40 50 c-22-8-40-24-40-50 v-28z" fill={C.blue} />
        <path d="M0 -34 l30 10 v22 c0 20-13 32-30 40z" fill={C.blueD} opacity=".5" />
        <path d="M-15 2 l10 10 22-24" stroke="#fff" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <Sparkle x={214} y={44} />
      <Sparkle x={126} y={40} c={C.violetL} r={5} d={0.6} />
    </>
  );
}

/** Paiement : une personne valide un paiement Mobile Money. */
function Payment() {
  return (
    <>
      <g className="art-bob" transform="translate(160 96)">
        <rect x="-34" y="-62" width="68" height="124" rx="12" fill={C.ink} />
        <rect x="-28" y="-52" width="56" height="102" rx="7" fill={C.paper} />
        <rect x="-20" y="-42" width="40" height="9" rx="4" fill={C.violet} />
        <rect x="-20" y="-24" width="40" height="26" rx="6" fill={C.greenL} />
        <path d="M-7 -11 l5 5 11-11" stroke={C.green} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="-20" y="10" width="26" height="6" rx="3" fill={C.line} />
        <rect x="-20" y="30" width="40" height="12" rx="6" fill={C.ink} />
      </g>
      <Person x={78} y={190} skin={SKIN[3]} hair={HAIR[0]} shirt={C.amber} pants={C.ink} pose="point" hairStyle="long" />
      <g className="art-fly" style={{ animationDelay: '.3s' }}>
        <circle cx="214" cy="48" r="12" fill={C.amber} />
        <text x="214" y="53" textAnchor="middle" fontSize="13" fontWeight="800" fill="#92400E" fontFamily="sans-serif">$</text>
      </g>
    </>
  );
}

/** Lancement : une personne lance une fusée (projet). */
function Launch() {
  return (
    <>
      <path d="M30 186 H220" stroke={C.line} strokeWidth="3" strokeLinecap="round" />
      <g className="art-launch">
        <path d="M170 30 c18 14 24 40 18 66 h-36 c-6-26 0-52 18-66z" fill={C.paper} stroke={C.line} strokeWidth="2" />
        <circle cx="170" cy="62" r="9" fill={C.blue} stroke={C.ink} strokeWidth="3" />
        <path d="M152 80 l-12 18 14-2z M188 80 l12 18-14-2z" fill={C.coral} />
        <path d="M160 96 c2 12 10 20 10 20 s8-8 10-20z" fill={C.amber} className="art-flame" />
      </g>
      <Person x={84} y={186} skin={SKIN[0]} hair={HAIR[1]} shirt={C.violet} pose="point" hairStyle="puff" />
      <Sparkle x={212} y={40} />
      <Sparkle x={130} y={34} c={C.violetL} r={5} d={0.7} />
    </>
  );
}

/** Vide : une personne regarde une boîte vide avec curiosité. */
function Empty() {
  return (
    <>
      <path d="M118 120 l42-18 42 18 v42 l-42 18 -42-18z" fill={C.paper} stroke={C.line} strokeWidth="2" />
      <path d="M118 120 l42 18 42-18 M160 138 v42" stroke={C.line} strokeWidth="2" fill="none" />
      <path d="M118 120 l-10-18 42-16 10 16z M202 120 l10-18-42-16-10 16z" fill={C.violetL} className="art-flap" />
      <Person x={70} y={184} s={0.95} skin={SKIN[2]} hair={HAIR[0]} shirt={C.green} pose="point" />
      <text x="168" y="70" fontSize="26" fontWeight="800" fill={C.violet} fontFamily="Outfit, sans-serif" className="art-bob">?</text>
    </>
  );
}

/** Inscription : une personne ouvre une porte vers XERA. */
function Signup() {
  return (
    <>
      <rect x="138" y="40" width="70" height="146" rx="6" fill={C.violetD} />
      <path d="M142 44 h62 v138 h-62z" fill={C.violet} className="art-door" />
      <circle cx="194" cy="116" r="4" fill={C.amber} />
      <path d="M150 70 h46 M150 90 h30" stroke={C.violetL} strokeWidth="5" strokeLinecap="round" />
      <Person x={92} y={186} skin={SKIN[1]} hair={HAIR[0]} shirt={C.green} pose="wave" hairStyle="long" />
      <Sparkle x={222} y={50} />
      <Sparkle x={124} y={52} c={C.coral} r={5} d={0.5} />
    </>
  );
}

const ARTS = { build: Build, proof: Proof, milestone: Milestone, chat: Chat, support: Support, live: Live, analytics: Analytics, trophy: Trophy, community: Community, verified: Verified, payment: Payment, launch: Launch, empty: Empty, signup: Signup };

export default function Art({ name, size = 220, className = '', title }) {
  const Draw = ARTS[name] || Empty;
  return (
    <svg
      className={`art ${className}`}
      viewBox="0 0 240 200"
      width={size}
      height={(size * 200) / 240}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      <g className="art-breathe">
        <Draw />
      </g>
    </svg>
  );
}
