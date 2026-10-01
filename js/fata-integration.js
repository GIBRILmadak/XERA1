// FATA × XERA1 Frontend OIDC PKCE & UI Integration Module

(function (window) {
    "use strict";

    const FATA_STORAGE_KEY_CHALLENGE = "xera1_fata_challenge_id";

    function getApiBaseUrl() {
        const configured = String(window.XERA_API_BASE_URL || "").trim();
        if (configured) return configured.replace(/\/+$/, "");

        const { hostname, port, protocol } = window.location;
        if (
            (hostname === "localhost" || hostname === "127.0.0.1") &&
            port === "5502"
        ) {
            return `${protocol}//${hostname}:3000`;
        }
        return "";
    }

    function apiUrl(path) {
        return `${getApiBaseUrl()}${path}`;
    }

    function getLoginPath() {
        const { hostname, port } = window.location;
        return (hostname === "localhost" || hostname === "127.0.0.1") &&
            port === "5502"
            ? "/login.html"
            : "/login";
    }

    function parseUrlParams() {
        const search = window.location.search;
        const params = new URLSearchParams(search);
        return {
            fata: params.get("fata"),
            challengeId:
                params.get("challengeId") ||
                sessionStorage.getItem(FATA_STORAGE_KEY_CHALLENGE),
            connection: params.get("connection"),
            reason: params.get("reason"),
        };
    }

    async function getAuthToken() {
        if (window.supabase) {
            try {
                const { data: { session } } = await window.supabase.auth.getSession();
                if (session && session.access_token) {
                    return session.access_token;
                }
            } catch (_) {}
        }
        const storedSession =
            localStorage.getItem("sb-ssbuagqwjptyhavinkxg-auth-token") || "";
        try {
            return JSON.parse(storedSession).access_token || "";
        } catch (_) {
            return storedSession;
        }
    }

    async function startFataOidcFlow(overrideChallengeId) {
        const urlParams = parseUrlParams();
        const challengeId =
            overrideChallengeId ||
            urlParams.challengeId ||
            sessionStorage.getItem(FATA_STORAGE_KEY_CHALLENGE) ||
            "xera1-test";
        sessionStorage.setItem(FATA_STORAGE_KEY_CHALLENGE, challengeId);

        try {
            const token = await getAuthToken();
            if (!token) {
                alert(
                    "Veuillez vous connecter à XERA1 avant de lier votre compte Fata.",
                );
                const redirect =
                    window.location.pathname + window.location.search;
                window.location.href = `${getLoginPath()}?redirect=${encodeURIComponent(redirect)}`;
                return;
            }

            const response = await fetch(apiUrl("/api/auth/fata/start"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ challengeId }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            if (!data || !data.authUrl) {
                throw new Error("URL d'autorisation Fata invalide");
            }
            window.location.href = data.authUrl;
        } catch (error) {
            console.error("[Fata OIDC Error]:", error);
            alert(`Échec de démarrage de la connexion Fata: ${error.message}`);
            const connectBtn = document.querySelector(".fata-connect-btn");
            if (connectBtn) {
                connectBtn.disabled = false;
                connectBtn.textContent = "Connecter mon compte Fata";
            }
        }
    }

    async function checkFataStatus() {
        const token = await getAuthToken();
        if (!token) return null;

        try {
            const response = await fetch(apiUrl("/api/fata/status"), {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn("[Fata Status Error]:", error);
        }
        return null;
    }

    async function initFataUI() {
        const trigger = document.getElementById("nav-fata-btn");
        const panel = document.getElementById("fata-challenge-panel");
        const closeBtn = document.querySelector(".fata-close-btn");
        const connectBtn = document.querySelector(".fata-connect-btn");
        const authStatus = document.querySelector(".fata-auth-status");
        const authId = document.querySelector(".fata-auth-id");
        const authIcon = document.querySelector(".fata-auth-icon");
        const connectionNote = document.querySelector(".fata-connection-note");

        const urlParams = parseUrlParams();

        if (
            urlParams.fata === "success" ||
            urlParams.fata === "error" ||
            urlParams.challengeId
        ) {
            if (panel) {
                panel.classList.add("is-open");
                if (trigger) trigger.setAttribute("aria-expanded", "true");
            }
        }

        if (urlParams.fata === "error" && connectionNote) {
            connectionNote.hidden = false;
            connectionNote.textContent =
                urlParams.reason ||
                "La connexion Fata a échoué. Vous pouvez réessayer.";
        }

        if (trigger && panel) {
            trigger.setAttribute(
                "aria-expanded",
                String(panel.classList.contains("is-open")),
            );
            trigger.addEventListener("click", async function () {
                const status = await checkFataStatus();
                if (status && status.connected) {
                    const isOpen = panel.classList.toggle("is-open");
                    trigger.setAttribute("aria-expanded", String(isOpen));
                    return;
                }
                startFataOidcFlow();
            });
        }

        if (closeBtn && panel) {
            closeBtn.addEventListener("click", function () {
                panel.classList.remove("is-open");
                if (trigger) trigger.setAttribute("aria-expanded", "false");
            });
        }

        if (connectBtn) {
            connectBtn.addEventListener("click", function (e) {
                e.preventDefault();
                connectBtn.disabled = true;
                connectBtn.textContent = "Redirection vers Fata…";
                startFataOidcFlow();
            });
        }

        const statusData = await checkFataStatus();
        if (statusData && statusData.connected && statusData.linkage) {
            const username = statusData.linkage.preferred_username || "(compte lié)";
            const sub = statusData.linkage.fata_sub;

            if (authStatus) {
                authStatus.textContent = "Compte Fata connecté";
                authStatus.style.color = "var(--color-success, #10b981)";
            }
            if (authId) {
                authId.textContent = `@${username} (sub: ${sub.slice(0, 12)}…)`;
            }
            if (authIcon) {
                authIcon.classList.remove("is-pending");
                authIcon.classList.add("is-connected");
            }
            if (connectBtn) {
                connectBtn.textContent = "Relier mon compte Fata";
            }
            if (connectionNote) {
                connectionNote.hidden = false;
                connectionNote.textContent = "✓ Votre compte Fata est associé à XERA1. Vos preuves et jalons sont synchronisés.";
            }
        }
    }

    document.addEventListener("DOMContentLoaded", initFataUI);

    window.FataIntegration = {
        startFlow: startFataOidcFlow,
        checkStatus: checkFataStatus,
        initUI: initFataUI,
    };
})(window);
