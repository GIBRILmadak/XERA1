/* ========================================
   MESSAGERIE DIRECTE (DM)
   ======================================== */

(function () {
    const DM_PAGE_ID = "messages";
    const DM_MESSAGES_LIMIT = 60;
    const DM_BODY_MAX = 4000;
    const DM_MESSAGE_SELECT =
        "id, conversation_id, sender_id, body, media_url, media_type, media_name, media_size_bytes, created_at";
    const DM_MESSAGE_LEGACY_SELECT =
        "id, conversation_id, sender_id, body, created_at";
    const DM_ATTACHMENT_ACCEPT = "image/*,video/*";

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
        const badge = getOrCreateNavBadge();
        if (!badge) return;
        const value = Number(count) || 0;
        if (value > 0) {
            badge.textContent = value > 99 ? "99+" : String(value);
            badge.style.display = "flex";
        } else {
            badge.style.display = "none";
            badge.textContent = "";
        }
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
            "media_type",
            "media_name",
            "media_size_bytes",
        ]);
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
            media_type: row.media_type || null,
            media_name: row.media_name || null,
            media_size_bytes: row.media_size_bytes || null,
        };
    }

    async function runMessageSelect(queryFactory) {
        let response = await queryFactory(DM_MESSAGE_SELECT);
        if (response?.error && isMissingDmMediaSchemaError(response.error)) {
            response = await queryFactory(DM_MESSAGE_LEGACY_SELECT);
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
        if (mediaType === "video") return "Video";
        if (mediaType === "image") return "Photo";
        if (message?.media_url) return "Fichier";
        return "";
    }

    function buildMessageSnippet(message, maxLen = 80) {
        const text = trimSnippet(message?.body || "", maxLen);
        if (text) return text;
        const attachmentLabel = getMessageAttachmentLabel(message);
        return attachmentLabel ? `${attachmentLabel} jointe` : "";
    }

    function createNeutralRelationshipState(otherUserId = null) {
        return {
            otherUserId: otherUserId || null,
            blockedByMe: false,
            blockedMe: false,
            canMessage: Boolean(otherUserId),
            loading: false,
        };
    }

    function normalizeRelationshipState(value, otherUserId = null) {
        const blockedByMe =
            value?.blockedByMe === true || value?.blocked_by_me === true;
        const blockedMe =
            value?.blockedMe === true || value?.blocked_me === true;
        const canMessage =
            value?.canMessage === false || value?.can_message === false
                ? false
                : !blockedByMe && !blockedMe;
        return {
            otherUserId: otherUserId || value?.otherUserId || null,
            blockedByMe,
            blockedMe,
            canMessage,
            loading: value?.loading === true,
        };
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
        return "Messagerie indisponible pour cette conversation.";
    }

    function getFriendlyDmErrorMessage(error, fallbackMessage) {
        const rawMessage = String(error?.message || "").trim();
        const normalized = rawMessage.toUpperCase();
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
                                    <button type="button" class="chat-menu-item" id="chat-delete-btn" role="menuitem"><i class="fa-regular fa-trash-can"></i> Supprimer la discussion</button>
                                    <button type="button" class="chat-menu-item danger" id="chat-block-btn" role="menuitem">Bloquer</button>
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
            });
            input.addEventListener("keydown", (event) => {
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
                handleMessageUserLinkClick(event);
            });
        }

        renderAttachmentPreview();
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

        const isVideo =
            typeof window.isLikelyVideoFile === "function"
                ? window.isLikelyVideoFile(file)
                : String(file.type || "")
                      .toLowerCase()
                      .startsWith("video/");

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
        const isBlocked = relationship.blockedByMe || relationship.blockedMe;
        const canCompose = Boolean(state.selectedConversationId) && !isBlocked;
        const hasText = Boolean(String(input?.value || "").trim());
        const hasAttachment = Boolean(pending?.file);
        const isBusy = Boolean(state.sendingMessage || pending?.uploading);
        const canSend = canCompose && !isBusy && (hasText || hasAttachment);

        if (input) input.disabled = !canCompose || isBusy;
        if (sendBtn) {
            sendBtn.disabled = !canSend;
            sendBtn.classList.toggle("active", canSend);
            sendBtn.classList.toggle("is-busy", isBusy);
        }
        if (attachBtn) attachBtn.disabled = !canCompose || isBusy;
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
                    hint.textContent = "Upload du média en cours...";
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

        let validation = null;
        if (typeof window.validateFile === "function") {
            validation = window.validateFile(file);
        }
        if (validation && validation.valid === false) {
            const message = Array.isArray(validation.errors)
                ? validation.errors[0]
                : "Fichier non supporté.";
            if (window.ToastManager?.error) {
                window.ToastManager.error("Pièce jointe refusée", message);
            }
            return;
        }

        setPendingAttachment(file);
    }

    function renderMessageMedia(message) {
        if (!message?.media_url) return "";
        const mediaUrl = escapeHtml(message.media_url);
        const mediaName = escapeHtml(
            message.media_name || getMessageAttachmentLabel(message) || "Média",
        );
        if (String(message.media_type || "").toLowerCase() === "video") {
            return `
                <div class="chat-media-wrap">
                    <video class="chat-media chat-media-video" src="${mediaUrl}" controls preload="metadata" playsinline></video>
                </div>
            `;
        }
        return `
            <a class="chat-media-link" href="${mediaUrl}" target="_blank" rel="noreferrer">
                <img class="chat-media chat-media-image" src="${mediaUrl}" alt="${mediaName}" loading="lazy" />
            </a>
        `;
    }

    function renderMessageBody(message) {
        const body = String(message?.body || "").trim();
        const mediaHtml = renderMessageMedia(message);
        const bodyHtml = body
            ? `<div class="chat-body">${escapeHtml(body)}</div>`
            : "";
        const attachmentLabel =
            !body && message?.media_url
                ? `<div class="chat-media-label">${escapeHtml(getMessageAttachmentLabel(message) || "Pièce jointe")}</div>`
                : "";
        return `${bodyHtml}${mediaHtml}${attachmentLabel}`;
    }

    function getMessageRenderSignature(message) {
        if (!message) return "";
        return [
            message.id || "",
            message.body || "",
            message.media_url || "",
            message.media_type || "",
            message.media_name || "",
            message.media_size_bytes || "",
            message.created_at || "",
            message.pending ? "pending" : "",
        ].join("|");
    }

    function getMessagesListSignature(messages) {
        return (messages || [])
            .map((message) => getMessageRenderSignature(message))
            .join("::");
    }

    function buildMessageHtml(message, currentUserId) {
        const mine = message.sender_id === currentUserId;
        const messageTime = formatMessageTime(message.created_at);
        const hasMediaOnly =
            Boolean(message?.media_url) && !String(message?.body || "").trim();
        // Les DM sont toujours en tête-à-tête : le nom de l'interlocuteur est
        // déjà dans l'en-tête, inutile de le répéter sur chaque bulle.
        const statusHtml = mine
            ? message.pending
                ? '<span class="message-status-icon" title="Envoi en cours"><i class="fa-regular fa-clock"></i></span>'
                : '<span class="message-status-icon" title="Envoyé"><i class="fa-solid fa-check"></i></span>'
            : "";

        return `
            <div class="message-bubble-wrap ${mine ? "outgoing" : "incoming"}${message.pending ? " is-pending" : ""}" data-message-id="${escapeHtml(message.id)}">
                <div class="message-bubble${hasMediaOnly ? " media-only" : ""}">
                    ${renderMessageBody(message)}
                    <span class="message-meta">
                        <span class="chat-time">${escapeHtml(messageTime)}</span>
                        ${statusHtml}
                    </span>
                </div>
            </div>
        `;
    }

    function createMessageNode(message, currentUserId) {
        const template = document.createElement("template");
        template.innerHTML = buildMessageHtml(message, currentUserId).trim();
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
                                <span class="thread-time">${escapeHtml(timeLabel)}</span>
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

        if (blockBtn) {
            if (!conversation || !profile?.id) {
                blockBtn.disabled = true;
                blockBtn.textContent = "Bloquer";
            } else {
                blockBtn.disabled =
                    relationship.loading || relationship.blockedByMe;
                blockBtn.textContent = relationship.blockedByMe
                    ? "Bloqué"
                    : "Bloquer";
                blockBtn.title = relationship.blockedByMe
                    ? "Débloquez cet utilisateur depuis Réglages"
                    : `Bloquer ${profile.name}`;
            }
        }
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
            if (relationship.blockedByMe || relationship.blockedMe) {
                subEl.textContent = getDmBlockedMessage(relationship);
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

    function renderChatMessages() {
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
        const listSignature = getMessagesListSignature(messages);
        const currentUserId = getCurrentUserId();

        if (!messages.length) {
            if (
                state.lastRenderedConversationId !== conversationId ||
                state.lastRenderedMessagesSignature !== listSignature
            ) {
                chat.innerHTML = `
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
        const GROUP_WINDOW_MS = 5 * 60 * 1000;
        let previousDayKey = "";
        let previousNode = null;
        let previousMessage = null;
        messages.forEach((message) => {
            const messageId = String(message.id || "");
            const renderSignature = getMessageRenderSignature(message);
            const existing = existingNodes.get(messageId);
            let node = existing;

            const dayKey = getMessageDayKey(message.created_at);
            const newDay = Boolean(dayKey) && dayKey !== previousDayKey;
            if (newDay) {
                const separator = document.createElement("div");
                separator.className = "messages-date-separator";
                separator.innerHTML = `<span>${escapeHtml(formatMessageDayLabel(message.created_at))}</span>`;
                fragment.appendChild(separator);
                previousDayKey = dayKey;
            }

            if (!node || node.dataset.renderSignature !== renderSignature) {
                node = createMessageNode(message, currentUserId);
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

            node.dataset.renderSignature = renderSignature;
            fragment.appendChild(node);
            previousNode = node;
            previousMessage = message;
        });

        chat.replaceChildren(fragment);
        state.lastRenderedConversationId = conversationId;
        state.lastRenderedMessagesSignature = listSignature;

        if (
            wasNearBottom ||
            previousRenderedConversationId !== conversationId
        ) {
            chat.scrollTop = chat.scrollHeight;
        }
        syncComposerState();
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

    async function refreshConversations({ preserveSelection = true } = {}) {
        if (!isLoggedIn()) return;
        if (!ensureMessagesShell()) return;

        const currentUserId = getCurrentUserId();
        const list = document.getElementById("threads-list");
        if (list && state.conversations.length === 0) {
            list.innerHTML = `<div class="loading-state">Chargement...</div>`;
        }

        try {
            const { data: myMemberships, error: membershipsError } =
                await supabase
                    .from("dm_participants")
                    .select("conversation_id, last_read_at, hidden_at")
                    .eq("user_id", currentUserId);

            if (membershipsError) throw membershipsError;

            const memberships = myMemberships || [];
            if (memberships.length === 0) {
                state.conversations = [];
                state.conversationsById = new Map();
                if (!preserveSelection) {
                    state.selectedConversationId = null;
                } else if (
                    !state.conversationsById.has(state.selectedConversationId)
                ) {
                    state.selectedConversationId = null;
                }
                updateUnreadUi();
                renderChatMessages();
                return;
            }

            const conversationIds = memberships
                .map((row) => row.conversation_id)
                .filter(Boolean);
            const lastReadByConversation = new Map();
            const hiddenAtByConversation = new Map();
            memberships.forEach((row) => {
                if (row?.conversation_id) {
                    lastReadByConversation.set(
                        row.conversation_id,
                        row.last_read_at || null,
                    );
                    hiddenAtByConversation.set(
                        row.conversation_id,
                        row.hidden_at || null,
                    );
                }
            });

            const [conversationsResult, lastMessagesResult] = await Promise.all(
                [
                    supabase
                        .from("dm_conversations")
                        .select(
                            "id, created_at, updated_at, last_message_at, pair_key",
                        )
                        .in("id", conversationIds),
                    runMessageSelect((selectColumns) =>
                        supabase
                            .from("dm_messages")
                            .select(selectColumns)
                            .in("conversation_id", conversationIds)
                            .order("created_at", { ascending: false })
                            .limit(Math.max(conversationIds.length * 8, 60)),
                    ),
                ],
            );

            if (conversationsResult.error) throw conversationsResult.error;
            if (lastMessagesResult.error) throw lastMessagesResult.error;

            const conversationsRows = conversationsResult.data || [];
            const lastMessagesRows = lastMessagesResult.data || [];

            const otherUserIds = conversationsRows
                .map((conv) =>
                    extractOtherUserIdFromPairKey(conv.pair_key, currentUserId),
                )
                .filter(Boolean);
            await fetchUsers(otherUserIds);
            await fetchProfessionalPagesForOwners(otherUserIds);

            const lastMessageByConversation = new Map();
            lastMessagesRows.forEach((row) => {
                rememberMessageId(row.id);
                if (!row?.conversation_id) return;
                if (!lastMessageByConversation.has(row.conversation_id)) {
                    lastMessageByConversation.set(row.conversation_id, row);
                }
            });

            const conversations = [];
            for (const conv of conversationsRows) {
                const otherUserId = extractOtherUserIdFromPairKey(
                    conv.pair_key,
                    currentUserId,
                );
                const userProfile = otherUserId
                    ? state.usersById.get(otherUserId)
                    : null;
                const lastMessage =
                    lastMessageByConversation.get(conv.id) || null;
                const lastReadAt = lastReadByConversation.get(conv.id) || null;
                const hiddenAt = hiddenAtByConversation.get(conv.id) || null;
                const lastActivityAt =
                    lastMessage?.created_at ||
                    conv.last_message_at ||
                    conv.updated_at ||
                    conv.created_at;

                if (hiddenAt && lastActivityAt) {
                    const hiddenTime = new Date(hiddenAt).getTime();
                    const lastActivityTime = new Date(lastActivityAt).getTime();
                    if (
                        Number.isFinite(hiddenTime) &&
                        Number.isFinite(lastActivityTime) &&
                        lastActivityTime <= hiddenTime
                    ) {
                        continue;
                    }
                }

                let unreadCount = 0;
                try {
                    unreadCount = await fetchUnreadCount(conv.id, lastReadAt);
                } catch (error) {
                    unreadCount = 0;
                }

                conversations.push({
                    ...conv,
                    id: conv.id,
                    otherUserId: otherUserId || null,
                    otherName: userProfile?.name || "Conversation",
                    otherAccountSubtype:
                        userProfile?.account_subtype ||
                        userProfile?.accountSubtype ||
                        null,
                    otherAvatar:
                        userProfile?.avatar ||
                        "https://placehold.co/80x80?text=%F0%9F%92%AC",
                    lastReadAt,
                    hiddenAt,
                    lastMessage,
                    lastMessageAt: lastActivityAt,
                    unreadCount,
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
            } else {
                state.selectedConversationId =
                    state.conversations[0]?.id || null;
            }

            renderThreadsList();
            renderChatHeader();
            setNavBadgeCount(getUnreadTotal());
            void refreshActiveRelationshipState(state.selectedConversationId);

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
            if (listEl) {
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
            state.messagesByConversation.set(conversationId, rows);

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

    async function markConversationAsRead(conversationId) {
        const currentUserId = getCurrentUserId();
        if (!currentUserId || !conversationId) return;

        const conversation = state.conversationsById.get(conversationId);
        if (!conversation) return;

        const nowIso = new Date().toISOString();
        conversation.lastReadAt = nowIso;
        conversation.unreadCount = 0;
        updateUnreadUi();

        try {
            const { error } = await supabase
                .from("dm_participants")
                .update({ last_read_at: nowIso })
                .eq("conversation_id", conversationId)
                .eq("user_id", currentUserId);
            if (error) throw error;
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
        state.selectedConversationId = conversationId;
        renderThreadsList();
        renderChatHeader();
        setMobileThreadOpen(true);
        void refreshActiveRelationshipState(conversationId);

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
            state.selectedConversationId = state.conversations[0]?.id || null;
            state.activeRelationship = null;
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
                    "Discussion supprimée",
                    "La discussion a été retirée de votre liste.",
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

    async function handleBlockUserAction() {
        const conversation = getSelectedConversation();
        if (!conversation?.otherUserId) return;

        const relationship = await refreshActiveRelationshipState(
            conversation.id,
        );
        if (relationship.blockedByMe) {
            if (window.ToastManager?.info) {
                ToastManager.info(
                    "Utilisateur déjà bloqué",
                    "Débloquez-le depuis Réglages si vous souhaitez reprendre la discussion.",
                );
            }
            return;
        }

        const profile = getConversationDisplayUser(conversation);
        const confirmed = window.confirm(
            `Bloquer ${profile.name || "cet utilisateur"} ? Vous ne pourrez plus échanger de messages tant qu'il restera bloqué.`,
        );
        if (!confirmed) return;

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
            if (window.ToastManager?.success) {
                ToastManager.success(
                    "Utilisateur bloqué",
                    "Il a été ajouté à votre liste de blocage.",
                );
            }
        } catch (error) {
            console.error("Block user error:", error);
            if (window.ToastManager?.error) {
                ToastManager.error(
                    "Blocage impossible",
                    getFriendlyDmErrorMessage(
                        error,
                        "Impossible de bloquer cet utilisateur.",
                    ),
                );
            }
        }
    }

    async function sendCurrentMessage() {
        const currentUserId = getCurrentUserId();
        const conversationId = state.selectedConversationId;
        const input = getChatInput();
        const sendBtn = document.getElementById("chat-send-btn");
        const attachBtn = document.getElementById("chat-attach-btn");
        const pending = getPendingAttachment();

        if (!currentUserId || !conversationId || !input) return;

        const conversation = getSelectedConversation();
        if (!conversation?.otherUserId) return;

        const relationship =
            await refreshActiveRelationshipState(conversationId);
        if (!relationship.canMessage) {
            if (window.ToastManager?.error) {
                ToastManager.error(
                    "Message non envoyé",
                    getDmBlockedMessage(relationship),
                );
            }
            return;
        }

        const originalValue = String(input.value || "");
        const body = originalValue.trim();
        if (!body && !pending?.file) return;

        state.sendingMessage = true;
        if (sendBtn) sendBtn.disabled = true;
        if (attachBtn) attachBtn.disabled = true;
        syncComposerState();

        let uploadedMedia = null;

        try {
            if (pending?.file) {
                if (
                    typeof window.uploadFile !== "function" &&
                    typeof uploadFile !== "function"
                ) {
                    throw new Error("Upload de média indisponible.");
                }

                pending.uploading = true;
                pending.progress = 0;
                renderAttachmentPreview();
                syncComposerState();

                const uploader =
                    typeof window.uploadFile === "function"
                        ? window.uploadFile
                        : uploadFile;
                uploadedMedia = await uploader(
                    pending.file,
                    "dm",
                    (percent) => {
                        const currentPending = getPendingAttachment();
                        if (!currentPending) return;
                        currentPending.progress = Number(percent) || 0;
                        currentPending.uploading = true;
                        renderAttachmentPreview();
                    },
                );

                if (!uploadedMedia?.success || !uploadedMedia?.url) {
                    throw new Error(
                        uploadedMedia?.error ||
                            "Impossible d'uploader le média.",
                    );
                }
            }

            input.value = "";
            autoResizeChatInput();

            const insertPayload = {
                conversation_id: conversationId,
                sender_id: currentUserId,
                body: body || null,
            };
            if (uploadedMedia?.url) {
                insertPayload.media_url = uploadedMedia.url;
                insertPayload.media_type =
                    uploadedMedia.type || pending?.kind || null;
                insertPayload.media_name =
                    pending?.name || pending?.file?.name || null;
                insertPayload.media_size_bytes =
                    pending?.size || pending?.file?.size || null;
            }

            const { data, error } = await runMessageSelect((selectColumns) =>
                supabase
                    .from("dm_messages")
                    .insert(insertPayload)
                    .select(selectColumns)
                    .single(),
            );

            if (
                error &&
                uploadedMedia?.url &&
                (isMissingDmMediaSchemaError(error) ||
                    isLegacyDmMediaConstraintError(error))
            ) {
                throw new Error(
                    "Messagerie média non configurée. Exécutez sql/discovery-phase2-messaging.sql puis réessayez.",
                );
            }
            if (error) throw error;

            if (data) {
                rememberMessageId(data.id);
                const existing =
                    state.messagesByConversation.get(conversationId) || [];
                const alreadyExists = existing.some(
                    (msg) => msg.id === data.id,
                );
                if (!alreadyExists) {
                    const next = [...existing, data];
                    state.messagesByConversation.set(conversationId, next);
                }

                const conversation =
                    state.conversationsById.get(conversationId);
                if (conversation) {
                    conversation.lastMessage = data;
                    conversation.lastMessageAt = data.created_at;
                    conversation.unreadCount = 0;
                    conversation.lastReadAt = new Date().toISOString();
                    sortAndReindexConversations();
                }

                renderChatMessages();
                updateUnreadUi();
                const chat = document.getElementById("chat-messages");
                if (chat) chat.scrollTop = chat.scrollHeight;
            }
            clearPendingAttachment();
        } catch (error) {
            // If offline or transient network error, queue the message for retry
            const offlineError =
                !navigator.onLine ||
                String(error?.message || "")
                    .toLowerCase()
                    .includes("network") ||
                String(error?.message || "")
                    .toLowerCase()
                    .includes("offline");
            if (offlineError) {
                // create a temp id and show the message locally as pending
                const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                const tempMsg = {
                    id: tempId,
                    conversation_id: conversationId,
                    sender_id: currentUserId,
                    body: body || null,
                    media_url: uploadedMedia?.url || null,
                    media_type: uploadedMedia?.type || pending?.kind || null,
                    media_name: pending?.name || pending?.file?.name || null,
                    media_size_bytes:
                        pending?.size || pending?.file?.size || null,
                    created_at: new Date().toISOString(),
                    pending: true,
                };

                const existing =
                    state.messagesByConversation.get(conversationId) || [];
                state.messagesByConversation.set(conversationId, [
                    ...existing,
                    tempMsg,
                ]);
                sortAndReindexConversations();
                updateUnreadUi();
                renderChatMessages();

                // enqueue the DB payload for retry
                try {
                    enqueueOutbox(insertPayload, tempId);
                    if (window.ToastManager?.info) {
                        ToastManager.info(
                            "Message mis en file d'attente",
                            "Le message sera renvoyé automatiquement lorsque la connexion reviendra.",
                        );
                    }
                    clearPendingAttachment();
                    input.value = "";
                    autoResizeChatInput();
                } catch (e) {
                    console.error("Enqueue outbox failed:", e);
                }
            } else {
                if (uploadedMedia?.path && typeof deleteFile === "function") {
                    deleteFile(uploadedMedia.path).catch(() => {});
                }

                console.error("Erreur envoi message:", error);
                input.value = originalValue;
                autoResizeChatInput();
                const currentPending = getPendingAttachment();
                if (currentPending) {
                    currentPending.uploading = false;
                    currentPending.progress = 0;
                    renderAttachmentPreview();
                }
                if (window.ToastManager?.error) {
                    ToastManager.error(
                        "Message non envoyé",
                        getFriendlyDmErrorMessage(
                            error,
                            "Impossible d'envoyer le message.",
                        ),
                    );
                } else {
                    alert(
                        getFriendlyDmErrorMessage(
                            error,
                            "Impossible d'envoyer le message.",
                        ),
                    );
                }
            }
        } finally {
            const currentPending = getPendingAttachment();
            if (currentPending) {
                currentPending.uploading = false;
                if (!Number.isFinite(Number(currentPending.progress))) {
                    currentPending.progress = 0;
                }
                renderAttachmentPreview();
            }
            state.sendingMessage = false;
            if (sendBtn) sendBtn.disabled = false;
            if (attachBtn) attachBtn.disabled = false;
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
                    if (data) {
                        const convId = data.conversation_id;
                        const msgs =
                            state.messagesByConversation.get(convId) || [];
                        const idx = msgs.findIndex(
                            (m) => m.id === entry.tempMessageId,
                        );
                        if (idx !== -1) {
                            msgs[idx] = data;
                        } else {
                            msgs.push(data);
                        }
                        state.messagesByConversation.set(convId, msgs);
                        rememberMessageId(data.id);
                        state.outbox.splice(i, 1);
                        sortAndReindexConversations();
                        updateUnreadUi();
                        renderChatMessages();
                        continue; // don't increment i because array mutated
                    }
                } catch (err) {
                    entry.attempts = (entry.attempts || 0) + 1;
                    entry.lastError = String(err?.message || err || "");
                    if (entry.attempts >= 5) {
                        if (window.ToastManager?.error) {
                            ToastManager.error(
                                "Échec envoi message",
                                "Un message en file d'attente a échoué après plusieurs tentatives.",
                            );
                        }
                        state.outbox.splice(i, 1);
                        continue;
                    }
                    // exponential backoff before next attempt
                    const backoff = Math.min(
                        30000,
                        1000 * Math.pow(2, entry.attempts),
                    );
                    await new Promise((res) => setTimeout(res, backoff));
                    i++;
                }
            }
        } finally {
            state.processingOutbox = false;
        }
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

        if (!state.conversationsById.has(conversationId)) {
            scheduleConversationsRefresh();
        }

        const conversation = state.conversationsById.get(conversationId);
        if (conversation) {
            conversation.lastMessage = normalizedMessage;
            conversation.lastMessageAt = normalizedMessage.created_at;

            if (normalizedMessage.sender_id !== getCurrentUserId()) {
                const isActiveConversation =
                    state.selectedConversationId === conversationId &&
                    isMessagesPageActive();
                if (!isActiveConversation) {
                    conversation.unreadCount =
                        (conversation.unreadCount || 0) + 1;
                }
            }
        }

        const existing = state.messagesByConversation.get(conversationId) || [];
        const alreadyExists = existing.some(
            (msg) => msg.id === normalizedMessage.id,
        );
        if (!alreadyExists) {
            state.messagesByConversation.set(conversationId, [
                ...existing,
                normalizedMessage,
            ]);
        }

        sortAndReindexConversations();
        updateUnreadUi();

        const shouldAutoRead =
            state.selectedConversationId === conversationId &&
            isMessagesPageActive() &&
            !document.hidden;

        if (shouldAutoRead) {
            renderChatMessages();
            if (normalizedMessage.sender_id !== getCurrentUserId()) {
                await markConversationAsRead(conversationId);
            }
        }

        await showIncomingSignal(normalizedMessage);
    }

    function subscribeRealtime() {
        const currentUserId = getCurrentUserId();
        if (!currentUserId || !window.supabase) return;

        if (state.realtimeChannel) {
            supabase.removeChannel(state.realtimeChannel);
            state.realtimeChannel = null;
        }

        state.realtimeChannel = supabase
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
            )
            .subscribe((status) => {
                // On success, reset reconnect attempts and ensure UI is fresh
                if (status === "SUBSCRIBED") {
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

                if (status === "CHANNEL_ERROR" || status === "CLOSED") {
                    state.realtimeReconnectAttempts =
                        (state.realtimeReconnectAttempts || 0) + 1;
                    const delay = Math.min(
                        30000,
                        1000 * Math.pow(2, state.realtimeReconnectAttempts),
                    );
                    setTimeout(() => {
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

    function cleanupRealtime() {
        if (state.realtimeChannel) {
            supabase.removeChannel(state.realtimeChannel);
            state.realtimeChannel = null;
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

        if (state.selectedConversationId) {
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
            clearPendingAttachment();
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
        clearPendingAttachment();
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
        refreshConversations({ preserveSelection: true }).catch((error) => {
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
