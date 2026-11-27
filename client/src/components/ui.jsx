import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { displayName, initials } from '../lib/format';
import { NameBadges } from './Badges';

export function Avatar({ user, size = 40, ring = false }) {
  const [broken, setBroken] = useState(false);
  const src = user?.avatar || user?.avatar_url;
  const style = { '--size': `${size}px` };
  if (src && !broken) {
    return (
      <img
        className={`avatar${ring ? ' avatar--ring' : ''}`}
        style={style}
        src={src}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className={`avatar${ring ? ' avatar--ring' : ''}`} style={style} aria-hidden="true">
      {initials(user?.name)}
    </span>
  );
}

export function UserName({ user, className = '' }) {
  return (
    <span className={`row ${className}`} style={{ gap: 4, display: 'inline-flex', minWidth: 0 }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {displayName(user)}
      </span>
      <NameBadges user={user} />
    </span>
  );
}

export function Button({ variant, size, block, icon, loading, children, className = '', ...props }) {
  const cls = ['btn', variant && `btn--${variant}`, size && `btn--${size}`, block && 'btn--block', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} disabled={loading || props.disabled} {...props}>
      {loading ? <span className="spinner" /> : icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, filled, badge, className = '', ...props }) {
  return (
    <button className={`icon-btn ${className}`} aria-label={label} title={label} {...props}>
      <Icon name={icon} filled={filled} />
      {badge ? <span className="dot">{badge > 9 ? '9+' : badge}</span> : null}
    </button>
  );
}

export function IconLink({ to, icon, label, filled, badge, className = '' }) {
  return (
    <Link to={to} className={`icon-btn ${className}`} aria-label={label} title={label}>
      <Icon name={icon} filled={filled} />
      {badge ? <span className="dot">{badge > 9 ? '9+' : badge}</span> : null}
    </Link>
  );
}

export function Badge({ tone, icon, children }) {
  return (
    <span className={`badge${tone ? ` badge--${tone}` : ''}`}>
      {icon && <Icon name={icon} filled />}
      {children}
    </span>
  );
}

export function EmptyState({ icon = 'inbox', title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} />
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%', radius, style }) {
  return <div className="skeleton" style={{ height, width, borderRadius: radius, ...style }} />;
}

export function CardSkeleton() {
  return (
    <div className="card card--pad stack" aria-hidden="true">
      <div className="row">
        <Skeleton width={40} height={40} radius="50%" />
        <div className="grow stack" style={{ gap: 6 }}>
          <Skeleton width="45%" height={12} />
          <Skeleton width="25%" height={10} />
        </div>
      </div>
      <Skeleton height={14} width="80%" />
      <Skeleton height={220} radius={16} />
    </div>
  );
}

/** Feuille du bas (mobile) / modale centrée (bureau). Échap et clic extérieur ferment. */
export function Sheet({ open, onClose, title, children, labelledBy }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={labelledBy ? undefined : title}>
        <div className="sheet-handle" />
        {title && (
          <div className="sheet-head">
            <h3>{title}</h3>
            <IconButton icon="close" label="Fermer" onClick={onClose} />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
