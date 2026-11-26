import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { Button, Sheet } from './ui';
import { acknowledgeCelebration, getStatus } from '../services/fata';
import { DEMO } from '../services/demo';

const COLORS = ['#f5c451', '#8b5cf6', '#ffffff', '#10b981'];

/** Annonce de réussite du challenge officiel, affichée une fois puis acquittée côté serveur. */
export default function FataCelebration() {
  const navigate = useNavigate();
  const [q, setQ] = useState(null);

  useEffect(() => {
    let alive = true;
    if (DEMO) {
      if (new URLSearchParams(window.location.search).get('celebrate') === '1') setQ({ visibility_multiplier: 5 });
      return undefined;
    }
    getStatus()
      .then((s) => alive && s?.celebrationPending && setQ(s.qualification || {}))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: `${2 + Math.random() * 96}%`,
        background: COLORS[i % COLORS.length],
        '--x': `${Math.round((Math.random() - 0.5) * 160)}px`,
        '--d': `${3 + Math.random() * 2}s`,
        '--delay': `${Math.random()}s`,
        '--r': `${Math.round(240 + Math.random() * 720)}deg`,
      })),
    [],
  );

  function close(goFeed) {
    setQ(null);
    acknowledgeCelebration().catch(() => {});
    if (goFeed) navigate('/');
  }

  const mult = Number(q?.visibility_multiplier) || 5;
  return (
    <Sheet open={Boolean(q)} onClose={() => close(false)} title="">
      <div className="celebration">
        <div className="confetti" aria-hidden="true">
          {pieces.map((style, i) => (
            <i key={i} style={style} />
          ))}
        </div>
        <div className="trophy">
          <Icon name="emoji_events" filled />
        </div>
        <h2 style={{ fontSize: 24 }}>Challenge Fata réussi !</h2>
        <p className="muted" style={{ maxWidth: 360 }}>
          Fata a validé votre parcours. Votre badge est sur votre profil et vos projets sont mis en avant ×{mult} dans le
          fil XERA.
        </p>
        <Button variant="primary" size="lg" block icon="rocket_launch" onClick={() => close(true)}>
          Voir mon fil
        </Button>
        <Button variant="ghost" block onClick={() => close(false)}>
          Fermer
        </Button>
      </div>
    </Sheet>
  );
}
