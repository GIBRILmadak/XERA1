import { Link } from 'react-router-dom';
import Icon from './Icon';
import { Avatar, Badge } from './ui';
import { ARC_STATUS } from '../lib/format';
import { milestoneList } from '../services/data';

export default function ArcCard({ arc, showAuthor = true, compact = false }) {
  const status = ARC_STATUS[arc.status] || ARC_STATUS.in_progress;
  const milestones = milestoneList(arc);
  const done = Math.min(arc.validated ?? 0, milestones.length);
  const pct = milestones.length ? Math.round((done / milestones.length) * 100) : 0;
  return (
    <Link to={`/arc/${arc.id}`} className={`arc-card card${compact ? ' is-compact' : ''}`}>
      <div className="arc-cover">
        {arc.media_url ? <img src={arc.media_url} alt="" loading="lazy" /> : <div className="arc-cover-fallback"><Icon name="flag" size={34} /></div>}
        <Badge tone={status.tone} icon={status.icon}>
          {status.label}
        </Badge>
      </div>
      <div className="arc-info">
        <h3>{arc.title}</h3>
        {arc.goal && !compact && <p className="muted clamp-2">{arc.goal}</p>}
        <div className="arc-progress">
          <div className="progress">
            <span style={{ width: `${pct}%` }} />
          </div>
          <span className="muted">
            {done}/{milestones.length} jalons
          </span>
        </div>
        {showAuthor && arc.users && (
          <div className="row arc-author">
            <Avatar user={arc.users} size={24} />
            <span>{arc.users.name}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
