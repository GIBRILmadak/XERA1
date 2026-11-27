/** Préférences de profil — mêmes valeurs que normalizeProfilePreferences (ancienne interface). */
export const PROFILE_THEMES = {
  xera: { label: 'XERA', accent: '#10b981', secondary: '#f59e0b' },
  aurora: { label: 'Aurora', accent: '#14b8a6', secondary: '#8b5cf6' },
  ember: { label: 'Ember', accent: '#f97316', secondary: '#ef4444' },
  ocean: { label: 'Ocean', accent: '#38bdf8', secondary: '#2563eb' },
  mono: { label: 'Mono', accent: '#e5e7eb', secondary: '#71717a' },
};

/** Réseaux proposés par l'ancienne interface (clés de users.social_links). */
export const SOCIALS = [
  ['site', 'Site web', 'https://…'],
  ['email', 'E-mail public', 'vous@exemple.com'],
  ['linkedin', 'LinkedIn', 'linkedin.com/in/…'],
  ['github', 'GitHub', 'github.com/…'],
  ['twitter', 'X (Twitter)', '@pseudo'],
  ['instagram', 'Instagram', '@pseudo'],
  ['tiktok', 'TikTok', '@pseudo'],
  ['youtube', 'YouTube', 'youtube.com/@…'],
  ['facebook', 'Facebook', 'facebook.com/…'],
  ['twitch', 'Twitch', 'twitch.tv/…'],
  ['discord', 'Discord', 'pseudo ou lien'],
  ['snapchat', 'Snapchat', 'pseudo'],
  ['spotify', 'Spotify', 'lien'],
  ['reddit', 'Reddit', 'u/…'],
  ['pinterest', 'Pinterest', 'pinterest.com/…'],
];

const pick = (v, list, d) => (list.includes(v) ? v : d);
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : d);

export function normalizePrefs(raw = {}) {
  const ap = raw?.appearance || {};
  const pr = raw?.privacy || {};
  const theme = PROFILE_THEMES[ap.theme] ? ap.theme : 'xera';
  const preset = PROFILE_THEMES[theme];
  return {
    ...(raw || {}),
    appearance: {
      theme,
      accent: hex(ap.accent, preset.accent),
      secondary: hex(ap.secondary, preset.secondary),
      layout: pick(ap.layout, ['balanced', 'showcase', 'compact'], 'balanced'),
      bannerStyle: pick(ap.bannerStyle, ['cover', 'contain', 'soft'], 'cover'),
      panelStyle: pick(ap.panelStyle, ['glass', 'solid', 'minimal'], 'glass'),
    },
    privacy: {
      visibility: pick(pr.visibility, ['public', 'followers', 'private'], 'public'),
      discoverable: pr.discoverable !== false,
      showStats: pr.showStats !== false,
      showSocials: pr.showSocials !== false,
      showActivity: pr.showActivity !== false,
      allowMessages: pick(pr.allowMessages, ['everyone', 'followers', 'none'], 'everyone'),
    },
  };
}

/** Lien cliquable pour un réseau (ou null). */
export function socialHref(key, value) {
  const v = String(value || '').trim();
  if (!v) return null;
  if (key === 'email') return `mailto:${v}`;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, '');
  const base = {
    twitter: 'https://x.com/',
    instagram: 'https://instagram.com/',
    tiktok: 'https://tiktok.com/@',
    github: 'https://github.com/',
    snapchat: 'https://snapchat.com/add/',
    reddit: 'https://reddit.com/user/',
  }[key];
  if (base && !v.includes('.')) return base + handle.replace(/^u\//, '');
  return `https://${v.replace(/^\/+/, '')}`;
}
