/**
 * Illustrations XERA (dessins originaux, style « spot illustration » plat et coloré).
 * Palette commune, lisible en thème sombre comme en thème clair.
 * Usage : <Art name="launch" size={220} />
 */
const C = {
  violet: '#8B5CF6',
  violetSoft: '#C4B5FD',
  green: '#10B981',
  greenSoft: '#6EE7B7',
  amber: '#F5C451',
  blue: '#60A5FA',
  blueSoft: '#BFDBFE',
  coral: '#FB7185',
  ink: '#1F2937',
  paper: '#F8FAFC',
  line: '#CBD5E1',
};

function Launch() {
  return (
    <>
      <circle cx="120" cy="112" r="92" fill={C.violet} opacity=".14" />
      <path d="M40 176c30-10 52-34 80-34s52 24 80 34" stroke={C.line} strokeWidth="3" fill="none" strokeDasharray="2 8" strokeLinecap="round" />
      <circle cx="58" cy="168" r="9" fill={C.green} />
      <circle cx="120" cy="142" r="11" fill={C.amber} />
      <circle cx="184" cy="168" r="9" fill={C.blue} />
      <g className="art-bob">
        <path d="M120 34c22 16 30 44 24 76h-48c-6-32 2-60 24-76z" fill={C.paper} />
        <path d="M96 110h48l-6 14h-36z" fill={C.violet} />
        <circle cx="120" cy="74" r="11" fill={C.blue} stroke={C.ink} strokeWidth="3" />
        <path d="M96 92l-16 22 18-2zM144 92l16 22-18-2z" fill={C.coral} />
        <path d="M110 126c2 14 10 22 10 22s8-8 10-22z" fill={C.amber} className="art-flame" />
      </g>
      <circle cx="52" cy="62" r="4" fill={C.amber} className="art-twinkle" />
      <circle cx="196" cy="48" r="3" fill={C.violetSoft} className="art-twinkle" style={{ animationDelay: '.8s' }} />
      <circle cx="200" cy="104" r="5" fill={C.greenSoft} className="art-twinkle" style={{ animationDelay: '1.4s' }} />
    </>
  );
}

function Proof() {
  return (
    <>
      <circle cx="120" cy="112" r="92" fill={C.green} opacity=".13" />
      <g transform="rotate(-8 92 108)">
        <rect x="46" y="58" width="92" height="104" rx="10" fill={C.paper} />
        <rect x="56" y="68" width="72" height="52" rx="6" fill={C.blueSoft} />
        <path d="M56 120l24-26 18 18 12-10 18 18z" fill={C.blue} />
        <circle cx="114" cy="82" r="7" fill={C.amber} />
        <rect x="56" y="130" width="54" height="7" rx="3.5" fill={C.line} />
        <rect x="56" y="144" width="38" height="7" rx="3.5" fill={C.line} />
      </g>
      <g className="art-bob" style={{ animationDelay: '.6s' }}>
        <rect x="118" y="70" width="80" height="94" rx="10" fill={C.paper} />
        <rect x="128" y="80" width="60" height="8" rx="4" fill={C.violet} />
        <rect x="128" y="96" width="46" height="7" rx="3.5" fill={C.line} />
        <rect x="128" y="110" width="52" height="7" rx="3.5" fill={C.line} />
        <circle cx="178" cy="146" r="16" fill={C.green} />
        <path d="M170 146l6 6 11-12" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  );
}

function Community() {
  const Person = ({ x, y, body, head = C.amber, s = 1 }) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx="0" cy="-26" r="14" fill={head} />
      <path d="M-26 22c0-22 12-34 26-34s26 12 26 34z" fill={body} />
    </g>
  );
  return (
    <>
      <circle cx="120" cy="112" r="92" fill={C.blue} opacity=".13" />
      <Person x={70} y={142} body={C.green} head="#FDBA74" s={0.9} />
      <Person x={170} y={142} body={C.coral} head="#A16207" s={0.9} />
      <g className="art-bob">
        <Person x={120} y={132} body={C.violet} head="#FCD34D" />
      </g>
      <g className="art-pop">
        <rect x="140" y="44" width="58" height="34" rx="12" fill={C.paper} />
        <path d="M152 76l-4 12 14-12z" fill={C.paper} />
        <path d="M160 61l6 6 12-12" stroke={C.green} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle cx="58" cy="64" r="12" fill={C.coral} className="art-twinkle" />
      <path d="M53 63l5 5 7-8" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  );
}

function Chat() {
  return (
    <>
      <circle cx="120" cy="112" r="92" fill={C.violet} opacity=".13" />
      <g className="art-bob">
        <rect x="44" y="54" width="104" height="62" rx="16" fill={C.paper} />
        <path d="M66 114l-6 18 22-18z" fill={C.paper} />
        <rect x="60" y="72" width="62" height="8" rx="4" fill={C.line} />
        <rect x="60" y="88" width="44" height="8" rx="4" fill={C.line} />
      </g>
      <g className="art-bob" style={{ animationDelay: '.9s' }}>
        <rect x="100" y="112" width="96" height="54" rx="16" fill={C.violet} />
        <path d="M176 164l8 16-24-16z" fill={C.violet} />
        <circle cx="128" cy="139" r="5" fill="#fff" />
        <circle cx="148" cy="139" r="5" fill="#fff" opacity=".8" />
        <circle cx="168" cy="139" r="5" fill="#fff" opacity=".6" />
      </g>
      <g transform="translate(176 54)">
        <rect x="-14" y="-4" width="28" height="24" rx="5" fill={C.amber} />
        <path d="M-8 -4v-6a8 8 0 0 1 16 0v6" stroke={C.amber} strokeWidth="4" fill="none" />
        <circle cx="0" cy="8" r="3" fill={C.ink} />
      </g>
    </>
  );
}

function Trophy() {
  return (
    <>
      <circle cx="120" cy="112" r="92" fill={C.amber} opacity=".16" />
      <g className="art-bob">
        <path d="M86 54h68v26c0 24-16 40-34 40s-34-16-34-40z" fill={C.amber} />
        <path d="M86 62H70c0 20 8 30 20 32M154 62h16c0 20-8 30-20 32" stroke={C.amber} strokeWidth="6" fill="none" />
        <rect x="112" y="118" width="16" height="20" fill="#D4A017" />
        <rect x="94" y="138" width="52" height="14" rx="4" fill={C.violet} />
        <path d="M120 66l5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2z" fill="#fff" />
      </g>
      <circle cx="58" cy="74" r="5" fill={C.coral} className="art-twinkle" />
      <circle cx="186" cy="64" r="4" fill={C.green} className="art-twinkle" style={{ animationDelay: '.6s' }} />
      <circle cx="190" cy="140" r="5" fill={C.blue} className="art-twinkle" style={{ animationDelay: '1.2s' }} />
      <circle cx="50" cy="146" r="4" fill={C.violetSoft} className="art-twinkle" style={{ animationDelay: '1.7s' }} />
    </>
  );
}

function Payment() {
  return (
    <>
      <circle cx="120" cy="112" r="92" fill={C.green} opacity=".13" />
      <g className="art-bob">
        <rect x="78" y="36" width="76" height="140" rx="14" fill={C.ink} />
        <rect x="85" y="48" width="62" height="114" rx="8" fill={C.paper} />
        <rect x="94" y="60" width="44" height="10" rx="5" fill={C.violet} />
        <rect x="94" y="80" width="30" height="7" rx="3.5" fill={C.line} />
        <rect x="94" y="96" width="44" height="26" rx="6" fill={C.greenSoft} />
        <path d="M108 109l6 6 12-12" stroke={C.green} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="94" y="134" width="44" height="14" rx="7" fill={C.ink} />
      </g>
      <g className="art-pop">
        <circle cx="178" cy="70" r="20" fill={C.amber} />
        <text x="178" y="77" textAnchor="middle" fontSize="20" fontWeight="800" fill="#92400E" fontFamily="sans-serif">$</text>
      </g>
      <circle cx="60" cy="128" r="14" fill={C.amber} className="art-twinkle" />
      <text x="60" y="133" textAnchor="middle" fontSize="14" fontWeight="800" fill="#92400E" fontFamily="sans-serif">$</text>
    </>
  );
}

function Analytics() {
  return (
    <>
      <circle cx="120" cy="112" r="92" fill={C.blue} opacity=".13" />
      <rect x="42" y="50" width="156" height="118" rx="14" fill={C.paper} />
      <rect x="58" y="120" width="18" height="34" rx="4" fill={C.blueSoft} />
      <rect x="86" y="100" width="18" height="54" rx="4" fill={C.blue} className="art-grow" />
      <rect x="114" y="110" width="18" height="44" rx="4" fill={C.violetSoft} />
      <rect x="142" y="82" width="18" height="72" rx="4" fill={C.violet} className="art-grow" style={{ animationDelay: '.3s' }} />
      <rect x="170" y="94" width="14" height="60" rx="4" fill={C.green} className="art-grow" style={{ animationDelay: '.6s' }} />
      <path d="M60 98l30-18 26 10 30-24 30 8" stroke={C.coral} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="176" cy="74" r="6" fill={C.coral} />
      <rect x="58" y="62" width="50" height="8" rx="4" fill={C.line} />
    </>
  );
}

function Verified() {
  return (
    <>
      <circle cx="120" cy="112" r="92" fill={C.blue} opacity=".14" />
      <g className="art-bob">
        <path d="M120 38l58 22v40c0 38-26 62-58 74-32-12-58-36-58-74V60z" fill={C.blue} />
        <path d="M120 52l44 16v32c0 30-20 50-44 60z" fill="#3B82F6" />
        <path d="M96 106l16 16 32-34" stroke="#fff" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle cx="54" cy="80" r="6" fill={C.amber} className="art-twinkle" />
      <circle cx="190" cy="146" r="5" fill={C.green} className="art-twinkle" style={{ animationDelay: '.9s' }} />
    </>
  );
}

function Empty() {
  return (
    <>
      <circle cx="120" cy="112" r="88" fill={C.violet} opacity=".1" />
      <path d="M62 102l58-26 58 26v52l-58 26-58-26z" fill={C.paper} />
      <path d="M62 102l58 26 58-26" stroke={C.line} strokeWidth="3" fill="none" />
      <path d="M120 128v52" stroke={C.line} strokeWidth="3" />
      <path d="M62 102l-14-22 58-24 14 20zM178 102l14-22-58-24-14 20z" fill={C.violetSoft} className="art-flap" />
      <circle cx="120" cy="40" r="6" fill={C.amber} className="art-twinkle" />
    </>
  );
}

function Live() {
  return (
    <>
      <circle cx="120" cy="112" r="92" fill={C.coral} opacity=".13" />
      <g className="art-bob">
        <rect x="46" y="60" width="148" height="96" rx="14" fill={C.ink} />
        <rect x="56" y="70" width="128" height="76" rx="8" fill={C.blueSoft} />
        <path d="M108 92v32l28-16z" fill={C.violet} />
        <rect x="62" y="76" width="36" height="16" rx="8" fill={C.coral} />
        <circle cx="72" cy="84" r="3.5" fill="#fff" className="art-twinkle" />
      </g>
      <rect x="104" y="156" width="32" height="10" fill={C.ink} />
      <rect x="86" y="166" width="68" height="8" rx="4" fill={C.ink} />
      <path d="M200 74a30 30 0 0 1 0 40M212 62a48 48 0 0 1 0 64" stroke={C.coral} strokeWidth="5" fill="none" strokeLinecap="round" className="art-twinkle" />
    </>
  );
}

const ARTS = { launch: Launch, proof: Proof, community: Community, chat: Chat, trophy: Trophy, payment: Payment, analytics: Analytics, verified: Verified, empty: Empty, live: Live };

export default function Art({ name, size = 200, className = '', title }) {
  const Draw = ARTS[name] || Empty;
  return (
    <svg
      className={`art ${className}`}
      viewBox="0 0 240 220"
      width={size}
      height={(size * 220) / 240}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      <Draw />
    </svg>
  );
}
