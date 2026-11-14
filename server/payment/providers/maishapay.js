'use strict';

/**
 * server/payment/providers/maishapay.js
 *
 * Module prestataire MaishaPay — ISOLÉ.
 * Branche : feat/maishapay-provider
 *
 * Ce fichier ne contient QUE la couche de communication avec l'API MaishaPay v2.0.
 * Dépendances : Node.js >= 18 (fetch natif, AbortController, crypto.timingSafeEqual).
 * Aucune dépendance npm nouvelle.
 *
 * SÉCURITÉ :
 *  - Les clés d'API ne sont jamais loggées ni incluses dans les messages d'erreur.
 *  - Les numéros de téléphone sont masqués dans les logs (3 derniers chiffres).
 *  - Le corps des requêtes sortantes n'est jamais exposé dans les erreurs.
 */

const { timingSafeEqual } = require('node:crypto');

// ─── Constantes ───────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL   = 'https://marchand.maishapay.online/api';
const REQUEST_TIMEOUT_MS = 8_000;

// Codes opérateurs CONFIRMÉS par la doc Postman MaishaPay v2.0.
const CONFIRMED_PROVIDER_CODES = new Set(['AIRTEL', 'ORANGE', 'MPESA', 'MTN']);

// Référence marchand XERA : «xera_» + UUID v4 (32 hex + 4 tirets = 36 chars).
const REFERENCE_REGEX = /^xera_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Numéro de téléphone international minimal.
const PHONE_REGEX = /^\+\d{8,15}$/;

// ─── Config (lazy, par sous-ensemble) ────────────────────────────────────────

/**
 * Lit et valide un sous-ensemble de variables d'environnement.
 * Chaque fonction appelle getConfig() uniquement avec les vars qu'elle utilise :
 *   initiatePayment : PUBLIC_KEY, SECRET_KEY, GATEWAY_MODE, WEBHOOK_TOKEN, APP_BASE_URL
 *   checkStatus     : PUBLIC_KEY, SECRET_KEY, GATEWAY_MODE
 *   parseWebhook    : WEBHOOK_TOKEN
 *
 * Validations supplémentaires quand MAISHAPAY_GATEWAY_MODE est demandé :
 *   - Doit être «0» (sandbox) ou «1» (live).
 *   - Cohérence mode/préfixe de clé :
 *       mode «1» → MP-LIVEPK-* / MP-LIVESK-*
 *       mode «0» → MP-SBPK-*  / MP-SBSK-*
 *
 * Les messages d'erreur ne contiennent JAMAIS la valeur d'une clé.
 *
 * @param {...string} requiredKeys - Noms des vars d'env requises par l'appelant
 * @returns {object} cfg
 */
function getConfig(...requiredKeys) {
  for (const key of requiredKeys) {
    if (!process.env[key]) {
      throw new Error(
        `[MaishaPay] Variable d'environnement obligatoire manquante : ${key}. ` +
        'Vérifiez votre fichier .env.'
      );
    }
  }

  const cfg = {
    publicKey:    process.env.MAISHAPAY_PUBLIC_KEY,
    secretKey:    process.env.MAISHAPAY_SECRET_KEY,
    gatewayMode:  process.env.MAISHAPAY_GATEWAY_MODE,
    webhookToken: process.env.MAISHAPAY_WEBHOOK_TOKEN,
    baseUrl:      process.env.MAISHAPAY_BASE_URL || DEFAULT_BASE_URL,
    appBaseUrl:   process.env.APP_BASE_URL,
  };

  if (requiredKeys.includes('MAISHAPAY_GATEWAY_MODE')) {
    if (!['0', '1'].includes(cfg.gatewayMode)) {
      throw new Error(
        '[MaishaPay] MAISHAPAY_GATEWAY_MODE doit être «0» (sandbox) ou «1» (live).'
      );
    }

    if (
      requiredKeys.includes('MAISHAPAY_PUBLIC_KEY') &&
      requiredKeys.includes('MAISHAPAY_SECRET_KEY')
    ) {
      if (cfg.gatewayMode === '1') {
        if (!cfg.publicKey.startsWith('MP-LIVEPK-')) {
          throw new Error(
            '[MaishaPay] Mode live (1) : MAISHAPAY_PUBLIC_KEY doit commencer par MP-LIVEPK-.'
          );
        }
        if (!cfg.secretKey.startsWith('MP-LIVESK-')) {
          throw new Error(
            '[MaishaPay] Mode live (1) : MAISHAPAY_SECRET_KEY doit commencer par MP-LIVESK-.'
          );
        }
      } else {
        if (!cfg.publicKey.startsWith('MP-SBPK-')) {
          throw new Error(
            '[MaishaPay] Mode sandbox (0) : MAISHAPAY_PUBLIC_KEY doit commencer par MP-SBPK-.'
          );
        }
        if (!cfg.secretKey.startsWith('MP-SBSK-')) {
          throw new Error(
            '[MaishaPay] Mode sandbox (0) : MAISHAPAY_SECRET_KEY doit commencer par MP-SBSK-.'
          );
        }
      }
    }
  }

  return cfg;
}

// ─── Utilitaires internes ─────────────────────────────────────────────────────

function maskPhone(phone) {
  if (!phone || typeof phone !== 'string' || phone.length <= 3) return '***';
  return '*'.repeat(phone.length - 3) + phone.slice(-3);
}

function isValidLocal(local, countryCode) {
  if (!local || !/^\d+$/.test(local)) return false;
  if (countryCode === '+243') return local.length === 9;
  return local.length >= 7 && local.length <= 10;
}

/**
 * Tronque une valeur venant de MaishaPay à 40 caractères pour les logs.
 */
function truncate(val, max = 40) {
  const s = String(val ?? '');
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// ─── Utilitaires exportés ─────────────────────────────────────────────────────

/**
 * Vérifie qu'une chaîne est une référence marchand XERA valide.
 * Format : «xera_» + UUID v4.
 * @param {string} ref
 * @returns {boolean}
 */
function isValidReference(ref) {
  return typeof ref === 'string' && REFERENCE_REGEX.test(ref);
}

/**
 * Formate un montant pour l'API MaishaPay.
 * CDF, XAF, XOF : entier arrondi. USD, EUR : 2 décimales fixes.
 * Rejette NaN, Infinity, 0 et les devises inconnues.
 * @param {number|string} amount
 * @param {string} currency
 * @returns {string}
 * @throws {Error}
 */
function formatAmount(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `[MaishaPay] formatAmount : montant invalide (${amount}). ` +
      'Doit être un nombre fini strictement positif.'
    );
  }
  const cur = (currency || '').toUpperCase().trim();
  if (['CDF', 'XAF', 'XOF'].includes(cur)) return String(Math.round(n));
  if (['USD', 'EUR'].includes(cur)) return n.toFixed(2);
  throw new Error(
    `[MaishaPay] formatAmount : devise non reconnue «${cur}». ` +
    'Devises supportées : CDF, XAF, XOF, USD, EUR.'
  );
}

/**
 * Normalise un numéro de téléphone au format international.
 * Formats acceptés (RDC, countryCode=«+243») :
 *   «0974123456» → «+243974123456»
 *   «974123456»  → «+243974123456»
 *   «+243974123456» → «+243974123456»
 *   «00243974123456» → «+243974123456»
 * @param {string} input
 * @param {string} [countryCode="+243"]
 * @returns {string|null}
 */
function normalizePhone(input, countryCode = '+243') {
  if (!input || typeof input !== 'string') return null;
  const digits   = input.replace(/[\s\-]/g, '');
  const ccDigits = countryCode.slice(1);

  if (digits.startsWith(countryCode)) {
    const local = digits.slice(countryCode.length);
    return isValidLocal(local, countryCode) ? digits : null;
  }
  if (digits.startsWith('00' + ccDigits)) {
    const local = digits.slice(2 + ccDigits.length);
    return isValidLocal(local, countryCode) ? countryCode + local : null;
  }
  if (!digits.startsWith('0') && digits.startsWith(ccDigits)) {
    const local = digits.slice(ccDigits.length);
    if (isValidLocal(local, countryCode)) return countryCode + local;
  }
  if (digits.startsWith('0')) {
    const local = digits.slice(1);
    return isValidLocal(local, countryCode) ? countryCode + local : null;
  }
  if (isValidLocal(digits, countryCode)) {
    return countryCode + digits;
  }
  return null;
}

/**
 * Convertit un slug opérateur interne XERA vers le code MaishaPay.
 * Sources confirmées : doc Postman MaishaPay v2.0.
 * Opérateurs À CONFIRMER → null.
 * @param {string} slug
 * @returns {string|null}
 */
function mapProvider(slug) {
  const CONFIRMED = {
    airtel_money: 'AIRTEL', // confirmé doc v2.0 — DRC, Congo Brazza
    orange_money: 'ORANGE', // confirmé doc v2.0 — DRC, Cameroun, Sénégal, CI
    mpesa:        'MPESA',  // confirmé doc v1.0 + v2.0 — DRC uniquement
    mtn:          'MTN',    // confirmé doc v2.0 — Cameroun, Congo Brazza, CI
  };
  if (slug in CONFIRMED) return CONFIRMED[slug];
  // À CONFIRMER — absent ou ambigu dans la doc : afrimoney, free_money,
  // wave, wizall, moov, t_money, expresso → null
  return null;
}

/**
 * Valide qu'un montant respecte les minimums MaishaPay.
 * CDF, XAF, XOF : > 100 ; USD, EUR : > 0.5.
 * @param {number|string} amount
 * @param {string} currency
 * @returns {boolean}
 */
function validateAmount(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return false;
  const cur = (currency || '').toUpperCase().trim();
  if (['CDF', 'XAF', 'XOF'].includes(cur)) return n > 100;
  if (['USD', 'EUR'].includes(cur)) return n > 0.5;
  return false;
}

/**
 * Construit la référence marchand XERA.
 * @param {string} transactionId - UUID XERA
 * @returns {string}
 */
function buildReference(transactionId) {
  return `xera_${transactionId}`;
}

// ─── API MaishaPay ────────────────────────────────────────────────────────────

/**
 * Initie un paiement Mobile Money via MaishaPay API v2.0.
 *
 * Endpoint : POST {baseUrl}/collect/v2/store/mobileMoney
 * Timeout  : 8 secondes (AbortController) — couvre fetch ET res.json().
 *            clearTimeout dans le «finally» garantit la libération du timer.
 *
 * Champ uncertain :
 *   uncertain:true  → état de la transaction INCONNU (timeout, réseau, 5xx, réponse invalide).
 *                     NE JAMAIS marquer la transaction «failed» sur uncertain:true.
 *                     Appeler checkStatus() avant toute décision.
 *   uncertain:false → rejet DÉTERMINISTE (validation locale ou 4xx API).
 *                     La transaction n'a pas été créée côté MaishaPay.
 *
 * SÉCURITÉ : le corps de la requête (clés, numéro) n'est JAMAIS inclus dans les erreurs.
 *
 * @param {{ reference:string, amount:number|string, currency:string, phone:string, provider:string }} opts
 * @returns {Promise<
 *   | { ok:true,  status:'pending', providerTransactionId:number }
 *   | { ok:false, uncertain:boolean, code:string, message:string }
 * >}
 */
async function initiatePayment({ reference, amount, currency, phone, provider }) {

  // ── Validation des entrées AVANT tout appel réseau ──────────────────────────
  // uncertain:false : la transaction n'a pas été transmise à MaishaPay.

  if (!isValidReference(reference)) {
    return {
      ok: false, uncertain: false, code: 'INVALID_INPUT',
      message: '[MaishaPay] Référence invalide. Format attendu : xera_<uuid-v4>.',
    };
  }
  if (!phone || !PHONE_REGEX.test(phone)) {
    return {
      ok: false, uncertain: false, code: 'INVALID_INPUT',
      message: '[MaishaPay] Numéro de téléphone invalide. Format attendu : +<indicatif><numéro> (8–15 chiffres).',
    };
  }
  if (!validateAmount(amount, currency)) {
    return {
      ok: false, uncertain: false, code: 'INVALID_INPUT',
      message: `[MaishaPay] Montant ou devise invalide pour l'API MaishaPay.`,
    };
  }
  if (!provider || !CONFIRMED_PROVIDER_CODES.has(provider)) {
    return {
      ok: false, uncertain: false, code: 'INVALID_INPUT',
      message: `[MaishaPay] Opérateur non supporté. Valeurs acceptées : ${[...CONFIRMED_PROVIDER_CODES].join(', ')}.`,
    };
  }

  const cfg = getConfig(
    'MAISHAPAY_PUBLIC_KEY',
    'MAISHAPAY_SECRET_KEY',
    'MAISHAPAY_GATEWAY_MODE',
    'MAISHAPAY_WEBHOOK_TOKEN',
    'APP_BASE_URL'
  );

  let formattedAmount;
  try {
    formattedAmount = formatAmount(amount, currency);
  } catch (fmtErr) {
    return { ok: false, uncertain: false, code: 'INVALID_INPUT', message: fmtErr.message };
  }

  const url = `${cfg.baseUrl}/collect/v2/store/mobileMoney`;
  // encodeURIComponent sur le jeton pour éviter tout caractère spécial dans l'URL de callback
  const callbackUrl = `${cfg.appBaseUrl}/api/maishapay/webhook?t=${encodeURIComponent(cfg.webhookToken)}`;

  // ATTENTION : payload contient les clés API → ne jamais l'inclure dans logs/erreurs
  const payload = {
    transactionReference: reference,
    gatewayMode:          cfg.gatewayMode,
    publicApiKey:         cfg.publicKey,
    secretApiKey:         cfg.secretKey,
    order:          { amount: formattedAmount, currency },
    paymentChannel: { channel: 'MOBILEMONEY', provider, walletID: phone, callbackUrl },
  };

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });

    // La lecture du corps est AUSSI couverte par le timer (AbortError propagé ici)
    const data = await res.json();

    // ── Succès documenté : HTTP 202 + transactionStatus «PENDING» ──────────
    if (res.status === 202 && data?.transactionStatus === 'PENDING') {
      console.info(
        `[MaishaPay] Paiement initié — ref=${reference} ` +
        `phone=${maskPhone(phone)} providerTxId=${truncate(data.transactionId)}`
      );
      return {
        ok:                    true,
        status:                'pending',
        providerTransactionId: data.transactionId,
      };
    }

    // ── Cas spécifique HTTP 429 Rate Limited — uncertain:false ─────────────
    if (res.status === 429) {
      return {
        ok: false, uncertain: false,
        code:    'RATE_LIMITED',
        message: `[MaishaPay] Limite de requêtes atteinte (HTTP 429) — ref=${reference}. Veuillez réessayer dans un instant.`,
      };
    }

    // ── Rejet explicite 4xx — déterministe, uncertain:false ─────────────────
    if (res.status >= 400 && res.status < 500) {
      return {
        ok: false, uncertain: false,
        code:    `HTTP_${res.status}`,
        message: `[MaishaPay] Rejet API : «${truncate(data?.transactionStatus ?? data?.message ?? 'inconnu')}» ` +
                 `(HTTP ${res.status}) — ref=${reference}.`,
      };
    }

    // ── Toute autre réponse inattendue (5xx, 3xx, 202 sans PENDING…) ────────
    // uncertain:true — NE JAMAIS marquer failed sur uncertain:true, passer par checkStatus
    return {
      ok: false, uncertain: true,
      code:    `HTTP_${res.status}`,
      message: `[MaishaPay] Réponse inattendue (HTTP ${res.status}) — ref=${reference}. ` +
               'État inconnu : vérifier via checkStatus avant toute décision.',
    };

  } catch (err) {

    if (err.name === 'AbortError') {
      // uncertain:true — NE JAMAIS marquer failed sur uncertain:true, passer par checkStatus
      return {
        ok: false, uncertain: true,
        code:    'TIMEOUT',
        message: `[MaishaPay] Délai dépassé (${REQUEST_TIMEOUT_MS / 1000}s) — ref=${reference}. ` +
                 'État inconnu : vérifier via checkStatus avant toute décision.',
      };
    }
    if (!res) {
      // Erreur réseau avant toute réponse
      // uncertain:true — NE JAMAIS marquer failed sur uncertain:true, passer par checkStatus
      return {
        ok: false, uncertain: true,
        code:    'NETWORK_ERROR',
        message: `[MaishaPay] Erreur réseau — ref=${reference}. ` +
                 'État inconnu : vérifier via checkStatus avant toute décision.',
      };
    }
    // res existe mais res.json() a échoué (corps invalide ou AbortError body)
    // uncertain:true — NE JAMAIS marquer failed sur uncertain:true, passer par checkStatus
    return {
      ok: false, uncertain: true,
      code:    err.name === 'AbortError' ? 'TIMEOUT' : 'INVALID_RESPONSE',
      message: err.name === 'AbortError'
        ? `[MaishaPay] Délai dépassé (${REQUEST_TIMEOUT_MS / 1000}s) — ref=${reference}. État inconnu : vérifier via checkStatus avant toute décision.`
        : `[MaishaPay] Réponse non-JSON (HTTP ${res.status}) — ref=${reference}. État inconnu : vérifier via checkStatus avant toute décision.`,
    };

  } finally {
    // clearTimeout dans le finally : garantit la libération du timer
    // quelle que soit la branche (succès, 4xx, 5xx, timeout, erreur réseau, JSON invalide)
    clearTimeout(timeoutId);
  }
}

/**
 * Vérifie le statut d'une transaction par référence marchand.
 *
 * Endpoint : POST {baseUrl}/transaction/rest/v2/check?useRef=1
 * Timeout  : 8 secondes — couvre fetch ET res.json(). clearTimeout dans le «finally».
 *
 * RÈGLE ABSOLUE : toute valeur de statut inconnue, HTTP non-ok + SUCCESS, réponse
 * invalide, référence différente ou erreur réseau → «pending» — JAMAIS «succeeded».
 *
 * @param {string} reference - Référence marchand (ex : «xera_<uuid>»)
 * @returns {Promise<{ status:'pending'|'succeeded'|'failed', confirmedAmount:string|null }>}
 *
 * confirmedAmount est INFORMATIF (data.order.cost.amount de MaishaPay).
 * Ne jamais l'utiliser pour créditer le wallet — toujours utiliser le montant XERA.
 */
async function checkStatus(reference) {
  const cfg = getConfig(
    'MAISHAPAY_PUBLIC_KEY',
    'MAISHAPAY_SECRET_KEY',
    'MAISHAPAY_GATEWAY_MODE'
  );

  const url = `${cfg.baseUrl}/transaction/rest/v2/check?useRef=1`;

  // ATTENTION : payload contient les clés API → ne jamais exposer
  const payload = {
    gatewayMode:   cfg.gatewayMode,
    publicApiKey:  cfg.publicKey,
    secretApiKey:  cfg.secretKey,
    transactionId: reference,
  };

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });

    // La lecture du corps est AUSSI couverte par le timer
    const data = await res.json();

    // ── Vérifier que la réponse concerne bien NOTRE référence ──────────────
    if (
      data?.originatingTransactionId !== undefined &&
      data.originatingTransactionId !== reference
    ) {
      console.warn(
        `[MaishaPay] checkStatus — référence différente ` +
        `«${truncate(data.originatingTransactionId)}» ≠ «${truncate(reference)}» → pending`
      );
      return { status: 'pending', confirmedAmount: null };
    }

    const raw = data?.transactionStatus;

    // confirmedAmount est INFORMATIF.
    // Ne jamais l'utiliser pour créditer le wallet — toujours utiliser le montant XERA.
    const confirmedAmount = data?.order?.cost?.amount ?? null;

    // ── «succeeded» UNIQUEMENT si res.ok ET raw === 'SUCCESS' ───────────────
    if (res.ok && raw === 'SUCCESS') return { status: 'succeeded', confirmedAmount };
    if (res.ok && raw === 'FAILED')  return { status: 'failed',    confirmedAmount: null };

    // Toute autre valeur → pending (jamais succeeded)
    console.warn(
      `[MaishaPay] checkStatus — statut inconnu «${truncate(raw)}» ` +
      `(HTTP ${res.status} res.ok=${res.ok}) — ref=${reference} → pending`
    );
    return { status: 'pending', confirmedAmount: null };

  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn(`[MaishaPay] checkStatus — timeout — ref=${reference} → pending`);
    } else {
      console.warn(`[MaishaPay] checkStatus — erreur réseau/parsing — ref=${reference} → pending`);
    }
    return { status: 'pending', confirmedAmount: null };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Valide et parse un webhook MaishaPay entrant.
 *
 * IMPORTANT : MaishaPay ne signe pas les webhooks (pas de HMAC documenté).
 * Authentification via token secret dans ?t= comparé en temps constant (timingSafeEqual).
 *
 * Le statut du body est NON FIABLE (pas signé) — on renvoie UNIQUEMENT la référence.
 * Le serveur DOIT appeler checkStatus() pour connaître le vrai statut.
 *
 * @param {object} body       - Corps JSON parsé du webhook
 * @param {string} queryToken - Valeur du ?t= dans l'URL de callback
 * @returns {{ valid:boolean, reference?:string|null }}
 */
function parseWebhook(body, queryToken) {
  // Rejeter immédiatement si queryToken n'est pas une string
  if (typeof queryToken !== 'string') {
    return { valid: false };
  }

  const cfg = getConfig('MAISHAPAY_WEBHOOK_TOKEN');

  let valid = false;
  try {
    const expected = Buffer.from(cfg.webhookToken, 'utf8');
    const received = Buffer.from(queryToken, 'utf8');
    // timingSafeEqual exige des buffers de même longueur —
    // la condition évite l'exception sans révéler la longueur attendue.
    if (expected.length > 0 && expected.length === received.length) {
      valid = timingSafeEqual(expected, received);
    }
  } catch {
    valid = false;
  }

  if (!valid) return { valid: false };

  const reference = body?.originatingTransactionId;
  if (!reference || typeof reference !== 'string' || reference.trim() === '') {
    return { valid: true, reference: null };
  }

  // NE PAS renvoyer body.transactionStatus — le body n'est pas signé (pas de HMAC).
  // Le serveur devra appeler checkStatus(reference) pour connaître le vrai statut.
  return { valid: true, reference: reference.trim() };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  initiatePayment,
  checkStatus,
  parseWebhook,
  normalizePhone,
  mapProvider,
  validateAmount,
  buildReference,
  formatAmount,
  isValidReference,
};
