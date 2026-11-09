'use strict';

/**
 * server/payment/orchestrator.js
 *
 * Orchestrateur de paiement XERA (MaishaPay Mobile Money).
 * Branche : feat/maishapay-provider
 *
 * Toutes les fonctions acceptent un objet `deps` pour permettre une injection de
 * dépendances complète (testable sans Supabase, sans réseau, sans vraies clés).
 *
 * RÈGLES CRITIQUES :
 *  - uncertain:true => NE JAMAIS marquer la transaction failed et NE JAMAIS
 *    rappeler initiatePayment avec la même référence : seulement checkStatus.
 *  - Les clés, tokens et numéros de téléphone complets ne sont JAMAIS loggés.
 *  - Seul le suffixe (3 derniers chiffres) du numéro est conservé en base (phone_last3).
 */

const maishapayDefault = require('./providers/maishapay');

/**
 * Finalise une transaction de manière atomique via la procédure claim_transaction_result.
 * Si le statut est 'succeeded' et que la réclamation a réussi (ou que les effets n'ont
 * pas encore été appliqués), applique les effets métier correspondants.
 *
 * @param {object} params
 * @param {string} params.transactionId - UUID de la transaction
 * @param {'succeeded'|'failed'} params.status - Nouveau statut cible
 * @param {string} [params.providerTxId] - ID de transaction attribué par MaishaPay
 * @param {string} [params.reason] - Motif d'échec si status === 'failed'
 * @param {object} [params.deps] - Dépendances injectées (supabase, activateSubscription, etc.)
 * @returns {Promise<{ claimed: boolean, status: string, effectsApplied: boolean, transaction: object }>}
 */
async function finalizePayment({
  transactionId,
  status,
  providerTxId = null,
  reason = null,
  deps = {},
}) {
  if (!['succeeded', 'failed'].includes(status)) {
    throw new Error(`[Orchestrator] finalizePayment: statut invalide (${status}). 'succeeded' ou 'failed' attendu.`);
  }

  const supabase = deps.supabase;
  if (!supabase) {
    throw new Error('[Orchestrator] finalizePayment: client supabase obligatoire.');
  }

  // 1. Réclamation atomique en base via claim_transaction_result
  const { data: claimData, error: claimError } = await supabase.rpc('claim_transaction_result', {
    p_transaction_id: transactionId,
    p_new_status: status,
    p_provider_tx: providerTxId || null,
  });

  if (claimError) {
    deps.logger?.error?.(`[Orchestrator] claim_transaction_result error: ${claimError.message}`);
    throw claimError;
  }

  const row = Array.isArray(claimData) ? claimData[0] : claimData;
  const claimed = Boolean(row?.claimed);
  const tx = row?.transaction || null;

  if (!tx) {
    throw new Error(`[Orchestrator] Transaction ${transactionId} introuvable après réclamation.`);
  }

  let effectsApplied = false;

  // 2. Application des effets métier si le statut est 'succeeded'
  if (status === 'succeeded') {
    // Si la transaction n'a pas encore eu ses effets appliqués
    if (!tx.effects_applied_at) {
      const nowIso = new Date().toISOString();

      if (tx.type === 'subscription') {
        if (typeof deps.activateSubscription === 'function') {
          await deps.activateSubscription({
            pendingTransactionId: tx.id,
            userId: tx.from_user_id,
            plan: tx.metadata?.plan,
            billingCycle: tx.metadata?.billing_cycle,
            currency: tx.currency,
            amount: tx.amount_gross,
            transactionRefId: tx.metadata?.checkout_ref_id,
            operatorRefId: providerTxId || tx.provider_transaction_id,
            alreadyClaimed: true,
            confirmationSource: 'maishapay',
          });
          effectsApplied = true;
        }
      } else if (tx.type === 'support') {
        if (typeof deps.confirmSupportPayment === 'function') {
          await deps.confirmSupportPayment({
            pendingTransactionId: tx.id,
            fromUserId: tx.from_user_id,
            toUserId: tx.to_user_id,
            amountUsd: tx.amount_gross,
            checkoutCurrency: tx.metadata?.checkout_currency || tx.currency,
            checkoutAmount: tx.metadata?.checkout_amount || tx.amount_gross,
            description: tx.description,
            transactionRefId: tx.metadata?.checkout_ref_id,
            operatorRefId: providerTxId || tx.provider_transaction_id,
            alreadyClaimed: true,
            confirmationSource: 'maishapay',
          });
          effectsApplied = true;
        }
      }

      // Marquer l'horodatage d'application des effets de manière idempotente
      await supabase
        .from('transactions')
        .update({
          effects_applied_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', tx.id)
        .is('effects_applied_at', null);
    }
  } else if (status === 'failed') {
    if (claimed && reason) {
      const currentMetadata = tx.metadata && typeof tx.metadata === 'object' ? tx.metadata : {};
      await supabase
        .from('transactions')
        .update({
          metadata: {
            ...currentMetadata,
            failure_reason: reason,
            failed_at: new Date().toISOString(),
          },
        })
        .eq('id', tx.id);
    }
  }

  return {
    claimed,
    status,
    effectsApplied,
    transaction: tx,
  };
}

/**
 * Vérifie atomiquement l'éligibilité au rate-limiting (touch_status_check),
 * puis interroge MaishaPay (checkStatus) et finalise la transaction si un résultat définitif est obtenu.
 *
 * @param {object} params
 * @param {string} params.transactionId
 * @param {number} [params.minIntervalSeconds=10]
 * @param {object} [params.deps]
 * @returns {Promise<object>}
 */
async function touchThenFinalize({
  transactionId,
  minIntervalSeconds = 10,
  deps = {},
}) {
  if (!transactionId) {
    throw new Error('[Orchestrator] touchThenFinalize: transactionId obligatoire.');
  }

  const supabase = deps.supabase;
  const maishapay = deps.maishapay || maishapayDefault;

  // 1. Rate-limiting côté base
  if (minIntervalSeconds > 0) {
    const { data: allowed, error: touchError } = await supabase.rpc('touch_status_check', {
      p_transaction_id: transactionId,
      p_min_interval_seconds: minIntervalSeconds,
    });

    if (touchError) {
      deps.logger?.warn?.(`[Orchestrator] touch_status_check warning: ${touchError.message}`);
    } else if (allowed === false) {
      return {
        checked: false,
        skipped: true,
        reason: 'rate_limited',
        transactionId,
      };
    }
  }

  // 2. Récupérer l'état actuel de la transaction
  const { data: tx, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .maybeSingle();

  if (txError || !tx) {
    return {
      checked: false,
      error: 'Transaction introuvable',
      transactionId,
    };
  }

  // Statuts non modifiables
  if (['refunded', 'canceled'].includes(tx.status)) {
    return {
      checked: false,
      skipped: true,
      status: tx.status,
      reason: 'terminal_status',
      transaction: tx,
    };
  }

  // Si déjà 'succeeded'
  if (tx.status === 'succeeded') {
    // Si les effets n'ont jamais été appliqués, on s'assure qu'ils le sont
    if (!tx.effects_applied_at) {
      await finalizePayment({
        transactionId: tx.id,
        status: 'succeeded',
        providerTxId: tx.provider_transaction_id,
        deps,
      });
    }
    return {
      checked: false,
      skipped: true,
      status: 'succeeded',
      reason: 'already_succeeded',
      transaction: tx,
    };
  }

  // 3. Interroger MaishaPay
  const reference = maishapay.buildReference(transactionId);
  let checkResult;
  try {
    checkResult = await maishapay.checkStatus(reference);
  } catch (checkErr) {
    deps.logger?.warn?.(`[Orchestrator] checkStatus error pour ${reference}: ${checkErr.message}`);
    return {
      checked: true,
      status: tx.status,
      error: checkErr.message,
    };
  }

  // 4. Traiter le statut retourné
  if (checkResult.status === 'succeeded') {
    const finalized = await finalizePayment({
      transactionId,
      status: 'succeeded',
      providerTxId: checkResult.providerTransactionId || null,
      deps,
    });
    return {
      checked: true,
      status: 'succeeded',
      finalized,
      checkResult,
    };
  }

  if (checkResult.status === 'failed') {
    const finalized = await finalizePayment({
      transactionId,
      status: 'failed',
      providerTxId: checkResult.providerTransactionId || null,
      reason: 'Paiement non confirmé ou rejeté par MaishaPay',
      deps,
    });
    return {
      checked: true,
      status: 'failed',
      finalized,
      checkResult,
    };
  }

  // Sinon 'pending'
  return {
    checked: true,
    status: 'pending',
    checkResult,
  };
}

/**
 * Démarre un paiement Mobile Money avec MaishaPay :
 *  - Valide les données
 *  - Crée la transaction pending en base
 *  - Appelle initiatePayment
 *  - Traite les réponses (ok, uncertain, explicit rejection)
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {'subscription'|'support'} params.type
 * @param {object} params.details
 * @param {object} [params.deps]
 * @returns {Promise<object>}
 */
async function startPayment({
  userId,
  type,
  details = {},
  deps = {},
}) {
  const maishapay = deps.maishapay || maishapayDefault;
  const supabase = deps.supabase;

  if (!supabase) {
    throw new Error('[Orchestrator] startPayment: client supabase obligatoire.');
  }
  if (!['subscription', 'support'].includes(type)) {
    return {
      ok: false,
      uncertain: false,
      code: 'INVALID_TYPE',
      message: 'Type de paiement invalide (subscription ou support requis).',
    };
  }

  // 1. Validation du téléphone
  const normalizedPhone = maishapay.normalizePhone(details.phone);
  if (!normalizedPhone) {
    return {
      ok: false,
      uncertain: false,
      code: 'INVALID_PHONE',
      message: 'Numéro de téléphone invalide. Seuls les numéros RDC (+243...) sont supportés.',
    };
  }

  // 2. Validation de l'opérateur
  const providerCode = maishapay.mapProvider(details.provider);
  if (!providerCode) {
    return {
      ok: false,
      uncertain: false,
      code: 'UNSUPPORTED_PROVIDER',
      message: 'Opérateur Mobile Money non supporté. Opérateurs acceptés : Airtel Money, Orange Money, M-Pesa.',
    };
  }

  const requestedCurrency = String(details.currency || 'CDF').toUpperCase();
  let checkoutAmount = null;
  let checkoutCurrency = requestedCurrency;
  let pendingTx = null;

  // 3. Validation métier selon le type
  if (type === 'subscription') {
    const plan = String(details.plan || '').toLowerCase();
    const billingCycle = String(details.billing_cycle || 'monthly').toLowerCase() === 'annual' ? 'annual' : 'monthly';

    if (typeof deps.computeSubscriptionAmount !== 'function') {
      throw new Error('[Orchestrator] computeSubscriptionAmount non fourni.');
    }

    checkoutAmount = deps.computeSubscriptionAmount(plan, billingCycle, checkoutCurrency);
    if (!checkoutAmount) {
      return {
        ok: false,
        uncertain: false,
        code: 'INVALID_PLAN',
        message: 'Plan ou montant d’abonnement invalide.',
      };
    }

    if (typeof deps.createPendingSubscriptionPayment !== 'function') {
      throw new Error('[Orchestrator] createPendingSubscriptionPayment non fourni.');
    }

    pendingTx = await deps.createPendingSubscriptionPayment({
      userId,
      plan,
      billingCycle,
      currency: checkoutCurrency,
      amount: checkoutAmount,
      method: 'mobile_money',
      provider: details.provider,
      paymentProvider: 'maishapay',
    });

  } else if (type === 'support') {
    const toUserId = details.to_user_id;
    if (!toUserId) {
      return {
        ok: false,
        uncertain: false,
        code: 'MISSING_RECIPIENT',
        message: 'Destinataire du soutien obligatoire.',
      };
    }

    // Vérifier l'éligibilité du créateur
    if (typeof deps.getUserProfile === 'function') {
      const recipient = await deps.getUserProfile(toUserId);
      if (!recipient) {
        return {
          ok: false,
          uncertain: false,
          code: 'RECIPIENT_NOT_FOUND',
          message: 'Créateur destinataire introuvable.',
        };
      }
      if (typeof deps.canUserReceiveSupport === 'function' && !deps.canUserReceiveSupport(recipient)) {
        return {
          ok: false,
          uncertain: false,
          code: 'SUPPORT_NOT_ALLOWED',
          message: 'Ce créateur ne peut pas recevoir de soutien actuellement.',
        };
      }
    }

    const amountUsd = Number(details.amount_usd);
    if (typeof deps.computeSupportCheckoutAmount !== 'function') {
      throw new Error('[Orchestrator] computeSupportCheckoutAmount non fourni.');
    }

    checkoutAmount = deps.computeSupportCheckoutAmount(amountUsd, checkoutCurrency);
    if (!checkoutAmount) {
      return {
        ok: false,
        uncertain: false,
        code: 'INVALID_AMOUNT',
        message: 'Montant de soutien invalide (min $1, max $1000).',
      };
    }

    if (typeof deps.createPendingSupportPayment !== 'function') {
      throw new Error('[Orchestrator] createPendingSupportPayment non fourni.');
    }

    pendingTx = await deps.createPendingSupportPayment({
      fromUserId: userId,
      toUserId,
      amountUsd,
      checkoutAmount,
      checkoutCurrency,
      method: 'mobile_money',
      provider: details.provider,
      description: details.description,
      senderName: details.sender_name,
      paymentProvider: 'maishapay',
    });
  }

  const transactionId = pendingTx.id;
  const reference = maishapay.buildReference(transactionId);

  // 4. Appel initiatePayment auprès de MaishaPay
  let initResult;
  try {
    initResult = await maishapay.initiatePayment({
      reference,
      amount: checkoutAmount,
      currency: checkoutCurrency,
      phone: normalizedPhone,
      provider: providerCode,
    });
  } catch (err) {
    // Une exception inattendue réseau/timeout est par définition uncertain
    initResult = {
      ok: false,
      uncertain: true,
      code: 'NETWORK_ERROR',
      message: err.message,
    };
  }

  // 5. Gestion des réponses
  if (initResult.ok === true) {
    // Succès de l'initiation (push USSD envoyé au téléphone de l'utilisateur)
    await supabase
      .from('transactions')
      .update({
        provider_transaction_id: initResult.providerTransactionId || null,
        metadata: {
          ...(pendingTx.metadata || {}),
          phone_last3: normalizedPhone.slice(-3),
          provider_transaction_id: initResult.providerTransactionId || null,
          init_status: 'ok',
        },
      })
      .eq('id', transactionId);

    return {
      ok: true,
      transactionId,
      reference,
      providerTransactionId: initResult.providerTransactionId || null,
      message: 'Demande de paiement envoyée. Veuillez valider le message PIN sur votre téléphone.',
    };
  }

  if (initResult.uncertain === true) {
    // RÈGLE CRITIQUE : NE JAMAIS marquer failed sur uncertain:true.
    // Enregistrer l'état pour que checkStatus puisse résoudre la transaction.
    await supabase
      .from('transactions')
      .update({
        metadata: {
          ...(pendingTx.metadata || {}),
          phone_last3: normalizedPhone.slice(-3),
          uncertain_init: true,
          uncertain_code: initResult.code,
          uncertain_message: initResult.message,
        },
      })
      .eq('id', transactionId);

    return {
      ok: false,
      uncertain: true,
      transactionId,
      reference,
      code: initResult.code,
      message: initResult.message || 'La demande est en cours de traitement. Vérifiez votre téléphone.',
    };
  }

  // ok === false et uncertain === false : Rejet explicite documenté (ex: 4xx)
  await finalizePayment({
    transactionId,
    status: 'failed',
    reason: initResult.message,
    deps,
  });

  return {
    ok: false,
    uncertain: false,
    transactionId,
    code: initResult.code,
    message: initResult.message,
  };
}

/**
 * Réconcilie les paiements en attente (destiné aux crons).
 *
 * @param {object} params
 * @param {number} [params.limit=20]
 * @param {number} [params.maxAgeMinutes=120]
 * @param {number} [params.minIntervalSeconds=60]
 * @param {object} [params.deps]
 * @returns {Promise<{ reconciledCount: number, results: Array }>}
 */
async function reconcilePayments({
  limit = 20,
  maxAgeMinutes = 120,
  minIntervalSeconds = 60,
  deps = {},
} = {}) {
  const supabase = deps.supabase;
  if (!supabase) {
    throw new Error('[Orchestrator] reconcilePayments: client supabase obligatoire.');
  }

  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from('transactions')
    .select('id, created_at, last_status_check_at')
    .eq('status', 'pending')
    .eq('metadata->>payment_provider', 'maishapay')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    deps.logger?.error?.(`[Orchestrator] reconcilePayments error fetching transactions: ${error.message}`);
    throw error;
  }

  const results = [];
  for (const row of rows || []) {
    try {
      const res = await touchThenFinalize({
        transactionId: row.id,
        minIntervalSeconds,
        deps,
      });
      results.push({ id: row.id, ...res });
    } catch (err) {
      results.push({ id: row.id, error: err.message });
    }
  }

  return {
    reconciledCount: results.length,
    results,
  };
}

/**
 * Factory pour instancier l'orchestrateur avec ses dépendances liées par défaut.
 */
function createPaymentOrchestrator(defaultDeps = {}) {
  return {
    finalizePayment: (params) => finalizePayment({ ...params, deps: { ...defaultDeps, ...params?.deps } }),
    touchThenFinalize: (params) => touchThenFinalize({ ...params, deps: { ...defaultDeps, ...params?.deps } }),
    startPayment: (params) => startPayment({ ...params, deps: { ...defaultDeps, ...params?.deps } }),
    reconcilePayments: (params) => reconcilePayments({ ...params, deps: { ...defaultDeps, ...params?.deps } }),
  };
}

module.exports = {
  finalizePayment,
  touchThenFinalize,
  startPayment,
  reconcilePayments,
  createPaymentOrchestrator,
};
