/**
 * Système de badges XERA1 — reprise fidèle de l'ancienne interface
 * (js/app-supabase.js : renderVerificationBadgeById, renderFataBadgeById,
 * renderAmbassadorBadgeById, renderProfileRoleBadgeByUser, getContributorBadgeHtml ;
 * js/monetization.js : renderPlanBadge, canReceiveSupport).
 * Les règles ne doivent pas changer avec la refonte : toute évolution se fait ici
 * ET dans l'ancienne interface tant que les deux coexistent.
 */
import { supabase } from './supabase';
import { DEMO } from './demo';

export const SUPER_ADMIN_ID = 'b0f9f893-1706-4721-899c-d26ad79afc86';
const ASSET_VERSION = '2';
const icon = (name) => `/icons/${name}?v=${ASSET_VERSION}`;

// ---------------------------------------------------------------- Listes vérifiées

let sets = { creators: new Set(), staff: new Set([SUPER_ADMIN_ID]), pages: new Set(), fata: new Set() };
let loaded = false;
let loading = null;
const listeners = new Set();

export function getBadgeSets() {
  return sets;
}

export function subscribeBadgeSets(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Charge une fois la table verified_badges (user_id, type), comme l'ancienne interface. */
export function loadBadgeSets() {
  if (loaded) return Promise.resolve(sets);
  if (loading) return loading;
  loading = (async () => {
    const next = { creators: new Set(), staff: new Set([SUPER_ADMIN_ID]), pages: new Set(), fata: new Set() };
    if (DEMO) {
      next.creators.add('u1');
      next.fata.add('u1');
      next.staff.add('u2');
    } else {
      const { data } = await supabase.from('verified_badges').select('user_id, type');
      for (const row of data || []) {
        if (row.type === 'staff') next.staff.add(row.user_id);
        if (row.type === 'creator') next.creators.add(row.user_id);
        if (row.type === 'page') next.pages.add(row.user_id);
        if (row.type === 'fata') next.fata.add(row.user_id);
      }
    }
    sets = next;
    loaded = true;
    listeners.forEach((fn) => fn(sets));
    return sets;
  })().catch(() => sets);
  return loading;
}

// ---------------------------------------------------------------- Plans

export function isPlanActive(user) {
  if (!user) return false;
  if (String(user.plan_status || '').trim().toLowerCase() !== 'active') return false;
  if (!user.plan_ends_at) return true;
  const end = Date.parse(user.plan_ends_at);
  return !Number.isFinite(end) || end > Date.now();
}

const PLAN_NAMES = { standard: 'Standard', medium: 'Medium', pro: 'Pro' };

/** Badge de plan affiché sur le profil (renderPlanBadge) : rien pour free. */
export function planBadge(user) {
  const plan = String(user?.plan || '').trim().toLowerCase();
  if (!plan || plan === 'free') return null;
  return { name: PLAN_NAMES[plan] || 'Standard', tone: plan, monetized: user?.is_monetized === true };
}

const GIFT_STATUSES = new Set(['', 'active', 'gifted', 'offered', 'granted', 'admin_granted', 'complimentary']);

/** Un créateur peut-il recevoir des soutiens ? (canReceiveSupport) */
export function canReceiveSupport(user) {
  if (!user) return false;
  const plan = String(user.plan || '').trim().toLowerCase();
  const activePlan = ['medium', 'pro', 'elite'].includes(plan) && isPlanActive(user);
  const giftedIndefinite =
    ['medium', 'pro'].includes(plan) && !user.plan_ends_at && GIFT_STATUSES.has(String(user.plan_status || '').trim().toLowerCase());
  if (!activePlan && !giftedIndefinite) return false;
  const giftedPro = plan === 'pro' && String(user.plan_status || '').toLowerCase() === 'active' && !user.plan_ends_at;
  if (giftedPro) return true;
  if (['medium', 'pro'].includes(plan)) return true;
  const monetized = user.is_monetized === true || String(user.is_monetized || '').toLowerCase() === 'true';
  return monetized || (Number.parseInt(user.followers_count ?? 0, 10) || 0) >= 1000;
}

// ---------------------------------------------------------------- Badge de vérification

const ORG_TYPES = ['team', 'enterprise', 'company', 'community', 'organization', 'organisation', 'org'];
const ORG_BADGES = ['staff', 'team', 'community', 'company', 'enterprise'];

/** Même arbre de décision que renderVerificationBadgeById. Renvoie { src, alt } ou null. */
export function verificationBadge(user, badgeSets = sets) {
  if (!user?.id) return null;
  const badge = String(user.badge || '').toLowerCase();
  const planActive = isPlanActive(user);
  const planBadgeRequested = planActive && ['verified', 'verified_gold', 'gold', 'pro'].includes(badge);
  const gold = planActive && ['verified_gold', 'gold', 'pro'].includes(badge);
  const accountType = String(user.account_type || 'personal').toLowerCase();
  const personalRequested =
    planBadgeRequested || badge === 'creator' || badge === 'personal' || accountType === 'creator' || accountType === 'verified';
  const staffListed = badgeSets.staff.has(user.id);
  const creatorListed = badgeSets.creators.has(user.id);

  const GOLD = { src: icon('verify-personal-gold.svg'), alt: 'Créateur vérifié Gold' };
  const PERSONAL = { src: icon('verify-personal.svg'), alt: 'Créateur vérifié' };
  const TEAM = { src: icon('verify-com.svg'), alt: 'Équipe vérifiée' };

  if (accountType === 'personal') {
    if (gold) return GOLD;
    if (creatorListed || personalRequested) return PERSONAL;
    return null;
  }
  if (staffListed || ORG_BADGES.includes(badge) || ORG_TYPES.includes(accountType)) return TEAM;
  if (gold) return GOLD;
  if (creatorListed || personalRequested) return PERSONAL;
  if (badge === 'ambassador') return { src: icon('embassadeur.svg'), alt: 'Ambassadeur' };
  return null;
}

export function fataBadge(user, badgeSets = sets) {
  return user?.id && badgeSets.fata.has(user.id) ? { src: icon('fata.webp'), alt: 'Challenge Fata validé' } : null;
}

/** Ambassadeur affiché seul quand aucun badge de vérification ne s'applique. */
export function ambassadorBadge(user) {
  return String(user?.badge || '').toLowerCase() === 'ambassador' ? { src: icon('embassadeur.svg'), alt: 'Ambassadeur' } : null;
}

/** Badge de rôle du profil (renderProfileRoleBadgeByUser). */
export function roleBadge(user) {
  const raw = String(user?.account_subtype || '').trim().toLowerCase();
  if (raw === 'recruiter' || raw === 'recruteur') return { label: 'Recruteur', src: icon('recruteur.svg'), role: 'recruiter' };
  if (raw === 'investor' || raw === 'investisseur') return { label: 'Investisseur', src: icon('investisseur.svg'), role: 'investor' };
  return null;
}

/** Paliers contributeur (getContributorBadgeHtml) : nombre de contenus + abonnés. */
export function contributorBadge(contentCount, followers) {
  const c = Number(contentCount) || 0;
  const f = Number(followers) || 0;
  if (c >= 300 && f >= 1000000) return { key: 'immortal', label: 'Architecte', emoji: '💎' };
  if (c >= 200 && f >= 100000) return { key: 'supreme', label: 'Empereur', emoji: '👑' };
  if (c >= 100 && f >= 10000) return { key: 'legend', label: 'Bâtisseur', emoji: '🌟' };
  if (c >= 70 && f >= 1000) return { key: 'elite', label: 'Ingénieur', emoji: '🏆' };
  if (c >= 50 && f >= 500) return { key: 'established', label: 'Forgeron', emoji: '🥈' };
  if (c >= 50) return { key: 'bronze', label: 'Séquoia', emoji: '🥉' };
  if (c >= 20) return { key: 'emerging', label: 'Silex', emoji: '⭐' };
  return null;
}

/** Colonnes utilisateur nécessaires au calcul des badges, pour les jointures. */
export const USER_BADGE_COLUMNS = 'id, name, avatar, badge, account_type, account_subtype, plan, plan_status, plan_ends_at, is_monetized, followers_count';
