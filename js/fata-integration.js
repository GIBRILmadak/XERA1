// FATA × XERA1 Frontend OIDC PKCE & UI Integration Module

(function (window) {
    "use strict";

    const FATA_STORAGE_KEY_CHALLENGE = "xera1_fata_challenge_id";
    const API_PROBE_TIMEOUT_MS = 800;
    const API_STATUS_TIMEOUT_MS = 3000;
    const API_START_TIMEOUT_MS = 25000;
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
                <div class="fata-arc-selection" hidden>
                    <h4>ARC du challenge</h4>
                    <p>Choisissez l’ARC qui servira pour les trois étapes. Cette sélection sera conservée pour ce challenge.</p>
                    <label class="fata-arc-select-label" for="fata-arc-select">Votre ARC</label>
                    <select id="fata-arc-select" class="form-input"></select>
                    <button type="button" class="fata-select-arc-btn" disabled>Choisir cet ARC</button>
                    <p class="fata-arc-note" aria-live="polite"></p>
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

    function persistChallengeId(challengeId) {
        const normalized = String(challengeId || "").trim();
        if (!normalized) return;
        try {
            sessionStorage.setItem(FATA_STORAGE_KEY_CHALLENGE, normalized);
        } catch (_) {
            // Session storage may be unavailable in some browser contexts; fail
            // softly so the Fata flow can continue with the current URL state.
        }
    }

    function parseUrlParams() {
        const search = window.location.search;
        const params = new URLSearchParams(search);
        const requestedChallengeId = params.get("challengeId");
        const resolvedChallengeId =
            requestedChallengeId ||
            sessionStorage.getItem(FATA_STORAGE_KEY_CHALLENGE);

        if (requestedChallengeId) {
            persistChallengeId(requestedChallengeId);
        }

        return {
            fata: params.get("fata"),
            challengeId: resolvedChallengeId,
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
        const challengeId = overrideChallengeId || urlParams.challengeId;
        if (!challengeId) {
            alert(
                "Ouvrez XERA1 depuis le challenge Fata avec « Continuer sur XERA1 » pour transmettre son identifiant.",
            );
            return;
        }
        persistChallengeId(challengeId);

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

    async function selectPublishedArc(arcId) {
        const challengeId = parseUrlParams().challengeId;
        if (!challengeId || !arcId) return { selected: false, skipped: true };

        const token = await getAuthToken();
        if (!token) return { selected: false, skipped: true };

        const response = await fetchApi("/api/fata/select-arc", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ challengeId, arcId }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return {
                selected: false,
                status: response.status,
                error: data.error || `HTTP ${response.status}`,
            };
        }

        const arcNote = document.querySelector(".fata-arc-note");
        if (arcNote) {
            arcNote.textContent = `✓ ${data.arc?.title || "ARC"} est associé au challenge Fata.`;
        }
        return { selected: true, arc: data.arc, selection: data.selection };
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
        const arcSelection = document.querySelector(".fata-arc-selection");
        const arcSelect = document.getElementById("fata-arc-select");
        const selectArcBtn = document.querySelector(".fata-select-arc-btn");
        const arcNote = document.querySelector(".fata-arc-note");

        const urlParams = parseUrlParams();
        if (urlParams.challengeId) {
            persistChallengeId(urlParams.challengeId);
        }

        if (
            urlParams.fata === "success" ||
            urlParams.fata === "error" ||
            urlParams.hasExplicitChallengeId
        ) {
            if (panel) {
                panel.classList.add("is-open");
                panel.setAttribute("aria-hidden", "false");
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
            panel.setAttribute(
                "aria-hidden",
                String(!panel.classList.contains("is-open")),
            );
            trigger.setAttribute(
                "aria-expanded",
                String(panel.classList.contains("is-open")),
            );
        }

        // Use delegation: the navigation hub can replace/rebuild its popover
        // after this script initializes, discarding listeners on its button.
        if (!window.__fataTriggerDelegateBound) {
            window.__fataTriggerDelegateBound = true;
            document.addEventListener(
                "click",
                function (event) {
                    const clickedTrigger = event.target?.closest?.(
                        "#nav-fata-btn, [data-fata-trigger]",
                    );
                    if (!clickedTrigger) return;

                    const activePanel =
                        document.getElementById("fata-challenge-panel") ||
                        createFataPanel();
                    event.preventDefault();
                    const isOpen = activePanel.classList.toggle("is-open");
                    activePanel.setAttribute("aria-hidden", String(!isOpen));
                    clickedTrigger.setAttribute(
                        "aria-expanded",
                        String(isOpen),
                    );
                    if (isOpen) window.XeraNavHub?.closeProfileHub?.();
                    if (isOpen) void refreshStatus();
                },
                true,
            );
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

        if (selectArcBtn && arcSelect) {
            arcSelect.addEventListener("change", () => {
                selectArcBtn.disabled = !arcSelect.value || arcSelect.disabled;
            });
            selectArcBtn.addEventListener("click", async () => {
                const challengeId = parseUrlParams().challengeId;
                if (!challengeId || !arcSelect.value) return;
                const token = await getAuthToken();
                if (!token) return;
                selectArcBtn.disabled = true;
                selectArcBtn.textContent = "Enregistrement…";
                try {
                    const response = await fetchApi("/api/fata/select-arc", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ challengeId, arcId: arcSelect.value }),
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
                    if (arcNote) arcNote.textContent = `✓ ${data.arc?.title || "ARC"} est sélectionné pour ce challenge.`;
                    arcSelect.disabled = true;
                    selectArcBtn.hidden = true;
                } catch (error) {
                    if (arcNote) arcNote.textContent = error.message || "La sélection n’a pas pu être enregistrée.";
                    selectArcBtn.disabled = !arcSelect.value;
                    selectArcBtn.textContent = "Réessayer";
                }
            });
        }

        async function refreshStatus() {
            const statusData = await checkFataStatus();
            if (!statusData?.connected || !statusData.linkage) {
                if (arcSelection) arcSelection.hidden = true;
                return;
            }

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

            if (arcSelection) {
                arcSelection.hidden = false;
                const challengeId = parseUrlParams().challengeId;
                if (!challengeId) {
                    if (arcNote) arcNote.textContent = "Ouvrez XERA1 depuis le challenge Fata avec le bouton « Continuer sur XERA1 » pour charger son contexte.";
                    if (arcSelect) arcSelect.disabled = true;
                    if (selectArcBtn) selectArcBtn.disabled = true;
                    return;
                }
                try {
                    const response = await fetchApi(
                        `/api/fata/arcs?challengeId=${encodeURIComponent(challengeId)}`,
                        { headers: { Authorization: `Bearer ${await getAuthToken()}` } },
                    );
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
                    if (arcSelect) {
                        arcSelect.replaceChildren();
                        const placeholder = document.createElement("option");
                        placeholder.value = "";
                        placeholder.textContent = "Sélectionnez un ARC conforme";
                        arcSelect.appendChild(placeholder);
                        for (const arc of data.arcs || []) {
                            const option = document.createElement("option");
                            option.value = arc.id;
                            option.textContent = `${arc.title || "ARC sans titre"} — ${arc.milestoneCount}/3 jalons${arc.eligible ? "" : " (à compléter)"}`;
                            option.disabled = !arc.eligible;
                            option.selected = Boolean(arc.selected);
                            arcSelect.appendChild(option);
                        }
                        const selected = Boolean(data.selection?.arc_id);
                        arcSelect.disabled = selected;
                        if (selectArcBtn) {
                            selectArcBtn.hidden = selected;
                            selectArcBtn.disabled = selected || !arcSelect.value;
                            selectArcBtn.textContent = "Choisir cet ARC";
                        }
                        if (arcNote) {
                            arcNote.textContent = selected
                                ? "Cet ARC est conservé pour le challenge. Une correction doit passer par le support XERA1."
                                : "Pour être sélectionnable, l’ARC doit être personnel, visible, avoir un titre, une description et trois jalons.";
                        }
                    }
                } catch (error) {
                    if (arcNote) arcNote.textContent = error.message || "Impossible de charger vos ARC.";
                }
            }

            const needsReconnect = (statusData.pendingEvents || []).some(
                (event) => event.status === "failed" && /link_revoked|authorization/i.test(event.last_error || ""),
            );
            if (needsReconnect && connectionNote) {
                connectionNote.textContent = "L’autorisation Fata a été retirée. Reliez à nouveau le même compte Fata pour reprendre les confirmations en attente.";
            }
        }

        if (panel?.classList.contains("is-open")) await refreshStatus();
    }

    const initialParams = parseUrlParams();
    if (initialParams.challengeId) {
        persistChallengeId(initialParams.challengeId);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initFataUI, { once: true });
    } else if (typeof document.getElementById === "function") {
        initFataUI();
    }

    window.FataIntegration = {
        startFlow: startFataOidcFlow,
        checkStatus: checkFataStatus,
        selectPublishedArc,
        initUI: initFataUI,
        resolveApiBaseUrl: getApiBaseUrl,
    };
})(window);
