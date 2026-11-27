import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, UserName } from './ui';
import Icon from './Icon';
import { getLiveStreams } from '../services/live';

/** Bandeau des lives en cours (accueil, explorer). Rien n'est affiché sans live. */
export default function LiveRail({ title = 'En direct' }) {
  const [lives, setLives] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = () => getLiveStreams().then((l) => alive && setLives(l)).catch(() => {});
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  if (!lives.length) return null;
  return (
    <section className="live-rail-wrap">
      <div className="section-title" style={{ marginTop: 6 }}>
        <h2>
          <span className="live-dot" /> {title}
        </h2>
      </div>
      <div className="live-rail">
        {lives.map((l) => (
          <Link key={l.id} to={`/live/${l.id}`} className="live-card">
            <div className="live-card-thumb">
              {l.thumbnail_url ? <img src={l.thumbnail_url} alt="" loading="lazy" /> : <Avatar user={l.users || {}} size={54} ring />}
              <span className="live-badge">
                <i /> LIVE
              </span>
              <span className="live-pill">
                <Icon name="visibility" size={14} /> {l.viewer_count || 0}
              </span>
            </div>
            <div className="live-card-info">
              <strong>{l.title}</strong>
              <UserName user={l.users || {}} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
