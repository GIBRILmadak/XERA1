// FATA × XERA1 Frontend OIDC PKCE & UI Integration Module

(function (window) {
    "use strict";

    const FATA_STORAGE_KEY_CHALLENGE = "xera1_fata_challenge_id";
    const API_PROBE_TIMEOUT_MS = 800;
    const API_STATUS_TIMEOUT_MS = 3000;
    const API_START_TIMEOUT_MS = 6000;
    let apiBasePromise = null;
    let apiBaseError = null;
    let apiBaseErrorUntil = 0;
    let fataStatusPromise = null;

    function clearApiBaseError() {
        apiBaseError = null;
        apiBaseErrorUntil = 0;
    }

    function createFataPanel() {
        const panel = document.createElement("section");
        panel.id = "fata-challenge-panel";
        panel.className = "fata-challenge-panel";
        panel.setAttribute("aria-label", "Challenge Fata × XERA1");
        panel.innerHTML = `
            <div class="fata-panel-header">
                <div class="fata-panel-title-group">
                    <img src="icons/fata.webp" alt="Fata" class="fata-panel-logo">
                    <div>
                        <h3 class="fata-panel-title">Challenge Fata × XERA1</h3>
                        <p class="fata-panel-subtitle">Proof of Building & Progression</p>
                    </div>
                </div>
                <button type="button" class="fata-close-btn" aria-label="Fermer">&times;</button>
            </div>
            <div class="fata-panel-body">
                <div class="fata-auth-card">
                    <div class="fata-auth-header">
                        <div class="fata-auth-icon is-pending"><i class="fas fa-link"></i></div>
                        <div class="fata-auth-details">
                            <span class="fata-auth-status">Compte Fata non connecté</span>
                            <span class="fata-auth-id">Liez votre compte Fata pour synchroniser vos preuves.</span>
                        </div>
                    </div>
                    <button type="button" class="fata-connect-btn">Connecter mon compte Fata</button>
                    <p class="fata-connection-note" hidden></p>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        return panel;
    }

    async function probeApi(baseUrl) {
        const controller = new AbortController();
        const timer = setTimeout(
            () => controller.abort(),
            API_PROBE_TIMEOUT_MS,
        );
        try {
            const response = await fetch(`${baseUrl}/api/health`, {
                method: "GET",
                cache: "no-store",
                signal: controller.signal,
            });
            if (!response.ok) return false;
            const body = await response.json().catch(() => null);
            return body?.ok === true;
        } catch (_) {
            return false;
        } finally {
            clearTimeout(timer);
        }
    }

    async function resolveApiBaseUrl() {
        const configured = String(window.XERA_API_BASE_URL || "").trim();
        if (configured) return configured.replace(/\/+$/, "");

        const { hostname, port, protocol } = window.location;
        const isLocalHost = [
            "localhost",
            "127.0.0.1",
            "0.0.0.0",
            "::1",
            "[::1]",
        ].includes(
            hostname.toLowerCase(),
        );

        // En production, l'API est servie sur la même origine que le site,
        // sauf si XERA_API_BASE_URL fournit explicitement une autre origine.
        if (!isLocalHost) return "";

        // npm start sert le site et l'API ensemble. Détecter ce cas avant de
        // choisir le port de secours pour les serveurs statiques locaux.
        if (await probeApi(window.location.origin)) return "";

        const fallbackPort =
            String(window.XERA_LOCAL_API_PORT || "").trim() ||
            (port === "5502" ? "3000" : "5050");
        if (!/^\d{1,5}$/.test(fallbackPort)) {
            throw new Error("Le port local de l'API XERA1 est invalide.");
        }
        const apiHost =
            hostname === "0.0.0.0"
                ? "localhost"
                : hostname === "::1"
                  ? "[::1]"
                  : hostname;
        const fallbackBase = `${protocol}//${apiHost}:${fallbackPort}`;

        if (await probeApi(fallbackBase)) return fallbackBase;

        throw new Error(
            `API XERA1 introuvable. Démarre le serveur avec « npm start » et ouvre http://localhost:3000. Si tu utilises un serveur statique séparé, démarre aussi l'API et configure XERA_LOCAL_API_PORT (port actuel : ${fallbackPort}).`,
        );
    }

    function getApiBaseUrl() {
        const configured = String(window.XERA_API_BASE_URL || "").trim();
        if (configured) return Promise.resolve(configured.replace(/\/+$/, ""));
        if (apiBasePromise) return apiBasePromise;
        if (apiBaseError && Date.now() < apiBaseErrorUntil) {
            return Promise.reject(apiBaseError);
        }

        apiBasePromise = resolveApiBaseUrl()
            .catch((error) => {
                apiBaseError = error;
                apiBaseErrorUntil = Date.now() + 5000;
                throw error;
            })
            .finally(() => {
                apiBasePromise = null;
            });
        return apiBasePromise;
    }

    async function apiUrl(path) {
        return `${await getApiBaseUrl()}${path}`;
    }

    async function fetchApi(path, options = {}, timeoutMs = API_STATUS_TIMEOUT_MS) {
        const targetUrl = await apiUrl(path);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(targetUrl, {
                ...options,
                signal: controller.signal,
            });
        } catch (error) {
            if (error?.name === "AbortError") {
                throw new Error(
                    "Le serveur API XERA1 ne répond pas. Vérifie qu'il est démarré puis réessaie.",
                );
            }
            if (
                error instanceof TypeError ||
                /failed to fetch|networkerror/i.test(error?.message || "")
            ) {
                throw new Error(
                    `Impossible de joindre l'API XERA1 (${targetUrl}). Vérifie le serveur API et sa configuration réseau.`,
                );
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
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
        const requestedChallengeId = params.get("challengeId");
        return {
            fata: params.get("fata"),
            challengeId:
                requestedChallengeId ||
                sessionStorage.getItem(FATA_STORAGE_KEY_CHALLENGE),
            hasExplicitChallengeId: Boolean(requestedChallengeId),
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

            const response = await fetchApi("/api/auth/fata/start", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ challengeId }),
            }, API_START_TIMEOUT_MS);

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
        if (fataStatusPromise) return fataStatusPromise;

        const request = (async () => {
            const response = await fetchApi(
                "/api/fata/status",
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                },
                API_STATUS_TIMEOUT_MS,
            );
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    errorData.error || `HTTP ${response.status}`,
                );
            }
            return await response.json();
        })();
        fataStatusPromise = request
            .catch((error) => {
                console.warn("[Fata Status Error]:", error);
                return null;
            })
            .finally(() => {
                fataStatusPromise = null;
            });
        return fataStatusPromise;
    }

    async function initFataUI() {
        const trigger = document.getElementById("nav-fata-btn");
        const panel =
            document.getElementById("fata-challenge-panel") ||
            (trigger ? createFataPanel() : null);
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
            urlParams.hasExplicitChallengeId
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
            trigger.addEventListener("click", function (event) {
                event.preventDefault();
                const isOpen = panel.classList.toggle("is-open");
                trigger.setAttribute("aria-expanded", String(isOpen));
                if (isOpen) window.XeraNavHub?.closeProfileHub?.();
                if (isOpen) void refreshStatus();
            });
        }

        if (closeBtn && panel) {
            closeBtn.addEventListener("click", function () {
                panel.classList.remove("is-open");
                if (trigger) {
                    trigger.setAttribute("aria-expanded", "false");
                }
            });
        }

        if (connectBtn) {
            connectBtn.addEventListener("click", function (e) {
                e.preventDefault();
                clearApiBaseError();
                connectBtn.disabled = true;
                connectBtn.textContent = "Redirection vers Fata…";
                startFataOidcFlow();
            });
        }

        async function refreshStatus() {
            const statusData = await checkFataStatus();
            if (!statusData?.connected || !statusData.linkage) return;

            const username =
                statusData.linkage.preferred_username || "(compte lié)";
            const sub = statusData.linkage.fata_sub || "";

            if (authStatus) {
                authStatus.textContent = "Compte Fata connecté";
                authStatus.style.color = "var(--color-success, #10b981)";
            }
            if (authId) {
                authId.textContent = sub
                    ? `@${username} (sub: ${sub.slice(0, 12)}…)`
                    : `@${username}`;
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
                connectionNote.textContent =
                    "✓ Votre compte Fata est associé à XERA1. Vos preuves et jalons sont synchronisés.";
            }
        }

        if (panel?.classList.contains("is-open")) await refreshStatus();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initFataUI, { once: true });
    } else if (typeof document.getElementById === "function") {
        initFataUI();
    }

    window.FataIntegration = {
        startFlow: startFataOidcFlow,
        checkStatus: checkFataStatus,
        initUI: initFataUI,
        resolveApiBaseUrl: getApiBaseUrl,
    };
})(window);
