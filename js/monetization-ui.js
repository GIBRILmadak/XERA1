/* ========================================
   MONÉTISATION UI INTEGRATION - VERSION CORRIGÉE
   Intégration des badges et boutons de soutien dans les profils et contenus
   ======================================== */

let monetizationUiInitialized = false;

// État global pour éviter les doublons de requêtes
// Noms propres à ce fichier : monetization.js et supabase-config.js déclarent
// déjà supportCheckoutInProgress / formatCurrency / checkAuth au niveau global,
// et un doublon de `let` empêchait tout ce script de se charger.
let supportUiCheckoutInProgress = false;

function handleSupportButtonClick(e) {
    const supportBtn = e.target.closest(".support-btn-active");
    if (!supportBtn) return;

    const creatorId = supportBtn.dataset.creatorId;
    const creatorName = supportBtn.dataset.creatorName || "Créateur";

    if (!creatorId) return;

    e.preventDefault();
    if (typeof e.stopImmediatePropagation === "function") {
        e.stopImmediatePropagation();
    }
    e.stopPropagation();
    openSupportModal(creatorId, creatorName, supportBtn);
}

function resolveSupportCreatorName(creatorName, sourceElement = null) {
    const resolvedName = String(
        creatorName || sourceElement?.dataset?.creatorName || "",
    ).trim();
    return resolvedName || "Créateur";
}

// Initialiser la monétisation sur la page
function initMonetizationUI() {
    if (monetizationUiInitialized) return;
    monetizationUiInitialized = true;

    // Injecter le CSS si pas déjà présent
    if (!document.getElementById("monetization-css")) {
        const link = document.createElement("link");
        link.id = "monetization-css";
        link.rel = "stylesheet";
        link.href = "css/monetization.css";
        document.head.appendChild(link);
    }

    // Ajouter les écouteurs pour les boutons de soutien
    document.addEventListener("click", handleSupportButtonClick, true);
}

// Générer le HTML pour le badge de plan
function generatePlanBadgeHTML(user, context = "profile") {
    if (!user || !user.plan || user.plan === "free") return "";
    if (String(user.plan_status || "").toLowerCase() !== "active") return "";
    if (
        typeof isPlanActiveForUser === "function" &&
        !isPlanActiveForUser(user)
    ) {
        return "";
    }
    if (context !== "profile") {
        return "";
    }

    const planColors = {
        standard: "#3498db",
        medium: "#9b59b6",
        pro: "#f39c12",
    };

    const planLabels = {
        standard: "Standard",
        medium: "Medium",
        pro: "Pro",
    };

    const color = planColors[user.plan] || "#95a5a6";
    const label = planLabels[user.plan] || user.plan;
    const hasMonetization =
        user.is_monetized === true ||
        (typeof isGiftedPro === "function" && isGiftedPro(user));
    const verified = hasMonetization
        ? '<i class="fas fa-check-circle" title="Monétisation activée"></i>'
        : "";

    return `
        <span class="user-plan-badge" style="
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 10px;
            background: ${color};
            color: white;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-left: 8px;
            vertical-align: middle;
        ">
            ${label}
            ${verified}
        </span>
    `;
}

// Générer le bouton de soutien
function generateSupportButtonHTML(user, context = "profile") {
    const canSupport = canReceiveSupport(user);
    const size = context === "profile" ? "large" : "large";

    if (!canSupport) {
        return "";
    }

    const buttonClass = `support-btn support-btn-active support-btn-profile ${size}`;
    const labelHtml = '<span class="support-btn-label">Soutenir</span>';
    const creatorId = String(user.id || "");
    const creatorName = escapeSupportHtmlAttr(user.name || "Créateur");
    const supportContext = escapeSupportHtmlAttr(context || "profile");

    return `
        <button class="${buttonClass}" 
                data-creator-id="${creatorId}"
                data-creator-name="${creatorName}"
                data-support-context="${supportContext}"
                title="Soutenir ce créateur"
                aria-label="Soutenir ce créateur">
            <img src="icons/soutien.svg" alt="" class="support-icon-img">
            ${labelHtml}
        </button>
    `;
}

function escapeSupportHtmlAttr(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// Variables globales pour la modale
let globalSupportState = {
    creatorId: null,
    creatorName: "",
    amount: 0,
    message: "",
    returnPath: "",
};

// Générer une modale de soutien
function createSupportModal() {
    if (document.getElementById("support-modal-global")) return;

    const modal = document.createElement("div");
    modal.id = "support-modal-global";
    modal.className = "modal";
    modal.innerHTML = `
        <div class="modal-content support-modal-content" role="dialog" aria-modal="true" aria-labelledby="support-modal-title">
            <div class="modal-header support-modal-header">
                <div class="support-modal-title-group">
                    <span class="support-heart-mark" aria-hidden="true"><i class="fas fa-heart"></i></span>
                    <div>
                        <p class="support-modal-eyebrow">SOUTIEN DIRECT</p>
                        <h2 id="support-modal-title">Soutenir <span id="support-creator-name"></span></h2>
                    </div>
                </div>
                <button class="close-btn" type="button" onclick="closeGlobalSupportModal()" aria-label="Fermer la fenêtre de soutien">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body support-modal-body">
                <p class="support-desc">Choisissez le montant qui vous ressemble. Votre soutien est envoyé de façon sécurisée via KPay.</p>
                <div class="amount-options" id="global-amount-options">
                    <button class="amount-btn" type="button" data-amount="1" onclick="selectGlobalSupportAmount(1)">$1</button>
                    <button class="amount-btn" type="button" data-amount="3" onclick="selectGlobalSupportAmount(3)">$3</button>
                    <button class="amount-btn" type="button" data-amount="5" onclick="selectGlobalSupportAmount(5)">$5</button>
                    <button class="amount-btn" type="button" data-amount="10" onclick="selectGlobalSupportAmount(10)">$10</button>
                    <button class="amount-btn" type="button" data-amount="25" onclick="selectGlobalSupportAmount(25)">$25</button>
                    <button class="amount-btn" type="button" data-amount="50" onclick="selectGlobalSupportAmount(50)">$50</button>
                </div>
                <div class="custom-amount">
                    <label for="global-custom-amount">Ou choisissez votre montant</label>
                    <div class="support-amount-input-wrap">
                        <span aria-hidden="true">$</span>
                        <input type="number" id="global-custom-amount" min="1" max="1000" step="1" inputmode="numeric" placeholder="Montant personnalisé" oninput="handleGlobalCustomAmount()">
                    </div>
                </div>
                <div class="support-summary">
                    <div class="summary-row">
                        <span><i class="fas fa-hand-holding-heart" aria-hidden="true"></i> Votre soutien</span>
                        <span id="global-summary-amount">$0.00</span>
                    </div>
                </div>
                <div class="support-message-wrap" style="margin-top:16px;">
                    <label for="global-support-message" style="display:block;margin-bottom:8px;font-weight:700;color:#748aa8;">Message (optionnel)</label>
                    <textarea id="global-support-message" rows="3" maxlength="200" placeholder="Ajoutez un message à votre soutien..." style="width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #d1d5db;border-radius:12px;resize:vertical;background:#fff;color:#111827;font:inherit;"></textarea>
                </div>
                <fieldset class="support-payment-picker">
                    <legend>Moyen de paiement</legend>
                    <p>Choisissez votre méthode préférée. Le paiement s'effectue directement sur cette page via KPay.</p>
                    <div class="support-payment-cards" role="radiogroup" aria-label="Moyen de paiement">
                        <button class="support-payment-card is-selected" type="button" data-payment-method="card" role="radio" aria-checked="true" onclick="selectGlobalSupportPaymentMethod('card')">
                            <span class="support-payment-icon support-payment-icon-card" aria-hidden="true"><img src="icons/visa.svg" alt=""><img src="icons/mastercard.svg" alt=""></span>
                            <span class="support-payment-card-copy"><strong>Carte bancaire</strong><small>Visa · Mastercard</small></span>
                            <span class="support-payment-check" aria-hidden="true"><i class="fas fa-check"></i></span>
                        </button>
                        <button class="support-payment-card" type="button" data-payment-method="mobile_money" role="radio" aria-checked="false" onclick="selectGlobalSupportPaymentMethod('mobile_money')">
                            <span class="support-payment-icon support-payment-icon-mobile" aria-hidden="true"><img src="icons/mobile%20pay.svg" alt=""></span>
                            <span class="support-payment-card-copy"><strong>Mobile Money</strong><small>Paiement par téléphone</small></span>
                            <span class="support-payment-check" aria-hidden="true"><i class="fas fa-check"></i></span>
                        </button>
                        <button class="support-payment-card" type="button" data-payment-method="paypal" role="radio" aria-checked="false" onclick="selectGlobalSupportPaymentMethod('paypal')">
                            <span class="support-payment-icon support-payment-icon-paypal" aria-hidden="true"><img src="icons/paypal.svg" alt=""></span>
                            <span class="support-payment-card-copy"><strong>PayPal</strong><small>Compte PayPal sécurisé</small></span>
                            <span class="support-payment-check" aria-hidden="true"><i class="fas fa-check"></i></span>
                        </button>
                    </div>
                </fieldset>
                <select id="global-support-payment-method" class="support-payment-native-select" aria-label="Moyen de paiement" onchange="selectGlobalSupportPaymentMethod(this.value)">
                    <option value="card">Carte bancaire (Visa / Mastercard)</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="paypal">PayPal</option>
                </select>
                <div id="global-support-mobile-fields" style="display:none;margin-top:14px;padding:14px;border:1px solid rgba(243,156,18,0.3);border-radius:12px;background:rgba(10,10,12,0.6);">
                    <div style="margin-bottom:10px;">
                        <label for="global-support-country" style="display:block;margin-bottom:4px;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:#aaa;">Pays</label>
                        <select id="global-support-country" class="form-input" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--border-color, #333);border-radius:8px;background:#111;color:#fff;font:inherit;" onchange="updateGlobalSupportOperators()">
                            <option value="CD">🇨🇩 RD Congo (+243, CDF)</option>
                            <option value="CM">🇨🇲 Cameroun (+237, XAF)</option>
                            <option value="CG">🇨🇬 Congo-Brazzaville (+242, XAF)</option>
                            <option value="CI">🇨🇮 Côte d'Ivoire (+225, XOF)</option>
                            <option value="GA">🇬🇦 Gabon (+241, XAF)</option>
                            <option value="KE">🇰🇪 Kenya (+254, KES)</option>
                            <option value="UG">🇺🇬 Ouganda (+256, UGX)</option>
                            <option value="RW">🇷🇼 Rwanda (+250, RWF)</option>
                            <option value="SN">🇸🇳 Sénégal (+221, XOF)</option>
                            <option value="SL">🇸🇱 Sierra Leone (+232, SLE)</option>
                            <option value="BJ">🇧🇯 Bénin (+229, XOF)</option>
                            <option value="ZM">🇿🇲 Zambie (+260, ZMW)</option>
                        </select>
                    </div>
                    <div style="margin-bottom:10px;">
                        <label for="global-support-provider" style="display:block;margin-bottom:4px;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:#aaa;">Opérateur Mobile Money</label>
                        <select id="global-support-provider" class="form-input" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--border-color, #333);border-radius:8px;background:#111;color:#fff;font:inherit;">
                            <option value="VODACOM_MPESA_COD">Vodacom M-Pesa</option>
                            <option value="MTN_MOMO_COD">MTN Mobile Money</option>
                            <option value="AIRTEL_COD">Airtel Money</option>
                            <option value="ORANGE_COD">Orange Money</option>
                        </select>
                    </div>
                    <div>
                        <label for="global-support-phone" style="display:block;margin-bottom:4px;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:#aaa;">Numéro de téléphone</label>
                        <input id="global-support-phone" class="form-input" type="tel" placeholder="ex: 0812345678" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--border-color, #333);border-radius:8px;background:#111;color:#fff;font:inherit;" />
                    </div>
                </div>
                <div id="kpay-iframe-container" style="display:none;margin-top:16px;border-radius:12px;overflow:hidden;">
                    <iframe id="kpay-iframe" src="" style="width:100%;height:500px;border:none;" allow="payment"></iframe>
                </div>
                <p class="support-payment-help"><i class="fas fa-shield-alt" aria-hidden="true"></i> Paiement sécurisé et traité par KPay. Vos informations restent protégées.</p>
                <button class="btn-primary btn-full" id="global-support-submit" onclick="processGlobalSupport()" disabled>
                    <span class="support-submit-icon"><i class="fas fa-heart"></i></span> Envoyer le soutien <i class="fas fa-arrow-right support-submit-arrow" aria-hidden="true"></i>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Fermer en cliquant à l'extérieur
    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            closeGlobalSupportModal();
        }
    });

    modal.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeGlobalSupportModal();
    });
}

// Ouvrir la modale de soutien globale
function openSupportModal(creatorId, creatorName, sourceElement = null) {
    createSupportModal();

    const resolvedCreatorName = resolveSupportCreatorName(
        creatorName,
        sourceElement,
    );

    globalSupportState = {
        creatorId,
        creatorName: resolvedCreatorName,
        amount: 0,
        message: "",
        returnPath:
            typeof buildSupportReturnPath === "function"
                ? buildSupportReturnPath(sourceElement)
                : `${window.location.pathname}${window.location.search}${window.location.hash}`,
    };

    const messageInput = document.getElementById("global-support-message");
    if (messageInput) {
        messageInput.value = "";
    }

    const creatorNameEl = document.getElementById("support-creator-name");
    if (creatorNameEl) {
        creatorNameEl.textContent = resolvedCreatorName;
    }

    // Réinitialiser la sélection
    document
        .querySelectorAll("#global-amount-options .amount-btn")
        .forEach((btn) => {
            btn.classList.remove("selected");
        });
    document.getElementById("global-custom-amount").value = "";
    selectGlobalSupportPaymentMethod("card");
    updateGlobalSupportSummary();
    updateGlobalSupportOperators();

    const modal = document.getElementById("support-modal-global");
    if (modal) {
        modal.classList.add("active");
    }
}

// Le select natif reste la source de vérité pour le checkout ; les cartes
// apportent uniquement une sélection visuelle plus agréable et accessible.
function selectGlobalSupportPaymentMethod(method) {
    const validMethod = ["card", "mobile_money", "paypal"].includes(method)
        ? method
        : "card";
    const nativeSelect = document.getElementById(
        "global-support-payment-method",
    );
    if (nativeSelect) nativeSelect.value = validMethod;

    document
        .querySelectorAll("#support-modal-global .support-payment-card")
        .forEach((card) => {
            const isSelected = card.dataset.paymentMethod === validMethod;
            card.classList.toggle("is-selected", isSelected);
            card.setAttribute("aria-checked", String(isSelected));
        });

    const mobileFields = document.getElementById("global-support-mobile-fields");
    const kpayIframeContainer = document.getElementById("kpay-iframe-container");
    
    if (mobileFields) {
        mobileFields.style.display = validMethod === "mobile_money" ? "block" : "none";
    }
    
    // Pour les cartes, on pourrait afficher une iframe KPay
    if (kpayIframeContainer) {
        kpayIframeContainer.style.display = validMethod === "card" ? "block" : "none";
    }
}

const GLOBAL_COUNTRY_OPERATORS = {
    CD: {
        name: "🇨🇩 RD Congo (+243, CDF)",
        dial: "+243",
        placeholder: "ex: 0812345678",
        providers: [
            { value: "VODACOM_MPESA_COD", label: "Vodacom M-Pesa" },
            { value: "MTN_MOMO_COD",      label: "MTN Mobile Money" },
            { value: "AIRTEL_COD",        label: "Airtel Money" },
            { value: "ORANGE_COD",        label: "Orange Money" },
        ],
    },
    CM: {
        name: "🇨🇲 Cameroun (+237, XAF)",
        dial: "+237",
        placeholder: "ex: 670123456",
        providers: [
            { value: "MTN_MOMO_CMR",  label: "MTN Mobile Money" },
            { value: "ORANGE_CMR",    label: "Orange Money" },
        ],
    },
    CG: {
        name: "🇨🇬 Congo-Brazzaville (+242, XAF)",
        dial: "+242",
        placeholder: "ex: 060123456",
        providers: [
            { value: "MTN_MOMO_COG",  label: "MTN Mobile Money" },
            { value: "AIRTEL_COG",    label: "Airtel Money" },
        ],
    },
    CI: {
        name: "🇨🇮 Côte d'Ivoire (+225, XOF)",
        dial: "+225",
        placeholder: "ex: 0701234567",
        providers: [
            { value: "MTN_MOMO_CIV",  label: "MTN Mobile Money" },
            { value: "ORANGE_CIV",    label: "Orange Money" },
        ],
    },
    GA: {
        name: "🇬🇦 Gabon (+241, XAF)",
        dial: "+241",
        placeholder: "ex: 074123456",
        providers: [
            { value: "AIRTEL_GAB",    label: "Airtel Money" },
        ],
    },
    KE: {
        name: "🇰🇪 Kenya (+254, KES)",
        dial: "+254",
        placeholder: "ex: 0712345678",
        providers: [
            { value: "MPESA_KEN",     label: "M-Pesa" },
        ],
    },
    UG: {
        name: "🇺🇬 Ouganda (+256, UGX)",
        dial: "+256",
        placeholder: "ex: 0712345678",
        providers: [
            { value: "AIRTEL_OAPI_UGA",  label: "Airtel Money" },
            { value: "MTN_MOMO_UGA",     label: "MTN Mobile Money" },
        ],
    },
    RW: {
        name: "🇷🇼 Rwanda (+250, RWF)",
        dial: "+250",
        placeholder: "ex: 0781234567",
        providers: [
            { value: "MTN_MOMO_RWA",  label: "MTN Mobile Money" },
            { value: "AIRTEL_RWA",    label: "Airtel Money" },
        ],
    },
    SN: {
        name: "🇸🇳 Sénégal (+221, XOF)",
        dial: "+221",
        placeholder: "ex: 771234567",
        providers: [
            { value: "FREE_SEN",      label: "Free Money" },
            { value: "ORANGE_SEN",   label: "Orange Money" },
        ],
    },
    SL: {
        name: "🇸🇱 Sierra Leone (+232, SLE)",
        dial: "+232",
        placeholder: "ex: 076123456",
        providers: [
            { value: "ORANGE_SLE",    label: "Orange Money" },
        ],
    },
    BJ: {
        name: "🇧🇯 Bénin (+229, XOF)",
        dial: "+229",
        placeholder: "ex: 97123456",
        providers: [
            { value: "MTN_MOMO_BEN",  label: "MTN Mobile Money" },
            { value: "MOOV_BEN",      label: "Moov Money" },
        ],
    },
    ZM: {
        name: "🇿🇲 Zambie (+260, ZMW)",
        dial: "+260",
        placeholder: "ex: 0961234567",
        providers: [
            { value: "AIRTEL_OAPI_ZMB",  label: "Airtel Money" },
            { value: "MTN_MOMO_ZMB",     label: "MTN Mobile Money" },
            { value: "ZAMTEL_ZMB",       label: "Zamtel" },
        ],
    },
};

function updateGlobalSupportOperators() {
    const countrySelect = document.getElementById("global-support-country");
    const country = countrySelect?.value || "CD";
    const providerSelect = document.getElementById("global-support-provider");
    const phoneInput = document.getElementById("global-support-phone");
    
    if (!providerSelect) return;
    const countryData = GLOBAL_COUNTRY_OPERATORS[country] || GLOBAL_COUNTRY_OPERATORS.CD;
    providerSelect.innerHTML = countryData.providers.map(op => `<option value="${op.value}">${op.label}</option>`).join("");

    if (phoneInput) {
        phoneInput.placeholder = countryData.placeholder;
    }
}

// Fermer la modale globale
function closeGlobalSupportModal() {
    const modal = document.getElementById("support-modal-global");
    if (modal) {
        modal.classList.remove("active");
    }
    globalSupportState.amount = 0;
    globalSupportState.message = "";
    const messageInput = document.getElementById("global-support-message");
    if (messageInput) {
        messageInput.value = "";
    }
    supportUiCheckoutInProgress = false;
    // Réactiver le bouton
    const submitBtn = document.getElementById("global-support-submit");
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-heart"></i> Envoyer le soutien';
    }
}

// Sélectionner un montant prédéfini
function selectGlobalSupportAmount(amount) {
    globalSupportState.amount = amount;

    // Mettre à jour l'UI
    document
        .querySelectorAll("#global-amount-options .amount-btn")
        .forEach((btn) => {
            btn.classList.remove("selected");
            if (parseFloat(btn.dataset.amount) === amount) {
                btn.classList.add("selected");
            }
        });

    // Réinitialiser le custom
    document.getElementById("global-custom-amount").value = "";

    updateGlobalSupportSummary();
}

// Gérer le montant personnalisé
function handleGlobalCustomAmount() {
    const input = document.getElementById("global-custom-amount");
    const value = parseFloat(input.value) || 0;

    // Réinitialiser les boutons
    document
        .querySelectorAll("#global-amount-options .amount-btn")
        .forEach((btn) => {
            btn.classList.remove("selected");
        });

    globalSupportState.amount = value;
    updateGlobalSupportSummary();
}

// Mettre à jour le résumé
function updateGlobalSupportSummary() {
    const amount = globalSupportState.amount || 0;

    const amountEl = document.getElementById("global-summary-amount");
    if (amountEl) amountEl.textContent = formatSupportAmount(amount);

    // Activer/désactiver le bouton
    const submitBtn = document.getElementById("global-support-submit");
    if (Number.isInteger(amount) && amount >= 1 && amount <= 1000) {
        submitBtn.disabled = false;
    } else {
        submitBtn.disabled = true;
    }
}

function formatSupportAmount(amount) {
    if (!Number.isFinite(amount)) return "$0.00";
    const rounded = Math.round(amount * 100) / 100;
    return `$${rounded.toFixed(2)}`;
}

// Traiter le soutien
async function processGlobalSupport() {
    // Empêcher les clics multiples
    if (supportUiCheckoutInProgress) {
        showGlobalNotification("Paiement déjà en cours...", "info");
        return;
    }

    const { creatorId, amount } = globalSupportState;
    const messageInput = document.getElementById("global-support-message");
    const supportMessage = String(messageInput?.value || "").trim();
    globalSupportState.message = supportMessage;

    if (!creatorId || amount < 1) {
        showGlobalNotification(
            "Veuillez sélectionner un montant valide",
            "error",
        );
        return;
    }

    try {
        // Vérifier si l'utilisateur est connecté
        const currentUser = await getMonetizationAuthUser();
        if (!currentUser) {
            showGlobalNotification(
                "Veuillez vous connecter pour envoyer un soutien",
                "error",
            );
            window.location.href =
                "login.html?redirect=" +
                encodeURIComponent(window.location.href);
            return;
        }

        const submitBtn = document.getElementById("global-support-submit");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML =
                '<i class="fas fa-spinner fa-spin"></i> Traitement...';
        }

        supportUiCheckoutInProgress = true;

        const selectedMethod =
            document.getElementById("global-support-payment-method")?.value ||
            "card";
        const walletId =
            document.getElementById("global-support-phone")?.value?.trim() ||
            null;
        const provider =
            document.getElementById("global-support-provider")?.value || null;

        // Valider les champs requis pour Mobile Money
        if (selectedMethod === "mobile_money" && !walletId) {
            supportUiCheckoutInProgress = false;
            showGlobalNotification("Veuillez entrer votre numéro de téléphone", "error");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-heart"></i> Envoyer le soutien';
            }
            return;
        }

        // Appeler l'API pour initialiser le paiement
        const result = await redirectToSupportCheckout({
            creatorId,
            creatorName: globalSupportState.creatorName,
            amount,
            description: "Soutien depuis le profil",
            message: supportMessage,
            returnPath: globalSupportState.returnPath,
            paymentMethod: selectedMethod,
            walletId: walletId,
            provider: provider,
        });

        if (result.success) {
            // Si c'est une redirection, on ne ferme pas la modale
            // Le serveur va gérer la redirection
            if (!result.data?.gatewayUrl) {
                closeGlobalSupportModal();
            }
        } else {
            showGlobalNotification(
                result.error || "Erreur lors du traitement du paiement",
                "error",
            );
        }
    } catch (error) {
        console.error("Exception traitement soutien:", error);
        showGlobalNotification(
            error.message || "Une erreur est survenue lors du paiement",
            "error",
        );
    } finally {
        supportUiCheckoutInProgress = false;
        const submitBtn = document.getElementById("global-support-submit");
        if (submitBtn) {
            submitBtn.disabled = !(
                Number.isInteger(amount) &&
                amount >= 1 &&
                amount <= 1000
            );
            submitBtn.innerHTML =
                '<i class="fas fa-heart"></i> Envoyer le soutien';
        }
    }
}

// Afficher une notification globale In-App style XERA
function showGlobalNotification(message, type = "info") {
    // Supprimer les notifications existantes pour ne pas encombrer l'écran
    const existing = document.querySelectorAll(".xera-inapp-toast");
    existing.forEach((el) => el.remove());

    const notification = document.createElement("div");
    notification.className = `xera-inapp-toast notification notification-${type}`;

    const borderColors = {
        success: "#2ecc71",
        error: "#ff4757",
        info: "#f39c12",
        warning: "#f1c40f",
    };

    const iconColors = {
        success: "#2ecc71",
        error: "#ff4757",
        info: "#f39c12",
        warning: "#f1c40f",
    };

    const color = borderColors[type] || borderColors.info;

    notification.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        padding: 14px 22px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 14px;
        font-weight: 600;
        font-family: 'Inter', system-ui, sans-serif;
        z-index: 100000;
        background: rgba(14, 14, 18, 0.92);
        color: #ffffff;
        border: 1px solid ${color};
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6), 0 0 15px ${color}33;
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        max-width: 420px;
        line-height: 1.4;
    `;

    const icons = {
        success: "fa-check-circle",
        error: "fa-exclamation-triangle",
        info: "fa-info-circle",
        warning: "fa-bell",
    };

    notification.innerHTML = `
        <i class="fas ${icons[type] || icons.info}" style="color: ${color}; font-size: 18px; flex-shrink: 0;"></i>
        <span style="flex: 1;">${message}</span>
        <button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:16px;padding:0;margin-left:8px;">&times;</button>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.opacity = "0";
            notification.style.transform = "translateY(-10px)";
            setTimeout(() => notification.remove(), 300);
        }
    }, 6000);
}

// Exposer globalement pour remplacer les alertes natives du navigateur
window.showToast = showGlobalNotification;
window.showToastNotification = showGlobalNotification;

// Intégrer la monétisation dans un profil
function integrateMonetizationInProfile(profileElement, user) {
    if (!profileElement || !user) return;

    // Ajouter le badge de plan
    const nameElement = profileElement.querySelector(
        ".profile-name, .user-name, h1, h2",
    );
    if (nameElement && user.plan && user.plan !== "free") {
        const badgeHTML = generatePlanBadgeHTML(user, "profile");
        if (!nameElement.querySelector(".user-plan-badge")) {
            nameElement.insertAdjacentHTML("beforeend", badgeHTML);
        }
    }

    // Ajouter le bouton de soutien
    const actionsElement = profileElement.querySelector(
        ".profile-actions, .user-actions",
    );
    if (actionsElement) {
        const supportHTML = generateSupportButtonHTML(user, "profile");
        if (supportHTML && !actionsElement.querySelector(".support-btn")) {
            actionsElement.insertAdjacentHTML("beforeend", supportHTML);
        }
    }
}

// Intégrer la monétisation dans une carte de contenu
function integrateMonetizationInContentCard(cardElement, user) {
    if (!cardElement || !user) return;

    // Ajouter le badge de plan sur le nom de l'auteur
    const authorElement = cardElement.querySelector(
        ".content-author, .post-author",
    );
    if (authorElement && user.plan && user.plan !== "free") {
        const badgeHTML = generatePlanBadgeHTML(user, "feed");
        if (!authorElement.querySelector(".user-plan-badge")) {
            authorElement.insertAdjacentHTML("beforeend", badgeHTML);
        }
    }

    // Ajouter le bouton de soutien dans les actions
    const actionsElement = cardElement.querySelector(
        ".content-actions, .post-actions",
    );
    if (actionsElement) {
        const supportHTML = generateSupportButtonHTML(user, "feed");
        if (supportHTML && !actionsElement.querySelector(".support-btn")) {
            actionsElement.insertAdjacentHTML("beforeend", supportHTML);
        }
    }
}

// Fonction utilitaire pour formater la devise

// Fonction utilitaire pour vérifier l'authentification
async function getMonetizationAuthUser() {
    if (typeof window.supabase !== "undefined") {
        const { data: { session }, error } = await window.supabase.auth.getSession();
        if (error) {
            console.error("Erreur de vérification d'authentification:", error);
            return null;
        }
        return session?.user || null;
    }
    return null;
}

// Initialisation au chargement de la page
document.addEventListener("DOMContentLoaded", () => {
    initMonetizationUI();
    createSupportModal();
});

// Exposer les fonctions globalement
window.initMonetizationUI = initMonetizationUI;
window.openSupportModal = openSupportModal;
window.closeGlobalSupportModal = closeGlobalSupportModal;
window.selectGlobalSupportAmount = selectGlobalSupportAmount;
window.handleGlobalCustomAmount = handleGlobalCustomAmount;
window.processGlobalSupport = processGlobalSupport;
window.generateSupportButtonHTML = generateSupportButtonHTML;
window.integrateMonetizationInProfile = integrateMonetizationInProfile;
window.integrateMonetizationInContentCard = integrateMonetizationInContentCard;
window.selectGlobalSupportPaymentMethod = selectGlobalSupportPaymentMethod;
window.updateGlobalSupportOperators = updateGlobalSupportOperators;
