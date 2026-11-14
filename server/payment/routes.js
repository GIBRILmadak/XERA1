'use strict';

/**
 * server/payment/routes.js
 *
 * Routes Express du système de paiement MaishaPay Mobile Money.
 * Branche : feat/maishapay-provider
 *
 * Expose :
 *  - POST /api/payments/initiate       : Initie un paiement Mobile Money
 *  - POST /api/maishapay/webhook       : Réception du webhook MaishaPay
 *  - GET  /api/payments/status/:id     : Consultation / rafraîchissement du statut
 */

const maishapayDefault = require('./providers/maishapay');
const orchestratorDefault = require('./orchestrator');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Enregistre les routes de paiement sur l'application Express.
 *
 * @param {import('express').Application} app
 * @param {object} deps - Dépendances requises (supabase, orchestrator, etc.)
 */
function registerPaymentRoutes(app, deps = {}) {
  const orchestrator = deps.orchestrator || orchestratorDefault;
  const maishapay = deps.maishapay || maishapayDefault;
  const logger = deps.logger || console;

  // ── 1. POST /api/payments/initiate ──────────────────────────────────────────
  app.post('/api/payments/initiate', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!token) return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: 'Non authentifié.' });
      const { data: authData, error: authError } = await deps.supabase.auth.getUser(token);
      const userId = (!authError && authData?.user?.id) ? authData.user.id : null;
      if (!userId) return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: 'Jeton invalide.' });

      const {
        type,
        phone,
        provider,
        currency = 'CDF',
        plan,
        billing_cycle,
        to_user_id,
        amount_usd,
        description,
        sender_name,
      } = req.body || {};

      const result = await orchestrator.startPayment({
        userId,
        type,
        details: {
          phone,
          provider,
          currency,
          plan,
          billing_cycle,
          to_user_id,
          amount_usd,
          description,
          sender_name,
          clientIp: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
        },
        deps,
      });

      if (result.ok) {
        return res.status(200).json(result);
      }

      if (result.uncertain) {
        // 202 Accepted : demande prise en compte mais statut non finalisé
        return res.status(202).json(result);
      }

      if (result.code === 'TOO_MANY_ATTEMPTS') {
        return res.status(429).json(result);
      }

      return res.status(400).json(result);

    } catch (error) {
      logger.error('[Payment Routes] Error in /api/payments/initiate:', error.message);
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'Une erreur interne est survenue lors de l’initiation du paiement.',
      });
    }
  });

  // ── 2. POST /api/maishapay/webhook ──────────────────────────────────────────
  app.post('/api/maishapay/webhook', async (req, res) => {
    try {
      // Récupérer le jeton secret dans la query (?t= ou ?token=)
      const queryToken = req.query?.t || req.query?.token;

      const parseResult = maishapay.parseWebhook(req.body, queryToken);

      if (!parseResult.valid) {
        logger.warn('[Payment Routes] Webhook rejeté : jeton secret invalide ou absent.');
        return res.status(401).json({ error: 'Webhook non autorisé.' });
      }

      const reference = parseResult.reference;

      // Traitement inline impératif pour l'environnement Serverless (Vercel)
      if (reference && maishapay.isValidReference(reference)) {
        const transactionId = reference.replace(/^xera_/i, '');

        try {
          // minIntervalSeconds: 0 pour forcer la vérification immédiate via checkStatus
          await orchestrator.touchThenFinalize({
            transactionId,
            minIntervalSeconds: 0,
            deps,
          });
        } catch (finalizeErr) {
          logger.error(`[Payment Routes] Erreur touchThenFinalize pour webhook ${reference}:`, finalizeErr.message);
        }
      }

      // Toujours accuser réception auprès de MaishaPay si le webhook est valide
      return res.status(200).json({ received: true });

    } catch (error) {
      logger.error('[Payment Routes] Exception in /api/maishapay/webhook:', error.message);
      return res.status(500).json({ error: 'Erreur lors du traitement du webhook.' });
    }
  });

  // ── 3. GET /api/payments/status/:id ─────────────────────────────────────────
  app.get('/api/payments/status/:id', async (req, res) => {
    try {
      const transactionId = req.params.id;

      if (!UUID_REGEX.test(transactionId)) {
        return res.status(400).json({ error: 'Identifiant de transaction invalide (UUID requis).' });
      }

      const supabase = deps.supabase;
      if (!supabase) {
        return res.status(500).json({ error: 'Client base de données indisponible.' });
      }

      // Auth stricte via getUser(token)
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!token) return res.status(401).json({ error: 'Non authentifié.' });
      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      const requestingUserId = (!authError && authData?.user?.id) ? authData.user.id : null;
      if (!requestingUserId) return res.status(401).json({ error: 'Jeton invalide.' });

      // 1. Charger la transaction d'abord
      const { data: tx, error: txError } = await supabase
        .from('transactions')
        .select('id, type, from_user_id, to_user_id, amount_gross, currency, status, confirmed_at, effects_applied_at, metadata')
        .eq('id', transactionId)
        .maybeSingle();

      if (txError || !tx) {
        return res.status(404).json({ error: 'Transaction introuvable.' });
      }

      // 2. Vérifier que l'utilisateur est le payeur (support: from_user_id, subscription: to_user_id)
      const payerUserId = tx.type === 'subscription' ? tx.to_user_id : tx.from_user_id;
      if (!payerUserId || payerUserId !== requestingUserId) {
        return res.status(404).json({ error: 'Transaction introuvable.' });
      }

      // 3. Tenter une vérification auprès du prestataire (minIntervalSeconds: 10)
      try {
        await orchestrator.touchThenFinalize({
          transactionId,
          minIntervalSeconds: 10,
          deps,
        });
      } catch (touchErr) {
        logger.warn(`[Payment Routes] Status check warning pour ${transactionId}:`, touchErr.message);
      }

      // 4. Recharger la transaction à jour
      const { data: updatedTx } = await supabase
        .from('transactions')
        .select('id, type, amount_gross, currency, status, confirmed_at, effects_applied_at, metadata')
        .eq('id', transactionId)
        .maybeSingle();

      const finalTx = updatedTx || tx;

      return res.status(200).json({
        id: finalTx.id,
        type: finalTx.type,
        amount: finalTx.amount_gross,
        currency: finalTx.currency,
        status: finalTx.status,
        confirmedAt: finalTx.confirmed_at,
        effectsApplied: Boolean(finalTx.effects_applied_at),
        message: finalTx.status === 'succeeded'
          ? 'Paiement confirmé avec succès.'
          : finalTx.status === 'failed'
            ? (finalTx.metadata?.failure_reason || 'Le paiement a échoué ou a été rejeté.')
            : 'En attente de confirmation.',
      });

    } catch (error) {
      logger.error('[Payment Routes] Error in /api/payments/status/:id:', error.message);
      return res.status(500).json({ error: 'Erreur lors de la consultation du statut.' });
    }
  });
}

module.exports = {
  registerPaymentRoutes,
};
