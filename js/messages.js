/* ========================================
   MESSAGERIE DIRECTE (DM)
   ======================================== */

(function () {
    const DM_PAGE_ID = "messages";
    const DM_MESSAGES_LIMIT = 60;
    const DM_BODY_MAX = 4000;
    // Sélections de la plus récente à la plus ancienne : tant que la
    // migration sql/20261005_dm_secure_messaging.sql n'est pas appliquée,
    // on retombe sur les colonnes disponibles.
    const DM_MESSAGE_SELECTS = [
        "id, conversation_id, sender_id, body, media_url, media_path, media_type, media_name, media_size_bytes, reply_to_id, created_at, edited_at, deleted_at",
        "id, conversation_id, sender_id, body, media_url, media_type, media_name, media_size_bytes, created_at",
        "id, conversation_id, sender_id, body, created_at",
    ];
    const DM_MEDIA_BUCKET = "dm-media";
    const DM_MEDIA_MAX_BYTES = 50 * 1024 * 1024;
    const DM_IMAGE_MAX_DIMENSION = 2048;
    const DM_IMAGE_TYPES = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/heic",
        "image/heif",
    ];
    const DM_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
    const DM_ATTACHMENT_ACCEPT = [...DM_IMAGE_TYPES, ...DM_VIDEO_TYPES].join(",");
    const DM_EDIT_WINDOW_MS = 15 * 60 * 1000;
    const DM_TYPING_THROTTLE_MS = 2500;
    const DM_TYPING_DISPLAY_MS = 4500;
    const DM_MEDIA_CONCURRENCY = 4;
    const DM_MEDIA_CACHE_MAX = 200;
    const DM_REPORT_REASONS = [
        { value: "spam", label: "Spam ou publicité" },
        { value: "harassment", label: "Harcèlement ou menaces" },
        { value: "inappropriate", label: "Contenu inapproprié" },
        { value: "scam", label: "Arnaque ou usurpation" },
        { value: "other", label: "Autre" },
    ];

    const state = {
        initializedForUserId: null,
        selectedConversationId: null,
        conversations: [],
        conversationsById: new Map(),
        messagesByConversation: new Map(),
        usersById: new Map(),
        companyPagesByOwnerId: new Map(),
        seenMessageIds: new Set(),
        realtimeChannel: null,
        realtimeReconnectTimer: null,
        pollingTimer: null,
        refreshTimer: null,
        routeHandled: false,
        realtimeWarned: false,
        // Outbox holds messages that failed to send and will be retried
        outbox: [],
        // Count reconnect attempts for realtime with exponential backoff
        realtimeReconnectAttempts: 0,
        // Flag to avoid concurrent outbox processing
        processingOutbox: false,
        pendingAttachment: null,
        sendingMessage: false,
        activeRelationship: null,
        lastRenderedConversationId: null,
        lastRenderedMessagesSignature: "",
        conversationMembershipChecks: new Map(),
        threadFilter: "all",
        threadSearchQuery: "",
        // Médias privés : chemin Storage → { url (blob:), promise }
        mediaCache: new Map(),
        mediaQueue: [],
        mediaActiveDownloads: 0,
        // Pagination vers le haut : conversationId → { hasMore, loading }
        olderByConversation: new Map(),
        pinnedToBottom: true,
        replyTo: null,
        editing: null,
        messageMenu: null,
        typing: {
            channel: null,
            conversationId: null,
            lastSentAt: 0,
            otherTypingUntil: 0,
            hideTimer: null,
        },
        inboxRpcAvailable: true,
    };

    function getCurrentUserId() {
        return window.currentUserId || window.currentUser?.id || null;
    }

    function isLoggedIn() {
        return !!getCurrentUserId();
    }

    function hasDmPage() {
        return !!document.getElementById(DM_PAGE_ID);
    }

    function getDmSection() {
        return document.getElementById(DM_PAGE_ID);
    }

    function getDmMount() {
        return document.querySelector("#messages .messages-mount");
    }

    function getOrCreateNavBadge() {
        const badge = document.getElementById("messages-nav-badge");
        return badge || null;
    }

    function getNavButton() {
        return document.getElementById("messages-nav-btn");
    }

    function setNavButtonVisible(visible) {
        const btn = getNavButton();
        if (!btn) return;
        btn.style.display = visible ? "flex" : "none";
    }

    function setNavBadgeCount(count) {
        const value = Number(count) || 0;

        document
            .querySelectorAll(
                '#messages-nav-btn, [data-quick-action="messages"], .xera-bottom-item--messages',
            )
            .forEach((button) => {
                button.classList.toggle("has-unread", value > 0);
                const label = value > 0
                    ? `${value} message${value > 1 ? "s" : ""} non lu${value > 1 ? "s" : ""}`
                    : "Messages";
                button.setAttribute("aria-label", label);
                button.title = label;
            });

        const badge = getOrCreateNavBadge();
        if (!badge) return;
        if (value > 0) {
            badge.textContent = value > 99 ? "99+" : String(value);
            badge.style.display = "flex";
        } else {
            badge.style.display = "none";
            badge.textContent = "";
        }
        badge.setAttribute("aria-hidden", "true");
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function trimSnippet(value, maxLen = 80) {
        const text = String(value || "")
            .replace(/\s+/g, " ")
            .trim();
        if (!text) return "";
        if (text.length <= maxLen) return text;
        return `${text.slice(0, maxLen - 1)}…`;
    }

    function formatBytes(bytes) {
        const value = Number(bytes);
        if (!Number.isFinite(value) || value <= 0) return "";
        if (typeof window.formatFileSize === "function") {
            try {
                return window.formatFileSize(value);
            } catch (error) {
                // ignore formatter issues and fallback
            }
        }
        const units = ["o", "Ko", "Mo", "Go"];
        let unitIndex = 0;
        let size = value;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex += 1;
        }
        const rounded =
            size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1);
        return `${rounded} ${units[unitIndex]}`;
    }

    function isMobileDevice() {
        try {
            const mq =
                window.matchMedia &&
                window.matchMedia("(max-width: 960px)").matches;
            const ua = navigator.userAgent || "";
            const mobileUA = /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(ua);
            return !!(mq || mobileUA);
        } catch (e) {
            return false;
        }
    }

    function isMissingColumnMessage(message, columnNames) {
        const normalized = String(message || "").toLowerCase();
        const mentionsMissing =
            normalized.includes("does not exist") ||
            normalized.includes("n'existe pas") ||
            normalized.includes("could not find") ||
            normalized.includes("schema cache");
        if (!mentionsMissing) return false;
        return columnNames.some((column) =>
            normalized.includes(String(column || "").toLowerCase()),
        );
    }

    function isMissingDmMediaSchemaError(error) {
        const message = String(error?.message || "");
        return isMissingColumnMessage(message, [
            "media_url",
            "media_path",
            "media_type",
            "media_name",
            "media_size_bytes",
            "reply_to_id",
            "edited_at",
            "deleted_at",
        ]);
    }

    function isMissingRpcError(error, functionName) {
        const message = String(error?.message || "").toLowerCase();
        const code = String(error?.code || "");
        return (
            code === "PGRST202" ||
            code === "42883" ||
            ((message.includes("could not find the function") ||
                message.includes("does not exist")) &&
                message.includes(String(functionName).toLowerCase()))
        );
    }

    function isLegacyDmMediaConstraintError(error) {
        const message = String(error?.message || "").toLowerCase();
        return (
            message.includes("dm_messages_body_not_empty") ||
            message.includes("dm_messages_content_required") ||
            (message.includes("null value") && message.includes("body")) ||
            (message.includes("violates") && message.includes("body"))
        );
    }

    function normalizeMessageRow(row) {
        if (!row || typeof row !== "object") return row;
        return {
            ...row,
            body: row.body || "",
            media_url: row.media_url || null,
            media_path: row.media_path || null,
            media_type: row.media_type || null,
            media_name: row.media_name || null,
            media_size_bytes: row.media_size_bytes || null,
            reply_to_id: row.reply_to_id || null,
            edited_at: row.edited_at || null,
            deleted_at: row.deleted_at || null,
        };
    }

    async function runMessageSelect(queryFactory) {
        let response = null;
        for (const selectColumns of DM_MESSAGE_SELECTS) {
            response = await queryFactory(selectColumns);
            if (!response?.error || !isMissingDmMediaSchemaError(response.error)) {
                break;
            }
        }

        if (response?.error) {
            return { data: null, error: response.error };
        }

        if (Array.isArray(response?.data)) {
            return {
                data: response.data.map((row) => normalizeMessageRow(row)),
                error: null,
            };
        }

        return {
            data: response?.data
                ? normalizeMessageRow(response.data)
                : response?.data,
            error: null,
        };
    }

    function getMessageAttachmentLabel(message) {
        const mediaType = String(message?.media_type || "").toLowerCase();
        if (mediaType === "video") return "Vidéo";
        if (mediaType === "image") return "Photo";
        if (message?.media_url || message?.media_path) return "Fichier";
        return "";
    }

    function buildMessageSnippet(message, maxLen = 80) {
        if (message?.deleted_at) return "Message supprimé";
        const text = trimSnippet(message?.body || "", maxLen);
        if (text) return text;
        const mediaType = String(message?.media_type || "").toLowerCase();
        if (mediaType === "video") return "🎥 Vidéo";
        if (mediaType === "image") return "📷 Photo";
        return getMessageAttachmentLabel(message);
    }

    function isMobileLayout() {
        try {
            return Boolean(
                window.matchMedia && window.matchMedia("(max-width: 860px)").matches,
            );
        } catch (error) {
            return false;
        }
    }

    function isConversationVisible(conversationId) {
        if (!conversationId || state.selectedConversationId !== conversationId) {
            return false;
        }
        if (!isMessagesPageActive() || document.hidden) return false;
        if (!isMobileLayout()) return true;
        const shell = document.getElementById("messages-shell");
        return Boolean(shell?.classList.contains("mobile-thread-open"));
    }

    function getSupabaseBaseUrl() {
        if (typeof SUPABASE_URL !== "undefined" && SUPABASE_URL) {
            return String(SUPABASE_URL).replace(/\/+$/, "");
        }
        return String(supabase?.supabaseUrl || "").replace(/\/+$/, "");
    }

    function getSupabaseApiKey() {
        if (typeof SUPABASE_ANON_KEY !== "undefined" && SUPABASE_ANON_KEY) {
            return SUPABASE_ANON_KEY;
        }
        return supabase?.supabaseKey || "";
    }

    // Anciens médias (avant le bucket privé) : on n'affiche que les fichiers
    // de notre propre Storage, jamais une URL externe arbitraire.
    function isTrustedLegacyMediaUrl(url) {
        const base = getSupabaseBaseUrl();
        if (!base || typeof url !== "string") return false;
        return url.startsWith(`${base}/storage/v1/object/`);
    }

    function findCachedMessage(conversationId, messageId) {
        if (!conversationId || !messageId) return null;
        const messages = state.messagesByConversation.get(conversationId) || [];
        return messages.find((msg) => msg.id === messageId) || null;
    }

    function createNeutralRelationshipState(otherUserId = null) {
        return {
            otherUserId: otherUserId || null,
            blockedByMe: false,
            blockedMe: false,
            messagesRestricted: false,
            canMessage: Boolean(otherUserId),
            loading: false,
        };
    }

    function normalizeRelationshipState(value, otherUserId = null) {
        const blockedByMe =
            value?.blockedByMe === true || value?.blocked_by_me === true;
        const blockedMe =
            value?.blockedMe === true || value?.blocked_me === true;
        const messagesRestricted =
            value?.messagesRestricted === true ||
            value?.messages_restricted === true;
        const canMessage =
            value?.canMessage === false || value?.can_message === false
                ? false
                : !blockedByMe && !blockedMe && !messagesRestricted;
        return {
            otherUserId: otherUserId || value?.otherUserId || null,
            blockedByMe,
            blockedMe,
            messagesRestricted,
            canMessage,
            loading: value?.loading === true,
        };
    }

    function isRelationshipLocked(relationship) {
        return Boolean(
            relationship?.blockedByMe ||
                relationship?.blockedMe ||
                relationship?.messagesRestricted,
        );
    }

    function getSelectedConversation() {
        return (
            state.conversationsById.get(state.selectedConversationId) || null
        );
    }

    function getSelectedRelationshipState() {
        const conversation = getSelectedConversation();
        const otherUserId = conversation?.otherUserId || null;
        if (!otherUserId) return createNeutralRelationshipState(null);
        if (state.activeRelationship?.otherUserId === otherUserId) {
            return state.activeRelationship;
        }
        return createNeutralRelationshipState(otherUserId);
    }

    function getDmBlockedMessage(
        relationship = getSelectedRelationshipState(),
    ) {
        if (relationship?.blockedByMe) {
            return "Vous avez bloqué cet utilisateur. Débloquez-le depuis Réglages pour reprendre la discussion.";
        }
        if (relationship?.blockedMe) {
            return "Cet utilisateur vous a bloqué. Vous ne pouvez plus lui envoyer de messages.";
        }
        if (relationship?.messagesRestricted) {
            return "Cet utilisateur n'accepte pas de nouveaux messages de votre part.";
        }
        return "Messagerie indisponible pour cette conversation.";
    }

    const DM_ERROR_MESSAGES = {
        DM_PRIVACY_RESTRICTED:
            "Cet utilisateur n'accepte pas de nouveaux messages de votre part.",
        DM_RATE_LIMIT:
            "Vous envoyez trop de messages. Patientez quelques secondes.",
        DM_NOT_PARTICIPANT: "Vous ne faites pas partie de cette conversation.",
        DM_SENDER_MISMATCH: "Session invalide. Rechargez la page.",
        DM_MEDIA_URL_FORBIDDEN:
            "Votre application n'est pas à jour. Rechargez la page.",
        DM_MEDIA_PATH_INVALID: "Pièce jointe invalide. Réessayez.",
        DM_MEDIA_NOT_FOUND: "La pièce jointe n'a pas été envoyée. Réessayez.",
        DM_MEDIA_TYPE_INVALID: "Format de pièce jointe non pris en charge.",
        DM_REPLY_INVALID: "Le message auquel vous répondez n'existe plus.",
        DM_EDIT_WINDOW_EXPIRED:
            "Un message ne peut être modifié que dans les 15 minutes après son envoi.",
        DM_MESSAGE_DELETED: "Ce message a été supprimé.",
        DM_MESSAGE_NOT_FOUND: "Message introuvable.",
        DM_EMPTY_MESSAGE: "Le message ne peut pas être vide.",
        DM_MESSAGE_TOO_LONG: "Message trop long (4000 caractères maximum).",
        DM_REPORT_SELF: "Vous ne pouvez pas signaler votre propre message.",
        DM_REPORT_REASON_INVALID: "Choisissez un motif de signalement.",
    };

    function getFriendlyDmErrorMessage(error, fallbackMessage) {
        const rawMessage = String(error?.message || "").trim();
        const normalized = rawMessage.toUpperCase();
        const knownCode = Object.keys(DM_ERROR_MESSAGES).find((code) =>
            normalized.includes(code),
        );
        if (knownCode) return DM_ERROR_MESSAGES[knownCode];
        if (normalized.includes("DM_BLOCKED")) {
            return "Cette conversation est bloquée. Débloquez l'utilisateur depuis Réglages pour reprendre la discussion.";
        }
        if (normalized.includes("SELF_CONVERSATION_NOT_ALLOWED")) {
            return "Vous ne pouvez pas ouvrir une conversation avec vous-même.";
        }
        if (normalized.includes("OTHER_USER_REQUIRED")) {
            return "Utilisateur introuvable.";
        }
        if (normalized.includes("NOT_AUTHENTICATED")) {
            return "Votre session a expiré. Reconnectez-vous puis réessayez.";
        }
        return (
            rawMessage ||
            fallbackMessage ||
            "Impossible de poursuivre l'action."
        );
    }

    async function fetchRelationshipStatusForUser(otherUserId) {
        if (!otherUserId) return createNeutralRelationshipState(null);

        if (typeof window.fetchDmRelationshipStatus === "function") {
            const response =
                await window.fetchDmRelationshipStatus(otherUserId);
            return normalizeRelationshipState(response, otherUserId);
        }

        const { data, error } = await supabase.rpc(
            "get_dm_relationship_status",
            {
                p_other_user_id: otherUserId,
            },
        );
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        return normalizeRelationshipState(row, otherUserId);
    }

    async function refreshActiveRelationshipState(
        conversationId = state.selectedConversationId,
    ) {
        const conversation = conversationId
            ? state.conversationsById.get(conversationId) || null
            : null;
        const otherUserId = conversation?.otherUserId || null;

        state.activeRelationship = createNeutralRelationshipState(otherUserId);
        if (!otherUserId) {
            renderChatHeader();
            syncComposerState();
            return state.activeRelationship;
        }

        state.activeRelationship.loading = true;
        renderChatHeader();
        syncComposerState();

        try {
            const relationship =
                await fetchRelationshipStatusForUser(otherUserId);
            if (
                state.selectedConversationId === conversationId &&
                relationship.otherUserId === otherUserId
            ) {
                state.activeRelationship = relationship;
                renderChatHeader();
                syncComposerState();
            }
            return relationship;
        } catch (error) {
            console.warn("DM relationship status error:", error);
            if (state.selectedConversationId === conversationId) {
                state.activeRelationship =
                    createNeutralRelationshipState(otherUserId);
                renderChatHeader();
                syncComposerState();
            }
            return createNeutralRelationshipState(otherUserId);
        }
    }

    function isMissingAccountSubtypeColumnError(error) {
        const message = String(error?.message || "").toLowerCase();
        const mentionsColumn =
            message.includes("account_subtype") &&
            (message.includes("column") || message.includes("colonne"));
        const mentionsMissing =
            message.includes("does not exist") ||
            message.includes("n'existe pas") ||
            message.includes("could not find") ||
            message.includes("schema cache");
        return mentionsColumn && mentionsMissing;
    }

    function normalizeDiscoveryRole(value) {
        const raw = String(value || "")
            .trim()
            .toLowerCase();
        if (raw === "recruiter" || raw === "recruteur") return "recruiter";
        if (raw === "investor" || raw === "investisseur") return "investor";
        return "fan";
    }

    function getRoleBadgeMeta(value) {
        const role = normalizeDiscoveryRole(value);
        if (role === "recruiter") {
            return {
                role,
                label: "Recruteur",
                icon: "icons/recruteur.svg",
            };
        }
        if (role === "investor") {
            return {
                role,
                label: "Investisseur",
                icon: "icons/investisseur.svg",
            };
        }
        return null;
    }

    function renderRoleBadge(profile) {
        const roleMeta = getRoleBadgeMeta(
            profile?.accountSubtype || profile?.account_subtype || "",
        );
        if (!roleMeta) return "";
        return `<img src="${roleMeta.icon}" alt="${roleMeta.label}" title="Type de compte: ${roleMeta.label}" class="dm-role-badge dm-role-badge--${roleMeta.role}" />`;
    }

    function isCompanyProfile(profile) {
        return !!(
            profile?.type === "company" ||
            profile?.kind === "company" ||
            profile?.isPage === true ||
            profile?.pageId ||
            profile?.companyId ||
            profile?.slug ||
            profile?.pageSlug ||
            profile?.accountSubtype === "company" ||
            profile?.account_subtype === "company"
        );
    }

    function renderCompanyBadge(profile) {
        if (!isCompanyProfile(profile)) return "";
        return '<span class="dm-company-badge" title="Page professionnelle certifiée">PRO</span>';
    }

    function renderNameWithBadges(profile) {
        const safeName = escapeHtml(profile?.name || "Conversation");
        const userId = profile?.id || null;
        let verificationHtml = `<span class="username-label">${safeName}</span>`;

        if (userId && typeof window.renderUsernameWithBadge === "function") {
            try {
                verificationHtml =
                    window.renderUsernameWithBadge(safeName, userId) ||
                    verificationHtml;
            } catch (error) {
                verificationHtml = `<span class="username-label">${safeName}</span>`;
            }
        }

        const roleBadgeHtml = renderRoleBadge(profile);
        const companyBadgeHtml = renderCompanyBadge(profile);
        const badges = `${roleBadgeHtml || ""}${companyBadgeHtml || ""}`;
        if (!badges) return verificationHtml;
        return `<span class="dm-user-inline">${verificationHtml}${badges}</span>`;
    }

    function buildCompanyProfileHref(profile) {
        const slug = profile?.slug || profile?.pageSlug || profile?.companySlug;
        if (!slug) return buildProfileHref(profile?.id || null);
        if (typeof window.professionalManager?.renderProPage === "function") {
            return `profile.html?pro=${encodeURIComponent(slug)}`;
        }
        return `profile.html?pro=${encodeURIComponent(slug)}`;
    }

    function buildProfileHref(userIdOrProfile) {
        const profile =
            typeof userIdOrProfile === "object" && userIdOrProfile
                ? userIdOrProfile
                : { id: userIdOrProfile };

        if (isCompanyProfile(profile)) {
            return buildCompanyProfileHref(profile);
        }

        const userId = profile?.id || null;
        if (typeof window.buildProfileUrl === "function") {
            return window.buildProfileUrl(userId);
        }
        if (typeof window.XeraRouter?.buildProfileUrl === "function") {
            return window.XeraRouter.buildProfileUrl(userId);
        }
        if (window.XeraRouter?.buildUrl) {
            return window.XeraRouter.buildUrl("profile", {
                query: userId ? { user: userId } : {},
            });
        }
        if (!userId) return "profile";
        return `profile?user=${encodeURIComponent(userId)}`;
    }

    function openUserProfile(userIdOrProfile) {
        const profile =
            typeof userIdOrProfile === "object" && userIdOrProfile
                ? userIdOrProfile
                : { id: userIdOrProfile };
        const profileHref = buildProfileHref(profile);
        if (!profileHref) return;
        if (
            typeof window.navigateToUserProfile === "function" &&
            document.getElementById("profile") &&
            !isCompanyProfile(profile)
        ) {
            Promise.resolve(window.navigateToUserProfile(profile.id)).catch(
                (error) => {
                    console.error(
                        "Navigate profile from messages failed:",
                        error,
                    );
                    window.location.href = profileHref;
                },
            );
            return;
        }
        window.location.href = profileHref;
    }

    function handleMessageUserLinkClick(event) {
        const link = event.target.closest("[data-message-user-link='1']");
        if (!link) return false;
        const userId = link.getAttribute("data-user-id");
        const kind = link.getAttribute("data-profile-kind") || "";
        const slug = link.getAttribute("data-company-slug") || "";
        if (!userId && !slug) return false;
        event.preventDefault();
        event.stopPropagation();
        if (kind === "company" && slug) {
            window.location.href = buildCompanyProfileHref({
                id: userId,
                slug,
                type: "company",
                isPage: true,
            });
            return true;
        }
        openUserProfile(userId);
        return true;
    }

    function extractOtherUserIdFromPairKey(pairKey, currentUserId) {
        const parts = String(pairKey || "")
            .split(":")
            .map((part) => part.trim())
            .filter(Boolean);
        if (parts.length < 2) return null;
        return parts.find((id) => id !== currentUserId) || null;
    }

    function formatThreadTime(timestamp) {
        if (!timestamp) return "";
        const date = new Date(timestamp);
        if (!Number.isFinite(date.getTime())) return "";

        const now = new Date();
        const isSameDay =
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth() &&
            date.getDate() === now.getDate();

        try {
            if (isSameDay) {
                return date.toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                });
            }
            return date.toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "2-digit",
            });
        } catch (error) {
            return "";
        }
    }

    function formatMessageTime(timestamp) {
        if (!timestamp) return "";
        const date = new Date(timestamp);
        if (!Number.isFinite(date.getTime())) return "";
        try {
            return date.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch (error) {
            return "";
        }
    }

    function getMessageDayKey(timestamp) {
        const date = new Date(timestamp || 0);
        if (!Number.isFinite(date.getTime())) return "";
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }

    function formatMessageDayLabel(timestamp) {
        const date = new Date(timestamp || 0);
        if (!Number.isFinite(date.getTime())) return "";
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        const key = getMessageDayKey(date);
        if (key === getMessageDayKey(today)) return "Aujourd'hui";
        if (key === getMessageDayKey(yesterday)) return "Hier";
        try {
            return date.toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                ...(date.getFullYear() !== today.getFullYear()
                    ? { year: "numeric" }
                    : {}),
            });
        } catch (error) {
            return "";
        }
    }

    function renderChatEmptyState() {
        return `
            <div class="chat-empty-state">
                <div class="chat-empty-icon"><i class="fa-regular fa-comments"></i></div>
                <h4>Vos messages</h4>
                <p>Choisissez une conversation pour commencer à discuter.</p>
            </div>
        `;
    }

    function ensureMessagesShell() {
        const mount = getDmMount();
        if (!mount) return false;
        if (mount.querySelector("#messages-shell")) return true;

        mount.innerHTML = `
            <div class="messages-page" id="messages-shell">
                <aside class="threads-panel" id="threads-panel">
                    <div class="messages-head">
                        <div class="messages-head-title-wrap">
                            <a href="index.html" class="messages-icon-btn messages-home-btn" aria-label="Accueil" title="Accueil">
                                <i class="fa-solid fa-house"></i>
                            </a>
                            <h3>Messages</h3>
                        </div>
                        <button type="button" id="messages-refresh-btn" class="messages-icon-btn messages-refresh-btn" aria-label="Actualiser" title="Actualiser">
                            <i class="fa-solid fa-arrows-rotate"></i>
                        </button>
                    </div>

                    <div class="messages-search-bar">
                        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                        <input type="search" id="threads-search-input" placeholder="Rechercher" aria-label="Rechercher des conversations" autocomplete="off" />
                    </div>

                    <div class="messages-tabs" role="tablist" aria-label="Filtres de messages">
                        <button type="button" class="messages-tab-btn active" role="tab" aria-selected="true" data-thread-filter="all">Tous</button>
                        <button type="button" class="messages-tab-btn" role="tab" aria-selected="false" data-thread-filter="unread">Non lus</button>
                    </div>

                    <div class="threads-list" id="threads-list"></div>
                </aside>

                <section class="chat-panel empty" id="chat-panel">
                    <div class="chat-header" id="chat-header">
                        <button type="button" class="messages-icon-btn messages-back-btn" id="messages-back-btn" aria-label="Retour aux conversations"><i class="fa-solid fa-arrow-left"></i></button>
                        <div class="chat-header-meta">
                            <img src="https://placehold.co/80x80/2b2b33/fff?text=%F0%9F%92%AC" class="chat-header-avatar" alt="" />
                            <div class="chat-header-info">
                                <div id="chat-header-name">Sélectionnez une conversation</div>
                                <div id="chat-header-sub" hidden></div>
                            </div>
                        </div>
                        <div class="chat-header-actions" id="chat-header-actions">
                            <div class="chat-header-menu-wrap">
                                <button type="button" class="messages-icon-btn chat-header-icon-btn" id="chat-menu-btn" aria-label="Options de discussion" aria-haspopup="menu">
                                    <i class="fa-solid fa-ellipsis-vertical"></i>
                                </button>
                                <div class="chat-header-menu" id="chat-header-menu" role="menu" hidden>
                                    <button type="button" class="chat-menu-item" id="chat-mute-btn" role="menuitem"><i class="fa-regular fa-bell-slash"></i> <span>Couper les notifications</span></button>
                                    <button type="button" class="chat-menu-item" id="chat-delete-btn" role="menuitem"><i class="fa-regular fa-eye-slash"></i> Masquer la discussion</button>
                                    <button type="button" class="chat-menu-item danger" id="chat-report-btn" role="menuitem"><i class="fa-regular fa-flag"></i> Signaler</button>
                                    <button type="button" class="chat-menu-item danger" id="chat-block-btn" role="menuitem"><i class="fa-solid fa-ban"></i> <span>Bloquer</span></button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="chat-messages chat-thread-container" id="chat-messages" aria-live="polite">
                        ${renderChatEmptyState()}
                    </div>
                    <form class="chat-input-row" id="chat-input-form">
                        <input
                            id="chat-media-input"
                            type="file"
                            accept="${DM_ATTACHMENT_ACCEPT}"
                            hidden
                        />
                        <div class="chat-composer" id="chat-composer">
                            <div class="chat-compose-context" id="chat-compose-context" hidden></div>
                            <div class="chat-attachment-preview" id="chat-attachment-preview" hidden></div>
                            <div class="chat-compose-controls">
                                <button type="button" class="chat-attach-btn" id="chat-attach-btn" aria-label="Joindre une image ou une vidéo" title="Joindre une image ou une vidéo">
                                    <i class="fa-solid fa-paperclip"></i>
                                </button>
                                <textarea
                                    id="chat-input"
                                    class="form-input chat-input-textarea"
                                    maxlength="${DM_BODY_MAX}"
                                    autocomplete="off"
                                    placeholder="Écrire un message…"
                                    aria-label="Message"
                                    rows="1"
                                ></textarea>
                                <button type="submit" class="chat-send-btn" id="chat-send-btn" aria-label="Envoyer le message" title="Envoyer">
                                    <i class="fa-solid fa-paper-plane"></i>
                                </button>
                            </div>
                            <div class="chat-compose-hint" id="chat-compose-hint">
                                Entrée pour envoyer • Maj+Entrée pour une nouvelle ligne
                            </div>
                        </div>
                    </form>
                </section>
            </div>
        `;

        const refreshBtn = document.getElementById("messages-refresh-btn");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", () => {
                refreshConversations({ preserveSelection: true }).catch(
                    (error) => {
                        console.error("Messages refresh error:", error);
                    },
                );
            });
        }

        const backBtn = document.getElementById("messages-back-btn");
        if (backBtn) {
            backBtn.addEventListener("click", () => {
                setMobileThreadOpen(false);
            });
        }

        const threadsSearch = document.getElementById("threads-search-input");
        if (threadsSearch) {
            threadsSearch.addEventListener("input", () => {
                state.threadSearchQuery = threadsSearch.value;
                renderThreadsList();
            });
        }

        mount.querySelectorAll("[data-thread-filter]").forEach((tab) => {
            tab.addEventListener("click", () => {
                state.threadFilter = tab.dataset.threadFilter || "all";
                mount.querySelectorAll("[data-thread-filter]").forEach((btn) => {
                    const active = btn === tab;
                    btn.classList.toggle("active", active);
                    btn.setAttribute("aria-selected", active ? "true" : "false");
                });
                renderThreadsList();
            });
        });

        const list = document.getElementById("threads-list");
        if (list) {
            list.addEventListener("click", (event) => {
                if (handleMessageUserLinkClick(event)) return;
                const item = event.target.closest(".thread-item");
                if (!item) return;
                const conversationId = item.getAttribute(
                    "data-conversation-id",
                );
                if (!conversationId) return;
                selectConversation(conversationId, {
                    markRead: true,
                    focusInput: true,
                }).catch((error) => {
                    console.error("Conversation select error:", error);
                });
            });
        }

        const form = document.getElementById("chat-input-form");
        if (form) {
            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                await sendCurrentMessage();
            });
        }

        const input = document.getElementById("chat-input");
        if (input) {
            input.addEventListener("input", () => {
                autoResizeChatInput();
                syncComposerState();
                if (String(input.value || "").trim() && !state.editing) {
                    notifyTyping();
                }
            });
            input.addEventListener("keydown", (event) => {
                if (event.key === "Escape" && (state.replyTo || state.editing)) {
                    event.preventDefault();
                    clearComposeContext({ restoreDraft: true });
                    return;
                }
                if (event.key !== "Enter" || event.shiftKey) return;
                event.preventDefault();
                void sendCurrentMessage();
            });
        }

        const attachBtn = document.getElementById("chat-attach-btn");
        const mediaInput = document.getElementById("chat-media-input");
        if (attachBtn && mediaInput) {
            attachBtn.addEventListener("click", () => {
                if (attachBtn.disabled) return;
                mediaInput.click();
            });
            mediaInput.addEventListener("change", async () => {
                await handleAttachmentInput(mediaInput.files);
                mediaInput.value = "";
            });
        }

        const header = document.getElementById("chat-header");
        if (header) {
            header.addEventListener("click", (event) => {
                handleMessageUserLinkClick(event);
            });
        }

        const deleteBtn = document.getElementById("chat-delete-btn");
        if (deleteBtn) {
            deleteBtn.addEventListener("click", () => {
                const menu = document.getElementById("chat-header-menu");
                if (menu) menu.hidden = true;
                void handleDeleteConversationAction();
            });
        }

        const blockBtn = document.getElementById("chat-block-btn");
        if (blockBtn) {
            blockBtn.addEventListener("click", () => {
                const menu = document.getElementById("chat-header-menu");
                if (menu) menu.hidden = true;
                void handleBlockUserAction();
            });
        }

        const muteBtn = document.getElementById("chat-mute-btn");
        if (muteBtn) {
            muteBtn.addEventListener("click", () => {
                const menu = document.getElementById("chat-header-menu");
                if (menu) menu.hidden = true;
                void handleToggleMuteAction();
            });
        }

        const reportBtn = document.getElementById("chat-report-btn");
        if (reportBtn) {
            reportBtn.addEventListener("click", () => {
                const menu = document.getElementById("chat-header-menu");
                if (menu) menu.hidden = true;
                const conversation = getSelectedConversation();
                if (conversation) {
                    openReportDialog({ conversationId: conversation.id });
                }
            });
        }

        const menuBtn = document.getElementById("chat-menu-btn");
        const headerMenu = document.getElementById("chat-header-menu");
        if (menuBtn && headerMenu) {
            menuBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                headerMenu.hidden = !headerMenu.hidden;
            });
        }
        document.addEventListener("click", (event) => {
            const menuWrap = document.querySelector(".chat-header-menu-wrap");
            if (menuWrap && !menuWrap.contains(event.target)) {
                const menu = document.getElementById("chat-header-menu");
                if (menu) menu.hidden = true;
            }
        });

        const chat = document.getElementById("chat-messages");
        if (chat) {
            chat.addEventListener("click", (event) => {
                if (handleMessageUserLinkClick(event)) return;
                handleChatClick(event);
            });
            // Clic droit / appui long : notre menu d'actions, jamais le menu
            // natif "Enregistrer l'image".
            chat.addEventListener("contextmenu", (event) => {
                const wrap = event.target.closest(".message-bubble-wrap");
                const onMedia = event.target.closest(".chat-media-wrap");
                if (!wrap && !onMedia) return;
                event.preventDefault();
                if (wrap) openMessageMenu(wrap, event);
            });
            chat.addEventListener("dragstart", (event) => {
                if (event.target.closest(".chat-media-wrap")) {
                    event.preventDefault();
                }
            });
            bindChatGestures(chat);
            chat.addEventListener(
                "scroll",
                () => {
                    state.pinnedToBottom =
                        chat.scrollHeight - chat.scrollTop - chat.clientHeight < 120;
                    closeMessageMenu();
                    if (chat.scrollTop < 140) {
                        void loadOlderMessages(state.selectedConversationId);
                    }
                },
                { passive: true },
            );
        }

        renderAttachmentPreview();
        renderComposeContext();
        autoResizeChatInput();
        syncComposerState();

        // Keep composer hint responsive to viewport changes (e.g., rotate/resize)
        try {
            window.addEventListener("resize", () => {
                try {
                    syncComposerState();
                } catch (e) {}
            });
            window.addEventListener("orientationchange", () => {
                try {
                    syncComposerState();
                } catch (e) {}
            });
        } catch (e) {
            // ignore environments that don't support these events
        }

        return true;
    }

    function getChatInput() {
        return document.getElementById("chat-input");
    }

    function getChatMediaInput() {
        return document.getElementById("chat-media-input");
    }

    function getPendingAttachment() {
        return state.pendingAttachment || null;
    }

    function clearPendingAttachment({ revokePreview = true } = {}) {
        const pending = getPendingAttachment();
        if (revokePreview && pending?.previewUrl) {
            try {
                URL.revokeObjectURL(pending.previewUrl);
            } catch (error) {
                // ignore URL cleanup issues
            }
        }
        state.pendingAttachment = null;
        renderAttachmentPreview();
        syncComposerState();
    }

    function setPendingAttachment(file) {
        clearPendingAttachment();
        if (!file) return;

        const isVideo = DM_VIDEO_TYPES.includes(
            String(file.type || "").toLowerCase(),
        );

        state.pendingAttachment = {
            file,
            kind: isVideo ? "video" : "image",
            name: file.name || (isVideo ? "video" : "image"),
            size: Number(file.size || 0) || 0,
            previewUrl: URL.createObjectURL(file),
            uploading: false,
            progress: 0,
        };
        renderAttachmentPreview();
        syncComposerState();
    }

    function renderAttachmentPreview() {
        if (!ensureMessagesShell()) return;
        const container = document.getElementById("chat-attachment-preview");
        if (!container) return;

        const pending = getPendingAttachment();
        if (!pending?.file || !pending.previewUrl) {
            container.hidden = true;
            container.innerHTML = "";
            return;
        }

        const title = escapeHtml(pending.name || "");
        const metaParts = [
            pending.kind === "video" ? "Video" : "Image",
            formatBytes(pending.size),
        ].filter(Boolean);
        const progressLabel =
            pending.uploading && Number.isFinite(Number(pending.progress))
                ? `${Math.max(0, Math.min(100, Math.round(Number(pending.progress))))}%`
                : "";
        const previewHtml =
            pending.kind === "video"
                ? `<video class="chat-attachment-thumb" src="${escapeHtml(pending.previewUrl)}" muted playsinline controls preload="metadata"></video>`
                : `<img class="chat-attachment-thumb" src="${escapeHtml(pending.previewUrl)}" alt="${title || "Aperçu média"}" loading="lazy" />`;

        container.hidden = false;
        container.innerHTML = `
            <div class="chat-attachment-card${pending.uploading ? " is-uploading" : ""}">
                <div class="chat-attachment-visual">
                    ${previewHtml}
                </div>
                <div class="chat-attachment-meta">
                    <div class="chat-attachment-title">${title || "Pièce jointe"}</div>
                    <div class="chat-attachment-subtitle">
                        ${escapeHtml(metaParts.join(" • ") || "Pièce jointe")}
                    </div>
                    ${
                        pending.uploading
                            ? `
                        <div class="chat-upload-progress">
                            <div class="chat-upload-progress-bar">
                                <div class="chat-upload-progress-fill" style="width:${Math.max(0, Math.min(100, Number(pending.progress) || 0))}%"></div>
                            </div>
                            <span class="chat-upload-progress-label">${escapeHtml(progressLabel || "Upload...")}</span>
                        </div>
                    `
                            : ""
                    }
                </div>
                <button
                    type="button"
                    class="chat-attachment-remove"
                    id="chat-attachment-remove"
                    aria-label="Retirer la pièce jointe"
                    ${pending.uploading ? "disabled" : ""}
                >
                    ×
                </button>
            </div>
        `;

        const removeBtn = document.getElementById("chat-attachment-remove");
        if (removeBtn) {
            removeBtn.addEventListener("click", () => {
                clearPendingAttachment();
                const mediaInput = getChatMediaInput();
                if (mediaInput) mediaInput.value = "";
            });
        }
    }

    function autoResizeChatInput() {
        const input = getChatInput();
        if (!input) return;
        input.style.height = "auto";
        const nextHeight = Math.min(input.scrollHeight, 160);
        input.style.height = `${Math.max(44, nextHeight)}px`;
    }

    function syncComposerState() {
        const input = getChatInput();
        const sendBtn = document.getElementById("chat-send-btn");
        const attachBtn = document.getElementById("chat-attach-btn");
        const hint = document.getElementById("chat-compose-hint");
        const pending = getPendingAttachment();
        const relationship = getSelectedRelationshipState();
        const isBlocked = isRelationshipLocked(relationship);
        const editing = Boolean(state.editing);
        const canCompose = Boolean(state.selectedConversationId) && !isBlocked;
        const hasText = Boolean(String(input?.value || "").trim());
        const hasAttachment = Boolean(pending?.file);
        const isBusy = Boolean(state.sendingMessage || pending?.uploading);
        const canSend =
            canCompose && !isBusy && (hasText || hasAttachment || editing);

        if (input) {
            input.disabled = !canCompose || isBusy;
            const placeholder = !state.selectedConversationId
                ? "Écrire un message…"
                : isBlocked
                  ? "Discussion indisponible"
                  : editing
                    ? "Modifier le message…"
                    : "Écrire un message…";
            if (input.placeholder !== placeholder) input.placeholder = placeholder;
        }
        if (sendBtn) {
            sendBtn.disabled = !canSend;
            sendBtn.classList.toggle("active", canSend);
            sendBtn.classList.toggle("is-busy", isBusy);
            const icon = sendBtn.querySelector("i");
            const iconClass = editing ? "fa-solid fa-check" : "fa-solid fa-paper-plane";
            if (icon && icon.className !== iconClass) icon.className = iconClass;
            const label = editing ? "Enregistrer la modification" : "Envoyer le message";
            if (sendBtn.getAttribute("aria-label") !== label) {
                sendBtn.setAttribute("aria-label", label);
                sendBtn.title = editing ? "Enregistrer" : "Envoyer";
            }
        }
        if (attachBtn) attachBtn.disabled = !canCompose || isBusy || editing;
        if (hint) {
            const mobile = isMobileDevice();
            // Hide the helper hint on mobile to maximize vertical space
            hint.hidden = mobile;
            if (!mobile) {
                if (!canCompose) {
                    if (!state.selectedConversationId) {
                        hint.textContent =
                            "Sélectionnez une conversation pour commencer.";
                    } else {
                        hint.textContent = getDmBlockedMessage(relationship);
                    }
                } else if (pending?.uploading) {
                    hint.textContent = "Envoi sécurisé du média en cours…";
                } else if (editing) {
                    hint.textContent =
                        "Entrée pour enregistrer • Échap pour annuler";
                } else if (state.replyTo) {
                    hint.textContent =
                        "Entrée pour répondre • Échap pour annuler la réponse";
                } else if (hasAttachment && !hasText) {
                    hint.textContent =
                        "Vous pouvez envoyer le média seul ou ajouter un texte.";
                } else {
                    hint.textContent =
                        "Entrée pour envoyer • Maj+Entrée pour une nouvelle ligne";
                }
            }
        }
    }

    async function handleAttachmentInput(fileList) {
        const file = Array.isArray(fileList) ? fileList[0] : fileList?.[0];
        if (!file) return;

        const type = String(file.type || "").toLowerCase();
        let problem = "";
        if (![...DM_IMAGE_TYPES, ...DM_VIDEO_TYPES].includes(type)) {
            problem =
                "Formats acceptés : JPEG, PNG, GIF, WebP, HEIC, MP4, MOV, WebM.";
        } else if (Number(file.size || 0) > DM_MEDIA_MAX_BYTES) {
            problem = "Fichier trop volumineux (50 Mo maximum).";
        }
        if (problem) {
            if (window.ToastManager?.error) {
                window.ToastManager.error("Pièce jointe refusée", problem);
            } else {
                alert(problem);
            }
            return;
        }

        setPendingAttachment(file);
    }

    // ---------- Médias privés (bucket dm-media) ----------
    // Les fichiers sont téléchargés avec la session de l'utilisateur puis
    // affichés via des URL blob: locales. Aucune URL partageable n'existe :
    // une photo ne s'affiche que dans l'app, pour les participants.

    function runMediaQueue() {
        while (
            state.mediaActiveDownloads < DM_MEDIA_CONCURRENCY &&
            state.mediaQueue.length
        ) {
            const job = state.mediaQueue.shift();
            state.mediaActiveDownloads += 1;
            job()
                .catch(() => {})
                .finally(() => {
                    state.mediaActiveDownloads -= 1;
                    runMediaQueue();
                });
        }
    }

    function enqueueMediaDownload(task) {
        return new Promise((resolve, reject) => {
            state.mediaQueue.push(() => task().then(resolve, reject));
            runMediaQueue();
        });
    }

    function trimMediaCache() {
        if (state.mediaCache.size <= DM_MEDIA_CACHE_MAX) return;
        const chat = document.getElementById("chat-messages");
        for (const [path, entry] of state.mediaCache) {
            if (state.mediaCache.size <= DM_MEDIA_CACHE_MAX) break;
            if (!entry?.url) continue;
            // chemin validé par le serveur ([0-9a-f-/], [A-Za-z0-9._-]) : sûr
            const inUse = chat?.querySelector(`[data-media-path="${path}"]`);
            if (inUse) continue;
            URL.revokeObjectURL(entry.url);
            state.mediaCache.delete(path);
        }
    }

    function cacheLocalMedia(path, file) {
        if (!path || !file) return;
        try {
            state.mediaCache.set(path, { url: URL.createObjectURL(file) });
            trimMediaCache();
        } catch (error) {
            // pas d'aperçu local : le fichier sera téléchargé normalement
        }
    }

    function forgetMedia(path) {
        const entry = path ? state.mediaCache.get(path) : null;
        if (entry?.url) URL.revokeObjectURL(entry.url);
        if (path) state.mediaCache.delete(path);
    }

    function clearMediaCache() {
        state.mediaCache.forEach((entry) => {
            if (entry?.url) URL.revokeObjectURL(entry.url);
        });
        state.mediaCache = new Map();
        state.mediaQueue = [];
    }

    function loadPrivateMedia(path) {
        const cached = state.mediaCache.get(path);
        if (cached?.url) return Promise.resolve(cached.url);
        if (cached?.promise) return cached.promise;

        const promise = enqueueMediaDownload(() =>
            supabase.storage.from(DM_MEDIA_BUCKET).download(path),
        )
            .then(({ data, error }) => {
                if (error) throw error;
                if (!data) throw new Error("Média introuvable.");
                const url = URL.createObjectURL(data);
                state.mediaCache.set(path, { url });
                trimMediaCache();
                return url;
            })
            .catch((error) => {
                state.mediaCache.delete(path);
                throw error;
            });
        state.mediaCache.set(path, { promise });
        return promise;
    }

    function renderProtectedImage(url, alt) {
        return `<img class="chat-media chat-media-image" src="${escapeHtml(url)}" alt="${escapeHtml(alt || "Photo")}" draggable="false" loading="lazy" />`;
    }

    function renderProtectedVideo(url, { autoplay = false } = {}) {
        return `<video class="chat-media chat-media-video" src="${escapeHtml(url)}" controls ${autoplay ? "autoplay" : ""} preload="metadata" playsinline controlslist="nodownload noremoteplayback" disablepictureinpicture></video>`;
    }

    function renderMessageMedia(message) {
        if (message?.deleted_at) return "";
        const isVideo = String(message?.media_type || "").toLowerCase() === "video";

        if (message?.media_path) {
            const path = escapeHtml(message.media_path);
            const cachedUrl = state.mediaCache.get(message.media_path)?.url || "";
            if (isVideo) {
                const sizeLabel = formatBytes(message.media_size_bytes);
                return `
                    <div class="chat-media-wrap chat-media-private" data-media-path="${path}" data-media-kind="video">
                        ${
                            cachedUrl
                                ? renderProtectedVideo(cachedUrl)
                                : `<button type="button" class="chat-media-video-load" data-media-load="1" aria-label="Lire la vidéo">
                                    <span class="chat-media-play"><i class="fa-solid fa-play"></i></span>
                                    <span class="chat-media-video-label">Vidéo${sizeLabel ? ` · ${escapeHtml(sizeLabel)}` : ""}</span>
                                </button>`
                        }
                    </div>
                `;
            }
            return `
                <div class="chat-media-wrap chat-media-private${cachedUrl ? "" : " is-loading"}" data-media-path="${path}" data-media-kind="image" role="button" tabindex="0" aria-label="Agrandir la photo">
                    ${
                        cachedUrl
                            ? renderProtectedImage(cachedUrl, message.media_name)
                            : '<div class="chat-media-skeleton"><i class="fa-regular fa-image"></i></div>'
                    }
                </div>
            `;
        }

        if (message?.media_url) {
            if (!isTrustedLegacyMediaUrl(message.media_url)) {
                return '<div class="chat-media-unavailable"><i class="fa-solid fa-triangle-exclamation"></i> Média indisponible</div>';
            }
            if (isVideo) {
                return `<div class="chat-media-wrap">${renderProtectedVideo(message.media_url)}</div>`;
            }
            return `
                <div class="chat-media-wrap chat-media-legacy" data-legacy-src="${escapeHtml(message.media_url)}" role="button" tabindex="0" aria-label="Agrandir la photo">
                    ${renderProtectedImage(message.media_url, message.media_name)}
                </div>
            `;
        }
        return "";
    }

    // Charge les photos visibles (les vidéos attendent un appui sur Lecture).
    function hydratePrivateMedia(root) {
        if (!root) return;
        root.querySelectorAll(
            '.chat-media-private[data-media-kind="image"].is-loading:not([data-hydrating])',
        ).forEach((wrap) => {
            const path = wrap.getAttribute("data-media-path");
            if (!path) return;
            wrap.setAttribute("data-hydrating", "1");
            loadPrivateMedia(path)
                .then((url) => {
                    const chat = document.getElementById("chat-messages");
                    const stick = state.pinnedToBottom;
                    wrap.innerHTML = renderProtectedImage(url, "Photo");
                    wrap.classList.remove("is-loading");
                    const img = wrap.querySelector("img");
                    if (img && chat && stick) {
                        img.addEventListener(
                            "load",
                            () => {
                                chat.scrollTop = chat.scrollHeight;
                            },
                            { once: true },
                        );
                    }
                })
                .catch((error) => {
                    console.warn("DM media load failed:", error);
                    wrap.classList.remove("is-loading");
                    wrap.classList.add("is-error");
                    wrap.innerHTML =
                        '<button type="button" class="chat-media-retry" data-media-retry="1"><i class="fa-solid fa-rotate-right"></i> Photo indisponible · Réessayer</button>';
                })
                .finally(() => {
                    wrap.removeAttribute("data-hydrating");
                });
        });
    }

    function loadVideoInto(wrap) {
        const path = wrap?.getAttribute("data-media-path");
        if (!path || wrap.classList.contains("is-loading")) return;
        wrap.classList.add("is-loading");
        const button = wrap.querySelector("[data-media-load]");
        if (button) {
            button.disabled = true;
            button.querySelector(".chat-media-play").innerHTML =
                '<i class="fa-solid fa-spinner fa-spin"></i>';
        }
        loadPrivateMedia(path)
            .then((url) => {
                wrap.innerHTML = renderProtectedVideo(url, { autoplay: true });
            })
            .catch((error) => {
                console.warn("DM video load failed:", error);
                wrap.innerHTML =
                    '<button type="button" class="chat-media-retry" data-media-load="1"><i class="fa-solid fa-rotate-right"></i> Vidéo indisponible · Réessayer</button>';
            })
            .finally(() => {
                wrap.classList.remove("is-loading");
            });
    }

    function closeMediaViewer() {
        const viewer = document.getElementById("dm-media-viewer");
        if (!viewer) return;
        viewer.remove();
        document.removeEventListener("keydown", handleMediaViewerKeydown);
    }

    function handleMediaViewerKeydown(event) {
        if (event.key === "Escape") closeMediaViewer();
    }

    // Visionneuse intégrée : pas de nouvel onglet, pas de lien direct.
    function openMediaViewer(url, alt) {
        if (!url) return;
        closeMediaViewer();
        const viewer = document.createElement("div");
        viewer.id = "dm-media-viewer";
        viewer.className = "dm-media-viewer";
        viewer.setAttribute("role", "dialog");
        viewer.setAttribute("aria-modal", "true");
        viewer.setAttribute("aria-label", "Photo");
        viewer.innerHTML = `
            <button type="button" class="dm-media-viewer-close" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
            <img src="${escapeHtml(url)}" alt="${escapeHtml(alt || "Photo")}" draggable="false" />
            <div class="dm-media-viewer-note"><i class="fa-solid fa-lock"></i> Visible uniquement dans XERA1</div>
        `;
        viewer.addEventListener("click", (event) => {
            if (event.target.tagName !== "IMG") closeMediaViewer();
        });
        viewer.addEventListener("contextmenu", (event) => event.preventDefault());
        viewer.addEventListener("dragstart", (event) => event.preventDefault());
        document.body.appendChild(viewer);
        document.addEventListener("keydown", handleMediaViewerKeydown);
        viewer.querySelector(".dm-media-viewer-close")?.focus();
    }

    // ---------- Rendu des messages ----------

    function linkifyEscapedText(escapedText) {
        return escapedText.replace(
            // s'arrête avant une entité échappée (&quot; &#39; &lt; &gt;)
            /\bhttps?:\/\/(?:(?!&quot;|&#39;|&lt;|&gt;)[^\s<])+/gi,
            (match) => {
                const trailing = match.match(/[.,!?:)\]]+$/)?.[0] || "";
                const url = trailing ? match.slice(0, -trailing.length) : match;
                return `<a class="chat-link" href="${url}" target="_blank" rel="noopener noreferrer nofollow ugc">${url}</a>${trailing}`;
            },
        );
    }

    function getReplyPreview(message) {
        if (!message?.reply_to_id) return null;
        const original = findCachedMessage(
            message.conversation_id,
            message.reply_to_id,
        );
        const currentUserId = getCurrentUserId();
        if (!original) {
            return {
                id: message.reply_to_id,
                author: "Message d'origine",
                text: "Message plus ancien",
            };
        }
        const conversation = state.conversationsById.get(message.conversation_id);
        const author =
            original.sender_id === currentUserId
                ? "Vous"
                : getConversationDisplayUser(conversation).name || "Message";
        return {
            id: original.id,
            author,
            text: buildMessageSnippet(original, 90) || "Message",
        };
    }

    function renderMessageBody(message, quote) {
        if (message?.deleted_at) {
            return '<div class="chat-body chat-body-deleted"><i class="fa-solid fa-ban"></i> Message supprimé</div>';
        }
        const body = String(message?.body || "").trim();
        const quoteHtml = quote
            ? `<button type="button" class="chat-reply-quote" data-scroll-to-message="${escapeHtml(quote.id)}">
                    <span class="chat-reply-author">${escapeHtml(quote.author)}</span>
                    <span class="chat-reply-text">${escapeHtml(quote.text)}</span>
               </button>`
            : "";
        const mediaHtml = renderMessageMedia(message);
        const bodyHtml = body
            ? `<div class="chat-body">${linkifyEscapedText(escapeHtml(body))}</div>`
            : "";
        return `${quoteHtml}${mediaHtml}${bodyHtml}`;
    }

    function isMessageReadByOther(message, conversation) {
        const readAt = conversation?.otherLastReadAt;
        if (!readAt || !message?.created_at || message.pending) return false;
        return new Date(message.created_at).getTime() <= new Date(readAt).getTime();
    }

    function getMessageRenderSignature(message, extras = {}) {
        if (!message) return "";
        return [
            message.id || "",
            message.body || "",
            message.media_url || "",
            message.media_path || "",
            message.media_type || "",
            message.media_name || "",
            message.media_size_bytes || "",
            message.created_at || "",
            message.edited_at || "",
            message.deleted_at || "",
            message.pending ? "pending" : "",
            extras.read ? "read" : "",
            extras.quote ? `${extras.quote.author}:${extras.quote.text}` : "",
        ].join("|");
    }

    function buildMessageHtml(message, currentUserId, extras = {}) {
        const mine = message.sender_id === currentUserId;
        const messageTime = formatMessageTime(message.created_at);
        const isDeleted = Boolean(message.deleted_at);
        const hasRenderableMedia = Boolean(
            message?.media_path ||
                (message?.media_url && isTrustedLegacyMediaUrl(message.media_url)),
        );
        const hasMediaOnly =
            !isDeleted &&
            hasRenderableMedia &&
            !String(message?.body || "").trim() &&
            !extras.quote;
        // Les DM sont toujours en tête-à-tête : le nom de l'interlocuteur est
        // déjà dans l'en-tête, inutile de le répéter sur chaque bulle.
        let statusHtml = "";
        if (mine && !isDeleted) {
            if (message.pending) {
                statusHtml =
                    '<span class="message-status-icon" title="Envoi en cours"><i class="fa-regular fa-clock"></i></span>';
            } else if (extras.read) {
                statusHtml =
                    '<span class="message-status-icon is-read" title="Vu"><i class="fa-solid fa-check-double"></i></span>';
            } else {
                statusHtml =
                    '<span class="message-status-icon" title="Envoyé"><i class="fa-solid fa-check"></i></span>';
            }
        }
        const editedHtml =
            message.edited_at && !isDeleted
                ? '<span class="message-edited">modifié</span>'
                : "";
        const actionsHtml =
            message.pending || isDeleted
                ? ""
                : '<button type="button" class="message-action-btn" data-message-actions="1" aria-label="Actions du message" title="Actions"><i class="fa-solid fa-ellipsis"></i></button>';

        return `
            <div class="message-bubble-wrap ${mine ? "outgoing" : "incoming"}${message.pending ? " is-pending" : ""}${isDeleted ? " is-deleted" : ""}" data-message-id="${escapeHtml(message.id)}">
                <div class="message-bubble${hasMediaOnly ? " media-only" : ""}">
                    ${renderMessageBody(message, extras.quote)}
                    <span class="message-meta">
                        ${editedHtml}
                        <span class="chat-time">${escapeHtml(messageTime)}</span>
                        ${statusHtml}
                    </span>
                </div>
                ${actionsHtml}
            </div>
        `;
    }

    function createMessageNode(message, currentUserId, extras) {
        const template = document.createElement("template");
        template.innerHTML = buildMessageHtml(message, currentUserId, extras).trim();
        return template.content.firstElementChild;
    }

    function showSchemaMissingState() {
        if (!ensureMessagesShell()) return;
        const list = document.getElementById("threads-list");
        const chat = document.getElementById("chat-messages");
        if (list) {
            list.innerHTML = `<div class="loading-state">Messagerie indisponible: exécutez <code>sql/discovery-phase2-messaging.sql</code>.</div>`;
        }
        if (chat) {
            chat.innerHTML = `<div class="loading-state">Le schéma DM n'est pas encore installé sur la base de données.</div>`;
        }
    }

    function isMissingSchemaError(error) {
        const message = String(error?.message || "").toLowerCase();
        return (
            (message.includes("does not exist") ||
                message.includes("n'existe pas") ||
                message.includes("could not find")) &&
            (message.includes("dm_") ||
                message.includes("get_or_create_dm_conversation"))
        );
    }

    function rememberMessageId(messageId) {
        if (!messageId) return;
        state.seenMessageIds.add(messageId);
        if (state.seenMessageIds.size > 4000) {
            const iterator = state.seenMessageIds.values();
            for (let i = 0; i < 500; i++) {
                const next = iterator.next();
                if (next.done) break;
                state.seenMessageIds.delete(next.value);
            }
        }
    }

    async function fetchUsers(userIds) {
        const missing = Array.from(
            new Set((userIds || []).filter(Boolean)),
        ).filter((id) => !state.usersById.has(id));
        if (missing.length === 0) return;

        let { data, error } = await supabase
            .from("users")
            .select("id, name, avatar, account_subtype")
            .in("id", missing);

        if (error && isMissingAccountSubtypeColumnError(error)) {
            const retry = await supabase
                .from("users")
                .select("id, name, avatar")
                .in("id", missing);
            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;

        (data || []).forEach((user) => {
            state.usersById.set(user.id, user);
        });
    }

    async function fetchProfessionalPagesForOwners(ownerIds) {
        const missing = Array.from(
            new Set((ownerIds || []).filter(Boolean)),
        ).filter((id) => !state.companyPagesByOwnerId.has(id));
        if (!missing.length) return;

        const { data, error } = await supabase
            .from("professional_pages")
            .select(
                "id, owner_id, slug, name, avatar_url, banner_url, description, metadata",
            )
            .in("owner_id", missing);

        if (error) {
            console.warn(
                "Professional pages lookup for messages failed:",
                error,
            );
            return;
        }

        (data || []).forEach((page) => {
            if (page?.owner_id) {
                state.companyPagesByOwnerId.set(page.owner_id, page);
            }
        });
    }

    async function fetchUnreadCount(conversationId, lastReadAt) {
        if (!conversationId) return 0;
        const currentUserId = getCurrentUserId();
        if (!currentUserId) return 0;

        let query = supabase
            .from("dm_messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversationId)
            .neq("sender_id", currentUserId);

        if (lastReadAt) {
            query = query.gt("created_at", lastReadAt);
        }

        const { count, error } = await query;
        if (error) throw error;
        return count || 0;
    }

    function getConversationDisplayUser(conversation) {
        const fallback = {
            id: null,
            name: "Conversation",
            avatar: "https://placehold.co/80x80?text=%F0%9F%92%AC",
            type: "user",
            isPage: false,
        };
        if (!conversation) return fallback;
        const user =
            state.usersById.get(conversation.otherUserId || "") || null;
        const companyPage =
            conversation.otherUserId &&
            state.companyPagesByOwnerId.has(conversation.otherUserId)
                ? state.companyPagesByOwnerId.get(conversation.otherUserId)
                : null;
        const pageName =
            companyPage?.name || conversation.otherName || "Conversation";
        const companyAvatar = companyPage?.avatar_url
            ? companyPage.avatar_url
            : companyPage?.avatar ||
              conversation.otherAvatar ||
              "icons/enterprise.svg";
        return {
            id: conversation.otherUserId || user?.id || null,
            name: companyPage
                ? pageName
                : user?.name || conversation.otherName || "Conversation",
            avatar: companyPage
                ? companyAvatar
                : user?.avatar ||
                  conversation.otherAvatar ||
                  "https://placehold.co/80x80?text=%F0%9F%92%AC",
            accountSubtype:
                user?.account_subtype ||
                user?.accountSubtype ||
                conversation.otherAccountSubtype ||
                null,
            type: companyPage ? "company" : "user",
            isPage: !!companyPage,
            slug: companyPage?.slug || null,
            pageId: companyPage?.id || null,
            companyId: companyPage?.id || null,
            companySlug: companyPage?.slug || null,
        };
    }

    function getUnreadTotal() {
        return state.conversations.reduce(
            (sum, item) => sum + (item.unreadCount || 0),
            0,
        );
    }

    function renderThreadsList() {
        if (!ensureMessagesShell()) return;
        const list = document.getElementById("threads-list");
        if (!list) return;

        if (!state.conversations.length) {
            list.innerHTML = `
                <div class="threads-empty-state">
                    <i class="fa-regular fa-paper-plane"></i>
                    <p>Aucune conversation pour le moment.</p>
                </div>
            `;
            return;
        }

        const query = String(state.threadSearchQuery || "")
            .trim()
            .toLowerCase();
        const visibleConversations = state.conversations.filter(
            (conversation) => {
                if (
                    state.threadFilter === "unread" &&
                    !(Number(conversation.unreadCount) > 0)
                ) {
                    return false;
                }
                if (!query) return true;
                const profile = getConversationDisplayUser(conversation);
                const haystack = [
                    profile.name,
                    buildMessageSnippet(conversation.lastMessage, 200),
                ]
                    .join(" ")
                    .toLowerCase();
                return haystack.includes(query);
            },
        );

        if (!visibleConversations.length) {
            list.innerHTML = `
                <div class="threads-empty-state">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <p>${query ? "Aucun résultat." : "Aucun message non lu."}</p>
                </div>
            `;
            return;
        }

        list.innerHTML = visibleConversations
            .map((conversation) => {
                const profile = getConversationDisplayUser(conversation);
                const activeClass =
                    state.selectedConversationId === conversation.id
                        ? " active"
                        : "";
                const lastMessage = conversation.lastMessage || null;
                const snippet =
                    buildMessageSnippet(lastMessage, 56) ||
                    "Commencez la discussion";
                const timeLabel = formatThreadTime(
                    lastMessage?.created_at ||
                        conversation.lastMessageAt ||
                        conversation.updated_at ||
                        conversation.created_at,
                );
                const unread = Number(conversation.unreadCount) || 0;
                const profileNameHtml = renderNameWithBadges(profile);
                const profileNameNode = profile.id
                    ? `<span class="thread-user-link" data-message-user-link="1" data-user-id="${escapeHtml(profile.id)}" data-profile-kind="${escapeHtml(profile.type || "user")}" data-company-slug="${escapeHtml(profile.slug || "")}">${profileNameHtml}</span>`
                    : `<span class="thread-user-label">${profileNameHtml}</span>`;

                return `
                    <button type="button" class="thread-item${activeClass}${unread > 0 ? " has-unread" : ""}" data-conversation-id="${conversation.id}">
                        <img class="thread-avatar" src="${escapeHtml(profile.avatar)}" alt="${escapeHtml(profile.name)}" loading="lazy" />
                        <div class="thread-meta">
                            <div class="thread-name-row">
                                <span class="thread-name">${profileNameNode}</span>
                                <span class="thread-time">${conversation.muted ? '<i class="fa-solid fa-bell-slash thread-muted" title="Notifications coupées" aria-label="Notifications coupées"></i>' : ""}${escapeHtml(timeLabel)}</span>
                            </div>
                            <span class="thread-snippet">${escapeHtml(snippet)}</span>
                        </div>
                        ${
                            unread > 0
                                ? `<span class="thread-unread">${unread > 99 ? "99+" : unread}</span>`
                                : ""
                        }
                    </button>
                `;
            })
            .join("");
    }

    function renderChatHeaderActions() {
        const deleteBtn = document.getElementById("chat-delete-btn");
        const blockBtn = document.getElementById("chat-block-btn");
        const conversation = getSelectedConversation();
        const profile = conversation
            ? getConversationDisplayUser(conversation)
            : null;
        const relationship = getSelectedRelationshipState();

        if (deleteBtn) {
            deleteBtn.disabled = !conversation;
            deleteBtn.title = conversation
                ? "Masquer cette discussion de votre liste"
                : "Aucune discussion sélectionnée";
        }

        const blockLabel = blockBtn?.querySelector("span");
        if (blockBtn) {
            if (!conversation || !profile?.id) {
                blockBtn.disabled = true;
                if (blockLabel) blockLabel.textContent = "Bloquer";
            } else {
                blockBtn.disabled =
                    relationship.loading || relationship.blockedByMe;
                if (blockLabel) {
                    blockLabel.textContent = relationship.blockedByMe
                        ? "Bloqué"
                        : "Bloquer";
                }
                blockBtn.title = relationship.blockedByMe
                    ? "Débloquez cet utilisateur depuis Réglages"
                    : `Bloquer ${profile.name}`;
            }
        }

        const muteBtn = document.getElementById("chat-mute-btn");
        if (muteBtn) {
            muteBtn.disabled = !conversation;
            const muted = Boolean(conversation?.muted);
            const icon = muteBtn.querySelector("i");
            if (icon) icon.className = muted ? "fa-regular fa-bell" : "fa-regular fa-bell-slash";
            const label = muteBtn.querySelector("span");
            if (label) {
                label.textContent = muted
                    ? "Réactiver les notifications"
                    : "Couper les notifications";
            }
        }

        const reportBtn = document.getElementById("chat-report-btn");
        if (reportBtn) reportBtn.disabled = !conversation || !profile?.id;
    }

    function renderChatHeader() {
        if (!ensureMessagesShell()) return;
        const nameEl = document.getElementById("chat-header-name");
        const subEl = document.getElementById("chat-header-sub");
        const conversation = state.conversationsById.get(
            state.selectedConversationId,
        );

        if (!conversation) {
            if (nameEl) nameEl.textContent = "Sélectionnez une conversation";
            if (subEl) subEl.textContent = "";
            renderChatHeaderActions();
            syncComposerState();
            return;
        }

        const profile = getConversationDisplayUser(conversation);
        const relationship = getSelectedRelationshipState();
        if (nameEl) {
            if (profile.id) {
                nameEl.innerHTML = `
                    <a href="${escapeHtml(buildProfileHref(profile))}" class="chat-user-link" data-message-user-link="1" data-user-id="${escapeHtml(profile.id)}" data-profile-kind="${escapeHtml(profile.type || "user")}" data-company-slug="${escapeHtml(profile.slug || "")}">
                        ${renderNameWithBadges(profile)}
                    </a>
                `;
            } else {
                nameEl.textContent = profile.name;
            }
        }
        const chatHeaderAvatar = document.querySelector(".chat-header-avatar");
        if (chatHeaderAvatar && profile.avatar) {
            chatHeaderAvatar.src = profile.avatar;
            chatHeaderAvatar.alt = profile.name || "Avatar";
        }
        if (subEl) {
            subEl.hidden = true;
            subEl.textContent = "";
            subEl.classList.remove("is-typing");
            if (isRelationshipLocked(relationship)) {
                subEl.textContent = getDmBlockedMessage(relationship);
                subEl.hidden = false;
            } else if (isOtherTyping()) {
                subEl.textContent = "est en train d'écrire…";
                subEl.classList.add("is-typing");
                subEl.hidden = false;
            } else if (conversation.unreadCount) {
                subEl.textContent = `${conversation.unreadCount} nouveau(x) message(s)`;
                subEl.hidden = false;
            } else if (profile.isPage) {
                // Pas de statut de présence côté serveur : on n'affiche pas
                // de faux « En ligne ».
                subEl.textContent = "Page entreprise";
                subEl.hidden = false;
            }
        }
        renderChatHeaderActions();
        syncComposerState();

        // Floating back button: show when a conversation is open (keeps a high z-index and fixed position)
        try {
            toggleFloatingBackButton(
                Boolean(state.selectedConversationId && isMessagesPageActive()),
            );
        } catch (e) {}
    }

    function ensureFloatingBackButton() {
        let btn = document.getElementById("messages-floating-back-btn");
        if (!btn) {
            btn = document.createElement("button");
            btn.id = "messages-floating-back-btn";
            btn.className = "floating-back-btn";
            btn.setAttribute("aria-label", "Retour");
            btn.title = "Retour";
            btn.innerHTML = "←";
            btn.addEventListener("click", () => {
                const shell = document.getElementById("messages-shell");
                if (shell) shell.classList.remove("mobile-thread-open");
                state.selectedConversationId = null;
                renderChatMessages();
                updateUnreadUi();
                try {
                    toggleFloatingBackButton(false);
                } catch (e) {}
            });
            document.body.appendChild(btn);
            // position the button below the top navigation/menu if present
            try {
                positionFloatingBackButton(btn);
            } catch (e) {}
            // reposition on resize/orientation change
            try {
                window.addEventListener("resize", () =>
                    positionFloatingBackButton(btn),
                );
                window.addEventListener("orientationchange", () =>
                    positionFloatingBackButton(btn),
                );
            } catch (e) {}
        }
        return btn;
    }

    function positionFloatingBackButton(btn) {
        if (!btn) btn = document.getElementById("messages-floating-back-btn");
        if (!btn) return;
        try {
            const selectors = [
                "header",
                ".site-header",
                ".topbar",
                ".top-nav",
                ".main-header",
                "#header",
                ".navbar",
                ".app-header",
                ".global-header",
            ];
            let navEl = null;
            for (const s of selectors) {
                const el = document.querySelector(s);
                if (el) {
                    navEl = el;
                    break;
                }
            }
            let topPx;
            if (navEl) {
                const rect = navEl.getBoundingClientRect();
                topPx = Math.max(
                    rect.bottom + 8,
                    (parseInt(
                        getComputedStyle(
                            document.documentElement,
                        ).getPropertyValue("--safe-area-inset-top"),
                    ) || 0) + 8,
                );
            } else {
                // fallback to a sensible offset under the status bar
                topPx =
                    (window.innerWidth <= 960 ? 56 : 12) +
                    (window.visualViewport?.offsetTop || 0) +
                    8;
            }
            btn.style.top = `${Math.round(topPx)}px`;
            btn.style.left = `12px`;
            btn.style.bottom = `auto`;
        } catch (e) {
            btn.style.top = `calc(env(safe-area-inset-top, 12px) + 12px)`;
            btn.style.left = `12px`;
            btn.style.bottom = `auto`;
        }
    }

    function toggleFloatingBackButton(show) {
        const btn = ensureFloatingBackButton();
        if (!btn) return;
        if (show) {
            try {
                positionFloatingBackButton(btn);
            } catch (e) {}
            btn.classList.add("show");
        } else {
            btn.classList.remove("show");
        }
    }

    function getOlderState(conversationId) {
        if (!state.olderByConversation.has(conversationId)) {
            state.olderByConversation.set(conversationId, {
                hasMore: false,
                loading: false,
            });
        }
        return state.olderByConversation.get(conversationId);
    }

    function renderConversationIntro(older) {
        if (older?.loading) {
            return '<div class="chat-older-loader"><i class="fa-solid fa-spinner fa-spin"></i> Chargement des anciens messages…</div>';
        }
        if (older?.hasMore) return "";
        return `
            <div class="chat-privacy-banner">
                <i class="fa-solid fa-lock"></i>
                <span>Conversation privée : seuls les participants peuvent lire ces messages. Les photos et vidéos ne s'affichent que dans XERA1.</span>
            </div>
        `;
    }

    function renderChatMessages({ preserveScroll = null } = {}) {
        if (!ensureMessagesShell()) return;
        const chat = document.getElementById("chat-messages");
        const panel = document.getElementById("chat-panel");
        if (!chat || !panel) return;

        const conversationId = state.selectedConversationId;
        if (!conversationId) {
            panel.classList.add("empty");
            if (state.lastRenderedConversationId !== null) {
                chat.innerHTML = renderChatEmptyState();
            }
            state.lastRenderedConversationId = null;
            state.lastRenderedMessagesSignature = "";
            syncComposerState();
            return;
        }

        panel.classList.remove("empty");
        const messages = state.messagesByConversation.get(conversationId) || [];
        const conversation = state.conversationsById.get(conversationId) || null;
        const currentUserId = getCurrentUserId();
        const older = getOlderState(conversationId);
        const items = messages.map((message) => {
            const extras = {
                quote: message.deleted_at ? null : getReplyPreview(message),
                read:
                    message.sender_id === currentUserId &&
                    isMessageReadByOther(message, conversation),
            };
            return {
                message,
                extras,
                signature: getMessageRenderSignature(message, extras),
            };
        });
        const listSignature = [
            older.loading ? "loading" : "",
            older.hasMore ? "more" : "",
            ...items.map((item) => item.signature),
        ].join("::");

        if (!messages.length) {
            if (
                state.lastRenderedConversationId !== conversationId ||
                state.lastRenderedMessagesSignature !== listSignature
            ) {
                chat.innerHTML = `
                    ${renderConversationIntro({ hasMore: false })}
                    <div class="chat-empty-state">
                        <div class="chat-empty-icon"><i class="fa-regular fa-hand"></i></div>
                        <p>Aucun message pour l'instant. Dites bonjour !</p>
                    </div>
                `;
            }
            state.lastRenderedConversationId = conversationId;
            state.lastRenderedMessagesSignature = listSignature;
            syncComposerState();
            return;
        }

        if (
            state.lastRenderedConversationId === conversationId &&
            state.lastRenderedMessagesSignature === listSignature &&
            chat.querySelector(".message-bubble-wrap")
        ) {
            syncComposerState();
            return;
        }

        const previousRenderedConversationId = state.lastRenderedConversationId;
        const wasNearBottom =
            chat.scrollHeight - chat.scrollTop - chat.clientHeight < 96;
        const existingNodes = new Map();
        chat.querySelectorAll(".message-bubble-wrap[data-message-id]").forEach(
            (node) => {
                existingNodes.set(node.getAttribute("data-message-id"), node);
            },
        );

        const fragment = document.createDocumentFragment();
        const introHtml = renderConversationIntro(older).trim();
        if (introHtml) {
            const template = document.createElement("template");
            template.innerHTML = introHtml;
            fragment.appendChild(template.content.firstElementChild);
        }

        const GROUP_WINDOW_MS = 5 * 60 * 1000;
        let previousDayKey = "";
        let previousNode = null;
        let previousMessage = null;
        items.forEach(({ message, extras, signature }) => {
            const messageId = String(message.id || "");
            let node = existingNodes.get(messageId);

            const dayKey = getMessageDayKey(message.created_at);
            const newDay = Boolean(dayKey) && dayKey !== previousDayKey;
            if (newDay) {
                const separator = document.createElement("div");
                separator.className = "messages-date-separator";
                separator.innerHTML = `<span>${escapeHtml(formatMessageDayLabel(message.created_at))}</span>`;
                fragment.appendChild(separator);
                previousDayKey = dayKey;
            }

            if (!node || node.dataset.renderSignature !== signature) {
                node = createMessageNode(message, currentUserId, extras);
            }
            if (!node) return;

            // Bulles consécutives du même auteur, à moins de 5 min d'écart :
            // on les colle visuellement comme dans les messageries modernes.
            const continuesGroup =
                !newDay &&
                previousMessage &&
                previousMessage.sender_id === message.sender_id &&
                new Date(message.created_at || 0) -
                    new Date(previousMessage.created_at || 0) <
                    GROUP_WINDOW_MS;
            node.classList.toggle("group-continued", Boolean(continuesGroup));
            node.classList.remove("group-has-next");
            if (continuesGroup && previousNode) {
                previousNode.classList.add("group-has-next");
            }

            node.dataset.renderSignature = signature;
            fragment.appendChild(node);
            previousNode = node;
            previousMessage = message;
        });

        chat.replaceChildren(fragment);
        state.lastRenderedConversationId = conversationId;
        state.lastRenderedMessagesSignature = listSignature;

        if (preserveScroll) {
            // Anciens messages ajoutés en haut : on garde le même message à l'écran.
            chat.scrollTop = chat.scrollHeight - preserveScroll.fromBottom;
        } else if (
            wasNearBottom ||
            previousRenderedConversationId !== conversationId
        ) {
            chat.scrollTop = chat.scrollHeight;
            state.pinnedToBottom = true;
        }
        hydratePrivateMedia(chat);
        syncComposerState();
    }

    async function loadOlderMessages(conversationId) {
        if (!conversationId) return;
        const older = getOlderState(conversationId);
        if (older.loading || !older.hasMore) return;
        const messages = state.messagesByConversation.get(conversationId) || [];
        const oldest = messages.find((msg) => !msg.pending);
        if (!oldest?.created_at) return;

        const chat = document.getElementById("chat-messages");
        older.loading = true;
        if (state.selectedConversationId === conversationId && chat) {
            renderChatMessages({
                preserveScroll: { fromBottom: chat.scrollHeight - chat.scrollTop },
            });
        }

        try {
            const { data, error } = await runMessageSelect((selectColumns) =>
                supabase
                    .from("dm_messages")
                    .select(selectColumns)
                    .eq("conversation_id", conversationId)
                    .lt("created_at", oldest.created_at)
                    .order("created_at", { ascending: false })
                    .limit(DM_MESSAGES_LIMIT),
            );
            if (error) throw error;
            const rows = (data || []).slice().reverse();
            rows.forEach((row) => rememberMessageId(row.id));
            const current = state.messagesByConversation.get(conversationId) || [];
            const knownIds = new Set(current.map((msg) => msg.id));
            state.messagesByConversation.set(conversationId, [
                ...rows.filter((row) => !knownIds.has(row.id)),
                ...current,
            ]);
            older.hasMore = rows.length === DM_MESSAGES_LIMIT;
        } catch (error) {
            console.warn("Chargement des anciens messages impossible:", error);
        } finally {
            older.loading = false;
        }

        if (state.selectedConversationId === conversationId && chat) {
            renderChatMessages({
                preserveScroll: { fromBottom: chat.scrollHeight - chat.scrollTop },
            });
        }
    }

    function scrollToMessage(messageId) {
        const chat = document.getElementById("chat-messages");
        const node = chat?.querySelector(
            `.message-bubble-wrap[data-message-id="${String(messageId).replace(/["\\]/g, "")}"]`,
        );
        if (!node) {
            showToast(
                "info",
                "Message plus ancien",
                "Remontez dans la conversation pour le retrouver.",
            );
            return;
        }
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        node.classList.remove("is-highlighted");
        void node.offsetWidth;
        node.classList.add("is-highlighted");
        setTimeout(() => node.classList.remove("is-highlighted"), 1600);
    }

    function updateUnreadUi() {
        setNavBadgeCount(getUnreadTotal());
        renderThreadsList();
        renderChatHeader();
    }

    function sortAndReindexConversations() {
        state.conversations.sort((a, b) => {
            const aDate = new Date(
                a.lastMessageAt || a.updated_at || a.created_at || 0,
            ).getTime();
            const bDate = new Date(
                b.lastMessageAt || b.updated_at || b.created_at || 0,
            ).getTime();
            return bDate - aDate;
        });

        state.conversationsById = new Map();
        state.conversations.forEach((conv) => {
            state.conversationsById.set(conv.id, conv);
        });
    }

    // Boîte de réception normalisée : une ligne par conversation.
    async function fetchInboxRows(currentUserId) {
        if (state.inboxRpcAvailable) {
            const { data, error } = await supabase.rpc("get_dm_inbox");
            if (!error) {
                return (data || []).map((row) => ({
                    id: row.conversation_id,
                    pair_key: row.pair_key,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                    last_message_at: row.last_message_at,
                    otherUserId:
                        row.other_user_id ||
                        extractOtherUserIdFromPairKey(row.pair_key, currentUserId),
                    lastReadAt: row.my_last_read_at || null,
                    otherLastReadAt: row.other_last_read_at || null,
                    hiddenAt: row.hidden_at || null,
                    muted: row.muted === true,
                    unreadCount: Number(row.unread_count) || 0,
                    lastMessage: row.last_message
                        ? normalizeMessageRow(row.last_message)
                        : null,
                }));
            }
            if (!isMissingRpcError(error, "get_dm_inbox")) throw error;
            // Migration pas encore appliquée : ancien chemin (3 + N requêtes).
            state.inboxRpcAvailable = false;
        }
        return fetchInboxRowsLegacy(currentUserId);
    }

    async function fetchInboxRowsLegacy(currentUserId) {
        const { data: memberships, error: membershipsError } = await supabase
            .from("dm_participants")
            .select("conversation_id, last_read_at, hidden_at")
            .eq("user_id", currentUserId);
        if (membershipsError) throw membershipsError;
        if (!memberships?.length) return [];

        const conversationIds = memberships
            .map((row) => row.conversation_id)
            .filter(Boolean);
        const membershipById = new Map(
            memberships.map((row) => [row.conversation_id, row]),
        );

        const [conversationsResult, lastMessagesResult] = await Promise.all([
            supabase
                .from("dm_conversations")
                .select("id, created_at, updated_at, last_message_at, pair_key")
                .in("id", conversationIds),
            runMessageSelect((selectColumns) =>
                supabase
                    .from("dm_messages")
                    .select(selectColumns)
                    .in("conversation_id", conversationIds)
                    .order("created_at", { ascending: false })
                    .limit(Math.max(conversationIds.length * 8, 60)),
            ),
        ]);
        if (conversationsResult.error) throw conversationsResult.error;
        if (lastMessagesResult.error) throw lastMessagesResult.error;

        const lastMessageByConversation = new Map();
        (lastMessagesResult.data || []).forEach((row) => {
            if (row?.conversation_id && !lastMessageByConversation.has(row.conversation_id)) {
                lastMessageByConversation.set(row.conversation_id, row);
            }
        });

        const rows = [];
        for (const conv of conversationsResult.data || []) {
            const membership = membershipById.get(conv.id) || {};
            let unreadCount = 0;
            try {
                unreadCount = await fetchUnreadCount(conv.id, membership.last_read_at);
            } catch (error) {
                unreadCount = 0;
            }
            rows.push({
                id: conv.id,
                pair_key: conv.pair_key,
                created_at: conv.created_at,
                updated_at: conv.updated_at,
                last_message_at: conv.last_message_at,
                otherUserId: extractOtherUserIdFromPairKey(conv.pair_key, currentUserId),
                lastReadAt: membership.last_read_at || null,
                otherLastReadAt: null,
                hiddenAt: membership.hidden_at || null,
                muted: false,
                unreadCount,
                lastMessage: lastMessageByConversation.get(conv.id) || null,
            });
        }
        return rows;
    }

    async function refreshConversations({ preserveSelection = true } = {}) {
        if (!isLoggedIn()) return;
        if (!ensureMessagesShell()) return;

        const currentUserId = getCurrentUserId();
        const list = document.getElementById("threads-list");
        if (list && state.conversations.length === 0) {
            list.innerHTML = `<div class="loading-state">Chargement...</div>`;
        }

        try {
            const rows = await fetchInboxRows(currentUserId);
            const otherUserIds = rows.map((row) => row.otherUserId).filter(Boolean);
            await fetchUsers(otherUserIds);
            await fetchProfessionalPagesForOwners(otherUserIds);

            const conversations = [];
            for (const row of rows) {
                const userProfile = row.otherUserId
                    ? state.usersById.get(row.otherUserId)
                    : null;
                const lastMessage = row.lastMessage || null;
                if (lastMessage?.id) rememberMessageId(lastMessage.id);
                const lastActivityAt =
                    lastMessage?.created_at ||
                    row.last_message_at ||
                    row.updated_at ||
                    row.created_at;

                // Discussion masquée : elle revient seulement s'il y a du nouveau.
                if (row.hiddenAt && lastActivityAt) {
                    const hiddenTime = new Date(row.hiddenAt).getTime();
                    const lastActivityTime = new Date(lastActivityAt).getTime();
                    if (
                        Number.isFinite(hiddenTime) &&
                        Number.isFinite(lastActivityTime) &&
                        lastActivityTime <= hiddenTime
                    ) {
                        continue;
                    }
                }

                conversations.push({
                    id: row.id,
                    pair_key: row.pair_key,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                    last_message_at: row.last_message_at,
                    otherUserId: row.otherUserId || null,
                    otherName: userProfile?.name || "Conversation",
                    otherAccountSubtype:
                        userProfile?.account_subtype ||
                        userProfile?.accountSubtype ||
                        null,
                    otherAvatar:
                        userProfile?.avatar ||
                        "https://placehold.co/80x80?text=%F0%9F%92%AC",
                    lastReadAt: row.lastReadAt,
                    otherLastReadAt: row.otherLastReadAt,
                    hiddenAt: row.hiddenAt,
                    muted: row.muted,
                    lastMessage,
                    lastMessageAt: lastActivityAt,
                    unreadCount: row.unreadCount,
                });
            }

            state.conversations = conversations;
            sortAndReindexConversations();

            if (
                preserveSelection &&
                state.selectedConversationId &&
                state.conversationsById.has(state.selectedConversationId)
            ) {
                // keep current selection
            } else if (isMobileLayout()) {
                // Sur mobile, seule la liste est visible : on n'ouvre (et ne
                // marque comme lue) aucune discussion à la place de l'utilisateur.
                state.selectedConversationId = null;
            } else {
                state.selectedConversationId = state.conversations[0]?.id || null;
            }

            renderThreadsList();
            renderChatHeader();
            setNavBadgeCount(getUnreadTotal());
            void refreshActiveRelationshipState(state.selectedConversationId);
            syncTypingChannel();

            if (state.selectedConversationId) {
                await loadConversationMessages(state.selectedConversationId, {
                    markRead: false,
                    forceReload: false,
                });
            } else {
                renderChatMessages();
            }
        } catch (error) {
            console.error("Erreur chargement conversations:", error);
            if (isMissingSchemaError(error)) {
                showSchemaMissingState();
                return;
            }
            const listEl = document.getElementById("threads-list");
            if (listEl && !state.conversations.length) {
                listEl.innerHTML = `<div class="loading-state">Impossible de charger les conversations.</div>`;
            }
        }
    }

    async function loadConversationMessages(
        conversationId,
        { markRead = true, forceReload = false } = {},
    ) {
        if (!conversationId) {
            renderChatMessages();
            return;
        }

        if (!forceReload && state.messagesByConversation.has(conversationId)) {
            renderChatHeader();
            renderChatMessages();
            // Le cache a pu rater des messages (realtime coupé, onglet en
            // veille) : on récupère uniquement ce qui manque.
            if (hasActivityMissingFromCache(conversationId)) {
                try {
                    await syncNewMessages(conversationId);
                } catch (error) {
                    console.warn(
                        "Synchronisation des messages impossible:",
                        error,
                    );
                }
            }
            if (markRead) {
                await markConversationAsRead(conversationId);
            }
            return;
        }

        const chat = document.getElementById("chat-messages");
        if (chat) {
            chat.innerHTML = `<div class="loading-state">Chargement des messages...</div>`;
        }

        try {
            const { data, error } = await runMessageSelect((selectColumns) =>
                supabase
                    .from("dm_messages")
                    .select(selectColumns)
                    .eq("conversation_id", conversationId)
                    .order("created_at", { ascending: false })
                    .limit(DM_MESSAGES_LIMIT),
            );

            if (error) throw error;

            const rows = (data || []).slice().reverse();
            rows.forEach((row) => rememberMessageId(row.id));
            // Garde les bulles en cours d'envoi (file hors ligne).
            const pendingRows = (
                state.messagesByConversation.get(conversationId) || []
            ).filter((msg) => msg.pending);
            state.messagesByConversation.set(conversationId, [
                ...rows,
                ...pendingRows,
            ]);
            getOlderState(conversationId).hasMore =
                (data || []).length === DM_MESSAGES_LIMIT;

            renderChatHeader();
            renderChatMessages();

            if (markRead) {
                await markConversationAsRead(conversationId);
            }
        } catch (error) {
            console.error("Erreur chargement messages:", error);
            if (isMissingSchemaError(error)) {
                showSchemaMissingState();
                return;
            }
            if (chat) {
                chat.innerHTML = `<div class="loading-state">Impossible de charger les messages.</div>`;
            }
        }
    }

    function getLastConfirmedMessage(messages) {
        for (let i = (messages || []).length - 1; i >= 0; i--) {
            if (!messages[i]?.pending) return messages[i];
        }
        return null;
    }

    function hasActivityMissingFromCache(conversationId) {
        const conversation = state.conversationsById.get(conversationId);
        if (!conversation) return false;
        const cached = state.messagesByConversation.get(conversationId) || [];
        const lastMessageId = conversation.lastMessage?.id;
        if (lastMessageId) {
            return !cached.some((msg) => msg.id === lastMessageId);
        }
        // Dernier message hors du lot chargé par refreshConversations :
        // on se fie à la date d'activité stockée en base.
        if (!conversation.last_message_at) return false;
        const lastCached = getLastConfirmedMessage(cached);
        return (
            new Date(conversation.last_message_at).getTime() >
            new Date(lastCached?.created_at || 0).getTime()
        );
    }

    async function syncNewMessages(conversationId) {
        const cached = state.messagesByConversation.get(conversationId) || [];
        const lastConfirmed = getLastConfirmedMessage(cached);

        const { data, error } = await runMessageSelect((selectColumns) => {
            const query = supabase
                .from("dm_messages")
                .select(selectColumns)
                .eq("conversation_id", conversationId);
            if (lastConfirmed?.created_at) {
                return query
                    .gte("created_at", lastConfirmed.created_at)
                    .order("created_at", { ascending: true })
                    .limit(DM_MESSAGES_LIMIT);
            }
            return query
                .order("created_at", { ascending: false })
                .limit(DM_MESSAGES_LIMIT);
        });
        if (error) throw error;

        const rows = lastConfirmed ? data || [] : (data || []).slice().reverse();
        // Relire le cache : il a pu changer pendant la requête.
        const current = state.messagesByConversation.get(conversationId) || [];
        const knownIds = new Set(current.map((msg) => msg.id));
        const fresh = rows.filter((row) => row?.id && !knownIds.has(row.id));
        if (!fresh.length) return 0;

        fresh.forEach((row) => rememberMessageId(row.id));
        const confirmed = [
            ...current.filter((msg) => !msg.pending),
            ...fresh,
        ].sort(
            (a, b) =>
                new Date(a.created_at || 0).getTime() -
                new Date(b.created_at || 0).getTime(),
        );
        const pending = current.filter((msg) => msg.pending);
        state.messagesByConversation.set(conversationId, [
            ...confirmed,
            ...pending,
        ]);

        if (state.selectedConversationId === conversationId) {
            renderChatMessages();
        }
        return fresh.length;
    }

    async function markConversationAsRead(conversationId) {
        const currentUserId = getCurrentUserId();
        if (!currentUserId || !conversationId) return;

        const conversation = state.conversationsById.get(conversationId);
        if (!conversation) return;

        // Rien de nouveau depuis la dernière lecture : pas d'écriture (ni
        // d'événement realtime inutile chez l'autre participant).
        const lastIncoming = conversation.lastMessage;
        const hasUnseenIncoming =
            lastIncoming &&
            lastIncoming.sender_id !== currentUserId &&
            (!conversation.lastReadAt ||
                new Date(lastIncoming.created_at).getTime() >
                    new Date(conversation.lastReadAt).getTime());
        if (!conversation.unreadCount && !hasUnseenIncoming) return;

        conversation.lastReadAt = new Date().toISOString();
        conversation.unreadCount = 0;
        updateUnreadUi();

        try {
            const { data, error } = await supabase.rpc(
                "mark_dm_conversation_read",
                { p_conversation_id: conversationId },
            );
            if (!error) {
                if (data) conversation.lastReadAt = data;
                return;
            }
            if (!isMissingRpcError(error, "mark_dm_conversation_read")) {
                throw error;
            }
            // Avant la migration : écriture directe (horloge du client).
            const { error: updateError } = await supabase
                .from("dm_participants")
                .update({ last_read_at: conversation.lastReadAt })
                .eq("conversation_id", conversationId)
                .eq("user_id", currentUserId);
            if (updateError) throw updateError;
        } catch (error) {
            console.warn("Impossible de marquer comme lu:", error);
        }
    }

    function setMobileThreadOpen(open) {
        const shell = document.getElementById("messages-shell");
        if (!shell) return;
        shell.classList.toggle("mobile-thread-open", !!open);
        document.body.classList.toggle("messages-thread-open", !!open);
    }

    async function selectConversation(
        conversationId,
        { markRead = true, focusInput = false, forceReload = false } = {},
    ) {
        if (!conversationId) return;
        if (state.selectedConversationId !== conversationId) {
            // Réponse / modification en cours : propres à une discussion.
            clearComposeContext();
            closeMessageMenu();
            state.typing.otherTypingUntil = 0;
        }
        state.selectedConversationId = conversationId;
        state.pinnedToBottom = true;
        renderThreadsList();
        renderChatHeader();
        setMobileThreadOpen(true);
        void refreshActiveRelationshipState(conversationId);
        syncTypingChannel();

        await loadConversationMessages(conversationId, {
            markRead,
            forceReload,
        });

        if (focusInput) {
            const input = document.getElementById("chat-input");
            if (input) input.focus();
        }
    }

    async function getOrCreateConversation(otherUserId) {
        const currentUserId = getCurrentUserId();
        if (!currentUserId) throw new Error("Session utilisateur absente.");
        if (!otherUserId || otherUserId === currentUserId) {
            throw new Error("Conversation invalide.");
        }

        const { data, error } = await supabase.rpc(
            "get_or_create_dm_conversation",
            {
                p_other_user_id: otherUserId,
            },
        );
        if (error) throw error;
        if (!data) throw new Error("Impossible de créer la conversation.");
        return data;
    }

    async function removeConversationLocally(conversationId) {
        if (!conversationId) return;
        const wasSelected = state.selectedConversationId === conversationId;

        state.messagesByConversation.delete(conversationId);
        state.conversations = state.conversations.filter(
            (item) => item.id !== conversationId,
        );
        sortAndReindexConversations();

        if (wasSelected) {
            state.selectedConversationId = isMobileLayout()
                ? null
                : state.conversations[0]?.id || null;
            state.activeRelationship = null;
            clearComposeContext();
        }

        updateUnreadUi();

        if (state.selectedConversationId) {
            await selectConversation(state.selectedConversationId, {
                markRead: false,
                focusInput: false,
                forceReload: false,
            });
        } else {
            setMobileThreadOpen(false);
            renderChatHeader();
            renderChatMessages();
        }
    }

    // ---------- Réponse / modification (barre au-dessus du champ) ----------

    function renderComposeContext() {
        const container = document.getElementById("chat-compose-context");
        if (!container) return;

        let mode = null;
        let title = "";
        let text = "";
        if (state.editing) {
            const original = findCachedMessage(
                state.editing.conversationId,
                state.editing.id,
            );
            mode = "edit";
            title = "Modifier le message";
            text = buildMessageSnippet(original, 120) || "";
        } else if (state.replyTo) {
            const original = findCachedMessage(
                state.replyTo.conversationId,
                state.replyTo.id,
            );
            if (!original || original.deleted_at) {
                state.replyTo = null;
            } else {
                const conversation = state.conversationsById.get(
                    state.replyTo.conversationId,
                );
                mode = "reply";
                title =
                    original.sender_id === getCurrentUserId()
                        ? "Réponse à vous-même"
                        : `Réponse à ${getConversationDisplayUser(conversation).name || "ce message"}`;
                text = buildMessageSnippet(original, 120) || "";
            }
        }

        if (!mode) {
            container.hidden = true;
            container.innerHTML = "";
            syncComposerState();
            return;
        }

        container.hidden = false;
        container.innerHTML = `
            <div class="chat-compose-context-card is-${mode}">
                <i class="fa-solid ${mode === "edit" ? "fa-pen" : "fa-reply"}" aria-hidden="true"></i>
                <div class="chat-compose-context-meta">
                    <div class="chat-compose-context-title">${escapeHtml(title)}</div>
                    <div class="chat-compose-context-text">${escapeHtml(text)}</div>
                </div>
                <button type="button" class="chat-compose-context-cancel" aria-label="Annuler"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;
        container
            .querySelector(".chat-compose-context-cancel")
            ?.addEventListener("click", () => {
                clearComposeContext({ restoreDraft: true });
                getChatInput()?.focus();
            });
        syncComposerState();
    }

    function clearComposeContext({ restoreDraft = false } = {}) {
        const editing = state.editing;
        state.replyTo = null;
        state.editing = null;
        if (editing && restoreDraft) {
            const input = getChatInput();
            if (input) {
                input.value = editing.draft || "";
                autoResizeChatInput();
            }
        }
        renderComposeContext();
    }

    function setReplyTarget(message) {
        if (!message?.id) return;
        if (state.editing) clearComposeContext({ restoreDraft: true });
        state.replyTo = {
            id: message.id,
            conversationId: message.conversation_id,
        };
        renderComposeContext();
        getChatInput()?.focus();
    }

    function canEditMessage(message) {
        if (!message || message.pending || message.deleted_at) return false;
        if (message.sender_id !== getCurrentUserId()) return false;
        const age = Date.now() - new Date(message.created_at || 0).getTime();
        // Petite marge pour ne pas proposer une modification que le serveur
        // refuserait quelques secondes plus tard.
        return age < DM_EDIT_WINDOW_MS - 10 * 1000;
    }

    function startEditing(message) {
        const input = getChatInput();
        if (!input || !canEditMessage(message)) return;
        clearPendingAttachment();
        const draft = state.editing ? state.editing.draft : input.value;
        state.replyTo = null;
        state.editing = {
            id: message.id,
            conversationId: message.conversation_id,
            draft,
        };
        input.value = message.body || "";
        autoResizeChatInput();
        renderComposeContext();
        input.focus();
        const end = input.value.length;
        try {
            input.setSelectionRange(end, end);
        } catch (error) {
            // certains navigateurs refusent sur un champ masqué
        }
    }

    // ---------- Menu d'actions d'un message ----------

    function closeMessageMenu() {
        const current = state.messageMenu;
        if (!current) return;
        state.messageMenu = null;
        current.element?.remove();
        current.backdrop?.remove();
        current.wrap?.classList.remove("is-menu-open");
        document.removeEventListener("pointerdown", handleMessageMenuOutside, true);
        document.removeEventListener("keydown", handleMessageMenuKeydown);
    }

    function handleMessageMenuOutside(event) {
        const menu = state.messageMenu?.element;
        if (menu && !menu.contains(event.target)) closeMessageMenu();
    }

    function handleMessageMenuKeydown(event) {
        if (event.key === "Escape") closeMessageMenu();
    }

    function openMessageMenu(wrap, event) {
        closeMessageMenu();
        const conversationId = state.selectedConversationId;
        const message = findCachedMessage(
            conversationId,
            wrap?.getAttribute("data-message-id"),
        );
        if (!message || message.pending || message.deleted_at) return;

        const mine = message.sender_id === getCurrentUserId();
        const locked = isRelationshipLocked(getSelectedRelationshipState());
        const items = [];
        if (!locked) {
            items.push({ action: "reply", icon: "fa-solid fa-reply", label: "Répondre" });
        }
        if (String(message.body || "").trim()) {
            items.push({ action: "copy", icon: "fa-regular fa-copy", label: "Copier le texte" });
        }
        if (mine && !locked && canEditMessage(message)) {
            items.push({ action: "edit", icon: "fa-solid fa-pen", label: "Modifier" });
        }
        if (mine) {
            items.push({
                action: "delete",
                icon: "fa-regular fa-trash-can",
                label: "Supprimer pour tous",
                danger: true,
            });
        } else {
            items.push({
                action: "report",
                icon: "fa-regular fa-flag",
                label: "Signaler",
                danger: true,
            });
        }

        const menu = document.createElement("div");
        menu.className = "dm-message-menu";
        menu.setAttribute("role", "menu");
        menu.innerHTML = items
            .map(
                (item) => `
                <button type="button" class="dm-message-menu-item${item.danger ? " danger" : ""}" role="menuitem" data-menu-action="${item.action}">
                    <i class="${item.icon}" aria-hidden="true"></i><span>${escapeHtml(item.label)}</span>
                </button>`,
            )
            .join("");

        let backdrop = null;
        if (isMobileLayout()) {
            backdrop = document.createElement("div");
            backdrop.className = "dm-message-menu-backdrop";
            document.body.appendChild(backdrop);
            menu.classList.add("is-sheet");
        }
        document.body.appendChild(menu);

        if (!menu.classList.contains("is-sheet")) {
            const anchorRect = (
                wrap.querySelector(".message-action-btn") || wrap
            ).getBoundingClientRect();
            const anchor =
                event && event.type === "contextmenu"
                    ? { left: event.clientX, top: event.clientY }
                    : { left: anchorRect.left, top: anchorRect.bottom + 4 };
            const menuRect = menu.getBoundingClientRect();
            const left = Math.max(
                8,
                Math.min(anchor.left, window.innerWidth - menuRect.width - 8),
            );
            let top = anchor.top;
            if (top + menuRect.height > window.innerHeight - 8) {
                top = Math.max(8, anchor.top - menuRect.height - 8);
            }
            menu.style.left = `${Math.round(left)}px`;
            menu.style.top = `${Math.round(top)}px`;
        }

        menu.addEventListener("click", (clickEvent) => {
            const button = clickEvent.target.closest("[data-menu-action]");
            if (!button) return;
            closeMessageMenu();
            void handleMessageAction(button.getAttribute("data-menu-action"), message);
        });

        wrap.classList.add("is-menu-open");
        state.messageMenu = { element: menu, backdrop, wrap };
        setTimeout(() => {
            if (state.messageMenu?.element === menu) {
                document.addEventListener("pointerdown", handleMessageMenuOutside, true);
            }
        }, 0);
        document.addEventListener("keydown", handleMessageMenuKeydown);
        menu.querySelector("button")?.focus({ preventScroll: true });
    }

    async function handleMessageAction(action, message) {
        if (action === "reply") {
            setReplyTarget(message);
        } else if (action === "copy") {
            try {
                await navigator.clipboard.writeText(String(message.body || ""));
                showToast("success", "Copié", "Le texte est dans le presse-papiers.");
            } catch (error) {
                showToast("error", "Copie impossible", "Votre navigateur a refusé la copie.");
            }
        } else if (action === "edit") {
            startEditing(message);
        } else if (action === "delete") {
            await deleteMessageForEveryone(message);
        } else if (action === "report") {
            openReportDialog({
                conversationId: message.conversation_id,
                messageId: message.id,
            });
        }
    }

    function bindChatGestures(chat) {
        // Appui long (mobile) : ouvre le menu d'actions du message.
        let timer = null;
        let startX = 0;
        let startY = 0;
        const cancel = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };
        chat.addEventListener(
            "touchstart",
            (event) => {
                const wrap = event.target.closest(".message-bubble-wrap");
                if (!wrap || event.touches.length !== 1) return;
                if (event.target.closest("video, a, .chat-media-video-load")) return;
                startX = event.touches[0].clientX;
                startY = event.touches[0].clientY;
                cancel();
                timer = setTimeout(() => {
                    timer = null;
                    state.suppressNextClick = true;
                    try {
                        navigator.vibrate?.(12);
                    } catch (error) {
                        // vibration non disponible
                    }
                    openMessageMenu(wrap, null);
                }, 450);
            },
            { passive: true },
        );
        chat.addEventListener(
            "touchmove",
            (event) => {
                if (!timer) return;
                const touch = event.touches[0];
                if (
                    Math.abs(touch.clientX - startX) > 10 ||
                    Math.abs(touch.clientY - startY) > 10
                ) {
                    cancel();
                }
            },
            { passive: true },
        );
        chat.addEventListener("touchend", cancel);
        chat.addEventListener("touchcancel", cancel);

        // Clavier : Entrée / Espace sur une photo ouvre la visionneuse.
        chat.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            const mediaWrap = event.target.closest(".chat-media-wrap[role='button']");
            if (!mediaWrap) return;
            event.preventDefault();
            const img = mediaWrap.querySelector("img");
            if (img?.src) openMediaViewer(img.src, img.alt);
        });
    }

    function handleChatClick(event) {
        if (state.suppressNextClick) {
            state.suppressNextClick = false;
            return;
        }
        const actionsButton = event.target.closest("[data-message-actions]");
        if (actionsButton) {
            const wrap = actionsButton.closest(".message-bubble-wrap");
            if (wrap) openMessageMenu(wrap, null);
            return;
        }
        const quote = event.target.closest("[data-scroll-to-message]");
        if (quote) {
            scrollToMessage(quote.getAttribute("data-scroll-to-message"));
            return;
        }
        const retry = event.target.closest("[data-media-retry]");
        if (retry) {
            const wrap = retry.closest(".chat-media-private");
            if (wrap) {
                wrap.classList.remove("is-error");
                wrap.classList.add("is-loading");
                wrap.innerHTML =
                    '<div class="chat-media-skeleton"><i class="fa-regular fa-image"></i></div>';
                hydratePrivateMedia(wrap.parentElement);
            }
            return;
        }
        const loadButton = event.target.closest("[data-media-load]");
        if (loadButton) {
            loadVideoInto(loadButton.closest(".chat-media-private"));
            return;
        }
        const imageWrap = event.target.closest(
            '.chat-media-private[data-media-kind="image"], .chat-media-legacy',
        );
        if (imageWrap) {
            const img = imageWrap.querySelector("img");
            if (img?.src) openMediaViewer(img.src, img.alt);
        }
    }

    // ---------- Suppression pour tous ----------

    function removeLegacyMedia(url) {
        const prefix = `${getSupabaseBaseUrl()}/storage/v1/object/public/media/`;
        if (!url || !url.startsWith(prefix)) return;
        const path = decodeURIComponent(url.slice(prefix.length).split("?")[0]);
        supabase.storage
            .from("media")
            .remove([path])
            .catch(() => {});
    }

    async function deleteMessageForEveryone(message) {
        const confirmed = window.confirm(
            "Supprimer ce message pour tout le monde ? Il sera remplacé par « Message supprimé » dans la discussion.",
        );
        if (!confirmed) return;

        try {
            const { data, error } = await supabase.rpc("delete_dm_message", {
                p_message_id: message.id,
            });
            if (error) throw error;
            const result = (Array.isArray(data) ? data[0] : data) || {};
            // Le serveur a déjà coupé l'accès ; on efface aussi le fichier.
            if (result.media_path) removeDmMediaObject(result.media_path);
            if (result.media_url) removeLegacyMedia(result.media_url);
            mergeMessageUpdate({
                ...message,
                body: null,
                media_url: null,
                media_path: null,
                media_type: null,
                media_name: null,
                media_size_bytes: null,
                deleted_at: new Date().toISOString(),
            });
            if (state.replyTo?.id === message.id) clearComposeContext();
        } catch (error) {
            console.error("Delete DM error:", error);
            showToast(
                "error",
                "Suppression impossible",
                isMissingRpcError(error, "delete_dm_message")
                    ? "Fonction indisponible : la migration SQL n'est pas appliquée."
                    : getFriendlyDmErrorMessage(error, "Impossible de supprimer ce message."),
            );
        }
    }

    // ---------- Signalement ----------

    function closeDmDialog() {
        document.getElementById("dm-dialog")?.remove();
    }

    function openReportDialog({ conversationId, messageId = null }) {
        if (!conversationId) return;
        closeDmDialog();
        closeMessageMenu();
        const conversation = state.conversationsById.get(conversationId);
        const profile = getConversationDisplayUser(conversation);
        const overlay = document.createElement("div");
        overlay.id = "dm-dialog";
        overlay.className = "dm-dialog-overlay";
        overlay.innerHTML = `
            <form class="dm-dialog" role="dialog" aria-modal="true" aria-labelledby="dm-dialog-title">
                <h4 id="dm-dialog-title">${messageId ? "Signaler ce message" : `Signaler ${escapeHtml(profile.name || "cet utilisateur")}`}</h4>
                <p class="dm-dialog-text">${escapeHtml(profile.name || "Cette personne")} ne saura pas que vous l'avez signalé${messageId ? ". Une copie du message est transmise à la modération." : "."}</p>
                <fieldset class="dm-dialog-options">
                    <legend>Motif</legend>
                    ${DM_REPORT_REASONS.map(
                        (reason, index) => `
                        <label class="dm-dialog-option">
                            <input type="radio" name="dm-report-reason" value="${reason.value}" ${index === 0 ? "checked" : ""} />
                            <span>${escapeHtml(reason.label)}</span>
                        </label>`,
                    ).join("")}
                </fieldset>
                <textarea class="dm-dialog-details" name="dm-report-details" maxlength="1000" rows="3" placeholder="Détails (facultatif)"></textarea>
                <label class="dm-dialog-option dm-dialog-block">
                    <input type="checkbox" name="dm-report-block" />
                    <span>Bloquer aussi ${escapeHtml(profile.name || "cet utilisateur")}</span>
                </label>
                <div class="dm-dialog-actions">
                    <button type="button" class="dm-dialog-btn" data-dialog-cancel>Annuler</button>
                    <button type="submit" class="dm-dialog-btn danger">Signaler</button>
                </div>
            </form>
        `;
        document.body.appendChild(overlay);

        const form = overlay.querySelector("form");
        overlay.addEventListener("click", (event) => {
            if (event.target === overlay || event.target.closest("[data-dialog-cancel]")) {
                closeDmDialog();
            }
        });
        overlay.addEventListener("keydown", (event) => {
            if (event.key === "Escape") closeDmDialog();
        });
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const submit = form.querySelector('button[type="submit"]');
            const reason =
                form.querySelector('input[name="dm-report-reason"]:checked')?.value ||
                "other";
            const details = form.querySelector(".dm-dialog-details")?.value || "";
            const alsoBlock = form.querySelector('input[name="dm-report-block"]')?.checked;
            if (submit) submit.disabled = true;
            try {
                const { error } = await supabase.rpc("report_dm", {
                    p_conversation_id: conversationId,
                    p_message_id: messageId,
                    p_reason: reason,
                    p_details: details,
                });
                if (error) throw error;
                closeDmDialog();
                showToast(
                    "success",
                    "Signalement envoyé",
                    "Merci, notre équipe va l'examiner.",
                );
                if (alsoBlock && conversation) {
                    await blockConversationUser(conversation);
                }
            } catch (error) {
                console.error("Report DM error:", error);
                if (submit) submit.disabled = false;
                showToast(
                    "error",
                    "Signalement impossible",
                    isMissingRpcError(error, "report_dm")
                        ? "Fonction indisponible : la migration SQL n'est pas appliquée."
                        : getFriendlyDmErrorMessage(error, "Réessayez dans un instant."),
                );
            }
        });
        form.querySelector('input[name="dm-report-reason"]')?.focus();
    }

    // ---------- Sourdine ----------

    async function handleToggleMuteAction() {
        const conversation = getSelectedConversation();
        if (!conversation) return;
        const nextMuted = !conversation.muted;
        try {
            const { error } = await supabase.rpc("set_dm_conversation_muted", {
                p_conversation_id: conversation.id,
                p_muted: nextMuted,
            });
            if (error) throw error;
            conversation.muted = nextMuted;
            renderThreadsList();
            renderChatHeaderActions();
            showToast(
                "success",
                nextMuted ? "Notifications coupées" : "Notifications réactivées",
                nextMuted
                    ? "Vous ne serez plus notifié pour cette discussion."
                    : "Vous serez à nouveau notifié des nouveaux messages.",
            );
        } catch (error) {
            console.error("Mute DM error:", error);
            showToast(
                "error",
                "Action impossible",
                isMissingRpcError(error, "set_dm_conversation_muted")
                    ? "Fonction indisponible : la migration SQL n'est pas appliquée."
                    : getFriendlyDmErrorMessage(error, "Réessayez dans un instant."),
            );
        }
    }

    // ---------- « En train d'écrire… » (Realtime privé) ----------

    function leaveTypingChannel() {
        const typing = state.typing;
        if (typing.channel) {
            const channel = typing.channel;
            typing.channel = null;
            try {
                supabase.removeChannel(channel);
            } catch (error) {
                // canal déjà fermé
            }
        }
        typing.conversationId = null;
        typing.otherTypingUntil = 0;
        if (typing.hideTimer) {
            clearTimeout(typing.hideTimer);
            typing.hideTimer = null;
        }
    }

    function syncTypingChannel() {
        const conversationId = state.selectedConversationId;
        if (
            !conversationId ||
            !isLoggedIn() ||
            typeof supabase?.channel !== "function"
        ) {
            leaveTypingChannel();
            return;
        }
        if (state.typing.channel && state.typing.conversationId === conversationId) {
            return;
        }
        leaveTypingChannel();
        try {
            const channel = supabase.channel(`dm:${conversationId}`, {
                config: { private: true, broadcast: { self: false } },
            });
            channel.on("broadcast", { event: "typing" }, (message) => {
                if (state.typing.channel !== channel) return;
                const userId = message?.payload?.userId;
                if (!userId || userId === getCurrentUserId()) return;
                showTypingIndicator();
            });
            channel.subscribe();
            state.typing.channel = channel;
            state.typing.conversationId = conversationId;
            state.typing.lastSentAt = 0;
        } catch (error) {
            // Indicateur optionnel : la messagerie fonctionne sans.
            console.warn("Typing channel unavailable:", error);
        }
    }

    function notifyTyping() {
        const typing = state.typing;
        if (!typing.channel || typing.conversationId !== state.selectedConversationId) {
            return;
        }
        if (isRelationshipLocked(getSelectedRelationshipState())) return;
        const now = Date.now();
        if (now - typing.lastSentAt < DM_TYPING_THROTTLE_MS) return;
        typing.lastSentAt = now;
        try {
            Promise.resolve(
                typing.channel.send({
                    type: "broadcast",
                    event: "typing",
                    payload: { userId: getCurrentUserId() },
                }),
            ).catch(() => {});
        } catch (error) {
            // envoi best-effort
        }
    }

    function showTypingIndicator() {
        const typing = state.typing;
        typing.otherTypingUntil = Date.now() + DM_TYPING_DISPLAY_MS;
        renderChatHeader();
        if (typing.hideTimer) clearTimeout(typing.hideTimer);
        typing.hideTimer = setTimeout(() => {
            typing.hideTimer = null;
            renderChatHeader();
        }, DM_TYPING_DISPLAY_MS + 50);
    }

    function isOtherTyping() {
        return (
            state.typing.conversationId === state.selectedConversationId &&
            Date.now() < state.typing.otherTypingUntil
        );
    }

    async function handleDeleteConversationAction() {
        const conversation = getSelectedConversation();
        if (!conversation) return;

        const profile = getConversationDisplayUser(conversation);
        const confirmed = window.confirm(
            `Masquer la discussion avec ${profile.name || "cet utilisateur"} ? Elle reviendra dans votre liste seulement s'il y a un nouveau message.`,
        );
        if (!confirmed) return;

        try {
            if (typeof window.hideDmConversation === "function") {
                await window.hideDmConversation(conversation.id);
            } else {
                const { error } = await supabase.rpc("hide_dm_conversation", {
                    p_conversation_id: conversation.id,
                });
                if (error) throw error;
            }

            await removeConversationLocally(conversation.id);
            if (window.ToastManager?.success) {
                ToastManager.success(
                    "Discussion masquée",
                    "Elle réapparaîtra si vous recevez un nouveau message.",
                );
            }
        } catch (error) {
            console.error("Hide conversation error:", error);
            if (window.ToastManager?.error) {
                ToastManager.error(
                    "Suppression impossible",
                    getFriendlyDmErrorMessage(
                        error,
                        "Impossible de supprimer cette discussion.",
                    ),
                );
            }
        }
    }

    async function blockConversationUser(conversation) {
        if (!conversation?.otherUserId) return false;
        try {
            if (typeof window.blockDmUser === "function") {
                await window.blockDmUser(conversation.otherUserId);
            } else {
                const { error } = await supabase.rpc("block_dm_user", {
                    p_other_user_id: conversation.otherUserId,
                });
                if (error) throw error;
            }

            await removeConversationLocally(conversation.id);
            showToast(
                "success",
                "Utilisateur bloqué",
                "Il a été ajouté à votre liste de blocage.",
            );
            return true;
        } catch (error) {
            console.error("Block user error:", error);
            showToast(
                "error",
                "Blocage impossible",
                getFriendlyDmErrorMessage(
                    error,
                    "Impossible de bloquer cet utilisateur.",
                ),
            );
            return false;
        }
    }

    async function handleBlockUserAction() {
        const conversation = getSelectedConversation();
        if (!conversation?.otherUserId) return;

        const relationship = await refreshActiveRelationshipState(
            conversation.id,
        );
        if (relationship.blockedByMe) {
            showToast(
                "info",
                "Utilisateur déjà bloqué",
                "Débloquez-le depuis Réglages si vous souhaitez reprendre la discussion.",
            );
            return;
        }

        const profile = getConversationDisplayUser(conversation);
        const confirmed = window.confirm(
            `Bloquer ${profile.name || "cet utilisateur"} ? Vous ne pourrez plus échanger de messages tant qu'il restera bloqué.`,
        );
        if (!confirmed) return;
        await blockConversationUser(conversation);
    }

    // ---------- Envoi ----------

    function showToast(kind, title, message) {
        const manager = window.ToastManager;
        if (manager && typeof manager[kind] === "function") {
            manager[kind](title, message);
        } else if (kind === "error") {
            alert(message || title);
        }
    }

    function scrollChatToBottom() {
        const chat = document.getElementById("chat-messages");
        if (chat) chat.scrollTop = chat.scrollHeight;
    }

    function createTempId() {
        return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function createRandomFileId() {
        try {
            if (window.crypto?.randomUUID) return window.crypto.randomUUID();
        } catch (error) {
            // repli ci-dessous
        }
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    }

    function getFileExtensionForType(type, fallbackName) {
        const map = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/gif": "gif",
            "image/webp": "webp",
            "image/heic": "heic",
            "image/heif": "heif",
            "video/mp4": "mp4",
            "video/quicktime": "mov",
            "video/webm": "webm",
        };
        if (map[type]) return map[type];
        const fromName = String(fallbackName || "")
            .split(".")
            .pop()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
        return fromName.slice(0, 8) || "bin";
    }

    // Ré-encode la photo : supprime les métadonnées EXIF (dont la position
    // GPS) et limite la taille. Les GIF animés sont gardés tels quels.
    async function prepareImageForUpload(file) {
        const type = String(file.type || "").toLowerCase();
        if (type === "image/gif") return file;
        if (typeof createImageBitmap !== "function") {
            if (type === "image/heic" || type === "image/heif") {
                throw new Error("HEIC_UNSUPPORTED");
            }
            return file;
        }

        let bitmap;
        try {
            bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        } catch (error) {
            if (type === "image/heic" || type === "image/heif") {
                throw new Error("HEIC_UNSUPPORTED");
            }
            return file;
        }

        const scale = Math.min(
            1,
            DM_IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
        );
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
        bitmap.close?.();

        const outputType = type === "image/png" ? "image/png" : "image/jpeg";
        const blob = await new Promise((resolve) => {
            canvas.toBlob(resolve, outputType, 0.86);
        });
        if (!blob) return file;
        const baseName = String(file.name || "photo").replace(/\.[^.]+$/, "");
        return new File(
            [blob],
            `${baseName}.${outputType === "image/png" ? "png" : "jpg"}`,
            { type: outputType },
        );
    }

    function describeStorageError(status, responseText) {
        if (status === 413) return "Fichier trop volumineux (50 Mo maximum).";
        if (status === 415) return "Format de fichier non pris en charge.";
        if (status === 401) return "Votre session a expiré. Reconnectez-vous.";
        if (status === 403 || /row-level security/i.test(responseText || "")) {
            return "Envoi de média refusé pour cette conversation.";
        }
        if (/mime type/i.test(responseText || "")) {
            return "Format de fichier non pris en charge.";
        }
        return "Impossible d'envoyer le média.";
    }

    // Upload vers le bucket privé, dans "<conversation>/<moi>/<id>.<ext>".
    // XHR pour avoir une vraie progression ; repli sur le SDK sinon.
    async function uploadDmMedia(file, conversationId, onProgress) {
        const currentUserId = getCurrentUserId();
        const ext = getFileExtensionForType(file.type, file.name);
        const objectPath = `${conversationId}/${currentUserId}/${createRandomFileId()}.${ext}`;

        const sessionResult = await supabase.auth.getSession();
        const accessToken = sessionResult?.data?.session?.access_token || "";
        const baseUrl = getSupabaseBaseUrl();
        const apiKey = getSupabaseApiKey();

        if (accessToken && baseUrl && apiKey && typeof XMLHttpRequest !== "undefined") {
            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open(
                    "POST",
                    `${baseUrl}/storage/v1/object/${DM_MEDIA_BUCKET}/${objectPath}`,
                );
                xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
                xhr.setRequestHeader("apikey", apiKey);
                xhr.setRequestHeader("x-upsert", "false");
                xhr.setRequestHeader("cache-control", "max-age=3600");
                if (file.type) xhr.setRequestHeader("Content-Type", file.type);
                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable && typeof onProgress === "function") {
                        onProgress((event.loaded / event.total) * 100);
                    }
                };
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve();
                    } else {
                        reject(new Error(describeStorageError(xhr.status, xhr.responseText)));
                    }
                };
                xhr.onerror = () =>
                    reject(new Error("NetworkError: envoi du média interrompu."));
                xhr.send(file);
            });
        } else {
            const { error } = await supabase.storage
                .from(DM_MEDIA_BUCKET)
                .upload(objectPath, file, {
                    contentType: file.type || undefined,
                    upsert: false,
                });
            if (error) {
                throw new Error(
                    describeStorageError(error.statusCode || error.status, error.message),
                );
            }
        }

        if (typeof onProgress === "function") onProgress(100);
        return { path: objectPath };
    }

    function removeDmMediaObject(path) {
        if (!path) return;
        supabase.storage
            .from(DM_MEDIA_BUCKET)
            .remove([path])
            .catch(() => {});
    }

    function isOfflineLikeError(error) {
        const message = String(error?.message || "").toLowerCase();
        return (
            !navigator.onLine ||
            message.includes("networkerror") ||
            message.includes("failed to fetch") ||
            message.includes("load failed") ||
            message.includes("network") ||
            message.includes("offline")
        );
    }

    // Remplace une bulle temporaire par la ligne serveur (sans doublon si
    // le realtime l'a déjà ajoutée).
    function replaceTempMessage(conversationId, tempId, row) {
        const current = state.messagesByConversation.get(conversationId) || [];
        const withoutTemp = current.filter((msg) => msg.id !== tempId);
        if (row && !withoutTemp.some((msg) => msg.id === row.id)) {
            withoutTemp.push(row);
        }
        const confirmed = withoutTemp
            .filter((msg) => !msg.pending)
            .sort(
                (a, b) =>
                    new Date(a.created_at || 0).getTime() -
                    new Date(b.created_at || 0).getTime(),
            );
        const pending = withoutTemp.filter((msg) => msg.pending);
        state.messagesByConversation.set(conversationId, [...confirmed, ...pending]);
    }

    function applyMessageToConversation(row) {
        const conversation = state.conversationsById.get(row?.conversation_id);
        if (!conversation) return;
        const lastAt = new Date(conversation.lastMessage?.created_at || 0).getTime();
        if (
            !conversation.lastMessage ||
            conversation.lastMessage.id === row.id ||
            new Date(row.created_at || 0).getTime() >= lastAt
        ) {
            conversation.lastMessage = row;
            conversation.lastMessageAt = row.created_at;
        }
    }

    async function submitMessageEdit(input) {
        const editing = state.editing;
        if (!editing) return;
        const body = String(input.value || "").trim();
        const original = findCachedMessage(editing.conversationId, editing.id);
        if (!original) {
            clearComposeContext();
            return;
        }
        if (!body && !original.media_path && !original.media_url) {
            showToast("error",
                "Modification impossible",
                DM_ERROR_MESSAGES.DM_EMPTY_MESSAGE,
            );
            return;
        }

        state.sendingMessage = true;
        syncComposerState();
        try {
            const { data, error } = await supabase.rpc("edit_dm_message", {
                p_message_id: editing.id,
                p_body: body,
            });
            if (error) throw error;
            const row = normalizeMessageRow(Array.isArray(data) ? data[0] : data);
            if (row?.id) {
                mergeMessageUpdate(row);
            }
            clearComposeContext({ restoreDraft: true });
        } catch (error) {
            console.error("Edit DM error:", error);
            showToast("error",
                "Modification impossible",
                getFriendlyDmErrorMessage(error, "Impossible de modifier le message."),
            );
        } finally {
            state.sendingMessage = false;
            syncComposerState();
            input.focus();
        }
    }

    async function sendCurrentMessage() {
        const currentUserId = getCurrentUserId();
        const conversationId = state.selectedConversationId;
        const input = getChatInput();
        const pending = getPendingAttachment();

        if (!currentUserId || !conversationId || !input) return;
        if (state.sendingMessage) return;

        const conversation = getSelectedConversation();
        if (!conversation?.otherUserId) return;

        if (state.editing) {
            await submitMessageEdit(input);
            return;
        }

        // Le serveur vérifie tout ; ici on évite juste un aller-retour inutile.
        const relationship = getSelectedRelationshipState();
        if (isRelationshipLocked(relationship)) {
            showToast("error",
                "Message non envoyé",
                getDmBlockedMessage(relationship),
            );
            return;
        }

        const originalValue = String(input.value || "");
        const body = originalValue.trim();
        if (!body && !pending?.file) return;
        if (body.length > DM_BODY_MAX) {
            showToast("error",
                "Message non envoyé",
                DM_ERROR_MESSAGES.DM_MESSAGE_TOO_LONG,
            );
            return;
        }

        const replyTo =
            state.replyTo?.conversationId === conversationId ? state.replyTo : null;

        state.sendingMessage = true;
        syncComposerState();

        let uploadedPath = null;
        let mediaInfo = null;
        let insertPayload = null;
        let tempId = null;

        try {
            if (pending?.file) {
                pending.uploading = true;
                pending.progress = 0;
                renderAttachmentPreview();
                syncComposerState();

                let fileToSend = pending.file;
                if (pending.kind === "image") {
                    fileToSend = await prepareImageForUpload(pending.file);
                }

                const upload = await uploadDmMedia(
                    fileToSend,
                    conversationId,
                    (percent) => {
                        const currentPending = getPendingAttachment();
                        if (!currentPending) return;
                        currentPending.progress = Number(percent) || 0;
                        currentPending.uploading = true;
                        renderAttachmentPreview();
                    },
                );
                uploadedPath = upload.path;
                // Aperçu instantané chez l'expéditeur, sans re-téléchargement.
                cacheLocalMedia(uploadedPath, fileToSend);
                mediaInfo = {
                    media_path: uploadedPath,
                    media_type: pending.kind === "video" ? "video" : "image",
                    media_name: pending.name || fileToSend.name || null,
                    media_size_bytes: Number(fileToSend.size || 0) || null,
                };
            }

            insertPayload = {
                conversation_id: conversationId,
                sender_id: currentUserId,
                body: body || null,
                ...(mediaInfo || {}),
                ...(replyTo ? { reply_to_id: replyTo.id } : {}),
            };

            // Affichage immédiat, confirmé ou retiré selon la réponse serveur.
            tempId = createTempId();
            const existing = state.messagesByConversation.get(conversationId) || [];
            state.messagesByConversation.set(conversationId, [
                ...existing,
                normalizeMessageRow({
                    ...insertPayload,
                    id: tempId,
                    created_at: new Date().toISOString(),
                    pending: true,
                }),
            ]);
            input.value = "";
            autoResizeChatInput();
            clearPendingAttachment();
            clearComposeContext();
            state.pinnedToBottom = true;
            renderChatMessages();
            scrollChatToBottom();

            const { data, error } = await runMessageSelect((selectColumns) =>
                supabase
                    .from("dm_messages")
                    .insert(insertPayload)
                    .select(selectColumns)
                    .single(),
            );
            if (error) throw error;

            if (data) {
                rememberMessageId(data.id);
                replaceTempMessage(conversationId, tempId, data);
                applyMessageToConversation(data);
                const current = state.conversationsById.get(conversationId);
                if (current) {
                    current.unreadCount = 0;
                    current.hiddenAt = null;
                }
                sortAndReindexConversations();
                renderChatMessages();
                updateUnreadUi();
            }
        } catch (error) {
            const queued = Boolean(tempId && insertPayload && isOfflineLikeError(error));
            if (queued) {
                // Hors ligne : la bulle reste "en cours d'envoi" et part
                // automatiquement au retour du réseau.
                try {
                    enqueueOutbox(insertPayload, tempId);
                    showToast("info",
                        "Message mis en file d'attente",
                        "Il sera envoyé automatiquement au retour de la connexion.",
                    );
                } catch (enqueueError) {
                    console.error("Enqueue outbox failed:", enqueueError);
                }
            } else {
                console.error("Erreur envoi message:", error);
                if (tempId) {
                    replaceTempMessage(conversationId, tempId, null);
                    renderChatMessages();
                }
                if (uploadedPath) {
                    removeDmMediaObject(uploadedPath);
                    forgetMedia(uploadedPath);
                }
                // On rend au moins le texte à l'utilisateur.
                if (!String(input.value || "").trim()) {
                    input.value = originalValue;
                    autoResizeChatInput();
                }
                if (replyTo && !state.replyTo) {
                    state.replyTo = replyTo;
                    renderComposeContext();
                }
                const currentPending = getPendingAttachment();
                if (currentPending) {
                    currentPending.uploading = false;
                    currentPending.progress = 0;
                    renderAttachmentPreview();
                }
                const rawMessage = String(error?.message || "");
                const friendly =
                    rawMessage === "HEIC_UNSUPPORTED"
                        ? "Ce navigateur ne lit pas les photos HEIC. Envoyez une photo JPEG ou PNG."
                        : getFriendlyDmErrorMessage(
                              error,
                              "Impossible d'envoyer le message.",
                          );
                showToast("error", "Message non envoyé", friendly);
                if (/DM_BLOCKED|DM_PRIVACY_RESTRICTED/i.test(rawMessage)) {
                    void refreshActiveRelationshipState(conversationId);
                }
            }
        } finally {
            const currentPending = getPendingAttachment();
            if (currentPending) {
                currentPending.uploading = false;
                renderAttachmentPreview();
            }
            state.sendingMessage = false;
            syncComposerState();
            input.focus();
        }
    }

    function enqueueOutbox(payload, tempMessageId) {
        if (!payload || !payload.conversation_id) return;
        const entry = {
            id: `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            payload,
            tempMessageId: tempMessageId || null,
            attempts: 0,
            createdAt: new Date().toISOString(),
            lastError: null,
        };
        state.outbox.push(entry);
        // start processing immediately (will no-op if already running)
        processOutbox().catch((e) =>
            console.error("Outbox processing failed:", e),
        );
    }

    async function processOutbox() {
        if (!state.outbox || !state.outbox.length) return;
        if (state.processingOutbox) return;
        state.processingOutbox = true;
        try {
            for (let i = 0; i < state.outbox.length; ) {
                // Hors ligne : on garde la file intacte, l'événement
                // "online" relancera le traitement.
                if (!navigator.onLine) break;
                const entry = state.outbox[i];
                if (!entry) {
                    i++;
                    continue;
                }
                try {
                    const { data, error } = await runMessageSelect(
                        (selectColumns) =>
                            supabase
                                .from("dm_messages")
                                .insert(entry.payload)
                                .select(selectColumns)
                                .single(),
                    );
                    if (error) throw error;
                    if (!data) throw new Error("Insertion sans retour.");
                    rememberMessageId(data.id);
                    replaceTempMessage(
                        data.conversation_id,
                        entry.tempMessageId,
                        data,
                    );
                    applyMessageToConversation(data);
                    state.outbox.splice(i, 1);
                    sortAndReindexConversations();
                    updateUnreadUi();
                    renderChatMessages();
                    continue; // don't increment i because array mutated
                } catch (err) {
                    entry.attempts = (entry.attempts || 0) + 1;
                    entry.lastError = String(err?.message || err || "");
                    // Refus du serveur (blocage, anti-spam...) : inutile
                    // d'insister, seules les coupures réseau sont réessayées.
                    if (!isOfflineLikeError(err)) entry.attempts = 5;
                    if (entry.attempts >= 5) {
                        if (window.ToastManager?.error) {
                            ToastManager.error(
                                "Échec envoi message",
                                "Un message en file d'attente a échoué après plusieurs tentatives.",
                            );
                        }
                        state.outbox.splice(i, 1);
                        dropFailedOutboxMessage(entry);
                        continue;
                    }
                    // exponential backoff, puis on réessaie la même entrée
                    // pour garder l'ordre d'envoi
                    const backoff = Math.min(
                        30000,
                        1000 * Math.pow(2, entry.attempts),
                    );
                    await new Promise((res) => setTimeout(res, backoff));
                }
            }
        } finally {
            state.processingOutbox = false;
        }
    }

    // Retire la bulle "en cours d'envoi" d'un message abandonné et remet
    // son texte dans le champ pour que l'utilisateur ne le perde pas.
    function dropFailedOutboxMessage(entry) {
        const convId = entry?.payload?.conversation_id;
        if (!convId || !entry.tempMessageId) return;
        const msgs = state.messagesByConversation.get(convId) || [];
        state.messagesByConversation.set(
            convId,
            msgs.filter((m) => m.id !== entry.tempMessageId),
        );
        const input = getChatInput();
        const body = String(entry.payload.body || "");
        if (
            body &&
            input &&
            state.selectedConversationId === convId &&
            !String(input.value || "").trim()
        ) {
            input.value = body;
            autoResizeChatInput();
        }
        renderChatMessages();
    }

    function scheduleConversationsRefresh() {
        if (state.refreshTimer) {
            clearTimeout(state.refreshTimer);
        }
        state.refreshTimer = setTimeout(() => {
            state.refreshTimer = null;
            refreshConversations({ preserveSelection: true }).catch((error) => {
                console.error("Refresh conversations failed:", error);
            });
        }, 220);
    }

    function startPollingFallback() {
        if (state.pollingTimer) {
            clearInterval(state.pollingTimer);
            state.pollingTimer = null;
        }

        state.pollingTimer = setInterval(() => {
            if (!isLoggedIn()) return;
            if (document.hidden) return;
            refreshConversations({ preserveSelection: true }).catch((error) => {
                console.error("DM polling refresh error:", error);
            });
        }, 6000);
    }

    async function resolveUser(userId) {
        if (!userId) return null;
        if (state.usersById.has(userId)) return state.usersById.get(userId);
        try {
            const { data, error } = await supabase
                .from("users")
                .select("id, name, avatar, account_subtype")
                .eq("id", userId)
                .maybeSingle();
            if (error && isMissingAccountSubtypeColumnError(error)) {
                const retry = await supabase
                    .from("users")
                    .select("id, name, avatar")
                    .eq("id", userId)
                    .maybeSingle();
                if (retry.error) throw retry.error;
                if (retry.data) {
                    state.usersById.set(retry.data.id, retry.data);
                    return retry.data;
                }
                return null;
            }
            if (error) throw error;
            if (data) {
                state.usersById.set(data.id, data);
                return data;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    function isMessagesPageActive() {
        const section = getDmSection();
        return !!(section && section.classList.contains("active"));
    }

    async function showIncomingSignal(messageRow) {
        if (!messageRow || messageRow.sender_id === getCurrentUserId()) return;
        const conversation = state.conversationsById.get(
            messageRow.conversation_id,
        );
        // Sourdine, ou discussion déjà sous les yeux : pas de toast ni de son.
        if (conversation?.muted) return;
        if (isConversationVisible(messageRow.conversation_id)) return;

        const sender = await resolveUser(messageRow.sender_id);
        const senderName = sender?.name || "Nouveau message";
        const snippet =
            buildMessageSnippet(messageRow, 110) ||
            "Vous avez reçu un nouveau message.";

        if (window.ToastManager?.info) {
            ToastManager.info(`Message de ${senderName}`, snippet);
        }

        if (typeof window.playNotificationSound === "function") {
            window.playNotificationSound("message");
        }

        if (document.hidden || !isMessagesPageActive()) {
            if (typeof window.showDeviceNotification === "function") {
                window
                    .showDeviceNotification({
                        title: `Message de ${senderName}`,
                        body: snippet,
                        icon: "icons/logo.png",
                        tag: `dm-${messageRow.id}`,
                        link: `index.html?messages=1&dm=${encodeURIComponent(messageRow.sender_id)}`,
                        renotify: true,
                        silent: false,
                    })
                    .catch(() => {});
            } else if (
                typeof Notification !== "undefined" &&
                Notification.permission === "granted"
            ) {
                try {
                    const n = new Notification(`Message de ${senderName}`, {
                        body: snippet,
                        icon: "icons/logo.png",
                        tag: `dm-${messageRow.id}`,
                    });
                    n.onclick = () => {
                        window.focus();
                        openMessagesWithUser(messageRow.sender_id);
                        n.close();
                    };
                } catch (error) {
                    // ignore browser notification errors
                }
            }
        }
    }

    async function isConversationRelevantToCurrentUser(conversationId) {
        const currentUserId = getCurrentUserId();
        if (!currentUserId || !conversationId) return false;
        if (state.conversationsById.has(conversationId)) return true;

        const cacheKey = `${currentUserId}:${conversationId}`;
        if (state.conversationMembershipChecks.has(cacheKey)) {
            return state.conversationMembershipChecks.get(cacheKey);
        }

        const checkPromise = supabase
            .from("dm_participants")
            .select("conversation_id")
            .eq("conversation_id", conversationId)
            .eq("user_id", currentUserId)
            .maybeSingle()
            .then(({ data, error }) => {
                if (error) {
                    console.warn("DM membership check failed:", error);
                    return true;
                }
                return Boolean(data?.conversation_id);
            })
            .catch((error) => {
                console.warn("DM membership check failed:", error);
                return true;
            });

        state.conversationMembershipChecks.set(cacheKey, checkPromise);
        const isRelevant = await checkPromise;
        state.conversationMembershipChecks.set(cacheKey, isRelevant);
        return isRelevant;
    }

    async function handleIncomingMessage(messageRow) {
        const normalizedMessage = normalizeMessageRow(messageRow);
        if (!normalizedMessage || !normalizedMessage.id) return;

        const conversationId = normalizedMessage.conversation_id;
        if (!conversationId) return;
        if (state.seenMessageIds.has(normalizedMessage.id)) return;

        const isRelevantConversation =
            await isConversationRelevantToCurrentUser(conversationId);
        if (!isRelevantConversation) return;

        rememberMessageId(normalizedMessage.id);
        const currentUserId = getCurrentUserId();
        const fromMe = normalizedMessage.sender_id === currentUserId;

        if (!state.conversationsById.has(conversationId)) {
            scheduleConversationsRefresh();
        }

        const conversation = state.conversationsById.get(conversationId);
        const visible = isConversationVisible(conversationId);
        if (conversation) {
            applyMessageToConversation(normalizedMessage);
            conversation.hiddenAt = null;
            if (!fromMe && !visible) {
                conversation.unreadCount = (conversation.unreadCount || 0) + 1;
            }
        }
        if (!fromMe && state.typing.conversationId === conversationId) {
            state.typing.otherTypingUntil = 0;
        }

        const existing = state.messagesByConversation.get(conversationId) || [];
        if (!existing.some((msg) => msg.id === normalizedMessage.id)) {
            // Mon propre message reçu avant la réponse de l'insert : il
            // remplace la bulle temporaire correspondante.
            const tempMatch = fromMe
                ? existing.find(
                      (msg) =>
                          msg.pending &&
                          (msg.body || "") === (normalizedMessage.body || "") &&
                          (msg.media_path || null) ===
                              (normalizedMessage.media_path || null),
                  )
                : null;
            replaceTempMessage(
                conversationId,
                tempMatch?.id || null,
                normalizedMessage,
            );
        }

        sortAndReindexConversations();
        updateUnreadUi();

        if (state.selectedConversationId === conversationId) {
            renderChatMessages();
        }
        if (visible && !fromMe) {
            await markConversationAsRead(conversationId);
        }

        await showIncomingSignal(normalizedMessage);
    }

    // Modification / suppression d'un message (realtime ou réponse RPC).
    function mergeMessageUpdate(row) {
        const updated = normalizeMessageRow(row);
        if (!updated?.id || !updated.conversation_id) return;
        const conversationId = updated.conversation_id;
        const messages = state.messagesByConversation.get(conversationId);
        if (messages) {
            const index = messages.findIndex((msg) => msg.id === updated.id);
            if (index !== -1) {
                const previous = messages[index];
                if (updated.deleted_at && previous.media_path) {
                    forgetMedia(previous.media_path);
                }
                messages[index] = { ...previous, ...updated, pending: false };
            }
        }
        const conversation = state.conversationsById.get(conversationId);
        if (conversation?.lastMessage?.id === updated.id) {
            conversation.lastMessage = { ...conversation.lastMessage, ...updated };
            renderThreadsList();
        }
        if (state.editing?.id === updated.id && updated.deleted_at) {
            clearComposeContext();
        }
        if (state.replyTo?.id === updated.id) {
            renderComposeContext();
        }
        if (state.selectedConversationId === conversationId) {
            renderChatMessages();
        }
    }

    // Accusés de lecture et synchronisation multi-appareils.
    function handleParticipantUpdate(row) {
        if (!row?.conversation_id || !row.user_id) return;
        const conversation = state.conversationsById.get(row.conversation_id);
        if (!conversation) return;
        if (row.user_id === getCurrentUserId()) {
            conversation.lastReadAt = row.last_read_at || conversation.lastReadAt;
            conversation.muted = row.muted === true;
            const lastAt = new Date(conversation.lastMessageAt || 0).getTime();
            if (
                conversation.lastReadAt &&
                new Date(conversation.lastReadAt).getTime() >= lastAt
            ) {
                conversation.unreadCount = 0;
            }
            updateUnreadUi();
            return;
        }
        conversation.otherLastReadAt = row.last_read_at || null;
        if (state.selectedConversationId === row.conversation_id) {
            renderChatMessages();
        }
    }

    function subscribeRealtime() {
        const currentUserId = getCurrentUserId();
        if (!currentUserId || !window.supabase) return;

        // removeChannel déclenche le statut CLOSED de l'ancien canal : on le
        // détache d'abord pour que son callback l'ignore (sinon boucle de
        // reconnexion infinie).
        clearRealtimeReconnectTimer();
        if (state.realtimeChannel) {
            const previousChannel = state.realtimeChannel;
            state.realtimeChannel = null;
            supabase.removeChannel(previousChannel);
        }

        const channel = supabase
            .channel(`dm-realtime-${currentUserId}-${Date.now()}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "dm_messages",
                },
                (payload) => {
                    handleIncomingMessage(payload.new).catch((error) => {
                        console.error("Incoming DM handling error:", error);
                    });
                },
            )
            // Les RLS filtrent : on ne reçoit que nos conversations.
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "dm_messages",
                },
                (payload) => {
                    mergeMessageUpdate(payload.new);
                },
            )
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "dm_participants",
                },
                (payload) => {
                    handleParticipantUpdate(payload.new);
                },
            )
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "dm_participants",
                    filter: `user_id=eq.${currentUserId}`,
                },
                () => {
                    scheduleConversationsRefresh();
                },
            );
        state.realtimeChannel = channel;

        channel.subscribe((status) => {
            // Canal remplacé ou nettoyé entre-temps : on l'ignore.
            if (state.realtimeChannel !== channel) return;

            // On success, reset reconnect attempts and ensure UI is fresh
            if (status === "SUBSCRIBED") {
                clearRealtimeReconnectTimer();
                state.realtimeReconnectAttempts = 0;
                state.realtimeWarned = false;
                refreshConversations({ preserveSelection: true }).catch(
                    (error) => {
                        console.error(
                            "DM initial realtime refresh error:",
                            error,
                        );
                    },
                );
                // Try to flush any queued outbound messages now that realtime is available
                try {
                    processOutbox();
                } catch (e) {}
                return;
            }

            // Warn once about realtime issues and schedule a reconnect with backoff
            if (
                (status === "CHANNEL_ERROR" || status === "CLOSED") &&
                !state.realtimeWarned
            ) {
                state.realtimeWarned = true;
                console.warn(
                    "DM realtime indisponible. Fallback polling actif (vérifiez la publication realtime des tables DM).",
                );
            }

            if (
                (status === "CHANNEL_ERROR" || status === "CLOSED") &&
                !state.realtimeReconnectTimer
            ) {
                state.realtimeReconnectAttempts =
                    (state.realtimeReconnectAttempts || 0) + 1;
                const delay = Math.min(
                    30000,
                    1000 * Math.pow(2, state.realtimeReconnectAttempts),
                );
                state.realtimeReconnectTimer = setTimeout(() => {
                    state.realtimeReconnectTimer = null;
                    if (!isLoggedIn()) return;
                    try {
                        subscribeRealtime();
                    } catch (e) {
                        console.error("Realtime resubscribe failed:", e);
                    }
                }, delay);
            }
        });

        startPollingFallback();
    }

    function clearRealtimeReconnectTimer() {
        if (state.realtimeReconnectTimer) {
            clearTimeout(state.realtimeReconnectTimer);
            state.realtimeReconnectTimer = null;
        }
    }

    function cleanupRealtime() {
        clearRealtimeReconnectTimer();
        if (state.realtimeChannel) {
            const previousChannel = state.realtimeChannel;
            state.realtimeChannel = null;
            supabase.removeChannel(previousChannel);
        }
        if (state.pollingTimer) {
            clearInterval(state.pollingTimer);
            state.pollingTimer = null;
        }
        if (state.refreshTimer) {
            clearTimeout(state.refreshTimer);
            state.refreshTimer = null;
        }
    }

    function parseRouteIntent() {
        try {
            const params = new URLSearchParams(window.location.search);
            const dm = params.get("dm") || "";
            const wantsMessages =
                params.get("messages") === "1" ||
                params.get("page") === "messages" ||
                Boolean(dm);
            return {
                wantsMessages,
                dmUserId: dm,
            };
        } catch (error) {
            return { wantsMessages: false, dmUserId: "" };
        }
    }

    function clearRouteIntentParams() {
        try {
            const url = new URL(window.location.href);
            let changed = false;
            ["messages", "page", "dm"].forEach((key) => {
                if (url.searchParams.has(key)) {
                    url.searchParams.delete(key);
                    changed = true;
                }
            });
            if (changed) {
                window.history.replaceState({}, "", url.toString());
            }
        } catch (error) {
            // no-op
        }
    }

    function openMessagesPageOnly() {
        if (!isLoggedIn()) {
            window.location.href = "login.html";
            return;
        }

        if (!hasDmPage()) {
            const url = new URL("index.html", window.location.href);
            url.searchParams.set("messages", "1");
            window.location.href = url.toString();
            return;
        }

        if (typeof window.navigateTo === "function") {
            window.navigateTo(DM_PAGE_ID);
        } else {
            document
                .querySelectorAll(".page")
                .forEach((p) => p.classList.remove("active"));
            const target = getDmSection();
            if (target) target.classList.add("active");
            if (typeof window.syncFloatingCreateVisibility === "function") {
                window.syncFloatingCreateVisibility(DM_PAGE_ID);
            } else {
                const floatingCreate = document.getElementById(
                    "floating-create-container",
                );
                if (floatingCreate) floatingCreate.style.display = "none";
            }
        }

        ensureMessagesShell();
        renderThreadsList();
        renderChatHeader();
        renderChatMessages();
    }

    async function openMessagesWithUser(targetUserId) {
        if (!targetUserId) return;

        const messageRouteKey = `${targetUserId}|${window.location.pathname || ""}|${window.location.search || ""}`;
        const now = Date.now();
        if (
            window.__messagesOpenGuardKey === messageRouteKey &&
            window.__messagesOpenGuardAt &&
            now - window.__messagesOpenGuardAt < 1200
        ) {
            return;
        }
        window.__messagesOpenGuardKey = messageRouteKey;
        window.__messagesOpenGuardAt = now;

        if (!isLoggedIn()) {
            window.location.href = "login.html";
            return;
        }

        if (
            typeof window.canCurrentUserMessageTargetAsync === "function" &&
            !(await window.canCurrentUserMessageTargetAsync(targetUserId))
        ) {
            if (window.ToastManager?.info) {
                ToastManager.info(
                    "Messages limites",
                    "Cet utilisateur limite les nouvelles conversations.",
                );
            }
            return;
        }

        if (!hasDmPage()) {
            const url = new URL("index.html", window.location.href);
            url.searchParams.set("messages", "1");
            url.searchParams.set("dm", targetUserId);
            window.location.href = url.toString();
            return;
        }

        openMessagesPageOnly();

        try {
            const conversationId = await getOrCreateConversation(targetUserId);
            await refreshConversations({ preserveSelection: true });
            await selectConversation(conversationId, {
                markRead: true,
                focusInput: true,
                forceReload: true,
            });
            clearRouteIntentParams();
        } catch (error) {
            console.error("Open conversation error:", error);
            if (isMissingSchemaError(error)) {
                showSchemaMissingState();
                return;
            }
            if (window.ToastManager?.error) {
                ToastManager.error(
                    "Messagerie indisponible",
                    getFriendlyDmErrorMessage(
                        error,
                        "Impossible d'ouvrir la conversation.",
                    ),
                );
            } else {
                alert(
                    getFriendlyDmErrorMessage(
                        error,
                        "Impossible d'ouvrir la conversation.",
                    ),
                );
            }
        }
    }

    async function openMessagesPage() {
        if (!isLoggedIn()) {
            window.location.href = "login.html";
            return;
        }

        openMessagesPageOnly();

        if (!state.conversations.length) {
            await refreshConversations({ preserveSelection: true });
        }

        if (state.selectedConversationId && !isMobileLayout()) {
            await selectConversation(state.selectedConversationId, {
                markRead: true,
                focusInput: false,
            });
        }
    }

    async function maybeHandleRouteIntent() {
        if (state.routeHandled) return;
        const intent = parseRouteIntent();
        if (!intent.wantsMessages) return;
        if (!isLoggedIn()) return;

        state.routeHandled = true;
        if (intent.dmUserId) {
            await openMessagesWithUser(intent.dmUserId);
        } else {
            await openMessagesPage();
            clearRouteIntentParams();
        }
    }

    async function initializeMessaging() {
        const currentUserId = getCurrentUserId();
        const messagingInitKey = `${currentUserId || "guest"}|${window.location.pathname || ""}|${window.location.search || ""}`;
        const now = Date.now();
        if (
            window.__messagingInitGuardKey === messagingInitKey &&
            window.__messagingInitGuardAt &&
            now - window.__messagingInitGuardAt < 1200
        ) {
            return;
        }
        window.__messagingInitGuardKey = messagingInitKey;
        window.__messagingInitGuardAt = now;

        if (hasDmPage()) {
            ensureMessagesShell();
            syncComposerState();
        }

        if (!currentUserId || !window.supabase) {
            cleanupMessaging();
            return;
        }

        setNavButtonVisible(true);

        if (state.initializedForUserId !== currentUserId) {
            cleanupRealtime();
            leaveTypingChannel();
            clearPendingAttachment();
            clearComposeContext();
            clearMediaCache();
            state.olderByConversation = new Map();
            state.inboxRpcAvailable = true;
            state.initializedForUserId = currentUserId;
            state.selectedConversationId = null;
            state.conversations = [];
            state.conversationsById = new Map();
            state.messagesByConversation = new Map();
            state.seenMessageIds = new Set();
            state.routeHandled = false;
            state.realtimeWarned = false;
            state.sendingMessage = false;
            state.activeRelationship = null;
            state.lastRenderedConversationId = null;
            state.lastRenderedMessagesSignature = "";
            state.conversationMembershipChecks = new Map();

            try {
                await refreshConversations({ preserveSelection: true });
            } catch (error) {
                console.error("Messaging init refresh error:", error);
            }

            subscribeRealtime();
        }

        await maybeHandleRouteIntent();
    }

    function cleanupMessaging() {
        cleanupRealtime();
        leaveTypingChannel();
        clearPendingAttachment();
        clearComposeContext();
        closeMessageMenu();
        closeMediaViewer();
        clearMediaCache();
        state.olderByConversation = new Map();
        state.inboxRpcAvailable = true;
        state.initializedForUserId = null;
        state.selectedConversationId = null;
        state.conversations = [];
        state.conversationsById = new Map();
        state.messagesByConversation = new Map();
        state.usersById = new Map();
        state.seenMessageIds = new Set();
        state.routeHandled = false;
        state.lastRenderedConversationId = null;
        state.lastRenderedMessagesSignature = "";
        state.conversationMembershipChecks = new Map();
        state.sendingMessage = false;
        state.activeRelationship = null;
        // clear any queued outbound messages when user logs out or messaging is cleaned up
        state.outbox = [];
        state.processingOutbox = false;
        state.realtimeReconnectAttempts = 0;
        setNavBadgeCount(0);
        setNavButtonVisible(false);
    }

    window.initializeMessaging = initializeMessaging;
    window.cleanupMessaging = cleanupMessaging;
    window.openMessagesPage = openMessagesPage;
    window.openMessagesWithUser = openMessagesWithUser;

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) return;
        if (!isLoggedIn()) return;
        refreshConversations({ preserveSelection: true })
            .then(() => {
                const selected = state.selectedConversationId;
                if (isConversationVisible(selected)) {
                    return markConversationAsRead(selected);
                }
                return null;
            })
            .catch((error) => {
                console.error("DM visibility refresh error:", error);
            });
    });

    // Network connectivity hooks: try to recover realtime and flush outbox on reconnect
    try {
        window.addEventListener("online", () => {
            if (!isLoggedIn()) return;
            if (window.ToastManager?.info) {
                ToastManager.info(
                    "Connexion rétablie",
                    "Tentative d'envoi des messages en attente.",
                );
            }
            try {
                subscribeRealtime();
            } catch (e) {}
            try {
                processOutbox();
            } catch (e) {}
        });

        window.addEventListener("offline", () => {
            if (window.ToastManager?.info) {
                ToastManager.info(
                    "Connexion perdue",
                    "Les nouveaux messages seront mis en file d'attente.",
                );
            }
        });
    } catch (e) {}
})();
