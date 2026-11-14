/* ========================================
   LOGIQUE DE LA PAGE LOGIN
   ======================================== */

let isSignUpMode = false;
let pendingProvider = null;
let pendingTermsAcceptance = null;
const redirectTarget = new URLSearchParams(window.location.search).get(
    "redirect",
);

function resolveRedirectTarget() {
    if (!redirectTarget) {
        return window.XeraRouter?.buildUrl
            ? window.XeraRouter.buildUrl("discover")
            : "index.html";
    }
    if (
        redirectTarget.startsWith("http://") ||
        redirectTarget.startsWith("https://")
    ) {
        try {
            const targetUrl = new URL(redirectTarget);
            if (targetUrl.origin === window.location.origin) {
                return window.XeraRouter?.toCleanUrl
                    ? window.XeraRouter.toCleanUrl(targetUrl.toString())
                    : targetUrl.toString();
            }
        } catch (_) {
            return window.XeraRouter?.buildUrl
                ? window.XeraRouter.buildUrl("discover")
                : "index.html";
        }
        return window.XeraRouter?.buildUrl
            ? window.XeraRouter.buildUrl("discover")
            : "index.html";
    }
    if (redirectTarget.startsWith("/")) {
        return redirectTarget;
    }
    return window.XeraRouter?.toCleanUrl
        ? window.XeraRouter.toCleanUrl(redirectTarget)
        : redirectTarget;
}

// Éléments DOM
const authForm = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const usernameInput = document.getElementById("username");
const confirmPasswordInput = document.getElementById("confirm-password");
const usernameGroup = document.getElementById("username-group");
const confirmPasswordGroup = document.getElementById("confirm-password-group");
const credentialsGroup = document.getElementById("credentials-group");
const submitBtn = document.getElementById("submit-btn");
const btnText = document.getElementById("btn-text");
const btnLoader = document.getElementById("btn-loader");
const toggleLink = document.getElementById("toggle-link");
const toggleText = document.getElementById("toggle-text");
const formTitle = document.getElementById("form-title");
const formSubtitle = document.getElementById("form-subtitle");
const errorMessage = document.getElementById("error-message");
const successMessage = document.getElementById("success-message");
const forgotPasswordLink = document.getElementById("forgot-password-link");
const forgotPassword = document.getElementById("forgot-password");
const googleSigninBtn = document.getElementById("google-signin-btn");
const passwordToggle = document.getElementById("password-toggle");
const confirmPasswordToggle = document.getElementById(
    "confirm-password-toggle",
);
const rememberMeContainer = document.getElementById("remember-me-container");
const rememberMeCheckbox = document.getElementById("remember-me");
const consentModal = document.getElementById("account-consent-modal");
const consentPrivacy = document.getElementById("account-consent-privacy");
const consentCgu = document.getElementById("account-consent-cgu");
const consentSubmit = document.getElementById("account-consent-submit");
const consentCancel = document.getElementById("account-consent-cancel");
const consentClose = document.getElementById("account-consent-close");
const passwordResetModal = document.getElementById("password-reset-modal");
const passwordResetForm = document.getElementById("password-reset-form");
const passwordResetEmail = document.getElementById("password-reset-email");
const passwordResetClose = document.getElementById("password-reset-close");
const passwordResetCancel = document.getElementById("password-reset-cancel");
const passwordResetSubmit = document.getElementById("password-reset-submit");
const passwordResetSubmitText = document.getElementById(
    "password-reset-submit-text",
);
const passwordResetLoader = document.getElementById("password-reset-loader");
const passwordResetStatus = document.getElementById("password-reset-status");

// Wizard SignUp elements
const signupStep1 = document.getElementById("signup-step-1");
const signupStep2 = document.getElementById("signup-step-2");
const signupStepPro = document.getElementById("signup-step-pro");
const subtypeOptionsContainer = document.getElementById(
    "subtype-options-container",
);
const step2BackBtn = document.getElementById("step-2-back");
const step2Title = document.getElementById("step-2-title");

// Arborescence de choix pour l'inscription
const SIGNUP_FLOW = {
    personnel: {
        label: "Personnel",
        isPro: false,
        fields: ["names", "email", "password"],
    },
    pro: {
        label: "Communauté / Entreprise",
        isPro: true,
        subcategories: {
            entreprise: {
                label: "Entreprise",
                structures: {
                    startup: {
                        label: "Startup",
                        fields: ["orgName", "industry", "email", "password"],
                    },
                    pme: {
                        label: "PME",
                        fields: ["orgName", "industry", "email", "password"],
                    },
                    grand_groupe: {
                        label: "Grand Groupe",
                        fields: [
                            "orgName",
                            "industry",
                            "website",
                            "email",
                            "password",
                        ],
                    },
                    investisseur: {
                        label: "Investisseur",
                        fields: ["orgName", "website", "email", "password"],
                    },
                },
            },
            communaute: {
                label: "Communauté",
                structures: {
                    association: {
                        label: "Association",
                        fields: ["orgName", "bio", "email", "password"],
                    },
                    club: {
                        label: "Club",
                        fields: ["orgName", "bio", "email", "password"],
                    },
                    ecole: {
                        label: "École",
                        fields: ["orgName", "website", "email", "password"],
                    },
                    incubateur: {
                        label: "Incubateur",
                        fields: ["orgName", "website", "email", "password"],
                    },
                },
            },
        },
    },
};

let signupState = {
    mainType: null, // 'personnel' | 'pro'
    subcategory: null, // 'entreprise' | 'communaute'
    structure: null, // 'startup' | 'pme' ...
    currentStep: 1,
};

// Fonctions pour gérer "Se souvenir de moi"
function saveRememberMe(email, remember) {
    if (remember) {
        localStorage.setItem("rize-remember-email", email);
        localStorage.setItem("rize-remember-me", "true");
    } else {
        localStorage.removeItem("rize-remember-email");
        localStorage.removeItem("rize-remember-me");
    }
}

function loadRememberMe() {
    const rememberMe = localStorage.getItem("rize-remember-me") === "true";
    const savedEmail = localStorage.getItem("rize-remember-email");

    if (rememberMe && savedEmail) {
        emailInput.value = savedEmail;
        rememberMeCheckbox.checked = true;
        return { email: savedEmail, remember: true };
    }

    if (localStorage.getItem("rize-remember-me") === null) {
        localStorage.setItem("rize-remember-me", "true");
        rememberMeCheckbox.checked = true;
        return { email: "", remember: true };
    }

    return { email: "", remember: false };
}

// Vérifier si l'utilisateur est déjà connecté
async function checkExistingSession() {
    try {
        // Vérifier si checkAuth existe
        if (typeof checkAuth !== "function") {
            console.error("checkAuth n'est pas disponible");
            return null;
        }

        const user = await checkAuth();
        if (user) {
            const storedConsent = sessionStorage.getItem(
                "xera-google-terms-consent",
            );
            if (
                storedConsent &&
                user?.id &&
                typeof upsertUserProfile === "function"
            ) {
                try {
                    const consent = JSON.parse(storedConsent);
                    const result = await upsertUserProfile(user.id, {
                        accepted_terms: consent.accepted_terms === true,
                        accepted_terms_at: consent.accepted_terms_at,
                    });
                    if (result?.success) {
                        sessionStorage.removeItem("xera-google-terms-consent");
                    }
                } catch (error) {
                    console.warn(
                        "Impossible d'enregistrer le consentement Google:",
                        error,
                    );
                }
            }
            // Rediriger vers la page principale
            window.location.href = resolveRedirectTarget();
        }
    } catch (error) {
        console.error("Erreur verification session:", error);
    }
}

// Afficher un message d'erreur
function setFormFeedbackState(type, message) {
    if (!errorMessage || !successMessage) return;

    if (type === "error") {
        errorMessage.textContent = message;
        errorMessage.style.display = "block";
        successMessage.style.display = "none";
        return;
    }

    successMessage.textContent = message;
    successMessage.style.display = "block";
    errorMessage.style.display = "none";
}

function showError(message) {
    setFormFeedbackState("error", message);

    window.clearTimeout(showError._timeoutId);
    showError._timeoutId = window.setTimeout(() => {
        if (errorMessage) {
            errorMessage.style.display = "none";
        }
    }, 5000);
}

// Afficher un message de succès
function showSuccess(message) {
    setFormFeedbackState("success", message);

    window.clearTimeout(showSuccess._timeoutId);
    showSuccess._timeoutId = window.setTimeout(() => {
        if (successMessage) {
            successMessage.style.display = "none";
        }
    }, 5000);
}

// Afficher un message de succès persistant avec bouton de fermeture
function showPersistentSuccess(message) {
    successMessage.innerHTML = "";

    const container = document.createElement("div");
    container.style.cssText =
        "display: flex; justify-content: space-between; align-items: start;";

    const textSpan = document.createElement("span");
    textSpan.textContent = message;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.style.cssText =
        "background: none; border: none; color: inherit; cursor: pointer; padding: 0; margin-left: 10px; opacity: 0.7; min-width: 24px; display: flex; align-items: center; justify-content: center;";
    closeBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
    `;

    closeBtn.onclick = function () {
        successMessage.style.display = "none";
    };

    container.appendChild(textSpan);
    container.appendChild(closeBtn);
    successMessage.appendChild(container);

    successMessage.style.display = "block";
    errorMessage.style.display = "none";
}

// Convertir les erreurs d'authentification en messages utiles
function formatAuthError(result) {
    const rawMessage = String(result?.error || "").trim();
    const lowerMessage = rawMessage.toLowerCase();
    const errorCode = String(result?.code || "").toLowerCase();
    const errorStatus = Number(result?.status);

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return "Vous êtes hors connexion. Vérifiez Internet puis réessayez.";
    }

    if (
        errorCode.includes("network") ||
        lowerMessage.includes("failed to fetch")
    ) {
        return "Connexion au serveur impossible. Réessayez dans quelques secondes.";
    }

    if (
        errorCode === "email_not_confirmed" ||
        lowerMessage.includes("email not confirmed")
    ) {
        return "Vérifiez votre boîte mail pour confirmer votre compte avant de vous connecter.";
    }

    if (
        errorCode === "invalid_credentials" ||
        lowerMessage.includes("invalid login credentials")
    ) {
        return "Email ou mot de passe incorrect.";
    }

    if (
        errorCode === "user_already_exists" ||
        lowerMessage.includes("user already registered")
    ) {
        return "Un compte existe déjà avec cet email.";
    }

    if (errorStatus === 429 || lowerMessage.includes("too many requests")) {
        return "Trop de tentatives. Patientez un instant puis réessayez.";
    }

    if (
        rawMessage === "{}" ||
        rawMessage === "[object Object]" ||
        rawMessage === ""
    ) {
        return "Une erreur d'inscription est survenue. Vérifiez vos données et réessayez.";
    }

    return rawMessage || "Une opération a échoué. Veuillez réessayer.";
}

// Toggle entre connexion et inscription
function toggleMode(keepMessages = false) {
    try {
        isSignUpMode = !isSignUpMode;

        console.log("Toggling mode to:", isSignUpMode ? "SignUp" : "Login");

        if (isSignUpMode) {
            // Mode inscription - Start Wizard
            signupState = {
                mainType: null,
                subcategory: null,
                structure: null,
                currentStep: 1,
            };
            showSignupStep(1);
            if (formTitle) formTitle.textContent = window.t ? window.t("auth.createAccountLink", {}, "Créer un compte") : "Créer votre compte";
            if (formSubtitle)
                formSubtitle.textContent = window.t ? window.t("auth.description", {}, "Rejoignez une communauté de builders") : "Rejoignez la communauté XERA1";
            if (usernameGroup) usernameGroup.style.display = "block";
            if (confirmPasswordGroup)
                confirmPasswordGroup.style.display = "block";
            if (forgotPasswordLink) forgotPasswordLink.style.display = "none";
            if (rememberMeContainer) rememberMeContainer.style.display = "none";
            if (btnText) btnText.textContent = window.t ? window.t("auth.registerSubmit", {}, "S'inscrire") : "S'inscrire";
            if (toggleText) toggleText.textContent = window.t ? window.t("auth.hasAccount", {}, "Déjà un compte ?") : "Déjà un compte ?";
            if (toggleLink) toggleLink.textContent = window.t ? window.t("auth.loginLink", {}, "Se connecter") : "Se connecter";
            if (usernameInput) usernameInput.required = true;
            if (confirmPasswordInput) confirmPasswordInput.required = true;
        } else {
            // Mode connexion
            signupStep1.style.display = "none";
            signupStep2.style.display = "none";
            credentialsGroup.style.display = "block";
            if (formTitle) formTitle.textContent = window.t ? window.t("auth.welcomeTitle", {}, "Bienvenue sur XERA1") : "Bienvenue sur XERA1";
            if (formSubtitle)
                formSubtitle.textContent = window.t ? window.t("auth.welcomeSubtitle", {}, "Connectez-vous pour continuer") : "Connectez-vous pour continuer";
            if (usernameGroup) usernameGroup.style.display = "none";
            if (confirmPasswordGroup)
                confirmPasswordGroup.style.display = "none";
            if (forgotPasswordLink) forgotPasswordLink.style.display = "block";
            if (rememberMeContainer)
                rememberMeContainer.style.display = "block";
            if (btnText) btnText.textContent = window.t ? window.t("auth.loginSubmit", {}, "Se connecter") : "Se connecter";
            if (toggleText) toggleText.textContent = window.t ? window.t("auth.noAccount", {}, "Pas encore de compte ?") : "Pas encore de compte ?";
            if (toggleLink) toggleLink.textContent = window.t ? window.t("auth.createAccountLink", {}, "Créer un compte") : "Créer un compte";
            if (usernameInput) usernameInput.required = false;
            if (confirmPasswordInput) confirmPasswordInput.required = false;
        }

        // Reset form
        if (authForm) authForm.reset();
        if (!keepMessages) {
            if (errorMessage) errorMessage.style.display = "none";
            if (successMessage) successMessage.style.display = "none";
        }
        resetPasswordVisibility();
    } catch (error) {
        console.error("Error in toggleMode:", error);
    }
}

function showSignupStep(step) {
    signupState.currentStep = step;

    // Hide all steps
    signupStep1.style.display = "none";
    signupStep2.style.display = "none";
    if (signupStepPro) signupStepPro.style.display = "none";
    credentialsGroup.style.display = "none";
    submitBtn.style.display = "none";

    if (step === 1) {
        signupStep1.style.display = "block";
    } else if (step === 2) {
        // Sélection de la sous-catégorie (Entreprise vs Communauté)
        renderSubcategories();
        signupStep2.style.display = "block";
    } else if (step === 3) {
        // Sélection de la structure fine (Startup vs PME vs ...)
        renderStructures();
        signupStep2.style.display = "block";
    } else if (step === 4) {
        // Formulaire final
        renderFinalForm();
    }
}

function renderSubcategories() {
    if (step2Title) step2Title.textContent = "Choisissez le type d'institution";
    subtypeOptionsContainer.innerHTML = "";

    const subs = SIGNUP_FLOW.pro.subcategories;
    Object.keys(subs).forEach((key) => {
        const div = document.createElement("div");
        div.className = "subtype-option";
        div.textContent = subs[key].label;
        div.onclick = () => {
            signupState.subcategory = key;
            showSignupStep(3);
        };
        subtypeOptionsContainer.appendChild(div);
    });

    step2BackBtn.onclick = () => showSignupStep(1);
}

function renderStructures() {
    if (step2Title)
        step2Title.textContent = `Type de ${SIGNUP_FLOW.pro.subcategories[signupState.subcategory].label}`;
    subtypeOptionsContainer.innerHTML = "";

    const structures =
        SIGNUP_FLOW.pro.subcategories[signupState.subcategory].structures;
    Object.keys(structures).forEach((key) => {
        const div = document.createElement("div");
        div.className = "subtype-option";
        div.textContent = structures[key].label;
        div.onclick = () => {
            signupState.structure = key;
            showSignupStep(4);
        };
        subtypeOptionsContainer.appendChild(div);
    });

    step2BackBtn.onclick = () => showSignupStep(2);
}

function renderFinalForm() {
    credentialsGroup.style.display = "block";
    submitBtn.style.display = "flex";

    // Déterminer quels champs afficher
    let fields = [];
    if (signupState.mainType === "personnel") {
        fields = SIGNUP_FLOW.personnel.fields;
        if (formSubtitle)
            formSubtitle.textContent = "Création de compte personnel";
    } else {
        const struct =
            SIGNUP_FLOW.pro.subcategories[signupState.subcategory].structures[
                signupState.structure
            ];
        fields = struct.fields;
        if (formSubtitle) formSubtitle.textContent = `Compte ${struct.label}`;
    }

    // Toggle Visibility of form groups
    const personalNamesGroup = document.getElementById("personal-names-group");
    const orgNameGroup = document.querySelector(
        "#signup-step-pro .form-group:has(#org-name)",
    );
    const orgBioGroup = document.querySelector(
        "#signup-step-pro .form-group:has(#org-bio)",
    );
    const orgIndustryGroup = document.querySelector(
        "#signup-step-pro .form-group:has(#org-industry)",
    );
    const orgWebsiteGroup = document.querySelector(
        "#signup-step-pro .form-group:has(#org-website)",
    );

    // Personnel fields
    if (personalNamesGroup) {
        personalNamesGroup.style.display = fields.includes("names")
            ? "block"
            : "none";
        const fn = document.getElementById("first-name");
        const ln = document.getElementById("last-name");
        if (fn) fn.required = fields.includes("names");
        if (ln) ln.required = fields.includes("names");
    }

    // Pro fields
    const hasProFields = fields.some((f) =>
        ["orgName", "bio", "industry", "website"].includes(f),
    );
    if (signupStepPro) {
        signupStepPro.style.display = hasProFields ? "block" : "none";
        const wizardNavPro = signupStepPro.querySelector(".wizard-nav");
        if (wizardNavPro) wizardNavPro.style.display = "none";

        if (hasProFields) {
            if (orgNameGroup)
                orgNameGroup.style.display = fields.includes("orgName")
                    ? "block"
                    : "none";
            if (orgBioGroup)
                orgBioGroup.style.display = fields.includes("bio")
                    ? "block"
                    : "none";
            if (orgIndustryGroup)
                orgIndustryGroup.style.display = fields.includes("industry")
                    ? "block"
                    : "none";
            if (orgWebsiteGroup)
                orgWebsiteGroup.style.display = fields.includes("website")
                    ? "block"
                    : "none";

            const orgNameInput = document.getElementById("org-name");
            if (orgNameInput)
                orgNameInput.required = fields.includes("orgName");
        }
    }

    // Username hint
    if (usernameGroup) {
        usernameGroup.style.display = "block";
        const hint = document.getElementById("username-hint");
        if (hint) {
            hint.style.display = "block";
            hint.textContent =
                signupState.mainType === "personnel"
                    ? "Ce sera votre @handle public."
                    : "L'identifiant URL de votre institution.";
        }
    }
}

function handleAccountTypeSelection(type) {
    // Normalisation pour éviter les bugs de casse
    const normalizedType = type.toLowerCase();

    console.log("Account type selected:", normalizedType);

    // Cas 1: Personnel -> Direct au formulaire final
    if (normalizedType === "personnel") {
        signupState.mainType = "personnel";
        signupState.subcategory = null;
        signupState.structure = null;
        showSignupStep(4);
        return;
    }

    // Cas Pro (Entreprise ou Communauté)
    signupState.mainType = "pro";

    // Si on a déjà choisi la sous-catégorie (Entreprise/Communauté) au premier écran
    if (normalizedType === "entreprise" || normalizedType === "communaute") {
        signupState.subcategory = normalizedType;
        showSignupStep(3); // On saute l'étape 2, direction la sélection de structure
    } else {
        // Fallback si bouton "Pro" générique
        showSignupStep(2);
    }
}

// Initialiser les clics sur les options de type de compte
document.querySelectorAll(".account-option").forEach((opt) => {
    opt.onclick = () => handleAccountTypeSelection(opt.dataset.type);
});

if (step2BackBtn) {
    step2BackBtn.onclick = () => showSignupStep(1);
}

function setSubmitLoading(isLoading) {
    if (!submitBtn || !btnText || !btnLoader) return;

    submitBtn.disabled = isLoading;
    btnText.style.display = isLoading ? "none" : "block";
    btnLoader.style.display = isLoading ? "block" : "none";
}

function toggleConsentModal(show) {
    if (!consentModal) return;
    consentModal.style.display = show ? "flex" : "none";
    if (show) {
        if (pendingProvider !== "google") {
            pendingTermsAcceptance = null;
        }
        consentPrivacy.checked = false;
        consentCgu.checked = false;
        if (consentSubmit) consentSubmit.disabled = true;
        if (consentSubmit) consentSubmit.style.opacity = "0.45";
    }
}

function acceptPendingTerms() {
    pendingTermsAcceptance = {
        accepted_terms: true,
        accepted_terms_at: new Date().toISOString(),
    };
}

function updateConsentSubmitState() {
    if (!consentPrivacy || !consentCgu || !consentSubmit) return;
    const canContinue = consentPrivacy.checked && consentCgu.checked;
    consentSubmit.disabled = !canContinue;
    consentSubmit.style.opacity = canContinue ? "1" : "0.45";
}

if (consentPrivacy) {
    consentPrivacy.addEventListener("change", updateConsentSubmitState);
}

if (consentCgu) {
    consentCgu.addEventListener("change", updateConsentSubmitState);
}

if (consentSubmit) {
    consentSubmit.addEventListener("click", () => {
        acceptPendingTerms();
        const provider = pendingProvider;
        pendingProvider = null;
        toggleConsentModal(false);
        if (provider === "google") {
            handleGoogleSignIn(true);
        } else if (isSignUpMode) {
            handleSubmitAfterConsent(new Event("submit"));
        }
    });
}

if (consentCancel) {
    consentCancel.addEventListener("click", () => {
        pendingProvider = null;
        pendingTermsAcceptance = null;
        toggleConsentModal(false);
        showError("Vous devez accepter les politiques pour créer un compte.");
    });
}

if (consentClose) {
    consentClose.addEventListener("click", () => {
        pendingProvider = null;
        pendingTermsAcceptance = null;
        toggleConsentModal(false);
        showError("Vous devez accepter les politiques pour créer un compte.");
    });
}

async function handleSubmit(e) {
    return handleSubmitAfterConsent(e);
}

async function handleSubmitAfterConsent(e) {
    if (e && typeof e.preventDefault === "function") {
        e.preventDefault();
    }

    if (!isSignUpMode) {
        return handleSubmitInternal(e || new Event("submit"));
    }

    if (!consentPrivacy || !consentCgu) {
        return handleSubmitInternal(e || new Event("submit"));
    }

    if (!consentPrivacy.checked || !consentCgu.checked) {
        toggleConsentModal(true);
        showError(
            "Vous devez accepter la Politique de confidentialité et les CGU pour créer un compte.",
        );
        return;
    }

    return handleSubmitInternal(e || new Event("submit"));
}

async function handleSubmitInternal(e) {
    e.preventDefault();

    if (isSignUpMode) {
        const hasConsent = !!(
            consentPrivacy &&
            consentCgu &&
            consentPrivacy.checked &&
            consentCgu.checked
        );

        if (!hasConsent) {
            toggleConsentModal(true);
            showError(
                "Vous devez accepter la Politique de confidentialité et les CGU avant de créer votre compte.",
            );
            return;
        }
    }

    // Récupération des valeurs
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const username = usernameInput ? usernameInput.value.trim() : "";
    const confirmPassword = confirmPasswordInput
        ? confirmPasswordInput.value
        : "";

    // Validation de base
    if (!email || !password) {
        showError("Veuillez remplir tous les champs obligatoires.");
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError("Adresse email invalide.");
        return;
    }

    if (isSignUpMode) {
        if (!username) {
            showError("Veuillez entrer un nom d'utilisateur.");
            return;
        }
        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
            showError(
                "Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre.",
            );
            return;
        }
        if (password !== confirmPassword) {
            showError("Les mots de passe ne correspondent pas.");
            return;
        }
    }

    // UI Loading state
    setSubmitLoading(true);

    try {
        if (isSignUpMode) {
            // Construction des métadonnées Supabase (user_metadata)
            const metadata = {
                account_type:
                    signupState.mainType === "personnel" ? "personal" : "pro",
                account_subtype:
                    signupState.mainType === "personnel"
                        ? "personal"
                        : signupState.structure || signupState.mainType,
                onboarding_completed: signupState.mainType !== "pro",
                display_name: username,
                ...pendingTermsAcceptance,
            };

            // Ajout des infos spécifiques selon le type
            if (signupState.mainType === "personnel") {
                metadata.first_name = document
                    .getElementById("first-name")
                    ?.value.trim();
                metadata.last_name = document
                    .getElementById("last-name")
                    ?.value.trim();
                metadata.full_name =
                    `${metadata.first_name} ${metadata.last_name}`.trim();
            } else {
                metadata.org_name = document
                    .getElementById("org-name")
                    ?.value.trim();
                metadata.org_bio = document
                    .getElementById("org-bio")
                    ?.value.trim();
                metadata.org_industry =
                    document.getElementById("org-industry")?.value;
                metadata.org_website = document
                    .getElementById("org-website")
                    ?.value.trim();
                metadata.full_name = metadata.org_name;
            }

            // Appel de la fonction signUp (définie dans supabase-config.js)
            if (typeof signUp !== "function") {
                throw new Error(
                    "La fonction d'inscription n'est pas chargée. Veuillez rafraîchir la page.",
                );
            }

            const result = await signUp(email, password, username, metadata);

            if (result.success) {
                const user = result.data;
                if (typeof upsertUserProfile === "function" && user?.id) {
                    try {
                        await upsertUserProfile(user.id, {
                            name:
                                username ||
                                user?.user_metadata?.full_name ||
                                user?.user_metadata?.display_name ||
                                user?.user_metadata?.username ||
                                String(user?.email || "").split("@")[0] ||
                                "Utilisateur",
                            username:
                                username ||
                                user?.user_metadata?.username ||
                                user?.user_metadata?.display_name ||
                                String(user?.email || "").split("@")[0] ||
                                null,
                            account_type:
                                user?.user_metadata?.account_type ||
                                user?.account_type ||
                                "personal",
                            account_subtype:
                                user?.user_metadata?.account_subtype ||
                                user?.account_subtype ||
                                "personal",
                            avatar:
                                user?.user_metadata?.avatar_url ||
                                user?.user_metadata?.picture ||
                                null,
                            ...pendingTermsAcceptance,
                        });
                    } catch (e) {
                        console.warn(
                            "upsertUserProfile after signUp failed:",
                            e,
                        );
                    }
                }

                showPersistentSuccess(
                    "Compte créé ! Un email de confirmation a été envoyé à " +
                        email,
                );
                pendingTermsAcceptance = null;
                setTimeout(() => {
                    toggleMode(true);
                    emailInput.value = email;
                }, 3000);
            } else {
                showError(formatAuthError(result));
            }
        } else {
            // Connexion
            const rememberMe = rememberMeCheckbox
                ? rememberMeCheckbox.checked
                : true;

            if (typeof updateSessionStorage === "function") {
                updateSessionStorage(rememberMe);
            }

            if (typeof signIn !== "function") {
                throw new Error("La fonction de connexion n'est pas chargée.");
            }

            const result = await signIn(email, password);

            if (result.success) {
                const user = result.data;
                if (typeof upsertUserProfile === "function" && user?.id) {
                    try {
                        await upsertUserProfile(user.id, {
                            name:
                                user?.user_metadata?.full_name ||
                                user?.user_metadata?.display_name ||
                                user?.user_metadata?.username ||
                                String(user?.email || "").split("@")[0] ||
                                "Utilisateur",
                            username:
                                user?.user_metadata?.username ||
                                user?.user_metadata?.display_name ||
                                String(user?.email || "").split("@")[0] ||
                                null,
                            account_type:
                                user?.user_metadata?.account_type ||
                                user?.account_type ||
                                "personal",
                            account_subtype:
                                user?.user_metadata?.account_subtype ||
                                user?.account_subtype ||
                                user?.accountSubtype ||
                                "personal",
                            avatar:
                                user?.user_metadata?.avatar_url ||
                                user?.user_metadata?.picture ||
                                null,
                        });
                    } catch (e) {
                        console.warn(
                            "upsertUserProfile after signIn failed:",
                            e,
                        );
                    }
                }

                saveRememberMe(email, rememberMe);
                showSuccess("Connexion réussie ! Redirection...");

                const accountType =
                    user?.user_metadata?.account_type ||
                    user?.account_type ||
                    "personal";
                const accountSubtype =
                    user?.user_metadata?.account_subtype ||
                    user?.account_subtype ||
                    user?.accountSubtype ||
                    "personal";
                const normalizedAccountType = String(accountType)
                    .trim()
                    .toLowerCase();
                const normalizedAccountSubtype = String(accountSubtype)
                    .trim()
                    .toLowerCase();
                const isPro =
                    [
                        "community",
                        "enterprise",
                        "company",
                        "pro",
                        "communauté",
                        "entreprise",
                        "institution",
                        "organization",
                        "organisation",
                        "org",
                        "team",
                    ].includes(normalizedAccountType) ||
                    [
                        "community",
                        "enterprise",
                        "company",
                        "pro",
                        "communauté",
                        "entreprise",
                        "institution",
                        "organization",
                        "organisation",
                        "org",
                        "team",
                    ].includes(normalizedAccountSubtype);

                const onboardingCompleted =
                    user?.user_metadata?.onboarding_completed === true ||
                    user?.onboarding_completed === true;

                setTimeout(() => {
                    if (isPro && !onboardingCompleted && user?.id) {
                        const target =
                            typeof window.buildProfileUrl === "function"
                                ? window.buildProfileUrl(
                                      user.id,
                                      normalizedAccountType,
                                  )
                                : window.XeraRouter?.buildUrl
                                  ? window.XeraRouter.buildUrl(
                                        isPro ? "pagepro" : "profile",
                                        {
                                            query: { user: user.id },
                                        },
                                    )
                                  : `${isPro ? "pagepro" : "profile"}?user=${encodeURIComponent(user.id)}`;
                        window.location.href = target;
                        return;
                    }
                    window.location.href = resolveRedirectTarget();
                }, 1000);
            } else {
                showError(formatAuthError(result));
            }
        }
    } catch (error) {
        console.error("Erreur handleSubmit:", error);
        showError(error.message || "Une erreur imprévue est survenue.");
    } finally {
        setSubmitLoading(false);
    }
}

// Fonctions pour toggle password visibility
function buildPasswordEyeIcon(isVisible) {
    if (isVisible) {
        return `
            <svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M2 2l20 20"/>
                <path d="M10.58 10.58A2 2 0 0 0 13.42 13.42"/>
                <path d="M9.88 5.08A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7a17.32 17.32 0 0 1-4.96 6.06"/>
                <path d="M6.61 6.61A17.47 17.47 0 0 0 2 12s3.5 7 10 7a11.34 11.34 0 0 0 5.39-1.64"/>
            </svg>
        `;
    }

    return `
        <svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/>
            <circle cx="12" cy="12" r="3"/>
        </svg>
    `;
}

function togglePasswordVisibility(inputId, toggleBtnId) {
    const input = document.getElementById(inputId);
    const toggleBtn = document.getElementById(toggleBtnId);

    if (!input || !toggleBtn) return;

    const isHidden = input.type === "password";
    const nextVisible = isHidden;

    input.type = nextVisible ? "text" : "password";

    toggleBtn.setAttribute("data-visible", String(nextVisible));
    toggleBtn.setAttribute(
        "aria-label",
        nextVisible ? "Masquer le mot de passe" : "Afficher le mot de passe",
    );
    toggleBtn.title = nextVisible
        ? "Masquer le mot de passe"
        : "Afficher le mot de passe";
    toggleBtn.innerHTML = buildPasswordEyeIcon(nextVisible);
}

function resetPasswordVisibility() {
    if (passwordInput) passwordInput.type = "password";
    if (confirmPasswordInput) confirmPasswordInput.type = "password";
    if (passwordToggle) {
        passwordToggle.setAttribute("data-visible", "false");
        passwordToggle.setAttribute("aria-label", "Afficher le mot de passe");
        passwordToggle.title = "Afficher le mot de passe";
        passwordToggle.innerHTML = buildPasswordEyeIcon(false);
    }
    if (confirmPasswordToggle) {
        confirmPasswordToggle.setAttribute("data-visible", "false");
        confirmPasswordToggle.setAttribute(
            "aria-label",
            "Afficher le mot de passe",
        );
        confirmPasswordToggle.title = "Afficher le mot de passe";
        confirmPasswordToggle.innerHTML = buildPasswordEyeIcon(false);
    }
}

function setPasswordResetLoading(isLoading) {
    if (
        !passwordResetSubmit ||
        !passwordResetSubmitText ||
        !passwordResetLoader
    ) {
        return;
    }

    passwordResetSubmit.disabled = isLoading;
    passwordResetSubmitText.textContent = isLoading
        ? "Envoi en cours..."
        : "Envoyer le lien";
    passwordResetLoader.style.display = isLoading ? "inline-block" : "none";
}

function setPasswordResetStatus(message = "", type = "") {
    if (!passwordResetStatus) return;
    passwordResetStatus.textContent = message;
    passwordResetStatus.dataset.state = type;
}

function resetPasswordModalState() {
    if (passwordResetForm) passwordResetForm.reset();
    setPasswordResetLoading(false);
    setPasswordResetStatus();
    if (passwordResetSubmit) passwordResetSubmit.style.display = "inline-flex";
    if (passwordResetCancel) passwordResetCancel.textContent = "Annuler";
}

function togglePasswordResetModal(show) {
    if (!passwordResetModal) return;
    passwordResetModal.style.display = show ? "flex" : "none";
    if (show) {
        resetPasswordModalState();
        window.setTimeout(() => passwordResetEmail?.focus(), 0);
    } else {
        resetPasswordModalState();
    }
}

// Gérer le reset de mot de passe
async function handleForgotPassword(event) {
    event?.preventDefault();
    const email = passwordResetEmail?.value.trim().toLowerCase();

    if (!email) {
        setPasswordResetStatus("Veuillez entrer votre adresse email.", "error");
        passwordResetEmail?.focus();
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setPasswordResetStatus("Adresse email invalide.", "error");
        passwordResetEmail?.focus();
        return;
    }

    setPasswordResetLoading(true);
    setPasswordResetStatus();

    try {
        const result = await resetPassword(email);

        if (result.success) {
            setPasswordResetStatus(
                "Un lien de réinitialisation a été envoyé à votre adresse si un compte y est associé.",
                "success",
            );
            if (passwordResetSubmit) passwordResetSubmit.style.display = "none";
            if (passwordResetCancel) passwordResetCancel.textContent = "Fermer";
        } else {
            setPasswordResetStatus(
                result.error ||
                    "Impossible d'envoyer le lien. Veuillez réessayer.",
                "error",
            );
        }
    } catch (error) {
        console.error("Erreur reset password:", error);
        setPasswordResetStatus(
            "Un problème réseau est survenu. Veuillez réessayer.",
            "error",
        );
    } finally {
        setPasswordResetLoading(false);
    }
}

// Gérer la connexion avec Google
async function signInWithGoogle() {
    try {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: `${window.location.origin}/index.html`,
            },
        });
        if (error) throw error;
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Gérer la connexion avec Google
async function handleGoogleSignIn(isConsentValidated = false) {
    try {
        if (!isConsentValidated) {
            pendingProvider = "google";
            toggleConsentModal(true);
            return;
        }

        acceptPendingTerms();
        sessionStorage.setItem(
            "xera-google-terms-consent",
            JSON.stringify(pendingTermsAcceptance),
        );
        googleSigninBtn.disabled = true;
        googleSigninBtn.innerHTML =
            '<svg class="btn-loader" style="animation: spin 1s linear infinite;" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg><span>Signing in...</span>';

        const result = await signInWithGoogle();

        if (result.success) {
            // La redirection sera gérée automatiquement par Supabase
            showSuccess("Redirection vers Google...");
        } else {
            showError(
                result.error || "Erreur lors de la connexion avec Google.",
            );
        }
    } catch (error) {
        console.error("Erreur Google signin:", error);
        showError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
        // Reset button state
        googleSigninBtn.disabled = false;
        googleSigninBtn.innerHTML =
            '<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg><span>Continuer avec Google</span>';
    }
}

// Event listeners
if (toggleLink) {
    toggleLink.addEventListener("click", (e) => {
        e.preventDefault();
        toggleMode();
    });
}

if (authForm && typeof handleSubmit === "function") {
    authForm.addEventListener("submit", handleSubmit);
}

// Password toggle listeners
if (passwordToggle) {
    passwordToggle.addEventListener("click", () => {
        togglePasswordVisibility("password", "password-toggle");
    });
}

if (confirmPasswordToggle) {
    confirmPasswordToggle.addEventListener("click", () => {
        togglePasswordVisibility("confirm-password", "confirm-password-toggle");
    });
}

// Forgot password listener
if (forgotPassword) {
    forgotPassword.addEventListener("click", (e) => {
        e.preventDefault();
        togglePasswordResetModal(true);
        if (passwordResetEmail && emailInput?.value) {
            passwordResetEmail.value = emailInput.value.trim();
        }
    });
}

if (passwordResetForm) {
    passwordResetForm.addEventListener("submit", handleForgotPassword);
}

if (passwordResetClose) {
    passwordResetClose.addEventListener("click", () => {
        togglePasswordResetModal(false);
    });
}

if (passwordResetCancel) {
    passwordResetCancel.addEventListener("click", () => {
        togglePasswordResetModal(false);
    });
}

// Google signin listener
if (googleSigninBtn) {
    googleSigninBtn.addEventListener("click", () => handleGoogleSignIn());
}

// Initialisation de la page
document.addEventListener("DOMContentLoaded", () => {
    if (authForm && typeof handleSubmit === "function") {
        authForm.addEventListener("submit", handleSubmit);
    }

    // Initialiser les clics sur les options de type de compte pour le wizard
    document.querySelectorAll(".account-option").forEach((opt) => {
        opt.onclick = () => handleAccountTypeSelection(opt.dataset.type);
    });

    // Charger les préférences "Se souvenir de moi"
    const savedData = loadRememberMe();

    // Vérifier si on revient d'un reset de mot de passe
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("reset") === "true") {
        // Si on a un token de reset, afficher une interface pour le nouveau mot de passe
        // Pour l'instant, on affiche juste un message
        showSuccess(
            "Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.",
        );
    }

    // Afficher le lien "mot de passe oublié" et la checkbox par défaut en mode connexion
    if (!isSignUpMode) {
        forgotPasswordLink.style.display = "block";
        rememberMeContainer.style.display = "block";
    }
});

// Vérifier la session au chargement
checkExistingSession();
