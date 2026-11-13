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

/**
 * createMockSupabase
 *
 * Gère :
 *  - rpc('touch_status_check') / rpc('claim_transaction_result')
 *  - from('transactions').select().eq().maybeSingle() / single()
 *  - from('transactions').select(..., { count:'exact', head:true }).eq(...).gte(...)
 *    → renvoie { count: 0 } par défaut (surchargeable via mock._countOverride)
 */
function createMockSupabase(initialState = {}) {
  const transactions = new Map(Object.entries(initialState.transactions || {}));
  const rpcCalls = [];
  const updateCalls = [];
  let _countCallIdx = 0;

  function matchesFilters(tx, filters) {
    for (const [col, val] of Object.entries(filters)) {
      if (col.startsWith('__')) continue;
      if (col === 'id' && tx.id !== val) return false;
      if (col === 'status' && tx.status !== val) return false;
      if (col === 'type' && tx.type !== val) return false;
      if (col === 'from_user_id' && tx.from_user_id !== val) return false;
      if (col === 'to_user_id' && tx.to_user_id !== val) return false;
      if (col === 'metadata->>payment_provider' && tx.metadata?.payment_provider !== val) return false;
      if (col === 'metadata->>plan' && tx.metadata?.plan !== val) return false;
      if (col === 'metadata->>phone_hash' && tx.metadata?.phone_hash !== val) return false;
    }
    return true;
  }

  function buildRowChain() {
    const filters = {};
    const chain = {
      eq(col, val) { filters[col] = val; return chain; },
      gte(col, val) { filters[`__gte_${col}`] = val; return chain; },
      lt(col, val) { filters[`__lt_${col}`] = val; return chain; },
      lte(col, val) { filters[`__lte_${col}`] = val; return chain; },
      is(col, val) { filters[`__is_${col}`] = val; return chain; },
      order() { return chain; },
      limit() { return chain; },
      async maybeSingle() {
        for (const tx of transactions.values()) {
          if (matchesFilters(tx, filters)) return { data: { ...tx }, error: null };
        }
        return { data: null, error: null };
      },
      async single() {
        for (const tx of transactions.values()) {
          if (matchesFilters(tx, filters)) return { data: { ...tx }, error: null };
        }
        return { data: null, error: new Error('Not found') };
      },
      then(resolve) { return resolve({ error: null }); },
    };
    return chain;
  }

  function buildCountChain(countVal) {
    const p = {
      eq() { return p; },
      gte() { return p; },
      lt() { return p; },
      lte() { return p; },
      is() { return p; },
      order() { return p; },
      limit() { return p; },
      then(resolve) { return resolve({ count: countVal, error: null }); },
    };
    return p;
  }

  const mock = {
    _state: { transactions, rpcCalls, updateCalls },
    _countOverride: null,
    rpc: async (fnName, params) => {
      rpcCalls.push({ fnName, params });
      if (fnName === 'touch_status_check') {
        const allowed = initialState.touchAllowed !== undefined ? initialState.touchAllowed : true;
        return { data: allowed, error: null };
      }
      if (fnName === 'claim_transaction_result') {
        const tx = transactions.get(params.p_transaction_id);
        if (!tx) return { data: null, error: new Error('Transaction not found') };
        const claimed = initialState.claimShouldSucceed !== undefined
          ? initialState.claimShouldSucceed : true;
        if (claimed) {
          tx.status = params.p_new_status;
          if (params.p_provider_tx) tx.provider_transaction_id = params.p_provider_tx;
        }
        return { data: [{ claimed, transaction: { ...tx } }], error: null };
      }
      return { data: null, error: new Error(`Unknown RPC ${fnName}`) };
    },
    from: (table) => {
      if (table === 'transactions') {
        return {
          select: (cols, opts) => {
            if (opts && opts.count === 'exact') {
              const idx = _countCallIdx++;
              const countVal = typeof mock._countOverride === 'function'
                ? mock._countOverride(idx)
                : 0;
              return buildCountChain(countVal);
            }
            return buildRowChain();
          },
          update: (fields) => ({
            eq: (_col, val) => {
              updateCalls.push({ id: val, fields });
              const tx = transactions.get(val);
              if (tx) Object.assign(tx, fields);
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
  return mock;
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
          to_user_id: 'user-1',
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

  // Test A1 : subscription avec from_user_id=null mais to_user_id valide
  it('[A1] subscription from_user_id=null, to_user_id valide → utilise to_user_id', async () => {
    let capturedSubscriberId;
    const txId = '00000000-0000-0000-0000-000000000001b';
    const supabase = createMockSupabase({
      transactions: {
        [txId]: {
          id: txId,
          type: 'subscription',
          from_user_id: null,
          to_user_id: 'user-to-1',
          amount_gross: 2.99,
          currency: 'USD',
          status: 'pending',
          metadata: { plan: 'standard', billing_cycle: 'monthly', payment_provider: 'maishapay' },
          effects_applied_at: null,
        },
      },
    });

    const res = await finalizePayment({
      transactionId: txId,
      status: 'succeeded',
      deps: {
        supabase,
        activateSubscription: async (params) => {
          capturedSubscriberId = params.userId;
        },
      },
    });

    assert.equal(res.claimed, true);
    assert.equal(res.effectsApplied, true);
    assert.equal(capturedSubscriberId, 'user-to-1', 'Doit utiliser to_user_id, pas from_user_id');
  });

  // Test A2 : deux appels simultanés → effets appliqués une seule fois
  it('[A2] deux appels simultanés → effets appliqués une seule fois (canApply guard)', async () => {
    let activatedCount = 0;
    const txId = '00000000-0000-0000-0000-000000000001c';
    const supabase = createMockSupabase({
      transactions: {
        [txId]: {
          id: txId,
          type: 'subscription',
          from_user_id: 'user-1',
          to_user_id: 'user-1',
          amount_gross: 2.99,
          currency: 'USD',
          status: 'pending',
          metadata: { plan: 'standard', billing_cycle: 'monthly' },
          effects_applied_at: null,
        },
      },
    });

    // Premier claim réussit, second échoue (claimed=false)
    let claimCallCount = 0;
    supabase.rpc = async (fnName, params) => {
      supabase._state.rpcCalls.push({ fnName, params });
      if (fnName === 'claim_transaction_result') {
        claimCallCount++;
        const tx = supabase._state.transactions.get(params.p_transaction_id);
        if (claimCallCount === 1) {
          const snapshot = { ...tx };
          if (tx) {
            tx.status = params.p_new_status;
            tx.effects_applied_at = new Date().toISOString();
          }
          return { data: [{ claimed: true, transaction: snapshot }], error: null };
        }
        return { data: [{ claimed: false, transaction: { ...tx } }], error: null };
      }
      return { data: true, error: null };
    };

    const [res1, res2] = await Promise.all([
      finalizePayment({
        transactionId: txId, status: 'succeeded',
        deps: { supabase, activateSubscription: async () => { activatedCount++; } },
      }),
      finalizePayment({
        transactionId: txId, status: 'succeeded',
        deps: { supabase, activateSubscription: async () => { activatedCount++; } },
      }),
    ]);

    assert.equal(activatedCount, 1, 'activateSubscription ne doit être appelé qu\'une fois');
    assert.ok([res1.effectsApplied, res2.effectsApplied].includes(true));
  });

  it('idempotence : n\'applique pas les effets si effects_applied_at est déjà renseigné', async () => {
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
        activateSubscription: async () => { activated = true; },
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
  it('saute l\'appel prestataire si rate-limité par touch_status_check', async () => {
    const txId = '00000000-0000-0000-0000-000000000010';
    let checkCalled = false;
    const supabase = createMockSupabase({
      touchAllowed: false,
      transactions: {
        [txId]: {
          id: txId,
          type: 'subscription',
          status: 'pending',
          metadata: { payment_provider: 'maishapay' },
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
          checkStatus: async () => { checkCalled = true; },
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
          from_user_id: 'user-11',
          to_user_id: 'user-11',
          amount_gross: 2.99,
          currency: 'CDF',
          metadata: { payment_provider: 'maishapay', plan: 'standard', billing_cycle: 'monthly' },
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
          type: 'subscription',
          status: 'succeeded',
          metadata: { payment_provider: 'maishapay' },
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
          checkStatus: async () => { checkCalled = true; },
        },
      },
    });

    assert.equal(res.skipped, true);
    assert.equal(res.reason, 'already_succeeded');
    assert.equal(checkCalled, false);
  });

  // Test A3 : transaction non-maishapay → not_maishapay
  it('[A3] transaction non-maishapay → { skipped: true, reason: not_maishapay }', async () => {
    const txId = '00000000-0000-0000-0000-000000000013';
    let checkCalled = false;
    const supabase = createMockSupabase({
      touchAllowed: true,
      transactions: {
        [txId]: {
          id: txId,
          type: 'subscription',
          status: 'pending',
          metadata: { payment_provider: 'stripe' },
          effects_applied_at: null,
        },
      },
    });

    const res = await touchThenFinalize({
      transactionId: txId,
      deps: {
        supabase,
        maishapay: {
          buildReference: (id) => `xera_${id}`,
          checkStatus: async () => { checkCalled = true; return { status: 'succeeded' }; },
        },
      },
    });

    assert.equal(res.skipped, true);
    assert.equal(res.reason, 'not_maishapay');
    assert.equal(checkCalled, false, 'checkStatus ne doit pas être appelé pour non-maishapay');
  });
});

// ─── Tests startPayment ─────────────────────────────────────────────────────

describe('startPayment', () => {
  function makeMinimalDeps(supabase, overrides = {}) {
    return {
      supabase,
      maishapay: {
        normalizePhone: (p) => p,
        mapProvider: () => 'AIRTEL',
        buildReference: (id) => `xera_${id}`,
        initiatePayment: async () => ({ ok: true, providerTransactionId: 'MP-XYZ' }),
      },
      computeSubscriptionAmount: () => 8500,
      createPendingSubscriptionPayment: async () => ({
        id: '00000000-0000-0000-0000-000000000099',
        metadata: { payment_provider: 'maishapay' },
        type: 'subscription',
        to_user_id: 'user-1',
        from_user_id: 'user-1',
        status: 'pending',
      }),
      ...overrides,
    };
  }

  it('rejette un numéro de téléphone invalide', async () => {
    const supabase = createMockSupabase();
    const res = await startPayment({
      userId: 'user-1',
      type: 'subscription',
      details: { phone: '0812345678', provider: 'airtel_money', plan: 'standard' },
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
      details: { phone: '+243812345678', provider: 'unknown_op', plan: 'standard' },
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

  // Test B1 : devise invalide → INVALID_CURRENCY
  it('[B1] devise invalide (EUR) → INVALID_CURRENCY', async () => {
    const supabase = createMockSupabase();
    const res = await startPayment({
      userId: 'user-1',
      type: 'subscription',
      details: { phone: '+243812345678', provider: 'airtel_money', plan: 'standard', currency: 'EUR' },
      deps: {
        supabase,
        maishapay: {
          normalizePhone: (p) => p,
          mapProvider: () => 'AIRTEL',
        },
      },
    });

    assert.equal(res.ok, false);
    assert.equal(res.code, 'INVALID_CURRENCY');
  });

  // Test B2 : anti-doublon pending <90s → renvoie transaction existante
  it('[B2] anti-doublon pending <90s → transaction dédupliquée, pas d\'appel initiatePayment', async () => {
    const existingId = '00000000-0000-0000-0000-000000000050';
    const supabase = createMockSupabase({
      transactions: {
        [existingId]: {
          id: existingId,
          type: 'subscription',
          status: 'pending',
          to_user_id: 'user-1',
          from_user_id: 'user-1',
          created_at: new Date(Date.now() - 30000).toISOString(),
          metadata: {
            payment_provider: 'maishapay',
            plan: 'standard',
            provider_transaction_id: 'MP-EXISTING',
          },
        },
      },
    });

    let initiateCalled = false;
    const res = await startPayment({
      userId: 'user-1',
      type: 'subscription',
      details: { phone: '+243812345678', provider: 'airtel_money', plan: 'standard' },
      deps: makeMinimalDeps(supabase, {
        maishapay: {
          normalizePhone: (p) => p,
          mapProvider: () => 'AIRTEL',
          buildReference: (id) => `xera_${id}`,
          initiatePayment: async () => { initiateCalled = true; return { ok: true }; },
        },
      }),
    });

    assert.equal(res.ok, true);
    assert.equal(res.deduplicated, true, 'Doit être marqué dédupliqué');
    assert.equal(res.transactionId, existingId);
    assert.equal(initiateCalled, false, 'initiatePayment ne doit pas être appelé');
  });

  // Test B3 : > 5 tentatives user/10min → TOO_MANY_ATTEMPTS
  it('[B3] >= 5 tentatives user/10min → TOO_MANY_ATTEMPTS', async () => {
    const supabase = createMockSupabase();
    supabase._countOverride = (idx) => idx === 0 ? 5 : 0;

    const res = await startPayment({
      userId: 'user-1',
      type: 'subscription',
      details: { phone: '+243812345678', provider: 'airtel_money', plan: 'standard' },
      deps: makeMinimalDeps(supabase),
    });

    assert.equal(res.ok, false);
    assert.equal(res.code, 'TOO_MANY_ATTEMPTS');
    assert.equal(res.uncertain, false);
  });

  // Test B4 : > 3 tentatives par numéro/10min → TOO_MANY_ATTEMPTS
  it('[B4] >= 3 tentatives par numéro/10min → TOO_MANY_ATTEMPTS', async () => {
    const supabase = createMockSupabase();
    supabase._countOverride = (idx) => idx === 2 ? 3 : 0;

    const res = await startPayment({
      userId: 'user-1',
      type: 'subscription',
      details: { phone: '+243812345678', provider: 'airtel_money', plan: 'standard' },
      deps: makeMinimalDeps(supabase),
    });

    assert.equal(res.ok, false);
    assert.equal(res.code, 'TOO_MANY_ATTEMPTS');
    assert.equal(res.uncertain, false);
  });

  it('RÈGLE CRITIQUE : uncertain:true → NE MARQUE PAS failed, renvoie uncertain:true', async () => {
    const txId = '00000000-0000-0000-0000-000000000020';
    const supabase = createMockSupabase();

    const res = await startPayment({
      userId: 'user-1',
      type: 'subscription',
      details: {
        phone: '+243812345678',
        provider: 'airtel_money',
        plan: 'standard',
      },
      deps: makeMinimalDeps(supabase, {
        maishapay: {
          normalizePhone: (p) => p,
          mapProvider: () => 'AIRTEL',
          buildReference: (id) => `xera_${id}`,
          initiatePayment: async () => ({
            ok: false,
            uncertain: true,
            code: 'TIMEOUT',
            message: 'Timeout lors de l\'appel',
          }),
        },
        createPendingSubscriptionPayment: async () => ({
          id: txId,
          metadata: { payment_provider: 'maishapay' },
          type: 'subscription',
          to_user_id: 'user-1',
          from_user_id: 'user-1',
          status: 'pending',
        }),
      }),
    });

    assert.equal(res.ok, false);
    assert.equal(res.uncertain, true);
    assert.equal(res.code, 'TIMEOUT');

    const claimCalls = supabase._state.rpcCalls.filter(c => c.fnName === 'claim_transaction_result');
    assert.equal(claimCalls.length, 0);
  });

  it('succès : phone_last3 stocké, numéro complet absent', async () => {
    const txId = '00000000-0000-0000-0000-000000000021';
    const supabase = createMockSupabase({
      transactions: {
        [txId]: {
          id: txId,
          type: 'subscription',
          to_user_id: 'user-1',
          from_user_id: 'user-1',
          status: 'pending',
          metadata: { payment_provider: 'maishapay' },
        },
      },
    });

    const res = await startPayment({
      userId: 'user-1',
      type: 'subscription',
      details: { phone: '+243812345678', provider: 'airtel_money', plan: 'standard' },
      deps: makeMinimalDeps(supabase, {
        createPendingSubscriptionPayment: async () => ({
          id: txId,
          metadata: { payment_provider: 'maishapay' },
          type: 'subscription',
          to_user_id: 'user-1',
          from_user_id: 'user-1',
          status: 'pending',
        }),
      }),
    });

    assert.equal(res.ok, true);
    assert.equal(res.transactionId, txId);
    assert.equal(res.providerTransactionId, 'MP-XYZ');

    const update = supabase._state.updateCalls.find(u => u.id === txId);
    assert.ok(update, 'Un update doit avoir été émis');
    assert.equal(update.fields.metadata.phone_last3, '678');
    assert.equal(update.fields.metadata.phone, undefined);
  });
});

// ─── Tests reconcilePayments ─────────────────────────────────────────────────

describe('reconcilePayments', () => {
  it('[C1] ne touche jamais une transaction non-maishapay', async () => {
    const supabase = createMockSupabase({
      transactions: {
        'stripe-tx': {
          id: 'stripe-tx',
          type: 'subscription',
          status: 'pending',
          metadata: { payment_provider: 'stripe' },
          effects_applied_at: null,
          created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          confirmed_at: null,
        },
      },
    });

    let checkCalled = false;
    const res = await reconcilePayments({
      deps: {
        supabase,
        maishapay: {
          buildReference: (id) => `xera_${id}`,
          checkStatus: async () => { checkCalled = true; return { status: 'succeeded' }; },
        },
        activateSubscription: async () => {},
        confirmSupportPayment: async () => {},
        logger: { warn: () => {}, error: () => {} },
      },
    });

    assert.equal(checkCalled, false, 'checkStatus ne doit pas être appelé pour non-maishapay');
    assert.equal(res.reconciledCount, 0);
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
          assert.equal(minIntervalSeconds, 0);
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
