/**
 * XERA1 RECOMMENDATION ENGINE - Proof of Building
 *
 * Algorithme de recommandation sophistiqué (niveau TikTok/YouTube/Instagram)
 * Objectif: Retenir les utilisateurs avec le meilleur contenu
 *
 * Signaux collectés:
 * - Engagement (views, interactions)
 * - Qualité créateur (followers, badge, monetization)
 * - Fraîcheur du contenu
 * - Affinité utilisateur
 * - Diversité du feed
 */

/**
 * Calcule un score composite pour chaque créateur
 * Score = (engagement_score * 0.4) + (creator_quality * 0.35) + (freshness_score * 0.25)
 */
function calculateEngagementScore(userStats) {
    if (!userStats) return 0;

    const {
        viewCount = 0,
        videoCount = 1,
        supportCount = 0,
        monthlyViewsAvg = 0,
    } = userStats;

    // Évite division par zéro
    const avgViewsPerVideo = videoCount > 0 ? viewCount / videoCount : 0;

    // Score d'engagement normalisé (0-100)
    // Views per video weighted + monthly trend
    const engagementScore =
        Math.min(avgViewsPerVideo / 100, 1) * 60 +
        Math.min(monthlyViewsAvg / 1000, 1) * 40;

    // Bonus pour support/tipping (signal fort d'engagement)
    const supportBonus = Math.min(supportCount * 5, 20);

    return Math.min(engagementScore + supportBonus, 100);
}

/**
 * Évalue la qualité et crédibilité du créateur
 */
function calculateCreatorQuality(user) {
    if (!user) return 0;

    const {
        followers_count = 0,
        badge = null,
        is_monetized = false,
        plan = "free",
        monthly_revenue = 0,
        is_certified = false, // Certification par une page pro
    } = user;

    let qualityScore = 0;

    // Followers (0-40 points)
    const followerScore = Math.min((followers_count / 1000) * 40, 40);
    qualityScore += followerScore;

    // Badge = signal de vérification/crédibilité (0-20 points)
    if (badge === "verified_gold") {
        qualityScore += 20;
    } else if (badge === "verified") {
        qualityScore += 15;
    } else if (badge === "staff") {
        qualityScore += 25;
    } else if (badge === "professional") {
        qualityScore += 20;
    }

    // 3. VÉRIFICATION INSTITUTIONNELLE (Confiance)
    // Boost massif (+30 pts) si déjà certifié "Actif"
    if (is_certified) {
        qualityScore += 30;
    }

    // 4. ABONNEMENT PAYANT (SaaS)
    // Priorité d'affichage (+20 pts) pour les membres Pro
    if (plan === "pro" || plan === "medium" || plan === "standard") {
        qualityScore += 20;
    }

    // Monetization status bonus
    if (is_monetized) {
        qualityScore += 5;
    }

    return qualityScore;
}

/**
 * Bonus de momentum: créateurs consistes et actifs
 * Calcule basé sur la vélocité (Proof of Work)
 * Règle d'or : 1 post/jour = 100% de Momentum. Les builders qui postent plus montent à 200%.
 */
function calculateMomentumBonus(user, userStats = {}) {
    if (!user) return 0;

    const { post_count_7d = 0 } = userStats;

    // Vélocité : (posts sur 7 jours / 7) * 100
    const velocity = (post_count_7d / 7.0) * 100;

    return velocity;
}

/**
 * Calcule le score de diversité
 * Évite trop de créateurs similaires dans le feed
 */
function calculateDiversityPenalty(user, previouslyShownUsers = []) {
    let penalty = 0;

    // Pénalité si créateur déjà dans les résultats
    const duplicateCount = previouslyShownUsers.filter(
        (u) => u.id === user.id,
    ).length;
    if (duplicateCount > 0) {
        penalty += 50; // Grosse pénalité pour duplication
    }

    // Pénalité pour types similaires (account_type, plan tier, etc.)
    const similarCount = previouslyShownUsers.filter((u) => {
        const typeSimilar = u.account_type === user.account_type;
        const planSimilar = u.plan === user.plan;
        return typeSimilar && planSimilar;
    }).length;

    penalty += Math.min(similarCount * 3, 15);

    return penalty;
}

/**
 * Score de rétention utilisateur
 * Priorise les créateurs qui retiennent les viewers
 */
function calculateRetentionScore(userStats) {
    if (!userStats) return 0;

    const {
        return_visitor_rate = 0,
        avg_watch_time = 0,
        repeat_viewer_count = 0,
        total_viewers = 1,
    } = userStats;

    // Taux de visiteurs récurrents
    const retentionScore =
        return_visitor_rate * 40 +
        Math.min((avg_watch_time / 300) * 30, 30) + // 5 min = max
        Math.min((repeat_viewer_count / total_viewers) * 30, 30);

    return Math.min(retentionScore, 100);
}

/**
 * Score de viralité potentielle
 * Basé sur growth rate et engagement velocity
 */
function calculateVirialityScore(userStats) {
    if (!userStats) return 0;

    const {
        weekly_view_growth = 0,
        engagement_velocity = 0, // new views/interactions per hour
        share_count = 0,
    } = userStats;

    // Growth rate (semaine sur semaine)
    const growthScore = Math.min(weekly_view_growth * 20, 40);

    // Velocity of engagement
    const velocityScore = Math.min(engagement_velocity * 10, 30);

    // Share count (signal fort)
    const shareBonus = Math.min(share_count * 2, 30);

    return Math.min(growthScore + velocityScore + shareBonus, 100);
}

/**
 * Score de gravité sociale.
 * Priorise les créateurs dont les preuves déclenchent des actions utiles:
 * validations, témoins, collaborations, partages qui mènent à du follow/signup
 * et nouveaux ARCs inspirés.
 */
function calculateSocialGravityScore(userStats) {
    if (!userStats) return 0;

    const {
        witness_count = 0,
        validation_count = 0,
        collaboration_request_count = 0,
        inspired_arc_count = 0,
        proof_share_count = 0,
        proof_follow_count = 0,
        proof_signup_count = 0,
    } = userStats;

    const witnessScore = Math.min(witness_count * 6, 24);
    const validationScore = Math.min(validation_count * 8, 28);
    const collaborationScore = Math.min(collaboration_request_count * 7, 21);
    const inspiredScore = Math.min(inspired_arc_count * 10, 20);
    const conversionScore = Math.min(
        proof_share_count * 1.5 + proof_follow_count * 5 + proof_signup_count * 8,
        30,
    );

    return Math.min(
        witnessScore +
            validationScore +
            collaborationScore +
            inspiredScore +
            conversionScore,
        100,
    );
}

/**
 * Calcule la pertinence professionnelle
 * Match les compétences du créateur avec les besoins de l'entreprise (viewer)
 * Golden Match : +25 pts si institution finance + builder "cherche investisseurs"
 */
function calculateProfessionalRelevanceScore(user, options = {}) {
    const { enterpriseNeeds = [], enterpriseIndustry = "", enterpriseBio = "" } = options;
    if ((!enterpriseNeeds || enterpriseNeeds.length === 0) && !enterpriseIndustry) return 0;

    const creatorKeywords = [
        ...(user.hashtags || []),
        ...(user.bio ? user.bio.toLowerCase().split(/\W+/) : []),
        ...(user.title ? user.title.toLowerCase().split(/\W+/) : []),
        ...(user.arc_titles ? user.arc_titles.map(t => t.toLowerCase()) : []),
    ];

    let matchScore = 0;
    if (enterpriseNeeds.length > 0) {
        let matchCount = 0;
        enterpriseNeeds.forEach((need) => {
            const normalizedNeed = need.toLowerCase();
            if (creatorKeywords.some((k) => k.includes(normalizedNeed) || normalizedNeed.includes(k))) {
                matchCount++;
            }
        });
        matchScore = Math.min((matchCount / enterpriseNeeds.length) * 30, 30);
    }

    // --- GOLDEN MATCH : SIGNAL VS BRUIT ---
    const isInvestorPage = enterpriseIndustry.toLowerCase().includes("finance") || enterpriseBio.toLowerCase().includes("invest");
    const userIntents = user.opportunity_intents || [];

    if (isInvestorPage && (userIntents.includes("cherche_investissement") || user.bio?.toLowerCase().includes("investisseur"))) {
        matchScore += 25;
    }

    return matchScore;
}

/**
 * SCORE FINAL COMPOSITE - MOMENTUM ENGINE v2
 * Combine tous les signaux avec poids optimisés pour le Momentum
 */
function calculateCompositeScore(user, userStats = {}, options = {}) {
    const {
        previouslyShownUsers = [],
        boostPriority = false,
        boostMonetized = false,
        personalizationFactors = {},
        enterpriseNeeds = [],
        enterpriseIndustry = "",
        enterpriseBio = "",
        fataMultipliers = {}, // user_id -> multiplier
    } = options;

    let score = 0;

    // 1. Momentum Analysis (Velocity) - 40%
    const momentumBonus = calculateMomentumBonus(user, userStats);
    score += momentumBonus * 0.4;

    // 2. Deep Matching (Professional Relevance) - 30%
    const proRelevance = calculateProfessionalRelevanceScore(user, {
        enterpriseNeeds,
        enterpriseIndustry,
        enterpriseBio
    });
    score += proRelevance; // Note: calculateProfessionalRelevanceScore retourne déjà un score pondéré + golden match

    // 3. Creator Quality (Trust & SaaS)
    const creatorQuality = calculateCreatorQuality(user);
    score += creatorQuality; // Contient déjà les boosts Trust (+30) et SaaS (+20)

    // 4. Additional Signals
    // Engagement (15%)
    const engagementScore = calculateEngagementScore(userStats);
    score += engagementScore * 0.15;

    // Rétention (10%)
    const retentionScore = calculateRetentionScore(userStats);
    score += retentionScore * 0.1;

    // Gravité sociale (+10 points max)
    const socialGravityScore = calculateSocialGravityScore(userStats);
    score += socialGravityScore * 0.1;

    // Fata Visibility Boost (Reward 2)
    if (fataMultipliers && fataMultipliers[user.id]) {
        const multiplier = Math.min(5.0, Number(fataMultipliers[user.id]) || 1.0);
        score *= multiplier;
    }

    // Pénalité diversité
    const diversityPenalty = calculateDiversityPenalty(
        user,
        previouslyShownUsers,
    );
    score -= diversityPenalty;

    // Boosts finaux
    if (boostPriority && user.priority_recommendations) {
        score *= 1.2;
    }

    if (personalizationFactors && personalizationFactors.affinity) {
        score *= 1 + personalizationFactors.affinity * 0.1;
    }

    return Math.min(Math.max(score, 0), 100);
}

/**
 * Classe les utilisateurs selon le score composite
 * Mélange déterministe pour éviter la monotonie
 */
function rankUsersIntelligently(users, userStatsMap = {}, options = {}) {
    const {
        limit = 100,
        randomizationFactor = 0.05, // 5% de randomisation pour diversité
        userId = null, // Pour personnalisation
    } = options;

    // Calcule les scores
    const usersWithScores = users.map((user, index) => {
        const userStats = userStatsMap[user.id] || {};

        const score = calculateCompositeScore(user, userStats, {
            boostPriority: options.boostPriority !== false,
            boostMonetized: options.boostMonetized !== false,
            personalizationFactors: options.personalizationFactors || {},
            fataMultipliers: options.fataMultipliers || {},
        });

        return {
            ...user,
            __score: score,
            __index: index,
        };
    });

    // Sort par score (desc)
    usersWithScores.sort((a, b) => b.__score - a.__score);

    // Applique la diversité et la randomisation
    const ranked = [];
    const used = new Set();

    for (let i = 0; i < usersWithScores.length && ranked.length < limit; i++) {
        const user = usersWithScores[i];

        // Calcul de diversité avec les déjà sélectionnés
        const diversityPenalty = calculateDiversityPenalty(user, ranked);
        const adjustedScore = user.__score - diversityPenalty;

        // Randomisation contrôlée (pour éviter déterminisme rigide)
        const randomFactor =
            (Math.random() - 0.5) * randomizationFactor * user.__score;
        const finalScore = adjustedScore + randomFactor;

        user.__adjustedScore = adjustedScore;
        user.__finalScore = finalScore;

        ranked.push(user);
        used.add(user.id);
    }

    // Re-sort après ajustement
    ranked.sort((a, b) => b.__finalScore - a.__finalScore);

    // Retourne sans les props internes
    return ranked.slice(0, limit).map((user) => {
        const { __score, __index, __adjustedScore, __finalScore, ...clean } =
            user;
        return clean;
    });
}

/**
 * Récupère les stats d'engagement pour les utilisateurs
 * (sera mis à jour avec données réelles des tables)
 */
async function fetchUserEngagementStats(supabase, userIds = []) {
    if (!userIds || userIds.length === 0) {
        return {};
    }

    try {
        // Agrège video_views par créateur
        const { data: videoStats, error: videoError } = await supabase
            .from("video_views")
            .select("user_id, view_count, video_duration")
            .in("user_id", userIds)
            .eq("eligible", true);

        if (videoError) {
            console.warn("Error fetching video stats:", videoError);
            return {};
        }

        // Agrège transactions (support, revenue)
        const { data: transactions, error: txError } = await supabase
            .from("transactions")
            .select("user_id, type, amount_gross")
            .in("user_id", userIds);

        if (txError) {
            console.warn("Error fetching transactions:", txError);
        }

        // --- MOMENTUM : VÉLOCITÉ ---
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentPosts, error: postsError } = await supabase
            .from("content")
            .select("author_id")
            .eq("author_type", "USER")
            .in("author_id", userIds)
            .gte("created_at", sevenDaysAgo);

        if (postsError) {
            console.warn("Error fetching recent posts for momentum:", postsError);
        }

        let proofCards = [];
        let socialEvents = [];

        try {
            const { data, error } = await supabase
                .from("proof_cards")
                .select(
                    "created_by, share_count, follow_count, signup_count",
                )
                .in("created_by", userIds);
            if (error) throw error;
            proofCards = data || [];
        } catch (error) {
            console.warn("Error fetching proof card stats:", error?.message || error);
        }

        try {
            const since = new Date(
                Date.now() - 30 * 24 * 60 * 60 * 1000,
            ).toISOString();
            const { data, error } = await supabase
                .from("social_growth_events")
                .select("target_user_id, event_type")
                .in("target_user_id", userIds)
                .gte("created_at", since);
            if (error) throw error;
            socialEvents = data || [];
        } catch (error) {
            console.warn(
                "Error fetching social growth stats:",
                error?.message || error,
            );
        }

        // Build stats map
        const stats = {};

        userIds.forEach((userId) => {
            const userVideos =
                videoStats?.filter((v) => v.user_id === userId) || [];
            const userTransactions =
                transactions?.filter((t) => t.user_id === userId) || [];

            const viewCount = userVideos.reduce(
                (sum, v) => sum + (v.view_count || 0),
                0,
            );
            const videoCount = userVideos.length;
            const supportCount = userTransactions.filter(
                (t) => t.type === "support",
            ).length;
            const monthlyRevenue = userTransactions.reduce(
                (sum, t) => sum + (t.amount_gross || 0),
                0,
            );
            const userProofCards = proofCards.filter(
                (card) => card.created_by === userId,
            );
            const userSocialEvents = socialEvents.filter(
                (event) => event.target_user_id === userId,
            );
            const userRecentPosts =
                recentPosts?.filter((post) => post.author_id === userId) || [];

            const countEvent = (type) =>
                userSocialEvents.filter((event) => event.event_type === type)
                    .length;
            const proofShareCount = userProofCards.reduce(
                (sum, card) => sum + Number(card.share_count || 0),
                0,
            ) + countEvent("proof_card_shared");
            const proofFollowCount = userProofCards.reduce(
                (sum, card) => sum + Number(card.follow_count || 0),
                0,
            ) + countEvent("proof_card_followed");
            const proofSignupCount = userProofCards.reduce(
                (sum, card) => sum + Number(card.signup_count || 0),
                0,
            );

            stats[userId] = {
                viewCount,
                videoCount,
                supportCount,
                post_count_7d: userRecentPosts.length,
                monthlyViewsAvg: videoCount > 0 ? viewCount / videoCount : 0,
                monthly_revenue: monthlyRevenue,
                return_visitor_rate: 0.5, // Placeholder - sera amélioré
                avg_watch_time: 120, // Placeholder
                repeat_viewer_count: 0, // Placeholder
                total_viewers: videoCount || 1,
                weekly_view_growth: 0.1, // Placeholder
                engagement_velocity: 0, // Placeholder
                share_count: proofShareCount,
                proof_share_count: proofShareCount,
                proof_follow_count: proofFollowCount,
                proof_signup_count: proofSignupCount,
                witness_count: countEvent("witness_requested"),
                validation_count: countEvent("milestone_validated"),
                collaboration_request_count: countEvent("co_builder_requested"),
                inspired_arc_count:
                    countEvent("arc_inspiration_started") +
                    countEvent("arc_inspired_created"),
            };
        });

        return stats;
    } catch (error) {
        console.error("Error in fetchUserEngagementStats:", error);
        return {};
    }
}

/**
 * Export des fonctions publiques
 */
module.exports = {
    calculateCompositeScore,
    rankUsersIntelligently,
    fetchUserEngagementStats,
    // Exports pour tests/debug
    calculateEngagementScore,
    calculateCreatorQuality,
    calculateMomentumBonus,
    calculateRetentionScore,
    calculateVirialityScore,
    calculateSocialGravityScore,
};
