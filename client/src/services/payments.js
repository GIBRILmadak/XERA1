/**
 * Paiements (soutiens, abonnements, Elite, crédits) : réutilise tel quel le module Mobile Money
 * de l'ancienne interface (js/mobile-money-modal.js → window.XeraMobileMoney),
 * pour ne rien changer au parcours de paiement ni aux appels /api/payments/*.
 */
import { API_BASE, getAccessToken } from './api';

let loading = null;

function loadModule() {
  if (window.XeraMobileMoney?.openCheckout) return Promise.resolve();
  if (loading) return loading;
  // Le module appelle l'API en relatif : dans l'APK, on lui donne l'adresse du serveur.
  window.XERA_API_BASE = API_BASE;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/js/mobile-money-modal.js';
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('Module de paiement indisponible. Vérifiez votre connexion.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export async function openSupport({ creatorId, creatorName, onSuccess }) {
  await loadModule();
  if (!window.XeraMobileMoney?.openCheckout) throw new Error('Module de paiement indisponible.');
  const accessToken = await getAccessToken();
  window.XeraMobileMoney.openCheckout({
    type: 'support',
    title: `Soutien à ${creatorName}`,
    creatorId,
    creatorName,
    accessToken,
    onSuccess,
  });
}

/** Abonnement (Standard, Medium, Pro, Vérification Page Pro, Elite) : même payload que l'ancienne page. */
export async function openSubscription({ planId, planName, billingCycle, userId, discountCode, pageId, onSuccess }) {
  await loadModule();
  if (!window.XeraMobileMoney?.openCheckout) throw new Error('Module de paiement indisponible.');
  const accessToken = await getAccessToken();
  window.XeraMobileMoney.openCheckout({
    type: 'subscription',
    title: `Abonnement ${planName}`,
    amountLabel: billingCycle === 'annual' ? 'Facturation annuelle (2 mois offerts)' : 'Facturation mensuelle',
    payload: {
      plan: planId,
      billing_cycle: billingCycle,
      user_id: userId,
      discount_code: discountCode || undefined,
      page_id: pageId || undefined,
    },
    accessToken,
    onSuccess,
  });
}

/** Opérateurs acceptés par le serveur (SUPPORTED_MOBILE_MONEY_PROVIDERS). */
export const MOBILE_MONEY_PROVIDERS = [
  ['RD Congo', [['VODACOM_MPESA_COD', 'Vodacom M-Pesa'], ['AIRTEL_COD', 'Airtel Money'], ['ORANGE_COD', 'Orange Money'], ['MTN_MOMO_COD', 'MTN MoMo']]],
  ['Rwanda', [['MTN_MOMO_RWA', 'MTN MoMo'], ['AIRTEL_RWA', 'Airtel Money']]],
  ['Ouganda', [['MTN_MOMO_UGA', 'MTN MoMo'], ['AIRTEL_OAPI_UGA', 'Airtel Money']]],
  ['Kenya', [['MPESA_KEN', 'M-Pesa']]],
  ['Congo-Brazzaville', [['MTN_MOMO_COG', 'MTN MoMo'], ['AIRTEL_COG', 'Airtel Money']]],
  ['Cameroun', [['MTN_MOMO_CMR', 'MTN MoMo'], ['ORANGE_CMR', 'Orange Money']]],
  ['Côte d’Ivoire', [['MTN_MOMO_CIV', 'MTN MoMo'], ['ORANGE_CIV', 'Orange Money']]],
  ['Bénin', [['MTN_MOMO_BEN', 'MTN MoMo'], ['MOOV_BEN', 'Moov Money']]],
  ['Sénégal', [['ORANGE_SEN', 'Orange Money'], ['FREE_SEN', 'Free Money']]],
  ['Gabon', [['AIRTEL_GAB', 'Airtel Money']]],
  ['Sierra Leone', [['ORANGE_SLE', 'Orange Money']]],
  ['Zambie', [['MTN_MOMO_ZMB', 'MTN MoMo'], ['AIRTEL_OAPI_ZMB', 'Airtel Money'], ['ZAMTEL_ZMB', 'Zamtel']]],
];
