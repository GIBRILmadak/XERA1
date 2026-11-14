(function () {
    function ensureShell() {
        if (document.getElementById("xera1-premium-shell")) {
            return document.getElementById("xera1-premium-shell");
        }

        const shell = document.createElement("div");
        shell.id = "xera1-premium-shell";
        shell.setAttribute("aria-live", "polite");
        document.body.appendChild(shell);
        return shell;
    }

    function createToast(message, type = "info") {
        const container =
            document.getElementById("toast-container") || ensureShell();
        const toast = document.createElement("div");
        toast.className = `xera1-toast xera1-toast--${type}`;
        toast.innerHTML = `
            <div class="xera1-toast__title">${type === "success" ? "Success" : type === "error" ? "Notice" : "Update"}</div>
            <div class="xera1-toast__message">${message}</div>
        `;
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add("is-visible"));
        setTimeout(() => {
            toast.classList.remove("is-visible");
            setTimeout(() => toast.remove(), 250);
        }, 3200);
    }

    function createSkeleton(target) {
        if (!target || target.querySelector(".xera1-skeleton")) return;
        const skeleton = document.createElement("div");
        skeleton.className = "xera1-skeleton";
        skeleton.innerHTML =
            '<div class="xera1-skeleton__line"></div><div class="xera1-skeleton__line short"></div>';
        target.appendChild(skeleton);
    }

    async function getAccessToken() {
        try {
            if (window.supabase?.auth?.getSession) {
                const { data } = await window.supabase.auth.getSession();
                return data?.session?.access_token || null;
            }
        } catch (error) {
            console.warn("Unable to read Supabase session", error);
        }
        return null;
    }

    async function upgradeToPro() {
        const token = await getAccessToken();
        if (!token) {
            createToast(
                "Please sign in to activate your Pro upgrade.",
                "error",
            );
            return false;
        }

        try {
            const response = await fetch("/api/subscriptions/upgrade", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ plan: "pro" }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || "Unable to activate Pro");
            }

            if (window.currentUser) {
                window.currentUser = {
                    ...window.currentUser,
                    is_pro: true,
                    isPro: true,
                    role: "pro",
                    subscription_tier: "pro",
                    subscription_status: "active",
                };
            }

            createToast("Pro access activated successfully.", "success");
            window.dispatchEvent(new CustomEvent("xera1:pro-upgraded"));
            return true;
        } catch (error) {
            createToast(
                error.message || "Unable to activate Pro right now.",
                "error",
            );
            return false;
        }
    }

    function showUpgradeModal() {
        const existing = document.getElementById("xera1-upgrade-modal");
        if (existing) {
            existing.remove();
        }

        const modal = document.createElement("div");
        modal.id = "xera1-upgrade-modal";
        modal.className = "xera1-upgrade-modal";
        modal.innerHTML = `
            <div class="xera1-upgrade-modal__backdrop" data-close="true"></div>
            <div class="xera1-upgrade-modal__panel" role="dialog" aria-modal="true">
                <div class="xera1-upgrade-modal__badge">XERA1 Pro</div>
                <h2>Move faster with XERA1 Pro</h2>
                <p>Unlock premium insights, priority visibility and advanced tools for serious builders.</p>
                <ul>
                    <li>Advanced analytics and trend forecasting</li>
                    <li>Premium visibility for your work</li>
                    <li>Priority support and exclusive features</li>
                </ul>
                <button class="btn btn-primary" type="button" data-action="upgrade">Upgrade now</button>
            </div>
        `;
        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add("is-open"));

        modal
            .querySelectorAll('[data-close="true"], [data-action="upgrade"]')
            .forEach((element) => {
                element.addEventListener("click", async () => {
                    modal.classList.remove("is-open");
                    setTimeout(() => modal.remove(), 220);
                    if (element.getAttribute("data-action") === "upgrade") {
                        await upgradeToPro();
                    }
                });
            });
    }

    function protectFeature(target) {
        if (!target) return;
        const shouldGate =
            !window.currentUser?.is_pro && !window.currentUser?.isPro;
        if (!shouldGate) return;

        const badge = document.createElement("span");
        badge.className = "xera1-pro-lock";
        badge.innerHTML = "🔒 Pro";
        target.appendChild(badge);
        target.style.position = "relative";
        target.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            showUpgradeModal();
        });
    }

    function initPremiumUi() {
        const lockedTargets = document.querySelectorAll(
            '[data-pro-feature="true"]',
        );
        lockedTargets.forEach((element) => protectFeature(element));

        document
            .querySelectorAll('[data-loading-skeleton="true"]')
            .forEach((element) => {
                createSkeleton(element);
            });

        window.XERAPremiumUI = {
            toast: createToast,
            showUpgradeModal,
            protectFeature,
            upgradeToPro,
        };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initPremiumUi);
    } else {
        initPremiumUi();
    }
})();
