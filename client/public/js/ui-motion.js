/* XERA1 UI motion: intentionally small, reusable and respectful of reduced motion. */
(function () {
    "use strict";

    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    const isReduced = () => Boolean(reduceMotion && reduceMotion.matches);

    function setupNavigation() {
        const nav = document.querySelector("nav");
        if (!nav || nav.dataset.motionReady === "true") return;

        nav.dataset.motionReady = "true";
        nav.classList.add("ui-motion-nav");
        let previousY = Math.max(0, window.scrollY || window.pageYOffset || 0);
        let ticking = false;
        const reveal = () => nav.classList.remove("ui-motion-nav--hidden");
        const update = () => {
            ticking = false;
            if (isReduced()) {
                reveal();
                return;
            }

            const currentY = Math.max(0, window.scrollY || window.pageYOffset || 0);
            const delta = currentY - previousY;
            const hasFocus = nav.contains(document.activeElement);
            if (currentY < 56 || delta < -6 || hasFocus) {
                reveal();
            } else if (currentY > 88 && delta > 6) {
                nav.classList.add("ui-motion-nav--hidden");
            }
            previousY = currentY;
        };

        window.addEventListener("scroll", () => {
            if (!ticking) {
                ticking = true;
                window.requestAnimationFrame(update);
            }
        }, { passive: true });
        nav.addEventListener("focusin", reveal);
        if (reduceMotion) reduceMotion.addEventListener("change", update);
    }

    function setupReveals() {
        if (isReduced() || !("IntersectionObserver" in window)) return;
        const targets = Array.from(document.querySelectorAll(
            "main > section, .section, .user-card, .premium-card, .plan-card, .plan-detail-card, .stat-card, .wallet-card, .revenue-card, .settings-section, .stream-preview-section, .stream-controls-section"
        )).slice(0, 72);
        if (!targets.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("ui-motion-revealed");
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.08, rootMargin: "0px 0px -24px" });

        targets.forEach((target, index) => {
            if (target.closest("nav, [role='dialog']")) return;
            target.classList.add("ui-motion-reveal");
            target.style.setProperty("--ui-reveal-delay", `${Math.min(index % 5, 4) * 36}ms`);
            observer.observe(target);
        });
    }

    function playCourageFeedback(buttons, origin) {
        if (isReduced()) return;
        const targets = Array.from(new Set((buttons || []).filter(Boolean)));
        if (!targets.length && origin) targets.push(origin);
        targets.forEach((button) => {
            button.classList.remove("ui-courage-feedback");
            void button.offsetWidth;
            button.classList.add("ui-courage-feedback");
            window.setTimeout(() => button.classList.remove("ui-courage-feedback"), 460);
        });
    }

    function init() {
        setupNavigation();
        setupReveals();
    }

    window.XeraUIMotion = { playCourageFeedback, init };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
}());
