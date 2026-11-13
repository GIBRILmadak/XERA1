'use strict';

/**
 * server/payment/orchestrator.js
 *
 * Orchestrateur de paiement XERA (MaishaPay Mobile Money).
 * Branche : feat/maishapay-provider
 *
 * RÈGLES CRITIQUES :
 *  - uncertain:true => NE JAMAIS marquer la transaction failed et NE JAMAIS
 *    rappeler initiatePayment avec la même référence : seulement checkStatus.
 *  - Les clés, tokens et numéros de téléphone complets ne sont JAMAIS loggés.
 *  - Seul le suffixe (3 derniers chiffres) du numéro est conservé en base (phone_last3).
 *  - canApply guard : deux appelants simultanés (webhook + polling) ne jouent les effets qu'une fois.
 *  - effects_applied_at est posé APRÈS un appel réussi, jamais avant.
 */

const crypto = require('crypto');
const maishapayDefault = require('./providers/maishapay');

/**
 * Finalise une transaction de manière atomique via la procédure claim_transaction_result.
 * Si le statut est 'succeeded' et que canApply est vrai, applique les effets métier.
 *
 * canApply = claimed || (!tx.effects_applied_at && confirmedAgeMs > 120000)
 * → Protège contre les doubles appels simultanés (webhook + polling).
 *
 * @param {object} params
 * @param {string} params.transactionId
 * @param {'succeeded'|'failed'} params.status
 * @param {string} [params.providerTxId]
 * @param {string} [params.reason]
 * @param {object} [params.deps]
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
    const confirmedAgeMs = tx.confirmed_at
      ? Date.now() - new Date(tx.confirmed_at).getTime()
      : 0;

    // canApply : claimed atomiquement OU effets pas encore appliqués ET confirmation ancienne (>2 min)
    const canApply = claimed || (!tx.effects_applied_at && confirmedAgeMs > 120000);

    if (canApply && !tx.effects_applied_at) {
      const nowIso = new Date().toISOString();

      if (tx.type === 'subscription') {
        // Pour un abonnement, le bénéficiaire est to_user_id (avec repli sur from_user_id)
        const subscriberId = tx.to_user_id || tx.from_user_id;
        if (!subscriberId) {
          throw new Error(`[Orchestrator] finalizePayment: aucun utilisateur trouvé pour l'abonnement ${tx.id}.`);
        }
        if (typeof deps.activateSubscription !== 'function') {
          throw new Error('[Orchestrator] finalizePayment: deps.activateSubscription doit être une fonction.');
        }

        await deps.activateSubscription({
          pendingTransactionId: tx.id,
          userId: subscriberId,
          plan: tx.metadata?.plan,
          billingCycle: tx.metadata?.billing_cycle,
          currency: tx.currency,
          amount: tx.amount_gross,
          transactionRefId: tx.metadata?.checkout_ref_id,
          operatorRefId: providerTxId || tx.provider_transaction_id,
          alreadyClaimed: claimed,
          confirmationSource: 'maishapay',
        });

      } else if (tx.type === 'support') {
        if (typeof deps.confirmSupportPayment !== 'function') {
          throw new Error('[Orchestrator] finalizePayment: deps.confirmSupportPayment doit être une fonction.');
        }

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
          alreadyClaimed: claimed,
          confirmationSource: 'maishapay',
        });
      }

      // Marquer effects_applied_at APRÈS l'appel réussi, de manière idempotente
      await supabase
        .from('transactions')
        .update({
          effects_applied_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', tx.id)
        .is('effects_applied_at', null);

      effectsApplied = true;
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
 * ORDRE CORRIGÉ :
 *  1. Charge la transaction (SELECT)
 *  2. Vérifie payment_provider et type (retourne not_maishapay si incompatible)
 *  3. Vérifie statuts terminaux
 *  4. touch_status_check (rate-limit)
 *  5. checkStatus + finalizePayment
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

  // 1. Charger la transaction AVANT le touch_status_check
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

  // 2. Vérifier que c'est bien une transaction MaishaPay valide
  const isMaishaPay = tx.metadata?.payment_provider === 'maishapay';
  const isValidType = ['subscription', 'support'].includes(tx.type);
  if (!isMaishaPay || !isValidType) {
    return {
      checked: false,
      skipped: true,
      reason: 'not_maishapay',
      transactionId,
    };
  }

  // 3. Statuts terminaux non modifiables
  if (['refunded', 'canceled'].includes(tx.status)) {
    return {
      checked: false,
      skipped: true,
      status: tx.status,
      reason: 'terminal_status',
      transaction: tx,
    };
  }

  // Si déjà 'succeeded' : s'assurer que les effets sont appliqués si manquants
  if (tx.status === 'succeeded') {
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

  // 4. Rate-limiting côté base via touch_status_check (APRÈS vérification du type)
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

  // 5. Interroger MaishaPay
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

  // 6. Traiter le statut retourné
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

  return {
    checked: true,
    status: 'pending',
    checkResult,
  };
}

/**
 * Démarre un paiement Mobile Money avec MaishaPay :
 *  - Valide téléphone, opérateur, devise (CDF/USD uniquement)
 *  - Anti double-clic 90s
 *  - Rate-limit : 5 initiations/user/10min + 3/numéro/10min
 *  - Crée la transaction pending en base
 *  - Stocke phone_hash (HMAC-SHA256) + phone_last3 uniquement
 *  - Appelle initiatePayment
 *  - Traite les réponses (ok, uncertain, rejection explicite)
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

  // 3. Validation de la devise (CDF ou USD uniquement)
  const requestedCurrency = String(details.currency || 'CDF').toUpperCase();
  if (!['CDF', 'USD'].includes(requestedCurrency)) {
    return {
      ok: false,
      uncertain: false,
      code: 'INVALID_CURRENCY',
      message: 'Devise non supportée. Utilisez CDF ou USD.',
    };
  }

  // HMAC-SHA256 du numéro normalisé pour le rate-limiting par numéro
  const webhookSecret = deps.webhookToken || process.env.MAISHAPAY_WEBHOOK_TOKEN || 'xera_phone_hash_salt';
  const phoneHash = crypto.createHmac('sha256', webhookSecret).update(normalizedPhone).digest('hex');

  const nowMs = Date.now();
  const antiDoubleClickCutoff = new Date(nowMs - 90 * 1000).toISOString();
  const tenMinAgo = new Date(nowMs - 10 * 60 * 1000).toISOString();

  // 4. Contrôles en base AVANT de créer la transaction
  // a) Anti double-clic (90s) — retourne la transaction existante si déjà en attente
  if (type === 'subscription') {
    const plan = String(details.plan || '').toLowerCase();
    const { data: recentPendingSub } = await supabase
      .from('transactions')
      .select('id, metadata, created_at, status')
      .eq('status', 'pending')
      .eq('to_user_id', userId)
      .eq('type', 'subscription')
      .eq('metadata->>payment_provider', 'maishapay')
      .eq('metadata->>plan', plan)
      .gte('created_at', antiDoubleClickCutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentPendingSub) {
      const reference = maishapay.buildReference(recentPendingSub.id);
      return {
        ok: true,
        deduplicated: true,
        transactionId: recentPendingSub.id,
        reference,
        providerTransactionId: recentPendingSub.metadata?.provider_transaction_id || null,
        message: 'Demande de paiement déjà envoyée. Veuillez valider le message PIN sur votre téléphone.',
      };
    }
  } else if (type === 'support') {
    const toUserId = details.to_user_id;
    if (toUserId) {
      const { data: recentPendingSupport } = await supabase
        .from('transactions')
        .select('id, metadata, created_at, status')
        .eq('status', 'pending')
        .eq('from_user_id', userId)
        .eq('to_user_id', toUserId)
        .eq('type', 'support')
        .eq('metadata->>payment_provider', 'maishapay')
        .gte('created_at', antiDoubleClickCutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentPendingSupport) {
        const reference = maishapay.buildReference(recentPendingSupport.id);
        return {
          ok: true,
          deduplicated: true,
          transactionId: recentPendingSupport.id,
          reference,
          providerTransactionId: recentPendingSupport.metadata?.provider_transaction_id || null,
          message: 'Demande de paiement déjà envoyée. Veuillez valider le message PIN sur votre téléphone.',
        };
      }
    }
  }

  // b) Maximum 5 initiations par utilisateur sur 10 minutes (support + subscription confondus)
  const { count: supportUserCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'support')
    .eq('from_user_id', userId)
    .eq('metadata->>payment_provider', 'maishapay')
    .gte('created_at', tenMinAgo);

  const { count: subUserCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'subscription')
    .eq('to_user_id', userId)
    .eq('metadata->>payment_provider', 'maishapay')
    .gte('created_at', tenMinAgo);

  const totalUserAttempts = (supportUserCount || 0) + (subUserCount || 0);
  if (totalUserAttempts >= 5) {
    return {
      ok: false,
      uncertain: false,
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Trop de tentatives de paiement. Veuillez patienter avant de réessayer.',
    };
  }

  // c) Maximum 3 initiations par numéro sur 10 minutes, tous utilisateurs confondus
  const { count: phoneAttempts } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('metadata->>payment_provider', 'maishapay')
    .eq('metadata->>phone_hash', phoneHash)
    .gte('created_at', tenMinAgo);

  if ((phoneAttempts || 0) >= 3) {
    return {
      ok: false,
      uncertain: false,
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Trop de tentatives avec ce numéro de téléphone. Veuillez patienter avant de réessayer.',
    };
  }

  let checkoutAmount = null;
  let checkoutCurrency = requestedCurrency;
  let pendingTx = null;

  // 5. Validation métier selon le type et création de la transaction pending
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
        message: 'Plan ou montant d\'abonnement invalide.',
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

    if (typeof deps.getUserProfile === 'function') {
      const recipient = await deps.getUserProfile(toUserId);
      if (!recipient) {
        return { ok: false, uncertain: false, code: 'RECIPIENT_NOT_FOUND', message: 'Créateur destinataire introuvable.' };
      }
      if (typeof deps.canUserReceiveSupport === 'function' && !deps.canUserReceiveSupport(recipient)) {
        return { ok: false, uncertain: false, code: 'SUPPORT_NOT_ALLOWED', message: 'Ce créateur ne peut pas recevoir de soutien actuellement.' };
      }
    }

    const amountUsd = Number(details.amount_usd);
    if (typeof deps.computeSupportCheckoutAmount !== 'function') {
      throw new Error('[Orchestrator] computeSupportCheckoutAmount non fourni.');
    }

    checkoutAmount = deps.computeSupportCheckoutAmount(amountUsd, checkoutCurrency);
    if (!checkoutAmount) {
      return { ok: false, uncertain: false, code: 'INVALID_AMOUNT', message: 'Montant de soutien invalide (min $1, max $1000).' };
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

  // Stocker metadata.phone_hash et metadata.phone_last3 juste après création
  await supabase
    .from('transactions')
    .update({
      metadata: {
        ...(pendingTx.metadata || {}),
        phone_hash: phoneHash,
        phone_last3: normalizedPhone.slice(-3),
      },
    })
    .eq('id', transactionId);

  // 6. Appel initiatePayment auprès de MaishaPay
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
    initResult = {
      ok: false,
      uncertain: true,
      code: 'NETWORK_ERROR',
      message: err.message,
    };
  }

  // 7. Gestion des réponses
  if (initResult.ok === true) {
    await supabase
      .from('transactions')
      .update({
        provider_transaction_id: initResult.providerTransactionId || null,
        metadata: {
          ...(pendingTx.metadata || {}),
          phone_hash: phoneHash,
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
    await supabase
      .from('transactions')
      .update({
        metadata: {
          ...(pendingTx.metadata || {}),
          phone_hash: phoneHash,
          phone_last3: normalizedPhone.slice(-3),
          uncertain_init: true,
          uncertain_code: initResult.code,
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

  // ok === false et uncertain === false : rejet explicite documenté (ex: 4xx non-429)
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
 * Réconcilie les paiements MaishaPay en attente ou échoués (destiné aux crons).
 *
 * 3 catégories traitées :
 *  (a) pending entre 2 min et 24 h
 *  (b) failed depuis moins de 3 h (paiement tardif possible)
 *  (c) succeeded sans effects_applied_at et confirmed_at > 2 min
 *
 * Déduplication par Map (un seul passage par transaction_id).
 * Pause 700 ms entre chaque appel MaishaPay pour éviter le rate-limiting.
 *
 * @param {object} params
 * @param {number} [params.limit=20]
 * @param {number} [params.minIntervalSeconds=60]
 * @param {object} [params.deps]
 * @returns {Promise<{ reconciledCount: number, results: Array }>}
 */
async function reconcilePayments({
  limit = 20,
  minIntervalSeconds = 60,
  deps = {},
} = {}) {
  const supabase = deps.supabase;
  if (!supabase) {
    throw new Error('[Orchestrator] reconcilePayments: client supabase obligatoire.');
  }

  const now = new Date();
  const twoMinAgo = new Date(now - 2 * 60 * 1000).toISOString();
  const twentyFourHAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const threeHAgo = new Date(now - 3 * 60 * 60 * 1000).toISOString();

  // (a) pending entre 2 min et 24 h
  const { data: pendingRows, error: pendingErr } = await supabase
    .from('transactions')
    .select('id, created_at')
    .eq('status', 'pending')
    .eq('metadata->>payment_provider', 'maishapay')
    .gte('created_at', twentyFourHAgo)
    .lte('created_at', twoMinAgo)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (pendingErr) {
    deps.logger?.error?.(`[Orchestrator] reconcilePayments error fetching pending: ${pendingErr.message}`);
  }

  // (b) failed depuis moins de 3 h (paiement tardif)
  const { data: failedRows, error: failedErr } = await supabase
    .from('transactions')
    .select('id, created_at')
    .eq('status', 'failed')
    .eq('metadata->>payment_provider', 'maishapay')
    .gte('created_at', threeHAgo)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (failedErr) {
    deps.logger?.error?.(`[Orchestrator] reconcilePayments error fetching failed: ${failedErr.message}`);
  }

  // (c) succeeded : effects_applied_at NULL et confirmed_at > 2 min
  const { data: succRows, error: succErr } = await supabase
    .from('transactions')
    .select('id, confirmed_at')
    .eq('status', 'succeeded')
    .eq('metadata->>payment_provider', 'maishapay')
    .is('effects_applied_at', null)
    .lte('confirmed_at', twoMinAgo)
    .order('confirmed_at', { ascending: true })
    .limit(limit);

  if (succErr) {
    deps.logger?.error?.(`[Orchestrator] reconcilePayments error fetching succeeded: ${succErr.message}`);
  }

  // Déduplication par Map (preserve first occurrence)
  const seen = new Map();
  for (const r of [...(pendingRows || []), ...(failedRows || []), ...(succRows || [])]) {
    if (!seen.has(r.id)) seen.set(r.id, r);
  }

  const toProcess = Array.from(seen.values()).slice(0, limit);
  const results = [];

  for (const row of toProcess) {
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
    // Pause entre appels pour éviter le rate-limiting MaishaPay
    if (toProcess.indexOf(row) < toProcess.length - 1) {
      await new Promise(r => setTimeout(r, 700));
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
