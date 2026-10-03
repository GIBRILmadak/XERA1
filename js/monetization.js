/* ========================================
   MONÉTISATION XERA1 - Gestion des abonnements, paiements et revenus
   ======================================== */

// Configuration des plans
const PLANS = {
    STANDARD: {
        id: "PLAN_STANDARD",
        name: "Standard",
        price: 2.99,
        currency: "USD",
        features: [
            "Badge de vérification bleu",
            "Historique complet et public",
            "Priorité dans le feed Discover",
            "Avatar/Bannière GIF autorisés",
            "Notifications automatiques aux followers",
        ],
        canReceiveTips: false,
    },
    MEDIUM: {
        id: "PLAN_MEDIUM",
        name: "Medium",
        price: 7.99,
        currency: "USD",
        features: [
            "Tous les avantages Standard",
            "Badge Medium",
            "Fonctionnalités de monétisation",
            "Soutiens de la communauté (dons)",
            "Avatar/Bannière GIF autorisés",
            "Notifications automatiques aux followers",
            "Statistiques détaillées des revenus",
            "Personnalisation avancée du profil",
            "Badge de créateur vérifié",
            "Priorité dans les recommandations",
        ],
        canReceiveTips: true,
        minFollowers: 1000,
        exclusiveFeatures: {
            detailedAnalytics: true,
            advancedProfileCustomization: true,
            verifiedCreatorBadge: true,
            priorityRecommendations: true,
        },
    },
    PRO: {
        id: "PLAN_PRO",
        name: "Pro",
        price: 14.99,
        currency: "USD",
        features: [
            "Tous les avantages Medium",
            "Badge Gold",
            "Analytics avancés",
            "Lives en HD",
            "Lives privés réservés aux followers",
            "Outils de collaboration avancés",
            "Accès anticipé aux nouvelles fonctionnalités",
            "Personnalisation complète de la page profil",
            "Statistiques en temps réel",
            "Export des données et rapports détaillés",
            "Visibilité maximale dans Discover",
        ],
        canReceiveTips: true,
        minFollowers: 1000,
        exclusiveFeatures: {
            advancedCollaborationTools: true,
            earlyAccessFeatures: true,
            fullProfileCustomization: true,
            realtimeAnalytics: true,
            dataExportReports: true,
            maximumDiscoverVisibility: true,
        },
    },
    ELITE: {
        id: "PLAN_ELITE",
        name: "Elite Access",
        price: 40.0,
        currency: "USD",
        features: [
            "Recherche illimitée par domaine",
            "Profils certifiés uniquement",
            "Contact direct illimité",
            "Filtres avancés du Momentum Engine",
            "Support prioritaire 24/7",
            "Badge Recruteur Gold (Annuel)",
            "Rapports de tendances trimestriels",
            "Accès complet au Talent Explorer",
        ],
        canReceiveTips: true,
        minFollowers: 0,
        exclusiveFeatures: {
            talentExplorer: true,
            monthlyAnalytics: true,
            advancedCollaborationTools: true,
            fullProfileCustomization: true,
            realtimeAnalytics: true,
            dataExportReports: true,
            maximumDiscoverVisibility: true,
        },
    },
};

// Règles de paiement (KPay uniquement)
const PAYMENT_RULES = {
    commissionRate: 0.25,
    minTipAmount: 1.0,
    maxTipAmount: 1000.0,
};

const MONETIZATION_TRANSIENT_NETWORK_PATTERNS = [
    "failed to fetch",
    "networkerror",
    "network changed",
    "err_network_changed",
    "internet disconnected",
    "err_internet_disconnected",
    "connection closed",
    "err_connection_closed",
    "connection reset",
    "err_connection_reset",
    "name not resolved",
    "err_name_not_resolved",
    "load failed",
];

function getMonetizationErrorText(error) {
    if (!error) return "";
    if (typeof error === "string") return error;
    return [error.message, error.details, error.hint, error.code]
        .filter(Boolean)
        .join(" | ");
}

function isTransientMonetizationNetworkError(error) {
    if (!error) return false;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return true;
    }
    const text = getMonetizationErrorText(error).toLowerCase();
    return MONETIZATION_TRANSIENT_NETWORK_PATTERNS.some((pattern) =>
        text.includes(pattern),
    );
}

function normalizeMonetizationQueryError(error) {
    if (error && typeof error === "object") {
        return error;
    }
    return {
        message: String(error || "Erreur réseau inconnue."),
        details: "",
        hint: "",
        code: "",
    };
}

/* ========================================
   FONCTIONS UTILITAIRES
   ======================================== */

function isPlanActiveForUser(user) {
    if (!user) return false;
    const status = String(user.plan_status || "").toLowerCase();
    if (status !== "active") return false;
    const planEnd = user.plan_ends_at || user.planEndsAt || null;
    if (!planEnd) return true;
    const endMs = Date.parse(planEnd);
    if (!Number.isFinite(endMs)) return true;
    return endMs > Date.now();
}

function getNormalizedUserPlan(user) {
    return String(user?.plan || "").toLowerCase();
}

function getFollowerCountFromUser(user) {
    const rawCount = user?.followers_count ?? user?.followersCount ?? 0;
    const count = Number.parseInt(rawCount, 10);
    return Number.isFinite(count) ? count : 0;
}

function hasMonetizationFlag(user) {
    return user?.is_monetized === true || user?.isMonetized === true;
}

function hasActiveMonetizationPlan(user) {
    const plan = getNormalizedUserPlan(user);
    return (
        ["medium", "pro", "elite"].includes(plan) && isPlanActiveForUser(user)
    );
}

// Vérifier si l'utilisateur peut utiliser la personnalisation avancée du profil (Medium+)
function hasAdvancedProfileCustomization(user) {
    if (!user) return false;
    const plan = getNormalizedUserPlan(user);
    // Medium, Pro et Elite ont accès à la personnalisation avancée
    return (
        ["medium", "pro", "elite"].includes(plan) && isPlanActiveForUser(user)
    );
}

// Vérifier si l'utilisateur peut utiliser la personnalisation complète du profil (Pro+)
function hasFullProfileCustomization(user) {
    if (!user) return false;
    const plan = getNormalizedUserPlan(user);
    return ["pro", "elite"].includes(plan) && isPlanActiveForUser(user);
}

// Vérifier si l'utilisateur a accès aux lives en HD (Pro+)
function hasHDStreaming(user) {
    if (!user) return false;
    const plan = getNormalizedUserPlan(user);
    return ["pro", "elite"].includes(plan) && isPlanActiveForUser(user);
}

// Vérifier si l'utilisateur peut créer des lives privés (Pro+)
function hasPrivateLiveAccess(user) {
    if (!user) return false;
    const plan = getNormalizedUserPlan(user);
    return ["pro", "elite"].includes(plan) && isPlanActiveForUser(user);
}

// Vérifier si l'utilisateur a accès aux outils de collaboration avancés (Pro+)
function hasAdvancedCollaborationTools(user) {
    if (!user) return false;
    const plan = getNormalizedUserPlan(user);
    return ["pro", "elite"].includes(plan) && isPlanActiveForUser(user);
}

// Vérifier si l'utilisateur a accès aux statistiques en temps réel (Pro+)
function hasRealtimeAnalytics(user) {
    if (!user) return false;
    const plan = getNormalizedUserPlan(user);
    return ["pro", "elite"].includes(plan) && isPlanActiveForUser(user);
}

// Vérifier si l'utilisateur peut exporter des données et rapports (Pro+)
function hasDataExport(user) {
    if (!user) return false;
    const plan = getNormalizedUserPlan(user);
    return ["pro", "elite"].includes(plan) && isPlanActiveForUser(user);
}

// Vérifier si l'utilisateur a une visibilité maximale dans Discover (Pro+)
function hasMaximumDiscoverVisibility(user) {
    if (!user) return false;
    const plan = getNormalizedUserPlan(user);
    return ["pro", "elite"].includes(plan) && isPlanActiveForUser(user);
}

// Obtenir le plan requis pour une fonctionnalité
function getRequiredPlanForFeature(feature) {
    const featurePlans = {
        advanced_profile_customization: "medium",
        full_profile_customization: "pro",
        hd_streaming: "pro",
        private_live: "pro",
        advanced_collaboration: "pro",
        realtime_analytics: "pro",
        data_export: "pro",
        maximum_visibility: "pro",
        talent_explorer: "elite",
    };
    return featurePlans[feature] || null;
}

// Obtenir le message de plan requis pour une fonctionnalité
function getPlanRequiredMessage(feature) {
    const messages = {
        advanced_profile_customization: {
            title: "Personnalisation avancée du profil",
            required: "Medium",
            current: "Standard",
            message:
                "Passez au plan Medium pour débloquer la personnalisation avancée du profil.",
        },
        full_profile_customization: {
            title: "Personnalisation complète du profil",
            required: "Pro",
            current: "Standard ou Medium",
            message:
                "Passez au plan Pro pour débloquer la personnalisation complète du profil.",
        },
        hd_streaming: {
            title: "Streaming HD",
            required: "Pro",
            current: "Standard ou Medium",
            message:
                "Passez au plan Pro pour débloquer le streaming en qualité HD.",
        },
        private_live: {
            title: "Lives privés",
            required: "Pro",
            current: "Standard ou Medium",
            message:
                "Passez au plan Pro pour débloquer les lives privés réservés à vos followers.",
        },
        advanced_collaboration: {
            title: "Outils de collaboration avancés",
            required: "Pro",
            current: "Standard ou Medium",
            message:
                "Passez au plan Pro pour débloquer les outils de collaboration avancés.",
        },
        realtime_analytics: {
            title: "Statistiques en temps réel",
            required: "Pro",
            current: "Standard ou Medium",
            message:
                "Passez au plan Pro pour débloquer les statistiques en temps réel.",
        },
        data_export: {
            title: "Export des données",
            required: "Pro",
            current: "Standard ou Medium",
            message:
                "Passez au plan Pro pour débloquer l'export des données et rapports détaillés.",
        },
        maximum_visibility: {
            title: "Visibilité maximale",
            required: "Pro",
            current: "Standard ou Medium",
            message:
                "Passez au plan Pro pour débloquer la visibilité maximale dans Discover.",
        },
    };
    return messages[feature] || null;
}

// Vérifier si l'utilisateur peut activer une fonctionnalité (avec vérification de plan)
function canActivateFeature(user, feature) {
    const requiredPlan = getRequiredPlanForFeature(feature);
    if (!requiredPlan) return true;

    const currentPlan = getNormalizedUserPlan(user);
    const planHierarchy = ["free", "standard", "medium", "pro", "elite"];
    const requiredIndex = planHierarchy.indexOf(requiredPlan);
    const currentIndex = planHierarchy.indexOf(currentPlan);

    return currentIndex >= requiredIndex && isPlanActiveForUser(user);
}

// Activer automatiquement les fonctionnalités Premium pour les utilisateurs avec abonnement actif
async function autoEnablePremiumFeatures(userId) {
    if (!userId) return { success: false, error: "User ID manquant" };

    try {
        // Récupérer le profil utilisateur actuel
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("*")
            .eq("id", userId)
            .single();

        if (userError) throw userError;
        if (!user) return { success: false, error: "Utilisateur non trouvé" };

        const plan = getNormalizedUserPlan(user);
        const isActive = isPlanActiveForUser(user);

        if (!isActive)
            return {
                success: true,
                message: "Plan inactif, aucune fonctionnalité activée",
            };

        // Préparer les mises à jour selon le plan
        const updates = {
            updated_at: new Date().toISOString(),
        };

        // Standard: déjà des fonctionnalités de base
        if (plan === "standard") {
            // Standard n'a pas de fonctionnalités Premium supplémentaires
        }

        // Medium: activer les fonctionnalités Medium
        if (plan === "medium") {
            updates.advanced_profile_customization = true;
            updates.priority_recommendations = true;
        }

        // Pro: activer toutes les fonctionnalités
        if (plan === "pro" || plan === "elite") {
            updates.advanced_profile_customization = true;
            updates.full_profile_customization = true;
            updates.hd_streaming = true;
            updates.private_live = true;
            updates.advanced_collab_tools = true;
            updates.realtime_analytics = true;
            updates.data_export = true;
            updates.maximum_visibility = true;
            updates.priority_recommendations = true;
        }

        // Appliquer les mises à jour
        const { data: updatedUser, error: updateError } = await supabase
            .from("users")
            .update(updates)
            .eq("id", userId)
            .select()
            .single();

        if (updateError) throw updateError;

        console.log(
            "Fonctionnalités Premium activées automatiquement pour:",
            userId,
            "Plan:",
            plan,
        );

        return {
            success: true,
            user: updatedUser,
            activatedFeatures: updates,
        };
    } catch (error) {
        console.error("Erreur activation automatique premium:", error);
        return { success: false, error: error.message };
    }
}

// Désactiver une fonctionnalité spécifique pour un utilisateur
async function disablePremiumFeature(userId, feature) {
    if (!userId || !feature)
        return { success: false, error: "Paramètres manquants" };

    try {
        const featureMap = {
            advanced_profile_customization: "advanced_profile_customization",
            full_profile_customization: "full_profile_customization",
            hd_streaming: "hd_streaming",
            private_live: "private_live",
            advanced_collaboration: "advanced_collab_tools",
            realtime_analytics: "realtime_analytics",
            data_export: "data_export",
            maximum_visibility: "maximum_visibility",
        };

        const dbField = featureMap[feature];
        if (!dbField)
            return { success: false, error: "Fonctionnalité invalide" };

        const { data, error } = await supabase
            .from("users")
            .update({
                [dbField]: false,
                updated_at: new Date().toISOString(),
            })
            .eq("id", userId)
            .select()
            .single();

        if (error) throw error;

        return { success: true, user: data };
    } catch (error) {
        console.error("Erreur désactivation fonctionnalité:", error);
        return { success: false, error: error.message };
    }
}

// Activer une fonctionnalité spécifique pour un utilisateur (si le plan le permet)
async function enablePremiumFeature(userId, feature) {
    if (!userId || !feature)
        return { success: false, error: "Paramètres manquants" };

    try {
        // Vérifier d'abord le plan
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("*")
            .eq("id", userId)
            .single();

        if (userError) throw userError;

        // Vérifier si l'utilisateur peut activer cette fonctionnalité
        if (!canActivateFeature(user, feature)) {
            const msg = getPlanRequiredMessage(feature);
            return {
                success: false,
                error: msg?.message || "Plan requis pour cette fonctionnalité",
            };
        }

        const featureMap = {
            advanced_profile_customization: "advanced_profile_customization",
            full_profile_customization: "full_profile_customization",
            hd_streaming: "hd_streaming",
            private_live: "private_live",
            advanced_collaboration: "advanced_collab_tools",
            realtime_analytics: "realtime_analytics",
            data_export: "data_export",
            maximum_visibility: "maximum_visibility",
        };

        const dbField = featureMap[feature];
        if (!dbField)
            return { success: false, error: "Fonctionnalité invalide" };

        const { data, error } = await supabase
            .from("users")
            .update({
                [dbField]: true,
                updated_at: new Date().toISOString(),
            })
            .eq("id", userId)
            .select()
            .single();

        if (error) throw error;

        return { success: true, user: data };
    } catch (error) {
        console.error("Erreur activation fonctionnalité:", error);
        return { success: false, error: error.message };
    }
}

// Afficher le prompt de mise à niveau
function showPlanUpgradePrompt(feature) {
    const msg = getPlanRequiredMessage(feature);
    if (!msg) return;

    if (window.ToastManager) {
        ToastManager.info(
            `${msg.title} - Plan ${msg.required} requis`,
            msg.message,
            8000,
        );
    } else {
        alert(
            `${msg.title}\n\n${msg.message}\n\nPlan actuel: ${msg.current}\nPlan requis: ${msg.required}`,
        );
    }

    // Optionnel: rediriger vers la page des plans
    if (
        confirm(
            `Voulez-vous voir les plans disponibles pour débloquer "${msg.title}" ?`,
        )
    ) {
        window.location.href = "subscription-plans.html";
    }
}

function getMonetizationFollowerGap(user) {
    return Math.max(0, 1000 - getFollowerCountFromUser(user));
}

// Vérifier si un créateur peut recevoir des soutiens
function canReceiveSupport(user) {
    if (!user) return false;
    if (!hasActiveMonetizationPlan(user)) return false;
    if (isGiftedPro(user)) return true;
    if (["medium", "pro"].includes(getNormalizedUserPlan(user))) return true;
    return hasMonetizationFlag(user) || getFollowerCountFromUser(user) >= 1000;
}

// Vérifier si un créateur a un plan Pro offert par un admin
function isGiftedPro(user) {
    if (!user) return false;
    const plan = String(user.plan || "").toLowerCase();
    const status = String(user.plan_status || "").toLowerCase();
    const planEnd = user.plan_ends_at || user.planEndsAt || null;
    return plan === "pro" && status === "active" && !planEnd;
}

// Obtenir le plan actuel de l'utilisateur
function getUserPlan(user) {
    if (!user || !user.plan) return PLANS.FREE;
    return PLANS[user.plan.toUpperCase()] || PLANS.FREE;
}

// Formater un montant en devise
function formatCurrency(amount, currency = "USD") {
    return new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: currency,
    }).format(amount);
}

/* ========================================
   FONCTIONS SUPABASE - ABONNEMENTS
   ======================================== */

// Récupérer l'abonnement actif d'un utilisateur
async function getUserActiveSubscription(userId) {
    try {
        const { data, error } = await supabase
            .from("subscriptions")
            .select("*")
            .eq("user_id", userId)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== "PGRST116") {
            console.error("Erreur récupération abonnement:", error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data };
    } catch (error) {
        console.error("Exception récupération abonnement:", error);
        return { success: false, error: error.message };
    }
}

// Récupérer l'historique des abonnements
async function getUserSubscriptionHistory(userId) {
    try {
        const { data, error } = await supabase
            .from("subscriptions")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Erreur récupération historique:", error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data || [] };
    } catch (error) {
        console.error("Exception historique abonnements:", error);
        return { success: false, error: error.message };
    }
}

// Mettre à jour le plan d'un utilisateur
async function updateUserPlan(userId, plan, status = "active") {
    try {
        const { data, error } = await supabase
            .from("users")
            .update({
                plan: plan,
                plan_status: status,
                updated_at: new Date().toISOString(),
            })
            .eq("id", userId)
            .select()
            .single();

        if (error) {
            console.error("Erreur mise à jour plan:", error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data };
    } catch (error) {
        console.error("Exception mise à jour plan:", error);
        return { success: false, error: error.message };
    }
}

// Mettre à jour le compteur de followers et recalculer le statut de monétisation
async function updateFollowersCount(userId, count) {
    try {
        const { data, error } = await supabase
            .from("users")
            .update({
                followers_count: count,
                updated_at: new Date().toISOString(),
            })
            .eq("id", userId)
            .select()
            .single();

        if (error) {
            console.error("Erreur mise à jour followers:", error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data };
    } catch (error) {
        console.error("Exception mise à jour followers:", error);
        return { success: false, error: error.message };
    }
}

/* ========================================
   FONCTIONS SUPABASE - TRANSACTIONS
   ======================================== */

// Créer une transaction (soutien)
async function createSupportTransaction(
    fromUserId,
    toUserId,
    amount,
    description = "",
) {
    try {
        // Vérifier que le créateur peut recevoir des soutiens
        const { data: creator } = await getUserProfile(toUserId);
        if (!canReceiveSupport(creator.data)) {
            return {
                success: false,
                error: "Ce créateur ne peut pas recevoir de soutiens. Il doit avoir un plan Medium ou Pro actif.",
            };
        }

        // Vérifier les limites de montant
        if (
            amount < PAYMENT_RULES.minTipAmount ||
            amount > PAYMENT_RULES.maxTipAmount
        ) {
            return {
                success: false,
                error: `Le montant doit être entre ${PAYMENT_RULES.minTipAmount} et ${PAYMENT_RULES.maxTipAmount} USD`,
            };
        }

        const { data, error } = await supabase
            .from("transactions")
            .insert({
                from_user_id: fromUserId,
                to_user_id: toUserId,
                type: "support",
                amount_gross: amount,
                status: "pending",
                description: description,
                currency: "USD",
            })
            .select()
            .single();

        if (error) {
            console.error("Erreur création transaction:", error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data };
    } catch (error) {
        console.error("Exception création transaction:", error);
        return { success: false, error: error.message };
    }
}

// Récupérer les transactions reçues par un créateur
async function getCreatorTransactions(creatorId, options = {}) {
    try {
        let query = supabase
            .from("transactions")
            .select("*")
            .eq("to_user_id", creatorId)
            .eq("status", "succeeded");

        // Filtrer par type
        if (options.type) {
            query = query.eq("type", options.type);
        }

        // Filtrer par période
        if (options.startDate) {
            query = query.gte("created_at", options.startDate);
        }
        if (options.endDate) {
            query = query.lte("created_at", options.endDate);
        }

        // Ordonner et limiter
        query = query.order("created_at", { ascending: false });

        if (options.limit) {
            query = query.limit(options.limit);
        }

        const { data, error } = await query;

        if (error) {
            if (!isTransientMonetizationNetworkError(error)) {
                console.error("Erreur récupération transactions:", error);
            }
            return {
                success: false,
                error: normalizeMonetizationQueryError(error),
            };
        }

        return { success: true, data: data || [] };
    } catch (error) {
        if (!isTransientMonetizationNetworkError(error)) {
            console.error("Exception récupération transactions:", error);
        }
        return {
            success: false,
            error: normalizeMonetizationQueryError(error),
        };
    }
}

// Récupérer les transactions envoyées par un utilisateur
async function getSentTransactions(userId, options = {}) {
    try {
        let query = supabase
            .from("transactions")
            .select("*")
            .eq("from_user_id", userId);

        if (options.status) {
            query = query.eq("status", options.status);
        }

        query = query.order("created_at", { ascending: false });

        if (options.limit) {
            query = query.limit(options.limit);
        }

        const { data, error } = await query;

        if (error) {
            console.error("Erreur récupération transactions envoyées:", error);
            return { success: false, error: error.message };
        }

        return { success: true, data: data || [] };
    } catch (error) {
        console.error("Exception transactions envoyées:", error);
        return { success: false, error: error.message };
    }
}

// Calculer les revenus totaux d'un créateur
async function calculateCreatorRevenue(creatorId) {
    try {
        const { data, error } = await supabase
            .from("transactions")
            .select("amount_net_creator, type")
            .eq("to_user_id", creatorId)
            .eq("status", "succeeded");

        if (error) {
            console.error("Erreur calcul revenus:", error);
            return { success: false, error: error.message };
        }

        const summary = {
            totalRevenue: 0,
            supportRevenue: 0,
            transactionCount: data ? data.length : 0,
        };

        if (data) {
            data.forEach((tx) => {
                summary.totalRevenue += parseFloat(tx.amount_net_creator || 0);
                if (tx.type === "support") {
                    summary.supportRevenue += parseFloat(
                        tx.amount_net_creator || 0,
                    );
                }
            });
        }

        return { success: true, data: summary };
    } catch (error) {
        console.error("Exception calcul revenus:", error);
        return { success: false, error: error.message };
    }
}

/* ========================================
   PAIEMENTS (KPay UNIQUEMENT)
   ======================================== */

function resolveMonetizationApiBase() {
    try {
        const { protocol, hostname } = window.location;
        if (hostname === "localhost" || hostname === "127.0.0.1") {
            return `${protocol}//${hostname}:5050`;
        }
        return window.location.origin;
    } catch (error) {
        return "";
    }
}

async function getMonetizationAccessToken() {
    const {
        data: { session },
        error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
        throw new Error("Session invalide. Reconnectez-vous.");
    }

    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    if (
        expiresAt &&
        expiresAt - Date.now() < 2 * 60 * 1000 &&
        typeof supabase.auth.refreshSession === "function"
    ) {
        const refreshed = await supabase.auth.refreshSession();
        if (refreshed?.error || !refreshed?.data?.session?.access_token) {
            throw new Error("Impossible de rafraîchir la session.");
        }
        return refreshed.data.session.access_token;
    }

    return session.access_token;
}

// Créer une session de paiement pour un soutien
async function createSupportPaymentSession(
    fromUserId,
    toUserId,
    amount,
    description = "",
) {
    try {
        if (!fromUserId || !toUserId) {
            return {
                success: false,
                error: "Utilisateur source ou destination manquant.",
            };
        }

        const apiBase = resolveMonetizationApiBase();
        if (!apiBase) {
            return { success: false, error: "Adresse API introuvable." };
        }

        const accessToken = await getMonetizationAccessToken();
        const response = await fetch(`${apiBase}/api/monetization/support`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                to_user_id: toUserId,
                amount,
                description,
            }),
        });

        let payload = {};
        try {
            payload = await response.json();
        } catch (error) {
            payload = {};
        }

        if (!response.ok) {
            return {
                success: false,
                error: payload?.error || "Impossible d'envoyer le soutien.",
            };
        }

        return {
            success: true,
            data: payload,
        };
    } catch (error) {
        console.error("Erreur createSupportPaymentSession:", error);
        return {
            success: false,
            error:
                error?.message ||
                "Impossible de contacter le serveur de soutien.",
        };
    }
}

const PAYMENT_RETURN_VIEW_PARAM = "payment_return_view";
const PAYMENT_RETURN_IMMERSIVE_USER_PARAM = "payment_return_immersive_user";
const PAYMENT_RETURN_IMMERSIVE_CONTENT_PARAM =
    "payment_return_immersive_content";

function clearPaymentReturnResumeParams(url) {
    if (!(url instanceof URL)) return url;
    url.searchParams.delete(PAYMENT_RETURN_VIEW_PARAM);
    url.searchParams.delete(PAYMENT_RETURN_IMMERSIVE_USER_PARAM);
    url.searchParams.delete(PAYMENT_RETURN_IMMERSIVE_CONTENT_PARAM);
    return url;
}

function isImmersiveOverlayVisible() {
    const overlay = document.getElementById("immersive-overlay");
    if (!overlay) return false;
    return (
        overlay.style.display === "block" ||
        overlay.classList.contains("active")
    );
}

function resolveActiveImmersivePost(sourceElement = null) {
    if (sourceElement?.closest) {
        const directPost = sourceElement.closest(".immersive-post");
        if (directPost) return directPost;
    }

    const posts = Array.from(document.querySelectorAll(".immersive-post"));
    if (posts.length === 0) return null;

    let bestPost = null;
    let bestScore = -1;
    posts.forEach((post) => {
        const rect = post.getBoundingClientRect();
        const visibleHeight =
            Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        const visibleWidth =
            Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
        const score = Math.max(0, visibleHeight) * Math.max(0, visibleWidth);
        if (score > bestScore) {
            bestScore = score;
            bestPost = post;
        }
    });

    return bestPost;
}

function buildSupportReturnPath(sourceElement = null) {
    const url = new URL(window.location.href);
    clearPaymentReturnResumeParams(url);

    if (isImmersiveOverlayVisible()) {
        const activePost = resolveActiveImmersivePost(sourceElement);
        const immersiveUserId = String(
            activePost?.dataset?.userId || "",
        ).trim();
        const immersiveContentId = String(
            activePost?.dataset?.contentId || "",
        ).trim();

        if (immersiveUserId) {
            url.searchParams.set(PAYMENT_RETURN_VIEW_PARAM, "immersive");
            url.searchParams.set(
                PAYMENT_RETURN_IMMERSIVE_USER_PARAM,
                immersiveUserId,
            );
            if (immersiveContentId) {
                url.searchParams.set(
                    PAYMENT_RETURN_IMMERSIVE_CONTENT_PARAM,
                    immersiveContentId,
                );
            }
        }
    }

    return `${url.pathname}${url.search}${url.hash}`;
}

let supportCheckoutInProgress = false;

function isCanonicalUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value ?? "").trim(),
    );
}

async function redirectToSupportCheckout({
    creatorId,
    creatorName = "",
    amount,
    description = "",
    message = "",
    returnPath = "",
    sourceElement = null,
    paymentMethod = "card",
    walletId = null,
    provider = null,
}) {
    if (supportCheckoutInProgress) {
        return {
            success: false,
            error: "Le paiement est déjà en cours d'initialisation.",
        };
    }
    const normalizedAmount = Number.parseFloat(amount);
    const safeCreatorId = String(creatorId || "").trim();

    if (!safeCreatorId || !isCanonicalUuid(safeCreatorId)) {
        supportCheckoutInProgress = false;
        return { success: false, error: "Identifiant du créateur invalide." };
    }
    if (!Number.isFinite(normalizedAmount)) {
        return { success: false, error: "Montant invalide." };
    }
    if (!Number.isInteger(normalizedAmount)) {
        return {
            success: false,
            error: "Choisissez un montant entier en USD pour le soutien.",
        };
    }
    if (
        normalizedAmount < PAYMENT_RULES.minTipAmount ||
        normalizedAmount > PAYMENT_RULES.maxTipAmount
    ) {
        return {
            success: false,
            error: `Le montant doit être entre ${PAYMENT_RULES.minTipAmount} et ${PAYMENT_RULES.maxTipAmount} USD.`,
        };
    }

    supportCheckoutInProgress = true;

    // Direct Checkout Bypass for Support/Tipping
    try {
        const {
            data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user;
        const accessToken = session?.access_token;

        if (!user || !accessToken || !isCanonicalUuid(user.id)) {
            supportCheckoutInProgress = false;
            window.location.href =
                "login.html?redirect=" +
                encodeURIComponent(window.location.href);
            return {
                success: false,
                error: "Session invalide. Veuillez vous reconnecter.",
            };
        }

        if (typeof window.showToast === "function") {
            window.showToast(
                "Initialisation du soutien sécurisé via KPay...",
                "info",
            );
        }

        const apiBase =
            typeof window.resolveApiBase === "function"
                ? window.resolveApiBase()
                : window.location.origin;
        const checkoutUrl = `${apiBase}/api/kpay/support-checkout`;

        const normalizedMessage = String(message || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 200);
        const params = new URLSearchParams();
        params.set("kind", "support");
        params.set("to_user_id", safeCreatorId);
        params.set("amount_usd", String(normalizedAmount));
        params.set(
            "description",
            description || `Soutien pour ${creatorName || "ce créateur"}`,
        );
        if (normalizedMessage) {
            params.set("support_message", normalizedMessage);
            params.set("donation_message", normalizedMessage);
            params.set("message", normalizedMessage);
        }
        params.set(
            "return_path",
            returnPath || buildSupportReturnPath(sourceElement),
        );
        params.set("access_token", accessToken);
        const method = ["card", "mobile_money", "paypal"].includes(
            String(paymentMethod).toLowerCase(),
        )
            ? String(paymentMethod).toLowerCase()
            : "card";
        params.set("method", method);
        params.set("currency", "CDF");

        if (walletId) {
            params.set("wallet_id", walletId);
            params.set("phone_number", walletId);
        }
        if (provider) {
            params.set("provider", provider);
        }

        // Always use AJAX to avoid form submission issues
        // This allows better error handling and user feedback
        try {
            const resp = await fetch(checkoutUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json",
                },
                body: params.toString(),
            });

            const resData = await resp.json().catch(() => ({}));
            supportCheckoutInProgress = false;

            // Handle successful response with gateway URL (card/paypal)
            if (resp.ok) {
                if (resData.gatewayUrl) {
                    // For card payments, open KPay gateway in a new tab
                    // This ensures PCI compliance while keeping the user experience
                    if (typeof window.open !== "undefined") {
                        window.open(
                            resData.gatewayUrl,
                            "_blank",
                            "noopener,noreferrer",
                        );
                    } else {
                        window.location.href = resData.gatewayUrl;
                    }
                    return {
                        success: true,
                        data: resData,
                        gatewayUrl: resData.gatewayUrl,
                    };
                }
                // For USSD/Mobile Money
                else if (resData.success || resData.status === "PENDING") {
                    if (typeof window.showToast === "function") {
                        window.showToast(
                            resData.message ||
                                "Demande USSD envoyée ! Validez le code PIN sur votre téléphone.",
                            "success",
                        );
                    } else if (typeof showGlobalNotification === "function") {
                        showGlobalNotification(
                            resData.message ||
                                "Demande USSD envoyée ! Validez le code PIN sur votre téléphone.",
                            "success",
                        );
                    } else {
                        alert(
                            resData.message ||
                                "Demande USSD envoyée sur votre téléphone !",
                        );
                    }
                    return { success: true, data: resData };
                }
            }

            // Handle error responses
            const errorMsg =
                resData.error ||
                resData.message ||
                (resp.status === 500
                    ? "Erreur interne du serveur. Veuillez réessayer plus tard."
                    : `Erreur ${resp.status}: Impossible d'initialiser le paiement.`);

            // Show error to user
            if (typeof window.showToast === "function") {
                window.showToast(errorMsg, "error");
            } else if (typeof showGlobalNotification === "function") {
                showGlobalNotification(errorMsg, "error");
            }

            return {
                success: false,
                error: errorMsg,
                status: resp.status,
            };
        } catch (err) {
            supportCheckoutInProgress = false;
            const errorMsg =
                err.message ||
                "Erreur réseau lors de la connexion au service de paiement.";

            if (typeof window.showToast === "function") {
                window.showToast(errorMsg, "error");
            } else if (typeof showGlobalNotification === "function") {
                showGlobalNotification(errorMsg, "error");
            }

            return { success: false, error: errorMsg };
        }
    } catch (error) {
        supportCheckoutInProgress = false;
        console.error("[Monetization] Direct support checkout error:", error);

        // Final fallback: show error
        const errorMsg =
            error.message || "Erreur lors de l'initialisation du paiement.";
        if (typeof window.showToast === "function") {
            window.showToast(errorMsg, "error");
        } else if (typeof showGlobalNotification === "function") {
            showGlobalNotification(errorMsg, "error");
        }
        return { success: false, error: errorMsg };
    }
}

/* ========================================
   FONCTIONS UI - RENDU DES ÉLÉMENTS
   ======================================== */

// Générer le badge de plan
function renderPlanBadge(plan, isMonetized) {
    const planConfig = PLANS[plan?.toUpperCase()] || PLANS.FREE;
    const badgeClass =
        plan === "pro"
            ? "badge-pro"
            : plan === "medium"
              ? "badge-medium"
              : "badge-standard";

    if (!plan || plan === "free") {
        return "";
    }

    return `
        <span class="plan-badge ${badgeClass}">
            ${planConfig.name}
            ${isMonetized ? '<i class="fas fa-check-circle"></i>' : ""}
        </span>
    `;
}

// Générer le bouton de soutien
function renderSupportButton(creator, options = {}) {
    const canSupport = canReceiveSupport(creator);
    const size = options.size || "medium";
    const creatorId = String(creator?.id || "");
    const creatorName = String(creator?.name || "Créateur")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    if (!canSupport) {
        return `
            <button type="button" class="support-btn support-btn-disabled ${size}" disabled title="Ce créateur ne peut pas recevoir de soutiens">
                <i class="fas fa-lock"></i>
                <span class="support-btn-label">Soutien indisponible</span>
            </button>
        `;
    }

    return `
        <button type="button" class="support-btn support-btn-active ${size}"
                data-creator-id="${creatorId}"
                data-creator-name="${creatorName}">
            <i class="fas fa-heart"></i>
            <span class="support-btn-label">Soutenir</span>
        </button>
    `;
}

// Générer les options de montant pour le soutien
function renderSupportAmounts() {
    const amounts = [1, 3, 5, 10, 25, 50];

    return amounts
        .map(
            (amount) => `
        <button class="amount-btn" data-amount="${amount}" onclick="selectSupportAmount(${amount})">
            $${amount}
        </button>
    `,
        )
        .join("");
}

/* ========================================
   EXPORTS
   ======================================== */

// Expose functions to global scope for UI usage
if (typeof window !== "undefined") {
    window.hasAdvancedProfileCustomization = hasAdvancedProfileCustomization;
    window.hasFullProfileCustomization = hasFullProfileCustomization;
    window.hasHDStreaming = hasHDStreaming;
    window.hasPrivateLiveAccess = hasPrivateLiveAccess;
    window.hasAdvancedCollaborationTools = hasAdvancedCollaborationTools;
    window.hasRealtimeAnalytics = hasRealtimeAnalytics;
    window.hasDataExport = hasDataExport;
    window.hasMaximumDiscoverVisibility = hasMaximumDiscoverVisibility;
    window.getRequiredPlanForFeature = getRequiredPlanForFeature;
    window.getPlanRequiredMessage = getPlanRequiredMessage;
    window.canActivateFeature = canActivateFeature;
    window.showPlanUpgradePrompt = showPlanUpgradePrompt;
    window.autoEnablePremiumFeatures = autoEnablePremiumFeatures;
    window.disablePremiumFeature = disablePremiumFeature;
    window.enablePremiumFeature = enablePremiumFeature;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        PLANS,
        PAYMENT_RULES,
        canReceiveSupport,
        isGiftedPro,
        getUserPlan,
        formatCurrency,
        getUserActiveSubscription,
        getUserSubscriptionHistory,
        updateUserPlan,
        updateFollowersCount,
        createSupportTransaction,
        getCreatorTransactions,
        getSentTransactions,
        calculateCreatorRevenue,
        createSupportPaymentSession,
        buildSupportReturnPath,
        redirectToSupportCheckout,
        renderPlanBadge,
        renderSupportButton,
        renderSupportAmounts,
        // Fonctions de vérification des fonctionnalités
        hasAdvancedProfileCustomization,
        hasFullProfileCustomization,
        hasHDStreaming,
        hasPrivateLiveAccess,
        hasAdvancedCollaborationTools,
        hasRealtimeAnalytics,
        hasDataExport,
        hasMaximumDiscoverVisibility,
        // Nouvelles fonctions de gestion des plans
        getRequiredPlanForFeature,
        getPlanRequiredMessage,
        canActivateFeature,
        showPlanUpgradePrompt,
    };
}
