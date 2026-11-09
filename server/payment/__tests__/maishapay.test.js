'use strict';
// server/payment/__tests__/maishapay.test.js
// Tests unitaires — aucun appel réseau réel, aucune clé réelle.
// node --test server/payment/__tests__/maishapay.test.js

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ─── Env bidon ───────────────────────────────────────────────────────────────
// Clés sandbox avec préfixes corrects (MP-SBPK-/MP-SBSK-), mode 0.

function setupEnv(ov = {}) {
  process.env.MAISHAPAY_PUBLIC_KEY    = 'MP-SBPK-TEST';
  process.env.MAISHAPAY_SECRET_KEY    = 'MP-SBSK-TEST';
  process.env.MAISHAPAY_GATEWAY_MODE  = '0';
  process.env.MAISHAPAY_WEBHOOK_TOKEN = 'TEST_TOK';
  process.env.MAISHAPAY_BASE_URL      = 'https://mock.maishapay.test';
  process.env.APP_BASE_URL            = 'https://xera.test';
  Object.assign(process.env, ov);
}
function clearEnv() {
  for (const k of ['MAISHAPAY_PUBLIC_KEY','MAISHAPAY_SECRET_KEY','MAISHAPAY_GATEWAY_MODE',
                   'MAISHAPAY_WEBHOOK_TOKEN','MAISHAPAY_BASE_URL','APP_BASE_URL'])
    delete process.env[k];
}

setupEnv(); // getConfig() est lazy : on peut définir avant le premier appel de fonction
const {
  initiatePayment, checkStatus, parseWebhook,
  normalizePhone, mapProvider, validateAmount, buildReference,
  formatAmount, isValidReference,
} = require('../providers/maishapay');

// ─── Helpers mock fetch ──────────────────────────────────────────────────────

let _orig;
function mockFetch(h) { _orig = globalThis.fetch; globalThis.fetch = h; }
function restoreFetch() { if (_orig !== undefined) { globalThis.fetch = _orig; _orig = undefined; } }

function fakeRes(status, body, opts = {}) {
  const isOk = opts.ok !== undefined ? opts.ok : (status >= 200 && status < 300);
  return { status, ok: isOk, json: async () => body };
}

const VREF   = 'xera_a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VPHONE = '+243974000123';


// ─── isValidReference ────────────────────────────────────────────────────────

describe('isValidReference', () => {
  test('UUID valide → true', () => {
    assert.equal(isValidReference('xera_a1b2c3d4-e5f6-7890-abcd-ef1234567890'), true);
  });
  test('sans préfixe xera_ → false', () => {
    assert.equal(isValidReference('a1b2c3d4-e5f6-7890-abcd-ef1234567890'), false);
  });
  test('trop court → false', () => {
    assert.equal(isValidReference('xera_abc'), false);
  });
  test('null → false', () => {
    assert.equal(isValidReference(null), false);
  });
  test('nombre → false', () => {
    assert.equal(isValidReference(42), false);
  });
  test('xera_ + 36 chiffres corrects → true', () => {
    assert.equal(isValidReference('xera_12345678-1234-1234-1234-123456789012'), true);
  });
  test('UUID avec tirets mal placés → false', () => {
    assert.equal(isValidReference('xera_123456781234-1234-1234-123456789012-'), false);
  });
  test('UUID avec caractères non hexadécimaux → false', () => {
    assert.equal(isValidReference('xera_g1b2c3d4-e5f6-7890-abcd-ef1234567890'), false);
  });
});

// ─── formatAmount ─────────────────────────────────────────────────────────────

describe('formatAmount', () => {
  test('CDF 5000.7 → "5001" (Math.round)', () => {
    assert.equal(formatAmount(5000.7, 'CDF'), '5001');
  });
  test('CDF 5000.4 → "5000"', () => {
    assert.equal(formatAmount(5000.4, 'CDF'), '5000');
  });
  test('XAF 200 → "200"', () => {
    assert.equal(formatAmount(200, 'XAF'), '200');
  });
  test('XOF 150 → "150"', () => {
    assert.equal(formatAmount(150, 'XOF'), '150');
  });
  test('USD 10.5 → "10.50" (2 décimales)', () => {
    assert.equal(formatAmount(10.5, 'USD'), '10.50');
  });
  test('EUR 1 → "1.00"', () => {
    assert.equal(formatAmount(1, 'EUR'), '1.00');
  });
  test('montant string "5000" → "5000" (CDF)', () => {
    assert.equal(formatAmount('5000', 'CDF'), '5000');
  });
  test('NaN → exception', () => {
    assert.throws(() => formatAmount(NaN, 'CDF'), /montant invalide/);
  });
  test('Infinity → exception', () => {
    assert.throws(() => formatAmount(Infinity, 'CDF'), /montant invalide/);
  });
  test('0 → exception', () => {
    assert.throws(() => formatAmount(0, 'CDF'), /montant invalide/);
  });
  test('négatif → exception', () => {
    assert.throws(() => formatAmount(-100, 'CDF'), /montant invalide/);
  });
  test('devise inconnue GNF → exception', () => {
    assert.throws(() => formatAmount(500, 'GNF'), /devise non reconnue/);
  });
});


// ─── initiatePayment — INVALID_INPUT (sans appel réseau) ─────────────────────

describe('initiatePayment — INVALID_INPUT', () => {

  beforeEach(() => setupEnv());
  afterEach(() => clearEnv());

  test('référence invalide → {ok:false, uncertain:false, code:INVALID_INPUT}', async () => {
    const r = await initiatePayment({ reference: 'mauvaise-ref', amount: 500, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(r.ok, false);
    assert.equal(r.uncertain, false);
    assert.equal(r.code, 'INVALID_INPUT');
    assert.match(r.message, /[Rr][ée]f[ée]rence/);
  });

  test('téléphone sans + → INVALID_INPUT', async () => {
    const r = await initiatePayment({ reference: VREF, amount: 500, currency: 'CDF', phone: '0974000123', provider: 'AIRTEL' });
    assert.equal(r.ok, false);
    assert.equal(r.uncertain, false);
    assert.equal(r.code, 'INVALID_INPUT');
  });

  test('téléphone trop court → INVALID_INPUT', async () => {
    const r = await initiatePayment({ reference: VREF, amount: 500, currency: 'CDF', phone: '+2431234', provider: 'AIRTEL' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'INVALID_INPUT');
  });

  test('montant sous minimum CDF → INVALID_INPUT', async () => {
    const r = await initiatePayment({ reference: VREF, amount: 50, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(r.ok, false);
    assert.equal(r.uncertain, false);
    assert.equal(r.code, 'INVALID_INPUT');
  });

  test('devise inconnue → INVALID_INPUT', async () => {
    const r = await initiatePayment({ reference: VREF, amount: 500, currency: 'GNF', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'INVALID_INPUT');
  });

  test('provider null → INVALID_INPUT', async () => {
    const r = await initiatePayment({ reference: VREF, amount: 500, currency: 'CDF', phone: VPHONE, provider: null });
    assert.equal(r.ok, false);
    assert.equal(r.uncertain, false);
    assert.equal(r.code, 'INVALID_INPUT');
  });

  test('provider À CONFIRMER "afrimoney" → INVALID_INPUT', async () => {
    const r = await initiatePayment({ reference: VREF, amount: 500, currency: 'CDF', phone: VPHONE, provider: 'afrimoney' });
    assert.equal(r.ok, false);
    assert.equal(r.uncertain, false);
    assert.equal(r.code, 'INVALID_INPUT');
  });

  test('provider slug XERA "airtel_money" (pas le code MaishaPay) → INVALID_INPUT', async () => {
    const r = await initiatePayment({ reference: VREF, amount: 500, currency: 'CDF', phone: VPHONE, provider: 'airtel_money' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'INVALID_INPUT');
  });

  test('INVALID_INPUT ne fait aucun appel réseau', async () => {
    let called = false;
    mockFetch(async () => { called = true; return fakeRes(202, {}); });
    await initiatePayment({ reference: 'BAD', amount: 500, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(called, false, 'fetch appelé malgré INVALID_INPUT !');
    restoreFetch();
  });
});


// ─── initiatePayment — appels réseau ─────────────────────────────────────────

describe('initiatePayment — appels réseau', () => {

  beforeEach(() => setupEnv());
  afterEach(() => { restoreFetch(); clearEnv(); });

  test('succès 202 PENDING → {ok:true, status:"pending", providerTransactionId}', async () => {
    mockFetch(async () => fakeRes(202, { transactionStatus: 'PENDING', transactionId: 99001 }));
    const r = await initiatePayment({ reference: VREF, amount: 5000, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(r.ok, true);
    assert.equal(r.status, 'pending');
    assert.equal(r.providerTransactionId, 99001);
    assert.ok(!('uncertain' in r));
  });

  test('HTTP 429 → {ok:false, uncertain:false, code:RATE_LIMITED}', async () => {
    mockFetch(async () => fakeRes(429, { message: 'Too Many Requests' }));
    const r = await initiatePayment({ reference: VREF, amount: 5000, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(r.ok, false);
    assert.equal(r.uncertain, false);
    assert.equal(r.code, 'RATE_LIMITED');
    assert.match(r.message, /réessayer dans un instant/);
  });

  test('HTTP 400 (4xx) → uncertain:false (rejet déterministe)', async () => {
    mockFetch(async () => fakeRes(400, { transactionStatus: 'REJECTED' }));
    const r = await initiatePayment({ reference: VREF, amount: 5000, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(r.ok, false);
    assert.equal(r.uncertain, false);
    assert.equal(r.code, 'HTTP_400');
  });

  test('HTTP 500 (5xx) → uncertain:true + mention checkStatus', async () => {
    mockFetch(async () => fakeRes(500, { transactionStatus: 'ERROR' }));
    const r = await initiatePayment({ reference: VREF, amount: 5000, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(r.ok, false);
    assert.equal(r.uncertain, true);
    assert.equal(r.code, 'HTTP_500');
    assert.match(r.message, /checkStatus/);
  });

  test('erreur réseau → uncertain:true, NETWORK_ERROR, sans clés', async () => {
    mockFetch(async () => { throw new Error('connexion refusée'); });
    const r = await initiatePayment({ reference: VREF, amount: 5000, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(r.ok, false);
    assert.equal(r.uncertain, true);
    assert.equal(r.code, 'NETWORK_ERROR');
    assert.ok(!r.message.includes('MP-SBPK-TEST'), 'publicKey dans le message !');
    assert.ok(!r.message.includes('MP-SBSK-TEST'), 'secretKey dans le message !');
    assert.match(r.message, /checkStatus/);
  });

  test('AbortError (timeout fetch) → uncertain:true, TIMEOUT', async () => {
    mockFetch(async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; });
    const r = await initiatePayment({ reference: VREF, amount: 5000, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(r.ok, false);
    assert.equal(r.uncertain, true);
    assert.equal(r.code, 'TIMEOUT');
    assert.match(r.message, /checkStatus/);
  });

  test('AbortError pendant res.json() (timeout lecture corps) → uncertain:true, TIMEOUT', async () => {
    mockFetch(async () => ({
      status: 202, ok: true,
      json: async () => { const e = new Error('body aborted'); e.name = 'AbortError'; throw e; },
    }));
    const r = await initiatePayment({ reference: VREF, amount: 5000, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(r.ok, false);
    assert.equal(r.uncertain, true);
    assert.equal(r.code, 'TIMEOUT');
  });

  test('réponse non-JSON → uncertain:true, INVALID_RESPONSE', async () => {
    mockFetch(async () => ({
      status: 202, ok: true,
      json: async () => { throw new SyntaxError('parse error'); },
    }));
    const r = await initiatePayment({ reference: VREF, amount: 5000, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(r.ok, false);
    assert.equal(r.uncertain, true);
    assert.equal(r.code, 'INVALID_RESPONSE');
    assert.match(r.message, /checkStatus/);
  });

  test('formatAmount utilisé : CDF 1500.9 → "1501" dans le payload', async () => {
    let body;
    mockFetch(async (_u, opts) => {
      body = JSON.parse(opts.body);
      return fakeRes(202, { transactionStatus: 'PENDING', transactionId: 1 });
    });
    await initiatePayment({ reference: VREF, amount: 1500.9, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(body.order.amount, '1501');
  });

  test('formatAmount utilisé : USD 10.5 → "10.50" dans le payload', async () => {
    let body;
    mockFetch(async (_u, opts) => {
      body = JSON.parse(opts.body);
      return fakeRes(202, { transactionStatus: 'PENDING', transactionId: 2 });
    });
    await initiatePayment({ reference: VREF, amount: 10.5, currency: 'USD', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(body.order.amount, '10.50');
  });

  test('callbackUrl : token encodé avec encodeURIComponent', async () => {
    setupEnv({ MAISHAPAY_WEBHOOK_TOKEN: 'TOK+spécial&=' });
    let body;
    mockFetch(async (_u, opts) => {
      body = JSON.parse(opts.body);
      return fakeRes(202, { transactionStatus: 'PENDING', transactionId: 3 });
    });
    await initiatePayment({ reference: VREF, amount: 500, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.ok(!body.paymentChannel.callbackUrl.includes('TOK+spécial&='), 'Token non encodé !');
    assert.ok(body.paymentChannel.callbackUrl.includes('TOK%2Bsp%C3%A9cial%26%3D'));
  });
});


// ─── getConfig — cohérence mode/clés ─────────────────────────────────────────

describe('getConfig — cohérence mode/clés', () => {

  afterEach(() => { restoreFetch(); clearEnv(); });

  test('mode 0 + MP-SBPK-/MP-SBSK- → OK', async () => {
    setupEnv({ MAISHAPAY_PUBLIC_KEY: 'MP-SBPK-TEST', MAISHAPAY_SECRET_KEY: 'MP-SBSK-TEST', MAISHAPAY_GATEWAY_MODE: '0' });
    mockFetch(async () => fakeRes(202, { transactionStatus: 'PENDING', transactionId: 10 }));
    const r = await initiatePayment({ reference: VREF, amount: 500, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(r.ok, true);
  });

  test('mode 1 + MP-LIVEPK-/MP-LIVESK- → OK', async () => {
    setupEnv({ MAISHAPAY_PUBLIC_KEY: 'MP-LIVEPK-TEST', MAISHAPAY_SECRET_KEY: 'MP-LIVESK-TEST', MAISHAPAY_GATEWAY_MODE: '1' });
    mockFetch(async () => fakeRes(202, { transactionStatus: 'PENDING', transactionId: 11 }));
    const r = await initiatePayment({ reference: VREF, amount: 500, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(r.ok, true);
  });

  test('clés live avec mode 0 → erreur cohérence, valeur de clé absente du message', async () => {
    setupEnv({ MAISHAPAY_PUBLIC_KEY: 'MP-LIVEPK-WRONG', MAISHAPAY_SECRET_KEY: 'MP-LIVESK-WRONG', MAISHAPAY_GATEWAY_MODE: '0' });
    await assert.rejects(
      () => initiatePayment({ reference: VREF, amount: 500, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' }),
      (err) => {
        assert.ok(!err.message.includes('MP-LIVEPK-WRONG'), 'Valeur publicKey dans le message !');
        assert.ok(!err.message.includes('MP-LIVESK-WRONG'), 'Valeur secretKey dans le message !');
        assert.ok(err.message.includes('MP-SBPK-'), 'Préfixe attendu absent du message');
        return true;
      }
    );
  });

  test('clés sandbox avec mode 1 → erreur cohérence', async () => {
    setupEnv({ MAISHAPAY_PUBLIC_KEY: 'MP-SBPK-WRONG', MAISHAPAY_SECRET_KEY: 'MP-SBSK-WRONG', MAISHAPAY_GATEWAY_MODE: '1' });
    await assert.rejects(
      () => initiatePayment({ reference: VREF, amount: 500, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' }),
      /MP-LIVEPK-/
    );
  });

  test('gatewayMode "2" (invalide) → erreur claire', async () => {
    setupEnv({ MAISHAPAY_GATEWAY_MODE: '2' });
    await assert.rejects(
      () => initiatePayment({ reference: VREF, amount: 500, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' }),
      /MAISHAPAY_GATEWAY_MODE/
    );
  });

  test('parseWebhook ne requiert PAS PUBLIC_KEY / GATEWAY_MODE', () => {
    setupEnv();
    delete process.env.MAISHAPAY_PUBLIC_KEY;
    delete process.env.MAISHAPAY_SECRET_KEY;
    delete process.env.MAISHAPAY_GATEWAY_MODE;
    const r = parseWebhook({ originatingTransactionId: VREF }, 'TEST_TOK');
    assert.equal(r.valid, true);
  });

  test('checkStatus ne requiert PAS WEBHOOK_TOKEN / APP_BASE_URL', async () => {
    setupEnv();
    delete process.env.MAISHAPAY_WEBHOOK_TOKEN;
    delete process.env.APP_BASE_URL;
    mockFetch(async () => fakeRes(200, { transactionStatus: 'FAILED' }));
    const r = await checkStatus(VREF);
    assert.equal(r.status, 'failed');
  });
});


// ─── checkStatus ─────────────────────────────────────────────────────────────

describe('checkStatus', () => {

  beforeEach(() => setupEnv());
  afterEach(() => { restoreFetch(); clearEnv(); });

  test('res.ok + SUCCESS → {status:"succeeded", confirmedAmount}', async () => {
    mockFetch(async () => fakeRes(200, { transactionStatus: 'SUCCESS', order: { cost: { amount: '5000' } } }));
    const r = await checkStatus(VREF);
    assert.equal(r.status, 'succeeded');
    assert.equal(r.confirmedAmount, '5000');
  });

  test('HTTP 500 + SUCCESS (res.ok=false) → pending (jamais succeeded)', async () => {
    mockFetch(async () => fakeRes(500, { transactionStatus: 'SUCCESS' }, { ok: false }));
    const r = await checkStatus(VREF);
    assert.equal(r.status, 'pending');
    assert.notEqual(r.status, 'succeeded');
  });

  test('HTTP 500 + FAILED (res.ok=false) → pending (jamais failed sans res.ok)', async () => {
    mockFetch(async () => fakeRes(500, { transactionStatus: 'FAILED' }, { ok: false }));
    const r = await checkStatus(VREF);
    assert.equal(r.status, 'pending');
    assert.notEqual(r.status, 'failed');
  });

  test('FAILED → {status:"failed", confirmedAmount:null}', async () => {
    mockFetch(async () => fakeRes(200, { transactionStatus: 'FAILED' }));
    const r = await checkStatus(VREF);
    assert.equal(r.status, 'failed');
    assert.equal(r.confirmedAmount, null);
  });

  test('PENDING → pending', async () => {
    mockFetch(async () => fakeRes(200, { transactionStatus: 'PENDING' }));
    const r = await checkStatus(VREF);
    assert.equal(r.status, 'pending');
  });

  test('statut inconnu "DECLINED" → pending (jamais succeeded)', async () => {
    mockFetch(async () => fakeRes(200, { transactionStatus: 'DECLINED' }));
    const r = await checkStatus(VREF);
    assert.equal(r.status, 'pending');
    assert.notEqual(r.status, 'succeeded');
  });

  test('réponse {} → pending', async () => {
    mockFetch(async () => fakeRes(200, {}));
    const r = await checkStatus(VREF);
    assert.equal(r.status, 'pending');
  });

  test('référence différente dans originatingTransactionId → pending', async () => {
    mockFetch(async () => fakeRes(200, {
      transactionStatus: 'SUCCESS',
      originatingTransactionId: 'xera_00000000-0000-0000-0000-000000000000',
    }));
    const r = await checkStatus(VREF);
    assert.equal(r.status, 'pending');
    assert.notEqual(r.status, 'succeeded');
    assert.equal(r.confirmedAmount, null);
  });

  test('même référence dans originatingTransactionId → succeeded autorisé', async () => {
    mockFetch(async () => fakeRes(200, {
      transactionStatus: 'SUCCESS',
      originatingTransactionId: VREF,
    }));
    const r = await checkStatus(VREF);
    assert.equal(r.status, 'succeeded');
  });

  test('originatingTransactionId absent → ne bloque pas le check normal', async () => {
    mockFetch(async () => fakeRes(200, { transactionStatus: 'SUCCESS' }));
    const r = await checkStatus(VREF);
    assert.equal(r.status, 'succeeded'); // absent = pas de divergence à signaler
  });

  test('réponse non-JSON → pending', async () => {
    mockFetch(async () => ({
      status: 200, ok: true,
      json: async () => { throw new SyntaxError('parse error'); },
    }));
    const r = await checkStatus(VREF);
    assert.equal(r.status, 'pending');
    assert.equal(r.confirmedAmount, null);
  });

  test('erreur réseau → pending (jamais succeeded)', async () => {
    mockFetch(async () => { throw new Error('réseau coupé'); });
    const r = await checkStatus(VREF);
    assert.equal(r.status, 'pending');
    assert.notEqual(r.status, 'succeeded');
    assert.equal(r.confirmedAmount, null);
  });

  test('AbortError fetch → pending', async () => {
    mockFetch(async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; });
    const r = await checkStatus(VREF);
    assert.equal(r.status, 'pending');
  });

  test('AbortError pendant res.json() (timeout lecture corps) → pending', async () => {
    mockFetch(async () => ({
      status: 200, ok: true,
      json: async () => { const e = new Error('body aborted'); e.name = 'AbortError'; throw e; },
    }));
    const r = await checkStatus(VREF);
    assert.equal(r.status, 'pending');
  });

  test('confirmedAmount null quand order absent', async () => {
    mockFetch(async () => fakeRes(200, { transactionStatus: 'SUCCESS' }));
    const r = await checkStatus(VREF);
    assert.equal(r.confirmedAmount, null);
  });
});


// ─── parseWebhook ─────────────────────────────────────────────────────────────

describe('parseWebhook', () => {

  beforeEach(() => setupEnv());
  afterEach(() => clearEnv());

  test('bon token string → {valid:true, reference}', () => {
    const r = parseWebhook({ originatingTransactionId: VREF }, 'TEST_TOK');
    assert.equal(r.valid, true);
    assert.equal(r.reference, VREF);
    assert.ok(!('transactionStatus' in r), 'statut du body ne doit pas être renvoyé');
    assert.ok(!('status' in r));
  });

  test('mauvais token → {valid:false}', () => {
    assert.equal(parseWebhook({ originatingTransactionId: VREF }, 'WRONG').valid, false);
  });

  test('queryToken tableau → {valid:false} (typeof !== string)', () => {
    assert.equal(parseWebhook({ originatingTransactionId: VREF }, ['TEST_TOK']).valid, false);
  });

  test('queryToken objet → {valid:false}', () => {
    assert.equal(parseWebhook({ originatingTransactionId: VREF }, { token: 'TEST_TOK' }).valid, false);
  });

  test('queryToken null → {valid:false}', () => {
    assert.equal(parseWebhook({ originatingTransactionId: VREF }, null).valid, false);
  });

  test('queryToken undefined → {valid:false}', () => {
    assert.equal(parseWebhook({ originatingTransactionId: VREF }, undefined).valid, false);
  });

  test('queryToken nombre → {valid:false}', () => {
    assert.equal(parseWebhook({ originatingTransactionId: VREF }, 42).valid, false);
  });

  test('queryToken vide → {valid:false}', () => {
    assert.equal(parseWebhook({ originatingTransactionId: VREF }, '').valid, false);
  });

  test('bon token, référence absente → {valid:true, reference:null}', () => {
    const r = parseWebhook({}, 'TEST_TOK');
    assert.equal(r.valid, true);
    assert.equal(r.reference, null);
  });

  test('bon token, body vide → {valid:true, reference:null}', () => {
    const r = parseWebhook({}, 'TEST_TOK');
    assert.equal(r.valid, true);
    assert.equal(r.reference, null);
  });

  test('WEBHOOK_TOKEN absent → erreur claire', () => {
    delete process.env.MAISHAPAY_WEBHOOK_TOKEN;
    assert.throws(() => parseWebhook({}, 'TEST_TOK'), /MAISHAPAY_WEBHOOK_TOKEN/);
  });

  test('le statut du body est ignoré (non renvoyé dans le résultat)', () => {
    const r = parseWebhook({ originatingTransactionId: VREF, transactionStatus: 'SUCCESS' }, 'TEST_TOK');
    assert.ok(!('transactionStatus' in r));
    assert.ok(!('status' in r));
  });
});

// ─── normalizePhone ───────────────────────────────────────────────────────────

describe('normalizePhone (RDC +243)', () => {
  test('+243974123456 → +243974123456', () => { assert.equal(normalizePhone('+243974123456'), '+243974123456'); });
  test('0974123456 → +243974123456',    () => { assert.equal(normalizePhone('0974123456'), '+243974123456'); });
  test('974123456 → +243974123456',     () => { assert.equal(normalizePhone('974123456'), '+243974123456'); });
  test('00243974123456 → +243974123456',() => { assert.equal(normalizePhone('00243974123456'), '+243974123456'); });
  test('avec espaces/tirets → normalisé',() => { assert.equal(normalizePhone('+243 974-123-456'), '+243974123456'); });
  test('trop court → null',             () => { assert.equal(normalizePhone('97412'), null); });
  test('trop long → null',              () => { assert.equal(normalizePhone('09741234567890'), null); });
  test('lettres → null',                () => { assert.equal(normalizePhone('0974ABC456'), null); });
  test('null → null',                   () => { assert.equal(normalizePhone(null), null); });
  test('chaîne vide → null',            () => { assert.equal(normalizePhone(''), null); });
});

// ─── mapProvider ──────────────────────────────────────────────────────────────

describe('mapProvider', () => {
  test('airtel_money → AIRTEL', () => { assert.equal(mapProvider('airtel_money'), 'AIRTEL'); });
  test('orange_money → ORANGE', () => { assert.equal(mapProvider('orange_money'), 'ORANGE'); });
  test('mpesa → MPESA',         () => { assert.equal(mapProvider('mpesa'), 'MPESA'); });
  test('mtn → MTN',             () => { assert.equal(mapProvider('mtn'), 'MTN'); });
  test('afrimoney → null',      () => { assert.equal(mapProvider('afrimoney'), null); });
  test('wave → null',           () => { assert.equal(mapProvider('wave'), null); });
  test('inconnu → null',        () => { assert.equal(mapProvider('unknown'), null); });
});

// ─── validateAmount ───────────────────────────────────────────────────────────

describe('validateAmount', () => {
  test('CDF 100 → false',       () => { assert.equal(validateAmount(100, 'CDF'), false); });
  test('CDF 100.01 → true',     () => { assert.equal(validateAmount(100.01, 'CDF'), true); });
  test('CDF 5000 → true',       () => { assert.equal(validateAmount(5000, 'CDF'), true); });
  test('XAF 50 → false',        () => { assert.equal(validateAmount(50, 'XAF'), false); });
  test('XOF 200 → true',        () => { assert.equal(validateAmount(200, 'XOF'), true); });
  test('USD 0.5 → false',       () => { assert.equal(validateAmount(0.5, 'USD'), false); });
  test('USD 0.51 → true',       () => { assert.equal(validateAmount(0.51, 'USD'), true); });
  test('EUR 10 → true',         () => { assert.equal(validateAmount(10, 'EUR'), true); });
  test('0 → false',             () => { assert.equal(validateAmount(0, 'CDF'), false); });
  test('négatif → false',       () => { assert.equal(validateAmount(-500, 'CDF'), false); });
  test('devise inconnue → false',() => { assert.equal(validateAmount(5000, 'GNF'), false); });
});

// ─── buildReference & sécurité ───────────────────────────────────────────────

describe('buildReference', () => {
  test('préfixe xera_ + uuid', () => {
    assert.equal(buildReference('a1b2c3d4-e5f6-7890-abcd-ef1234567890'), VREF);
  });
});

describe('sécurité — clés absentes des messages/objets d\'erreur', () => {

  beforeEach(() => setupEnv());
  afterEach(() => { restoreFetch(); clearEnv(); });

  test('erreur réseau initiatePayment : clés absentes', async () => {
    mockFetch(async () => { throw new Error('connexion impossible'); });
    const r = await initiatePayment({ reference: VREF, amount: 1000, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.ok(!r.message.includes('MP-SBPK-TEST'), 'publicKey exposée !');
    assert.ok(!r.message.includes('MP-SBSK-TEST'), 'secretKey exposée !');
  });

  test('JSON invalide initiatePayment : clés absentes, uncertain:true', async () => {
    mockFetch(async () => ({
      status: 500, ok: false,
      json: async () => { throw new SyntaxError('parse error'); },
    }));
    const r = await initiatePayment({ reference: VREF, amount: 1000, currency: 'CDF', phone: VPHONE, provider: 'AIRTEL' });
    assert.equal(r.uncertain, true);
    assert.ok(!r.message.includes('MP-SBPK-TEST'));
    assert.ok(!r.message.includes('MP-SBSK-TEST'));
  });

  test('erreur réseau checkStatus : status reste pending, jamais succeeded', async () => {
    mockFetch(async () => { throw new Error('réseau coupé'); });
    const r = await checkStatus(VREF);
    assert.equal(r.status, 'pending');
    assert.notEqual(r.status, 'succeeded');
  });
});

