import { Link } from 'react-router-dom';
import Icon from './Icon';
import { Avatar, Badge } from './ui';
import { ARC_STATUS, displayName } from '../lib/format';
import { milestoneList } from '../services/data';

export default function ArcCard({ arc, showAuthor = true, compact = false }) {
  const status = ARC_STATUS[arc.status] || ARC_STATUS.in_progress;
  const milestones = milestoneList(arc);
  const done = Math.min(arc.validated ?? 0, milestones.length);
  const pct = milestones.length ? Math.round((done / milestones.length) * 100) : 0;
  return (
    <Link to={`/arc/${arc.id}`} className={`arc-card card${compact ? ' is-compact' : ''}`}>
      {arc.media_url ? (
        <div className="arc-cover">
          <img src={arc.media_url} alt="" loading="lazy" />
          <Badge tone={status.tone} icon={status.icon}>
            {status.label}
          </Badge>
        </div>
      ) : null}
      <div className="arc-info">
        {!arc.media_url && (
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="lead-icon" style={{ width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', color: 'var(--text-2)' }}>
              <Icon name="flag" size={19} />
            </span>
            <Badge tone={status.tone} icon={status.icon}>
              {status.label}
            </Badge>
          </div>
        )}
        <h3>{arc.title}</h3>
        {arc.goal && !compact && <p className="muted clamp-2">{arc.goal}</p>}
        {milestones.length > 0 && (
          <div className="arc-path" aria-hidden="true">
            {milestones.slice(0, 8).map((m, i) => (
              <span key={i} className={i < done ? 'is-done' : i === done ? 'is-next' : ''} title={m.title} />
            ))}
          </div>
        )}
        {milestones.length > 0 && (
        <div className="arc-progress">
          <div className="progress">
            <span style={{ width: `${pct}%` }} />
          </div>
          <span className="muted">
            {done}/{milestones.length} jalons
          </span>
        </div>
        )}
        {showAuthor && arc.users && (
          <div className="row arc-author">
            <Avatar user={arc.users} size={24} />
            <span>{displayName(arc.users)}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
