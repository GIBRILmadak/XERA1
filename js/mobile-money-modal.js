/**
 * client/public/js/mobile-money-modal.js
 *
 * Modale de paiement Mobile Money.
 * Refonte visuelle sobre, premium, accessible (Stripe/Linear level).
 */

(function (window) {
  "use strict";

  let activeModalEl = null;
  let pollIntervalId = null;
  let countdownIntervalId = null;

  // ─── Icônes SVG inline (trait 1.5px, currentColor, style uniforme) ─────────
  const SVG = {
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    lock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
    spinner: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="xera-mm-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>',
    successRing: '<svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="#10b981" stroke-linecap="round" stroke-linejoin="round"><circle cx="28" cy="28" r="25" stroke="rgba(16, 185, 129, 0.2)" stroke-width="1.5"></circle><polyline class="xera-mm-check-path" points="18 28 25 35 38 21" stroke-width="2.5"></polyline></svg>',
    failedRing: '<svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="28" cy="28" r="25" stroke="rgba(239, 68, 68, 0.2)"></circle><line x1="20" y1="20" x2="36" y2="36"></line><line x1="36" y1="20" x2="20" y2="36"></line></svg>',
    timeoutRing: '<svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="#eab308" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="28" cy="28" r="25" stroke="rgba(234, 179, 8, 0.2)"></circle><polyline points="28 16 28 28 35 32"></polyline></svg>',
  };

  const OPERATORS = [
    { id: "airtel_money", label: "Airtel Money", accent: "#e11d48" },
    { id: "orange_money", label: "Orange Money", accent: "#f97316" },
    { id: "mpesa",        label: "M-Pesa",       accent: "#10b981" },
  ];

  // ─── Formatage & Validation RDC ────────────────────────────────────────────
  function isValidDrcPhone(raw) {
    const clean = String(raw || "").replace(/[\s\-\.\(\)]/g, "");
    if (/^\+243[89]\d{8}$/.test(clean)) return true;
    if (/^00243[89]\d{8}$/.test(clean)) return true;
    if (/^0[89]\d{8}$/.test(clean)) return true;
    if (/^[89]\d{8}$/.test(clean)) return true;
    return false;
  }

  function normalizeDrcPhone(raw) {
    let digits = String(raw || "").replace(/\D/g, "");
    if (digits.startsWith("00243")) digits = digits.slice(5);
    else if (digits.startsWith("243")) digits = digits.slice(3);
    else if (digits.startsWith("0")) digits = digits.slice(1);
    return "+243" + digits;
  }

  function formatDrcLocalDisplay(raw) {
    let digits = String(raw || "").replace(/\D/g, "");
    if (digits.startsWith("00243")) digits = digits.slice(5);
    else if (digits.startsWith("243")) digits = digits.slice(3);
    if (digits.startsWith("0")) digits = digits.slice(1);
    digits = digits.slice(0, 9);

    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return digits.slice(0, 3) + " " + digits.slice(3);
    return digits.slice(0, 3) + " " + digits.slice(3, 6) + " " + digits.slice(6);
  }

  function detectOperatorFromPhone(phone) {
    let digits = String(phone || "").replace(/\D/g, "");
    if (digits.startsWith("00243")) digits = digits.slice(5);
    else if (digits.startsWith("243")) digits = digits.slice(3);
    if (digits.startsWith("0")) digits = digits.slice(1);

    if (digits.length >= 2) {
      const p = digits.slice(0, 2);
      if (["97", "98", "99"].includes(p)) return "airtel_money";
      if (["81", "82", "83"].includes(p)) return "mpesa";
      if (["80", "84", "85", "89"].includes(p)) return "orange_money";
    }
    return null;
  }

  function formatCurrencyFr(amount) {
    const n = Number(amount) || 0;
    return n.toFixed(2).replace(".", ",") + " $";
  }

  // ─── Injection CSS ─────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("xera-mm-styles")) return;
    const style = document.createElement("style");
    style.id = "xera-mm-styles";
    style.textContent = `
      @keyframes xeraMmFadeIn {
        from { opacity: 0; transform: scale(0.98) translateY(6px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes xeraMmSheetUp {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }
      @keyframes xeraMmSpin {
        to { transform: rotate(360deg); }
      }
      @keyframes xeraMmCheckDraw {
        to { stroke-dashoffset: 0; }
      }

      .xera-mm-spin {
        animation: xeraMmSpin 0.75s linear infinite;
        display: inline-block;
        vertical-align: middle;
      }
      .xera-mm-check-path {
        stroke-dasharray: 40;
        stroke-dashoffset: 40;
        animation: xeraMmCheckDraw 0.35s ease-out 0.1s forwards;
      }

      .xera-mm-backdrop {
        position: fixed; inset: 0;
        background: rgba(3, 4, 7, 0.78);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        display: flex; align-items: center; justify-content: center;
        z-index: 100000;
        padding: 16px; box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #f1f5f9;
      }

      .xera-mm-dialog {
        background: #0d1117;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        width: 100%; max-width: 440px;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
        overflow: hidden; position: relative;
        animation: xeraMmFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex; flex-direction: column;
        max-height: 90vh;
      }

      .xera-mm-dialog *:focus-visible {
        outline: 2px solid #7c3aed;
        outline-offset: 2px;
      }

      .xera-mm-header {
        padding: 20px 24px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        display: flex; justify-content: space-between; align-items: flex-start;
      }
      .xera-mm-title {
        margin: 0; font-size: 1.05rem; font-weight: 600; color: #f8fafc; letter-spacing: -0.01em;
      }
      .xera-mm-recipient {
        font-size: 0.8rem; color: #94a3b8; margin-top: 2px;
      }
      .xera-mm-close {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #94a3b8; border-radius: 8px; width: 32px; height: 32px;
        display: grid; place-items: center; cursor: pointer;
        transition: background 180ms ease, color 180ms ease; padding: 0;
      }
      .xera-mm-close:hover {
        background: rgba(255, 255, 255, 0.06); color: #fff;
      }

      .xera-mm-body {
        padding: 24px; overflow-y: auto;
      }

      /* Montant héro */
      .xera-mm-hero-amount {
        text-align: center; margin-bottom: 24px;
      }
      .xera-mm-hero-val {
        font-size: 2.35rem; font-weight: 700; color: #ffffff;
        font-variant-numeric: tabular-nums; letter-spacing: -0.02em; line-height: 1.1;
      }
      .xera-mm-hero-label {
        font-size: 0.72rem; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.08em; color: #64748b; margin-top: 6px;
      }

      .xera-mm-section {
        margin-bottom: 20px;
      }
      .xera-mm-label {
        display: block; font-size: 0.72rem; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.08em;
        color: #94a3b8; margin-bottom: 8px;
      }

      /* Choix de montants (Soutien) */
      .xera-mm-amounts {
        display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 8px;
      }
      .xera-mm-amt-btn {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #cbd5e1; border-radius: 8px; padding: 10px 0;
        font-size: 0.88rem; font-weight: 600; cursor: pointer;
        min-height: 44px; box-sizing: border-box;
        transition: background 180ms ease, border-color 180ms ease, color 180ms ease;
      }
      .xera-mm-amt-btn:hover {
        background: rgba(255, 255, 255, 0.07); color: #fff;
      }
      .xera-mm-amt-btn.selected {
        background: rgba(124, 58, 237, 0.12);
        border-color: #7c3aed; color: #c4b5fd;
      }

      .xera-mm-custom-wrap {
        position: relative;
      }
      .xera-mm-custom-sym {
        position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
        color: #64748b; font-weight: 600; font-size: 0.88rem;
      }
      .xera-mm-custom-input {
        width: 100%; box-sizing: border-box;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px; padding: 11px 14px 11px 28px;
        color: #fff; font-size: 0.88rem; outline: none;
        transition: border-color 180ms ease; min-height: 44px;
      }
      .xera-mm-custom-input:focus {
        border-color: #7c3aed;
      }

      /* Cartes opérateurs */
      .xera-mm-operators {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
      }
      .xera-mm-operator-card {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px; padding: 14px 8px 12px;
        min-height: 64px; box-sizing: border-box;
        cursor: pointer; position: relative;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-align: center;
        transition: background 180ms ease, border-color 180ms ease;
      }
      .xera-mm-operator-card:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.14);
      }
      .xera-mm-op-accent {
        position: absolute; top: 0; left: 12px; right: 12px; height: 2px;
        border-radius: 0 0 2px 2px; opacity: 0.6;
      }
      .xera-mm-op-name {
        font-size: 0.85rem; font-weight: 600; color: #e2e8f0;
      }
      .xera-mm-op-check {
        position: absolute; top: 6px; right: 6px;
        width: 16px; height: 16px; border-radius: 50%;
        background: #7c3aed; color: #fff;
        display: none; place-items: center;
      }
      .xera-mm-operator-card.selected {
        border-color: #7c3aed;
        background: rgba(124, 58, 237, 0.08);
      }
      .xera-mm-operator-card.selected .xera-mm-op-check {
        display: grid;
      }

      /* Champ Numéro */
      .xera-mm-phone-row {
        position: relative; display: flex; align-items: center;
      }
      .xera-mm-prefix-badge {
        position: absolute; left: 10px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px; padding: 4px 8px;
        font-size: 0.82rem; font-weight: 600; color: #cbd5e1;
        display: flex; align-items: center; gap: 6px; pointer-events: none;
      }
      .xera-mm-prefix-iso {
        font-size: 0.7rem; color: #94a3b8; letter-spacing: 0.04em;
      }
      .xera-mm-phone-input {
        width: 100%; box-sizing: border-box;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px; padding: 12px 14px 12px 96px;
        color: #fff; font-size: 0.95rem; font-weight: 600; outline: none;
        letter-spacing: 0.04em; min-height: 44px;
        transition: border-color 180ms ease;
      }
      .xera-mm-phone-input:focus {
        border-color: #7c3aed;
      }
      .xera-mm-field-error {
        font-size: 0.78rem; color: #ef4444; margin-top: 6px;
        display: none; line-height: 1.35;
      }

      /* Message optionnel */
      .xera-mm-msg-input {
        width: 100%; box-sizing: border-box;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px; padding: 11px 14px;
        color: #fff; font-size: 0.88rem; outline: none;
        transition: border-color 180ms ease; min-height: 44px;
      }
      .xera-mm-msg-input:focus {
        border-color: #7c3aed;
      }

      /* Erreur globale formulaire */
      .xera-mm-alert-error {
        display: none; background: rgba(239, 68, 68, 0.08);
        border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5;
        padding: 10px 14px; border-radius: 8px; font-size: 0.82rem;
        margin-bottom: 16px; line-height: 1.4;
      }

      /* Pied / Bouton principal */
      .xera-mm-footer-action {
        margin-top: 8px;
      }
      .xera-mm-submit-btn {
        width: 100%; min-height: 46px;
        background: #7c3aed; color: #ffffff;
        border: none; border-radius: 10px;
        font-size: 0.95rem; font-weight: 600; cursor: not-allowed;
        opacity: 0.45; transition: background 180ms ease, opacity 180ms ease, transform 180ms ease;
        display: flex; align-items: center; justify-content: center; gap: 8px;
      }
      .xera-mm-submit-btn.ready {
        opacity: 1; cursor: pointer;
      }
      .xera-mm-submit-btn.ready:hover {
        background: #6d28d9;
      }
      .xera-mm-legal {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        font-size: 0.72rem; color: #64748b; margin-top: 14px;
      }

      /* STEP 2 : Attente USSD avec anneau circulaire */
      .xera-mm-ring-wrap {
        position: relative; width: 96px; height: 96px; margin: 4px auto 18px;
      }
      .xera-mm-ring-svg {
        transform: rotate(-90deg); width: 96px; height: 96px;
      }
      .xera-mm-ring-bg {
        stroke: rgba(255, 255, 255, 0.08); fill: none; stroke-width: 4;
      }
      .xera-mm-ring-meter {
        stroke: #7c3aed; fill: none; stroke-width: 4;
        stroke-linecap: round;
        stroke-dasharray: 264;
        stroke-dashoffset: 0;
        transition: stroke-dashoffset 1s linear;
      }
      .xera-mm-ring-text {
        position: absolute; inset: 0;
        display: grid; place-items: center;
        font-size: 1.15rem; font-weight: 700; color: #fff;
        font-variant-numeric: tabular-nums;
      }

      .xera-mm-steps-list {
        display: flex; flex-direction: column; gap: 10px;
        max-width: 280px; margin: 18px auto; text-align: left;
      }
      .xera-mm-step-item {
        display: flex; align-items: center; gap: 10px;
        font-size: 0.85rem; color: #94a3b8;
      }
      .xera-mm-step-item.active {
        color: #f1f5f9; font-weight: 600;
      }
      .xera-mm-step-dot {
        width: 18px; height: 18px; border-radius: 50%;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.15);
        display: grid; place-items: center; font-size: 0.65rem; color: #94a3b8;
        flex-shrink: 0;
      }
      .xera-mm-step-item.active .xera-mm-step-dot {
        background: rgba(124, 58, 237, 0.15);
        border-color: #7c3aed; color: #c4b5fd;
      }
      .xera-mm-waiting-sub {
        font-size: 0.78rem; color: #64748b; margin-top: 12px; text-align: center;
      }

      /* STEP 3 & 4 : Succès / Échec */
      .xera-mm-state-icon {
        margin: 8px auto 16px; display: grid; place-items: center;
      }
      .xera-mm-state-title {
        font-size: 1.2rem; font-weight: 700; color: #fff; margin: 0 0 4px;
      }
      .xera-mm-state-desc {
        font-size: 0.88rem; color: #94a3b8; margin: 0 0 20px; line-height: 1.45;
      }
      .xera-mm-btn-ghost {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #f1f5f9; border-radius: 8px; padding: 10px 20px;
        font-size: 0.88rem; font-weight: 600; cursor: pointer;
        min-height: 44px; transition: background 180ms ease;
      }
      .xera-mm-btn-ghost:hover {
        background: rgba(255, 255, 255, 0.06);
      }

      /* Mobile First (<= 480px) */
      @media (max-width: 480px) {
        .xera-mm-backdrop {
          align-items: flex-end; padding: 0;
        }
        .xera-mm-dialog {
          border-radius: 20px 20px 0 0;
          border-bottom: none;
          max-height: 92vh; width: 100%;
          animation: xeraMmSheetUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .xera-mm-body {
          padding: 20px 20px 28px;
        }
      }

      /* Prefers Reduced Motion */
      @media (prefers-reduced-motion: reduce) {
        .xera-mm-dialog, .xera-mm-spin, .xera-mm-check-path {
          animation: none !important;
          transition: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ─── Modale HTML ───────────────────────────────────────────────────────────
  function createModalHtml(data) {
    const isSupport = data.type === "support";
    const initialAmount = isSupport ? (Number(data.defaultAmount) || 1) : null;
    const recipientName = data.creatorName || "";
    const title = isSupport ? "Soutien direct" : (data.title || "Abonnement");

    return `
      <div id="xera-mm-backdrop" class="xera-mm-backdrop" role="dialog" aria-modal="true" aria-labelledby="xera-mm-title">
        <div id="xera-mm-dialog" class="xera-mm-dialog">
          
          <div class="xera-mm-header">
            <div>
              <h3 id="xera-mm-title" class="xera-mm-title">${title}</h3>
              ${recipientName ? `<div class="xera-mm-recipient">Pour ${recipientName}</div>` : ""}
            </div>
            <button id="xera-mm-close-btn" type="button" class="xera-mm-close" aria-label="Fermer la fenêtre">
              ${SVG.close}
            </button>
          </div>

          <div id="xera-mm-content" class="xera-mm-body" aria-live="polite">

            <!-- STEP 1 : FORMULAIRE -->
            <div id="xera-mm-step-form">

              <!-- Montant Héro -->
              <div class="xera-mm-hero-amount">
                <div id="xera-mm-hero-val" class="xera-mm-hero-val">
                  ${isSupport ? formatCurrencyFr(initialAmount) : (data.amountLabel || "1,00 $")}
                </div>
                <div class="xera-mm-hero-label">Montant à régler</div>
              </div>

              ${isSupport ? `
                <!-- Choix prédéfini de montants -->
                <div class="xera-mm-section">
                  <div class="xera-mm-amounts" role="radiogroup" aria-label="Choisir un montant">
                    <button type="button" class="xera-mm-amt-btn selected" data-amt="1">1 $</button>
                    <button type="button" class="xera-mm-amt-btn" data-amt="3">3 $</button>
                    <button type="button" class="xera-mm-amt-btn" data-amt="5">5 $</button>
                    <button type="button" class="xera-mm-amt-btn" data-amt="10">10 $</button>
                    <button type="button" class="xera-mm-amt-btn" data-amt="25">25 $</button>
                    <button type="button" class="xera-mm-amt-btn" data-amt="50">50 $</button>
                  </div>
                  <div class="xera-mm-custom-wrap">
                    <span class="xera-mm-custom-sym">$</span>
                    <input type="number" id="xera-mm-custom-amt" min="1" max="1000" step="1" inputmode="numeric" placeholder="Autre montant..." class="xera-mm-custom-input" aria-label="Montant personnalisé">
                  </div>
                </div>

                <!-- Message d'accompagnement -->
                <div class="xera-mm-section">
                  <label for="xera-mm-support-msg" class="xera-mm-label">Message (optionnel)</label>
                  <input type="text" id="xera-mm-support-msg" maxlength="150" placeholder="Un mot pour le créateur..." class="xera-mm-msg-input">
                </div>
              ` : ""}

              <!-- Opérateurs : 3 cartes égales, SANS logo, avec fine barre d'accent -->
              <div class="xera-mm-section">
                <span class="xera-mm-label">Opérateur Mobile Money</span>
                <div class="xera-mm-operators" role="radiogroup" aria-label="Choisir un opérateur">
                  ${OPERATORS.map((op) => `
                    <div class="xera-mm-operator-card" data-provider="${op.id}" role="radio" aria-checked="false" tabindex="0">
                      <div class="xera-mm-op-accent" style="background:${op.accent};"></div>
                      <span class="xera-mm-op-name">${op.label}</span>
                      <span class="xera-mm-op-check">${SVG.check}</span>
                    </div>
                  `).join("")}
                </div>
              </div>

              <!-- Numéro RDC -->
              <div class="xera-mm-section">
                <label for="xera-mm-phone" class="xera-mm-label">Numéro de téléphone</label>
                <div class="xera-mm-phone-row">
                  <div class="xera-mm-prefix-badge">
                    <span class="xera-mm-prefix-iso">RDC</span>
                    <span class="xera-mm-prefix-num">+243</span>
                  </div>
                  <input id="xera-mm-phone" type="tel" inputmode="tel" placeholder="974 123 456" class="xera-mm-phone-input" autocomplete="tel-national" />
                  <span id="xera-mm-phone-check" style="display:none;position:absolute;right:14px;color:#10b981;">${SVG.check}</span>
                </div>
                <div id="xera-mm-phone-error" class="xera-mm-field-error">Veuillez entrer un numéro de téléphone valide.</div>
              </div>

              <!-- Erreur globale API -->
              <div id="xera-mm-form-error" class="xera-mm-alert-error" role="alert"></div>

              <!-- Bouton principal violet -->
              <div class="xera-mm-footer-action">
                <button id="xera-mm-submit-btn" type="button" class="xera-mm-submit-btn" disabled>
                  Payer ${isSupport ? formatCurrencyFr(initialAmount) : "1,00 $"}
                </button>
                <div class="xera-mm-legal">
                  ${SVG.lock}
                  <span>Paiement sécurisé</span>
                </div>
              </div>
            </div>

            <!-- STEP 2 : ATTENTE VALIDATION USSD -->
            <div id="xera-mm-step-waiting" style="display:none;text-align:center;padding:8px 0;">
              
              <!-- Anneau SVG circulaire se vidant -->
              <div class="xera-mm-ring-wrap">
                <svg class="xera-mm-ring-svg" viewBox="0 0 96 96">
                  <circle class="xera-mm-ring-bg" cx="48" cy="48" r="42"></circle>
                  <circle id="xera-mm-ring-meter" class="xera-mm-ring-meter" cx="48" cy="48" r="42"></circle>
                </svg>
                <div id="xera-mm-countdown" class="xera-mm-ring-text">02:00</div>
              </div>

              <div class="xera-mm-steps-list">
                <div class="xera-mm-step-item active">
                  <span class="xera-mm-step-dot">1</span>
                  <span>Vérifiez votre téléphone</span>
                </div>
                <div class="xera-mm-step-item">
                  <span class="xera-mm-step-dot">2</span>
                  <span>Saisissez votre code PIN</span>
                </div>
                <div class="xera-mm-step-item">
                  <span class="xera-mm-step-dot">3</span>
                  <span>Paiement confirmé</span>
                </div>
              </div>

              <div class="xera-mm-waiting-sub">
                Vous pouvez fermer cette fenêtre, nous vous prévenons.
              </div>
            </div>

            <!-- STEP 3 : SUCCÈS -->
            <div id="xera-mm-step-success" style="display:none;text-align:center;padding:12px 0;">
              <div class="xera-mm-state-icon">
                ${SVG.successRing}
              </div>
              <h4 class="xera-mm-state-title">Paiement confirmé</h4>
              <p class="xera-mm-state-desc">
                <span id="xera-mm-success-amount" style="font-weight:700;color:#fff;"></span>
                ${recipientName ? ` envoyé à ${recipientName}` : " validé avec succès"}.
              </p>
              <button id="xera-mm-done-btn" type="button" class="xera-mm-submit-btn ready" style="width:auto;min-width:140px;margin:0 auto;padding:0 24px;">
                Terminé
              </button>
            </div>

            <!-- STEP 4 : ÉCHEC -->
            <div id="xera-mm-step-failed" style="display:none;text-align:center;padding:12px 0;">
              <div class="xera-mm-state-icon">
                ${SVG.failedRing}
              </div>
              <h4 class="xera-mm-state-title">Paiement non confirmé</h4>
              <p id="xera-mm-failed-msg" class="xera-mm-state-desc">
                La transaction n’a pas abouti sur votre téléphone.
              </p>
              <button id="xera-mm-retry-btn" type="button" class="xera-mm-btn-ghost">
                Réessayer
              </button>
            </div>

            <!-- STEP 5 : DÉLAI DÉPASSÉ -->
            <div id="xera-mm-step-timeout" style="display:none;text-align:center;padding:12px 0;">
              <div class="xera-mm-state-icon">
                ${SVG.timeoutRing}
              </div>
              <h4 class="xera-mm-state-title">Délai dépassé</h4>
              <p class="xera-mm-state-desc">
                Si vous avez composé votre code PIN, la confirmation reste en cours de traitement.
              </p>
              <div style="display:flex;gap:10px;justify-content:center;">
                <button id="xera-mm-recheck-btn" type="button" class="xera-mm-submit-btn ready" style="width:auto;padding:0 20px;">
                  Vérifier à nouveau
                </button>
                <button id="xera-mm-timeout-close-btn" type="button" class="xera-mm-btn-ghost">
                  Fermer
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>`;
  }

  function cleanupModal() {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
    if (countdownIntervalId) {
      clearInterval(countdownIntervalId);
      countdownIntervalId = null;
    }
    if (activeModalEl && activeModalEl.parentNode) {
      activeModalEl.parentNode.removeChild(activeModalEl);
    }
    activeModalEl = null;
  }

  // ─── Contrôleur principal ──────────────────────────────────────────────────
  async function openMobileMoneyCheckout(options) {
    options = options || {};
    injectStyles();
    cleanupModal();

    const isSupport = options.type === "support";
    let selectedAmount = isSupport ? (Number(options.amount || options.payload?.amount_usd) || 1) : null;
    // Aucune carte présélectionnée avant la saisie du numéro
    let selectedProvider = null;
    let userManualProvider = false;

    const div = document.createElement("div");
    div.innerHTML = createModalHtml({ ...options, defaultAmount: selectedAmount });
    activeModalEl = div.firstElementChild;
    document.body.appendChild(activeModalEl);

    // Éléments
    const closeBtn = document.getElementById("xera-mm-close-btn");
    const phoneInput = document.getElementById("xera-mm-phone");
    const phoneCheck = document.getElementById("xera-mm-phone-check");
    const phoneError = document.getElementById("xera-mm-phone-error");
    const submitBtn = document.getElementById("xera-mm-submit-btn");
    const formError = document.getElementById("xera-mm-form-error");
    const heroAmountEl = document.getElementById("xera-mm-hero-val");
    const ringMeter = document.getElementById("xera-mm-ring-meter");
    const countdownEl = document.getElementById("xera-mm-countdown");

    const stepForm = document.getElementById("xera-mm-step-form");
    const stepWaiting = document.getElementById("xera-mm-step-waiting");
    const stepSuccess = document.getElementById("xera-mm-step-success");
    const stepFailed = document.getElementById("xera-mm-step-failed");
    const stepTimeout = document.getElementById("xera-mm-step-timeout");

    function showStep(stepName) {
      stepForm.style.display = stepName === "form" ? "block" : "none";
      stepWaiting.style.display = stepName === "waiting" ? "block" : "none";
      stepSuccess.style.display = stepName === "success" ? "block" : "none";
      stepFailed.style.display = stepName === "failed" ? "block" : "none";
      stepTimeout.style.display = stepName === "timeout" ? "block" : "none";
    }

    // Fermeture Échap et clic extérieur
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        cleanupModal();
        window.removeEventListener("keydown", handleKeyDown);
      }
    }
    window.addEventListener("keydown", handleKeyDown);

    closeBtn.addEventListener("click", () => {
      cleanupModal();
      window.removeEventListener("keydown", handleKeyDown);
    });
    activeModalEl.addEventListener("click", (e) => {
      if (e.target === activeModalEl) {
        cleanupModal();
        window.removeEventListener("keydown", handleKeyDown);
      }
    });

    // Mise à jour du libellé du bouton (ex: "Payer 1,00 $")
    function updateButtonLabel() {
      const formatted = isSupport ? formatCurrencyFr(selectedAmount) : (options.amountLabel || "1,00 $");
      if (heroAmountEl && isSupport) {
        heroAmountEl.textContent = formatted;
      }
      submitBtn.textContent = `Payer ${formatted}`;
    }

    // Gestion sélection des montants (soutien)
    if (isSupport) {
      const amtBtns = activeModalEl.querySelectorAll(".xera-mm-amt-btn");
      const customInput = document.getElementById("xera-mm-custom-amt");

      amtBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          amtBtns.forEach((b) => b.classList.remove("selected"));
          btn.classList.add("selected");
          if (customInput) customInput.value = "";
          selectedAmount = parseFloat(btn.dataset.amt) || 1;
          updateButtonLabel();
          validateForm();
        });
      });

      if (customInput) {
        customInput.addEventListener("input", () => {
          const val = parseFloat(customInput.value);
          if (Number.isFinite(val) && val >= 1 && val <= 1000) {
            amtBtns.forEach((b) => b.classList.remove("selected"));
            selectedAmount = Math.round(val);
          } else {
            selectedAmount = 0;
          }
          updateButtonLabel();
          validateForm();
        });
      }
    }

    // Cartes opérateurs
    const opCards = activeModalEl.querySelectorAll(".xera-mm-operator-card");
    function selectOperatorCard(provId, isManual = false) {
      selectedProvider = provId;
      if (isManual) userManualProvider = true;

      opCards.forEach((c) => {
        const match = c.dataset.provider === provId;
        c.classList.toggle("selected", match);
        c.setAttribute("aria-checked", String(match));
      });
      validateForm();
    }

    opCards.forEach((card) => {
      card.addEventListener("click", () => {
        selectOperatorCard(card.dataset.provider, true);
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectOperatorCard(card.dataset.provider, true);
        }
      });
    });

    // Saisie du numéro avec espacement fluide
    function validateForm() {
      const raw = phoneInput.value;
      const valid = isValidDrcPhone(raw);

      // Auto-détection de l'opérateur selon le numéro si non forcé manuellement
      if (!userManualProvider) {
        const detected = detectOperatorFromPhone(raw);
        if (detected && detected !== selectedProvider) {
          selectOperatorCard(detected, false);
        }
      }

      if (valid) {
        phoneInput.style.borderColor = "rgba(255, 255, 255, 0.08)";
        if (phoneCheck) phoneCheck.style.display = "block";
        if (phoneError) phoneError.style.display = "none";
      } else {
        if (phoneCheck) phoneCheck.style.display = "none";
      }

      const validAmount = !isSupport || (Number.isInteger(selectedAmount) && selectedAmount >= 1 && selectedAmount <= 1000);
      const isReady = valid && Boolean(selectedProvider) && validAmount;

      submitBtn.disabled = !isReady;
      submitBtn.classList.toggle("ready", isReady);
    }

    phoneInput.addEventListener("input", () => {
      const cursor = phoneInput.selectionStart;
      const formatted = formatDrcLocalDisplay(phoneInput.value);
      phoneInput.value = formatted;
      validateForm();
    });

    phoneInput.addEventListener("blur", () => {
      const raw = phoneInput.value.trim();
      if (raw.length > 0 && !isValidDrcPhone(raw)) {
        if (phoneError) phoneError.style.display = "block";
        phoneInput.style.borderColor = "#ef4444";
      } else {
        if (phoneError) phoneError.style.display = "none";
      }
    });

    updateButtonLabel();
    setTimeout(() => phoneInput.focus(), 60);

    let currentTxId = null;

    // Polling du statut (inchangé)
    async function pollStatus(txId) {
      try {
        const headers = {};
        if (options.accessToken) {
          headers["Authorization"] = "Bearer " + options.accessToken;
        }
        const res = await fetch("/api/payments/status/" + encodeURIComponent(txId), {
          headers,
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "succeeded") {
          clearInterval(pollIntervalId);
          clearInterval(countdownIntervalId);
          
          const successAmountEl = document.getElementById("xera-mm-success-amount");
          if (successAmountEl) {
            successAmountEl.textContent = isSupport ? formatCurrencyFr(selectedAmount) : (options.amountLabel || "");
          }

          showStep("success");

          if (typeof options.onSuccess === "function") {
            options.onSuccess(data);
          }
        } else if (data.status === "failed") {
          clearInterval(pollIntervalId);
          clearInterval(countdownIntervalId);
          const failedMsg = document.getElementById("xera-mm-failed-msg");
          if (failedMsg && data.message) failedMsg.textContent = data.message;
          showStep("failed");
        }
      } catch (err) {
        console.warn("[MobileMoney] Poll error:", err.message);
      }
    }

    function startWaitingTimer(txId) {
      currentTxId = txId;
      showStep("waiting");

      const totalSeconds = 120;
      let secondsLeft = totalSeconds;
      const circumference = 264; // 2 * pi * 42

      countdownIntervalId = setInterval(() => {
        secondsLeft -= 1;
        const mins = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
        const secs = String(secondsLeft % 60).padStart(2, "0");
        if (countdownEl) countdownEl.textContent = mins + ":" + secs;

        // Mise à jour de l'anneau qui se vide
        if (ringMeter) {
          const progress = (totalSeconds - secondsLeft) / totalSeconds;
          ringMeter.style.strokeDashoffset = String(circumference * progress);
        }

        if (secondsLeft <= 0) {
          clearInterval(countdownIntervalId);
          clearInterval(pollIntervalId);
          showStep("timeout");
        }
      }, 1000);

      pollIntervalId = setInterval(() => pollStatus(txId), 3000);
      pollStatus(txId);
    }

    // Soumission du paiement
    submitBtn.addEventListener("click", async () => {
      formError.style.display = "none";
      const rawPhone = phoneInput.value.trim();

      if (!isValidDrcPhone(rawPhone)) {
        if (phoneError) phoneError.style.display = "block";
        phoneInput.style.borderColor = "#ef4444";
        return;
      }

      if (!selectedProvider) {
        formError.textContent = "Veuillez sélectionner un opérateur.";
        formError.style.display = "block";
        return;
      }

      if (isSupport && (!selectedAmount || selectedAmount < 1)) {
        formError.textContent = "Veuillez choisir un montant valide.";
        formError.style.display = "block";
        return;
      }

      const normalizedPhone = normalizeDrcPhone(rawPhone);
      const supportMsgInput = document.getElementById("xera-mm-support-msg");
      const supportMessage = supportMsgInput ? supportMsgInput.value.trim() : "";

      submitBtn.disabled = true;
      submitBtn.classList.remove("ready");
      submitBtn.innerHTML = `${SVG.spinner} <span>Traitement en cours…</span>`;

      try {
        const payload = { ...(options.payload || {}) };
        if (isSupport) {
          payload.amount_usd = selectedAmount;
          payload.to_user_id = options.creatorId || payload.to_user_id;
          if (supportMessage) payload.message = supportMessage;
        }

        const body = {
          type: options.type,
          phone: normalizedPhone,
          provider: selectedProvider,
          currency: "CDF",
          ...payload,
        };

        const headers = { "Content-Type": "application/json" };
        if (options.accessToken) {
          headers["Authorization"] = "Bearer " + options.accessToken;
        }

        const res = await fetch("/api/payments/initiate", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          credentials: "same-origin",
        });

        const data = await res.json();

        if (res.status === 200 || res.status === 202) {
          startWaitingTimer(data.transactionId);
        } else {
          submitBtn.disabled = false;
          submitBtn.classList.add("ready");
          updateButtonLabel();
          formError.textContent = data.message || "Impossible d’initier le paiement.";
          formError.style.display = "block";
        }
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.classList.add("ready");
        updateButtonLabel();
        formError.textContent = "Erreur de connexion. Veuillez réessayer.";
        formError.style.display = "block";
      }
    });

    document.getElementById("xera-mm-retry-btn")?.addEventListener("click", () => {
      showStep("form");
      validateForm();
    });

    document.getElementById("xera-mm-recheck-btn")?.addEventListener("click", () => {
      if (currentTxId) startWaitingTimer(currentTxId);
    });

    document.getElementById("xera-mm-done-btn")?.addEventListener("click", () => {
      cleanupModal();
      window.location.reload();
    });

    document.getElementById("xera-mm-timeout-close-btn")?.addEventListener("click", () => {
      cleanupModal();
    });
  }

  // Helper pour ouvrir directement le soutien à un créateur
  async function openSupportCheckout({ creatorId, creatorName, accessToken, onSuccess }) {
    return openMobileMoneyCheckout({
      type: "support",
      title: "Soutien direct",
      creatorId,
      creatorName,
      accessToken,
      onSuccess,
    });
  }

  window.XeraMobileMoney = {
    openCheckout: openMobileMoneyCheckout,
    openSupport: openSupportCheckout,
    isValidPhone: isValidDrcPhone,
    normalizePhone: normalizeDrcPhone,
    detectOperator: detectOperatorFromPhone,
  };

})(typeof window !== "undefined" ? window : this);
