'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

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
 *  - auth.getUser(token)
 *  - rpc('touch_status_check') / rpc('claim_transaction_result')
 *  - from('transactions').select().eq().maybeSingle() / single()
 *  - from('transactions').select(..., { count:'exact', head:true }).eq(...).gte(...)
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
      if (col === 'currency' && tx.currency !== val) return false;
      if (col === 'amount_gross' && Number(tx.amount_gross) !== Number(val)) return false;
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
    auth: {
      getUser: async (token) => {
        if (!token || token === 'BAD_TOKEN') {
          return { data: { user: null }, error: new Error('Invalid token') };
        }
        return {
          data: {
            user: {
              id: initialState.mockUserId || 'user-auth-1',
              email: 'auth@test.com',
            },
          },
          error: null,
        };
      },
    },
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
              if (tx) {
                if (fields.metadata) {
                  tx.metadata = { ...(tx.metadata || {}), ...fields.metadata };
                }
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

  it('[P3-F] phone_hash conservé dans metadata en cas d\'échec (finalizePayment status=failed)', async () => {
    const txId = '00000000-0000-0000-0000-000000000004';
    const testHash = 'abcdef0123456789';
    const supabase = createMockSupabase({
      transactions: {
        [txId]: {
          id: txId,
          type: 'subscription',
          status: 'pending',
          metadata: { payment_provider: 'maishapay', phone_hash: testHash, phone_last3: '789' },
        },
      },
    });

    await finalizePayment({
      transactionId: txId,
      status: 'failed',
      reason: 'Paiement rejeté',
      deps: { supabase },
    });

    const tx = supabase._state.transactions.get(txId);
    assert.equal(tx.status, 'failed');
    assert.equal(tx.metadata.phone_hash, testHash, 'phone_hash doit être préservé après finalizePayment failed');
    assert.equal(tx.metadata.failure_reason, 'Paiement rejeté');
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
      webhookToken: 'test-webhook-token',
      maishapay: {
        normalizePhone: (p) => p,
        mapProvider: () => 'AIRTEL',
        buildReference: (id) => `xera_${id}`,
        initiatePayment: async () => ({ ok: true, providerTransactionId: 'MP-XYZ' }),
      },
      computeSubscriptionAmount: () => 8500,
      computeSupportCheckoutAmount: () => 28000,
      createPendingSubscriptionPayment: async () => ({
        id: '00000000-0000-0000-0000-000000000099',
        metadata: { payment_provider: 'maishapay' },
        type: 'subscription',
        to_user_id: 'user-1',
        from_user_id: 'user-1',
        currency: 'CDF',
        status: 'pending',
      }),
      createPendingSupportPayment: async ({ fromUserId, toUserId, amountUsd }) => ({
        id: '00000000-0000-0000-0000-000000000098',
        metadata: { payment_provider: 'maishapay' },
        type: 'support',
        from_user_id: fromUserId,
        to_user_id: toUserId,
        amount_gross: amountUsd,
        currency: 'USD',
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

  it('[B2] anti-doublon pending <90s → transaction dédupliquée si phone_hash et montant/plan identiques', async () => {
    const existingId = '00000000-0000-0000-0000-000000000050';
    const phone = '+243812345678';
    const webhookToken = 'test-webhook-token';
    const phoneHash = crypto.createHmac('sha256', webhookToken).update(phone).digest('hex');

    const supabase = createMockSupabase({
      transactions: {
        [existingId]: {
          id: existingId,
          type: 'subscription',
          status: 'pending',
          to_user_id: 'user-1',
          from_user_id: 'user-1',
          currency: 'CDF',
          created_at: new Date(Date.now() - 30000).toISOString(),
          metadata: {
            payment_provider: 'maishapay',
            plan: 'standard',
            phone_hash: phoneHash,
            provider_transaction_id: 'MP-EXISTING',
          },
        },
      },
    });

    let initiateCalled = false;
    const res = await startPayment({
      userId: 'user-1',
      type: 'subscription',
      details: { phone, provider: 'airtel_money', plan: 'standard', currency: 'CDF' },
      deps: makeMinimalDeps(supabase, {
        webhookToken,
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

  it('[P5-1] correction de numéro dans les 90 s => nouvelle transaction', async () => {
    const existingId = '00000000-0000-0000-0000-000000000051';
    const oldPhone = '+243812345678';
    const newPhone = '+243999999999';
    const webhookToken = 'test-webhook-token';
    const oldPhoneHash = crypto.createHmac('sha256', webhookToken).update(oldPhone).digest('hex');

    const supabase = createMockSupabase({
      transactions: {
        [existingId]: {
          id: existingId,
          type: 'subscription',
          status: 'pending',
          to_user_id: 'user-1',
          currency: 'CDF',
          created_at: new Date(Date.now() - 30000).toISOString(),
          metadata: {
            payment_provider: 'maishapay',
            plan: 'standard',
            phone_hash: oldPhoneHash,
          },
        },
      },
    });

    let initiateCalled = false;
    const res = await startPayment({
      userId: 'user-1',
      type: 'subscription',
      details: { phone: newPhone, provider: 'airtel_money', plan: 'standard', currency: 'CDF' },
      deps: makeMinimalDeps(supabase, {
        webhookToken,
        maishapay: {
          normalizePhone: (p) => p,
          mapProvider: () => 'AIRTEL',
          buildReference: (id) => `xera_${id}`,
          initiatePayment: async () => { initiateCalled = true; return { ok: true, providerTransactionId: 'MP-NEW' }; },
        },
      }),
    });

    assert.equal(res.ok, true);
    assert.notEqual(res.transactionId, existingId, 'Doit créer une nouvelle transaction car le numéro a changé');
    assert.equal(initiateCalled, true);
  });

  it('[P5-2] montant différent (support) dans les 90 s => nouvelle transaction', async () => {
    const existingId = '00000000-0000-0000-0000-000000000052';
    const phone = '+243812345678';
    const webhookToken = 'test-webhook-token';
    const phoneHash = crypto.createHmac('sha256', webhookToken).update(phone).digest('hex');

    const supabase = createMockSupabase({
      transactions: {
        [existingId]: {
          id: existingId,
          type: 'support',
          status: 'pending',
          from_user_id: 'user-1',
          to_user_id: 'creator-99',
          amount_gross: 10,
          created_at: new Date(Date.now() - 30000).toISOString(),
          metadata: {
            payment_provider: 'maishapay',
            phone_hash: phoneHash,
          },
        },
      },
    });

    let initiateCalled = false;
    const res = await startPayment({
      userId: 'user-1',
      type: 'support',
      details: {
        phone,
        provider: 'airtel_money',
        to_user_id: 'creator-99',
        amount_usd: 25, // montant différent de 10
      },
      deps: makeMinimalDeps(supabase, {
        webhookToken,
        maishapay: {
          normalizePhone: (p) => p,
          mapProvider: () => 'AIRTEL',
          buildReference: (id) => `xera_${id}`,
          initiatePayment: async () => { initiateCalled = true; return { ok: true, providerTransactionId: 'MP-SUPPORT' }; },
        },
      }),
    });

    assert.equal(res.ok, true);
    assert.notEqual(res.transactionId, existingId, 'Doit créer une nouvelle transaction car le montant est différent');
    assert.equal(initiateCalled, true);
  });

  it('[P5-3] devise/plan différent (subscription) dans les 90 s => nouvelle transaction', async () => {
    const existingId = '00000000-0000-0000-0000-000000000053';
    const phone = '+243812345678';
    const webhookToken = 'test-webhook-token';
    const phoneHash = crypto.createHmac('sha256', webhookToken).update(phone).digest('hex');

    const supabase = createMockSupabase({
      transactions: {
        [existingId]: {
          id: existingId,
          type: 'subscription',
          status: 'pending',
          to_user_id: 'user-1',
          currency: 'CDF',
          created_at: new Date(Date.now() - 30000).toISOString(),
          metadata: {
            payment_provider: 'maishapay',
            plan: 'standard',
            phone_hash: phoneHash,
          },
        },
      },
    });

    const res = await startPayment({
      userId: 'user-1',
      type: 'subscription',
      details: { phone, provider: 'airtel_money', plan: 'standard', currency: 'USD' }, // devise différente
      deps: makeMinimalDeps(supabase, { webhookToken }),
    });

    assert.equal(res.ok, true);
    assert.notEqual(res.transactionId, existingId, 'Doit créer une nouvelle transaction car la devise est différente');
  });

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

  it('[P5-4] phone_hash et phone_last3 conservés dans metadata après succès d\'initiation', async () => {
    const txId = '00000000-0000-0000-0000-000000000021';
    const webhookToken = 'test-token';
    const phone = '+243812345678';
    const expectedHash = crypto.createHmac('sha256', webhookToken).update(phone).digest('hex');

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
      details: { phone, provider: 'airtel_money', plan: 'standard' },
      deps: makeMinimalDeps(supabase, {
        webhookToken,
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

    // Vérifier l'état final en base
    const storedTx = supabase._state.transactions.get(txId);
    assert.ok(storedTx.metadata.phone_hash, 'phone_hash doit être présent');
    assert.equal(storedTx.metadata.phone_hash, expectedHash);
    assert.equal(storedTx.metadata.phone_last3, '678');
    assert.equal(storedTx.metadata.init_status, 'ok');
    assert.equal(storedTx.metadata.phone, undefined, 'Numéro complet ne doit jamais être présent');
  });

  it('[P5-5] phone_hash et phone_last3 conservés dans metadata après initiation uncertain', async () => {
    const txId = '00000000-0000-0000-0000-000000000022';
    const webhookToken = 'test-token';
    const phone = '+243812345678';
    const expectedHash = crypto.createHmac('sha256', webhookToken).update(phone).digest('hex');

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
      details: { phone, provider: 'airtel_money', plan: 'standard' },
      deps: makeMinimalDeps(supabase, {
        webhookToken,
        maishapay: {
          normalizePhone: (p) => p,
          mapProvider: () => 'AIRTEL',
          buildReference: (id) => `xera_${id}`,
          initiatePayment: async () => ({ ok: false, uncertain: true, code: 'TIMEOUT', message: 'Délai dépassé' }),
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

    const storedTx = supabase._state.transactions.get(txId);
    assert.ok(storedTx.metadata.phone_hash, 'phone_hash doit être conservé');
    assert.equal(storedTx.metadata.phone_hash, expectedHash);
    assert.equal(storedTx.metadata.phone_last3, '678');
    assert.equal(storedTx.metadata.uncertain_init, true);
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

  it('[P5-6] POST /api/payments/initiate : jeton absent => 401', async () => {
    const app = createMockApp();
    const supabase = createMockSupabase();
    registerPaymentRoutes(app, { supabase });

    const res = await app._dispatch('POST', '/api/payments/initiate', { headers: {}, body: {} });
    assert.equal(res.status, 401);
  });

  it('[P5-7] POST /api/payments/initiate : jeton invalide => 401', async () => {
    const app = createMockApp();
    const supabase = createMockSupabase();
    registerPaymentRoutes(app, { supabase });

    const res = await app._dispatch('POST', '/api/payments/initiate', {
      headers: { authorization: 'Bearer BAD_TOKEN' },
      body: {},
    });
    assert.equal(res.status, 401);
  });

  it('[P5-8] POST /api/payments/initiate : user_id du corps ignoré, identifiant pris du jeton', async () => {
    const app = createMockApp();
    const supabase = createMockSupabase({ mockUserId: 'legit-user-42' });
    let passedUserId = null;

    registerPaymentRoutes(app, {
      supabase,
      orchestrator: {
        startPayment: async ({ userId }) => {
          passedUserId = userId;
          return { ok: true, transactionId: 'tx-1' };
        },
      },
    });

    const res = await app._dispatch('POST', '/api/payments/initiate', {
      headers: { authorization: 'Bearer VALID_TOKEN' },
      body: { user_id: 'attacker-injected-id', type: 'subscription' },
    });

    assert.equal(res.status, 200);
    assert.equal(passedUserId, 'legit-user-42', 'userId doit provenir du jeton décodé, jamais du body');
    assert.notEqual(passedUserId, 'attacker-injected-id');
  });

  it('[P5-9] GET /api/payments/status/:id : jeton absent => 401', async () => {
    const app = createMockApp();
    const supabase = createMockSupabase();
    registerPaymentRoutes(app, { supabase });

    const res = await app._dispatch('GET', '/api/payments/status/00000000-0000-0000-0000-000000000001', {
      headers: {},
    });
    assert.equal(res.status, 401);
  });

  it('[P5-10] GET /api/payments/status/:id : non-payeur => 404', async () => {
    const app = createMockApp();
    const txId = '00000000-0000-0000-0000-000000000088';
    const supabase = createMockSupabase({
      mockUserId: 'other-user',
      transactions: {
        [txId]: {
          id: txId,
          type: 'subscription',
          to_user_id: 'real-payer', // payeur différent de 'other-user'
          status: 'pending',
        },
      },
    });

    let touchCalled = false;
    registerPaymentRoutes(app, {
      supabase,
      orchestrator: {
        touchThenFinalize: async () => { touchCalled = true; },
      },
    });

    const res = await app._dispatch('GET', `/api/payments/status/${txId}`, {
      headers: { authorization: 'Bearer VALID_TOKEN' },
    });

    assert.equal(res.status, 404, 'Doit renvoyer 404 si l\'utilisateur n\'est pas le payeur');
    assert.equal(touchCalled, false, 'Ne doit pas appeler touchThenFinalize si non-payeur');
  });

  it('[P5-11] GET /api/payments/status/:id : payeur authentifié => 200 et touchThenFinalize appelé', async () => {
    const app = createMockApp();
    const txId = '00000000-0000-0000-0000-000000000089';
    const supabase = createMockSupabase({
      mockUserId: 'real-payer',
      transactions: {
        [txId]: {
          id: txId,
          type: 'subscription',
          to_user_id: 'real-payer',
          amount_gross: 2.99,
          currency: 'USD',
          status: 'succeeded',
          confirmed_at: '2026-11-13T10:00:00Z',
          effects_applied_at: '2026-11-13T10:01:00Z',
        },
      },
    });

    let touchCalled = false;
    registerPaymentRoutes(app, {
      supabase,
      orchestrator: {
        touchThenFinalize: async ({ transactionId, minIntervalSeconds }) => {
          assert.equal(transactionId, txId);
          assert.equal(minIntervalSeconds, 10);
          touchCalled = true;
        },
      },
    });

    const res = await app._dispatch('GET', `/api/payments/status/${txId}`, {
      headers: { authorization: 'Bearer VALID_TOKEN' },
    });

    assert.equal(res.status, 200);
    assert.equal(touchCalled, true);
    assert.equal(res.body.status, 'succeeded');
    assert.equal(res.body.effectsApplied, true);
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
