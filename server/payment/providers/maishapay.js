'use strict';

/**
 * server/payment/providers/maishapay.js
 *
 * Module prestataire MaishaPay — ISOLÉ.
 * Branche : feat/maishapay-provider
 *
 * Ce fichier ne contient QUE la couche de communication avec l'API MaishaPay v2.0.
 * Il n'importe aucun fichier du projet existant, ne touche pas la base de données,
 * ne modifie aucune logique métier.
 *
 * Dépendances : Node.js >= 18 (fetch natif, AbortController, crypto.timingSafeEqual).
 * Aucune dépendance npm nouvelle.
 *
 * SÉCURITÉ :
 *  - Les clés d'API ne sont jamais loggées ni incluses dans les messages d'erreur.
 *  - Les numéros de téléphone sont masqués dans les logs (3 derniers chiffres seulement).
 *  - Le corps des requêtes sortantes n'est jamais exposé dans les erreurs.
 */

const { timingSafeEqual } = require('node:crypto');

// ─── Constantes ───────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL   = 'https://marchand.maishapay.online/api';
const REQUEST_TIMEOUT_MS = 8_000;

// ─── Config (lazy, validée à chaque appel) ───────────────────────────────────

/**
 * Lit et valide les variables d'environnement requises.
 * Lève une erreur claire si l'une d'elles est absente.
 * MAISHAPAY_BASE_URL est optionnelle (défaut : URL de prod MaishaPay).
 *
 * @returns {{ publicKey, secretKey, gatewayMode, webhookToken, baseUrl, appBaseUrl }}
 */
function getConfig() {
  const required = [
    'MAISHAPAY_PUBLIC_KEY',
    'MAISHAPAY_SECRET_KEY',
    'MAISHAPAY_GATEWAY_MODE',
    'MAISHAPAY_WEBHOOK_TOKEN',
    'APP_BASE_URL',
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(
        `[MaishaPay] Variable d'environnement obligatoire manquante : ${key}. ` +
        'Vérifiez votre fichier .env.'
      );
    }
  }

  return {
    publicKey:    process.env.MAISHAPAY_PUBLIC_KEY,
    secretKey:    process.env.MAISHAPAY_SECRET_KEY,
    gatewayMode:  process.env.MAISHAPAY_GATEWAY_MODE,
    webhookToken: process.env.MAISHAPAY_WEBHOOK_TOKEN,
    baseUrl:      process.env.MAISHAPAY_BASE_URL || DEFAULT_BASE_URL,
    appBaseUrl:   process.env.APP_BASE_URL,
  };
}

// ─── Utilitaires internes ────────────────────────────────────────────────────

/**
 * Masque un numéro de téléphone pour les logs.
 * Ne montre que les 3 derniers chiffres.
 * Ex : "+243974123456" → "***456"
 */
function maskPhone(phone) {
  if (!phone || typeof phone !== 'string' || phone.length <= 3) return '***';
  return '*'.repeat(phone.length - 3) + phone.slice(-3);
}

/**
 * Valide la partie locale d'un numéro (après l'indicatif).
 * RDC (+243) : exactement 9 chiffres.
 * Autres pays : 7 à 10 chiffres (heuristique conservative).
 */
function isValidLocal(local, countryCode) {
  if (!local || !/^\d+$/.test(local)) return false;
  if (countryCode === '+243') return local.length === 9;
  return local.length >= 7 && local.length <= 10;
}

// ─── Utilitaires exportés ────────────────────────────────────────────────────

/**
 * Normalise un numéro de téléphone au format international.
 *
 * Formats acceptés (exemple RDC, countryCode="+243") :
 *   "0974123456"       → "+243974123456"
 *   "974123456"        → "+243974123456"
 *   "+243974123456"    → "+243974123456"
 *   "00243974123456"   → "+243974123456"
 *   " +243 974-123-456" → "+243974123456"
 *
 * @param {string} input
 * @param {string} [countryCode="+243"]
 * @returns {string|null} Numéro normalisé ou null si invalide
 */
function normalizePhone(input, countryCode = '+243') {
  if (!input || typeof input !== 'string') return null;

  // Supprime espaces et tirets
  const digits   = input.replace(/[\s\-]/g, '');
  const ccDigits = countryCode.slice(1); // ex: "243"

  // Cas 1 : déjà au format international "+243..."
  if (digits.startsWith(countryCode)) {
    const local = digits.slice(countryCode.length);
    return isValidLocal(local, countryCode) ? digits : null;
  }

  // Cas 2 : format "00243..."
  if (digits.startsWith('00' + ccDigits)) {
    const local = digits.slice(2 + ccDigits.length);
    return isValidLocal(local, countryCode) ? countryCode + local : null;
  }

  // Cas 3 : indicatif sans + ni 00 en tête ("243974...")
  // Attention : ne pas confondre avec un numéro local commençant par les mêmes chiffres.
  // On n'applique ce cas que si le résultat donne exactement le bon nombre de chiffres.
  if (!digits.startsWith('0') && digits.startsWith(ccDigits)) {
    const local = digits.slice(ccDigits.length);
    if (isValidLocal(local, countryCode)) return countryCode + local;
    // Sinon tomber dans le cas 5 (numéro local pur)
  }

  // Cas 4 : numéro local avec 0 en tête ("0974...")
  if (digits.startsWith('0')) {
    const local = digits.slice(1);
    return isValidLocal(local, countryCode) ? countryCode + local : null;
  }

  // Cas 5 : numéro local sans 0 ("974...")
  if (isValidLocal(digits, countryCode)) {
    return countryCode + digits;
  }

  return null;
}

/**
 * Convertit un slug opérateur interne XERA vers le code MaishaPay.
 *
 * Sources confirmées : documentation Postman MaishaPay v2.0 (endpoint /collect/v2/store/mobileMoney).
 *
 * Les opérateurs marqués "À CONFIRMER" ne figurent pas explicitement dans la doc
 * avec ce code exact → renvoie null pour éviter d'envoyer un code invalide à l'API.
 *
 * @param {string} slug - Slug opérateur interne XERA
 * @returns {string|null} Code MaishaPay ou null si non supporté / À CONFIRMER
 */
function mapProvider(slug) {
  // ── Codes CONFIRMÉS par la doc Postman v2.0 ──────────────────────────────
  const CONFIRMED = {
    airtel_money: 'AIRTEL', // confirmé doc v2.0 — DRC, Congo Brazza
    orange_money: 'ORANGE', // confirmé doc v2.0 — DRC, Cameroun, Sénégal, CI
    mpesa:        'MPESA',  // confirmé doc v1.0 + v2.0 — DRC uniquement
    mtn:          'MTN',    // confirmé doc v2.0 — Cameroun, Congo Brazza, CI
  };

  if (slug in CONFIRMED) return CONFIRMED[slug];

  // ── Codes À CONFIRMER — absents ou ambigus dans la doc Postman ───────────
  // Ne pas deviner → null. Contacter MaishaPay pour confirmer les codes exacts.
  //   afrimoney  : absent de la doc Postman v2.0
  //   free_money : Sénégal — mentionné "Free" dans la doc mais code API non précisé
  //   wave       : Sénégal/CI — mentionné mais code exact non précisé
  //   wizall     : Sénégal — mentionné mais code exact non précisé
  //   moov       : Bénin/BF/Togo/Mali — mentionné mais code exact non précisé
  //   t_money    : Togo — mentionné mais code exact non précisé
  //   expresso   : Sénégal — mentionné mais code exact non précisé

  return null; // opérateur inconnu ou À CONFIRMER
}

/**
 * Valide qu'un montant respecte les minimums documentés par MaishaPay.
 *
 * Règles (source : doc Postman MaishaPay v2.0) :
 *   CDF, XAF, XOF : montant strictement > 100
 *   USD, EUR       : montant strictement > 0.5
 *
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

  // Devise non reconnue dans la doc → rejet par précaution
  return false;
}

/**
 * Construit la référence marchand à partir de l'UUID interne XERA.
 * Format : "xera_<uuid>"
 *
 * @param {string} transactionId - UUID XERA (depuis la table transactions)
 * @returns {string}
 */
function buildReference(transactionId) {
  return `xera_${transactionId}`;
}

// ─── API MaishaPay ───────────────────────────────────────────────────────────

/**
 * Initie un paiement Mobile Money via MaishaPay API v2.0.
 *
 * Endpoint : POST {baseUrl}/collect/v2/store/mobileMoney
 * Timeout  : 8 secondes (AbortController)
 *
 * SÉCURITÉ : le corps de la requête (qui contient les clés) n'est JAMAIS
 * inclus dans les messages d'erreur ou les logs.
 *
 * @param {{ reference: string, amount: number|string, currency: string, phone: string, provider: string }} opts
 * @returns {Promise<
 *   | { ok: true,  status: 'pending', providerTransactionId: number }
 *   | { ok: false, code: string, message: string }
 * >}
 */
async function initiatePayment({ reference, amount, currency, phone, provider }) {
  const cfg = getConfig();

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const url         = `${cfg.baseUrl}/collect/v2/store/mobileMoney`;
  const callbackUrl = `${cfg.appBaseUrl}/api/maishapay/webhook?t=${cfg.webhookToken}`;

  // ATTENTION : payload contient les clés API → ne jamais l'inclure dans logs/erreurs
  const payload = {
    transactionReference: reference,
    gatewayMode:          cfg.gatewayMode,
    publicApiKey:         cfg.publicKey,
    secretApiKey:         cfg.secretKey,
    order: {
      amount:   String(amount),
      currency,
    },
    paymentChannel: {
      channel:     'MOBILEMONEY',
      provider,
      walletID:    phone,
      callbackUrl,
    },
  };

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });

    clearTimeout(timeoutId);

    let data;
    try {
      data = await res.json();
    } catch {
      return {
        ok:      false,
        code:    'INVALID_RESPONSE',
        message: `[MaishaPay] Réponse non-JSON reçue (HTTP ${res.status}) — ref=${reference}`,
      };
    }

    // Succès documenté : HTTP 202 + transactionStatus "PENDING"
    if (res.status === 202 && data?.transactionStatus === 'PENDING') {
      console.info(
        `[MaishaPay] Paiement initié — ref=${reference} ` +
        `phone=${maskPhone(phone)} providerTxId=${data.transactionId}`
      );
      return {
        ok:                    true,
        status:                'pending',
        providerTransactionId: data.transactionId,
      };
    }

    // Réponse inattendue (ni 202/PENDING)
    return {
      ok:      false,
      code:    `HTTP_${res.status}`,
      message: `[MaishaPay] Statut inattendu : "${data?.transactionStatus ?? 'inconnu'}" ` +
               `(HTTP ${res.status}) — ref=${reference}`,
    };

  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      return {
        ok:      false,
        code:    'TIMEOUT',
        message: `[MaishaPay] Délai dépassé (${REQUEST_TIMEOUT_MS / 1000}s) — ref=${reference}`,
      };
    }

    // Erreur réseau — PAS de payload dans le message (il contient les clés)
    return {
      ok:      false,
      code:    'NETWORK_ERROR',
      message: `[MaishaPay] Erreur réseau — ref=${reference} : ${err.message}`,
    };
  }
}

/**
 * Vérifie le statut d'une transaction par référence marchand.
 *
 * Endpoint : POST {baseUrl}/transaction/rest/v2/check?useRef=1
 *
 * RÈGLE ABSOLUE : toute valeur de statut inconnue, réponse invalide
 * ou erreur réseau retourne "pending" — JAMAIS "succeeded".
 *
 * @param {string} reference - Référence marchand (ex : "xera_<uuid>")
 * @returns {Promise<{ status: 'pending'|'succeeded'|'failed' }>}
 */
async function checkStatus(reference) {
  const cfg = getConfig();

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const url = `${cfg.baseUrl}/transaction/rest/v2/check?useRef=1`;

  // ATTENTION : payload contient les clés API → ne jamais exposer
  const payload = {
    gatewayMode:   cfg.gatewayMode,
    publicApiKey:  cfg.publicKey,
    secretApiKey:  cfg.secretKey,
    transactionId: reference,
  };

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });

    clearTimeout(timeoutId);

    let data;
    try {
      data = await res.json();
    } catch {
      console.warn(
        `[MaishaPay] checkStatus — réponse non-JSON (HTTP ${res.status}) ` +
        `— ref=${reference} → pending`
      );
      return { status: 'pending' };
    }

    const raw = data?.transactionStatus;

    if (raw === 'SUCCESS') return { status: 'succeeded' };
    if (raw === 'FAILED')  return { status: 'failed' };

    // Toute valeur inconnue/absente → pending (jamais succeeded par défaut)
    console.warn(
      `[MaishaPay] checkStatus — statut inconnu "${raw}" — ref=${reference} → pending`
    );
    return { status: 'pending' };

  } catch (err) {
    clearTimeout(timeoutId);
    // Erreur réseau ou timeout → pending (jamais succeeded)
    console.warn(
      `[MaishaPay] checkStatus — erreur réseau/timeout — ref=${reference} → pending`
    );
    return { status: 'pending' };
  }
}

/**
 * Valide et parse un webhook MaishaPay entrant.
 *
 * IMPORTANT : MaishaPay ne signe pas les webhooks (pas de HMAC documenté).
 * L'authentification repose sur un token secret passé dans ?t= de l'URL de callback,
 * comparé en temps constant via crypto.timingSafeEqual pour éviter les timing attacks.
 *
 * Le statut contenu dans le body du webhook est NON FIABLE car le body n'est pas signé.
 * → On renvoie UNIQUEMENT la référence (originatingTransactionId).
 * → Le serveur DOIT appeler checkStatus() pour connaître le vrai statut avant tout crédit.
 *
 * @param {object} body       - Corps JSON parsé du webhook
 * @param {string} queryToken - Valeur du paramètre ?t= reçu dans l'URL
 * @returns {{ valid: boolean, reference?: string|null }}
 */
function parseWebhook(body, queryToken) {
  const cfg = getConfig();

  let valid = false;
  try {
    const expected = Buffer.from(cfg.webhookToken, 'utf8');
    const received = Buffer.from(queryToken || '', 'utf8');
    // timingSafeEqual exige des buffers de même longueur
    if (expected.length > 0 && expected.length === received.length) {
      valid = timingSafeEqual(expected, received);
    }
  } catch {
    valid = false;
  }

  if (!valid) {
    return { valid: false };
  }

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
};
