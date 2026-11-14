// Small admin helper to control bots from admin UI (uses supabase auth session)
// Helper: try relative fetch first, then fallback to local backend (useful when
// front is served by a static dev server at a different origin).
async function apiFetch(path, options = {}) {
    const rel = path.startsWith("/") ? path : `/${path}`;
    const fallbackBase =
        (window.API_BASE_URL || "").replace(/\/+$/, "") ||
        (window.location.hostname === "127.0.0.1" ||
        window.location.hostname === "localhost"
            ? `http://localhost:5050`
            : "");

    try {
        const res = await fetch(rel, options);
        if (res && res.ok) return res;
        // If 404 or other non-ok, try fallback if configured
        if (fallbackBase) {
            try {
                const url = `${fallbackBase}${rel}`;
                const res2 = await fetch(url, options);
                return res2;
            } catch (e) {
                // ignore and fallthrough to return original response
            }
        }
        return res;
    } catch (err) {
        // network error — try fallback
        if (fallbackBase) {
            const url = `${fallbackBase}${rel}`;
            return fetch(url, options);
        }
        throw err;
    }
}

async function fetchBotStatus() {
    try {
        const {
            data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await apiFetch("/api/admin/bots/status", {
            headers: {
                Authorization: token ? `Bearer ${token}` : "",
                "Content-Type": "application/json",
            },
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            const msg = body || `HTTP ${res.status}`;
            const err = new Error(msg);
            err.status = res.status;
            throw err;
        }
        return await res.json();
    } catch (e) {
        console.error("fetchBotStatus error", e);
        throw e;
    }
}

async function setActiveBotCount(count) {
    try {
        const {
            data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await apiFetch("/api/admin/bots/set-active-count", {
            method: "POST",
            headers: {
                Authorization: token ? `Bearer ${token}` : "",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ count }),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            const msg = body || `HTTP ${res.status}`;
            const err = new Error(msg);
            err.status = res.status;
            throw err;
        }
        return await res.json();
    } catch (e) {
        console.error("setActiveBotCount error", e);
        throw e;
    }
}

async function toggleBotActive(userId, active) {
    try {
        const {
            data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await apiFetch("/api/admin/bots/toggle-active", {
            method: "POST",
            headers: {
                Authorization: token ? `Bearer ${token}` : "",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ user_id: userId, active: !!active }),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            const msg = body || `HTTP ${res.status}`;
            const err = new Error(msg);
            err.status = res.status;
            throw err;
        }
        return await res.json();
    } catch (e) {
        console.error("toggleBotActive error", e);
        throw e;
    }
}

function formatDays(days) {
    if (!Array.isArray(days)) return "";
    const names = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    return days.map((d) => names[d] || String(d)).join(", ");
}

async function deleteAllBots() {
    try {
        const confirmMsg =
            "Êtes-vous sûr de vouloir SUPPRIMER TOUS les bots ?\n\nCette action est irréversible !\n\nCliquez sur OK pour confirmer.";
        if (!confirm(confirmMsg)) return null;

        const {
            data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await apiFetch("/api/admin/bots/delete-all", {
            method: "POST",
            headers: {
                Authorization: token ? `Bearer ${token}` : "",
                "Content-Type": "application/json",
            },
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            const msg = body || `HTTP ${res.status}`;
            throw new Error(msg);
        }
        return await res.json();
    } catch (e) {
        console.error("deleteAllBots error", e);
        throw e;
    }
}

async function renderSuperAdminPage() {
    const container = document.getElementById("admin-dashboard");
    if (!container) return;

    // Preserve original admin content if available
    let adminHeader = "";
    let adminContent = "";

    if (typeof getSuperAdminPanelHtml === "function") {
        adminHeader = `
            <div class="settings-section">
                <div class="settings-header" style="border:none; margin-bottom:1rem; padding-bottom:0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap: 1rem; flex-wrap: wrap;">
                        <div style="display:flex; align-items:center; gap: 0.75rem;">
                            <h2>Administration</h2>
                            <span class="admin-badge">Super admin</span>
                        </div>
                    </div>
                    <p>Gestion complète du compte, des paiements et des bots.</p>
                </div>
            </div>
        `;
        adminContent = getSuperAdminPanelHtml();
    } else {
        adminContent = `
            <div>
                <div id="announcements-container" class="settings-section"></div>
                <div class="settings-section">
                    <h3>Feedback utilisateurs</h3>
                    <div style="display:flex;gap:1rem;align-items:center;">
                        <button class="btn-verify" type="button" onclick="fetchFeedbackInbox()">Rafraîchir</button>
                    </div>
                    <div id="admin-feedback-list" class="admin-feedback-list" style="margin-top:0.75rem;display:flex;flex-direction:column;gap:0.75rem;"></div>
                </div>
            </div>
        `;
    }

    // Stacked admin layout: main content on top, Bots Manager at bottom
    container.innerHTML = `
        ${adminHeader}
        <div class="settings-form-layout" style="display:grid;grid-template-columns:1fr;grid-template-rows:auto auto;gap:1.5rem;">
            <div id="admin-main-column">
                ${adminContent}
            </div>

            <div id="admin-bots-column">
                <div class="settings-section">
                    <h2>Bots Manager</h2>
	                    <div id="bots-stats" style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap;">
	                        <div>Total bots: <strong id="bots-total">—</strong></div>
	                        <div>Active: <strong id="bots-active-count">—</strong></div>
	                        <div>
	                            <label>Set active count: <input id="bots-active-input" type="number" min="0" max="10000" style="width:6rem;margin-left:.5rem"></label>
	                            <button id="bots-active-set-btn">Apply</button>
	                            <button id="bots-refresh-btn">Refresh</button>
	                            <button id="bots-run-now-btn" style="margin-left:.5rem">Run now</button>
	                            <label style="margin-left:1rem;display:inline-flex;align-items:center;gap:.5rem">Auto-force posts: <input id="bots-force-posts-checkbox" type="checkbox" style="margin-left:.25rem"></label>
                            <button id="bots-force-posts-set-btn" style="margin-left:.25rem">Save</button>
                            <button id="bots-delete-all-btn" style="margin-left:1rem;background:var(--error);color:#fff;padding:0.25rem 0.5rem;border-radius:4px;border:none;cursor:pointer;">Delete All Bots</button>
                            <span id="bots-run-result" style="margin-left:0.75rem;color:var(--text-secondary)"></span>
                        </div>
                    </div>
                    <div style="margin-top:1rem;overflow:auto;max-height:60vh;">
                        <table id="bots-sample-table" style="width:100%;border-collapse:collapse;">
                            <thead>
                                <tr>
                                    <th style="text-align:left">Avatar</th>
                                    <th style="text-align:left">Name</th>
                                    <th>Hour</th>
                                    <th>Encourage</th>
                                    <th>Active</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="bots-sample-body"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Trigger original data fetches if they exist
    if (typeof refreshAppPulse === "function") setTimeout(refreshAppPulse, 150);
    if (typeof fetchAdminSubscriptionPayments === "function")
        setTimeout(fetchAdminSubscriptionPayments, 150);
    if (typeof fetchAdminWithdrawalRequests === "function")
        setTimeout(fetchAdminWithdrawalRequests, 150);
    if (typeof fetchAdminAnnouncements === "function")
        setTimeout(fetchAdminAnnouncements, 150);
    if (typeof fetchFeedbackInbox === "function")
        setTimeout(fetchFeedbackInbox, 150);

    const input = document.getElementById("bots-active-input");
    const setBtn = document.getElementById("bots-active-set-btn");
    const refreshBtn = document.getElementById("bots-refresh-btn");

    async function refresh() {
        try {
            const status = await fetchBotStatus();
            const totalBots = status.totalBots || 0;
            const actualActiveCount = Number(status.activeCount) || 0;
            const configuredActiveCount =
                Number(status.configuredActiveCount) || 0;
            document.getElementById("bots-total").textContent = totalBots;
            const activeCountEl = document.getElementById("bots-active-count");
            activeCountEl.textContent = actualActiveCount;
            activeCountEl.title =
                configuredActiveCount !== actualActiveCount
                    ? `Actifs reels: ${actualActiveCount} · Configures: ${configuredActiveCount}`
                    : `Actifs reels: ${actualActiveCount}`;
            input.value = configuredActiveCount || 0;
            const body = document.getElementById("bots-sample-body");
            body.innerHTML = "";

            if (totalBots === 0) {
                body.innerHTML = `<tr><td colspan="6" style="padding:1rem;text-align:center;color:var(--text-secondary)">Aucun bot trouvé. Lancez <code>scripts/generate-bots.js</code> pour en créer.</td></tr>`;
            } else {
                (status.sample || []).forEach((b) => {
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td style="padding:6px"><img src="${b.avatar_url || "https://placehold.co/48"}" width="40" height="40" style="border-radius:50%"/></td>
                        <td style="padding:6px">${escapeHtml(b.display_name || b.user_id || "—")}</td>
                        <td style="text-align:center">${b.schedule_hour ?? "—"}</td>
                        <td style="text-align:center">${formatDays(b.encourage_days)}</td>
                        <td style="text-align:center">${b.active ? "Yes" : "No"}</td>
                        <td style="text-align:center"><button data-user-id="${b.user_id}" class="bot-toggle-btn">${b.active ? "Disable" : "Enable"}</button></td>
                    `;
                    body.appendChild(tr);
                });
            }

            // Set auto-force posts checkbox state if available
            try {
                const cb = document.getElementById("bots-force-posts-checkbox");
                if (cb) cb.checked = !!status.forcePosts;
            } catch (e) {
                // ignore
            }

            // Attach handlers
            Array.from(document.querySelectorAll(".bot-toggle-btn")).forEach(
                (btn) => {
                    btn.addEventListener("click", async (e) => {
                        const userId =
                            e.currentTarget.getAttribute("data-user-id");
                        const currentlyActive =
                            e.currentTarget.textContent.trim() === "Disable";
                        e.currentTarget.disabled = true;
                        try {
                            await toggleBotActive(userId, !currentlyActive);
                        } catch (err) {
                            alert("Erreur toggling bot");
                        } finally {
                            e.currentTarget.disabled = false;
                            await refresh();
                        }
                    });
                },
            );
        } catch (e) {
            console.error("refresh bots status error", e);
            const msg = e && e.message ? String(e.message) : "Erreur inconnue";
            alert(`Impossible de récupérer le statut des bots: ${msg}`);
        }
    }

    setBtn.addEventListener("click", async () => {
        const v = Number(input.value || 0);
        setBtn.disabled = true;
        try {
            await setActiveBotCount(v);
            await refresh();
        } catch (e) {
            alert("Erreur mise à jour");
        } finally {
            setBtn.disabled = false;
        }
    });

    // Handler to save auto-force posts setting
    const forceCheckbox = document.getElementById("bots-force-posts-checkbox");
    const forceSetBtn = document.getElementById("bots-force-posts-set-btn");
    if (forceSetBtn) {
        forceSetBtn.addEventListener("click", async () => {
            try {
                forceSetBtn.disabled = true;
                const {
                    data: { session },
                } = await supabase.auth.getSession();
                const token = session?.access_token;
                const enabled = !!(forceCheckbox && forceCheckbox.checked);
                const res = await apiFetch("/api/admin/bots/set-force-posts", {
                    method: "POST",
                    headers: {
                        Authorization: token ? `Bearer ${token}` : "",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ enabled }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => "");
                    throw new Error(body || `HTTP ${res.status}`);
                }
                await refresh();
            } catch (e) {
                console.error("set-force-posts error", e);
                alert("Erreur sauvegarde paramètre");
            } finally {
                forceSetBtn.disabled = false;
            }
        });
    }

    refreshBtn.addEventListener("click", refresh);

    const runNowBtn = document.getElementById("bots-run-now-btn");
    const runResultSpan = document.getElementById("bots-run-result");
    runNowBtn.addEventListener("click", async () => {
        runNowBtn.disabled = true;
        const originalText = runNowBtn.textContent;
        runNowBtn.textContent = "Running…";
        runResultSpan.textContent = "";
        try {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            const token = session?.access_token;

            // Le backend run-now est limite par batch (20 par defaut).
            // On enchaine les batches pour couvrir tous les bots actifs.
            const activeFromLabel = parseInt(
                document.getElementById("bots-active-count")?.textContent ||
                    "0",
                10,
            );
            const targetActive = Math.max(
                0,
                Number.isFinite(activeFromLabel) ? activeFromLabel : 0,
            );
            const BATCH_SIZE = 20;
            let remaining = targetActive > 0 ? targetActive : BATCH_SIZE;
            let totalProcessed = 0;
            let totalPosts = 0;
            let totalEncourages = 0;
            let totalFollows = 0;
            let totalViews = 0;
            let batchIndex = 0;
            let offset = 0;

            while (remaining > 0 && batchIndex < 300) {
                const currentLimit = Math.max(
                    1,
                    Math.min(BATCH_SIZE, remaining),
                );
                runResultSpan.textContent = `Batch ${batchIndex + 1} en cours... (${Math.max(remaining, 0)} restant)`;

                const res = await apiFetch("/api/admin/bots/run-now", {
                    method: "POST",
                    headers: {
                        Authorization: token ? `Bearer ${token}` : "",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        force: true,
                        limit: currentLimit,
                        offset,
                    }),
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => "");
                    throw new Error(body || `HTTP ${res.status}`);
                }

                const json = await res.json();
                const processed = Number(json.processed) || 0;
                offset = Number(json.nextOffset) || offset + processed;
                totalProcessed += processed;
                totalPosts += Number(json.posts) || 0;
                totalEncourages += Number(json.encourages) || 0;
                totalFollows += Number(json.follows) || 0;
                totalViews += Number(json.views) || 0;
                remaining -= processed;
                batchIndex += 1;

                if (processed < currentLimit) break;
                await new Promise((resolve) => setTimeout(resolve, 120));
            }

            runResultSpan.textContent = `Processed ${totalProcessed} bots — posts ${totalPosts}, encourages ${totalEncourages}, follows ${totalFollows}, views ${totalViews}`;
            await refresh();
        } catch (err) {
            console.error("run-now error", err);
            runResultSpan.textContent = `Erreur: ${err && err.message ? err.message : "unknown"}`;
        } finally {
            runNowBtn.disabled = false;
            runNowBtn.textContent = originalText;
        }
    });

    // Delete all bots button handler
    const deleteAllBtn = document.getElementById("bots-delete-all-btn");
    if (deleteAllBtn) {
        deleteAllBtn.addEventListener("click", async () => {
            deleteAllBtn.disabled = true;
            const originalText = deleteAllBtn.textContent;
            deleteAllBtn.textContent = "Deleting...";
            runResultSpan.textContent = "";
            try {
                const result = await deleteAllBots();
                if (result && result.success) {
                    runResultSpan.textContent = `Deleted: ${result.deleted?.bots || 0} bots, ${result.deleted?.users || 0} users`;
                }
                // Refresh after delete
                await refresh();
            } catch (err) {
                console.error("delete-all error", err);
                runResultSpan.textContent = `Erreur: ${err && err.message ? err.message : "unknown"}`;
            } finally {
                deleteAllBtn.disabled = false;
                deleteAllBtn.textContent = originalText;
            }
        });
    }

    // Initial load
    await refresh();
    // Auto refresh DISABLED: bots are now stopped. Users can manually refresh or relay on realtime.
    // setInterval(refresh, 60 * 1000);
}

window.renderSuperAdminPage = renderSuperAdminPage;

window.AdminBots = {
    fetchBotStatus,
    setActiveBotCount,
    toggleBotActive,
    deleteAllBots,
    renderSuperAdminPage,
};
