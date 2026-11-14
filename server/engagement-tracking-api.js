/**
 * ENGAGEMENT TRACKING API
 * Endpoints pour tracker les interactions utilisateurs
 * Intégré dans monetization-server.js
 */

module.exports = function setupEngagementTracking(app, supabase) {
    /**
     * POST /api/app/interaction/track
     * Enregistre une interaction utilisateur
     *
     * Body:
     * {
     *   interaction_type: 'view' | 'like' | 'share' | 'comment' | 'bookmark' | 'follow',
     *   target_user_id: UUID,
     *   content_id?: UUID,
     *   content_type?: 'video' | 'stream' | 'profile',
     *   engagement_duration?: number (secondes),
     *   metadata?: object
     * }
     */
    app.post("/api/app/interaction/track", async (req, res) => {
        try {
            const {
                interaction_type,
                target_user_id,
                content_id,
                content_type,
                engagement_duration,
                metadata,
            } = req.body;

            // Validation
            if (!interaction_type || !target_user_id) {
                return res.status(400).json({
                    success: false,
                    error: "interaction_type et target_user_id sont requis",
                });
            }

            // Récupère l'utilisateur actuel
            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (!session || !session.user) {
                return res.status(401).json({
                    success: false,
                    error: "Non authentifié",
                });
            }

            const viewer_id = session.user.id;

            // Enregistre l'interaction
            const { data, error } = await supabase
                .from("user_interactions")
                .insert({
                    viewer_id,
                    target_user_id,
                    interaction_type,
                    content_id: content_id || null,
                    content_type: content_type || null,
                    interaction_data: {
                        engagement_duration,
                        ...metadata,
                    },
                })
                .select();

            if (error) {
                console.error("Interaction tracking error:", error);
                return res.status(500).json({
                    success: false,
                    error: "Erreur lors du tracking",
                });
            }

            // Met à jour les métriques de rétention
            await updateUserRetentionMetrics(supabase, target_user_id);

            // Met à jour l'affinity score
            await updateUserAffinity(supabase, viewer_id, target_user_id);

            return res.json({
                success: true,
                data: data[0],
            });
        } catch (error) {
            console.error("Track interaction error:", error);
            return res.status(500).json({
                success: false,
                error: error?.message || "Erreur serveur",
            });
        }
    });

    /**
     * POST /api/app/interaction/track-batch
     * Enregistre un lot (batch) d'interactions utilisateurs en une seule requête HTTP
     */
    app.post("/api/app/interaction/track-batch", async (req, res) => {
        try {
            const { interactions } = req.body;
            if (!Array.isArray(interactions) || interactions.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: "interactions array requis",
                });
            }

            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (!session || !session.user) {
                return res.status(401).json({
                    success: false,
                    error: "Non authentifié",
                });
            }

            const viewer_id = session.user.id;
            const rows = interactions
                .filter(item => item && item.interaction_type && item.target_user_id)
                .map(item => ({
                    viewer_id,
                    target_user_id: item.target_user_id,
                    interaction_type: item.interaction_type,
                    content_id: item.content_id || null,
                    content_type: item.content_type || null,
                    interaction_data: {
                        engagement_duration: item.engagement_duration,
                        ...item.metadata,
                    },
                }));

            if (rows.length === 0) {
                return res.json({ success: true, count: 0 });
            }

            const { data, error } = await supabase
                .from("user_interactions")
                .insert(rows)
                .select("id");

            if (error) {
                console.error("Batch interaction tracking error:", error);
                return res.status(500).json({
                    success: false,
                    error: "Erreur lors du tracking batch",
                });
            }

            return res.json({
                success: true,
                count: data?.length || 0,
            });
        } catch (error) {
            console.error("Track batch interaction error:", error);
            return res.status(500).json({
                success: false,
                error: error?.message || "Erreur serveur",
            });
        }
    });

    /**
     * POST /api/app/feed/impression
     * Enregistre quand le feed affiche un créateur
     */
    app.post("/api/app/feed/impression", async (req, res) => {
        try {
            const {
                creator_id,
                impression_type,
                position,
                recommendation_score,
            } = req.body;

            if (!creator_id) {
                return res.status(400).json({
                    success: false,
                    error: "creator_id requis",
                });
            }

            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (!session || !session.user) {
                return res.status(401).json({
                    success: false,
                    error: "Non authentifié",
                });
            }

            const { data, error } = await supabase
                .from("feed_impressions")
                .insert({
                    viewer_id: session.user.id,
                    creator_id,
                    impression_type: impression_type || "regular",
                    position: position || 1,
                    recommendation_score: recommendation_score || 0,
                })
                .select();

            if (error) {
                console.error("Feed impression error:", error);
                return res.status(500).json({
                    success: false,
                    error: "Erreur lors du tracking",
                });
            }

            return res.json({
                success: true,
                data: data[0],
            });
        } catch (error) {
            console.error("Feed impression error:", error);
            return res.status(500).json({
                success: false,
                error: error?.message || "Erreur serveur",
            });
        }
    });

    /**
     * POST /api/app/feed/impressions-batch
     * Enregistre un lot (batch) d'impressions de feed en une seule requête HTTP
     */
    app.post("/api/app/feed/impressions-batch", async (req, res) => {
        try {
            const { impressions } = req.body;
            if (!Array.isArray(impressions) || impressions.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: "impressions array requis",
                });
            }

            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (!session || !session.user) {
                return res.status(401).json({
                    success: false,
                    error: "Non authentifié",
                });
            }

            const viewer_id = session.user.id;
            const rows = impressions
                .filter(item => item && item.creator_id)
                .map(item => ({
                    viewer_id,
                    creator_id: item.creator_id,
                    impression_type: item.impression_type || "regular",
                    position: item.position || 1,
                    recommendation_score: item.recommendation_score || 0,
                }));

            if (rows.length === 0) {
                return res.json({ success: true, count: 0 });
            }

            const { data, error } = await supabase
                .from("feed_impressions")
                .insert(rows)
                .select("id");

            if (error) {
                console.error("Batch feed impression error:", error);
                return res.status(500).json({
                    success: false,
                    error: "Erreur lors du tracking batch",
                });
            }

            return res.json({
                success: true,
                count: data?.length || 0,
            });
        } catch (error) {
            console.error("Feed impressions batch error:", error);
            return res.status(500).json({
                success: false,
                error: error?.message || "Erreur serveur",
            });
        }
    });

    /**
     * POST /api/app/content-metrics/update
     * Met à jour les métriques de contenu (engagement score, etc.)
     */
    app.post("/api/app/content-metrics/update", async (req, res) => {
        try {
            const {
                content_id,
                content_type,
                completion_rate,
                engagement_duration,
            } = req.body;

            if (!content_id || !content_type) {
                return res.status(400).json({
                    success: false,
                    error: "content_id et content_type requis",
                });
            }

            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (!session || !session.user) {
                return res.status(401).json({
                    success: false,
                    error: "Non authentifié",
                });
            }

            // Récupère les métriques existantes
            let { data: metrics, error: fetchError } = await supabase
                .from("content_metrics")
                .select("*")
                .eq("content_id", content_id)
                .eq("user_id", session.user.id)
                .eq("period_date", new Date().toISOString().split("T")[0])
                .single();

            if (fetchError && fetchError.code !== "PGRST116") {
                console.error("Fetch metrics error:", fetchError);
            }

            // Calcule engagement_score
            const engagement_score =
                (completion_rate || 0) * 0.6 +
                Math.min((engagement_duration || 0) / 300, 1) * 40;

            if (!metrics) {
                // Crée nouvelle métrique
                const { data, error } = await supabase
                    .from("content_metrics")
                    .insert({
                        content_id,
                        content_type,
                        user_id: session.user.id,
                        completion_rate: completion_rate || 0,
                        avg_watch_time: engagement_duration || 0,
                        engagement_score,
                        view_count: 1,
                    })
                    .select();

                if (error) {
                    throw error;
                }

                return res.json({
                    success: true,
                    data: data[0],
                });
            } else {
                // Met à jour métrique existante
                const { data, error } = await supabase
                    .from("content_metrics")
                    .update({
                        completion_rate:
                            completion_rate || metrics.completion_rate,
                        avg_watch_time:
                            engagement_duration || metrics.avg_watch_time,
                        engagement_score,
                        view_count: (metrics.view_count || 0) + 1,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", metrics.id)
                    .select();

                if (error) {
                    throw error;
                }

                return res.json({
                    success: true,
                    data: data[0],
                });
            }
        } catch (error) {
            console.error("Update metrics error:", error);
            return res.status(500).json({
                success: false,
                error: error?.message || "Erreur serveur",
            });
        }
    });

    /**
     * GET /api/app/engagement/stats/:userId
     * Récupère les stats d'engagement pour un utilisateur
     */
    app.get("/api/app/engagement/stats/:userId", async (req, res) => {
        try {
            const { userId } = req.params;

            const today = new Date().toISOString().split("T")[0];

            // Récupère stats aujourd'hui
            const { data: todayStats, error: statsError } = await supabase
                .from("user_retention_metrics")
                .select("*")
                .eq("user_id", userId)
                .eq("period_date", today)
                .single();

            if (statsError && statsError.code !== "PGRST116") {
                console.error("Fetch stats error:", statsError);
            }

            // Récupère interactions aujourd'hui
            const { data: todayInteractions, error: interactError } =
                await supabase
                    .from("user_interactions")
                    .select("interaction_type, COUNT(*) as count")
                    .eq("target_user_id", userId)
                    .gte(
                        "created_at",
                        new Date(Date.now() - 86400000).toISOString(),
                    )
                    .group_by("interaction_type");

            if (interactError) {
                console.error("Fetch interactions error:", interactError);
            }

            return res.json({
                success: true,
                data: {
                    metrics: todayStats || null,
                    interactions: todayInteractions || [],
                    period: today,
                },
            });
        } catch (error) {
            console.error("Get engagement stats error:", error);
            return res.status(500).json({
                success: false,
                error: error?.message || "Erreur serveur",
            });
        }
    });
};

/**
 * HELPER FUNCTIONS
 */

/**
 * Met à jour les métriques de rétention pour un utilisateur
 */
async function updateUserRetentionMetrics(supabase, userId) {
    try {
        const today = new Date().toISOString().split("T")[0];

        // Compte les visiteurs uniques ce mois-ci
        const { data: monthlyVisitors, error: visitorError } = await supabase
            .from("user_interactions")
            .select("viewer_id", { count: "exact" })
            .eq("target_user_id", userId)
            .gte("created_at", new Date(new Date().setDate(1)).toISOString());

        if (visitorError) {
            console.warn("Error fetching visitors:", visitorError);
        }

        // Compte les visiteurs récurrents
        const { data: repeatVisitors, error: repeatError } = await supabase
            .from("user_interactions")
            .select("viewer_id, COUNT(*) as interaction_count")
            .eq("target_user_id", userId)
            .group_by("viewer_id")
            .having("COUNT(*) > 1");

        if (repeatError) {
            console.warn("Error fetching repeat visitors:", repeatError);
        }

        const totalViewers = monthlyVisitors?.length || 0;
        const repeatViewerCount = repeatVisitors?.length || 0;
        const return_visitor_rate =
            totalViewers > 0 ? (repeatViewerCount / totalViewers) * 100 : 0;

        // Met à jour ou crée la métrique
        const { error: upsertError } = await supabase
            .from("user_retention_metrics")
            .upsert({
                user_id: userId,
                period_date: today,
                return_visitor_count: repeatViewerCount,
                return_visitor_rate,
                total_viewer_sessions: totalViewers,
                updated_at: new Date().toISOString(),
            });

        if (upsertError) {
            console.warn("Error updating retention metrics:", upsertError);
        }
    } catch (error) {
        console.error("Error in updateUserRetentionMetrics:", error);
    }
}

/**
 * Met à jour l'affinity score entre deux utilisateurs
 */
async function updateUserAffinity(supabase, viewerId, creatorId) {
    try {
        // Compte les interactions
        const { data: interactions, error: interactError } = await supabase
            .from("user_interactions")
            .select("interaction_type", { count: "exact" })
            .eq("viewer_id", viewerId)
            .eq("target_user_id", creatorId);

        if (interactError) {
            console.warn("Error fetching interactions:", interactError);
            return;
        }

        const interaction_count = interactions?.length || 0;

        // Calcule affinity_score (basé sur fréquence)
        const affinity_score = Math.min(interaction_count * 10, 100);

        // Upsert affinity record
        const { error: upsertError } = await supabase
            .from("user_affinity")
            .upsert({
                viewer_id: viewerId,
                target_user_id: creatorId,
                interaction_count,
                affinity_score,
                last_interaction: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });

        if (upsertError) {
            console.warn("Error updating affinity:", upsertError);
        }
    } catch (error) {
        console.error("Error in updateUserAffinity:", error);
    }
}
