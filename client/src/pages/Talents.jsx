import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import Art from '../components/Illustrations';
import { Avatar, EmptyState, Skeleton, UserName } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { DEMO, demoUsers } from '../services/demo';

const ROLE_FILTERS = [
  ['', 'Tous'],
  ['developer', 'Développeurs'],
  ['designer', 'Designers'],
  ['founder', 'Fondateurs'],
  ['student', 'Étudiants'],
];

/** Talent Explorer (Momentum Engine) : vue momentum_discovery_feed, mêmes champs de recherche. */
export default function Talents() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [list, setList] = useState(null);
  const timer = useRef();

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setList(null);
      if (DEMO) return setList(demoUsers.map((u, i) => ({ ...u, momentum_score: 92 - i * 9 })));
      const term = `${q} ${role}`.trim().replace(/[%_,()]/g, '');
      let query = supabase.from('momentum_discovery_feed').select('id, name, avatar, title, bio, badge, plan, account_subtype, momentum_score').order('momentum_score', { ascending: false }).limit(48);
      if (term) query = query.or(`name.ilike.%${term}%,title.ilike.%${term}%,bio.ilike.%${term}%,account_subtype.ilike.%${term}%`);
      const { data } = await query;
      setList(data || []);
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q, role]);

  return (
    <>
      <TopBar back title="Talent Explorer" />
      <main className="main main--wide">
        <section className="plans-hero">
          <div>
            <span className="eyebrow">XERA1 Elite · Momentum Engine</span>
            <h1>Trouvez les bâtisseurs qui avancent vraiment.</h1>
            <p>Profils classés par élan : régularité, preuves publiées et progression réelle.</p>
          </div>
          <Art name="analytics" size={190} />
        </section>
        {!user ? (
          <div className="card card--pad stack" style={{ textAlign: 'center', justifyItems: 'center' }}>
            <Icon name="lock" size={32} />
            <p>Connectez-vous pour explorer les talents.</p>
            <Link className="btn btn--primary" to="/connexion?redirect=/talents">Se connecter</Link>
          </div>
        ) : (
          <>
            <div className="input-wrap" style={{ marginBottom: 10 }}>
              <Icon name="person_search" />
              <input className="input" type="search" placeholder="Compétence, rôle, ville…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un talent" />
            </div>
            <div className="chip-row" style={{ marginBottom: 16 }}>
              {ROLE_FILTERS.map(([v, l]) => (
                <button key={v} className={`chip${role === v ? ' is-active' : ''}`} onClick={() => setRole(v)}>
                  {l}
                </button>
              ))}
            </div>
            {list === null ? (
              <div className="talent-grid">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={190} radius={12} />)}
              </div>
            ) : list.length === 0 ? (
              <EmptyState art="community" title="Aucun talent trouvé" text="Essayez une autre compétence ou un autre rôle." />
            ) : (
              <div className="talent-grid">
                {list.map((t, i) => (
                  <Link key={t.id} to={`/u/${t.id}`} className="talent-card" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <span className="talent-rank">#{i + 1}</span>
                    <Avatar user={t} size={64} ring={i < 3} />
                    <UserName user={t} className="talent-name" />
                    <span className="muted talent-title">{t.title || 'Membre XERA'}</span>
                    <div className="talent-score">
                      <div className="progress"><span style={{ width: `${Math.min(100, Number(t.momentum_score) || 0)}%` }} /></div>
                      <strong>{Math.round(Number(t.momentum_score) || 0)}</strong>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
