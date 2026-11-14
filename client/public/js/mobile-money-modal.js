/**
 * client/public/js/mobile-money-modal.js
 *
 * Modale de paiement Mobile Money MaishaPay (Airtel Money, Orange Money, M-Pesa).
 * Branche : feat/maishapay-provider
 */

(function (window) {
  "use strict";

  let activeModalEl = null;
  let pollIntervalId = null;
  let countdownIntervalId = null;

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

  function createModalHtml(data) {
    const title = data.title || "Paiement Mobile Money";
    const amountLabel = data.amountLabel || "";

    return `
      <div id="xera-mm-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div id="xera-mm-dialog" style="background:#161b22;border:1px solid #30363d;border-radius:16px;width:100%;max-width:440px;color:#f0f6fc;box-shadow:0 20px 40px rgba(0,0,0,0.6);overflow:hidden;position:relative;">
          
          <div style="padding:20px 24px 16px;border-bottom:1px solid #21262d;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <h3 style="margin:0;font-size:1.15rem;font-weight:600;color:#fff;">${title}</h3>
              ${amountLabel ? `<div style="font-size:0.9rem;color:#58a6ff;margin-top:4px;font-weight:600;">${amountLabel}</div>` : ""}
            </div>
            <button id="xera-mm-close-btn" type="button" style="background:transparent;border:none;color:#8b949e;font-size:1.4rem;cursor:pointer;padding:4px 8px;line-height:1;" aria-label="Fermer">&times;</button>
          </div>

          <div id="xera-mm-content" style="padding:24px;">

            <div id="xera-mm-step-form">
              <label style="display:block;font-size:0.85rem;color:#8b949e;margin-bottom:8px;font-weight:500;">Choisissez votre opérateur :</label>
              <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-bottom:20px;">
                <label style="display:flex;flex-direction:column;align-items:center;padding:12px 8px;background:#0d1117;border:2px solid #30363d;border-radius:10px;cursor:pointer;text-align:center;">
                  <input type="radio" name="xera-mm-provider" value="airtel_money" checked style="margin-bottom:6px;">
                  <span style="font-size:0.85rem;font-weight:600;color:#ff4d4d;">Airtel</span>
                </label>
                <label style="display:flex;flex-direction:column;align-items:center;padding:12px 8px;background:#0d1117;border:2px solid #30363d;border-radius:10px;cursor:pointer;text-align:center;">
                  <input type="radio" name="xera-mm-provider" value="orange_money" style="margin-bottom:6px;">
                  <span style="font-size:0.85rem;font-weight:600;color:#ff9933;">Orange</span>
                </label>
                <label style="display:flex;flex-direction:column;align-items:center;padding:12px 8px;background:#0d1117;border:2px solid #30363d;border-radius:10px;cursor:pointer;text-align:center;">
                  <input type="radio" name="xera-mm-provider" value="mpesa" style="margin-bottom:6px;">
                  <span style="font-size:0.85rem;font-weight:600;color:#00cc66;">M-Pesa</span>
                </label>
              </div>

              <label style="display:block;font-size:0.85rem;color:#8b949e;margin-bottom:8px;font-weight:500;">Numéro de téléphone RDC :</label>
              <div style="position:relative;margin-bottom:8px;">
                <div style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-weight:600;color:#8b949e;font-size:0.95rem;">+243</div>
                <input id="xera-mm-phone" type="tel" placeholder="974 123 456" style="width:100%;box-sizing:border-box;background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:12px 40px 12px 64px;color:#fff;font-size:1rem;outline:none;" />
                <span id="xera-mm-phone-check" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);display:none;color:#3fb950;font-size:1.1rem;">✓</span>
              </div>
              <div id="xera-mm-phone-hint" style="font-size:0.75rem;color:#8b949e;margin-bottom:20px;">Format : 9 ou 10 chiffres (ex: 0812345678 ou 974123456)</div>

              <div id="xera-mm-form-error" style="display:none;background:rgba(248,81,73,0.15);border:1px solid #f85149;color:#ff7b72;padding:10px 12px;border-radius:8px;font-size:0.85rem;margin-bottom:16px;"></div>

              <button id="xera-mm-submit-btn" type="button" disabled style="width:100%;padding:14px;background:#238636;color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:not-allowed;opacity:0.6;transition:all 0.2s;">
                Payer par Mobile Money
              </button>
            </div>

            <div id="xera-mm-step-waiting" style="display:none;text-align:center;padding:12px 0;">
              <div style="width:64px;height:64px;border-radius:50%;background:rgba(88,166,255,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#58a6ff;font-size:1.8rem;">
                <span>📱</span>
              </div>
              <h4 style="margin:0 0 8px;font-size:1.1rem;color:#fff;">Validez sur votre téléphone</h4>
              <p style="font-size:0.9rem;color:#8b949e;margin:0 0 16px;line-height:1.4;">
                Un message push USSD a été envoyé sur votre numéro. Veuillez taper votre code secret Mobile Money pour confirmer le paiement.
              </p>
              
              <div style="background:#0d1117;border:1px solid #30363d;border-radius:10px;padding:12px;margin-bottom:16px;">
                <div style="font-size:0.8rem;color:#8b949e;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Temps restant</div>
                <div id="xera-mm-countdown" style="font-size:1.8rem;font-weight:700;color:#58a6ff;font-variant-numeric:tabular-nums;">02:00</div>
              </div>

              <div id="xera-mm-waiting-status" style="font-size:0.85rem;color:#8b949e;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#e3b341;margin-right:6px;"></span>
                En attente de votre confirmation...
              </div>
            </div>

            <div id="xera-mm-step-success" style="display:none;text-align:center;padding:16px 0;">
              <div style="width:64px;height:64px;border-radius:50%;background:rgba(63,185,80,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#3fb950;font-size:2rem;">
                ✓
              </div>
              <h4 style="margin:0 0 8px;font-size:1.2rem;color:#3fb950;">Paiement confirmé !</h4>
              <p style="font-size:0.9rem;color:#8b949e;margin:0 0 16px;">
                Votre transaction a été validée avec succès. Vos avantages sont désormais activés.
              </p>
            </div>

            <div id="xera-mm-step-failed" style="display:none;text-align:center;padding:16px 0;">
              <div style="width:64px;height:64px;border-radius:50%;background:rgba(248,81,73,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#f85149;font-size:2rem;">
                ✕
              </div>
              <h4 style="margin:0 0 8px;font-size:1.15rem;color:#f85149;">Paiement non confirmé</h4>
              <p id="xera-mm-failed-msg" style="font-size:0.9rem;color:#8b949e;margin:0 0 20px;">
                Le paiement a échoué ou a été annulé depuis votre téléphone.
              </p>
              <button id="xera-mm-retry-btn" type="button" style="padding:10px 20px;background:#21262d;color:#fff;border:1px solid #30363d;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;">
                Réessayer
              </button>
            </div>

            <div id="xera-mm-step-timeout" style="display:none;text-align:center;padding:16px 0;">
              <div style="width:64px;height:64px;border-radius:50%;background:rgba(227,179,65,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#e3b341;font-size:2rem;">
                ⏳
              </div>
              <h4 style="margin:0 0 8px;font-size:1.15rem;color:#e3b341;">Délai d'attente dépassé</h4>
              <p style="font-size:0.85rem;color:#8b949e;margin:0 0 20px;line-height:1.4;">
                Si vous avez saisi votre code PIN, votre transaction est en cours de traitement par l'opérateur et sera activée dès confirmation.
              </p>
              <div style="display:flex;gap:10px;justify-content:center;">
                <button id="xera-mm-recheck-btn" type="button" style="padding:10px 16px;background:#238636;color:#fff;border:none;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;">
                  Vérifier le statut
                </button>
                <button id="xera-mm-done-btn" type="button" style="padding:10px 16px;background:#21262d;color:#8b949e;border:1px solid #30363d;border-radius:8px;font-size:0.9rem;cursor:pointer;">
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

  async function openMobileMoneyCheckout(options) {
    options = options || {};
    cleanupModal();

    const div = document.createElement("div");
    div.innerHTML = createModalHtml(options);
    activeModalEl = div.firstElementChild;
    document.body.appendChild(activeModalEl);

    const closeBtn = document.getElementById("xera-mm-close-btn");
    const phoneInput = document.getElementById("xera-mm-phone");
    const phoneCheck = document.getElementById("xera-mm-phone-check");
    const submitBtn = document.getElementById("xera-mm-submit-btn");
    const formError = document.getElementById("xera-mm-form-error");

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

    function validatePhoneInput() {
      const val = phoneInput.value.trim();
      const valid = isValidDrcPhone(val);
      if (valid) {
        phoneInput.style.borderColor = "#3fb950";
        phoneCheck.style.display = "block";
        submitBtn.disabled = false;
        submitBtn.style.opacity = "1";
        submitBtn.style.cursor = "pointer";
      } else {
        phoneInput.style.borderColor = val.length > 3 ? "#f85149" : "#30363d";
        phoneCheck.style.display = "none";
        submitBtn.disabled = true;
        submitBtn.style.opacity = "0.6";
        submitBtn.style.cursor = "not-allowed";
      }
    }

    phoneInput.addEventListener("input", validatePhoneInput);
    phoneInput.focus();

    let currentTxId = null;

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
          }, 2000);
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

    submitBtn.addEventListener("click", async () => {
      formError.style.display = "none";
      const selectedOp = document.querySelector('input[name="xera-mm-provider"]:checked')?.value || "airtel_money";
      const rawPhone = phoneInput.value.trim();

      if (!isValidDrcPhone(rawPhone)) {
        formError.textContent = "Numéro de téléphone RDC invalide.";
        formError.style.display = "block";
        return;
      }

      const normalizedPhone = normalizeDrcPhone(rawPhone);

      submitBtn.disabled = true;
      submitBtn.textContent = "Initialisation...";

      try {
        const body = {
          type: options.type,
          phone: normalizedPhone,
          provider: selectedOp,
          currency: "CDF",
          ...(options.payload || {}),
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
          submitBtn.textContent = "Payer par Mobile Money";
          formError.textContent = data.message || "Impossible d’initier le paiement.";
          formError.style.display = "block";
        }
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Payer par Mobile Money";
        formError.textContent = "Erreur réseau : " + err.message;
        formError.style.display = "block";
      }
    });

    document.getElementById("xera-mm-retry-btn")?.addEventListener("click", () => {
      showStep("form");
      submitBtn.disabled = false;
      submitBtn.textContent = "Payer par Mobile Money";
      validatePhoneInput();
    });

    document.getElementById("xera-mm-recheck-btn")?.addEventListener("click", () => {
      if (currentTxId) {
        startWaitingTimer(currentTxId);
      }
    });

    document.getElementById("xera-mm-done-btn")?.addEventListener("click", () => {
      cleanupModal();
    });
  }

  window.XeraMobileMoney = {
    openCheckout: openMobileMoneyCheckout,
    isValidPhone: isValidDrcPhone,
    normalizePhone: normalizeDrcPhone,
  };

})(typeof window !== "undefined" ? window : this);
