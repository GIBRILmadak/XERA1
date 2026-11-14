// Chart.js (~70 Ko) n'est chargé qu'au premier graphique affiché.
const CHART_JS_URL =
    "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
let chartJsPromise = null;

function ensureChartJs() {
    if (typeof window.Chart !== "undefined") return Promise.resolve(window.Chart);
    if (!chartJsPromise) {
        chartJsPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = CHART_JS_URL;
            script.async = true;
            script.onload = () => resolve(window.Chart);
            script.onerror = () => {
                chartJsPromise = null;
                script.remove();
                reject(new Error("Chart.js indisponible"));
            };
            document.head.appendChild(script);
        });
    }
    return chartJsPromise;
}
window.ensureChartJs = ensureChartJs;

/* ========================================
   MOMENTUM ENGINE & INSIGHTS (Algorithmic Power)
   ======================================== */

function calculateMomentum(series, daysInMonth) {
    const successData = series.success || [];
    const activeDays = successData.filter((v) => v > 0).length;
    const totalVolume = successData.reduce((a, b) => a + b, 0);

    if (daysInMonth <= 0)
        return { score: 0, activeDays: 0, totalVolume: 0, consistency: 0 };
    if (activeDays === 0)
        return { score: 0, activeDays: 0, totalVolume: 0, consistency: 0 };

    const frequency = activeDays / daysInMonth;
    const mean = totalVolume / daysInMonth;
    const variance =
        successData.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
        daysInMonth;

    // Consistency: Reward low variance (stable effort)
    const consistency = 1 / (1 + Math.pow(variance, 0.5));

    // Intensity: Bonus for those who do more than just one log
    const avgDaily = totalVolume / activeDays;
    const intensity = Math.min(1.4, 0.5 + avgDaily / 4);

    // Final Momentum Score: Heavy weight on frequency and consistency
    const rawScore = intensity * Math.pow(frequency, 1.5) * consistency * 130;

    return {
        score: Math.min(100, Math.round(rawScore)),
        activeDays,
        totalVolume,
        consistency: Math.round(consistency * 100),
    };
}

function generateInsights(momentum, series) {
    const totalSuccess = series.success.reduce((a, b) => a + b, 0);
    const totalFailure = series.failure.reduce((a, b) => a + b, 0);
    const score = momentum.score;

    const insights = [];

    if (score > 70) {
        insights.push({
            type: "high",
            text: "Impulsion Exceptionnelle. Ta vélocité actuelle dépasse 90% des builders.",
            icon: "🔥",
            command: "Augmente la complexité de tes Traces pour scaler.",
        });
    } else if (score > 40) {
        insights.push({
            type: "mid",
            text: "Progression Stable. Maintiens ce rythme pour consolider ta trajectoire.",
            icon: "📈",
            command:
                "Enregistre une Trace 'Deep Dive' pour inspirer les autres.",
        });
    } else {
        insights.push({
            type: "low",
            text: "Inertie détectée. Une petite action aujourd'hui relancera ton moteur.",
            icon: "🌑",
            command:
                "Poste une Trace rapide (même une simple pensée) maintenant.",
        });
    }

    if (totalFailure > totalSuccess * 0.3) {
        insights.push({
            type: "warning",
            text: "Taux de friction élevé. Analyse tes points de blocage.",
            icon: "⚠️",
            command: "Revois tes milestones, elles sont peut-être trop larges.",
        });
    }

    return insights;
}

/* ========================================
   ANALYTICS MENSUELLES
   ======================================== */

window.analyticsCharts = window.analyticsCharts || {};
window.analyticsShareState = window.analyticsShareState || {};

function getAnalyticsDomIds(containerId) {
    const safeId = String(containerId || "analytics-dashboard").replace(
        /[^a-zA-Z0-9_-]/g,
        "",
    );
    return {
        containerId: containerId || "analytics-dashboard",
        safeId,
        selectId: `month-select-${safeId}`,
        canvasId: `analytics-month-chart-${safeId}`,
        messageId: `analytics-message-${safeId}`,
        shareBtnId: `analytics-share-btn-${safeId}`,
        downloadBtnId: `analytics-download-btn-${safeId}`,
        sharePanelId: `analytics-share-panel-${safeId}`,
    };
}

function cleanupAnalytics(containerId = "analytics-dashboard") {
    const { safeId, containerId: dashId } = getAnalyticsDomIds(containerId);
    const chart = window.analyticsCharts[safeId];
    if (chart) {
        chart.destroy();
        delete window.analyticsCharts[safeId];
    }
    if (window.analyticsShareState && window.analyticsShareState[safeId]) {
        delete window.analyticsShareState[safeId];
    }

    const dashboard = document.getElementById(dashId);
    if (dashboard) {
        dashboard.innerHTML = "";
    }
}

function setAnalyticsMessage(containerId, text, timeoutMs = 2500) {
    const { messageId } = getAnalyticsDomIds(containerId);
    const message = document.getElementById(messageId);
    if (!message) return;
    message.textContent = text || "";
    if (text && timeoutMs) {
        setTimeout(() => {
            if (message.textContent === text) {
                message.textContent = "";
            }
        }, timeoutMs);
    }
}

function notifyAnalytics(containerId, text, type = "info") {
    if (window.ToastManager) {
        if (type === "success") ToastManager.success("Info", text);
        else if (type === "error") ToastManager.error("Erreur", text);
        else ToastManager.info("Info", text);
        return;
    }
    setAnalyticsMessage(containerId, text);
}

function buildAnalyticsShareUrl(userId) {
    try {
        const base = new URL("analytics.html", window.location.href);
        if (userId) base.searchParams.set("user", userId);
        return base.toString();
    } catch (error) {
        return userId
            ? `analytics.html?user=${encodeURIComponent(userId)}`
            : "analytics.html";
    }
}

function formatAnalyticsShareLabel(state) {
    if (!state) return "Analytics XERA1";
    const monthLabel =
        state.year !== undefined && state.monthIndex !== undefined
            ? formatMonthLabel(state.year, state.monthIndex)
            : "";
    const namePart = state.userName ? ` · ${state.userName}` : "";
    return monthLabel
        ? `Analytics ${monthLabel}${namePart}`
        : `Analytics XERA1${namePart}`;
}

function buildSocialShareUrls({ url, text }) {
    const encodedUrl = encodeURIComponent(url || "");
    const encodedText = encodeURIComponent(text || "");
    return {
        x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    };
}

async function copyToClipboard(text) {
    if (!text) return false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (error) {
        console.error("Clipboard error:", error);
    }
    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return ok;
    } catch (error) {
        console.error("Clipboard fallback error:", error);
        return false;
    }
}

function renderAnalyticsSharePanel(containerId, state) {
    const { sharePanelId } = getAnalyticsDomIds(containerId);
    const panel = document.getElementById(sharePanelId);
    if (!panel) return;

    const url = buildAnalyticsShareUrl(state?.userId);
    const label = formatAnalyticsShareLabel(state);
    const text = `Mes analytics${state?.userName ? ` · ${state.userName}` : ""} sur XERA1.`;
    const shareUrls = buildSocialShareUrls({ url, text });

    panel.innerHTML = `
        <button class="analytics-share-action" data-action="copy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72"/>
            </svg>
            Copier le lien
        </button>
        <a class="analytics-share-action" href="${shareUrls.x}" target="_blank" rel="noopener">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-1 5 5 5a11.64 10.64 0 0 1-7 3c5 3 11 0 11-6v-5"/>
            </svg>
            X
        </a>
        <a class="analytics-share-action" href="${shareUrls.linkedin}" target="_blank" rel="noopener">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0 2 2h8"/>
                <rect x="2" y="9" width="4" height="12"/>
                <circle cx="4" cy="4" r="2"/>
            </svg>
            LinkedIn
        </a>
        <a class="analytics-share-action" href="${shareUrls.facebook}" target="_blank" rel="noopener">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h5v8h4v-8h5l-2-4h-3V7a1 1 0 0 1 1-1h3z"/>
            </svg>
            Facebook
        </a>
        <div class="analytics-share-hint">Astuce : télécharge l'image pour la publier directement.</div>
    `;

    const copyBtn = panel.querySelector('[data-action="copy"]');
    if (copyBtn) {
        copyBtn.addEventListener("click", async () => {
            const ok = await copyToClipboard(url);
            notifyAnalytics(
                containerId,
                ok ? "Lien copié !" : "Impossible de copier le lien.",
                ok ? "success" : "error",
            );
        });
    }

    panel.style.display = "flex";
}

async function downloadAnalyticsChart(containerId) {
    const { safeId, canvasId } = getAnalyticsDomIds(containerId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        notifyAnalytics(containerId, "Graphique introuvable.", "error");
        return;
    }
    const state = window.analyticsShareState[safeId] || {};
    const monthLabel =
        state.year !== undefined && state.monthIndex !== undefined
            ? formatMonthLabel(state.year, state.monthIndex)
            : "mois";
    const safeName = (state.userName || "profil")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    const fileName = `analytics-${safeName}-${monthLabel.replace(/\s+/g, "-")}.png`;

    const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png", 0.92),
    );
    if (!blob) {
        notifyAnalytics(containerId, "Impossible de générer l'image.", "error");
        return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notifyAnalytics(containerId, "Image téléchargée.", "success");
}

async function shareAnalyticsChart(containerId) {
    const { safeId, canvasId, sharePanelId } = getAnalyticsDomIds(containerId);
    const canvas = document.getElementById(canvasId);
    const state = window.analyticsShareState[safeId] || {};
    const monthLabel =
        state.year !== undefined && state.monthIndex !== undefined
            ? formatMonthLabel(state.year, state.monthIndex)
            : "";
    const title = monthLabel ? `Analytics · ${monthLabel}` : "Analytics XERA1";
    const text = monthLabel
        ? `Mes analytics de ${monthLabel} sur XERA1.`
        : `Mes analytics sur XERA1.`;
    const url = buildAnalyticsShareUrl(state.userId);

    if (navigator.share) {
        try {
            if (canvas && canvas.toBlob && navigator.canShare) {
                const blob = await new Promise((resolve) =>
                    canvas.toBlob(resolve, "image/png", 0.92),
                );
                if (blob) {
                    const fileName = `analytics-${state.year || "mois"}.png`;
                    const file = new File([blob], fileName, {
                        type: "image/png",
                    });
                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            title,
                            text,
                            url,
                            files: [file],
                        });
                        return;
                    }
                }
            }
            await navigator.share({ title, text, url });
            return;
        } catch (error) {
            console.warn("Web Share cancelled or failed:", error);
        }
    }

    const panel = document.getElementById(sharePanelId);
    if (panel && panel.style.display === "flex") {
        panel.style.display = "none";
        return;
    }
    renderAnalyticsSharePanel(containerId, { ...state, userId: state.userId });
}

function getMonthInfo(dateObj) {
    return {
        year: dateObj.getFullYear(),
        monthIndex: dateObj.getMonth(),
    };
}

function getMonthRange(year, monthIndex) {
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 0);

    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];
    const daysInMonth = end.getDate();

    return { startStr, endStr, daysInMonth };
}

function formatMonthLabel(year, monthIndex) {
    const date = new Date(year, monthIndex, 1);
    return new Intl.DateTimeFormat("fr-FR", {
        month: "long",
        year: "numeric",
    }).format(date);
}

function monthKey(year, monthIndex) {
    const month = String(monthIndex + 1).padStart(2, "0");
    return `${year}-${month}`;
}

function buildMonthList(createdAt) {
    const createdDate = createdAt ? new Date(createdAt) : new Date();
    const now = new Date();

    const start = new Date(
        createdDate.getFullYear(),
        createdDate.getMonth(),
        1,
    );
    const end = new Date(now.getFullYear(), now.getMonth(), 1);

    const months = [];
    const cursor = new Date(start);

    while (cursor <= end) {
        const year = cursor.getFullYear();
        const monthIndex = cursor.getMonth();
        months.push({
            year,
            monthIndex,
            key: monthKey(year, monthIndex),
            label: formatMonthLabel(year, monthIndex),
        });
        cursor.setMonth(cursor.getMonth() + 1);
    }

    return months;
}

async function getMonthlyMetrics(userId, year, monthIndex) {
    try {
        const { startStr, endStr } = getMonthRange(year, monthIndex);
        const { data, error } = await supabase
            .from("daily_metrics")
            .select("date, success_count, failure_count, pause_count")
            .eq("user_id", userId)
            .gte("date", startStr)
            .lte("date", endStr)
            .order("date", { ascending: true });

        if (error) throw error;

        return { success: true, metrics: data || [] };
    } catch (error) {
        console.error("Erreur récupération métriques mensuelles:", error);
        return { success: false, error: error.message };
    }
}

async function getMonthlyLiveHours(userId, year, monthIndex) {
    try {
        const LIVE_PRESENCE_STALE_MS = 45000;
        const monthStart = new Date(year, monthIndex, 1, 0, 0, 0, 0);
        const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
        const endIso = monthEnd.toISOString();
        const startIso = monthStart.toISOString();

        const { data, error } = await supabase
            .from("streaming_sessions")
            .select("id, started_at, ended_at")
            .eq("user_id", userId)
            .lte("started_at", endIso)
            .or(`ended_at.gte.${startIso},ended_at.is.null`);

        if (error) throw error;

        const nowMs = Date.now();
        const sessionIds = (data || [])
            .map((session) => session?.id)
            .filter(Boolean);
        const hostLastSeenByStreamId = new Map();
        let presenceQueryFailed = false;

        if (sessionIds.length > 0) {
            const { data: presenceRows, error: presenceError } = await supabase
                .from("stream_viewers")
                .select("stream_id, last_seen")
                .eq("user_id", userId)
                .in("stream_id", sessionIds);

            if (presenceError) {
                presenceQueryFailed = true;
            } else if (Array.isArray(presenceRows)) {
                presenceRows.forEach((row) => {
                    if (!row?.stream_id || !row?.last_seen) return;
                    const ts = new Date(row.last_seen).getTime();
                    if (!Number.isFinite(ts)) return;
                    const prev = hostLastSeenByStreamId.get(row.stream_id) || 0;
                    if (ts > prev) {
                        hostLastSeenByStreamId.set(row.stream_id, ts);
                    }
                });
            }
        }

        const durations = Array(monthEnd.getDate()).fill(0);
        (data || []).forEach((session) => {
            if (!session.started_at) return;
            const start = new Date(session.started_at);
            const explicitEndMs = session.ended_at
                ? new Date(session.ended_at).getTime()
                : 0;
            const hostLastSeenMs = hostLastSeenByStreamId.get(session.id) || 0;
            let effectiveEndMs = explicitEndMs;

            if (!Number.isFinite(effectiveEndMs) || effectiveEndMs <= 0) {
                if (hostLastSeenMs > 0) {
                    // If heartbeat is still fresh, consider the stream active now.
                    effectiveEndMs =
                        nowMs - hostLastSeenMs <= LIVE_PRESENCE_STALE_MS
                            ? nowMs
                            : hostLastSeenMs;
                } else if (presenceQueryFailed) {
                    // Keep legacy behavior if presence lookup temporarily fails.
                    effectiveEndMs = nowMs;
                } else {
                    // No reliable presence info: avoid infinite growth of orphan sessions.
                    effectiveEndMs = 0;
                }
            }

            if (!effectiveEndMs) return;
            const end = new Date(effectiveEndMs);
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
                return;

            const clampedStart = start < monthStart ? monthStart : start;
            const clampedEnd = end > monthEnd ? monthEnd : end;
            if (clampedEnd <= clampedStart) return;

            let cursor = new Date(clampedStart);
            while (cursor < clampedEnd) {
                const dayIndex = cursor.getDate() - 1;
                if (dayIndex < 0 || dayIndex >= durations.length) break;
                const dayEnd = new Date(cursor);
                dayEnd.setHours(23, 59, 59, 999);
                const segmentEnd = clampedEnd < dayEnd ? clampedEnd : dayEnd;
                const durationMs = segmentEnd - cursor;
                if (durationMs > 0) durations[dayIndex] += durationMs;
                cursor = new Date(dayEnd.getTime() + 1);
            }
        });

        const liveHours = durations.map((ms) =>
            ms > 0 ? Math.ceil(ms / 3600000) : 0,
        );
        return { success: true, liveHours };
    } catch (error) {
        console.error("Erreur récupération heures live:", error);
        return { success: false, error: error.message };
    }
}

function buildSeries(metrics, daysInMonth, liveHours = []) {
    const success = Array(daysInMonth).fill(0);
    const failure = Array(daysInMonth).fill(0);
    const pause = Array(daysInMonth).fill(0);
    const live = Array(daysInMonth).fill(0);

    metrics.forEach((m) => {
        if (!m.date) return;
        const parts = m.date.split("-");
        if (parts.length !== 3) return;
        const day = parseInt(parts[2], 10);
        if (!day || day < 1 || day > daysInMonth) return;
        const idx = day - 1;
        success[idx] += m.success_count || 0;
        failure[idx] += m.failure_count || 0;
        pause[idx] += m.pause_count || 0;
    });

    if (Array.isArray(liveHours) && liveHours.length) {
        for (let i = 0; i < daysInMonth; i++) {
            live[i] = Number(liveHours[i]) || 0;
        }
    }

    return { success, failure, pause, live };
}

async function getAccountAnalysis(userId) {
    const readTable = async (table, columns, configure = () => {}) => {
        try {
            let query = supabase.from(table).select(columns);
            query = configure(query) || query;
            const result = await query;
            return result.error ? [] : result.data || [];
        } catch (error) {
            console.warn(`Analytics: table ${table} indisponible`, error);
            return [];
        }
    };

    const [
        content,
        followers,
        encouragements,
        transactions,
        notifications,
        sessions,
        pages,
    ] = await Promise.all([
        readTable(
            "content",
            "id, views, type, title, description, media_url, created_at",
            (query) => query.eq("user_id", userId),
        ),
        readTable("followers", "follower_id, following_id", (query) =>
            query.eq("following_id", userId),
        ),
        readTable(
            "content_encouragements",
            "id, content_id, created_at",
            (query) => query.eq("user_id", userId),
        ),
        readTable(
            "transactions",
            "amount_net_creator, amount_gross, type, status, created_at",
            (query) => query.eq("to_user_id", userId),
        ),
        readTable("notifications", "id, type, created_at", (query) =>
            query.eq("user_id", userId),
        ),
        readTable("streaming_sessions", "id, started_at, ended_at", (query) =>
            query.eq("user_id", userId),
        ),
        readTable("professional_pages", "id, name, created_at", (query) =>
            query.eq("owner_id", userId),
        ),
    ]);

    const publishedContent = content.filter((item) => item.type !== "draft");
    const successfulDonations = transactions.filter(
        (item) => item.status === "succeeded" && item.type === "support",
    );
    const totalViews = content.reduce(
        (sum, item) => sum + Number(item.views || 0),
        0,
    );
    const totalDonations = successfulDonations.reduce(
        (sum, item) => sum + Number(item.amount_net_creator || 0),
        0,
    );
    const totalHours = sessions.reduce((sum, item) => {
        if (!item.started_at || !item.ended_at) return sum;
        const duration =
            new Date(item.ended_at).getTime() -
            new Date(item.started_at).getTime();
        return duration > 0 ? sum + duration / 3600000 : sum;
    }, 0);
    const activeDays = new Set(
        content
            .map((item) => String(item.created_at || "").slice(0, 10))
            .filter(Boolean),
    ).size;
    const mediaContent = content.filter((item) => getAnalyticsMedia(item));
    const topContent = [...mediaContent]
        .sort((a, b) => Number(b.views || 0) - Number(a.views || 0))
        .slice(0, 5);
    const maxViews = Math.max(
        ...topContent.map((item) => Number(item.views || 0)),
        1,
    );

    return {
        followers: followers.length,
        contentCount: publishedContent.length,
        totalViews,
        averageViews: publishedContent.length
            ? Math.round(totalViews / publishedContent.length)
            : 0,
        encouragements: encouragements.length,
        donations: totalDonations,
        donationCount: successfulDonations.length,
        notifications: notifications.length,
        liveSessions: sessions.length,
        liveHours: Math.round(totalHours * 10) / 10,
        professionalPages: pages.length,
        activeDays,
        topContent: topContent.map((item) => ({
            ...item,
            percent: Math.round((Number(item.views || 0) / maxViews) * 100),
        })),
    };
}

function getAnalyticsMedia(content) {
    if (!content) return null;
    const mediaUrls = Array.isArray(content.media_urls)
        ? content.media_urls
        : typeof content.media_urls === "string"
          ? (() => {
                try {
                    const parsed = JSON.parse(content.media_urls);
                    return Array.isArray(parsed) ? parsed : [];
                } catch (error) {
                    return [];
                }
            })()
          : [];
    const url = mediaUrls.find(Boolean) || content.media_url || "";
    if (!url && !content.thumbnail_url) return null;
    return {
        url: url || content.thumbnail_url,
        thumbnail: content.thumbnail_url || url,
        isVideo: /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url),
    };
}

function renderAccountAnalysis(analysis, containerId = "analytics-dashboard") {
    const dashboard = document.getElementById(containerId);
    if (!dashboard) return;
    const shell = dashboard.querySelector(".analytics-prestige-container");
    if (!shell) return;
    const formatNumber = (value) => Number(value || 0).toLocaleString("fr-FR");
    const formatCurrency = (value) =>
        new Intl.NumberFormat("fr-FR", {
            style: "currency",
            currency: "USD",
        }).format(value || 0);
    const topContent = analysis.topContent.length
        ? analysis.topContent
              .map((item, index) => {
                  const media = getAnalyticsMedia(item);
                  const mediaHtml = media.isVideo
                      ? `<video class="account-content-media" src="${escapeAnalyticsHtml(media.url)}" poster="${escapeAnalyticsHtml(media.thumbnail)}" muted playsinline preload="metadata"></video>`
                      : `<img class="account-content-media" src="${escapeAnalyticsHtml(media.url)}" alt="${escapeAnalyticsHtml(item.title || "Contenu populaire")}" loading="lazy" decoding="async">`;
                  return `
            <article class="account-top-content-card">
                <div class="account-content-media-wrap">
                    ${mediaHtml}
                    <span class="account-content-rank">0${index + 1}</span>
                    <span class="account-content-type">${escapeAnalyticsHtml(item.type || "media")}</span>
                </div>
                <div class="account-top-content-card-copy">
                    <strong>${escapeAnalyticsHtml(item.title || item.description || "Contenu sans titre")}</strong>
                    <span>${formatNumber(item.views)} vues</span>
                    <span class="account-content-bar"><i style="width:${item.percent}%"></i></span>
                </div>
            </article>`;
              })
              .join("")
        : `<p class="account-empty-state">Publiez du contenu pour faire apparaître vos meilleures performances.</p>`;

    let section = dashboard.querySelector(".account-analysis-section");
    if (!section) {
        section = document.createElement("section");
        section.className = "account-analysis-section";
        const momentumGrid = shell.querySelector(".momentum-grid");
        shell.insertBefore(section, momentumGrid || shell.firstChild);
    }
    section.innerHTML = `
        <div class="account-analysis-heading">
            <div><span class="analytics-eyebrow">Vue d'ensemble</span><h2>La santé de votre compte</h2><p>Une lecture complète de votre activité, votre audience et votre impact.</p></div>
            <span class="account-analysis-live"><i></i> Données du compte</span>
        </div>
        <div class="account-kpi-grid">
            <article class="account-kpi account-kpi-coral"><span class="account-kpi-icon">◒</span><div><span>Audience</span><strong>${formatNumber(analysis.followers)}</strong><small>abonnés</small></div></article>
            <article class="account-kpi account-kpi-blue"><span class="account-kpi-icon">◈</span><div><span>Portée cumulée</span><strong>${formatNumber(analysis.totalViews)}</strong><small>${formatNumber(analysis.averageViews)} vues / publication</small></div></article>
            <article class="account-kpi account-kpi-green"><span class="account-kpi-icon">♥</span><div><span>Dons reçus</span><strong>${formatCurrency(analysis.donations)}</strong><small>${formatNumber(analysis.donationCount)} soutien${analysis.donationCount !== 1 ? "s" : ""}</small></div></article>
            <article class="account-kpi account-kpi-ink"><span class="account-kpi-icon">↗</span><div><span>Régularité</span><strong>${formatNumber(analysis.activeDays)}</strong><small>jours actifs détectés</small></div></article>
        </div>
        <div class="account-analysis-columns">
            <article class="account-insight-panel account-breakdown-panel"><div class="account-panel-heading"><div><span class="account-panel-label">Écosystème</span><h3>Les signaux de votre présence</h3></div><span class="account-panel-total">${formatNumber(analysis.contentCount)} contenus</span></div>
                <div class="account-breakdown-list">
                    <div><span><b class="signal-dot signal-coral"></b>Publications</span><strong>${formatNumber(analysis.contentCount)}</strong></div>
                    <div><span><b class="signal-dot signal-blue"></b>Encouragements donnés</span><strong>${formatNumber(analysis.encouragements)}</strong></div>
                    <div><span><b class="signal-dot signal-green"></b>Sessions live</span><strong>${formatNumber(analysis.liveSessions)} <small>${analysis.liveHours} h</small></strong></div>
                    <div><span><b class="signal-dot signal-ink"></b>Pages professionnelles</span><strong>${formatNumber(analysis.professionalPages)}</strong></div>
                    <div><span><b class="signal-dot signal-gold"></b>Notifications reçues</span><strong>${formatNumber(analysis.notifications)}</strong></div>
                </div>
            </article>
            <article class="account-insight-panel account-top-content-panel"><div class="account-panel-heading"><div><span class="account-panel-label">Performance éditoriale</span><h3>Vos contenus les plus vus</h3></div><span class="account-panel-total">Top 5</span></div><div class="account-top-content-list">${topContent}</div></article>
        </div>`;
}

function escapeAnalyticsHtml(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        (character) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[character],
    );
}

function renderDashboardShell(
    months,
    selectedKey,
    containerId = "analytics-dashboard",
) {
    const domIds = getAnalyticsDomIds(containerId);
    const safeId = domIds.safeId;
    const dashId = domIds.containerId;
    const selectId = domIds.selectId;
    const canvasId = domIds.canvasId;
    const messageId = domIds.messageId;
    const shareBtnId = domIds.shareBtnId;
    const downloadBtnId = domIds.downloadBtnId;
    const sharePanelId = domIds.sharePanelId;

    const dashboard = document.getElementById(dashId);
    if (!dashboard) return;
    const showShareActions = containerId === "analytics-dashboard";

    const options = months
        .map((m) => {
            const selected = m.key === selectedKey ? "selected" : "";
            return `<option value="${m.key}" ${selected}>${m.label}</option>`;
        })
        .join("");

    const momentumId = `momentum-insight-${safeId}`;

    dashboard.innerHTML = `
        <div class="analytics-prestige-container">
            <div class="analytics-header-redesign">
                <div class="header-left">
                    <span class="analytics-eyebrow">Intelligence de Trajectoire</span>
                    <h1>Performance Mensuelle</h1>
                </div>
                <div class="analytics-controls-prestige">
                    <select id="${selectId}" class="prestige-select">
                        ${options}
                    </select>
                    ${
                        showShareActions
                            ? `
                        <div class="analytics-chart-actions">
                            <button class="analytics-action-btn" id="${downloadBtnId}" title="Télécharger">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                    <polyline points="7,10 12,15 17,10"/>
                                    <line x1="12" y1="15" x2="12" y2="3"/>
                                </svg>
                                <span>Télécharger</span>
                            </button>
                            <button class="analytics-action-btn" id="${shareBtnId}" title="Partager">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.09 5.18 2 2 0 0 1 5.11 3h3"/>
                                    <path d="M13 11l5-5-5-5"/>
                                </svg>
                                <span>Partager</span>
                            </button>
                        </div>
                    `
                            : ""
                    }
                </div>
            </div>

            <div id="${momentumId}" class="momentum-grid">
                <!-- Dynamiquement injecté par renderMonth -->
            </div>

            ${showShareActions ? `<div id="${sharePanelId}" class="analytics-share-panel" style="display:none;"></div>` : ""}

            <div class="chart-prestige-wrap">
                <canvas id="${canvasId}" height="320"></canvas>
            </div>

            <div id="${messageId}" class="analytics-system-message"></div>
        </div>
    `;
}

function renderMonthlyChart({
    year,
    monthIndex,
    daysInMonth,
    series,
    containerId,
}) {
    if (typeof window.Chart === "undefined") {
        ensureChartJs()
            .then(() =>
                renderMonthlyChart({
                    year,
                    monthIndex,
                    daysInMonth,
                    series,
                    containerId,
                }),
            )
            .catch((error) => console.warn(error.message));
        return;
    }
    const domIds = getAnalyticsDomIds(containerId);
    const safeId = domIds.safeId;
    const canvasId = domIds.canvasId;
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const maxValue = Math.max(
        ...series.success,
        ...series.failure,
        ...series.pause,
        ...series.live,
        0,
    );
    // Dynamic scale: align chart height to the highest daily vector/value.
    const yMax = maxValue > 0 ? maxValue : 1;

    if (window.analyticsCharts[safeId]) {
        window.analyticsCharts[safeId].destroy();
    }

    window.analyticsCharts[safeId] = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "Succès",
                    data: series.success,
                    borderColor: "#10b981",
                    backgroundColor: "rgba(139, 92, 246, 0.12)",
                    tension: 0.3,
                },
                {
                    label: "Échecs",
                    data: series.failure,
                    borderColor: "#ef4444",
                    backgroundColor: "rgba(239, 68, 68, 0.12)",
                    tension: 0.3,
                },
                {
                    label: "Pauses",
                    data: series.pause,
                    borderColor: "#6366f1",
                    backgroundColor: "rgba(99, 102, 241, 0.12)",
                    tension: 0.3,
                },
                {
                    label: "Live (heures)",
                    data: series.live,
                    borderColor: "#a855f7",
                    backgroundColor: "rgba(168, 85, 247, 0.12)",
                    tension: 0.3,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: "#ffffff",
                    },
                },
                title: {
                    display: true,
                    text: formatMonthLabel(year, monthIndex),
                    color: "#ffffff",
                    font: {
                        size: 16,
                        weight: "700",
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: yMax,
                    ticks: {
                        color: "#ffffff",
                        stepSize: 1,
                    },
                    grid: {
                        color: "rgba(255,255,255,0.08)",
                    },
                },
                x: {
                    ticks: {
                        color: "#ffffff",
                    },
                    grid: {
                        color: "rgba(255,255,255,0.08)",
                    },
                },
            },
        },
    });

    const existing = window.analyticsShareState[safeId] || {};
    window.analyticsShareState[safeId] = {
        ...existing,
        year,
        monthIndex,
        daysInMonth,
    };
}

async function renderMonth(
    userId,
    year,
    monthIndex,
    containerId = "analytics-dashboard",
) {
    const { messageId } = getAnalyticsDomIds(containerId);
    const message = document.getElementById(messageId);
    if (message) {
        message.textContent = "Calcul de la vélocité...";
    }

    const { daysInMonth } = getMonthRange(year, monthIndex);
    const metricsResult = await getMonthlyMetrics(userId, year, monthIndex);
    const liveResult = await getMonthlyLiveHours(userId, year, monthIndex);

    if (!metricsResult.success) {
        if (message) {
            message.textContent = "Erreur lors du chargement des données.";
        }
        return;
    }

    const liveHours = liveResult.success
        ? liveResult.liveHours
        : Array(daysInMonth).fill(0);
    const series = buildSeries(metricsResult.metrics, daysInMonth, liveHours);

    renderMonthlyChart({ year, monthIndex, daysInMonth, series, containerId });

    // --- Momentum & Insights Integration ---
    const momentum = calculateMomentum(series, daysInMonth);
    const insights = generateInsights(momentum, series);
    const { safeId } = getAnalyticsDomIds(containerId);
    const momentumId = `momentum-insight-${safeId}`;

    const momentumSection = document.getElementById(momentumId);
    if (momentumSection) {
        momentumSection.innerHTML = `
            <div class="momentum-card-prestige">
                <div class="momentum-visual">
                    <svg viewBox="0 0 36 36" class="circular-chart">
                        <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path class="circle" stroke-dasharray="${momentum.score}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    </svg>
                    <div class="momentum-score-overlay">
                        <div class="momentum-score-value">${momentum.score}</div>
                        <div class="momentum-score-label">Momentum Score</div>
                    </div>
                </div>
                <div class="momentum-info">
                    <span class="momentum-label">Basé sur ${momentum.activeDays} jours d'activité</span>
                    <p class="momentum-desc">Consistance: ${momentum.consistency}%</p>
                </div>
            </div>
            <div class="insights-container-prestige">
                ${insights
                    .map(
                        (insight) => `
                    <div class="insight-pill insight-${insight.type}">
                        <div class="insight-main">
                            <span class="insight-icon">${insight.icon}</span>
                            <span class="insight-text">${insight.text}</span>
                        </div>
                        ${insight.command ? `<div class="insight-command">COMMAND: ${insight.command}</div>` : ""}
                    </div>
                `,
                    )
                    .join("")}
            </div>
        `;
    }

    const total =
        series.success.reduce((a, b) => a + b, 0) +
        series.failure.reduce((a, b) => a + b, 0) +
        series.pause.reduce((a, b) => a + b, 0) +
        series.live.reduce((a, b) => a + b, 0);

    if (message) {
        message.textContent = total === 0 ? "Aucune donnée pour ce mois." : "";
    }
}

async function renderAnalyticsDashboard(user, options = {}) {
    if (!user) return;

    const userId = user.id;
    const containerId = options.containerId || "analytics-dashboard";
    const months = buildMonthList(user.created_at);
    const nowInfo = getMonthInfo(new Date());
    const currentKey = monthKey(nowInfo.year, nowInfo.monthIndex);

    renderDashboardShell(months, currentKey, containerId);
    const accountAnalysis = await getAccountAnalysis(userId);
    renderAccountAnalysis(accountAnalysis, containerId);

    const { safeId, selectId, shareBtnId, downloadBtnId } =
        getAnalyticsDomIds(containerId);
    window.analyticsShareState[safeId] = {
        ...(window.analyticsShareState[safeId] || {}),
        userId,
        userName: user.name || user.username || "Profil",
    };
    const select = document.getElementById(selectId);
    if (!select) return;

    const getSelectedMonth = () => {
        const [yearStr, monthStr] = select.value.split("-");
        const year = parseInt(yearStr, 10);
        const monthIndex = parseInt(monthStr, 10) - 1;
        return { year, monthIndex };
    };

    select.addEventListener("change", () => {
        const { year, monthIndex } = getSelectedMonth();
        renderMonth(userId, year, monthIndex, containerId);
    });

    const shareBtn = document.getElementById(shareBtnId);
    if (shareBtn) {
        shareBtn.addEventListener("click", () =>
            shareAnalyticsChart(containerId),
        );
    }
    const downloadBtn = document.getElementById(downloadBtnId);
    if (downloadBtn) {
        downloadBtn.addEventListener("click", () =>
            downloadAnalyticsChart(containerId),
        );
    }

    const { year, monthIndex } = getSelectedMonth();
    await renderMonth(userId, year, monthIndex, containerId);
}

async function renderProfileAnalytics(userId) {
    if (!userId) return;
    const container = document.getElementById("profile-analytics");
    if (!container) return;

    const user = typeof getUser === "function" ? getUser(userId) : null;
    const userData = user || { id: userId };

    await renderAnalyticsDashboard(userData, {
        containerId: "profile-analytics",
    });
}

window.cleanupAnalytics = cleanupAnalytics;
window.renderAnalyticsDashboard = renderAnalyticsDashboard;
window.renderProfileAnalytics = renderProfileAnalytics;
