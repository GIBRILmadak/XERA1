/* ========================================
   AMÉLIORATIONS UX - XERA1
   Indicateurs de chargement, persistance, animations
   ======================================== */

// Gestion des états de chargement pour les boutons
class LoadingManager {
    static setLoading(button, isLoading = true) {
        if (!button) return;

        if (isLoading) {
            // Sauvegarder le texte original si pas déjà fait
            if (!button.dataset.originalText) {
                button.dataset.originalText = button.innerHTML;
            }

            // Ajouter le spinner et désactiver
            button.classList.add("btn-loading");
            button.disabled = true;

            // Ajouter le spinner si pas présent
            if (!button.querySelector(".loading-spinner")) {
                const spinner = document.createElement("div");
                spinner.className = "loading-spinner";
                button.appendChild(spinner);
            }
        } else {
            // Enlever l'état de chargement
            button.classList.remove("btn-loading");
            button.disabled = false;

            // Enlever le spinner
            const spinner = button.querySelector(".loading-spinner");
            if (spinner) {
                spinner.remove();
            }
        }
    }

    static async withLoading(button, asyncFunction) {
        this.setLoading(button, true);
        try {
            const result = await asyncFunction();
            return result;
        } finally {
            this.setLoading(button, false);
        }
    }
}

// Système de notifications Toast
class ToastManager {
    static init() {
        // Créer le conteneur s'il n'existe pas
        if (!document.getElementById("toast-container")) {
            const container = document.createElement("div");
            container.id = "toast-container";
            document.body.appendChild(container);
        }
    }

    static show(title, message, type = "info", duration = 5000) {
        this.init();

        const container = document.getElementById("toast-container");
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;

        const icons = {
            success: '<i class="fas fa-check-circle"></i>',
            error: '<i class="fas fa-times-circle"></i>',
            info: '<i class="fas fa-info-circle"></i>',
            warning: '<i class="fas fa-exclamation-triangle"></i>',
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close"><i class="fas fa-times"></i></button>
        `;

        // Ajouter le toast
        container.appendChild(toast);

        // Animation d'entrée
        requestAnimationFrame(() => {
            toast.classList.add("show");
        });

        // Gestion de la fermeture
        const closeBtn = toast.querySelector(".toast-close");
        closeBtn.addEventListener("click", () => this.remove(toast));

        // Auto-suppression
        if (duration > 0) {
            setTimeout(() => this.remove(toast), duration);
        }

        return toast;
    }

    static remove(toast) {
        toast.classList.remove("show");
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    static success(title, message, duration) {
        return this.show(title, message, "success", duration);
    }

    static error(title, message, duration) {
        return this.show(title, message, "error", duration);
    }

    static info(title, message, duration) {
        return this.show(title, message, "info", duration);
    }
}

// Indicateur global d'état réseau
class NetworkStatusBanner {
    static init() {
        if (this.initialized) return;
        this.initialized = true;

        this.banner = document.getElementById("network-status-banner");
        if (!this.banner) {
            this.banner = document.createElement("div");
            this.banner.id = "network-status-banner";
            this.banner.className = "network-status-banner";
            this.banner.setAttribute("role", "status");
            this.banner.setAttribute("aria-live", "polite");
            this.banner.textContent =
                "Hors connexion. Certaines actions sont indisponibles.";
            document.body.appendChild(this.banner);
        }

        this.update();
        window.addEventListener("online", () => this.update());
        window.addEventListener("offline", () => this.update());
    }

    static update() {
        if (!this.banner) return;
        const isOnline =
            typeof navigator === "undefined"
                ? true
                : navigator.onLine !== false;
        this.banner.classList.toggle("is-visible", !isOnline);
    }
}

// Gestion de la persistance de session
class SessionManager {
    static SESSION_KEY = "rize_user_session";
    static EXPIRY_KEY = "rize_session_expiry";

    static saveSession(user, expiresIn = 7 * 24 * 60 * 60 * 1000) {
        // 7 jours par défaut
        const expiry = Date.now() + expiresIn;
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
        localStorage.setItem(this.EXPIRY_KEY, expiry.toString());
    }

    static loadSession() {
        try {
            const expiry = localStorage.getItem(this.EXPIRY_KEY);

            // Vérifier si la session a expiré
            if (expiry && Date.now() > parseInt(expiry)) {
                this.clearSession();
                return null;
            }

            const sessionData = localStorage.getItem(this.SESSION_KEY);
            return sessionData ? JSON.parse(sessionData) : null;
        } catch (error) {
            console.error("Erreur chargement session:", error);
            this.clearSession();
            return null;
        }
    }

    static clearSession() {
        localStorage.removeItem(this.SESSION_KEY);
        localStorage.removeItem(this.EXPIRY_KEY);
    }

    static extendSession(additionalTime = 7 * 24 * 60 * 60 * 1000) {
        const expiry = Date.now() + additionalTime;
        localStorage.setItem(this.EXPIRY_KEY, expiry.toString());
    }
}

// Améliorations des animations
class AnimationManager {
    static fadeInElements(selector, delay = 100) {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el, index) => {
            el.style.opacity = "0";
            el.style.transform = "translateY(20px)";

            setTimeout(() => {
                el.style.transition = "all 0.6s cubic-bezier(0.23, 1, 0.32, 1)";
                el.style.opacity = "1";
                el.style.transform = "translateY(0)";
            }, index * delay);
        });
    }

    static bounceIn(element) {
        if (element) {
            element.classList.add("animate-bounce-in");
            setTimeout(() => {
                element.classList.remove("animate-bounce-in");
            }, 600);
        }
    }

    static slideUp(element) {
        if (element) {
            element.classList.add("animate-slide-up");
            setTimeout(() => {
                element.classList.remove("animate-slide-up");
            }, 400);
        }
    }
}

// États de chargement pour les listes
class LoadingStateManager {
    static showSpinner(
        container,
        message = "Veuillez patienter pendant le chargement des trajectoires...",
    ) {
        if (!container) return;

        // Privilégier des squelettes visuels plutôt qu'un spinner
        if (this.showSmartSkeleton(container)) return;

        container.innerHTML = `
            <div class="loading-state-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; width: 100%; grid-column: 1 / -1; min-height: 300px;">
                <div class="loading-spinner" style="width: 50px; height: 50px; border-width: 3px;"></div>
                <p style="color: var(--text-secondary); font-size: 1rem; margin-top: 20px; text-align: center; animation: pulse 2s infinite;">${message}</p>
            </div>
        `;

        // Add pulse keyframes if not exists
        if (!document.getElementById("pulse-keyframes")) {
            const style = document.createElement("style");
            style.id = "pulse-keyframes";
            style.textContent = `
                @keyframes pulse {
                    0% { opacity: 0.6; }
                    50% { opacity: 1; }
                    100% { opacity: 0.6; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    static showSkeleton(container, type = "card", count = 3) {
        if (!container) return;

        const skeletonHTML = this.generateSkeleton(type, count);
        container.innerHTML = skeletonHTML;
    }

    static generateSkeleton(type, count) {
        let skeletonItem = "";

        switch (type) {
            case "card":
                skeletonItem = '<div class="skeleton skeleton-card"></div>';
                break;
            case "list":
                skeletonItem = `
                    <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                        <div class="skeleton skeleton-avatar"></div>
                        <div style="flex: 1;">
                            <div class="skeleton skeleton-text" style="width: 60%;"></div>
                            <div class="skeleton skeleton-text" style="width: 80%;"></div>
                        </div>
                    </div>
                `;
                break;
            case "text":
                skeletonItem = `
                    <div class="skeleton skeleton-text" style="width: 100%; margin-bottom: 8px;"></div>
                    <div class="skeleton skeleton-text" style="width: 75%;"></div>
                `;
                break;
        }

        return Array(count).fill(skeletonItem).join("");
    }

    // Détecte le contexte pour injecter des squelettes adaptés (grille discover, profil, listes)
    static showSmartSkeleton(container) {
        const classList = container.classList
            ? container.classList
            : { contains: () => false };

        // Grille Discover : cartes placeholder
        if (classList.contains("discover-grid")) {
            const cardsHTML = this.generateSkeleton("card", 8);
            container.innerHTML = `
                <div class="loading-state-container skeleton-grid" aria-hidden="true">
                    ${cardsHTML}
                </div>
            `;
            return true;
        }

        // Page profil : squelette dédié
        if (classList.contains("profile-container")) {
            if (typeof window.getProfileSkeletonMarkup === "function") {
                container.innerHTML = window.getProfileSkeletonMarkup();
            } else {
                const listHTML = this.generateSkeleton("list", 4);
                container.innerHTML = `<div class="loading-state-container" aria-hidden="true">${listHTML}</div>`;
            }
            return true;
        }

        // Listes / timelines génériques
        if (
            classList.contains("timeline") ||
            classList.contains("list") ||
            container.tagName === "UL" ||
            container.tagName === "OL"
        ) {
            const listHTML = this.generateSkeleton("list", 5);
            container.innerHTML = `<div class="loading-state-container" aria-hidden="true">${listHTML}</div>`;
            return true;
        }

        return false;
    }

    static showEmptyState(
        container,
        icon,
        title,
        message,
        actionButton = null,
    ) {
        if (!container) return;

        const buttonHTML = actionButton
            ? `<button class="btn btn-primary" onclick="${actionButton.action}">${actionButton.text}</button>`
            : "";

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${icon}</div>
                <h3>${title}</h3>
                <p>${message}</p>
                ${buttonHTML}
            </div>
        `;
    }
}

// Amélioration du feedback des interactions
class InteractionFeedback {
    static addRippleEffect(button) {
        button.addEventListener("click", function (e) {
            const ripple = document.createElement("span");
            const rect = button.getBoundingClientRect();
            const size = Math.max(rect.height, rect.width);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;

            ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                left: ${x}px;
                top: ${y}px;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                transform: scale(0);
                animation: ripple 0.6s linear;
                pointer-events: none;
            `;

            button.style.position = "relative";
            button.style.overflow = "hidden";
            button.appendChild(ripple);

            setTimeout(() => ripple.remove(), 600);
        });
    }

    static initAll() {
        // Ajouter l'effet ripple à tous les boutons
        document.querySelectorAll(".btn").forEach((btn) => {
            this.addRippleEffect(btn);
        });

        // Observer les nouveaux boutons ajoutés dynamiquement
        if (window.MutationObserver) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Nouveaux boutons
                            if (node.classList.contains("btn")) {
                                this.addRippleEffect(node);
                            }
                            // Boutons dans les nouveaux éléments
                            node.querySelectorAll &&
                                node.querySelectorAll(".btn").forEach((btn) => {
                                    this.addRippleEffect(btn);
                                });
                        }
                    });
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });
        }
    }
}

// CSS pour l'effet ripple
const rippleCSS = `
@keyframes ripple {
    to {
        transform: scale(4);
        opacity: 0;
    }
}
`;

// Ajouter le CSS pour les effets
if (!document.getElementById("ux-enhancements-css")) {
    const style = document.createElement("style");
    style.id = "ux-enhancements-css";
    style.textContent = rippleCSS;
    document.head.appendChild(style);
}

/* ========================================
   FLUIDITY ENGINE (Seamless Extensions)
   ======================================== */

class FluidityEngine {
    static init() {
        this.injectProgressBar();
        this.setupNavigationIntercept();
        this.injectStatusIndicator();
        this.startLoading();
        setTimeout(() => this.stopLoading(), 800);
        console.log("🚀 Fluidity Engine: Initialized.");
    }

    static injectStatusIndicator() {
        const dot = document.createElement("div");
        dot.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 10px;
            width: 8px;
            height: 8px;
            background: #10b981;
            border-radius: 50%;
            z-index: 10000;
            opacity: 0.6;
            box-shadow: 0 0 5px #10b981;
        `;
        dot.title = "XERA1 Engine Active";
        document.body.appendChild(dot);
    }

    static injectProgressBar() {
        if (document.getElementById("global-progress-bar")) return;
        const bar = document.createElement("div");
        bar.id = "global-progress-bar";
        bar.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            height: 4px;
            width: 0;
            background: linear-gradient(90deg, #10b981, #6366f1);
            z-index: 10000;
            transition: width 0.4s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.4s;
            pointer-events: none;
            box-shadow: 0 0 15px rgba(139, 92, 246, 0.5);
            opacity: 0;
        `;
        document.body.appendChild(bar);
    }

    static startLoading() {
        const bar = document.getElementById("global-progress-bar");
        if (!bar) return;
        bar.style.opacity = "1";
        bar.style.width = "30%";
        this.loadingInterval = setInterval(() => {
            const currentWidth = parseFloat(bar.style.width);
            if (currentWidth < 90) {
                bar.style.width =
                    currentWidth + (90 - currentWidth) * 0.1 + "%";
            }
        }, 500);
    }

    static stopLoading() {
        if (this.loadingInterval) clearInterval(this.loadingInterval);
        const bar = document.getElementById("global-progress-bar");
        if (!bar) return;
        bar.style.width = "100%";
        setTimeout(() => {
            bar.style.opacity = "0";
            setTimeout(() => {
                bar.style.width = "0";
            }, 400);
        }, 300);
    }

    static setupNavigationIntercept() {
        document.addEventListener("mouseover", (e) => {
            const link = e.target.closest("a");
            if (!link || !link.href || link.dataset.prefetched) return;
            const url = new URL(link.href);
            if (url.origin !== window.location.origin) return;
            link.dataset.prefetched = "true";
            const linkTag = document.createElement("link");
            linkTag.rel = "prefetch";
            linkTag.href = link.href;
            document.head.appendChild(linkTag);
        });

        document.addEventListener("click", (e) => {
            const link = e.target.closest("a");
            if (
                !link ||
                !link.href ||
                link.target === "_blank" ||
                e.metaKey ||
                e.ctrlKey
            )
                return;
            const url = new URL(link.href);
            if (url.origin !== window.location.origin) return;
            if (url.pathname.endsWith(".pdf") || url.pathname.includes("/api/"))
                return;
            this.startLoading();
        });

        window.addEventListener("popstate", () => {
            this.startLoading();
        });
    }
}

/* ========================================
   COMMAND CENTER (Invisible Infrastructure)
   ======================================== */

class CommandCenter {
    static init() {
        document.addEventListener("keydown", (e) => {
            // CTRL+K logic
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                this.toggle();
            }
            // ESC to quit Zen
            if (e.key === "Escape") {
                if (document.body.classList.contains("zen-mode-active")) {
                    ZenMode.toggle();
                }
            }
        });
        console.log("⌨️ Command Center: CTRL+K & ESC Active.");
    }

    static toggle() {
        const userId =
            window.currentUserId ||
            (window.currentUser ? window.currentUser.id : null);

        // Priorité à la création de Trace (le geste le plus fréquent)
        if (typeof window.openCreateMenu === "function" && userId) {
            window.openCreateMenu(userId);
            this.focusTextarea();
        } else if (typeof window.openCreateModal === "function") {
            window.openCreateModal();
            this.focusTextarea();
        } else {
            console.warn("CommandCenter: No creation method found.");
            if (window.ToastManager)
                ToastManager.error("Erreur", "Menu de création indisponible.");
        }
    }

    static focusTextarea() {
        setTimeout(() => {
            const area = document.querySelector(
                "#create-modal textarea, #create-form textarea",
            );
            if (area) {
                area.focus();
                console.log("🎯 Area focused.");
            }
        }, 150);
    }
}

// Initialisation automatique
document.addEventListener("DOMContentLoaded", () => {
    ToastManager.init();
    NetworkStatusBanner.init();
    InteractionFeedback.initAll();
    FluidityEngine.init();
    CommandCenter.init();
});

/* ========================================
   ZEN MODE & GLOBAL UTILS (Performance & Focus)
   ======================================== */

class ZenMode {
    static toggle() {
        document.body.classList.toggle("zen-mode-active");
        const isActive = document.body.classList.contains("zen-mode-active");
        if (isActive) {
            ToastManager.info("Mode Zen Activé", "Focus sur l'essentiel.");
        }
    }
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        ToastManager.success(
            "Copié !",
            "Lien ou clé copié dans le presse-papiers.",
        );
        return true;
    } catch (err) {
        console.error("Failed to copy: ", err);
        return false;
    }
}

window.ZenMode = ZenMode;
window.copyToClipboard = copyToClipboard;
window.LoadingManager = LoadingManager;
window.ToastManager = ToastManager;
window.NetworkStatusBanner = NetworkStatusBanner;
window.SessionManager = SessionManager;
window.AnimationManager = AnimationManager;
window.LoadingStateManager = LoadingStateManager;
window.InteractionFeedback = InteractionFeedback;
