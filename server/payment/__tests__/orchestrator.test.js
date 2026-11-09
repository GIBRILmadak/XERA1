'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  finalizePayment,
  touchThenFinalize,
  startPayment,
  reconcilePayments,
} = require('../orchestrator');

const { registerPaymentRoutes } = require('../routes');

// ─── Helpers & Mocks ────────────────────────────────────────────────────────

function createMockSupabase(initialState = {}) {
  const transactions = new Map(Object.entries(initialState.transactions || {}));
  const rpcCalls = [];
  const updateCalls = [];

  return {
    _state: { transactions, rpcCalls, updateCalls },
    rpc: async (fnName, params) => {
      rpcCalls.push({ fnName, params });
      if (fnName === 'touch_status_check') {
        if (initialState.touchAllowed !== undefined) {
          return { data: initialState.touchAllowed, error: null };
        }
        return { data: true, error: null };
      }
      if (fnName === 'claim_transaction_result') {
        const tx = transactions.get(params.p_transaction_id);
        if (!tx) {
          return { data: null, error: new Error('Transaction not found') };
        }
        const claimed = initialState.claimShouldSucceed !== undefined ? initialState.claimShouldSucceed : true;
        if (claimed) {
          tx.status = params.p_new_status;
          if (params.p_provider_tx) tx.provider_transaction_id = params.p_provider_tx;
        }
        return {
          data: [{ claimed, transaction: { ...tx } }],
          error: null,
        };
      }
      return { data: null, error: new Error(`Unknown RPC ${fnName}`) };
    },
    from: (table) => {
      if (table === 'transactions') {
        return {
          select: () => ({
            eq: (_col, val) => ({
              maybeSingle: async () => ({
                data: transactions.get(val) ? { ...transactions.get(val) } : null,
                error: null,
              }),
              single: async () => {
                const tx = transactions.get(val);
                if (!tx) return { data: null, error: new Error('Not found') };
                return { data: { ...tx }, error: null };
              },
            }),
            gte: () => ({
              order: () => ({
                limit: async (lim) => ({
                  data: Array.from(transactions.values()).slice(0, lim),
                  error: null,
                }),
              }),
            }),
          }),
          update: (fields) => ({
            eq: (_col, val) => {
              updateCalls.push({ id: val, fields });
              const tx = transactions.get(val);
              if (tx) {
                Object.assign(tx, fields);
              }
              return {
                is: () => Promise.resolve({ error: null }),
                then: (resolve) => resolve({ error: null }),
              };
            },
          }),
          insert: (data) => ({
            select: () => ({
              single: async () => {
                const id = data.id || '00000000-0000-0000-0000-000000000099';
                const created = { id, ...data };
                transactions.set(id, created);
                return { data: created, error: null };
              },
            }),
          }),
        };
      }
      return {};
    },
  };
}

// ─── Tests finalizePayment ──────────────────────────────────────────────────

describe('finalizePayment', () => {
  it('rejette les statuts non autorisés', async () => {
    await assert.rejects(
      async () => finalizePayment({ transactionId: 'tx-1', status: 'pending', deps: {} }),
      /statut invalide/
    );
  });

  it('applique les effets métier pour subscription lorsque claimed = true', async () => {
    let activated = false;
    const txId = '00000000-0000-0000-0000-000000000001';
    const supabase = createMockSupabase({
      transactions: {
        [txId]: {
          id: txId,
          type: 'subscription',
          from_user_id: 'user-1',
          amount_gross: 2.99,
          currency: 'USD',
          status: 'pending',
          metadata: { plan: 'standard', billing_cycle: 'monthly' },
          effects_applied_at: null,
        },
      },
    });

    const res = await finalizePayment({
      transactionId: txId,
      status: 'succeeded',
      providerTxId: 'MP-12345',
      deps: {
        supabase,
        activateSubscription: async (params) => {
          assert.equal(params.pendingTransactionId, txId);
          assert.equal(params.alreadyClaimed, true);
          activated = true;
        },
      },
    });

    assert.equal(res.claimed, true);
    assert.equal(res.status, 'succeeded');
    assert.equal(res.effectsApplied, true);
    assert.equal(activated, true);
  });

  it('idempotence : n’applique pas les effets si effects_applied_at est déjà renseigné', async () => {
    let activated = false;
    const txId = '00000000-0000-0000-0000-000000000002';
    const supabase = createMockSupabase({
      transactions: {
        [txId]: {
          id: txId,
          type: 'subscription',
          status: 'succeeded',
          effects_applied_at: '2026-11-09T10:00:00.000Z',
        },
      },
      claimShouldSucceed: false,
    });

    const res = await finalizePayment({
      transactionId: txId,
      status: 'succeeded',
      deps: {
        supabase,
        activateSubscription: async () => {
          activated = true;
        },
      },
    });

    assert.equal(res.claimed, false);
    assert.equal(res.effectsApplied, false);
    assert.equal(activated, false);
  });

  it('applique les effets métier pour support lorsque claimed = true', async () => {
    let confirmed = false;
    const txId = '00000000-0000-0000-0000-000000000003';
    const supabase = createMockSupabase({
      transactions: {
        [txId]: {
          id: txId,
          type: 'support',
          from_user_id: 'fan-1',
          to_user_id: 'creator-1',
          amount_gross: 10,
          currency: 'USD',
          status: 'pending',
          metadata: { checkout_amount: 28000, checkout_currency: 'CDF' },
          effects_applied_at: null,
        },
      },
    });

    const res = await finalizePayment({
      transactionId: txId,
      status: 'succeeded',
      deps: {
        supabase,
        confirmSupportPayment: async (params) => {
          assert.equal(params.pendingTransactionId, txId);
          assert.equal(params.alreadyClaimed, true);
          confirmed = true;
        },
      },
    });

    assert.equal(res.claimed, true);
    assert.equal(res.effectsApplied, true);
    assert.equal(confirmed, true);
  });
});

// ─── Tests touchThenFinalize ────────────────────────────────────────────────

describe('touchThenFinalize', () => {
  it('saute l’appel prestataire si rate-limité par touch_status_check', async () => {
    const txId = '00000000-0000-0000-0000-000000000010';
    let checkCalled = false;
    const supabase = createMockSupabase({ touchAllowed: false });

    const res = await touchThenFinalize({
      transactionId: txId,
      minIntervalSeconds: 10,
      deps: {
        supabase,
        maishapay: {
          buildReference: (id) => `xera_${id}`,
          checkStatus: async () => {
            checkCalled = true;
          },
        },
      },
    });

    assert.equal(res.skipped, true);
    assert.equal(res.reason, 'rate_limited');
    assert.equal(checkCalled, false);
  });

  it('appelle checkStatus et finalise en succeeded quand le statut est SUCCESS', async () => {
    const txId = '00000000-0000-0000-0000-000000000011';
    const supabase = createMockSupabase({
      touchAllowed: true,
      transactions: {
        [txId]: {
          id: txId,
          type: 'subscription',
          status: 'pending',
          effects_applied_at: null,
        },
      },
    });

    const res = await touchThenFinalize({
      transactionId: txId,
      minIntervalSeconds: 10,
      deps: {
        supabase,
        maishapay: {
          buildReference: (id) => `xera_${id}`,
          checkStatus: async () => ({ status: 'succeeded', providerTransactionId: 'MP-999' }),
        },
        activateSubscription: async () => {},
      },
    });

    assert.equal(res.checked, true);
    assert.equal(res.status, 'succeeded');
    assert.equal(res.finalized.claimed, true);
  });

  it('ne rappelle pas MaishaPay si la transaction est déjà succeeded', async () => {
    const txId = '00000000-0000-0000-0000-000000000012';
    let checkCalled = false;
    const supabase = createMockSupabase({
      touchAllowed: true,
      transactions: {
        [txId]: {
          id: txId,
          status: 'succeeded',
          effects_applied_at: '2026-11-09T10:00:00Z',
        },
      },
    });

    const res = await touchThenFinalize({
      transactionId: txId,
      deps: {
        supabase,
        maishapay: {
          buildReference: (id) => `xera_${id}`,
          checkStatus: async () => {
            checkCalled = true;
          },
        },
      },
    });

    assert.equal(res.skipped, true);
    assert.equal(res.reason, 'already_succeeded');
    assert.equal(checkCalled, false);
  });
});

// ─── Tests startPayment ─────────────────────────────────────────────────────

describe('startPayment', () => {
  it('rejette un numéro de téléphone invalide', async () => {
    const supabase = createMockSupabase();
    const res = await startPayment({
      userId: 'user-1',
      type: 'subscription',
      details: { phone: '0812345678', provider: 'airtel_money' },
      deps: {
        supabase,
        maishapay: {
          normalizePhone: () => null,
          mapProvider: () => 'AIRTEL',
        },
      },
    });

    assert.equal(res.ok, false);
    assert.equal(res.code, 'INVALID_PHONE');
  });

  it('rejette un opérateur non supporté', async () => {
    const supabase = createMockSupabase();
    const res = await startPayment({
      userId: 'user-1',
      type: 'subscription',
      details: { phone: '+243812345678', provider: 'unknown_op' },
      deps: {
        supabase,
        maishapay: {
          normalizePhone: (p) => p,
          mapProvider: () => null,
        },
      },
    });

    assert.equal(res.ok, false);
    assert.equal(res.code, 'UNSUPPORTED_PROVIDER');
  });

  it('RÈGLE CRITIQUE : en cas d’uncertain:true, NE MARQUE PAS failed et renvoie uncertain:true', async () => {
    const supabase = createMockSupabase();
    const txId = '00000000-0000-0000-0000-000000000020';

    const res = await startPayment({
      userId: 'user-1',
      type: 'subscription',
      details: {
        phone: '+243812345678',
        provider: 'airtel_money',
        plan: 'standard',
      },
      deps: {
        supabase,
        maishapay: {
          normalizePhone: (p) => p,
          mapProvider: () => 'AIRTEL',
          buildReference: (id) => `xera_${id}`,
          initiatePayment: async () => ({
            ok: false,
            uncertain: true,
            code: 'TIMEOUT',
            message: 'Timeout lors de l’appel',
          }),
        },
        computeSubscriptionAmount: () => 8500,
        createPendingSubscriptionPayment: async () => ({ id: txId, metadata: {} }),
      },
    });

    assert.equal(res.ok, false);
    assert.equal(res.uncertain, true);
    assert.equal(res.code, 'TIMEOUT');

    // Vérifier que claim_transaction_result avec 'failed' N'A PAS été appelé !
    const claimCalls = supabase._state.rpcCalls.filter(c => c.fnName === 'claim_transaction_result');
    assert.equal(claimCalls.length, 0);
  });

  it('succès : initResult.ok === true met à jour phone_last3 et renvoie ok: true', async () => {
    const txId = '00000000-0000-0000-0000-000000000021';
    const supabase = createMockSupabase({
      transactions: {
        [txId]: { id: txId, metadata: {} },
      },
    });

    const res = await startPayment({
      userId: 'user-1',
      type: 'subscription',
      details: {
        phone: '+243812345678',
        provider: 'airtel_money',
        plan: 'standard',
      },
      deps: {
        supabase,
        maishapay: {
          normalizePhone: (p) => p,
          mapProvider: () => 'AIRTEL',
          buildReference: (id) => `xera_${id}`,
          initiatePayment: async () => ({
            ok: true,
            providerTransactionId: 'MP-INIT-123',
          }),
        },
        computeSubscriptionAmount: () => 8500,
        createPendingSubscriptionPayment: async () => ({ id: txId, metadata: {} }),
      },
    });

    assert.equal(res.ok, true);
    assert.equal(res.transactionId, txId);
    assert.equal(res.providerTransactionId, 'MP-INIT-123');

    // Vérifier que le numéro complet n'est PAS stocké, seulement les 3 derniers chiffres
    const update = supabase._state.updateCalls.find(u => u.id === txId);
    assert.equal(update.fields.metadata.phone_last3, '678');
    assert.equal(update.fields.metadata.phone, undefined);
  });
});

// ─── Tests routes ───────────────────────────────────────────────────────────

describe('registerPaymentRoutes', () => {
  function createMockApp() {
    const routes = new Map();
    return {
      post: (path, handler) => routes.set(`POST ${path}`, handler),
      get: (path, handler) => routes.set(`GET ${path}`, handler),
      _dispatch: async (method, path, req = {}) => {
        // Simple router matching
        for (const [key, handler] of routes.entries()) {
          const [routeMethod, routePath] = key.split(' ');
          if (routeMethod !== method) continue;
          if (routePath.includes(':')) {
            const regex = new RegExp(`^${routePath.replace(/:[^\s/]+/g, '([^/]+)')}$`);
            const match = path.match(regex);
            if (match) {
              req.params = { id: match[1] };
              let statusCode = 200;
              let responseBody = null;
              const res = {
                status: (code) => { statusCode = code; return res; },
                json: (body) => { responseBody = body; return res; },
              };
              await handler(req, res);
              return { status: statusCode, body: responseBody };
            }
          } else if (routePath === path) {
            let statusCode = 200;
            let responseBody = null;
            const res = {
              status: (code) => { statusCode = code; return res; },
              json: (body) => { responseBody = body; return res; },
            };
            await handler(req, res);
            return { status: statusCode, body: responseBody };
          }
        }
        return { status: 404, body: 'Not Found' };
      },
    };
  }

  it('POST /api/payments/initiate rejette un appel non authentifié (401)', async () => {
    const app = createMockApp();
    registerPaymentRoutes(app, {
      resolveRequestUser: async () => null,
    });

    const res = await app._dispatch('POST', '/api/payments/initiate', { headers: {}, body: {} });
    assert.equal(res.status, 401);
  });

  it('POST /api/maishapay/webhook rejette un jeton invalide (401)', async () => {
    const app = createMockApp();
    registerPaymentRoutes(app, {
      maishapay: {
        parseWebhook: () => ({ valid: false }),
      },
    });

    const res = await app._dispatch('POST', '/api/maishapay/webhook', {
      query: { t: 'BAD_TOKEN' },
      body: {},
    });
    assert.equal(res.status, 401);
  });

  it('POST /api/maishapay/webhook traite immédiatement une référence valide (200)', async () => {
    const app = createMockApp();
    let touchCalled = false;
    const validRef = 'xera_00000000-0000-0000-0000-000000000030';

    registerPaymentRoutes(app, {
      maishapay: {
        parseWebhook: () => ({ valid: true, reference: validRef }),
        isValidReference: () => true,
      },
      orchestrator: {
        touchThenFinalize: async ({ transactionId, minIntervalSeconds }) => {
          assert.equal(transactionId, '00000000-0000-0000-0000-000000000030');
          assert.equal(minIntervalSeconds, 0); // Forçage immédiat
          touchCalled = true;
        },
      },
    });

    const res = await app._dispatch('POST', '/api/maishapay/webhook', {
      query: { t: 'TEST_SECRET' },
      body: { reference: validRef },
    });
    assert.equal(res.status, 200);
    assert.equal(touchCalled, true);
  });
});
