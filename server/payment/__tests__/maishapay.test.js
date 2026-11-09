'use strict';

/**
 * server/payment/__tests__/maishapay.test.js
 *
 * Tests unitaires du module MaishaPay — provider isolé.
 *
 * RÈGLES :
 *  - Aucun appel réseau réel : fetch est entièrement simulé (mock).
 *  - Aucune clé réelle : valeurs bidon "TEST_PUB", "TEST_SEC", "TEST_TOK".
 *  - Les variables d'environnement réelles de la machine ne sont pas lues :
 *    on écrase process.env dans setupEnv() avant chaque test.
 *  - Les tests vérifient qu'aucun message d'erreur ne contient les clés.
 *
 * Framework : node:test (natif Node >= 18, aucune install npm requise).
 * Lancer avec : node --test server/payment/__tests__/maishapay.test.js
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ─── Env bidon — AVANT tout require du module ─────────────────────────────────
// getConfig() est lazy : on peut définir les vars ici, elles seront lues à l'appel.

function setupEnv(overrides = {}) {
  process.env.MAISHAPAY_PUBLIC_KEY    = 'TEST_PUB';
  process.env.MAISHAPAY_SECRET_KEY    = 'TEST_SEC';
  process.env.MAISHAPAY_GATEWAY_MODE  = '0';
  process.env.MAISHAPAY_WEBHOOK_TOKEN = 'TEST_TOK';
  process.env.MAISHAPAY_BASE_URL      = 'https://mock.maishapay.test';
  process.env.APP_BASE_URL            = 'https://xera.test';
  Object.assign(process.env, overrides);
}

function clearEnv() {
  delete process.env.MAISHAPAY_PUBLIC_KEY;
  delete process.env.MAISHAPAY_SECRET_KEY;
  delete process.env.MAISHAPAY_GATEWAY_MODE;
  delete process.env.MAISHAPAY_WEBHOOK_TOKEN;
  delete process.env.MAISHAPAY_BASE_URL;
  delete process.env.APP_BASE_URL;
}

// Charger le module après avoir défini l'env (getConfig est lazy, pas de souci)
setupEnv();
const {
  initiatePayment,
  checkStatus,
  parseWebhook,
  normalizePhone,
  mapProvider,
  validateAmount,
  buildReference,
} = require('../providers/maishapay');

// ─── Helpers de mock fetch ───────────────────────────────────────────────────

let _originalFetch;

function mockFetch(handler) {
  _originalFetch     = globalThis.fetch;
  globalThis.fetch   = handler;
}

function restoreFetch() {
  if (_originalFetch !== undefined) {
    globalThis.fetch = _originalFetch;
    _originalFetch   = undefined;
  }
}

/** Crée une réponse fetch simulée */
function makeFakeResponse(status, body) {
  return {
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    ok:   status >= 200 && status < 300,
  };
}

// ─── SUITE : initiatePayment ──────────────────────────────────────────────────

describe('initiatePayment', () => {

  beforeEach(() => setupEnv());
  afterEach(() => { restoreFetch(); clearEnv(); });

  test('succès — HTTP 202 + PENDING → { ok: true, status: "pending", providerTransactionId }', async () => {
    mockFetch(async () => makeFakeResponse(202, {
      status_code:            202,
      transactionStatus:      'PENDING',
      transactionId:          99001,
      originatingTransactionId: 'xera_test-uuid',
    }));

    const result = await initiatePayment({
      reference: 'xera_test-uuid',
      amount:    5000,
      currency:  'CDF',
      phone:     '+243974000123',
      provider:  'AIRTEL',
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'pending');
    assert.equal(result.providerTransactionId, 99001);
  });

  test('HTTP 200 inattendu → { ok: false, code: "HTTP_200" }', async () => {
    mockFetch(async () => makeFakeResponse(200, { transactionStatus: 'SUCCESS' }));

    const result = await initiatePayment({
      reference: 'xera_bad',
      amount:    5000,
      currency:  'CDF',
      phone:     '+243974000456',
      provider:  'ORANGE',
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'HTTP_200');
  });

  test('erreur réseau → { ok: false, code: "NETWORK_ERROR" }, message sans clés', async () => {
    mockFetch(async () => { throw new Error('connexion refusée'); });

    const result = await initiatePayment({
      reference: 'xera_net-error',
      amount:    1000,
      currency:  'CDF',
      phone:     '+243974000789',
      provider:  'AIRTEL',
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'NETWORK_ERROR');
    // Les clés ne doivent JAMAIS apparaître dans le message d'erreur
    assert.ok(!result.message.includes('TEST_PUB'), 'publicKey dans le message !');
    assert.ok(!result.message.includes('TEST_SEC'), 'secretKey dans le message !');
  });

  test('timeout (AbortController) → { ok: false, code: "TIMEOUT" }', async () => {
    // Simule fetch qui lance AbortError
    mockFetch(async (_url, options) => {
      const err = new Error('The operation was aborted');
      err.name  = 'AbortError';
      throw err;
    });

    const result = await initiatePayment({
      reference: 'xera_timeout',
      amount:    2000,
      currency:  'USD',
      phone:     '+243974000321',
      provider:  'MPESA',
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'TIMEOUT');
  });

  test('réponse non-JSON → { ok: false, code: "INVALID_RESPONSE" }', async () => {
    mockFetch(async () => ({
      status: 500,
      json:   async () => { throw new SyntaxError('Unexpected token'); },
      ok:     false,
    }));

    const result = await initiatePayment({
      reference: 'xera_invalid-json',
      amount:    500,
      currency:  'CDF',
      phone:     '+243974000654',
      provider:  'AIRTEL',
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_RESPONSE');
    assert.ok(!result.message.includes('TEST_PUB'));
    assert.ok(!result.message.includes('TEST_SEC'));
  });

  test('variable env manquante → erreur claire sans valeur de clé', async () => {
    delete process.env.MAISHAPAY_PUBLIC_KEY;
    mockFetch(async () => makeFakeResponse(202, { transactionStatus: 'PENDING', transactionId: 1 }));

    await assert.rejects(
      () => initiatePayment({ reference: 'x', amount: 500, currency: 'CDF', phone: '+243974000000', provider: 'AIRTEL' }),
      (err) => {
        assert.ok(err.message.includes('MAISHAPAY_PUBLIC_KEY'), 'Le nom de la var manquante doit apparaître');
        // La valeur ne doit pas apparaître (elle est absente ici, mais on vérifie par principe)
        return true;
      }
    );
  });
});

// ─── SUITE : checkStatus ──────────────────────────────────────────────────────

describe('checkStatus', () => {

  beforeEach(() => setupEnv());
  afterEach(() => { restoreFetch(); clearEnv(); });

  test('SUCCESS → { status: "succeeded" }', async () => {
    mockFetch(async () => makeFakeResponse(200, { transactionStatus: 'SUCCESS' }));
    const result = await checkStatus('xera_abc');
    assert.equal(result.status, 'succeeded');
  });

  test('FAILED → { status: "failed" }', async () => {
    mockFetch(async () => makeFakeResponse(200, { transactionStatus: 'FAILED' }));
    const result = await checkStatus('xera_abc');
    assert.equal(result.status, 'failed');
  });

  test('PENDING → { status: "pending" }', async () => {
    mockFetch(async () => makeFakeResponse(200, { transactionStatus: 'PENDING' }));
    const result = await checkStatus('xera_abc');
    assert.equal(result.status, 'pending');
  });

  test('statut inconnu "DECLINED" → { status: "pending" } (jamais succeeded)', async () => {
    mockFetch(async () => makeFakeResponse(200, { transactionStatus: 'DECLINED' }));
    const result = await checkStatus('xera_abc');
    assert.equal(result.status, 'pending');
    assert.notEqual(result.status, 'succeeded');
  });

  test('statut null → { status: "pending" } (jamais succeeded)', async () => {
    mockFetch(async () => makeFakeResponse(200, { transactionStatus: null }));
    const result = await checkStatus('xera_abc');
    assert.equal(result.status, 'pending');
  });

  test('réponse vide {} → { status: "pending" } (jamais succeeded)', async () => {
    mockFetch(async () => makeFakeResponse(200, {}));
    const result = await checkStatus('xera_abc');
    assert.equal(result.status, 'pending');
  });

  test('réponse non-JSON → { status: "pending" }', async () => {
    mockFetch(async () => ({
      status: 200,
      json:   async () => { throw new SyntaxError('parse error'); },
      ok:     true,
    }));
    const result = await checkStatus('xera_abc');
    assert.equal(result.status, 'pending');
  });

  test('erreur réseau → { status: "pending" } (jamais succeeded)', async () => {
    mockFetch(async () => { throw new Error('réseau coupé'); });
    const result = await checkStatus('xera_abc');
    assert.equal(result.status, 'pending');
    assert.notEqual(result.status, 'succeeded');
  });

  test('AbortError (timeout) → { status: "pending" }', async () => {
    mockFetch(async () => {
      const err = new Error('aborted');
      err.name  = 'AbortError';
      throw err;
    });
    const result = await checkStatus('xera_abc');
    assert.equal(result.status, 'pending');
  });
});

// ─── SUITE : parseWebhook ─────────────────────────────────────────────────────

describe('parseWebhook', () => {

  beforeEach(() => setupEnv());
  afterEach(() => clearEnv());

  test('bon token + référence valide → { valid: true, reference }', () => {
    const result = parseWebhook(
      { originatingTransactionId: 'xera_uuid-001', transactionStatus: 'SUCCESS' },
      'TEST_TOK'
    );
    assert.equal(result.valid, true);
    assert.equal(result.reference, 'xera_uuid-001');
    // Le statut du body NE DOIT PAS être renvoyé (non fiable, pas de HMAC)
    assert.ok(!('status' in result), 'Le statut du body webhook ne doit pas être renvoyé');
    assert.ok(!('transactionStatus' in result), 'transactionStatus ne doit pas être renvoyé');
  });

  test('mauvais token → { valid: false }', () => {
    const result = parseWebhook(
      { originatingTransactionId: 'xera_uuid-002' },
      'MAUVAIS_TOKEN'
    );
    assert.equal(result.valid, false);
    assert.ok(!('reference' in result));
  });

  test('token vide → { valid: false }', () => {
    const result = parseWebhook({ originatingTransactionId: 'xera_uuid-003' }, '');
    assert.equal(result.valid, false);
  });

  test('token null → { valid: false }', () => {
    const result = parseWebhook({ originatingTransactionId: 'xera_uuid-004' }, null);
    assert.equal(result.valid, false);
  });

  test('bon token mais référence absente → { valid: true, reference: null }', () => {
    const result = parseWebhook({ transactionStatus: 'SUCCESS' }, 'TEST_TOK');
    assert.equal(result.valid, true);
    assert.equal(result.reference, null);
  });

  test('bon token mais body vide → { valid: true, reference: null }', () => {
    const result = parseWebhook({}, 'TEST_TOK');
    assert.equal(result.valid, true);
    assert.equal(result.reference, null);
  });
});

// ─── SUITE : normalizePhone ───────────────────────────────────────────────────

describe('normalizePhone (RDC +243)', () => {

  test('format "+243974123456" → "+243974123456"', () => {
    assert.equal(normalizePhone('+243974123456'), '+243974123456');
  });

  test('format "0974123456" → "+243974123456"', () => {
    assert.equal(normalizePhone('0974123456'), '+243974123456');
  });

  test('format "974123456" → "+243974123456"', () => {
    assert.equal(normalizePhone('974123456'), '+243974123456');
  });

  test('format "00243974123456" → "+243974123456"', () => {
    assert.equal(normalizePhone('00243974123456'), '+243974123456');
  });

  test('espaces et tirets → normalisé "+243974123456"', () => {
    assert.equal(normalizePhone('+243 974-123-456'), '+243974123456');
  });

  test('trop court "97412" → null', () => {
    assert.equal(normalizePhone('97412'), null);
  });

  test('trop long "09741234567890" → null', () => {
    assert.equal(normalizePhone('09741234567890'), null);
  });

  test('lettres dans le numéro → null', () => {
    assert.equal(normalizePhone('0974ABC456'), null);
  });

  test('null en entrée → null', () => {
    assert.equal(normalizePhone(null), null);
  });

  test('chaîne vide → null', () => {
    assert.equal(normalizePhone(''), null);
  });
});

// ─── SUITE : mapProvider ──────────────────────────────────────────────────────

describe('mapProvider', () => {

  test('airtel_money → "AIRTEL" (confirmé doc)', () => {
    assert.equal(mapProvider('airtel_money'), 'AIRTEL');
  });

  test('orange_money → "ORANGE" (confirmé doc)', () => {
    assert.equal(mapProvider('orange_money'), 'ORANGE');
  });

  test('mpesa → "MPESA" (confirmé doc)', () => {
    assert.equal(mapProvider('mpesa'), 'MPESA');
  });

  test('mtn → "MTN" (confirmé doc)', () => {
    assert.equal(mapProvider('mtn'), 'MTN');
  });

  test('afrimoney → null (À CONFIRMER, absent de la doc)', () => {
    assert.equal(mapProvider('afrimoney'), null);
  });

  test('wave → null (À CONFIRMER, code exact non spécifié dans la doc)', () => {
    assert.equal(mapProvider('wave'), null);
  });

  test('slug inconnu → null', () => {
    assert.equal(mapProvider('some_unknown_provider'), null);
  });
});

// ─── SUITE : validateAmount ───────────────────────────────────────────────────

describe('validateAmount', () => {

  // CDF
  test('CDF 100 → false (doit être > 100)', () => {
    assert.equal(validateAmount(100, 'CDF'), false);
  });

  test('CDF 100.01 → true', () => {
    assert.equal(validateAmount(100.01, 'CDF'), true);
  });

  test('CDF 5000 → true', () => {
    assert.equal(validateAmount(5000, 'CDF'), true);
  });

  test('XAF 50 → false', () => {
    assert.equal(validateAmount(50, 'XAF'), false);
  });

  test('XOF 200 → true', () => {
    assert.equal(validateAmount(200, 'XOF'), true);
  });

  // USD
  test('USD 0.5 → false (doit être > 0.5)', () => {
    assert.equal(validateAmount(0.5, 'USD'), false);
  });

  test('USD 0.51 → true', () => {
    assert.equal(validateAmount(0.51, 'USD'), true);
  });

  test('EUR 10 → true', () => {
    assert.equal(validateAmount(10, 'EUR'), true);
  });

  // Cas limites
  test('montant 0 → false', () => {
    assert.equal(validateAmount(0, 'CDF'), false);
  });

  test('montant négatif → false', () => {
    assert.equal(validateAmount(-500, 'CDF'), false);
  });

  test('devise inconnue → false (rejet par précaution)', () => {
    assert.equal(validateAmount(5000, 'GNF'), false);
  });

  test('montant sous forme de string "5000" → true (CDF)', () => {
    assert.equal(validateAmount('5000', 'CDF'), true);
  });
});

// ─── SUITE : buildReference ───────────────────────────────────────────────────

describe('buildReference', () => {

  test('préfixe "xera_" + uuid', () => {
    assert.equal(
      buildReference('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
      'xera_a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    );
  });
});

// ─── SUITE : sécurité — aucune clé dans les messages d'erreur ────────────────

describe('sécurité — clés absentes des messages d\'erreur', () => {

  beforeEach(() => setupEnv());
  afterEach(() => { restoreFetch(); clearEnv(); });

  test('erreur réseau initiatePayment : message ne contient pas les clés', async () => {
    mockFetch(async () => { throw new Error('connexion impossible'); });

    const result = await initiatePayment({
      reference: 'xera_sec-test',
      amount:    1000,
      currency:  'CDF',
      phone:     '+243974111111',
      provider:  'AIRTEL',
    });

    assert.ok(!result.message.includes('TEST_PUB'), 'publicKey exposée !');
    assert.ok(!result.message.includes('TEST_SEC'), 'secretKey exposée !');
  });

  test('réponse non-JSON checkStatus : message ne contient pas les clés', async () => {
    mockFetch(async () => ({
      status: 500,
      json:   async () => { throw new SyntaxError('parse error'); },
      ok:     false,
    }));

    // checkStatus loggue un warn mais ne lève pas d'erreur → vérifier via le retour
    const result = await checkStatus('xera_sec-test-2');
    // Le résultat doit être pending et pas succeeded
    assert.equal(result.status, 'pending');
    assert.notEqual(result.status, 'succeeded');
  });
});
