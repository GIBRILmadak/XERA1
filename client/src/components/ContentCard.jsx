import { useEffect, useRef, useState } from 'react';
import { recordInteraction } from '../services/feedAlgo';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { Avatar, Badge, IconButton, UserName } from './ui';
import { compact, STATE_META, timeAgo } from '../lib/format';
import { countView, isEncouraged, toggleEncouragement } from '../services/data';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import { PUBLIC_SITE } from '../services/api';
import { SUPER_ADMIN_ID } from '../services/badges';
import { setTraceValidation } from '../services/pages';
import { useMyPages } from '../hooks/useMyPages';
import MediaViewer from './MediaViewer';
import { supabase } from '../services/supabase';

export function StateBadge({ state }) {
  const meta = STATE_META[state];
  if (!meta) return null;
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      {meta.label}
    </Badge>
  );
}

/** Carte d'une preuve (trace de progression) dans le fil. */
export default function ContentCard({ content, encouraged, milestone, index = 0, allowValidation = false }) {
  const { user } = useAuth();
  const { toast } = useUi();
  const [on, setOn] = useState(Boolean(encouraged));
  const [busyEnc, setBusyEnc] = useState(false);

  // État réel relu depuis la base (après actualisation, il reste « encouragé »).
  useEffect(() => {
    if (encouraged !== undefined) {
      setOn(Boolean(encouraged));
      return undefined;
    }
    if (!user) return undefined;
    let alive = true;
    isEncouraged(user.id, content.id).then((v) => alive && setOn(v));
    return () => {
      alive = false;
    };
  }, [user, content.id, encouraged]);
  const [count, setCount] = useState(Number(content.encouragements_count ?? content.encouragements ?? 0));
  const [expanded, setExpanded] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [validation, setValidation] = useState({ valid: Boolean(content.is_validated_pro), pageId: content.validated_by_page_id || content.validator?.id || null, validator: content.validator || null });
  // Sceau de validation : le propriétaire d'une page pro peut valider la preuve d'un autre membre.
  const myPages = useMyPages(allowValidation && user && content.author_type !== 'PAGE_PRO' && user.id !== content.user_id ? user.id : null);

  async function toggleSeal(page) {
    const granting = !(validation.valid && validation.pageId === page.id);
    try {
      await setTraceValidation(content.id, page.id, granting);
      setValidation(granting ? { valid: true, pageId: page.id, validator: { id: page.id, name: page.name, slug: page.slug } } : { valid: false, pageId: null, validator: null });
      toast('success', granting ? 'Sceau accordé' : 'Validation révoquée', granting ? `Preuve validée par ${page.name}.` : undefined);
    } catch (e) {
      toast('error', 'Action impossible', e.message);
    }
  }
  const isAdmin = user?.id === SUPER_ADMIN_ID;

  async function adminHide() {
    const reason = window.prompt('Motif du masquage (visible par l’équipe)');
    if (reason === null) return;
    const { error } = await supabase
      .from('content')
      .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_reason: reason.trim() || null, deleted_by: user.id })
      .eq('id', content.id);
    if (error) return toast('error', 'Masquage impossible', error.message);
    setRemoved(true);
    toast('success', 'Contenu masqué', 'Il n’est plus visible publiquement.');
  }
  const isPagePost = content.author_type === 'PAGE_PRO' && content.page;
  const author = isPagePost ? { id: content.page.id, name: content.page.name, avatar: content.page.avatar_url } : content.users || {};
  const authorLink = isPagePost ? `/page/${content.page.slug || content.page.id}` : `/u/${content.user_id}`;
  const arc = content.arcs;
  const media = content.media_url || content.media_urls?.[0];
  const isVideo = content.type === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(media || '');
  const long = (content.description || '').length > 220;
  const cardRef = useRef();

  // Vue prolongée (60 % visible pendant 1,5 s) : signal « view » pour l'algorithme.
  useEffect(() => {
    if (!user || !cardRef.current || !('IntersectionObserver' in window)) return undefined;
    let timer;
    const io = new IntersectionObserver(
      ([e]) => {
        clearTimeout(timer);
        if (e.isIntersecting) {
          timer = setTimeout(() => {
            countView(content.id);
            recordInteraction(user.id, content, 'view');
            io.disconnect();
          }, 1500);
        }
      },
      { threshold: 0.6 },
    );
    io.observe(cardRef.current);
    return () => {
      clearTimeout(timer);
      io.disconnect();
    };
  }, [user, content]);

  async function toggle() {
    if (!user) {
      toast('info', 'Connectez-vous', 'Créez un compte pour encourager les bâtisseurs.');
      return;
    }
    if (busyEnc) return;
    const next = !on;
    if (next) recordInteraction(user.id, content, 'like');
    setOn(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    setBusyEnc(true);
    try {
      const res = await toggleEncouragement(user.id, content.id);
      // La base fait foi : état et total renvoyés par toggle_courage.
      if (res) {
        setOn(res.encouraged);
        setCount(res.count);
      }
    } catch {
      setOn(!next);
      setCount((c) => Math.max(0, c + (next ? -1 : 1)));
      toast('error', 'Action impossible', 'Réessayez dans un instant.');
    } finally {
      setBusyEnc(false);
    }
  }

  async function share() {
    const url = `${PUBLIC_SITE}/share/${content.id}`;
    try {
      if (navigator.share) await navigator.share({ title: content.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('success', 'Lien copié');
      }
    } catch {
      /* partage annulé */
    }
  }

  if (removed) return null;
  const gallery = [...new Set([media, ...(content.media_urls || [])].filter(Boolean))];
  return (
    <article ref={cardRef} className={`post card is-${content.state || 'pause'}`} style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}>
      {content.day_number != null && content.day_number > 0 && (
        <span className="post-day" title={`Jour ${content.day_number} du projet`}>
          <small>Jour</small>
          {content.day_number}
        </span>
      )}
      <header className="post-head">
        <Link to={authorLink} className="row grow" style={{ minWidth: 0 }}>
          <Avatar user={author} size={42} />
          <div className="grow">
            {isPagePost ? (
              <span className="row post-author" style={{ gap: 6 }}>
                {author.name}
                {content.page.is_verified && <img src="/icons/verify_page.svg" alt="Page vérifiée" style={{ width: 16, height: 16 }} />}
                <span className="pro-tag">PRO</span>
              </span>
            ) : (
              <UserName user={author} className="post-author" />
            )}
            <div className="post-meta">
              {content.day_number != null && <span>Jour {content.day_number}</span>}
              {content.day_number != null && <span aria-hidden="true">·</span>}
              <span>{timeAgo(content.created_at)}</span>
            </div>
          </div>
        </Link>
        <StateBadge state={content.state} />
      </header>

      {arc?.title && (
        <Link to={`/arc/${arc.id}`} className="post-arc">
          <Icon name="flag" size={17} />
          <span>{arc.title}</span>
          <Icon name="chevron_right" size={18} />
        </Link>
      )}

      <div className="post-body">
        {content.title && <h3>{content.title}</h3>}
        {content.description && (
          <p className={long && !expanded ? 'clamp' : ''}>
            {content.description}
          </p>
        )}
        {long && (
          <button className="more" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Voir moins' : 'Voir plus'}
          </button>
        )}
        {validation.valid && validation.validator && (
          <Link to={`/page/${validation.validator.slug || validation.validator.id}`} className="post-seal">
            <Icon name="workspace_premium" filled size={18} /> Validé par {validation.validator.name}
          </Link>
        )}
        {milestone && (
          <div className="post-milestone">
            <Icon name="task_alt" filled size={18} /> Jalon validé
          </div>
        )}
      </div>

      {media && (
        <div className={`post-media${gallery.length > 1 ? ' is-gallery' : ''}`}>
          {isVideo ? (
            <video src={media} poster={content.metadata?.poster_url || undefined} controls playsInline preload="metadata" />
          ) : (
            gallery.slice(0, 4).map((src, i) => (
              <button key={src} type="button" className="post-media-item" onClick={() => setViewer(src)} aria-label="Voir la photo en grand">
                <img src={src} alt={content.title || 'Preuve'} loading="lazy" />
                {i === 3 && gallery.length > 4 && <span className="post-media-more">+{gallery.length - 4}</span>}
              </button>
            ))
          )}
        </div>
      )}

      {myPages.length > 0 && (
        <div className="seal-actions">
          {myPages.map((page) => {
            const mine = validation.valid && validation.pageId === page.id;
            return (
              <button key={page.id} className={`seal-btn${mine ? ' is-on' : ''}`} onClick={() => toggleSeal(page)}>
                <Icon name={mine ? 'remove_done' : 'workspace_premium'} filled={!mine} size={18} />
                {mine ? `Révoquer la validation (${page.name})` : `Accorder le sceau de ${page.name}`}
              </button>
            );
          })}
        </div>
      )}
      <MediaViewer src={viewer} alt={content.title} onClose={() => setViewer(null)} />
      <footer className="post-actions">
        <button className={`react${on ? ' is-on' : ''}`} onClick={toggle} aria-pressed={on}>
          <Icon name="local_fire_department" filled={on} />
          <span>{count > 0 ? compact(count) : 'Encourager'}</span>
        </button>
        {arc?.id && (
          <Link className="react" to={`/arc/${arc.id}`}>
            <Icon name="timeline" />
            <span>Parcours</span>
          </Link>
        )}
        <span className="views">
          <Icon name="visibility" size={18} />
          {compact(content.views || 0)}
        </span>
        {isAdmin && <IconButton icon="shield_person" label="Admin : masquer ce contenu" onClick={adminHide} />}
        <IconButton icon="ios_share" label="Partager" onClick={share} />
      </footer>
    </article>
  );
}
