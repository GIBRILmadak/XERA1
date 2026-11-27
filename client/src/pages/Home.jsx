import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import Icon from '../components/Icon';
import ContentCard from '../components/ContentCard';
import { CardSkeleton, EmptyState, IconLink } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { fetchEncouraged, fetchFeed, fetchFollowing } from '../services/data';
import { useUnread } from '../hooks/useUnread';
import Landing from './Landing';

const FILTERS = [
  { key: 'all', label: 'Tout', icon: 'apps' },
  { key: 'following', label: 'Abonnements', icon: 'group' },
  { key: 'success', label: 'Avancées', icon: 'trending_up' },
  { key: 'failure', label: 'Obstacles', icon: 'report' },
  { key: 'pause', label: 'Pauses', icon: 'pause_circle' },
];

export default function Home() {
  const { user: me, loading } = useAuth();
  if (loading) return <main className="main" aria-busy="true" />;
  if (!me) return <Landing />;
  return <Feed />;
}

function Feed() {
  const { user } = useAuth();
  const { toast } = useUi();
  const unread = useUnread(user);
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState(null);
  const [encouraged, setEncouraged] = useState(new Set());

  useEffect(() => {
    let alive = true;
    setItems(null);
    (async () => {
      try {
        let list;
        if (filter === 'following') {
          const ids = user ? await fetchFollowing(user.id) : [];
          list = ids.length ? await fetchFeed({ userIds: ids }) : [];
        } else {
          list = await fetchFeed({ filter });
        }
        if (!alive) return;
        setItems(list);
        if (user) setEncouraged(await fetchEncouraged(user.id, list.map((c) => c.id)));
      } catch {
        if (alive) {
          setItems([]);
          toast('error', 'Fil indisponible', 'Vérifiez votre connexion puis réessayez.');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [filter, user, toast]);

  return (
    <>
      <TopBar
        brand
        title="Accueil"
        actions={
          <>
            <IconLink to="/explorer" icon="search" label="Rechercher" className="mobile-only" />
            <IconLink to="/notifications" icon="notifications" label="Notifications" badge={unread.notifications} className="mobile-only" />
          </>
        }
      />
      <main className="main">
        <div className="feed-head">
          <Link to="/fata" className="fata-strip">
            <img src="/icons/fata.webp" alt="" />
            <div className="grow">
              <strong>Challenge Fata × XERA1</strong>
              <span>Trois actions sur XERA, 6 mois de Fata Pro et un badge à la clé.</span>
            </div>
            <Icon name="chevron_right" />
          </Link>

          <div className="chip-row" role="tablist" aria-label="Filtrer le fil">
            {FILTERS.filter((f) => f.key !== 'following' || user).map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                className={`chip${filter === f.key ? ' is-active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                <Icon name={f.icon} filled={filter === f.key} />
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {items === null ? (
          <div className="stack">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={filter === 'following' ? 'group_add' : 'auto_awesome'}
            title={filter === 'following' ? 'Rien de neuf chez vos abonnements' : 'Aucune preuve pour le moment'}
            text={
              filter === 'following'
                ? 'Suivez des bâtisseurs depuis Explorer pour voir leurs avancées ici.'
                : 'Soyez le premier à partager votre progression.'
            }
            action={
              user && (
                <Link to="/creer/preuve" className="btn btn--primary">
                  <Icon name="add" /> Publier une preuve
                </Link>
              )
            }
          />
        ) : (
          items.map((content, i) => (
            <ContentCard key={content.id} content={content} index={i} encouraged={encouraged.has(content.id)} />
          ))
        )}
      </main>
    </>
  );
}
