// --- ARCS MODULE ---

const ARC_STAGE_OPTIONS = [
    { value: "idee", label: "Idée" },
    { value: "prototype", label: "Prototype" },
    { value: "demo", label: "Démo" },
    { value: "beta", label: "Bêta" },
    { value: "release", label: "Release" },
];

const ARC_STAGE_LABELS = {
    idee: "Idée",
    prototype: "Prototype",
    demo: "Démo",
    beta: "Bêta",
    release: "Release",
};

const ARC_OPPORTUNITY_OPTIONS = [
    { value: "cherche_collab", label: "Cherche collab" },
    { value: "cherche_investissement", label: "Cherche investissement" },
    { value: "open_to_recruit", label: "Open to recruit" },
];

const ARC_OPPORTUNITY_LABELS = {
    cherche_collab: "Cherche collab",
    cherche_investissement: "Cherche investissement",
    open_to_recruit: "Open to recruit",
};

let hookInterval;

const XERA_INSPIRED_ARC_KEY = "xera1-inspired-arc-seed";

function xeraEscapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function xeraToast(type, title, message) {
    const manager = window.ToastManager;
    if (manager && typeof manager[type] === "function") {
        manager[type](title, message);
        return;
    }
    if (message) {
        alert(`${title}\n${message}`);
    } else {
        alert(title);
    }
}

function xeraIsOptionalGrowthSchemaError(error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || "").toLowerCase();
    return (
        code === "42P01" ||
        code === "42703" ||
        msg.includes("schema cache") ||
        msg.includes("could not find") ||
        msg.includes("does not exist") ||
        (msg.includes("relation") && msg.includes("exist"))
    );
}

function xeraMakeToken(prefix = "xera1") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;
}

async function xeraSafeInsert(table, payload, options = {}) {
    if (!window.supabase || !table) return { data: null, skipped: true };
    try {
        let query = supabase.from(table).insert(payload);
        if (options.select) {
            query = query.select(
                options.select === true ? "*" : options.select,
            );
            if (options.single) query = query.single();
            else if (options.maybeSingle) query = query.maybeSingle();
        }
        const { data, error } = await query;
        if (error) throw error;
        return { data, skipped: false };
    } catch (error) {
        if (xeraIsOptionalGrowthSchemaError(error)) {
            console.warn(
                `[XERA1 growth] Optional table not ready: ${table}`,
                error,
            );
            return { data: null, skipped: true, error };
        }
        throw error;
    }
}

async function xeraTrackGrowthEvent(eventType, payload = {}) {
    const actorUserId = window.currentUser?.id || null;
    try {
        await xeraSafeInsert("social_growth_events", {
            event_type: eventType,
            actor_user_id: actorUserId,
            target_user_id: payload.targetUserId || null,
            arc_id: payload.arcId || null,
            content_id: payload.contentId || null,
            metadata: payload.metadata || {},
        });
    } catch (error) {
        console.warn("[XERA1 growth] Event tracking failed:", error);
    }
}

function xeraGetContentId(content) {
    return content?.id || content?.contentId || null;
}

function xeraGetContentTitle(content) {
    return content?.title || "Trace XERA1";
}

function xeraGetContentDescription(content) {
    return content?.description || content?.rawDescription || "";
}

function xeraBuildProfileDeepLink(userId, params = {}) {
    const query = { user: userId, ...params };
    Object.keys(query).forEach((key) => {
        if (
            query[key] === null ||
            query[key] === undefined ||
            query[key] === ""
        ) {
            delete query[key];
        }
    });

    let path = `profile?${new URLSearchParams(query).toString()}`;
    try {
        if (window.XeraRouter?.buildUrl) {
            path = window.XeraRouter.buildUrl("profile", { query });
        }
    } catch (error) {
        // fallback path above
    }

    try {
        return new URL(path, window.location.href).toString();
    } catch (error) {
        return path;
    }
}

function xeraBuildArcShareUrl(arc, content = null, extra = {}) {
    const contentId = xeraGetContentId(content);
    return xeraBuildProfileDeepLink(arc?.user_id || arc?.userId, {
        arc: arc?.id,
        content: contentId,
        ...extra,
    });
}

async function xeraSharePayload(payload) {
    const { title, text, url } = payload;
    if (navigator.share) {
        try {
            await navigator.share({ title, text, url });
            return true;
        } catch (error) {
            console.warn("Share cancelled or failed:", error);
        }
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            xeraToast(
                "success",
                "Lien copié",
                "La preuve est prête à partager.",
            );
            return true;
        }
    } catch (error) {
        console.warn("Clipboard share failed:", error);
    }

    prompt("Copiez ce lien :", url);
    return true;
}

function xeraGetInspiredArcSeed() {
    if (window.pendingInspiredArcSeed) return window.pendingInspiredArcSeed;
    try {
        const raw = localStorage.getItem(XERA_INSPIRED_ARC_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.sourceArcId) return null;
        return parsed;
    } catch (error) {
        return null;
    }
}

function xeraSetInspiredArcSeed(seed) {
    window.pendingInspiredArcSeed = seed || null;
    try {
        if (seed) {
            localStorage.setItem(XERA_INSPIRED_ARC_KEY, JSON.stringify(seed));
        } else {
            localStorage.removeItem(XERA_INSPIRED_ARC_KEY);
        }
    } catch (error) {
        // ignore storage failures
    }
}

function xeraClearInspiredArcSeed() {
    xeraSetInspiredArcSeed(null);
}

function normalizeArcStageLevel(value) {
    const raw = String(value || "")
        .trim()
        .toLowerCase();
    if (raw === "idea") return "idee";
    if (ARC_STAGE_LABELS[raw]) return raw;
    return "idee";
}

function getArcStageLabel(value) {
    return ARC_STAGE_LABELS[normalizeArcStageLevel(value)] || "Idée";
}

function normalizeArcOpportunityIntents(value) {
    const asArray = Array.isArray(value)
        ? value
        : typeof value === "string" && value.trim()
          ? value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
          : [];

    const mapped = asArray
        .map((item) =>
            String(item || "")
                .trim()
                .toLowerCase(),
        )
        .map((item) => {
            if (item === "cherche_collab" || item === "collab")
                return "cherche_collab";
            if (
                item === "cherche_investissement" ||
                item === "investissement" ||
                item === "investor"
            )
                return "cherche_investissement";
            if (
                item === "open_to_recruit" ||
                item === "recruit" ||
                item === "recruiter"
            )
                return "open_to_recruit";
            return null;
        })
        .filter(Boolean);

    return Array.from(new Set(mapped));
}

function getArcOpportunityLabel(value) {
    return ARC_OPPORTUNITY_LABELS[value] || value;
}

function isMissingArcMetadataColumnError(error) {
    const msg = String(error?.message || "").toLowerCase();
    const mentionsMetadataColumn =
        msg.includes("stage_level") || msg.includes("opportunity_intents");
    const mentionsMissingColumn =
        (msg.includes("column") || msg.includes("colonne")) &&
        (msg.includes("does not exist") ||
            msg.includes("n'existe pas") ||
            msg.includes("schema cache") ||
            msg.includes("could not find"));
    return mentionsMetadataColumn && mentionsMissingColumn;
}

// --- INITIALIZATION ---

function renderArcCreationForm(arcToEdit = null) {
    const createContainer = document.querySelector(
        "#create-modal .create-container",
    );
    if (!createContainer) return;

    const isEdit = !!arcToEdit;
    const title = isEdit ? "Modifier votre projet" : "Démarrez votre projet";
    const btnText = isEdit ? "Mettre à jour" : "Lancer le projet";
    const inspiredSeed = !isEdit ? xeraGetInspiredArcSeed() : null;
    const defaultStageLevel = normalizeArcStageLevel(
        isEdit ? arcToEdit.stage_level : inspiredSeed?.stageLevel || "idee",
    );
    const selectedOpportunityIntents = normalizeArcOpportunityIntents(
        isEdit
            ? arcToEdit.opportunity_intents
            : inspiredSeed?.opportunityIntents || [],
    );
    const defaultTitleValue = isEdit
        ? arcToEdit.title
        : inspiredSeed?.title
          ? `Ma version: ${inspiredSeed.title}`
          : "";
    const defaultGoalValue = isEdit
        ? arcToEdit.goal || ""
        : inspiredSeed?.goal || "";
    const defaultDescriptionValue = isEdit
        ? arcToEdit.description || ""
        : inspiredSeed?.description
          ? `Inspiré par "${inspiredSeed.title}".\n\n${inspiredSeed.description}`
          : "";

    // Default dates
    const today = new Date().toISOString().split("T")[0];
    let defaultStartDate = today;
    let defaultEndDate = "";

    if (isEdit) {
        if (arcToEdit.start_date)
            defaultStartDate = arcToEdit.start_date.split("T")[0];
        // Calculate end date based on duration
        if (arcToEdit.start_date && arcToEdit.duration_days) {
            const start = new Date(arcToEdit.start_date);
            const end = new Date(start);
            end.setDate(start.getDate() + arcToEdit.duration_days);
            defaultEndDate = end.toISOString().split("T")[0];
        }
    } else {
        // Default end date +30 days
        const end = new Date();
        end.setDate(end.getDate() + (inspiredSeed?.durationDays || 30));
        defaultEndDate = end.toISOString().split("T")[0];
    }

    createContainer.innerHTML = `
        <div class="arc-create-card">
            <div class="arc-creation-header arc-creation-header-inline">
                <div>
                    <h2>${title}</h2>
                    <p class="arc-create-subtitle">Qu'est-ce qu'un Projet ? Un conteneur d'objectifs reliant vos mises à jour quotidiennes à votre résultat.</p>
                </div>
                <button type="button" class="cover-action" onclick="document.getElementById('arc-cover-file').click()">Ajouter une couverture</button>
            </div>

            <form id="create-arc-form" class="arc-form">
                ${isEdit ? `<input type="hidden" name="arc_id" value="${arcToEdit.id}">` : ""}

                <div class="form-group form-group-title">
                    <label for="arc-title">Titre de votre projet *</label>
                    <input type="text" id="arc-title" name="title" placeholder="Ex: 30 jours pour..." required class="form-input large-input" value="${xeraEscapeHtml(defaultTitleValue)}">
                </div>

                <div class="form-group form-group-inline">
                    <div class="mini-field">
                        <label for="arc-goal">Objectif final *</label>
                        <textarea id="arc-goal" name="goal" placeholder="Ex: Site en ligne le 1er mars" rows="2" class="form-input" required>${xeraEscapeHtml(defaultGoalValue)}</textarea>
                    </div>
                    <div class="mini-field">
                        <label for="arc-stage-level">Niveau du projet</label>
                        <select id="arc-stage-level" name="stage_level" class="form-input">
                            ${ARC_STAGE_OPTIONS.map((item) => `<option value="${item.value}" ${defaultStageLevel === item.value ? "selected" : ""}>${item.label}</option>`).join("")}
                        </select>
                    </div>
                </div>

                ${
                    inspiredSeed
                        ? `<div class="xera1-growth-seed">
                            <strong>ARC inspiré</strong>
                            <span>Cette base vient d'une trajectoire existante. Ajustez-la pour construire votre version.</span>
                        </div>`
                        : ""
                }

                <div class="form-group">
                    <label for="arc-description">Description</label>
                    <textarea id="arc-description" name="description" placeholder="Détails supplémentaires..." rows="5" class="form-input large-textarea">${xeraEscapeHtml(defaultDescriptionValue)}</textarea>
                </div>

                <div class="form-group">
                    <label>Matching opportunité (optionnel)</label>
                    <div class="arc-intent-grid">
                        ${ARC_OPPORTUNITY_OPTIONS.map(
                            (item) => `
                            <label class="arc-intent-item">
                                <input
                                    type="checkbox"
                                    name="opportunity_intents"
                                    value="${item.value}"
                                    ${selectedOpportunityIntents.includes(item.value) ? "checked" : ""}
                                >
                                <span>${item.label}</span>
                            </label>
                        `,
                        ).join("")}
                    </div>
                    <p class="form-hint">Laissez vide pour un partage public sans ciblage spécifique.</p>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="arc-start-date">Date de début *</label>
                        <input type="date" id="arc-start-date" name="start_date" class="form-input" value="${defaultStartDate}" required>
                    </div>
                    <div class="form-group">
                        <label for="arc-end-date">Date de fin *</label>
                        <input type="date" id="arc-end-date" name="end_date" class="form-input" value="${defaultEndDate}" required>
                    </div>
                </div>

                <div class="form-group">
                    <label>Couverture du projet</label>
                    <div id="arc-cover-upload-container" class="media-upload-card">
                        <div class="upload-zone" id="arc-cover-dropzone">
                            <div id="arc-cover-preview-container" class="media-preview" style="${isEdit && arcToEdit.media_url ? "display: block;" : "display: none;"}">
                                ${isEdit && arcToEdit.media_url ? (arcToEdit.media_type === "video" ? `<video src="${arcToEdit.media_url}" controls class="media-preview-video"></video>` : `<img src="${arcToEdit.media_url}" class="media-preview-image">`) : ""}
                            </div>
                            <div id="arc-cover-loader" class="upload-status" style="display: none;">
                                <div class="loading-spinner"></div>
                                <p>Upload en cours...</p>
                                <div class="xera1-upload-progress">
                                    <div id="arc-cover-progress-bar" class="xera1-upload-progress-bar is-indeterminate"></div>
                                </div>
                                <div id="arc-cover-progress-label" class="xera1-upload-progress-label"></div>
                            </div>
                            <div id="arc-cover-placeholder" class="upload-placeholder" style="${isEdit && arcToEdit.media_url ? "display: none;" : ""}">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="17 8 12 3 7 8"></polyline>
                                    <line x1="12" y1="3" x2="12" y2="15"></line>
                                </svg>
                                <p>Cliquer ou glisser une couverture</p>
                                <p class="form-hint">JPG, PNG, GIF, MP4</p>
                            </div>
                        </div>
                        <input type="file" id="arc-cover-file" accept="image/*,video/*" style="display: none;">
                        <input type="hidden" name="media_url" id="arc-media-url" value="${isEdit && arcToEdit.media_url ? arcToEdit.media_url : ""}">
                        <input type="hidden" name="media_type" id="arc-media-type" value="${isEdit && arcToEdit.media_type ? arcToEdit.media_type : ""}">
                    </div>
                </div>

                <div class="form-actions form-actions-compact">
                    <div class="footer-chip-row">
                        <span class="footer-chip">Statut: ${defaultStageLevel}</span>
                        <span class="footer-chip">Début: ${defaultStartDate}</span>
                        <span class="footer-chip">Fin: ${defaultEndDate}</span>
                    </div>
                    <div class="form-buttons-right">
                        <button type="button" class="btn btn-ghost btn-large" onclick="closeCreateModal()">Annuler</button>
                        <button type="submit" class="btn btn-primary btn-large">${btnText}</button>
                    </div>
                </div>
            </form>
        </div>
    `;

    // Attach event listener
    document
        .getElementById("create-arc-form")
        .addEventListener("submit", handleCreateArc);

    // Initialize file upload
    if (typeof initializeFileInput === "function") {
        const dropZone = document.getElementById("arc-cover-dropzone");
        const fileInput = document.getElementById("arc-cover-file");
        const previewContainer = document.getElementById(
            "arc-cover-preview-container",
        );
        const placeholder = document.getElementById("arc-cover-placeholder");
        const loader = document.getElementById("arc-cover-loader");
        const progressBar = document.getElementById("arc-cover-progress-bar");
        const progressLabel = document.getElementById(
            "arc-cover-progress-label",
        );

        const setUploadProgressIndeterminate = () => {
            if (progressBar) {
                progressBar.classList.add("is-indeterminate");
                progressBar.style.width = "";
            }
            if (progressLabel) progressLabel.textContent = "";
        };

        const setUploadProgress = (percent) => {
            if (!progressBar) return;
            const safePercent =
                typeof percent === "number" && Number.isFinite(percent)
                    ? Math.max(0, Math.min(100, Math.round(percent)))
                    : 0;
            progressBar.classList.remove("is-indeterminate");
            progressBar.style.width = `${safePercent}%`;
            if (progressLabel) progressLabel.textContent = `${safePercent}%`;
        };

        if (dropZone && fileInput) {
            // Handle click
            dropZone.addEventListener("click", (e) => {
                if (
                    e.target.tagName !== "IMG" &&
                    e.target.tagName !== "VIDEO"
                ) {
                    fileInput.click();
                }
            });

            // Loader handler
            fileInput.addEventListener("change", () => {
                if (fileInput.files.length > 0) {
                    placeholder.style.display = "none";
                    previewContainer.style.display = "none";
                    loader.style.display = "block";
                    setUploadProgress(0);
                }
            });

            initializeFileInput("arc-cover-file", {
                dropZone: dropZone,
                compress: true,
                onBeforeUpload: () => {
                    placeholder.style.display = "none";
                    previewContainer.style.display = "none";
                    loader.style.display = "block";
                    setUploadProgress(0);
                },
                onProgress: (percent) => setUploadProgress(percent),
                onUpload: (result) => {
                    loader.style.display = "none";
                    if (result && result.success) {
                        setUploadProgress(100);
                    }
                    setUploadProgressIndeterminate();

                    if (result.success) {
                        document.getElementById("arc-media-url").value =
                            result.url;
                        document.getElementById("arc-media-type").value =
                            result.type;

                        // Preview
                        previewContainer.style.display = "block";
                        if (result.type === "image") {
                            previewContainer.innerHTML = `<img src="${result.url}" style="max-width: 100%; max-height: 200px; border-radius: 8px;">`;
                        } else {
                            previewContainer.innerHTML = `<video src="${result.previewUrl || result.url}" controls style="max-width: 100%; max-height: 200px; border-radius: 8px;"></video>`;
                        }
                    } else {
                        placeholder.style.display = "block";
                        alert("Erreur upload: " + result.error);
                    }
                },
            });
        }
    }
}

function initArcs() {
    // Ne rien pré-rendre ici.
    // Le formulaire est injecté uniquement quand l'utilisateur ouvre la modale.
}

// --- HOOKS ANIMATION ---

function startHookAnimation() {
    const scroller = document.getElementById("hook-scroller");
    if (!scroller) return;

    // Clear existing
    scroller.innerHTML = "";

    let currentIndex = 0;

    // Shuffle hooks slightly or just pick random start
    const shuffledHooks = [...ARC_HOOKS].sort(() => 0.5 - Math.random());

    function showNextHook() {
        const text = shuffledHooks[currentIndex];
        const el = document.createElement("div");
        el.className = "hook-item";
        el.textContent = `"${text}"`;
        scroller.appendChild(el);

        // Trigger enter animation
        requestAnimationFrame(() => {
            el.classList.add("active");
        });

        // Schedule exit
        setTimeout(() => {
            el.classList.remove("active");
            el.classList.add("exit");
            setTimeout(() => el.remove(), 500); // Remove after transition
        }, 3000);

        currentIndex = (currentIndex + 1) % shuffledHooks.length;
    }

    showNextHook();
    hookInterval = setInterval(showNextHook, 3500);
}

function stopHookAnimation() {
    if (hookInterval) {
        clearInterval(hookInterval);
        hookInterval = null;
    }
}

// --- MODAL CONTROL ---

function openCreateModal() {
    // Ensure form is rendered (reset to create mode)
    renderArcCreationForm();

    const modal = document.getElementById("create-modal");
    if (modal) {
        modal.classList.add("active");
        startHookAnimation();
    }
}

// Exposer la fonction globalement pour les onclick
window.openCreateModal = openCreateModal;

function openEditArcModal(arc) {
    if (!arc || !arc.id) {
        alert("Impossible d'ouvrir la modification de ce projet.");
        return;
    }
    renderArcCreationForm(arc);
    const modal = document.getElementById("create-modal");
    if (modal) {
        modal.classList.add("active");
        // No hooks animation for edit
    }
}

function openArcEditFromDetails() {
    const arcToEdit = window.currentArc;
    if (!arcToEdit || !arcToEdit.id) {
        alert("Impossible de charger ce projet pour modification.");
        return;
    }

    if (typeof window.closeImmersive === "function") {
        window.closeImmersive();
    } else {
        const overlay = document.getElementById("immersive-overlay");
        if (overlay) overlay.style.display = "none";
        document.body.style.overflow = "auto";
    }

    setTimeout(() => {
        openEditArcModal(arcToEdit);
    }, 80);
}

function closeCreateModal() {
    const modal = document.getElementById("create-modal");
    if (modal) {
        modal.classList.remove("active");
        stopHookAnimation();
    }
}

// Close modal when clicking outside
document.getElementById("create-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "create-modal") {
        closeCreateModal();
    }
});

// --- SUPABASE ACTIONS ---

async function getArcAuthUser() {
    if (window.currentUser && window.currentUser.id) return window.currentUser;
    if (window.currentUserId) {
        return { id: window.currentUserId };
    }
    try {
        if (typeof supabase?.auth?.getUser === "function") {
            const { data, error } = await supabase.auth.getUser();
            if (!error && data?.user) {
                window.currentUser = data.user;
                window.currentUserId = data.user.id;
                return data.user;
            }
        }
        if (typeof supabase?.auth?.getSession === "function") {
            const { data, error } = await supabase.auth.getSession();
            if (!error && data?.session?.user) {
                window.currentUser = data.session.user;
                window.currentUserId = data.session.user.id;
                return data.session.user;
            }
        }
    } catch (e) {
        // ignore
    }
    return null;
}

function buildArcLaunchTracePayload(arcData, authUserId, arcId) {
    const safeTitle = (arcData?.title || "").trim() || "Nouvel ARC";
    const goal = (arcData?.goal || "").trim();
    const details = (arcData?.description || "").trim();
    const descriptionParts = [];
    if (goal) descriptionParts.push(`Objectif: ${goal}`);
    if (details) descriptionParts.push(details);
    const baseDescription =
        descriptionParts.join("\n\n").trim() || "Début d'un nouveau projet.";

    const hasMedia = !!arcData?.media_url;
    const mediaType = String(arcData?.media_type || "").toLowerCase();
    const contentType = hasMedia
        ? mediaType === "video"
            ? "video"
            : "image"
        : "text";

    return {
        userId: authUserId,
        arcId: arcId,
        pageId: arcData?.page_id || null,
        dayNumber: 0,
        type: contentType,
        state: "pause",
        title: `NOUVEAU PROJET: ${safeTitle}`,
        description: baseDescription,
        mediaUrl: hasMedia ? arcData.media_url : null,
        mediaUrls: hasMedia ? [arcData.media_url] : [],
    };
}

async function createArcLaunchTrace(arcRow, arcData, authUser) {
    if (!arcRow?.id || !authUser?.id) return null;
    const payload = buildArcLaunchTracePayload(arcData, authUser.id, arcRow.id);
    try {
        if (typeof createContent === "function") {
            const result = await createContent(payload);
            if (!result?.success) {
                throw new Error(result?.error || "createContent failed");
            }
            return result?.data || null;
        }

        const insertPayload = {
            user_id: payload.userId,
            arc_id: payload.arcId,
            page_id: payload.pageId,
            day_number: payload.dayNumber,
            type: payload.type,
            state: payload.state,
            title: payload.title,
            description: payload.description,
            media_url: payload.mediaUrl,
        };

        const { data, error } = await supabase
            .from("content")
            .insert(insertPayload)
            .select()
            .single();
        if (error) throw error;
        return data || null;
    } catch (error) {
        console.warn("ARC launch update creation failed:", error);
        return null;
    }
}

async function refreshArcConsistencyViews(userId, options = {}) {
    if (!userId) return;
    const { selectArcId = null } = options;

    try {
        if (
            typeof getUserContent === "function" &&
            typeof convertSupabaseContent === "function"
        ) {
            const contentResult = await getUserContent(userId);
            if (contentResult?.success && Array.isArray(contentResult.data)) {
                if (!window.userContents) window.userContents = {};
                window.userContents[userId] = contentResult.data.map(
                    convertSupabaseContent,
                );
            }
        }
    } catch (error) {
        console.warn(
            "Failed to refresh local content cache after ARC save:",
            error,
        );
    }

    const profileSection = document.getElementById("profile");
    const isProfileActive =
        !!profileSection && profileSection.classList.contains("active");
    const isViewedProfile = window.currentProfileViewed === userId;

    if (selectArcId && (isProfileActive || isViewedProfile)) {
        window.selectedArcId = selectArcId;
    }

    if (
        (isProfileActive || isViewedProfile) &&
        typeof window.renderProfileIntoContainer === "function"
    ) {
        try {
            await window.renderProfileIntoContainer(userId);
        } catch (error) {
            console.warn(
                "Failed to refresh profile timeline after ARC save:",
                error,
            );
        }
    } else if (isProfileActive && typeof window.loadUserArcs === "function") {
        try {
            await window.loadUserArcs(userId);
        } catch (error) {
            console.warn("Failed to refresh ARC list after ARC save:", error);
        }
    }

    if (typeof window.renderDiscoverGrid === "function") {
        try {
            await window.renderDiscoverGrid();
        } catch (error) {
            console.warn(
                "Failed to refresh discover feed after ARC save:",
                error,
            );
        }
    }
}

async function handleCreateArc(e) {
    e.preventDefault();

    if (typeof ensureOnlineOrNotify === "function") {
        const okOnline = await ensureOnlineOrNotify();
        if (!okOnline) return;
    }
    if (typeof ensureFreshSupabaseSession === "function") {
        const sessionCheck = await ensureFreshSupabaseSession();
        if (!sessionCheck.ok) {
            console.warn("Session refresh failed", sessionCheck.error);
        }
    }

    const authUser = await getArcAuthUser();
    if (!authUser) {
        alert("Vous devez être connecté pour créer un projet.");
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span> Traitement...';

    const formData = new FormData(e.target);
    const arcId = formData.get("arc_id"); // If editing
    const inspiredSeed = !arcId ? xeraGetInspiredArcSeed() : null;

    // Calculate duration from dates
    const startDateVal = formData.get("start_date");
    const endDateVal = formData.get("end_date");
    let durationDays = 30; // Default

    if (startDateVal && endDateVal) {
        const start = new Date(startDateVal);
        const end = new Date(endDateVal);
        const diffTime = end - start;
        durationDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (durationDays < 1) durationDays = 1;
    }

    const selectedOpportunityIntents = normalizeArcOpportunityIntents(
        formData.getAll("opportunity_intents"),
    );

    const arcData = {
        title: formData.get("title"),
        goal: formData.get("goal"),
        description: formData.get("description"),
        stage_level: normalizeArcStageLevel(formData.get("stage_level")),
        opportunity_intents:
            selectedOpportunityIntents.length > 0
                ? selectedOpportunityIntents
                : [],
        duration_days: durationDays,
        start_date: startDateVal || new Date().toISOString(),
        media_url: formData.get("media_url") || null,
        media_type: formData.get("media_type") || null,
    };

    // Only set user_id and status on creation
    if (!arcId) {
        const resolvedUserId = authUser?.id || window.currentUserId || null;
        if (!resolvedUserId) {
            throw new Error(
                "Impossible de déterminer l'utilisateur connecté pour la création de l'ARC.",
            );
        }

        // Ensure the authenticated user has a public profile row before inserting into arcs.
        if (typeof ensureUserProfile === "function") {
            const profile = await ensureUserProfile(authUser);
            if (!profile) {
                throw new Error(
                    "Impossible de créer l\'ARC car le profil utilisateur public est manquant.",
                );
            }
        }

        arcData.user_id = resolvedUserId;
        arcData.status = "in_progress";
        // Handle Organizational ARC
        if (window._pendingPageIdForArc) {
            arcData.page_id = window._pendingPageIdForArc;
            window._pendingPageIdForArc = null;
        }
    }

    try {
        let error;
        let createdArc = null;

        const persistArc = async (payload) => {
            if (arcId) {
                const { error: updateError } = await supabase
                    .from("arcs")
                    .update(payload)
                    .eq("id", arcId);
                return { error: updateError, data: null };
            }
            const { data: insertedArc, error: insertError } = await supabase
                .from("arcs")
                .insert([payload])
                .select("id")
                .single();
            return { error: insertError, data: insertedArc || null };
        };

        let persistResult = await persistArc(arcData);
        error = persistResult.error;
        createdArc = persistResult.data;

        if (error && isMissingArcMetadataColumnError(error)) {
            // Compatibilité: si la DB n'a pas encore les nouvelles colonnes,
            // on retente sans métadonnées pour ne pas bloquer la création d'ARC.
            const fallbackArcData = {
                ...arcData,
            };
            delete fallbackArcData.stage_level;
            delete fallbackArcData.opportunity_intents;
            persistResult = await persistArc(fallbackArcData);
            error = persistResult.error;
            createdArc = persistResult.data || createdArc;
        }

        if (
            error &&
            typeof ensureUserProfile === "function" &&
            error?.message &&
            error.message.toLowerCase().includes("foreign key")
        ) {
            console.warn(
                "Arc insert failed with foreign key error, ensuring user profile exists and retrying...",
                error,
            );
            await ensureUserProfile(authUser);
            persistResult = await persistArc(arcData);
            error = persistResult.error;
            createdArc = persistResult.data || createdArc;
        }

        if (error) throw error;

        if (!arcId && createdArc && createdArc.id) {
            await createArcLaunchTrace(createdArc, arcData, authUser);
            if (inspiredSeed?.sourceArcId) {
                await recordArcInspiration(
                    inspiredSeed.sourceArcId,
                    createdArc.id,
                    authUser.id,
                    inspiredSeed.sourceOwnerId,
                );
                xeraClearInspiredArcSeed();
            }
        }

        const pendingPayload = window.pendingCreatePostAfterArc;
        const pendingIsFresh =
            pendingPayload &&
            (!pendingPayload.createdAt ||
                Date.now() - pendingPayload.createdAt < 15 * 60 * 1000);
        const pendingCreatePost =
            !arcId &&
            createdArc &&
            createdArc.id &&
            pendingPayload &&
            pendingPayload.userId === authUser.id &&
            pendingIsFresh;

        if (pendingCreatePost && typeof window.openCreateMenu === "function") {
            if (typeof window.clearPendingCreatePostAfterArc === "function") {
                window.clearPendingCreatePostAfterArc();
            } else {
                window.pendingCreatePostAfterArc = null;
            }
            refreshArcConsistencyViews(authUser.id, {
                selectArcId: createdArc.id,
            }).catch((err) =>
                console.warn("refreshArcConsistencyViews error", err),
            );
            closeCreateModal();
            e.target.reset();
            setTimeout(() => {
                window.openCreateMenu(authUser.id, createdArc.id);
            }, 120);
            return;
        }

        if (
            !arcId &&
            createdArc &&
            createdArc.id &&
            typeof notifyFollowersOfArcStart === "function"
        ) {
            notifyFollowersOfArcStart({
                id: createdArc.id,
                user_id: authUser.id,
                title: arcData.title,
            }).catch((e) => console.warn("notifyFollowersOfArcStart error", e));
        }

        alert(
            arcId
                ? "Projet mis à jour avec succès !"
                : "Projet créé avec succès !",
        );
        closeCreateModal();

        if (!arcId && window.XeraNudgeManager) {
            window.XeraNudgeManager.triggerAfterArcCreation(
                authUser.id,
                arcData.title,
            );
        }

        e.target.reset();

        await refreshArcConsistencyViews(authUser.id, {
            selectArcId: !arcId && createdArc?.id ? createdArc.id : null,
        });

        // If we were viewing details of this arc, reload them
        if (
            arcId &&
            document.getElementById("immersive-overlay").style.display ===
                "block"
        ) {
            openArcDetails(arcId);
        }
    } catch (error) {
        console.error("Error saving ARC:", error);
        const msg = error?.message || String(error || "");
        const code = error?.code ? ` (${error.code})` : "";
        alert(`Erreur lors de l'enregistrement du projet${code}: ${msg}`);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function loadUserArcs(userId) {
    const container = document.querySelector(".profile-container");
    if (!container) return;

    // Check if arcs section already exists
    let arcsSection = document.getElementById("user-arcs-section");
    if (!arcsSection) {
        arcsSection = document.createElement("div");
        arcsSection.id = "user-arcs-section";
        arcsSection.className = "arcs-section";
        // Insert after profile hero (banner/avatar) but before timeline
        const timeline = document.querySelector(".timeline");
        if (timeline && timeline.parentNode === container) {
            container.insertBefore(arcsSection, timeline);
        } else {
            container.appendChild(arcsSection);
        }
    }

    try {
        const { data: ownedArcs, error } = await supabase
            .from("arcs")
            .select("*")
            .eq("user_id", userId)
            .is("page_id", null)
            .order("created_at", { ascending: false });

        if (error) throw error;

        let collaboratorArcs = [];
        try {
            if (typeof window.fetchCollaboratorArcs === "function") {
                collaboratorArcs = await window.fetchCollaboratorArcs(userId);
            } else {
                const { data: collabRows } = await supabase
                    .from("arc_collaborations")
                    .select("arc_id")
                    .eq("collaborator_id", userId)
                    .eq("status", "accepted");
                const collabArcIds = Array.from(
                    new Set(
                        (collabRows || []).map((r) => r.arc_id).filter(Boolean),
                    ),
                );
                if (collabArcIds.length > 0) {
                    const { data: collabArcsData } = await supabase
                        .from("arcs")
                        .select("*")
                        .in("id", collabArcIds)
                        .order("created_at", { ascending: false });
                    collaboratorArcs = collabArcsData || [];
                }
            }
        } catch (collabError) {
            console.error("Error loading collaborative ARCs:", collabError);
        }

        const arcMap = new Map();
        (ownedArcs || []).forEach((arc) =>
            arcMap.set(arc.id, { ...arc, _collabRole: "owner" }),
        );
        (collaboratorArcs || []).forEach((arc) => {
            if (!arcMap.has(arc.id)) {
                arcMap.set(arc.id, { ...arc, _collabRole: "collaborator" });
            }
        });
        const arcs = Array.from(arcMap.values());

        let viewerStatusMap = new Map();
        try {
            const viewerId = window.currentUser?.id;
            if (viewerId && arcs.length > 0) {
                if (typeof window.fetchArcCollabStatusMap === "function") {
                    viewerStatusMap = await window.fetchArcCollabStatusMap(
                        arcs.map((a) => a.id),
                        viewerId,
                    );
                } else {
                    const { data: statusRows } = await supabase
                        .from("arc_collaborations")
                        .select("arc_id, status")
                        .eq("collaborator_id", viewerId)
                        .in(
                            "arc_id",
                            arcs.map((a) => a.id),
                        );
                    (statusRows || []).forEach((row) => {
                        if (row?.arc_id)
                            viewerStatusMap.set(row.arc_id, row.status);
                    });
                }
            }
        } catch (statusError) {
            console.error(
                "Error loading ARC collaboration status:",
                statusError,
            );
        }

        let progressMap = new Map();
        try {
            const arcIds = arcs.map((a) => a.id).filter(Boolean);
            if (arcIds.length > 0) {
                const { data: contentRows, error: contentError } =
                    await supabase
                        .from("content")
                        .select("arc_id, day_number, is_deleted")
                        .in("arc_id", arcIds);
                if (contentError) throw contentError;
                const isSuper =
                    typeof window.isSuperAdmin === "function"
                        ? window.isSuperAdmin()
                        : false;
                const daysByArc = new Map();
                (contentRows || []).forEach((row) => {
                    if (!row?.arc_id) return;
                    if (!isSuper && row.is_deleted) return;
                    const key = row.arc_id;
                    if (!daysByArc.has(key)) daysByArc.set(key, new Set());
                    if (
                        row.day_number !== null &&
                        row.day_number !== undefined
                    ) {
                        daysByArc.get(key).add(row.day_number);
                    }
                });
                daysByArc.forEach((set, arcId) => {
                    progressMap.set(arcId, set.size);
                });
            }
        } catch (progressError) {
            console.error("Error computing ARC progress:", progressError);
        }

        if (arcs && arcs.length > 0) {
            arcsSection.innerHTML = `
                <h3 class="section-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                    Projets en cours
                </h3>
                <div class="arcs-grid">
                    ${arcs
                        .map((arc) => {
                            const progressDays = progressMap.get(arc.id) || 0;
                            return createArcCard(
                                { ...arc, _progressDays: progressDays },
                                {
                                    viewerStatus: viewerStatusMap.get(arc.id),
                                    completedDays: progressDays,
                                },
                            );
                        })
                        .join("")}
                </div>
            `;
        } else {
            arcsSection.innerHTML = ""; // Hide if no arcs
        }
    } catch (error) {
        console.error("Error loading ARCs:", error);
    }
}

function createArcCard(arc, options = {}) {
    const progress = calculateArcProgress(arc, {
        completedDays: options.completedDays,
    });
    const statusLabels = {
        in_progress: "En cours",
        completed: "Terminé",
        abandoned: "Abandonné",
    };
    const stageLabel = getArcStageLabel(arc.stage_level);
    const opportunityIntents = normalizeArcOpportunityIntents(
        arc.opportunity_intents,
    );
    const opportunitySummary = opportunityIntents.length
        ? opportunityIntents.slice(0, 2).map(getArcOpportunityLabel).join(" • ")
        : "Public";
    const opportunityOverflow =
        opportunityIntents.length > 2
            ? ` +${opportunityIntents.length - 2}`
            : "";

    // Custom style for cover
    let styleAttr = "";
    let overlayClass = "";

    if (arc.media_url && arc.media_type === "image") {
        styleAttr = `style="background-image: url('${arc.media_url}'); background-size: cover; background-position: center;"`;
        overlayClass = "arc-card-has-cover";
    }

    const viewerId = window.currentUser?.id;
    const viewerStatus = options.viewerStatus;
    const canCollaborate = viewerId && viewerId !== arc.user_id;
    const collabBadgeHtml =
        arc._collabRole === "collaborator"
            ? `<div style="margin-top:0.4rem; font-size:0.75rem; color: var(--text-secondary);">Collaboration</div>`
            : "";
    const ownerLabelHtml =
        arc._collabRole === "collaborator" && arc.users?.name
            ? `<div style="margin-top:0.25rem; font-size:0.75rem; color: var(--text-secondary);">Par ${escapeHtml(arc.users.name)}</div>`
            : "";
    let collabActionHtml = "";
    if (canCollaborate) {
        if (viewerStatus === "pending") {
            collabActionHtml = `<div style="margin-top:0.75rem; font-size:0.75rem; color: var(--text-secondary);">Demande envoyée</div>`;
        } else if (viewerStatus === "accepted") {
            collabActionHtml = `
                <button onclick="event.stopPropagation(); window.leaveArcCollaboration ? window.leaveArcCollaboration('${arc.id}') : alert('Action indisponible');" class="btn btn-ghost" style="margin-top:0.75rem; width:100%; color: var(--failure); border-color: var(--failure);">
                    Quitter la collaboration
                </button>
            `;
        } else {
            collabActionHtml = `
                <button onclick="event.stopPropagation(); window.requestArcCollaboration ? window.requestArcCollaboration('${arc.id}', '${arc.user_id}') : alert('Action indisponible');" class="btn btn-ghost btn-collaborate" style="margin-top:0.75rem; width:100%;">
                    Collaborer
                </button>
            `;
        }
    }

    return `
        <div class="arc-card ${overlayClass}" onclick="openArcDetails('${arc.id}')" ${styleAttr}>
            <div class="arc-card-overlay"></div>
            <div class="arc-content-wrapper" style="position:relative; z-index:2;">
                <div class="arc-status-badge arc-status-${arc.status}">
                    ${statusLabels[arc.status] || arc.status}
                </div>
                <h4 class="arc-title" style="text-shadow: 0 2px 4px rgba(0,0,0,0.5);">${escapeHtml(arc.title)}</h4>
                <p class="arc-goal" style="text-shadow: 0 1px 2px rgba(0,0,0,0.5);">${escapeHtml(arc.goal || "")}</p>
                <div class="arc-classification">
                    <span class="arc-chip arc-chip-level">${stageLabel}</span>
                    <span class="arc-chip arc-chip-opportunity">${escapeHtml(opportunitySummary)}${opportunityOverflow}</span>
                </div>
                ${collabBadgeHtml}
                ${ownerLabelHtml}
                
                <div class="arc-progress-container">
                    <div class="arc-progress-bar" style="background:rgba(255,255,255,0.2);">
                        <div class="arc-progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="arc-meta" style="text-shadow: 0 1px 2px rgba(0,0,0,0.5);">
                        <span>J${calculateDaysSince(arc.start_date)} / ${arc.duration_days || "?"}</span>
                        <span>${progress}%</span>
                    </div>
                </div>
                ${collabActionHtml}
            </div>
        </div>
    `;
}

function calculateDaysSince(startDate) {
    if (!startDate) return 0;
    const start = new Date(startDate);
    const now = new Date();
    if (now < start) return 0;
    const diffTime = Math.abs(now - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

function calculateArcProgress(arc, options = {}) {
    if (!arc || !arc.duration_days) return 0;
    const completedDays =
        typeof options.completedDays === "number"
            ? options.completedDays
            : typeof arc._progressDays === "number"
              ? arc._progressDays
              : 0;
    const safeCompleted = Math.max(0, completedDays);
    const progress = Math.min(
        100,
        Math.round((safeCompleted / arc.duration_days) * 100),
    );
    return progress;
}

function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&")
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/"/g, '"')
        .replace(/'/g, "&#039;");
}

async function fetchArcAndContentForGrowth(arcId, contentId = null) {
    let arc =
        window.currentArc && window.currentArc.id === arcId
            ? window.currentArc
            : null;
    let content = null;

    if (!arc && window.supabase) {
        const { data, error } = await supabase
            .from("arcs")
            .select("*, users(name, avatar)")
            .eq("id", arcId)
            .maybeSingle();
        if (error) throw error;
        arc = data || null;
    }

    if (contentId && window.supabase) {
        const { data, error } = await supabase
            .from("content")
            .select("*")
            .eq("id", contentId)
            .maybeSingle();
        if (error) throw error;
        content = data || null;
    } else if (arcId && window.supabase) {
        const { data, error } = await supabase
            .from("content")
            .select("*")
            .eq("arc_id", arcId)
            .order("created_at", { ascending: false })
            .limit(1);
        if (error) throw error;
        content = data?.[0] || null;
    }

    return { arc, content };
}

async function ensureProofCard(arc, content = null) {
    if (!arc?.id) return null;
    const contentId = xeraGetContentId(content);
    const slug = contentId
        ? `proof-${contentId.slice(0, 8)}`
        : `arc-${arc.id.slice(0, 8)}`;
    const payload = {
        arc_id: arc.id,
        content_id: contentId,
        created_by: arc.user_id,
        slug,
        title_snapshot: content ? xeraGetContentTitle(content) : arc.title,
        excerpt_snapshot: (content
            ? xeraGetContentDescription(content)
            : arc.goal || arc.description || ""
        ).slice(0, 280),
    };

    if (!window.supabase || window.currentUser?.id !== arc.user_id) {
        return { slug, ...payload };
    }

    try {
        let query = supabase
            .from("proof_cards")
            .upsert(payload, { onConflict: "arc_id,content_id" })
            .select()
            .maybeSingle();
        const { data, error } = await query;
        if (error) throw error;
        return data || { slug, ...payload };
    } catch (error) {
        if (xeraIsOptionalGrowthSchemaError(error)) {
            console.warn("[XERA1 growth] proof_cards not ready:", error);
            return { slug, ...payload };
        }
        throw error;
    }
}

async function incrementProofCardShare(arcId, contentId) {
    if (!window.supabase || !arcId) return;
    try {
        let query = supabase
            .from("proof_cards")
            .select("id, share_count")
            .eq("arc_id", arcId);
        query = contentId
            ? query.eq("content_id", contentId)
            : query.is("content_id", null);
        const { data, error } = await query.limit(1).maybeSingle();
        if (error) throw error;
        if (!data?.id) return;
        await supabase
            .from("proof_cards")
            .update({ share_count: Number(data.share_count || 0) + 1 })
            .eq("id", data.id);
    } catch (error) {
        if (!xeraIsOptionalGrowthSchemaError(error)) {
            console.warn("[XERA1 growth] share counter failed:", error);
        }
    }
}

function renderProofCardMarkup(arc, content) {
    const progress = calculateArcProgress(arc);
    const dayLabel =
        content?.day_number !== undefined && content?.day_number !== null
            ? `Jour ${content.day_number}`
            : `J${calculateDaysSince(arc.start_date)}`;
    const description = xeraGetContentDescription(content) || arc.goal || "";
    const author = arc.users?.name || "Builder XERA1";
    const mediaUrl = content?.media_url || arc.media_url;
    const mediaHtml = mediaUrl
        ? `<div class="xera1-proof-media" style="background-image:url('${xeraEscapeHtml(mediaUrl)}')"></div>`
        : "";

    return `
        <div class="xera1-proof-card">
            ${mediaHtml}
            <div class="xera1-proof-topline">
                <span>${xeraEscapeHtml(dayLabel)}</span>
                <span>${progress}%</span>
            </div>
            <h3>${xeraEscapeHtml(xeraGetContentTitle(content) || arc.title)}</h3>
            <p>${xeraEscapeHtml(description).slice(0, 260)}</p>
            <div class="xera1-proof-footer">
                <strong>${xeraEscapeHtml(arc.title || "ARC")}</strong>
                <span>par ${xeraEscapeHtml(author)}</span>
            </div>
        </div>
    `;
}

async function openProofCardModal(arcId, contentId = null) {
    try {
        const { arc, content } = await fetchArcAndContentForGrowth(
            arcId,
            contentId,
        );
        if (!arc) throw new Error("ARC introuvable");
        await ensureProofCard(arc, content);
        const safeContentArg = content
            ? `'${xeraGetContentId(content)}'`
            : "null";
        const modal = document.createElement("div");
        modal.id = "xera1-growth-modal";
        modal.className = "xera1-growth-modal";
        modal.innerHTML = `
            <div class="xera1-growth-dialog">
                <button type="button" class="xera1-growth-close" onclick="closeProofCardModal()">×</button>
                <div class="xera1-growth-kicker">Carte de preuve</div>
                ${renderProofCardMarkup(arc, content)}
                <div class="xera1-growth-actions">
                    <button type="button" class="btn btn-primary" onclick="shareProofCard('${arc.id}', ${safeContentArg})">Partager</button>
                    <button type="button" class="btn btn-ghost" onclick="requestArcWitness('${arc.id}', ${safeContentArg})">Demander un regard</button>
                    <button type="button" class="btn btn-ghost" onclick="shareWeeklyTrajectoryRecap('${arc.id}')">Récap semaine</button>
                </div>
            </div>
        `;
        document.getElementById("xera1-growth-modal")?.remove();
        document.body.appendChild(modal);
        await xeraTrackGrowthEvent("proof_card_opened", {
            targetUserId: arc.user_id,
            arcId: arc.id,
            contentId: xeraGetContentId(content),
        });
    } catch (error) {
        console.error("openProofCardModal error:", error);
        xeraToast(
            "error",
            "Carte indisponible",
            error?.message || "Impossible d'ouvrir la carte.",
        );
    }
}

function closeProofCardModal() {
    document.getElementById("xera1-growth-modal")?.remove();
}

async function shareProofCard(arcId, contentId = null) {
    try {
        const { arc, content } = await fetchArcAndContentForGrowth(
            arcId,
            contentId,
        );
        if (!arc) throw new Error("ARC introuvable");
        await ensureProofCard(arc, content);
        const url = xeraBuildArcShareUrl(arc, content, { proof: "1" });
        const title = content
            ? `${xeraGetContentTitle(content)} | XERA1`
            : `${arc.title} | XERA1`;
        const text = content
            ? `Preuve de progression: ${xeraGetContentTitle(content)}`
            : `Trajectoire en cours: ${arc.title}`;
        const didShare = await xeraSharePayload({ title, text, url });
        if (didShare) {
            await incrementProofCardShare(arc.id, xeraGetContentId(content));
            await xeraTrackGrowthEvent("proof_card_shared", {
                targetUserId: arc.user_id,
                arcId: arc.id,
                contentId: xeraGetContentId(content),
                metadata: { url },
            });
            window.engagementTracker?.trackInteraction?.({
                type: "share",
                targetUserId: arc.user_id,
                contentId: xeraGetContentId(content),
                contentType: "trace",
                metadata: { source: "proof_card" },
            });
        }
    } catch (error) {
        console.error("shareProofCard error:", error);
        xeraToast(
            "error",
            "Partage impossible",
            error?.message || "La carte n'a pas pu être partagée.",
        );
    }
}

async function requestArcWitness(arcId, contentId = null) {
    if (!window.currentUser?.id) {
        xeraToast(
            "info",
            "Connexion requise",
            "Connectez-vous pour demander un regard sur ce jalon.",
        );
        return;
    }

    try {
        const { arc, content } = await fetchArcAndContentForGrowth(
            arcId,
            contentId,
        );
        if (!arc) throw new Error("ARC introuvable");
        if (arc.user_id !== window.currentUser.id) {
            xeraToast(
                "info",
                "Action réservée",
                "Seul le builder peut demander un regard sur ce jalon.",
            );
            return;
        }

        const witness = prompt(
            "Qui peut reconnaître cette progression ? Ajoutez un email ou un nom.",
            "",
        );
        if (!witness || !witness.trim()) return;

        const claimToken = xeraMakeToken("witness");
        await xeraSafeInsert("arc_witnesses", {
            arc_id: arc.id,
            milestone_content_id: xeraGetContentId(content),
            witness_email: witness.trim(),
            invited_by: window.currentUser.id,
            claim_token: claimToken,
            status: "pending",
        });

        const url = xeraBuildArcShareUrl(arc, content, {
            witness: claimToken,
        });
        await xeraTrackGrowthEvent("witness_requested", {
            targetUserId: arc.user_id,
            arcId: arc.id,
            contentId: xeraGetContentId(content),
            metadata: { witness: witness.trim() },
        });
        await xeraSharePayload({
            title: `${arc.title} | XERA1`,
            text: `Regarde ce jalon et dis-moi si la progression est réelle: ${content ? xeraGetContentTitle(content) : arc.title}`,
            url,
        });
    } catch (error) {
        console.error("requestArcWitness error:", error);
        xeraToast(
            "error",
            "Demande impossible",
            error?.message || "Le témoin n'a pas pu être ajouté.",
        );
    }
}

async function validateArcMilestone(arcId, contentId = null) {
    if (!window.currentUser?.id) {
        xeraToast(
            "info",
            "Connexion requise",
            "Connectez-vous pour valider un jalon.",
        );
        return;
    }

    try {
        const { arc, content } = await fetchArcAndContentForGrowth(
            arcId,
            contentId,
        );
        if (!arc || !content) throw new Error("Jalon introuvable");
        if (arc.user_id === window.currentUser.id) {
            xeraToast(
                "info",
                "Déjà builder",
                "La validation doit venir d'une autre personne.",
            );
            return;
        }

        const comment =
            prompt("Ajouter un court retour de validation (optionnel).", "") ||
            "";
        const contentKey = xeraGetContentId(content);
        const payload = {
            arc_id: arc.id,
            content_id: contentKey,
            validator_user_id: window.currentUser.id,
            validation_type: "witnessed",
            comment: comment.trim() || null,
        };

        try {
            await xeraSafeInsert("arc_milestone_validations", payload);
        } catch (error) {
            if (String(error?.code || "") === "23505") {
                xeraToast(
                    "info",
                    "Déjà validé",
                    "Votre validation existe déjà.",
                );
                return;
            }
            throw error;
        }

        if (typeof createNotification === "function") {
            const actorName =
                window.currentUser.name ||
                window.currentUser.email ||
                "Un membre";
            await createNotification(
                arc.user_id,
                "arc_validation",
                `${actorName} a validé un jalon de "${arc.title}".`,
                xeraBuildProfileDeepLink(arc.user_id, {
                    arc: arc.id,
                    content: contentKey,
                }),
            );
        }

        await xeraTrackGrowthEvent("milestone_validated", {
            targetUserId: arc.user_id,
            arcId: arc.id,
            contentId: contentKey,
            metadata: { hasComment: !!comment.trim() },
        });
        xeraToast(
            "success",
            "Jalon validé",
            "Votre validation renforce la preuve de progression.",
        );
    } catch (error) {
        console.error("validateArcMilestone error:", error);
        xeraToast(
            "error",
            "Validation impossible",
            error?.message || "Le jalon n'a pas pu être validé.",
        );
    }
}

async function openArcCoBuilderRole(arcId) {
    if (!window.currentUser?.id) {
        xeraToast(
            "info",
            "Connexion requise",
            "Connectez-vous pour ouvrir un rôle.",
        );
        return;
    }

    try {
        const { arc } = await fetchArcAndContentForGrowth(arcId);
        if (!arc) throw new Error("ARC introuvable");
        if (arc.user_id !== window.currentUser.id) {
            xeraToast(
                "info",
                "Action réservée",
                "Seul le builder peut ouvrir un rôle.",
            );
            return;
        }

        const role = prompt(
            "Quel rôle rendrait cet ARC plus fort ?",
            "Co-builder",
        );
        if (!role || !role.trim()) return;

        await xeraSafeInsert("arc_collaboration_slots", {
            arc_id: arc.id,
            owner_id: window.currentUser.id,
            role_label: role.trim(),
            status: "open",
        });

        await xeraTrackGrowthEvent("co_builder_slot_opened", {
            targetUserId: arc.user_id,
            arcId: arc.id,
            metadata: { role: role.trim() },
        });
        await xeraSharePayload({
            title: `${arc.title} | XERA1`,
            text: `Rôle ouvert sur cet ARC: ${role.trim()}`,
            url: xeraBuildArcShareUrl(arc, null, { role: role.trim() }),
        });
    } catch (error) {
        console.error("openArcCoBuilderRole error:", error);
        xeraToast(
            "error",
            "Rôle impossible",
            error?.message || "Le rôle n'a pas pu être ouvert.",
        );
    }
}

async function requestArcCollaborationWithRole(arcId, ownerId, role = "") {
    if (typeof window.requestArcCollaboration === "function") {
        await window.requestArcCollaboration(arcId, ownerId);
    }
    await xeraTrackGrowthEvent("co_builder_requested", {
        targetUserId: ownerId,
        arcId,
        metadata: { role },
    });
}

async function shareWeeklyTrajectoryRecap(arcId) {
    try {
        const { arc } = await fetchArcAndContentForGrowth(arcId);
        if (!arc) throw new Error("ARC introuvable");
        const { data, error } = await supabase
            .from("content")
            .select("id, title, day_number, created_at")
            .eq("arc_id", arc.id)
            .order("created_at", { ascending: false })
            .limit(7);
        if (error) throw error;
        const traces = data || [];
        const recap = traces.length
            ? traces
                  .map((item) => `J${item.day_number}: ${item.title}`)
                  .join("\n")
            : "Aucune trace publiée cette semaine.";
        await xeraTrackGrowthEvent("weekly_recap_shared", {
            targetUserId: arc.user_id,
            arcId: arc.id,
            metadata: { traceCount: traces.length },
        });
        await xeraSharePayload({
            title: `Récap XERA1: ${arc.title}`,
            text: `Progression de la semaine:\n${recap}`,
            url: xeraBuildArcShareUrl(arc, traces[0] || null, {
                recap: "week",
            }),
        });
    } catch (error) {
        console.error("shareWeeklyTrajectoryRecap error:", error);
        xeraToast(
            "error",
            "Récap impossible",
            error?.message || "Le récap n'a pas pu être généré.",
        );
    }
}

async function startInspiredArc(arcId) {
    try {
        const { arc } = await fetchArcAndContentForGrowth(arcId);
        if (!arc) throw new Error("ARC introuvable");
        xeraSetInspiredArcSeed({
            sourceArcId: arc.id,
            sourceOwnerId: arc.user_id,
            title: arc.title || "",
            goal: arc.goal || "",
            description: arc.description || "",
            durationDays: arc.duration_days || 30,
            stageLevel: arc.stage_level || "idee",
            opportunityIntents: normalizeArcOpportunityIntents(
                arc.opportunity_intents,
            ),
        });
        await xeraTrackGrowthEvent("arc_inspiration_started", {
            targetUserId: arc.user_id,
            arcId: arc.id,
        });

        if (!window.currentUser?.id) {
            xeraToast(
                "info",
                "Base prête",
                "Connectez-vous pour construire votre version.",
            );
            setTimeout(() => {
                window.location.href = "login.html";
            }, 900);
            return;
        }

        if (typeof window.closeImmersive === "function") {
            window.closeImmersive();
        }
        setTimeout(() => {
            if (typeof window.openCreateModal === "function") {
                window.openCreateModal();
            }
        }, 80);
    } catch (error) {
        console.error("startInspiredArc error:", error);
        xeraToast(
            "error",
            "ARC indisponible",
            error?.message || "Impossible de préparer votre version.",
        );
    }
}

async function recordArcInspiration(
    sourceArcId,
    newArcId,
    userId,
    sourceOwnerId = null,
) {
    if (!sourceArcId || !newArcId || !userId) return;
    try {
        await xeraSafeInsert("arc_inspirations", {
            source_arc_id: sourceArcId,
            new_arc_id: newArcId,
            created_by: userId,
        });
        await xeraTrackGrowthEvent("arc_inspired_created", {
            targetUserId: sourceOwnerId,
            arcId: sourceArcId,
            metadata: { newArcId },
        });
    } catch (error) {
        console.warn("[XERA1 growth] recordArcInspiration failed:", error);
    }
}

function renderArcGrowthPanel(arc, isOwner, content = []) {
    const latestContent = Array.isArray(content) ? content[0] : null;
    const latestContentId = xeraGetContentId(latestContent);
    const contentArg = latestContentId ? `'${latestContentId}'` : "null";

    if (isOwner) {
        return `
            <div class="xera1-growth-panel">
                <div>
                    <h3>Preuve sociale</h3>
                    <p>Transformez une progression réelle en validation, retour ou collaboration.</p>
                </div>
                <div class="xera1-growth-action-grid">
                    <button type="button" class="btn btn-primary" onclick="openProofCardModal('${arc.id}', ${contentArg})" ${latestContentId ? "" : "disabled"}>Carte preuve</button>
                    <button type="button" class="btn btn-ghost" onclick="requestArcWitness('${arc.id}', ${contentArg})" ${latestContentId ? "" : "disabled"}>Ajouter un témoin</button>
                    <button type="button" class="btn btn-ghost" onclick="openArcCoBuilderRole('${arc.id}')">Ouvrir un rôle</button>
                    <button type="button" class="btn btn-ghost" onclick="shareWeeklyTrajectoryRecap('${arc.id}')">Récap semaine</button>
                </div>
            </div>
        `;
    }

    return `
        <div class="xera1-growth-panel">
            <div>
                <h3>Construire autour de cette preuve</h3>
                <p>Validez un jalon, proposez une contribution ou démarrez votre propre version.</p>
            </div>
            <div class="xera1-growth-action-grid">
                <button type="button" class="btn btn-primary" onclick="validateArcMilestone('${arc.id}', ${contentArg})" ${latestContentId ? "" : "disabled"}>Valider le jalon</button>
                <button type="button" class="btn btn-ghost" onclick="requestArcCollaborationWithRole('${arc.id}', '${arc.user_id}', 'co-builder')">Contribuer</button>
                <button type="button" class="btn btn-ghost" onclick="startInspiredArc('${arc.id}')">Construire ma version</button>
                <button type="button" class="btn btn-ghost" onclick="shareProofCard('${arc.id}', ${contentArg})" ${latestContentId ? "" : "disabled"}>Partager la preuve</button>
            </div>
        </div>
    `;
}

async function afterTracePublishedGrowthLoop({ content, contentData }) {
    if (!contentData?.arcId || !content?.id) return;
    try {
        const { arc } = await fetchArcAndContentForGrowth(contentData.arcId);
        if (!arc) return;
        await ensureProofCard(arc, content);
        await xeraTrackGrowthEvent("proof_card_created", {
            targetUserId: arc.user_id,
            arcId: arc.id,
            contentId: content.id,
            metadata: { state: contentData.state, type: contentData.type },
        });

        const nudge = document.createElement("div");
        nudge.className = "xera1-proof-nudge";
        nudge.innerHTML = `
            <div>
                <strong>Carte de preuve prête</strong>
                <span>Cette trace peut recevoir un regard ou devenir une preuve partageable.</span>
            </div>
            <button type="button" onclick="openProofCardModal('${arc.id}', '${content.id}'); this.closest('.xera1-proof-nudge')?.remove();">Ouvrir</button>
            <button type="button" class="ghost" onclick="this.closest('.xera1-proof-nudge')?.remove();">Plus tard</button>
        `;
        document.querySelector(".xera1-proof-nudge")?.remove();
        document.body.appendChild(nudge);
        setTimeout(() => nudge.remove(), 9000);
    } catch (error) {
        console.warn(
            "[XERA1 growth] afterTracePublishedGrowthLoop failed:",
            error,
        );
    }
}

// --- ARC DETAILS & INTERACTION ---

async function openArcDetails(arcId) {
    // Show loading state or overlay immediately
    const overlay = document.getElementById("immersive-overlay");
    overlay.style.display = "block";
    overlay.innerHTML =
        '<div style="display:flex;justify-content:center;align-items:center;height:100vh;">Chargement...</div>';
    document.body.style.overflow = "hidden";

    try {
        // 1. Fetch Arc Details
        const { data: arc, error: arcError } = await supabase
            .from("arcs")
            .select("*, users(name, avatar)")
            .eq("id", arcId)
            .single();

        if (arcError) throw arcError;

        // 2. Fetch Arc Stats (Followers)
        const { count: followersCount } = await supabase
            .from("arc_followers")
            .select("*", { count: "exact", head: true })
            .eq("arc_id", arcId);

        // 3. Check if current user is following
        let isFollowing = false;
        if (currentUser) {
            const { data: followData } = await supabase
                .from("arc_followers")
                .select("*")
                .eq("arc_id", arcId)
                .eq("user_id", currentUser.id)
                .single();
            isFollowing = !!followData;
        }

        // 4. Fetch Associated Content
        const { data: content, error: contentError } = await supabase
            .from("content")
            .select("*")
            .eq("arc_id", arcId)
            .order("created_at", { ascending: false });

        if (contentError) throw contentError;

        const progressDaysSet = new Set(
            (content || [])
                .map((c) => c.day_number)
                .filter((v) => v !== null && v !== undefined),
        );
        arc._progressDays = progressDaysSet.size;

        // 5. Render
        renderArcDetails(arc, followersCount, isFollowing, content);
    } catch (error) {
        console.error("Error opening arc details:", error);
        overlay.innerHTML =
            '<div style="padding:2rem;text-align:center;">Erreur lors du chargement de l\'ARC. <br><button onclick="closeImmersive()">Fermer</button></div>';
    }
}

function renderArcDetails(arc, followersCount, isFollowing, content) {
    window.currentArc = arc;
    const overlay = document.getElementById("immersive-overlay");
    const isOwner = currentUser && currentUser.id === arc.user_id;
    const progress = calculateArcProgress(arc);
    const daysSince = calculateDaysSince(arc.start_date);
    const stageLabel = getArcStageLabel(arc.stage_level);
    const opportunityIntents = normalizeArcOpportunityIntents(
        arc.opportunity_intents,
    );
    const opportunitiesLabel = opportunityIntents.length
        ? opportunityIntents.map(getArcOpportunityLabel).join(" • ")
        : "Public (sans ciblage spécifique)";

    const coverHtml = arc.media_url
        ? arc.media_type === "video"
            ? `<div class="arc-cover" style="width:100%; max-height:300px; overflow:hidden; border-radius:12px; margin-bottom:1.5rem;"><video src="${arc.media_url}" controls playsinline preload="metadata" style="width:100%; height:100%; object-fit:cover;"></video></div>`
            : `<div class="arc-cover" style="width:100%; height:250px; background-image:url('${arc.media_url}'); background-size:cover; background-position:center; border-radius:12px; margin-bottom:1.5rem;"></div>`
        : "";

    let actionButtons = "";
    if (isOwner) {
        if (arc.status === "in_progress") {
            actionButtons = `
                <button class="btn btn-primary" onclick="window.openCreateMenu('${currentUser.id}', '${arc.id}'); closeImmersive();" style="width:100%; margin-bottom:1rem;">Poster une mise à jour</button>
                <div style="display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap;">
                    <button class="btn btn-ghost" onclick="updateArcStatus('${arc.id}', 'completed')">Terminer</button>
                    <button class="btn btn-ghost" onclick="window.openArcEditFromDetails ? window.openArcEditFromDetails() : (window.openEditArcModal && window.openEditArcModal(window.currentArc))">Modifier</button>
                    <button class="btn btn-ghost" style="color:var(--failure)" onclick="updateArcStatus('${arc.id}', 'abandoned')">Abandonner</button>
                </div>
            `;
        }
        // Always allow deletion
        actionButtons += `
            <button class="btn btn-ghost" style="color:var(--failure); border-color:var(--failure); margin-top:1rem;" onclick="deleteArc('${arc.id}')">Supprimer le projet</button>
        `;
    } else if (currentUser) {
        actionButtons = `
            <button class="btn ${isFollowing ? "btn-ghost" : "btn-primary"}" onclick="toggleFollowArc('${arc.id}')">
                ${isFollowing ? "Ne plus suivre" : "Suivre ce projet"}
            </button>
        `;
    }

    const contentHtml =
        content && content.length > 0
            ? `<div class="arc-content-grid">${content.map((c) => createContentCardSimple(c, isOwner)).join("")}</div>`
            : `<p style="text-align:center; opacity:0.6; margin-top:2rem;">Aucune mise à jour pour le moment.</p>`;
    const growthPanelHtml = renderArcGrowthPanel(arc, isOwner, content || []);

    overlay.innerHTML = `
        <div class="arc-details-container" style="max-width: 800px; margin: 0 auto; padding: 2rem; padding-bottom: 100px;">
            <button class="close-immersive" onclick="closeImmersive()" style="position:fixed; top:2rem; right:2rem; z-index:100; background:rgba(0,0,0,0.5); border:none; color:white; width:40px; height:40px; border-radius:50%; font-size:1.2rem; cursor:pointer;">✕</button>
            
            <div class="arc-details-hero">
                ${coverHtml}
                <div class="arc-status-badge arc-status-${arc.status}" style="display:inline-block; margin-bottom:1rem; position:static;">
                    ${arc.status === "in_progress" ? "En cours" : arc.status === "completed" ? "Terminé" : "Abandonné"}
                </div>
                <h1 class="arc-details-title">${escapeHtml(arc.title)}</h1>
                <p style="font-size:1.2rem; color:var(--text-secondary); max-width:600px; margin:0 auto 2rem;">${window.renderRichDescription ? window.renderRichDescription(arc.goal) : escapeHtml(arc.goal)}</p>
                
                <div class="arc-details-stats">
                    <div class="stat-item">
                        <span class="stat-value">${daysSince}/${arc.duration_days || "?"}</span>
                        <span class="stat-label">Jours</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${progress}%</span>
                        <span class="stat-label">Progression</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value" id="arc-follower-count">${followersCount || 0}</span>
                        <span class="stat-label">Followers</span>
                    </div>
                </div>

                <div style="margin-top: 2rem; display:flex; flex-direction:column; align-items:center;">
                    ${actionButtons}
                </div>
            </div>

            ${growthPanelHtml}

            <div class="arc-description" style="margin-bottom: 3rem; background: var(--surface-color); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color);">
                <h3 style="margin-bottom:0.5rem; font-size:1rem; text-transform:uppercase; letter-spacing:1px; color:var(--text-secondary);">À propos</h3>
                <p style="line-height:1.6;">${window.renderRichDescription ? window.renderRichDescription(arc.description || "Pas de description.") : escapeHtml(arc.description || "Pas de description.")}</p>
                <div style="margin-top:0.85rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
                    <span class="arc-chip arc-chip-level">${stageLabel}</span>
                    <span class="arc-chip arc-chip-opportunity">${escapeHtml(opportunitiesLabel)}</span>
                </div>
                <div style="margin-top:1rem; font-size:0.9rem; opacity:0.7; border-top:1px solid var(--border-color); padding-top:1rem;">
                    Lancé le ${new Date(arc.start_date).toLocaleDateString()} par <strong>${escapeHtml(arc.users?.name || "Inconnu")}</strong>
                </div>
            </div>

            <h3 style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 2rem;">Trajectoire</h3>
            ${contentHtml}
        </div>
    `;
}

function createContentCardSimple(content, isOwner) {
    // Simplified version of content card for the list
    const date = new Date(content.created_at).toLocaleDateString();
    const contentId = xeraGetContentId(content);
    const arcId = content.arc_id || content.arcId || window.currentArc?.id;

    let stateClass = "";
    if (content.state === "success") stateClass = "item-success";
    else if (content.state === "failure") stateClass = "item-failure";
    else if (content.state === "pause") stateClass = "item-pause";

    let actions = "";
    if (contentId && arcId && isOwner) {
        actions = `
            <div class="timeline-actions" style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 0.5rem;">
                <button class="btn btn-ghost" style="padding: 0.2rem 0.6rem; font-size: 0.8rem;" onclick="event.stopPropagation(); window.openProofCardModal('${arcId}', '${contentId}')">Carte preuve</button>
                <button class="btn btn-ghost" style="padding: 0.2rem 0.6rem; font-size: 0.8rem;" onclick="event.stopPropagation(); window.requestArcWitness('${arcId}', '${contentId}')">Témoin</button>
                <button class="btn btn-ghost" style="padding: 0.2rem 0.6rem; font-size: 0.8rem;" onclick="event.stopPropagation(); window.editContent('${contentId}')">Modifier</button>
                <button class="btn btn-ghost" style="padding: 0.2rem 0.6rem; font-size: 0.8rem; color: var(--failure);" onclick="event.stopPropagation(); window.deleteContent('${contentId}')">Supprimer</button>
            </div>
        `;
    } else if (contentId && arcId) {
        actions = `
            <div class="timeline-actions" style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 0.5rem;">
                <button class="btn btn-ghost" style="padding: 0.2rem 0.6rem; font-size: 0.8rem;" onclick="event.stopPropagation(); window.validateArcMilestone('${arcId}', '${contentId}')">Valider</button>
                <button class="btn btn-ghost" style="padding: 0.2rem 0.6rem; font-size: 0.8rem;" onclick="event.stopPropagation(); window.shareProofCard('${arcId}', '${contentId}')">Partager</button>
            </div>
        `;
    }

    return `
        <div class="timeline-item ${stateClass}" data-content-id="${xeraEscapeHtml(contentId || "")}" style="margin-bottom: 1.5rem;">
            <div class="timeline-date">${date} - Jour ${content.day_number}</div>
            <div class="timeline-card">
                <h4>${escapeHtml(content.title)}</h4>
                <p>${escapeHtml(content.description)}</p>
                ${content.media_url ? `<div style="margin-top:1rem;"><a href="${content.media_url}" target="_blank" style="color:var(--accent-color); text-decoration:underline;">Voir le média</a></div>` : ""}
                ${actions}
            </div>
        </div>
    `;
}

async function toggleFollowArc(arcId) {
    if (!currentUser) {
        alert("Connectez-vous pour suivre un projet.");
        return;
    }

    try {
        // Check current status
        const { data: existing } = await supabase
            .from("arc_followers")
            .select("id")
            .eq("arc_id", arcId)
            .eq("user_id", currentUser.id)
            .single();

        if (existing) {
            // Unfollow
            await supabase.from("arc_followers").delete().eq("id", existing.id);
        } else {
            // Follow
            await supabase.from("arc_followers").insert([
                {
                    arc_id: arcId,
                    user_id: currentUser.id,
                },
            ]);

            // Notifier le propriétaire de l'ARC (si ce n'est pas soi-même)
            try {
                const { data: arcRow, error: arcErr } = await supabase
                    .from("arcs")
                    .select("id, user_id, title")
                    .eq("id", arcId)
                    .maybeSingle();
                if (
                    !arcErr &&
                    arcRow &&
                    arcRow.user_id &&
                    arcRow.user_id !== currentUser.id
                ) {
                    const actorName =
                        typeof getCurrentUserDisplayName === "function"
                            ? getCurrentUserDisplayName()
                            : (currentUser &&
                                  (currentUser.name || currentUser.email)) ||
                              "Un membre";
                    const message = `${actorName} a commencé à suivre votre projet "${arcRow.title || "votre projet"}"`;
                    const link =
                        typeof safeProfileLink === "function"
                            ? safeProfileLink(currentUser.id)
                            : typeof window.buildProfileUrl === "function"
                              ? window.buildProfileUrl(currentUser.id)
                              : `profile?user=${currentUser.id}`;
                    if (typeof createNotification === "function") {
                        try {
                            await createNotification(
                                arcRow.user_id,
                                "arc_follow",
                                message,
                                link,
                            );
                        } catch (e) {
                            console.warn(
                                "notifyArcFollow createNotification error",
                                e,
                            );
                        }
                    }
                    let cameFromProofCard = false;
                    try {
                        const params = new URLSearchParams(
                            window.location.search,
                        );
                        cameFromProofCard = params.get("proof") === "1";
                    } catch (e) {
                        cameFromProofCard = false;
                    }
                    await xeraTrackGrowthEvent(
                        cameFromProofCard
                            ? "proof_card_followed"
                            : "arc_followed",
                        {
                            targetUserId: arcRow.user_id,
                            arcId,
                            metadata: { cameFromProofCard },
                        },
                    );
                }
            } catch (e) {
                console.warn("notifyArcFollow error", e);
            }
        }

        // Refresh view (lazy way: reload details)
        openArcDetails(arcId);
    } catch (error) {
        console.error("Error toggling follow:", error);
    }
}

async function updateArcStatus(arcId, newStatus) {
    if (
        !confirm(
            `Êtes-vous sûr de vouloir marquer ce projet comme ${newStatus} ?`,
        )
    )
        return;

    try {
        const { error } = await supabase
            .from("arcs")
            .update({ status: newStatus })
            .eq("id", arcId);

        if (error) throw error;

        // Refresh view
        openArcDetails(arcId);

        // Also refresh profile list if open
        if (document.getElementById("profile").classList.contains("active")) {
            loadUserArcs(currentUser.id);
        }
    } catch (error) {
        console.error("Error updating status:", error);
        alert("Erreur lors de la mise à jour.");
    }
}

async function deleteArc(arcId) {
    if (
        !confirm(
            "Attention : Cette action est irréversible. Voulez-vous vraiment supprimer ce projet et tout son historique ?",
        )
    )
        return;

    try {
        const { error } = await supabase.from("arcs").delete().eq("id", arcId);

        if (error) throw error;

        alert("Projet supprimé.");
        closeImmersive();

        // Refresh profile if open
        if (document.getElementById("profile").classList.contains("active")) {
            loadUserArcs(currentUser.id);
        }
    } catch (error) {
        console.error("Error deleting ARC:", error);
        alert("Erreur lors de la suppression.");
    }
}

// Ensure closeImmersive is available globally or reuse the one in app-supabase.js
if (!window.closeImmersive) {
    window.closeImmersive = function () {
        document.getElementById("immersive-overlay").style.display = "none";
        document.body.style.overflow = "auto";
    };
}

// --- EXPORT ---
// Make functions available globally
window.initArcs = initArcs;
window.openCreateModal = openCreateModal;
window.openEditArcModal = openEditArcModal;
window.openArcEditFromDetails = openArcEditFromDetails;
window.closeCreateModal = closeCreateModal;
window.loadUserArcs = loadUserArcs;
window.openArcDetails = openArcDetails;
window.toggleFollowArc = toggleFollowArc;
window.updateArcStatus = updateArcStatus;
window.deleteArc = deleteArc;
window.openProofCardModal = openProofCardModal;
window.closeProofCardModal = closeProofCardModal;
window.shareProofCard = shareProofCard;
window.requestArcWitness = requestArcWitness;
window.validateArcMilestone = validateArcMilestone;
window.openArcCoBuilderRole = openArcCoBuilderRole;
window.requestArcCollaborationWithRole = requestArcCollaborationWithRole;
window.shareWeeklyTrajectoryRecap = shareWeeklyTrajectoryRecap;
window.startInspiredArc = startInspiredArc;
window.xeraGrowthLoops = {
    afterTracePublished: afterTracePublishedGrowthLoop,
    recordArcInspiration,
};

// Auto-init when DOM loaded
document.addEventListener("DOMContentLoaded", initArcs);
