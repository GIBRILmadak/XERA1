import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import ArcCard from '../components/ArcCard';
import LiveRail from '../components/LiveRail';
import { Avatar, EmptyState, IconButton, Skeleton, UserName } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { recordSearch } from '../services/feedAlgo';
import { fetchRecentArcs, fetchSuggestedUsers, search } from '../services/data';

export default function Explore() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') || '');
  const [results, setResults] = useState(null);
  const [arcs, setArcs] = useState(null);
  const [people, setPeople] = useState([]);
  const timer = useRef();

  useEffect(() => {
    fetchRecentArcs().then(setArcs).catch(() => setArcs([]));
    fetchSuggestedUsers(user?.id).then(setPeople).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    clearTimeout(timer.current);
    const q = term.trim();
    setParams(q ? { q } : {}, { replace: true });
    if (!q) {
      setResults(null);
      return undefined;
    }
    timer.current = setTimeout(() => {
      if (user) recordSearch(user.id, q);
      search(q)
        .then(setResults)
        .catch(() => setResults({ users: [], arcs: [] }));
    }, 280);
    return () => clearTimeout(timer.current);
  }, [term, setParams, user]);

  return (
    <>
      <TopBar title="Explorer" />
      <main className="main main--wide">
        <div className="input-wrap" style={{ marginBottom: 18 }}>
          <Icon name="search" />
          <input
            className="input"
            type="search"
            placeholder="Rechercher un bâtisseur ou un projet"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-label="Rechercher"
            autoFocus={Boolean(params.get('q'))}
          />
          {term && (
            <span className="trailing">
              <IconButton icon="close" label="Effacer" onClick={() => setTerm('')} />
            </span>
          )}
        </div>

        {results ? (
          results.users.length + results.arcs.length === 0 ? (
            <EmptyState art="empty" icon="search_off" title="Aucun résultat" text={`Rien ne correspond à « ${term} ».`} />
          ) : (
            <>
              {results.users.length > 0 && (
                <>
                  <div className="section-title">
                    <h2>Bâtisseurs</h2>
                  </div>
                  <div className="card list" style={{ padding: 6 }}>
                    {results.users.map((u) => (
                      <Link key={u.id} to={`/u/${u.id}`} className="list-item">
                        <Avatar user={u} size={44} />
                        <span className="grow">
                          <UserName user={u} className="title" />
                          <span className="sub" style={{ display: 'block' }}>{u.title || 'Membre XERA'}</span>
                        </span>
                        <Icon name="chevron_right" />
                      </Link>
                    ))}
                  </div>
                </>
              )}
              {results.arcs.length > 0 && (
                <>
                  <div className="section-title">
                    <h2>Projets</h2>
                  </div>
                  <div className="arc-grid">
                    {results.arcs.map((a) => (
                      <ArcCard key={a.id} arc={a} />
                    ))}
                  </div>
                </>
              )}
            </>
          )
        ) : (
          <>
            <LiveRail />
            {people.length > 0 && (
              <>
                <div className="section-title">
                  <h2>Bâtisseurs à suivre</h2>
                </div>
                <div className="chip-row" style={{ gap: 10 }}>
                  {people.map((u) => (
                    <Link key={u.id} to={`/u/${u.id}`} className="card person-chip">
                      <Avatar user={u} size={56} />
                      <UserName user={u} />
                      <span className="muted">{u.title || 'Membre XERA'}</span>
                    </Link>
                  ))}
                </div>
              </>
            )}
            <div className="section-title">
              <h2>Projets en cours</h2>
            </div>
            {arcs === null ? (
              <div className="arc-grid">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={240} radius={22} />
                ))}
              </div>
            ) : arcs.length === 0 ? (
              <EmptyState art="launch" icon="flag" title="Aucun projet public" />
            ) : (
              <div className="arc-grid">
                {arcs.map((a) => (
                  <ArcCard key={a.id} arc={a} />
                ))}
              </div>
            )}
            <div className="section-title">
              <h2>Aussi sur XERA</h2>
            </div>
            <div className="card list" style={{ padding: 6 }}>
              <Link className="list-item" to="/live/nouveau">
                <span className="lead-icon"><Icon name="live_tv" /></span>
                <span className="grow"><span className="title" style={{ display: 'block' }}>Lancer un live</span><span className="sub">Construisez en direct avec votre communauté</span></span>
                <Icon name="chevron_right" />
              </Link>
              <Link className="list-item" to="/abonnements">
                <span className="lead-icon"><Icon name="workspace_premium" /></span>
                <span className="grow"><span className="title" style={{ display: 'block' }}>XERA Pro</span><span className="sub">Abonnements et avantages</span></span>
                <Icon name="chevron_right" />
              </Link>
            </div>
          </>
        )}
      </main>
    </>
  );
}
