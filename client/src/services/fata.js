/**
 * Intégration Fata × XERA1 côté client (contrat technique v1.0).
 *
 * Le navigateur ne voit jamais ni secret client ni jeton Fata : il ne parle
 * qu'au serveur XERA1, qui porte l'OIDC (code + PKCE) et la file d'envoi
 * durable des confirmations (POST /api/v1/action-completions chez Fata).
 *
 * Contrat §3 : le challengeId arrive par la redirection
 * https://xera1.xyz/profile?fata=success&challengeId=<id>. On le conserve en
 * session pendant la connexion OIDC et jusqu'à la sélection de l'ARC.
 */
import { apiFetch } from './api';
import { DEMO, demoFata } from './demo';

// Même clé que l'ancienne interface : une session ouverte avant la refonte reste valable.
const CHALLENGE_KEY = 'xera1_fata_challenge_id';
const LONG = 55000; // sous la limite de 60 s de la fonction Vercel

export const FATA_STEPS = [
  {
    key: 'arc',
    requirement: 'req_arc',
    icon: 'flag',
    title: 'Publier ou choisir un ARC',
    detail: 'Titre, description et au moins trois jalons.',
  },
  {
    key: 'proof',
    requirement: 'req_preuve',
    icon: 'add_photo_alternate',
    title: 'Publier une preuve',
    detail: 'Un média et une description, rattachés à cet ARC.',
  },
  {
    key: 'milestone',
    requirement: 'req_jalon',
    icon: 'task_alt',
    title: 'Valider un jalon',
    detail: 'Décrivez le résultat obtenu, avec une preuve.',
  },
];

export function readChallengeFromUrl(search = window.location.search) {
  const params = new URLSearchParams(search);
  const fromUrl = (params.get('challengeId') || '').trim();
  if (fromUrl) rememberChallenge(fromUrl);
  return {
    fata: params.get('fata'),
    reason: params.get('reason'),
    challengeId: fromUrl || getStoredChallenge(),
    explicit: Boolean(fromUrl),
  };
}

export function rememberChallenge(id) {
  try {
    if (id) sessionStorage.setItem(CHALLENGE_KEY, id);
  } catch {
    /* stockage indisponible : on garde l'URL */
  }
}

export function getStoredChallenge() {
  try {
    return sessionStorage.getItem(CHALLENGE_KEY) || '';
  } catch {
    return '';
  }
}

export async function getStatus() {
  if (DEMO) return demoFata.status();
  return apiFetch('/api/fata/status', { timeout: 8000 });
}

/** Démarre l'OIDC : le serveur renvoie l'URL d'autorisation Fata (state, nonce, PKCE). */
export async function startLink(challengeId) {
  if (DEMO) return demoFata.start();
  const data = await apiFetch('/api/auth/fata/start', {
    method: 'POST',
    body: challengeId ? { challengeId } : {},
    timeout: LONG,
  });
  if (!data?.authUrl) throw new Error("Adresse d'autorisation Fata invalide.");
  return data.authUrl;
}

export async function participate(challengeId) {
  if (DEMO) return demoFata.participate();
  return apiFetch('/api/fata/participate', { method: 'POST', body: { challengeId } });
}

export async function listEligibleArcs(challengeId) {
  if (DEMO) return demoFata.arcs();
  return apiFetch(`/api/fata/arcs?challengeId=${encodeURIComponent(challengeId)}`);
}

export async function selectArc(challengeId, arcId) {
  if (DEMO) return demoFata.select(arcId);
  return apiFetch('/api/fata/select-arc', {
    method: 'POST',
    body: { challengeId, arcId },
    timeout: LONG,
  });
}

/** Demande au serveur de livrer tout de suite les tâches déjà en file. */
export async function syncQueue() {
  if (DEMO) return demoFata.sync();
  return apiFetch('/api/fata/sync', { method: 'POST', timeout: LONG });
}

export async function acknowledgeCelebration() {
  if (DEMO) return { ok: true };
  return apiFetch('/api/fata/celebration/seen', { method: 'POST', timeout: 8000 });
}

/** Messages lisibles pour chaque code d'erreur stable de l'API Fata (contrat §6). */
export function describeFailure(lastError) {
  const detail = String(lastError || '');
  if (/not_registered/i.test(detail))
    return "Ce compte Fata n'est pas inscrit au challenge. Inscrivez-vous sur Fata puis revenez via « Continuer sur XERA1 ».";
  if (/outside_window/i.test(detail))
    return "Cette action est hors de la période du challenge : elle ne compte pas.";
  if (/receipt_deadline_passed/i.test(detail))
    return 'Le délai de réception du challenge est dépassé.';
  if (/link_revoked/i.test(detail))
    return "L'autorisation Fata a été retirée. Reliez le même compte Fata pour reprendre les confirmations.";
  if (/idempotency_conflict/i.test(detail))
    return 'Conflit sur une confirmation déjà envoyée. Contactez le support XERA1.';
  if (/unknown_subject/i.test(detail))
    return "Fata ne reconnaît pas ce compte lié. Reliez votre compte Fata.";
  if (/unknown_challenge|unknown_requirement/i.test(detail))
    return 'Configuration du challenge incorrecte côté XERA1. Le support est prévenu.';
  return detail ? `Fata a refusé une confirmation : ${detail}` : "Fata n'a pas accepté une confirmation.";
}

/** Déduit l'état de chaque étape à partir des tâches de la file d'envoi. */
export function stepStates(pendingEvents = [], requirements = {}) {
  const ids = {
    arc: requirements.arc || 'req_arc',
    proof: requirements.proof || 'req_preuve',
    milestone: requirements.milestone || 'req_jalon',
  };
  const out = {};
  for (const [key, req] of Object.entries(ids)) {
    const events = pendingEvents.filter((e) => e.requirement_id === req);
    if (events.some((e) => e.status === 'delivered')) out[key] = 'done';
    else if (events.some((e) => e.status === 'failed')) out[key] = 'failed';
    else if (events.length) out[key] = 'queued';
    else out[key] = 'todo';
  }
  return out;
}

export function isRevoked(pendingEvents = []) {
  return pendingEvents.some((e) => e.status === 'failed' && /link_revoked/i.test(e.last_error || ''));
}
