const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto', style: 'short' });

export function timeAgo(value) {
  const t = Date.parse(value || '');
  if (!Number.isFinite(t)) return '';
  const s = Math.round((t - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return "à l'instant";
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 604800) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function compact(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

export function initials(name = '') {
  return (
    String(name)
      .replace(/\b(undefined|null)\b/gi, '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0] || '')
      .join('')
      .toUpperCase() || 'X'
  );
}

export const STATE_META = {
  success: { label: 'Avancée', icon: 'trending_up', tone: 'success' },
  failure: { label: 'Obstacle', icon: 'report', tone: 'failure' },
  pause: { label: 'Pause', icon: 'pause_circle', tone: 'pause' },
};

export const ARC_STATUS = {
  in_progress: { label: 'En cours', tone: 'violet', icon: 'autorenew' },
  completed: { label: 'Terminé', tone: 'success', icon: 'check_circle' },
  abandoned: { label: 'Arrêté', tone: 'failure', icon: 'cancel' },
  paused: { label: 'En pause', tone: 'pause', icon: 'pause_circle' },
};

export function isVerified(user) {
  if (Number(user?.is_verified) > 0) return true;
  const b = String(user?.badge || '').toLowerCase();
  return ['verified', 'staff', 'team', 'official', 'pro'].includes(b);
}

export const ARC_STAGES = [
  { value: 'idee', label: 'Idée' },
  { value: 'prototype', label: 'Prototype' },
  { value: 'demo', label: 'Démo' },
  { value: 'beta', label: 'Bêta' },
  { value: 'release', label: 'Release' },
];

export function stageLabel(value) {
  return ARC_STAGES.find((s) => s.value === String(value || '').toLowerCase())?.label || null;
}

/** Nom affichable : certains anciens comptes ont un nom vide ou « undefined undefined ». */
export function displayName(user) {
  const name = String(user?.name || '').replace(/\b(undefined|null)\b/gi, '').trim();
  return name || 'Membre XERA';
}
