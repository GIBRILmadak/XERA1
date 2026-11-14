'use strict';

/**
 * server/payment/index.js
 *
 * Point d'entrée du module de paiement XERA.
 * Barrel export — ré-exporte toutes les fonctions publiques du provider MaishaPay.
 */

const maishapay = require('./providers/maishapay');

module.exports = {
  // ── Fonctions API MaishaPay ──────────────────────────────────────────────
  initiatePayment:  maishapay.initiatePayment,
  checkStatus:      maishapay.checkStatus,
  parseWebhook:     maishapay.parseWebhook,

  // ── Utilitaires ──────────────────────────────────────────────────────────
  normalizePhone:   maishapay.normalizePhone,
  mapProvider:      maishapay.mapProvider,
  validateAmount:   maishapay.validateAmount,
  buildReference:   maishapay.buildReference,
  formatAmount:     maishapay.formatAmount,
  isValidReference: maishapay.isValidReference,
};
