/* ========================================
   AMÉLIORATIONS GLOBALES APP - XERA1
   Navigation fluide, feedbacks visuels, interactions
   ======================================== */

// Gestionnaire de navigation avec améliorations
class NavigationEnhancer {
    static init() {
        this.enhanceNavigation();
        this.addScrollEffects();
        this.addPageTransitions();
    }

    static enhanceNavigation() {
        // Améliorer tous les liens de navigation
        const navLinks = document.querySelectorAll("nav a, .nav-links a");
        navLinks.forEach((link) => {
            if (!link.onclick) {
                // Éviter de modifier les liens avec déjà une fonction onclick
                link.addEventListener("click", this.handleNavClick.bind(this));
            }
        });

        // Observer les changements d'URL pour les animations de page
        this.currentPage = this.getCurrentPage();
        this.observePageChanges();
    }

    static handleNavClick(e) {
        const link = e.currentTarget;

        // Ajouter un effet de feedback visuel
        this.addClickFeedback(link);

        // Animation de transition
        const href = link.getAttribute("href");
        if (href && href.startsWith("#")) {
            e.preventDefault();
            this.smoothScrollToSection(href.substring(1));
        }
    }

    static addClickFeedback(element) {
        element.style.transform = "scale(0.95)";
        element.style.transition = "transform 0.1s ease";

        setTimeout(() => {
            element.style.transform = "scale(1)";
            element.style.transition =
                "transform 0.2s cubic-bezier(0.23, 1, 0.32, 1)";
        }, 100);
    }

    static smoothScrollToSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) {
            // Masquer la section actuelle en fondu
            const currentSection = document.querySelector(".page.active");
            if (currentSection && currentSection !== section) {
                currentSection.style.opacity = "0";
                currentSection.style.transform = "translateY(-20px)";

                setTimeout(() => {
                    currentSection.classList.remove("active");
                    section.classList.add("active");
                    section.style.opacity = "0";
                    section.style.transform = "translateY(20px)";

                    // Animation d'entrée
                    requestAnimationFrame(() => {
                        section.style.transition =
                            "all 0.5s cubic-bezier(0.23, 1, 0.32, 1)";
                        section.style.opacity = "1";
                        section.style.transform = "translateY(0)";
                    });
                }, 200);
            } else if (!currentSection) {
                section.classList.add("active");
                AnimationManager.slideUp(section);
            }
        }
    }

    static addScrollEffects() {
        // Parallax subtil pour les éléments
        let ticking = false;

        function updateScrollEffects() {
            const scrollY = window.scrollY;

            ticking = false;
        }

        window.addEventListener("scroll", () => {
            if (!ticking) {
                requestAnimationFrame(updateScrollEffects);
                ticking = true;
            }
        });
    }

    static addPageTransitions() {
        // Intercepter les appels à navigateTo pour ajouter des transitions
        const originalNavigateTo = window.navigateTo;

        window.navigateTo = (pageId, options) => {
            const currentPage = document.querySelector(".page.active");
            const nextPage =
                document.getElementById(pageId) ||
                document.getElementById(
                    pageId === "pagepro" ? "pro-page" : pageId,
                );

            if (currentPage && nextPage && currentPage !== nextPage) {
                // Animation de sortie
                currentPage.style.transform = "scale(0.98) translateX(-20px)";
                currentPage.style.opacity = "0.8";
                currentPage.style.transition =
                    "all 0.3s cubic-bezier(0.23, 1, 0.32, 1)";

                setTimeout(() => {
                    if (originalNavigateTo) {
                        originalNavigateTo(pageId, options);
                    } else {
                        // Fallback simple
                        currentPage.classList.remove("active");
                        nextPage.classList.add("active");
                    }

                    // Animation d'entrée
                    nextPage.style.transform = "scale(1.02) translateX(20px)";
                    nextPage.style.opacity = "0.8";

                    requestAnimationFrame(() => {
                        nextPage.style.transition =
                            "all 0.4s cubic-bezier(0.23, 1, 0.32, 1)";
                        nextPage.style.transform = "scale(1) translateX(0)";
                        nextPage.style.opacity = "1";
                    });
                }, 150);
            } else {
                // Pas de transition, utiliser la fonction originale
                if (originalNavigateTo) {
                    originalNavigateTo(pageId, options);
                }
            }
        };
    }

    static getCurrentPage() {
        const activePage = document.querySelector(".page.active");
        return activePage ? activePage.id : null;
    }

    static observePageChanges() {
        // Observer les changements de page active pour des animations
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === "class") {
                    const target = mutation.target;
                    if (
                        target.classList.contains("page") &&
                        target.classList.contains("active")
                    ) {
                        this.onPageActivated(target);
                    }
                }
            });
        });

        document.querySelectorAll(".page").forEach((page) => {
            observer.observe(page, { attributes: true });
        });
    }

    static onPageActivated(page) {
        // Animer les éléments de la page nouvellement activée
        const cards = page.querySelectorAll(".discover-card");
        const contentItems = page.querySelectorAll(
            ".content-item, .timeline-item",
        );

        LoadingFeedback.clearAll();

        if (cards.length > 0) {
            AnimationManager.fadeInElements(cards, 100);
        }

        if (contentItems.length > 0) {
            AnimationManager.fadeInElements(contentItems, 80);
        }
    }
}

// Gestionnaire d'interactions améliorées
class InteractionEnhancer {
    static init() {
        this.enhanceButtons();
        this.addHoverEffects();
        this.addFocusManagement();
    }

    static enhanceButtons() {
        // Intercepter tous les clics de boutons pour ajouter des feedbacks
        // MAIS ne pas interférer avec les fonctionnalités critiques
        document.addEventListener("click", (e) => {
            const button = e.target.closest("button, .btn");
            if (button && !button.disabled) {
                // Ne pas intercepter les boutons avec des onclick critiques
                const onclick = button.getAttribute("onclick");
                if (
                    onclick &&
                    (onclick.includes("launchLive") ||
                        onclick.includes("openSettings") ||
                        onclick.includes("toggleFollow"))
                ) {
                    // Juste l'effet visuel, ne pas interférer
                    setTimeout(() => this.addButtonFeedback(button), 0);
                } else {
                    this.addButtonFeedback(button);
                }
            }
        });

        // Ajouter des effets keyboard
        document.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                const focused = document.activeElement;
                if (
                    focused &&
                    (focused.tagName === "BUTTON" ||
                        focused.classList.contains("btn"))
                ) {
                    this.addButtonFeedback(focused);
                }
            }
        });
    }

    static addButtonFeedback(button) {
        // Éviter les feedbacks multiples
        if (button.classList.contains("feedback-active")) return;

        button.classList.add("feedback-active");

        // Effet de pression
        const originalTransform = button.style.transform;
        button.style.transform = "scale(0.95)";
        button.style.transition =
            "transform 0.1s cubic-bezier(0.34, 1.56, 0.64, 1)";

        setTimeout(() => {
            button.style.transform = originalTransform || "scale(1)";
            button.style.transition =
                "transform 0.3s cubic-bezier(0.23, 1, 0.32, 1)";

            setTimeout(() => {
                button.classList.remove("feedback-active");
            }, 300);
        }, 100);
    }

    static addHoverEffects() {
        // Ajouter des effets de survol dynamiques
        const style = document.createElement("style");
        style.textContent = `
            .discover-card {
                transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
                will-change: transform, box-shadow;
            }
            
            .discover-card:hover {
                transform: translateY(-8px);
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            }
            
            .btn:hover:not(:disabled) {
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(255, 255, 255, 0.1);
            }
            
            nav a:hover {
                transform: translateY(-1px);
                transition: transform 0.2s ease;
            }
            
            .timeline-item:hover {
                transform: translateX(5px);
                transition: transform 0.3s ease;
            }
        `;
        document.head.appendChild(style);
    }

    static addFocusManagement() {
        // Améliorer la gestion du focus pour l'accessibilité
        let isKeyboardUser = false;

        document.addEventListener("keydown", (e) => {
            if (e.key === "Tab") {
                isKeyboardUser = true;
                document.body.classList.add("keyboard-user");
            }
        });

        document.addEventListener("mousedown", () => {
            isKeyboardUser = false;
            document.body.classList.remove("keyboard-user");
        });

        // Focus visible only for keyboard users
        const focusStyle = document.createElement("style");
        focusStyle.textContent = `
            body:not(.keyboard-user) button:focus,
            body:not(.keyboard-user) .btn:focus {
                outline: none;
            }
            
            .keyboard-user button:focus,
            .keyboard-user .btn:focus {
                outline: 2px solid var(--accent-color);
                outline-offset: 2px;
            }
        `;
        document.head.appendChild(focusStyle);
    }
}

// Feedback de chargement léger sur clics
class LoadingFeedback {
    static activeElements = new Set();
    static timeouts = new Map();
    static fallbackDuration = 2200;
    static buttonDuration = 700;

    static init() {
        this.addNavigationClickFeedback();
        this.addUserProfileClickFeedback();
        this.addButtonClickFeedback();
    }

    static addNavigationClickFeedback() {
        document.addEventListener("click", (e) => {
            const onclickTarget = e.target.closest(
                '[onclick*="navigateTo("], [onclick*="handleProfileNavigation"], [onclick*="navigateToUserProfile"], [onclick*="window.location"], [onclick*="location.href"]',
            );
            const link = e.target.closest("a[href]");
            const href = link ? link.getAttribute("href") : null;
            const isRealLink =
                href &&
                href !== "#" &&
                !href.startsWith("#") &&
                !href.startsWith("javascript:");
            const target = onclickTarget || (isRealLink ? link : null);

            if (!target) return;
            if (target.closest("button") || target.classList.contains("btn"))
                return;

            this.setLoading(target, {
                persistent: true,
                showSpinner: true,
            });
        });
    }

    static addUserProfileClickFeedback() {
        document.addEventListener("click", (e) => {
            const target = e.target.closest(
                '[onclick*="navigateToUserProfile"]',
            );
            if (!target) return;
            this.setLoading(target, { persistent: true, showSpinner: true });
        });
    }

    static addButtonClickFeedback() {
        document.addEventListener("click", (e) => {
            const button = e.target.closest("button, .btn");
            if (!button || button.disabled) return;
            if (button.classList.contains("btn-loading")) return;
            const onclick = button.getAttribute("onclick") || "";
            const isNavigationAction =
                onclick.includes("navigateTo(") ||
                onclick.includes("handleProfileNavigation") ||
                onclick.includes("navigateToUserProfile") ||
                onclick.includes("window.location") ||
                onclick.includes("location.href");
            this.setLoading(button, {
                persistent: isNavigationAction,
                duration: isNavigationAction
                    ? this.fallbackDuration
                    : this.buttonDuration,
                buttonSpinner: isNavigationAction,
            });
        });
    }

    static setLoading(
        element,
        {
            persistent = false,
            duration = this.fallbackDuration,
            showSpinner = false,
            buttonSpinner = false,
        } = {},
    ) {
        if (!element || element.classList.contains("click-loading")) return;
        element.classList.add("click-loading");
        if (showSpinner) {
            element.classList.add("click-loading-indicator");
        }
        if (buttonSpinner) {
            this.applyButtonSpinner(element);
        }
        this.activeElements.add(element);

        const timeout = setTimeout(
            () => {
                this.clearElement(element);
            },
            persistent ? this.fallbackDuration : duration,
        );

        this.timeouts.set(element, timeout);
    }

    static clearElement(element) {
        if (!element) return;
        element.classList.remove("click-loading");
        element.classList.remove("click-loading-indicator");
        this.removeButtonSpinner(element);
        this.activeElements.delete(element);
        const timeout = this.timeouts.get(element);
        if (timeout) {
            clearTimeout(timeout);
            this.timeouts.delete(element);
        }
    }

    static clearAll() {
        this.activeElements.forEach((element) => this.clearElement(element));
    }

    static applyButtonSpinner(button) {
        if (!button || button.classList.contains("btn-loading")) return;
        button.classList.add("btn-loading");

        let spinner = button.querySelector(".loading-spinner");
        if (!spinner) {
            spinner = document.createElement("span");
            spinner.className = "loading-spinner temp-loading-spinner";
            button.appendChild(spinner);
        }
    }

    static removeButtonSpinner(button) {
        if (!button) return;
        button.classList.remove("btn-loading");
        const tempSpinner = button.querySelector(".temp-loading-spinner");
        if (tempSpinner) {
            tempSpinner.remove();
        }
    }
}

// Gestionnaire de performance pour les animations
class PerformanceOptimizer {
    static init() {
        this.optimizeAnimations();
        this.manageResources();
    }

    static optimizeAnimations() {
        // Réduire les animations si l'utilisateur préfère un mouvement réduit
        const prefersReducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        if (prefersReducedMotion) {
            const style = document.createElement("style");
            style.textContent = `
                *, *::before, *::after {
                    animation-duration: 0.01ms !important;
                    animation-iteration-count: 1 !important;
                    transition-duration: 0.01ms !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    static manageResources() {
        // Lazy loading des images
        if ("IntersectionObserver" in window) {
            const imageObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                            img.removeAttribute("data-src");
                            imageObserver.unobserve(img);
                        }
                    }
                });
            });

            // Observer les images avec data-src
            document.querySelectorAll("img[data-src]").forEach((img) => {
                imageObserver.observe(img);
            });
        }
    }
}

// Feedback widget (modal + sticky tab)
class FeedbackWidget {
    static init() {
        if (this.initialized) return;
        this.initialized = true;
        this.storageKey = "rize_feedback_state";
        // Receiver for admin review (fallback to known super admin UUID)
        this.receiverId =
            (typeof SUPER_ADMIN_ID !== "undefined" && SUPER_ADMIN_ID) ||
            "b0f9f893-1706-4721-899c-d26ad79afc86";
        this.actionCountKey = "rize_feedback_actions";
        this.threshold = 10;
        this.shownAfterThreshold = false;
        this.createElements();
        this.bindEvents();
        this.trackUserActions();
        this.restoreState();
    }

    static createElements() {
        if (document.getElementById("feedback-modal")) return;

        this.backdrop = document.createElement("div");
        this.backdrop.id = "feedback-backdrop";
        this.backdrop.className = "feedback-backdrop";

        this.modal = document.createElement("div");
        this.modal.id = "feedback-modal";
        this.modal.className = "feedback-modal";
        this.modal.innerHTML = `
            <div class="feedback-header">
                <p class="feedback-eyebrow">Quick pulse</p>
                <h3>What do you think of XERA1?</h3>
                <p class="feedback-sub">Your feedback helps us build faster.</p>
            </div>
            <form id="feedback-form" class="feedback-form">
                <div class="feedback-emoji-row" role="radiogroup" aria-label="Satisfaction level">
                    ${["😡", "😕", "😐", "🙂", "🤩"]
                        .map(
                            (emoji, idx) => `
                        <label class="feedback-emoji">
                            <input type="radio" name="feedback-mood" value="${idx - 2}" ${idx === 3 ? "checked" : ""}>
                            <span>${emoji}</span>
                        </label>
                    `,
                        )
                        .join("")}
                </div>
                <label class="feedback-label" for="feedback-comment">Anything specific?</label>
                <textarea id="feedback-comment" name="comment" rows="3" placeholder="Tell us what works, what doesn't, or what's missing."></textarea>
                <div class="feedback-actions">
                    <button type="submit" class="btn btn-primary feedback-submit">Give Feedback</button>
                    <button type="button" class="btn btn-ghost feedback-close">Close</button>
                </div>
            </form>
        `;

        this.toggleButton = document.createElement("button");
        this.toggleButton.id = "feedback-toggle";
        this.toggleButton.type = "button";
        this.toggleButton.className = "feedback-toggle";
        this.toggleButton.innerHTML = `<span class="dot"></span><span class="text">Feedback</span>`;

        document.body.appendChild(this.backdrop);
        document.body.appendChild(this.modal);
        document.body.appendChild(this.toggleButton);
    }

    static bindEvents() {
        if (!this.modal || !this.backdrop || !this.toggleButton) return;
        const closeBtn = this.modal.querySelector(".feedback-close");
        const form = this.modal.querySelector("#feedback-form");

        this.backdrop.addEventListener("click", () =>
            FeedbackWidget.collapse(),
        );
        if (closeBtn)
            closeBtn.addEventListener("click", () => FeedbackWidget.collapse());
        if (form)
            form.addEventListener(
                "submit",
                FeedbackWidget.handleSubmit.bind(this),
            );
        this.toggleButton.addEventListener("click", () =>
            FeedbackWidget.open(),
        );
    }

    static async handleSubmit(event) {
        event.preventDefault();
        const form = event.target;
        const mood = form.querySelector('input[name="feedback-mood"]:checked');
        const comment = form.querySelector("#feedback-comment");
        const moodValue = mood ? Number(mood.value) : null;
        const commentText = (comment?.value || "").trim();

        const submitBtn = form.querySelector(".feedback-submit");
        if (submitBtn) {
            submitBtn.textContent = "Sending...";
            submitBtn.disabled = true;
        }

        const sent = await FeedbackWidget.sendToAdmin({
            mood: moodValue,
            comment: commentText,
        });

        if (!sent) {
            if (submitBtn) {
                submitBtn.textContent = "Retry Send";
                submitBtn.disabled = false;
            }
            alert("Unable to send feedback right now. Please try again.");
            return;
        }

        if (submitBtn) {
            submitBtn.textContent = "Sent — thanks!";
            setTimeout(() => {
                submitBtn.textContent = "Give Feedback";
                submitBtn.disabled = false;
            }, 2200);
        }

        // Persist submitted state so the floating tab disappears permanently
        FeedbackWidget.setState("submitted");
        FeedbackWidget.hideForever();

        // Clear fields for next time
        if (mood) mood.checked = false;
        if (comment) comment.value = "";
    }

    static open() {
        if (FeedbackWidget.getState() === "submitted") {
            FeedbackWidget.hideForever(true);
            return;
        }
        if (!this.modal || !this.backdrop || !this.toggleButton) return;
        this.modal.classList.add("is-open");
        this.backdrop.classList.add("is-open");
        this.toggleButton.classList.remove("is-visible");
        this.setState("open");
    }

    static collapse(persistState = true) {
        if (!this.modal || !this.backdrop || !this.toggleButton) return;
        this.modal.classList.remove("is-open");
        this.backdrop.classList.remove("is-open");
        this.toggleButton.classList.add("is-visible");
        if (persistState) this.setState("collapsed");
    }

    static restoreState() {
        const saved = this.getState();
        if (saved === "submitted") {
            this.hideForever(true);
            return;
        }
        if (saved === "collapsed") {
            this.collapse();
        } else {
            // Defer auto-open: only after user engagement (handled by action tracker)
            // If already above threshold when loading, trigger once after short delay
            setTimeout(() => {
                FeedbackWidget.maybeTriggerOpen();
            }, 500);
        }
    }

    static getState() {
        try {
            return localStorage.getItem(this.storageKey);
        } catch (e) {
            return null;
        }
    }

    static setState(state) {
        try {
            localStorage.setItem(this.storageKey, state);
        } catch (e) {
            // ignore
        }
    }

    static hideForever(skipPersist = false) {
        if (!skipPersist) this.setState("submitted");
        if (this.modal) {
            this.modal.classList.remove("is-open");
            this.modal.style.display = "none";
        }
        if (this.backdrop) {
            this.backdrop.classList.remove("is-open");
            this.backdrop.style.display = "none";
        }
        if (this.toggleButton) {
            this.toggleButton.classList.add("is-hidden");
            this.toggleButton.classList.remove("is-visible");
        }
    }

    static trackUserActions() {
        try {
            this.actionCount =
                parseInt(
                    sessionStorage.getItem(this.actionCountKey) || "0",
                    10,
                ) || 0;
        } catch (e) {
            this.actionCount = 0;
        }
        document.addEventListener(
            "click",
            (e) => {
                const withinFeedback =
                    e.target.closest &&
                    e.target.closest("#feedback-modal, #feedback-toggle");
                if (withinFeedback) return;
                FeedbackWidget.incrementActions();
            },
            { capture: true },
        );
    }

    static incrementActions() {
        this.actionCount = (this.actionCount || 0) + 1;
        try {
            sessionStorage.setItem(
                this.actionCountKey,
                String(this.actionCount),
            );
        } catch (e) {
            /* ignore */
        }
        this.maybeTriggerOpen();
    }

    static maybeTriggerOpen() {
        if (this.shownAfterThreshold) return;
        const state = this.getState();
        if (state === "submitted" || state === "collapsed") return;
        if ((this.actionCount || 0) >= this.threshold) {
            this.shownAfterThreshold = true;
            this.open();
        }
    }

    static async sendToAdmin(payload) {
        if (!window.supabase) return false;
        try {
            const { error } = await supabase.from("feedback_inbox").insert({
                mood: typeof payload.mood === "number" ? payload.mood : null,
                comment: payload.comment ? payload.comment.slice(0, 400) : null,
                sender_user_id: window.currentUser?.id || null,
                receiver_id: this.receiverId || null,
            });
            if (error) throw error;
            return true;
        } catch (err) {
            console.error("Feedback send error", err);
            return false;
        }
    }
}

function lockPwaStandaloneZoom() {
    const isStandalone =
        (typeof window.matchMedia === "function" &&
            window.matchMedia("(display-mode: standalone)").matches) ||
        (typeof navigator !== "undefined" && navigator.standalone === true);

    if (!isStandalone) return;

    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
        viewport = document.createElement("meta");
        viewport.setAttribute("name", "viewport");
        document.head.appendChild(viewport);
    }

    viewport.setAttribute(
        "content",
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
    );

    // iOS fallback for stubborn pinch gestures in standalone mode.
    const blockGesture = (e) => e.preventDefault();
    document.addEventListener("gesturestart", blockGesture, { passive: false });
    document.addEventListener("gesturechange", blockGesture, {
        passive: false,
    });
    document.addEventListener("gestureend", blockGesture, { passive: false });
    document.addEventListener(
        "touchmove",
        (e) => {
            if (e.touches && e.touches.length > 1) {
                e.preventDefault();
            }
        },
        { passive: false },
    );
}

// Initialisation automatique
document.addEventListener("DOMContentLoaded", () => {
    lockPwaStandaloneZoom();
    NavigationEnhancer.init();
    InteractionEnhancer.init();
    LoadingFeedback.init();
    PerformanceOptimizer.init();
    FeedbackWidget.init();

    // Ajouter un délai pour s'assurer que tous les autres scripts sont chargés
    setTimeout(() => {
        // Animer la page initiale
        const activePage = document.querySelector(".page.active");
        if (activePage) {
            AnimationManager.fadeInElements(
                ".page.active .discover-card, .page.active .content-item",
                100,
            );
        }
    }, 500);
});

// Export global
window.NavigationEnhancer = NavigationEnhancer;
window.InteractionEnhancer = InteractionEnhancer;
window.PerformanceOptimizer = PerformanceOptimizer;
