// FATA × XERA1 Frontend OIDC PKCE & UI Integration Module

(function (window) {
    "use strict";

    const FATA_STORAGE_KEY_CHALLENGE = "xera1_fata_challenge_id";
    const API_PROBE_TIMEOUT_MS = 800;
    const API_STATUS_TIMEOUT_MS = 3000;
    // Leave a small margin under the Vercel route's 60-second limit while
    // allowing a cold OIDC discovery, token request, and one Fata delivery.
    const API_SYNC_TIMEOUT_MS = 55000;
    // The Vercel API route has a 60-second execution limit. Leave enough time
    // for a cold start, Supabase auth lookup, and Fata's OIDC discovery call.
    const API_START_TIMEOUT_MS = 55000;
    let apiBasePromise = null;
    let apiBaseError = null;
    let apiBaseErrorUntil = 0;
    let fataStatusPromise = null;
    let fataSyncPromise = null;
    let celebrationDialog = null;
    let celebrationRestoreFocus = null;
    let celebrationClosing = false;
    let celebrationDismissedKey = "";
    let celebrationCurrentKey = "";
    let celebrationAuthenticatedUserId = "";
    let refreshFataPanelStatus = null;

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

    // Bind the menu action as soon as this script is evaluated. The profile
    // hub can rebuild its popover, and status initialization may fail while
    // the API is unavailable; neither should leave the challenge button inert.
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
                event.stopPropagation();
                activePanel.classList.add("is-open");
                activePanel.setAttribute("aria-hidden", "false");
                clickedTrigger.setAttribute("aria-expanded", "true");
                activePanel
                    .querySelector(".fata-close-btn")
                    ?.focus({ preventScroll: true });
                window.XeraNavHub?.closeProfileHub?.();
                void window.FataIntegration?.refreshPanelStatus?.();
            },
            true,
        );

        document.addEventListener("click", function (event) {
            if (!event.target?.closest?.("#fata-challenge-panel .fata-close-btn")) return;
            const panel = document.getElementById("fata-challenge-panel");
            panel?.classList.remove("is-open");
            panel?.setAttribute("aria-hidden", "true");
            document.querySelectorAll("#nav-fata-btn, [data-fata-trigger]").forEach((trigger) => {
                trigger.setAttribute("aria-expanded", "false");
            });
        });
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
                    "L’API XERA1 met trop de temps à répondre. Réessaie dans quelques instants.",
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
        let storedChallengeId = null;
        try {
            storedChallengeId = sessionStorage.getItem(
                FATA_STORAGE_KEY_CHALLENGE,
            );
        } catch (_) {
            // Storage can be disabled by browser privacy settings. The menu
            // and challenge panel must still initialize without it.
        }
        const resolvedChallengeId =
            requestedChallengeId || storedChallengeId;

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
        let storedSession = "";
        try {
            storedSession =
                localStorage.getItem("sb-ssbuagqwjptyhavinkxg-auth-token") || "";
        } catch (_) {
            return "";
        }
        try {
            return JSON.parse(storedSession).access_token || "";
        } catch (_) {
            return storedSession;
        }
    }

    async function startFataOidcFlow(overrideChallengeId) {
        const urlParams = parseUrlParams();
        const challengeId = overrideChallengeId || urlParams.challengeId;
        if (challengeId) persistChallengeId(challengeId);

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
                body: JSON.stringify(challengeId ? { challengeId } : {}),
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
                    cache: "no-store",
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

    function describeFataDeliveryFailure(lastError) {
        const detail = String(lastError || "");
        if (/not_registered/i.test(detail)) {
            return "Ce compte Fata n’est pas inscrit à ce challenge. Inscrivez le compte lié, puis contactez XERA1 pour relancer cette étape.";
        }
        if (/outside_window/i.test(detail)) {
            return "Fata a refusé cette action car sa date se trouve hors de la période du challenge.";
        }
        if (/receipt_deadline_passed/i.test(detail)) {
            return "Fata a refusé cette action car le délai de réception du challenge est dépassé.";
        }
        if (/link_revoked|authorization/i.test(detail)) {
            return "L’autorisation Fata a été retirée. Reliez de nouveau le même compte Fata pour reprendre les confirmations.";
        }
        if (/idempotency_conflict/i.test(detail)) {
            return "Fata a détecté un conflit sur une confirmation déjà envoyée. Contactez le support XERA1 avec la référence de l’événement.";
        }
        return detail
            ? `Fata a refusé une confirmation : ${detail}`
            : "Fata n’a pas accepté une confirmation. Contactez le support XERA1.";
    }

    function reportFataSyncResult(events, startedAt) {
        const recentEvents = (events || []).filter((event) => {
            const updatedAt = Date.parse(event.updated_at || "");
            return Number.isFinite(updatedAt) && updatedAt >= startedAt - 2000;
        });
        const failedEvent = recentEvents.find((event) => event.status === "failed");
        if (failedEvent) {
            const toast = window.ToastManager;
            if (typeof toast?.error === "function") {
                toast.error(
                    "Confirmation Fata refusée",
                    describeFataDeliveryFailure(failedEvent.last_error),
                );
            }
            return;
        }
        const retryEvent = recentEvents.find((event) => event.status === "retry");
        if (retryEvent) {
            const toast = window.ToastManager;
            if (typeof toast?.info === "function") {
                toast.info(
                    "Confirmation Fata en attente",
                    "L’action reste dans la file XERA1 et sera retentée automatiquement.",
                );
            }
        }
    }

    async function syncPendingActions() {
        if (fataSyncPromise) return fataSyncPromise;
        fataSyncPromise = (async () => {
            const token = await getAuthToken();
            if (!token) return { skipped: true };
            const statusData = await checkFataStatus();
            if (!statusData?.connected) return { skipped: true };

            const startedAt = Date.now();
            const response = await fetchApi(
                "/api/fata/sync",
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                },
                API_SYNC_TIMEOUT_MS,
            );
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(
                    result.error || `HTTP ${response.status}`,
                );
            }

            const pendingEvents = Array.isArray(result.pendingEvents)
                ? result.pendingEvents
                : [];
            reportFataSyncResult(pendingEvents, startedAt);
            handlePanelStatus({ ...statusData, pendingEvents });
            return { pendingEvents };
        })()
            .catch((error) => {
                console.warn("[Fata queue sync error]:", error);
                return { error };
            })
            .finally(() => {
                fataSyncPromise = null;
            });
        return fataSyncPromise;
    }

    function createCelebrationDialog() {
        if (celebrationDialog?.isConnected) return celebrationDialog;
        celebrationDialog = document.getElementById("fata-celebration-dialog");
        if (celebrationDialog) return celebrationDialog;

        const dialog = document.createElement("dialog");
        dialog.id = "fata-celebration-dialog";
        dialog.className = "fata-celebration-dialog";
        dialog.setAttribute("aria-labelledby", "fata-celebration-title");
        dialog.setAttribute("aria-describedby", "fata-celebration-message");
        dialog.innerHTML = `
            <div class="fata-celebration-confetti" aria-hidden="true"></div>
            <article class="fata-celebration-card">
                <div class="fata-celebration-glow" aria-hidden="true"></div>
                <button type="button" class="fata-celebration-close" aria-label="Fermer cette annonce">&times;</button>
                <div class="fata-celebration-eyebrow"><span aria-hidden="true"></span> CHALLENGE OFFICIEL VALIDÉ</div>
                <div class="fata-celebration-brands" aria-label="Fata et XERA1">
                    <div class="fata-celebration-brand"><img src="icons/fata.webp" alt="Fata"><span>Fata</span></div>
                    <span class="fata-celebration-times" aria-hidden="true">×</span>
                    <div class="fata-celebration-brand fata-celebration-brand--xera"><img src="icons/logo.png" alt=""><span>XERA1</span></div>
                </div>
                <div class="fata-celebration-check" aria-hidden="true">✓</div>
                <h2 id="fata-celebration-title">Bravo, challenge validé&nbsp;!</h2>
                <p id="fata-celebration-message" class="fata-celebration-message">
                    Votre challenge Fata est officiellement validé. Vous avez débloqué les avantages offerts par XERA1.
                </p>
                <div class="fata-celebration-rewards" aria-label="Avantages débloqués">
                    <div class="fata-celebration-reward">
                        <span class="fata-celebration-reward-icon" aria-hidden="true">✦</span>
                        <span class="fata-celebration-reward-copy"><strong>Badge officiel Fata</strong><small>Une distinction sur votre profil XERA1</small></span>
                        <span class="fata-celebration-unlocked">DÉBLOQUÉ</span>
                    </div>
                    <div class="fata-celebration-reward">
                        <span class="fata-celebration-multiplier" data-fata-visibility-value>×5</span>
                        <span class="fata-celebration-reward-copy"><strong>Visibilité XERA1 dans le feed</strong><small>Une visibilité renforcée pour vos publications</small></span>
                        <span class="fata-celebration-unlocked">DÉBLOQUÉ</span>
                    </div>
                </div>
                <button type="button" class="fata-celebration-cta">Découvrir le feed XERA1 <span aria-hidden="true">→</span></button>
                <p class="fata-celebration-footnote">Ces récompenses sont liées à votre compte XERA1.</p>
            </article>
        `;
        document.body.appendChild(dialog);
        celebrationDialog = dialog;

        dialog.addEventListener("cancel", (event) => {
            event.preventDefault();
            dismissCelebration(false);
        });
        dialog.addEventListener("click", (event) => {
            if (event.target === dialog) dismissCelebration(false);
        });
        dialog.querySelector(".fata-celebration-close")?.addEventListener(
            "click",
            () => dismissCelebration(false),
        );
        dialog.querySelector(".fata-celebration-cta")?.addEventListener(
            "click",
            () => dismissCelebration(true),
        );
        return dialog;
    }

    function addCelebrationConfetti(dialog) {
        const layer = dialog.querySelector(".fata-celebration-confetti");
        if (!layer) return;
        layer.replaceChildren();
        const colors = ["gold", "violet", "white"];
        for (let index = 0; index < 34; index += 1) {
            const piece = document.createElement("span");
            const color = colors[index % colors.length];
            piece.className = `fata-confetti-piece fata-confetti-piece--${color}`;
            piece.style.left = `${2 + Math.random() * 96}%`;
            piece.style.setProperty(
                "--fata-confetti-drift",
                `${Math.round((Math.random() - 0.5) * 150)}px`,
            );
            piece.style.setProperty(
                "--fata-confetti-duration",
                `${3.3 + Math.random() * 2.2}s`,
            );
            piece.style.setProperty(
                "--fata-confetti-delay",
                `${Math.random() * 1.1}s`,
            );
            piece.style.setProperty(
                "--fata-confetti-rotation",
                `${Math.round(240 + Math.random() * 720)}deg`,
            );
            layer.appendChild(piece);
        }
    }

    function presentCelebration(statusData) {
        if (statusData?.celebrationPending !== true || celebrationClosing) {
            return false;
        }

        const qualification = statusData.qualification || {};
        const userId = String(
            celebrationAuthenticatedUserId ||
            window.currentUser?.id ||
            window.currentUserId ||
            "session",
        );
        const challengeId = String(qualification.challenge_id || "official");
        const key = `${userId}:${challengeId}`;
        if (celebrationDismissedKey === key) return false;

        const dialog = createCelebrationDialog();
        if (dialog.open) return true;
        const multiplier = Number(qualification.visibility_multiplier);
        const multiplierLabel =
            Number.isFinite(multiplier) && multiplier > 0
                ? `×${Number.isInteger(multiplier) ? multiplier : multiplier.toFixed(1)}`
                : "×5";
        const multiplierNode = dialog.querySelector(
            "[data-fata-visibility-value]",
        );
        if (multiplierNode) multiplierNode.textContent = multiplierLabel;

        celebrationCurrentKey = key;
        celebrationRestoreFocus = document.activeElement;
        addCelebrationConfetti(dialog);
        dialog.showModal();
        dialog.querySelector(".fata-celebration-close")?.focus();
        return true;
    }

    function updateRewardStatus(statusData) {
        const qualification = statusData?.qualification;
        if (!qualification) return;

        const badgeStatus = document.querySelector("[data-fata-badge-status]");
        if (badgeStatus) {
            badgeStatus.textContent = qualification.badge_awarded
                ? "Badge officiel attribué sur votre profil."
                : "Offert après validation officielle du challenge.";
        }

        const visibilityStatus = document.querySelector(
            "[data-fata-visibility-status]",
        );
        if (visibilityStatus) {
            visibilityStatus.textContent = qualification.visibility_boost_active
                ? "Actif"
                : "À débloquer";
            visibilityStatus.classList.toggle(
                "status-badge--pending",
                !qualification.visibility_boost_active,
            );
            visibilityStatus.classList.toggle(
                "status-badge--success",
                Boolean(qualification.visibility_boost_active),
            );
        }

        const visibilityTitle = document.querySelector(
            "[data-fata-visibility-title]",
        );
        const multiplier = Number(qualification.visibility_multiplier);
        if (visibilityTitle && Number.isFinite(multiplier) && multiplier > 0) {
            const multiplierLabel = Number.isInteger(multiplier)
                ? multiplier
                : multiplier.toFixed(1);
            visibilityTitle.textContent = `Visibilité XERA1 ×${multiplierLabel} dans le feed`;
        }
    }

    async function acknowledgeCelebration() {
        const token = await getAuthToken();
        if (!token) return false;
        const response = await fetchApi(
            "/api/fata/celebration/seen",
            {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            },
            API_STATUS_TIMEOUT_MS,
        );
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        return true;
    }

    function dismissCelebration(goToFeed) {
        const dialog = celebrationDialog;
        if (!dialog?.open || celebrationClosing) return;

        const dismissedKey = celebrationCurrentKey;
        celebrationClosing = true;
        celebrationDismissedKey = dismissedKey;
        void acknowledgeCelebration().catch((error) => {
            console.warn("[Fata Celebration Acknowledge Error]:", error);
            if (celebrationDismissedKey === dismissedKey) {
                celebrationDismissedKey = "";
            }
        });
        dialog.classList.add("is-closing");

        const reduceMotion = window.matchMedia?.(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        window.setTimeout(() => {
            if (dialog.open) dialog.close();
            dialog.classList.remove("is-closing");
            dialog.querySelector(".fata-celebration-confetti")?.replaceChildren();
            celebrationClosing = false;
            if (celebrationRestoreFocus?.isConnected) {
                celebrationRestoreFocus.focus?.();
            }
            celebrationRestoreFocus = null;

            if (goToFeed) {
                document.getElementById("discover")?.scrollIntoView({
                    behavior: reduceMotion ? "auto" : "smooth",
                    block: "start",
                });
            }
        }, reduceMotion ? 0 : 220);
    }

    function handlePanelStatus(statusData) {
        updateRewardStatus(statusData);
        return presentCelebration(statusData);
    }

    async function checkCelebrationStatus() {
        return handlePanelStatus(await checkFataStatus());
    }

    function bindCelebrationAuthEvents() {
        if (window.__fataCelebrationAuthEventsBound) return;
        window.__fataCelebrationAuthEventsBound = true;
        const handleAuthenticated = (event) => {
            const userId = String(event.detail?.userId || "");
            if (userId && userId !== celebrationAuthenticatedUserId) {
                celebrationAuthenticatedUserId = userId;
                celebrationDismissedKey = "";
            }
            void checkCelebrationStatus();
            void syncPendingActions();
        };
        window.addEventListener("xera:user-authenticated", handleAuthenticated);
        window.addEventListener("online", () => {
            if (window.currentUser?.id || window.currentUserId) {
                void checkCelebrationStatus();
                void syncPendingActions();
            }
        });
    }

    async function selectPublishedArc(arcId) {
        if (!arcId) return { selected: false, skipped: true };

        const token = await getAuthToken();
        if (!token) return { selected: false, skipped: true };

        let challengeId = parseUrlParams().challengeId;
        if (!challengeId) {
            // Project creation can happen without opening the Fata panel first.
            // Resolve the configured challenge from the authenticated status
            // endpoint so the ARC is still associated with the official flow.
            const statusData = await checkFataStatus();
            if (!statusData?.connected) {
                return { selected: false, skipped: true };
            }
            challengeId = String(statusData.challengeId || "").trim();
            if (challengeId) persistChallengeId(challengeId);
        }
        if (!challengeId) {
            return {
                selected: false,
                skipped: false,
                error: "Le challenge Fata actif est introuvable. Ouvrez le panneau Fata et réessayez.",
            };
        }

        const response = await fetchApi("/api/fata/select-arc", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ challengeId, arcId }),
        }, API_SYNC_TIMEOUT_MS);
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
        return {
            selected: true,
            arc: data.arc,
            selection: data.selection,
            delivery: data.delivery || null,
        };
    }

    async function initFataUI() {
        createCelebrationDialog();
        bindCelebrationAuthEvents();
        if (!celebrationAuthenticatedUserId) {
            celebrationAuthenticatedUserId = String(
                window.currentUser?.id || window.currentUserId || "",
            );
        }

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
                    }, API_SYNC_TIMEOUT_MS);
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
                    if (arcNote) {
                        if (data.delivery?.status === "delivered") {
                            arcNote.textContent = `✓ ${data.arc?.title || "ARC"} a été transmis à Fata.`;
                        } else if (data.delivery?.status === "failed") {
                            arcNote.textContent = describeFataDeliveryFailure(
                                data.delivery.error,
                            );
                        } else {
                            arcNote.textContent = `✓ ${data.arc?.title || "ARC"} est sélectionné; sa confirmation reste dans la file XERA1.`;
                        }
                    }
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
            handlePanelStatus(statusData);
            const configuredChallengeId = String(
                statusData?.challengeId || "",
            ).trim();
            if (
                configuredChallengeId &&
                !parseUrlParams().hasExplicitChallengeId
            ) {
                persistChallengeId(configuredChallengeId);
            }
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
                    "✓ Votre compte Fata est associé à XERA1. Le statut des confirmations apparaît ici.";
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

            const latestFailure = (statusData.pendingEvents || [])
                .filter((event) => event.status === "failed")
                .sort((left, right) => Date.parse(right.updated_at || "") - Date.parse(left.updated_at || ""))[0];
            if (latestFailure && connectionNote) {
                connectionNote.textContent = describeFataDeliveryFailure(
                    latestFailure.last_error,
                );
            }
        }

        refreshFataPanelStatus = refreshStatus;

        if (panel?.classList.contains("is-open")) {
            await refreshStatus();
        } else if (await getAuthToken()) {
            // Covers pages where auth completed before this deferred or
            // navigation-loaded integration script was initialized.
            void checkCelebrationStatus();
            void syncPendingActions();
        }
    }

    const initialParams = parseUrlParams();
    if (initialParams.challengeId) {
        persistChallengeId(initialParams.challengeId);
    }

    // Bind before DOMContentLoaded so a fast auth restore cannot emit its
    // completion event before the celebration listener is ready.
    bindCelebrationAuthEvents();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initFataUI, { once: true });
    } else if (typeof document.getElementById === "function") {
        initFataUI();
    }

    window.FataIntegration = {
        startFlow: startFataOidcFlow,
        checkStatus: checkFataStatus,
        syncPendingActions,
        checkCelebrationStatus,
        handlePanelStatus,
        refreshPanelStatus: (...args) => refreshFataPanelStatus?.(...args),
        selectPublishedArc,
        initUI: initFataUI,
        resolveApiBaseUrl: getApiBaseUrl,
    };
})(window);
