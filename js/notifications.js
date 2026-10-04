/* ========================================
   SYSTÈME DE NOTIFICATIONS EN TEMPS RÉEL
   ======================================== */

let notificationChannel = null;
let notifications = [];
const NOTIF_PERMISSION_KEY = "xera1-notif-permission-requested";
function getPushSubscribeUrl() {
    if (typeof window === "undefined") return "/api/push/subscribe";

    const isLocalHost = ["localhost", "127.0.0.1"].includes(
        window.location.hostname,
    );
    return isLocalHost
        ? `${window.location.protocol}//${window.location.hostname}:5050/api/push/subscribe`
        : "/api/push/subscribe";
}
const VAPID_PUBLIC_KEY =
    (typeof window !== "undefined" && window.VAPID_PUBLIC_KEY) ||
    "BKWmLmM6lYCuTb/YPmxIdeWJvMNjI1QDi0Kc36PiTKmEfybk4wky7VxsM6H/lK3dUXl1WQNXAB1zCbiTNGckdhM=";
const RETURN_REMINDER_SLOTS_KEY = "xera1-return-reminder-slots";
const RETURN_REMINDER_HOURS = [10, 18];
const RETURN_REMINDER_WINDOW_MINUTES = 15;
const notifUserCache = new Map();
const notifStreamCache = new Map();
let swRegistration = null;
let pushSubscription = null;
let returnReminderTimer = null;
let pushMessageListenerBound = false;
let notificationsPollingTimer = null;
let notificationsRealtimeWarned = false;
let notificationOutsideClickBound = false;

function setNotificationNavBadgeCount(count) {
    const unreadCount = Math.max(0, Number(count) || 0);
    const badge = document.getElementById("notification-badge");
    const button = document.getElementById("notification-btn");
    const label = unreadCount > 0
        ? `${unreadCount} notification${unreadCount > 1 ? "s" : ""} non lue${unreadCount > 1 ? "s" : ""}`
        : "Notifications";

    if (badge) {
        badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount || "");
        badge.style.display = unreadCount > 0 ? "flex" : "none";
        badge.setAttribute("aria-hidden", "true");
    }
    if (button) {
        button.classList.toggle("has-unread", unreadCount > 0);
        button.setAttribute("aria-label", label);
        button.title = label;
    }
}

// Initialiser les notifications
async function initializeNotifications() {
    if (!currentUser) return;

    // Charger les notifications existantes
    await loadNotifications();
    // Synchroniser et remettre à zéro le badge côté serveur lorsque l'utilisateur ouvre l'application
    try {
        await resetServerBadge();
    } catch (e) {
        // ignore
    }

    // S'abonner aux nouvelles notifications en temps réel
    subscribeToNotifications();

    // Mettre à jour le badge
    updateNotificationBadge();
    bindNotificationPanelOutsideClick();

    // Afficher un CTA type YouTube pour déclencher la demande via geste utilisateur
    renderNotificationPermissionCTA();

    // Enregistrer le service worker / push uniquement si déjà autorisé
    setupPushNotifications();
    startNotificationsPollingFallback();
    if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
    ) {
        scheduleReturnReminder();
    }
}

// Enregistrer le SW + abonnement push
async function setupPushNotifications() {
    if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
    ) {
        return;
    }
    if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.includes("REMPLACEZ")) {
        console.warn(
            "VAPID_PUBLIC_KEY manquante. Configurez js/push-config.js pour activer le push.",
        );
        return;
    }

    try {
        swRegistration =
            swRegistration ||
            (await navigator.serviceWorker.register("/sw.js", {
                scope: "/",
            }));
        swRegistration = await navigator.serviceWorker.ready;

        // Si le SW a été mis à jour, conserver la clé publique pour resubscribe
        const targetWorker =
            swRegistration?.active ||
            swRegistration?.waiting ||
            swRegistration?.installing ||
            null;
        if (targetWorker) {
            targetWorker.postMessage({
                type: "SET_VAPID",
                publicKey: VAPID_PUBLIC_KEY,
            });
        }

        // Ne pas forcer la demande ici : on attend le geste utilisateur (CTA)
        if (Notification.permission !== "granted") return;

        pushSubscription =
            pushSubscription ||
            (await swRegistration.pushManager.getSubscription());

        if (!pushSubscription) {
            const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
            pushSubscription = await swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: appServerKey,
            });
        }

        if (pushSubscription) {
            await sendSubscriptionToServer(pushSubscription);
        }

        // Planifier les rappels quotidiens à 10h et 18h (heure locale)
        scheduleReturnReminder();

        // Écoute les messages envoyés par le SW (resubscribe + badge updates)
        if (!pushMessageListenerBound) {
            navigator.serviceWorker.addEventListener(
                "message",
                async (event) => {
                    try {
                        if (event.data?.type === "PUSH_SUBSCRIPTION_REFRESH") {
                            pushSubscription = event.data.subscription;
                            await sendSubscriptionToServer(pushSubscription);
                            return;
                        }
                        if (event.data?.type === "PUSH_BADGE") {
                            const badgeVal = event.data.badge;
                            try {
                                const n = Number(badgeVal);
                                // Update app-level badge via Badging API when supported
                                if (typeof navigator !== "undefined") {
                                    if (
                                        Number.isFinite(n) &&
                                        n > 0 &&
                                        "setAppBadge" in navigator
                                    ) {
                                        try {
                                            await navigator.setAppBadge(n);
                                        } catch (e) {}
                                    } else if ("clearAppBadge" in navigator) {
                                        try {
                                            await navigator.clearAppBadge();
                                        } catch (e) {}
                                    }
                                }

                                // Update the navigation indicator as a fallback.
                                setNotificationNavBadgeCount(n);
                            } catch (e) {
                                // ignore
                            }
                            return;
                        }
                    } catch (e) {
                        // ignore handler errors
                    }
                },
            );
            pushMessageListenerBound = true;
        }
    } catch (error) {
        console.warn("Push setup failed:", error);
    }
}

// Charger les notifications existantes
async function loadNotifications() {
    try {
        const { data, error } = await supabase
            .from("notifications")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("created_at", { ascending: false })
            .limit(50);

        if (error) throw error;

        notifications = normalizeNotifications(data || []);
        await hydrateNotificationMetadata(notifications);
        updateNotificationBadge();
    } catch (error) {
        console.error("Erreur chargement notifications:", error);
    }
}

// S'abonner aux notifications en temps réel
function subscribeToNotifications() {
    if (!currentUser) return;

    if (notificationChannel) {
        supabase.removeChannel(notificationChannel);
        notificationChannel = null;
    }

    // Créer un canal de notifications
    notificationChannel = supabase
        .channel(`notifications-${currentUser.id}-${Date.now()}`)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "notifications",
                filter: `user_id=eq.${currentUser.id}`,
            },
            (payload) => {
                handleNewNotification(payload.new);
            },
        )
        .subscribe((status) => {
            if (status === "CHANNEL_ERROR" && !notificationsRealtimeWarned) {
                notificationsRealtimeWarned = true;
                console.warn(
                    "Notifications realtime indisponibles. Fallback actif (vérifiez la publication realtime de notifications).",
                );
            }
        });
}

// Gérer une nouvelle notification
function handleNewNotification(notification) {
    const normalized = normalizeNotification(notification);
    const shouldQuietLiveChat =
        shouldQuietVisibleLiveChatNotification(normalized);
    if (shouldQuietLiveChat) {
        normalized.read = true;
    }
    notifications.unshift(normalized);
    hydrateNotificationMetadata([normalized])
        .catch(() => {})
        .finally(() => {
            if (!shouldQuietLiveChat) {
                showNotificationToast(normalized);
                showBrowserNotification(normalized);
                playNotificationSound(normalized.type);
            } else {
                void markNotificationAsReadSilently(normalized.id);
            }
        });

    // Mettre à jour le badge
    updateNotificationBadge();
}

// Afficher un toast de notification
function showNotificationToast(notification) {
    if (!notification) return;

    const title = getNotificationTitle(notification);
    const message = notification.message || "";
    const actor = notification.actor;
    const type = [
        "encouragement",
        "peer_validation",
        "peer_validation_high",
        "support",
        "follow",
    ].includes(notification.type)
        ? "success"
        : "info";

    if (window.ToastManager && typeof window.ToastManager.show === "function") {
        window.ToastManager.show(title, message, type, 6000);
        return;
    }

    // Fallback legacy toast if ToastManager is unavailable
    const toast = document.createElement("div");
    toast.className = "toast show";
    toast.innerHTML = `
        ${renderNotificationAvatar(actor, title, "toast")}
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close"><i class="fas fa-times"></i></button>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 5000);

    toast.querySelector(".toast-close").addEventListener("click", (e) => {
        e.stopPropagation();
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    });
}

function escapeNotificationHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getNotificationInitials(actor, fallback = "X") {
    const name = String(actor?.name || actor?.username || fallback).trim();
    return (
        name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase() || "X"
    );
}

function renderNotificationAvatar(actor, fallbackName, variant = "panel") {
    const name =
        actor?.name || actor?.username || fallbackName || "Membre XERA";
    const avatar = String(actor?.avatar || actor?.avatar_url || "").trim();
    const className =
        variant === "toast"
            ? "notification-toast-avatar"
            : "notification-avatar";

    if (avatar) {
        return `<img class="${className}" src="${escapeNotificationHtml(avatar)}" alt="Avatar de ${escapeNotificationHtml(name)}" loading="lazy" />`;
    }

    return `<div class="${className} notification-avatar-fallback" aria-hidden="true">${escapeNotificationHtml(getNotificationInitials(actor, name))}</div>`;
}

// Obtenir l'icône selon le type de notification
function getNotificationIcon(type) {
    const icons = {
        support: '<i class="fas fa-gem"></i>',
        follow: '<i class="fas fa-rocket"></i>',
        arc_follow: '<i class="fas fa-thumbtack"></i>',
        new_update: '<i class="fas fa-edit"></i>',
        new_arc: '<i class="fas fa-drafting-compass"></i>',
        stream: '<i class="fas fa-circle" style="color:red"></i>',
        live_start: '<i class="fas fa-circle" style="color:red"></i>',
        encouragement: '<i class="fas fa-magic"></i>',
        peer_validation: '<i class="fas fa-handshake"></i>',
        peer_validation_high: '<i class="fas fa-fire"></i>',
        announcement_reply: '<i class="fas fa-comments"></i>',
        collaboration: '<i class="fas fa-handshake"></i>',
        like: '<i class="fas fa-heart"></i>',
        comment: '<i class="fas fa-comment"></i>',
        live_chat: '<i class="fas fa-comment"></i>',
        mention: '<i class="fas fa-at"></i>',
        achievement: '<i class="fas fa-trophy"></i>',
    };
    return icons[type] || '<i class="fas fa-bell"></i>';
}

// Obtenir le titre de la notification (Optimisé Neuro-Psychologie: Identité & Statut)
function getNotificationTitle(notification) {
    const titles = {
        support: window.t ? window.t("notifications.newSupport", {}, "Soutien reçu") : "Soutien reçu",
        follow: window.t ? window.t("notifications.newFollower", {}, "Nouvelle connexion") : "Nouvelle connexion",
        arc_follow: window.t ? window.t("profile.activeArcs", {}, "Projet suivi") : "Projet suivi",
        new_update: window.t ? window.t("discover.publishUpdate", {}, "Mise à jour d'ARC") : "Mise à jour d'ARC",
        new_arc: window.t ? window.t("profile.createNewArc", {}, "Nouveau chantier lancé") : "Nouveau chantier lancé",
        stream: window.t ? window.t("stream.liveActive", {}, "Live en cours") : "Live en cours",
        live_start: window.t ? window.t("stream.liveActive", {}, "Live en cours") : "Live en cours",
        encouragement: "Boost d'énergie",
        peer_validation: "Validation par un pair",
        peer_validation_high: "⚡️ SIGNAL HAUT DÉTECTÉ",
        announcement_reply: "Réponse reçue",
        collaboration: "Opportunité de duo",
        like: window.t ? window.t("notifications.newLike", {}, "Approbation") : "Approbation",
        comment: window.t ? window.t("notifications.newComment", {}, "Feedback reçu") : "Feedback reçu",
        live_chat: "Message en direct",
        mention: "Tu as été cité",
        achievement: "Palier franchi",
    };
    return titles[notification.type] || "XERA1";
}

function getCurrentPageStreamId() {
    try {
        const currentUrl = new URL(window.location.href);
        return currentUrl.searchParams.get("id");
    } catch (error) {
        return null;
    }
}

function shouldQuietVisibleLiveChatNotification(notification) {
    if (notification?.type !== "live_chat") return false;
    if (typeof document !== "undefined" && document.hidden) return false;

    const pathname = String(window.location.pathname || "");
    if (
        !pathname.endsWith("/stream.html") &&
        !pathname.endsWith("stream.html")
    ) {
        return false;
    }

    const notificationStreamId = extractStreamId(notification?.link || "");
    const currentStreamId = getCurrentPageStreamId();
    return Boolean(
        notificationStreamId &&
        currentStreamId &&
        notificationStreamId === currentStreamId,
    );
}

async function markNotificationAsReadSilently(notificationId) {
    if (!notificationId || !currentUser) return;
    try {
        await supabase
            .from("notifications")
            .update({ read: true })
            .eq("id", notificationId)
            .eq("user_id", currentUser.id);
    } catch (error) {
        console.warn("Impossible de marquer la notification comme lue", error);
    }
}

// Demander la permission de notifications navigateur (non bloquant)
function requestBrowserNotificationPermission(force = false) {
    if (typeof window === "undefined" || typeof Notification === "undefined")
        return;
    if (Notification.permission === "granted") return;
    const alreadyAsked = localStorage.getItem(NOTIF_PERMISSION_KEY) === "1";
    if (Notification.permission === "denied") return; // respect user choice
    if (alreadyAsked && !force) return;
    try {
        Notification.requestPermission().then((res) => {
            localStorage.setItem(NOTIF_PERMISSION_KEY, "1");
            if (res !== "granted") {
                console.info("Notifications navigateur non autorisées.");
            } else {
                setupPushNotifications();
                scheduleReturnReminder();
            }
        });
    } catch (e) {
        console.warn("Notification permission request failed", e);
    }
}

// CTA léger pour inviter l'utilisateur à autoriser les notifications (YouTube-like)
function renderNotificationPermissionCTA() {
    if (typeof window === "undefined" || typeof Notification === "undefined")
        return;
    const alreadyAsked = localStorage.getItem(NOTIF_PERMISSION_KEY) === "1";
    if (
        Notification.permission === "granted" ||
        Notification.permission === "denied"
    )
        return;
    if (alreadyAsked) return;

    const anchor =
        document.getElementById("notification-btn") ||
        document.querySelector(".nav-actions") ||
        document.body;
    if (!anchor) return;

    // Avoid duplicate banner
    if (document.getElementById("notif-permission-cta")) return;

    const cta = document.createElement("div");
    cta.id = "notif-permission-cta";
    cta.style.cssText =
        "position:fixed; top:calc(env(safe-area-inset-top, 0px) + 76px); right:14px; left:14px; max-width:360px; margin:0 auto; z-index:1200; background:var(--surface-color, #111); color:var(--text-primary, #fff); border:1px solid var(--border-color, rgba(255,255,255,0.12)); box-shadow:0 12px 30px rgba(0,0,0,0.25); border-radius:14px; padding:12px 14px; display:flex; gap:10px; align-items:flex-start;";
    cta.innerHTML = `
        <div style="flex-shrink:0; width:34px; height:34px; border-radius:10px; background:linear-gradient(135deg, #6366f1, #8b5cf6); display:flex; align-items:center; justify-content:center; font-size:17px;">🔔</div>
        <div style="flex:1; min-width:0;">
            <div style="font-weight:700; margin-bottom:4px;">Activer les notifications</div>
            <div style="color:var(--text-secondary, #b5b5c3); font-size:0.84rem; line-height:1.3;">Nouveaux lives, réponses et encouragements.</div>
            <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
                <button id="notif-cta-allow" class="btn-verify" style="padding:7px 11px; border:none; border-radius:10px; background:#10b981; color:#fff; cursor:pointer;">Autoriser</button>
                <button id="notif-cta-later" class="btn-ghost" style="padding:7px 11px; border:1px solid var(--border-color, rgba(255,255,255,0.15)); border-radius:10px; background:transparent; color:var(--text-secondary, #b5b5c3); cursor:pointer;">Plus tard</button>
            </div>
        </div>
    `;

    document.body.appendChild(cta);

    const closeCta = () => {
        cta.remove();
    };

    const allowBtn = document.getElementById("notif-cta-allow");
    const laterBtn = document.getElementById("notif-cta-later");

    if (allowBtn) {
        allowBtn.addEventListener("click", async () => {
            localStorage.setItem(NOTIF_PERMISSION_KEY, "1");
            const perm = await Notification.requestPermission();
            if (perm === "granted") {
                // Inscrire au push dès l'acceptation
                setupPushNotifications();
                ToastManager?.success(
                    "Notifications activées",
                    "Nous vous avertirons directement sur votre apparei.",
                );
            }
            closeCta();
        });
    }

    if (laterBtn) {
        laterBtn.addEventListener("click", () => {
            cta.style.opacity = "0";
            setTimeout(closeCta, 120);
        });
    }
}

// Afficher une notification navigateur (lorsque l'onglet est ouvert)
function showBrowserNotification(notification) {
    if (typeof window === "undefined" || typeof Notification === "undefined")
        return;
    if (Notification.permission !== "granted") return;

    const title = getNotificationTitle(notification);
    const body = notification.message || "";
    const icon = "icons/logo.png";
    const link = normalizeNotificationLink(notification);
    showDeviceNotification({
        title,
        body,
        icon,
        tag: notification.id,
        link,
        renotify: false,
        silent: false,
    }).catch((e) => {
        console.warn("Browser notification error:", e);
    });
}

async function showDeviceNotification({
    title = "XERA1",
    body = "",
    icon = "icons/logo.png",
    tag = undefined,
    link = "",
    renotify = false,
    silent = false,
} = {}) {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
        return false;
    }
    if (Notification.permission !== "granted") return false;

    const normalizedLink = String(link || "");
    const options = {
        body,
        icon,
        badge: icon,
        tag,
        renotify: !!renotify,
        silent: !!silent,
        data: { link: normalizedLink },
    };

    try {
        if ("serviceWorker" in navigator) {
            const reg = await navigator.serviceWorker.ready;
            if (reg && typeof reg.showNotification === "function") {
                await reg.showNotification(title, options);
                return true;
            }
        }
    } catch (swError) {
        console.warn("Service worker notification error:", swError);
    }

    try {
        const n = new Notification(title, options);
        n.onclick = () => {
            try {
                window.focus();
                if (normalizedLink) {
                    window.location.href = normalizedLink;
                }
            } finally {
                n.close();
            }
        };
        return true;
    } catch (notificationError) {
        console.warn("Window notification error:", notificationError);
        return false;
    }
}

function loadReminderSlots() {
    try {
        const parsed = JSON.parse(
            localStorage.getItem(RETURN_REMINDER_SLOTS_KEY) || "{}",
        );
        if (!parsed || typeof parsed !== "object") return {};
        return parsed;
    } catch (e) {
        return {};
    }
}

function saveReminderSlots(slots) {
    try {
        localStorage.setItem(
            RETURN_REMINDER_SLOTS_KEY,
            JSON.stringify(slots || {}),
        );
    } catch (e) {
        // ignore storage failures
    }
}

function formatLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getReminderSlotKey(date) {
    const hour = date.getHours();
    const minute = date.getMinutes();
    if (!RETURN_REMINDER_HOURS.includes(hour)) return null;
    if (minute < 0 || minute >= RETURN_REMINDER_WINDOW_MINUTES) return null;
    return `${formatLocalDateKey(date)}-${String(hour).padStart(2, "0")}`;
}

function getNextReminderDate(fromDate = new Date()) {
    const now = new Date(fromDate);
    const candidates = RETURN_REMINDER_HOURS.map((hour) => {
        const candidate = new Date(now);
        candidate.setHours(hour, 0, 0, 0);
        if (candidate <= now) {
            candidate.setDate(candidate.getDate() + 1);
        }
        return candidate;
    }).sort((a, b) => a.getTime() - b.getTime());
    return candidates[0] || null;
}

// Rappel quotidien pour revenir sur XERA1 (Géré côté serveur via Push pour plus de fiabilité)
function scheduleReturnReminder() {
    // Cette fonction locale est conservée uniquement pour les rappels immédiats si l'onglet est ouvert,
    // mais le vrai travail est maintenant fait par le serveur via Web Push (background).
    console.log("Rappels programmés actifs (Relié au serveur Web Push)");
}

async function showReturnReminderNotification(reminderDate = new Date()) {
    const hour = reminderDate.getHours();
    const isMorning = hour < 14;

    // Neuro-Psychologie : Framing d'identité et de momentum
    const title = isMorning ? "XERA1 • L'Intention" : "XERA1 • La Trace";

    const body = isMorning
        ? "Quelle est ta micro-victoire d'aujourd'hui ? Fixe l'intention."
        : "Ne laisse pas ton momentum s'éteindre. Documente ta progression.";

    const link = currentUser?.id
        ? typeof window.buildProfileUrl === "function"
            ? window.buildProfileUrl(currentUser.id)
            : `profile?user=${currentUser.id}`
        : "index.html";
    await showDeviceNotification({
        title,
        body,
        icon: "icons/logo.png",
        tag: `xera1-return-reminder-${String(hour).padStart(2, "0")}`,
        link,
        renotify: false,
        silent: false,
    });
}

// Mettre à jour le badge de notifications
function updateNotificationBadge() {
    const unreadCount = notifications.filter((n) => !n.read).length;
    setNotificationNavBadgeCount(unreadCount);

    // Try to update the native app badge (Badging API) when supported
    try {
        if (typeof navigator !== "undefined") {
            if (unreadCount > 0 && "setAppBadge" in navigator) {
                navigator.setAppBadge(unreadCount).catch(() => {});
            } else if ("clearAppBadge" in navigator) {
                navigator.clearAppBadge && navigator.clearAppBadge();
            }
        }
    } catch (e) {
        // ignore
    }
}

// Appel au serveur pour remettre à zéro le compteur de badge
async function resetServerBadge() {
    try {
        const { data: { session } = {} } = await supabase.auth.getSession();
        const token = session?.access_token || null;
        if (!token) return;

        // Skip if running on a simple dev server without backend
        if (
            window.location.hostname === "127.0.0.1" ||
            window.location.hostname === "localhost"
        ) {
            const isBackendMissing = true; // Assume no backend on simple Live Server
            if (isBackendMissing) return;
        }

        await fetch("/api/notifications/badge-reset", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            credentials: "include",
        });

        // Clear the native badge locally as well
        try {
            if ("clearAppBadge" in navigator) {
                await navigator.clearAppBadge();
            } else if ("setAppBadge" in navigator) {
                await navigator.setAppBadge(0);
            }
        } catch (e) {
            // ignore
        }
    } catch (e) {
        // ignore
    }
}

// Afficher le panneau de notifications
function toggleNotificationPanel() {
    const panel = document.getElementById("notification-panel");
    if (!panel) return;

    const isVisible = panel.classList.contains("show");

    if (isVisible) {
        closeNotificationPanel();
    } else {
        panel.classList.add("show");
        renderNotifications();
        bindNotificationPanelOutsideClick();
        void clearUnreadNotificationsOnPanelOpen();
    }
}

function closeNotificationPanel() {
    const panel = document.getElementById("notification-panel");
    if (panel) {
        panel.classList.remove("show");
    }
}

function bindNotificationPanelOutsideClick() {
    if (notificationOutsideClickBound || typeof document === "undefined") {
        return;
    }

    document.addEventListener("click", (event) => {
        const panel = document.getElementById("notification-panel");
        if (!panel || !panel.classList.contains("show")) return;

        const notificationButton = document.getElementById("notification-btn");
        const clickedInsidePanel = panel.contains(event.target);
        const clickedNotificationButton =
            notificationButton && notificationButton.contains(event.target);

        if (!clickedInsidePanel && !clickedNotificationButton) {
            closeNotificationPanel();
        }
    });

    notificationOutsideClickBound = true;
}

async function clearUnreadNotificationsOnPanelOpen() {
    const unreadNotifications = notifications.filter((notif) => !notif.read);
    if (unreadNotifications.length === 0) return;

    unreadNotifications.forEach((notif) => {
        notif.read = true;
    });
    updateNotificationBadge();
    renderNotifications();

    try {
        await supabase
            .from("notifications")
            .update({ read: true })
            .eq("user_id", currentUser.id)
            .eq("read", false);
        await resetServerBadge();
    } catch (error) {
        console.error("Erreur remise à zéro badge notifications:", error);
    }
}

// Rendre les notifications dans le panneau
function renderNotifications() {
    const container = document.getElementById("notification-list");
    if (!container) return;

    if (notifications.length === 0) {
        const emptyText = window.t ? window.t("notifications.noNotifications", {}, "Aucune notification pour l'instant") : "Aucune notification pour l'instant";
        container.innerHTML = `
            <div class="notification-empty">
                <p>${emptyText}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = notifications
        .map((notif) => {
            const displayName =
                notif.actor?.name || getNotificationTitle(notif);
            return `
        <div class="notification-item ${notif.read ? "" : "unread"}" data-type="${escapeNotificationHtml(notif.type)}" onclick="handleNotificationClick('${escapeNotificationHtml(notif.id)}')">
            <div class="notification-leading">
                ${renderNotificationAvatar(notif.actor, displayName)}
            </div>
            <div class="notification-content">
                <div class="notification-title">${escapeNotificationHtml(getNotificationTitle(notif))}</div>
                <div class="notification-message">${escapeNotificationHtml(notif.message)}</div>
                <div class="notification-meta">
                    <span class="notification-time">${formatNotificationTime(notif.created_at)}</span>
                    ${displayName ? `<span class="notification-actor">${escapeNotificationHtml(displayName)}</span>` : ""}
                </div>
            </div>
        </div>
    `;
        })
        .join("");
}

// Gérer le clic sur une notification
async function handleNotificationClick(notificationId) {
    try {
        // Marquer comme lue
        await supabase
            .from("notifications")
            .update({ read: true })
            .eq("id", notificationId);

        // Mettre à jour localement
        const notif = notifications.find((n) => n.id === notificationId);
        if (notif) {
            notif.read = true;
            updateNotificationBadge();
            renderNotifications();
        }

        // Fermer le panneau
        closeNotificationPanel();

        // Naviguer vers la ressource liée (optionnel)
        const targetLink = notif ? normalizeNotificationLink(notif) : null;
        if (targetLink) {
            window.location.href = targetLink;
        }
    } catch (error) {
        console.error("Erreur marquage notification:", error);
    }
}

// Marquer toutes les notifications comme lues
async function markAllNotificationsAsRead() {
    try {
        await supabase
            .from("notifications")
            .update({ read: true })
            .eq("user_id", currentUser.id)
            .eq("read", false);

        notifications.forEach((n) => (n.read = true));
        updateNotificationBadge();
        renderNotifications();
    } catch (error) {
        console.error("Erreur marquage notifications:", error);
    }
}

// Formater le temps de la notification
function formatNotificationTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "À l'instant";
    if (minutes < 60) return `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days < 7) return `Il y a ${days}j`;

    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// Jouer un son de notification (Optimisé Neuro : Fréquences de récompense)
function playNotificationSound(type = "default") {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const audioContext = new AudioCtx();

        // Fréquences harmoniques pour stimuler la dopamine (C5, E5, G5)
        let pattern = [760];
        if (type === "encouragement" || type === "support") {
            pattern = [523.25, 659.25, 783.99]; // Accord de Do majeur (C-E-G)
        } else if (type === "peer_validation_high" || type === "achievement") {
            pattern = [659.25, 830.61, 987.77, 1318.51]; // Accord de Mi majeur montant
        }

        const now = audioContext.currentTime;

        pattern.forEach((frequency, index) => {
            const startAt = now + index * 0.08;
            const stopAt = startAt + 0.12;
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.type = "sine";
            oscillator.frequency.value = frequency;

            // Enveloppe ADSR simplifiée pour un son "premium"
            gainNode.gain.setValueAtTime(0.0001, startAt);
            gainNode.gain.exponentialRampToValueAtTime(0.25, startAt + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, stopAt);

            oscillator.start(startAt);
            oscillator.stop(stopAt);
        });

        setTimeout(() => {
            if (audioContext && typeof audioContext.close === "function") {
                audioContext.close().catch(() => {});
            }
        }, 1000);
    } catch (error) {
        // Ignorer les erreurs de son
    }
}

// Créer une notification (fonction utilitaire)
async function createNotification(userId, type, message, link = null) {
    // First attempt: client-side insert (fast path)
    try {
        const { data, error } = await supabase
            .from("notifications")
            .insert({
                user_id: userId,
                type: type,
                message: message,
                link: link,
                read: false,
            })
            .select()
            .single();

        if (!error) return { success: true, data };

        // If error looks like permission / RLS issue, fall through to server fallback
        console.warn(
            "Client notification insert error, falling back to server:",
            error.message || error,
        );
    } catch (err) {
        console.warn(
            "Client notification insert failed, will fallback to server:",
            err?.message || err,
        );
    }

    // Fallback: ask server to create the notification using server privileges
    try {
        const res = await fetch("/api/notifications/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, type, message, link }),
        });
        const json = await res.json();
        if (res.ok && json?.success) return { success: true, data: json.data };
        console.error("Server fallback notification failed:", json);
        return {
            success: false,
            error: json?.error || "Server fallback failed",
        };
    } catch (err) {
        console.error("Erreur création notification (server fallback):", err);
        return { success: false, error: err?.message || String(err) };
    }
}

/**
 * Notifie les utilisateurs ou pages mentionnés dans un texte (@mention)
 */
async function notifyMentions(text, contentId, senderId, senderName) {
    if (!text || !senderId) return;

    // Pattern pour capturer les mentions (@nom)
    const mentionPattern = /(^|\s)@([a-zA-Z0-9À-ÖØ-öø-ÿ_-]+)/g;
    const matches = Array.from(text.matchAll(mentionPattern));
    if (matches.length === 0) return;

    const uniqueMentions = new Set(matches.map((m) => m[2]));
    const link = `index.html?content=${contentId}`;

    for (const mention of uniqueMentions) {
        try {
            // 1. Chercher un utilisateur par username
            const { data: user } = await supabase
                .from("users")
                .select("id")
                .eq("username", mention)
                .maybeSingle();

            if (user && user.id !== senderId) {
                await createNotification(
                    user.id,
                    "mention",
                    `${senderName} vous a mentionné dans une publication.`,
                    link,
                );
                continue;
            }

            // 2. Chercher une page pro par slug
            const { data: page } = await supabase
                .from("professional_pages")
                .select("id, owner_id, name")
                .eq("slug", mention)
                .maybeSingle();

            if (page && page.owner_id !== senderId) {
                await createNotification(
                    page.owner_id,
                    "mention",
                    `${senderName} a mentionné votre page "${page.name}" dans une publication.`,
                    link,
                );
            }
        } catch (err) {
            console.warn(
                `Erreur lors de la notification de mention pour @${mention}:`,
                err,
            );
        }
    }
}

// Exposer globalement
window.notifyMentions = notifyMentions;

// Se désabonner des notifications
function unsubscribeFromNotifications() {
    if (notificationChannel) {
        supabase.removeChannel(notificationChannel);
        notificationChannel = null;
    }

    // Optionnel: se désabonner du push
    if (pushSubscription && swRegistration) {
        pushSubscription.unsubscribe().catch(() => {});
    }
    if (returnReminderTimer) {
        clearTimeout(returnReminderTimer);
        returnReminderTimer = null;
    }
    if (notificationsPollingTimer) {
        clearInterval(notificationsPollingTimer);
        notificationsPollingTimer = null;
    }
}

// Convertir une clé publique VAPID base64 vers Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Envoyer l'abonnement push au backend
async function sendSubscriptionToServer(subscription) {
    if (!currentUser || !subscription) return;
    if (!subscription.endpoint || typeof subscription.endpoint !== "string") {
        console.warn("Abonnement push invalide, enregistrement ignoré.");
        return;
    }

    const requestConfig = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            userId: currentUser.id,
            subscription,
            timezone: (() => {
                try {
                    return (
                        Intl.DateTimeFormat().resolvedOptions().timeZone ||
                        "UTC"
                    );
                } catch (e) {
                    return "UTC";
                }
            })(),
            reminderEnabled: true,
        }),
        credentials: "include",
    };

    try {
        if (
            requestConfig.method &&
            requestConfig.method.toUpperCase() !== "POST"
        ) {
            throw new Error("Méthode HTTP invalide pour l'abonnement push.");
        }

        const response = await fetch(getPushSubscribeUrl(), requestConfig);
        if (!response || !response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(
                text ||
                    `HTTP ${response?.status || "inconnu"} lors de l'inscription push`,
            );
        }
    } catch (error) {
        console.warn("Impossible d'enregistrer l'abonnement push", error);
    }
}

function startNotificationsPollingFallback() {
    if (notificationsPollingTimer) {
        clearInterval(notificationsPollingTimer);
        notificationsPollingTimer = null;
    }

    notificationsPollingTimer = setInterval(() => {
        if (!currentUser) return;
        if (document.hidden) return;
        loadNotifications().catch((error) => {
            console.warn("Notifications fallback refresh failed:", error);
        });
    }, 12000);
}

// Demande d'envoi d'un push test depuis le serveur (pour debug/utilisateur)
async function requestTestPush() {
    try {
        const { data: { session } = {} } = await supabase.auth.getSession();
        const token = session?.access_token || null;
        if (!token) {
            ToastManager?.error(
                "Test push",
                "Connectez-vous pour tester les notifications.",
            );
            return;
        }

        const resp = await fetch("/api/push/test", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            credentials: "include",
        });

        if (!resp.ok) {
            const txt = await resp.text();
            ToastManager?.error("Test push", `Échec: ${txt}`);
            return;
        }

        const json = await resp.json();
        if (json && json.ok) {
            ToastManager?.success(
                "Test push",
                "Demande envoyée — vérifiez votre appareil.",
            );
        } else {
            ToastManager?.info(
                "Test push",
                json.message || "Aucune subscription trouvée.",
            );
        }
    } catch (e) {
        console.warn("requestTestPush error", e);
        ToastManager?.error("Test push", "Erreur lors de la demande de test.");
    }
}

window.requestTestPush = requestTestPush;

// ---------------------------
// Helpers de normalisation
// ---------------------------
function normalizeNotifications(list) {
    return (list || []).map(normalizeNotification);
}

function normalizeNotification(notif) {
    const n = { ...notif };
    n.link = normalizeNotificationLink(n);
    n.actorId =
        n.actor_id ||
        n.actorId ||
        n.sender_id ||
        n.senderId ||
        n.from_user_id ||
        n.fromUserId ||
        null;
    return n;
}

window.showDeviceNotification = showDeviceNotification;

document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (!window.currentUser) return;
    loadNotifications().catch((error) => {
        console.warn("Notifications visibility refresh failed:", error);
    });
    // Remettre à zéro le badge côté serveur lorsque l'utilisateur revient au premier plan
    try {
        resetServerBadge().catch(() => {});
    } catch (e) {}
});

function normalizeNotificationLink(notif) {
    const link = (notif && notif.link) || "";
    if (!link) return "";
    // stream links
    const streamMatch = link.match(/\/stream\/?([a-f0-9-]{8,})/i);
    if (streamMatch) {
        const streamId = streamMatch[1];
        return `stream.html?id=${streamId}`;
    }
    // explicit stream.html
    if (link.includes("stream.html")) return link;
    // pagepro links
    const pageProMatch = link.match(/\/pagepro\/?([a-f0-9-]{8,})/i);
    if (pageProMatch) {
        return `pagepro?user=${pageProMatch[1]}`;
    }
    const pageProHtmlMatch = link.match(/pagepro\?user=([a-f0-9-]{8,})/i);
    if (pageProHtmlMatch) {
        return `pagepro?user=${pageProHtmlMatch[1]}`;
    }
    // profile links
    const profileMatch = link.match(/\/profile\/?([a-f0-9-]{8,})/i);
    if (profileMatch) {
        return `profile?user=${profileMatch[1]}`;
    }
    const profileHtmlMatch = link.match(
        /profile\\.html\\?user=([a-f0-9-]{8,})/i,
    );
    if (profileHtmlMatch) {
        return `profile?user=${profileHtmlMatch[1]}`;
    }
    // leave untouched
    return link.startsWith("/") ? link.slice(1) : link;
}

function extractStreamId(link = "") {
    const m =
        link.match(/stream\.html\?[^#]*id=([a-f0-9-]{8,})/i) ||
        link.match(/stream\.html\?id=([a-f0-9-]{8,})/i) ||
        link.match(/\/stream\/?([a-f0-9-]{8,})/i);
    return m ? m[1] : null;
}

function extractUserIdFromLink(link = "") {
    try {
        const parsed = new URL(link, window.location.href);
        const queryUserId =
            parsed.searchParams.get("user") || parsed.searchParams.get("u");
        if (queryUserId) return queryUserId;
    } catch (error) {
        // Fall back to legacy link formats below.
    }

    const m =
        link.match(/profile\.html\?[^#]*user=([a-f0-9-]{8,})/i) ||
        link.match(/profile\.html\?user=([a-f0-9-]{8,})/i) ||
        link.match(/\/profile\/?([a-f0-9-]{8,})/i);
    return m ? m[1] : null;
}

async function hydrateNotificationMetadata(list) {
    if (!Array.isArray(list) || list.length === 0) return;

    const streamIds = new Set();
    const userIds = new Set();

    list.forEach((n) => {
        const link = normalizeNotificationLink(n);
        n.link = link;
        const streamId = extractStreamId(link);
        const userId = extractUserIdFromLink(link);
        if (streamId) streamIds.add(streamId);
        if (userId) userIds.add(userId);
        if (n.actorId) userIds.add(n.actorId);
    });

    let streamMap = {};
    if (streamIds.size > 0) {
        const missing = [...streamIds].filter(
            (id) => !notifStreamCache.has(id),
        );
        if (missing.length > 0) {
            const { data, error } = await supabase
                .from("streaming_sessions")
                .select("id, user_id, title, thumbnail_url")
                .in("id", missing);
            if (!error && data) {
                data.forEach((row) => notifStreamCache.set(row.id, row));
            }
        }
        streamMap = Object.fromEntries(
            [...streamIds].map((id) => [id, notifStreamCache.get(id) || null]),
        );
        Object.values(streamMap)
            .filter(Boolean)
            .forEach((s) => s.user_id && userIds.add(s.user_id));
    }

    const missingUsers = [...userIds].filter((id) => !notifUserCache.has(id));
    if (missingUsers.length > 0) {
        const { data, error } = await supabase
            .from("users")
            .select("id, name, avatar")
            .in("id", missingUsers);
        if (!error && data) {
            data.forEach((u) => notifUserCache.set(u.id, u));
        }
    }
    const userMap = Object.fromEntries(
        [...userIds].map((id) => [id, notifUserCache.get(id) || null]),
    );

    list.forEach((n) => {
        const streamId = extractStreamId(n.link);
        const userIdFromLink = extractUserIdFromLink(n.link);
        const stream = streamId ? streamMap[streamId] : null;
        const actorId = n.actorId || userIdFromLink || stream?.user_id || null;
        if (actorId && userMap[actorId]) {
            n.actor = userMap[actorId];
        }
        if (stream && stream.user_id) {
            // Enrichir le lien pour inclure l'hôte, utile pour le lecteur
            const hostPart = n.link.includes("host=")
                ? ""
                : `&host=${stream.user_id}`;
            if (n.link.includes("stream.html")) {
                n.link = `${n.link}${hostPart}`;
            } else {
                n.link = `stream.html?id=${stream.id}${hostPart}`;
            }
            n.stream = stream;
        }
    });
}
