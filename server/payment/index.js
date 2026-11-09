'use strict';

/**
 * server/payment/index.js
 *
 * Point d'entrée du module de paiement XERA.
 * Barrel export — ré-exporte toutes les fonctions publiques du provider MaishaPay.
 *
 * Usage dans le serveur (quand le branchement sera fait) :
 *   const { initiatePayment, checkStatus, parseWebhook } = require('./payment');
 *
 * Ce fichier est intentionnellement minimal : il ne contient aucune logique.
 * Pour ajouter un autre provider, créer server/payment/providers/<nom>.js
 * et mettre à jour ce fichier.
 */

const maishapay = require('./providers/maishapay');

module.exports = {
  // ── Fonctions API MaishaPay ──────────────────────────────────────────────
  initiatePayment: maishapay.initiatePayment,
  checkStatus:     maishapay.checkStatus,
  parseWebhook:    maishapay.parseWebhook,

  // ── Utilitaires ──────────────────────────────────────────────────────────
  normalizePhone:  maishapay.normalizePhone,
  mapProvider:     maishapay.mapProvider,
  validateAmount:  maishapay.validateAmount,
  buildReference:  maishapay.buildReference,
};
