/**
 * XERA1 Interactive Tutorial Module - Conversion & Onboarding Edition
 * Guides both guests and new users through the vision and the product.
 */

const XERA_TUTORIAL_KEY = "xera1-tutorial-completed";
const XERA_GUEST_TUTORIAL_KEY = "xera1-guest-vision-completed";

// Étapes pour les visiteurs (Convaincre de s'inscrire)
const GUEST_TUTORIAL_STEPS = [
    {
        id: "vision",
        title: "Standardiser la Confiance",
        message:
            "Le but de XERA1 est de standardiser la confiance technique et d'éliminer l'asymétrie d'information entre les créateurs de technologie et le marché mondial. Prouvez votre valeur par l'action grâce à la <strong>Proof of Building</strong>.",
        element: null,
        position: "center",
    },
    {
        id: "builders",
        title: "🚀 Pour les Builders",
        message:
            "Valorisation automatisée : Le protocole se connecte à vos flux (commits GitHub, DB) pour capturer l'exécution réelle. Propulsion internationale via le <strong>Momentum Engine</strong>.",
        element: null,
        position: "center",
    },
    {
        id: "investors",
        title: "💼 Pour les Investisseurs",
        message:
            "Due Diligence technique infaillible et suivi de traction en temps réel. Auditez la capacité réelle d'exécution des équipes avant d'investir.",
        element: "nav a[onclick*='discover']",
        position: "bottom",
    },
    {
        id: "cta",
        title: "Prêt à construire ?",
        message:
            "Rejoignez l'infrastructure conçue pour transformer l'innovation technique quotidienne en un actif numérique certifié et immuable.",
        element: "#nav-auth",
        position: "bottom",
        isCTA: true,
    },
];

// Étapes pour les utilisateurs connectés (Onboarding produit)
const AUTH_TUTORIAL_STEPS = [
    {
        id: "welcome-auth",
        title: "Bienvenue, Builder",
        message:
            "Votre compte est actif. Commençons par structurer votre trajectoire pour transformer vos efforts en autorité réelle.",
        element: null,
        position: "center",
    },
    {
        id: "create-arc",
        title: "Définissez votre ARC",
        message:
            "Tout commence par un Projet. C'est votre trajectoire publique sur 30, 60 ou 90 jours où nous capturons votre progression.",
        element: ".profile-arc-btn, .btn-add",
        position: "bottom",
    },
    {
        id: "post-trace",
        title: "Documentez l'effort",
        message:
            "Publiez une Trace chaque jour. C'est la preuve concrète (Proof of Building) qui construit votre réputation mondiale.",
        element: ".btn-add",
        position: "bottom",
    },
    {
        id: "discover-auth",
        title: "Le flux High-Signal",
        message:
            "Explorez, validez et collaborez avec d'autres builders actifs pour accélérer votre propulsion.",
        element: "nav a[onclick*='discover']",
        position: "bottom",
    },
];

class XeraTutorial {
    constructor() {
        this.currentStepIndex = -1;
        this.overlay = null;
        this.tooltip = null;
        this.initialized = false;
        this.steps = [];
        this._onResize = null;
        this._positionTimer = null;
        this.currentTargetEl = null;
        this.isActive = false;
    }

    async init() {
        if (this.initialized) return;
        this.initialized = true;

        const isGuest = !window.currentUser;
        const guestCompleted = localStorage.getItem(XERA_GUEST_TUTORIAL_KEY);
        const authCompleted = localStorage.getItem(XERA_TUTORIAL_KEY);

        // Ne jamais afficher le tutoriel pour les comptes Pro
        try {
            if (
                !isGuest &&
                window.currentUser &&
                window.isProUser &&
                window.isProUser(window.currentUser)
            ) {
                console.log("XeraTutorial: désactivé pour compte Pro.");
                return;
            }
        } catch (e) {
            console.warn("Erreur vérification Pro dans tutorial.init:", e);
        }

        if (isGuest) {
            if (guestCompleted) return;
            this.steps = GUEST_TUTORIAL_STEPS;
            // Visitors see the vision after 2 seconds
            setTimeout(() => this.start(), 2000);
        } else {
            if (authCompleted) return;
            this.steps = AUTH_TUTORIAL_STEPS;

            try {
                const userId = window.currentUser.id;
                // Only start if they have no arcs yet (real new user)
                const { count } = await window.supabase
                    .from("arcs")
                    .select("*", { count: "exact", head: true })
                    .eq("user_id", userId);

                if (count === 0) {
                    setTimeout(() => this.start(), 3000);
                }
            } catch (error) {
                console.warn("Tutorial activity check failed:", error);
            }
        }
    }

    start() {
        this.currentStepIndex = -1;
        this.isActive = true;
        this.createOverlay();
        this.next();
    }

    createOverlay() {
        if (!this.overlay) {
            this.overlay = document.createElement("div");
            this.overlay.className = "tutorial-overlay-premium";
            this.overlay.style.display = "block";
            this.overlay.style.pointerEvents = "none";
            document.body.appendChild(this.overlay);
        }

        if (!this.tooltip) {
            this.tooltip = document.createElement("div");
            this.tooltip.className = "tutorial-tooltip-premium tutorial-v2";
            this.tooltip.style.display = "block";
            this.tooltip.style.opacity = "1";
            this.tooltip.style.visibility = "visible";
            this.tooltip.style.pointerEvents = "auto";
            document.body.appendChild(this.tooltip);
        }

        if (!this._onResize) {
            this._onResize = () => this.refreshPosition();
            window.addEventListener("resize", this._onResize);
        }
    }

    next() {
        this.currentStepIndex++;
        if (this.currentStepIndex >= this.steps.length) {
            this.complete();
            return;
        }

        const step = this.steps[this.currentStepIndex];
        this.showStep(step);
    }

    showStep(step) {
        this.createOverlay();

        if (this.currentTargetEl) {
            this.currentTargetEl.classList.remove("tutorial-highlight-premium");
        }

        const targetEl = step.element
            ? document.querySelector(step.element)
            : null;
        this.currentTargetEl = targetEl;

        document
            .querySelectorAll(".tutorial-highlight-premium")
            .forEach((el) => el.classList.remove("tutorial-highlight-premium"));

        if (targetEl && targetEl.offsetParent !== null) {
            targetEl.classList.add("tutorial-highlight-premium");
            try {
                targetEl.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
            } catch (err) {
                console.warn("tutorial scrollIntoView error:", err);
            }

            if (this._positionTimer) {
                clearTimeout(this._positionTimer);
                this._positionTimer = null;
            }
            this._positionTimer = setTimeout(() => {
                if (!this.tooltip || !this.isActive) return;
                try {
                    const rect = targetEl.getBoundingClientRect();
                    this.positionTooltip(rect, step.position);
                } catch (err) {
                    console.warn("tutorial positionTooltip error:", err);
                }
            }, 300);
        } else {
            this.tooltip.style.top = "50%";
            this.tooltip.style.left = "50%";
            this.tooltip.style.transform = "translate(-50%, -50%)";
            this.tooltip.style.position = "fixed";
        }

        const isLast = this.currentStepIndex === this.steps.length - 1;
        const btnLabel = step.isCTA
            ? "Créer mon compte"
            : isLast
              ? "Commencer"
              : "Continuer";

        this.tooltip.innerHTML = `
            <div class="tutorial-premium-content">
                <div class="tutorial-premium-header">
                    <div class="tutorial-premium-step-counter">${this.currentStepIndex + 1}<span>/</span>${this.steps.length}</div>
                    <button class="btn-tutorial-skip-premium">Passer</button>
                </div>
                <h3>${step.title}</h3>
                <div class="tutorial-text-body">${step.message}</div>
                <div class="tutorial-premium-actions">
                    <button class="btn-tutorial-next-premium ${step.isCTA ? "btn-cta-pulse" : ""}">${btnLabel}</button>
                </div>
            </div>
        `;

        this.tooltip.style.display = "block";
        this.tooltip.style.opacity = "1";
        this.tooltip.style.visibility = "visible";
        this.tooltip.style.pointerEvents = "auto";

        this.tooltip.querySelector(".btn-tutorial-next-premium").onclick =
            () => {
                if (!this.isActive) return;
                if (step.isCTA) {
                    this.complete();
                    window.location.href = "login.html";
                } else {
                    this.next();
                }
            };
        this.tooltip.querySelector(".btn-tutorial-skip-premium").onclick = () =>
            this.complete();
    }

    refreshPosition() {
        if (!this.isActive || this.currentStepIndex < 0) return;
        const step = this.steps[this.currentStepIndex];
        const targetEl = step.element
            ? document.querySelector(step.element)
            : null;
        if (targetEl && targetEl.offsetParent !== null) {
            const rect = targetEl.getBoundingClientRect();
            this.positionTooltip(rect, step.position);
        }
    }

    positionTooltip(targetRect, position) {
        if (
            window.matchMedia &&
            window.matchMedia("(max-width: 768px)").matches
        ) {
            this.tooltip.style.position = "fixed";
            this.tooltip.style.top = "50%";
            this.tooltip.style.left = "50%";
            this.tooltip.style.transform = "translate(-50%, -50%)";
            return;
        }

        const gap = 20;
        const tooltipWidth = 340;
        let top, left;

        if (position === "bottom") {
            top = targetRect.bottom + gap;
            left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        } else if (position === "top") {
            top = targetRect.top - gap - 200;
            left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        }

        left = Math.max(
            20,
            Math.min(left, window.innerWidth - tooltipWidth - 20),
        );
        if (top + 250 > window.innerHeight) {
            top = targetRect.top - gap - 200;
        }
        top = Math.max(20, top);

        this.tooltip.style.top = `${top}px`;
        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.transform = "none";
        this.tooltip.style.position = "absolute";
    }

    complete() {
        if (!this.isActive) return;
        this.isActive = false;

        const key = window.currentUser
            ? XERA_TUTORIAL_KEY
            : XERA_GUEST_TUTORIAL_KEY;
        localStorage.setItem(key, "true");

        if (this.currentTargetEl) {
            this.currentTargetEl.classList.remove("tutorial-highlight-premium");
            this.currentTargetEl = null;
        }

        document
            .querySelectorAll(".tutorial-highlight-premium")
            .forEach((el) => el.classList.remove("tutorial-highlight-premium"));

        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }

        if (this._positionTimer) {
            clearTimeout(this._positionTimer);
            this._positionTimer = null;
        }
        if (this._onResize) {
            window.removeEventListener("resize", this._onResize);
            this._onResize = null;
        }
    }
}

window.XeraTutorial = new XeraTutorial();
