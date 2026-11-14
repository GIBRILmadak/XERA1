/**
 * XERA1 ENGAGEMENT TRACKER - CLIENT SIDE
 *
 * Collecte les interactions utilisateurs et les envoie à l'API
 * À intégrer dans le feed immersif et autres pages
 */

class XERAEngagementTracker {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || "/api";
        this.batchSize = options.batchSize || 10;
        this.flushInterval = options.flushInterval || 30000; // 30 secondes
        this.queue = [];
        this.sessionId = this.generateSessionId();
        this.userId = options.userId || null;

        // Start auto-flush
        this.startAutoFlush();

        console.log(
            "[XERAEngagementTracker] Initialized with session:",
            this.sessionId,
        );
    }

    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Enregistre une interaction utilisateur
     */
    async trackInteraction(interaction) {
        const {
            type, // 'view' | 'like' | 'share' | 'comment' | 'bookmark' | 'follow'
            targetUserId,
            contentId = null,
            contentType = null,
            duration = 0,
            metadata = {},
        } = interaction;

        if (!type || !targetUserId) {
            console.warn("[XERAEngagementTracker] Missing required fields");
            return;
        }

        const payload = {
            interaction_type: type,
            target_user_id: targetUserId,
            content_id: contentId,
            content_type: contentType,
            engagement_duration: duration,
            metadata: {
                ...metadata,
                sessionId: this.sessionId,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
            },
        };

        // Ajoute à la queue pour batch
        this.queue.push(payload);

        // Flush si batch est plein
        if (this.queue.length >= this.batchSize) {
            this.flush();
        }
    }

    /**
     * Enregistre une vue de créateur dans le feed
     */
    async trackFeedImpression(impression) {
        const {
            creatorId,
            impressionType = "regular", // 'immersive' | 'regular' | 'discover'
            position = 1,
            recommendationScore = 0,
        } = impression;

        if (!creatorId) {
            console.warn("[XERAEngagementTracker] Missing creatorId");
            return;
        }

        try {
            const response = await fetch(
                `${this.baseUrl}/app/feed/impression`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        creator_id: creatorId,
                        impression_type: impressionType,
                        position,
                        recommendation_score: recommendationScore,
                    }),
                },
            );

            if (!response.ok) {
                console.warn(
                    "[XERAEngagementTracker] Feed impression failed:",
                    response.status,
                );
            }
        } catch (error) {
            console.error(
                "[XERAEngagementTracker] Feed impression error:",
                error,
            );
        }
    }

    /**
     * Enregistre les métriques de contenu (watch time, completion, etc.)
     */
    async trackContentMetrics(metrics) {
        const {
            contentId,
            contentType,
            completionRate = 0, // 0-100
            engagementDuration = 0, // en secondes
        } = metrics;

        if (!contentId || !contentType) {
            console.warn("[XERAEngagementTracker] Missing content fields");
            return;
        }

        try {
            const response = await fetch(
                `${this.baseUrl}/app/content-metrics/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        content_id: contentId,
                        content_type: contentType,
                        completion_rate: completionRate,
                        engagement_duration: engagementDuration,
                    }),
                },
            );

            if (!response.ok) {
                console.warn(
                    "[XERAEngagementTracker] Content metrics failed:",
                    response.status,
                );
            }
        } catch (error) {
            console.error(
                "[XERAEngagementTracker] Content metrics error:",
                error,
            );
        }
    }

    /**
     * Envoie la queue d'interactions au serveur en un seul batch
     */
    async flush() {
        if (this.queue.length === 0) return;

        const batch = this.queue.splice(0, this.batchSize);

        try {
            const response = await fetch(
                `${this.baseUrl}/app/interaction/track-batch`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    credentials: "include",
                    body: JSON.stringify({ interactions: batch }),
                },
            );

            if (!response.ok) {
                console.warn(
                    "[XERAEngagementTracker] Batch interaction failed:",
                    response.status,
                );
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error("[XERAEngagementTracker] Flush error:", error);
            // Re-ajoute à la queue en cas d'erreur
            this.queue.unshift(...batch);
        }
    }

    /**
     * Envoie une interaction individuelle
     */
    async sendInteraction(interaction) {
        try {
            const response = await fetch(
                `${this.baseUrl}/app/interaction/track`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    credentials: "include",
                    body: JSON.stringify(interaction),
                },
            );

            if (!response.ok) {
                console.warn(
                    "[XERAEngagementTracker] Interaction failed:",
                    response.status,
                );
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error(
                "[XERAEngagementTracker] Send interaction error:",
                error,
            );
        }
    }

    /**
     * Récupère les stats d'engagement pour un utilisateur
     */
    async getEngagementStats(userId) {
        try {
            const response = await fetch(
                `${this.baseUrl}/app/engagement/stats/${userId}`,
                {
                    method: "GET",
                    credentials: "include",
                },
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return data.data;
        } catch (error) {
            console.error("[XERAEngagementTracker] Get stats error:", error);
            return null;
        }
    }

    /**
     * Démarre le flush automatique
     */
    startAutoFlush() {
        this.flushInterval = setInterval(() => {
            this.flush();
        }, this.flushInterval);
    }

    /**
     * Arrête le tracker
     */
    stop() {
        clearInterval(this.flushInterval);
        this.flush(); // Flush avant d'arrêter
    }

    /**
     * Enregistre les utilisateurs vus dans le feed en une seule requête batch
     */
    async trackFeedUsers(users, impressionType = "regular") {
        if (!Array.isArray(users) || users.length === 0) return;

        const impressions = users
            .filter((user) => user && user.id)
            .map((user, index) => ({
                creator_id: user.id,
                impression_type: impressionType,
                position: index + 1,
                recommendation_score: user.recommendationScore || 0,
            }));

        if (impressions.length === 0) return;

        try {
            const response = await fetch(
                `${this.baseUrl}/app/feed/impressions-batch`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    credentials: "include",
                    body: JSON.stringify({ impressions }),
                },
            );

            if (!response.ok) {
                console.warn(
                    "[XERAEngagementTracker] Feed impressions batch failed:",
                    response.status,
                );
            }
        } catch (error) {
            console.error(
                "[XERAEngagementTracker] Feed impressions batch error:",
                error,
            );
        }
    }
}

// Export global
window.XERAEngagementTracker = XERAEngagementTracker;

// Auto-init si window.currentUserId exists
document.addEventListener("DOMContentLoaded", () => {
    if (window.currentUserId && !window.engagementTracker) {
        window.engagementTracker = new XERAEngagementTracker({
            userId: window.currentUserId,
        });
        console.log("[XERAEngagementTracker] Auto-initialized");
    }
});

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
    if (window.engagementTracker) {
        window.engagementTracker.stop();
    }
});
