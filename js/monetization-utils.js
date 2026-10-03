/* ========================================
   MONETIZATION UTILITIES - Fonctions utilitaires pour la monétisation
   ======================================== */

/**
 * Vérifie et met à jour le statut de monétisation d'un utilisateur
 * Cette fonction peut être appelée périodiquement ou après des changements
 */
async function refreshMonetizationStatus(userId) {
    try {
        // Récupérer les données actuelles de l'utilisateur
        const { data: user, error } = await supabase
            .from("users")
            .select("plan, plan_status, plan_ends_at, followers_count")
            .eq("id", userId)
            .single();

        if (error || !user) {
            console.error("Error fetching user:", error);
            return { success: false, error: error?.message };
        }

        // Calculer le nouveau statut
        const planEnd = user.plan_ends_at || null;
        const planEndMs = planEnd ? Date.parse(planEnd) : null;
        const activeByDate =
            !planEnd ||
            (Number.isFinite(planEndMs) ? planEndMs > Date.now() : true);

        const isGiftedPro =
            user.plan === "pro" && user.plan_status === "active" && !planEnd;

        const canBeMonetized =
            isGiftedPro ||
            (["medium", "pro"].includes(user.plan) &&
                user.plan_status === "active" &&
                activeByDate);

        // Mettre à jour si nécessaire
        const { data: updated, error: updateError } = await supabase
            .from("users")
            .update({
                is_monetized: canBeMonetized,
                updated_at: new Date().toISOString(),
            })
            .eq("id", userId)
            .select()
            .single();

        if (updateError) {
            console.error("Error updating monetization status:", updateError);
            return { success: false, error: updateError.message };
        }

        return {
            success: true,
            data: {
                is_monetized: canBeMonetized,
                plan: user.plan,
                followers_count: user.followers_count,
            },
        };
    } catch (error) {
        console.error("Exception in refreshMonetizationStatus:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Met à jour le compteur de followers et recalcule le statut de monétisation
 * À appeler quand un utilisateur gagne ou perd des followers
 */
async function updateFollowersAndMonetization(userId, newFollowerCount) {
    try {
        const { data, error } = await supabase
            .from("users")
            .update({
                followers_count: newFollowerCount,
                updated_at: new Date().toISOString(),
            })
            .eq("id", userId)
            .select()
            .single();

        if (error) {
            console.error("Error updating followers:", error);
            return { success: false, error: error.message };
        }

        // Le trigger SQL va automatiquement mettre à jour is_monetized
        return { success: true, data };
    } catch (error) {
        console.error("Exception in updateFollowersAndMonetization:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Récupère les statistiques complètes d'un créateur pour le dashboard
 */
async function getCreatorDashboardStats(creatorId, period = "30") {
    try {
        const promises = [
            // Revenus totaux
            calculateCreatorRevenue(creatorId),
            // Stats vidéo
            getCreatorVideoStats(creatorId, period),
            // Transactions récentes
            getCreatorTransactions(creatorId, { limit: 5 }),
            // Payouts
            getCreatorVideoPayouts(creatorId, { limit: 5 }),
        ];

        const [revenue, videoStats, transactions, payouts] =
            await Promise.all(promises);

        return {
            success: true,
            data: {
                revenue: revenue.data || {},
                videoStats: videoStats.data || {},
                recentTransactions: transactions.data || [],
                recentPayouts: payouts.data || [],
            },
        };
    } catch (error) {
        console.error("Exception in getCreatorDashboardStats:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Calcule les revenus prévisionnels pour le mois en cours
 */
async function getProjectedRevenue(creatorId) {
    try {
        // Récupérer les données du mois en cours
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const { data: transactions, error: txError } = await supabase
            .from("transactions")
            .select("amount_net_creator, type, created_at")
            .eq("to_user_id", creatorId)
            .eq("status", "succeeded")
            .gte("created_at", startOfMonth.toISOString());

        if (txError) {
            console.error(
                "Error fetching current month transactions:",
                txError,
            );
        }

        const { data: videoViews, error: viewError } = await supabase
            .from("video_views")
            .select("view_count, eligible, video_duration")
            .eq("creator_id", creatorId)
            .eq("period_month", startOfMonth.toISOString().slice(0, 7) + "-01")
            .eq("eligible", true);

        if (viewError) {
            console.error("Error fetching video views:", viewError);
        }

        // Calculer les revenus actuels du mois
        let currentMonthRevenue = 0;
        let currentMonthSupport = 0;
        let currentMonthVideo = 0;

        if (transactions) {
            transactions.forEach((tx) => {
                const amount = parseFloat(tx.amount_net_creator || 0);
                currentMonthRevenue += amount;
                if (tx.type === "support") {
                    currentMonthSupport += amount;
                } else if (tx.type === "video_rpm") {
                    currentMonthVideo += amount;
                }
            });
        }

        // Calculer les revenus vidéo en cours
        let videoViewsCount = 0;
        if (videoViews) {
            videoViewsCount = videoViews.reduce((sum, v) => {
                const duration = Number.parseFloat(v.video_duration || 0);
                if (!Number.isFinite(duration) || duration <= 60) return sum;
                return sum + (v.view_count || 0);
            }, 0);
        }
        const pendingVideoRevenue = (videoViewsCount / 1000) * 0.4 * 0.8; // 80% net

        // Projeter sur le mois complet (approximation simple)
        const dayOfMonth = now.getDate();
        const daysInMonth = new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0,
        ).getDate();
        const projectionFactor = daysInMonth / dayOfMonth;

        const projectedSupport = currentMonthSupport * projectionFactor;
        const projectedTotal = projectedSupport + pendingVideoRevenue;

        return {
            success: true,
            data: {
                currentMonth: {
                    total: currentMonthRevenue,
                    support: currentMonthSupport,
                    video: currentMonthVideo,
                },
                pending: {
                    videoViews: videoViewsCount,
                    videoRevenue: pendingVideoRevenue,
                },
                projected: {
                    monthTotal: projectedTotal,
                    support: projectedSupport,
                },
            },
        };
    } catch (error) {
        console.error("Exception in getProjectedRevenue:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Vérifie si un contenu est éligible à la monétisation vidéo
 */
function isContentMonetizable(content) {
    // Vidéo de plus de 60 secondes
    if (content.type !== "video") return false;
    const duration = Number.parseFloat(content.duration || 0);
    if (!Number.isFinite(duration) || duration <= 60) return false;

    // Le créateur doit être monétisé
    if (!content.user_id) return false;

    return true;
}

/**
 * Formate un nombre de followers
 */
function formatFollowersCount(count) {
    if (!count) return "0";
    if (count >= 1000000) {
        return (count / 1000000).toFixed(1) + "M";
    }
    if (count >= 1000) {
        return (count / 1000).toFixed(1) + "K";
    }
    return count.toString();
}

/**
 * Formate une durée en secondes vers un format lisible
 */
function formatDuration(seconds) {
    if (!seconds) return "0:00";

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours}:${remainingMinutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    }

    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/**
 * Génère un résumé de progression vers la monétisation
 */
function generateMonetizationProgress(user) {
    if (!user) return null;

    const planEnd = user.plan_ends_at || user.planEndsAt || null;
    const planEndMs = planEnd ? Date.parse(planEnd) : null;
    const activeByDate =
        !planEnd ||
        (Number.isFinite(planEndMs) ? planEndMs > Date.now() : true);

    const requirements = [
        {
            name: "Abonnement actif",
            met:
                ["medium", "pro"].includes(user.plan) &&
                user.plan_status === "active" &&
                activeByDate,
            icon: "fa-crown",
            description: "Plan Medium ou Pro requis",
        },
        {
            name: "Compte KPay",
            met:
                user.is_monetized === true ||
                (user.plan_status === "active" && activeByDate),
            icon: "fa-credit-card",
            description: "Compte de paiement vérifié",
        },
    ];

    const allMet = requirements.every((r) => r.met);
    const metCount = requirements.filter((r) => r.met).length;

    return {
        canMonetize: allMet,
        progress: (metCount / requirements.length) * 100,
        requirements,
        nextStep: requirements.find((r) => !r.met)?.name || null,
    };
}

/**
 * Crée une entrée de log d'audit
 */
async function createAuditLog(
    userId,
    action,
    entityType,
    entityId,
    oldValues,
    newValues,
) {
    try {
        const { error } = await supabase
            .from("monetization_audit_logs")
            .insert({
                user_id: userId,
                action,
                entity_type: entityType,
                entity_id: entityId,
                old_values: oldValues,
                new_values: newValues,
                ip_address: null, // À remplir côté serveur si possible
                user_agent: navigator.userAgent,
            });

        if (error) {
            console.error("Error creating audit log:", error);
        }
    } catch (error) {
        console.error("Exception in createAuditLog:", error);
    }
}

/**
 * Récupère l'historique complet d'un créateur
 */
async function getCreatorHistory(creatorId, options = {}) {
    try {
        const { startDate, endDate, limit = 50 } = options;

        // Récupérer les transactions et payouts
        const [transactionsResult, payoutsResult] = await Promise.all([
            supabase
                .from("transactions")
                .select("*")
                .eq("to_user_id", creatorId)
                .order("created_at", { ascending: false })
                .limit(limit),
            supabase
                .from("video_payouts")
                .select("*")
                .eq("creator_id", creatorId)
                .order("period_month", { ascending: false })
                .limit(limit),
        ]);

        // Fusionner et trier
        const history = [
            ...(transactionsResult.data || []).map((t) => ({
                type: "transaction",
                date: t.created_at,
                data: t,
            })),
            ...(payoutsResult.data || []).map((p) => ({
                type: "payout",
                date: p.created_at,
                data: p,
            })),
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        return {
            success: true,
            data: history.slice(0, limit),
        };
    } catch (error) {
        console.error("Exception in getCreatorHistory:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Exporte les données de revenus pour un créateur (format CSV/JSON)
 */
async function exportRevenueData(creatorId, format = "json") {
    try {
        const { data: transactions, error } = await supabase
            .from("transactions")
            .select("*")
            .eq("to_user_id", creatorId)
            .eq("status", "succeeded")
            .order("created_at", { ascending: true });

        if (error) {
            return { success: false, error: error.message };
        }

        if (format === "csv") {
            // Générer CSV
            const headers = [
                "Date",
                "Type",
                "Montant Brut",
                "Commission",
                "Net",
                "Description",
            ];
            const rows = (transactions || []).map((t) => [
                new Date(t.created_at).toISOString(),
                t.type,
                t.amount_gross,
                t.amount_commission_xera,
                t.amount_net_creator,
                `"${t.description || ""}"`, // Échapper les quotes
            ]);

            const csv = [
                headers.join(","),
                ...rows.map((r) => r.join(",")),
            ].join("\n");
            return { success: true, data: csv, format: "csv" };
        }

        return { success: true, data: transactions, format: "json" };
    } catch (error) {
        console.error("Exception in exportRevenueData:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Télécharge les données d'export
 */
function downloadExport(data, filename, format) {
    const blob = new Blob([data], {
        type: format === "csv" ? "text/csv;charset=utf-8;" : "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ========================================
// EXPORTS
// ========================================

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        refreshMonetizationStatus,
        updateFollowersAndMonetization,
        getCreatorDashboardStats,
        getProjectedRevenue,
        isContentMonetizable,
        formatFollowersCount,
        formatDuration,
        generateMonetizationProgress,
        createAuditLog,
        getCreatorHistory,
        exportRevenueData,
        downloadExport,
    };
}
