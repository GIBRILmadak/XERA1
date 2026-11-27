import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TopBar } from '../components/Shell';
import ContentCard from '../components/ContentCard';
import { CardSkeleton, EmptyState } from '../components/ui';
import { fetchContent } from '../services/data';

/** Une publication seule (liens partagés /share/:id). */
export default function PostView() {
  const { id } = useParams();
  const [post, setPost] = useState(undefined);
  useEffect(() => {
    fetchContent(id).then((p) => setPost(p || null)).catch(() => setPost(null));
  }, [id]);
  return (
    <>
      <TopBar back title="Publication" />
      <main className="main">
        {post === undefined ? (
          <CardSkeleton />
        ) : !post ? (
          <EmptyState art="empty" title="Publication introuvable" text="Elle a peut-être été supprimée." action={<Link to="/" className="btn btn--primary">Retour à l’accueil</Link>} />
        ) : (
          <>
            <ContentCard content={post} />
            {post.arcs?.id && (
              <Link to={`/arc/${post.arcs.id}`} className="btn btn--block" style={{ marginTop: 14 }}>
                Voir tout le parcours du projet
              </Link>
            )}
          </>
        )}
      </main>
    </>
  );
}
