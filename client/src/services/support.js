/**
 * Soutien à un créateur : réutilise tel quel le module de paiement Mobile Money
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
