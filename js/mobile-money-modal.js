/**
 * js/mobile-money-modal.js
 *
 * Modale de paiement unifiée Mobile Money MaishaPay (Airtel Money, Orange Money, M-Pesa).
 * Design XERA Dark Mode tout-en-un avec logos officiels et détection automatique d'opérateur.
 */

(function (window) {
  "use strict";

  let activeModalEl = null;
  let pollIntervalId = null;
  let countdownIntervalId = null;

  // ─── Logos SVG officiels ──────────────────────────────────────────────────
  const LOGOS = {
    airtel: `<svg viewBox="0 0 100 32" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="16" r="12" fill="#E40000"/>
      <path d="M14 9c-3.87 0-7 3.13-7 7s3.13 7 7 7c1.63 0 3.13-.56 4.33-1.5l-1.27-1.69A4.85 4.85 0 0 1 14 20.9c-2.7 0-4.9-2.2-4.9-4.9s2.2-4.9 4.9-4.9c2.43 0 4.46 1.78 4.83 4.1h2.14C20.47 11.75 17.5 9 14 9z" fill="#FFFFFF"/>
      <circle cx="14" cy="16" r="2" fill="#FFFFFF"/>
      <text x="32" y="15" fill="#FFFFFF" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="800" letter-spacing="-0.3">airtel</text>
      <text x="32" y="24" fill="#FF8080" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="8.5" font-weight="700" letter-spacing="0.5">MONEY</text>
    </svg>`,

    orange: `<svg viewBox="0 0 100 32" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="4" width="24" height="24" rx="4" fill="#FF7900"/>
      <rect x="6" y="18" width="16" height="6" rx="1" fill="#FFFFFF" opacity="0.3"/>
      <text x="32" y="15" fill="#FFFFFF" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="800" letter-spacing="-0.3">orange</text>
      <text x="32" y="24" fill="#FFA64D" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="8.5" font-weight="700" letter-spacing="0.5">MONEY</text>
    </svg>`,

    mpesa: `<svg viewBox="0 0 100 32" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="4" width="24" height="24" rx="5" fill="#009639"/>
      <rect x="4" y="6" width="20" height="20" rx="4" fill="#E60000"/>
      <rect x="9.5" y="9" width="9" height="14" rx="2" fill="#FFFFFF"/>
      <rect x="11.5" y="11" width="5" height="7" rx="1" fill="#009639"/>
      <circle cx="14" cy="20.5" r="0.9" fill="#009639"/>
      <text x="32" y="16" fill="#FFFFFF" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="900" letter-spacing="0.2">M-PESA</text>
      <text x="32" y="24" fill="#4CD964" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="8.5" font-weight="700" letter-spacing="0.5">VODACOM</text>
    </svg>`,
  };

  const PROVIDER_INFO = {
    airtel_money: { name: "Airtel Money", color: "#E40000", glow: "rgba(228, 0, 0, 0.25)" },
    orange_money: { name: "Orange Money", color: "#FF7900", glow: "rgba(255, 121, 0, 0.25)" },
    mpesa:        { name: "M-Pesa",       color: "#009639", glow: "rgba(0, 150, 57, 0.25)" },
  };

  // ─── Utilitaires téléphone RDC ─────────────────────────────────────────────
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

  function detectOperatorFromPhone(phone) {
    let digits = String(phone || "").replace(/\D/g, "");
    if (digits.startsWith("00243")) digits = digits.slice(5);
    else if (digits.startsWith("243")) digits = digits.slice(3);
    if (digits.startsWith("0")) digits = digits.slice(1);

    if (digits.length >= 2) {
      const prefix = digits.slice(0, 2);
      if (["97", "98", "99"].includes(prefix)) return "airtel_money";
      if (["81", "82", "83"].includes(prefix)) return "mpesa";
      if (["80", "84", "85", "89"].includes(prefix)) return "orange_money";
    }
    return null;
  }

  // ─── Injection CSS ─────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("xera-mm-styles")) return;
    const style = document.createElement("style");
    style.id = "xera-mm-styles";
    style.textContent = `
      @keyframes xeraMmFadeIn {
        from { opacity: 0; transform: scale(0.97) translateY(8px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes xeraMmPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.08); opacity: 0.85; }
      }
      @keyframes xeraMmSpin {
        to { transform: rotate(360deg); }
      }

      .xera-mm-backdrop {
        position: fixed; inset: 0;
        background: rgba(3, 2, 8, 0.82);
        backdrop-filter: blur(12px) saturate(130%);
        -webkit-backdrop-filter: blur(12px);
        display: flex; align-items: center; justify-content: center;
        z-index: 100000;
        padding: 16px; box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      }
      .xera-mm-dialog {
        background: radial-gradient(circle at 10% 0%, rgba(139, 92, 246, 0.15), transparent 45%),
                    linear-gradient(160deg, #131722 0%, #0d1017 60%, #080a0f 100%);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 22px;
        width: 100%; max-width: 460px;
        color: #f0f6fc;
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
        overflow: hidden; position: relative;
        animation: xeraMmFadeIn 0.24s cubic-bezier(0.16, 1, 0.3, 1);
        max-height: 92vh; display: flex; flex-direction: column;
      }
      .xera-mm-header {
        padding: 20px 24px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex; justify-content: space-between; align-items: flex-start;
      }
      .xera-mm-title-group {
        display: flex; align-items: center; gap: 12px;
      }
      .xera-mm-icon-badge {
        width: 40px; height: 40px; border-radius: 12px;
        display: grid; place-items: center; font-size: 1.25rem;
        background: linear-gradient(135deg, #a855f7, #6366f1);
        box-shadow: 0 8px 20px rgba(168, 85, 247, 0.35);
        flex-shrink: 0;
      }
      .xera-mm-title {
        margin: 0; font-size: 1.15rem; font-weight: 700; color: #fff; line-height: 1.3;
      }
      .xera-mm-subtitle {
        font-size: 0.8rem; color: #8b949e; margin-top: 2px;
      }
      .xera-mm-close {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #8b949e; border-radius: 10px; width: 32px; height: 32px;
        display: grid; place-items: center; font-size: 1.3rem;
        cursor: pointer; transition: all 0.15s; line-height: 1; padding: 0;
      }
      .xera-mm-close:hover {
        color: #fff; background: rgba(255, 255, 255, 0.15);
      }
      .xera-mm-body {
        padding: 20px 24px 24px; overflow-y: auto;
      }
      .xera-mm-section {
        margin-bottom: 18px;
      }
      .xera-mm-label {
        display: block; font-size: 0.82rem; font-weight: 600;
        color: #cbd5e1; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;
      }
      .xera-mm-amounts {
        display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 8px;
      }
      .xera-mm-amt-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #e2e8f0; border-radius: 10px; padding: 10px 4px;
        font-size: 0.95rem; font-weight: 700; cursor: pointer;
        transition: all 0.15s; text-align: center;
      }
      .xera-mm-amt-btn:hover {
        background: rgba(255, 255, 255, 0.12); color: #fff;
      }
      .xera-mm-amt-btn.selected {
        background: linear-gradient(135deg, #a855f7, #6366f1);
        border-color: #c084fc; color: #fff;
        box-shadow: 0 4px 14px rgba(168, 85, 247, 0.4);
      }
      .xera-mm-custom-wrap {
        position: relative;
      }
      .xera-mm-custom-sym {
        position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
        font-weight: 700; color: #8b949e;
      }
      .xera-mm-custom-input {
        width: 100%; box-sizing: border-box;
        background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 10px; padding: 10px 14px 10px 32px;
        color: #fff; font-size: 0.9rem; outline: none; transition: border-color 0.15s;
      }
      .xera-mm-custom-input:focus {
        border-color: #a855f7;
      }
      .xera-mm-plan-card {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px; padding: 12px 16px;
        display: flex; justify-content: space-between; align-items: center;
      }
      .xera-mm-plan-name {
        font-weight: 700; font-size: 1rem; color: #fff;
      }
      .xera-mm-plan-price {
        font-size: 1.1rem; font-weight: 800; color: #38bdf8;
      }
      .xera-mm-providers-grid {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
      }
      .xera-mm-provider-card {
        background: rgba(255, 255, 255, 0.03);
        border: 2px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px; padding: 12px 6px 10px;
        cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-align: center; position: relative; min-height: 72px; box-sizing: border-box;
      }
      .xera-mm-provider-card:hover {
        background: rgba(255, 255, 255, 0.07);
        border-color: rgba(255, 255, 255, 0.2);
        transform: translateY(-1px);
      }
      .xera-mm-provider-card[data-provider="airtel_money"].selected {
        border-color: #E40000;
        background: linear-gradient(145deg, rgba(228, 0, 0, 0.18), rgba(228, 0, 0, 0.05));
        box-shadow: 0 0 16px rgba(228, 0, 0, 0.35);
      }
      .xera-mm-provider-card[data-provider="orange_money"].selected {
        border-color: #FF7900;
        background: linear-gradient(145deg, rgba(255, 121, 0, 0.18), rgba(255, 121, 0, 0.05));
        box-shadow: 0 0 16px rgba(255, 121, 0, 0.35);
      }
      .xera-mm-provider-card[data-provider="mpesa"].selected {
        border-color: #009639;
        background: linear-gradient(145deg, rgba(0, 150, 57, 0.18), rgba(0, 150, 57, 0.05));
        box-shadow: 0 0 16px rgba(0, 150, 57, 0.35);
      }
      .xera-mm-check-badge {
        position: absolute; top: 6px; right: 6px;
        width: 14px; height: 14px; border-radius: 50%;
        background: #fff; color: #000;
        display: none; place-items: center; font-size: 9px; font-weight: 900;
      }
      .xera-mm-provider-card.selected .xera-mm-check-badge {
        display: grid;
      }
      .xera-mm-phone-wrap {
        position: relative; display: flex; align-items: center;
      }
      .xera-mm-phone-prefix {
        position: absolute; left: 14px;
        font-weight: 700; color: #cbd5e1; font-size: 0.95rem;
        display: flex; align-items: center; gap: 4px; pointer-events: none;
      }
      .xera-mm-phone-input {
        width: 100%; box-sizing: border-box;
        background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px; padding: 13px 40px 13px 88px;
        color: #fff; font-size: 1rem; font-weight: 600; outline: none;
        letter-spacing: 0.5px; transition: all 0.15s;
      }
      .xera-mm-phone-input:focus {
        border-color: #a855f7; box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.2);
      }
      .xera-mm-phone-check {
        position: absolute; right: 14px;
        color: #10b981; font-size: 1.15rem; font-weight: 900; display: none;
      }
      .xera-mm-phone-hint {
        font-size: 0.75rem; color: #8b949e; margin-top: 6px;
      }
      .xera-mm-detected-tag {
        font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 6px;
        background: rgba(255, 255, 255, 0.08); display: none;
      }
      .xera-mm-input-msg {
        width: 100%; box-sizing: border-box;
        background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 10px; padding: 10px 14px;
        color: #fff; font-size: 0.88rem; outline: none; transition: border-color 0.15s;
      }
      .xera-mm-input-msg:focus {
        border-color: #a855f7;
      }
      .xera-mm-error {
        display: none; background: rgba(239, 68, 68, 0.14);
        border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5;
        padding: 10px 14px; border-radius: 10px; font-size: 0.85rem;
        margin-bottom: 14px; line-height: 1.4;
      }
      .xera-mm-submit {
        width: 100%; padding: 14px 18px;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: #fff; border: none; border-radius: 12px;
        font-size: 1rem; font-weight: 700; cursor: not-allowed;
        opacity: 0.6; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
      }
      .xera-mm-submit.ready {
        opacity: 1; cursor: pointer;
      }
      .xera-mm-submit.ready:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 20px rgba(16, 185, 129, 0.45);
      }
      .xera-mm-footer-note {
        text-align: center; font-size: 0.75rem; color: #64748b; margin-top: 12px;
      }
      .xera-mm-pulse-icon {
        width: 68px; height: 68px; border-radius: 50%;
        background: rgba(168, 85, 247, 0.16);
        border: 1px solid rgba(168, 85, 247, 0.35);
        display: grid; place-items: center; margin: 0 auto 16px;
        font-size: 2rem; animation: xeraMmPulse 2s infinite ease-in-out;
      }
      .xera-mm-timer-box {
        background: rgba(0, 0, 0, 0.45); border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px; padding: 12px; margin-bottom: 16px; text-align: center;
      }
      .xera-mm-timer-val {
        font-size: 1.9rem; font-weight: 800; color: #a855f7;
        font-variant-numeric: tabular-nums;
      }
      .xera-mm-btn-secondary {
        padding: 10px 18px; background: rgba(255, 255, 255, 0.08);
        color: #fff; border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 10px; font-size: 0.9rem; font-weight: 600; cursor: pointer;
      }
      .xera-mm-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.15);
      }
    `;
    document.head.appendChild(style);
  }

  // ─── Construction HTML ─────────────────────────────────────────────────────
  function createModalHtml(data) {
    const isSupport = data.type === "support";
    const title = data.title || (isSupport ? "Soutenir ce créateur" : "Paiement Mobile Money");
    const initialAmount = isSupport ? (Number(data.defaultAmount) || 1) : null;
    const amountLabel = data.amountLabel || "";

    return `
      <div id="xera-mm-backdrop" class="xera-mm-backdrop">
        <div id="xera-mm-dialog" class="xera-mm-dialog">
          
          <div class="xera-mm-header">
            <div class="xera-mm-title-group">
              <div class="xera-mm-icon-badge">${isSupport ? "💖" : "✨"}</div>
              <div>
                <h3 class="xera-mm-title">${title}</h3>
                <div class="xera-mm-subtitle">${isSupport ? "Soutien direct et sécurisé par Mobile Money" : "Abonnement sécurisé par Mobile Money"}</div>
              </div>
            </div>
            <button id="xera-mm-close-btn" type="button" class="xera-mm-close" aria-label="Fermer">&times;</button>
          </div>

          <div id="xera-mm-content" class="xera-mm-body">

            <!-- STEP 1 : FORMULAIRE -->
            <div id="xera-mm-step-form">

              ${isSupport ? `
                <!-- Choix du montant pour le soutien -->
                <div class="xera-mm-section">
                  <label class="xera-mm-label">Montant du soutien (USD) :</label>
                  <div class="xera-mm-amounts">
                    <button type="button" class="xera-mm-amt-btn selected" data-amt="1">$1</button>
                    <button type="button" class="xera-mm-amt-btn" data-amt="3">$3</button>
                    <button type="button" class="xera-mm-amt-btn" data-amt="5">$5</button>
                    <button type="button" class="xera-mm-amt-btn" data-amt="10">$10</button>
                    <button type="button" class="xera-mm-amt-btn" data-amt="25">$25</button>
                    <button type="button" class="xera-mm-amt-btn" data-amt="50">$50</button>
                  </div>
                  <div class="xera-mm-custom-wrap">
                    <span class="xera-mm-custom-sym">$</span>
                    <input type="number" id="xera-mm-custom-amt" min="1" max="1000" step="1" placeholder="Ou entrez un autre montant personnalisé..." class="xera-mm-custom-input">
                  </div>
                </div>

                <!-- Message optionnel -->
                <div class="xera-mm-section">
                  <label class="xera-mm-label">Message d'encouragement (optionnel) :</label>
                  <input type="text" id="xera-mm-support-msg" maxlength="150" placeholder="Un petit mot gentil..." class="xera-mm-input-msg">
                </div>
              ` : `
                <!-- Carte récapitulative pour abonnement -->
                <div class="xera-mm-section">
                  <div class="xera-mm-plan-card">
                    <div>
                      <div class="xera-mm-plan-name">${title}</div>
                      <div style="font-size:0.8rem;color:#94a3b8;margin-top:2px;">${amountLabel}</div>
                    </div>
                    <div class="xera-mm-plan-price">${amountLabel.split(' ')[0] || "Actif"}</div>
                  </div>
                </div>
              `}

              <!-- Choix de l'opérateur avec les vrais logos -->
              <div class="xera-mm-section">
                <label class="xera-mm-label">Choisissez votre opérateur Mobile Money :</label>
                <div class="xera-mm-providers-grid">
                  <div class="xera-mm-provider-card selected" data-provider="airtel_money">
                    <input type="radio" name="xera-mm-provider" value="airtel_money" checked style="display:none;">
                    ${LOGOS.airtel}
                    <span class="xera-mm-check-badge">✓</span>
                  </div>
                  <div class="xera-mm-provider-card" data-provider="orange_money">
                    <input type="radio" name="xera-mm-provider" value="orange_money" style="display:none;">
                    ${LOGOS.orange}
                    <span class="xera-mm-check-badge">✓</span>
                  </div>
                  <div class="xera-mm-provider-card" data-provider="mpesa">
                    <input type="radio" name="xera-mm-provider" value="mpesa" style="display:none;">
                    ${LOGOS.mpesa}
                    <span class="xera-mm-check-badge">✓</span>
                  </div>
                </div>
              </div>

              <!-- Numéro de téléphone RDC -->
              <div class="xera-mm-section">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <label class="xera-mm-label" style="margin:0;">Numéro de téléphone RDC :</label>
                  <span id="xera-mm-detected-op" class="xera-mm-detected-tag"></span>
                </div>
                <div class="xera-mm-phone-wrap">
                  <span class="xera-mm-phone-prefix">🇨🇩 +243</span>
                  <input id="xera-mm-phone" type="tel" placeholder="974 123 456" class="xera-mm-phone-input" />
                  <span id="xera-mm-phone-check" class="xera-mm-phone-check">✓</span>
                </div>
                <div class="xera-mm-phone-hint">Format : 9 ou 10 chiffres (ex: 0974123456 ou 0812345678)</div>
              </div>

              <!-- Erreur de validation ou rejet API -->
              <div id="xera-mm-form-error" class="xera-mm-error"></div>

              <!-- Bouton de paiement dynamique -->
              <button id="xera-mm-submit-btn" type="button" class="xera-mm-submit" disabled>
                Payer par Mobile Money
              </button>

              <div class="xera-mm-footer-note">
                🔒 Paiement direct et chiffré — validation par code PIN sur votre téléphone
              </div>
            </div>

            <!-- STEP 2 : EN ATTENTE USSD -->
            <div id="xera-mm-step-waiting" style="display:none;text-align:center;padding:12px 0;">
              <div class="xera-mm-pulse-icon">📱</div>
              <h4 style="margin:0 0 8px;font-size:1.2rem;color:#fff;font-weight:700;">Validez sur votre téléphone</h4>
              <p style="font-size:0.9rem;color:#94a3b8;margin:0 auto 18px;max-width:320px;line-height:1.45;">
                Un prompt push USSD a été envoyé sur votre numéro. Veuillez taper votre code secret Mobile Money pour autoriser la transaction.
              </p>
              
              <div class="xera-mm-timer-box">
                <div style="font-size:0.75rem;color:#8b949e;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Temps restant</div>
                <div id="xera-mm-countdown" class="xera-mm-timer-val">02:00</div>
              </div>

              <div style="font-size:0.85rem;color:#cbd5e1;display:flex;align-items:center;justify-content:center;gap:8px;">
                <span style="width:8px;height:8px;border-radius:50%;background:#eab308;animation:xeraMmPulse 1s infinite;"></span>
                <span>En attente de votre confirmation...</span>
              </div>
            </div>

            <!-- STEP 3 : SUCCÈS -->
            <div id="xera-mm-step-success" style="display:none;text-align:center;padding:18px 0;">
              <div style="width:68px;height:68px;border-radius:50%;background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.4);display:grid;place-items:center;margin:0 auto 16px;color:#10b981;font-size:2.2rem;font-weight:900;">
                ✓
              </div>
              <h4 style="margin:0 0 8px;font-size:1.25rem;color:#10b981;font-weight:700;">Paiement confirmé !</h4>
              <p style="font-size:0.92rem;color:#94a3b8;margin:0 0 16px;line-height:1.45;">
                ${isSupport ? "Votre soutien a été envoyé avec succès au créateur. Merci pour votre générosité !" : "Votre abonnement a été activé avec succès. Vos avantages sont débloqués !"}
              </p>
            </div>

            <!-- STEP 4 : ÉCHEC -->
            <div id="xera-mm-step-failed" style="display:none;text-align:center;padding:18px 0;">
              <div style="width:68px;height:68px;border-radius:50%;background:rgba(239,68,68,0.18);border:1px solid rgba(239,68,68,0.4);display:grid;place-items:center;margin:0 auto 16px;color:#ef4444;font-size:2.2rem;font-weight:900;">
                ✕
              </div>
              <h4 style="margin:0 0 8px;font-size:1.2rem;color:#ef4444;font-weight:700;">Paiement non confirmé</h4>
              <p id="xera-mm-failed-msg" style="font-size:0.9rem;color:#94a3b8;margin:0 0 20px;line-height:1.45;">
                La transaction a échoué ou a été annulée depuis votre téléphone.
              </p>
              <button id="xera-mm-retry-btn" type="button" class="xera-mm-btn-secondary">
                Réessayer
              </button>
            </div>

            <!-- STEP 5 : TIMEOUT -->
            <div id="xera-mm-step-timeout" style="display:none;text-align:center;padding:18px 0;">
              <div style="width:68px;height:68px;border-radius:50%;background:rgba(234,179,8,0.18);border:1px solid rgba(234,179,8,0.4);display:grid;place-items:center;margin:0 auto 16px;color:#eab308;font-size:2rem;">
                ⏳
              </div>
              <h4 style="margin:0 0 8px;font-size:1.2rem;color:#eab308;font-weight:700;">Délai d'attente dépassé</h4>
              <p style="font-size:0.88rem;color:#94a3b8;margin:0 0 20px;line-height:1.45;">
                Si vous avez saisi votre code PIN, votre transaction est en cours de traitement par l'opérateur et sera validée dès confirmation.
              </p>
              <div style="display:flex;gap:10px;justify-content:center;">
                <button id="xera-mm-recheck-btn" type="button" class="xera-mm-submit ready" style="width:auto;padding:10px 18px;font-size:0.9rem;">
                  Vérifier à nouveau
                </button>
                <button id="xera-mm-done-btn" type="button" class="xera-mm-btn-secondary">
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

  // ─── Contrôleur principal du checkout ──────────────────────────────────────
  async function openMobileMoneyCheckout(options) {
    options = options || {};
    injectStyles();
    cleanupModal();

    const isSupport = options.type === "support";
    let selectedAmount = isSupport ? (Number(options.amount || options.payload?.amount_usd) || 1) : null;
    let selectedProvider = "airtel_money";
    let userOverrodeOperator = false;

    const div = document.createElement("div");
    div.innerHTML = createModalHtml({ ...options, defaultAmount: selectedAmount });
    activeModalEl = div.firstElementChild;
    document.body.appendChild(activeModalEl);

    // Éléments DOM
    const closeBtn = document.getElementById("xera-mm-close-btn");
    const phoneInput = document.getElementById("xera-mm-phone");
    const phoneCheck = document.getElementById("xera-mm-phone-check");
    const submitBtn = document.getElementById("xera-mm-submit-btn");
    const formError = document.getElementById("xera-mm-form-error");
    const detectedOpTag = document.getElementById("xera-mm-detected-op");

    const stepForm = document.getElementById("xera-mm-step-form");
    const stepWaiting = document.getElementById("xera-mm-step-waiting");
    const stepSuccess = document.getElementById("xera-mm-step-success");
    const stepFailed = document.getElementById("xera-mm-step-failed");
    const stepTimeout = document.getElementById("xera-mm-step-timeout");
    const countdownEl = document.getElementById("xera-mm-countdown");

    function showStep(stepName) {
      stepForm.style.display = stepName === "form" ? "block" : "none";
      stepWaiting.style.display = stepName === "waiting" ? "block" : "none";
      stepSuccess.style.display = stepName === "success" ? "block" : "none";
      stepFailed.style.display = stepName === "failed" ? "block" : "none";
      stepTimeout.style.display = stepName === "timeout" ? "block" : "none";
    }

    closeBtn.addEventListener("click", () => cleanupModal());
    activeModalEl.addEventListener("click", (e) => {
      if (e.target === activeModalEl) cleanupModal();
    });

    // Gestion du montant pour le soutien
    function updateButtonLabel() {
      const opInfo = PROVIDER_INFO[selectedProvider] || { name: "Mobile Money" };
      if (isSupport) {
        submitBtn.textContent = `Payer ${selectedAmount.toFixed(2)} $ USD via ${opInfo.name}`;
      } else {
        submitBtn.textContent = `Activer via ${opInfo.name}`;
      }
    }

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

    // Gestion de la sélection d'opérateur
    const providerCards = activeModalEl.querySelectorAll(".xera-mm-provider-card");
    function setOperator(provKey, manual = false) {
      if (!PROVIDER_INFO[provKey]) return;
      selectedProvider = provKey;
      if (manual) userOverrodeOperator = true;

      providerCards.forEach((card) => {
        const isMatch = card.dataset.provider === provKey;
        card.classList.toggle("selected", isMatch);
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = isMatch;
      });

      updateButtonLabel();
    }

    providerCards.forEach((card) => {
      card.addEventListener("click", () => {
        setOperator(card.dataset.provider, true);
      });
    });

    // Validation du téléphone et détection automatique d'opérateur
    function validateForm() {
      const val = phoneInput.value.trim();
      const validPhone = isValidDrcPhone(val);

      // Auto-détection de l'opérateur selon le numéro
      if (!userOverrodeOperator) {
        const detected = detectOperatorFromPhone(val);
        if (detected) {
          setOperator(detected, false);
          if (detectedOpTag) {
            const info = PROVIDER_INFO[detected];
            detectedOpTag.style.display = "inline-block";
            detectedOpTag.style.color = info.color;
            detectedOpTag.textContent = `⚡ ${info.name} détecté`;
          }
        } else if (detectedOpTag) {
          detectedOpTag.style.display = "none";
        }
      }

      const validAmount = !isSupport || (Number.isInteger(selectedAmount) && selectedAmount >= 1 && selectedAmount <= 1000);

      if (validPhone) {
        phoneInput.style.borderColor = "#10b981";
        phoneCheck.style.display = "block";
      } else {
        phoneInput.style.borderColor = val.length > 3 ? "#ef4444" : "rgba(255, 255, 255, 0.12)";
        phoneCheck.style.display = "none";
      }

      if (validPhone && validAmount) {
        submitBtn.disabled = false;
        submitBtn.classList.add("ready");
      } else {
        submitBtn.disabled = true;
        submitBtn.classList.remove("ready");
      }
    }

    phoneInput.addEventListener("input", validateForm);
    updateButtonLabel();
    setTimeout(() => phoneInput.focus(), 50);

    let currentTxId = null;

    // Polling du statut
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
          showStep("success");

          if (typeof options.onSuccess === "function") {
            options.onSuccess(data);
          }

          setTimeout(() => {
            cleanupModal();
            window.location.reload();
          }, 2400);
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

      let secondsLeft = 120;
      countdownIntervalId = setInterval(() => {
        secondsLeft -= 1;
        const mins = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
        const secs = String(secondsLeft % 60).padStart(2, "0");
        if (countdownEl) countdownEl.textContent = mins + ":" + secs;

        if (secondsLeft <= 0) {
          clearInterval(countdownIntervalId);
          clearInterval(pollIntervalId);
          showStep("timeout");
        }
      }, 1000);

      pollIntervalId = setInterval(() => pollStatus(txId), 3000);
      pollStatus(txId);
    }

    // Clic sur Payer
    submitBtn.addEventListener("click", async () => {
      formError.style.display = "none";
      const rawPhone = phoneInput.value.trim();

      if (!isValidDrcPhone(rawPhone)) {
        formError.textContent = "Veuillez entrer un numéro de téléphone RDC valide (+243...).";
        formError.style.display = "block";
        return;
      }

      if (isSupport && (!selectedAmount || selectedAmount < 1)) {
        formError.textContent = "Veuillez sélectionner un montant valide (minimum 1 $).";
        formError.style.display = "block";
        return;
      }

      const normalizedPhone = normalizeDrcPhone(rawPhone);
      const supportMsgInput = document.getElementById("xera-mm-support-msg");
      const supportMessage = supportMsgInput ? supportMsgInput.value.trim() : "";

      submitBtn.disabled = true;
      submitBtn.classList.remove("ready");
      submitBtn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:xeraMmSpin 0.6s linear infinite;margin-right:8px;vertical-align:middle;"></span> Initialisation...';

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
        formError.textContent = "Erreur réseau : " + err.message;
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
    });
  }

  // Helper pour ouvrir directement le soutien à un créateur
  async function openSupportCheckout({ creatorId, creatorName, accessToken, onSuccess }) {
    return openMobileMoneyCheckout({
      type: "support",
      title: `Soutien à ${creatorName || "ce créateur"}`,
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
