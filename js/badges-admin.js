const ToastManager = window.ToastManager || null;

function setupProfessionalPageSearch({ supabase, inputId, suggestionsId }) {
    const input = document.getElementById(inputId);
    const suggestions = document.getElementById(suggestionsId);
    if (!input || !suggestions || !supabase) return;

    let debounceTimer = null;
    let lastQuery = "";

    const renderResults = (pages) => {
        if (!pages.length) {
            suggestions.innerHTML =
                '<div class="verification-empty">Aucune Page Pro trouvée</div>';
            return;
        }

        suggestions.innerHTML = pages
            .map((page) => {
                const name = escapeHtml(page.name || "Page Pro");
                const slug = escapeHtml(page.slug || "");
                const id = escapeHtml(page.id || "");
                const avatar = escapeHtml(
                    page.avatar_url || "icons/enterprise.svg",
                );
                return `<button type="button" class="admin-page-search-result" data-page-id="${id}">
                    <img src="${avatar}" alt="" aria-hidden="true">
                    <span><strong>${name}</strong><small>${slug || id}</small></span>
                    <span class="admin-page-search-arrow">→</span>
                </button>`;
            })
            .join("");

        suggestions.querySelectorAll("[data-page-id]").forEach((button) => {
            button.addEventListener("click", () => {
                input.value = button.dataset.pageId || "";
                suggestions.innerHTML = "";
            });
        });
    };

    const search = async () => {
        const query = String(input.value || "").trim();
        suggestions.innerHTML = "";
        if (!query) return;
        lastQuery = query;
        suggestions.innerHTML =
            '<div class="verification-empty">Recherche en cours...</div>';

        try {
            const pattern = `%${query}%`;
            const isUuid =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                    query,
                );
            const [nameResult, slugResult, idResult] = await Promise.all([
                supabase
                    .from("professional_pages")
                    .select("id, name, slug, avatar_url")
                    .ilike("name", pattern)
                    .limit(8),
                supabase
                    .from("professional_pages")
                    .select("id, name, slug, avatar_url")
                    .ilike("slug", pattern)
                    .limit(8),
                isUuid
                    ? supabase
                          .from("professional_pages")
                          .select("id, name, slug, avatar_url")
                          .eq("id", query)
                          .limit(1)
                    : Promise.resolve({ data: [], error: null }),
            ]);
            if (lastQuery !== query) return;
            const errors = [nameResult, slugResult, idResult].filter(
                (result) => result.error,
            );
            if (errors.length) throw errors[0].error;

            const uniquePages = new Map();
            [
                ...(idResult.data || []),
                ...(nameResult.data || []),
                ...(slugResult.data || []),
            ].forEach((page) => uniquePages.set(page.id, page));
            renderResults(Array.from(uniquePages.values()).slice(0, 8));
        } catch (error) {
            console.error("Erreur recherche Page Pro:", error);
            suggestions.innerHTML =
                '<div class="verification-empty">Erreur de recherche</div>';
        }
    };

    input.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(search, 220);
    });
}

export function initBadgeAdminPage({
    supabase,
    addVerifiedUserId,
    removeVerifiedUserId,
    setupAdminUserSearch,
    fetchVerifiedBadges,
    fetchVerificationRequests,
    getVerifiedBadgeSets,
}) {
    const container = document.getElementById("badge-admin");
    if (!container) return;

    let pendingRequestsCache = [];

    const fetchVerifiedProfiles = async (ids) => {
        const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
        if (!uniqueIds.length) return [];

        try {
            const { data, error } = await supabase
                .from("users")
                .select("id, name, avatar")
                .in("id", uniqueIds);
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error("Erreur chargement profils vérifiés:", error);
            return (window.allUsers || []).filter((user) =>
                uniqueIds.includes(user.id),
            );
        }
    };

    const renderList = async () => {
        const list = document.getElementById("badge-admin-list");
        if (!list) return;
        const sets = getVerifiedBadgeSets ? getVerifiedBadgeSets() : null;
        const creators = sets ? Array.from(sets.creators || []) : [];
        const staff = sets ? Array.from(sets.staff || []) : [];
        const pages = sets ? Array.from(sets.pages || []) : [];
        const ids = [...creators, ...staff];
        const profiles = await fetchVerifiedProfiles(ids);
        const profileMap = new Map(profiles.map((u) => [u.id, u]));
        const item = (id, typeLabel, typeKey) => {
            const p = profileMap.get(id) || {};
            const name = escapeHtml(p.name || "Utilisateur vérifié");
            const avatar = escapeHtml(p.avatar || "icons/artist.svg");
            return `
            <div class="verification-request-item" style="justify-content:space-between; gap:0.75rem;">
                <div style="display:flex; align-items:center; gap:0.6rem; min-width:0;">
                    <img src="${avatar}" alt="${name}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
                    <div style="display:flex; flex-direction:column; min-width:0;">
                        <span class="verification-request-name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</span>
                        <span class="verification-request-id" style="color:var(--text-secondary); font-size:0.8rem;">${id}</span>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span class="verification-request-type">${typeLabel}</span>
                    <button class="btn-cancel badge-remove-btn" data-user-id="${id}" data-type="${typeKey}" title="Retirer le badge">Retirer</button>
                </div>
            </div>
        `;
        };
        list.innerHTML = `
            <div style="margin-bottom:0.5rem; font-weight:700;">Créateurs (${creators.length})</div>
            ${creators.map((id) => item(id, "Créateur", "creator")).join("") || '<div class="verification-empty">Aucun</div>'}
            <div style="margin:1rem 0 0.5rem; font-weight:700;">Staff (${staff.length})</div>
            ${staff.map((id) => item(id, "Staff", "staff")).join("") || '<div class="verification-empty">Aucun</div>'}
            <div style="margin:1rem 0 0.5rem; font-weight:700;">Pages Pro vérifiées (${pages.length})</div>
            ${pages.length ? '<div id="badge-admin-pages"></div>' : '<div class="verification-empty">Aucune</div>'}
        `;

        // Render pages separately to fetch page metadata
        if (pages.length) {
            try {
                const { data: pageRows } = await supabase
                    .from("professional_pages")
                    .select("id, name, slug, avatar_url")
                    .in("id", pages)
                    .limit(100);

                const pageMap = new Map((pageRows || []).map((p) => [p.id, p]));
                const pagesHtml = pages
                    .map((pid) => {
                        const pg = pageMap.get(pid) || {
                            name: "Page Pro vérifiée",
                            slug: pid,
                            avatar_url: "icons/enterprise.svg",
                        };
                        const pageName = escapeHtml(
                            pg.name || "Page Pro vérifiée",
                        );
                        const pageSlug = escapeHtml(pg.slug || pg.id || pid);
                        const pageAvatar = escapeHtml(
                            pg.avatar_url || "icons/enterprise.svg",
                        );
                        return `
                            <div class="verification-request-item" style="justify-content:space-between; gap:0.75rem;">
                                <div style="display:flex; align-items:center; gap:0.6rem; min-width:0;">
                                    <img src="${pageAvatar}" alt="${pageName}" style="width:32px; height:32px; border-radius:6px; object-fit:cover;">
                                    <div style="display:flex; flex-direction:column; min-width:0;">
                                        <span class="verification-request-name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${typeof window.renderVerifiedPageName === "function" ? window.renderVerifiedPageName(pageName, pg.id || pid) : pageName}</span>
                                        <span class="verification-request-id" style="color:var(--text-secondary); font-size:0.8rem;">${pageSlug}</span>
                                    </div>
                                </div>
                                <div style="display:flex; align-items:center; gap:0.5rem;">
                                    <span class="verification-request-type">Page Pro</span>
                                    <button class="btn-cancel badge-remove-page-btn" data-page-id="${pid}" title="Retirer la vérification">Retirer</button>
                                </div>
                            </div>
                        `;
                    })
                    .join("");
                const pagesContainer =
                    document.getElementById("badge-admin-pages");
                if (pagesContainer) pagesContainer.innerHTML = pagesHtml;

                // Bind remove page buttons
                pagesContainer
                    .querySelectorAll(".badge-remove-page-btn")
                    .forEach((btn) => {
                        btn.addEventListener("click", async () => {
                            const pid = btn.dataset.pageId;
                            try {
                                btn.disabled = true;
                                btn.classList.add("is-pending");
                                await window.removeVerifiedPageId(pid);
                                await fetchVerifiedBadges();
                                await renderList();
                            } catch (error) {
                                console.error("Erreur retrait page:", error);
                                ToastManager?.error(
                                    "Erreur",
                                    error?.message ||
                                        "Impossible de retirer la vérification de la page.",
                                );
                            } finally {
                                btn.disabled = false;
                                btn.classList.remove("is-pending");
                            }
                        });
                    });
            } catch (e) {
                console.error("Erreur fetch pages for badges:", e);
            }
        }

        // Bind remove buttons
        list.querySelectorAll(".badge-remove-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const uid = btn.dataset.userId;
                const type = btn.dataset.type || "creator";
                try {
                    btn.disabled = true;
                    btn.classList.add("is-pending");
                    await removeVerifiedUserId(type, uid);
                    await fetchVerifiedBadges();
                    await renderList();
                } catch (error) {
                    console.error("Erreur retrait badge:", error);
                    ToastManager?.error(
                        "Erreur",
                        error?.message || "Impossible de retirer le badge.",
                    );
                } finally {
                    btn.disabled = false;
                    btn.classList.remove("is-pending");
                }
            });
        });
    };

    const renderRequests = () => {
        const box = document.getElementById("badge-admin-requests");
        if (!box) return;
        if (!pendingRequestsCache.length) {
            box.innerHTML =
                '<div class="verification-empty">Aucune demande en attente.</div>';
            return;
        }
        box.innerHTML = pendingRequestsCache
            .map((req) => {
                const label =
                    req.type === "staff" ? "Équipe/Entreprise" : "Créateur";
                const name = req.users?.name || "Utilisateur";
                const avatar =
                    req.users?.avatar || "https://placehold.co/40?text=👤";
                return `
                <div class="verification-request-item">
                    <input type="checkbox" class="badge-request-check" data-user-id="${req.user_id}" data-type="${req.type}">
                    <img src="${avatar}" alt="${name}">
                    <span class="verification-request-name">${name}</span>
                    <span class="verification-request-type">${label}</span>
                    <span class="verification-request-id">${req.user_id}</span>
                </div>
            `;
            })
            .join("");
    };

    const refreshRequests = async () => {
        const data = (await fetchVerificationRequests()) || [];
        pendingRequestsCache = data.filter((d) => d.status === "pending");
        renderRequests();
    };

    container.innerHTML = `
        <div class="settings-section">
            <div class="settings-header" style="border:none; margin-bottom:1rem; padding-bottom:0;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap: 1rem; flex-wrap: wrap;">
                    <div style="display:flex; align-items:center; gap: 0.75rem;">
                        <div>
                            <p class="admin-eyebrow">XERA1 / TRUST OPERATIONS</p>
                            <h1>Badges & vérification</h1>
                        </div>
                        <span class="admin-status-pill"><span></span> Admin vérification</span>
                    </div>
                    <a class="admin-top-action" href="admin.html" style="text-decoration:none;">Retour au contrôle <span>→</span></a>
                </div>
                <p>Attribuez les signaux de confiance, traitez les demandes et contrôlez la visibilité des Pages Pro.</p>
            </div>

            <div class="verification-admin-block admin-workspace-block">
                <div>
                    <p class="admin-eyebrow">01 / IDENTITÉ</p>
                    <h4>Attribuer un badge utilisateur</h4>
                </div>
                <p class="admin-helper">Recherchez par nom ou identifiant, choisissez le niveau, puis appliquez ou retirez le badge.</p>
                <div class="verification-input-row" style="flex-wrap:wrap; gap:0.75rem;">
                    <input type="text" id="badge-admin-search" class="form-input" placeholder="ID ou nom d'utilisateur">
                    <select id="badge-admin-type" class="form-input">
                        <option value="creator">Créateur</option>
                        <option value="staff">Équipe / Entreprise</option>
                    </select>
                    ${
                        window.isSuperAdmin && window.isSuperAdmin()
                            ? `
                    <select id="badge-admin-plan" class="form-input">
                        <option value="standard">Plan Standard</option>
                        <option value="medium">Plan Medium</option>
                        <option value="pro">Plan Pro</option>
                    </select>
                    `
                            : ""
                    }
                    <button type="button" class="btn-verify" id="badge-admin-apply">Attribuer</button>
                    <button type="button" class="btn-cancel" id="badge-admin-remove">Retirer</button>
                </div>
                <div class="admin-page-verification">
                    <p class="admin-eyebrow">02 / PAGE PRO</p>
                    <h4>Gérer la vérification d'une Page Pro</h4>
                    <div style="display:flex; gap:0.5rem; align-items:center; margin-top:0.5rem;">
                        <input type="text" id="badge-admin-page" class="form-input" placeholder="ID ou slug de la page Pro">
                        <button type="button" class="btn-verify" id="badge-admin-apply-page">Vérifier Page</button>
                        <button type="button" class="btn-cancel" id="badge-admin-remove-page">Retirer Vérif.</button>
                    </div>
                </div>
                <div id="badge-admin-suggestions" class="verify-suggestions" style="display:flex; flex-direction:column; gap:0.35rem; margin-top:0.5rem;"></div>
            </div>

            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <div class="admin-section-heading"><div><p class="admin-eyebrow">03 / REGISTRE</p><h4>Badges actuels</h4></div><span class="admin-section-note">Identités vérifiées</span></div>
                <div id="badge-admin-list" class="verification-requests"></div>
            </div>

            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <div class="admin-section-heading"><div><p class="admin-eyebrow">04 / FILE D'ATTENTE</p><h4>Demandes de vérification</h4></div><span class="admin-section-note">Décision requise</span></div>
                <div id="badge-admin-requests" class="verification-requests"></div>
                <div class="verification-actions" style="margin-top:0.75rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
                    ${
                        window.isSuperAdmin && window.isSuperAdmin()
                            ? `
                    <select id="badge-bulk-plan" class="form-input">
                        <option value="standard">Plan Standard</option>
                        <option value="medium">Plan Medium</option>
                        <option value="pro">Plan Pro</option>
                    </select>
                    `
                            : ""
                    }
                    <button type="button" class="btn-verify" id="badge-approve">Valider sélection</button>
                    <button type="button" class="btn-cancel" id="badge-reject">Refuser sélection</button>
                </div>
            </div>
        </div>
    `;

    setupAdminUserSearch(
        "badge-admin-search",
        "badge-admin-suggestions",
        (user) => {
            const input = document.getElementById("badge-admin-search");
            if (input) input.value = user.id;
        },
        { showAvatar: true },
    );
    setupProfessionalPageSearch({
        supabase,
        inputId: "badge-admin-page",
        suggestionsId: "badge-admin-suggestions",
    });

    const applyBtn = document.getElementById("badge-admin-apply");
    const removeBtn = document.getElementById("badge-admin-remove");
    const defaultApplyLabel = applyBtn?.textContent || "Attribuer";
    const defaultRemoveLabel = removeBtn?.textContent || "Retirer";

    const handleApply = async (isRemove) => {
        const setPending = (state) => {
            [applyBtn, removeBtn].forEach((b) => {
                if (!b) return;
                b.disabled = state;
                b.classList.toggle("is-pending", state);
            });
            if (applyBtn) {
                applyBtn.textContent =
                    state && !isRemove
                        ? "En cours d'attribution..."
                        : defaultApplyLabel;
            }
            if (removeBtn) {
                removeBtn.textContent =
                    state && isRemove
                        ? "Retrait en cours..."
                        : defaultRemoveLabel;
            }
        };
        const target =
            document.getElementById("badge-admin-search")?.value || "";
        const type =
            document.getElementById("badge-admin-type")?.value || "creator";
        const plan = document.getElementById("badge-admin-plan")?.value || null;
        if (!target) {
            ToastManager?.error("Champ vide", "Saisir un ID ou un nom.");
            return;
        }
        try {
            setPending(true);
            if (isRemove) {
                await removeVerifiedUserId(type, target);
            } else {
                await addVerifiedUserId(type, target, plan);
            }
            await fetchVerifiedBadges();
            renderList();
        } catch (error) {
            console.error("Erreur action badge:", error);
            ToastManager?.error(
                "Erreur",
                error?.message || "Action impossible pour le moment.",
            );
        } finally {
            setPending(false);
        }
    };

    document
        .getElementById("badge-admin-apply")
        ?.addEventListener("click", () => handleApply(false));
    document
        .getElementById("badge-admin-remove")
        ?.addEventListener("click", () => handleApply(true));

    // Page verification handlers
    document
        .getElementById("badge-admin-apply-page")
        ?.addEventListener("click", async () => {
            const pid =
                document.getElementById("badge-admin-page")?.value || "";
            if (!pid)
                return ToastManager?.error(
                    "Champ vide",
                    "Saisir un ID ou slug de page.",
                );
            try {
                document.getElementById("badge-admin-apply-page").disabled =
                    true;
                if (typeof window.addVerifiedPageId !== "function") {
                    throw new Error(
                        "Le module de vérification n'est pas chargé.",
                    );
                }
                const verifiedPageId = await window.addVerifiedPageId(pid);
                await fetchVerifiedBadges();
                await renderList();
                const pageInput = document.getElementById("badge-admin-page");
                if (pageInput) pageInput.value = "";
                console.info("Page Pro vérifiée:", verifiedPageId);
            } catch (e) {
                console.error("Erreur add page verified:", e);
                ToastManager?.error(
                    "Erreur",
                    e?.message || "Impossible de vérifier la page.",
                );
            } finally {
                document.getElementById("badge-admin-apply-page").disabled =
                    false;
            }
        });

    document
        .getElementById("badge-admin-remove-page")
        ?.addEventListener("click", async () => {
            const pid =
                document.getElementById("badge-admin-page")?.value || "";
            if (!pid)
                return ToastManager?.error(
                    "Champ vide",
                    "Saisir un ID ou slug de page.",
                );
            try {
                document.getElementById("badge-admin-remove-page").disabled =
                    true;
                await window.removeVerifiedPageId(pid);
                await fetchVerifiedBadges();
                await renderList();
            } catch (e) {
                console.error("Erreur remove page verified:", e);
                ToastManager?.error(
                    "Erreur",
                    e?.message ||
                        "Impossible de retirer la vérification de la page.",
                );
            } finally {
                document.getElementById("badge-admin-remove-page").disabled =
                    false;
            }
        });

    const handleBulkAction = async (action) => {
        const checks = Array.from(
            document.querySelectorAll(".badge-request-check:checked"),
        );
        if (!checks.length) return;
        const plan = document.getElementById("badge-bulk-plan")?.value || null;
        try {
            if (action === "approve") {
                await Promise.all(
                    checks.map((c) =>
                        addVerifiedUserId(
                            c.dataset.type,
                            c.dataset.userId,
                            plan,
                        ),
                    ),
                );
            }

            await Promise.all(
                checks.map((c) =>
                    supabase
                        .from("verification_requests")
                        .update({
                            status:
                                action === "approve" ? "approved" : "rejected",
                        })
                        .eq("user_id", c.dataset.userId)
                        .eq("type", c.dataset.type)
                        .eq("status", "pending"),
                ),
            );

            await fetchVerifiedBadges();
            await refreshRequests();
            renderList();
            ToastManager?.success(
                "Mise à jour",
                action === "approve"
                    ? "Demandes approuvées."
                    : "Demandes refusées.",
            );
        } catch (error) {
            console.error("Erreur demandes vérification:", error);
            ToastManager?.error(
                "Erreur",
                error?.message || "Impossible de mettre à jour les demandes.",
            );
        }
    };

    document
        .getElementById("badge-approve")
        ?.addEventListener("click", () => handleBulkAction("approve"));
    document
        .getElementById("badge-reject")
        ?.addEventListener("click", () => handleBulkAction("reject"));

    const list = document.getElementById("badge-admin-list");
    if (list) {
        list.innerHTML =
            '<div class="verification-empty">Synchronisation des badges vérifiés...</div>';
    }

    Promise.all([fetchVerifiedBadges(), refreshRequests()])
        .then(() => renderList())
        .catch((error) => {
            console.error("Erreur initialisation registre badges:", error);
            renderList();
        });
}
