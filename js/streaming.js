/* ========================================
   SYSTÈME DE LIVE STREAMING
   ======================================== */

if (!window.__streamingLoaded) {
    window.__streamingLoaded = true;

    let currentStream = null;
    let streamChannel = null;
    let chatChannel = null;
    let signalChannel = null;
    let viewerHeartbeat = null;
    let previewHeartbeat = null;
    let previewCanvas = null;
    let previewCtx = null;
    let previewInFlight = false;
    let lastPreviewStamp = 0;
    let peerConnections = new Map();
    let localMediaStream = null;
    let hostMicStream = null;
    let hostAudioContext = null;
    let activeStreamId = null;
    let isStreamHost = false;
    let pendingViewerJoins = new Set();
    let viewerCountInterval = null;
    let chatSyncInterval = null;
    let chatResubscribeTimer = null;
    let hostBadgeRefreshInterval = null;
    let lastChatCreatedAt = null;
    let currentVideoDeviceId = null;
    let lastCameraDeviceId = null;
    let availableHostVideoInputs = 0;
    let isMicMuted = false;
    let isScreenSharing = false;
    let streamDurationInterval = null;
    let streamStartedAtMs = 0;
    let activeDisplayStream = null;
    let screenOverlayCameraStream = null;
    let screenCompositeCanvas = null;
    let screenCompositeCtx = null;
    let screenCompositeStream = null;
    let screenCompositeRaf = null;
    let screenCompositeDisplayVideo = null;
    let screenCompositeCameraVideo = null;
    let isScreenCompositeMode = false;
    let pendingMobileScreenShareActivation = false;
    let pendingMobileScreenShareCleanup = null;
    let isShareScreenRequestInFlight = false;
    let isCameraEnabled = true;
    let standbyCameraTrack = null;
    let cameraPlaceholderTrack = null;
    let cameraPlaceholderStream = null;
    let cameraPlaceholderInterval = null;
    let chatRealtimeStatus = "idle";
    let lastChatFallbackSyncAt = 0;
    let chatPinnedToBottom = true;
    let chatShouldStickOnNextRender = true;
    let chatUnseenCount = 0;
    let hostPanelRegistry = new Map();
    const customHostPanelTools = [];
    let activeHostToolId = "";
    let liveStudioState = null;
    let hostPanelViewers = [];
    let hostPanelViewersLoading = false;
    let liveAnalyticsState = null;
    let liveModerationEntries = [];
    let liveModerationIndex = new Map();
    let liveModeratorSearchTerm = "";
    let liveModerationQueueFilter = "all";
    const chatUserCache = new Map();
    const chatProfileRequests = new Map();
    const renderedChatMessageIds = new Set();
    const MOBILE_VIDEO_CONSTRAINTS = {
        width: { ideal: 960, max: 1280 },
        height: { ideal: 540, max: 720 },
        frameRate: { ideal: 24, max: 30 },
        facingMode: { ideal: "user" },
    };
    const CHAT_AUTO_SCROLL_THRESHOLD = 56;
    const CHAT_FALLBACK_POLL_TICK_MS = 1000;
    const CHAT_FALLBACK_FAST_SYNC_MS = 2500;
    const CHAT_FALLBACK_STEADY_SYNC_MS = 30000;
    const MODERATOR_ROLE_TEMPLATES = {
        lead: {
            label: "Lead mod",
            summary: "Coordonne les decisions sensibles.",
            permissions: {
                queue: true,
                mute: true,
                links: true,
                incidents: true,
                quality: true,
            },
        },
        chat: {
            label: "Chat mod",
            summary: "Cadre le chat et gere les liens.",
            permissions: {
                queue: true,
                mute: true,
                links: true,
                incidents: false,
                quality: false,
            },
        },
        safety: {
            label: "Safety",
            summary: "Suit les alertes et les signalements.",
            permissions: {
                queue: true,
                mute: true,
                links: false,
                incidents: true,
                quality: false,
            },
        },
        scene: {
            label: "Scene",
            summary: "Controle le rendu et les soucis visuels.",
            permissions: {
                queue: false,
                mute: false,
                links: false,
                incidents: false,
                quality: true,
            },
        },
    };
    const MODERATOR_PERMISSION_LABELS = {
        queue: "Queue",
        mute: "Mute",
        links: "Liens",
        incidents: "Alertes",
        quality: "Qualite",
    };
    const LIVE_AUTO_MOD_ACTIONS = {
        flag: "Signaler",
        hold: "Mettre en attente",
        mask: "Masquer",
    };
    const LIVE_STUDIO_DEFAULTS = {
        previewFilter: "none",
        previewIntensity: 100,
        previewSafeZone: true,
        previewGrid: false,
        previewMirror: false,
        moderatorIds: [],
        moderators: {},
        giftsEnabled: true,
        pollsEnabled: true,
        autoModEnabled: false,
        autoModKeywords: [],
        autoModAction: "mask",
        autoModSensitivity: "balanced",
        mutedUserIds: [],
    };
    const LIVE_PREVIEW_FILTERS = {
        none: {
            label: "Flux brut",
            accent: "#cbd5e1",
            buildCss: () => "none",
        },
        focus: {
            label: "Focus",
            accent: "#38bdf8",
            buildCss: (intensity) => {
                const ratio = clampNumber(intensity / 100, 0.4, 1.8);
                return `saturate(${(1 + ratio * 0.08).toFixed(2)}) contrast(${(1 + ratio * 0.04).toFixed(2)})`;
            },
        },
        cinema: {
            label: "Cinema",
            accent: "#f59e0b",
            buildCss: (intensity) => {
                const ratio = clampNumber(intensity / 100, 0.4, 1.8);
                return `contrast(${(1.04 + ratio * 0.05).toFixed(2)}) saturate(${(1 - ratio * 0.08).toFixed(2)}) brightness(${(0.98 - ratio * 0.03).toFixed(2)})`;
            },
        },
        pop: {
            label: "Pop",
            accent: "#f43f5e",
            buildCss: (intensity) => {
                const ratio = clampNumber(intensity / 100, 0.4, 1.8);
                return `saturate(${(1.08 + ratio * 0.16).toFixed(2)}) contrast(${(1.02 + ratio * 0.06).toFixed(2)})`;
            },
        },
        mono: {
            label: "Mono",
            accent: "#a78bfa",
            buildCss: (intensity) => {
                const ratio = clampNumber(intensity / 100, 0.4, 1.4);
                return `grayscale(${clampNumber(0.4 + ratio * 0.45, 0.45, 1).toFixed(2)}) contrast(${(1 + ratio * 0.06).toFixed(2)})`;
            },
        },
    };
    const LIVE_ANALYTICS_WINDOW_MS = 1000 * 60 * 18;
    const LIVE_RATE_WINDOW_MS = 1000 * 60 * 5;
    const LIVE_MODERATION_LOG_LIMIT = 36;

    function clampNumber(value, min, max) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return min;
        return Math.min(max, Math.max(min, numeric));
    }

    function uniqueStringList(values) {
        if (!Array.isArray(values)) return [];
        return [
            ...new Set(
                values
                    .map((value) => String(value || "").trim())
                    .filter(Boolean),
            ),
        ];
    }

    function cloneModeratorPermissions(permissions = {}) {
        const next = {};
        Object.keys(MODERATOR_PERMISSION_LABELS).forEach((key) => {
            next[key] = Boolean(permissions[key]);
        });
        return next;
    }

    function getModeratorRoleTemplate(roleId = "chat") {
        return (
            MODERATOR_ROLE_TEMPLATES[roleId] || MODERATOR_ROLE_TEMPLATES.chat
        );
    }

    function fallbackCopy(url) {
        navigator.clipboard
            .writeText(url)
            .then(() => {
                if (window.ToastManager) {
                    ToastManager.success(
                        "Lien copié",
                        "Le lien a été copié dans le presse-papiers",
                    );
                }
            })
            .catch(() => {
                if (window.ToastManager) {
                    ToastManager.error(
                        "Erreur",
                        "Impossible de copier le lien",
                    );
                }
            });
    }

    function createModeratorConfig(userId, base = {}) {
        const role = String(base.role || "chat");
        const template = getModeratorRoleTemplate(role);
        return {
            userId,
            role,
            permissions: cloneModeratorPermissions({
                ...template.permissions,
                ...(base.permissions || {}),
            }),
            assignedAt: base.assignedAt || Date.now(),
            lastSeenAt: base.lastSeenAt || Date.now(),
            name: base.name || "",
            avatar: base.avatar || "",
        };
    }

    function normalizeModeratorsState(rawModerators = {}, moderatorIds = []) {
        const nextIds = uniqueStringList([
            ...Object.keys(rawModerators || {}),
            ...(Array.isArray(moderatorIds) ? moderatorIds : []),
        ]);
        const moderators = {};
        nextIds.forEach((userId) => {
            moderators[userId] = createModeratorConfig(
                userId,
                rawModerators?.[userId] || {},
            );
        });
        return {
            moderatorIds: nextIds,
            moderators,
        };
    }

    function createLiveAnalyticsState(stream = currentStream) {
        const initialViewers = Math.max(0, Number(stream?.viewer_count) || 0);
        return {
            startedAt: resolveStreamStartMs(stream) || Date.now(),
            viewerSeries: [],
            messageSeries: [],
            uniqueViewerIds: new Set(),
            uniqueChatters: new Set(),
            chatterCounts: {},
            peakViewers: initialViewers,
            lastViewerCount: initialViewers,
            moderationHits: 0,
            autoActions: 0,
            manualActions: 0,
            totalMessages: 0,
            peakMomentum: 0,
            peakMomentumLabel: "Stable",
        };
    }

    function ensureLiveAnalyticsState(stream = currentStream) {
        if (!liveAnalyticsState) {
            liveAnalyticsState = createLiveAnalyticsState(stream);
        }
        return liveAnalyticsState;
    }

    function trimTimedSeries(list, windowMs = LIVE_ANALYTICS_WINDOW_MS) {
        const cutoff = Date.now() - windowMs;
        return (Array.isArray(list) ? list : []).filter(
            (entry) => Number(entry?.ts) >= cutoff,
        );
    }

    function resetLiveStudioRuntime(stream = currentStream) {
        liveStudioState = { ...LIVE_STUDIO_DEFAULTS };
        liveAnalyticsState = createLiveAnalyticsState(stream);
        liveModerationEntries = [];
        liveModerationIndex = new Map();
        liveModeratorSearchTerm = "";
        liveModerationQueueFilter = "all";
        activeHostToolId = "";
        hostPanelViewers = [];
        hostPanelViewersLoading = false;
    }

    function registerViewerPresence(viewers = []) {
        const analytics = ensureLiveAnalyticsState();
        (Array.isArray(viewers) ? viewers : []).forEach((viewer) => {
            if (viewer?.user_id) {
                analytics.uniqueViewerIds.add(viewer.user_id);
            }
        });
    }

    function recordViewerSnapshot(count, viewers = hostPanelViewers) {
        const analytics = ensureLiveAnalyticsState();
        const safeCount = Math.max(0, Number(count) || 0);
        const now = Date.now();
        analytics.viewerSeries = trimTimedSeries([
            ...analytics.viewerSeries,
            { ts: now, value: safeCount },
        ]);
        analytics.lastViewerCount = safeCount;
        analytics.peakViewers = Math.max(analytics.peakViewers, safeCount);
        registerViewerPresence(viewers);

        const recent = analytics.viewerSeries
            .slice(-6)
            .map((entry) => entry.value);
        const baseline =
            recent.length > 1
                ? recent.slice(0, -1).reduce((sum, value) => sum + value, 0) /
                  Math.max(1, recent.length - 1)
                : safeCount;
        const momentum = safeCount - baseline;
        analytics.peakMomentum = Math.max(analytics.peakMomentum, momentum);
        if (momentum >= 6) {
            analytics.peakMomentumLabel = "Pic detecte";
        } else if (momentum <= -4) {
            analytics.peakMomentumLabel = "Audience en retrait";
        } else {
            analytics.peakMomentumLabel = "Stable";
        }
    }

    function recordChatAnalytics(message, moderationRecord = null) {
        if (!message) return;
        const analytics = ensureLiveAnalyticsState();
        const now = message.created_at
            ? new Date(message.created_at).getTime()
            : Date.now();
        analytics.messageSeries = trimTimedSeries([
            ...analytics.messageSeries,
            { ts: now, userId: message.user_id || null },
        ]);
        analytics.totalMessages += 1;
        if (message.user_id) {
            analytics.uniqueChatters.add(message.user_id);
            analytics.chatterCounts[message.user_id] = {
                name: message.users?.name || message.user_name || "Utilisateur",
                count:
                    Number(
                        analytics.chatterCounts[message.user_id]?.count || 0,
                    ) + 1,
            };
        }
        if (moderationRecord && moderationRecord.status !== "approved") {
            analytics.moderationHits += 1;
            if (moderationRecord.source === "auto") {
                analytics.autoActions += 1;
            }
        }
    }

    function getTimedSeriesCount(list, windowMs = LIVE_RATE_WINDOW_MS) {
        const cutoff = Date.now() - windowMs;
        return (Array.isArray(list) ? list : []).filter(
            (entry) => Number(entry?.ts) >= cutoff,
        ).length;
    }

    function getMessagesPerMinute() {
        const analytics = ensureLiveAnalyticsState();
        const recentCount = getTimedSeriesCount(
            analytics.messageSeries,
            LIVE_RATE_WINDOW_MS,
        );
        return Math.round(
            recentCount / Math.max(1, LIVE_RATE_WINDOW_MS / 60000),
        );
    }

    function getTopChatters(limit = 3) {
        const analytics = ensureLiveAnalyticsState();
        return Object.entries(analytics.chatterCounts || {})
            .sort((a, b) => (b[1]?.count || 0) - (a[1]?.count || 0))
            .slice(0, limit)
            .map(([userId, entry]) => ({
                userId,
                name: entry?.name || "Utilisateur",
                count: entry?.count || 0,
            }));
    }

    function getEngagementScore() {
        const analytics = ensureLiveAnalyticsState();
        const activeViewers = Math.max(1, analytics.lastViewerCount || 1);
        const liveRate = getMessagesPerMinute();
        const chatterSpread = analytics.uniqueChatters.size;
        const baseScore =
            liveRate * 1.9 +
            chatterSpread * 1.35 +
            Math.min(activeViewers, 40) * 0.55;
        return Math.round(baseScore);
    }

    function normalizeModerationText(value) {
        return String(value || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function buildMaskedMessage(reason = "") {
        return reason
            ? `[Message masque: ${reason}]`
            : "[Message masque par moderation]";
    }

    function upsertModerationRecord(message, patch = {}) {
        const key = getChatMessageKey(message);
        if (!key) return null;
        const existing = liveModerationIndex.get(key);
        const next = {
            key,
            userId: patch.userId || existing?.userId || message?.user_id || "",
            userName:
                patch.userName ||
                existing?.userName ||
                message?.users?.name ||
                message?.user_name ||
                "Utilisateur",
            avatar:
                patch.avatar ||
                existing?.avatar ||
                message?.users?.avatar ||
                "",
            originalMessage:
                existing?.originalMessage ||
                message?._xeraOriginalMessage ||
                message?.message ||
                "",
            renderedMessage:
                patch.renderedMessage ||
                existing?.renderedMessage ||
                message?.message ||
                "",
            status: patch.status || existing?.status || "approved",
            reason: patch.reason || existing?.reason || "",
            source: patch.source || existing?.source || "manual",
            keyword: patch.keyword || existing?.keyword || "",
            createdAt:
                patch.createdAt ||
                existing?.createdAt ||
                message?.created_at ||
                new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        liveModerationIndex.set(key, next);
        liveModerationEntries = [
            next,
            ...liveModerationEntries.filter((entry) => entry.key !== key),
        ].slice(0, LIVE_MODERATION_LOG_LIMIT);
        return next;
    }

    function syncMessageContentWithModeration(messageKey, renderedMessage) {
        if (!messageKey) return;
        if (window.liveChatStore?.updateMessage) {
            window.liveChatStore.updateMessage(messageKey, {
                message: renderedMessage,
            });
            return;
        }
        const element = findChatMessageElement(messageKey);
        const textNode = element?.querySelector(".chat-message-text");
        if (textNode) {
            textNode.textContent = renderedMessage;
        }
    }

    function applyModerationRecordToMessage(message, record) {
        if (!message || !record) return message;
        message._xeraOriginalMessage = record.originalMessage;
        message._xeraModeration = {
            key: record.key,
            status: record.status,
            reason: record.reason,
            source: record.source,
        };
        message.message =
            record.status === "approved"
                ? record.originalMessage
                : record.renderedMessage || buildMaskedMessage(record.reason);
        return message;
    }

    function evaluateChatModeration(message) {
        const key = getChatMessageKey(message);
        if (!key) return null;

        const existing = liveModerationIndex.get(key);
        if (existing) {
            return applyModerationRecordToMessage(message, existing)
                ._xeraModeration;
        }

        const mutedUserIds = new Set(liveStudioState?.mutedUserIds || []);
        const normalizedMessage = normalizeModerationText(
            message?.message || "",
        );
        const keywordList = uniqueStringList(
            liveStudioState?.autoModKeywords || [],
        )
            .map(normalizeModerationText)
            .filter(Boolean);
        const keywordHit = keywordList.find(
            (keyword) => keyword && normalizedMessage.includes(keyword),
        );

        let record = null;
        if (message?.user_id && mutedUserIds.has(message.user_id)) {
            record = upsertModerationRecord(message, {
                status: "masked",
                reason: "auteur mute",
                renderedMessage: buildMaskedMessage("auteur mute"),
                source: "manual",
            });
        } else if (liveStudioState?.autoModEnabled && keywordHit) {
            const mode = liveStudioState?.autoModAction || "mask";
            const status =
                mode === "flag"
                    ? "flagged"
                    : mode === "hold"
                      ? "held"
                      : "masked";
            const renderedMessage =
                status === "flagged"
                    ? message.message
                    : buildMaskedMessage(`mot cle: ${keywordHit}`);
            record = upsertModerationRecord(message, {
                status,
                reason: `mot cle: ${keywordHit}`,
                renderedMessage,
                source: "auto",
                keyword: keywordHit,
            });
        }

        if (record) {
            applyModerationRecordToMessage(message, record);
            return message._xeraModeration;
        }
        return null;
    }

    function prepareChatMessageForDisplay(message, options = {}) {
        if (!message) return message;
        const moderation = evaluateChatModeration(message);
        if (!moderation) {
            message._xeraOriginalMessage = message.message || "";
        }
        if (options.trackMetrics !== false) {
            recordChatAnalytics(
                message,
                moderation && moderation.status !== "approved"
                    ? liveModerationIndex.get(moderation.key)
                    : null,
            );
        }
        return message;
    }

    function isSecureStreamingContext() {
        return (
            window.isSecureContext ||
            location.protocol === "https:" ||
            location.hostname === "localhost" ||
            location.hostname === "127.0.0.1"
        );
    }

    function resolveStreamStartMs(stream) {
        const raw =
            stream?.started_at ||
            stream?.startedAt ||
            stream?.created_at ||
            stream?.createdAt ||
            currentStream?.started_at ||
            currentStream?.startedAt ||
            currentStream?.created_at ||
            currentStream?.createdAt ||
            null;
        if (!raw) return 0;
        const ts = new Date(raw).getTime();
        return Number.isFinite(ts) ? ts : 0;
    }

    function formatStreamDuration(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const hh = String(hours).padStart(2, "0");
        const mm = String(minutes).padStart(2, "0");
        const ss = String(seconds).padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
    }

    function stopStreamDurationTimer() {
        if (streamDurationInterval) {
            clearInterval(streamDurationInterval);
            streamDurationInterval = null;
        }
    }

    function renderLiveStatusWithTimer() {
        const status = document.getElementById("stream-status");
        if (!status || status.dataset.mode !== "live") return;
        const baseLabel = status.dataset.baseLabel || "🔴 EN DIRECT";
        if (!streamStartedAtMs) {
            status.textContent = baseLabel;
            return;
        }
        const elapsed = Date.now() - streamStartedAtMs;
        status.textContent = `${baseLabel} • ${formatStreamDuration(elapsed)}`;
    }

    function startStreamDurationTimer(stream) {
        const resolved = resolveStreamStartMs(stream);
        if (resolved) {
            streamStartedAtMs = resolved;
        }
        stopStreamDurationTimer();
        renderLiveStatusWithTimer();
        streamDurationInterval = setInterval(renderLiveStatusWithTimer, 1000);
    }

    function setStreamStatusMode(mode, options = {}) {
        const status = document.getElementById("stream-status");
        if (!status) return;

        if (mode === "live") {
            const host = options.host === true;
            const baseLabel = host
                ? "🔴 EN DIRECT (Vous diffusez)"
                : "🔴 EN DIRECT";
            status.dataset.mode = "live";
            status.dataset.baseLabel = baseLabel;
            status.classList.add("live");
            startStreamDurationTimer(options.stream || currentStream);
            return;
        }

        stopStreamDurationTimer();
        status.dataset.mode = mode;
        status.dataset.baseLabel = "";
        if (mode === "waiting") {
            status.textContent = "⏳ EN ATTENTE DU LIVE";
            status.classList.remove("live");
            return;
        }
        if (mode === "ended") {
            status.textContent = "⏹️ LIVE TERMINÉ";
            status.classList.remove("live");
            return;
        }
    }

    function getChatContainer() {
        return document.getElementById("stream-chat-messages");
    }

    function isChatNearBottom(container = getChatContainer()) {
        if (!container) return true;
        const distance =
            container.scrollHeight -
            container.scrollTop -
            container.clientHeight;
        return distance <= CHAT_AUTO_SCROLL_THRESHOLD;
    }

    function getChatResumeButton() {
        return document.getElementById("stream-chat-resume-btn");
    }

    function updateChatResumeButton() {
        const button = getChatResumeButton();
        if (!button) return;
        const shouldShow = !chatPinnedToBottom && chatUnseenCount > 0;
        button.hidden = !shouldShow;
        button.textContent =
            chatUnseenCount > 1
                ? `${chatUnseenCount} nouveaux messages`
                : "Nouveau message";
    }

    function scrollChatToLatest({ behavior = "smooth", force = false } = {}) {
        const container = getChatContainer();
        if (!container) return;
        if (!force && !chatPinnedToBottom && !chatShouldStickOnNextRender) {
            return;
        }
        try {
            container.scrollTo({
                top: container.scrollHeight,
                behavior,
            });
        } catch (error) {
            container.scrollTop = container.scrollHeight;
        }
        chatPinnedToBottom = true;
        chatShouldStickOnNextRender = true;
        chatUnseenCount = 0;
        updateChatResumeButton();
    }

    function prepareChatScrollForIncomingMessage() {
        const container = getChatContainer();
        const shouldStick =
            !container || chatPinnedToBottom || isChatNearBottom(container);
        chatShouldStickOnNextRender = shouldStick;
        if (!shouldStick) {
            chatPinnedToBottom = false;
            chatUnseenCount += 1;
        }
        updateChatResumeButton();
        return shouldStick;
    }

    function handleChatMessagesRendered({
        force = false,
        behavior = "auto",
    } = {}) {
        const container = getChatContainer();
        if (!container) return;

        const shouldStick =
            force || chatShouldStickOnNextRender || isChatNearBottom(container);

        if (shouldStick) {
            scrollChatToLatest({ behavior, force: true });
        } else {
            chatPinnedToBottom = false;
            updateChatResumeButton();
        }

        chatShouldStickOnNextRender = chatPinnedToBottom;
    }

    function setupChatInteractionUX() {
        const container = getChatContainer();
        const chatRoot = container?.closest(".stream-chat");
        if (!container || !chatRoot) return;

        if (!container.dataset.autoscrollBound) {
            container.dataset.autoscrollBound = "true";
            container.addEventListener("scroll", () => {
                const nearBottom = isChatNearBottom(container);
                chatPinnedToBottom = nearBottom;
                if (nearBottom) {
                    chatUnseenCount = 0;
                    chatShouldStickOnNextRender = true;
                }
                updateChatResumeButton();
            });
        }

        if (!getChatResumeButton()) {
            const button = document.createElement("button");
            button.id = "stream-chat-resume-btn";
            button.type = "button";
            button.className = "stream-chat-resume";
            button.hidden = true;
            button.textContent = "Nouveau message";
            button.addEventListener("click", () => {
                scrollChatToLatest({ behavior: "smooth", force: true });
                const input = document.getElementById("stream-chat-input");
                if (input && !input.disabled) {
                    try {
                        input.focus({ preventScroll: true });
                    } catch (error) {}
                }
            });
            const chatForm = document.getElementById("stream-chat-form");
            chatRoot.insertBefore(button, chatForm || null);
        }

        chatPinnedToBottom = isChatNearBottom(container);
        chatShouldStickOnNextRender = chatPinnedToBottom;
        updateChatResumeButton();
    }

    function getLiveStudioStorageKey(streamId = currentStream?.id) {
        return streamId ? `xera1-live-studio:${streamId}` : "";
    }

    function saveLiveStudioState(streamId = currentStream?.id) {
        const storageKey = getLiveStudioStorageKey(streamId);
        if (!storageKey || !liveStudioState) return;
        try {
            localStorage.setItem(storageKey, JSON.stringify(liveStudioState));
        } catch (error) {
            console.warn("Sauvegarde studio live impossible:", error);
        }
    }

    function loadLiveStudioState(streamId = currentStream?.id) {
        const storageKey = getLiveStudioStorageKey(streamId);
        let nextState = { ...LIVE_STUDIO_DEFAULTS };
        if (storageKey) {
            try {
                const raw = localStorage.getItem(storageKey);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === "object") {
                        const normalizedModerators = normalizeModeratorsState(
                            parsed.moderators || {},
                            parsed.moderatorIds || [],
                        );
                        nextState = {
                            ...nextState,
                            ...parsed,
                            ...normalizedModerators,
                            previewIntensity: clampNumber(
                                parsed.previewIntensity ??
                                    LIVE_STUDIO_DEFAULTS.previewIntensity,
                                40,
                                160,
                            ),
                            previewSafeZone:
                                parsed.previewSafeZone !== undefined
                                    ? Boolean(parsed.previewSafeZone)
                                    : LIVE_STUDIO_DEFAULTS.previewSafeZone,
                            previewGrid:
                                parsed.previewGrid !== undefined
                                    ? Boolean(parsed.previewGrid)
                                    : LIVE_STUDIO_DEFAULTS.previewGrid,
                            previewMirror:
                                parsed.previewMirror !== undefined
                                    ? Boolean(parsed.previewMirror)
                                    : LIVE_STUDIO_DEFAULTS.previewMirror,
                            autoModKeywords: uniqueStringList(
                                parsed.autoModKeywords || [],
                            ),
                            autoModAction: LIVE_AUTO_MOD_ACTIONS[
                                parsed.autoModAction
                            ]
                                ? parsed.autoModAction
                                : LIVE_STUDIO_DEFAULTS.autoModAction,
                            autoModSensitivity: String(
                                parsed.autoModSensitivity ||
                                    LIVE_STUDIO_DEFAULTS.autoModSensitivity,
                            ),
                            mutedUserIds: uniqueStringList(
                                parsed.mutedUserIds || [],
                            ),
                        };
                    }
                }
            } catch (error) {
                console.warn("Lecture studio live impossible:", error);
            }
        }
        liveStudioState = nextState;
        return liveStudioState;
    }

    function updateLiveStudioState(patch) {
        const merged = {
            ...(liveStudioState || { ...LIVE_STUDIO_DEFAULTS }),
            ...(patch || {}),
        };
        const normalizedModerators = normalizeModeratorsState(
            merged.moderators || {},
            merged.moderatorIds || [],
        );
        liveStudioState = {
            ...merged,
            ...normalizedModerators,
            previewIntensity: clampNumber(
                merged.previewIntensity ??
                    LIVE_STUDIO_DEFAULTS.previewIntensity,
                40,
                160,
            ),
            autoModKeywords: uniqueStringList(merged.autoModKeywords || []),
            autoModAction: LIVE_AUTO_MOD_ACTIONS[merged.autoModAction]
                ? merged.autoModAction
                : LIVE_STUDIO_DEFAULTS.autoModAction,
            mutedUserIds: uniqueStringList(merged.mutedUserIds || []),
        };
        saveLiveStudioState();
        applyLivePreviewFilter();
        renderHostControlPanel();
        renderHostToolDrawer();
    }

    function getActivePreviewFilterCss() {
        const filterId = liveStudioState?.previewFilter || "none";
        const filter =
            LIVE_PREVIEW_FILTERS[filterId] || LIVE_PREVIEW_FILTERS.none;
        const intensity = clampNumber(
            liveStudioState?.previewIntensity ??
                LIVE_STUDIO_DEFAULTS.previewIntensity,
            40,
            160,
        );
        return typeof filter.buildCss === "function"
            ? filter.buildCss(intensity)
            : "none";
    }

    function syncAudiencePreviewMonitors() {
        const sourceVideo = document.getElementById("stream-video");
        if (!sourceVideo) return;

        const monitorIds = [
            "stream-audience-preview-raw",
            "stream-audience-preview-filtered",
        ];
        monitorIds.forEach((monitorId) => {
            const previewVideo = document.getElementById(monitorId);
            if (!previewVideo) return;
            if (
                sourceVideo.srcObject &&
                previewVideo.srcObject !== sourceVideo.srcObject
            ) {
                previewVideo.srcObject = sourceVideo.srcObject;
            } else if (
                !sourceVideo.srcObject &&
                sourceVideo.currentSrc &&
                previewVideo.src !== sourceVideo.currentSrc
            ) {
                previewVideo.src = sourceVideo.currentSrc;
            }
            previewVideo.muted = true;
            previewVideo.autoplay = true;
            previewVideo.playsInline = true;
            const playPromise = previewVideo.play();
            if (playPromise && typeof playPromise.catch === "function") {
                playPromise.catch(() => {});
            }
        });

        const filteredPreview = document.getElementById(
            "stream-audience-preview-filtered",
        );
        if (filteredPreview) {
            filteredPreview.style.filter = getActivePreviewFilterCss();
        }

        Array.from(
            document.querySelectorAll('[data-preview-shell="ops"]'),
        ).forEach((shell) => {
            shell.classList.toggle(
                "is-safe-zone",
                Boolean(liveStudioState?.previewSafeZone),
            );
            shell.classList.toggle(
                "is-grid",
                Boolean(liveStudioState?.previewGrid),
            );
            shell.classList.toggle(
                "is-mirror",
                Boolean(liveStudioState?.previewMirror),
            );
        });
        Array.from(
            document.querySelectorAll('[data-preview-shell="public"]'),
        ).forEach((shell) => {
            shell.classList.remove("is-safe-zone", "is-grid", "is-mirror");
        });
    }

    function applyLivePreviewFilter() {
        const video = document.getElementById("stream-video");
        if (!video) return;
        const filterId = liveStudioState?.previewFilter || "none";
        const filter =
            LIVE_PREVIEW_FILTERS[filterId] || LIVE_PREVIEW_FILTERS.none;
        video.style.filter = getActivePreviewFilterCss();
        document.body.style.setProperty(
            "--xera1-live-filter-accent",
            filter.accent || "#38bdf8",
        );
        syncAudiencePreviewMonitors();
    }

    function getCurrentHostVideoTrack() {
        return localMediaStream?.getVideoTracks?.()[0] || null;
    }

    function markTrackSource(track, source) {
        if (track) {
            track.__xeraTrackSource = source;
        }
        return track;
    }

    function isTrackSource(track, source) {
        return Boolean(track && track.__xeraTrackSource === source);
    }

    function clearStandbyCameraTrack({ stop = true } = {}) {
        if (!standbyCameraTrack) return;
        if (stop) {
            try {
                standbyCameraTrack.stop();
            } catch (error) {}
        }
        standbyCameraTrack = null;
    }

    function cleanupCameraPlaceholderTrack() {
        if (cameraPlaceholderInterval) {
            clearInterval(cameraPlaceholderInterval);
            cameraPlaceholderInterval = null;
        }
        if (cameraPlaceholderTrack) {
            try {
                cameraPlaceholderTrack.stop();
            } catch (error) {}
        }
        if (cameraPlaceholderStream) {
            try {
                cameraPlaceholderStream
                    .getTracks()
                    .forEach((track) => track.stop());
            } catch (error) {}
        }
        cameraPlaceholderTrack = null;
        cameraPlaceholderStream = null;
    }

    function createCameraPlaceholderTrack() {
        cleanupCameraPlaceholderTrack();

        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const gradient = ctx.createLinearGradient(
                0,
                0,
                canvas.width,
                canvas.height,
            );
            gradient.addColorStop(0, "#050505");
            gradient.addColorStop(1, "#111827");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = "rgba(255,255,255,0.22)";
            ctx.lineWidth = 18;
            ctx.beginPath();
            ctx.arc(
                canvas.width / 2,
                canvas.height / 2 - 30,
                74,
                0,
                Math.PI * 2,
            );
            ctx.stroke();

            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = 20;
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2 - 95, canvas.height / 2 + 65);
            ctx.lineTo(canvas.width / 2 + 95, canvas.height / 2 - 125);
            ctx.stroke();

            ctx.fillStyle = "#ffffff";
            ctx.font = "700 38px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(
                "Camera desactivee",
                canvas.width / 2,
                canvas.height / 2 + 122,
            );
            ctx.fillStyle = "rgba(255,255,255,0.68)";
            ctx.font = "500 24px system-ui, sans-serif";
            ctx.fillText(
                "Le live continue avec le son actif.",
                canvas.width / 2,
                canvas.height / 2 + 168,
            );
        };

        draw();
        cameraPlaceholderInterval = setInterval(draw, 1000);

        cameraPlaceholderStream = canvas.captureStream(12);
        cameraPlaceholderTrack = markTrackSource(
            cameraPlaceholderStream.getVideoTracks()[0] || null,
            "placeholder",
        );
        return cameraPlaceholderTrack;
    }

    function getCachedChatProfile(userId) {
        if (!userId) return null;
        if (chatUserCache.has(userId)) {
            return chatUserCache.get(userId);
        }

        if (currentUser?.id === userId) {
            const currentProfile = {
                id: userId,
                name:
                    currentUser.user_metadata?.full_name ||
                    currentUser.user_metadata?.username ||
                    currentUser.email?.split("@")[0] ||
                    "Vous",
                avatar:
                    currentUser.user_metadata?.avatar_url ||
                    currentUser.user_metadata?.picture ||
                    "",
            };
            chatUserCache.set(userId, currentProfile);
            return currentProfile;
        }

        if (typeof window.getUser === "function") {
            const knownUser = window.getUser(userId);
            if (knownUser) {
                const profile = {
                    id: knownUser.id || userId,
                    name: knownUser.name || knownUser.username || "Utilisateur",
                    avatar: knownUser.avatar || "",
                };
                chatUserCache.set(userId, profile);
                return profile;
            }
        }

        return null;
    }

    function cacheChatProfile(userId, profile) {
        if (!userId || !profile) return null;
        const cached = {
            id: profile.id || userId,
            name: profile.name || profile.username || "Utilisateur",
            avatar: profile.avatar || "",
        };
        chatUserCache.set(userId, cached);
        return cached;
    }

    async function resolveChatProfile(userId) {
        const cached = getCachedChatProfile(userId);
        if (cached) return cached;

        if (chatProfileRequests.has(userId)) {
            return chatProfileRequests.get(userId);
        }

        const request = supabase
            .from("users")
            .select("id, name, avatar")
            .eq("id", userId)
            .single()
            .then(({ data, error }) => {
                if (error || !data) return null;
                return cacheChatProfile(userId, data);
            })
            .catch(() => null)
            .finally(() => {
                chatProfileRequests.delete(userId);
            });

        chatProfileRequests.set(userId, request);
        return request;
    }

    function findChatMessageElement(messageKey) {
        if (!messageKey) return null;
        return (
            Array.from(
                document.querySelectorAll(".chat-message[data-chat-key]"),
            ).find((element) => element.dataset.chatKey === messageKey) || null
        );
    }

    function patchChatMessageElement(messageKey, profile) {
        const element = findChatMessageElement(messageKey);
        if (!element || !profile) return;

        const avatar = element.querySelector(".chat-avatar");
        if (avatar) {
            avatar.src = profile.avatar || "https://placehold.co/32";
            avatar.alt = profile.name || "Utilisateur";
        }

        const userId = profile.id || null;
        const usernameHtml =
            typeof window.renderUsernameWithBadge === "function" && userId
                ? window.renderUsernameWithBadge(
                      profile.name || "Utilisateur",
                      userId,
                  )
                : escapeHtml(profile.name || "Utilisateur");

        const usernameEl = element.querySelector(".chat-username");
        if (usernameEl) {
            usernameEl.innerHTML = usernameHtml;
        }
    }

    async function hydrateChatMessageProfile(message, messageKey) {
        if (!message?.user_id) return;
        const profile = await resolveChatProfile(message.user_id);
        if (!profile) return;
        message.users = profile;
        if (window.liveChatStore?.updateMessage) {
            window.liveChatStore.updateMessage(messageKey, {
                users: profile,
            });
            return;
        }
        patchChatMessageElement(messageKey, profile);
    }

    async function tryAutoplayLiveWithAudio(video, { hasAudio = false } = {}) {
        if (!video) return false;

        const playWithState = async (muted) => {
            video.muted = muted;
            video.volume = 1;
            syncAudioButtonState(muted);
            const playAttempt = video.play();
            if (playAttempt && typeof playAttempt.then === "function") {
                await playAttempt;
            }
        };

        if (hasAudio) {
            try {
                await playWithState(false);
                hideUnmuteOverlay();
                return true;
            } catch (error) {
                console.warn("Autoplay audio refuse, fallback muet:", error);
            }
        }

        try {
            await playWithState(hasAudio);
        } catch (error) {
            console.warn("Lecture fallback live impossible:", error);
        }

        if (hasAudio) {
            showUnmuteOverlay();
        } else {
            hideUnmuteOverlay();
        }
        return false;
    }

    function getChatNotificationAuthorName(message) {
        if (message?.users?.name) {
            return message.users.name;
        }

        const cachedProfile = getCachedChatProfile(message?.user_id);
        if (cachedProfile?.name) {
            return cachedProfile.name;
        }

        return (
            currentUser?.user_metadata?.full_name ||
            currentUser?.user_metadata?.username ||
            currentUser?.email?.split("@")[0] ||
            "Un viewer"
        );
    }

    function buildLiveChatNotificationMessage(message) {
        const body = String(message?.message || "")
            .replace(/\s+/g, " ")
            .trim();
        if (!body) return "";

        const preview = body.length > 140 ? `${body.slice(0, 137)}...` : body;
        return `${getChatNotificationAuthorName(message)}: ${preview}`;
    }

    async function notifyLiveHostOfChatMessage(message) {
        const streamId = message?.stream_id || currentStream?.id || null;
        const hostId = currentStream?.user_id || null;
        const senderId = message?.user_id || currentUser?.id || null;

        if (!streamId || !hostId || !senderId) return;
        if (hostId === senderId) return;
        if ((currentStream?.status || "live") !== "live") return;

        const notificationMessage = buildLiveChatNotificationMessage(message);
        if (!notificationMessage) return;

        try {
            const { error } = await supabase.from("notifications").insert({
                user_id: hostId,
                type: "live_chat",
                message: notificationMessage,
                link: `stream.html?id=${streamId}&host=${hostId}`,
                read: false,
            });

            if (error) throw error;
        } catch (error) {
            console.warn("Notification chat live impossible:", error);
        }
    }

    // Créer une session de streaming
    async function createStreamingSession(streamData) {
        try {
            // Récupérer les paramètres premium de l'utilisateur
            let isPrivate = false;
            let quality = "sd";

            if (currentUser) {
                const user = getUser(currentUser.id);
                if (user) {
                    // Vérifier si l'utilisateur peut créer des lives privés (Pro)
                    if (
                        typeof hasPrivateLiveAccess === "function" &&
                        hasPrivateLiveAccess(user)
                    ) {
                        isPrivate = user.private_live === true;
                    }
                    // Vérifier si l'utilisateur peut streamer en HD (Pro)
                    if (
                        typeof hasHDStreaming === "function" &&
                        hasHDStreaming(user)
                    ) {
                        quality = user.hd_streaming === true ? "hd" : "sd";
                    }
                }
            }

            const { data, error } = await supabase
                .from("streaming_sessions")
                .insert({
                    user_id: currentUser.id,
                    title: streamData.title,
                    description: streamData.description,
                    thumbnail_url: streamData.thumbnailUrl,
                    status: "live",
                    is_private: isPrivate,
                    quality: quality,
                })
                .select()
                .single();

            if (error) throw error;
            return { success: true, data: data };
        } catch (error) {
            console.error("Erreur création stream:", error);
            return { success: false, error: error.message };
        }
    }

    // Envoyer des notifications aux followers (Standard, Medium, Pro)
    async function notifyFollowersOfLive(stream) {
        try {
            // Récupérer le profil de l'hôte pour vérifier le plan
            const { data: hostProfile, error: profileError } = await supabase
                .from("users")
                .select("plan, plan_status")
                .eq("id", stream.user_id)
                .single();

            if (profileError || !hostProfile) {
                console.warn(
                    "Impossible de récupérer le profil de l'hôte:",
                    profileError,
                );
                return;
            }

            const plan = String(hostProfile.plan || "").toLowerCase();
            const planStatus = String(
                hostProfile.plan_status || "",
            ).toLowerCase();

            // Vérifier que l'utilisateur a un plan actif (Standard, Medium ou Pro)
            const hasPlan =
                planStatus === "active" &&
                ["standard", "medium", "pro"].includes(plan);
            if (!hasPlan) {
                console.log(
                    "Notifications aux followers non activées: plan non éligible",
                );
                return;
            }

            // Récupérer les followers de l'hôte
            const { data: followers, error: followersError } = await supabase
                .from("follows")
                .select("follower_id")
                .eq("following_id", stream.user_id);

            if (followersError || !followers || followers.length === 0) {
                console.log("Aucun follower à notifier");
                return;
            }

            console.log(
                `Envoi de notifications à ${followers.length} follower(s)`,
            );

            // Créer les notifications en batch (limiter à 100 par lot)
            const followerIds = followers.map((f) => f.follower_id);
            const batchSize = 100;

            for (let i = 0; i < followerIds.length; i += batchSize) {
                const batch = followerIds.slice(i, i + batchSize);
                const notifications = batch.map((followerId) => ({
                    user_id: followerId,
                    type: "live_start",
                    message: `🔴 ${currentUser?.name || "Un créateur"} a commencé un live: "${stream.title}"`,
                    link: `stream.html?id=${stream.id}&host=${stream.user_id}`,
                    read: false,
                }));

                const { error: notifError } = await supabase
                    .from("notifications")
                    .upsert(notifications, { onConflict: "user_id,type,link" });

                if (notifError) {
                    console.warn("Erreur création notifications:", notifError);
                }
            }

            console.log("Notifications aux followers envoyées avec succès");
        } catch (error) {
            console.error("Erreur notification followers:", error);
        }
    }

    // Démarrer un stream
    async function startStream(streamData) {
        try {
            // Créer la session
            const result = await createStreamingSession(streamData);
            if (!result.success) throw new Error(result.error);

            currentStream = result.data;

            // Enregistrer immédiatement la présence de l'hôte
            try {
                if (currentUser) {
                    await supabase.from("stream_viewers").upsert(
                        {
                            stream_id: currentStream.id,
                            user_id: currentUser.id,
                            last_seen: new Date().toISOString(),
                        },
                        { onConflict: "stream_id,user_id" },
                    );
                }
            } catch (error) {
                console.warn(
                    "Présence hôte non enregistrée (sera retentée via heartbeat):",
                    error,
                );
            }

            // S'abonner aux événements du stream
            subscribeToStream(currentStream.id);

            // Démarrer le heartbeat pour maintenir la présence
            startViewerHeartbeat(currentStream.id);
            startViewerCountSync(currentStream.id);

            //Notifier les followers (Standard, Medium, Pro) - en arrière-plan
            notifyFollowersOfLive(currentStream).catch((err) =>
                console.warn("Notification followers échouée:", err),
            );

            return { success: true, stream: currentStream };
        } catch (error) {
            console.error("Erreur démarrage stream:", error);
            return { success: false, error: error.message };
        }
    }

    // Rejoindre un stream
    async function joinStream(streamId) {
        try {
            // Enregistrer comme viewer
            const { error } = await supabase.from("stream_viewers").upsert(
                {
                    stream_id: streamId,
                    user_id: currentUser.id,
                    last_seen: new Date().toISOString(),
                },
                { onConflict: "stream_id,user_id" },
            );

            if (error) {
                if (error.code === "23505" || error.status === 409) {
                    // Conflit d'unicité: déjà enregistré comme viewer
                    console.warn("Viewer déjà enregistré, conflit ignoré.");
                } else {
                    throw error;
                }
            }

            // Récupérer les infos du stream
            const { data: stream, error: streamError } = await supabase
                .from("streaming_sessions")
                .select(
                    "*, users(id, name, avatar, plan, plan_status, plan_ends_at)",
                )
                .eq("id", streamId)
                .single();

            if (streamError) throw streamError;

            currentStream = stream;

            // S'abonner aux événements
            subscribeToStream(streamId);

            // Démarrer le heartbeat
            startViewerHeartbeat(streamId);
            startViewerCountSync(streamId);

            // Auto-enable audio+video on stream startup
            await tryAutoEnableStreamAudio();

            return { success: true, stream: stream };
        } catch (error) {
            console.error("Erreur rejoindre stream:", error);
            return { success: false, error: error.message };
        }
    }

    // S'abonner aux événements du stream
    function subscribeToStream(streamId) {
        subscribeToChat(streamId);

        // Canal pour les mises à jour du stream
        streamChannel = supabase
            .channel(`stream-${streamId}`)
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "streaming_sessions",
                    filter: `id=eq.${streamId}`,
                },
                (payload) => {
                    handleStreamUpdate(payload.new);
                },
            )
            .subscribe();

        if (chatSyncInterval) {
            clearInterval(chatSyncInterval);
        }
        lastChatFallbackSyncAt = 0;
        chatSyncInterval = setInterval(() => {
            if (!currentStream?.id) return;
            const now = Date.now();
            const syncCadence =
                chatRealtimeStatus === "SUBSCRIBED"
                    ? CHAT_FALLBACK_STEADY_SYNC_MS
                    : CHAT_FALLBACK_FAST_SYNC_MS;
            if (now - lastChatFallbackSyncAt < syncCadence) return;
            lastChatFallbackSyncAt = now;
            void fetchNewChatMessages(currentStream.id);
        }, CHAT_FALLBACK_POLL_TICK_MS);
    }

    function teardownChatChannel() {
        if (!chatChannel) return;
        supabase.removeChannel(chatChannel);
        chatChannel = null;
        chatRealtimeStatus = "idle";
    }

    function scheduleChatResubscribe(streamId) {
        if (!streamId || chatResubscribeTimer) return;
        chatResubscribeTimer = setTimeout(() => {
            chatResubscribeTimer = null;
            if (!currentStream?.id || currentStream.id !== streamId) return;
            subscribeToChat(streamId);
        }, 1200);
    }

    function subscribeToChat(streamId) {
        teardownChatChannel();
        chatChannel = supabase
            .channel(`stream-chat-${streamId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "stream_messages",
                    filter: `stream_id=eq.${streamId}`,
                },
                (payload) => {
                    void handleNewChatMessage(payload.new);
                },
            )
            .subscribe((status) => {
                chatRealtimeStatus = status;
                if (status === "SUBSCRIBED") {
                    lastChatFallbackSyncAt = 0;
                    void fetchNewChatMessages(streamId);
                    return;
                }
                if (
                    status === "CHANNEL_ERROR" ||
                    status === "TIMED_OUT" ||
                    status === "CLOSED"
                ) {
                    lastChatFallbackSyncAt = 0;
                    scheduleChatResubscribe(streamId);
                }
            });
    }

    // Envoyer un message dans le chat
    async function sendChatMessage(message) {
        if (!currentStream)
            return { success: false, error: "Pas de stream actif" };
        if (!currentUser)
            return { success: false, error: "Utilisateur non connecté" };

        try {
            const { data, error } = await supabase
                .from("stream_messages")
                .insert({
                    stream_id: currentStream.id,
                    user_id: currentUser.id,
                    message: message,
                })
                .select("*, users(name, avatar)")
                .single();

            if (error) throw error;
            // Affichage immédiat côté émetteur (les doublons restent filtrés).
            void handleNewChatMessage(data);
            void notifyLiveHostOfChatMessage(data);

            return { success: true, data: data };
        } catch (error) {
            console.error("Erreur envoi message:", error);
            return { success: false, error: error.message };
        }
    }

    // Charger l'historique du chat
    async function loadChatHistory(streamId, limit = 50) {
        try {
            const { data, error } = await supabase
                .from("stream_messages")
                .select("*, users(name, avatar)")
                .eq("stream_id", streamId)
                .order("created_at", { ascending: false })
                .limit(limit);

            if (error) throw error;

            const messages = data.reverse().map((msg) => {
                if (msg?.users) {
                    cacheChatProfile(msg.user_id, {
                        id: msg.user_id,
                        ...msg.users,
                    });
                } else {
                    const cachedProfile = getCachedChatProfile(msg.user_id);
                    if (cachedProfile) {
                        msg.users = cachedProfile;
                    }
                }
                prepareChatMessageForDisplay(msg, {
                    source: "history",
                });
                const key = getChatMessageKey(msg);
                if (key) renderedChatMessageIds.add(key);
                return msg;
            });
            if (messages.length > 0) {
                const lastMessage = messages[messages.length - 1];
                lastChatCreatedAt = lastMessage.created_at || lastChatCreatedAt;
            }
            return { success: true, messages };
        } catch (error) {
            console.error("Erreur chargement chat:", error);
            return { success: false, error: error.message };
        }
    }

    async function fetchNewChatMessages(streamId) {
        try {
            let query = supabase
                .from("stream_messages")
                .select("*, users(name, avatar)")
                .eq("stream_id", streamId)
                .order("created_at", { ascending: true })
                .limit(50);

            if (lastChatCreatedAt) {
                // gte + déduplication évite les pertes si plusieurs messages partagent le même timestamp.
                query = query.gte("created_at", lastChatCreatedAt);
            }

            const { data, error } = await query;
            if (error) throw error;
            if (!data || data.length === 0) return;
            lastChatFallbackSyncAt = Date.now();

            data.forEach((msg) => {
                void handleNewChatMessage(msg);
            });
        } catch (error) {
            console.warn("Chat sync fallback échoué:", error);
        }
    }

    function getChatMessageKey(message) {
        if (!message) return null;
        if (message.id) return String(message.id);
        const userId = message.user_id || "u";
        const createdAt = message.created_at || "";
        const body = message.message || "";
        return `${userId}:${createdAt}:${body}`;
    }

    // Gérer un nouveau message de chat
    async function handleNewChatMessage(message) {
        const key = getChatMessageKey(message);
        if (key && renderedChatMessageIds.has(key)) return;
        if (key) renderedChatMessageIds.add(key);

        if (message?.users) {
            cacheChatProfile(message.user_id, {
                id: message.user_id,
                ...message.users,
            });
        } else if (message?.user_id) {
            const cachedProfile = getCachedChatProfile(message.user_id);
            if (cachedProfile) {
                message.users = cachedProfile;
            } else if (key) {
                void hydrateChatMessageProfile(message, key);
            }
        }

        if (message.created_at) {
            lastChatCreatedAt = message.created_at;
        }

        prepareChatMessageForDisplay(message, {
            source: "live",
        });
        prepareChatScrollForIncomingMessage();

        if (window.liveChatStore) {
            window.liveChatStore.push(message);
            return;
        }

        const chatContainer = document.getElementById("stream-chat-messages");
        if (!chatContainer) return;

        const messageElement = createChatMessageElement(message);
        chatContainer.appendChild(messageElement);
        handleChatMessagesRendered();
    }

    // Créer un élément de message de chat
    function createChatMessageElement(message) {
        const div = document.createElement("div");
        div.className = "chat-message";
        const messageKey = getChatMessageKey(message);
        if (messageKey) {
            div.dataset.chatKey = messageKey;
        }

        const isOwnMessage = message.user_id === currentUser?.id;
        if (isOwnMessage) div.classList.add("own-message");

        const username =
            message.users?.name || message.user_name || "Utilisateur";
        const userId = message.users?.id || message.user_id;
        const usernameHtml =
            typeof window.renderUsernameWithBadge === "function" && userId
                ? window.renderUsernameWithBadge(username, userId)
                : escapeHtml(username);

        div.innerHTML = `
        <img src="${message.users?.avatar || "https://placehold.co/32"}" class="chat-avatar" alt="${message.users?.name}">
        <div class="chat-message-content">
            <div class="chat-message-header">
                <span class="chat-username">${usernameHtml}</span>
                <span class="chat-timestamp">${formatChatTime(message.created_at)}</span>
            </div>
            <div class="chat-message-text">${escapeHtml(message.message)}</div>
        </div>
    `;

        return div;
    }

    // Gérer une mise à jour du stream
    function handleStreamUpdate(stream) {
        currentStream = stream;

        // Mettre à jour l'UI
        updateStreamUI(stream);

        // Si le stream est terminé
        if (stream.status === "ended") {
            handleStreamEnded();
        }
    }

    // Mettre à jour l'UI du stream
    function updateStreamUI(stream) {
        const viewerCount = document.getElementById("stream-viewer-count");
        if (viewerCount) {
            viewerCount.textContent = stream.viewer_count || 0;
        }

        const chatViewerCount = document.getElementById("chat-viewer-count");
        if (chatViewerCount) {
            chatViewerCount.textContent = stream.viewer_count || 0;
        }

        if ((stream?.status || "live") === "live") {
            setStreamStatusMode("live", {
                host: Boolean(isStreamHost),
                stream: stream || currentStream,
            });
        } else {
            setStreamStatusMode("ended");
        }

        if (typeof stream?.viewer_count === "number") {
            recordViewerSnapshot(stream.viewer_count, hostPanelViewers);
        }
        syncAudiencePreviewMonitors();

        if (isStreamHost) {
            renderHostControlPanel();
            renderHostToolDrawer();
        }
    }

    async function getViewerCountForStream(streamId) {
        if (!streamId) return null;
        try {
            const cutoffIso = new Date(Date.now() - 30000).toISOString();
            const { count, error } = await supabase
                .from("stream_viewers")
                .select("user_id", { count: "exact", head: true })
                .eq("stream_id", streamId)
                .gte("last_seen", cutoffIso);
            if (error) throw error;
            return typeof count === "number" ? count : null;
        } catch (error) {
            console.error("Erreur récupération viewers:", error);
            return null;
        }
    }

    async function syncViewerCount(streamId, { updateSession = false } = {}) {
        const count = await getViewerCountForStream(streamId);
        if (count === null) return;

        if (currentStream) {
            currentStream.viewer_count = count;
        }
        updateStreamUI({
            viewer_count: count,
            status: currentStream?.status || "live",
        });

        if (updateSession) {
            try {
                await supabase
                    .from("streaming_sessions")
                    .update({ viewer_count: count })
                    .eq("id", streamId);
            } catch (error) {
                console.error("Erreur update viewer_count:", error);
            }
        }

        if (
            isStreamHost &&
            (activeHostToolId === "moderators" || activeHostToolId === "stats")
        ) {
            void fetchHostPanelViewers();
        }
    }

    function startViewerCountSync(streamId) {
        if (viewerCountInterval) {
            clearInterval(viewerCountInterval);
            viewerCountInterval = null;
        }
        const shouldUpdateSession = !!isStreamHost;
        syncViewerCount(streamId, { updateSession: shouldUpdateSession });
        const intervalMs = shouldUpdateSession ? 10000 : 15000;
        viewerCountInterval = setInterval(() => {
            syncViewerCount(streamId, { updateSession: shouldUpdateSession });
        }, intervalMs);
    }

    async function finalizeCurrentHostLiveOnServer(
        endedAtIso = new Date().toISOString(),
    ) {
        if (!currentStream?.id || !isStreamHost) {
            return { success: false, skipped: true };
        }

        const ownerId = currentUser?.id || currentStream?.user_id || null;

        try {
            let query = supabase
                .from("streaming_sessions")
                .update({
                    status: "ended",
                    ended_at: endedAtIso,
                })
                .eq("id", currentStream.id)
                .eq("status", "live");

            if (ownerId) {
                query = query.eq("user_id", ownerId);
            }

            const { error } = await query;
            if (error) throw error;

            currentStream.status = "ended";
            currentStream.ended_at = endedAtIso;

            return { success: true };
        } catch (error) {
            return { success: false, error: error?.message || String(error) };
        }
    }

    // Terminer un stream
    async function endStream() {
        if (!currentStream)
            return { success: false, error: "Pas de stream actif" };

        try {
            const result = await finalizeCurrentHostLiveOnServer();
            if (!result.success) {
                throw new Error(
                    result.error || "Impossible de terminer le live",
                );
            }

            // Nettoyer
            cleanupStream();

            return { success: true };
        } catch (error) {
            console.error("Erreur fin stream:", error);
            return { success: false, error: error.message };
        }
    }

    // Quitter un stream
    function leaveStream() {
        if (isStreamHost && currentStream?.id) {
            // Best effort: try to close the live server-side before cleanup/navigation.
            void finalizeCurrentHostLiveOnServer().then((result) => {
                if (!result.success && !result.skipped) {
                    console.warn(
                        "Fermeture live à la sortie non confirmée:",
                        result.error || result,
                    );
                }
            });
        }

        cleanupStream();

        // Rediriger vers la page discover
        if (typeof navigateTo === "function") {
            navigateTo("discover");
        }
    }

    // Nettoyer les ressources du stream
    function cleanupStream() {
        // Arrêter le heartbeat
        if (viewerHeartbeat) {
            clearInterval(viewerHeartbeat);
            viewerHeartbeat = null;
        }
        if (viewerCountInterval) {
            clearInterval(viewerCountInterval);
            viewerCountInterval = null;
        }
        if (chatSyncInterval) {
            clearInterval(chatSyncInterval);
            chatSyncInterval = null;
        }
        if (chatResubscribeTimer) {
            clearTimeout(chatResubscribeTimer);
            chatResubscribeTimer = null;
        }
        if (hostBadgeRefreshInterval) {
            clearInterval(hostBadgeRefreshInterval);
            hostBadgeRefreshInterval = null;
        }

        // Se désabonner des canaux
        teardownChatChannel();

        if (streamChannel) {
            supabase.removeChannel(streamChannel);
            streamChannel = null;
        }

        if (signalChannel) {
            supabase.removeChannel(signalChannel);
            signalChannel = null;
        }

        if (previewHeartbeat) {
            clearInterval(previewHeartbeat);
            previewHeartbeat = null;
        }
        previewCanvas = null;
        previewCtx = null;
        previewInFlight = false;
        lastPreviewStamp = 0;
        cleanupScreenComposite();
        cleanupCameraPlaceholderTrack();
        clearStandbyCameraTrack();
        clearPendingMobileScreenShareActivation();

        if (localMediaStream) {
            localMediaStream.getTracks().forEach((track) => {
                try {
                    track.stop();
                } catch (e) {}
            });
        }

        if (hostMicStream) {
            hostMicStream.getTracks().forEach((track) => {
                try {
                    track.stop();
                } catch (e) {}
            });
            hostMicStream = null;
        }

        if (hostAudioContext) {
            try {
                hostAudioContext.close();
            } catch (e) {}
            hostAudioContext = null;
        }
        stopStreamDurationTimer();
        streamStartedAtMs = 0;

        peerConnections.forEach((pc) => {
            try {
                pc.close();
            } catch (e) {}
        });
        peerConnections.clear();
        localMediaStream = null;
        activeStreamId = null;
        isStreamHost = false;
        pendingViewerJoins.clear();
        renderedChatMessageIds.clear();
        lastChatCreatedAt = null;
        lastChatFallbackSyncAt = 0;
        chatRealtimeStatus = "idle";
        chatPinnedToBottom = true;
        chatShouldStickOnNextRender = true;
        chatUnseenCount = 0;
        activeHostToolId = "";
        liveStudioState = null;
        hostPanelViewers = [];
        hostPanelViewersLoading = false;
        isCameraEnabled = true;
        availableHostVideoInputs = 0;

        currentStream = null;
    }

    function getRtcConfig() {
        return {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
            ],
        };
    }

    function sendSignal(payload) {
        if (!signalChannel) return;
        signalChannel.send({
            type: "broadcast",
            event: "signal",
            payload: payload,
        });
    }

    function createPeerConnection(peerId, isHostSide) {
        const pc = new RTCPeerConnection(getRtcConfig());

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignal({
                    type: "ice",
                    streamId: activeStreamId,
                    from: currentUser?.id || null,
                    to: peerId,
                    candidate: event.candidate,
                });
            }
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            if (
                state === "failed" ||
                state === "closed" ||
                state === "disconnected"
            ) {
                try {
                    pc.close();
                } catch (e) {}
                peerConnections.delete(peerId);
            }
        };

        if (!isHostSide) {
            pc.ontrack = (event) => {
                const [remoteStream] = event.streams || [];
                if (!remoteStream) return;
                const video = document.getElementById("stream-video");
                if (video) {
                    video.srcObject = remoteStream;
                    video.autoplay = true;
                    video.playsInline = true;
                    syncAudiencePreviewMonitors();
                }
                const hasAudio = remoteStream.getAudioTracks().length > 0;
                if (video) {
                    void tryAutoplayLiveWithAudio(video, { hasAudio });
                }
                if (!hasAudio && window.ToastManager) {
                    ToastManager.info(
                        "Audio du live",
                        "Aucune piste audio reçue. Vérifiez que l’hôte partage bien le micro ou l’audio de l’écran.",
                    );
                }
                setViewerWaiting(false);
            };
        }

        return pc;
    }

    async function handleViewerJoin(viewerId) {
        if (!viewerId) return;
        if (!localMediaStream) {
            pendingViewerJoins.add(viewerId);
            return;
        }

        const pc = createPeerConnection(viewerId, true);
        peerConnections.set(viewerId, pc);

        localMediaStream.getTracks().forEach((track) => {
            pc.addTrack(track, localMediaStream);
        });

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal({
                type: "offer",
                streamId: activeStreamId,
                from: currentUser?.id || null,
                to: viewerId,
                sdp: pc.localDescription,
            });
        } catch (error) {
            console.error("Erreur création offer WebRTC:", error);
        }
    }

    async function handleOffer(payload) {
        const hostId = payload?.from;
        if (!hostId) return;

        let pc = peerConnections.get(hostId);
        if (!pc) {
            pc = createPeerConnection(hostId, false);
            peerConnections.set(hostId, pc);
        }

        try {
            await pc.setRemoteDescription(
                new RTCSessionDescription(payload.sdp),
            );
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal({
                type: "answer",
                streamId: activeStreamId,
                from: currentUser?.id || null,
                to: hostId,
                sdp: pc.localDescription,
            });
        } catch (error) {
            console.error("Erreur réponse offer WebRTC:", error);
        }
    }

    async function handleAnswer(payload) {
        const viewerId = payload?.from;
        if (!viewerId) return;
        const pc = peerConnections.get(viewerId);
        if (!pc) return;
        try {
            await pc.setRemoteDescription(
                new RTCSessionDescription(payload.sdp),
            );
        } catch (error) {
            console.error("Erreur setRemoteDescription answer:", error);
        }
    }

    async function handleIce(payload) {
        const peerId = payload?.from;
        if (!peerId) return;
        const pc = peerConnections.get(peerId);
        if (!pc) return;
        try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (error) {
            console.error("Erreur ICE candidate:", error);
        }
    }

    function initWebRtcSignaling(streamId, isHost) {
        if (!streamId) return;
        activeStreamId = streamId;
        isStreamHost = isHost;

        if (signalChannel) {
            supabase.removeChannel(signalChannel);
        }

        signalChannel = supabase
            .channel(`stream-signal-${streamId}`)
            .on("broadcast", { event: "signal" }, ({ payload }) => {
                if (!payload || payload.streamId !== activeStreamId) return;
                if (payload.to && payload.to !== currentUser?.id) return;

                if (payload.type === "viewer-join" && isStreamHost) {
                    handleViewerJoin(payload.from);
                } else if (payload.type === "offer" && !isStreamHost) {
                    handleOffer(payload);
                } else if (payload.type === "answer" && isStreamHost) {
                    handleAnswer(payload);
                } else if (payload.type === "ice") {
                    handleIce(payload);
                }
            })
            .subscribe((status) => {
                if (status === "SUBSCRIBED" && !isStreamHost) {
                    sendSignal({
                        type: "viewer-join",
                        streamId: activeStreamId,
                        from: currentUser?.id || null,
                        to: null,
                    });
                }
            });
    }

    // Démarrer la mise à jour des previews (frames) pour Discover
    function startLivePreviewUpdates(streamId) {
        if (!streamId || !supabase) return;
        if (previewHeartbeat) clearInterval(previewHeartbeat);
        previewCanvas = previewCanvas || document.createElement("canvas");
        previewCtx =
            previewCtx ||
            previewCanvas.getContext("2d", { willReadFrequently: true });

        const updatePreview = async () => {
            if (previewInFlight) return;
            if (!currentStream || currentStream.id !== streamId) return;
            if (document.hidden) return;

            const video = document.getElementById("stream-video");
            if (!video || video.readyState < 2) return;

            const now = Date.now();
            if (now - lastPreviewStamp < 3000) return;
            lastPreviewStamp = now;

            const maxWidth = 480;
            const vw = video.videoWidth || 1280;
            const vh = video.videoHeight || 720;
            const scale = Math.min(1, maxWidth / vw);
            const tw = Math.max(1, Math.floor(vw * scale));
            const th = Math.max(1, Math.floor(vh * scale));

            previewCanvas.width = tw;
            previewCanvas.height = th;
            previewCtx.drawImage(video, 0, 0, tw, th);

            let dataUrl = "";
            try {
                dataUrl = previewCanvas.toDataURL("image/jpeg", 0.65);
            } catch (e) {
                return;
            }

            previewInFlight = true;
            try {
                await supabase
                    .from("streaming_sessions")
                    .update({ thumbnail_url: dataUrl })
                    .eq("id", streamId);
            } catch (error) {
                console.error("Erreur update preview live:", error);
            } finally {
                previewInFlight = false;
            }
        };

        // Premier push rapide
        setTimeout(updatePreview, 800);
        previewHeartbeat = setInterval(updatePreview, 15000);
    }

    // Démarrer le heartbeat pour maintenir la présence
    function startViewerHeartbeat(streamId) {
        const touch = async () => {
            if (!currentUser) return;
            try {
                await supabase.from("stream_viewers").upsert(
                    {
                        stream_id: streamId,
                        user_id: currentUser.id,
                        last_seen: new Date().toISOString(),
                    },
                    { onConflict: "stream_id,user_id" }, // sinon le heartbeat échoue sur la contrainte UNIQUE et n'actualise plus last_seen
                );
            } catch (error) {
                console.error("Erreur heartbeat:", error);
            }
        };
        // Premier ping immédiat
        touch();
        // Mettre à jour toutes les 20 secondes
        viewerHeartbeat = setInterval(touch, 20000);
    }

    // Gérer la fin du stream
    function handleStreamEnded() {
        setChatEnabled(false);
        if (chatSyncInterval) {
            clearInterval(chatSyncInterval);
            chatSyncInterval = null;
        }

        setStreamStatusMode("ended");

        const followBtn = document.getElementById("follow-btn");
        const shareBtn = document.getElementById("share-btn");
        const buttons = [followBtn, shareBtn].filter(Boolean);
        buttons.forEach((btn) => {
            btn.disabled = true;
            btn.classList.add("disabled");
            btn.style.opacity = "0.6";
            btn.style.cursor = "not-allowed";
        });

        showStreamEndedMessage();
    }

    // Récupérer les streams en direct
    async function getLiveStreams() {
        try {
            const { data, error } = await supabase
                .from("streaming_sessions")
                .select(
                    "*, users(id, name, avatar, plan, plan_status, plan_ends_at)",
                )
                .eq("status", "live")
                .order("started_at", { ascending: false });

            if (error) throw error;

            return { success: true, streams: data };
        } catch (error) {
            console.error("Erreur récupération streams:", error);
            return { success: false, error: error.message };
        }
    }

    // Formater le temps pour le chat
    function formatChatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    // Échapper le HTML pour éviter les XSS
    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    function syncAudioButtonState(isMuted) {
        const audioBtn = document.getElementById("audio-toggle-btn");
        if (!audioBtn) return;
        audioBtn.classList.toggle("active", !isMuted);
    }

    function isMobileDevice() {
        return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    }

    function clearPendingMobileScreenShareActivation() {
        if (typeof pendingMobileScreenShareCleanup === "function") {
            pendingMobileScreenShareCleanup();
        }
        pendingMobileScreenShareCleanup = null;
        pendingMobileScreenShareActivation = false;
    }

    function queueMobileScreenShareActivation() {
        if (!isMobileDevice() || !navigator.mediaDevices?.getDisplayMedia)
            return;
        if (pendingMobileScreenShareActivation || isScreenSharing) return;

        pendingMobileScreenShareActivation = true;

        const trigger = () => {
            clearPendingMobileScreenShareActivation();
            if (!isScreenSharing) {
                void shareScreen();
            }
        };

        const onTouchEnd = () => trigger();
        const onClick = () => trigger();

        document.addEventListener("touchend", onTouchEnd, { once: true });
        document.addEventListener("click", onClick, { once: true });

        pendingMobileScreenShareCleanup = () => {
            document.removeEventListener("touchend", onTouchEnd);
            document.removeEventListener("click", onClick);
        };

        if (window.ToastManager) {
            ToastManager.info(
                "Partage d’écran",
                "Touchez l’écran pour confirmer le partage sur mobile.",
            );
        }
    }

    function toggleAudio() {
        const video = document.getElementById("stream-video");
        if (!video) return;
        video.muted = !video.muted;
        syncAudioButtonState(video.muted);
        if (!video.muted) {
            hideUnmuteOverlay();
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === "function") {
                playPromise.catch(() => {
                    video.muted = true;
                    syncAudioButtonState(true);
                    showUnmuteOverlay();
                });
            }
        }
    }

    function showUnmuteOverlay() {
        const overlay = document.getElementById("unmute-overlay");
        const video = document.getElementById("stream-video");
        if (!overlay || !video) return;
        if (video.muted) {
            overlay.style.display = "flex";
        }
    }

    function hideUnmuteOverlay() {
        const overlay = document.getElementById("unmute-overlay");
        if (overlay) overlay.style.display = "none";
    }

    async function tryAutoEnableStreamAudio() {
        const video = document.getElementById("stream-video");
        if (!video) return false;

        try {
            // Try to auto-enable audio if browser allows it
            video.muted = false;
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === "function") {
                await playPromise;
                syncAudioButtonState(false);
                hideUnmuteOverlay();
                return true;
            }
        } catch (error) {
            console.warn("Auto audio enable failed (browser policy):", error);
            // Fallback: show unmute overlay
            video.muted = true;
            syncAudioButtonState(true);
            showUnmuteOverlay();
            return false;
        }
    }

    function enableStreamAudio() {
        const video = document.getElementById("stream-video");
        if (!video) return;
        video.muted = false;
        syncAudioButtonState(false);
        hideUnmuteOverlay();
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => {
                video.muted = true;
                syncAudioButtonState(true);
                showUnmuteOverlay();
            });
        }
    }

    function updateMicButtonState() {
        const micBtn = document.getElementById("mute-mic-btn");
        if (!micBtn) return;
        micBtn.classList.toggle("active", isMicMuted);
        const label = micBtn.querySelector(".btn-text");
        if (label) {
            label.textContent = isMicMuted ? "Micro coupé" : "Muet";
        }
        if (isStreamHost) {
            renderHostControlPanel();
            renderHostToolDrawer();
        }
    }

    function updateScreenShareButtonState() {
        const shareBtn = document.getElementById("share-screen-btn");
        if (!shareBtn) return;
        shareBtn.classList.toggle("active", isScreenSharing);
        const label = shareBtn.querySelector(".btn-text");
        if (label) {
            label.textContent = isScreenSharing ? "Arrêter écran" : "Écran";
        }
        if (isStreamHost) {
            renderHostControlPanel();
            renderHostToolDrawer();
        }
    }

    function updateCameraButtonsState() {
        const toggleBtn = document.getElementById("camera-toggle-btn");
        if (toggleBtn) {
            toggleBtn.classList.toggle("active", !isCameraEnabled);
            const label = toggleBtn.querySelector(".btn-text");
            if (label) {
                if (isScreenSharing) {
                    label.textContent = isCameraEnabled
                        ? "Camera PiP"
                        : "Activer camera";
                } else {
                    label.textContent = isCameraEnabled
                        ? "Camera ON"
                        : "Camera OFF";
                }
            }
            toggleBtn.title = isCameraEnabled
                ? "Desactiver la camera sans couper le live"
                : "Reactiver la camera";
        }

        const switchBtn = document.getElementById("switch-camera-btn");
        if (!switchBtn) return;
        const label = switchBtn.querySelector(".btn-text");
        if (label) {
            label.textContent = "Changer";
        }
        switchBtn.disabled = !isCameraEnabled || availableHostVideoInputs < 2;
        switchBtn.classList.toggle("disabled", switchBtn.disabled);
        if (!isCameraEnabled) {
            switchBtn.title = "Reactivez la camera pour changer de capteur";
        } else if (availableHostVideoInputs < 2) {
            switchBtn.title = "Une seule camera detectee";
        }
        if (isStreamHost) {
            renderHostControlPanel();
            renderHostToolDrawer();
        }
    }

    function stopMediaStream(stream) {
        if (!stream) return;
        stream.getTracks().forEach((track) => {
            try {
                track.stop();
            } catch (e) {}
        });
    }

    function cleanupScreenComposite({
        keepDisplay = false,
        keepOverlayCamera = false,
    } = {}) {
        if (screenCompositeRaf) {
            cancelAnimationFrame(screenCompositeRaf);
            screenCompositeRaf = null;
        }

        if (screenCompositeDisplayVideo) {
            try {
                screenCompositeDisplayVideo.pause();
            } catch (e) {}
            screenCompositeDisplayVideo.srcObject = null;
        }
        if (screenCompositeCameraVideo) {
            try {
                screenCompositeCameraVideo.pause();
            } catch (e) {}
            screenCompositeCameraVideo.srcObject = null;
        }

        if (screenCompositeStream) {
            stopMediaStream(screenCompositeStream);
            screenCompositeStream = null;
        }

        if (!keepDisplay && activeDisplayStream) {
            stopMediaStream(activeDisplayStream);
            activeDisplayStream = null;
        }
        if (!keepOverlayCamera && screenOverlayCameraStream) {
            stopMediaStream(screenOverlayCameraStream);
            screenOverlayCameraStream = null;
        }

        screenCompositeCanvas = null;
        screenCompositeCtx = null;
        isScreenCompositeMode = false;
    }

    function waitVideoReady(videoEl) {
        return new Promise((resolve) => {
            if (videoEl.readyState >= 2) {
                resolve();
                return;
            }
            const onLoaded = () => {
                videoEl.removeEventListener("loadedmetadata", onLoaded);
                resolve();
            };
            videoEl.addEventListener("loadedmetadata", onLoaded, {
                once: true,
            });
        });
    }

    async function buildScreenCameraCompositeTrack(
        displayStream,
        cameraStream,
    ) {
        const displayTrack = displayStream?.getVideoTracks?.()[0];
        const cameraTrack = cameraStream?.getVideoTracks?.()[0];
        if (!displayTrack || !cameraTrack) return null;

        screenCompositeDisplayVideo =
            screenCompositeDisplayVideo || document.createElement("video");
        screenCompositeCameraVideo =
            screenCompositeCameraVideo || document.createElement("video");
        const displayVideo = screenCompositeDisplayVideo;
        const cameraVideo = screenCompositeCameraVideo;

        displayVideo.srcObject = displayStream;
        cameraVideo.srcObject = cameraStream;
        displayVideo.muted = true;
        cameraVideo.muted = true;
        displayVideo.playsInline = true;
        cameraVideo.playsInline = true;

        const playDisplay = displayVideo.play();
        const playCamera = cameraVideo.play();
        if (playDisplay && typeof playDisplay.catch === "function")
            playDisplay.catch(() => {});
        if (playCamera && typeof playCamera.catch === "function")
            playCamera.catch(() => {});
        await Promise.all([
            waitVideoReady(displayVideo),
            waitVideoReady(cameraVideo),
        ]);

        const settings = displayTrack.getSettings?.() || {};
        const width = Number(settings.width) || displayVideo.videoWidth || 1280;
        const height =
            Number(settings.height) || displayVideo.videoHeight || 720;

        screenCompositeCanvas =
            screenCompositeCanvas || document.createElement("canvas");
        screenCompositeCanvas.width = width;
        screenCompositeCanvas.height = height;
        screenCompositeCtx =
            screenCompositeCtx || screenCompositeCanvas.getContext("2d");
        const ctx = screenCompositeCtx;
        if (!ctx) return null;

        const draw = () => {
            if (!activeDisplayStream || !screenOverlayCameraStream) return;
            ctx.drawImage(displayVideo, 0, 0, width, height);

            const pipWidth = Math.floor(width * 0.24);
            const ratio =
                cameraVideo.videoWidth && cameraVideo.videoHeight
                    ? cameraVideo.videoWidth / cameraVideo.videoHeight
                    : 16 / 9;
            const pipHeight = Math.floor(pipWidth / Math.max(0.1, ratio));
            const margin = Math.max(14, Math.floor(width * 0.012));
            const x = width - pipWidth - margin;
            const y = height - pipHeight - margin;

            ctx.fillStyle = "rgba(0,0,0,0.45)";
            ctx.fillRect(x - 4, y - 4, pipWidth + 8, pipHeight + 8);
            ctx.drawImage(cameraVideo, x, y, pipWidth, pipHeight);

            screenCompositeRaf = requestAnimationFrame(draw);
        };
        if (screenCompositeRaf) {
            cancelAnimationFrame(screenCompositeRaf);
            screenCompositeRaf = null;
        }
        draw();

        screenCompositeStream = screenCompositeCanvas.captureStream(30);
        return screenCompositeStream.getVideoTracks()[0] || null;
    }

    function setHostVideoTrack(newTrack, options = {}) {
        if (!newTrack) return;
        const stopPreviousTrack = options.stopPreviousTrack !== false;
        if (!localMediaStream) {
            localMediaStream = new MediaStream();
        }

        const currentTrack = localMediaStream.getVideoTracks()[0];
        if (currentTrack && currentTrack !== newTrack) {
            localMediaStream.removeTrack(currentTrack);
            if (stopPreviousTrack) {
                try {
                    currentTrack.stop();
                } catch (e) {}
            }
        }

        if (!localMediaStream.getVideoTracks().includes(newTrack)) {
            localMediaStream.addTrack(newTrack);
        }

        replaceTrackForPeers("video", newTrack);

        const video = document.getElementById("stream-video");
        if (video) {
            video.srcObject = localMediaStream;
            applyLivePreviewFilter();
        }
    }

    async function restoreCameraBroadcast() {
        if (activeDisplayStream) {
            const restored = await refreshScreenShareVideoTrack({
                preferCameraOverlay: true,
            });
            isCameraEnabled = restored;
            updateCameraButtonsState();
            return restored;
        }

        const currentTrack = getCurrentHostVideoTrack();
        const reusableTrack =
            standbyCameraTrack && standbyCameraTrack.readyState === "live"
                ? standbyCameraTrack
                : null;

        if (reusableTrack) {
            markTrackSource(reusableTrack, "camera");
            setHostVideoTrack(reusableTrack, {
                stopPreviousTrack: !isTrackSource(currentTrack, "screen"),
            });
            currentVideoDeviceId =
                reusableTrack.getSettings?.().deviceId || currentVideoDeviceId;
            lastCameraDeviceId = currentVideoDeviceId || lastCameraDeviceId;
            standbyCameraTrack = null;
            cleanupCameraPlaceholderTrack();
            isCameraEnabled = true;
            updateCameraButtonsState();
            return true;
        }

        await startCameraStream(lastCameraDeviceId || null);
        isCameraEnabled = true;
        updateCameraButtonsState();
        return true;
    }

    async function disableCameraBroadcast() {
        if (activeDisplayStream) {
            await refreshScreenShareVideoTrack({
                preferCameraOverlay: false,
            });
            isCameraEnabled = false;
            updateCameraButtonsState();
            return true;
        }

        const currentTrack = getCurrentHostVideoTrack();
        if (currentTrack && isTrackSource(currentTrack, "camera")) {
            clearStandbyCameraTrack();
            standbyCameraTrack = currentTrack;
        }

        const placeholderTrack = createCameraPlaceholderTrack();
        if (!placeholderTrack) return false;

        setHostVideoTrack(placeholderTrack, {
            stopPreviousTrack: false,
        });
        isCameraEnabled = false;
        updateCameraButtonsState();
        return true;
    }

    async function toggleCameraBroadcast() {
        try {
            if (isCameraEnabled) {
                return await disableCameraBroadcast();
            }
            return await restoreCameraBroadcast();
        } catch (error) {
            console.error("Camera toggle error:", error);
            if (window.ToastManager) {
                ToastManager.error(
                    "Camera",
                    error?.message || "Impossible de modifier la camera.",
                );
            }
            return false;
        }
    }

    async function refreshScreenShareVideoTrack(options = {}) {
        if (!activeDisplayStream) return false;

        const preferCameraOverlay =
            options.preferCameraOverlay !== undefined
                ? options.preferCameraOverlay
                : isCameraEnabled;
        const displayTrack = activeDisplayStream.getVideoTracks?.()[0];
        if (!displayTrack) return false;

        markTrackSource(displayTrack, "screen");

        if (preferCameraOverlay) {
            let overlayStream = screenOverlayCameraStream;
            let overlayTrack = overlayStream?.getVideoTracks?.()[0];

            if (!overlayTrack || overlayTrack.readyState !== "live") {
                overlayStream = await requestOverlayCameraStream();
                overlayTrack = overlayStream?.getVideoTracks?.()[0];
                if (overlayTrack) {
                    screenOverlayCameraStream = overlayStream;
                    lastCameraDeviceId =
                        overlayTrack.getSettings?.().deviceId ||
                        lastCameraDeviceId;
                }
            }

            if (overlayTrack) {
                const compositeTrack = await buildScreenCameraCompositeTrack(
                    activeDisplayStream,
                    overlayStream,
                );
                if (compositeTrack) {
                    markTrackSource(compositeTrack, "screen-composite");
                    const currentTrack = getCurrentHostVideoTrack();
                    setHostVideoTrack(compositeTrack, {
                        stopPreviousTrack: !isTrackSource(
                            currentTrack,
                            "screen",
                        ),
                    });
                    isScreenCompositeMode = true;
                    isCameraEnabled = true;
                    updateScreenShareButtonState();
                    updateCameraButtonsState();
                    return true;
                }
            }
        }

        cleanupScreenComposite({ keepDisplay: true, keepOverlayCamera: false });
        const currentTrack = getCurrentHostVideoTrack();
        setHostVideoTrack(displayTrack, {
            stopPreviousTrack: !isTrackSource(currentTrack, "screen"),
        });
        isScreenCompositeMode = false;
        isCameraEnabled = false;
        updateScreenShareButtonState();
        updateCameraButtonsState();
        return false;
    }

    async function requestOverlayCameraStream() {
        if (!navigator.mediaDevices?.getUserMedia) return null;
        const constraints = lastCameraDeviceId
            ? {
                  video: { deviceId: { exact: lastCameraDeviceId } },
                  audio: false,
              }
            : {
                  video: isMobileDevice()
                      ? { ...MOBILE_VIDEO_CONSTRAINTS }
                      : {
                            width: { ideal: 1280 },
                            height: { ideal: 720 },
                            frameRate: { ideal: 30 },
                        },
                  audio: false,
              };
        try {
            return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
            return null;
        }
    }

    async function stopScreenShareAndRestoreCamera() {
        cleanupScreenComposite();
        isScreenSharing = false;
        updateScreenShareButtonState();
        try {
            if (isCameraEnabled) {
                if (lastCameraDeviceId) {
                    await startCameraStream(lastCameraDeviceId);
                } else {
                    await startCameraStream();
                }
            } else {
                await disableCameraBroadcast();
            }
        } catch (error) {
            console.warn("Retour caméra impossible après arrêt écran:", error);
        }
    }

    function replaceTrackForPeers(kind, newTrack) {
        peerConnections.forEach((pc) => {
            const sender = pc
                .getSenders()
                .find((s) => s.track && s.track.kind === kind);
            if (sender) {
                sender.replaceTrack(newTrack).catch((err) => {
                    console.warn("replaceTrack échoué:", err);
                });
            }
        });
    }

    async function startCameraStream(deviceId = null) {
        if (!navigator.mediaDevices?.getUserMedia) return;
        if (isScreenSharing || activeDisplayStream || screenCompositeStream) {
            cleanupScreenComposite();
        }
        const constraints = deviceId
            ? { video: { deviceId: { exact: deviceId } }, audio: false }
            : {
                  video: isMobileDevice()
                      ? { ...MOBILE_VIDEO_CONSTRAINTS }
                      : {
                            width: { ideal: 1280 },
                            height: { ideal: 720 },
                            frameRate: { ideal: 30 },
                        },
                  audio: false,
              };
        const newStream =
            await navigator.mediaDevices.getUserMedia(constraints);
        const newTrack = markTrackSource(
            newStream.getVideoTracks()[0],
            "camera",
        );
        if (!newTrack) return;

        clearStandbyCameraTrack();
        cleanupCameraPlaceholderTrack();
        setHostVideoTrack(newTrack, { stopPreviousTrack: true });
        currentVideoDeviceId =
            newTrack.getSettings?.().deviceId || deviceId || null;
        lastCameraDeviceId = currentVideoDeviceId || lastCameraDeviceId;
        isCameraEnabled = true;
        isScreenSharing = false;
        isScreenCompositeMode = false;
        updateScreenShareButtonState();
        updateCameraButtonsState();
    }

    async function switchCamera() {
        if (!localMediaStream || !navigator.mediaDevices?.enumerateDevices)
            return;

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === "videoinput");
        if (videoInputs.length === 0) return;

        const currentTrack = localMediaStream.getVideoTracks()[0];
        const currentId =
            currentTrack?.getSettings?.().deviceId || currentVideoDeviceId;
        const currentIndex = videoInputs.findIndex(
            (d) => d.deviceId === currentId,
        );
        const nextIndex =
            currentIndex === -1 ? 0 : (currentIndex + 1) % videoInputs.length;
        const nextDevice = videoInputs[nextIndex];
        if (!nextDevice) return;

        await startCameraStream(nextDevice.deviceId);
    }

    function toggleMicMute() {
        if (!localMediaStream) return;
        const audioTracks = localMediaStream.getAudioTracks();
        if (audioTracks.length === 0) return;
        isMicMuted = !isMicMuted;
        audioTracks.forEach((track) => {
            track.enabled = !isMicMuted;
        });
        updateMicButtonState();
    }

    async function shareScreen() {
        if (!navigator.mediaDevices?.getDisplayMedia) return;
        if (isShareScreenRequestInFlight) return;
        if (isScreenSharing) {
            await stopScreenShareAndRestoreCamera();
            return;
        }
        isShareScreenRequestInFlight = true;
        clearPendingMobileScreenShareActivation();
        try {
            cleanupScreenComposite();
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
            });
            const displayTrack = markTrackSource(
                displayStream.getVideoTracks()[0],
                "screen",
            );
            if (!displayTrack) return;

            activeDisplayStream = displayStream;
            let overlayStream = null;
            const existingCameraTrack =
                isCameraEnabled &&
                isTrackSource(localMediaStream?.getVideoTracks?.()[0], "camera")
                    ? localMediaStream.getVideoTracks()[0]
                    : null;
            if (isCameraEnabled && existingCameraTrack && !isScreenSharing) {
                overlayStream = new MediaStream([existingCameraTrack.clone()]);
            } else if (isCameraEnabled) {
                overlayStream = await requestOverlayCameraStream();
            }
            screenOverlayCameraStream = overlayStream;
            const overlayTrack = overlayStream?.getVideoTracks?.()[0];
            const overlayDeviceId =
                overlayTrack?.getSettings?.().deviceId || null;
            if (overlayDeviceId) {
                lastCameraDeviceId = overlayDeviceId;
            }

            let outgoingVideoTrack = displayTrack;
            if (isCameraEnabled && overlayStream?.getVideoTracks?.().length) {
                const compositeTrack = await buildScreenCameraCompositeTrack(
                    displayStream,
                    overlayStream,
                );
                if (compositeTrack) {
                    markTrackSource(compositeTrack, "screen-composite");
                    outgoingVideoTrack = compositeTrack;
                    isScreenCompositeMode = true;
                }
            }

            setHostVideoTrack(outgoingVideoTrack, { stopPreviousTrack: true });

            isScreenSharing = true;
            updateScreenShareButtonState();
            updateCameraButtonsState();

            displayTrack.onended = () => {
                void stopScreenShareAndRestoreCamera();
            };
        } catch (error) {
            console.warn("Partage écran annulé ou impossible:", error);
            const needGestureRetry =
                isMobileDevice() &&
                (error?.name === "NotAllowedError" ||
                    error?.name === "InvalidStateError");
            if (needGestureRetry) {
                queueMobileScreenShareActivation();
            } else if (window.ToastManager) {
                ToastManager.error(
                    "Partage d’écran",
                    "Impossible de démarrer le partage pour le moment.",
                );
            }
        } finally {
            isShareScreenRequestInFlight = false;
        }
    }

    function setupHostControls() {
        const endBtn = document.getElementById("end-stream-btn");
        const cameraToggleBtn = document.getElementById("camera-toggle-btn");
        const switchBtn = document.getElementById("switch-camera-btn");
        const micBtn = document.getElementById("mute-mic-btn");
        const shareBtn = document.getElementById("share-screen-btn");

        if (endBtn && !endBtn.dataset.bound) {
            endBtn.dataset.bound = "true";
            endBtn.addEventListener("click", async () => {
                if (confirm("Voulez-vous vraiment arrêter le live ?")) {
                    try {
                        endBtn.disabled = true;
                        endBtn.style.opacity = "0.7";
                        const result = await endStream();
                        if (!result || !result.success) {
                            const message =
                                result?.error ||
                                "Impossible de terminer le live";
                            console.error("Fin du live échouée:", message);
                            if (window.ToastManager) {
                                ToastManager.error("Erreur", message);
                            } else {
                                alert(message);
                            }
                            endBtn.disabled = false;
                            endBtn.style.opacity = "";
                            return;
                        }
                        if (localMediaStream) {
                            localMediaStream
                                .getTracks()
                                .forEach((track) => track.stop());
                        }
                        window.location.href = "index.html";
                    } catch (error) {
                        console.error("Erreur bouton fin de live:", error);
                        if (window.ToastManager) {
                            ToastManager.error(
                                "Erreur",
                                error?.message ||
                                    "Impossible de terminer le live",
                            );
                        }
                        endBtn.disabled = false;
                        endBtn.style.opacity = "";
                    }
                }
            });
        }

        if (shareBtn && !navigator.mediaDevices?.getDisplayMedia) {
            shareBtn.disabled = true;
            shareBtn.classList.add("disabled");
            shareBtn.title =
                "Partage écran indisponible sur ce navigateur/appareil";
        }

        if (cameraToggleBtn && !cameraToggleBtn.dataset.bound) {
            cameraToggleBtn.dataset.bound = "true";
            cameraToggleBtn.addEventListener("click", () => {
                void toggleCameraBroadcast();
            });
        }

        if (switchBtn && !switchBtn.dataset.bound) {
            switchBtn.dataset.bound = "true";
            switchBtn.addEventListener("click", () => {
                if (switchBtn.disabled) return;
                switchCamera().catch((err) =>
                    console.error("Switch camera error:", err),
                );
            });
        }

        if (micBtn && !micBtn.dataset.bound) {
            micBtn.dataset.bound = "true";
            micBtn.addEventListener("click", () => toggleMicMute());
        }

        if (shareBtn && !shareBtn.dataset.bound) {
            shareBtn.dataset.bound = "true";
            shareBtn.addEventListener("click", () => {
                if (shareBtn.disabled) return;
                shareScreen();
            });
        }

        updateMicButtonState();
        updateScreenShareButtonState();
        updateCameraButtonsState();

        if (switchBtn && navigator.mediaDevices?.enumerateDevices) {
            navigator.mediaDevices
                .enumerateDevices()
                .then((devices) => {
                    const videoInputs = devices.filter(
                        (d) => d.kind === "videoinput",
                    );
                    availableHostVideoInputs = videoInputs.length;
                    updateCameraButtonsState();
                })
                .catch(() => {});
        }
    }

    function closeViewerListModal() {
        const modal = document.getElementById("viewer-list-modal");
        if (!modal) return;
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    }

    async function openViewerListModal() {
        const modal = document.getElementById("viewer-list-modal");
        const body = document.getElementById("viewer-list-body");
        if (!modal || !body || !currentStream?.id) return;
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
        body.innerHTML = '<div class="viewer-list-empty">Chargement...</div>';

        try {
            const cutoffIso = new Date(Date.now() - 30000).toISOString();
            const { data, error } = await supabase
                .from("stream_viewers")
                .select("user_id, users(name, avatar)")
                .eq("stream_id", currentStream.id)
                .gte("last_seen", cutoffIso);
            if (error) throw error;
            const viewers = data || [];
            if (viewers.length === 0) {
                body.innerHTML =
                    '<div class="viewer-list-empty">Aucun viewer actif</div>';
                return;
            }
            body.innerHTML = viewers
                .map((v) => {
                    const name = v.users?.name || "Utilisateur";
                    const avatar = v.users?.avatar || "https://placehold.co/64";
                    const userId = v.user_id || null;
                    const nameHtml =
                        typeof window.renderUsernameWithBadge === "function" &&
                        userId
                            ? window.renderUsernameWithBadge(name, userId)
                            : escapeHtml(name);
                    return `
                <div class="viewer-list-item">
                    <img class="viewer-list-avatar" src="${avatar}" alt="${name}">
                    <div class="viewer-list-name">${nameHtml}</div>
                </div>
            `;
                })
                .join("");
        } catch (error) {
            console.error("Erreur viewers list:", error);
            body.innerHTML =
                '<div class="viewer-list-empty">Impossible de charger la liste</div>';
        }
    }

    // Configurer les médias du diffuseur (Host)
    async function setupBroadcasterMedia(options = {}) {
        try {
            const source = options.source || "camera";
            cleanupScreenComposite();
            clearStandbyCameraTrack();
            cleanupCameraPlaceholderTrack();
            clearPendingMobileScreenShareActivation();
            isCameraEnabled = true;
            let stream = null;
            const isMobile = isMobileDevice();
            if (!isSecureStreamingContext()) {
                const msg =
                    "Le live nécessite HTTPS (ou localhost) pour accéder à la caméra/micro sur mobile.";
                console.warn(msg);
                if (window.ToastManager) {
                    ToastManager.error("Sécurité requise", msg);
                } else {
                    alert(msg);
                }
            }

            const requestUserMedia = async (constraints) => {
                try {
                    return await navigator.mediaDevices.getUserMedia(
                        constraints,
                    );
                } catch (error) {
                    if (constraints.audio) {
                        try {
                            const fallback = { ...constraints, audio: false };
                            const streamNoAudio =
                                await navigator.mediaDevices.getUserMedia(
                                    fallback,
                                );
                            if (window.ToastManager) {
                                ToastManager.info(
                                    "Micro désactivé",
                                    "Live lancé sans audio",
                                );
                            }
                            return streamNoAudio;
                        } catch (fallbackError) {
                            throw error;
                        }
                    }
                    throw error;
                }
            };

            const requestDisplayMedia = async (constraints) => {
                try {
                    return await navigator.mediaDevices.getDisplayMedia(
                        constraints,
                    );
                } catch (error) {
                    if (constraints.audio) {
                        try {
                            const fallback = { ...constraints, audio: false };
                            const streamNoAudio =
                                await navigator.mediaDevices.getDisplayMedia(
                                    fallback,
                                );
                            if (window.ToastManager) {
                                ToastManager.info(
                                    "Micro désactivé",
                                    "Partage d'écran sans audio",
                                );
                            }
                            return streamNoAudio;
                        } catch (fallbackError) {
                            throw error;
                        }
                    }
                    throw error;
                }
            };

            const requestMicStream = async () => {
                try {
                    return await navigator.mediaDevices.getUserMedia({
                        audio: true,
                        video: false,
                    });
                } catch (error) {
                    return null;
                }
            };

            if (source === "screen" && navigator.mediaDevices.getDisplayMedia) {
                try {
                    const displayConstraints = isMobile
                        ? { video: true, audio: false }
                        : {
                              video: {
                                  width: { ideal: 1920 },
                                  height: { ideal: 1080 },
                                  frameRate: { ideal: 30 },
                              },
                              audio: true,
                          };
                    const screenStream =
                        await requestDisplayMedia(displayConstraints);
                    activeDisplayStream = screenStream;

                    const micStream = await requestMicStream();
                    if (!micStream) {
                        console.warn(
                            "Micro non disponible pour le partage d'écran",
                        );
                    }

                    const screenAudioTracks = screenStream.getAudioTracks();
                    const micAudioTracks = micStream
                        ? micStream.getAudioTracks()
                        : [];
                    const hasScreenAudio = screenAudioTracks.length > 0;
                    const hasMicAudio = micAudioTracks.length > 0;
                    const AudioCtx =
                        window.AudioContext || window.webkitAudioContext;

                    if (hasScreenAudio || hasMicAudio) {
                        const mergedStream = new MediaStream();
                        screenStream
                            .getVideoTracks()
                            .forEach((track) => mergedStream.addTrack(track));

                        if (hasScreenAudio && hasMicAudio && AudioCtx) {
                            try {
                                const audioContext = new AudioCtx();
                                const destination =
                                    audioContext.createMediaStreamDestination();
                                audioContext
                                    .createMediaStreamSource(screenStream)
                                    .connect(destination);
                                audioContext
                                    .createMediaStreamSource(micStream)
                                    .connect(destination);
                                const mixedTrack =
                                    destination.stream.getAudioTracks()[0];
                                if (mixedTrack) {
                                    mergedStream.addTrack(mixedTrack);
                                    hostAudioContext = audioContext;
                                } else {
                                    const fallbackTrack =
                                        micAudioTracks[0] ||
                                        screenAudioTracks[0];
                                    if (fallbackTrack)
                                        mergedStream.addTrack(fallbackTrack);
                                    audioContext.close();
                                }
                            } catch (error) {
                                console.warn(
                                    "Mix audio impossible, fallback:",
                                    error,
                                );
                                const fallbackTrack =
                                    micAudioTracks[0] || screenAudioTracks[0];
                                if (fallbackTrack)
                                    mergedStream.addTrack(fallbackTrack);
                            }
                        } else {
                            const fallbackTrack =
                                micAudioTracks[0] || screenAudioTracks[0];
                            if (fallbackTrack)
                                mergedStream.addTrack(fallbackTrack);
                        }

                        stream = mergedStream;
                    } else {
                        stream = screenStream;
                        if (window.ToastManager) {
                            ToastManager.info(
                                "Audio indisponible",
                                "Activez le micro ou cochez \"Partager l'audio\" pendant le partage d'écran.",
                            );
                        }
                    }

                    hostMicStream = micStream;

                    // Ajouter caméra + écran dans un seul flux vidéo (PiP)
                    const overlayCamera = isCameraEnabled
                        ? await requestOverlayCameraStream()
                        : null;
                    if (overlayCamera?.getVideoTracks?.().length) {
                        screenOverlayCameraStream = overlayCamera;
                        const overlayTrack = overlayCamera.getVideoTracks()[0];
                        const overlayDeviceId =
                            overlayTrack?.getSettings?.().deviceId || null;
                        if (overlayDeviceId) {
                            lastCameraDeviceId = overlayDeviceId;
                        }
                        const compositeTrack =
                            await buildScreenCameraCompositeTrack(
                                screenStream,
                                overlayCamera,
                            );
                        if (compositeTrack) {
                            const baseVideoTrack = stream.getVideoTracks()[0];
                            if (baseVideoTrack) {
                                stream.removeTrack(baseVideoTrack);
                            }
                            stream.addTrack(
                                markTrackSource(
                                    compositeTrack,
                                    "screen-composite",
                                ),
                            );
                            isScreenCompositeMode = true;
                        }
                    } else {
                        isCameraEnabled = false;
                    }

                    const displayTrack = screenStream.getVideoTracks()[0];
                    if (displayTrack) {
                        markTrackSource(displayTrack, "screen");
                        displayTrack.onended = () => {
                            void stopScreenShareAndRestoreCamera();
                        };
                    }
                } catch (error) {
                    if (isMobile) {
                        if (window.ToastManager) {
                            ToastManager.info(
                                "Partage d'écran indisponible",
                                "Bascule sur la caméra",
                            );
                        }
                        const needGestureRetry =
                            error?.name === "NotAllowedError" ||
                            error?.name === "InvalidStateError";
                        if (needGestureRetry) {
                            queueMobileScreenShareActivation();
                        }
                        stream = await requestUserMedia({
                            video: {
                                width: { ideal: 1280 },
                                height: { ideal: 720 },
                                frameRate: { ideal: 30 },
                            },
                            audio: true,
                        });
                    } else {
                        throw error;
                    }
                }
            } else {
                stream = await requestUserMedia({
                    video: {
                        ...(isMobile
                            ? MOBILE_VIDEO_CONSTRAINTS
                            : {
                                  width: { ideal: 1280 },
                                  height: { ideal: 720 },
                                  frameRate: { ideal: 30 },
                              }),
                    },
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                });
            }

            const initialVideoTrack = stream?.getVideoTracks?.()[0];
            if (initialVideoTrack) {
                if (!isTrackSource(initialVideoTrack, "screen-composite")) {
                    markTrackSource(
                        initialVideoTrack,
                        source === "screen" ? "screen" : "camera",
                    );
                }
                currentVideoDeviceId =
                    initialVideoTrack.getSettings?.().deviceId ||
                    currentVideoDeviceId;
                if (source !== "screen") {
                    lastCameraDeviceId =
                        currentVideoDeviceId || lastCameraDeviceId;
                }
            }
            isScreenSharing = Boolean(
                activeDisplayStream && stream?.getVideoTracks?.().length,
            );
            updateScreenShareButtonState();

            const video = document.getElementById("stream-video");
            if (video) {
                video.srcObject = stream;
                video.muted = true; // Garder muet pour permettre l'autoplay
                video.autoplay = true;
                video.playsInline = true;
                syncAudioButtonState(true);
                const playPromise = video.play();
                if (playPromise && typeof playPromise.catch === "function") {
                    playPromise.catch(() => {});
                }

                // Ajouter un indicateur visuel que c'est bien le host
                const container = document.querySelector(
                    ".stream-video-container",
                );
                if (container) {
                    container.classList.remove("stream-host-live");
                }

                // Modifier l'interface pour le host
                const followBtn = document.getElementById("follow-btn");
                if (followBtn) {
                    followBtn.style.display = "none"; // Le host ne peut pas se suivre lui-même
                }

                // Activer le son par défaut pour le host
                const audioBtn = document.getElementById("audio-toggle-btn");
                if (audioBtn) {
                    syncAudioButtonState(video.muted);
                }
                applyLivePreviewFilter();

                localMediaStream = stream;
                if (pendingViewerJoins.size > 0) {
                    const pending = Array.from(pendingViewerJoins);
                    pendingViewerJoins.clear();
                    pending.forEach((viewerId) => handleViewerJoin(viewerId));
                }

                if (currentStream && currentStream.id) {
                    startLivePreviewUpdates(currentStream.id);
                }
            }
            updateCameraButtonsState();
        } catch (error) {
            console.error("Erreur accès média diffuseur:", error);
            alert(
                "Impossible d'accéder à la caméra/micro. Vérifiez vos permissions.",
            );
        }
    }

    // Initialiser la page de stream
    async function initializeStreamPage(streamId) {
        // Rejoindre le stream
        const result = await joinStream(streamId);

        if (!result.success) {
            alert("Erreur: " + result.error);
            setChatEnabled(false);
            navigateTo("discover");
            return;
        }

        if (result.stream) {
            hydrateStreamInfo(result.stream);
        }

        resetLiveStudioRuntime(result.stream || currentStream);

        const isHost = Boolean(
            currentUser &&
            currentStream &&
            currentUser.id === currentStream.user_id,
        );
        applyStreamRoleUI(isHost);
        setupChatInteractionUX();
        initWebRtcSignaling(streamId, isHost);
        startViewerCountSync(streamId);
        const container = document.querySelector(".stream-video-container");
        if (container && !container.dataset.boundAudio) {
            container.dataset.boundAudio = "true";
            container.addEventListener("click", () => {
                const overlay = document.getElementById("unmute-overlay");
                if (overlay && overlay.style.display === "flex") {
                    enableStreamAudio();
                }
            });
        }

        const viewerModal = document.getElementById("viewer-list-modal");
        const viewerClose = document.getElementById("viewer-list-close");
        if (viewerClose && !viewerClose.dataset.bound) {
            viewerClose.addEventListener("click", () => closeViewerListModal());
            viewerClose.dataset.bound = "true";
        }
        if (viewerModal && !viewerModal.dataset.bound) {
            viewerModal.addEventListener("click", (event) => {
                if (event.target === viewerModal) {
                    closeViewerListModal();
                }
            });
            viewerModal.dataset.bound = "true";
        }

        // Si l'utilisateur actuel est le créateur du stream (Host)
        if (isHost) {
            console.log("Mode Diffuseur activé");
            await setupBroadcasterMedia({
                source: window._streamBroadcastSource,
            });
            setupHostControls();
            setupHostControlPanel();
            setViewerWaiting(false);
        } else {
            renderHostControlPanel();
            renderHostToolDrawer();
            setViewerWaiting(true);
        }

        // Charger l'historique du chat
        const chatResult = await loadChatHistory(streamId);
        if (chatResult.success) {
            if (window.liveChatStore) {
                window.liveChatStore.replace(chatResult.messages);
            } else {
                const chatContainer = document.getElementById(
                    "stream-chat-messages",
                );
                if (chatContainer) {
                    chatContainer.innerHTML = "";
                    chatResult.messages.forEach((msg) => {
                        const element = createChatMessageElement(msg);
                        chatContainer.appendChild(element);
                    });
                }
            }
            handleChatMessagesRendered({ force: true });
        }

        // Configurer le formulaire de chat
        const chatForm = document.getElementById("stream-chat-form");
        if (chatForm) {
            if (!chatForm.dataset.bound) {
                chatForm.dataset.bound = "true";
                chatForm.addEventListener("submit", async (e) => {
                    e.preventDefault();
                    const input = document.getElementById("stream-chat-input");
                    const message = input.value.trim();

                    if (!message) return;

                    const result = await sendChatMessage(message);
                    if (result.success) {
                        input.value = "";
                    } else {
                        if (window.ToastManager) {
                            ToastManager.error(
                                "Chat",
                                result.error ||
                                    "Impossible d'envoyer le message",
                            );
                        } else {
                            alert(
                                result.error ||
                                    "Impossible d'envoyer le message",
                            );
                        }
                    }
                });
            }
        }

        setChatEnabled(true);
    }

    function hydrateStreamInfo(stream) {
        const titleEl = document.getElementById("stream-title");
        if (titleEl) {
            titleEl.textContent = stream.title || "Live Stream";
        }

        const descriptionEl = document.getElementById("stream-description");
        if (descriptionEl) {
            descriptionEl.textContent =
                stream.description || "Aucune description.";
        }

        const hostNameEl = document.getElementById("stream-host-name");
        if (hostNameEl) {
            const hostName = stream.users?.name || stream.host_name || "Hôte";
            const hostId = stream.users?.id || stream.user_id || null;
            hostNameEl.dataset.hostName = hostName;
            hostNameEl.dataset.hostId = hostId || "";

            const renderHostName = () => {
                const safeHostName = hostNameEl.dataset.hostName || "Hôte";
                const safeHostId = hostNameEl.dataset.hostId || null;
                if (
                    safeHostId &&
                    typeof window.renderUsernameWithBadge === "function"
                ) {
                    hostNameEl.innerHTML = window.renderUsernameWithBadge(
                        safeHostName,
                        safeHostId,
                    );
                } else {
                    hostNameEl.textContent = safeHostName;
                }
            };

            renderHostName();

            // Les badges peuvent être chargés après l'init du live: on re-render si les données changent.
            if (hostBadgeRefreshInterval) {
                clearInterval(hostBadgeRefreshInterval);
                hostBadgeRefreshInterval = null;
            }
            let previousSignature = "";
            hostBadgeRefreshInterval = setInterval(() => {
                const usersLoaded = window.hasLoadedUsers ? "1" : "0";
                let creators = 0;
                let staff = 0;
                if (typeof window.getVerifiedBadgeSets === "function") {
                    const sets = window.getVerifiedBadgeSets();
                    creators = sets?.creators?.size || 0;
                    staff = sets?.staff?.size || 0;
                }
                const signature = `${usersLoaded}|${creators}|${staff}`;
                if (signature !== previousSignature) {
                    previousSignature = signature;
                    renderHostName();
                    updateStreamSupportButton(currentStream || stream);
                }
            }, 1200);
        }

        const hostAvatarEl = document.getElementById("stream-host-avatar");
        if (hostAvatarEl) {
            const avatarUrl = stream.users?.avatar || stream.host_avatar || "";
            if (avatarUrl) {
                hostAvatarEl.src = avatarUrl;
                hostAvatarEl.alt = "Avatar de l'hôte";
            } else {
                hostAvatarEl.removeAttribute("src");
            }
        }

        const breadcrumb = document.getElementById("stream-breadcrumb-title");
        if (breadcrumb) {
            breadcrumb.textContent = stream.title || "Stream en cours";
        }

        updateStreamSupportButton(stream);
    }

    async function updateStreamSupportButton(stream) {
        const actionButton = document.getElementById("stream-support-btn");
        const overlayContainer = document.getElementById(
            "stream-support-overlay",
        );
        const overlayButton = document.getElementById(
            "stream-support-overlay-btn",
        );
        if (!actionButton && !overlayContainer && !overlayButton) return;

        const hostId = stream?.users?.id || stream?.user_id || null;
        if (!hostId) {
            if (actionButton) actionButton.style.display = "none";
            if (overlayContainer) overlayContainer.style.display = "none";
            return;
        }

        const hostName =
            stream?.users?.name || stream?.host_name || "Créateur";
        const cachedUser =
            typeof window.getUser === "function"
                ? window.getUser(hostId)
                : null;
        let hostUser = {
            ...(stream?.users || {}),
            ...(cachedUser || {}),
        };
        if (
            (!Object.prototype.hasOwnProperty.call(hostUser, "plan") ||
                !Object.prototype.hasOwnProperty.call(
                    hostUser,
                    "plan_status",
                )) &&
            window.supabase?.from
        ) {
            try {
                const profileCache =
                    (window.__xeraStreamSupportProfileCache ||= new Map());
                let profilePromise = profileCache.get(hostId);
                if (!profilePromise) {
                    profilePromise = window.supabase
                        .from("users")
                        .select(
                            "id, name, plan, plan_status, plan_ends_at, is_monetized, followers_count",
                        )
                        .eq("id", hostId)
                        .maybeSingle()
                        .then(({ data, error }) => (error ? null : data))
                        .catch(() => null);
                    profileCache.set(hostId, profilePromise);
                }
                const profile = await profilePromise;
                if (profile) hostUser = { ...hostUser, ...profile };
            } catch (error) {
                console.warn("Impossible de charger le plan de l'hôte:", error);
            }
        }
        const resolvedHostName = hostUser.name || hostName;
        const isEligible =
            typeof window.canReceiveSupport === "function"
                ? window.canReceiveSupport(hostUser)
                : false;
        const isSelf = window.currentUser && window.currentUser.id === hostId;

        if (!isEligible || isSelf) {
            if (actionButton) actionButton.style.display = "none";
            if (overlayContainer) overlayContainer.style.display = "none";
            return;
        }

        const applySupportHandler = (btn) => {
            if (!btn) return;
            btn.dataset.creatorId = hostId;
            btn.dataset.creatorName = resolvedHostName;
            btn.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (typeof window.openSupportModal === "function") {
                    window.openSupportModal(hostId, resolvedHostName, btn);
                    return;
                }
                if (window.ToastManager) {
                    window.ToastManager.error(
                        "Soutien",
                        "Le module de soutien n’est pas disponible sur cette page.",
                    );
                    return;
                }
                alert(
                    "Le module de soutien n’est pas disponible sur cette page.",
                );
            };
        };

        if (actionButton) {
            actionButton.style.display = "inline-flex";
            applySupportHandler(actionButton);
        }
        if (overlayContainer) {
            overlayContainer.style.display = "flex";
        }
        applySupportHandler(overlayButton);
    }

    function applyStreamRoleUI(isHost) {
        document.body.classList.toggle("is-stream-host", isHost);
        document.body.classList.toggle("is-stream-viewer", !isHost);
        isStreamHost = isHost;

        setStreamStatusMode("live", { host: isHost, stream: currentStream });

        const roleBadge = document.getElementById("stream-role-badge");
        if (roleBadge) {
            roleBadge.remove();
        }

        const followBtn = document.getElementById("follow-btn");
        const shareBtn = document.getElementById("share-btn");
        const buttons = [followBtn, shareBtn].filter(Boolean);

        buttons.forEach((btn) => {
            if (isHost) {
                btn.disabled = true;
                btn.classList.add("disabled");
                btn.style.opacity = "0.6";
                btn.style.cursor = "not-allowed";
            } else {
                btn.disabled = false;
                btn.classList.remove("disabled");
                btn.style.opacity = "";
                btn.style.cursor = "";
            }
        });

        const chatInput = document.getElementById("stream-chat-input");
        if (chatInput) {
            chatInput.placeholder = isHost
                ? "Écrire à vos viewers..."
                : "Envoyer un message...";
        }

        const viewerBtn = document.getElementById("viewer-list-btn");
        if (viewerBtn) {
            if (isHost) {
                viewerBtn.disabled = false;
                if (!viewerBtn.dataset.bound) {
                    viewerBtn.addEventListener("click", () =>
                        openViewerListModal(),
                    );
                    viewerBtn.dataset.bound = "true";
                }
            } else {
                viewerBtn.disabled = true;
            }
        }

        renderHostControlPanel();
        renderHostToolDrawer();
    }

    function findHostTool(toolId) {
        for (const section of hostPanelRegistry.values()) {
            const tool = section.tools.find((entry) => entry.id === toolId);
            if (tool) return tool;
        }
        return null;
    }

    function registerHostPanelTool(sectionMeta, tool) {
        if (!sectionMeta?.id || !tool?.id) return;
        if (!hostPanelRegistry.has(sectionMeta.id)) {
            hostPanelRegistry.set(sectionMeta.id, {
                ...sectionMeta,
                tools: [],
            });
        }
        hostPanelRegistry.get(sectionMeta.id).tools.push(tool);
    }

    function getLiveMessagesCount() {
        if (window.liveChatStore?.get) {
            const list = window.liveChatStore.get();
            return Array.isArray(list) ? list.length : 0;
        }
        return renderedChatMessageIds.size;
    }

    async function fetchHostPanelViewers() {
        if (!currentStream?.id || hostPanelViewersLoading)
            return hostPanelViewers;
        hostPanelViewersLoading = true;
        try {
            const cutoffIso = new Date(Date.now() - 30000).toISOString();
            const { data, error } = await supabase
                .from("stream_viewers")
                .select("user_id, users(name, avatar)")
                .eq("stream_id", currentStream.id)
                .gte("last_seen", cutoffIso);
            if (error) throw error;
            hostPanelViewers = Array.isArray(data) ? data : [];
            registerViewerPresence(hostPanelViewers);
            recordViewerSnapshot(
                currentStream?.viewer_count ?? hostPanelViewers.length,
                hostPanelViewers,
            );

            if (liveStudioState?.moderators) {
                const nextModerators = {
                    ...(liveStudioState.moderators || {}),
                };
                let changed = false;
                hostPanelViewers.forEach((viewer) => {
                    const userId = viewer?.user_id;
                    if (!userId || !nextModerators[userId]) return;
                    const nextName =
                        viewer?.users?.name || nextModerators[userId].name;
                    const nextAvatar =
                        viewer?.users?.avatar || nextModerators[userId].avatar;
                    if (
                        nextModerators[userId].name !== nextName ||
                        nextModerators[userId].avatar !== nextAvatar
                    ) {
                        nextModerators[userId] = {
                            ...nextModerators[userId],
                            name: nextName,
                            avatar: nextAvatar,
                            lastSeenAt: Date.now(),
                        };
                        changed = true;
                    }
                });
                if (changed) {
                    liveStudioState = {
                        ...liveStudioState,
                        moderators: nextModerators,
                    };
                    saveLiveStudioState();
                }
            }
        } catch (error) {
            console.error("Erreur chargement viewers panel:", error);
            hostPanelViewers = [];
        } finally {
            hostPanelViewersLoading = false;
            renderHostToolDrawer();
            renderHostControlPanel();
        }
        return hostPanelViewers;
    }

    function toggleModerator(userId) {
        if (!userId) return;
        const currentIds = new Set(liveStudioState?.moderatorIds || []);
        const moderators = {
            ...(liveStudioState?.moderators || {}),
        };
        if (currentIds.has(userId)) {
            currentIds.delete(userId);
            delete moderators[userId];
        } else {
            currentIds.add(userId);
            const viewer = hostPanelViewers.find(
                (entry) => entry.user_id === userId,
            );
            moderators[userId] = createModeratorConfig(userId, {
                ...(moderators[userId] || {}),
                name: viewer?.users?.name || moderators[userId]?.name || "",
                avatar:
                    viewer?.users?.avatar || moderators[userId]?.avatar || "",
                lastSeenAt: Date.now(),
            });
        }
        ensureLiveAnalyticsState().manualActions += 1;
        updateLiveStudioState({
            moderatorIds: Array.from(currentIds),
            moderators,
        });
    }

    function getModeratorConfig(userId) {
        return (
            liveStudioState?.moderators?.[userId] ||
            createModeratorConfig(userId)
        );
    }

    function setModeratorRole(userId, roleId) {
        if (!userId || !MODERATOR_ROLE_TEMPLATES[roleId]) return;
        const currentIds = new Set(liveStudioState?.moderatorIds || []);
        currentIds.add(userId);
        const existing = getModeratorConfig(userId);
        const template = getModeratorRoleTemplate(roleId);
        ensureLiveAnalyticsState().manualActions += 1;
        updateLiveStudioState({
            moderatorIds: Array.from(currentIds),
            moderators: {
                ...(liveStudioState?.moderators || {}),
                [userId]: createModeratorConfig(userId, {
                    ...existing,
                    role: roleId,
                    permissions: {
                        ...template.permissions,
                        ...(existing.permissions || {}),
                    },
                }),
            },
        });
    }

    function toggleModeratorPermission(userId, permissionKey) {
        if (!userId || !MODERATOR_PERMISSION_LABELS[permissionKey]) return;
        const currentIds = new Set(liveStudioState?.moderatorIds || []);
        currentIds.add(userId);
        const existing = getModeratorConfig(userId);
        ensureLiveAnalyticsState().manualActions += 1;
        updateLiveStudioState({
            moderatorIds: Array.from(currentIds),
            moderators: {
                ...(liveStudioState?.moderators || {}),
                [userId]: createModeratorConfig(userId, {
                    ...existing,
                    permissions: {
                        ...(existing.permissions || {}),
                        [permissionKey]: !existing.permissions?.[permissionKey],
                    },
                }),
            },
        });
    }

    function setPreviewFilter(filterId) {
        const nextFilter = LIVE_PREVIEW_FILTERS[filterId] ? filterId : "none";
        updateLiveStudioState({
            previewFilter: nextFilter,
        });
    }

    function setPreviewIntensity(value) {
        updateLiveStudioState({
            previewIntensity: clampNumber(value, 40, 160),
        });
    }

    function togglePreviewOption(optionKey) {
        if (
            !["previewSafeZone", "previewGrid", "previewMirror"].includes(
                optionKey,
            )
        ) {
            return;
        }
        updateLiveStudioState({
            [optionKey]: !liveStudioState?.[optionKey],
        });
    }

    function toggleFutureFeature(featureKey) {
        if (!liveStudioState) return;
        updateLiveStudioState({
            [featureKey]: !liveStudioState[featureKey],
        });
    }

    function setModeratorSearchTerm(value) {
        liveModeratorSearchTerm = String(value || "").trim();
        renderHostToolDrawer();
    }

    function setModerationQueueFilter(value) {
        const nextFilter = ["all", "flagged", "held", "masked"].includes(value)
            ? value
            : "all";
        liveModerationQueueFilter = nextFilter;
        renderHostToolDrawer();
    }

    function updateAutoModKeywords(rawValue) {
        const keywords = uniqueStringList(
            String(rawValue || "")
                .split(/[\n,;]/g)
                .map((value) => value.trim())
                .filter(Boolean),
        );
        updateLiveStudioState({
            autoModKeywords: keywords,
        });
    }

    function setAutoModAction(actionId) {
        if (!LIVE_AUTO_MOD_ACTIONS[actionId]) return;
        updateLiveStudioState({
            autoModAction: actionId,
        });
    }

    function applyModerationDecision(messageKey, actionId) {
        const record = liveModerationIndex.get(messageKey);
        if (!record) return;

        const mutedUserIds = new Set(liveStudioState?.mutedUserIds || []);
        let nextRecord = record;
        let shouldPersistStudioState = false;
        const recordPayload = {
            user_id: record.userId,
            users: {
                name: record.userName,
                avatar: record.avatar,
            },
            message: record.originalMessage,
            created_at: record.createdAt,
            id: record.key,
        };

        if (actionId === "approve" || actionId === "restore") {
            nextRecord = upsertModerationRecord(recordPayload, {
                status: "approved",
                renderedMessage: record.originalMessage,
                reason: "approuve",
                source: "manual",
            });
        } else if (actionId === "mask") {
            nextRecord = upsertModerationRecord(recordPayload, {
                status: "masked",
                renderedMessage: buildMaskedMessage("decision manuelle"),
                reason: "decision manuelle",
                source: "manual",
            });
        } else if (actionId === "hold") {
            nextRecord = upsertModerationRecord(recordPayload, {
                status: "held",
                renderedMessage: buildMaskedMessage("en attente"),
                reason: "en attente",
                source: "manual",
            });
        } else if (actionId === "mute-user") {
            if (record.userId) {
                mutedUserIds.add(record.userId);
                shouldPersistStudioState = true;
            }
            nextRecord = upsertModerationRecord(recordPayload, {
                status: "masked",
                renderedMessage: buildMaskedMessage("auteur mute"),
                reason: "auteur mute",
                source: "manual",
            });
        } else if (actionId === "unmute-user") {
            if (record.userId) {
                mutedUserIds.delete(record.userId);
                shouldPersistStudioState = true;
            }
            nextRecord = upsertModerationRecord(recordPayload, {
                status: "approved",
                renderedMessage: record.originalMessage,
                reason: "auteur reactive",
                source: "manual",
            });
        }

        ensureLiveAnalyticsState().manualActions += 1;
        syncMessageContentWithModeration(
            messageKey,
            nextRecord.status === "approved"
                ? nextRecord.originalMessage
                : nextRecord.renderedMessage,
        );

        if (shouldPersistStudioState) {
            updateLiveStudioState({
                mutedUserIds: Array.from(mutedUserIds),
            });
            return;
        }

        renderHostControlPanel();
        renderHostToolDrawer();
    }

    function getStreamDurationLabel() {
        if (!streamStartedAtMs) return "00:00:00";
        return formatStreamDuration(Date.now() - streamStartedAtMs);
    }

    function getAverageViewerCount() {
        const analytics = ensureLiveAnalyticsState();
        if (!analytics.viewerSeries.length) {
            return Math.max(0, Number(currentStream?.viewer_count) || 0);
        }
        const total = analytics.viewerSeries.reduce(
            (sum, entry) => sum + (Number(entry?.value) || 0),
            0,
        );
        return Math.round(total / Math.max(1, analytics.viewerSeries.length));
    }

    function getModerationQueueCount() {
        return liveModerationEntries.filter(
            (entry) => entry.status && entry.status !== "approved",
        ).length;
    }

    function renderPulseCards() {
        const analytics = ensureLiveAnalyticsState();
        const cards = [
            {
                label: "Audience",
                value: String(currentStream?.viewer_count || 0),
                meta: `pic ${analytics.peakViewers || 0}`,
            },
            {
                label: "Chat/min",
                value: String(getMessagesPerMinute()),
                meta: `${analytics.uniqueChatters.size} participants`,
            },
            {
                label: "Engagement",
                value: String(getEngagementScore()),
                meta: analytics.peakMomentumLabel || "Stable",
            },
            {
                label: "Auto-mod",
                value: liveStudioState?.autoModEnabled ? "ON" : "OFF",
                meta: `${getModerationQueueCount()} alerte(s)`,
            },
        ];
        return `
        <div class="stream-host-pulse-grid">
            ${cards
                .map(
                    (card) => `
                        <article class="stream-host-pulse-card">
                            <span>${escapeHtml(card.label)}</span>
                            <strong>${escapeHtml(card.value)}</strong>
                            <small>${escapeHtml(card.meta)}</small>
                        </article>
                    `,
                )
                .join("")}
        </div>
    `;
    }

    function buildHostControlRegistry() {
        hostPanelRegistry = new Map();

        registerHostPanelTool(
            {
                id: "broadcast",
                title: "Diffusion",
                description: "Commandes critiques du direct",
            },
            {
                id: "camera-toggle",
                label: "Camera live",
                description:
                    "Couper ou reactiver la video sans arreter l’audio.",
                status: () => (isCameraEnabled ? "Active" : "Coupee"),
                isActive: () => !isCameraEnabled,
                run: () => toggleCameraBroadcast(),
            },
        );
        registerHostPanelTool(
            {
                id: "broadcast",
                title: "Diffusion",
                description: "Commandes critiques du direct",
            },
            {
                id: "mic-toggle",
                label: "Micro",
                description: "Basculer le micro pendant le live.",
                status: () => (isMicMuted ? "Coupe" : "Ouvert"),
                isActive: () => isMicMuted,
                run: () => toggleMicMute(),
            },
        );
        registerHostPanelTool(
            {
                id: "broadcast",
                title: "Diffusion",
                description: "Commandes critiques du direct",
            },
            {
                id: "screen-share",
                label: "Partage ecran",
                description: "Montrer votre ecran sans couper le direct.",
                status: () => (isScreenSharing ? "Actif" : "Pret"),
                isActive: () => isScreenSharing,
                run: () => shareScreen(),
            },
        );
        registerHostPanelTool(
            {
                id: "broadcast",
                title: "Diffusion",
                description: "Commandes critiques du direct",
            },
            {
                id: "camera-switch",
                label: "Changer camera",
                description: "Basculer entre les capteurs detectes.",
                status: () =>
                    isCameraEnabled ? "Disponible" : "Reactivez la camera",
                isDisabled: () => !isCameraEnabled,
                run: () => switchCamera(),
            },
        );
        registerHostPanelTool(
            {
                id: "broadcast",
                title: "Diffusion",
                description: "Commandes critiques du direct",
            },
            {
                id: "end-stream",
                label: "Arrêter le live",
                description: "Terminer le stream immédiatement",
                run: async () => {
                    if (confirm("Voulez-vous vraiment arrêter le live ?")) {
                        const result = await endStream();
                        if (result && result.success) {
                            window.location.href = "index.html";
                        } else {
                            if (window.ToastManager) {
                                ToastManager.error(
                                    "Erreur",
                                    result?.error ||
                                        "Impossible de terminer le live",
                                );
                            }
                        }
                    }
                },
            },
        );
        registerHostPanelTool(
            {
                id: "broadcast",
                title: "Diffusion",
                description: "Commandes critiques du direct",
            },
            {
                id: "share-link",
                label: "Partager lien",
                description: "Copier le lien du stream dans le presse-papier",
                run: async () => {
                    const url = window.location.href;
                    if (navigator.share) {
                        try {
                            await navigator.share({
                                title: "Live Stream sur XERA1",
                                text: "Regardez ce live stream sur XERA1 !",
                                url: url,
                            });
                            if (window.ToastManager) {
                                ToastManager.success(
                                    "Partagé",
                                    "Merci de faire connaître XERA1 !",
                                );
                            }
                        } catch (err) {
                            if (err.name !== "AbortError") {
                                fallbackCopy(url);
                            }
                        }
                    } else {
                        fallbackCopy(url);
                    }
                },
            },
        );

        registerHostPanelTool(
            {
                id: "studio",
                title: "Studio",
                description: "Outils de pilotage et moderation",
            },
            {
                id: "preview",
                label: "Live preview",
                description: "Controle exact du flux public et du monitor ops.",
                status: () =>
                    LIVE_PREVIEW_FILTERS[
                        liveStudioState?.previewFilter || "none"
                    ]?.label || "Flux brut",
                isDrawer: true,
            },
        );
        registerHostPanelTool(
            {
                id: "studio",
                title: "Studio",
                description: "Outils de pilotage et moderation",
            },
            {
                id: "filters",
                label: "Filtres",
                description: "Presets, intensite et overlays du control room.",
                status: () => `${liveStudioState?.previewIntensity || 100}%`,
                isDrawer: true,
            },
        );
        registerHostPanelTool(
            {
                id: "studio",
                title: "Studio",
                description: "Outils de pilotage et moderation",
            },
            {
                id: "moderators",
                label: "Moderateurs",
                description:
                    "Roles et permissions de moderation en temps reel.",
                status: () =>
                    `${(liveStudioState?.moderatorIds || []).length} actif(s)`,
                isDrawer: true,
            },
        );
        registerHostPanelTool(
            {
                id: "studio",
                title: "Studio",
                description: "Outils de pilotage et moderation",
            },
            {
                id: "stats",
                label: "Stats live",
                description: "Audience, rythme du chat, pics et sante du flux.",
                status: () => `${currentStream?.viewer_count || 0} viewers`,
                isDrawer: true,
            },
        );

        registerHostPanelTool(
            {
                id: "extensions",
                title: "Extensions",
                description: "Points d’extension pour les modules avances",
            },
            {
                id: "engagement",
                label: "Cadeaux & sondages",
                description: "Pilotage UX en direct.",
                status: () =>
                    [
                        liveStudioState?.giftsEnabled ? "cadeaux" : null,
                        liveStudioState?.pollsEnabled ? "sondages" : null,
                    ]
                        .filter(Boolean)
                        .join(" + ") || "desactive",
                isDrawer: true,
            },
        );
        registerHostPanelTool(
            {
                id: "extensions",
                title: "Extensions",
                description: "Points d’extension pour les modules avances",
            },
            {
                id: "automation",
                label: "Auto-moderation",
                description:
                    "Regles de mots sensibles et actions instantanees.",
                status: () =>
                    liveStudioState?.autoModEnabled
                        ? `${getModerationQueueCount()} alerte(s)`
                        : "Desactivee",
                isDrawer: true,
            },
        );

        customHostPanelTools.forEach((entry) => {
            if (!entry?.sectionMeta || !entry?.tool) return;
            registerHostPanelTool(entry.sectionMeta, entry.tool);
        });
    }

    function renderHostControlPanel() {
        const panel = document.getElementById("stream-host-panel");
        const grid = document.getElementById("stream-host-panel-grid");
        const status = document.getElementById("stream-host-panel-status");
        if (!panel || !grid) return;

        if (!isStreamHost) {
            panel.hidden = true;
            return;
        }

        panel.hidden = false;
        // Ensure mobile accessibility: use larger touch targets and better spacing
        if (isMobileDevice()) {
            panel.classList.add("mobile-host-panel");
        }
        buildHostControlRegistry();

        let pulse = document.getElementById("stream-host-panel-pulse");
        if (!pulse) {
            pulse = document.createElement("div");
            pulse.id = "stream-host-panel-pulse";
            pulse.className = "stream-host-panel-pulse";
            panel.insertBefore(pulse, grid);
        }
        pulse.innerHTML = renderPulseCards();

        if (status) {
            const moderationCount = getModerationQueueCount();
            status.textContent =
                moderationCount > 0
                    ? `Live actif • ${moderationCount} alerte(s)`
                    : isScreenSharing
                      ? "Live actif • ecran partage"
                      : "Live actif";
        }

        grid.innerHTML = Array.from(hostPanelRegistry.values())
            .map(
                (section) => `
            <section class="stream-host-section">
                <div class="stream-host-section-head">
                    <h4>${escapeHtml(section.title)}</h4>
                    <p>${escapeHtml(section.description || "")}</p>
                </div>
                <div class="stream-host-section-tools">
                    ${section.tools
                        .map((tool) => {
                            const isActive = tool.isActive
                                ? tool.isActive()
                                : activeHostToolId === tool.id;
                            const isDisabled = tool.isDisabled
                                ? tool.isDisabled()
                                : false;
                            const statusLabel = tool.status
                                ? tool.status()
                                : "";
                            return `
                                <button
                                    type="button"
                                    class="stream-host-tool ${isActive ? "active" : ""}"
                                    data-host-tool="${escapeHtml(tool.id)}"
                                    ${isDisabled ? "disabled" : ""}
                                >
                                    <span class="stream-host-tool-label">${escapeHtml(tool.label)}</span>
                                    <span class="stream-host-tool-desc">${escapeHtml(tool.description || "")}</span>
                                    <span class="stream-host-tool-status">${escapeHtml(statusLabel)}</span>
                                </button>
                            `;
                        })
                        .join("")}
                </div>
            </section>
        `,
            )
            .join("");

        Array.from(grid.querySelectorAll("[data-host-tool]")).forEach(
            (button) => {
                button.addEventListener("click", async () => {
                    const tool = findHostTool(button.dataset.hostTool);
                    if (!tool) return;
                    if (tool.isDrawer) {
                        activeHostToolId =
                            activeHostToolId === tool.id ? "" : tool.id;
                        if (
                            activeHostToolId === "moderators" ||
                            activeHostToolId === "stats"
                        ) {
                            void fetchHostPanelViewers();
                        }
                        renderHostControlPanel();
                        renderHostToolDrawer();
                        return;
                    }
                    await Promise.resolve(tool.run?.());
                    renderHostControlPanel();
                    renderHostToolDrawer();
                });
            },
        );
    }

    function renderPreviewDrawerContent() {
        const track = getCurrentHostVideoTrack();
        const settings = track?.getSettings?.() || {};
        const sourceLabel = isScreenSharing ? "Ecran partage" : "Camera live";
        const resolution =
            settings.width && settings.height
                ? `${settings.width} x ${settings.height}`
                : "Resolution en cours";
        const filterLabel =
            LIVE_PREVIEW_FILTERS[liveStudioState?.previewFilter || "none"]
                ?.label || "Flux brut";
        return `
        <div class="stream-host-drawer-head">
            <h4>Live preview</h4>
            <p>Double monitor: flux public exact a gauche, monitor ops a droite pour verifier cadrage, qualite et overlays.</p>
        </div>
        <div class="stream-host-preview-grid">
            <article class="stream-host-preview-card">
                <div class="stream-host-preview-head">
                    <div>
                        <strong>Flux audience</strong>
                        <span>Ce que voit le public en direct</span>
                    </div>
                    <span class="stream-host-preview-badge">Exact</span>
                </div>
                <div class="stream-host-preview-shell" data-preview-shell="public">
                    <video id="stream-audience-preview-raw" playsinline autoplay muted></video>
                    <span class="stream-host-preview-tag">Public</span>
                </div>
            </article>
            <article class="stream-host-preview-card">
                <div class="stream-host-preview-head">
                    <div>
                        <strong>Monitor ops</strong>
                        <span>Safe-zone, grille et filtre d inspection</span>
                    </div>
                    <span class="stream-host-preview-badge">${escapeHtml(filterLabel)}</span>
                </div>
                <div class="stream-host-preview-shell" data-preview-shell="ops">
                    <video id="stream-audience-preview-filtered" playsinline autoplay muted></video>
                    <span class="stream-host-preview-tag">Ops</span>
                </div>
            </article>
        </div>
        <div class="stream-host-stats-grid stream-host-stats-grid--wide">
            <div class="stream-host-stat">
                <span>Source</span>
                <strong>${escapeHtml(sourceLabel)}</strong>
            </div>
            <div class="stream-host-stat">
                <span>Resolution</span>
                <strong>${escapeHtml(resolution)}</strong>
            </div>
            <div class="stream-host-stat">
                <span>Cadre</span>
                <strong>${liveStudioState?.previewSafeZone ? "safe-zone ON" : "safe-zone OFF"}</strong>
            </div>
            <div class="stream-host-stat">
                <span>Lecture</span>
                <strong>${escapeHtml(getStreamDurationLabel())}</strong>
            </div>
        </div>
        <div class="stream-host-inline-actions">
            <button type="button" class="stream-host-inline-btn ${liveStudioState?.previewSafeZone ? "active" : ""}" data-preview-toggle="previewSafeZone">
                Safe zone
            </button>
            <button type="button" class="stream-host-inline-btn ${liveStudioState?.previewGrid ? "active" : ""}" data-preview-toggle="previewGrid">
                Grille
            </button>
            <button type="button" class="stream-host-inline-btn ${liveStudioState?.previewMirror ? "active" : ""}" data-preview-toggle="previewMirror">
                Mirror
            </button>
        </div>
    `;
    }

    function renderFiltersDrawerContent() {
        return `
        <div class="stream-host-drawer-head">
            <h4>Filtres et overlays</h4>
            <p>Pilotez le rendu du monitor, l intensite du filtre et les aides visuelles sans perdre la lecture du direct.</p>
        </div>
        <div class="stream-host-filter-grid">
            ${Object.entries(LIVE_PREVIEW_FILTERS)
                .map(
                    ([filterId, filter]) => `
                    <button
                        type="button"
                        class="stream-host-inline-btn ${liveStudioState?.previewFilter === filterId ? "active" : ""}"
                        data-live-filter="${escapeHtml(filterId)}"
                    >
                        ${escapeHtml(filter.label)}
                    </button>
                `,
                )
                .join("")}
        </div>
        <div class="stream-host-range-card">
            <div class="stream-host-range-copy">
                <strong>Intensite du monitor</strong>
                <span>Actuellement ${escapeHtml(String(liveStudioState?.previewIntensity || 100))}%</span>
            </div>
            <input
                type="range"
                min="40"
                max="160"
                step="5"
                value="${escapeHtml(String(liveStudioState?.previewIntensity || 100))}"
                data-preview-intensity
            />
        </div>
        <div class="stream-host-inline-actions">
            <button type="button" class="stream-host-inline-btn ${liveStudioState?.previewSafeZone ? "active" : ""}" data-preview-toggle="previewSafeZone">
                Safe zone
            </button>
            <button type="button" class="stream-host-inline-btn ${liveStudioState?.previewGrid ? "active" : ""}" data-preview-toggle="previewGrid">
                Grille
            </button>
            <button type="button" class="stream-host-inline-btn ${liveStudioState?.previewMirror ? "active" : ""}" data-preview-toggle="previewMirror">
                Mirror
            </button>
        </div>
        <p class="stream-host-note">
            Le player principal reste votre reference temps reel. Ces filtres servent au control room pour controler cadrage, lisibilite et confort d exploitation.
        </p>
    `;
    }

    function renderModeratorsDrawerContent() {
        const selectedIds = new Set(liveStudioState?.moderatorIds || []);
        const moderators = liveStudioState?.moderators || {};
        if (hostPanelViewersLoading && hostPanelViewers.length === 0) {
            return '<div class="stream-host-empty">Chargement des viewers...</div>';
        }

        const rosterMap = new Map();
        hostPanelViewers.forEach((viewer) => {
            if (!viewer?.user_id) return;
            rosterMap.set(viewer.user_id, {
                user_id: viewer.user_id,
                users: viewer.users || {},
                isActiveViewer: true,
            });
        });

        Object.entries(moderators).forEach(([userId, config]) => {
            if (!rosterMap.has(userId)) {
                rosterMap.set(userId, {
                    user_id: userId,
                    users: {
                        name: config.name || "Moderateur",
                        avatar: config.avatar || "",
                    },
                    isActiveViewer: false,
                });
            }
        });

        const search = normalizeModerationText(liveModeratorSearchTerm);
        const roster = Array.from(rosterMap.values()).filter((viewer) => {
            if (!search) return true;
            const haystack = normalizeModerationText(
                `${viewer?.users?.name || ""} ${viewer?.user_id || ""}`,
            );
            return haystack.includes(search);
        });

        if (roster.length === 0) {
            return `
            <div class="stream-host-toolbar">
                <input
                    type="search"
                    class="stream-host-search"
                    placeholder="Rechercher un viewer..."
                    value="${escapeHtml(liveModeratorSearchTerm)}"
                    data-moderator-search
                />
            </div>
            <div class="stream-host-empty">
                Aucun profil ne correspond au filtre courant.
            </div>
        `;
        }

        return `
        <div class="stream-host-toolbar">
            <input
                type="search"
                class="stream-host-search"
                placeholder="Rechercher un viewer..."
                value="${escapeHtml(liveModeratorSearchTerm)}"
                data-moderator-search
            />
            <span class="stream-host-counter">${escapeHtml(String(selectedIds.size))} moderateur(s)</span>
        </div>
        <div class="stream-host-roster">
            ${roster
                .map((viewer) => {
                    const userId = viewer.user_id || "";
                    const name = viewer.users?.name || "Utilisateur";
                    const isModerator = selectedIds.has(userId);
                    const config = getModeratorConfig(userId);
                    return `
                        <article class="stream-host-member ${isModerator ? "is-moderator" : ""}">
                            <div class="stream-host-member-head">
                                <div class="stream-host-member-copy">
                                    <strong>${escapeHtml(name)}</strong>
                                    <span>${escapeHtml(userId)}</span>
                                </div>
                                <div class="stream-host-member-actions">
                                    <span class="stream-host-member-state">${viewer.isActiveViewer ? "En salle" : "Hors ligne"}</span>
                                    <button
                                        type="button"
                                        class="stream-host-inline-btn ${isModerator ? "active" : ""}"
                                        data-moderator-id="${escapeHtml(userId)}"
                                    >
                                        ${isModerator ? "Retirer" : "Nommer"}
                                    </button>
                                </div>
                            </div>
                            ${
                                isModerator
                                    ? `
                                        <div class="stream-host-role-row">
                                            <label>
                                                <span>Role</span>
                                                <select data-moderator-role="${escapeHtml(userId)}">
                                                    ${Object.entries(
                                                        MODERATOR_ROLE_TEMPLATES,
                                                    )
                                                        .map(
                                                            ([
                                                                roleId,
                                                                role,
                                                            ]) => `
                                                            <option value="${escapeHtml(roleId)}" ${config.role === roleId ? "selected" : ""}>
                                                                ${escapeHtml(role.label)}
                                                            </option>
                                                        `,
                                                        )
                                                        .join("")}
                                                </select>
                                            </label>
                                            <small>${escapeHtml(getModeratorRoleTemplate(config.role).summary || "")}</small>
                                        </div>
                                        <div class="stream-host-permission-grid">
                                            ${Object.entries(
                                                MODERATOR_PERMISSION_LABELS,
                                            )
                                                .map(
                                                    ([
                                                        permissionKey,
                                                        permissionLabel,
                                                    ]) => `
                                                    <button
                                                        type="button"
                                                        class="stream-host-permission-chip ${config.permissions?.[permissionKey] ? "active" : ""}"
                                                        data-moderator-permission="${escapeHtml(permissionKey)}"
                                                        data-moderator-user="${escapeHtml(userId)}"
                                                    >
                                                        ${escapeHtml(permissionLabel)}
                                                    </button>
                                                `,
                                                )
                                                .join("")}
                                        </div>
                                    `
                                    : `
                                        <p class="stream-host-note">
                                            Ajoutez ce viewer pour lui attribuer un role et des permissions en temps reel.
                                        </p>
                                    `
                            }
                        </article>
                    `;
                })
                .join("")}
        </div>
    `;
    }

    function buildViewerTrendBars() {
        const analytics = ensureLiveAnalyticsState();
        const points = analytics.viewerSeries.slice(-12);
        if (!points.length) {
            return '<div class="stream-host-empty">Collecte audience en cours...</div>';
        }
        const maxValue = Math.max(
            1,
            ...points.map((entry) => Number(entry?.value) || 0),
        );
        return `
        <div class="stream-host-chart">
            ${points
                .map((entry) => {
                    const height = Math.max(
                        12,
                        Math.round(
                            ((Number(entry?.value) || 0) / maxValue) * 100,
                        ),
                    );
                    return `<span class="stream-host-chart-bar" style="height:${height}%"></span>`;
                })
                .join("")}
        </div>
    `;
    }

    function buildMessageTempoBars() {
        const analytics = ensureLiveAnalyticsState();
        const now = Date.now();
        const bucketCount = 8;
        const bucketSize = 1000 * 60;
        const buckets = Array.from({ length: bucketCount }, (_, index) => {
            const start = now - bucketSize * (bucketCount - index);
            const end = start + bucketSize;
            return analytics.messageSeries.filter(
                (entry) => entry.ts >= start && entry.ts < end,
            ).length;
        });
        const maxValue = Math.max(1, ...buckets);
        return `
        <div class="stream-host-chart stream-host-chart--tempo">
            ${buckets
                .map((value) => {
                    const height = Math.max(
                        10,
                        Math.round((value / maxValue) * 100),
                    );
                    return `<span class="stream-host-chart-bar" style="height:${height}%"></span>`;
                })
                .join("")}
        </div>
    `;
    }

    function renderStatsDrawerContent() {
        const analytics = ensureLiveAnalyticsState();
        const topChatters = getTopChatters(3);
        return `
        <div class="stream-host-drawer-head">
            <h4>Stats temps reel</h4>
            <p>Lecture live de l audience, de l engagement et des pics de trafic observes pendant la session.</p>
        </div>
        <div class="stream-host-stats-grid stream-host-stats-grid--wide">
            <div class="stream-host-stat">
                <span>Viewers actifs</span>
                <strong>${escapeHtml(String(currentStream?.viewer_count || 0))}</strong>
            </div>
            <div class="stream-host-stat">
                <span>Pic audience</span>
                <strong>${escapeHtml(String(analytics.peakViewers || 0))}</strong>
            </div>
            <div class="stream-host-stat">
                <span>Moyenne session</span>
                <strong>${escapeHtml(String(getAverageViewerCount()))}</strong>
            </div>
            <div class="stream-host-stat">
                <span>Messages / min</span>
                <strong>${escapeHtml(String(getMessagesPerMinute()))}</strong>
            </div>
            <div class="stream-host-stat">
                <span>Participants chat</span>
                <strong>${escapeHtml(String(analytics.uniqueChatters.size || 0))}</strong>
            </div>
            <div class="stream-host-stat">
                <span>Viewers observes</span>
                <strong>${escapeHtml(String(analytics.uniqueViewerIds.size || 0))}</strong>
            </div>
        </div>
        <div class="stream-host-analytics-layout">
            <article class="stream-host-analytics-card">
                <div class="stream-host-analytics-head">
                    <strong>Courbe audience</strong>
                    <span>${escapeHtml(analytics.peakMomentumLabel || "Stable")}</span>
                </div>
                ${buildViewerTrendBars()}
            </article>
            <article class="stream-host-analytics-card">
                <div class="stream-host-analytics-head">
                    <strong>Tempo chat</strong>
                    <span>${escapeHtml(String(getMessagesPerMinute()))}/min</span>
                </div>
                ${buildMessageTempoBars()}
            </article>
        </div>
        <div class="stream-host-list">
            ${
                topChatters.length
                    ? topChatters
                          .map(
                              (entry) => `
                              <div class="stream-host-list-item">
                                  <div class="stream-host-list-copy">
                                      <strong>${escapeHtml(entry.name)}</strong>
                                      <span>${escapeHtml(entry.userId)}</span>
                                  </div>
                                  <span class="stream-host-chip-plain">${escapeHtml(String(entry.count))} msg</span>
                              </div>
                          `,
                          )
                          .join("")
                    : '<div class="stream-host-empty">Les top chatters apparaitront ici des que la salle s anime.</div>'
            }
        </div>
    `;
    }

    function renderEngagementDrawerContent() {
        const analytics = ensureLiveAnalyticsState();
        return `
        <div class="stream-host-drawer-head">
            <h4>Engagement avance</h4>
            <p>Activez les leviers d interaction sans quitter la salle de controle.</p>
        </div>
        <div class="stream-host-inline-actions">
            <button type="button" class="stream-host-inline-btn ${liveStudioState?.giftsEnabled ? "active" : ""}" data-live-feature="giftsEnabled">
                Cadeaux ${liveStudioState?.giftsEnabled ? "ON" : "OFF"}
            </button>
            <button type="button" class="stream-host-inline-btn ${liveStudioState?.pollsEnabled ? "active" : ""}" data-live-feature="pollsEnabled">
                Sondages ${liveStudioState?.pollsEnabled ? "ON" : "OFF"}
            </button>
        </div>
        <div class="stream-host-stats-grid stream-host-stats-grid--wide">
            <div class="stream-host-stat">
                <span>Score engagement</span>
                <strong>${escapeHtml(String(getEngagementScore()))}</strong>
            </div>
            <div class="stream-host-stat">
                <span>Actions manuelles</span>
                <strong>${escapeHtml(String(analytics.manualActions || 0))}</strong>
            </div>
            <div class="stream-host-stat">
                <span>Momentum</span>
                <strong>${escapeHtml(analytics.peakMomentumLabel || "Stable")}</strong>
            </div>
            <div class="stream-host-stat">
                <span>Duree live</span>
                <strong>${escapeHtml(getStreamDurationLabel())}</strong>
            </div>
        </div>
        <p class="stream-host-note">
            Ces toggles sont persistants par session. Ils prepareront directement la salle pour les hooks backend cadeaux / sondages sans refonte UI.
        </p>
    `;
    }

    function renderAutomationDrawerContent() {
        const queueEntries = liveModerationEntries.filter((entry) => {
            if (!entry.status || entry.status === "approved") return false;
            if (liveModerationQueueFilter === "all") return true;
            return entry.status === liveModerationQueueFilter;
        });
        const mutedUsers = Array.from(
            new Set(liveStudioState?.mutedUserIds || []),
        );
        return `
        <div class="stream-host-drawer-head">
            <h4>Auto-moderation</h4>
            <p>Reglez la reaction automatique, la liste de mots sensibles et traitez la file d alertes sans quitter le direct.</p>
        </div>
        <div class="stream-host-inline-actions">
            <button type="button" class="stream-host-inline-btn ${liveStudioState?.autoModEnabled ? "active" : ""}" data-live-feature="autoModEnabled">
                Auto-mod ${liveStudioState?.autoModEnabled ? "ON" : "OFF"}
            </button>
            ${Object.entries(LIVE_AUTO_MOD_ACTIONS)
                .map(
                    ([actionId, label]) => `
                    <button
                        type="button"
                        class="stream-host-inline-btn ${liveStudioState?.autoModAction === actionId ? "active" : ""}"
                        data-auto-mod-action="${escapeHtml(actionId)}"
                    >
                        ${escapeHtml(label)}
                    </button>
                `,
                )
                .join("")}
        </div>
        <div class="stream-host-compose">
            <label for="stream-host-keywords">Mots sensibles</label>
            <textarea
                id="stream-host-keywords"
                class="stream-host-textarea"
                rows="3"
                placeholder="spam, arnaque, insulte, lien douteux"
                data-auto-mod-keywords
            >${escapeHtml((liveStudioState?.autoModKeywords || []).join(", "))}</textarea>
            <div class="stream-host-inline-actions">
                <button type="button" class="stream-host-inline-btn active" data-auto-mod-save>
                    Mettre a jour
                </button>
            </div>
        </div>
        <div class="stream-host-toolbar">
            <div class="stream-host-inline-actions">
                ${["all", "flagged", "held", "masked"]
                    .map(
                        (filterId) => `
                        <button
                            type="button"
                            class="stream-host-inline-btn ${liveModerationQueueFilter === filterId ? "active" : ""}"
                            data-moderation-filter="${escapeHtml(filterId)}"
                        >
                            ${escapeHtml(filterId)}
                        </button>
                    `,
                    )
                    .join("")}
            </div>
            <span class="stream-host-counter">${escapeHtml(String(queueEntries.length))} alerte(s)</span>
        </div>
        <div class="stream-host-queue">
            ${
                queueEntries.length
                    ? queueEntries
                          .map(
                              (entry) => `
                              <article class="stream-host-queue-item">
                                  <div class="stream-host-queue-head">
                                      <div>
                                          <strong>${escapeHtml(entry.userName || "Utilisateur")}</strong>
                                          <span>${escapeHtml(entry.reason || entry.status || "alerte")}</span>
                                      </div>
                                      <span class="stream-host-chip-plain">${escapeHtml(entry.status)}</span>
                                  </div>
                                  <p>${escapeHtml(entry.originalMessage || "")}</p>
                                  <div class="stream-host-inline-actions">
                                      <button type="button" class="stream-host-inline-btn" data-moderation-action="approve" data-moderation-key="${escapeHtml(entry.key)}">Approuver</button>
                                      <button type="button" class="stream-host-inline-btn" data-moderation-action="hold" data-moderation-key="${escapeHtml(entry.key)}">Attente</button>
                                      <button type="button" class="stream-host-inline-btn" data-moderation-action="mask" data-moderation-key="${escapeHtml(entry.key)}">Masquer</button>
                                      <button type="button" class="stream-host-inline-btn ${mutedUsers.includes(entry.userId) ? "active" : ""}" data-moderation-action="${mutedUsers.includes(entry.userId) ? "unmute-user" : "mute-user"}" data-moderation-key="${escapeHtml(entry.key)}">
                                          ${mutedUsers.includes(entry.userId) ? "Unmute auteur" : "Mute auteur"}
                                      </button>
                                  </div>
                              </article>
                          `,
                          )
                          .join("")
                    : '<div class="stream-host-empty">Aucune alerte pour le moment.</div>'
            }
        </div>
        ${
            mutedUsers.length
                ? `
                    <div class="stream-host-muted-list">
                        <strong>Auteurs mutes</strong>
                        <div class="stream-host-inline-actions">
                            ${mutedUsers
                                .map(
                                    (userId) => `
                                    <button
                                        type="button"
                                        class="stream-host-inline-btn active"
                                        data-unmute-user="${escapeHtml(userId)}"
                                    >
                                        ${escapeHtml(userId)}
                                    </button>
                                `,
                                )
                                .join("")}
                        </div>
                    </div>
                `
                : ""
        }
    `;
    }

    function renderHostToolDrawer() {
        const drawer = document.getElementById("stream-host-panel-drawer");
        if (!drawer) return;

        const activeTool = findHostTool(activeHostToolId);
        if (!activeTool || !isStreamHost) {
            drawer.hidden = true;
            drawer.innerHTML = "";
            return;
        }

        let bodyHtml = "";
        if (activeTool.id === "preview") {
            bodyHtml = renderPreviewDrawerContent();
        } else if (activeTool.id === "filters") {
            bodyHtml = renderFiltersDrawerContent();
        } else if (activeTool.id === "moderators") {
            bodyHtml = `
            <div class="stream-host-drawer-head">
                <h4>Moderateurs du live</h4>
                <p>Nomination, role et permissions de l equipe de moderation en temps reel.</p>
            </div>
            ${renderModeratorsDrawerContent()}
        `;
        } else if (activeTool.id === "stats") {
            bodyHtml = renderStatsDrawerContent();
        } else if (activeTool.id === "engagement") {
            bodyHtml = renderEngagementDrawerContent();
        } else if (activeTool.id === "automation") {
            bodyHtml = renderAutomationDrawerContent();
        }

        drawer.hidden = false;
        drawer.innerHTML = bodyHtml;
        syncAudiencePreviewMonitors();

        Array.from(drawer.querySelectorAll("[data-live-filter]")).forEach(
            (button) => {
                button.addEventListener("click", () => {
                    setPreviewFilter(button.dataset.liveFilter);
                });
            },
        );

        const previewIntensity = drawer.querySelector(
            "[data-preview-intensity]",
        );
        if (previewIntensity) {
            previewIntensity.addEventListener("input", (event) => {
                setPreviewIntensity(event.target.value);
            });
        }

        Array.from(drawer.querySelectorAll("[data-preview-toggle]")).forEach(
            (button) => {
                button.addEventListener("click", () => {
                    togglePreviewOption(button.dataset.previewToggle);
                });
            },
        );

        Array.from(drawer.querySelectorAll("[data-moderator-id]")).forEach(
            (button) => {
                button.addEventListener("click", () => {
                    toggleModerator(button.dataset.moderatorId);
                });
            },
        );

        const moderatorSearch = drawer.querySelector("[data-moderator-search]");
        if (moderatorSearch) {
            moderatorSearch.addEventListener("input", (event) => {
                setModeratorSearchTerm(event.target.value);
            });
        }

        Array.from(drawer.querySelectorAll("[data-moderator-role]")).forEach(
            (select) => {
                select.addEventListener("change", (event) => {
                    setModeratorRole(
                        event.target.dataset.moderatorRole,
                        event.target.value,
                    );
                });
            },
        );

        Array.from(
            drawer.querySelectorAll("[data-moderator-permission]"),
        ).forEach((button) => {
            button.addEventListener("click", () => {
                toggleModeratorPermission(
                    button.dataset.moderatorUser,
                    button.dataset.moderatorPermission,
                );
            });
        });

        Array.from(drawer.querySelectorAll("[data-live-feature]")).forEach(
            (button) => {
                button.addEventListener("click", () => {
                    toggleFutureFeature(button.dataset.liveFeature);
                });
            },
        );

        Array.from(drawer.querySelectorAll("[data-auto-mod-action]")).forEach(
            (button) => {
                button.addEventListener("click", () => {
                    setAutoModAction(button.dataset.autoModAction);
                });
            },
        );

        const autoModKeywords = drawer.querySelector(
            "[data-auto-mod-keywords]",
        );
        const autoModSave = drawer.querySelector("[data-auto-mod-save]");
        if (autoModKeywords && autoModSave) {
            autoModSave.addEventListener("click", () => {
                updateAutoModKeywords(autoModKeywords.value);
            });
        }

        Array.from(drawer.querySelectorAll("[data-moderation-filter]")).forEach(
            (button) => {
                button.addEventListener("click", () => {
                    setModerationQueueFilter(button.dataset.moderationFilter);
                });
            },
        );

        Array.from(drawer.querySelectorAll("[data-moderation-action]")).forEach(
            (button) => {
                button.addEventListener("click", () => {
                    applyModerationDecision(
                        button.dataset.moderationKey,
                        button.dataset.moderationAction,
                    );
                });
            },
        );

        Array.from(drawer.querySelectorAll("[data-unmute-user]")).forEach(
            (button) => {
                button.addEventListener("click", () => {
                    const targetUserId = button.dataset.unmuteUser;
                    const mutedUserIds = new Set(
                        liveStudioState?.mutedUserIds || [],
                    );
                    mutedUserIds.delete(targetUserId);
                    ensureLiveAnalyticsState().manualActions += 1;
                    updateLiveStudioState({
                        mutedUserIds: Array.from(mutedUserIds),
                    });
                });
            },
        );
    }

    function setupHostControlPanel() {
        if (!isStreamHost) return;
        loadLiveStudioState();
        applyLivePreviewFilter();
        renderHostControlPanel();
        renderHostToolDrawer();
    }

    function setChatEnabled(enabled) {
        const chatInput = document.getElementById("stream-chat-input");
        const chatButton = document.querySelector(
            "#stream-chat-form .stream-chat-send",
        );
        if (chatInput) {
            chatInput.disabled = !enabled;
            if (!enabled) {
                chatInput.placeholder = "Chat indisponible...";
            }
        }
        if (chatButton) {
            chatButton.disabled = !enabled;
        }
    }

    function setViewerWaiting(isWaiting) {
        const container = document.querySelector(".stream-video-container");
        if (!container) return;

        let waiting = document.getElementById("stream-waiting");
        if (!waiting) {
            waiting = document.createElement("div");
            waiting.id = "stream-waiting";
            waiting.className = "stream-waiting";
            waiting.innerHTML = `
            <div class="stream-waiting-card">
                <div class="stream-waiting-title">En attente du flux…</div>
                <div class="stream-waiting-subtitle">Le live va commencer sous peu.</div>
            </div>
        `;
            container.appendChild(waiting);
        }

        waiting.style.display = isWaiting ? "flex" : "none";

        const info = document.querySelector(".stream-info");
        if (info) {
            let note = document.getElementById("stream-waiting-note");
            if (!note) {
                note = document.createElement("div");
                note.id = "stream-waiting-note";
                note.className = "stream-waiting-note";
                note.innerHTML = `
                <strong>Live en préparation</strong>
                <span>Le flux vidéo n'est pas encore disponible.</span>
            `;
                info.prepend(note);
            }
            note.style.display = isWaiting ? "flex" : "none";
        }

        const followBtn = document.getElementById("follow-btn");
        const shareBtn = document.getElementById("share-btn");
        const buttons = [followBtn, shareBtn].filter(Boolean);
        buttons.forEach((btn) => {
            if (isWaiting) {
                btn.disabled = true;
                btn.classList.add("disabled");
                btn.style.opacity = "0.6";
                btn.style.cursor = "not-allowed";
            } else {
                btn.disabled = false;
                btn.classList.remove("disabled");
                btn.style.opacity = "";
                btn.style.cursor = "";
            }
        });

        if (isWaiting) {
            setStreamStatusMode("waiting");
        } else {
            setStreamStatusMode("live", {
                host: Boolean(isStreamHost),
                stream: currentStream,
            });
        }
    }

    function showStreamEndedMessage() {
        const container = document.querySelector(".stream-video-container");
        if (!container) return;

        const waiting = document.getElementById("stream-waiting");
        if (waiting) waiting.style.display = "none";

        let ended = document.getElementById("stream-ended");
        if (!ended) {
            ended = document.createElement("div");
            ended.id = "stream-ended";
            ended.className = "stream-waiting stream-ended";
            ended.innerHTML = `
            <div class="stream-waiting-card">
                <div class="stream-waiting-icon">🎬</div>
                <div class="stream-waiting-title">Live fini pour cette fois!</div>
                <div class="stream-waiting-subtitle">Merci de nous avoir regardé. L'hôte reviendra bientôt.</div>
                <div class="stream-ended-cta">
                    <a href="index.html#discover" class="btn-primary">Voir d'autres lives</a>
                </div>
            </div>
        `;
            container.appendChild(ended);
        }
        ended.style.display = "flex";

        const info = document.querySelector(".stream-info");
        if (info) {
            let note = document.getElementById("stream-ended-note");
            if (!note) {
                note = document.createElement("div");
                note.id = "stream-ended-note";
                note.className = "stream-waiting-note stream-ended-note";
                note.innerHTML = `
                <strong>✨ Live fini!</strong>
                <span>Merci d'avoir regardé. N'hésitez pas à suivre cet hôte pour ses prochains lives.</span>
            `;
                info.prepend(note);
            }
            note.style.display = "flex";
        }
    }

    // Exposer les fonctions utilisées par d'autres scripts
    window.startStream = startStream;
    window.joinStream = joinStream;
    window.endStream = endStream;
    window.leaveStream = leaveStream;
    window.initializeStreamPage = initializeStreamPage;
    window.toggleAudio = toggleAudio;
    window.enableStreamAudio = enableStreamAudio;
    window.XeraLiveStudio = {
        registerTool(sectionMeta, tool) {
            customHostPanelTools.push({ sectionMeta, tool });
            renderHostControlPanel();
            renderHostToolDrawer();
        },
        getState() {
            return { ...(liveStudioState || LIVE_STUDIO_DEFAULTS) };
        },
        updateState(patch) {
            updateLiveStudioState(patch);
        },
        openTool(toolId) {
            activeHostToolId = toolId || "";
            renderHostControlPanel();
            renderHostToolDrawer();
        },
        render() {
            renderHostControlPanel();
            renderHostToolDrawer();
        },
    };
    window.XeraLiveChatUI = {
        setup: setupChatInteractionUX,
        onMessagesRendered: handleChatMessagesRendered,
        scrollToLatest: scrollChatToLatest,
        prepareIncomingMessage: prepareChatScrollForIncomingMessage,
    };
} else {
    console.warn("streaming.js déjà chargé, initialisation ignorée.");
}
