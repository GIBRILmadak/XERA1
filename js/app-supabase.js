/* ========================================
   APP.JS - VERSION SUPABASE INTÉGRÉE
   ======================================== */

// État global de l'application
window.currentUser = null;
window.currentUserId = null;
window.currentViewerId = null;
window.allUsers = [];
window.userContents = {};
window.userProjects = {};
const professionalPageContents = new Map();
const professionalPagesById = new Map();
let professionalPageDataLoaded = false;
window.adminAnnouncements = [];
window.adminSubscriptionPayments = [];
window.adminWithdrawalRequests = [];
window.hasLoadedUsers = false;
window.userLoadError = null;
window.arcCollaboratorsCache = new Map();
window.arcCollaboratorsPending = new Set();
window.pendingLatestPublishedHighlightUserId = null;
window.pendingCreatePostAfterArc = null;
window.firstPostOnboardingHandled = false;
let initialEmailActionHandled = false;
const CONTENT_PREFETCH_BATCH_SIZE = 10;
const CONTENT_FETCH_BATCH_SIZE = 50;
const FOLLOWED_IDS_CACHE_TTL_MS = 15000;
let followedUserIdsCache = new Set();
let followedUserIdsCacheOwner = null;
let followedUserIdsCacheUpdatedAt = 0;
let discoverVideoObserver = null;
let discoverRenderSequence = 0;
const INITIAL_AUTH_TIMEOUT_MS = 15000;
const SLOW_CONNECTION_NOTICE_MS = 20000;
const DISCOVER_DATA_RETRY_MS = 25000;
const SLOW_CONNECTION_MESSAGE =
    "Votre connexion semble lente ou instable. tentative de reconnexion...";
window.initialDataLoadInProgress = false;
window.initialDataSlow = false;
window.initialDataSlowMessage = "";
let discoverDataRetryTimer = null;
let discoverDataRetryInFlight = false;
let firstProjectFeedPopupShown = false;
function withTimeout(promise, timeoutMs, label = "Operation") {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
    });
}

async function runInitialDataLoad(loader, label = "Initial data load") {
    window.initialDataLoadInProgress = true;
    window.initialDataSlow = false;
    window.initialDataSlowMessage = "";

    const slowTimer = setTimeout(() => {
        window.initialDataSlow = true;
        window.initialDataSlowMessage = SLOW_CONNECTION_MESSAGE;
        console.warn(
            `${label} is still pending after ${SLOW_CONNECTION_NOTICE_MS}ms`,
        );
        renderDiscoverGrid().catch(() => {});
    }, SLOW_CONNECTION_NOTICE_MS);

    try {
        return await loader();
    } finally {
        clearTimeout(slowTimer);
        window.initialDataLoadInProgress = false;
        if (!window.userLoadError) {
            window.initialDataSlow = false;
            window.initialDataSlowMessage = "";
        }
    }
}

function clearDiscoverDataRetry() {
    if (discoverDataRetryTimer) {
        clearTimeout(discoverDataRetryTimer);
        discoverDataRetryTimer = null;
    }
}

function scheduleDiscoverDataRetry(reason = "empty discover") {
    if (discoverDataRetryTimer || discoverDataRetryInFlight) return;

    discoverDataRetryTimer = setTimeout(async () => {
        discoverDataRetryTimer = null;
        discoverDataRetryInFlight = true;
        window.initialDataSlow = true;
        window.initialDataSlowMessage = SLOW_CONNECTION_MESSAGE;

        try {
            if (window.currentUser) {
                await loadAllData();
            } else {
                await loadPublicData();
            }
        } catch (error) {
            console.warn(`Discover data retry failed (${reason}):`, error);
        } finally {
            discoverDataRetryInFlight = false;
            renderDiscoverGrid().catch(() => {});
        }
    }, DISCOVER_DATA_RETRY_MS);
}

// Pagination système pour le feed discover
const DISCOVER_ITEMS_PER_PAGE = 20;
let discoverPaginationState = {
    allItems: [],
    currentPage: 0,
    hasMore: false,
    isLoading: false,
    intersectionObserver: null,
    sentinel: null,
    status: null,
    error: null,
};

/**
 * Mettre à jour les meta tags Open Graph pour le partage social
 * Détecte le contexte (profil, contenu) et met à jour les images appropriées
 */
/**
 * Convertir une image URL relative en URL absolue
 */
function getAbsoluteImageUrl(imagePath) {
    if (!imagePath) return `${window.location.origin}/icons/logo.png`;
    if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
        return imagePath;
    }
    // Image relative - la convertir en URL absolue
    return `${window.location.origin}/${imagePath.startsWith("/") ? imagePath.slice(1) : imagePath}`;
}

function updateOpenGraphTags(context = {}) {
    try {
        // Contexte par défaut
        const pageUrl = window.location.href;
        let ogTitle = "XERA | Tracez votre progression";
        let ogDescription = "Découvrez les trajectoires créatives sur XERA";
        let ogImage = getAbsoluteImageUrl("icons/logo.png");
        let ogType = "website";

        // Si contexte profil
        if (context.userId || context.userProfile) {
            const profile = context.userProfile || {};
            ogTitle = `${profile.username || "Profil"} | XERA`;
            ogDescription = profile.bio || "Découvrez ce profil sur XERA";
            ogImage = getAbsoluteImageUrl(
                profile.profileImage || profile.avatar_url || "icons/logo.png",
            );
            ogType = "profile";
        }

        // Si contexte contenu
        if (context.contentId || context.content) {
            const content = context.content || {};
            ogTitle = content.title || "Contenu XERA";
            ogDescription =
                content.description ||
                content.title ||
                "Découvrez ce contenu sur XERA";

            // Utiliser l'image du contenu si disponible
            if (
                content.media &&
                Array.isArray(content.media) &&
                content.media.length > 0
            ) {
                ogImage = getAbsoluteImageUrl(
                    content.media[0].url || content.media[0],
                );
            } else if (content.mediaUrl) {
                ogImage = getAbsoluteImageUrl(content.mediaUrl);
            } else if (content.thumbnail_url) {
                ogImage = getAbsoluteImageUrl(content.thumbnail_url);
            }

            ogType = "article";
        }

        // Mettre à jour les meta tags OG
        updateMetaTag("og:title", ogTitle);
        updateMetaTag("og:description", ogDescription);
        updateMetaTag("og:image", ogImage);
        updateMetaTag("og:image:width", "1200");
        updateMetaTag("og:image:height", "630");
        updateMetaTag("og:url", pageUrl);
        updateMetaTag("og:type", ogType);

        // Twitter Card
        updateMetaTag("twitter:card", "summary_large_image");
        updateMetaTag("twitter:title", ogTitle);
        updateMetaTag("twitter:description", ogDescription);
        updateMetaTag("twitter:image", ogImage);

        // Mettre à jour aussi le title principal
        if (context.userId || context.userProfile) {
            document.title = `${context.userProfile?.username || "Profil"} | XERA`;
        } else if (context.contentId || context.content) {
            const content = context.content || {};
            document.title = `${content.title || "Contenu"} | XERA`;
        }
    } catch (error) {
        console.error("Erreur lors de la mise à jour des meta tags OG:", error);
    }
}

/**
 * Utility pour créer ou mettre à jour une meta tag
 */
function updateMetaTag(property, content) {
    if (!content) return;

    let tag = document.querySelector(
        `meta[property="${property}"], meta[name="${property}"]`,
    );

    if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("property", property);
        document.head.appendChild(tag);
    }

    tag.setAttribute("content", content);
}

/**
 * Initialiser les meta tags OG au chargement de la page en fonction de l'URL
 * Appelé au démarrage pour que les réseaux sociaux récupèrent les bonnes images
 */
async function initializeOpenGraphFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        const contentId = params.get("content") || null;
        const userId = params.get("user") || null;

        // Si c'est un partage de contenu
        if (contentId) {
            // Essayer de charger le contenu depuis le cache local d'abord, sinon charger depuis Supabase
            if (
                window.userContents &&
                window.userContents[window.currentUserId]
            ) {
                for (const uid in window.userContents) {
                    const contents = window.userContents[uid];
                    if (Array.isArray(contents)) {
                        const foundContent = contents.find(
                            (c) =>
                                c.contentId === contentId || c.id === contentId,
                        );
                        if (foundContent) {
                            updateOpenGraphTags({
                                contentId: contentId,
                                content: {
                                    title: foundContent.title || "Contenu XERA",
                                    description: foundContent.description || "",
                                    media: foundContent.media || [],
                                    mediaUrl: foundContent.mediaUrl,
                                    thumbnail_url: foundContent.thumbnail_url,
                                },
                            });
                            return;
                        }
                    }
                }
            }

            // Si non trouvé en cache, essayer de charger depuis Supabase
            if (typeof supabase !== "undefined" && supabase) {
                try {
                    const { data: content } = await supabase
                        .from("content")
                        .select("*")
                        .eq("id", contentId)
                        .single();

                    if (content) {
                        updateOpenGraphTags({
                            contentId: contentId,
                            content: {
                                title: content.title || "Contenu XERA",
                                description: content.description || "",
                                media: content.media || [],
                                mediaUrl: content.media_url,
                                thumbnail_url: content.thumbnail_url,
                            },
                        });
                        return;
                    }
                } catch (e) {
                    // Silently fail - use default OG tags
                }
            }
        }

        // Si c'est un partage de profil
        if (userId) {
            // Essayer de charger l'utilisateur depuis le cache, sinon charger depuis Supabase
            if (
                window.allUsers &&
                Array.isArray(window.allUsers) &&
                window.allUsers.length > 0
            ) {
                const foundUser = window.allUsers.find(
                    (u) => u.id === userId || u.userId === userId,
                );
                if (foundUser) {
                    updateOpenGraphTags({
                        userId: userId,
                        userProfile: {
                            username:
                                foundUser.username ||
                                foundUser.name ||
                                "Profil",
                            bio: foundUser.bio || "",
                            avatar_url:
                                foundUser.avatar_url ||
                                foundUser.avatarUrl ||
                                "",
                            profileImage:
                                foundUser.avatar_url ||
                                foundUser.avatarUrl ||
                                "",
                        },
                    });
                    return;
                }
            }

            // Si non trouvé en cache, essayer de charger depuis Supabase
            if (typeof supabase !== "undefined" && supabase) {
                try {
                    const { data: user } = await supabase
                        .from("users")
                        .select("*")
                        .eq("id", userId)
                        .single();

                    if (user) {
                        updateOpenGraphTags({
                            userId: userId,
                            userProfile: {
                                username:
                                    user.username || user.name || "Profil",
                                bio: user.bio || "",
                                avatar_url:
                                    user.avatar_url ||
                                    user.avatarUrl ||
                                    user.avatar ||
                                    "",
                                profileImage:
                                    user.avatar_url ||
                                    user.avatarUrl ||
                                    user.avatar ||
                                    "",
                            },
                        });
                        return;
                    }
                } catch (e) {
                    // Silently fail - use default OG tags
                }
            }
        }
    } catch (error) {
        console.error(
            "Erreur lors de l'initialisation des meta tags OG:",
            error,
        );
    }
}

/* ========================================
   STRATÉGIE DE CROISSANCE VIRALE
   Engager les utilisateurs à inviter leurs potes sans message explicite
   ======================================== */

/**
 * Calcule les stats de portée d'un utilisateur
 * Montre implicitement son influence sans être agressif
 */
function calculateUserReachStats(userId) {
    try {
        const followers = getFollowerCountSnapshot(userId);
        const contents = getUserContentLocal(userId) || [];
        const totalViews = contents.reduce((sum, c) => sum + (c.views || 0), 0);
        const totalEncouragements = contents.reduce(
            (sum, c) => sum + (c.encouragementsCount || 0),
            0,
        );

        // Score d'influence: followers + engagement
        const influenceScore = followers + Math.log1p(totalEncouragements) * 10;

        return {
            followers,
            totalViews,
            totalEncouragements,
            influenceScore,
            contentCount: contents.length,
            monthlyViews: totalViews, // Simplifié pour MVP
        };
    } catch (e) {
        return {
            followers: 0,
            totalViews: 0,
            totalEncouragements: 0,
            influenceScore: 0,
            contentCount: 0,
        };
    }
}

/**
 * Compte les followers d'un utilisateur
 */
function normalizeFollowerCount(value) {
    const count = Number(value);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function getFollowerCountSnapshot(userId) {
    if (!userId) return 0;
    return normalizeFollowerCount(getUser(userId)?.followers_count);
}

async function getFollowerCount(userId) {
    if (!window.supabase || !userId) return 0;

    try {
        const { count, error } = await supabase
            .from("followers")
            .select("follower_id", { count: "exact", head: true })
            .eq("following_id", userId);

        if (!error) return normalizeFollowerCount(count);

        console.error("Erreur comptage followers:", error);

        const cachedUser = getUser(userId);
        if (cachedUser && cachedUser.followers_count !== undefined) {
            return normalizeFollowerCount(cachedUser.followers_count);
        }

        const { data, error: profileError } = await supabase
            .from("users")
            .select("followers_count")
            .eq("id", userId)
            .single();

        if (profileError) {
            console.error("Erreur récupération followers_count:", profileError);
            return 0;
        }

        return normalizeFollowerCount(data?.followers_count);
    } catch (error) {
        console.error("Exception in getFollowerCount:", error);
        const cachedUser = getUser(userId);
        return normalizeFollowerCount(cachedUser?.followers_count);
    }
}

async function getFollowingCount(userId) {
    if (!window.supabase || !userId) return 0;

    try {
        const { count, error } = await supabase
            .from("followers")
            .select("following_id", { count: "exact", head: true })
            .eq("follower_id", userId);

        if (!error) return count || 0;

        const cachedUser = getUser(userId);
        if (cachedUser && cachedUser.following_count !== undefined) {
            return cachedUser.following_count || 0;
        }

        return 0;
    } catch (error) {
        console.error("Exception in getFollowingCount:", error);
        return 0;
    }
}

async function getUserEngagementTotals(userId) {
    if (!window.supabase || !userId) return { totalViews: 0 };
    try {
        const { data, error } = await supabase
            .from("content")
            .select("views")
            .eq("author_type", "USER")
            .eq("author_id", userId)
            .is("page_id", null);
        if (error) throw error;
        const totalViews = (data || []).reduce(
            (sum, item) => sum + (Number(item.views) || 0),
            0,
        );
        return { totalViews };
    } catch (error) {
        console.error("getUserEngagementTotals error:", error);
        return { totalViews: 0 };
    }
}

async function getUserProjects(userId) {
    if (!window.supabase || !userId) return { success: true, data: [] };
    try {
        const { data, error } = await supabase
            .from("projects")
            .select("*")
            .eq("user_id", userId);
        if (error) throw error;
        return { success: true, data: data || [] };
    } catch (error) {
        console.error("getUserProjects error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Génère un badge de "contributeur majeur" glamour style trophée
 * Récompense implicitement ceux qui créent du contenu
 */
/**
 * Vérifier et envoyer une notification DM si nouveau badge débloqué
 */
async function notifyBadgeUnlock(userId, badgeInfo) {
    try {
        const user = getUser(userId);
        if (!user) return;

        // Clé pour tracker le dernier badge de l'utilisateur
        const badgeKey = `last_badge_${userId}`;
        const lastBadge = localStorage.getItem(badgeKey);

        // Si c'est le même badge, ne pas renvoyer de notification
        if (lastBadge === badgeInfo.text) return;

        // Marquer le nouveau badge comme traité
        localStorage.setItem(badgeKey, badgeInfo.text);

        // Préparer le message DM
        const dmMessage = `Bonjour ${user.name} 🎉

Félicitations pour ton nouveau trophée ! ${badgeInfo.icon}

${badgeInfo.text}

Tu as débloqué un accomplissement majeur ! Continue à créer du contenu incroyable et inspire la communauté XERA.

Le compte XERA Admin`;

        // Envoyer le DM via Supabase
        if (window.supabase) {
            try {
                const adminUserId = "admin-super"; // ID du compte super admin

                // Chercher ou créer une conversation entre admin et utilisateur
                const { data: conversations } = await window.supabase
                    .from("dm_conversations")
                    .select("id")
                    .or(
                        `and(user_a.eq.${adminUserId},user_b.eq.${userId}),and(user_a.eq.${userId},user_b.eq.${adminUserId})`,
                    )
                    .limit(1)
                    .single()
                    .catch(() => ({ data: null }));

                let conversationId = conversations?.id;

                // Si pas de conversation, la créer
                if (!conversationId) {
                    const { data: newConv } = await window.supabase
                        .from("dm_conversations")
                        .insert({
                            user_a: adminUserId,
                            user_b: userId,
                            created_at: new Date().toISOString(),
                        })
                        .select("id")
                        .single()
                        .catch(() => ({ data: null }));

                    if (newConv?.id) {
                        conversationId = newConv.id;
                    }
                }

                // Insérer le message
                if (conversationId) {
                    await window.supabase
                        .from("dm_messages")
                        .insert({
                            conversation_id: conversationId,
                            sender_id: adminUserId,
                            body: dmMessage,
                            created_at: new Date().toISOString(),
                        })
                        .catch(() => {
                            console.log("Badge notification queued locally");
                        });
                }

                // Afficher une toast pour confirmer
                showToastNotification(
                    `🎉 ${badgeInfo.text} débloqué ! Un message a été envoyé à ton compte.`,
                    "success",
                );
            } catch (e) {
                console.log("Badge notification queued");
            }
        }
    } catch (e) {
        console.error("Badge unlock notification error:", e);
    }
}

function getContributorBadgeHtml(userId) {
    try {
        const stats = calculateUserReachStats(userId);

        // Badge conditions - 7 paliers progressifs
        let badgeClass = "";
        let badgeText = "";
        let trophyIcon = "";
        let badgeInfo = null;

        if (stats.contentCount >= 300 && stats.followers >= 1000000) {
            badgeClass = "badge-creator-immortal";
            badgeText = "Architecte";
            trophyIcon = "💎"; // Diamond
            badgeInfo = { text: badgeText, icon: trophyIcon };
        } else if (stats.contentCount >= 200 && stats.followers >= 100000) {
            badgeClass = "badge-creator-supreme";
            badgeText = "Empereur";
            trophyIcon = "👑"; // Crown
            badgeInfo = { text: badgeText, icon: trophyIcon };
        } else if (stats.contentCount >= 100 && stats.followers >= 10000) {
            badgeClass = "badge-creator-legend";
            badgeText = "Bâtisseur";
            trophyIcon = "🌟"; // Glowing star
            badgeInfo = { text: badgeText, icon: trophyIcon };
        } else if (stats.contentCount >= 70 && stats.followers >= 1000) {
            badgeClass = "badge-creator-elite";
            badgeText = "Ingénieur";
            trophyIcon = "🏆"; // Gold trophy
            badgeInfo = { text: badgeText, icon: trophyIcon };
        } else if (stats.contentCount >= 50 && stats.followers >= 500) {
            badgeClass = "badge-creator-established";
            badgeText = "Forgeron";
            trophyIcon = "🥈"; // Silver trophy
            badgeInfo = { text: badgeText, icon: trophyIcon };
        } else if (stats.contentCount >= 50) {
            badgeClass = "badge-creator-bronze";
            badgeText = "Séquoia";
            trophyIcon = "🥉"; // Bronze medal
            badgeInfo = { text: badgeText, icon: trophyIcon };
        } else if (stats.contentCount >= 20) {
            badgeClass = "badge-creator-emerging";
            badgeText = "Silex";
            trophyIcon = "⭐"; // Star
            badgeInfo = { text: badgeText, icon: trophyIcon };
        } else {
            return ""; // Pas de badge pour les non-contributeurs
        }

        // Vérifier et envoyer notification si nouveau badge
        if (badgeInfo) {
            notifyBadgeUnlock(userId, badgeInfo);
        }

        return `
            <span class="contributor-badge ${badgeClass}" title="${badgeText}: Créateur actif de contenu">
                <span class="badge-trophy-icon">${trophyIcon}</span>
                <span class="badge-text">${badgeText}</span>
            </span>
        `;
    } catch (e) {
        return "";
    }
}

/**
 * Affiche les statistiques de portée de manière subtle
 * Crée un sentiment d'accomplissement et de croissance
 */
function renderReachStatsWidget(userId) {
    try {
        const stats = calculateUserReachStats(userId);

        // Ne montrer que si l'utilisateur a du contenu
        if (stats.contentCount === 0) return "";

        // Format compact pour intégration subtile
        return `
            <div class="reach-stats-widget">
                <div class="reach-stat-item">
                    <span class="reach-icon">👥</span>
                    <span class="reach-value">${stats.followers}</span>
                    <span class="reach-label">followers</span>
                </div>
                <div class="reach-stat-item">
                    <span class="reach-icon">👁️</span>
                    <span class="reach-value">${formatCompactCount(stats.totalViews)}</span>
                    <span class="reach-label">vues</span>
                </div>
                <div class="reach-stat-item">
                    <span class="reach-icon">💪</span>
                    <span class="reach-value">${formatCompactCount(stats.totalEncouragements)}</span>
                    <span class="reach-label">encouragements</span>
                </div>
            </div>
        `;
    } catch (e) {
        return "";
    }
}

/**
 * Génère un widget de "friends on XERA"
 * Social proof: montrer les amis qui sont déjà là
 */
function renderFriendsOnXeraWidget(userId) {
    try {
        const friends = [];
        const allFollowing = getFollowingList(userId) || [];

        // Limiter à 5 amis pour ne pas surcharger
        allFollowing.slice(0, 5).forEach((friendId) => {
            const friend = getUser(friendId);
            if (friend && friend.avatar) {
                friends.push({ id: friendId, avatar: friend.avatar });
            }
        });

        if (friends.length === 0) return "";

        const friendAvatars = friends
            .map(
                (f) =>
                    `<img src="${f.avatar}" alt="" class="friend-avatar" onclick="handleProfileClick('${f.id}', null, true)">`,
            )
            .join("");

        const moreCount = Math.max(0, allFollowing.length - 5);
        const moreText =
            moreCount > 0
                ? `<span class="friends-more">+${moreCount}</span>`
                : "";

        return `
            <div class="friends-on-xera-widget">
                <span class="friends-label">Tes potes sur XERA 👋</span>
                <div class="friends-avatars">
                    ${friendAvatars}
                    ${moreText}
                </div>
            </div>
        `;
    } catch (e) {
        return "";
    }
}

/**
 * Smart notification quand un ami rejoint XERA
 */
function showFriendJoinedNotification(friendId, friendName) {
    try {
        const notification = document.createElement("div");
        notification.className = "toast show";
        notification.innerHTML = `
            <div class="toast-icon"><i class="fas fa-user-plus"></i></div>
            <div class="toast-content">
                <div class="toast-title">Nouvelle connexion</div>
                <div class="toast-message"><strong>${friendName}</strong> a rejoint XERA</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="handleProfileClick('${friendId}', null, true); this.closest('.toast').remove();">
                Voir
            </button>
        `;

        const container = document.getElementById("toast-container");
        if (container) {
            container.appendChild(notification);
            setTimeout(() => notification.remove(), 4000);
        }
    } catch (e) {
        console.error("Toast notification error:", e);
    }
}

/**
 * Générer un bouton de partage élégant et naturel
 * Intégré dans le profil/post, pas comme CTA agressif
 */
function renderShareButton(context = {}) {
    const { userId = null, contentId = null, className = "" } = context;

    let shareUrl = window.location.href;
    let shareTitle = "XERA | Tracez votre progression";
    let shareUserId = null;

    if (userId) {
        shareUrl = buildOpenGraphShareUrl("profile", userId);
        const user = getUser(userId);
        shareTitle = `Découvre ${user?.name || "ce profil"} sur XERA`;
        shareUserId = userId;
    } else if (contentId) {
        const content = findContentById(contentId);
        if (content) {
            shareUrl = buildOpenGraphShareUrl("content", contentId);
            shareTitle = content.title || "Découvre ce contenu sur XERA";
        }
    }

    const shareCount = getShareCount(context.contentId || "");
    return `
        <button class="btn-share-elegant ${className}" onclick="shareContentElegant('${shareUrl}', '${shareTitle}', '${context.contentId}', '${shareUserId}')" data-share-id="${context.contentId}" title="${shareCount} partages">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            <span>Partager</span>
            ${shareCount > 0 ? `<span class="share-counter">${shareCount}</span>` : ""}
        </button>
    `;
}

/**
 * Afficher une popup de confirmation que le lien a été copié sur PC
 */
function showCopyConfirmationPopup() {
    // Vérifier si c'est desktop (pas mobile)
    if (isMobileDevice()) return;

    // Créer la popup
    const popup = document.createElement("div");
    popup.className = "copy-confirmation-popup";
    popup.innerHTML = `
        <div class="copy-popup-content">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <p>Lien copié! ✓</p>
        </div>
    `;

    // Styles de la popup
    const style = document.createElement("style");
    style.textContent = `
        .copy-confirmation-popup {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(34, 197, 94, 0.95);
            backdrop-filter: blur(8px);
            border-radius: 16px;
            padding: 24px 32px;
            z-index: 10000;
            animation: popupSlideIn 0.3s ease-out forwards;
            pointer-events: none;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        }
        
        .copy-popup-content {
            display: flex;
            align-items: center;
            gap: 12px;
            color: white;
            font-weight: 600;
            font-size: 1.1rem;
        }
        
        .copy-popup-content svg {
            color: white;
            flex-shrink: 0;
        }
        
        @keyframes popupSlideIn {
            from {
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.8);
            }
            to {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }
        }
        
        @keyframes popupSlideOut {
            from {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }
            to {
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.8);
            }
        }
    `;

    document.head.appendChild(style);
    document.body.appendChild(popup);

    // Retirer la popup après 2 secondes
    setTimeout(() => {
        popup.style.animation = "popupSlideOut 0.3s ease-out forwards";
        setTimeout(() => {
            document.body.removeChild(popup);
        }, 300);
    }, 2000);
}

/**
 * Incrémenter et récupérer le compteur de partages
 */
function getShareCount(contentId) {
    try {
        const key = `share_count_${contentId}`;
        return parseInt(localStorage.getItem(key) || "0", 10);
    } catch (e) {
        return 0;
    }
}

function incrementShareCount(contentId) {
    try {
        const key = `share_count_${contentId}`;
        const current = parseInt(localStorage.getItem(key) || "0", 10);
        localStorage.setItem(key, String(current + 1));
        return current + 1;
    } catch (e) {
        return 0;
    }
}

function buildOpenGraphShareUrl(kind, id) {
    const safeKind = kind === "profile" ? "profile" : "content";
    const safeId = encodeURIComponent(String(id || "").trim());
    if (!safeId) return window.location.href;
    return `${window.location.origin}/share/${safeKind}/${safeId}`;
}

/**
 * Native share avec fallback
 */
window.shareContentElegant = async function (
    url,
    title,
    contentId = null,
    userId = null,
) {
    try {
        if (contentId) {
            const newCount = incrementShareCount(contentId);

            // Sauvegarder les données du contenu dans localStorage pour les web scrapers
            try {
                const content = findContentById(contentId);
                if (content) {
                    const contentData = {
                        title: content.title || "Contenu XERA",
                        description: content.description || "",
                        image:
                            content.media?.[0]?.url ||
                            content.mediaUrl ||
                            content.thumbnail_url ||
                            "",
                    };
                    localStorage.setItem(
                        `content_${contentId}`,
                        JSON.stringify(contentData),
                    );
                }
            } catch (e) {
                // Silently fail - continue with sharing
            }

            // Mettre à jour l'affichage du compteur
            const shareBtn = document.querySelector(
                `[data-share-id="${contentId}"]`,
            );
            if (shareBtn) {
                const counter = shareBtn.querySelector(".share-counter");
                if (counter) {
                    if (newCount > 0) {
                        counter.textContent = newCount;
                        counter.style.display = "flex";
                    }
                }
            }
        }

        if (userId) {
            // Sauvegarder les données du profil dans localStorage
            try {
                const user = getUser(userId);
                if (user) {
                    const userData = {
                        username: user.username || user.name || "Profil",
                        bio: user.bio || "",
                        avatar: user.avatar_url || user.avatarUrl || "",
                    };
                    localStorage.setItem(
                        `user_${userId}`,
                        JSON.stringify(userData),
                    );
                }
            } catch (e) {
                // Silently fail - continue with sharing
            }
        }

        // Essayer d'abord le Web Share API
        if (navigator.share) {
            try {
                await navigator.share({
                    title: title,
                    url: url,
                });
                showToastNotification("Partagé avec succès! 🚀", "success");
                return;
            } catch (shareError) {
                // Si l'utilisateur annule le partage, ne pas afficher d'erreur
                if (shareError.name !== "AbortError") {
                    console.error("Share API error:", shareError);
                    // Continuer au fallback
                } else {
                    return; // L'utilisateur a annulé
                }
            }
        }

        // Fallback: copier dans le presse-papiers
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(url);
                showToastNotification(
                    "Lien copié dans le presse-papiers! 📋",
                    "success",
                );
                // Afficher une popup de confirmation sur PC
                showCopyConfirmationPopup();
            } else {
                // Fallback alternatif: créer un élément input temporaire
                const tempInput = document.createElement("input");
                tempInput.type = "text";
                tempInput.value = url;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand("copy");
                document.body.removeChild(tempInput);
                showToastNotification(
                    "Lien copié dans le presse-papiers! 📋",
                    "success",
                );
                // Afficher une popup de confirmation sur PC
                showCopyConfirmationPopup();
            }
        } catch (clipboardError) {
            console.error("Clipboard error:", clipboardError);
            showToastNotification(
                "Impossible de copier le lien. Essayez manuellement.",
                "error",
            );
        }
    } catch (e) {
        console.error("Share error:", e);
        showToastNotification("Erreur lors du partage", "error");
    }
};

// Exposer les fonctions de partage globalement
window.getShareCount = getShareCount;
window.incrementShareCount = incrementShareCount;

/**
 * Obtenir la liste des utilisateurs suivis
 */
function getFollowingList(userId) {
    // Simplifié pour MVP - à implémenter avec la DB complète
    const following = [];
    if (window.userContents) {
        Object.keys(window.userContents).forEach((uid) => {
            if (uid !== userId) following.push(uid);
        });
    }
    return following;
}

window.showFriendJoinedNotification = showFriendJoinedNotification;
window.calculateUserReachStats = calculateUserReachStats;
window.getContributorBadgeHtml = getContributorBadgeHtml;
window.notifyBadgeUnlock = notifyBadgeUnlock;

/**
 * Injecter les widgets de croissance virale dans le profil
 */
function injectViralGrowthWidgets(userId) {
    try {
        const profileContainer = document.querySelector(".profile-container");
        if (!profileContainer) return;

        // Injecter après le header du profil
        const profileHeader = profileContainer.querySelector(".profile-header");
        if (!profileHeader) return;

        let injectionPoint = profileHeader.nextElementSibling;

        // Vérifier qu'on n'a pas déjà injecté
        if (injectionPoint?.className.includes("viral-growth-section")) return;

        // Créer le conteneur des widgets
        const viralSection = document.createElement("div");
        viralSection.className = "viral-growth-section";
        viralSection.innerHTML = `
            ${renderReachStatsWidget(userId)}
            ${renderFriendsOnXeraWidget(userId)}
            ${renderShareButton({ userId, className: "btn-share-profile" })}
        `;

        // Injecter avant la timeline
        if (injectionPoint) {
            injectionPoint.parentNode.insertBefore(
                viralSection,
                injectionPoint,
            );
        } else {
            profileHeader.parentNode.insertBefore(
                viralSection,
                profileHeader.nextSibling,
            );
        }
    } catch (e) {
        console.error("Error injecting viral widgets:", e);
    }
}

function isMobileDevice() {
    return window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
}

function getInitialProfileUserId() {
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get("user") || params.get("u");
    } catch (error) {
        return null;
    }
}

function getInitialAppAction() {
    try {
        const params = new URLSearchParams(window.location.search);
        return String(params.get("action") || "")
            .trim()
            .toLowerCase();
    } catch (error) {
        return "";
    }
}

function getInitialArcId() {
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get("arc") || null;
    } catch (error) {
        return null;
    }
}

function getInitialContentId() {
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get("content") || null;
    } catch (error) {
        return null;
    }
}

function clearInitialAppAction() {
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete("action");
        window.history.replaceState({}, document.title, url.toString());
    } catch (error) {
        // ignore
    }
}

function safeFormatDate(date, options = { day: "numeric", month: "short" }) {
    if (!date) return "";
    const d = date instanceof Date ? date : new Date(date);
    if (!Number.isFinite(d.getTime())) return "";
    try {
        return new Intl.DateTimeFormat("fr-FR", options).format(d);
    } catch (e) {
        return "";
    }
}

function hasDiscoverPage() {
    return !!document.getElementById("discover");
}

function hasProfilePage() {
    return !!document.getElementById("profile");
}

function isProfileOnlyPage() {
    return hasProfilePage() && !hasDiscoverPage();
}

function isProfileRoute() {
    try {
        const pathname = String(window.location.pathname || "").replace(
            /\/+$|\s+/g,
            "",
        );
        if (
            pathname === "/profile.html" ||
            pathname === "/profile" ||
            pathname === "/pagepro"
        ) {
            return true;
        }

        const params = new URLSearchParams(window.location.search);
        return params.has("user") || params.has("pro");
    } catch (error) {
        return false;
    }
}

function normalizeAccountType(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function buildProfileUrl(userId, accountType, accountSubtype) {
    if (!accountType && userId) {
        const cachedUser = getUser(userId);
        accountType =
            cachedUser?.account_type || cachedUser?.user_metadata?.account_type;
        accountSubtype =
            cachedUser?.account_subtype ||
            cachedUser?.accountSubtype ||
            cachedUser?.user_metadata?.account_subtype;
    }
    const routeName = isProAccountType(accountType, accountSubtype)
        ? "pagepro"
        : "profile";
    const query = userId ? { user: userId } : {};

    if (window.XeraRouter?.buildProfileUrl) {
        return window.XeraRouter.buildProfileUrl(userId, accountType);
    }
    if (window.XeraRouter?.buildHtmlUrl) {
        return window.XeraRouter.buildHtmlUrl(routeName, { query });
    }
    if (window.XeraRouter?.buildUrl) {
        return window.XeraRouter.buildUrl(routeName, { query });
    }

    const base = "profile.html";
    if (!userId) return base;
    return `${base}?user=${encodeURIComponent(userId)}`;
}

// A super-admin may own a Page Pro while retaining an independent personal
// profile. This route intentionally bypasses account-type inference.
function navigateToPersonalProfile() {
    const userId = window.currentUserId || window.currentUser?.id;
    if (!userId) {
        window.location.href = "login.html";
        return;
    }

    if (
        String(window.location.pathname || "").endsWith("profile-personal.html")
    ) {
        return;
    }

    const query = new URLSearchParams({
        user: String(userId),
        view: "personal",
    });
    window.location.href = `profile-personal.html?${query.toString()}`;
}

window.navigateToPersonalProfile = navigateToPersonalProfile;

function buildProfileShareUrl(userId) {
    const user = getUser(userId);
    const accountType =
        user?.account_type || user?.user_metadata?.account_type || "personal";
    const relative = buildProfileUrl(userId, accountType);
    try {
        return new URL(relative, window.location.href).toString();
    } catch (error) {
        return relative;
    }
}

const APP_PAYMENT_RETURN_VIEW_PARAM = "payment_return_view";
const APP_PAYMENT_RETURN_IMMERSIVE_USER_PARAM = "payment_return_immersive_user";
const APP_PAYMENT_RETURN_IMMERSIVE_CONTENT_PARAM =
    "payment_return_immersive_content";

function getPaymentReturnResumeState() {
    try {
        const url = new URL(window.location.href);
        const view = String(
            url.searchParams.get(APP_PAYMENT_RETURN_VIEW_PARAM) || "",
        ).trim();
        if (view !== "immersive") return null;

        const userId = String(
            url.searchParams.get(APP_PAYMENT_RETURN_IMMERSIVE_USER_PARAM) || "",
        ).trim();
        const contentId = String(
            url.searchParams.get(APP_PAYMENT_RETURN_IMMERSIVE_CONTENT_PARAM) ||
                "",
        ).trim();

        if (!userId) return null;
        return {
            view,
            userId,
            contentId: contentId || null,
        };
    } catch (error) {
        return null;
    }
}

function clearPaymentReturnResumeState() {
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete(APP_PAYMENT_RETURN_VIEW_PARAM);
        url.searchParams.delete(APP_PAYMENT_RETURN_IMMERSIVE_USER_PARAM);
        url.searchParams.delete(APP_PAYMENT_RETURN_IMMERSIVE_CONTENT_PARAM);
        window.history.replaceState({}, document.title, url.toString());
    } catch (error) {
        // ignore
    }
}

async function maybeResumePaymentReturnContext() {
    const resumeState = getPaymentReturnResumeState();
    if (!resumeState) return;

    clearPaymentReturnResumeState();

    if (
        resumeState.view === "immersive" &&
        typeof openImmersive === "function"
    ) {
        await openImmersive(resumeState.userId, resumeState.contentId);
    }
}

async function shareProfileLink(userId) {
    if (!userId) return;
    const user = getUser(userId);
    const url = buildProfileShareUrl(userId);
    const title = user ? `Profil de ${user.name} | XERA1` : "Profil XERA1";
    const text = user
        ? `Découvre le profil de ${user.name} sur XERA1.`
        : "Découvre ce profil sur XERA1.";

    if (navigator.share) {
        try {
            await navigator.share({ title, text, url });
            return;
        } catch (error) {
            console.warn("Share cancelled or failed:", error);
        }
    }

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(url);
            if (window.ToastManager) {
                ToastManager.success(
                    "Lien copié",
                    "Le lien du profil est dans le presse-papiers.",
                );
            } else {
                alert("Lien du profil copié.");
            }
            return;
        }
    } catch (error) {
        console.error("Clipboard error:", error);
    }

    prompt("Copiez ce lien pour partager le profil :", url);
}

window.shareProfileLink = shareProfileLink;

function injectVerificationNavButton() {
    try {
        // Bouton uniquement sur la page profil (profile.html)
        if (!isProfileOnlyPage()) return;
        const navLinks = document.querySelector("nav .nav-links");
        if (!navLinks || navLinks.querySelector(".nav-verify-btn")) return;
        const btn = document.createElement("a");
        btn.href = "subscription-plans.html";
        btn.className = "nav-verify-btn";
        btn.innerHTML = `
            Obtenir une vérification
            <img src="icons/verify-personal.svg?v=${BADGE_ASSET_VERSION}" alt="Badge" class="nav-verify-icon">
`;
        navLinks.appendChild(btn);
    } catch (error) {
        console.warn("Nav verification CTA not injected:", error);
    }
}

function buildMonetizationDashboardUrl() {
    if (window.XeraRouter?.buildHtmlUrl) {
        return window.XeraRouter.buildHtmlUrl("creatorDashboard");
    }
    if (window.XeraRouter?.buildUrl) {
        return window.XeraRouter.buildUrl("creatorDashboard");
    }
    return "creator-dashboard.html";
}

function hasMonetizationDashboardAccess(user) {
    if (!user) return false;
    const plan = String(user.plan || "").toLowerCase();
    if (!["medium", "pro"].includes(plan)) return false;
    return isPlanActiveByDate(user);
}

function ensureMonetizationNavButton() {
    const navLinks = document.querySelector("nav .nav-links");
    if (!navLinks) return null;

    let button = document.getElementById("nav-monetization-btn");
    if (button) {
        button.href = buildMonetizationDashboardUrl();
        return button;
    }

    button = document.createElement("a");
    button.id = "nav-monetization-btn";
    button.className = "nav-monetization-btn";
    button.href = buildMonetizationDashboardUrl();
    button.title = "Monétisation";
    button.setAttribute("aria-label", "Monétisation");
    button.innerHTML = `
<i class="fas fa-wallet" aria-hidden="true"></i>
<span class="nav-monetization-label">Monétisation</span>
    `;

    const navAuth = document.getElementById("nav-auth");
    if (navAuth?.parentNode === navLinks) {
        navLinks.insertBefore(button, navAuth);
    } else {
        navLinks.appendChild(button);
    }

    return button;
}

async function updateMonetizationNavButton(isLoggedIn) {
    const button = ensureMonetizationNavButton();
    if (!button) return;

    button.href = buildMonetizationDashboardUrl();

    if (!isLoggedIn || !window.currentUser?.id) {
        button.style.display = "none";
        return;
    }

    let profile = getUser(window.currentUser.id) || null;
    if (!profile && window.currentUser?.plan) {
        profile = window.currentUser;
    }

    if (!hasMonetizationDashboardAccess(profile)) {
        try {
            const result = await getUserProfile(window.currentUser.id);
            if (result?.success && result.data) {
                profile =
                    typeof applyUserUpdateToCache === "function"
                        ? applyUserUpdateToCache(result.data)
                        : result.data;
            }
        } catch (error) {
            console.warn("Unable to refresh monetization nav state:", error);
        }
    }

    button.style.display = hasMonetizationDashboardAccess(profile)
        ? "inline-flex"
        : "none";
}

/* ========================================
   TRAJECTORY GUARD (Indispensable Progression)
   ======================================== */

async function renderTrajectoryGuard(userId) {
    if (!window.currentUserId || window.currentUserId !== userId) return "";

    // Utiliser les métriques du mois en cours
    const now = new Date();
    const { startStr, endStr, daysInMonth } = getMonthRange(
        now.getFullYear(),
        now.getMonth(),
    );

    try {
        const { data: metrics } = await supabase
            .from("daily_metrics")
            .select("date, success_count")
            .eq("user_id", userId)
            .gte("date", startStr)
            .lte("date", endStr);

        const successData = Array(daysInMonth).fill(0);
        (metrics || []).forEach((m) => {
            const d = new Date(m.date).getDate();
            successData[d - 1] = m.success_count || 0;
        });

        // Calcul du momentum aligné sur analytics.js
        const activeDays = successData.filter((v) => v > 0).length;
        const totalVolume = successData.reduce((a, b) => a + b, 0);
        const frequency = activeDays / now.getDate();
        const mean = totalVolume / now.getDate();
        const variance =
            successData
                .slice(0, now.getDate())
                .reduce((a, b) => a + Math.pow(b - mean, 2), 0) / now.getDate();
        const consistency = 1 / (1 + Math.pow(variance, 0.5));
        const avgDaily = activeDays > 0 ? totalVolume / activeDays : 0;
        const intensity = Math.min(1.4, 0.5 + avgDaily / 4);

        const momentum =
            activeDays > 0
                ? Math.min(
                      100,
                      Math.round(
                          intensity *
                              Math.pow(frequency, 1.5) *
                              consistency *
                              130,
                      ),
                  )
                : 0;

        const needsAction = successData[now.getDate() - 1] === 0;

        return `
            <div class="trajectory-guard ${momentum < 30 ? "guard-low" : "guard-solid"}">
                <div class="guard-header">
                    <div class="guard-title">
                        <span class="guard-icon">${momentum < 30 ? "⚠️" : "⚡"}</span>
                        <strong>État de trajectoire</strong>
                    </div>
                    <div class="guard-momentum">
                        <span class="momentum-label">Momentum:</span>
                        <span class="momentum-value">${momentum}%</span>
                    </div>
                </div>
                <div class="guard-body">
                    <div class="guard-message">
                        <p>${
                            needsAction
                                ? "<strong>Alerte :</strong> Tu n'as pas validé de Trace aujourd'hui. Ta trajectoire risque de s'affaiblir."
                                : "<strong>Trajectoire active :</strong> Continue ! Chaque Trace renforce ton autorité sur cet ARC."
                        }</p>
                    </div>
                </div>
                <div class="guard-footer">
                    <button class="btn-guard-action" onclick="openCreateModal()">
                        ${needsAction ? "Relancer maintenant" : "Loguer une Trace"}
                    </button>
                </div>
            </div>
        `;
    } catch (e) {
        return "";
    }
}

function getArcCollaboratorsCached(arcId) {
    if (!arcId) return [];
    if (!window.arcCollaboratorsCache) window.arcCollaboratorsCache = new Map();
    return window.arcCollaboratorsCache.get(arcId) || [];
}

function invalidateArcCollaboratorCache(arcId) {
    if (!arcId || !window.arcCollaboratorsCache) return;
    window.arcCollaboratorsCache.delete(arcId);
}

async function preloadArcCollaborators(arcIds) {
    if (!Array.isArray(arcIds) || arcIds.length === 0 || !window.supabase)
        return;
    if (!window.arcCollaboratorsCache) window.arcCollaboratorsCache = new Map();
    if (!window.arcCollaboratorsPending)
        window.arcCollaboratorsPending = new Set();

    const uniqueIds = Array.from(new Set(arcIds.filter(Boolean)));
    const idsToFetch = uniqueIds.filter(
        (id) =>
            !window.arcCollaboratorsCache.has(id) &&
            !window.arcCollaboratorsPending.has(id),
    );
    if (idsToFetch.length === 0) return;

    idsToFetch.forEach((id) => window.arcCollaboratorsPending.add(id));

    try {
        const { data, error } = await supabase
            .from("arc_collaborations")
            .select("arc_id, collaborator_id, status")
            .in("arc_id", idsToFetch)
            .eq("status", "accepted");

        if (error) throw error;

        const rows = data || [];
        const collaboratorIds = Array.from(
            new Set(rows.map((r) => r.collaborator_id).filter(Boolean)),
        );

        let usersById = new Map();
        if (collaboratorIds.length > 0) {
            const { data: usersData, error: usersError } = await supabase
                .from("users")
                .select("id, name, avatar")
                .in("id", collaboratorIds);
            if (usersError) throw usersError;
            (usersData || []).forEach((u) => usersById.set(u.id, u));
        }

        const map = new Map();
        rows.forEach((row) => {
            const user = usersById.get(row.collaborator_id);
            if (!user) return;
            if (!map.has(row.arc_id)) map.set(row.arc_id, []);
            map.get(row.arc_id).push(user);
        });

        idsToFetch.forEach((id) => {
            window.arcCollaboratorsCache.set(id, map.get(id) || []);
        });
    } catch (error) {
        console.error("Erreur chargement collaborateurs ARC:", error);
        idsToFetch.forEach((id) => {
            if (!window.arcCollaboratorsCache.has(id)) {
                window.arcCollaboratorsCache.set(id, []);
            }
        });
    } finally {
        idsToFetch.forEach((id) => window.arcCollaboratorsPending.delete(id));
    }
}

async function fetchArcCollabStatusMap(arcIds, viewerId) {
    const statusMap = new Map();
    if (
        !viewerId ||
        !Array.isArray(arcIds) ||
        arcIds.length === 0 ||
        !window.supabase
    )
        return statusMap;
    const uniqueIds = Array.from(new Set(arcIds.filter(Boolean)));
    if (uniqueIds.length === 0) return statusMap;

    try {
        const { data, error } = await supabase
            .from("arc_collaborations")
            .select("arc_id, status")
            .eq("collaborator_id", viewerId)
            .in("arc_id", uniqueIds);
        if (error) throw error;
        (data || []).forEach((row) => {
            if (row?.arc_id) statusMap.set(row.arc_id, row.status);
        });
    } catch (error) {
        console.error("Erreur récupération statut collaboration ARC:", error);
    }
    return statusMap;
}

async function fetchPendingArcCollabRequests(ownerId) {
    if (!ownerId || !window.supabase) return [];
    try {
        const { data, error } = await supabase
            .from("arc_collaborations")
            .select("id, arc_id, collaborator_id, created_at")
            .eq("owner_id", ownerId)
            .eq("status", "pending")
            .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = data || [];
        if (rows.length === 0) return [];

        const arcIds = Array.from(
            new Set(rows.map((r) => r.arc_id).filter(Boolean)),
        );
        const collaboratorIds = Array.from(
            new Set(rows.map((r) => r.collaborator_id).filter(Boolean)),
        );

        const [arcRes, userRes] = await Promise.all([
            arcIds.length > 0
                ? supabase.from("arcs").select("id, title").in("id", arcIds)
                : Promise.resolve({ data: [] }),
            collaboratorIds.length > 0
                ? supabase
                      .from("users")
                      .select("id, name, avatar")
                      .in("id", collaboratorIds)
                : Promise.resolve({ data: [] }),
        ]);

        const arcMap = new Map((arcRes.data || []).map((a) => [a.id, a]));
        const userMap = new Map((userRes.data || []).map((u) => [u.id, u]));

        return rows.map((row) => ({
            id: row.id,
            arcId: row.arc_id,
            collaboratorId: row.collaborator_id,
            createdAt: row.created_at,
            arc: arcMap.get(row.arc_id) || null,
            collaborator: userMap.get(row.collaborator_id) || null,
        }));
    } catch (error) {
        console.error("Erreur récupération demandes collaboration ARC:", error);
        return [];
    }
}

async function fetchCollaboratorArcs(userId) {
    if (!userId || !window.supabase) return [];
    try {
        const { data, error } = await supabase
            .from("arc_collaborations")
            .select("arc_id")
            .eq("collaborator_id", userId)
            .eq("status", "accepted");
        if (error) throw error;
        const arcIds = Array.from(
            new Set((data || []).map((r) => r.arc_id).filter(Boolean)),
        );
        if (arcIds.length === 0) return [];

        const { data: arcsData, error: arcsError } = await supabase
            .from("arcs")
            .select("*, users(id, name, avatar)")
            .in("id", arcIds)
            .order("created_at", { ascending: false });
        if (arcsError) throw arcsError;

        return arcsData || [];
    } catch (error) {
        console.error("Erreur récupération ARCs collaboratifs:", error);
        return [];
    }
}

/**
 * Récupère les "Evidence of Work" (GitHub, Figma, Notion...) depuis le backend
 */
async function fetchWorkItems(userId) {
    if (!userId) return [];
    try {
        const response = await fetch(`/api/work-items/${userId}`);
        if (!response.ok) return [];
        return await response.json();
    } catch (e) {
        console.warn("Erreur fetchWorkItems:", e);
        return [];
    }
}

function renderWorkItemsHtml(items) {
    if (!items || items.length === 0) return "";

    const itemsHtml = items
        .map((item) => {
            const sourceLabel = String(item.source || "outil").toUpperCase();
            const imageUrl = item.previewUrl || item.mediaUrl;

            let extraContentHtml = "";
            if (item.source === "github" && item.codeSnippet) {
                extraContentHtml = `
                <div style="background: #1e293b; padding: 10px; border-radius: 8px; margin: 10px 0; border: 1px solid #334155; overflow-x: auto;">
                    <pre style="margin: 0; color: #94a3b8; font-family: monospace; font-size: 0.75rem; line-height: 1.4;">${escapeHtml(item.codeSnippet)}</pre>
                </div>
            `;
            } else if (imageUrl) {
                extraContentHtml = `
                <div style="margin: 12px 0;">
                    <img src="${imageUrl}" style="width: 100%; height: auto; max-height: 280px; border-radius: 12px; object-fit: cover; border: 1px solid var(--border-color);">
                </div>
            `;
            }

            return `
            <div class="work-item-card" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.2rem; margin-bottom: 1rem; transition: transform 0.2s;">
                <div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:0.8rem;">
                    <img src="icons/${item.source}.svg" onerror="this.src='icons/tech.svg'" style="width:16px;height:16px;opacity:0.7;">
                    <span style="font-size:0.7rem; font-weight:700; color: var(--text-secondary); letter-spacing: 0.1em;">${sourceLabel}</span>
                    <span style="font-size:0.7rem; color: var(--text-muted); margin-left:auto;">${new Date(item.timestamp).toLocaleDateString()}</span>
                </div>
                <h4 style="margin: 0 0 0.4rem; font-size: 0.95rem;">${escapeHtml(item.title)}</h4>
                ${item.description ? `<p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">${escapeHtml(item.description)}</p>` : ""}
                ${extraContentHtml}
                <div style="margin-top: 0.8rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${(item.metadata?.skills || []).map((skill) => `<span style="font-size: 0.65rem; background: rgba(59, 130, 246, 0.1); color: #60a5fa; padding: 2px 8px; border-radius: 4px;">${escapeHtml(skill)}</span>`).join("")}
                </div>
            </div>
        `;
        })
        .join("");

    return `
        <div class="work-items-section" style="margin: 2rem 0;">
            <h3 style="margin-bottom: 1.2rem; font-size: 1.1rem; display: flex; align-items: center; gap: 0.6rem;">
                <img src="icons/tech.svg" style="width:20px;height:20px;">
                Preuves de travail
            </h3>
            <div class="work-items-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem;">
                ${itemsHtml}
            </div>
        </div>
    `;
}

async function requestArcCollaboration(arcId, ownerId) {
    if (!window.currentUser) {
        if (window.ToastManager) {
            ToastManager.info(
                "Login required",
                "Log in to request a collaboration",
            );
        } else {
            alert("Log in to request a collaboration.");
        }
        setTimeout(() => (window.location.href = "login.html"), 1200);
        return;
    }

    if (!arcId || !ownerId) return;
    if (window.currentUser.id === ownerId) {
        ToastManager?.info(
            "Déjà propriétaire",
            "Vous êtes déjà propriétaire de ce projet.",
        );
        return;
    }

    const profile = getCurrentUserProfile();
    if (isUserBanned(profile)) {
        const remaining = getBanRemainingLabel(profile);
        ToastManager?.error(
            "Compte temporairement banni",
            remaining
                ? `Vous pourrez réessayer dans ${remaining}.`
                : "Vous ne pouvez pas collaborer pour le moment.",
        );
        return;
    }

    try {
        const { error } = await supabase.from("arc_collaborations").upsert(
            {
                arc_id: arcId,
                owner_id: ownerId,
                collaborator_id: window.currentUser.id,
                status: "pending",
            },
            { onConflict: "arc_id,collaborator_id" },
        );
        if (error) throw error;

        invalidateArcCollaboratorCache(arcId);
        ToastManager?.success(
            "Demande envoyée",
            "Votre demande de collaboration a été envoyée.",
        );
        await renderProfileIntoContainer(
            window.currentProfileViewed || ownerId,
        );
    } catch (error) {
        console.error("Erreur demande collaboration:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible d'envoyer la demande.",
        );
    }
}

async function acceptArcCollaboration(requestId, arcId, collaboratorId) {
    if (!requestId || !window.currentUser) return;
    try {
        const { error } = await supabase
            .from("arc_collaborations")
            .update({ status: "accepted" })
            .eq("id", requestId);
        if (error) throw error;
        invalidateArcCollaboratorCache(arcId);
        ToastManager?.success(
            "Collaboration acceptée",
            "Le collaborateur a été ajouté.",
        );
        await renderProfileIntoContainer(window.currentUser.id);
        if (typeof renderDiscoverGrid === "function") renderDiscoverGrid();
    } catch (error) {
        console.error("Erreur acceptation collaboration:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible d'accepter.",
        );
    }
}

async function declineArcCollaboration(requestId, arcId) {
    if (!requestId || !window.currentUser) return;
    try {
        const { error } = await supabase
            .from("arc_collaborations")
            .update({ status: "declined" })
            .eq("id", requestId);
        if (error) throw error;
        invalidateArcCollaboratorCache(arcId);
        ToastManager?.info("Demande refusée", "La demande a été refusée.");
        await renderProfileIntoContainer(window.currentUser.id);
    } catch (error) {
        console.error("Erreur refus collaboration:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de refuser.",
        );
    }
}

async function leaveArcCollaboration(arcId) {
    if (!arcId || !window.currentUser) return;
    try {
        const { error } = await supabase
            .from("arc_collaborations")
            .update({ status: "left" })
            .eq("arc_id", arcId)
            .eq("collaborator_id", window.currentUser.id);
        if (error) throw error;
        if (window.selectedArcId === arcId) {
            window.selectedArcId = null;
        }
        invalidateArcCollaboratorCache(arcId);
        ToastManager?.info(
            "Collaboration quittée",
            "Vous ne collaborez plus sur ce projet.",
        );
        await renderProfileIntoContainer(
            window.currentProfileViewed || window.currentUser.id,
        );
        if (typeof renderDiscoverGrid === "function") renderDiscoverGrid();
    } catch (error) {
        console.error("Erreur quitter collaboration:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de quitter la collaboration.",
        );
    }
}

function buildArcCollaboratorAvatars(content, options = {}) {
    if (!content || !content.arc || !content.arc.id) return "";
    const collaborators = getArcCollaboratorsCached(content.arc.id);
    if (!collaborators || collaborators.length === 0) return "";

    const ownerId = content.arc.ownerId || content.arc.user_id || null;
    const ownerUser = ownerId
        ? getUser(ownerId) || {
              id: ownerId,
              name: content.arc.ownerName,
              avatar: content.arc.ownerAvatar,
          }
        : null;
    if (!ownerUser) return "";

    let collaborator = null;
    if (content.userId && content.userId !== ownerId) {
        collaborator =
            collaborators.find((u) => u.id === content.userId) ||
            collaborators.find((u) => u.id !== ownerId);
    } else {
        collaborator = collaborators.find((u) => u.id !== ownerId);
    }
    if (!collaborator) return "";

    const size = options.size || 22;
    const className = options.className || "";
    const label = options.label || "Collaboration";
    const fromImmersive = !!options.fromImmersive;

    const renderAvatarButton = (user, roleLabel) => {
        if (!user?.id) return "";
        const safeName = escapeHtml(user.name || roleLabel || "Collaborateur");
        return `
            <button type="button" onclick="event.stopPropagation(); handleProfileClick('${user.id}', this, ${fromImmersive})" aria-label="Voir le profil de ${safeName}">
                <img src="${user.avatar || "https://placehold.co/32"}" alt="Avatar ${safeName}" style="width:${size}px; height:${size}px;">
            </button>
`;
    };

    return `
<div class="arc-collab-avatars ${className}" title="${label}">
            ${renderAvatarButton(ownerUser, "Créateur")}
            ${renderAvatarButton(collaborator, "Collaborateur")}
</div>
    `;
}

function buildArcCollaboratorCornerAvatars(content, options = {}) {
    if (!content || !content.arc || !content.arc.id) return "";
    const collaborators = getArcCollaboratorsCached(content.arc.id) || [];
    if (collaborators.length === 0) return "";

    const ownerId = content.arc.ownerId || content.arc.user_id || null;
    const ownerUser = ownerId
        ? getUser(ownerId) || {
              id: ownerId,
              name: content.arc.ownerName || "Créateur",
              avatar: content.arc.ownerAvatar || "https://placehold.co/32",
          }
        : null;

    const participants = new Map();
    if (ownerUser?.id) participants.set(ownerUser.id, ownerUser);
    collaborators.forEach((user) => {
        if (user?.id) participants.set(user.id, user);
    });

    const authorId = content.userId || null;
    const others = Array.from(participants.values()).filter(
        (user) => user && user.id && user.id !== authorId,
    );
    if (others.length === 0) return "";

    const size = options.size || 18;
    const className = options.className || "";
    const max = Math.max(1, options.max || 3);
    const visible = others.slice(0, max);
    const hiddenCount = Math.max(0, others.length - visible.length);
    const label = options.label || "Autres collaborateurs";
    const fromImmersive = !!options.fromImmersive;

    const avatarsHtml = visible
        .map((user) => {
            const safeName = escapeHtml(user?.name || "Collaborateur");
            return `
                    <button type="button" onclick="event.stopPropagation(); handleProfileClick('${user.id}', this, ${fromImmersive})" aria-label="Voir le profil de ${safeName}">
                        <img src="${user.avatar || "https://placehold.co/32"}" alt="Collaborateur ${safeName}" style="width:${size}px; height:${size}px;">
                    </button>
                `;
        })
        .join("");

    const moreHtml =
        hiddenCount > 0
            ? `<span class="arc-collab-more" aria-label="+${hiddenCount} collaborateurs">+${hiddenCount}</span>`
            : "";

    return `
<div class="arc-collab-avatars arc-collab-avatars--corner ${className}" title="${label}">
            ${avatarsHtml}
            ${moreHtml}
</div>
    `;
}

window.requestArcCollaboration = requestArcCollaboration;
window.acceptArcCollaboration = acceptArcCollaboration;
window.declineArcCollaboration = declineArcCollaboration;
window.leaveArcCollaboration = leaveArcCollaboration;
window.fetchArcCollabStatusMap = fetchArcCollabStatusMap;
window.fetchCollaboratorArcs = fetchCollaboratorArcs;
window.preloadArcCollaborators = preloadArcCollaborators;
/* ========================================
   INITIALISATION ET AUTHENTIFICATION
   ======================================== */
const LIVE_ORPHAN_TIMEOUT_MS = 45000;

async function closeOwnOrphanLiveSessions(userId, options = {}) {
    if (!userId || typeof supabase === "undefined" || !supabase) {
        return { closed: 0, checked: 0 };
    }

    const staleMs =
        Number(options.staleMs) > 0
            ? Number(options.staleMs)
            : LIVE_ORPHAN_TIMEOUT_MS;
    const nowMs = Date.now();

    try {
        const { data: liveSessions, error: sessionError } = await supabase
            .from("streaming_sessions")
            .select("id, started_at")
            .eq("user_id", userId)
            .eq("status", "live");

        if (sessionError) throw sessionError;
        if (!Array.isArray(liveSessions) || liveSessions.length === 0) {
            return { closed: 0, checked: 0 };
        }

        const streamIds = liveSessions
            .map((session) => session?.id)
            .filter(Boolean);

        if (streamIds.length === 0) {
            return { closed: 0, checked: 0 };
        }

        const { data: presenceRows, error: presenceError } = await supabase
            .from("stream_viewers")
            .select("stream_id, last_seen")
            .eq("user_id", userId)
            .in("stream_id", streamIds);

        if (presenceError) throw presenceError;

        const lastSeenByStreamId = new Map();
        (presenceRows || []).forEach((row) => {
            if (!row?.stream_id || !row?.last_seen) return;
            const ts = new Date(row.last_seen).getTime();
            if (!Number.isFinite(ts)) return;
            const prev = lastSeenByStreamId.get(row.stream_id) || 0;
            if (ts > prev) lastSeenByStreamId.set(row.stream_id, ts);
        });

        let closed = 0;
        for (const session of liveSessions) {
            const startedMs = session?.started_at
                ? new Date(session.started_at).getTime()
                : 0;
            const fallbackSeenMs =
                Number.isFinite(startedMs) && startedMs > 0 ? startedMs : nowMs;
            const lastSeenMs =
                lastSeenByStreamId.get(session.id) || fallbackSeenMs;
            if (!lastSeenMs || nowMs - lastSeenMs <= staleMs) continue;

            const endedAtIso = new Date(lastSeenMs).toISOString();
            const { error: closeError } = await supabase
                .from("streaming_sessions")
                .update({ status: "ended", ended_at: endedAtIso })
                .eq("id", session.id)
                .eq("user_id", userId)
                .eq("status", "live");

            if (!closeError) closed += 1;
        }

        return { closed, checked: liveSessions.length };
    } catch (error) {
        console.warn("Fermeture auto des lives orphelins échouée:", error);
        return {
            closed: 0,
            checked: 0,
            error: error?.message || String(error),
        };
    }
}

// Vérifier l'authentification au chargement
async function initializeApp() {
    if (typeof FluidityEngine !== "undefined") FluidityEngine.startLoading();

    // RESTORE SESSION IMMEDIATELY TO AVOID FLICKER (Visitor -> Owner)
    const savedSession =
        typeof SessionManager !== "undefined"
            ? SessionManager.loadSession()
            : null;
    if (savedSession && savedSession.id) {
        window.currentUser = savedSession;
        window.currentUserId = savedSession.id;
        window.currentViewerId = savedSession.id;
        // Mettre à jour l'UI immédiatement comme connecté
        updateNavigation(true);
    }

    const grid = document.querySelector(".discover-grid");
    const waitMessage = document.querySelector(".wait");
    const initialProfileId = getInitialProfileUserId();
    const initialArcId = getInitialArcId();
    const initialContentId = getInitialContentId();
    const profileOnlyPage = isProfileOnlyPage();
    const discoverAvailable = hasDiscoverPage();

    const hydratedDiscover = hydrateDiscoverFromCache();
    if (hydratedDiscover) {
        if (initialProfileId) {
            hydrateProfileContentsFromCache(initialProfileId);
        } else if (window.currentUserId && profileOnlyPage) {
            hydrateProfileContentsFromCache(window.currentUserId);
        }

        // Render immediately from cache to feel instant on slow networks.
        Promise.resolve().then(async () => {
            try {
                await renderDiscoverGrid();
                if (typeof window.ToastManager !== "undefined") {
                    window.ToastManager.success(
                        "XΞRA High-Signal",
                        "Momentum Engine & Fluidity Active.",
                        3000,
                    );
                }
                if (initialProfileId) {
                    if (initialArcId) window.selectedArcId = initialArcId;
                    window.currentProfileViewed = initialProfileId;
                    await renderProfileIntoContainer(initialProfileId);
                } else if (profileOnlyPage && window.currentUserId) {
                    await renderProfileIntoContainer(window.currentUserId);
                }
            } catch (e) {
                // ignore cache render failures
            }
        });
    }

    // Timeout de sécurité : si rien ne se passe après 1 minute
    const safetyTimeout = setTimeout(() => {
        if (document.querySelector(".loading-state-container")) {
            console.warn("Initialization timed out");
            window.initialDataSlow = true;
            window.initialDataSlowMessage = SLOW_CONNECTION_MESSAGE;
            if (grid) showDiscoverSkeleton(grid, 8, { showSlowNotice: true });
            if (waitMessage) waitMessage.classList.add("is-hidden");
        }
    }, 60000);

    try {
        if (
            grid &&
            window.LoadingStateManager &&
            typeof LoadingStateManager.showSpinner === "function"
        ) {
            LoadingStateManager.showSpinner(grid);
        }

        // Vérifier si Supabase est chargé
        if (typeof supabase === "undefined" || !supabase) {
            window.userLoadError = "Supabase client introuvable";
            window.hasLoadedUsers = true;
            await renderDiscoverGrid();
            if (typeof window.ToastManager !== "undefined") {
                window.ToastManager.success(
                    "XΞRA High-Signal",
                    "Momentum Engine & Fluidity Active.",
                    3000,
                );
            }
            if (waitMessage) waitMessage.classList.add("is-hidden");
            clearTimeout(safetyTimeout);
            return;
        }

        const skipLanding = isMobileDevice();
        // savedSession already loaded at the top to avoid flicker

        // Vérifier la session avec Supabase
        const user = await withTimeout(
            checkAuth(),
            INITIAL_AUTH_TIMEOUT_MS,
            "Auth check",
        );

        if (!user && profileOnlyPage && !initialProfileId) {
            clearTimeout(safetyTimeout);
            window.location.href = "login.html";
            return;
        }

        const heroVisibilityPromise = updateHeroVisibilityForUser(
            user ? user.id : null,
        );

        if (user) {
            window.currentUser = user;
            window.currentUserId = user.id;
            window.currentViewerId = user.id;
            trackPostPublishUpsellConversion(user);

            const isCurrentRoutePro = isPageProRoute();

            if (window.professionalManager) {
                window.professionalManager.initNavigation();
            }
            if (typeof SessionManager !== "undefined") {
                SessionManager.saveSession(user);
            }
            const orphanCleanupResult = await closeOwnOrphanLiveSessions(
                user.id,
            );
            if (orphanCleanupResult.closed > 0) {
                console.info(
                    `[live] ${orphanCleanupResult.closed} live(s) orphelin(s) fermé(s) automatiquement.`,
                );
            }
            updateNavigation(true);
            // Démarrer les notifications maintenant que l'utilisateur est connu
            if (typeof initializeNotifications === "function") {
                initializeNotifications();
                const notifBtn = document.getElementById("notification-btn");
                if (notifBtn) notifBtn.style.display = "flex";
            }
            if (discoverAvailable && !isCurrentRoutePro) {
                navigateTo("discover");
            }
            await Promise.all([
                runInitialDataLoad(loadAllData, "Initial private data load"),
                withTimeout(
                    heroVisibilityPromise,
                    INITIAL_AUTH_TIMEOUT_MS,
                    "Hero visibility load",
                ),
            ]);

            if (window.professionalManager) {
                window.professionalManager.initNavigation();
            }
        } else if (savedSession) {
            if (typeof ToastManager !== "undefined") {
                ToastManager.info(
                    "Session expirée",
                    "Veuillez vous reconnecter",
                );
            }
            if (typeof SessionManager !== "undefined") {
                SessionManager.clearSession();
            }
            updateNavigation(false);
            await Promise.all([
                runInitialDataLoad(loadPublicData, "Initial public data load"),
                withTimeout(
                    heroVisibilityPromise,
                    INITIAL_AUTH_TIMEOUT_MS,
                    "Hero visibility load",
                ),
            ]);

            if (window.professionalManager) {
                window.professionalManager.initNavigation();
            }
        } else {
            updateNavigation(false);
            await Promise.all([
                runInitialDataLoad(loadPublicData, "Initial public data load"),
                withTimeout(
                    heroVisibilityPromise,
                    INITIAL_AUTH_TIMEOUT_MS,
                    "Hero visibility load",
                ),
            ]);

            if (window.professionalManager) {
                window.professionalManager.initNavigation();
            }
        }

        if (skipLanding && discoverAvailable) {
            navigateTo("discover");
        }

        initTheme();
        subscribeToRealtime();

        await renderDiscoverGrid();
        if (typeof window.ToastManager !== "undefined") {
            window.ToastManager.success(
                "XΞRA High-Signal",
                "Momentum Engine & Fluidity Active.",
                3000,
            );
        }

        if (initialProfileId) {
            if (initialArcId) window.selectedArcId = initialArcId;
            window.currentProfileViewed = initialProfileId;
            await renderProfileIntoContainer(initialProfileId);
            if (initialContentId) {
                setTimeout(() => {
                    document
                        .querySelector(
                            `[data-content-id="${initialContentId}"]`,
                        )
                        ?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                        });
                }, 500);
            }
        } else if (profileOnlyPage && window.currentUserId) {
            await renderProfileIntoContainer(window.currentUserId);
        }
        await maybeHandleInitialEmailAction();

        await maybeResumePaymentReturnContext();
        handleLoginPromptContext();
        await maybeStartFirstPostFlow();
        if (typeof initializeMessaging === "function" && window.currentUserId) {
            await initializeMessaging();
        }

        // Trigger smart nudges & tutorial after data is ready
        setTimeout(() => {
            try {
                if (window.XeraNudgeManager) {
                    window.XeraNudgeManager.checkActivity();
                }
                // Vérifier si le tutoriel est déjà terminé avant de lancer
                const isTutorialCompleted =
                    localStorage.getItem("xera-tutorial-completed") === "true";
                if (window.XeraTutorial && !isTutorialCompleted) {
                    // Ne pas lancer le tutoriel pour les comptes Pro
                    try {
                        const isPro =
                            window.currentUser &&
                            window.isProUser &&
                            window.isProUser(window.currentUser);
                        if (!isPro) {
                            console.log("Démarrage du tutoriel XERA...");
                            window.XeraTutorial.init();
                        } else {
                            console.log(
                                "Tutoriel XERA ignoré pour compte Pro.",
                            );
                        }

                        // Masquer le hero / CTA principal pour les comptes Pro
                        try {
                            if (isPro) {
                                const hero = document.getElementById("hero");
                                if (hero) {
                                    hero.style.display = "none";
                                    console.log("Hero masqué pour compte Pro.");
                                }
                            }
                        } catch (hideErr) {
                            console.warn(
                                "Erreur masquage hero pour Pro:",
                                hideErr,
                            );
                        }
                    } catch (e) {
                        console.warn(
                            "Erreur vérification Pro pour tutoriel:",
                            e,
                        );
                        // En cas d'erreur, démarrer par sécurité
                        window.XeraTutorial.init();
                    }
                }
            } catch (err) {
                console.warn("Erreur démarrage tutoriel/nudges:", err);
            }
        }, 1500);

        clearTimeout(safetyTimeout);
    } catch (error) {
        console.error("Initialization error:", error);
        clearTimeout(safetyTimeout);
        window.userLoadError = error?.message || "Erreur de chargement";
        window.hasLoadedUsers = true;
        if (profileOnlyPage && (initialProfileId || window.currentUserId)) {
            try {
                await runInitialDataLoad(
                    loadPublicData,
                    "Fallback public profile load",
                );
                await renderProfileIntoContainer(
                    initialProfileId || window.currentUserId,
                );
            } catch (profileError) {
                console.error("Fallback profile render failed:", profileError);
            }
        } else {
            await renderDiscoverGrid();
        }
        if (typeof window.ToastManager !== "undefined") {
            window.ToastManager.success(
                "XΞRA High-Signal",
                "Momentum Engine & Fluidity Active.",
                3000,
            );
        }
        if (waitMessage) waitMessage.classList.add("is-hidden");
    }
}

// Mettre à jour la navigation selon l'état de connexion
let navAvatarRefreshPromise = null;

function setNavProfileAvatar(rawAvatar, userId = null) {
    const navAvatar =
        document.getElementById("nav-profile-avatar") ||
        document.getElementById("navAvatar") ||
        document.querySelector("#nav-profile .profile-nav-avatar") ||
        document.querySelector("nav .profile-nav-avatar") ||
        document.getElementById("hub-user-avatar");
    if (!navAvatar) return;
    const resolvedUserId =
        userId || window.currentUser?.id || window.currentUserId || null;
    const cachedUser = resolvedUserId ? getUser(resolvedUserId) : null;
    const explicitAvatar =
        rawAvatar && String(rawAvatar).trim() ? String(rawAvatar).trim() : "";
    const cachedAvatar =
        cachedUser?.avatar ||
        window.currentUser?.avatar ||
        window.currentUser?.user_metadata?.avatar_url ||
        window.currentUser?.user_metadata?.avatar ||
        "";
    const avatarValue = explicitAvatar || String(cachedAvatar || "").trim();
    if (!avatarValue) return;
    const avatarUser =
        cachedUser && explicitAvatar
            ? { ...cachedUser, avatar: explicitAvatar }
            : cachedUser;
    if (avatarUser && isGifUrl(avatarValue) && !hasActivePaidPlan(avatarUser)) {
        const snapshot = getGifSnapshot(avatarValue);
        if (snapshot) {
            navAvatar.src = snapshot;
            return;
        }
        queueGifSnapshot(avatarUser.id, "avatar", avatarValue);
    }
    navAvatar.src = avatarValue.startsWith("http")
        ? withCacheBust(avatarValue)
        : avatarValue;
}

window.setNavProfileAvatar = setNavProfileAvatar;

async function refreshCurrentUserNavAvatar(force = false) {
    const userId = window.currentUser?.id || window.currentUserId || null;
    if (!userId || typeof getUserProfile !== "function") return null;
    if (navAvatarRefreshPromise && !force) return navAvatarRefreshPromise;

    navAvatarRefreshPromise = (async () => {
        try {
            const result = await getUserProfile(userId);
            if (!result?.success || !result.data) return null;
            const sanitized = sanitizeUserMedia(result.data);
            const mergedUser =
                typeof applyUserUpdateToCache === "function"
                    ? applyUserUpdateToCache(sanitized)
                    : sanitized;
            if (mergedUser?.avatar) {
                setNavProfileAvatar(mergedUser.avatar, mergedUser.id || userId);
            }
            return mergedUser;
        } catch (error) {
            console.warn("Unable to refresh nav avatar:", error);
            return null;
        } finally {
            navAvatarRefreshPromise = null;
        }
    })();

    return navAvatarRefreshPromise;
}

function updateNavigation(isLoggedIn) {
    const navAuth = document.getElementById("nav-auth");
    const navProfile = document.getElementById("nav-profile");
    const navMessages = document.getElementById("messages-nav-btn");

    if (navAuth) {
        if (isLoggedIn) {
            navAuth.style.display = "none";
        } else {
            navAuth.style.display = "block";
            navAuth.textContent = "Login / Register";
            navAuth.onclick = () => (window.location.href = "login.html");
        }
    }

    if (navProfile) {
        if (!isLoggedIn) {
            navProfile.style.display = "none";
        } else {
            navProfile.style.display = navProfile.classList.contains(
                "notification-button",
            )
                ? "flex"
                : "block";
            const cachedUser =
                getUser(
                    window.currentUser?.id || window.currentUserId || null,
                ) || null;
            const directAvatar =
                cachedUser?.avatar ||
                window.currentUser?.avatar ||
                window.currentUser?.user_metadata?.avatar_url ||
                window.currentUser?.user_metadata?.avatar;
            if (directAvatar) {
                setNavProfileAvatar(
                    directAvatar,
                    cachedUser?.id || window.currentUser?.id,
                );
                refreshCurrentUserNavAvatar(false);
            } else if (window.currentUser?.id) {
                refreshCurrentUserNavAvatar(true);
            }
        }
    }

    if (navMessages) {
        navMessages.style.display = isLoggedIn ? "flex" : "none";
    }

    updateMonetizationNavButton(isLoggedIn);

    if (!isLoggedIn && typeof window.cleanupMessaging === "function") {
        window.cleanupMessaging();
    }

    // Retirer le bouton réglages de la nav s'il existait
    const navSettings = document.getElementById("nav-settings-btn");
    if (navSettings) navSettings.remove();

    // Gestion de l'affichage Pro/Institution
    const isPro = window.isProUser && window.isProUser(window.currentUser);
    const navPro = document.getElementById("nav-pro-page");

    if (isLoggedIn && (isPro || window.userHasProPage)) {
        if (navPro) {
            navPro.style.setProperty("display", "flex", "important");
            console.log("[Auth] Navigation Pro activée (Force Show).");
        }
    }

    if (isLoggedIn && window.professionalManager) {
        window.professionalManager.initNavigation();
    }

    handleLoginPromptContext();
}

/* ========================================
   HERO VISIBILITY (Landing)
   ======================================== */
const HERO_STATE = {
    LOADING: "loading",
    HIDDEN: "hidden",
    VISIBLE: "visible",
};
const ARC_COUNT_CACHE_KEY_PREFIX = "rize:arc-count:";
const ARC_COUNT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const userArcCounts = new Map();
let heroStateSafetyTimeout = null;

function applyProHeroVisibility() {
    const isPro = Boolean(
        window.currentUser &&
        window.isProUser &&
        window.isProUser(window.currentUser),
    );

    document.body.classList.toggle("xera-pro-account", isPro);

    const hero = document.getElementById("hero");
    if (hero) {
        hero.style.display = isPro ? "none" : "";
    }
}
window.applyProHeroVisibility = applyProHeroVisibility;

const proHeroVisibilityObserver = new MutationObserver(() => {
    try {
        applyProHeroVisibility();
    } catch (err) {
        console.warn("Erreur revalidation hero Pro:", err);
    }
});

if (document.body) {
    proHeroVisibilityObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

document.addEventListener("DOMContentLoaded", () => {
    applyProHeroVisibility();
});
window.addEventListener("load", () => {
    applyProHeroVisibility();
});

function setHeroState(state) {
    const hero = document.getElementById("hero");
    if (hero) {
        hero.dataset.state = state;
        hero.setAttribute(
            "aria-busy",
            state === HERO_STATE.LOADING ? "true" : "false",
        );
        hero.style.display = state === HERO_STATE.HIDDEN ? "none" : "";
    }

    if (state === HERO_STATE.LOADING) {
        clearTimeout(heroStateSafetyTimeout);
        heroStateSafetyTimeout = setTimeout(() => {
            // Fail-safe: avoid leaving the user with an empty viewport on very slow connections
            if (hero && hero.dataset.state === HERO_STATE.LOADING) {
                hero.dataset.state = HERO_STATE.VISIBLE;
                hero.style.display = "";
                hero.setAttribute("aria-busy", "false");
            }
        }, 4000);
    } else {
        clearTimeout(heroStateSafetyTimeout);
        heroStateSafetyTimeout = null;
    }
}

function cacheArcCount(userId, count) {
    userArcCounts.set(userId, count);
    try {
        sessionStorage.setItem(
            `${ARC_COUNT_CACHE_KEY_PREFIX}${userId}`,
            JSON.stringify({ count, ts: Date.now() }),
        );
    } catch (e) {
        // sessionStorage can fail in some environments (Safari private mode)
    }
}

function readArcCountFromCache(userId) {
    if (userArcCounts.has(userId)) return userArcCounts.get(userId);
    try {
        const raw = sessionStorage.getItem(
            `${ARC_COUNT_CACHE_KEY_PREFIX}${userId}`,
        );
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (
            typeof parsed?.count === "number" &&
            typeof parsed?.ts === "number" &&
            Date.now() - parsed.ts < ARC_COUNT_CACHE_TTL_MS
        ) {
            userArcCounts.set(userId, parsed.count);
            return parsed.count;
        }
    } catch (e) {
        return null;
    }
    return null;
}

async function getUserArcCount(userId) {
    if (!userId) return 0;
    const cached = readArcCountFromCache(userId);
    if (cached !== null) return cached;
    try {
        const { count, error } = await supabase
            .from("arcs")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .limit(1);
        if (error) throw error;
        const c = count || 0;
        cacheArcCount(userId, c);
        return c;
    } catch (e) {
        console.error("Error fetching arc count:", e);
        return null;
    }
}

async function updateHeroVisibilityForUser(userId) {
    const hero = document.getElementById("hero");
    const profileHero = document.querySelector(".profile-hero");
    if (!hero && !profileHero) return;

    applyProHeroVisibility();

    // Hide the onboarding hero for Pro accounts.
    const user =
        userId === window.currentUser?.id
            ? window.currentUser
            : getUser(userId);
    if (isProUser(user)) {
        setHeroState(HERO_STATE.HIDDEN);
        return;
    }

    // Not logged in -> show hero
    if (!userId) {
        setHeroState(HERO_STATE.VISIBLE);
        return;
    }

    const cached = readArcCountFromCache(userId);
    if (cached !== null) {
        setHeroState(cached > 0 ? HERO_STATE.HIDDEN : HERO_STATE.VISIBLE);
        return cached;
    }

    // Don't show LOADING state for logged-in users; they should see discover content directly
    // Query arc count without triggering skeleton display
    const count = await getUserArcCount(userId);

    if (count === null) {
        // If count fetch fails, show hero (user probably new or network issue)
        setHeroState(HERO_STATE.VISIBLE);
        return null;
    }

    // If user has projects, hide hero immediately without LOADING state
    setHeroState(count > 0 ? HERO_STATE.HIDDEN : HERO_STATE.VISIBLE);
    return count;
}

/* ========================================
   POPUP CONNEXION (DISCOVER / IMMERSIVE)
   ======================================== */

const LOGIN_PROMPT_VIEW_THRESHOLD = 5;
const LOGIN_PROMPT_REPEAT_INCREMENT = 10;
let loginPromptTimerId = null;
let loginPromptShown = false;
let loginPromptImmersiveViews = 0;
let loginPromptNextThreshold = LOGIN_PROMPT_VIEW_THRESHOLD;

function isDiscoverOrImmersiveActive() {
    const discoverActive =
        document.getElementById("discover")?.classList.contains("active") ||
        false;
    const immersiveOpen =
        document.getElementById("immersive-overlay")?.style.display === "block";
    return discoverActive || immersiveOpen;
}

function ensureLoginPromptElements() {
    if (document.getElementById("login-prompt-overlay")) return;

    const style = document.createElement("style");
    style.id = "login-prompt-style";
    style.textContent = `
.login-prompt-overlay {
            position: fixed;
            inset: 0;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.65);
            z-index: 2000;
            padding: 24px;
}
.login-prompt-overlay.active {
            display: flex;
}
.login-prompt-card {
            width: min(420px, 92vw);
            background: #0f1115;
            color: #fff;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
            text-align: center;
            border: 1px solid rgba(255, 255, 255, 0.08);
            position: relative;
}
.login-prompt-title {
            font-size: 1.25rem;
            font-weight: 700;
            margin: 0 0 8px 0;
}
.login-prompt-text {
            margin: 0 0 16px 0;
            color: rgba(255, 255, 255, 0.8);
            font-size: 0.95rem;
}
.login-prompt-cta {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            width: 100%;
            padding: 12px 16px;
            border: none;
            border-radius: 10px;
            background: #ffffff;
            color: #0f1115;
            font-weight: 700;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.login-prompt-cta:hover {
            transform: translateY(-1px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}
.login-prompt-close {
            position: absolute;
            top: 10px;
            right: 10px;
            width: 36px;
            height: 36px;
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.04);
            color: #fff;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.12s ease, background 0.12s ease;
}
.login-prompt-close:hover {
            transform: scale(1.05);
            background: rgba(255,255,255,0.08);
}
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "login-prompt-overlay";
    overlay.className = "login-prompt-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
<div class="login-prompt-card">
            <button class="login-prompt-close" aria-label="Fermer">✕</button>
            <h3 class="login-prompt-title">Vous aimez XERA ?</h3>
            <p class="login-prompt-text">
                Connectez-vous et profitez sans interruption.
            </p>
            <button class="login-prompt-cta" data-login-action="true">
                Se connecter / Créer un compte
            </button>
</div>
    `;
    overlay.addEventListener("click", () => {
        window.location.href = "login.html";
    });
    overlay
        .querySelector("[data-login-action]")
        ?.addEventListener("click", (event) => {
            event.stopPropagation();
            window.location.href = "login.html";
        });
    overlay
        .querySelector(".login-prompt-card")
        ?.addEventListener("click", (event) => event.stopPropagation());
    overlay
        .querySelector(".login-prompt-close")
        ?.addEventListener("click", (event) => {
            event.stopPropagation();
            dismissLoginPrompt();
        });
    document.body.appendChild(overlay);
}

function showLoginPrompt() {
    if (loginPromptShown || window.currentUser) return;
    ensureLoginPromptElements();
    const overlay = document.getElementById("login-prompt-overlay");
    if (!overlay) return;
    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
    loginPromptShown = true;
    stopLoginPromptTimer();
}

function dismissLoginPrompt() {
    const overlay = document.getElementById("login-prompt-overlay");
    if (overlay) {
        overlay.classList.remove("active");
        overlay.setAttribute("aria-hidden", "true");
    }
    loginPromptShown = false;
    // reprogrammer après 10 vues supplémentaires
    loginPromptNextThreshold =
        loginPromptImmersiveViews + LOGIN_PROMPT_REPEAT_INCREMENT;
}

function startLoginPromptTimer() {
    if (loginPromptTimerId || loginPromptShown || window.currentUser) return;
    loginPromptTimerId = setTimeout(() => {
        loginPromptTimerId = null;
        if (!window.currentUser && isDiscoverOrImmersiveActive()) {
            showLoginPrompt();
        }
    }, LOGIN_PROMPT_DELAY_MS);
}

function stopLoginPromptTimer() {
    if (!loginPromptTimerId) return;
    clearTimeout(loginPromptTimerId);
    loginPromptTimerId = null;
}

function handleLoginPromptContext() {
    if (window.currentUser) {
        stopLoginPromptTimer();
        return;
    }
    stopLoginPromptTimer();
}

function recordImmersiveViewForLoginPrompt() {
    if (loginPromptShown || window.currentUser) return;
    loginPromptImmersiveViews += 1;
    if (
        loginPromptImmersiveViews >= loginPromptNextThreshold &&
        isDiscoverOrImmersiveActive()
    ) {
        showLoginPrompt();
    }
}

// Gérer la déconnexion
async function handleSignOut() {
    const result = await signOut();
    if (result.success) {
        SessionManager.clearSession();
        ToastManager.success("Déconnexion", "À bientôt !");
        setTimeout(() => {
            window.location.href = "login.html";
        }, 1500);
    }
}

function getAccountDeleteReasonLabel(reason) {
    const map = {
        inactive: "Je n'utilise plus XERA",
        technical: "J'ai des problèmes techniques",
        privacy: "Confidentialité / sécurité",
        experience: "L'expérience ne me convient pas",
        other: "Autre",
    };
    return map[reason] || map.other;
}

async function requestAccountDeletion(userId) {
    if (!currentUser || currentUser.id !== userId) {
        alert("Vous devez être connecté pour supprimer votre compte.");
        return;
    }

    const modal = document.getElementById("settings-modal");
    if (!modal) return;

    const selectedReason = modal.querySelector(
        'input[name="delete-account-reason"]:checked',
    );
    if (!selectedReason) {
        alert("Choisissez une raison avant de continuer.");
        return;
    }

    const reason = selectedReason.value;
    const otherInput = modal.querySelector("#delete-account-other");
    const otherDetail = (otherInput?.value || "").trim();

    if (reason === "other" && otherDetail.length < 3) {
        alert("Merci de préciser la raison dans le champ texte.");
        return;
    }

    const reasonLabel = getAccountDeleteReasonLabel(reason);
    const confirmation = confirm(
        `Supprimer définitivement votre compte ?\n\nRaison: ${reasonLabel}\n\nCette action est irréversible.`,
    );
    if (!confirmation) return;

    const okOnline = await ensureOnlineOrNotify();
    if (!okOnline) return;
    const sessionCheck = await ensureFreshSupabaseSession();
    if (!sessionCheck.ok) {
        console.warn("Session refresh failed", sessionCheck.error);
    }

    const btn = modal.querySelector(".btn-delete-account");
    const originalText = btn ? btn.textContent : "";
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Suppression...";
    }

    try {
        const {
            data: { session },
            error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError || !session?.access_token) {
            throw new Error("Session invalide. Reconnectez-vous.");
        }

        const response = await fetch("/api/account/delete", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
                userId,
                reason,
                detail: reason === "other" ? otherDetail : "",
            }),
        });

        let payload = {};
        try {
            payload = await response.json();
        } catch (e) {
            payload = {};
        }
        if (!response.ok) {
            throw new Error(
                payload?.error || "Impossible de supprimer le compte.",
            );
        }

        try {
            await supabase.auth.signOut();
        } catch (e) {
            // ignore
        }
        try {
            SessionManager.clearSession();
        } catch (e) {
            // ignore
        }

        ToastManager?.success(
            "Compte supprimé",
            "Votre compte a été supprimé définitivement.",
        );
        setTimeout(() => {
            window.location.href = "login.html";
        }, 900);
    } catch (error) {
        console.error("Erreur suppression compte:", error);
        alert(error?.message || "Impossible de supprimer le compte.");
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText || "Supprimer mon compte";
        }
    }
}

async function saveEmailReminderPreferences({
    userId,
    enabled,
    timezone,
} = {}) {
    try {
        const {
            data: { session },
            error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.access_token) {
            throw new Error("Session invalide. Reconnectez-vous.");
        }

        const response = await fetch("/api/reminders/email/preferences", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
                userId,
                enabled: enabled !== false,
                timezone: timezone || "UTC",
            }),
        });

        let payload = {};
        try {
            payload = await response.json();
        } catch (error) {
            payload = {};
        }

        if (!response.ok) {
            throw new Error(
                payload?.error ||
                    "Impossible d'enregistrer la preference email.",
            );
        }

        return {
            success: true,
            data: payload,
        };
    } catch (error) {
        console.error("Email reminder preference save error:", error);
        return {
            success: false,
            error: error?.message || "Erreur de sauvegarde.",
        };
    }
}

/* ========================================
   GESTION DU PROFIL UTILISATEUR
   ======================================== */

// Masquer le bouton de trajectoire pour les comptes PRO
// Masquer le bouton de trajectoire pour les comptes PRO
function adjustNavForAccountType(user) {
    const navProfile = document.getElementById("nav-profile");
    if (!navProfile) return;

    // Détecter si le compte est pro/entreprise
    const accountType =
        user?.account_type || user?.user_metadata?.account_type || "";
    const accountSubtype =
        user?.account_subtype || user?.user_metadata?.account_subtype || "";

    const isSuperAdmin = user?.id === "b0f9f893-1706-4721-899c-d26ad79afc86";
    const isPro =
        (!isSuperAdmin &&
            [
                "community",
                "enterprise",
                "company",
                "pro",
                "communauté",
                "entreprise",
                "institution",
                "organization",
                "organisation",
                "org",
                "team",
            ].includes(accountType.toLowerCase())) ||
        [
            "community",
            "enterprise",
            "company",
            "pro",
            "communauté",
            "entreprise",
            "institution",
            "organization",
            "organisation",
            "org",
            "team",
        ].includes(accountSubtype.toLowerCase());

    if (isPro) {
        navProfile.style.display = "none";
    } else {
        navProfile.style.display = "flex";
    }
}

/* ========================================
   CHARGEMENT DES DONNÉES
   ======================================== */

function resetLoadedCollections() {
    Object.keys(userContents || {}).forEach((key) => delete userContents[key]);
    Object.keys(userProjects || {}).forEach((key) => delete userProjects[key]);
    professionalPageContents.clear();
    professionalPagesById.clear();
    professionalPageDataLoaded = false;
}

function snapshotUserContents() {
    const snapshot = new Map();
    Object.entries(userContents || {}).forEach(([userId, contents]) => {
        if (Array.isArray(contents)) {
            snapshot.set(userId, [...contents]);
        }
    });
    return snapshot;
}

const XERA_CACHE_USERS_KEY = "xera:cache:users";
const XERA_CACHE_DISCOVER_LATEST_KEY = "xera:cache:discover:latest";
const XERA_CACHE_DISCOVER_TS_KEY = "xera:cache:discover:ts";
const XERA_CACHE_PROFILE_CONTENT_PREFIX = "xera:cache:profile:contents:";

async function ensureOnlineOrNotify() {
    try {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
            if (window.ToastManager) {
                ToastManager.error(
                    "Hors connexion",
                    "Vous êtes hors connexion. Réessayez quand la connexion revient.",
                );
            } else {
                alert(
                    "Vous êtes hors connexion. Réessayez quand la connexion revient.",
                );
            }
            return false;
        }
    } catch (e) {
        /* ignore */
    }
    return true;
}

async function ensureFreshSupabaseSession() {
    if (!supabase?.auth?.getSession) return { ok: true };
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) return { ok: false, error };
        const session = data?.session;
        if (!session) return { ok: false, error: new Error("No session") };
        const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
        const needsRefresh =
            expiresAt && expiresAt - Date.now() < 2 * 60 * 1000;
        if (!needsRefresh) return { ok: true };
        if (supabase.auth.refreshSession) {
            const refreshed = await supabase.auth.refreshSession();
            if (refreshed?.error) return { ok: false, error: refreshed.error };
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e };
    }
}

function resolveApiBaseUrl() {
    const bodyBase = document.body?.dataset?.apiBase?.trim();
    if (bodyBase) return bodyBase;
    try {
        const { protocol, hostname } = window.location;
        if (hostname === "localhost" || hostname === "127.0.0.1") {
            return `${protocol}//${hostname}:5050`;
        }
        return window.location.origin;
    } catch (e) {
        return "";
    }
}

async function fetchOAuthConnectionStatus() {
    const okOnline = await ensureOnlineOrNotify();
    if (!okOnline) return null;
    const sessionCheck = await ensureFreshSupabaseSession();
    if (!sessionCheck.ok) return null;

    try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data?.session) return null;
        const response = await fetch(`${resolveApiBaseUrl()}/api/auth/status`, {
            headers: {
                Authorization: `Bearer ${data.session.access_token}`,
                "Content-Type": "application/json",
            },
        });
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch (e) {
        console.warn("fetchOAuthConnectionStatus error:", e);
        return null;
    }
}

async function refreshOAuthConnectionStatuses(container) {
    if (!container) return;
    const result = await fetchOAuthConnectionStatus();
    const statusElements = container.querySelectorAll(
        ".external-connection-status",
    );
    const defaultStatuses = {
        github: "Statut : non connecté",
        figma: "Statut : non connecté",
        notion: "Statut : non connecté",
        "google-cloud": "Statut : non connecté",
    };
    statusElements.forEach((element) => {
        const tool = element.dataset.connectionStatus;
        if (!tool) return;
        const status =
            result?.connections?.find((item) => item.tool === tool)?.status ||
            "non connecté";
        const label =
            status === "active"
                ? "Statut : connecté"
                : status === "pending"
                  ? "Statut : en attente"
                  : "Statut : non connecté";
        element.textContent = label;
    });
    if (!result) {
        statusElements.forEach((element) => {
            const tool = element.dataset.connectionStatus;
            element.textContent =
                defaultStatuses[tool] || "Statut : non connecté";
        });
    }
}

async function startOAuthConnection(tool) {
    if (!tool) return;
    const okOnline = await ensureOnlineOrNotify();
    if (!okOnline) return;
    const sessionCheck = await ensureFreshSupabaseSession();
    if (!sessionCheck.ok) return;

    try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data?.session) {
            alert("Votre session n'est pas valide. Reconnectez-vous.");
            return;
        }

        const response = await fetch(
            `${resolveApiBaseUrl()}/api/auth/${encodeURIComponent(tool)}/start`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${data.session.access_token}`,
                    "Content-Type": "application/json",
                },
            },
        );

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            const message =
                payload?.error || "Impossible de démarrer la connexion OAuth.";
            alert(message);
            return;
        }

        const payload = await response.json();
        if (payload?.authUrl) {
            window.location.href = payload.authUrl;
            return;
        }

        alert(
            "Impossible de récupérer l'URL de connexion. Réessayez plus tard.",
        );
    } catch (e) {
        console.error("startOAuthConnection error:", e);
        alert(
            "Erreur lors de la connexion. Vérifiez votre connexion puis réessayez.",
        );
    }
}

function setupPwaSwUpdateReload() {
    try {
        if (!("serviceWorker" in navigator)) return;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            try {
                if (window.__xeraSwReloading) return;
                window.__xeraSwReloading = true;
                if (window.confirm) {
                    // Éviter le rechargement automatique involontaire sur les pages de l'app.
                    console.info(
                        "Service worker mis à jour ; recharge manuelle requise si nécessaire.",
                    );
                }
            } catch (e) {
                /* ignore */
            }
        });
    } catch (e) {
        /* ignore */
    }
}
const XERA_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function safeJsonParse(raw, fallback) {
    try {
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        return fallback;
    }
}

function withCacheBust(url, version) {
    if (!url) return url;
    try {
        const v = version ? String(version) : String(Date.now());
        const u = new URL(url, window.location.origin);
        u.searchParams.set("v", v);
        return u.toString();
    } catch (e) {
        const sep = url.includes("?") ? "&" : "?";
        const v = version ? String(version) : String(Date.now());
        return `${url}${sep}v=${encodeURIComponent(v)}`;
    }
}

function persistDiscoverCache() {
    try {
        if (!Array.isArray(allUsers) || allUsers.length === 0) return;
        localStorage.setItem(XERA_CACHE_USERS_KEY, JSON.stringify(allUsers));

        const latestByUser = {};
        allUsers.forEach((u) => {
            const list = userContents?.[u.id];
            if (Array.isArray(list) && list.length > 0) {
                latestByUser[u.id] = list[0];
            }
        });
        localStorage.setItem(
            XERA_CACHE_DISCOVER_LATEST_KEY,
            JSON.stringify(latestByUser),
        );
        localStorage.setItem(XERA_CACHE_DISCOVER_TS_KEY, Date.now().toString());
    } catch (e) {
        // ignore quota / privacy errors
    }
}

function hydrateDiscoverFromCache() {
    try {
        const ts = parseInt(
            localStorage.getItem(XERA_CACHE_DISCOVER_TS_KEY) || "0",
            10,
        );
        if (!ts || Date.now() - ts > XERA_CACHE_TTL_MS) return false;

        const cachedUsers = safeJsonParse(
            localStorage.getItem(XERA_CACHE_USERS_KEY),
            null,
        );
        const cachedLatest = safeJsonParse(
            localStorage.getItem(XERA_CACHE_DISCOVER_LATEST_KEY),
            null,
        );
        if (!Array.isArray(cachedUsers) || cachedUsers.length === 0)
            return false;
        if (!cachedLatest || typeof cachedLatest !== "object") return false;

        allUsers = cachedUsers;
        Object.keys(cachedLatest).forEach((uid) => {
            const latest = cachedLatest[uid];
            userContents[uid] = latest ? [latest] : [];
        });
        window.userLoadError = null;
        window.hasLoadedUsers = true;
        return true;
    } catch (e) {
        return false;
    }
}

function hydrateProfileContentsFromCache(userId) {
    if (!userId) return false;
    if (
        Array.isArray(userContents?.[userId]) &&
        userContents[userId].length > 0
    ) {
        return true;
    }
    try {
        const raw = localStorage.getItem(
            `${XERA_CACHE_PROFILE_CONTENT_PREFIX}${userId}`,
        );
        const cached = safeJsonParse(raw, null);
        if (!Array.isArray(cached) || cached.length === 0) return false;
        userContents[userId] = cached;
        return true;
    } catch (e) {
        return false;
    }
}

function persistProfileContentsCache(userId) {
    if (!userId) return;
    try {
        const list = userContents?.[userId];
        if (!Array.isArray(list) || list.length === 0) return;
        // Limit size to reduce quota pressure
        const trimmed = list.slice(0, 80);
        localStorage.setItem(
            `${XERA_CACHE_PROFILE_CONTENT_PREFIX}${userId}`,
            JSON.stringify(trimmed),
        );
    } catch (e) {
        // ignore
    }
}

async function preloadUserContents(
    users,
    { publicOnly = false, fallbackContentsByUser = null } = {},
) {
    const safeUsers = Array.isArray(users) ? users : [];
    if (safeUsers.length === 0) return;

    const columns = publicOnly
        ? `
            *,
            arcs (
                id,
                title,
                status,
                user_id
            )
`
        : `
            *,
            arcs (
                id,
                title,
                status,
                user_id
            ),
            projects (
                id,
                name
            )
`;

    // Suppression de media_urls de la sélection si présente par erreur
    const cleanColumns = columns.replace(/media_urls,?/g, "");

    // Traitement par batch sur user_id pour limiter les requêtes.
    for (let i = 0; i < safeUsers.length; i += CONTENT_FETCH_BATCH_SIZE) {
        const chunk = safeUsers.slice(i, i + CONTENT_FETCH_BATCH_SIZE);
        const userIds = chunk.map((u) => u.id);
        try {
            const { data, error } = await supabase
                .from("content")
                .select(cleanColumns)
                .eq("author_type", "USER")
                .in("author_id", userIds)
                .is("page_id", null)
                .order("day_number", { ascending: false });

            if (error) throw error;

            // Indexer par user_id
            const grouped = new Map();
            (data || []).forEach((row) => {
                const uid = row.author_id;
                if (!grouped.has(uid)) grouped.set(uid, []);
                grouped.get(uid).push(convertSupabaseContent(row));
            });

            chunk.forEach((user) => {
                userContents[user.id] = grouped.get(user.id) || [];
            });
        } catch (error) {
            console.error("Erreur préchargement contenu batch:", error);
            chunk.forEach((user) => {
                const fallback = fallbackContentsByUser?.get?.(user.id);
                userContents[user.id] = Array.isArray(fallback)
                    ? fallback.filter((content) =>
                          isUserAuthoredContent(content, user.id),
                      )
                    : [];
            });
        }
    }

    // Keep a lightweight cache for instant discover/profile boot
    persistDiscoverCache();
}

async function preloadProfessionalPageData() {
    professionalPageDataLoaded = true;
    professionalPageContents.clear();
    professionalPagesById.clear();

    try {
        const { data: pages, error: pagesError } = await supabase
            .from("professional_pages")
            .select("*");
        if (pagesError) throw pagesError;

        (pages || []).forEach((page) => {
            if (!page?.id) return;
            professionalPagesById.set(String(page.id), page);
            window.professionalManager?.proPagesCache?.set(
                String(page.id),
                page,
            );
            professionalPageContents.set(String(page.id), []);
        });

        const pageIds = Array.from(professionalPagesById.keys());
        if (pageIds.length === 0) return [];

        const pagePostColumns = `
            *,
            arcs ( id, title, status, user_id ),
            projects ( id, name )
        `;
        for (
            let i = 0;
            i < pageIds.length;
            i += CONTENT_FETCH_BATCH_SIZE
        ) {
            const pageIdChunk = pageIds.slice(
                i,
                i + CONTENT_FETCH_BATCH_SIZE,
            );
            const { data: posts, error: postsError } = await supabase
                .from("content")
                .select(pagePostColumns)
                .eq("author_type", "PAGE_PRO")
                .in("author_id", pageIdChunk)
                .not("page_id", "is", null)
                .order("created_at", { ascending: false })
                .limit(1000);
            if (postsError) throw postsError;

            (posts || []).forEach((row) => {
                const pageId = String(row.author_id || row.page_id || "");
                if (!pageId || !professionalPageContents.has(pageId)) return;
                professionalPageContents.get(pageId).push(
                    convertSupabaseContent(row),
                );
            });
        }

        return Array.from(professionalPagesById.values());
    } catch (error) {
        professionalPageDataLoaded = false;
        console.warn("Impossible de charger les publications des Pages Pro:", error);
        return [];
    }
}

async function ensureProfessionalPageDataLoaded() {
    if (!professionalPageDataLoaded) {
        return preloadProfessionalPageData();
    }
    return Array.from(professionalPagesById.values());
}

async function ensureUserProjectsLoaded(userId) {
    if (!userId) return [];
    if (Array.isArray(userProjects[userId])) {
        return userProjects[userId];
    }

    const projectsResult = await getUserProjects(userId);
    userProjects[userId] = projectsResult.success
        ? projectsResult.data || []
        : [];
    return userProjects[userId];
}

// Charger toutes les données pour un utilisateur connecté
async function ensureUserProfile(user) {
    return user;
}

async function isFollowing(followerId, followingId) {
    if (!window.supabase || !followerId || !followingId) return false;
    try {
        const { data, error } = await supabase
            .from("followers")
            .select("id")
            .eq("follower_id", followerId)
            .eq("following_id", followingId)
            .limit(1);
        if (error) throw error;
        return data && data.length > 0;
    } catch (e) {
        console.error("isFollowing check error:", e);
        return false;
    }
}

async function loadAllData() {
    try {
        window.hasLoadedUsers = false;
        window.userLoadError = null;
        const fallbackContentsByUser = snapshotUserContents();
        resetLoadedCollections();

        // S'assurer que l'utilisateur connecté a un profil
        if (window.currentUser) {
            const ensuredProfile = await withTimeout(
                ensureUserProfile(window.currentUser),
                INITIAL_AUTH_TIMEOUT_MS,
                "Current profile ensure",
            );

            // Masquer le bouton de trajectoire si c'est un compte PRO
            if (ensuredProfile) {
                adjustNavForAccountType(ensuredProfile);
            }

            const safeProfile = sanitizeUserMedia(ensuredProfile);
            const mergedProfile =
                safeProfile && typeof applyUserUpdateToCache === "function"
                    ? applyUserUpdateToCache(safeProfile)
                    : safeProfile;

            // Ajustement ici au cas où mergedProfile est utilisé pour le bouton
            if (mergedProfile) {
                adjustNavForAccountType(mergedProfile);
            }

            if (mergedProfile?.avatar) {
                setNavProfileAvatar(
                    mergedProfile.avatar,
                    mergedProfile.id || window.currentUser.id,
                );
            }
        }

        // Charger tous les utilisateurs
        const usersResult = await getAllUsers();
        if (!usersResult.success) {
            allUsers = [];
            window.userLoadError =
                usersResult.error || "Erreur de chargement des utilisateurs";
            window.hasLoadedUsers = true;
            return;
        }

        allUsers = (usersResult.data || []).map((u) => sanitizeUserMedia(u));

        // S'assurer que l'utilisateur connecté est dans la liste
        if (
            window.currentUser &&
            !allUsers.find((u) => u.id === window.currentUser.id)
        ) {
            const userProfileResult = await withTimeout(
                getUserProfile(window.currentUser.id),
                INITIAL_AUTH_TIMEOUT_MS,
                "Current profile load",
            );
            if (userProfileResult.success) {
                allUsers.push(sanitizeUserMedia(userProfileResult.data));
            }
        }

        // Charger les badges vérifiés avant de rendre les annonces pour que le badge apparaisse
        await fetchVerifiedBadges().catch((error) => {
            console.warn("Verified badges load skipped:", error);
        });
        await Promise.all([
            preloadUserContents(allUsers, {
                publicOnly: false,
                fallbackContentsByUser,
            }),
            preloadProfessionalPageData(),
            fetchAdminAnnouncements(),
        ]);

        window.hasLoadedUsers = true;
    } catch (error) {
        console.error("Erreur chargement données:", error);
        window.userLoadError =
            error.message || "Erreur de chargement des données";
        window.hasLoadedUsers = true;
    } finally {
        window.hasLoadedUsers = true;
    }
}

// Charger uniquement les données publiques
async function loadPublicData() {
    try {
        window.hasLoadedUsers = false;
        window.userLoadError = null;
        const fallbackContentsByUser = snapshotUserContents();
        resetLoadedCollections();

        const usersResult = await getAllUsers();
        if (!usersResult.success) {
            allUsers = [];
            window.userLoadError =
                usersResult.error || "Erreur de chargement des utilisateurs";
            window.hasLoadedUsers = true;
            return;
        }

        allUsers = (usersResult.data || []).map((u) => sanitizeUserMedia(u));
        // Même ordre côté public pour assurer l'affichage correct des badges dans les annonces
        await fetchVerifiedBadges().catch((error) => {
            console.warn("Public verified badges load skipped:", error);
        });
        await Promise.all([
            preloadUserContents(allUsers, {
                publicOnly: true,
                fallbackContentsByUser,
            }),
            preloadProfessionalPageData(),
            fetchAdminAnnouncements(),
        ]);

        window.hasLoadedUsers = true;
    } catch (error) {
        console.error("Erreur chargement données publiques:", error);
        window.userLoadError =
            error.message || "Erreur de chargement des données";
        window.hasLoadedUsers = true;
    } finally {
        window.hasLoadedUsers = true;
    }
}

/* ========================================
   FONCTIONS UTILITAIRES
   ======================================== */

// Récupérer un utilisateur par ID
function getUser(userId) {
    const found = allUsers.find((u) => u.id === userId);
    if (found) return found;
    if (window.currentUser && window.currentUser.id === userId) {
        return window.currentUser;
    }
    return null;
}

// --- Gestion hashtags ---
function normalizeTag(tag) {
    return tag.replace(/^#/, "").trim().toLowerCase();
}

function parseTagsInput(inputValue) {
    if (!inputValue) return [];
    return Array.from(
        new Set(
            inputValue
                .split(/[,\s]+/)
                .map(normalizeTag)
                .filter(Boolean),
        ),
    ).slice(0, 12); // hard cap to avoid spam
}

function extractTagsFromDescription(rawDescription = "") {
    const pattern = /#hashtags:\s*([\w\-\#,\s]+)/i;
    const match = rawDescription.match(pattern);
    const tags = match
        ? match[1]
              .split(/[,\s]+/)
              .map(normalizeTag)
              .filter(Boolean)
        : [];
    const cleanDescription = match
        ? rawDescription.replace(match[0], "").trim()
        : rawDescription;
    return { tags, cleanDescription };
}

function encodeDescriptionWithTags(description, tags = []) {
    const unique = Array.from(
        new Set((tags || []).map(normalizeTag).filter(Boolean)),
    );
    if (unique.length === 0) return description;
    const base = (description || "").trim();
    return `${base}${base ? "\n\n" : ""}#hashtags: ${unique.join(",")}`;
}

// Annonces : helpers
function isAnnouncementContent(content) {
    return (
        content &&
        Array.isArray(content.tags) &&
        content.tags.includes("annonce")
    );
}

function canReplyToContent(content) {
    if (!content) return false;
    return (
        isAnnouncementContent(content) ||
        content.type === "news" ||
        content.type === "event"
    );
}

function loadAnnouncementReplies() {
    try {
        return JSON.parse(localStorage.getItem("rize_annonce_replies")) || {};
    } catch (e) {
        return {};
    }
}

function saveAnnouncementReplies(store) {
    try {
        localStorage.setItem("rize_annonce_replies", JSON.stringify(store));
    } catch (e) {
        // ignore
    }
}

function getReplyCount(contentId) {
    const store = loadAnnouncementReplies();
    const list = store[contentId] || [];
    return list.length;
}

function getReplySelector(contentId, attributeName) {
    const safeId = String(contentId ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
    return `[${attributeName}="${safeId}"]`;
}

function shortenReplyNotificationText(value, maxLength = 90) {
    const text = String(value || "")
        .replace(/\s+/g, " ")
        .trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1).trim()}…`;
}

function findContentByReplyId(contentId) {
    if (!contentId) return null;
    const collections = Object.values(window.userContents || {});
    for (const contents of collections) {
        const match = (contents || []).find(
            (content) =>
                content?.contentId === contentId || content?.id === contentId,
        );
        if (match) return match;
    }
    return null;
}

function renderAnnouncementReplies(contentId) {
    const store = loadAnnouncementReplies();
    const list = store[contentId] || [];
    if (list.length === 0) {
        return `<div class="reply-empty">Aucune réponse pour le moment.</div>`;
    }
    return `
<div class="reply-list">
            ${list
                .slice(-20)
                .map((r) => {
                    const user = getUser(r.userId);
                    const name = escapeHtml(user ? user.name : "Utilisateur");
                    const avatar =
                        user?.avatar ||
                        "https://api.dicebear.com/7.x/identicon/svg?seed=anon";
                    const timeLabel = timeAgo(r.createdAt);
                    return `
                        <div class="reply-item">
                            <img src="${avatar}" class="reply-avatar" alt="${name}">
                            <div class="reply-body">
                                <div class="reply-meta">
                                    <span class="reply-name">${name}</span>
                                    <span class="reply-time">${timeLabel}</span>
                                </div>
                                <p>${escapeHtml(String(r.body || "")).replace(/\n/g, "<br>")}</p>
                            </div>
                        </div>
                    `;
                })
                .join("")}
</div>
    `;
}

function setAnnouncementReplyPanelState(contentId, isOpen) {
    if (!contentId) return;
    document
        .querySelectorAll(
            getReplySelector(contentId, "data-profile-reply-panel"),
        )
        .forEach((panel) => {
            panel.hidden = !isOpen;
            panel.classList.toggle("is-open", isOpen);
            panel.setAttribute("aria-hidden", isOpen ? "false" : "true");
        });
    document
        .querySelectorAll(getReplySelector(contentId, "data-reply-toggle"))
        .forEach((button) => {
            button.classList.toggle("is-open", isOpen);
            button.setAttribute("aria-expanded", isOpen ? "true" : "false");
        });
    document
        .querySelectorAll(
            getReplySelector(contentId, "data-reply-toggle-label"),
        )
        .forEach((label) => {
            label.textContent = isOpen ? "Masquer" : "Répondre";
        });
}

function ensureImmersiveReplyDrawer() {
    let drawer = document.getElementById("immersive-reply-drawer");
    if (drawer) return drawer;

    drawer = document.createElement("div");
    drawer.id = "immersive-reply-drawer";
    drawer.className = "immersive-reply-drawer";
    drawer.setAttribute("aria-hidden", "true");
    drawer.innerHTML = `
        <div class="immersive-reply-drawer__backdrop" data-immersive-reply-close="true"></div>
        <aside class="immersive-reply-drawer__sheet" role="dialog" aria-modal="true" aria-label="Réponses à l'annonce">
            <div class="immersive-reply-drawer__header">
                <div class="immersive-reply-drawer__meta">
                    <span class="immersive-reply-drawer__eyebrow">Annonce</span>
                    <h3 class="immersive-reply-drawer__title">Réponses</h3>
                </div>
                <button type="button" class="immersive-reply-drawer__close" aria-label="Fermer les réponses">✕</button>
            </div>
            <div class="immersive-reply-drawer__composer">
                <textarea class="reply-input immersive-reply-drawer__input" placeholder="Votre réponse..."></textarea>
                <div class="reply-actions">
                    <button type="button" class="btn-primary immersive-reply-drawer__submit">Envoyer</button>
                </div>
            </div>
            <div class="immersive-reply-drawer__list-header">
                <strong>Réponses</strong>
                <span class="reply-count immersive-reply-drawer__count" data-reply-count="">0</span>
            </div>
            <div class="immersive-reply-drawer__content" data-replies-container=""></div>
        </aside>
    `;

    const closeButton = drawer.querySelector(".immersive-reply-drawer__close");
    const backdrop = drawer.querySelector(".immersive-reply-drawer__backdrop");
    const submitButton = drawer.querySelector(
        ".immersive-reply-drawer__submit",
    );
    const input = drawer.querySelector(".immersive-reply-drawer__input");
    const sheet = drawer.querySelector(".immersive-reply-drawer__sheet");

    const closeDrawer = () => {
        const contentId = drawer.dataset.contentId || "";
        if (contentId) {
            toggleProfileAnnouncementReplies(contentId, false);
        }
    };

    let startY = 0;
    let currentY = 0;
    let dragging = false;
    sheet?.addEventListener(
        "touchstart",
        (event) => {
            if (
                window.innerWidth > 767 ||
                !drawer.classList.contains("is-open")
            )
                return;
            const touch = event.touches[0];
            startY = touch.clientY;
            currentY = touch.clientY;
            dragging = true;
            sheet.style.transition = "none";
        },
        { passive: true },
    );
    sheet?.addEventListener(
        "touchmove",
        (event) => {
            if (!dragging || window.innerWidth > 767) return;
            const touch = event.touches[0];
            currentY = touch.clientY;
            const delta = currentY - startY;
            if (delta > 0) {
                sheet.style.transform = `translateY(${Math.min(delta, 260)}px)`;
            }
        },
        { passive: true },
    );
    sheet?.addEventListener("touchend", () => {
        if (!dragging || window.innerWidth > 767) return;
        const delta = currentY - startY;
        sheet.style.transition =
            "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)";
        if (delta > 130) {
            closeDrawer();
        } else {
            sheet.style.transform = "";
        }
        dragging = false;
    });

    closeButton?.addEventListener("click", closeDrawer);
    backdrop?.addEventListener("click", closeDrawer);
    submitButton?.addEventListener("click", () => {
        const contentId = drawer.dataset.contentId || "";
        if (!contentId) return;
        submitAnnouncementReply(
            contentId,
            drawer.querySelector(".immersive-reply-drawer__sheet"),
            "",
            drawer.dataset.title || "votre annonce",
        );
    });

    input?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submitButton?.click();
        }
    });

    document.body.appendChild(drawer);
    return drawer;
}

function applyImmersiveReplyDrawerState(contentId, isOpen) {
    if (!contentId) return;

    const drawer = ensureImmersiveReplyDrawer();
    drawer.dataset.contentId = contentId;
    drawer.classList.toggle("is-open", isOpen);
    drawer.setAttribute("aria-hidden", isOpen ? "false" : "true");

    const contentMeta = findContentByReplyId(contentId) || {};
    const title = contentMeta.title || "votre annonce";
    const drawerTitle = drawer.querySelector(".immersive-reply-drawer__title");
    const drawerInput = drawer.querySelector(".immersive-reply-drawer__input");
    if (drawerTitle) {
        drawerTitle.textContent = title;
    }
    drawer.dataset.title = title;
    if (drawerInput && !isOpen) {
        drawerInput.value = "";
    }

    if (isOpen) {
        const count = getReplyCount(contentId);
        const countLabel = drawer.querySelector(
            ".immersive-reply-drawer__count",
        );
        if (countLabel) countLabel.textContent = count;
        const container = drawer.querySelector(
            ".immersive-reply-drawer__content",
        );
        if (container) {
            container.innerHTML = renderAnnouncementReplies(contentId);
        }
        const replyButton = document.querySelector(
            `[data-reply-toggle="${CSS.escape(String(contentId))}"]`,
        );
        if (replyButton) {
            replyButton.classList.add("is-open");
            replyButton.setAttribute("aria-expanded", "true");
        }
    } else {
        const replyButton = document.querySelector(
            `[data-reply-toggle="${CSS.escape(String(contentId))}"]`,
        );
        if (replyButton) {
            replyButton.classList.remove("is-open");
            replyButton.setAttribute("aria-expanded", "false");
        }
        const label = document.querySelector(
            `[data-reply-toggle-label="${CSS.escape(String(contentId))}"]`,
        );
        if (label) label.textContent = "Répondre";
    }
}

function toggleProfileAnnouncementReplies(contentId, forceOpen = null) {
    if (!contentId) return;

    const drawer = ensureImmersiveReplyDrawer();
    const isOpened = drawer.classList.contains("is-open");
    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : !isOpened;
    applyImmersiveReplyDrawerState(contentId, shouldOpen);
    if (shouldOpen) refreshRepliesUI(contentId);
}

function refreshRepliesUI(contentId) {
    document
        .querySelectorAll(getReplySelector(contentId, "data-replies-container"))
        .forEach((el) => {
            el.innerHTML = renderAnnouncementReplies(contentId);
        });

    const drawer = document.getElementById("immersive-reply-drawer");
    if (drawer && drawer.dataset.contentId === String(contentId)) {
        const drawerContainer = drawer.querySelector(
            ".immersive-reply-drawer__content",
        );
        if (drawerContainer) {
            drawerContainer.innerHTML = renderAnnouncementReplies(contentId);
        }
        const countLabel = drawer.querySelector(
            ".immersive-reply-drawer__count",
        );
        if (countLabel) {
            countLabel.textContent = getReplyCount(contentId);
        }
    }

    const count = getReplyCount(contentId);
    document
        .querySelectorAll(getReplySelector(contentId, "data-reply-count"))
        .forEach((el) => (el.textContent = count));
}

async function notifyAnnouncementOwnerOfReply(
    contentId,
    ownerId,
    title,
    reply,
) {
    const current = window.currentUser;
    if (
        !contentId ||
        !ownerId ||
        !current?.id ||
        ownerId === current.id ||
        typeof createNotification !== "function"
    ) {
        return;
    }

    const actorName =
        (typeof getCurrentUserDisplayName === "function" &&
            getCurrentUserDisplayName()) ||
        current.name ||
        "Un membre XERA";
    const announcementTitle = shortenReplyNotificationText(
        title || "votre annonce",
        70,
    );
    const replyPreview = shortenReplyNotificationText(reply, 85);
    const message = `${actorName} a répondu à votre annonce "${announcementTitle}"${
        replyPreview ? ` : ${replyPreview}` : "."
    }`;
    const link = buildProfileUrl(ownerId);

    try {
        const result = await createNotification(
            ownerId,
            "announcement_reply",
            message,
            link,
        );
        if (!result?.success) {
            await createNotification(ownerId, "comment", message, link);
        }
    } catch (error) {
        console.warn("notifyAnnouncementOwnerOfReply error", error);
    }
}

async function submitAnnouncementReply(
    contentId,
    inputRef,
    ownerId = "",
    announcementTitle = "",
) {
    if (!contentId) return;
    if (!window.currentUser) {
        alert("Connectez-vous pour répondre à une annonce.");
        return;
    }
    const textarea =
        inputRef && typeof inputRef !== "string" && inputRef.closest
            ? inputRef
                  .closest(".profile-update-reply-block")
                  ?.querySelector(".reply-input") ||
              inputRef
                  .closest(".immersive-reply-drawer__sheet")
                  ?.querySelector(".reply-input") ||
              inputRef
                  .closest(".immersive-reply-drawer__composer")
                  ?.querySelector(".reply-input")
            : document.getElementById(inputRef);
    const reply =
        textarea && textarea.value
            ? textarea.value.trim()
            : prompt("Votre réponse :");
    if (!reply) return;
    const store = loadAnnouncementReplies();
    const list = store[contentId] || [];
    list.push({
        userId: window.currentUser.id,
        body: reply,
        createdAt: new Date().toISOString(),
    });
    store[contentId] = list.slice(-100);
    saveAnnouncementReplies(store);
    if (textarea) textarea.value = "";
    refreshRepliesUI(contentId);
    setAnnouncementReplyPanelState(contentId, true);
    const contentMeta =
        !ownerId || !announcementTitle ? findContentByReplyId(contentId) : null;
    const resolvedOwnerId = ownerId || contentMeta?.userId || "";
    const resolvedTitle =
        announcementTitle || contentMeta?.title || "votre annonce";
    const willNotifyOwner =
        resolvedOwnerId && resolvedOwnerId !== window.currentUser.id;
    await notifyAnnouncementOwnerOfReply(
        contentId,
        resolvedOwnerId,
        resolvedTitle,
        reply,
    );
    window.ToastManager?.success?.(
        "Réponse envoyée",
        willNotifyOwner
            ? "Le créateur de l'annonce sera notifié."
            : "Elle est ajoutée à l'annonce.",
    );
}

function openReplyPrompt(contentId) {
    submitAnnouncementReply(contentId);
}

// Récupérer le contenu personnel d'un utilisateur, sans les posts Page Pro.
function getContentAuthorIdentity(content) {
    const pageId = content?.pageId || content?.page_id || null;
    const userId = content?.userId || content?.user_id || null;
    const explicitType = content?.authorType || content?.author_type || "";
    const type = String(explicitType || (pageId ? "PAGE_PRO" : "USER"))
        .trim()
        .toUpperCase();
    const explicitId = content?.authorId || content?.author_id || null;
    const id = explicitId || (type === "PAGE_PRO" ? pageId : userId);
    return { type, id: id ? String(id) : null };
}

function isUserAuthoredContent(content, userId) {
    const author = getContentAuthorIdentity(content);
    return (
        author.type === "USER" &&
        author.id !== null &&
        author.id === String(userId || "")
    );
}

function isPageProAuthoredContent(content, pageId) {
    const author = getContentAuthorIdentity(content);
    return (
        author.type === "PAGE_PRO" &&
        author.id !== null &&
        author.id === String(pageId || "")
    );
}

function getUserContentLocal(userId) {
    const contents = userContents[userId] || [];
    const visibleContents = contents.filter(
        (content) =>
            isUserAuthoredContent(content, userId) &&
            (isSuperAdmin() || !content.isDeleted),
    );
    // Sort by createdAt descending (newest first) instead of day_number
    // This ensures cards show the actual latest upload
    return visibleContents.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );
}

function getPageContentLocal(pageId) {
    const contents = professionalPageContents.get(String(pageId || "")) || [];
    return contents
        .filter(
            (content) =>
                isPageProAuthoredContent(content, pageId) &&
                (isSuperAdmin() || !content.isDeleted),
        )
        .sort(
            (a, b) =>
                new Date(b.createdAt || 0).getTime() -
                new Date(a.createdAt || 0).getTime(),
        );
}

// Récupérer le dernier contenu
function getLatestContent(userId) {
    const contents = getUserContentLocal(userId);
    return contents.length > 0 ? contents[0] : null;
}

function hasUserPublishedContent(userId) {
    if (!userId) return false;
    return getUserContentLocal(userId).length > 0;
}

function setPendingCreatePostAfterArc(userId, options = {}) {
    if (!userId) return;
    window.pendingCreatePostAfterArc = {
        userId,
        reason: options.reason || "arc-required",
        createdAt: Date.now(),
    };
}

function clearPendingCreatePostAfterArc() {
    window.pendingCreatePostAfterArc = null;
}

const XERA_CREATE_PREFS_KEY_PREFIX = "xera:create:prefs:";
const XERA_CREATE_METRICS_KEY_PREFIX = "xera:create:metrics:";
const XERA_CREATE_METRIC_HISTORY_LIMIT = 8;
const XERA_CREATE_TAG_LIMIT = 6;
const XERA_CREATE_TITLE_LIMIT = 4;

function getCreatePrefsStorageKey(userId) {
    return `${XERA_CREATE_PREFS_KEY_PREFIX}${userId || "anon"}`;
}

function getCreateMetricsStorageKey(userId) {
    return `${XERA_CREATE_METRICS_KEY_PREFIX}${userId || "anon"}`;
}

function readCreatePrefs(userId) {
    if (!userId) return {};
    try {
        const raw = localStorage.getItem(getCreatePrefsStorageKey(userId));
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
        return {};
    }
}

function writeCreatePrefs(userId, prefs) {
    if (!userId) return;
    try {
        localStorage.setItem(
            getCreatePrefsStorageKey(userId),
            JSON.stringify(prefs || {}),
        );
    } catch (e) {
        // ignore
    }
}

function updateCreatePrefs(userId, patch = {}) {
    const previous = readCreatePrefs(userId);
    const next = {
        ...previous,
        ...patch,
        updatedAt: Date.now(),
    };
    writeCreatePrefs(userId, next);
    return next;
}

function readCreateMetrics(userId) {
    if (!userId) return [];
    try {
        const raw = localStorage.getItem(getCreateMetricsStorageKey(userId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function recordCreateMetric(userId, durationMs) {
    if (!userId || !Number.isFinite(durationMs) || durationMs <= 0) return;
    try {
        const previous = readCreateMetrics(userId);
        const next = [
            ...previous,
            {
                durationMs: Math.round(durationMs),
                createdAt: Date.now(),
            },
        ].slice(-XERA_CREATE_METRIC_HISTORY_LIMIT);
        localStorage.setItem(
            getCreateMetricsStorageKey(userId),
            JSON.stringify(next),
        );
    } catch (e) {
        // ignore
    }
}

function normalizeCreateText(value = "") {
    const input = String(value || "");
    try {
        return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (e) {
        return input;
    }
}

function findArcInList(arcs = [], arcId = null) {
    if (!arcId) return null;
    return (arcs || []).find((arc) => arc && arc.id === arcId) || null;
}

function toCreateTitleCase(value = "") {
    const clean = String(value || "").trim();
    if (!clean) return "";
    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function guessTitleFromFileName(fileName = "") {
    const withoutExt = String(fileName || "").replace(/\.[^.]+$/, "");
    const cleaned = withoutExt
        .replace(/[_-]+/g, " ")
        .replace(
            /\b(img|image|photo|video|vid|dsc|pxl|capture|screen|recording|whatsapp)\b/gi,
            " ",
        )
        .replace(/\d{4,}/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (cleaned.length < 5) return "";
    return toCreateTitleCase(cleaned);
}

function collectSuggestedTags(contents = [], selectedArc = null, limit = 6) {
    const scores = new Map();
    const recent = Array.isArray(contents) ? contents.slice(0, 14) : [];

    const addTag = (tag, score = 1) => {
        const clean = normalizeTag(tag || "");
        if (!clean || clean === "annonce") return;
        scores.set(clean, (scores.get(clean) || 0) + score);
    };

    recent.forEach((content, index) => {
        const tags = Array.isArray(content?.tags) ? content.tags : [];
        const baseScore = Math.max(1, recent.length - index);
        const arcBoost =
            selectedArc && content?.arcId === selectedArc.id ? 3 : 0;
        tags.forEach((tag) => addTag(tag, baseScore + arcBoost));
    });

    const titleWords = String(selectedArc?.title || "")
        .split(/[^a-zA-Z0-9À-ÿ]+/)
        .map((word) => normalizeCreateText(word).toLowerCase())
        .filter((word) => word.length >= 4);
    titleWords.slice(0, 2).forEach((word, index) => addTag(word, 2 - index));

    return Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag)
        .slice(0, Math.max(1, limit));
}

function buildTitleSuggestions({
    selectedArc = null,
    type = "text",
    dayNumber = null,
    fileName = "",
} = {}) {
    const suggestions = [];
    const arcTitle = String(selectedArc?.title || "").trim();
    const safeDay = Number.isFinite(dayNumber) ? dayNumber : null;
    const inferredFromFile = guessTitleFromFileName(fileName);

    if (inferredFromFile) suggestions.push(inferredFromFile);

    if (arcTitle) {
        if (type === "video") {
            suggestions.push(`Point video sur ${arcTitle}`);
            suggestions.push(`${arcTitle} en video`);
        } else if (type === "image") {
            suggestions.push(`${arcTitle} en images`);
            suggestions.push(`Avancee visuelle sur ${arcTitle}`);
        } else if (type === "live") {
            suggestions.push(`Live sur ${arcTitle}`);
        } else {
            suggestions.push(`Nouvelle avancee sur ${arcTitle}`);
            suggestions.push(`Point rapide sur ${arcTitle}`);
        }

        if (safeDay !== null && safeDay > 0) {
            suggestions.push(`Jour ${safeDay} - ${arcTitle}`);
        }
    }

    if (safeDay !== null && safeDay > 0 && !arcTitle) {
        suggestions.push(`Jour ${safeDay} - nouvelle avancee`);
    }

    return Array.from(
        new Set(
            suggestions
                .map((item) => String(item || "").trim())
                .filter(Boolean)
                .map((item) => item.slice(0, 100)),
        ),
    ).slice(0, XERA_CREATE_TITLE_LIMIT);
}

function buildSmartCreateDefaults({
    userId,
    arcs = [],
    contents = [],
    preSelectedArcId = null,
    defaultType = "image",
    nextDay = 1,
} = {}) {
    const prefs = readCreatePrefs(userId);
    const recentContents = Array.isArray(contents) ? contents : [];
    const recentUpdates = recentContents.filter(
        (content) => content && !isAnnouncementContent(content),
    );

    const isArcAvailable = (arcId) =>
        !!arcId && (arcs || []).some((arc) => arc && arc.id === arcId);
    const preferredArcId =
        (isArcAvailable(preSelectedArcId) && preSelectedArcId) ||
        (isArcAvailable(window.selectedArcId) && window.selectedArcId) ||
        (isArcAvailable(prefs.lastArcId) && prefs.lastArcId) ||
        recentUpdates.find((item) => isArcAvailable(item?.arcId))?.arcId ||
        null ||
        ((arcs || []).length === 1 ? arcs[0].id : null);

    const selectedArc = findArcInList(arcs, preferredArcId);
    const preferredType = ["text", "image", "video"].includes(prefs.lastType)
        ? prefs.lastType
        : defaultType;
    const safeType = preferredType || defaultType;
    const preferredState =
        prefs.lastState ||
        recentUpdates.find((item) => item?.state)?.state ||
        "success";
    const recentTags = Array.isArray(prefs.recentTags)
        ? prefs.recentTags.map(normalizeTag).filter(Boolean)
        : [];
    const tagSuggestions = Array.from(
        new Set(
            [
                ...collectSuggestedTags(
                    recentUpdates,
                    selectedArc,
                    XERA_CREATE_TAG_LIMIT,
                ),
                ...recentTags,
            ].filter(Boolean),
        ),
    ).slice(0, XERA_CREATE_TAG_LIMIT);

    return {
        preferredArcId,
        preferredType: safeType,
        preferredState,
        selectedArc,
        tagSuggestions,
        titleSuggestions: buildTitleSuggestions({
            selectedArc,
            type: safeType,
            dayNumber: nextDay,
        }),
    };
}

function isMobileOrPwaMobileContext() {
    const isMobileViewport =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(max-width: 768px)").matches;
    if (!isMobileViewport) return false;

    const isStandalonePwa =
        (typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(display-mode: standalone)").matches) ||
        (typeof navigator !== "undefined" && navigator.standalone === true);

    // Mobile browser OR mobile PWA
    return isMobileViewport || isStandalonePwa;
}

function removeMobileArcOnboardingNotification() {
    const existing = document.getElementById("mobile-arc-onboarding-notice");
    if (existing) existing.remove();
}

function showMobileArcOnboardingNotification(userId) {
    removeMobileArcOnboardingNotification();
    const host = document.createElement("div");
    host.id = "mobile-arc-onboarding-notice";
    host.setAttribute("role", "status");
    host.style.cssText = [
        "position:fixed",
        "left:12px",
        "right:12px",
        "bottom:calc(env(safe-area-inset-bottom, 0px) + 12px)",
        "z-index:3000",
        "background:rgba(10,10,10,0.94)",
        "border:1px solid rgba(255,255,255,0.14)",
        "border-radius:14px",
        "padding:12px",
        "backdrop-filter:blur(10px)",
        "box-shadow:0 14px 40px rgba(0,0,0,0.45)",
        "color:#f5f5f5",
    ].join(";");

    host.innerHTML = `
<div style="display:flex; gap:10px; align-items:flex-start;">
            <div style="font-size:1.1rem; line-height:1;">🚀</div>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; font-size:0.95rem; margin-bottom:4px;">Démarrez votre premier projet</div>
                <div style="font-size:0.84rem; color:rgba(245,245,245,0.82); line-height:1.35;">
                    Sur XERA, un projet est votre trajectoire. Créez-le pour publier vos mises à jour et suivre votre progression.
                </div>
            </div>
</div>
<div style="display:flex; gap:8px; margin-top:10px;">
            <button type="button" data-action="create" style="flex:1; border:none; border-radius:10px; padding:9px 10px; font-weight:700; font-size:0.86rem; background:#10b981; color:#072018; cursor:pointer;">
                nouveau projet
            </button>
            <button type="button" data-action="close" style="border:1px solid rgba(255,255,255,0.16); border-radius:10px; padding:9px 12px; font-weight:700; font-size:0.84rem; background:transparent; color:#f5f5f5; cursor:pointer;">
                Fermer
            </button>
</div>
    `;

    host.querySelector('[data-action="create"]')?.addEventListener(
        "click",
        () => {
            setPendingCreatePostAfterArc(userId, {
                reason: "first-post-onboarding-mobile",
            });
            if (typeof window.openCreateModal === "function") {
                window.openCreateModal();
            }
            removeMobileArcOnboardingNotification();
        },
    );

    host.querySelector('[data-action="close"]')?.addEventListener(
        "click",
        () => {
            removeMobileArcOnboardingNotification();
        },
    );

    document.body.appendChild(host);
}

async function maybeStartFirstPostFlow() {
    if (!window.currentUser || window.firstPostOnboardingHandled) return;

    // Détection plus large de la page Discover
    const isOnDiscover =
        !!document.querySelector("#discover.active") ||
        !!document.querySelector(".discover-grid") ||
        window.location.pathname.includes("index.html") ||
        window.location.pathname === "/";

    if (!isOnDiscover) return;
    window.firstPostOnboardingHandled = true;

    const userId = window.currentUser.id;

    // On attend un court instant que les données soient bien synchronisées localement
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (hasUserPublishedContent(userId)) {
        console.log("Onboarding: Utilisateur a déjà du contenu, skip.");
        return;
    }

    let firstArcId = null;
    try {
        const { data, error } = await supabase
            .from("arcs")
            .select("id")
            .eq("user_id", userId)
            .order("created_at", { ascending: true })
            .limit(1);
        if (error) throw error;
        firstArcId = data && data[0] ? data[0].id : null;
    } catch (error) {
        console.error("Erreur vérification ARC pour onboarding:", error);
        // En cas d'erreur réseau/RLS, ne pas afficher de faux onboarding.
        return;
    }

    if (firstArcId) {
        if (isMobileContext) return;
        const shouldOpenCreate =
            confirm(
                "Bienvenue sur XERA. Voulez-vous publier votre première mise à jour maintenant ?",
            ) === true;
        if (shouldOpenCreate) {
            openCreateMenu(userId, firstArcId);
        }
        return;
    }

    const shouldStartArc = isMobileContext
        ? true
        : confirm(
              "Bienvenue sur XERA. Pour publier votre première mise à jour, commencez par créer votre premier projet. Lancer la création maintenant ?",
          ) === true;
    if (isMobileContext) {
        showMobileArcOnboardingNotification(userId);
        return;
    }
    if (!shouldStartArc) return;

    setPendingCreatePostAfterArc(userId, {
        reason: "first-post-onboarding",
    });
    if (typeof window.openCreateModal === "function") {
        window.openCreateModal();
    }
}

async function maybeHandleInitialEmailAction() {
    if (initialEmailActionHandled) return;

    const action = getInitialAppAction();
    if (action !== "create") return;
    if (!window.currentUser || !window.currentUserId) return;

    const targetUserId = getInitialProfileUserId() || window.currentUserId;
    if (targetUserId !== window.currentUserId) return;

    initialEmailActionHandled = true;
    clearInitialAppAction();

    try {
        await openCreateMenu(window.currentUserId);
    } catch (error) {
        console.error("Erreur ouverture create menu depuis email:", error);
    }
}

// Récupérer l'état dominant
function getDominantState(userId) {
    const contents = getUserContentLocal(userId);
    if (contents.length === 0) return "empty";
    return contents[0].state;
}

// Formater le temps écoulé (il y a X temps)
function timeAgo(date) {
    if (!date) return "";

    const now = new Date();
    const past = new Date(date);
    if (!Number.isFinite(past.getTime())) return "";
    const diffInSeconds = Math.floor((now - past) / 1000);

    if (diffInSeconds < 60) {
        return "à l'instant";
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return `il y a ${diffInMinutes} min`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return `il y a ${diffInHours}h`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
        return `il y a ${diffInDays}j`;
    }

    try {
        return new Intl.DateTimeFormat("fr-FR", {
            day: "numeric",
            month: "short",
        }).format(past);
    } catch (e) {
        return "";
    }
}

/**
 * Charge les images pour un slide spécifique et ses slides adjacentes
 * Optimise le chargement en fonction de la navigation
 */
function loadCarouselImagesForIndex(carousel, index, slideCount) {
    if (!carousel) return;

    const slides = carousel.querySelectorAll(".xera-carousel-slide img");
    if (slides.length === 0) return;

    // Charger l'image courante en priorité, puis les images adjacentes
    const indicesToLoad = [index];
    if (index > 0) indicesToLoad.unshift(index - 1); // Slide précédente
    if (index < slideCount - 1) indicesToLoad.push(index + 1); // Slide suivante

    indicesToLoad.forEach((idx, order) => {
        if (idx >= 0 && idx < slides.length) {
            const img = slides[idx];
            const dataSrc = img.getAttribute("data-src");
            if (dataSrc) {
                // Charger avec un délai progressif basé sur la priorité
                setTimeout(() => {
                    if (img.getAttribute("data-src")) {
                        img.src = dataSrc;
                        img.removeAttribute("data-src");
                    }
                }, order * 100);
            }
        }
    });
}

function initXeraCarousels(root = document) {
    const scope = root || document;
    const carousels = Array.from(scope.querySelectorAll("[data-carousel]"));
    carousels.forEach((carousel) => {
        if (carousel.dataset.carouselInit === "1") return;
        carousel.dataset.carouselInit = "1";

        // Charger les images de manière séquentielle
        sequentiallyLoadCarouselImages(carousel);

        const track = carousel.querySelector(".xera-carousel-track");
        if (!track) return;
        const dots = Array.from(carousel.querySelectorAll(".xera-dot"));
        const slideCount = Math.max(dots.length, track.children.length || 0);
        const countCurrent = carousel.querySelector("[data-carousel-current]");
        const countTotal = carousel.querySelector("[data-carousel-total]");
        const prevBtn = carousel.querySelector(".xera-carousel-arrow--prev");
        const nextBtn = carousel.querySelector(".xera-carousel-arrow--next");

        if (countTotal) countTotal.textContent = String(slideCount || 0);

        const setActive = (index) => {
            dots.forEach((d, i) => d.classList.toggle("active", i === index));
            if (countCurrent) countCurrent.textContent = String(index + 1);
            if (prevBtn) prevBtn.disabled = index <= 0;
            if (nextBtn) nextBtn.disabled = index >= slideCount - 1;
        };

        let ticking = false;
        const updateFromScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                const width = track.clientWidth || 1;
                const idx = Math.max(
                    0,
                    Math.min(
                        Math.max(slideCount - 1, 0),
                        Math.round(track.scrollLeft / width),
                    ),
                );
                setActive(idx);
                // Charger progressivement les images visibles et adjacentes
                loadCarouselImagesForIndex(carousel, idx, slideCount);
                ticking = false;
            });
        };
        const goToIndex = (index) => {
            if (slideCount <= 0) return;
            const safeIndex = Math.max(0, Math.min(slideCount - 1, index));
            const width = track.clientWidth || 0;
            track.scrollTo({
                left: width * safeIndex,
                behavior: "smooth",
            });
            setActive(safeIndex);
            // Charger les images pour l'index cible
            loadCarouselImagesForIndex(carousel, safeIndex, slideCount);
        };

        track.addEventListener("scroll", updateFromScroll, {
            passive: true,
        });
        if (dots.length > 0) {
            dots.forEach((dot) => {
                dot.addEventListener("click", () => {
                    const index = parseInt(dot.dataset.index || "0", 10);
                    goToIndex(index);
                });
            });
        }
        if (prevBtn) {
            prevBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const width = track.clientWidth || 1;
                const currentIndex = Math.round(track.scrollLeft / width);
                goToIndex(currentIndex - 1);
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const width = track.clientWidth || 1;
                const currentIndex = Math.round(track.scrollLeft / width);
                goToIndex(currentIndex + 1);
            });
        }
        updateFromScroll();
    });
}

// Convertir les données Supabase en format compatible avec le code existant
function convertSupabaseUser(supabaseUser) {
    return {
        userId: supabaseUser.id,
        name: supabaseUser.name,
        title: supabaseUser.title || "",
        avatar: supabaseUser.avatar,
        banner: supabaseUser.banner,
        bio: supabaseUser.bio || "",
        socialLinks: supabaseUser.social_links || {},
        profilePreferences: supabaseUser.profile_preferences || {},
        projects: userProjects[supabaseUser.id] || [],
    };
}

function getContentC2PAState(content) {
    if (!content || typeof content !== "object") {
        return { isAI: false, provenance: null, source: null, raw: null };
    }

    const metadata = content.metadata || {};
    const c2paPayload =
        metadata.c2pa ||
        metadata.C2PA ||
        metadata.c2pa_metadata ||
        metadata.c2paMetadata ||
        metadata.provenance ||
        null;

    const fallback =
        typeof window !== "undefined" &&
        typeof window.normalizeC2PAInspectionResult === "function" &&
        c2paPayload
            ? window.normalizeC2PAInspectionResult(
                  typeof c2paPayload === "string"
                      ? (() => {
                            try {
                                return JSON.parse(c2paPayload);
                            } catch (e) {
                                return null;
                            }
                        })()
                      : c2paPayload,
              )
            : null;

    const rawAI =
        metadata.is_ai ??
        metadata.isAI ??
        metadata.ai_generated ??
        metadata.aiGenerated ??
        content.is_ai ??
        content.isAI ??
        false;

    const normalized = fallback || {
        isAI: !!rawAI,
        provenance: null,
        source: null,
        raw: null,
    };

    return {
        isAI: !!rawAI || !!normalized.isAI,
        provenance: normalized.provenance || null,
        source: normalized.source || null,
        raw: normalized.raw || c2paPayload || null,
    };
}

function renderC2PABadgeHtml(placement = "feed-card", content = null) {
    const state = getContentC2PAState(content);
    if (!state.isAI) return "";

    const safePayload = JSON.stringify(state).replace(/'/g, "&#39;");
    const placementClass =
        {
            "feed-card": "c2pa-badge--feed",
            immersive: "c2pa-badge--immersive",
            profile: "c2pa-badge--profile",
        }[placement] || "c2pa-badge--feed";

    return `
        <button
            type="button"
            class="c2pa-badge ${placementClass}"
            title="Contenu certifié C2PA / AI"
            onclick="event.stopPropagation(); window.openC2PAModal(${safePayload});"
            aria-label="Afficher les détails C2PA"
        >
            AI
        </button>
    `;
}

function ensureC2PAModal() {
    let modal = document.getElementById("xera-c2pa-modal");
    if (modal) return modal;

    const html = `
        <div id="xera-c2pa-modal" class="xera-c2pa-modal" aria-hidden="true" role="dialog" aria-modal="true">
            <div class="xera-c2pa-modal__backdrop" data-close-c2pa-modal="1"></div>
            <div class="xera-c2pa-modal__card" role="document">
                <div class="xera-c2pa-modal__header">
                    <div>
                        <div class="xera-c2pa-modal__eyebrow">Content Credentials</div>
                        <h3>Source & historique du média</h3>
                    </div>
                    <button type="button" class="xera-c2pa-modal__close" aria-label="Fermer" data-close-c2pa-modal="1">×</button>
                </div>
                <div id="xera-c2pa-modal__body" class="xera-c2pa-modal__body"></div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML("beforeend", html);
    modal = document.getElementById("xera-c2pa-modal");
    modal.addEventListener("click", (event) => {
        if (event.target && event.target.dataset.closeC2paModal === "1") {
            modal.classList.remove("is-open");
            modal.setAttribute("aria-hidden", "true");
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            const active = document.getElementById("xera-c2pa-modal");
            if (active && active.classList.contains("is-open")) {
                active.classList.remove("is-open");
                active.setAttribute("aria-hidden", "true");
            }
        }
    });
    return modal;
}

window.openC2PAModal = function (payload) {
    const modal = ensureC2PAModal();
    const body = document.getElementById("xera-c2pa-modal__body");
    const state =
        payload && typeof payload === "object"
            ? payload
            : { isAI: false, provenance: null, source: null };
    const provenance = state.provenance || {};
    const source = state.source || {};
    const history =
        Array.isArray(provenance.actionHistory) &&
        provenance.actionHistory.length > 0
            ? provenance.actionHistory
                  .map(
                      (entry) =>
                          `<li><strong>${escapeHtml(entry?.action || "Action")}</strong>${entry?.when ? ` <span>• ${escapeHtml(entry.when)}</span>` : ""}</li>`,
                  )
                  .join("")
            : "<li>Aucune action C2PA détectée.</li>";

    body.innerHTML = `
        <div class="xera-c2pa-modal__content">
            <div class="xera-c2pa-modal__summary">
                <span class="xera-c2pa-modal__pill">AI detected</span>
                <span class="xera-c2pa-modal__value">${state.isAI ? "Confirmé" : "Non confirmé"}</span>
            </div>
            <dl class="xera-c2pa-modal__list">
                <div><dt>Émetteur</dt><dd>${escapeHtml(provenance.issuer || "Non disponible")}</dd></div>
                <div><dt>Outil / API</dt><dd>${escapeHtml(provenance.tool || provenance.api || source.claimGenerator || "Non disponible")}</dd></div>
                <div><dt>Date</dt><dd>${escapeHtml(provenance.createdAt || "Non disponible")}</dd></div>
                <div><dt>Modèle</dt><dd>${escapeHtml(provenance.model || "Non disponible")}</dd></div>
            </dl>
            <div class="xera-c2pa-modal__history">
                <h4>Historique</h4>
                <ul>${history}</ul>
            </div>
        </div>
    `;

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
};

window.closeC2PAModal = function () {
    const modal = document.getElementById("xera-c2pa-modal");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
};

if (
    typeof document !== "undefined" &&
    !document.getElementById("xera-c2pa-styles")
) {
    const c2paStyles = document.createElement("style");
    c2paStyles.id = "xera-c2pa-styles";
    c2paStyles.textContent = `
        .c2pa-badge {
            position: absolute;
            z-index: 20;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 2.3rem;
            height: 1.8rem;
            padding: 0 0.6rem;
            border: 1px solid rgba(148,163,184,0.6);
            border-radius: 999px;
            background: rgba(15,23,42,0.9);
            color: #e2e8f0;
            font-size: 0.62rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            box-shadow: 0 6px 18px rgba(15, 23, 42, 0.28);
            cursor: pointer;
        }
        .c2pa-badge--feed { right: 10px; bottom: 10px; }
        .c2pa-badge--immersive { top: 12px; right: 12px; }
        .c2pa-badge--profile { top: 12px; right: 12px; }
        .xera-c2pa-modal {
            position: fixed;
            inset: 0;
            display: none;
            z-index: 9999;
        }
        .xera-c2pa-modal.is-open { display: block; }
        .xera-c2pa-modal__backdrop {
            position: absolute;
            inset: 0;
            background: rgba(15, 23, 42, 0.7);
        }
        .xera-c2pa-modal__card {
            position: relative;
            width: min(440px, calc(100vw - 28px));
            margin: 10vh auto;
            background: #0f172a;
            border: 1px solid rgba(148,163,184,0.28);
            border-radius: 18px;
            box-shadow: 0 22px 60px rgba(15,23,42,0.35);
            color: #f8fafc;
            padding: 1.1rem 1.15rem 1.2rem;
        }
        .xera-c2pa-modal__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            margin-bottom: 0.75rem;
        }
        .xera-c2pa-modal__eyebrow {
            font-size: 0.68rem;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: #94a3b8;
            margin-bottom: 0.2rem;
        }
        .xera-c2pa-modal__header h3 {
            margin: 0;
            font-size: 1.05rem;
        }
        .xera-c2pa-modal__close {
            width: 2rem;
            height: 2rem;
            border-radius: 999px;
            border: 1px solid rgba(148,163,184,0.3);
            background: rgba(148,163,184,0.12);
            color: #f8fafc;
            font-size: 1.25rem;
            cursor: pointer;
        }
        .xera-c2pa-modal__summary {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            padding: 0.7rem 0.8rem;
            background: rgba(59, 130, 246, 0.08);
            border: 1px solid rgba(96,165,250,0.25);
            border-radius: 12px;
            margin-bottom: 0.75rem;
        }
        .xera-c2pa-modal__pill {
            font-size: 0.62rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #93c5fd;
        }
        .xera-c2pa-modal__value {
            color: #e2e8f0;
            font-weight: 700;
        }
        .xera-c2pa-modal__list {
            display: grid;
            gap: 0.7rem;
            margin: 0;
        }
        .xera-c2pa-modal__list div {
            display: grid;
            gap: 0.2rem;
        }
        .xera-c2pa-modal__list dt {
            color: #94a3b8;
            font-size: 0.66rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        .xera-c2pa-modal__list dd {
            margin: 0;
            color: #e2e8f0;
            line-height: 1.5;
        }
        .xera-c2pa-modal__history {
            margin-top: 1rem;
        }
        .xera-c2pa-modal__history h4 {
            margin: 0 0 0.5rem;
            color: #f8fafc;
            font-size: 0.92rem;
        }
        .xera-c2pa-modal__history ul {
            margin: 0;
            padding-left: 1.1rem;
            color: #cbd5e1;
        }
        .xera-c2pa-modal__history li {
            margin-bottom: 0.35rem;
        }
    `;
    document.head.appendChild(c2paStyles);
}

function convertSupabaseContent(supabaseContent) {
    const arcOwner = supabaseContent.arcs?.user_id
        ? getUser(supabaseContent.arcs.user_id)
        : null;
    const rawDescription = supabaseContent.description || "";
    const { tags, cleanDescription } =
        extractTagsFromDescription(rawDescription);

    let mediaUrls = [];
    // Resilience: use media_url if media_urls is missing in DB
    const mediaUrl = supabaseContent.media_url;
    if (mediaUrl) {
        mediaUrls = [mediaUrl];
    }

    return {
        contentId: supabaseContent.id,
        userId: supabaseContent.user_id,
        authorType:
            supabaseContent.author_type ||
            (supabaseContent.page_id ? "PAGE_PRO" : "USER"),
        authorId:
            supabaseContent.author_id ||
            supabaseContent.page_id ||
            supabaseContent.user_id,
        projectId: supabaseContent.project_id,
        arcId: supabaseContent.arc_id,
        pageId: supabaseContent.page_id,
        isValidatedPro: !!supabaseContent.is_validated_pro,
        validatedByPageId: supabaseContent.validated_by_page_id,
        dayNumber: supabaseContent.day_number,
        type: supabaseContent.type,
        state: supabaseContent.state,
        title: supabaseContent.title,
        metadata: supabaseContent.metadata,
        description: cleanDescription,
        rawDescription,
        tags,
        mediaUrl: mediaUrl,
        mediaUrls: mediaUrls,
        views: supabaseContent.views || 0,
        encouragementsCount: supabaseContent.encouragements_count || 0,
        createdAt: new Date(supabaseContent.created_at),
        isDeleted: !!supabaseContent.is_deleted,
        deletedAt: supabaseContent.deleted_at
            ? new Date(supabaseContent.deleted_at)
            : null,
        deletedReason: supabaseContent.deleted_reason || "",
        arc: supabaseContent.arcs
            ? {
                  id: supabaseContent.arcs.id,
                  title: supabaseContent.arcs.title,
                  status: supabaseContent.arcs.status,
                  stageLevel: supabaseContent.arcs.stage_level || "idee",
                  opportunityIntents: Array.isArray(
                      supabaseContent.arcs.opportunity_intents,
                  )
                      ? supabaseContent.arcs.opportunity_intents
                      : [],
                  ownerId: supabaseContent.arcs.user_id || null,
                  ownerName: arcOwner?.name || null,
                  ownerAvatar: arcOwner?.avatar || null,
              }
            : null,
        project: supabaseContent.projects
            ? {
                  id: supabaseContent.projects.id,
                  name: supabaseContent.projects.name,
              }
            : null,
    };
}

/* ========================================
   SYSTÈME DE FOLLOWERS (SUPABASE)
   ======================================== */

async function followUser(followerId, followingId) {
    if (!window.supabase || !followerId || !followingId) {
        return { success: false, error: "Invalid user ids" };
    }

    try {
        const { error } = await supabase.from("followers").insert({
            follower_id: followerId,
            following_id: followingId,
            created_at: new Date().toISOString(),
        });

        if (error) {
            if (
                error.code === "23505" ||
                error.details?.toLowerCase().includes("duplicate") ||
                error.message?.toLowerCase().includes("duplicate")
            ) {
                return { success: true };
            }
            console.error("followUser error:", error);
            return {
                success: false,
                error: error.message || "Impossible de suivre cet utilisateur",
            };
        }

        return { success: true };
    } catch (e) {
        console.error("followUser exception:", e);
        return {
            success: false,
            error: e?.message || "Impossible de suivre cet utilisateur",
        };
    }
}

async function unfollowUser(followerId, followingId) {
    if (!window.supabase || !followerId || !followingId) {
        return { success: false, error: "Invalid user ids" };
    }

    try {
        const { error } = await supabase
            .from("followers")
            .delete()
            .eq("follower_id", followerId)
            .eq("following_id", followingId);

        if (error) {
            console.error("unfollowUser error:", error);
            return {
                success: false,
                error: error.message || "Impossible de se désabonner",
            };
        }

        return { success: true };
    } catch (e) {
        console.error("unfollowUser exception:", e);
        return {
            success: false,
            error: e?.message || "Impossible de se désabonner",
        };
    }
}

async function toggleFollow(viewerId, targetUserId) {
    if (!window.currentUser) {
        ToastManager.info(
            "Login required",
            "Vous devez être connecté pour suivre des utilisateurs",
        );
        setTimeout(() => (window.location.href = "login.html"), 1500);
        return;
    }

    const profile = getCurrentUserProfile();
    if (isUserBanned(profile)) {
        const remaining = getBanRemainingLabel(profile);
        ToastManager.error(
            "Compte temporairement banni",
            remaining
                ? `Vous pourrez réessayer dans ${remaining}.`
                : "Vous ne pouvez pas suivre des utilisateurs pour le moment.",
        );
        return;
    }

    const profileBtn = document.getElementById(`follow-btn-${targetUserId}`);
    const cardBtns = Array.from(
        document.querySelectorAll(`[data-follow-card-user="${targetUserId}"]`),
    );
    const immersiveBtn = document.getElementById(
        `follow-immersive-btn-${targetUserId}`,
    );
    const immersivePostBtns = document.querySelectorAll(
        `[data-follow-user="${targetUserId}"]`,
    );

    // Use the button that triggered the action for loading state, or profile button as default
    const activeBtn =
        document.activeElement &&
        (document.activeElement === profileBtn ||
            cardBtns.includes(document.activeElement) ||
            document.activeElement === immersiveBtn)
            ? document.activeElement
            : profileBtn || cardBtns[0] || immersiveBtn;

    await LoadingManager.withLoading(activeBtn, async () => {
        const isCurrentlyFollowing = await isFollowing(viewerId, targetUserId);
        const followResult = isCurrentlyFollowing
            ? await unfollowUser(viewerId, targetUserId)
            : await followUser(viewerId, targetUserId);

        if (!followResult || !followResult.success) {
            ToastManager.error(
                "Erreur",
                followResult?.error ||
                    "Impossible de mettre a jour l'abonnement",
            );
            return;
        }

        const isNowFollowing = !isCurrentlyFollowing;

        // Garder un cache local cohérent pour éviter les requêtes répétées.
        followedUserIdsCacheOwner = viewerId;
        if (isNowFollowing) {
            followedUserIdsCache.add(targetUserId);
        } else {
            followedUserIdsCache.delete(targetUserId);
        }
        followedUserIdsCacheUpdatedAt = Date.now();

        // Update Profile Button
        if (profileBtn) {
            profileBtn.classList.toggle("unfollow", isNowFollowing);
            profileBtn.innerHTML = `<img src="${isNowFollowing ? "icons/subscribed.svg" : "icons/subscribe.svg"}" class="btn-icon" style="width: 24px; height: 24px;">`;
        }

        // Update Card Button
        cardBtns.forEach((cardBtn) => {
            cardBtn.classList.toggle("unfollow", isNowFollowing);
            cardBtn.title = isNowFollowing ? "Se désabonner" : "S'abonner";
            // Reset styles that might have been inline
            cardBtn.style.background = "transparent";
            cardBtn.style.border = "none";
            cardBtn.innerHTML = `<img src="${isNowFollowing ? "icons/subscribed.svg" : "icons/subscribe.svg"}" class="btn-icon" style="width: 24px; height: 24px;">`;
        });

        // Update Immersive Button
        if (immersiveBtn) {
            immersiveBtn.classList.toggle("unfollow", isNowFollowing);
            immersiveBtn.innerHTML = `<img src="${isNowFollowing ? "icons/subscribed.svg" : "icons/subscribe.svg"}" class="btn-icon" style="width: 24px; height: 24px;">`;
        }

        if (immersivePostBtns && immersivePostBtns.length > 0) {
            immersivePostBtns.forEach((btn) => {
                btn.classList.toggle("unfollow", isNowFollowing);
                btn.innerHTML = `<img src="${isNowFollowing ? "icons/subscribed.svg" : "icons/subscribe.svg"}" class="btn-icon" style="width: 20px; height: 20px;">`;
            });
        }

        // Toast notification
        if (isNowFollowing) {
            ToastManager.success(
                "Abonnement confirmé",
                "Vous suivez maintenant cet utilisateur",
            );
            if (profileBtn) AnimationManager.bounceIn(profileBtn);
            cardBtns.forEach((cardBtn) => AnimationManager.bounceIn(cardBtn));
            if (immersiveBtn) AnimationManager.bounceIn(immersiveBtn);
            // Notification au suivi pour le propriétaire du profil
            if (typeof notifyNewFollower === "function") {
                notifyNewFollower(viewerId, targetUserId).catch((e) =>
                    console.warn("Notify follower failed:", e),
                );
            }
        } else {
            ToastManager.info(
                "Désabonnement",
                "Vous ne suivez plus cet utilisateur",
            );
        }

        // Update follower counts
        if (window.currentProfileViewed === targetUserId) {
            const followerCount = await getFollowerCount(targetUserId);
            const followerStats = document.querySelectorAll(
                ".follower-stat-count",
            );
            if (followerStats[0]) {
                followerStats[0].textContent =
                    formatCompactCount(followerCount);
            } else if (followerStats.length > 0) {
                followerStats.forEach(
                    (stat) =>
                        (stat.textContent = formatCompactCount(followerCount)),
                );
            }
        }

        if (window.currentProfileViewed === viewerId) {
            const followingCount = await getFollowingCount(viewerId);
            const followerStats = document.querySelectorAll(
                ".follower-stat-count",
            );
            if (followerStats[1]) {
                followerStats[1].textContent =
                    formatCompactCount(followingCount);
            }
        }

        // If we are in "Following" filter mode on Discover, we might need to remove the card if we unfollowed
        if (window.discoverFilter === "following" && !isNowFollowing) {
            const cards = Array.from(
                document.querySelectorAll(
                    `.discover-grid .user-card[data-user="${targetUserId}"]`,
                ),
            );
            if (cards.length > 0) {
                cards.forEach((card) => {
                    card.style.opacity = "0";
                    card.style.transition = "opacity 0.25s ease";
                });
                setTimeout(() => {
                    cards.forEach((card) => card.remove());
                    // Check if grid is empty
                    if (
                        document.querySelectorAll(".discover-grid .user-card")
                            .length === 0
                    ) {
                        renderDiscoverGrid(); // Will show empty state
                    }
                }, 280);
            } else {
                renderDiscoverGrid();
            }
        }
    });
}

/* ========================================
   NOTIFICATIONS SUIVEURS
   ======================================== */

function getCurrentUserDisplayName() {
    const profile = getCurrentUserProfile();
    return (
        profile?.name ||
        profile?.username ||
        window.currentUser?.email ||
        "Un membre XERA"
    );
}

function safeProfileLink(userId) {
    return userId ? buildProfileUrl(userId) : "profile.html";
}

async function notifyNewFollower(followerId, targetUserId) {
    if (
        typeof createNotification !== "function" ||
        typeof getFollowerIds !== "function"
    )
        return;
    try {
        const followerName = getCurrentUserDisplayName() || "Un nouveau membre";
        await createNotification(
            targetUserId,
            "follow",
            `${followerName} s'est abonné(e) à vous`,
            safeProfileLink(followerId),
        );
    } catch (e) {
        console.warn("notifyNewFollower error", e);
    }
}

async function notifyFollowersOfTrace(contentRow) {
    if (
        !contentRow ||
        typeof getFollowerIds !== "function" ||
        typeof createNotification !== "function"
    )
        return;
    const userId = contentRow.user_id || contentRow.userId;
    if (!userId) return;
    try {
        const followerIds = await getFollowerIds(userId);
        if (!followerIds.length) return;
        const actorName = getCurrentUserDisplayName();
        const message = `${actorName} a publié une nouvelle mise à jour : ${contentRow.title || "Nouvelle mise à jour"}`;
        const link = safeProfileLink(userId);
        await Promise.allSettled(
            followerIds
                .filter((fid) => fid && fid !== userId)
                .map((fid) =>
                    createNotification(fid, "new_update", message, link),
                ),
        );
    } catch (e) {
        console.warn("notifyFollowersOfTrace error", e);
    }
}

async function notifyFollowersOfArcStart(arcRow) {
    if (
        !arcRow ||
        typeof getFollowerIds !== "function" ||
        typeof createNotification !== "function"
    )
        return;
    const userId = arcRow.user_id;
    if (!userId) return;
    try {
        const followerIds = await getFollowerIds(userId);
        if (!followerIds.length) return;
        const actorName = getCurrentUserDisplayName();
        const message = `${actorName} a lancé un nouveau projet : ${arcRow.title || "Nouveau projet"}`;
        const link = safeProfileLink(userId);
        await Promise.allSettled(
            followerIds
                .filter((fid) => fid && fid !== userId)
                .map((fid) =>
                    createNotification(fid, "new_arc", message, link),
                ),
        );
    } catch (e) {
        console.warn("notifyFollowersOfArcStart error", e);
    }
}

async function notifyFollowersOfLiveStart(contentRow, title) {
    if (
        !contentRow ||
        typeof getFollowerIds !== "function" ||
        typeof createNotification !== "function"
    )
        return;
    const userId = contentRow.user_id || contentRow.userId;
    if (!userId) return;
    try {
        const followerIds = await getFollowerIds(userId);
        if (!followerIds.length) return;
        const actorName = getCurrentUserDisplayName();
        const liveTitle = title || contentRow.title || "Live en cours";
        const link = contentRow.id
            ? `stream.html?id=${contentRow.id}&host=${userId}`
            : safeProfileLink(userId);
        const message = `${actorName} a démarré un live : ${liveTitle}`;
        await Promise.allSettled(
            followerIds
                .filter((fid) => fid && fid !== userId)
                .map((fid) =>
                    createNotification(fid, "live_start", message, link),
                ),
        );
    } catch (e) {
        console.warn("notifyFollowersOfLiveStart error", e);
    }
}

async function fetchContentOwner(contentId) {
    if (!contentId) return null;
    // Try local cache first
    const cached = findContentById(contentId);
    if (cached) {
        return {
            user_id: cached.userId || cached.user_id,
            title: cached.title,
            arc_id: cached.arcId || cached.arc_id || null,
        };
    }
    try {
        const { data, error } = await supabase
            .from("content")
            .select("id, user_id, title, arc_id")
            .eq("id", contentId)
            .maybeSingle();
        if (error) throw error;
        return data || null;
    } catch (e) {
        console.warn("fetchContentOwner error", e);
        return null;
    }
}

async function notifyEncouragement(contentId) {
    if (
        !contentId ||
        typeof createNotification !== "function" ||
        typeof fetchContentOwner !== "function"
    )
        return;
    const owner = await fetchContentOwner(contentId);
    if (!owner || !owner.user_id) return;
    const ownerId = owner.user_id;
    if (ownerId === currentUser?.id) return;

    const actorName = getCurrentUserDisplayName();
    const contentTitle = owner.title || "ta mise à jour";
    const message = `${actorName} a encouragé ${contentTitle}`;
    const link = `index.html?content=${encodeURIComponent(String(contentId))}`;

    // Send a standard encouragement notification to the content owner
    try {
        await createNotification(ownerId, "encouragement", message, link);
    } catch (e) {
        console.warn("notifyEncouragement createNotification error", e);
    }

    // Optional: background check for high-signal peers (logging only)
    (async () => {
        try {
            const { data: actorArcs } = await supabase
                .from("arcs")
                .select("title, status")
                .eq("user_id", currentUser.id);
            const isPeer = actorArcs && actorArcs.length > 0;
            if (isPeer && owner.arc_id) {
                const { data: targetArc } = await supabase
                    .from("arcs")
                    .select("title")
                    .eq("id", owner.arc_id)
                    .maybeSingle();
                // Log or metric hook could be placed here for analytics
                if (targetArc) {
                    // no-op for now
                }
            }
        } catch (err) {
            // ignore
        }
    })();
}

/* ========================================
   INTERACTIONS (VUES & ENCOURAGEMENTS)
   ======================================== */

async function incrementViews(contentId) {
    try {
        await supabase.rpc("increment_views", { row_id: contentId });
    } catch (error) {
        console.error("Erreur incrementViews:", error);
    }
}

const immersiveViewTimers = new Map();

function clearImmersiveViewTracker(postEl) {
    if (!postEl) return;
    const key = postEl.dataset.contentId || postEl;
    const tracker = immersiveViewTimers.get(key);
    if (!tracker) return;
    if (tracker.intervalId) clearInterval(tracker.intervalId);
    if (tracker.timeoutId) clearTimeout(tracker.timeoutId);
    immersiveViewTimers.delete(key);
}

function bumpImmersiveViewCount(postEl, amount = 1) {
    const viewCountSpan = postEl?.querySelector(".stat-pill span");
    if (!viewCountSpan) return;
    const current = parseInt(viewCountSpan.textContent, 10) || 0;
    viewCountSpan.textContent = current + amount;
}

function scheduleImmersiveViewCount(postEl, videoEl) {
    if (!postEl) return;
    const contentId = postEl.dataset.contentId;
    if (!contentId || postEl.dataset.viewed === "true") return;
    const key = contentId;
    if (immersiveViewTimers.has(key)) return;

    const content = findContentById(contentId);
    const contentType = content?.type || (videoEl ? "video" : "image");

    if (contentType === "video" && videoEl) {
        const tracker = {
            watchedMs: 0,
            lastTick: Date.now(),
            intervalId: null,
            timeoutId: null,
        };
        tracker.intervalId = setInterval(() => {
            const now = Date.now();
            const delta = Math.max(0, now - tracker.lastTick);
            tracker.lastTick = now;

            if (!videoEl.paused && !videoEl.ended && videoEl.readyState >= 2) {
                tracker.watchedMs += delta;
            }

            if (tracker.watchedMs >= 4000) {
                postEl.dataset.viewed = "true";
                clearImmersiveViewTracker(postEl);
                incrementViews(contentId);
                updateImmersivePrefs(content, "view");
                recordImmersiveViewForLoginPrompt();
                bumpImmersiveViewCount(postEl, 1);
            }
        }, 250);
        immersiveViewTimers.set(key, tracker);
        return;
    }

    const timeoutId = setTimeout(() => {
        postEl.dataset.viewed = "true";
        clearImmersiveViewTracker(postEl);
        incrementViews(contentId);
        updateImmersivePrefs(content, "view");
        recordImmersiveViewForLoginPrompt();
        bumpImmersiveViewCount(postEl, 1);
    }, 2000);
    immersiveViewTimers.set(key, {
        watchedMs: 0,
        lastTick: Date.now(),
        intervalId: null,
        timeoutId,
    });
}

async function toggleCourage(contentId, btnElement) {
    if (!currentUser) {
        ToastManager.info("Login required", "Connectez-vous pour encourager");
        return;
    }
    if (!btnElement) return;

    const allCourageButtons = Array.from(
        document.querySelectorAll(
            `.courage-btn[data-content-id="${contentId}"]`,
        ),
    );
    if (btnElement && !allCourageButtons.includes(btnElement)) {
        allCourageButtons.push(btnElement);
    }

    const updateButtonUI = (btn, encouraged, count) => {
        if (!btn) return;
        const img = btn.querySelector("img");
        const countSpan = btn.querySelector(".courage-count");

        if (encouraged) {
            btn.classList.add("encouraged");
            if (img) {
                img.src = "icons/courage-green.svg";
            }
            if (img && window.AnimationManager) {
                AnimationManager.bounceIn(img);
            }
        } else {
            btn.classList.remove("encouraged");
            if (img) {
                img.src = "icons/courage-blue.svg";
            }
        }
        if (countSpan) {
            const safeCount = Math.max(0, Number(count) || 0);
            countSpan.dataset.count = String(safeCount);
            countSpan.textContent = formatCompactCount(safeCount);
            countSpan.title = safeCount.toLocaleString("fr-FR");
        }
    };

    const syncLocalContentCount = (count) => {
        const content = findContentById(contentId);
        if (content) {
            content.encouragementsCount = Math.max(0, Number(count) || 0);
        }
    };

    const currentCount = Number(
        btnElement?.querySelector(".courage-count")?.dataset?.count || 0,
    );
    const safeCurrentCount = Number.isFinite(currentCount) ? currentCount : 0;
    const isCurrentlyEncouraged = btnElement.classList.contains("encouraged");

    // Comportement demandé: une fois encouragé, le bouton reste vert.
    if (isCurrentlyEncouraged) {
        allCourageButtons.forEach((btn) => {
            const btnCount = Number(
                btn.querySelector(".courage-count")?.dataset?.count ||
                    safeCurrentCount,
            );
            updateButtonUI(
                btn,
                true,
                Number.isFinite(btnCount) ? btnCount : safeCurrentCount,
            );
        });
        return;
    }

    const optimisticCount = safeCurrentCount + 1;
    allCourageButtons.forEach((btn) =>
        updateButtonUI(btn, true, optimisticCount),
    );
    syncLocalContentCount(optimisticCount);

    try {
        const { data, error } = await supabase.rpc("toggle_courage", {
            row_id: contentId,
            user_id_param: currentUser.id,
        });

        if (error) throw error;

        // Sync with server truth
        if (data) {
            const serverCount = Number(data.count);
            const safeServerCount = Number.isFinite(serverCount)
                ? Math.max(0, serverCount)
                : optimisticCount;
            allCourageButtons.forEach((btn) => {
                updateButtonUI(btn, true, safeServerCount);
            });
            syncLocalContentCount(safeServerCount);
        }

        const content = findContentById(contentId);
        updateImmersivePrefs(content, "like");
        if (
            window.XeraUIMotion &&
            typeof window.XeraUIMotion.playCourageFeedback === "function"
        ) {
            window.XeraUIMotion.playCourageFeedback(
                allCourageButtons,
                btnElement,
            );
        }
        // Notifier l'auteur de la mise à jour (sauf auto-encouragement)
        notifyEncouragement(contentId)
            .then(() => {
                // Meta Style: Predatory Feedback
                // Si on a les infos, on pourrait afficher un toast spécial ici aussi
            })
            .catch((e) => console.warn("notifyEncouragement error", e));
    } catch (error) {
        console.error("Erreur toggleCourage:", error);
        // Revert on error
        allCourageButtons.forEach((btn) => {
            updateButtonUI(btn, false, safeCurrentCount);
        });
        syncLocalContentCount(safeCurrentCount);

        ToastManager.error(
            "Erreur",
            "Impossible de mettre à jour l'encouragement",
        );
    }
}

/* ========================================
   SYSTÈME DE BADGES (CONSERVÉ)
   ======================================== */

const BADGE_ASSET_VERSION = "2";

const SUPER_ADMIN_ID = "b0f9f893-1706-4721-899c-d26ad79afc86";
const VERIFICATION_ADMIN_IDS = new Set([SUPER_ADMIN_ID]);

let verifiedCreatorUserIds = new Set();
let verifiedStaffUserIds = new Set();
let verifiedPageIds = new Set();
let verificationRequests = [];

function isSuperAdmin() {
    return !!window.currentUser && window.currentUser.id === SUPER_ADMIN_ID;
}

function getCurrentUserProfile() {
    if (!window.currentUser) return null;
    return (
        (window.allUsers || []).find((u) => u.id === window.currentUser.id) ||
        null
    );
}

function isProfileIdentityComplete(user = null) {
    const profile =
        user || getCurrentUserProfile() || window.currentUser || null;
    if (!profile) return false;

    const name = String(profile.name || profile.full_name || "").trim();
    const avatar = String(profile.avatar || profile.avatar_url || "").trim();

    return Boolean(name || avatar);
}

function shouldShowProfileCompletionReminder(user = null) {
    if (!window.currentUser || !window.currentUser.id) return false;
    if (window.currentUser?.is_pro || window.currentUser?.isPro) {
        return false;
    }
    return !isProfileIdentityComplete(user || getCurrentUserProfile());
}

function syncProfileCompletionReminders() {
    const currentUserId =
        window.currentUser?.id || window.currentUserId || null;
    if (!currentUserId) return;

    document
        .querySelectorAll(
            ".nav-profile-reminder-dot, .settings-reminder-dot, .profile-identity-reminder-dot",
        )
        .forEach((dot) => dot.remove());

    const shouldShow = shouldShowProfileCompletionReminder();

    const profileButton = document.getElementById("nav-profile");
    if (profileButton) {
        if (shouldShow) {
            const dot = document.createElement("span");
            dot.className = "nav-profile-reminder-dot";
            dot.setAttribute("aria-hidden", "true");
            profileButton.appendChild(dot);
        }
    }

    const settingsButton = document.querySelector(
        '.settings-badge[title="Réglages"], .settings-badge[title="Settings"], .settings-badge[onclick*="openSettings"]',
    );
    if (settingsButton) {
        if (shouldShow) {
            const dot = document.createElement("span");
            dot.className = "settings-reminder-dot";
            dot.setAttribute("aria-hidden", "true");
            settingsButton.appendChild(dot);
        }
    }

    const identityNavItem = document.querySelector(
        '.settings-nav-item[data-settings-target="identity"] .settings-nav-glyph',
    );
    if (identityNavItem) {
        const existing = identityNavItem.querySelector(
            ".profile-identity-reminder-dot",
        );
        if (shouldShow) {
            if (!existing) {
                const dot = document.createElement("span");
                dot.className = "profile-identity-reminder-dot";
                dot.setAttribute("aria-hidden", "true");
                identityNavItem.appendChild(dot);
            }
        } else if (existing) {
            existing.remove();
        }
    }
}

window.syncProfileCompletionReminders = syncProfileCompletionReminders;
window.shouldShowProfileCompletionReminder =
    shouldShowProfileCompletionReminder;
window.isProfileIdentityComplete = isProfileIdentityComplete;

function isUserBanned(userProfile) {
    if (!userProfile || !userProfile.banned_until) return false;
    const now = new Date();
    const bannedUntil = new Date(userProfile.banned_until);
    return bannedUntil > now;
}

function getBanRemainingLabel(userProfile) {
    if (!userProfile || !userProfile.banned_until) return "";
    const now = new Date();
    const bannedUntil = new Date(userProfile.banned_until);
    const diffMs = bannedUntil - now;
    if (diffMs <= 0) return "";
    const diffMinutes = Math.ceil(diffMs / (1000 * 60));
    if (diffMinutes < 60) return `${diffMinutes} min`;
    const diffHours = Math.ceil(diffMinutes / 60);
    if (diffHours < 48) return `${diffHours} h`;
    const diffDays = Math.ceil(diffHours / 24);
    return `${diffDays} j`;
}

async function fetchVerifiedBadges() {
    try {
        const { data, error } = await supabase
            .from("verified_badges")
            .select("user_id, type");

        if (error) throw error;

        const creators = new Set();
        const staff = new Set();
        const pages = new Set();
        (data || []).forEach((item) => {
            if (item.type === "staff") staff.add(item.user_id);
            if (item.type === "creator") creators.add(item.user_id);
            if (item.type === "page") pages.add(item.user_id);
        });

        verifiedCreatorUserIds = creators;
        verifiedStaffUserIds = staff;
        verifiedPageIds = pages;

        // Fallback local: le super admin est toujours staff vérifié côté UI
        if (SUPER_ADMIN_ID) {
            verifiedStaffUserIds.add(SUPER_ADMIN_ID);
        }
    } catch (error) {
        console.error("Erreur récupération badges vérifiés:", error);
        verifiedCreatorUserIds = new Set();
        verifiedStaffUserIds = new Set();
        if (SUPER_ADMIN_ID) {
            verifiedStaffUserIds.add(SUPER_ADMIN_ID);
        }
    }
}

function getVerifiedBadgeSets() {
    return {
        creators: new Set(verifiedCreatorUserIds || []),
        staff: new Set(verifiedStaffUserIds || []),
        pages: new Set(verifiedPageIds || []),
    };
}

function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Transforme le texte brut en HTML riche (liens, hashtags, mentions)
 */
function renderRichDescription(text) {
    if (!text) return "";
    let html = escapeHtml(text);

    // 1. URLs (http, https)
    const urlPattern =
        /(\b(https?):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gi;
    html = html.replace(
        urlPattern,
        '<a href="$1" target="_blank" rel="noopener" class="rich-link" onclick="event.stopPropagation()">$1</a>',
    );

    // 2. Hashtags (#tag)
    const hashtagPattern = /(^|\s)#([a-zA-Z0-9À-ÖØ-öø-ÿ_]+)/g;
    html = html.replace(hashtagPattern, (match, space, tag) => {
        return `${space}<span class="rich-hashtag" onclick="event.stopPropagation(); window.navigateTo?.('discover', { query: { q: '#${tag}' } })">#${tag}</span>`;
    });

    // 3. Mentions (@username ou @slug)
    const mentionPattern = /(^|\s)@([a-zA-Z0-9À-ÖØ-öø-ÿ_-]+)/g;
    html = html.replace(mentionPattern, (match, space, name) => {
        // NOTE: On passe par Discover pour lever l'ambiguité utilisateur/page pro
        return `${space}<span class="rich-mention" onclick="event.stopPropagation(); window.navigateTo?.('discover', { query: { q: '@${name}' } })">@${name}</span>`;
    });

    return html.replace(/\n/g, "<br>");
}

/**
 * Initialise l'autocomplétion des mentions (@) sur un textarea
 */
function attachMentionAutocomplete(textarea) {
    if (!textarea) return;

    let autocompleteList = null;
    let lastQuery = "";
    let mentionSearchRequest = 0;

    const createList = () => {
        const list = document.createElement("div");
        list.className = "mention-autocomplete-list";
        list.style.position = "fixed";
        list.style.zIndex = "20000";
        list.style.background = "var(--bg-secondary)";
        list.style.border = "1px solid var(--border-color)";
        list.style.borderRadius = "8px";
        list.style.boxShadow = "0 10px 25px rgba(0,0,0,0.5)";
        list.style.maxHeight = "200px";
        list.style.overflowY = "auto";
        list.style.display = "none";
        document.body.appendChild(list);
        return list;
    };

    const updateListPosition = () => {
        if (!autocompleteList) return;
        const rect = textarea.getBoundingClientRect();
        autocompleteList.style.top = `${Math.min(rect.bottom + 5, window.innerHeight - 210)}px`;
        autocompleteList.style.left = `${Math.max(8, rect.left)}px`;
        autocompleteList.style.width = `${Math.min(rect.width, window.innerWidth - 16)}px`;
    };

    const performMentionSearch = async (query) => {
        if (query === lastQuery) return;
        lastQuery = query;
        const requestId = ++mentionSearchRequest;
        autocompleteList.innerHTML = `
            <div class="mention-search-loading" role="status" aria-live="polite">
                <span class="mention-search-spinner" aria-hidden="true"></span>
                Recherche en cours...
            </div>
        `;
        autocompleteList.style.display = "block";
        updateListPosition();

        try {
            const [usersRes, pagesRes] = await Promise.all([
                supabase
                    .from("users")
                    .select("id, name, avatar")
                    .ilike("name", `%${query}%`)
                    .limit(5),
                supabase
                    .from("professional_pages")
                    .select("id, name, slug, avatar_url")
                    .ilike("name", `%${query}%`)
                    .limit(5),
            ]);

            const users = (usersRes.data || []).filter((u) => u && u.name);
            const pages = (pagesRes.data || []).filter((p) => p && p.name);
            if (requestId !== mentionSearchRequest) return;
            const results = [
                ...users.map((u) => ({
                    id: u.id,
                    name: u.name,
                    handle: String(u.name).toLowerCase().replace(/\s+/g, ""),
                    avatar: u.avatar,
                    type: "user",
                })),
                ...pages.map((p) => ({
                    id: p.id,
                    name: p.name,
                    handle:
                        p.slug ||
                        String(p.name).toLowerCase().replace(/\s+/g, ""),
                    avatar: p.avatar_url,
                    type: "page",
                })),
            ];

            if (results.length > 0) {
                renderResults(results);
            } else {
                autocompleteList.innerHTML = `<div class="mention-search-empty">Aucun résultat</div>`;
                autocompleteList.style.display = "block";
                updateListPosition();
            }
        } catch (err) {
            console.warn("Mention search error:", err);
            autocompleteList.innerHTML = `<div class="mention-search-empty">Recherche indisponible</div>`;
            autocompleteList.style.display = "block";
            updateListPosition();
        }
    };

    const renderResults = (results) => {
        autocompleteList.innerHTML = results
            .map(
                (res) => `
            <div class="mention-item" data-handle="${res.handle}" style="display: flex; align-items: center; gap: 10px; padding: 10px; cursor: pointer; border-bottom: 1px solid var(--border-color);">
                <img src="${res.avatar || "https://placehold.co/30"}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;">
                <div style="flex: 1;">
                    <div style="font-weight: 700; color: #fff;">${res.name}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">@${res.handle} ${res.type === "page" ? "• Page Pro" : ""}</div>
                </div>
            </div>
        `,
            )
            .join("");
        autocompleteList.style.display = "block";
        updateListPosition();

        autocompleteList.querySelectorAll(".mention-item").forEach((item) => {
            item.onclick = () => {
                const handle = item.dataset.handle;
                insertMention(handle);
            };
        });
    };

    const insertMention = (handle) => {
        const text = textarea.value;
        const cursor = textarea.selectionStart;
        const before = text.substring(0, cursor);
        const lastAt = before.lastIndexOf("@");
        const after = text.substring(cursor);

        textarea.value =
            before.substring(0, lastAt) + "@" + handle + " " + after;
        textarea.focus();
        const newCursor = lastAt + handle.length + 2;
        textarea.setSelectionRange(newCursor, newCursor);
        autocompleteList.style.display = "none";
    };

    textarea.addEventListener("input", (e) => {
        const cursor = textarea.selectionStart;
        const textBefore = textarea.value.substring(0, cursor);
        const lastAt = textBefore.lastIndexOf("@");

        if (lastAt !== -1) {
            const query = textBefore.substring(lastAt + 1);
            if (!query.includes(" ")) {
                if (!autocompleteList) autocompleteList = createList();
                if (query.length === 0) {
                    lastQuery = "";
                    autocompleteList.innerHTML = `<div class="mention-search-hint">Tapez un nom après @ pour rechercher</div>`;
                    autocompleteList.style.display = "block";
                    updateListPosition();
                } else {
                    performMentionSearch(query);
                }
                return;
            }
        }

        if (autocompleteList) autocompleteList.style.display = "none";
    });

    textarea.addEventListener("blur", () => {
        // Petit délai pour laisser le click sur l'item fonctionner
        setTimeout(() => {
            if (autocompleteList) autocompleteList.style.display = "none";
        }, 200);
    });

    window.addEventListener("resize", updateListPosition);
}

function inlineJsString(value) {
    return escapeHtml(JSON.stringify(String(value ?? "")));
}

async function fetchAdminAnnouncements() {
    try {
        const { data, error } = await supabase
            .from("admin_announcements")
            .select("*, users(id, name, avatar)")
            .is("deleted_at", null)
            .order("is_pinned", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(10);

        if (error) throw error;
        window.adminAnnouncements = data || [];
        renderAnnouncements();
        renderAdminAnnouncementsList();
    } catch (error) {
        console.error("Erreur récupération annonces admin:", error);
        window.adminAnnouncements = [];
        renderAnnouncements();
        renderAdminAnnouncementsList();
    }
}

function renderAnnouncements() {
    const container = document.getElementById("announcements-container");
    if (!container) return;
    const announcements = window.adminAnnouncements || [];
    if (announcements.length === 0) {
        container.innerHTML = "";
        container.style.display = "none";
        return;
    }

    container.style.display = "grid";
    container.innerHTML = announcements
        .map((item) => {
            const title = escapeHtml(item.title || "Annonce");
            const body = escapeHtml(item.body || "");
            const author = item.users || {};
            const authorId =
                item.author_id || author.id || SUPER_ADMIN_ID || null;
            const authorName = escapeHtml(author.name || "Administration");
            const authorAvatar =
                author.avatar &&
                (String(author.avatar).startsWith("http") ||
                    String(author.avatar).startsWith("data:"))
                    ? author.avatar
                    : "https://placehold.co/48";
            const authorNameHtml =
                authorId && typeof renderUsernameWithBadge === "function"
                    ? renderUsernameWithBadge(authorName, authorId)
                    : authorName;
            const createdAt = item.created_at
                ? new Date(item.created_at)
                : null;
            const timeLabel = safeFormatDate(createdAt, {
                day: "numeric",
                month: "short",
            });
            return `
            <div class="announcement-card ${item.is_pinned ? "pinned" : ""}">
                <div class="announcement-header">
                    <span class="announcement-title">${title}</span>
                    ${item.is_pinned ? '<span class="announcement-pin">Épinglé</span>' : ""}
                </div>
                <div class="announcement-author">
                    <img class="announcement-avatar" src="${authorAvatar}" alt="${authorName}">
                    <div class="announcement-author-meta">
                        <div class="announcement-author-name">${authorNameHtml}</div>
                        <span class="announcement-chip">Annonce officielle</span>
                    </div>
                </div>
                <p class="announcement-body">${body}</p>
                <div class="announcement-meta">${timeLabel}</div>
            </div>
`;
        })
        .join("");
}

async function createAdminAnnouncement(payload) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return { success: false };
    }
    const title = String(payload?.title || "").trim();
    const body = String(payload?.body || "").trim();
    const isPinned = !!payload?.isPinned;

    if (!title || !body) {
        ToastManager?.info("Champs requis", "Ajoutez un titre et un contenu.");
        return { success: false };
    }

    try {
        const { error } = await supabase.from("admin_announcements").insert({
            author_id: window.currentUser?.id || null,
            title,
            body,
            is_pinned: isPinned,
        });
        if (error) throw error;
        ToastManager?.success("Annonce publiée", "Votre message est en ligne.");
        await fetchAdminAnnouncements();
        return { success: true };
    } catch (error) {
        console.error("Erreur publication annonce:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de publier.",
        );
        return { success: false, error };
    }
}

async function updateAdminAnnouncement(payload) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return { success: false };
    }
    const id = String(payload?.id || "").trim();
    const title = String(payload?.title || "").trim();
    const body = String(payload?.body || "").trim();
    const isPinned = !!payload?.isPinned;

    if (!id) {
        ToastManager?.error("Erreur", "Annonce introuvable.");
        return { success: false };
    }
    if (!title || !body) {
        ToastManager?.info("Champs requis", "Ajoutez un titre et un contenu.");
        return { success: false };
    }

    try {
        const { error } = await supabase
            .from("admin_announcements")
            .update({
                title,
                body,
                is_pinned: isPinned,
                updated_at: new Date().toISOString(),
            })
            .eq("id", id);
        if (error) throw error;
        ToastManager?.success(
            "Annonce mise à jour",
            "Modifications enregistrées.",
        );
        await fetchAdminAnnouncements();
        return { success: true };
    } catch (error) {
        console.error("Erreur modification annonce:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de modifier l'annonce.",
        );
        return { success: false, error };
    }
}

async function deleteAdminAnnouncement(announcementId) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return { success: false };
    }
    const id = String(announcementId || "").trim();
    if (!id) return { success: false };
    if (!confirm("Supprimer cette annonce officielle ?")) {
        return { success: false };
    }

    try {
        const { error } = await supabase
            .from("admin_announcements")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", id);
        if (error) throw error;
        ToastManager?.success("Annonce supprimée", "Elle n'est plus visible.");
        await fetchAdminAnnouncements();
        return { success: true };
    } catch (error) {
        console.error("Erreur suppression annonce:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de supprimer l'annonce.",
        );
        return { success: false, error };
    }
}

function resetAdminAnnouncementForm() {
    const idInput = document.getElementById("admin-announcement-id");
    const titleInput = document.getElementById("admin-announcement-title");
    const bodyInput = document.getElementById("admin-announcement-body");
    const pinInput = document.getElementById("admin-announcement-pin");
    const submitBtn = document.getElementById("admin-announcement-submit");
    const cancelBtn = document.getElementById("admin-announcement-cancel");

    if (idInput) idInput.value = "";
    if (titleInput) titleInput.value = "";
    if (bodyInput) bodyInput.value = "";
    if (pinInput) pinInput.checked = false;
    if (submitBtn) submitBtn.textContent = "Publier";
    if (cancelBtn) cancelBtn.style.display = "none";
}

async function submitAdminAnnouncement() {
    const idInput = document.getElementById("admin-announcement-id");
    const titleInput = document.getElementById("admin-announcement-title");
    const bodyInput = document.getElementById("admin-announcement-body");
    const pinInput = document.getElementById("admin-announcement-pin");
    if (!titleInput || !bodyInput || !pinInput) return;

    const id = idInput ? idInput.value : "";
    const payload = {
        id,
        title: titleInput.value,
        body: bodyInput.value,
        isPinned: pinInput.checked,
    };
    const result = id
        ? await updateAdminAnnouncement(payload)
        : await createAdminAnnouncement(payload);
    if (result?.success) {
        resetAdminAnnouncementForm();
    }
}

function editAdminAnnouncement(announcementId) {
    if (!isSuperAdmin()) return;
    const id = String(announcementId || "");
    const announcements = window.adminAnnouncements || [];
    const item = announcements.find((a) => String(a.id) === id);
    if (!item) return;

    const idInput = document.getElementById("admin-announcement-id");
    const titleInput = document.getElementById("admin-announcement-title");
    const bodyInput = document.getElementById("admin-announcement-body");
    const pinInput = document.getElementById("admin-announcement-pin");
    const submitBtn = document.getElementById("admin-announcement-submit");
    const cancelBtn = document.getElementById("admin-announcement-cancel");

    if (idInput) idInput.value = id;
    if (titleInput) titleInput.value = item.title || "";
    if (bodyInput) bodyInput.value = item.body || "";
    if (pinInput) pinInput.checked = !!item.is_pinned;
    if (submitBtn) submitBtn.textContent = "Mettre à jour";
    if (cancelBtn) cancelBtn.style.display = "inline-flex";
}

function cancelAdminAnnouncementEdit() {
    resetAdminAnnouncementForm();
}

function renderAdminAnnouncementsList() {
    const container = document.getElementById("admin-announcements-list");
    if (!container) return;
    const announcements = window.adminAnnouncements || [];
    if (announcements.length === 0) {
        container.innerHTML =
            '<div class="verification-empty">Aucune annonce officielle.</div>';
        return;
    }
    container.innerHTML = announcements
        .map((item) => {
            const title = escapeHtml(item.title || "Annonce");
            const body = escapeHtml(item.body || "");
            const safeId = String(item.id || "").replace(/"/g, "&quot;");
            const createdAt = item.created_at
                ? new Date(item.created_at)
                : null;
            const timeLabel = safeFormatDate(createdAt, {
                day: "numeric",
                month: "short",
            });
            return `
            <div class="announcement-card ${item.is_pinned ? "pinned" : ""}">
                <div class="announcement-header">
                    <span class="announcement-title">${title}</span>
                    ${item.is_pinned ? '<span class="announcement-pin">Épinglé</span>' : ""}
                </div>
                <p class="announcement-body">${body}</p>
                <div class="announcement-meta">${timeLabel}</div>
                <div class="announcement-actions">
                    <button type="button" class="btn-verify" onclick="editAdminAnnouncement('${safeId}')">Modifier</button>
                    <button type="button" class="btn-cancel" onclick="deleteAdminAnnouncement('${safeId}')">Supprimer</button>
                </div>
            </div>
`;
        })
        .join("");
}

function getSuperAdminPanelHtml() {
    if (!isSuperAdmin()) return "";
    return `
<div class="settings-section">
            <h3>Super admin</h3>
            <p style="color: var(--text-secondary); margin-bottom: 1rem;">Section dédiée aux annonces officielles.</p>

            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <h4>Annonce officielle</h4>
                <div class="verification-input-row" style="flex-direction: column; align-items: stretch;">
                    <input type="hidden" id="admin-announcement-id">
                    <input type="text" id="admin-announcement-title" class="form-input" placeholder="Titre de l'annonce">
                    <textarea id="admin-announcement-body" class="form-input" rows="3" placeholder="Contenu de l'annonce"></textarea>
                    <label style="display:flex; align-items:center; gap:0.5rem; color: var(--text-secondary); font-size: 0.9rem;">
                        <input type="checkbox" id="admin-announcement-pin"> Épingler
                    </label>
                    <div style="display:flex; gap:0.75rem; align-items:center; flex-wrap: wrap;">
                        <button type="button" class="btn-verify" id="admin-announcement-submit" onclick="submitAdminAnnouncement()">Publier</button>
                        <button type="button" class="btn-cancel" id="admin-announcement-cancel" onclick="cancelAdminAnnouncementEdit()" style="display:none;">Annuler modification</button>
                    </div>
                </div>
            </div>

            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <h4>Gérer les annonces</h4>
                <div id="admin-announcements-list"></div>
            </div>
            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <h4>Badges (page dédiée)</h4>
                <p style="color: var(--text-secondary); font-size: 0.9rem;">
                    Gérer les badges vérifiés sur la page dédiée.
                </p>
                <a href="badges-admin.html" class="btn-verify" style="display:inline-flex; align-items:center; gap:0.5rem; width:auto;">
                    Ouvrir la page Badges
                    <img src="icons/verify-personal.svg?v=2" alt="Badge" style="width:18px;height:18px;">
                </a>
            </div>

            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <h4>Codes de réduction abonnements</h4>
                <p style="color: var(--text-secondary); font-size: 0.9rem;">Crée un code, sa période de validité et une réduction de 10 à 100 %.</p>
                <div class="verification-input-row" style="flex-wrap: wrap; align-items: end;">
                    <label>Code<input type="text" id="admin-discount-code" class="form-input" maxlength="40" placeholder="BIENVENUE10"></label>
                    <label>Plan offert<select id="admin-discount-plan" class="form-input"><option value="standard">Standard</option><option value="medium">Medium</option><option value="pro">Pro</option><option value="elite">Elite</option><option value="page_verification">Page verification</option></select></label>
                    <label>Réduction (%)<input type="number" id="admin-discount-percent" class="form-input" min="10" max="100" step="1" value="100"></label>
                    <label>Avantages (jours)<input type="number" id="admin-discount-duration" class="form-input" min="1" step="1" placeholder="30"></label>
                    <label>Limite utilisations<input type="number" id="admin-discount-max-uses" class="form-input" min="1" step="1" placeholder="Illimitée"></label>
                    <label>Début<input type="datetime-local" id="admin-discount-from" class="form-input"></label>
                    <label>Fin (optionnelle)<input type="datetime-local" id="admin-discount-until" class="form-input"></label>
                    <button type="button" class="btn-verify" onclick="createAdminDiscountCode()">Créer le code</button>
                </div>
                <div id="admin-discount-codes-list" style="margin-top:0.9rem; display:flex; flex-direction:column; gap:0.5rem;"></div>
            </div>

            <div class="verification-admin-block" style="margin-top:1.5rem;">
                <h4>Partenariats</h4>
                <p style="color:var(--text-secondary);font-size:.9rem;">Définissez les deux codes et la période pendant laquelle le partenariat sera actif. Le code réduction est fixé à 20 %.</p>
                <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:end"><label>Partenaire<input id="admin-partner-name" class="form-input" placeholder="Y Combinator"></label><label>Code partenaire<input id="admin-partner-access-code" class="form-input" maxlength="60" placeholder="YCOMBINATOR2026"></label><label>Code réduction 20 %<input id="admin-partner-discount-code" class="form-input" maxlength="60" placeholder="YCOMBINATOR"></label><label>Début du partenariat<input id="admin-partner-start-date" class="form-input" type="date"></label><label>Fin du partenariat<input id="admin-partner-end-date" class="form-input" type="date"></label><button class="btn-verify" type="button" onclick="createAdminPartner()">Créer partenaire</button><button class="btn-verify" type="button" onclick="fetchAdminPartners()">Rafraîchir</button></div>
                <div id="admin-partners-list" style="margin-top:.9rem;display:flex;flex-direction:column;gap:.5rem"></div>
            </div>

            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <h4 style="margin:0;">Paiements KPay</h4>
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin:0.35rem 0 0.8rem;">Les abonnements sont activés automatiquement uniquement après confirmation sécurisée de KPay. Consultez ici l'historique, sans validation manuelle.</p>
                <a href="kpay-payments.html" class="btn-verify" style="display:inline-flex;align-items:center;text-decoration:none">Voir les paiements reçus</a>
            </div>

            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                    <h4 style="margin:0;">Pulse temps réel</h4>
                    <button class="btn-verify" type="button" id="admin-stats-refresh" onclick="refreshAppPulse()">Mettre à jour</button>
                </div>
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin: 0.35rem 0 0.9rem;">
                    Comptes, visites (proxy via vues de contenu) et actifs estimés, en direct depuis Supabase.
                </p>
                <div id="admin-stats-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap:0.75rem;">
                    <div class="admin-card" style="border:1px solid var(--border-color); border-radius:12px; padding:0.9rem;">
                        <div style="font-size:0.9rem; color:var(--text-secondary);">Utilisateurs</div>
                        <div id="admin-stats-users" style="font-size:1.8rem; font-weight:700; margin:0.3rem 0;">—</div>
                        <div style="font-size:0.85rem; color:var(--text-secondary);">Total comptes créés</div>
                    </div>
                    <div class="admin-card" style="border:1px solid var(--border-color); border-radius:12px; padding:0.9rem;">
                        <div style="font-size:0.9rem; color:var(--text-secondary);">Visites (proxy)</div>
                        <div id="admin-stats-visits" style="font-size:1.8rem; font-weight:700; margin:0.3rem 0;">—</div>
                        <div style="font-size:0.85rem; color:var(--text-secondary);">Somme des vues de contenu</div>
                    </div>
                    <div class="admin-card" style="border:1px solid var(--border-color); border-radius:12px; padding:0.9rem;">
                        <div style="font-size:0.9rem; color:var(--text-secondary);">Actifs quotidiens (24h)</div>
                        <div id="admin-stats-dau" style="font-size:1.8rem; font-weight:700; margin:0.3rem 0;">—</div>
                        <div style="font-size:0.85rem; color:var(--text-secondary);">Utilisateurs ayant posté aujourd'hui</div>
                    </div>
                    <div class="admin-card" style="border:1px solid var(--border-color); border-radius:12px; padding:0.9rem;">
                        <div style="font-size:0.9rem; color:var(--text-secondary);">MAU estimés (30j)</div>
                        <div id="admin-stats-mau" style="font-size:1.8rem; font-weight:700; margin:0.3rem 0;">—</div>
                        <div style="font-size:0.85rem; color:var(--text-secondary);">Utilisateurs uniques actifs sur 30 jours</div>
                    </div>
                </div>
                <div id="admin-stats-meta" style="color: var(--text-secondary); font-size:0.9rem; margin-top:0.35rem;">Clique sur « Mettre à jour » pour rafraîchir.</div>
            </div>

            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                    <h4 style="margin:0;">Feedback utilisateurs</h4>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <button class="btn-verify" type="button" onclick="fetchFeedbackInbox()">Rafraîchir</button>
                        <span style="color: var(--text-secondary); font-size: 0.85rem;">Flux anonyme → super admin</span>
                    </div>
                </div>
                <div id="admin-feedback-list" class="admin-feedback-list" style="margin-top: 0.75rem; display:flex; flex-direction:column; gap:0.75rem;"></div>
            </div>

            <div class="verification-admin-block" style="margin-top: 1.5rem;">
                <h4>Envoyer un email à tout le monde</h4>
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
                    Envoyer un email officiel XERA à tous les utilisateurs enregistrés.
                </p>
                <div class="verification-input-row" style="flex-direction: column; align-items: stretch;">
                    <input type="text" id="admin-broadcast-subject" class="form-input" placeholder="Sujet de l'email">
                    <textarea id="admin-broadcast-body" class="form-input" rows="5" placeholder="Contenu de l'email (Markdown supporté par sauts de ligne)"></textarea>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem;">
                        <input type="text" id="admin-broadcast-cta-label" class="form-input" placeholder="Label du bouton (ex: Ouvrir l'app)">
                        <input type="text" id="admin-broadcast-cta-url" class="form-input" placeholder="URL du bouton (optionnel)">
                    </div>
                    <button type="button" class="btn-verify" id="admin-broadcast-submit" onclick="sendAdminBroadcastEmail()">
                        Envoyer à tous les utilisateurs
                    </button>
                </div>
            </div>
</div>
    `;
}

function formatStatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return "—";
    }
    const n = Number(value);
    return formatCompactCount(n);
}

function formatCompactCount(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return "0";
    }

    const n = Number(value);
    const abs = Math.abs(n);
    if (abs < 1000) {
        return Math.round(n).toLocaleString("fr-FR");
    }

    const units = [
        { value: 1_000_000_000, suffix: "B" },
        { value: 1_000_000, suffix: "M" },
        { value: 1_000, suffix: "K" },
    ];

    const unit = units.find((entry) => abs >= entry.value) || units.at(-1);
    const shortValue = n / unit.value;
    const useDecimal = Math.abs(shortValue) < 10;
    const formatted = new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: useDecimal ? 1 : 0,
    }).format(shortValue);

    return `${formatted}${unit.suffix}`;
}

async function fetchTotalContentViews() {
    // Pas d'agrégat Supabase configuré ici: on somme côté client.
    try {
        const { data, error } = await supabase.from("content").select("views");
        if (error) throw error;
        return (data || []).reduce(
            (acc, row) => acc + (Number(row.views) || 0),
            0,
        );
    } catch (err) {
        console.error("Unable to compute total content views:", err);
        return 0;
    }
}

let appPulseRefreshing = false;

async function refreshAppPulse() {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Réservé au super-admin.");
        return;
    }
    if (appPulseRefreshing) return;
    appPulseRefreshing = true;

    const btn = document.getElementById("admin-stats-refresh");
    const meta = document.getElementById("admin-stats-meta");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Mise à jour…";
    }
    if (meta) meta.textContent = "Récupération des données en cours…";

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const thirtyAgo = new Date(today);
    thirtyAgo.setDate(today.getDate() - 30);
    const thirtyStr = thirtyAgo.toISOString().slice(0, 10);

    try {
        const [
            { count: totalUsers, error: userError },
            totalViews,
            dauPayload,
        ] = await Promise.all([
            supabase.from("users").select("id", { count: "exact", head: true }),
            fetchTotalContentViews(),
            supabase
                .from("daily_metrics")
                .select("user_id, date")
                .gte("date", thirtyStr),
        ]);

        if (userError) throw userError;
        const dailyRows = Array.isArray(dauPayload?.data)
            ? dauPayload.data
            : [];
        const mauSet = new Set();
        const dauSet = new Set();
        dailyRows.forEach((row) => {
            if (row?.user_id) {
                mauSet.add(row.user_id);
                if (row.date === todayStr) {
                    dauSet.add(row.user_id);
                }
            }
        });

        const stats = {
            totalUsers: totalUsers ?? 0,
            totalViews: typeof totalViews === "number" ? totalViews : 0,
            dau: dauSet.size,
            mau: mauSet.size,
        };
        updateAppPulseUI(stats);
    } catch (error) {
        console.error("Erreur récupération stats admin:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de récupérer les stats.",
        );
        if (meta) meta.textContent = "Erreur lors de la récupération.";
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Mettre à jour";
        }
        appPulseRefreshing = false;
    }
}

function updateAppPulseUI(stats) {
    const { totalUsers, totalViews, dau, mau } = stats || {};
    const usersEl = document.getElementById("admin-stats-users");
    const visitsEl = document.getElementById("admin-stats-visits");
    const dauEl = document.getElementById("admin-stats-dau");
    const mauEl = document.getElementById("admin-stats-mau");
    const meta = document.getElementById("admin-stats-meta");

    if (usersEl) usersEl.textContent = formatStatNumber(totalUsers || 0);
    if (visitsEl) visitsEl.textContent = formatStatNumber(totalViews || 0);
    if (dauEl) dauEl.textContent = formatStatNumber(dau || 0);
    if (mauEl) mauEl.textContent = formatStatNumber(mau || 0);
    if (meta) {
        const now = new Date();
        meta.textContent = `Mis à jour à ${now.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
        })} — MAU estimés via daily_metrics (30 jours glissants).`;
    }
}

function renderSuperAdminPage() {
    const container = document.getElementById("admin-dashboard");
    if (!container) return;
    container.innerHTML = `
<div class="settings-section">
            <div class="settings-header" style="border:none; margin-bottom:1rem; padding-bottom:0;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap: 1rem; flex-wrap: wrap;">
                    <div style="display:flex; align-items:center; gap: 0.75rem;">
                        <h2>Administration</h2>
                        <span class="admin-badge">Super admin</span>
                    </div>
                </div>
                <p>Gestion complète du compte et des annonces officielles.</p>
            </div>
</div>
${getSuperAdminPanelHtml()}
    `;
    // Précharge les stats temps réel si visible
    setTimeout(() => refreshAppPulse(), 150);
    setTimeout(() => fetchAdminDiscountCodes(), 150);
    setTimeout(() => fetchAdminPartners(), 150);
    installAdminButtonFeedback(container);
}

function installAdminButtonFeedback(container) {
    if (!container || container.dataset.feedbackInstalled) return;
    container.dataset.feedbackInstalled = "true";
    container.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (
            !button ||
            button.disabled ||
            button.dataset.noPendingFeedback === "true"
        )
            return;
        const label = button.textContent.trim();
        button.dataset.originalLabel = label;
        button.disabled = true;
        button.classList.add("admin-action-pending");
        button.setAttribute("aria-busy", "true");
        button.textContent = "Traitement…";
        // Functions invoked by inline handlers are asynchronous. Restore if no
        // navigation/re-render happened, while preserving immediate click feedback.
        window.setTimeout(() => {
            if (
                !button.isConnected ||
                !button.classList.contains("admin-action-pending")
            )
                return;
            button.disabled = false;
            button.classList.remove("admin-action-pending");
            button.removeAttribute("aria-busy");
            button.textContent = button.dataset.originalLabel || label;
        }, 8000);
    });
}

async function fetchSuperAdminJson(path, options = {}) {
    if (!isSuperAdmin()) {
        throw new Error("Accès refusé.");
    }

    const okOnline = await ensureOnlineOrNotify();
    if (!okOnline) {
        throw new Error("Hors connexion.");
    }

    const sessionCheck = await ensureFreshSupabaseSession();
    if (!sessionCheck.ok) {
        throw sessionCheck.error || new Error("Session invalide.");
    }

    const {
        data: { session },
        error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
        throw new Error("Session invalide. Reconnectez-vous.");
    }

    const apiBase = resolveApiBaseUrl();
    if (!apiBase) {
        throw new Error("Adresse API introuvable.");
    }

    let response;
    try {
        response = await fetch(`${apiBase}${path}`, {
            method: options.method || "GET",
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...(options.headers || {}),
            },
            body: options.body,
        });
    } catch (error) {
        const isLocalHost =
            window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1";
        if (isLocalHost) {
            throw new Error(
                `API super-admin inaccessible sur ${apiBase}. Lancez 'npm run api' puis rechargez la page.`,
            );
        }
        throw new Error("Impossible de contacter le serveur super-admin.");
    }

    let payload = {};
    try {
        payload = await response.json();
    } catch (error) {
        payload = {};
    }

    if (!response.ok) {
        const diagnosticCode = payload?.diagnostic?.code;
        const diagnosticDetail =
            payload?.diagnostic?.details || payload?.diagnostic?.hint;
        const diagnostic = diagnosticCode
            ? ` [diagnostic ${diagnosticCode}${diagnosticDetail ? `: ${diagnosticDetail}` : ""}]`
            : "";
        throw new Error(
            `${payload?.error || `Erreur API super-admin (HTTP ${response.status}).`}${diagnostic}`,
        );
    }

    return payload;
}

function formatAdminPaymentDate(value) {
    if (!value) return "—";
    try {
        return new Date(value).toLocaleString("fr-FR");
    } catch (error) {
        return value;
    }
}

function renderAdminSubscriptionPaymentsList(items) {
    const container = document.getElementById(
        "admin-subscription-payments-list",
    );
    if (!container) return;

    if (!Array.isArray(items) || items.length === 0) {
        container.innerHTML = `
            <div class="verification-empty">
                Aucun paiement d'abonnement en attente.
            </div>
`;
        return;
    }

    container.innerHTML = items
        .map((payment) => {
            const safeId = escapeHtml(payment.id || "");
            const user = payment.user || {};
            const userName = escapeHtml(user.name || "Utilisateur");
            const userId = escapeHtml(payment.userId || "");
            const checkoutRef = escapeHtml(payment.checkoutRefId || "—");
            const transactionRef = escapeHtml(payment.transactionRefId || "");
            const plan = escapeHtml(
                String(payment.plan || "").toUpperCase() || "—",
            );
            const billing =
                payment.billingCycle === "annual" ? "Annuel" : "Mensuel";
            const method = escapeHtml(payment.method || "card");
            const provider = escapeHtml(payment.provider || "—");
            const amountLabel = Number(payment.amount || 0).toLocaleString(
                "fr-FR",
                {
                    style: "currency",
                    currency: payment.currency || "USD",
                },
            );
            const currentPlan = escapeHtml(
                String(user.plan || "free").toUpperCase(),
            );
            const currentStatus = escapeHtml(user.plan_status || "inactive");
            const monetized = user.is_monetized ? "Oui" : "Non";

            return `
                <div class="admin-card" style="border:1px solid var(--border-color); border-radius:12px; padding:0.95rem; background: var(--surface-color); display:flex; flex-direction:column; gap:0.75rem;">
                    <div style="display:flex; justify-content:space-between; gap:0.75rem; flex-wrap:wrap; align-items:flex-start;">
                        <div style="display:flex; flex-direction:column; gap:0.2rem; min-width:0;">
                            <strong style="font-size:1rem;">${userName}</strong>
                            <span style="color:var(--text-secondary); font-size:0.85rem; word-break:break-all;">${userId}</span>
                        </div>
                        <span class="admin-badge" style="align-self:flex-start;">${plan} • ${billing}</span>
                    </div>

                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:0.6rem;">
                        <div>
                            <div style="font-size:0.8rem; color:var(--text-secondary);">Montant attendu</div>
                            <div style="font-weight:600;">${amountLabel}</div>
                        </div>
                        <div>
                            <div style="font-size:0.8rem; color:var(--text-secondary);">Paiement</div>
                            <div style="font-weight:600;">${method}${provider !== "—" ? ` • ${provider}` : ""}</div>
                        </div>
                        <div>
                            <div style="font-size:0.8rem; color:var(--text-secondary);">Demande créée</div>
                            <div style="font-weight:600;">${formatAdminPaymentDate(payment.createdAt)}</div>
                        </div>
                        <div>
                            <div style="font-size:0.8rem; color:var(--text-secondary);">Réf interne</div>
                            <div style="font-weight:600; word-break:break-all;">${checkoutRef}</div>
                        </div>
                        <div>
                            <div style="font-size:0.8rem; color:var(--text-secondary);">Plan actuel</div>
                            <div style="font-weight:600;">${currentPlan} • ${currentStatus}</div>
                        </div>
                        <div>
                            <div style="font-size:0.8rem; color:var(--text-secondary);">Monétisation active</div>
                            <div style="font-weight:600;">${monetized}</div>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:0.6rem;">
                        <input type="text" id="admin-sub-payment-ref-${safeId}" class="form-input" placeholder="Référence KPay (recommandée)" value="${transactionRef}">
                        <input type="text" id="admin-sub-payment-operator-${safeId}" class="form-input" placeholder="Référence opérateur (optionnelle)">
                        <input type="text" id="admin-sub-payment-note-${safeId}" class="form-input" placeholder="Note admin (optionnelle)">
                    </div>

                    <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                        <button type="button" class="btn-verify" onclick="confirmAdminSubscriptionPayment('${safeId}')">
                            Confirmer l'encaissement et activer le palier
                        </button>
                        <button type="button" class="btn-cancel" onclick="markAdminSubscriptionPaymentFailed('${safeId}')">
                            Marquer comme non reçu / refusé
                        </button>
                    </div>
                </div>
            `;
        })
        .join("");
}

function renderKpayPaymentHistory(items) {
    const container = document.getElementById("kpay-payments-history");
    if (!container) return;
    if (!Array.isArray(items) || items.length === 0) {
        container.innerHTML =
            '<div class="verification-empty">Aucun paiement KPay confirmé.</div>';
        return;
    }
    container.innerHTML = items
        .map((payment) => {
            const user = payment.user || {};
            const amount = Number(payment.amount || 0).toLocaleString("fr-FR", {
                style: "currency",
                currency: payment.currency || "USD",
            });
            return `<div class="admin-card" style="border:1px solid var(--border-color);border-radius:12px;padding:1rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem;align-items:center">
            <div><small style="color:var(--text-secondary)">Utilisateur</small><strong style="display:block">${escapeHtml(user.name || "Utilisateur")}</strong></div>
            <div><small style="color:var(--text-secondary)">Montant reçu</small><strong style="display:block">${amount}</strong></div>
            <div><small style="color:var(--text-secondary)">Plan</small><strong style="display:block">${escapeHtml(String(payment.plan || "—").toUpperCase())} · ${payment.billingCycle === "annual" ? "Annuel" : "Mensuel"}</strong></div>
            <div><small style="color:var(--text-secondary)">Confirmé le</small><strong style="display:block">${escapeHtml(formatAdminPaymentDate(payment.updatedAt || payment.createdAt))}</strong></div>
            <div><small style="color:var(--text-secondary)">Référence KPay</small><strong style="display:block;word-break:break-all">${escapeHtml(payment.transactionRefId || payment.checkoutRefId || "—")}</strong></div>
            <div><span class="admin-badge">${escapeHtml(payment.status || "succeeded")}</span></div>
        </div>`;
        })
        .join("");
}

async function renderKpayPaymentsPage() {
    const container = document.getElementById("kpay-payments-page");
    if (!container) return;
    const user = await checkAuth();
    if (!user || !isSuperAdmin()) {
        container.innerHTML =
            '<div class="settings-section"><h2>Accès refusé</h2><p>Cette page est réservée au super-admin.</p></div>';
        return;
    }
    container.innerHTML = `<div class="settings-section"><div style="display:flex;justify-content:space-between;gap:1rem;align-items:center;flex-wrap:wrap"><div><a href="admin.html" style="color:var(--text-secondary)">← Administration</a><h2 style="margin:.6rem 0 0">Paiements KPay</h2><p style="color:var(--text-secondary)">Historique en lecture seule des paiements confirmés automatiquement par KPay.</p></div><button class="btn-verify" type="button" onclick="fetchKpayPaymentHistory()">Rafraîchir</button></div><div id="kpay-payments-history" style="margin-top:1rem;display:flex;flex-direction:column;gap:.7rem"></div></div>`;
    installAdminButtonFeedback(container);
    await fetchKpayPaymentHistory();
}

async function fetchKpayPaymentHistory() {
    const container = document.getElementById("kpay-payments-history");
    if (!container) return;
    container.innerHTML = '<div class="loading-spinner"></div>';
    try {
        const payload = await fetchSuperAdminJson(
            "/api/admin/subscription-payments?status=succeeded&limit=100",
        );
        renderKpayPaymentHistory(payload?.payments || []);
    } catch (error) {
        container.innerHTML = `<div class="verification-empty">${escapeHtml(error?.message || "Impossible de charger les paiements.")}</div>`;
    }
}
window.renderKpayPaymentsPage = renderKpayPaymentsPage;
window.fetchKpayPaymentHistory = fetchKpayPaymentHistory;

async function refreshAdminSubscriptionRelatedViews(user) {
    if (!user?.id) return;
    applyUserUpdateToCache(user);

    try {
        if (
            window.currentProfileViewed &&
            window.currentProfileViewed === user.id &&
            typeof renderProfileIntoContainer === "function"
        ) {
            await renderProfileIntoContainer(user.id);
        }
    } catch (error) {
        console.warn("Refresh profile after payment confirm failed:", error);
    }

    try {
        if (
            typeof renderDiscoverGrid === "function" &&
            document.querySelector(".discover-grid")
        ) {
            await renderDiscoverGrid();
            if (typeof window.ToastManager !== "undefined") {
                window.ToastManager.success(
                    "XΞRA High-Signal",
                    "Momentum Engine & Fluidity Active.",
                    3000,
                );
            }
        }
    } catch (error) {
        console.warn("Refresh discover after payment confirm failed:", error);
    }
}

async function fetchAdminSubscriptionPayments() {
    const container = document.getElementById(
        "admin-subscription-payments-list",
    );
    if (!container) return;

    container.innerHTML = `<div class="loading-spinner"></div>`;
    try {
        const payload = await fetchSuperAdminJson(
            "/api/admin/subscription-payments?status=pending&limit=50",
        );
        window.adminSubscriptionPayments = payload?.payments || [];
        renderAdminSubscriptionPaymentsList(window.adminSubscriptionPayments);
    } catch (error) {
        console.error("Erreur chargement paiements abonnements:", error);
        container.innerHTML = `
            <div class="verification-empty">
                ${escapeHtml(error?.message || "Impossible de charger les paiements.")}
            </div>
`;
    }
}

function renderAdminDiscountCodes(items) {
    const container = document.getElementById("admin-discount-codes-list");
    if (!container) return;
    container.innerHTML = !items.length
        ? '<div class="verification-empty">Aucun code créé.</div>'
        : items
              .map(
                  (item) => `
            <div class="admin-card" style="display:flex;justify-content:space-between;gap:0.75rem;align-items:center;flex-wrap:wrap;border:1px solid var(--border-color);padding:0.7rem;border-radius:8px;">
                <strong>${escapeHtml(item.code)} - ${escapeHtml(item.plan || "?")} - ${Number(item.discount_percent)}%</strong>
                <span style="color:var(--text-secondary);font-size:0.85rem;">Code: ${formatAdminPaymentDate(item.valid_from)} → ${item.valid_until ? formatAdminPaymentDate(item.valid_until) : "Sans fin"} | Avantages: ${Number(item.benefit_duration_days)} jours | Usages: ${Number(item.uses_count || 0)}${item.max_uses ? `/${Number(item.max_uses)}` : ""}</span>
                ${item.active ? `<button type="button" class="btn-cancel" onclick="deactivateAdminDiscountCode('${escapeHtml(item.id)}')">Désactiver</button>` : '<span class="admin-badge">Désactivé</span>'}
            </div>`,
              )
              .join("");
}

async function fetchAdminPartners() {
    const box = document.getElementById("admin-partners-list");
    if (!box) return;
    try {
        const data = await fetchSuperAdminJson("/api/admin/partners");
        box.innerHTML = !(data.partners || []).length
            ? '<div class="verification-empty">Aucun partenaire.</div>'
            : data.partners
                  .map(
                      (p) =>
                          `<div class="admin-card" style="padding:.75rem;border:1px solid var(--border-color);border-radius:10px"><strong>${escapeHtml(p.name)}</strong> · ${escapeHtml(p.status)}<br><small>Partenaire: <b>${(p.partner_codes || []).map((c) => escapeHtml(c.code)).join(", ") || "—"}</b> · Réduction 20 %: <b>${(p.partner_discount_codes || []).map((c) => escapeHtml(c.code)).join(", ") || "—"}</b><br>Valide du ${formatAdminPaymentDate(p.start_date)} au ${formatAdminPaymentDate(p.end_date)}</small><div style="display:flex;gap:.4rem;margin-top:.5rem"><input id="partner-code-${p.id}" class="form-input" placeholder="Nouveau code"><button class="btn-verify" onclick="createAdminPartnerCode('${p.id}','partner')">Code partenaire</button><button class="btn-verify" onclick="createAdminPartnerCode('${p.id}','discount')">Code réduction 20%</button></div></div>`,
                  )
                  .join("");
    } catch (e) {
        box.textContent = e.message || "Impossible de charger les partenaires.";
    }
}
async function createAdminPartner() {
    try {
        const input = document.getElementById("admin-partner-name");
        const name = input?.value?.trim();
        if (!name) throw new Error("Saisissez le nom du partenaire.");
        const accessCode = document
            .getElementById("admin-partner-access-code")
            ?.value.trim();
        const discountCode = document
            .getElementById("admin-partner-discount-code")
            ?.value.trim();
        const startDate = document.getElementById(
            "admin-partner-start-date",
        )?.value;
        const endDate = document.getElementById(
            "admin-partner-end-date",
        )?.value;
        if (!accessCode || !discountCode || !startDate || !endDate) {
            throw new Error(
                "Saisissez les deux codes et les dates du partenariat.",
            );
        }
        const startDateValue = new Date(`${startDate}T00:00:00`);
        const endDateValue = new Date(`${endDate}T23:59:59`);
        if (endDateValue <= startDateValue) {
            throw new Error("La date de fin doit être après la date de début.");
        }
        await fetchSuperAdminJson("/api/admin/partners", {
            method: "POST",
            body: JSON.stringify({
                name,
                access_code: accessCode,
                discount_code: discountCode,
                start_date: startDateValue.toISOString(),
                end_date: endDateValue.toISOString(),
            }),
        });
        input.value = "";
        [
            "admin-partner-access-code",
            "admin-partner-discount-code",
            "admin-partner-start-date",
            "admin-partner-end-date",
        ].forEach((id) => {
            const field = document.getElementById(id);
            if (field) field.value = "";
        });
        window.ToastManager?.success?.(
            "Partenaire créé",
            "Le partenaire est maintenant disponible.",
        );
        window.showToast?.("Partenaire créé avec succès.", "success");
        await fetchAdminPartners();
    } catch (e) {
        const partnersList = document.getElementById("admin-partners-list");
        if (partnersList) {
            partnersList.innerHTML = `<div class="verification-empty">${escapeHtml(e.message || "Création impossible.")}</div>`;
        }
        window.ToastManager?.error?.(
            "Erreur",
            e.message || "Création impossible.",
        );
        window.showToast?.(e.message || "Création impossible.", "error");
    }
}
async function createAdminPartnerCode(id, kind) {
    try {
        const code = document.getElementById(`partner-code-${id}`).value;
        await fetchSuperAdminJson(
            `/api/admin/partners/${encodeURIComponent(id)}/codes`,
            { method: "POST", body: JSON.stringify({ kind, code }) },
        );
        window.ToastManager?.success?.("Code créé", "Le code est actif.");
        await fetchAdminPartners();
    } catch (e) {
        window.ToastManager?.error?.(
            "Erreur",
            e.message || "Création impossible.",
        );
        window.showToast?.(e.message || "Création impossible.", "error");
    }
}

async function fetchAdminDiscountCodes() {
    const container = document.getElementById("admin-discount-codes-list");
    if (!container) return;
    try {
        const payload = await fetchSuperAdminJson("/api/admin/discount-codes");
        renderAdminDiscountCodes(payload?.codes || []);
    } catch (error) {
        container.innerHTML = `<div class="verification-empty">${escapeHtml(error?.message || "Impossible de charger les codes.")}</div>`;
    }
}

async function createAdminDiscountCode() {
    const code = document.getElementById("admin-discount-code")?.value || "";
    const percent =
        document.getElementById("admin-discount-percent")?.value || "";
    const plan =
        document.getElementById("admin-discount-plan")?.value || "standard";
    const duration =
        document.getElementById("admin-discount-duration")?.value || "";
    const maxUses =
        document.getElementById("admin-discount-max-uses")?.value || "";
    const from = document.getElementById("admin-discount-from")?.value || "";
    const until = document.getElementById("admin-discount-until")?.value || "";
    try {
        await fetchSuperAdminJson("/api/admin/discount-codes", {
            method: "POST",
            body: JSON.stringify({
                code,
                plan,
                discount_percent: percent,
                benefit_duration_days: duration,
                max_uses: maxUses || undefined,
                valid_from: from || undefined,
                valid_until: until || undefined,
            }),
        });
        window.ToastManager?.success?.(
            "Code créé",
            "Le code de réduction est actif.",
        );
        window.showToast?.("Code de réduction créé avec succès.", "success");
        document.getElementById("admin-discount-code").value = "";
        document.getElementById("admin-discount-percent").value = "";
        await fetchAdminDiscountCodes();
    } catch (error) {
        window.ToastManager?.error?.(
            "Erreur",
            error?.message || "Impossible de créer le code.",
        );
        window.showToast?.(
            error?.message || "Impossible de créer le code.",
            "error",
        );
    }
}

async function deactivateAdminDiscountCode(id) {
    try {
        await fetchSuperAdminJson(
            `/api/admin/discount-codes/${encodeURIComponent(id)}`,
            { method: "DELETE" },
        );
        await fetchAdminDiscountCodes();
    } catch (error) {
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de désactiver le code.",
        );
    }
}

async function confirmAdminSubscriptionPayment(paymentId) {
    if (!paymentId) return;

    const refValue =
        document.getElementById(`admin-sub-payment-ref-${paymentId}`)?.value ||
        "";
    const operatorValue =
        document.getElementById(`admin-sub-payment-operator-${paymentId}`)
            ?.value || "";
    const noteValue =
        document.getElementById(`admin-sub-payment-note-${paymentId}`)?.value ||
        "";

    try {
        const payload = await fetchSuperAdminJson(
            "/api/admin/subscription-payments/confirm",
            {
                method: "POST",
                body: JSON.stringify({
                    payment_id: paymentId,
                    transaction_ref_id: refValue.trim() || null,
                    operator_ref_id: operatorValue.trim() || null,
                    note: noteValue.trim() || null,
                }),
            },
        );

        if (payload?.user) {
            await refreshAdminSubscriptionRelatedViews(payload.user);
        }

        ToastManager?.success(
            "Paiement confirmé",
            "Le palier a été activé pour cet utilisateur.",
        );
        await fetchAdminSubscriptionPayments();
    } catch (error) {
        console.error("Confirmation paiement abonnement échouée:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de confirmer ce paiement.",
        );
    }
}

async function markAdminSubscriptionPaymentFailed(paymentId) {
    if (!paymentId) return;

    const noteValue =
        document.getElementById(`admin-sub-payment-note-${paymentId}`)?.value ||
        "";

    try {
        await fetchSuperAdminJson("/api/admin/subscription-payments/fail", {
            method: "POST",
            body: JSON.stringify({
                payment_id: paymentId,
                reason: noteValue.trim() || null,
            }),
        });
        ToastManager?.success(
            "Paiement classé",
            "Le paiement a été marqué comme non confirmé.",
        );
        await fetchAdminSubscriptionPayments();
    } catch (error) {
        console.error("Classement paiement abonnement échoué:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de mettre ce paiement à jour.",
        );
    }
}

function renderAdminWithdrawalRequestsList(items) {
    const container = document.getElementById("admin-withdrawal-requests-list");
    if (!container) return;

    if (!Array.isArray(items) || items.length === 0) {
        container.innerHTML = `
            <div class="verification-empty">
                Aucune demande de retrait en attente.
            </div>
`;
        return;
    }

    container.innerHTML = items
        .map((request) => {
            const safeId = escapeHtml(request.id || "");
            const user = request.user || {};
            const userName = escapeHtml(user.name || "Utilisateur");
            const userId = escapeHtml(request.creatorId || "");
            const provider = escapeHtml(
                request.providerLabel || request.provider || "Mobile Money",
            );
            const walletNumber = escapeHtml(request.walletNumber || "—");
            const accountName = escapeHtml(request.accountName || "—");
            const amountLabel = Number(request.amountUsd || 0).toLocaleString(
                "fr-FR",
                {
                    style: "currency",
                    currency: "USD",
                },
            );
            const currentPlan = escapeHtml(
                String(user.plan || "free").toUpperCase(),
            );
            const currentStatus = escapeHtml(user.plan_status || "inactive");
            const requestStatus = escapeHtml(request.status || "pending");
            const note = escapeHtml(request.note || "");
            const operatorRef = escapeHtml(request.operatorRefId || "");

            return `
                <div class="admin-card" style="border:1px solid var(--border-color); border-radius:12px; padding:0.95rem; background: var(--surface-color); display:flex; flex-direction:column; gap:0.75rem;">
                    <div style="display:flex; justify-content:space-between; gap:0.75rem; flex-wrap:wrap; align-items:flex-start;">
                        <div style="display:flex; flex-direction:column; gap:0.2rem; min-width:0;">
                            <strong style="font-size:1rem;">${userName}</strong>
                            <span style="color:var(--text-secondary); font-size:0.85rem; word-break:break-all;">${userId}</span>
                        </div>
                        <span class="admin-badge" style="align-self:flex-start;">${requestStatus}</span>
                    </div>

                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:0.6rem;">
                        <div>
                            <div style="font-size:0.8rem; color:var(--text-secondary);">Montant</div>
                            <div style="font-weight:600;">${amountLabel}</div>
                        </div>
                        <div>
                            <div style="font-size:0.8rem; color:var(--text-secondary);">Canal</div>
                            <div style="font-weight:600;">${provider}</div>
                        </div>
                        <div>
                            <div style="font-size:0.8rem; color:var(--text-secondary);">Compte</div>
                            <div style="font-weight:600;">${accountName}</div>
                            <div style="font-size:0.8rem; color:var(--text-secondary);">${walletNumber}</div>
                        </div>
                        <div>
                            <div style="font-size:0.8rem; color:var(--text-secondary);">Demandé le</div>
                            <div style="font-weight:600;">${formatAdminPaymentDate(request.requestedAt || request.createdAt)}</div>
                        </div>
                        <div>
                            <div style="font-size:0.8rem; color:var(--text-secondary);">Plan utilisateur</div>
                            <div style="font-weight:600;">${currentPlan} • ${currentStatus}</div>
                        </div>
                        <div>
                            <div style="font-size:0.8rem; color:var(--text-secondary);">Note créateur</div>
                            <div style="font-weight:600;">${note || "—"}</div>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:0.6rem;">
                        <input type="text" id="admin-withdrawal-ref-${safeId}" class="form-input" placeholder="Référence opérateur / transaction" value="${operatorRef}">
                        <input type="text" id="admin-withdrawal-note-${safeId}" class="form-input" placeholder="Note admin (optionnelle)" value="${escapeHtml(request.adminNote || "")}">
                    </div>

                    <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                        <button type="button" class="btn-verify" onclick="updateAdminWithdrawalRequestStatus('${safeId}', 'processing')">
                            Marquer en traitement
                        </button>
                        <button type="button" class="btn-verify" onclick="updateAdminWithdrawalRequestStatus('${safeId}', 'paid')">
                            Marquer payé
                        </button>
                        <button type="button" class="btn-cancel" onclick="updateAdminWithdrawalRequestStatus('${safeId}', 'rejected')">
                            Refuser
                        </button>
                    </div>
                </div>
            `;
        })
        .join("");
}

async function fetchAdminWithdrawalRequests() {
    const container = document.getElementById("admin-withdrawal-requests-list");
    if (!container) return;

    container.innerHTML = `<div class="loading-spinner"></div>`;
    try {
        const payload = await fetchSuperAdminJson(
            "/api/admin/withdrawal-requests?status=pending,processing&limit=50",
        );
        window.adminWithdrawalRequests = payload?.requests || [];
        renderAdminWithdrawalRequestsList(window.adminWithdrawalRequests);
    } catch (error) {
        console.error("Erreur chargement retraits admin:", error);
        container.innerHTML = `
            <div class="verification-empty">
                ${escapeHtml(error?.message || "Impossible de charger les retraits.")}
            </div>
`;
    }
}

async function updateAdminWithdrawalRequestStatus(requestId, status) {
    if (!requestId || !status) return;

    const operatorRef =
        document.getElementById(`admin-withdrawal-ref-${requestId}`)?.value ||
        "";
    const note =
        document.getElementById(`admin-withdrawal-note-${requestId}`)?.value ||
        "";

    try {
        await fetchSuperAdminJson("/api/admin/withdrawal-requests/status", {
            method: "POST",
            body: JSON.stringify({
                request_id: requestId,
                status,
                operator_ref_id: operatorRef.trim() || null,
                note: note.trim() || null,
            }),
        });

        const successLabel =
            status === "paid"
                ? "Retrait marqué payé."
                : status === "processing"
                  ? "Retrait marqué en traitement."
                  : "Retrait refusé.";
        ToastManager?.success("Retrait mis à jour", successLabel);
        await fetchAdminWithdrawalRequests();
    } catch (error) {
        console.error("Mise à jour retrait admin échouée:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de mettre à jour ce retrait.",
        );
    }
}

async function fetchFeedbackInbox() {
    const container = document.getElementById("admin-feedback-list");
    if (!container) return;

    if (!isSuperAdmin()) {
        container.innerHTML = `<p style="color: var(--text-secondary);">Accès refusé.</p>`;
        return;
    }

    container.innerHTML = `<div class="loading-spinner"></div>`;
    try {
        const { data, error } = await supabase
            .from("feedback_inbox")
            .select("id, created_at, mood, comment, sender_user_id")
            .eq("receiver_id", SUPER_ADMIN_ID)
            .order("created_at", { ascending: false })
            .limit(1000);
        if (error) throw error;
        container.dataset.feedbackExpanded = "false";
        renderFeedbackInboxList(data || []);
    } catch (err) {
        console.error("Erreur chargement feedback:", err);
        container.innerHTML = `<p style="color: var(--text-secondary);">Impossible de charger les feedbacks.</p>`;
    }
}

function renderFeedbackInboxList(items) {
    const container = document.getElementById("admin-feedback-list");
    if (!container) return;
    if (!items.length) {
        container.innerHTML = `<p style="color: var(--text-secondary);">Aucun feedback pour le moment.</p>`;
        return;
    }
    const isExpanded = container.dataset.feedbackExpanded === "true";
    const visibleItems = isExpanded ? items : items.slice(0, 3);
    const feedbackCards = visibleItems
        .map((fb) => {
            const mood = typeof fb.mood === "number" ? fb.mood : null;
            const moodLabel =
                mood === null
                    ? "—"
                    : mood >= 2
                      ? "🤩"
                      : mood === 1
                        ? "🙂"
                        : mood === 0
                          ? "😐"
                          : mood === -1
                            ? "😕"
                            : "😡";
            const safeComment = fb.comment
                ? fb.comment.replace(
                      /[<>&]/g,
                      (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c],
                  )
                : "<i>—</i>";
            const date = fb.created_at
                ? new Date(fb.created_at).toLocaleString()
                : "";
            const sender = fb.sender_user_id || "Anonyme";
            return `
                <div class="admin-card" style="border:1px solid var(--border-color); border-radius:12px; padding:0.9rem; background: var(--surface-color); display:flex; flex-direction:column; gap:0.35rem;">
                    <div style="display:flex; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
                        <span style="font-weight:700; display:flex; align-items:center; gap:0.4rem;">${moodLabel}<span style="color:var(--text-secondary); font-weight:500;">Satisfaction</span></span>
                        <span style="color:var(--text-secondary); font-size:0.9rem;">${date}</span>
                    </div>
                    <div style="color:var(--text-primary); line-height:1.45;">${safeComment}</div>
                    <div style="color:var(--text-secondary); font-size:0.9rem;">Sender: ${sender}</div>
                </div>
            `;
        })
        .join("");
    const remainingCount = items.length - visibleItems.length;
    const toggleLabel = isExpanded
        ? "Afficher seulement les 3 derniers"
        : `Afficher les ${remainingCount} autres feedbacks`;
    const toggleButton =
        items.length > 3
            ? `<button type="button" class="btn-verify admin-feedback-toggle" style="align-self:flex-start;">${toggleLabel}</button>`
            : "";

    container.innerHTML = feedbackCards + toggleButton;
    const toggle = container.querySelector(".admin-feedback-toggle");
    if (toggle) {
        toggle.addEventListener("click", () => {
            container.dataset.feedbackExpanded = String(!isExpanded);
            renderFeedbackInboxList(items);
        });
    }
}

async function fetchVerificationRequests() {
    if (!isVerificationAdmin()) {
        verificationRequests = [];
        return [];
    }

    try {
        const { data, error } = await supabase
            .from("verification_requests")
            .select(
                "id, user_id, type, status, created_at, users(id, name, avatar)",
            )
            .eq("status", "pending")
            .order("created_at", { ascending: false });

        if (error) throw error;
        verificationRequests = data || [];
        return verificationRequests;
    } catch (error) {
        console.error("Erreur récupération demandes vérification:", error);
        verificationRequests = [];
        return [];
    }
}

async function fetchUserPendingRequests(userId) {
    try {
        const { data, error } = await supabase
            .from("verification_requests")
            .select("type")
            .eq("user_id", userId)
            .eq("status", "pending");

        if (error) throw error;
        const types = new Set();
        (data || []).forEach((item) => types.add(item.type));
        return types;
    } catch (error) {
        console.error("Erreur récupération demandes utilisateur:", error);
        return new Set();
    }
}

function isVerificationAdmin() {
    return (
        !!window.currentUser &&
        (VERIFICATION_ADMIN_IDS.has(window.currentUser.id) || isSuperAdmin())
    );
}

function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value || "").trim(),
    );
}

async function resolveUserIdFlexible(input) {
    const raw = String(input || "").trim();
    if (!raw) {
        ToastManager?.error("User not found", "Empty field.");
        return null;
    }
    if (isUuid(raw)) return raw;

    // D'abord tenter localement (allUsers) pour éviter un échec RLS ou réseau
    const localMatch =
        (window.allUsers || []).find((u) =>
            (u.name || "").toLowerCase().includes(raw.toLowerCase()),
        ) || null;
    if (localMatch?.id) return localMatch.id;

    try {
        const { data, error } = await supabase
            .from("users")
            .select("id, name")
            .ilike("name", `%${raw}%`)
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        if (data?.id) return data.id;
        ToastManager?.error("User not found", `No profile for "${raw}"`);
        return null;
    } catch (error) {
        console.error("Erreur résolution utilisateur:", error);
        ToastManager?.error("Erreur", "Recherche utilisateur impossible");
        return null;
    }
}

function isVerifiedCreatorUserId(userId) {
    return verifiedCreatorUserIds.has(userId);
}

function isVerifiedStaffUserId(userId) {
    return verifiedStaffUserIds.has(userId);
}

function isCurrentUserVerified() {
    const userId = window.currentUser && window.currentUser.id;
    if (!userId) return false;
    return isVerifiedCreatorUserId(userId) || isVerifiedStaffUserId(userId);
}

function isPlanActiveByDate(user) {
    if (!user) return false;
    const status = String(user.plan_status || "").toLowerCase();
    if (status !== "active") return false;
    const planEnd = user.plan_ends_at || user.planEndsAt || null;
    if (!planEnd) return true;
    const endMs = Date.parse(planEnd);
    if (!Number.isFinite(endMs)) return true;
    return endMs > Date.now();
}

function hasActivePaidPlan(user) {
    if (!user) return false;
    const plan = String(user.plan || "").toLowerCase();
    if (!plan || plan === "free") return false;
    return isPlanActiveByDate(user);
}

function isGifUrl(value) {
    if (!value || typeof value !== "string") return false;
    const lower = value.toLowerCase();
    return lower.includes(".gif");
}

const GIF_SNAPSHOT_CACHE_KEY = "xera:gif:snapshots";
const GIF_SNAPSHOT_CACHE_MAX = 50;
const gifSnapshotCache = new Map();
const gifSnapshotInFlight = new Set();

function loadGifSnapshotCache() {
    if (gifSnapshotCache.size > 0) return;
    try {
        const raw = localStorage.getItem(GIF_SNAPSHOT_CACHE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        Object.entries(parsed || {}).forEach(([url, entry]) => {
            if (entry && entry.data) {
                gifSnapshotCache.set(url, entry);
            }
        });
    } catch (e) {
        // ignore cache errors
    }
}

function persistGifSnapshotCache() {
    try {
        const entries = Array.from(gifSnapshotCache.entries());
        if (entries.length > GIF_SNAPSHOT_CACHE_MAX) {
            entries
                .sort((a, b) => (a[1]?.ts || 0) - (b[1]?.ts || 0))
                .slice(0, entries.length - GIF_SNAPSHOT_CACHE_MAX)
                .forEach(([url]) => gifSnapshotCache.delete(url));
        }
        const payload = {};
        gifSnapshotCache.forEach((entry, url) => {
            payload[url] = entry;
        });
        localStorage.setItem(GIF_SNAPSHOT_CACHE_KEY, JSON.stringify(payload));
    } catch (e) {
        // ignore cache errors
    }
}

function getGifSnapshot(url) {
    if (!url) return null;
    loadGifSnapshotCache();
    const entry = gifSnapshotCache.get(url);
    return entry?.data || null;
}

function setGifSnapshot(url, dataUrl) {
    if (!url || !dataUrl) return;
    gifSnapshotCache.set(url, { data: dataUrl, ts: Date.now() });
    persistGifSnapshotCache();
}

function createGifSnapshot(url) {
    return new Promise((resolve) => {
        if (!url) return resolve(null);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                const width = img.naturalWidth || img.width;
                const height = img.naturalHeight || img.height;
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                if (!ctx) return resolve(null);
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL("image/png");
                return resolve(dataUrl);
            } catch (err) {
                return resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

function queueGifSnapshot(userId, field, url) {
    if (!userId || !url || !isGifUrl(url)) return;
    if (gifSnapshotInFlight.has(url)) return;
    gifSnapshotInFlight.add(url);
    createGifSnapshot(url)
        .then((dataUrl) => {
            if (!dataUrl) return;
            setGifSnapshot(url, dataUrl);
            applyUserUpdateToCache({ id: userId, [field]: dataUrl });

            if (field === "avatar" && window.currentUser?.id === userId) {
                setNavProfileAvatar(dataUrl, userId);
            }

            if (
                window.currentProfileViewed &&
                window.currentProfileViewed === userId &&
                document.querySelector("#profile.active")
            ) {
                renderProfileIntoContainer(userId);
            } else if (document.querySelector(".discover-grid")) {
                renderDiscoverGrid();
            }
        })
        .finally(() => {
            gifSnapshotInFlight.delete(url);
        });
}

function canUseGifProfile() {
    const userId = window.currentUser && window.currentUser.id;
    const profile = userId ? getUser(userId) : null;
    return hasActivePaidPlan(profile);
}

function sanitizeUserMedia(user) {
    if (!user) return user;
    if (hasActivePaidPlan(user)) return user;
    const sanitized = { ...user };
    if (isGifUrl(sanitized.avatar)) {
        const snapshot = getGifSnapshot(sanitized.avatar);
        if (snapshot) {
            sanitized.avatar = snapshot;
        } else {
            queueGifSnapshot(user.id, "avatar", sanitized.avatar);
        }
    }
    if (isGifUrl(sanitized.banner)) {
        const snapshot = getGifSnapshot(sanitized.banner);
        if (snapshot) {
            sanitized.banner = snapshot;
        } else {
            queueGifSnapshot(user.id, "banner", sanitized.banner);
        }
    }
    return sanitized;
}

const PROFILE_THEME_PRESETS = {
    xera: {
        label: "XERA",
        accent: "#10b981",
        secondary: "#f59e0b",
    },
    aurora: {
        label: "Aurora",
        accent: "#14b8a6",
        secondary: "#8b5cf6",
    },
    ember: {
        label: "Ember",
        accent: "#f97316",
        secondary: "#ef4444",
    },
    ocean: {
        label: "Ocean",
        accent: "#38bdf8",
        secondary: "#2563eb",
    },
    mono: {
        label: "Mono",
        accent: "#e5e7eb",
        secondary: "#71717a",
    },
};

const DEFAULT_PROFILE_PREFERENCES = {
    appearance: {
        theme: "xera",
        accent: "#10b981",
        secondary: "#f59e0b",
        layout: "balanced",
        bannerStyle: "cover",
        panelStyle: "glass",
    },
    privacy: {
        visibility: "public",
        discoverable: true,
        showStats: true,
        showSocials: true,
        showActivity: true,
        allowMessages: "everyone",
    },
};

function sanitizeHexColor(value, fallback = "#10b981") {
    const raw = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : fallback;
}

function hexToRgbString(value, fallback = "#10b981") {
    const hex = sanitizeHexColor(value, fallback).slice(1);
    const parts = [0, 2, 4].map((index) =>
        parseInt(hex.slice(index, index + 2), 16),
    );
    return parts.join(", ");
}

function normalizeProfilePreferences(rawPreferences) {
    let raw = rawPreferences || {};
    if (typeof raw === "string") {
        raw = safeJsonParse(raw, {});
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        raw = {};
    }

    const rawAppearance = raw.appearance || {};
    const theme = PROFILE_THEME_PRESETS[rawAppearance.theme]
        ? rawAppearance.theme
        : DEFAULT_PROFILE_PREFERENCES.appearance.theme;
    const preset = PROFILE_THEME_PRESETS[theme] || PROFILE_THEME_PRESETS.xera;
    const layout = ["balanced", "showcase", "compact"].includes(
        rawAppearance.layout,
    )
        ? rawAppearance.layout
        : DEFAULT_PROFILE_PREFERENCES.appearance.layout;
    const bannerStyle = ["cover", "contain", "soft"].includes(
        rawAppearance.bannerStyle,
    )
        ? rawAppearance.bannerStyle
        : DEFAULT_PROFILE_PREFERENCES.appearance.bannerStyle;
    const panelStyle = ["glass", "solid", "minimal"].includes(
        rawAppearance.panelStyle,
    )
        ? rawAppearance.panelStyle
        : DEFAULT_PROFILE_PREFERENCES.appearance.panelStyle;

    const rawPrivacy = raw.privacy || {};
    const visibility = ["public", "followers", "private"].includes(
        rawPrivacy.visibility,
    )
        ? rawPrivacy.visibility
        : DEFAULT_PROFILE_PREFERENCES.privacy.visibility;
    const allowMessages = ["everyone", "followers", "none"].includes(
        rawPrivacy.allowMessages,
    )
        ? rawPrivacy.allowMessages
        : DEFAULT_PROFILE_PREFERENCES.privacy.allowMessages;

    return {
        appearance: {
            theme,
            accent: sanitizeHexColor(rawAppearance.accent, preset.accent),
            secondary: sanitizeHexColor(
                rawAppearance.secondary,
                preset.secondary,
            ),
            layout,
            bannerStyle,
            panelStyle,
        },
        privacy: {
            visibility,
            discoverable: rawPrivacy.discoverable !== false,
            showStats: rawPrivacy.showStats !== false,
            showSocials: rawPrivacy.showSocials !== false,
            showActivity: rawPrivacy.showActivity !== false,
            allowMessages,
        },
    };
}

function getRawProfilePreferences(user) {
    if (!user) return {};
    return (
        user.profile_preferences ||
        user.profilePreferences ||
        user.social_links?._profile_preferences ||
        user.socialLinks?._profile_preferences ||
        {}
    );
}

function getUserProfilePreferences(user) {
    return normalizeProfilePreferences(getRawProfilePreferences(user));
}

function getProfileAppearanceClass(preferences) {
    const appearance =
        normalizeProfilePreferences(preferences).appearance ||
        DEFAULT_PROFILE_PREFERENCES.appearance;
    return [
        `profile-theme-${appearance.theme}`,
        `profile-layout-${appearance.layout}`,
        `profile-banner-${appearance.bannerStyle}`,
        `profile-panel-${appearance.panelStyle}`,
    ].join(" ");
}

function getProfileAppearanceStyle(preferences) {
    const appearance = normalizeProfilePreferences(preferences).appearance;
    const accent = sanitizeHexColor(appearance.accent);
    const secondary = sanitizeHexColor(appearance.secondary, "#f59e0b");
    return [
        `--profile-accent:${accent}`,
        `--profile-accent-rgb:${hexToRgbString(accent)}`,
        `--profile-accent-2:${secondary}`,
        `--profile-accent-2-rgb:${hexToRgbString(secondary, "#f59e0b")}`,
    ].join(";");
}

function getCheckedSettingValue(name, fallback) {
    return (
        document.querySelector(`input[name="${name}"]:checked`)?.value ||
        fallback
    );
}

function collectProfilePreferencesFromSettings() {
    const current = getUserProfilePreferences(
        getUser(window.currentUserId || window.currentUser?.id),
    );
    return normalizeProfilePreferences({
        appearance: {
            theme: getCheckedSettingValue(
                "setting-profile-theme",
                current.appearance.theme,
            ),
            accent: document.getElementById("setting-profile-accent")?.value,
            secondary: document.getElementById("setting-profile-secondary")
                ?.value,
            layout: getCheckedSettingValue(
                "setting-profile-layout",
                current.appearance.layout,
            ),
            bannerStyle: getCheckedSettingValue(
                "setting-profile-banner-style",
                current.appearance.bannerStyle,
            ),
            panelStyle: getCheckedSettingValue(
                "setting-profile-panel-style",
                current.appearance.panelStyle,
            ),
        },
        privacy: {
            visibility: getCheckedSettingValue(
                "setting-profile-visibility",
                current.privacy.visibility,
            ),
            discoverable:
                document.getElementById("setting-profile-discoverable")
                    ?.checked !== false,
            showStats:
                document.getElementById("setting-profile-show-stats")
                    ?.checked !== false,
            showSocials:
                document.getElementById("setting-profile-show-socials")
                    ?.checked !== false,
            showActivity:
                document.getElementById("setting-profile-show-activity")
                    ?.checked !== false,
            allowMessages:
                document.getElementById("setting-profile-allow-messages")
                    ?.value || current.privacy.allowMessages,
        },
    });
}

function initializeProfileCustomizationControls(container) {
    if (!container) return;
    const preview = container.querySelector("#profile-customization-preview");
    const syncPreview = () => {
        if (!preview) return;
        const prefs = collectProfilePreferencesFromSettings();
        preview.className = `profile-customization-preview ${getProfileAppearanceClass(prefs)}`;
        preview.setAttribute("style", getProfileAppearanceStyle(prefs));
    };

    container
        .querySelectorAll(
            'input[name^="setting-profile-"], #setting-profile-accent, #setting-profile-secondary, #setting-profile-discoverable, #setting-profile-show-stats, #setting-profile-show-socials, #setting-profile-show-activity, #setting-profile-allow-messages',
        )
        .forEach((control) => {
            control.addEventListener("change", () => {
                if (
                    control.name === "setting-profile-theme" &&
                    control.checked
                ) {
                    const preset = PROFILE_THEME_PRESETS[control.value];
                    const accentInput = container.querySelector(
                        "#setting-profile-accent",
                    );
                    const secondaryInput = container.querySelector(
                        "#setting-profile-secondary",
                    );
                    if (preset && accentInput && secondaryInput) {
                        accentInput.value = preset.accent;
                        secondaryInput.value = preset.secondary;
                    }
                }
                syncPreview();
            });
            control.addEventListener("input", syncPreview);
        });
    syncPreview();
}

function shouldShowProfileToViewerSync(
    user,
    viewerId,
    followedSet = new Set(),
) {
    if (!user) return false;
    if (viewerId && user.id === viewerId) return true;
    if (typeof isSuperAdmin === "function" && isSuperAdmin()) return true;

    const privacy = getUserProfilePreferences(user).privacy;
    if (privacy.discoverable === false) return false;
    if (privacy.visibility === "private") return false;
    if (privacy.visibility === "followers") {
        return viewerId ? followedSet.has(user.id) : false;
    }
    return true;
}

async function canViewerAccessProfile(user, viewerId) {
    if (!user) return false;
    if (viewerId && user.id === viewerId) return true;
    if (typeof isSuperAdmin === "function" && isSuperAdmin()) return true;

    const privacy = getUserProfilePreferences(user).privacy;
    if (privacy.visibility === "public") return true;
    if (privacy.visibility === "private") return false;
    if (!viewerId) return false;

    try {
        return await isFollowing(viewerId, user.id);
    } catch (error) {
        console.error("Erreur verification confidentialite profil:", error);
        return false;
    }
}

function canCurrentUserMessageTarget(targetUserId) {
    const target = getUser(targetUserId);
    const viewerId = window.currentUserId || window.currentUser?.id || null;
    if (!target || !viewerId || viewerId === targetUserId) return true;
    const privacy = getUserProfilePreferences(target).privacy;
    if (privacy.allowMessages === "none") return false;
    if (privacy.allowMessages === "followers") {
        return Boolean(followedUserIdsCache?.has?.(targetUserId));
    }
    return true;
}

async function canCurrentUserMessageTargetAsync(targetUserId) {
    const target = getUser(targetUserId);
    const viewerId = window.currentUserId || window.currentUser?.id || null;
    if (!target || !viewerId || viewerId === targetUserId) return true;
    const privacy = getUserProfilePreferences(target).privacy;
    if (privacy.allowMessages === "none") return false;
    if (privacy.allowMessages === "followers") {
        try {
            return await isFollowing(viewerId, targetUserId);
        } catch (error) {
            console.error("Erreur confidentialite messages:", error);
            return false;
        }
    }
    return true;
}

function renderProfilePrivacyNotice(user, preferences) {
    const prefs = normalizeProfilePreferences(preferences);
    const version = encodeURIComponent(
        user.updated_at || user.updatedAt || Date.now(),
    );
    const safeBanner =
        user.banner &&
        (user.banner.startsWith("http") || user.banner.startsWith("data:"))
            ? user.banner
            : null;
    const safeAvatar =
        user.avatar &&
        (user.avatar.startsWith("http") || user.avatar.startsWith("data:"))
            ? user.avatar
            : "https://placehold.co/150";
    const visibilityLabel =
        prefs.privacy.visibility === "followers"
            ? "Reserve aux abonnes"
            : "Profil prive";
    const followCtaHtml =
        prefs.privacy.visibility === "followers" &&
        window.currentUserId &&
        window.currentUserId !== user.id
            ? `<button class="btn-secondary profile-privacy-follow" onclick="toggleFollow('${window.currentUserId}', '${user.id}')">Suivre pour demander l'acces</button>`
            : "";

    return `
<div class="profile-hero profile-hero--glam profile-privacy-locked ${getProfileAppearanceClass(prefs)}" style="${getProfileAppearanceStyle(prefs)}">
            <div class="profile-hero-glow" aria-hidden="true"></div>
            ${
                safeBanner
                    ? `<div class="profile-banner-frame"><img src="${withCacheBust(safeBanner, version)}" class="profile-banner" alt="Banniere de ${escapeHtml(user.name)}" onerror="this.style.display='none'"></div>`
                    : `<div class="profile-banner-frame profile-banner-frame--empty"></div>`
            }
            <div class="profile-privacy-card">
                <img src="${withCacheBust(safeAvatar, version)}" class="profile-avatar-img" alt="Avatar de ${escapeHtml(user.name)}">
                <div class="profile-privacy-copy">
                    <span class="profile-section-kicker">${visibilityLabel}</span>
                    <h2>${renderUsernameForProfile(user.name, user.id)}</h2>
                    <p>Ce profil limite l'acces a ses details publics.</p>
                    ${followCtaHtml}
                </div>
            </div>
</div>
    `;
}

function renderProfileHiddenSection(kind = "activity") {
    const title =
        kind === "stats"
            ? "Signaux masques"
            : kind === "socials"
              ? "Liens masques"
              : "Activite masquee";
    const message =
        kind === "stats"
            ? "Cet utilisateur ne partage pas ses statistiques publiques."
            : kind === "socials"
              ? "Cet utilisateur ne partage pas ses liens publics."
              : "Cet utilisateur garde ses projets et mises a jour hors du profil public.";
    return `
<div class="profile-privacy-muted">
            <span class="profile-section-kicker">${title}</span>
            <p>${message}</p>
</div>
    `;
}

function isAmbassadorUserId(userId) {
    if (!userId) return false;
    const user = getUser(userId) || {};
    return (
        String(user.badge || user.user_metadata?.badge || "").toLowerCase() ===
        "ambassador"
    );
}

function applyUserUpdateToCache(user) {
    if (!user) return null;
    const sanitized = sanitizeUserMedia(user);
    const idx = allUsers.findIndex((u) => u.id === user.id);
    if (idx !== -1) {
        allUsers[idx] = { ...allUsers[idx], ...sanitized };
    } else {
        allUsers.push(sanitized);
    }
    if (window.currentUser && window.currentUser.id === user.id) {
        window.currentUser = { ...window.currentUser, ...sanitized };
        updateMonetizationNavButton(true);
    }
    try {
        if (Array.isArray(allUsers) && allUsers.length > 0) {
            localStorage.setItem(
                XERA_CACHE_USERS_KEY,
                JSON.stringify(allUsers),
            );
        }
    } catch (e) {
        /* ignore */
    }
    return sanitized;
}

function normalizeGiftPlan(value) {
    const normalized = String(value || "").toLowerCase();
    if (["standard", "medium", "pro"].includes(normalized)) {
        return normalized;
    }
    return null;
}

async function requestAdminGiftPlan(userId, planValue) {
    if (!userId || !planValue) return null;
    if (!isSuperAdmin()) return null;

    const okOnline = await ensureOnlineOrNotify();
    if (!okOnline) throw new Error("Hors connexion.");

    const sessionCheck = await ensureFreshSupabaseSession();
    if (!sessionCheck.ok) {
        throw sessionCheck.error || new Error("Session invalide.");
    }

    const {
        data: { session },
        error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
        throw new Error("Session invalide. Reconnectez-vous.");
    }

    const apiBase = resolveApiBaseUrl();
    if (!apiBase) {
        throw new Error("Adresse API introuvable.");
    }

    const response = await fetch(`${apiBase}/api/admin/gift-plan`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
            target_user_id: userId,
            plan: planValue,
        }),
    });

    let payload = {};
    try {
        payload = await response.json();
    } catch (e) {
        payload = {};
    }
    if (!response.ok) {
        throw new Error(
            payload?.error || "Impossible d'offrir le plan via l'API.",
        );
    }

    return payload?.user || null;
}

async function applyGiftPlanToUser(userId, planValue) {
    const plan = normalizeGiftPlan(planValue);
    if (!userId || !plan) return null;

    const badgeValue = plan === "pro" ? "verified_gold" : "verified";
    const protectedBadges = new Set([
        "staff",
        "team",
        "community",
        "company",
        "enterprise",
        "ambassador",
    ]);

    let badgeToApply = badgeValue;
    try {
        const { data: profile } = await supabase
            .from("users")
            .select("badge")
            .eq("id", userId)
            .maybeSingle();
        const existingBadge = String(profile?.badge || "").toLowerCase();
        if (plan !== "pro" && protectedBadges.has(existingBadge)) {
            badgeToApply = profile?.badge || badgeValue;
        }
    } catch (e) {
        // Si la lecture échoue, garder le badge plan par défaut
    }

    const isMonetized = ["medium", "pro"].includes(plan);
    if (isSuperAdmin()) {
        try {
            const serverUser = await requestAdminGiftPlan(userId, plan);
            if (serverUser) {
                applyUserUpdateToCache(serverUser);
                return serverUser;
            }
        } catch (error) {
            console.warn(
                "Admin gift plan API failed, fallback client update.",
                error,
            );
        }
    }

    const updates = {
        plan,
        plan_status: "active",
        plan_ends_at: null,
        badge: badgeToApply,
        is_monetized: isMonetized,
        updated_at: new Date().toISOString(),
        advanced_profile_customization: false,
        priority_recommendations: false,
        full_profile_customization: false,
        hd_streaming: false,
        private_live: false,
        advanced_collab_tools: false,
        realtime_analytics: false,
        data_export: false,
        maximum_visibility: false,
    };

    // Application automatique des avantages locaux (fallback ou direct)
    if (plan === "medium") {
        updates.advanced_profile_customization = true;
        updates.priority_recommendations = true;
    } else if (plan === "pro") {
        updates.advanced_profile_customization = true;
        updates.priority_recommendations = true;
        updates.full_profile_customization = true;
        updates.hd_streaming = true;
        updates.private_live = true;
        updates.advanced_collab_tools = true;
        updates.realtime_analytics = true;
        updates.data_export = true;
        updates.maximum_visibility = true;
    }

    const { data, error } = await supabase
        .from("users")
        .update(updates)
        .eq("id", userId)
        .select()
        .single();

    if (error) throw error;

    if (data) {
        applyUserUpdateToCache(data);
    }

    return data || null;
}

function renderAmbassadorBadgeById(userId) {
    if (!isAmbassadorUserId(userId)) return "";
    return `<img src="icons/embassadeur.svg?v=${BADGE_ASSET_VERSION}" alt="Ambassadeur" class="username-badge">`;
}

function normalizeDiscoveryAccountRole(value) {
    const raw = String(value || "")
        .trim()
        .toLowerCase();
    if (raw === "recruiter" || raw === "recruteur") return "recruiter";
    if (raw === "investor" || raw === "investisseur") return "investor";
    return "fan";
}

function isManagedDiscoveryAccountRole(value) {
    const raw = String(value || "")
        .trim()
        .toLowerCase();
    return (
        !raw ||
        raw === "fan" ||
        raw === "recruiter" ||
        raw === "recruteur" ||
        raw === "investor" ||
        raw === "investisseur"
    );
}

function getDiscoveryAccountRoleMeta(value) {
    const role = normalizeDiscoveryAccountRole(value);
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
    return {
        role: "fan",
        label: "Fan",
        icon: null,
    };
}

function renderProfileRoleBadgeByUser(user) {
    const roleMeta = getDiscoveryAccountRoleMeta(
        user?.account_subtype ||
            user?.accountSubtype ||
            user?.user_metadata?.account_subtype ||
            "fan",
    );
    if (!roleMeta.icon) return "";
    return `
<div class="profile-role-badge profile-role-badge--${roleMeta.role}" title="Type de compte: ${roleMeta.label}">
            <img src="${roleMeta.icon}?v=${BADGE_ASSET_VERSION}" alt="${roleMeta.label}">
            <span>${roleMeta.label}</span>
</div>
    `;
}

function renderVerificationBadgeById(userId) {
    const user = getUser(userId) || {};

    const badgeValue = user.badge ? String(user.badge).toLowerCase() : "";
    const planActive = isPlanActiveByDate(user);
    const planBadgeRequested =
        planActive &&
        (badgeValue === "verified" ||
            badgeValue === "verified_gold" ||
            badgeValue === "gold" ||
            badgeValue === "pro");
    const hasGoldBadge =
        planActive &&
        (badgeValue === "verified_gold" ||
            badgeValue === "gold" ||
            badgeValue === "pro");
    const accountTypeValue = String(
        user.account_type || user.user_metadata?.account_type || "personal",
    ).toLowerCase();

    const isPersonalAccount = accountTypeValue === "personal";
    const isOrgAccount =
        accountTypeValue === "team" ||
        accountTypeValue === "enterprise" ||
        accountTypeValue === "company" ||
        accountTypeValue === "community" ||
        accountTypeValue === "organization" ||
        accountTypeValue === "organisation" ||
        accountTypeValue === "org";

    const orgRequested =
        badgeValue === "staff" ||
        badgeValue === "team" ||
        badgeValue === "community" ||
        badgeValue === "company" ||
        badgeValue === "enterprise";

    const personalRequested =
        planBadgeRequested ||
        badgeValue === "creator" ||
        badgeValue === "personal" ||
        accountTypeValue === "creator" ||
        accountTypeValue === "verified";

    const isStaffListed = isVerifiedStaffUserId(userId);
    const isCreatorListed = isVerifiedCreatorUserId(userId);

    // Priorité : type de compte personal bloque les badges d'équipe même si listé staff
    if (isPersonalAccount) {
        if (hasGoldBadge) {
            return `<img src="icons/verify-personal-gold.svg?v=${BADGE_ASSET_VERSION}" alt="Créateur vérifié Gold" class="verification-badge">`;
        }
        if (isCreatorListed || personalRequested) {
            return `<img src="icons/verify-personal.svg?v=${BADGE_ASSET_VERSION}" alt="Créateur vérifié" class="verification-badge">`;
        }
        // Compte perso sans vérification => pas de badge
        return "";
    }

    // Comptes non personnels
    if (isStaffListed || orgRequested || isOrgAccount) {
        return `<img src="icons/verify-com.svg?v=${BADGE_ASSET_VERSION}" alt="Équipe vérifiée" class="verification-badge">`;
    }
    if (hasGoldBadge) {
        return `<img src="icons/verify-personal-gold.svg?v=${BADGE_ASSET_VERSION}" alt="Créateur vérifié Gold" class="verification-badge">`;
    }
    if (isCreatorListed || personalRequested) {
        return `<img src="icons/verify-personal.svg?v=${BADGE_ASSET_VERSION}" alt="Créateur vérifié" class="verification-badge">`;
    }
    if (badgeValue === "ambassador") {
        return renderAmbassadorBadgeById(userId);
    }

    return "";
}

function renderVerificationBadgeOnly(userId) {
    const verificationHtml = renderVerificationBadgeById(userId);
    if (!verificationHtml) return "";
    return `<div class="badge-container">${verificationHtml}</div>`;
}

function renderVerifiedPageBadge(pageId) {
    if (
        !pageId ||
        typeof window.isVerifiedPageId !== "function" ||
        !window.isVerifiedPageId(pageId)
    ) {
        return "";
    }
    return `<img src="icons/verify_page.svg" alt="Page vérifiée" class="verification-badge page-verification-badge">`;
}

function renderVerifiedPageName(nameHtml, pageId) {
    if (!nameHtml) return "";
    const badgeHtml = renderVerifiedPageBadge(pageId);
    if (!badgeHtml) return nameHtml;
    return `<span class="username-with-badge username-with-page-badge">${nameHtml}${badgeHtml}</span>`;
}

function renderUsernameForProfile(nameHtml, userId) {
    if (!nameHtml) return "";
    const labelHtml = wrapUsernameLabel(nameHtml);
    const verificationHtml = renderVerificationBadgeById(userId);
    if (verificationHtml) {
        return `<span class="username-with-badge">${labelHtml}${verificationHtml}</span>`;
    }
    return renderUsernameWithBadge(nameHtml, userId);
}

function renderCertificationsHtml(certs) {
    if (!certs || certs.length === 0) return "";

    return certs
        .map((cert) => {
            const page = cert.page;
            if (!page) return "";

            const logo = page.avatar_url || "icons/enterprise.svg";
            const label =
                cert.type === "student"
                    ? "Certifié par :"
                    : `${cert.title || "Membre"} :`;

            return `
            <div class="profile-certification-item" style="display: flex; align-items: center; gap: 8px; margin-top: 6px; padding: 4px 0;">
                <span style="font-size: 0.9rem; color: var(--text-secondary);">${label}</span>
                <div class="pro-page-link" onclick="navigateToProPage('${page.slug}')" style="display: flex; align-items: center; gap: 6px; cursor: pointer; background: rgba(var(--primary-rgb), 0.05); padding: 4px 10px; border-radius: 20px; border: 1px solid rgba(var(--primary-rgb), 0.1); transition: all 0.2s;">
                    <img src="${logo}" style="width: 20px; height: 20px; border-radius: 4px; object-fit: cover; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" alt="${page.name}">
                    <span style="font-weight: 600; color: var(--primary-color); font-size: 0.9rem;">${renderVerifiedPageName(page.name, page.id)}</span>
                </div>
            </div>
        `;
        })
        .join("");
}

function wrapUsernameLabel(nameHtml) {
    if (!nameHtml) return "";
    const normalizedName = String(nameHtml);

    // Anti-débordement : adapter la taille et la graisse au nombre de caractères
    // On nettoie les tags HTML pour mesurer uniquement la longueur du texte
    const textOnly = normalizedName.replace(/<[^>]*>?/gm, "");
    const len = textOnly.length;

    let adaptiveStyle = "";
    if (len > 25) {
        adaptiveStyle =
            "font-size: 0.52em; font-weight: 500; letter-spacing: -0.02em;";
    } else if (len > 18) {
        adaptiveStyle =
            "font-size: 0.72em; font-weight: 600; letter-spacing: -0.01em;";
    } else if (len > 14) {
        adaptiveStyle = "font-size: 0.88em; font-weight: 700;";
    }

    const styleAttr = adaptiveStyle ? ` style="${adaptiveStyle}"` : "";

    if (normalizedName.includes('class="username-label"')) {
        return normalizedName.replace(
            'class="username-label"',
            `class="username-label"${styleAttr}`,
        );
    }
    return `<span class="username-label"${styleAttr}>${normalizedName}</span>`;
}

function renderUsernameWithBadge(nameHtml, userId, isPage = false) {
    if (!nameHtml) return "";
    const labelHtml = wrapUsernameLabel(nameHtml);

    if (isPage) {
        return renderVerifiedPageName(labelHtml, userId);
    }

    const verificationHtml = renderVerificationBadgeById(userId);
    if (verificationHtml) {
        return `<span class="username-with-badge">${labelHtml}${verificationHtml}</span>`;
    }
    const badgeHtml = renderAmbassadorBadgeById(userId);
    if (!badgeHtml) return labelHtml; // Retourne toujours le label wrappé pour l'adaptation du style
    return `<span class="username-with-badge">${labelHtml}${badgeHtml}</span>`;
}

function maybeShowAmbassadorWelcome(userId) {
    return;
}

async function requestVerification(type) {
    if (!window.currentUser || !window.ToastManager) return;
    const userId = window.currentUser.id;
    window._verificationRequestLocks =
        window._verificationRequestLocks || new Set();
    if (window._verificationRequestLocks.has(type)) {
        ToastManager.info(
            "Demande en cours",
            "Nous traitons déjà votre demande de vérification.",
        );
        return;
    }

    const pendingTypes = await fetchUserPendingRequests(userId);
    if (pendingTypes.has(type)) {
        ToastManager.info(
            "Demande déjà envoyée",
            "Nous avons bien reçu votre demande.",
        );
        return;
    }

    window._verificationRequestLocks.add(type);
    const disableButtons = (state) => {
        const btn = document.getElementById(`btn-verify-${type}`);
        if (btn) {
            btn.disabled = state;
            btn.classList.toggle("is-pending", state);
        }
        const generic = document.querySelector(
            `.btn-verify[data-type="${type}"]`,
        );
        if (generic) {
            generic.disabled = state;
            generic.classList.toggle("is-pending", state);
        }
    };
    disableButtons(true);

    try {
        const { error } = await supabase.from("verification_requests").insert({
            user_id: userId,
            type: type,
            status: "pending",
        });

        if (error) throw error;
        ToastManager.success(
            "Demande envoyée",
            "Votre demande de vérification a été enregistrée.",
        );
    } catch (error) {
        console.error("Erreur demande vérification:", error);
        ToastManager.error(
            "Erreur",
            error?.message || "Impossible d'envoyer la demande.",
        );
        window._verificationRequestLocks.delete(type);
        disableButtons(false);
        return;
    }

    if (
        document.getElementById("settings-modal")?.classList.contains("active")
    ) {
        openSettings(userId);
    }

    // Rester verrouillé (une seule demande) tant que l'admin n'a pas répondu
    // Rien à faire ici : le lock reste en mémoire jusqu'au refresh.
}

async function addVerifiedUserId(type, userId, planValue = null) {
    if (!userId) return;
    const cleanId = await resolveUserIdFlexible(userId);
    if (!cleanId) return;

    try {
        const shouldApplyPlan = isSuperAdmin() && normalizeGiftPlan(planValue);
        if (shouldApplyPlan) {
            const giftedUser = await applyGiftPlanToUser(cleanId, planValue);
            if (!giftedUser) {
                throw new Error(
                    "Le plan n'a pas pu être attribué au bénéficiaire.",
                );
            }
        }

        const { error } = await supabase.from("verified_badges").upsert(
            {
                user_id: cleanId,
                type: type,
            },
            { onConflict: "user_id,type" },
        );

        if (error) throw error;

        await supabase
            .from("verification_requests")
            .update({ status: "approved" })
            .eq("user_id", cleanId)
            .eq("type", type)
            .eq("status", "pending");

        await fetchVerifiedBadges();
        if (
            window.currentProfileViewed === cleanId &&
            typeof renderProfileIntoContainer === "function"
        ) {
            renderProfileIntoContainer(cleanId);
        }

        if (window.ToastManager) {
            ToastManager.success(
                shouldApplyPlan ? "Plan attribué" : "Badge appliqué",
                shouldApplyPlan
                    ? "Le plan et ses avantages ont été activés pour le bénéficiaire."
                    : "La vérification a été accordée.",
            );
        }
    } catch (error) {
        console.error("Erreur validation badge:", error);
        if (window.ToastManager) {
            ToastManager.error(
                "Erreur",
                error?.message || "Impossible d'appliquer la vérification.",
            );
        }
    }

    if (
        document
            .getElementById("settings-modal")
            ?.classList.contains("active") &&
        window.currentUser
    ) {
        openSettings(window.currentUser.id);
    }
}

async function removeVerifiedUserId(type, userId) {
    if (!userId) return;
    const cleanId = await resolveUserIdFlexible(userId);
    if (!cleanId) return;

    try {
        const { error } = await supabase
            .from("verified_badges")
            .delete()
            .eq("user_id", cleanId)
            .eq("type", type);

        if (error) throw error;

        await fetchVerifiedBadges();
        if (
            window.currentProfileViewed === cleanId &&
            typeof renderProfileIntoContainer === "function"
        ) {
            renderProfileIntoContainer(cleanId);
        }

        if (window.ToastManager) {
            ToastManager.success(
                "Badge retiré",
                "La vérification a été retirée.",
            );
        }
    } catch (error) {
        console.error("Erreur retrait badge:", error);
        if (window.ToastManager) {
            ToastManager.error(
                "Erreur",
                error?.message || "Impossible de retirer la vérification.",
            );
        }
    }
}

async function handleVerificationSelection(action) {
    const modal = document.getElementById("settings-modal");
    if (!modal) return;

    const checked = modal.querySelectorAll(
        ".verification-request-check:checked",
    );
    if (!checked.length) return;

    const toProcess = Array.from(checked).map((input) => ({
        userId: input.dataset.userId,
        type: input.dataset.type,
    }));
    const bulkPlanInput = modal.querySelector("#verify-bulk-plan");
    const bulkPlanValue = bulkPlanInput ? bulkPlanInput.value : null;

    try {
        if (action === "approve") {
            await Promise.all(
                toProcess.map((item) => {
                    return supabase
                        .from("verified_badges")
                        .upsert(
                            { user_id: item.userId, type: item.type },
                            { onConflict: "user_id,type" },
                        );
                }),
            );

            if (isSuperAdmin() && normalizeGiftPlan(bulkPlanValue)) {
                await Promise.all(
                    toProcess.map((item) =>
                        applyGiftPlanToUser(item.userId, bulkPlanValue),
                    ),
                );
            }
        }

        await Promise.all(
            toProcess.map((item) => {
                return supabase
                    .from("verification_requests")
                    .update({
                        status: action === "approve" ? "approved" : "rejected",
                    })
                    .eq("user_id", item.userId)
                    .eq("type", item.type)
                    .eq("status", "pending");
            }),
        );

        await fetchVerifiedBadges();
        await fetchVerificationRequests();

        if (window.ToastManager) {
            ToastManager.success(
                "Mise à jour",
                action === "approve"
                    ? "Vérifications accordées."
                    : "Demandes refusées.",
            );
        }
    } catch (error) {
        console.error("Erreur mise à jour vérifications:", error);
        if (window.ToastManager) {
            ToastManager.error(
                "Erreur",
                error?.message ||
                    "Impossible de mettre à jour les vérifications.",
            );
        }
    }

    if (window.currentUser) {
        openSettings(window.currentUser.id);
    }
}

/* ========================================
   SUPER ADMIN - MODÉRATION
   ======================================== */

async function banUserByAdmin(targetUserId, durationHours, reason) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return;
    }
    const cleanId = await resolveUserIdFlexible(targetUserId);
    if (!cleanId) return;

    const hours = Math.max(1, parseInt(durationHours, 10) || 0);
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const cleanReason = String(reason || "").trim();

    try {
        const { error } = await supabase
            .from("users")
            .update({
                banned_until: until,
                banned_reason: cleanReason || null,
                banned_by: window.currentUser?.id || null,
                banned_at: new Date().toISOString(),
            })
            .eq("id", cleanId);

        if (error) throw error;
        ToastManager?.success(
            "Utilisateur banni",
            `Bannissement actif pour ${hours}h.`,
        );
        await loadAllData();
        renderDiscoverGrid();
    } catch (error) {
        console.error("Erreur bannissement:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de bannir.",
        );
    }
}

async function unbanUserByAdmin(targetUserId) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return;
    }
    const cleanId = String(targetUserId || "").trim();
    if (!cleanId) return;

    try {
        const { error } = await supabase
            .from("users")
            .update({
                banned_until: null,
                banned_reason: null,
                banned_by: null,
                banned_at: null,
            })
            .eq("id", cleanId);

        if (error) throw error;
        ToastManager?.success(
            "Utilisateur rétabli",
            "Le bannissement est levé.",
        );
        await loadAllData();
        renderDiscoverGrid();
    } catch (error) {
        console.error("Erreur unban:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de lever le ban.",
        );
    }
}

async function softDeleteContentByAdmin(contentId, reason) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return;
    }
    const cleanId = String(contentId || "").trim();
    if (!cleanId) return;

    try {
        const { error } = await supabase
            .from("content")
            .update({
                is_deleted: true,
                deleted_at: new Date().toISOString(),
                deleted_reason: String(reason || "").trim() || null,
                deleted_by: window.currentUser?.id || null,
            })
            .eq("id", cleanId);

        if (error) throw error;
        ToastManager?.success(
            "Contenu masqué",
            "Le contenu est supprimé côté public.",
        );
        await loadAllData();
        renderDiscoverGrid();
    } catch (error) {
        console.error("Erreur suppression contenu:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de supprimer.",
        );
    }
}

async function restoreContentByAdmin(contentId) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return;
    }
    const cleanId = String(contentId || "").trim();
    if (!cleanId) return;

    try {
        const { error } = await supabase
            .from("content")
            .update({
                is_deleted: false,
                deleted_at: null,
                deleted_reason: null,
                deleted_by: null,
            })
            .eq("id", cleanId);

        if (error) throw error;
        ToastManager?.success(
            "Contenu restauré",
            "Le contenu est à nouveau visible.",
        );
        await loadAllData();
        renderDiscoverGrid();
    } catch (error) {
        console.error("Erreur restauration contenu:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de restaurer.",
        );
    }
}

async function hardDeleteContentByAdmin(contentId) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return;
    }
    const cleanId = String(contentId || "").trim();
    if (!cleanId) return;

    if (!confirm("Supprimer définitivement ce contenu ?")) return;

    try {
        const { error } = await supabase
            .from("content")
            .delete()
            .eq("id", cleanId);

        if (error) throw error;
        ToastManager?.success(
            "Contenu supprimé",
            "Suppression définitive effectuée.",
        );
        await loadAllData();
        renderDiscoverGrid();
    } catch (error) {
        console.error("Erreur suppression définitive:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de supprimer.",
        );
    }
}

async function hardDeleteUserByAdmin(userId) {
    if (!isSuperAdmin()) {
        ToastManager?.error("Accès refusé", "Vous devez être super-admin.");
        return;
    }
    const cleanId = String(userId || "").trim();
    if (!cleanId) return;

    if (!confirm("Supprimer définitivement cet utilisateur et son contenu ?"))
        return;

    try {
        const { error } = await supabase
            .from("users")
            .delete()
            .eq("id", cleanId);

        if (error) throw error;
        ToastManager?.success(
            "Utilisateur supprimé",
            "Suppression définitive effectuée.",
        );
        await loadAllData();
        renderDiscoverGrid();
    } catch (error) {
        console.error("Erreur suppression utilisateur:", error);
        ToastManager?.error(
            "Erreur",
            error?.message || "Impossible de supprimer.",
        );
    }
}

// Actions rapides depuis la page profil (admin)
async function banUserFromProfile(userId) {
    const durationInput = document.getElementById(
        `profile-ban-duration-${userId}`,
    );
    const unitInput = document.getElementById(`profile-ban-unit-${userId}`);
    const reasonInput = document.getElementById(
        `profile-admin-reason-${userId}`,
    );
    const value = parseInt(durationInput?.value, 10) || 24;
    const unit = unitInput?.value === "days" ? "days" : "hours";
    const hours = unit === "days" ? value * 24 : value;
    const reason = reasonInput?.value || "";
    await banUserByAdmin(userId, hours, reason);
    renderProfileIntoContainer(userId);
}

async function unbanUserFromProfile(userId) {
    await unbanUserByAdmin(userId);
    renderProfileIntoContainer(userId);
}

async function moderateContentFromProfile(contentId, action, userId) {
    const reasonInput = document.getElementById(
        `profile-admin-reason-${userId}`,
    );
    const reason = reasonInput?.value || "";
    if (action === "hide") {
        await softDeleteContentByAdmin(contentId, reason);
    } else if (action === "restore") {
        await restoreContentByAdmin(contentId);
    } else if (action === "hard") {
        await hardDeleteContentByAdmin(contentId);
    }
    renderProfileIntoContainer(userId);
}

const badgeSVGs = {
    success:
        '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>',
    failure:
        '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 8l8 8M16 8l-8 8"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="3" height="16"/><rect x="15" y="4" width="3" height="16"/></svg>',
    empty: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
    consistency7:
        '<svg viewBox="0 0 24 24"><text x="12" y="16" text-anchor="middle" font-size="18" font-weight="bold">7</text></svg>',
    consistency30:
        '<svg viewBox="0 0 24 24"><path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2m0 2c-4.418 0-8 3.582-8 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8z"/></svg>',
    consistency100:
        '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
    consistency365:
        '<svg viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>',
    solo: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M12 14c-4 0-6 2-6 2v4h12v-4s-2-2-6-2z"/></svg>',
    team: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M8 11c-2 0-3 1-3 1v3h10v-3s-1-1-3-1z"/><path d="M16 11c-2 0-3 1-3 1v3h6v-3s-1-1-3-1z"/></svg>',
    enterprise:
        '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="8" x2="21" y2="8"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
    creative:
        '<svg viewBox="0 0 24 24"><circle cx="15.5" cy="9.5" r="1.5"/><path d="M3 17.25V21h4v-3.75L3 17.25z"/><path d="M15 8.75h.01M21 19V9c0-1.1-.9-2-2-2h-4l-4-5-4 5H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2z"/></svg>',
    tech: '<svg viewBox="0 0 24 24"><path d="M9 5H7.12A2.12 2.12 0 0 0 5 7.12v9.76A2.12 2.12 0 0 0 7.12 19h9.76A2.12 2.12 0 0 0 19 16.88V15m-6-9h6V5h-6v1z"/><path d="M9 9h6v6H9z"/></svg>',
    transparent:
        '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>',
};

function calculateConsistency(userId) {
    const details = getPostingStreakDetails(getUserContentLocal(userId));
    if (!details) return null;

    const isFresh = (limitDays) => details.daysSinceLast <= limitDays;

    if (details.streak >= 365 && isFresh(7)) return "consistency365";
    if (details.streak >= 100 && isFresh(7)) return "consistency100";
    if (details.streak >= 30 && isFresh(30)) return "consistency30";
    if (details.streak >= 7 && isFresh(7)) return "consistency7";
    return null;
}

function getPostingStreakDetails(contents = []) {
    if (!Array.isArray(contents) || contents.length === 0) return null;

    const sorted = [...contents].sort((a, b) => {
        const dateA =
            new Date(a.created_at || a.createdAt || 0).getTime() ||
            (a.dayNumber ?? a.day_number ?? 0);
        const dateB =
            new Date(b.created_at || b.createdAt || 0).getTime() ||
            (b.dayNumber ?? b.day_number ?? 0);
        return dateA - dateB;
    });

    const getDate = (item) => {
        const d = item.created_at || item.createdAt;
        const parsed = d ? new Date(d) : null;
        return parsed && !isNaN(parsed) ? parsed : null;
    };

    const MAX_GAP_MS = 36 * 60 * 60 * 1000; // tolérance 1,5 jour pour l'enchaînement

    const isConsecutive = (current, previous) => {
        const dCur = getDate(current);
        const dPrev = getDate(previous);
        if (dCur && dPrev) {
            const delta = dCur.getTime() - dPrev.getTime();
            return delta > 0 && delta <= MAX_GAP_MS;
        }
        // fallback dayNumber s'il n'y a pas de dates fiables
        const dayCur = current.dayNumber ?? current.day_number ?? Number.NaN;
        const dayPrev = previous.dayNumber ?? previous.day_number ?? Number.NaN;
        if (Number.isInteger(dayCur) && Number.isInteger(dayPrev)) {
            return dayCur - dayPrev === 1;
        }
        return false;
    };

    // Calculer la streak courante (doit se terminer sur le dernier post)
    let streak = 1;
    for (let i = sorted.length - 1; i > 0; i--) {
        if (isConsecutive(sorted[i], sorted[i - 1])) {
            streak++;
        } else {
            break;
        }
    }

    const lastDate = getDate(sorted[sorted.length - 1]);
    const daysSinceLast = lastDate
        ? (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        : Infinity;

    return {
        streak,
        daysSinceLast,
        lastDate,
        total: sorted.length,
    };
}

function determineTrajectoryType(userId) {
    const user = getUser(userId);
    const contents = getUserContentLocal(userId);

    if (!user || contents.length === 0) return null;

    const userTitle = (user.title || "").toLowerCase();
    const userName = (user.name || "").toLowerCase();

    // Comptes officiels / équipes / entreprises
    if (userTitle.includes("team") || userTitle.includes("équipe")) {
        return "team";
    }
    if (
        userTitle.includes("official") ||
        userTitle.includes("officiel") ||
        userTitle.includes("owner") ||
        userName === "rize" ||
        userName.includes("rize team")
    ) {
        return "enterprise";
    }

    const textContent =
        contents
            .map((c) => (c.title + " " + c.description).toLowerCase())
            .join(" ") +
        " " +
        userTitle;

    if (
        textContent.includes("unreal") ||
        userTitle.includes("designer") ||
        textContent.includes("motion") ||
        textContent.includes("blender") ||
        textContent.includes("modelisation") ||
        textContent.includes("illustration") ||
        textContent.includes("artisan")
    )
        return "creative";
    if (
        textContent.includes("boss") ||
        textContent.includes("game") ||
        textContent.includes("indie") ||
        textContent.includes("jeu")
    )
        return "creative";
    if (
        textContent.includes("ceo") ||
        textContent.includes("entreprise") ||
        textContent.includes("startup") ||
        textContent.includes("fondateur") ||
        textContent.includes("co-founder")
    )
        return "enterprise";
    if (
        textContent.includes("refonte") ||
        textContent.includes("ui") ||
        textContent.includes("mobile") ||
        textContent.includes("frontend") ||
        textContent.includes("backend") ||
        textContent.includes("fullstack") ||
        textContent.includes("développeur") ||
        textContent.includes("code") ||
        textContent.includes("programmation") ||
        textContent.includes("javascript") ||
        textContent.includes("python") ||
        textContent.includes("react")
    )
        return "tech";
    if (
        textContent.includes("architecture") ||
        textContent.includes("api") ||
        textContent.includes("database") ||
        textContent.includes("serveur") ||
        textContent.includes("devops")
    )
        return "tech";

    if (
        textContent.includes("étudiant") ||
        userTitle.includes("étudiant") ||
        textContent.includes("formation") ||
        textContent.includes("apprendre") ||
        textContent.includes("study") ||
        textContent.includes("cours") ||
        textContent.includes("leçon") ||
        textContent.includes("diplôme") ||
        textContent.includes("certification") ||
        textContent.includes("école") ||
        textContent.includes("mentor")
    )
        return "education";

    if (
        textContent.includes("climat") ||
        textContent.includes("impact") ||
        textContent.includes("écologie") ||
        textContent.includes("durable") ||
        textContent.includes("social") ||
        textContent.includes("ong") ||
        textContent.includes("association") ||
        textContent.includes("bénévole") ||
        textContent.includes("environnement") ||
        textContent.includes("vert")
    )
        return "impact";

    if (
        textContent.includes("finance") ||
        textContent.includes("crypto") ||
        textContent.includes("trading") ||
        textContent.includes("bourse") ||
        textContent.includes("invest") ||
        textContent.includes("banque") ||
        textContent.includes("bitcoin") ||
        textContent.includes("nft") ||
        textContent.includes("argent") ||
        textContent.includes("budget")
    )
        return "finance";

    if (
        textContent.includes("artiste") ||
        textContent.includes("peinture") ||
        textContent.includes("musique") ||
        textContent.includes("écriture") ||
        userTitle.includes("artiste") ||
        textContent.includes("sculpture") ||
        textContent.includes("spectacle") ||
        textContent.includes("danse") ||
        textContent.includes("expo")
    )
        return "artist";

    if (
        textContent.includes("santé") ||
        textContent.includes("fitness") ||
        textContent.includes("yoga") ||
        textContent.includes("nutrition") ||
        textContent.includes("médical") ||
        textContent.includes("médecin") ||
        textContent.includes("docteur") ||
        textContent.includes("hôpital") ||
        textContent.includes("musculation") ||
        textContent.includes("running")
    )
        return "health";

    if (
        textContent.includes("électronique") ||
        textContent.includes("robotique") ||
        textContent.includes("iot") ||
        textContent.includes("hardware") ||
        textContent.includes("matériel") ||
        textContent.includes("pcb") ||
        textContent.includes("soudure") ||
        textContent.includes("arduino") ||
        textContent.includes("raspberry") ||
        textContent.includes("capteur")
    )
        return "hardware";

    if (
        textContent.includes("marketing") ||
        textContent.includes("growth") ||
        textContent.includes("ads") ||
        textContent.includes("seo") ||
        textContent.includes("vente") ||
        textContent.includes("copywriting") ||
        textContent.includes("branding") ||
        textContent.includes("publicité") ||
        textContent.includes("funnel") ||
        textContent.includes("saas")
    )
        return "marketing";

    if (
        textContent.includes("recherche") ||
        textContent.includes("science") ||
        textContent.includes("chercheur") ||
        textContent.includes("phd") ||
        textContent.includes("labo") ||
        textContent.includes("étude") ||
        textContent.includes("thèse") ||
        textContent.includes("data") ||
        textContent.includes("statistique") ||
        textContent.includes("analyse")
    )
        return "research";

    return "solo";
}

function evaluateTransparency(userId) {
    const contents = getUserContentLocal(userId);
    if (contents.length === 0) return false;

    const failureCount = contents.filter((c) => c.state === "failure").length;
    const ratio = failureCount / contents.length;

    return ratio >= 0.3;
}

function generateBadge(badgeType, label) {
    const iconTypes = new Set([
        "team",
        "enterprise",
        "creative",
        "tech",
        "solo",
        "education",
        "impact",
        "finance",
        "artist",
        "health",
        "hardware",
        "marketing",
        "research",
    ]);
    if (iconTypes.has(badgeType)) {
        let iconName = badgeType;
        if (badgeType === "creative") iconName = "créatif";
        if (badgeType === "team") iconName = "collectif";
        if (badgeType === "education") iconName = "éducation";
        if (badgeType === "health") iconName = "santé";
        if (badgeType === "research") iconName = "recherche";

        const iconPath = `./icons/${iconName}.svg`;
        return `
            <div class="badge" title="${label}">
                <img src="${iconPath}" alt="${label}" class="badge-icon" />
            </div>
`;
    }

    const svg = badgeSVGs[badgeType];
    if (!svg && badgeType !== "ai") return "";

    let cssClass = "badge";
    if (badgeType.startsWith("consistency")) cssClass += "";
    else if (badgeType === "success") cssClass += " badge-success badge-filled";
    else if (badgeType === "failure") cssClass += " badge-failure badge-filled";
    else if (badgeType === "pause") cssClass += " badge-pause badge-filled";
    else if (badgeType === "empty") cssClass += "";
    else if (badgeType === "transparent") cssClass += " badge-success";
    else if (badgeType === "ai") cssClass += " badge-success badge-filled";
    else cssClass += "";

    const badgeContent = svg
        ? `<div class="badge-icon">${svg}</div>`
        : `<div class="badge-icon" aria-hidden="true">✦</div>`;

    return `
<div class="${cssClass}" title="${label}">
            ${badgeContent}
            <span>${label}</span>
</div>
    `;
}

function getUserBadges(userId) {
    const badges = [];

    const trajectoryType = determineTrajectoryType(userId);
    if (trajectoryType && trajectoryType !== "solo") {
        const labels = {
            team: "Collectif",
            enterprise: "Entreprise",
            creative: "Créatif",
            tech: "Tech",
            education: "Éducation",
            impact: "Impact Social",
            finance: "Finance",
            artist: "Artiste",
            health: "Santé & Bien-être",
            hardware: "Hardware",
            marketing: "Marketing",
            research: "Recherche",
        };
        badges.push({
            type: trajectoryType,
            label: labels[trajectoryType],
        });
    }

    const consistency = calculateConsistency(userId);
    const isPersonalAccount = !trajectoryType || trajectoryType === "solo"; // badges de constance réservés aux comptes perso
    if (consistency && isPersonalAccount) {
        const labels = {
            consistency7: "7j consécutifs (hebdo)",
            consistency30: "30j consécutifs (1 mois)",
            consistency100: "100j consécutifs",
            consistency365: "365j consécutifs",
        };
        badges.push({ type: consistency, label: labels[consistency] });
    }

    if (evaluateTransparency(userId)) {
        badges.push({ type: "transparent", label: "Transparent" });
    }

    return badges;
}

function getContentBadges(content) {
    const badges = [];

    const stateLabels = {
        success: "Victoire",
        failure: "Bloqué",
        pause: "Pause",
        empty: "Vide",
    };

    if (content && content.state) {
        badges.push({
            type: content.state,
            label: stateLabels[content.state],
        });
    }

    if (window.resolveContentAIFlag && window.resolveContentAIFlag(content)) {
        badges.push({ type: "ai", label: "IA" });
    } else if (
        typeof window !== "undefined" &&
        window.extractAIFlagFromContent &&
        window.extractAIFlagFromContent(content)
    ) {
        badges.push({ type: "ai", label: "IA" });
    } else if (
        typeof resolveContentAIFlag === "function" &&
        resolveContentAIFlag(content)
    ) {
        badges.push({ type: "ai", label: "IA" });
    }

    return badges;
}

function renderBadges(badgesList) {
    if (badgesList.length === 0) return "";

    return `
<div class="badge-container">
            ${badgesList.map((b) => generateBadge(b.type, b.label)).join("")}
</div>
    `;
}

function renderUserBadges(userId) {
    const verificationHtml = renderVerificationBadgeById(userId);
    const contributorBadgeHtml = getContributorBadgeHtml(userId);
    const userBadges = getUserBadges(userId);
    if (!verificationHtml && !contributorBadgeHtml && userBadges.length === 0)
        return "";
    return `
<div class="badge-container">
            ${contributorBadgeHtml || ""}
            ${verificationHtml || ""}
            ${userBadges.map((b) => generateBadge(b.type, b.label)).join("")}
</div>
    `;
}

function normalizeExternalUrl(raw) {
    if (!raw) return "";
    let url = String(raw).trim();

    url = url.replace(/^https\.[/\\]*/i, "https://");
    url = url.replace(/^http\.[/\\]*/i, "http://");

    if (url.startsWith("//")) return "https:" + url;
    if (/^https?:\/\//i.test(url)) return url;
    return "https://" + url;
}

function renderProfileSocialLinks(userId) {
    const user = getUser(userId);
    // Support both snake_case (DB) and camelCase (local update)
    const socialLinks = user ? user.social_links || user.socialLinks : null;

    if (!user || !socialLinks || Object.keys(socialLinks).length === 0) {
        return "";
    }

    const platformLabels = {
        email: "Email",
        github: "GitHub",
        instagram: "Instagram",
        snapchat: "Snapchat",
        youtube: "YouTube",
        twitter: "X",
        tiktok: "TikTok",
        linkedin: "LinkedIn",
        twitch: "Twitch",
        spotify: "Spotify",
        discord: "Discord",
        reddit: "Reddit",
        pinterest: "Pinterest",
        facebook: "Facebook",
        site: "Site",
    };

    const platformIcons = {
        email: "icons/email.svg",
        github: "icons/github.svg",
        instagram: "icons/instagram.svg",
        snapchat: "icons/snapchat.svg",
        youtube: "icons/youtube.svg",
        twitter: "icons/twitter.svg",
        tiktok: "icons/tiktok.svg",
        linkedin: "icons/linkedin.svg",
        twitch: "icons/twitch.svg",
        spotify: "icons/spotify.svg",
        discord: "icons/discord.svg",
        reddit: "icons/reddit.svg",
        pinterest: "icons/pinterest.svg",
        facebook: "icons/facebook.svg",
        site: "icons/link.svg",
    };

    const socialHtml = Object.entries(socialLinks)
        .filter(([platform, url]) => platformLabels[platform] && url)
        .map(([platform, url]) => {
            const label = platformLabels[platform] || platform;
            const iconPath = platformIcons[platform] || "icons/link.svg";
            if (platform === "email") {
                const email = String(url).trim();
                const safeEmail = email.replace(/"/g, "&quot;");
                return `
                    <button type="button"
                        class="social-badge"
                        title="Afficher et copier l'email"
                        onclick="handleEmailBadgeClick('${safeEmail}', this)">
                        <img src="${iconPath}" alt="email" class="social-badge-icon" />
                        <span class="email-reveal" style="display:none; margin-left:6px; font-size:0.85rem;"></span>
                    </button>
                `;
            }
            const safeUrl = normalizeExternalUrl(url);
            return `
                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" 
                   class="social-badge" 
                   title="Visiter ${label}">
                    <img src="${iconPath}" alt="${platform}" class="social-badge-icon" />
                </a>
            `;
        })
        .join("");

    return socialHtml
        ? `<div class="profile-social-badges">${socialHtml}</div>`
        : "";
}

function handleEmailBadgeClick(email, el) {
    const badge = el;
    if (!badge) return;
    const span = badge.querySelector(".email-reveal");
    if (!span) return;

    if (span.textContent !== email) {
        span.textContent = email;
    }
    span.style.display = "inline";

    const doToast = (msg) => {
        if (
            window.ToastManager &&
            typeof window.ToastManager.success === "function"
        ) {
            window.ToastManager.success("Email", msg);
        }
    };

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard
            .writeText(email)
            .then(() => {
                doToast("Copié dans le presse-papiers");
            })
            .catch(() => {});
    } else {
        const textarea = document.createElement("textarea");
        textarea.value = email;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand("copy");
            doToast("Copié dans le presse-papiers");
        } catch (e) {}
        document.body.removeChild(textarea);
    }
}

function getProfileContentTimeValue(content) {
    const raw =
        content?.createdAt || content?.created_at || content?.started_at;
    const time = new Date(raw || 0).getTime();
    return Number.isFinite(time) ? time : 0;
}

function getProfileStateMeta(state) {
    if (state === "failure") {
        return {
            label: "Bloque",
            accent: "#ef4444",
            svg: badgeSVGs.failure,
        };
    }
    if (state === "pause") {
        return {
            label: "Pause",
            accent: "#f59e0b",
            svg: badgeSVGs.pause,
        };
    }
    return {
        label: "Victoire",
        accent: "#10b981",
        svg: badgeSVGs.success,
    };
}

function getProfileContentTypeLabel(content) {
    if (isAnnouncementContent(content)) return "Annonce";
    if (content?.type === "video") return "Video";
    if (content?.type === "image") return "Media";
    if (content?.type === "live") return "Live";
    return "Texte";
}

function renderProfileContentMedia(content, options = {}) {
    const compact = options.compact === true;
    const mediaContentId =
        content?.contentId || content?.content_id || content?.id || "";
    const mediaUserId =
        options.profileUserId || content?.userId || content?.user_id || "";
    const mediaContextAttrs = `data-profile-media-content-id="${escapeHtml(mediaContentId)}" data-profile-media-user-id="${escapeHtml(mediaUserId)}"`;
    const mediaUrls = Array.isArray(content?.mediaUrls)
        ? content.mediaUrls.filter(Boolean)
        : [];
    const primaryMediaUrl = mediaUrls[0] || content?.mediaUrl || "";
    if (!primaryMediaUrl) return "";

    const c2paBadge = renderC2PABadgeHtml("profile", content);
    const extraCount =
        mediaUrls.length > 1
            ? `<span class="profile-update-media-count">+${mediaUrls.length - 1} media${mediaUrls.length - 1 > 1 ? "s" : ""}</span>`
            : "";

    if (content?.type === "video") {
        return `
            <div class="timeline-media profile-update-media ${compact ? "is-compact" : ""}" ${mediaContextAttrs} style="position: relative;">
                <video src="${primaryMediaUrl}" controls playsinline preload="metadata"></video>
                ${c2paBadge}
                ${extraCount}
            </div>
`;
    }

    if (content?.type === "image") {
        return `
            <div class="timeline-media profile-update-media ${compact ? "is-compact" : ""}" ${mediaContextAttrs} style="position: relative;">
                <img src="${primaryMediaUrl}" alt="${escapeHtml(content?.title || "Media update")}" loading="lazy" decoding="async">
                ${c2paBadge}
                ${extraCount}
            </div>
`;
    }

    if (content?.type === "live" || content?.type === "gif") {
        return `
            <div class="timeline-media profile-update-media-link">
                <a href="${primaryMediaUrl}" target="_blank" rel="noopener noreferrer">Voir le media</a>
            </div>
`;
    }

    return "";
}

function bindProfileImmersiveMedia(container) {
    if (!container || container.dataset.profileImmersiveMediaBound === "true") {
        return;
    }
    container.dataset.profileImmersiveMediaBound = "true";
    container.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const mediaTarget = target?.closest("img, video");
        const mediaContext = target?.closest(
            "[data-profile-media-content-id]",
        );
        if (!mediaTarget || !mediaContext) return;

        event.preventDefault();
        event.stopPropagation();
        openImmersive(
            mediaContext.dataset.profileMediaUserId,
            mediaContext.dataset.profileMediaContentId,
            { profileOnly: true },
        );
    });
}

function renderProfileUpdateCard(
    content,
    {
        profileUserId,
        currentUserId,
        isAdminViewer = false,
        encouragedContentIds = new Set(),
        compact = false,
        featured = false,
        selectedArcMode = false,
    } = {},
) {
    if (!content) return "";

    // GESTION DES TYPES PROFESSIONNELS (Actualités & Événements)
    if (content.type === "news" || content.type === "event") {
        const typeLabel = content.type === "news" ? "Post" : "Événement";
        const accentColor = content.type === "news" ? "#f59e0b" : "#c084fc";
        const dateLabel = safeFormatDate(content.createdAt, {
            month: "long",
            day: "numeric",
            year: "numeric",
        });
        const titleHtml = escapeHtml(content.title || "Sans titre");
        const descriptionHtml = renderRichDescription(
            content.description || "",
        );

        let proContextHtml = "";
        if (content.type === "event" && content.metadata) {
            const ev = content.metadata;
            const evDate = ev.event_date ? new Date(ev.event_date) : null;
            const monthNames = [
                "JAN",
                "FEV",
                "MAR",
                "AVR",
                "MAI",
                "JUN",
                "JUL",
                "AOU",
                "SEP",
                "OCT",
                "NOV",
                "DEC",
            ];

            proContextHtml = `
                <div class="pro-event-details" style="display: flex; gap: 20px; background: rgba(255,255,255,0.05); padding: 20px; border-radius: 12px; margin: 15px 0; border: 1px solid var(--border-color);">
                    ${
                        evDate
                            ? `
                        <div class="pro-event-date-box">
                            <span>${monthNames[evDate.getMonth()]}</span>
                            <span>${evDate.getDate()}</span>
                        </div>
                    `
                            : ""
                    }
                    <div style="flex: 1;">
                        <div style="font-weight: 800; color: #fff; margin-bottom: 5px;"><i class="fas fa-clock" style="margin-right: 8px; color: ${accentColor}"></i> ${ev.event_time || "Heure non précisée"}</div>
                        <div style="font-weight: 600; color: var(--text-secondary);"><i class="fas fa-map-marker-alt" style="margin-right: 8px; color: ${accentColor}"></i> ${ev.location || "Lieu non précisé"}</div>
                    </div>
                    <button class="btn btn-primary" style="align-self: center; background: ${accentColor}; border-color: ${accentColor};" onclick="event.stopPropagation(); window.showToast?.('Demande d\\'inscription envoyée !', 'success')">S'inscrire</button>
                </div>
            `;
        }

            const mediaHtml = content.media_url
            ? `
                <div data-profile-media-content-id="${escapeHtml(content.contentId || content.content_id || content.id || "")}" data-profile-media-user-id="${escapeHtml(profileUserId)}" style="margin: 15px 0; border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color);">
                <img src="${content.media_url}" style="width: 100%; max-height: 400px; object-fit: cover;">
            </div>
        `
            : "";

        return `
            <article class="timeline-card pro-feed-card pro-feed-card--${content.type}" style="border-top: 4px solid ${accentColor}">
                <div style="padding: 25px;">
                    <span class="pro-feed-tag">${typeLabel}</span>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                        <h3 style="margin: 0; font-size: 1.5rem; line-height: 1.2; font-family: var(--font-heading); color: #fff;">${titleHtml}</h3>
                        <span style="font-size: 0.8rem; color: var(--text-secondary);">${dateLabel}</span>
                    </div>
                    <p class="pro-post-description" data-pro-post-id="${escapeHtml(content.id || "")}" onclick="toggleProPostDescription('${escapeHtml(content.id || "")}')">${descriptionHtml}</p>
                    ${proContextHtml}
                    ${mediaHtml}
                    <div class="pro-card-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border-color);">
                         <div class="profile-update-stats">
                            <span style="color: var(--text-secondary); font-size: 0.85rem;">Publié officiellement</span>
                            <button type="button" class="pro-post-expand-btn" onclick="event.stopPropagation(); toggleProPostDescription('${escapeHtml(content.id || "")}')">Lire la suite</button>
                         </div>
                         <div style="display: flex; gap: 10px;">
                            <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); shareContent('${content.id}')"><i class="fas fa-share"></i></button>
                         </div>
                    </div>
                </div>
            </article>
        `;
    }

    const stateMeta = getProfileStateMeta(content.state);
    const typeLabel = getProfileContentTypeLabel(content);
    const dateLabel = safeFormatDate(content.createdAt, {
        month: "long",
        day: "numeric",
    });
    const agoLabel = timeAgo(content.createdAt);
    const dayValue =
        typeof content.dayNumber === "number" && content.dayNumber > 0
            ? content.dayNumber
            : typeof content.day_number === "number" && content.day_number > 0
              ? content.day_number
              : 0;
    const dayChip = dayValue
        ? `<span class="profile-update-pill">Jour ${dayValue}</span>`
        : "";
    const descriptionSource =
        content.description || content.title || "Nouvelle mise a jour";
    const descriptionHtml = renderRichDescription(descriptionSource);
    const titleHtml = escapeHtml(content.title || "Mise a jour");
    const mediaHtml = renderProfileContentMedia(content, {
        compact,
        profileUserId,
    });
    const contextItems = [];

    if (!selectedArcMode && content.arc?.title) {
        contextItems.push(
            `<button type="button" class="context-tag arc-tag" onclick="event.stopPropagation(); selectArc('${content.arc.id}', '${profileUserId}')">${escapeHtml(content.arc.title)}</button>`,
        );
    }

    if (content.project?.name) {
        contextItems.push(
            `<span class="context-tag project-tag">${escapeHtml(content.project.name)}</span>`,
        );
    }

    const safeTags = Array.isArray(content.tags)
        ? content.tags.map(normalizeTag).filter(Boolean).slice(0, 3)
        : [];
    safeTags.forEach((tag) => {
        contextItems.push(
            `<span class="context-tag">#${escapeHtml(tag)}</span>`,
        );
    });

    const contextHtml = contextItems.length
        ? `<div class="timeline-context profile-update-context">${contextItems.join("")}</div>`
        : "";

    const authorIdentity = getContentAuthorIdentity(content);
    const pageId =
        authorIdentity.type === "PAGE_PRO" ? authorIdentity.id : null;
    const pageAuthor =
        pageId &&
        (professionalPagesById.get(String(pageId)) ||
            window.professionalManager?.proPagesCache?.get(String(pageId)));
    const contentAuthor =
        authorIdentity.type === "USER" &&
        content.userId &&
        content.userId !== profileUserId
            ? getUser(content.userId)
            : null;
    const authorHtml = pageId
        ? `
            <div class="profile-update-author">
                <span class="profile-update-author-label">par</span>
                <button type="button" class="profile-update-author-name" style="border:0;background:transparent;padding:0;color:inherit;font:inherit;cursor:pointer" data-profile-author-type="PAGE_PRO" data-profile-page-id="${escapeHtml(pageId)}" onclick="event.stopPropagation(); window.openProfessionalPageById('${escapeHtml(pageId)}')" aria-label="Voir la Page Pro ${escapeHtml(pageAuthor?.name || "professionnelle")}">${renderUsernameWithBadge(pageAuthor?.name || "Page professionnelle", pageId, true)}</button>
            </div>
`
        : contentAuthor
          ? `
            <div class="profile-update-author">
                <span class="profile-update-author-label">par</span>
                <span class="profile-update-author-name">${renderUsernameWithBadge(contentAuthor.name, contentAuthor.id)}</span>
            </div>
`
          : "";

    const isAnnouncement = isAnnouncementContent(content);
    const canReply = canReplyToContent(content);
    const replyContentId = content.contentId || content.id || "";
    const replyOwnerId = content.userId || profileUserId || "";
    const replyInputId = replyContentId
        ? `profile-reply-input-${replyContentId}`
        : "";
    const replyCount =
        canReply && replyContentId ? getReplyCount(replyContentId) : 0;
    const replyPanelHtml =
        canReply && replyContentId
            ? `
            <div class="profile-update-reply-block">
                <button type="button" class="reply-btn" data-reply-toggle="${escapeHtml(replyContentId)}" aria-expanded="false" onclick="event.stopPropagation(); toggleProfileAnnouncementReplies(${inlineJsString(replyContentId)})">
                    <span data-reply-toggle-label="${escapeHtml(replyContentId)}">Répondre</span>
                    <span class="reply-count" data-reply-count="${escapeHtml(replyContentId)}">${replyCount}</span>
                </button>
            </div>
`
            : "";
    const targetContentId = content.contentId || content.id || "";
    const safeEncouragedSet =
        encouragedContentIds && typeof encouragedContentIds.has === "function"
            ? encouragedContentIds
            : new Set();
    const viewerCanEncourage =
        !!targetContentId && currentUserId && currentUserId !== content.userId;
    const isEncouraged = targetContentId
        ? safeEncouragedSet.has(targetContentId)
        : false;
    const courageIcon = isEncouraged
        ? "icons/courage-green.svg"
        : "icons/courage-blue.svg";
    const encourageButtonHtml = viewerCanEncourage
        ? `
            <button class="btn btn-secondary courage-btn profile-encourage-btn ${isEncouraged ? "encouraged" : ""}" data-content-id="${escapeHtml(targetContentId)}" onclick="event.stopPropagation(); toggleCourage('${escapeHtml(targetContentId)}', this)">
                <img src="${courageIcon}" width="16" height="16" alt="">
                <span>Encourager</span>
                <span class="courage-count profile-encourage-count" data-count="${Number(content.encouragementsCount) || 0}" title="${(Number(content.encouragementsCount) || 0).toLocaleString("fr-FR")}">${formatCompactCount(content.encouragementsCount || 0)}</span>
            </button>
`
        : `
            <div class="profile-update-stat-pill">
                <img src="icons/courage-blue.svg" width="16" height="16" alt="">
                <span>${formatCompactCount(content.encouragementsCount || 0)} encouragement${Number(content.encouragementsCount || 0) > 1 ? "s" : ""}</span>
            </div>
`;

    let managementHtml = "";
    if (currentUser && currentUser.id === profileUserId) {
        managementHtml = `
            <div class="profile-update-management">
                <button class="btn-action" onclick="editContent('${content.contentId || content.id}')">Modifier</button>
                <button class="btn-action btn-action-danger" onclick="deleteContent('${content.contentId || content.id}')">Supprimer</button>
            </div>
`;
    }

    // Gestion Pro (Validation)
    if (
        window.professionalManager &&
        window.currentUser &&
        window.currentUserId !== content.userId
    ) {
        // Si le viewer possède une page pro, on vérifie s'il peut valider ce contenu
        const myPages = Array.from(
            window.professionalManager.proPagesCache.values(),
        ).filter((p) => p.owner_id === window.currentUserId);

        if (myPages.length > 0) {
            // Bouton de validation pour chaque page possédée (souvent une seule)
            myPages.forEach((page) => {
                const isValidatedByThisPage =
                    content.isValidatedPro &&
                    content.validatedByPageId === page.id;
                const pageNameHtml = renderVerifiedPageName(
                    escapeHtml(page.name),
                    page.id,
                );
                managementHtml += `
                    <div class="profile-update-management pro-management">
                        ${
                            isValidatedByThisPage
                                ? `
                            <button class="btn-action" style="background: #ef4444; color: #fff;" onclick="event.stopPropagation(); window.professionalManager.invalidateTrace('${content.contentId}').then(() => renderProfileIntoContainer('${profileUserId}'))">Révoquer Validation (${pageNameHtml})</button>
                        `
                                : `
                            <button class="btn-action" style="background: #000; color: #fff;" onclick="event.stopPropagation(); window.professionalManager.validateTrace('${content.contentId}', '${page.id}').then(() => renderProfileIntoContainer('${profileUserId}'))">Accorder Seal of Approval (${pageNameHtml})</button>
                        `
                        }
                    </div>
                `;
            });
        }
    }

    if (isAdminViewer && currentUserId !== profileUserId) {
        managementHtml += `
            <div class="profile-update-management">
                <button class="btn-action btn-action-warn" onclick="moderateContentFromProfile('${content.contentId || content.id}', 'hide', '${profileUserId}')">Masquer</button>
                <button class="btn-action" onclick="moderateContentFromProfile('${content.contentId || content.id}', 'restore', '${profileUserId}')">Restaurer</button>
                <button class="btn-action btn-action-danger" onclick="moderateContentFromProfile('${content.contentId || content.id}', 'hard', '${profileUserId}')">Supprimer definitivement</button>
            </div>
`;
    }

    const viewsCount = Number(content.views) || 0;
    const cardClasses = [
        "timeline-card",
        "profile-update-card",
        compact ? "profile-update-card--compact" : "",
        featured ? "profile-update-card--featured" : "",
        selectedArcMode ? "profile-update-card--project" : "",
    ]
        .filter(Boolean)
        .join(" ");

    const aiBadgeHtml = resolveContentAIFlag(content)
        ? `<span class="profile-update-pill" style="background: rgba(34,197,94,0.15); color: #86efac; border-color: rgba(34,197,94,0.4);">IA</span>`
        : "";

    return `
<article class="${cardClasses}">
            <div class="profile-update-top">
                <div class="profile-update-badges">
                    <span class="profile-update-state" style="--profile-update-accent:${stateMeta.accent};">${stateMeta.label}</span>
                    <span class="profile-update-pill">${typeLabel}</span>
                    ${dayChip}
                    ${aiBadgeHtml}
                </div>
                <div class="profile-update-meta">
                    <span>${dateLabel}</span>
                    <span>${agoLabel}</span>
                </div>
            </div>
            <div class="profile-update-main">
                ${window.professionalManager ? window.professionalManager.renderSealOfApproval(content) : ""}
                <h4>${titleHtml}</h4>
                ${authorHtml}
                <p>${descriptionHtml}</p>
                ${contextHtml}
                ${mediaHtml}
            </div>
            <div class="profile-update-footer">
                <div class="profile-update-stats">
                    <span>${formatCompactCount(viewsCount)} vue${viewsCount > 1 ? "s" : ""}</span>
                    <span>${formatCompactCount(content.encouragementsCount || 0)} encouragement${Number(content.encouragementsCount || 0) > 1 ? "s" : ""}</span>
                </div>
                <div class="profile-update-actions">
                    ${encourageButtonHtml}
                </div>
            </div>
            ${replyPanelHtml}
            ${managementHtml}
</article>
    `;
}

function buildProfileContentGroups(contents, allArcs = []) {
    const arcLookup = new Map((allArcs || []).map((arc) => [arc.id, arc]));
    const groups = new Map();
    const sortedContents = [...(contents || [])].sort(
        (left, right) =>
            getProfileContentTimeValue(right) -
            getProfileContentTimeValue(left),
    );

    sortedContents.forEach((content) => {
        const arcId = content?.arcId || content?.arc?.id || null;
        const projectId = content?.projectId || content?.project?.id || null;
        const key = arcId || projectId || "misc";
        if (!groups.has(key)) {
            const arc = arcId
                ? content.arc || arcLookup.get(arcId) || null
                : null;
            groups.set(key, {
                key,
                arcId,
                arc,
                title:
                    arc?.title || content?.project?.name || "Updates recentes",
                status: arc?.status || "active",
                contents: [],
            });
        }
        groups.get(key).contents.push(content);
    });

    return Array.from(groups.values()).sort((left, right) => {
        const leftTime = getProfileContentTimeValue(left.contents[0]);
        const rightTime = getProfileContentTimeValue(right.contents[0]);
        return rightTime - leftTime;
    });
}

function renderProfileOverviewContent(
    contents,
    {
        profileUserId,
        currentUserId,
        isAdminViewer = false,
        encouragedContentIds = new Set(),
        allArcs = [],
    } = {},
) {
    const safeContents = [...(contents || [])].sort(
        (left, right) =>
            getProfileContentTimeValue(right) -
            getProfileContentTimeValue(left),
    );
    if (safeContents.length === 0) {
        return `
            <section class="profile-content-empty">
                <h3>Aucune update publiee</h3>
                <p>Ce profil n'a pas encore partage de progression visible.</p>
            </section>
`;
    }

    const featuredContent = safeContents[0];
    const groups = buildProfileContentGroups(safeContents, allArcs);

    const groupsHtml = groups
        .map((group) => {
            const groupUpdates = group.contents.slice(0, 3);
            const latest = group.contents[0];
            const contributors = new Set(
                group.contents.map((item) => item.userId).filter(Boolean),
            ).size;
            const totalEncouragements = group.contents.reduce(
                (sum, item) => sum + (Number(item.encouragementsCount) || 0),
                0,
            );
            const groupMetaParts = [
                `${group.contents.length} update${group.contents.length > 1 ? "s" : ""}`,
                `${contributors} contributeur${contributors > 1 ? "s" : ""}`,
                `${totalEncouragements} encouragement${totalEncouragements > 1 ? "s" : ""}`,
            ];
            const headerAction = group.arcId
                ? `<button class="btn btn-secondary profile-update-link-btn" onclick="selectArc('${group.arcId}', '${profileUserId}')">Voir le projet</button>`
                : "";
            return `
                <section class="profile-update-group">
                    <div class="profile-update-group-head">
                        <div>
                            <h3>${escapeHtml(group.title)}</h3>
                            <p>${groupMetaParts.join(" · ")} · Derniere update ${timeAgo(latest.createdAt)}</p>
                        </div>
                        ${headerAction}
                    </div>
                    <div class="profile-update-group-grid">
                        ${groupUpdates
                            .map((content) =>
                                renderProfileUpdateCard(content, {
                                    profileUserId,
                                    currentUserId,
                                    isAdminViewer,
                                    encouragedContentIds,
                                    compact: true,
                                    selectedArcMode: false,
                                }),
                            )
                            .join("")}
                    </div>
                    ${
                        group.arcId && group.contents.length > 3
                            ? `<div class="profile-update-group-footer"><button class="btn btn-secondary profile-update-link-btn" onclick="selectArc('${group.arcId}', '${profileUserId}')">Voir les ${group.contents.length} updates</button></div>`
                            : ""
                    }
                </section>
            `;
        })
        .join("");

    return `
<section class="profile-content-overview">
            <div class="profile-content-heading">
                <div>
                    <h3>Contenu publie</h3>
                    <p>Les updates sont organisees par projet pour rendre la progression plus lisible.</p>
                </div>
                <div class="profile-content-summary">
                    <span>${safeContents.length} update${safeContents.length > 1 ? "s" : ""}</span>
                    <span>${groups.length} projet${groups.length > 1 ? "s" : ""}</span>
                </div>
            </div>

            <div class="timeline-latest profile-featured-update">
                <div class="timeline-item-latest profile-featured-shell">
                    <div class="profile-featured-header">
                        <span class="profile-section-kicker">Derniere publication</span>
                    </div>
                    ${renderProfileUpdateCard(featuredContent, {
                        profileUserId,
                        currentUserId,
                        isAdminViewer,
                        encouragedContentIds,
                        featured: true,
                        selectedArcMode: false,
                    })}
                </div>
            </div>

            <div class="profile-update-groups">
                ${groupsHtml}
            </div>
</section>
    `;
}

function renderProfileSelectedArcContent(
    selectedArc,
    contents,
    {
        profileUserId,
        currentUserId,
        isAdminViewer = false,
        encouragedContentIds = new Set(),
    } = {},
) {
    const safeContents = [...(contents || [])];
    if (safeContents.length === 0) {
        return `
            <section class="profile-project-focus">
                <div class="profile-arc-focus-header">
                    <div>
                        <span class="profile-section-kicker">Projet</span>
                        <h3>${escapeHtml(selectedArc?.title || "Projet")}</h3>
                        <p>Aucune update pour ce projet pour le moment.</p>
                    </div>
                    <button class="btn btn-secondary profile-update-link-btn" onclick="selectArc(null, '${profileUserId}')">Voir tout</button>
                </div>
            </section>
`;
    }

    const uniqueUsers = new Set(
        safeContents.map((item) => item.userId).filter(Boolean),
    );
    const sortByDay =
        uniqueUsers.size <= 1 &&
        safeContents.some((item) => Number(item.dayNumber) > 0);
    safeContents.sort((left, right) => {
        if (sortByDay) {
            return (
                (Number(right.dayNumber) || 0) - (Number(left.dayNumber) || 0)
            );
        }
        return (
            getProfileContentTimeValue(right) - getProfileContentTimeValue(left)
        );
    });

    const encouragements = safeContents.reduce(
        (sum, item) => sum + (Number(item.encouragementsCount) || 0),
        0,
    );
    const latestUpdate = safeContents[0];
    const metrics = [
        {
            label: "Updates",
            value: formatCompactCount(safeContents.length),
        },
        {
            label: "Encouragements",
            value: formatCompactCount(encouragements),
        },
        {
            label: "Contributeurs",
            value: formatCompactCount(uniqueUsers.size || 1),
        },
        {
            label: "Derniere",
            value: timeAgo(latestUpdate.createdAt),
        },
    ];

    return `
<section class="profile-project-focus">
            <div class="profile-arc-focus-header">
                <div>
                    <span class="profile-section-kicker">Projet selectionne</span>
                    <h3>${escapeHtml(selectedArc?.title || "Projet")}</h3>
                    <p>Vue detaillee des updates de ce projet, dans un ordre clair et coherent.</p>
                </div>
                <button class="btn btn-secondary profile-update-link-btn" onclick="selectArc(null, '${profileUserId}')">Revenir a tous les projets</button>
            </div>
            <div class="profile-arc-focus-metrics">
                ${metrics
                    .map(
                        (metric) => `
                            <div class="profile-arc-focus-metric">
                                <span>${metric.label}</span>
                                <strong>${metric.value}</strong>
                            </div>
                        `,
                    )
                    .join("")}
            </div>
            <div class="profile-project-updates">
                ${safeContents
                    .map(
                        (content) => `
                            <div class="profile-project-update profile-project-update--${content.state || "success"}">
                                <div class="timeline-dot-badge filled profile-project-update-dot">
                                    ${getProfileStateMeta(content.state).svg}
                                </div>
                                <div class="profile-project-update-body">
                                    ${renderProfileUpdateCard(content, {
                                        profileUserId,
                                        currentUserId,
                                        isAdminViewer,
                                        encouragedContentIds,
                                        selectedArcMode: true,
                                    })}
                                </div>
                            </div>
                        `,
                    )
                    .join("")}
            </div>
</section>
    `;
}

function buildProfileArcProgressSummaries(arcs = [], contents = []) {
    const groupedContent = new Map();

    (contents || []).forEach((content) => {
        const arcId = content?.arcId || content?.arc?.id || null;
        if (!arcId) return;

        if (!groupedContent.has(arcId)) {
            groupedContent.set(arcId, {
                updates: 0,
                uniqueDays: new Set(),
                latestMs: 0,
            });
        }

        const entry = groupedContent.get(arcId);
        entry.updates += 1;

        const dayNumber = Number(content.dayNumber || content.day_number || 0);
        if (Number.isFinite(dayNumber) && dayNumber > 0) {
            entry.uniqueDays.add(dayNumber);
        }

        entry.latestMs = Math.max(
            entry.latestMs,
            getProfileContentTimeValue(content),
        );
    });

    const statusRank = {
        in_progress: 0,
        active: 0,
        completed: 1,
        abandoned: 2,
    };

    return (arcs || [])
        .map((arc) => {
            const stats = groupedContent.get(arc.id) || {
                updates: 0,
                uniqueDays: new Set(),
                latestMs: 0,
            };
            const duration = Number(arc.duration_days || 0);
            const completedDays = stats.uniqueDays.size;
            const fallbackProgress = Math.min(100, stats.updates * 8);
            const progress =
                duration > 0
                    ? Math.min(
                          100,
                          Math.round((completedDays / duration) * 100),
                      )
                    : fallbackProgress;

            return {
                arc,
                updates: stats.updates,
                completedDays,
                duration,
                latestMs: stats.latestMs,
                latestLabel: stats.latestMs
                    ? timeAgo(new Date(stats.latestMs).toISOString())
                    : "Aucune update",
                progress,
            };
        })
        .sort((left, right) => {
            const leftRank = statusRank[left.arc?.status] ?? 1;
            const rightRank = statusRank[right.arc?.status] ?? 1;
            if (leftRank !== rightRank) return leftRank - rightRank;
            return right.latestMs - left.latestMs;
        });
}

function renderProfileProjectProgressBoard(arcs, contents, profileUserId) {
    const summaries = buildProfileArcProgressSummaries(arcs, contents);
    if (summaries.length === 0) return "";

    const statusLabels = {
        in_progress: "En cours",
        completed: "Terminé",
        abandoned: "Abandonné",
    };

    return `
<section class="profile-progress-board">
            <div class="profile-progress-board-grid">
                ${summaries
                    .slice(0, 4)
                    .map((item) => {
                        const arc = item.arc || {};
                        const isActive = window.selectedArcId === arc.id;
                        const statusLabel =
                            statusLabels[arc.status] || arc.status || "Projet";
                        const dayLabel = item.duration
                            ? `${item.completedDays}/${item.duration} jours documentés`
                            : `${item.updates} update${item.updates > 1 ? "s" : ""}`;
                        return `
                            <button
                                type="button"
                                class="profile-progress-project ${isActive ? "is-active" : ""}"
                                onclick="selectArc('${arc.id}', '${profileUserId}')"
                            >
                                <span class="profile-progress-project-status">${escapeHtml(statusLabel)}</span>
                                <strong>${escapeHtml(arc.title || "Projet")}</strong>
                                <span class="profile-progress-project-goal">${escapeHtml(arc.goal || "Progression en cours")}</span>
                                <span class="profile-progress-track" aria-hidden="true">
                                    <span style="width:${item.progress}%"></span>
                                </span>
                                <span class="profile-progress-project-meta">
                                    <span>${dayLabel}</span>
                                    <span>${item.latestLabel}</span>
                                </span>
                            </button>
                        `;
                    })
                    .join("")}
            </div>
</section>
    `;
}

window.toggleProfileAnnouncementReplies = toggleProfileAnnouncementReplies;
window.submitAnnouncementReply = submitAnnouncementReply;

/* ========================================
   RENDERING - DISCOVER GRID
   ======================================== */

window.discoverFilter = "all";

function setDiscoverFilter(filter = "all", { render = true } = {}) {
    window.discoverFilter = filter;

    // Réinitialiser la pagination quand on change de filtre
    discoverPaginationState.allItems = [];
    discoverPaginationState.currentPage = 0;
    discoverPaginationState.hasMore = false;
    discoverPaginationState.error = null;
    discoverPaginationState.sentinel?.remove();
    discoverPaginationState.status?.remove();
    discoverPaginationState.sentinel = null;
    discoverPaginationState.status = null;
    if (discoverPaginationState.intersectionObserver) {
        discoverPaginationState.intersectionObserver.disconnect();
        discoverPaginationState.intersectionObserver = null;
    }

    // Update UI buttons
    document.querySelectorAll(".discover-filter .filter-btn").forEach((btn) => {
        const isActive = btn.dataset.filter === filter;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    if (render) renderDiscoverGrid();
}

window.toggleDiscoverFilter = function (filter) {
    setDiscoverFilter(filter, { render: true });
};

window.loadNextDiscoverPage = loadNextDiscoverPage;
window.setupDiscoverPaginationObserver = setupDiscoverPaginationObserver;

function showDiscoverSkeleton(grid, count = 8, options = {}) {
    if (!grid) return;
    const showSlowNotice =
        options.showSlowNotice === true || window.initialDataSlow === true;
    const noticeMessage =
        options.message ||
        window.initialDataSlowMessage ||
        SLOW_CONNECTION_MESSAGE;
    const slowNoticeHtml = showSlowNotice
        ? `<div class="discover-slow-connection" role="status" aria-live="polite">${escapeHtml(
              noticeMessage,
          )}</div>`
        : "";
    const skeletons = Array.from({ length: count })
        .map(
            (_, index) => `
            <article class="discover-skeleton-card" aria-hidden="true">
                <div class="discover-skeleton-media"></div>
                <div class="discover-skeleton-body">
                    <div class="discover-skeleton-line discover-skeleton-line--title"></div>
                    <div class="discover-skeleton-line"></div>
                    <div class="discover-skeleton-meta">
                        <span class="discover-skeleton-avatar"></span>
                        <span class="discover-skeleton-line discover-skeleton-line--small"></span>
                    </div>
                </div>
            </article>
        `,
        )
        .join("");
    grid.innerHTML = `${slowNoticeHtml}<div class="discover-skeleton-grid">${skeletons}</div>`;
}

function getDiscoverSectionTitle(filter, section) {
    if (filter === "live") return "En direct";
    if (filter === "video") return "Vidéos récentes";
    if (filter === "image") return "Images et preuves";
    if (filter === "projects") return "Projets";
    if (filter === "recent") return "Récent";
    if (filter === "following") return "Tes trajectoires suivies";
    if (section === "live") return "En direct maintenant";
    return "À explorer";
}

function buildDiscoverSectionItem(filter, section, count) {
    const title = getDiscoverSectionTitle(filter, section);
    const sub =
        section === "live"
            ? "Sessions actives à rejoindre"
            : filter === "following"
              ? "Les créateurs que tu suis"
              : filter === "projects"
                ? "Trajectoires structurées par projet"
                : filter === "recent"
                  ? "Dernières preuves publiées"
                  : "Recommandé selon l'activité récente";
    return {
        key: `section-${filter}-${section}`,
        type: "section",
        html: `
            <div class="discover-section-divider" role="presentation">
                <span>${title}</span>
                <small>${sub}${count ? ` · ${count}` : ""}</small>
            </div>
        `,
    };
}

function matchesDiscoverFilter(item, currentFilter, followedSet = new Set()) {
    if (!item) return false;
    const userId =
        item.user?.id || item.content?.userId || item.stream?.user_id;
    if (currentFilter === "following") return userId && followedSet.has(userId);
    if (currentFilter === "live") return item.type === "live";
    if (currentFilter === "video") {
        return item.type !== "live" && item.content?.type === "video";
    }
    if (currentFilter === "image") {
        return item.type !== "live" && item.content?.type === "image";
    }
    if (currentFilter === "projects") {
        return item.type !== "live" && Boolean(item.arcId || item.content?.arc);
    }
    if (currentFilter === "recent") return item.type !== "live";
    return true;
}

function partitionDiscoverItems(items, currentFilter) {
    const filtered = Array.isArray(items) ? items : [];
    if (currentFilter === "all") {
        return [
            {
                section: "live",
                items: filtered.filter((item) => item.type === "live"),
            },
            {
                section: "explore",
                items: filtered.filter((item) => item.type !== "live"),
            },
        ].filter((group) => group.items.length > 0);
    }
    return [
        {
            section: currentFilter,
            items: filtered,
        },
    ].filter((group) => group.items.length > 0);
}

const DISCOVER_VERIFIED_MIX_PATTERNS = [
    [
        { kind: "verified", count: 1 },
        { kind: "non_verified", count: 2 },
        { kind: "verified", count: 3 },
        { kind: "non_verified", count: 1 },
        { kind: "verified", count: 2 },
    ],
    [
        { kind: "verified", count: 2 },
        { kind: "non_verified", count: 1 },
        { kind: "verified", count: 2 },
        { kind: "non_verified", count: 1 },
        { kind: "verified", count: 2 },
        { kind: "non_verified", count: 1 },
    ],
    [
        { kind: "verified", count: 3 },
        { kind: "non_verified", count: 1 },
        { kind: "verified", count: 1 },
        { kind: "non_verified", count: 1 },
        { kind: "verified", count: 2 },
        { kind: "non_verified", count: 1 },
    ],
    [
        { kind: "verified", count: 1 },
        { kind: "non_verified", count: 1 },
        { kind: "verified", count: 2 },
        { kind: "non_verified", count: 1 },
        { kind: "verified", count: 3 },
        { kind: "non_verified", count: 1 },
    ],
    [
        { kind: "verified", count: 2 },
        { kind: "non_verified", count: 2 },
        { kind: "verified", count: 3 },
        { kind: "non_verified", count: 1 },
        { kind: "verified", count: 1 },
    ],
];

let discoverMixChaosSeed = Math.max(1, Math.floor(Math.random() * 2147483646));

function nextDiscoverMixRandom() {
    discoverMixChaosSeed = (discoverMixChaosSeed * 48271) % 2147483647;
    return (discoverMixChaosSeed - 1) / 2147483646;
}

function isVerifiedDiscoverUser(user) {
    if (!user || !user.id) return false;
    return isVerifiedCreatorUserId(user.id) || isVerifiedStaffUserId(user.id);
}

function getDiscoverLatestTime(user) {
    if (!user || !user.id) return 0;
    const latest = getLatestContent(user.id);
    if (!latest || !latest.createdAt) return 0;
    const t = new Date(latest.createdAt).getTime();
    return Number.isFinite(t) ? t : 0;
}

function sortUsersByLatestRecency(users) {
    return [...(users || [])].sort(
        (a, b) => getDiscoverLatestTime(b) - getDiscoverLatestTime(a),
    );
}

function getDiscoverContentTime(content) {
    if (!content) return 0;
    const rawDate =
        content.createdAt || content.created_at || content.started_at || null;
    if (!rawDate) return 0;
    const t = new Date(rawDate).getTime();
    return Number.isFinite(t) ? t : 0;
}

function buildDiscoverArcCardEntries(users, pages = []) {
    const entries = [];

    const appendAuthorEntries = (user, contents, authorType, authorId) => {
        if (!user?.id || !Array.isArray(contents) || contents.length === 0) {
            return;
        }

        const latestByArc = new Map();
        contents.forEach((content) => {
            if (!content || !content.contentId) return;
            const arcId = content.arcId || content.arc?.id || null;
            const identityKey = authorType + ":" + authorId;
            const arcKey =
                identityKey + ":" + (arcId ? "arc-" + arcId : "no-arc");
            const existing = latestByArc.get(arcKey);
            if (
                !existing ||
                getDiscoverContentTime(content) >
                    getDiscoverContentTime(existing)
            ) {
                latestByArc.set(arcKey, content);
            }
        });

        latestByArc.forEach((content, arcKey) => {
            entries.push({
                type: "arc",
                user,
                content,
                authorType,
                authorId,
                arcId: content.arcId || content.arc?.id || null,
                arcKey,
                verified:
                    authorType === "PAGE_PRO"
                        ? isVerifiedProfessionalPagePost({ content })
                        : isVerifiedDiscoverUser(user),
                tags: Array.isArray(content.tags) ? content.tags : [],
            });
        });
    };

    (users || []).forEach((user) => {
        if (!user || !user.id) return;
        const contents = getUserContentLocal(user.id);
        if (!contents || contents.length === 0) return;

        appendAuthorEntries(user, contents, "USER", user.id);
    });

    (pages || []).forEach((page) => {
        if (!page?.id) return;
        const owner = getUser(page.owner_id) || {
            id: page.owner_id || page.id,
            name: page.name || "Page professionnelle",
            avatar: page.avatar_url || "icons/enterprise.svg",
            title: page.industry || "",
        };
        appendAuthorEntries(
            owner,
            getPageContentLocal(page.id),
            "PAGE_PRO",
            String(page.id),
        );
    });

    return entries.sort(
        (a, b) =>
            getDiscoverContentTime(b.content) -
            getDiscoverContentTime(a.content),
    );
}

function shuffleWithChaos(input) {
    const arr = [...input];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(nextDiscoverMixRandom() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function consumeUsersFromPool(pool, count, target) {
    let taken = 0;
    while (taken < count && pool.length > 0) {
        target.push(pool.shift());
        taken += 1;
    }
    return taken;
}

/* ========================================
   MOOD ENGINE (Discover)
   ======================================== */

const MOOD_STORAGE_KEY_PREFIX = "rize:mood:v1:";
const MOOD_MAX_TAGS = 160;

function sanitizeTag(tag) {
    if (!tag) return null;
    return tag.toString().trim().toLowerCase();
}

function loadMoodProfile(userId) {
    if (!userId) return { tags: {}, updatedAt: Date.now() };
    try {
        const raw = localStorage.getItem(`${MOOD_STORAGE_KEY_PREFIX}${userId}`);
        if (!raw) return { tags: {}, updatedAt: Date.now() };
        const parsed = JSON.parse(raw);
        return {
            tags: parsed?.tags || {},
            updatedAt: parsed?.updatedAt || Date.now(),
        };
    } catch (e) {
        return { tags: {}, updatedAt: Date.now() };
    }
}

function saveMoodProfile(userId, profile) {
    if (!userId || !profile) return;
    try {
        localStorage.setItem(
            `${MOOD_STORAGE_KEY_PREFIX}${userId}`,
            JSON.stringify(profile),
        );
    } catch (e) {
        // ignore quota errors
    }
}

function adjustMoodScores(tags = [], delta = 1) {
    if (!currentUser || !Array.isArray(tags)) return;
    const userId = currentUser.id;
    const profile = loadMoodProfile(userId);
    tags.map(sanitizeTag)
        .filter(Boolean)
        .forEach((tag) => {
            profile.tags[tag] = (profile.tags[tag] || 0) + delta;
        });
    // trim to top tags only
    const entries = Object.entries(profile.tags).sort(
        (a, b) => (b[1] || 0) - (a[1] || 0),
    );
    const trimmed = entries.slice(0, MOOD_MAX_TAGS);
    profile.tags = Object.fromEntries(trimmed);
    profile.updatedAt = Date.now();
    saveMoodProfile(userId, profile);
}

function getMoodTopTags(userId, limit = 3) {
    const profile = loadMoodProfile(userId);
    return Object.entries(profile.tags)
        .sort((a, b) => (b[1] || 0) - (a[1] || 0))
        .slice(0, limit)
        .map(([tag, score]) => ({ tag, score }));
}

function getMoodTagScoreMap(userId) {
    const profile = loadMoodProfile(userId);
    return profile.tags || {};
}

function hasMoodMatch(itemTags = [], moodSet) {
    if (!moodSet || moodSet.size === 0) return false;
    return itemTags.some((t) => moodSet.has(sanitizeTag(t)));
}

function normalizeDiscoverItemForImmersiveScore(item) {
    const content = item?.content || item?.stream || {};
    const arcStageLevel =
        content.arcStageLevel ||
        content.arc_stage_level ||
        content.arc?.stageLevel ||
        content.arc?.stage_level ||
        content.arc?.level ||
        null;
    const arcOpportunityIntents =
        content.opportunityIntents ||
        content.opportunity_intents ||
        content.arcOpportunityIntents ||
        content.arc_opportunity_intents ||
        content.arc?.opportunityIntents ||
        content.arc?.opportunity_intents ||
        [];
    return {
        contentId:
            content.contentId ||
            content.id ||
            (item?.type === "live" && item?.stream?.id
                ? `live-${item.stream.id}`
                : null),
        userId: item?.user?.id || content.user_id || content.userId || null,
        type:
            item?.type === "live"
                ? "live"
                : content.type || item?.type || "text",
        state: content.state || "success",
        tags: Array.isArray(content.tags)
            ? content.tags.map(sanitizeTag).filter(Boolean)
            : [],
        title: content.title || "",
        description: content.description || "",
        createdAt:
            content.createdAt ||
            content.created_at ||
            content.started_at ||
            Date.now(),
        arcId: content.arcId || content.arc_id || content.arc?.id || null,
        isValidatedPro: !!content.isValidatedPro,
        arcStageLevel: arcStageLevel,
        arcOpportunityIntents: Array.isArray(arcOpportunityIntents)
            ? arcOpportunityIntents
            : typeof arcOpportunityIntents === "string"
              ? arcOpportunityIntents
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
              : [],
        encouragementsCount: content.encouragementsCount || 0,
        views: content.views || 0,
        viewer_count: content.viewer_count || 0,
    };
}

function interleaveDiscoverByCreator(scoredItems) {
    const buckets = new Map();
    scoredItems.forEach((entry) => {
        const creatorId = entry?.normalized?.userId || "unknown";
        if (!buckets.has(creatorId)) buckets.set(creatorId, []);
        buckets.get(creatorId).push(entry);
    });

    const result = [];
    let added = true;
    while (added) {
        added = false;
        for (const [, list] of buckets.entries()) {
            if (list.length > 0) {
                result.push(list.shift());
                added = true;
            }
        }
    }
    return result;
}

function handleDiscoverInterest(contentId, action) {
    const content = findContentById(contentId);
    if (!content) return;
    const tags = Array.isArray(content.tags) ? content.tags : [];
    const delta = action === "dislike" ? -1.5 : 2.2;
    adjustMoodScores(tags, delta);
    updateImmersivePrefs(content, action === "dislike" ? "dislike" : "like");
    if (action === "dislike") {
        ToastManager?.info(
            "Flux ajusté",
            "Nous vous montrerons moins ce sujet.",
        );
    } else {
        ToastManager?.success("Noté", "Nous priorisons davantage ce sujet.");
    }
}
window.handleDiscoverInterest = handleDiscoverInterest;

async function handleDiscoverQuickAction(contentId, action, userId = null) {
    if (!contentId || !action) return;
    const content = findContentById(contentId);
    if (action === "more" || action === "less") {
        handleDiscoverInterest(
            contentId,
            action === "less" ? "dislike" : "like",
        );
        return;
    }

    if (action === "share") {
        const title = content?.title || "Trajectoire XERA";
        const url = userId
            ? buildProfileShareUrl(userId)
            : new URL(window.location.href).toString();
        try {
            if (navigator.share) {
                await navigator.share({
                    title,
                    text: `Découvre cette trajectoire sur XERA: ${title}`,
                    url,
                });
                return;
            }
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
                ToastManager?.success?.(
                    "Lien copié",
                    "La trajectoire est prête à partager.",
                );
            }
        } catch (error) {
            console.warn("Discover share failed:", error);
        }
    }
}
window.handleDiscoverQuickAction = handleDiscoverQuickAction;

async function getPublicProfessionalPageOwnerIds() {
    try {
        const { data, error } = await supabase
            .from("professional_pages")
            .select("owner_id")
            .not("owner_id", "is", null);
        if (error) throw error;
        return new Set(
            (data || []).map((page) => page.owner_id).filter(Boolean),
        );
    } catch (error) {
        console.warn(
            "Impossible de charger les propriétaires des Pages Pro publiques:",
            error,
        );
        return new Set();
    }
}
function isVerifiedProfessionalPagePost(item) {
    const pageId = item?.content?.pageId || item?.content?.page_id;
    return Boolean(
        pageId &&
        typeof window.isVerifiedPageId === "function" &&
        window.isVerifiedPageId(pageId),
    );
}

function buildMoodDiscoverMix(
    discoverArcCards,
    liveStreams = [],
    followedSet = new Set(),
) {
    const arcCards = (discoverArcCards || []).filter(
        (entry) => entry?.content && entry?.user?.id,
    );

    const liveItems = (liveStreams || [])
        .map((stream) => {
            const user = getUser(stream.user_id);
            if (!user) return null;
            return {
                type: "live",
                stream,
                user,
                verified: isVerifiedDiscoverUser(user),
                tags: stream.tags || [],
                content: {
                    ...stream,
                    createdAt:
                        stream.created_at || stream.started_at || Date.now(),
                    tags: stream.tags || [],
                },
            };
        })
        .filter(Boolean);

    const allItems = arcCards.map((entry) => ({
        type: "arc",
        user: entry.user,
        content: entry.content,
        arcId: entry.arcId || null,
        arcKey: entry.arcKey || null,
        verified:
            isVerifiedDiscoverUser(entry.user) ||
            isVerifiedProfessionalPagePost({ content: entry.content }),
        tags: Array.isArray(entry.content.tags) ? entry.content.tags : [],
    }));

    allItems.push(...liveItems);

    if (!currentUser || allItems.length < 3) {
        return [...allItems].sort(
            (left, right) =>
                Number(isVerifiedProfessionalPagePost(right)) -
                Number(isVerifiedProfessionalPagePost(left)),
        );
    }

    const prefs = loadImmersivePrefs();
    const authorScoreMap = buildAuthorScoreMapFromContents();
    const now = Date.now();
    const viewerRole = getCurrentViewerDiscoveryRole();
    const topQueries = Object.entries(prefs.queries || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([token, score]) => ({ token, score }));

    const scored = allItems.map((item) => {
        const normalized = normalizeDiscoverItemForImmersiveScore(item);
        const { score, preferenceScore } = scoreImmersiveContent(normalized, {
            prefs,
            followedSet,
            authorScoreMap,
            isVerifiedUserId: (userId) =>
                isVerifiedCreatorUserId(userId) ||
                isVerifiedStaffUserId(userId),
            now,
            topQueries,
            viewerRole,
        });
        const weightedScore = isVerifiedProfessionalPagePost(item)
            ? score * 10
            : score;
        return {
            item,
            normalized,
            score: weightedScore,
            preferenceScore,
        };
    });

    scored.sort((a, b) => b.score - a.score);
    scored.forEach((entry, index) => {
        const isPreferenceAligned =
            (entry.preferenceScore || 0) > IMMERSIVE_PREF_ALIGNMENT_THRESHOLD;
        const isTopAlgorithmPick = index < Math.min(3, scored.length);
        entry.item.__discoverPreferred =
            isPreferenceAligned || isTopAlgorithmPick;
    });
    const interleaved = interleaveDiscoverByCreator(scored);
    return interleaved.map((entry) => entry.item);
}

function renderUserCard(
    userId,
    isFollowing = false,
    isEncouraged = false,
    latestContentOverride = null,
    layoutOptions = {},
) {
    const latestContent = latestContentOverride || getLatestContent(userId);
    if (!latestContent) return "";

    const author = getContentAuthorIdentity(latestContent);
    const isProPost = author.type === "PAGE_PRO";
    const pageId = isProPost ? author.id : null;
    const page =
        pageId &&
        (professionalPagesById.get(pageId) ||
            window.professionalManager?.proPagesCache?.get(pageId));
    const user =
        getUser(userId) ||
        (isProPost
            ? {
                  id: latestContent.userId || userId,
                  name: page?.name || "Page professionnelle",
                  avatar: page?.avatar_url || "icons/enterprise.svg",
              }
            : null);
    if (!user) return "";

    const displayUser = isProPost
        ? {
              id: pageId,
              name: page?.name || "Page professionnelle",
              avatar: page?.avatar_url || "icons/enterprise.svg",
              title: page?.industry || "",
              slug: page?.slug || "",
              isPage: true,
          }
        : { ...user, isPage: false };

    const proBadgeHtml = isProPost
        ? `<span class="pro-official-badge" style="background: #000; color: #fff; font-size: 0.65rem; padding: 2px 8px; border-radius: 4px; font-weight: 900; margin-left: 8px; border: 1px solid rgba(255,255,255,0.2); vertical-align: middle; display: inline-block;">PRO</span>`
        : "";

    // Use the specific content's state, not the dominant state
    let contentState = latestContent.state || "pause";
    let stateLabel =
        contentState === "success"
            ? "Victoire"
            : contentState === "failure"
              ? "Bloqué"
              : "Pause";
    let stateColor =
        contentState === "success"
            ? "#10b981"
            : contentState === "failure"
              ? "#ef4444"
              : "#6366f1";

    // --- PERSONNALISATION PRO (Actualités / Événements) ---
    if (isProPost) {
        const subType = latestContent.metadata?.sub_type;
        if (subType === "news") {
            stateLabel = "Actualité";
            stateColor = "#f97316"; // Orange
        } else if (subType === "event") {
            stateLabel = "Événement";
            stateColor = "#a855f7"; // Violet
        }
    }

    const stateClass =
        contentState === "success"
            ? "is-success"
            : contentState === "failure"
              ? "is-failure"
              : "is-paused";

    const badgesHtml = isProPost
        ? renderVerifiedPageBadge(pageId)
        : renderUserBadges(userId);
    const monetizationBadgeHtml =
        !isProPost && typeof window.generatePlanBadgeHTML === "function"
            ? window.generatePlanBadgeHTML(user, "feed")
            : "";
    const supportButtonHtml =
        !isProPost &&
        currentUser &&
        currentUser.id !== userId &&
        typeof window.generateSupportButtonHTML === "function"
            ? window.generateSupportButtonHTML(user, "feed")
            : "";

    const tags = Array.isArray(latestContent.tags) ? latestContent.tags : [];
    const collabCornerHtml = buildArcCollaboratorCornerAvatars(latestContent, {
        size: 18,
        max: 3,
        className: "arc-collab-avatars--card-corner",
        fromImmersive: false,
    });
    const supportOverlayHtml =
        supportButtonHtml && latestContent?.type !== "text"
            ? `<div class="support-overlay support-overlay--feed${collabCornerHtml ? " support-overlay--stacked" : ""}">${supportButtonHtml}</div>`
            : "";
    const supportInlineHtml =
        !latestContent?.mediaUrl && !(latestContent?.mediaUrls || []).length
            ? supportButtonHtml
            : "";
    const mediaList = Array.isArray(latestContent.mediaUrls)
        ? latestContent.mediaUrls.filter(Boolean)
        : [];
    if (mediaList.length === 0 && latestContent.mediaUrl) {
        mediaList.push(latestContent.mediaUrl);
    }
    const hasMedia = mediaList.length > 0;
    const hasMultiImages =
        mediaList.length > 1 && latestContent.type !== "video";
    const primaryMediaUrl = hasMedia ? mediaList[0] : "";

    let mediaHtml = "";
    if (hasMedia) {
        if (latestContent.type === "video") {
            mediaHtml = `
                <div class="card-media-wrap card-media-wrap--editorial">
                    <video id="video-${userId}" class="card-media" src="${primaryMediaUrl}" muted playsinline webkit-playsinline autoplay preload="metadata" tabindex="-1" data-user-id="${userId}" data-content-id="${latestContent.contentId}" disablePictureInPicture></video>
                    <div class="video-fallback">
                        <img src="icons/play.svg" alt="Play" width="40" height="40">
                        <span>Vidéo</span>
                    </div>
                    <div class="discover-video-progress" aria-hidden="true"><span></span></div>
                    ${collabCornerHtml}
                    ${supportOverlayHtml}
                    <div class="card-stats-overlay">
                            <div class="stat-pill">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            <span title="${(Number(latestContent.views) || 0).toLocaleString("fr-FR")}">${formatCompactCount(latestContent.views || 0)}</span>
                        </div>
                    </div>
                </div>
            `;
        } else if (
            latestContent.type === "image" ||
            latestContent.type === "text"
        ) {
            if (hasMultiImages) {
                const slides = mediaList
                    .map(
                        (url, index) =>
                            `<div class="xera-carousel-slide"><img class="card-media" ${index === 0 ? `src="${url}"` : `data-src="${url}"`} alt="${latestContent.title || "Preview"}" loading="lazy" decoding="async" data-content-id="${latestContent.contentId}"></div>`,
                    )
                    .join("");
                const dots = `<div class="xera-carousel-dots">${mediaList
                    .map(
                        (_, i) =>
                            `<span class="xera-dot ${i === 0 ? "active" : ""}" data-index="${i}"></span>`,
                    )
                    .join("")}</div>`;
                mediaHtml = `
                    <div class="card-media-wrap card-media-wrap--editorial has-multi-media">
                        <div class="xera-carousel" data-carousel>
                            <div class="xera-carousel-track">${slides}</div>
                            <button type="button" class="xera-carousel-arrow xera-carousel-arrow--prev" aria-label="Image précédente">&lsaquo;</button>
                            <button type="button" class="xera-carousel-arrow xera-carousel-arrow--next" aria-label="Image suivante">&rsaquo;</button>
                            <div class="card-media-count" aria-label="${mediaList.length} images dans ce post">
                                <span data-carousel-current>1</span>/<span data-carousel-total>${mediaList.length}</span>
                            </div>
                            ${dots}
                        </div>
                        ${collabCornerHtml}
                        ${supportOverlayHtml}
                        <div class="card-stats-overlay">
                            <div class="stat-pill">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8  -4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                <span title="${(Number(latestContent.views) || 0).toLocaleString("fr-FR")}">${formatCompactCount(latestContent.views || 0)}</span>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                mediaHtml = `
                    <div class="card-media-wrap card-media-wrap--editorial">
                        <img class="card-media" src="${primaryMediaUrl}" alt="${latestContent.title || "Preview"}" loading="lazy" decoding="async" data-content-id="${latestContent.contentId}">
                        ${collabCornerHtml}
                        ${supportOverlayHtml}
                        <div class="card-stats-overlay">
                            <div class="stat-pill">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8  -4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                <span title="${(Number(latestContent.views) || 0).toLocaleString("fr-FR")}">${formatCompactCount(latestContent.views || 0)}</span>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
    }

    const isAnnouncement = isAnnouncementContent(latestContent);
    const replyCount = isAnnouncement
        ? getReplyCount(latestContent.contentId)
        : 0;

    const isVerifiedUser = isProPost
        ? Boolean(window.isVerifiedPageId?.(pageId))
        : isVerifiedCreatorUserId(userId) || isVerifiedStaffUserId(userId);

    const isTextContent =
        latestContent && (!hasMedia || latestContent.type === "text");

    let textHtml = "";
    if (isTextContent) {
        const textBody =
            latestContent.description ||
            latestContent.title ||
            "Nouveau post texte";
        textHtml = `
            <div class="card-text">
                <p class="card-text-body">${textBody}</p>
            </div>
`;
    }

    // Momentum badge removed
    const momentumBadgeHtml = ``;

    // Déterminer la classe CSS selon le type de média pour l'adaptation
    const verifiedClass = isVerifiedUser ? " verified-card" : "";
    const mediaTypeClass = latestContent?.type || "text";
    const preferredClass = layoutOptions.isPreferred
        ? " editorial-card--preferred"
        : "";
    const proCardClass = isProPost ? " pro-card" : "";
    const cardClass = hasMedia
        ? `user-card editorial-card has-media ${mediaTypeClass}${verifiedClass}${preferredClass}${proCardClass} editorial-card--${mediaTypeClass} editorial-card--${contentState}`
        : `user-card editorial-card ${isTextContent ? "text-card" : ""}${verifiedClass}${preferredClass}${proCardClass} editorial-card--text editorial-card--${contentState}`;

    // Ajout information ARC
    let arcInfo = "";
    if (latestContent && latestContent.arc) {
        arcInfo = `
            <div class="card-arc-info">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                <span>
                    ${latestContent.arc.title}
                </span>
            </div>
        `;
    }

    // Validation Pro (Seal of Approval)
    const sealOfApprovalHtml = window.professionalManager
        ? window.professionalManager.renderSealOfApproval(latestContent)
        : "";

    // Subscribe Button
    let subscribeBtn = "";
    if (!isProPost && currentUser && currentUser.id !== userId) {
        const btnClass = isFollowing
            ? "btn-follow-card unfollow"
            : "btn-follow-card";
        // const btnText = isFollowing ? 'Abonné' : 'S\'abonner'; // REMOVED
        const btnTitle = isFollowing ? "Se désabonner" : "S'abonner";
        const iconSrc = isFollowing
            ? "icons/subscribed.svg"
            : "icons/subscribe.svg";

        subscribeBtn = `
            <button class="${btnClass}" onclick="event.stopPropagation(); toggleFollow('${currentUser.id}', '${userId}')" title="${btnTitle}" data-follow-card-user="${userId}" data-follow-card-content="${latestContent.contentId}" style="
                background: transparent; 
                border: none;
                padding: 0;
                display: flex; 
                align-items: center; 
                justify-content: center; 
                cursor: pointer;
                margin-left: auto;
                transition: all 0.2s;
            ">
                <img src="${iconSrc}" class="btn-icon" style="width: 24px; height: 24px;">
            </button>
`;
    }

    // Courage Button
    const courageIcon = isEncouraged
        ? "icons/courage-green.svg"
        : "icons/courage-blue.svg";
    const courageClass = isEncouraged
        ? "courage-btn encouraged"
        : "courage-btn";

    const collabAvatarsHtml = buildArcCollaboratorAvatars(latestContent, {
        size: 20,
        className: "arc-collab-avatars--card",
        fromImmersive: false,
    });

    // User Info (Name, Avatar, Subscribe) - Moved to bottom
    const profileOnClick = displayUser.isPage
        ? `window.openProfessionalPageById('${escapeHtml(pageId)}')`
        : `handleProfileClick('${userId}', this)`;
    const profileIdentityAttribute = displayUser.isPage
        ? `data-profile-page-id="${escapeHtml(pageId)}"`
        : `data-profile-user-id="${escapeHtml(userId)}"`;

    const userInfoHtml = `
<div class="card-user-bottom">
            <button class="profile-link card-profile-link" data-profile-author-type="${displayUser.isPage ? "PAGE_PRO" : "USER"}" ${profileIdentityAttribute} onclick="event.preventDefault(); event.stopPropagation(); ${profileOnClick}" type="button" aria-label="Voir ${displayUser.isPage ? "la Page Pro" : "le profil"} de ${escapeHtml(displayUser.name || "cet utilisateur")}">
                <img src="${displayUser.avatar || "https://placehold.co/40"}" class="card-avatar" loading="lazy" decoding="async">
                <div class="profile-link-text">
                    <h3 class="discover-user-name">${renderUsernameWithBadge(displayUser.name, displayUser.isPage ? pageId : userId, displayUser.isPage)}${proBadgeHtml}${monetizationBadgeHtml}</h3>
                    ${momentumBadgeHtml}
                    <div class="card-user-title">${displayUser.title || ""}</div>
                </div>
            </button>
            ${collabAvatarsHtml}
            ${subscribeBtn}
</div>
    `;

    // Add stats overlay CSS if needed (inline for now)
    const statsStyles = `
<style>
.card-stats-overlay {
            position: absolute;
            top: 10px;
            right: 10px;
            display: flex;
            gap: 5px;
            pointer-events: none;
}
.stat-pill {
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(4px);
            padding: 4px 8px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 0.75rem;
            color: white;
            font-weight: 600;
}
.courage-btn {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 20px;
            padding: 4px 10px;
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            transition: all 0.2s;
            color: var(--text-secondary);
            font-size: 0.8rem;
            margin-top: 0.5rem;
}
.courage-btn:hover {
            background: rgba(255,255,255,0.1);
}
.courage-btn.encouraged {
            background: rgba(139, 92, 246, 0.1);
            border-color: rgba(139, 92, 246, 0.3);
            color: #10b981;
}
.editorial-card.pro-card {
    border: 2px solid #000 !important;
    box-shadow: 0 10px 30px rgba(0,0,0,0.25) !important;
}
.pro-card .card-media-wrap::after {
    content: "OFFICIEL";
    position: absolute;
    top: 10px;
    left: 10px;
    background: #ef4444; /* Rouge */
    color: #fff;
    font-size: 0.6rem;
    font-weight: 900;
    padding: 3px 8px;
    border-radius: 4px;
    letter-spacing: 1px;
    z-index: 10;
}
</style>
    `;

    // Only inject style once
    if (!document.getElementById("card-stats-style")) {
        document.head.insertAdjacentHTML(
            "beforeend",
            statsStyles.replace("<style>", '<style id="card-stats-style">'),
        );
    }

    const dayBadge =
        !isAnnouncement &&
        latestContent &&
        typeof latestContent.dayNumber === "number" &&
        latestContent.dayNumber > 0
            ? `<span class="status-day">J-${latestContent.dayNumber}</span>`
            : "";

    const tagDataset =
        tags.length > 0 ? tags.map(sanitizeTag).filter(Boolean).join(",") : "";

    const liveCta =
        latestContent?.type === "live"
            ? `<button class="btn-live-join" onclick="event.stopPropagation(); openLiveStreamForUser('${userId}', '${escapeHtml(latestContent.title || "Live en cours")}')">
                    🔴 Rejoindre le live
               </button>`
            : "";

    const quickActionsHtml = `
        <div class="discover-card-actions" onclick="event.stopPropagation();">
            <button type="button" class="discover-card-action-trigger" aria-label="Actions rapides" title="Actions rapides">•••</button>
            <div class="discover-card-action-menu">
                <button type="button" onclick="handleDiscoverQuickAction('${latestContent.contentId}', 'more', '${userId}')">Plus comme ça</button>
                <button type="button" onclick="handleDiscoverQuickAction('${latestContent.contentId}', 'less', '${userId}')">Moins comme ça</button>
                <button type="button" onclick="handleDiscoverQuickAction('${latestContent.contentId}', 'share', '${userId}')">Partager</button>
            </div>
        </div>
    `;

    return `
<div class="${cardClass}" style="--state-color: ${stateColor};" data-user="${userId}" data-content-id="${latestContent.contentId}" data-tags="${tagDataset}" onclick="openImmersive('${userId}', '${latestContent.contentId}')">
            ${quickActionsHtml}
            ${mediaHtml}
            <div class="card-content">
                ${arcInfo}
                ${sealOfApprovalHtml}
                ${isAnnouncement ? '<span class="announcement-chip">Annonce</span>' : ""}
                <div class="card-status card-status--editorial ${stateClass}" style="--state-color: ${stateColor};">
                    <div class="status-meta-row">
                        <span class="status-pill">${stateLabel}</span>
                        ${dayBadge}
                    </div>
                    <span class="status-title">${latestContent ? latestContent.title : "Aucune activité"}</span>
                </div>
                
                ${textHtml}
                <div class="card-action-row">
                    <div class="card-badge-row">
                        ${badgesHtml}
                        ${supportInlineHtml}
                    </div>
                    <button class="${courageClass}" data-content-id="${latestContent.contentId}" onclick="event.stopPropagation(); toggleCourage('${latestContent.contentId}', this)" aria-label="Encourager ce contenu">
                        <img src="${courageIcon}" width="16" height="16">
                        <span class="courage-count" data-count="${Number(latestContent.encouragementsCount) || 0}" title="${(Number(latestContent.encouragementsCount) || 0).toLocaleString("fr-FR")}">${formatCompactCount(latestContent.encouragementsCount || 0)}</span>
                    </button>
                </div>
                ${liveCta}
                ${userInfoHtml}
            </div>
</div>
    `;

    // Plus de recherche ici (panneau réduit aux annonces)
}

// Page badges dédiée (ancienne API, gardé pour compatibilité)
function renderBadgeAdminPage() {
    // La page badges-admin.html utilise maintenant js/badges-admin.js (module).
    // Cette fonction est laissée vide pour éviter les erreurs de référence.
}

// Recherche live pour l'attribution manuelle de badge (super admin)
function setupAdminVerifySearch() {
    setupAdminUserSearch(
        "admin-verify-target",
        "admin-verify-suggestions",
        (user) => selectAdminVerifyTarget(user.id, user.name),
    );
}

function selectAdminVerifyTarget(userId, userName) {
    const input = document.getElementById("admin-verify-target");
    const suggestions = document.getElementById("admin-verify-suggestions");
    if (input) input.value = userId;
    if (suggestions) {
        suggestions.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; padding:0.65rem 0.75rem; border:1px solid var(--border-color); border-radius:10px; background: rgba(59,130,246,0.08);">
                <div>
                    <div style="font-weight:700;">${escapeHtml(userName || "")}</div>
                    <div style="color: var(--text-secondary); font-size:0.85rem;">${escapeHtml(userId || "")}</div>
                </div>
                <span style="color: var(--accent-color); font-weight:600;">Sélectionné</span>
            </div>
`;
    }
}

// Recherche live pour bannissement
function setupAdminBanSearch() {
    setupAdminUserSearch("admin-ban-user-id", "admin-ban-suggestions", (user) =>
        selectAdminBanTarget(user.id, user.name),
    );
}

function selectAdminBanTarget(userId, userName) {
    const input = document.getElementById("admin-ban-user-id");
    const suggestions = document.getElementById("admin-ban-suggestions");
    if (input) input.value = userId;
    if (suggestions) {
        suggestions.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; padding:0.65rem 0.75rem; border:1px solid var(--border-color); border-radius:10px; background: rgba(239,68,68,0.08);">
                <div>
                    <div style="font-weight:700;">${escapeHtml(userName || "")}</div>
                    <div style="color: var(--text-secondary); font-size:0.85rem;">${escapeHtml(userId || "")}</div>
                </div>
                <span style="color: #ef4444; font-weight:600;">Sélectionné</span>
            </div>
`;
    }
}

// Recherche live pour modération contenu (par utilisateur)
function setupAdminContentSearch() {
    setupAdminUserSearch(
        "admin-content-user-search",
        "admin-content-user-suggestions",
        (user) => {
            selectAdminContentUser(user.id, user.name);
            loadAdminUserContents(user.id);
        },
    );
}

function selectAdminContentUser(userId, userName) {
    const input = document.getElementById("admin-content-user-search");
    const suggestions = document.getElementById(
        "admin-content-user-suggestions",
    );
    if (input) input.value = userName || userId;
    if (suggestions) {
        suggestions.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; padding:0.65rem 0.75rem; border:1px solid var(--border-color); border-radius:10px; background: rgba(245,158,11,0.08);">
                <div>
                    <div style="font-weight:700;">${escapeHtml(userName || "")}</div>
                    <div style="color: var(--text-secondary); font-size:0.85rem;">${escapeHtml(userId || "")}</div>
                </div>
                <span style="color: #f59e0b; font-weight:600;">Sélectionné</span>
            </div>
`;
    }
}

async function loadAdminUserContents(userId) {
    const container = document.getElementById("admin-content-user-contents");
    if (!container || !userId || !supabase) return;
    container.innerHTML = '<div class="verification-empty">Chargement...</div>';
    try {
        const { data, error } = await supabase
            .from("content")
            .select("id, title, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(10);

        if (error) throw error;
        const items = data || [];
        if (!items.length) {
            container.innerHTML =
                '<div class="verification-empty">Aucun contenu récent.</div>';
            return;
        }
        container.innerHTML = items
            .map((c) => {
                const title = escapeHtml(c.title || "Sans titre");
                const cid = escapeHtml(c.id || "");
                const dateLabel = safeFormatDate(c.created_at, {
                    day: "2-digit",
                    month: "2-digit",
                });
                return `
                <button type="button"
                    class="btn-ghost"
                    style="display:flex; justify-content:space-between; align-items:center; width:100%; border:1px solid var(--border-color); padding:0.55rem 0.75rem; border-radius:10px; background: rgba(255,255,255,0.02); color: var(--text-primary); cursor:pointer;"
                    onclick="document.getElementById('admin-content-id').value='${cid}'">
                    <span style="font-weight:600;">${title}</span>
                    <span style="color: var(--text-secondary); font-size:0.85rem;">${cid}${dateLabel ? " · " + dateLabel : ""}</span>
                </button>`;
            })
            .join("");
    } catch (error) {
        console.error("Erreur récupération contenus utilisateur:", error);
        container.innerHTML =
            '<div class="verification-empty">Erreur chargement contenus.</div>';
    }
}

// Utilitaire partagé pour recherches utilisateur live
function setupAdminUserSearch(inputId, suggestionsId, onSelect, options = {}) {
    const input = document.getElementById(inputId);
    const suggestions = document.getElementById(suggestionsId);
    if (!input || !suggestions || !supabase) return;

    let debounceTimer = null;

    let lastQuery = "";

    const search = async (query) => {
        suggestions.innerHTML = "";
        const q = (query || "").trim();
        if (q.length === 0) return;
        lastQuery = q;

        // 1) Essayer localement (allUsers) pour éviter les latences/RLS
        const localResults = (window.allUsers || [])
            .filter(
                (u) =>
                    (u.name || "").toLowerCase().includes(q.toLowerCase()) ||
                    String(u.id || "").startsWith(q),
            )
            .slice(0, 8);

        const renderList = (list) => {
            if (!list.length) {
                suggestions.innerHTML =
                    '<div class="verification-empty">Aucun résultat</div>';
                return;
            }
            suggestions.innerHTML = list
                .map((u) => {
                    const safeName = escapeHtml(u.name || "Utilisateur");
                    const safeId = escapeHtml(u.id || "");
                    const avatarUrl =
                        u.avatar && u.avatar.startsWith("http")
                            ? u.avatar
                            : "https://placehold.co/48x48?text=👤";
                    const avatar = options.showAvatar
                        ? `<img src="${escapeHtml(
                              avatarUrl,
                          )}" alt="${safeName}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:1px solid var(--border-color);">`
                        : "";
                    return `
                    <button type="button"
                        class="btn-ghost"
                        style="display:flex; justify-content:space-between; align-items:center; width:100%; border:1px solid var(--border-color); padding:0.55rem 0.75rem; border-radius:10px; background: rgba(255,255,255,0.03); color: var(--text-primary); cursor:pointer; gap:0.6rem;"
                        onclick="window.__adminUserSearchSelect('${inputId}','${suggestionsId}','${safeId}','${safeName}')">
                        <span style="display:flex; align-items:center; gap:0.5rem;">
                            ${avatar}
                            <span style="font-weight:600;">${safeName}</span>
                        </span>
                        <span style="color: var(--text-secondary); font-size:0.85rem;">${safeId}</span>
                    </button>`;
                })
                .join("");
        };

        if (localResults.length) {
            renderList(localResults);
        } else {
            try {
                const { data, error } = await supabase
                    .from("users")
                    .select("id, name, avatar")
                    .ilike("name", `%${q}%`)
                    .order("name", { ascending: true })
                    .limit(8);

                if (error) throw error;
                // Éviter d'afficher une réponse obsolète si l'utilisateur tape vite
                if (lastQuery !== q) return;
                renderList(data || []);
            } catch (error) {
                console.error("Erreur recherche utilisateur admin:", error);
                suggestions.innerHTML =
                    '<div class="verification-empty">Erreur de recherche</div>';
            }
        }

        // Stock callback (même si aucun résultat, pour cohérence)
        window.__adminUserSearchCallbacks =
            window.__adminUserSearchCallbacks || {};
        window.__adminUserSearchCallbacks[inputId] = onSelect;
    };

    input.addEventListener("input", () => {
        const query = String(input.value || "").trim();
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => search(query), 200);
    });
}

// Pont global pour gérer les boutons inline
window.__adminUserSearchSelect = (inputId, suggestionsId, userId, userName) => {
    const cb =
        (window.__adminUserSearchCallbacks &&
            window.__adminUserSearchCallbacks[inputId]) ||
        null;
    if (typeof cb === "function") {
        cb({ id: userId, name: userName });
    } else {
        // Fallback: juste remplir le champ
        const input = document.getElementById(inputId);
        if (input) input.value = userId;
    }
    // Nettoie la liste
    const suggestions = document.getElementById(suggestionsId);
    if (suggestions) suggestions.innerHTML = "";
};

async function getLiveStreamsForDiscover() {
    try {
        const { data, error } = await supabase
            .from("streaming_sessions")
            .select(
                "id, title, description, thumbnail_url, viewer_count, started_at, user_id, users(name, avatar)",
            )
            .eq("status", "live")
            .order("started_at", { ascending: false });

        if (error) throw error;
        const streams = data || [];
        if (streams.length === 0) return [];

        // Filtrer les streams dont l'hôte est encore actif (heartbeat < 90s)
        const streamIds = streams.map((s) => s.id);
        const hostKeySet = new Set(streams.map((s) => `${s.id}:${s.user_id}`));
        const cutoff = Date.now() - 90000;
        const recentStartCutoff = Date.now() - 10 * 60 * 1000;

        const { data: viewerData, error: viewerError } = await supabase
            .from("stream_viewers")
            .select("stream_id, user_id, last_seen")
            .in("stream_id", streamIds);

        if (viewerError) {
            console.error("Erreur récupération présence host:", viewerError);
            return streams;
        }
        if (!viewerData || viewerData.length === 0) {
            return streams;
        }

        const hostLastSeenMap = new Map();
        (viewerData || []).forEach((row) => {
            if (!row?.stream_id || !row?.user_id) return;
            const key = `${row.stream_id}:${row.user_id}`;
            if (!hostKeySet.has(key)) return;
            hostLastSeenMap.set(row.stream_id, row.last_seen);
        });

        const filtered = streams.filter((stream) => {
            const lastSeen = hostLastSeenMap.get(stream.id);
            if (lastSeen) {
                return new Date(lastSeen).getTime() >= cutoff;
            }
            // Fallback: afficher un live tout juste démarré même si le heartbeat n'est pas encore visible
            if (stream.started_at) {
                return (
                    new Date(stream.started_at).getTime() >= recentStartCutoff
                );
            }
            return true;
        });

        // Priorité aux hôtes vérifiés, puis nombre de viewers, puis récence
        filtered.sort((a, b) => {
            const aVerified =
                isVerifiedCreatorUserId(a.user_id) ||
                isVerifiedStaffUserId(a.user_id);
            const bVerified =
                isVerifiedCreatorUserId(b.user_id) ||
                isVerifiedStaffUserId(b.user_id);
            if (aVerified !== bVerified) return aVerified ? -1 : 1;

            const viewersDiff = (b.viewer_count || 0) - (a.viewer_count || 0);
            if (viewersDiff !== 0) return viewersDiff;

            const aStart = a.started_at ? new Date(a.started_at).getTime() : 0;
            const bStart = b.started_at ? new Date(b.started_at).getTime() : 0;
            return bStart - aStart;
        });

        return filtered;
    } catch (error) {
        console.error("Erreur récupération lives:", error);
        return [];
    }
}

function renderLiveStreamCard(stream, layoutOptions = {}) {
    if (!document.getElementById("card-stats-style")) {
        const statsStyles = `
            <style>
            .card-stats-overlay {
                position: absolute;
                top: 10px;
                right: 10px;
                display: flex;
                gap: 5px;
                pointer-events: none;
            }
            .stat-pill {
                background: rgba(0,0,0,0.6);
                backdrop-filter: blur(4px);
                padding: 4px 8px;
                border-radius: 12px;
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 0.75rem;
                color: white;
                font-weight: 600;
            }
            .card-meta {
                display: flex;
                gap: 8px;
                margin: 0.35rem 0 0.5rem;
                align-items: center;
                flex-wrap: wrap;
            }
            .pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 10px;
                border-radius: 999px;
                font-size: 0.8rem;
                font-weight: 600;
                background: rgba(239, 68, 68, 0.12);
                color: #ef4444;
            }
            .pill svg {
                width: 16px;
                height: 16px;
            }
            .pill.verified {
                background: rgba(14, 165, 233, 0.14);
                color: #0ea5e9;
            }
            </style>
`;
        document.head.insertAdjacentHTML(
            "beforeend",
            statsStyles.replace("<style>", '<style id="card-stats-style">'),
        );
    }

    const hostName = stream.users?.name || "Hôte";
    const hostId = stream.user_id || null;
    const hostAvatar = stream.users?.avatar || "https://placehold.co/40";
    const title = stream.title || "Live Stream";
    const description = stream.description || "Rejoignez le live en cours";
    const viewers = stream.viewer_count || 0;
    const thumbnail = stream.thumbnail_url || "";
    const isVerifiedHost =
        (hostId && isVerifiedCreatorUserId(hostId)) ||
        (hostId && isVerifiedStaffUserId(hostId));

    const hostNameHtml =
        hostId && typeof window.renderUsernameWithBadge === "function"
            ? window.renderUsernameWithBadge(hostName, hostId)
            : hostName;

    const viewerPill = `
<div class="card-meta">
            <span class="pill">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                ${viewers} en direct
            </span>
</div>
    `;

    const mediaHtml = thumbnail
        ? `
            <div class="card-media-wrap card-media-wrap--editorial">
                <img class="card-media" src="${thumbnail}" alt="${title}" loading="lazy" decoding="async">
                <div class="card-stats-overlay">
                    <div class="stat-pill">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        <span>${viewers}</span>
                    </div>
                </div>
            </div>
`
        : `
            <div class="card-media-wrap card-media-wrap--editorial">
                <div class="video-fallback" style="opacity:1;">
                    <img src="icons/live.svg" alt="Live" width="36" height="36">
                    <span>Live en cours</span>
                </div>
                <div class="card-stats-overlay">
                    <div class="stat-pill">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        <span>${viewers}</span>
                    </div>
                </div>
            </div>
`;

    return `
<div class="user-card editorial-card has-media live editorial-card--live${layoutOptions.isPreferred ? " editorial-card--preferred" : ""}" style="--state-color: #ef4444;" data-stream="${stream.id}" onclick="window.location.href='stream.html?id=${stream.id}&title=${encodeURIComponent(title)}&host=${stream.user_id}'">
            ${mediaHtml}
            <div class="card-content">
                <div class="card-status card-status--editorial is-live" style="--state-color: #ef4444;">
                    <div class="status-meta-row">
                        <span class="status-pill">En direct</span>
                    </div>
                    <span class="status-title">${title}</span>
                </div>
                ${viewerPill}
                <div class="card-description">${description}</div>
                <div class="card-user-bottom">
                    <img src="${hostAvatar}" class="card-avatar" loading="lazy" decoding="async">
                    <div class="profile-link-text">
                        <h3 class="discover-user-name">${hostNameHtml}</h3>
                        <div class="card-user-title">Streamer</div>
                    </div>
                    <button class="btn-follow-card" onclick="event.stopPropagation(); window.location.href='stream.html?id=${stream.id}&title=${encodeURIComponent(title)}&host=${stream.user_id}'" title="Rejoindre le live" style="
                        background: transparent; 
                        border: none;
                        padding: 0;
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        cursor: pointer;
                        margin-left: auto;
                        transition: all 0.2s;
                    ">
                        <img src="icons/live.svg" class="btn-icon" style="width: 24px; height: 24px;">
                    </button>
                </div>
            </div>
</div>
    `;
}

// Helpers to keep Discover refreshes incremental (avoid full reflows)
function getDiscoverItemKey(item) {
    if (!item) return null;
    if (item.type === "live" && item.stream?.id)
        return `live-${item.stream.id}`;
    if (item.type === "arc" && item.user?.id) {
        const arcSegment = item.arcId || item.arcKey || "no-arc";
        return `arc-${item.user.id}-${arcSegment}`;
    }
    if (item.type === "user" && item.user?.id) return `user-${item.user.id}`;
    return null;
}

function getDiscoverItemContentId(item, userContentMap) {
    if (!item) return null;
    if (item.type === "live" && item.stream?.id)
        return `live-${item.stream.id}`;
    if (item.type === "arc") {
        return item.content?.contentId || null;
    }
    if (item.type === "user" && item.user?.id) {
        if (!userContentMap || typeof userContentMap.get !== "function") {
            return item.content?.contentId || null;
        }
        const latest = userContentMap.get(item.user.id);
        return latest?.contentId || null;
    }
    return null;
}

function deriveDiscoverKeyFromElement(el) {
    if (!el) return null;
    if (el.dataset.discoverKey) return el.dataset.discoverKey;
    if (el.dataset.stream) return `live-${el.dataset.stream}`;
    if (el.dataset.user) return `user-${el.dataset.user}`;
    return null;
}

function createDiscoverElement(html, key, contentId, options = {}) {
    const { markAsNew = true } = options;
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    const node = template.content.firstElementChild;
    if (!node) return null;
    node.dataset.discoverKey = key;
    if (contentId) node.dataset.contentId = contentId;
    if (markAsNew) node.classList.add("discover-card-new");
    return node;
}

function hashDiscoverLayoutSeed(value) {
    const input = String(value || "discover");
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function nextDiscoverLayoutRandom(seed) {
    let nextSeed = seed >>> 0;
    nextSeed ^= nextSeed << 13;
    nextSeed ^= nextSeed >>> 17;
    nextSeed ^= nextSeed << 5;
    return {
        seed: nextSeed >>> 0,
        value: (nextSeed >>> 0) / 4294967295,
    };
}

function chooseDiscoverRowSize(remaining, seed) {
    // Force 3 colonnes sur PC (chaque carte prendra span 4 dans une grille de 12)
    return { rowSize: Math.min(3, remaining), seed };
}

function assignDiscoverRowLayout(renderedItems) {
    if (!Array.isArray(renderedItems) || renderedItems.length === 0) return;

    let rowIndex = 0;
    const assignSegment = (items) => {
        if (!items.length) return;
        let seed = hashDiscoverLayoutSeed(
            items.map((item) => item.key).join("|"),
        );
        let index = 0;
        while (index < items.length) {
            const remaining = items.length - index;
            const choice = chooseDiscoverRowSize(remaining, seed);
            const rowSize = Math.max(1, Math.min(choice.rowSize, remaining));
            seed = choice.seed;

            for (let position = 0; position < rowSize; position += 1) {
                const item = items[index + position];
                if (!item) continue;
                item.rowSize = rowSize;
                item.rowPosition = position;
                item.rowIndex = rowIndex;
            }

            index += rowSize;
            rowIndex += 1;
        }
    };

    let segment = [];
    renderedItems.forEach((item) => {
        if (item?.type === "section") {
            assignSegment(segment);
            segment = [];
            item.rowSize = 4;
            item.rowPosition = 0;
            item.rowIndex = rowIndex;
            rowIndex += 1;
            return;
        }
        segment.push(item);
    });
    assignSegment(segment);
}

function reconcileDiscoverGrid(grid, renderedItems, waitMessage) {
    const existingMap = new Map();
    Array.from(grid.children).forEach((child) => {
        const key = deriveDiscoverKeyFromElement(child);
        if (key) {
            child.dataset.discoverKey = key;
            existingMap.set(key, child);
        }
    });

    const fragment = document.createDocumentFragment();
    renderedItems.forEach(
        ({ key, html, contentId, type, rowSize, rowPosition }) => {
            if (!key || !html) return;
            const existing = existingMap.get(key);
            const shouldReplace =
                !existing ||
                (typeof contentId === "string" &&
                    existing.dataset.contentId &&
                    existing.dataset.contentId !== contentId) ||
                type === "live"; // live cards change often (viewers, status)
            const node = shouldReplace
                ? createDiscoverElement(html, key, contentId, {
                      markAsNew: !existing,
                  })
                : existing;

            if (
                existing &&
                !shouldReplace &&
                contentId &&
                !existing.dataset.contentId
            ) {
                existing.dataset.contentId = contentId;
            }

            if (node) {
                node.classList.remove(
                    "discover-row-size-1",
                    "discover-row-size-2",
                    "discover-row-size-3",
                    "discover-row-size-4",
                    "discover-row-start",
                );
                node.classList.add(`discover-row-size-${rowSize || 4}`);
                if (rowPosition === 0) node.classList.add("discover-row-start");
                fragment.appendChild(node);
            }
        },
    );

    grid.replaceChildren(fragment);
    try {
        initXeraCarousels(grid);
    } catch (e) {
        /* ignore */
    }

    if (waitMessage) {
        const hasCard = grid.querySelector(".user-card, .discover-card");
        if (hasCard) {
            waitMessage.classList.add("is-hidden");
        }
    }

    if (window.AnimationManager) {
        AnimationManager.fadeInElements(".discover-card-new", 120);
        setTimeout(() => {
            grid.querySelectorAll(".discover-card-new").forEach((el) => {
                el.classList.remove("discover-card-new");
            });
        }, 800);
    }
}

function ensureDiscoverPaginationUi(grid) {
    if (!grid?.parentElement) return null;
    const parent = grid.parentElement;

    if (!discoverPaginationState.status) {
        const status = document.createElement("div");
        status.className = "discover-pagination-status";
        status.setAttribute("aria-live", "polite");
        parent.appendChild(status);
        discoverPaginationState.status = status;
    }

    if (!discoverPaginationState.sentinel) {
        const sentinel = document.createElement("div");
        sentinel.className = "discover-pagination-sentinel";
        sentinel.setAttribute("aria-hidden", "true");
        parent.appendChild(sentinel);
        discoverPaginationState.sentinel = sentinel;
    }

    return discoverPaginationState.status;
}

function renderDiscoverPaginationStatus(kind = "idle") {
    const status = discoverPaginationState.status;
    if (!status) return;

    if (kind === "loading") {
        status.innerHTML = `
            <div class="discover-pagination-loading">
                <span class="discover-pagination-spinner" aria-hidden="true"></span>
                <div class="discover-pagination-skeletons" aria-hidden="true">
                    <span></span><span></span>
                </div>
            </div>
        `;
        status.classList.add("is-visible");
        return;
    }

    if (kind === "error") {
        status.innerHTML = `
            <div class="discover-pagination-error">
                <span>Impossible de charger la suite du feed.</span>
                <button type="button" class="discover-pagination-retry">Réessayer de charger</button>
            </div>
        `;
        status.querySelector("button")?.addEventListener("click", () => {
            discoverPaginationState.error = null;
            loadNextDiscoverPage();
        });
        status.classList.add("is-visible");
        return;
    }

    if (kind === "end") {
        status.innerHTML =
            '<div class="discover-pagination-end">Vous êtes à jour — Fin du feed XERA1</div>';
        status.classList.add("is-visible");
        return;
    }

    status.innerHTML = "";
    status.classList.remove("is-visible");
}

/**
 * Charge et affiche les prochains éléments du feed de manière progressive
 * Ajoute 20 éléments et les charge un par un
 */
function showFirstProjectFeedPopup() {
    if (document.getElementById("first-project-feed-popup")) return;

    const popup = document.createElement("div");
    popup.id = "first-project-feed-popup";
    popup.className = "first-project-feed-popup";
    popup.innerHTML = `
        <div class="first-project-feed-popup__content">
            <button class="first-project-feed-popup__close" type="button" aria-label="Fermer">×</button>
            <h3>Créer votre premier projet</h3>
            <p>Votre parcours mérite d’être montré. Lancez votre premier projet pour donner de la visibilité à votre progression.</p>
            <div class="first-project-feed-popup__actions">
                <button class="first-project-feed-popup__cta" type="button">Créer mon projet</button>
            </div>
        </div>
    `;

    document.body.appendChild(popup);

    popup
        .querySelector(".first-project-feed-popup__close")
        .addEventListener("click", () => {
            popup.remove();
        });

    popup
        .querySelector(".first-project-feed-popup__cta")
        .addEventListener("click", () => {
            popup.remove();
            if (typeof window.openCreateModal === "function") {
                window.openCreateModal();
            }
        });
}

async function loadNextDiscoverPage() {
    if (
        discoverPaginationState.isLoading ||
        !discoverPaginationState.hasMore ||
        discoverPaginationState.error
    )
        return;

    const grid = document.querySelector(".discover-grid");
    if (!grid) return;

    discoverPaginationState.isLoading = true;
    const status = ensureDiscoverPaginationUi(grid);
    if (!status) {
        discoverPaginationState.isLoading = false;
        return;
    }
    renderDiscoverPaginationStatus("loading");

    try {
        const startIdx =
            (discoverPaginationState.currentPage + 1) * DISCOVER_ITEMS_PER_PAGE;
        const endIdx = Math.min(
            startIdx + DISCOVER_ITEMS_PER_PAGE,
            discoverPaginationState.allItems.length,
        );
        const itemsToAdd = discoverPaginationState.allItems.slice(
            startIdx,
            endIdx,
        );
        const fragment = document.createDocumentFragment();

        itemsToAdd.forEach((item) => {
            const { html, key, contentId, type, rowSize, rowPosition } = item;
            const node = createDiscoverElement(html, key, contentId, {
                markAsNew: false,
            });
            if (node && type) node.dataset.type = type;
            if (node && rowSize) node.dataset.rowSize = rowSize;
            if (node && rowPosition) node.dataset.rowPosition = rowPosition;
            if (node) fragment.appendChild(node);
        });

        grid.appendChild(fragment);
        discoverPaginationState.currentPage++;
        discoverPaginationState.hasMore =
            endIdx < discoverPaginationState.allItems.length;
        discoverPaginationState.error = null;

        setupDiscoverVideoInteractions();
        initDiscoverMoodTracking();

        if (discoverPaginationState.hasMore) {
            renderDiscoverPaginationStatus("idle");
            setupDiscoverPaginationObserver();
        } else {
            renderDiscoverPaginationStatus("end");
            discoverPaginationState.intersectionObserver?.disconnect();
        }
    } catch (error) {
        console.error("Erreur pagination discover:", error);
        discoverPaginationState.error = error;
        renderDiscoverPaginationStatus("error");
    } finally {
        discoverPaginationState.isLoading = false;
    }
}

/**
 * Configure l'Intersection Observer pour détecter quand on atteint la fin du feed
 */
function setupDiscoverPaginationObserver() {
    const grid = document.querySelector(".discover-grid");
    if (!grid) return;

    ensureDiscoverPaginationUi(grid);

    // Nettoyer l'ancien observateur
    if (discoverPaginationState.intersectionObserver) {
        discoverPaginationState.intersectionObserver.disconnect();
    }

    // Créer un nouvel observateur
    const options = {
        root: null,
        rootMargin: "300px",
        threshold: 0,
    };

    discoverPaginationState.intersectionObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (
                    entry.isIntersecting &&
                    !discoverPaginationState.isLoading &&
                    discoverPaginationState.hasMore
                ) {
                    loadNextDiscoverPage();
                }
            });
        },
        options,
    );

    // Observer le dernier élément du grid
    if (discoverPaginationState.sentinel) {
        discoverPaginationState.intersectionObserver.observe(
            discoverPaginationState.sentinel,
        );
    }
}

async function renderDiscoverGrid() {
    const renderSequence = ++discoverRenderSequence;
    const grid = document.querySelector(".discover-grid");
    if (!grid) return;

    const currentUserId = currentUser?.id || "guest";
    const discoverRenderKey = `${window.location.pathname || ""}|${window.location.search || ""}|${window.discoverFilter || "all"}|${currentUserId}`;
    const now = Date.now();
    if (
        window.__discoverRenderGuardKey === discoverRenderKey &&
        window.__discoverRenderGuardAt &&
        now - window.__discoverRenderGuardAt < 1200
    ) {
        return;
    }
    window.__discoverRenderGuardKey = discoverRenderKey;
    window.__discoverRenderGuardAt = now;
    const waitMessage = document.querySelector(".wait");
    const allowReactDiscoverGrid = window.__enableReactDiscoverGrid === true;

    if (
        allowReactDiscoverGrid &&
        typeof window.renderDiscoverGridReact === "function" &&
        window.React &&
        window.ReactDOM
    ) {
        try {
            const didReactRender = window.renderDiscoverGridReact(grid);
            if (didReactRender) {
                if (waitMessage) {
                    waitMessage.classList.add("is-hidden");
                }
                if (
                    typeof window.setupDiscoverVideoInteractions === "function"
                ) {
                    window.setupDiscoverVideoInteractions();
                }
                return;
            }
        } catch (e) {
            // fallback to vanilla rendering below
        }
    }

    // Afficher un état de chargement si les données ne sont pas encore là
    if (!window.hasLoadedUsers) {
        showDiscoverSkeleton(grid, 8, {
            showSlowNotice: window.initialDataSlow === true,
        });
        return;
    }
    if (window.userLoadError) {
        scheduleDiscoverDataRetry("load error");
        showDiscoverSkeleton(grid, 8, {
            showSlowNotice: true,
            message: SLOW_CONNECTION_MESSAGE,
        });
        return;
    }
    if (allUsers.length === 0) {
        scheduleDiscoverDataRetry("no users");
        showDiscoverSkeleton(grid, 8, {
            showSlowNotice:
                window.initialDataSlow === true ||
                window.initialDataLoadInProgress === false,
        });
        return;
    }

    let liveStreams = [];
    try {
        liveStreams = await withTimeout(
            getLiveStreamsForDiscover(),
            INITIAL_AUTH_TIMEOUT_MS,
            "Discover live streams load",
        );
    } catch (error) {
        console.error("Erreur chargement lives discover:", error);
    }
    if (renderSequence !== discoverRenderSequence) return;

    let usersToDisplay = [...allUsers];
    const currentFilter = window.discoverFilter || "all";
    let followedSet = new Set();
    if (currentUser) {
        followedSet = await getFollowedUserIdSet();
    }
    if (renderSequence !== discoverRenderSequence) return;

    // Tri de base par récence puis mélange pondéré vérifiés/non-vérifiés
    usersToDisplay = sortUsersByLatestRecency(usersToDisplay).filter((user) =>
        shouldShowProfileToViewerSync(
            user,
            currentUser?.id || null,
            followedSet,
        ),
    );
    liveStreams = liveStreams.filter((stream) => {
        const host = getUser(stream.user_id);
        return shouldShowProfileToViewerSync(
            host,
            currentUser?.id || null,
            followedSet,
        );
    });

    const professionalPages = await ensureProfessionalPageDataLoaded();
    const discoverArcCards = buildDiscoverArcCardEntries(
        usersToDisplay,
        professionalPages,
    );
    const arcIdsForDiscover = discoverArcCards
        .map((entry) => entry.arcId)
        .filter(Boolean);
    if (arcIdsForDiscover.length > 0) {
        await preloadArcCollaborators(arcIdsForDiscover);
    }
    if (renderSequence !== discoverRenderSequence) return;

    // Personalized encouragement/follow status
    const contentIds = discoverArcCards
        .map((entry) => entry.content?.contentId)
        .filter(Boolean);

    let encouragedContentIds = new Set();
    if (currentUser) {
        if (contentIds.length > 0) {
            const { data } = await supabase
                .from("content_encouragements")
                .select("content_id")
                .eq("user_id", currentUser.id)
                .in("content_id", contentIds);
            if (data) {
                data.forEach((row) => encouragedContentIds.add(row.content_id));
            }
        }
    }
    if (renderSequence !== discoverRenderSequence) return;

    // Mood-based mix (includes lives)
    const mixedItems = buildMoodDiscoverMix(
        discoverArcCards,
        liveStreams,
        followedSet,
    );

    // Pré-charger les pages pro si nécessaire
    if (window.professionalManager) {
        const pageIds = new Set();
        mixedItems.forEach((item) => {
            if (item.content?.pageId) pageIds.add(item.content.pageId);
        });
        if (pageIds.size > 0) {
            await Promise.all(
                Array.from(pageIds).map((id) =>
                    window.professionalManager.getPageInfo(id),
                ),
            );
        }
    }

    const renderItem = (item) => {
        if (item.type === "live") {
            return renderLiveStreamCard(item.stream, {
                isPreferred: Boolean(item.__discoverPreferred),
            });
        }
        const userId = item.user?.id || item.content?.userId;
        const content = item.content || null;
        if (!userId || !content) return "";
        const isFollowed = followedSet.has(userId);
        const isEncouraged =
            content &&
            content.contentId &&
            encouragedContentIds &&
            typeof encouragedContentIds.has === "function"
                ? encouragedContentIds.has(content.contentId)
                : false;
        return renderUserCard(userId, isFollowed, isEncouraged, content, {
            isPreferred: Boolean(item.__discoverPreferred),
        });
    };

    if (currentUser && !firstProjectFeedPopupShown) {
        try {
            const isPersonalAccount =
                !currentUser?.is_pro &&
                !currentUser?.isPro &&
                !currentUser?.role?.includes("pro");
            if (isPersonalAccount) {
                const hasProjects = await withTimeout(
                    (async () => {
                        const { count, error } = await supabase
                            .from("arcs")
                            .select("id", { count: "exact", head: true })
                            .eq("user_id", currentUser.id);
                        if (error) throw error;
                        return (count || 0) > 0;
                    })(),
                    5000,
                    "Check user projects for feed popup",
                );

                if (!hasProjects) {
                    showFirstProjectFeedPopup();
                    firstProjectFeedPopupShown = true;
                }
            }
        } catch (error) {
            console.warn("Feed popup project check failed:", error);
        }
    }

    const renderedItems = [];
    let filteredMixedItems = mixedItems.filter((item) =>
        matchesDiscoverFilter(item, currentFilter, followedSet),
    );
    if (currentFilter === "recent") {
        filteredMixedItems = filteredMixedItems.sort(
            (a, b) =>
                getDiscoverContentTime(b.content) -
                getDiscoverContentTime(a.content),
        );
    }
    const itemGroups = partitionDiscoverItems(
        filteredMixedItems,
        currentFilter,
    );
    itemGroups.forEach((group) => {
        renderedItems.push(
            buildDiscoverSectionItem(
                currentFilter,
                group.section,
                group.items.length,
            ),
        );
        group.items.forEach((item) => {
            const html = renderItem(item);
            if (!html) return;
            const key = getDiscoverItemKey(item);
            const contentId = getDiscoverItemContentId(item);
            if (!key) return;
            renderedItems.push({
                key,
                html,
                contentId,
                type: item.type,
            });
        });
    });

    if (renderedItems.length > 0) {
        clearDiscoverDataRetry();
        assignDiscoverRowLayout(renderedItems);

        // Implémenter la pagination: afficher seulement les 20 premiers éléments
        discoverPaginationState.allItems = renderedItems;
        discoverPaginationState.currentPage = 0;
        discoverPaginationState.hasMore =
            renderedItems.length > DISCOVER_ITEMS_PER_PAGE;

        // Afficher seulement les 20 premiers éléments
        const initialItems = renderedItems.slice(0, DISCOVER_ITEMS_PER_PAGE);
        reconcileDiscoverGrid(grid, initialItems, waitMessage);
        ensureDiscoverPaginationUi(grid);

        setupDiscoverVideoInteractions();
        initDiscoverMoodTracking();

        // Initialiser l'observateur pour la pagination
        if (discoverPaginationState.hasMore) {
            renderDiscoverPaginationStatus("idle");
            setupDiscoverPaginationObserver();
        } else {
            renderDiscoverPaginationStatus("end");
        }
        return;
    }

    scheduleDiscoverDataRetry("no discover items");
    showDiscoverSkeleton(grid, 8, {
        showSlowNotice: true,
        message: SLOW_CONNECTION_MESSAGE,
    });
    if (waitMessage) waitMessage.classList.add("is-hidden");
}

/* ========================================
   RENDERING - IMMERSIVE VIEW
   ======================================== */

// Helper to gather all content for the feed
function getAllFeedContent() {
    let allContent = [];
    if (typeof userContents !== "undefined") {
        Object.entries(userContents).forEach(([userId, userContentList]) => {
            if (Array.isArray(userContentList)) {
                allContent = allContent.concat(
                    userContentList.filter((content) =>
                        isUserAuthoredContent(content, userId),
                    ),
                );
            }
        });
    }

    professionalPageContents.forEach((_contents, pageId) => {
        allContent = allContent.concat(getPageContentLocal(pageId));
    });

    const uniqueContent = new Map();
    allContent.forEach((content, index) => {
        const id = content?.contentId || content?.id || `feed-item-${index}`;
        if (!uniqueContent.has(String(id))) {
            uniqueContent.set(String(id), content);
        }
    });

    // Sort by createdAt descending (newest first)
    return Array.from(uniqueContent.values()).sort(
        (a, b) =>
            getDiscoverContentTime(b) - getDiscoverContentTime(a),
    );
}

function getDefaultImmersivePrefs() {
    return {
        types: {},
        states: {},
        users: {},
        tags: {},
        queries: {},
        seen: {},
        updatedAt: Date.now(),
        // Améliorations: suivi des changements d'intérêts et de la diversité
        lastInteractionTime: Date.now(),
        interactionCount: 0,
        diversityScore: 0.5, // 0-1: 0 = très spécialisé, 1 = très diversifié
    };
}

function loadImmersivePrefs() {
    const legacyKey = "immersive_prefs_v1";
    const storageKey = getImmersivePrefsStorageKey();
    const migrationFlagKey = "immersive_prefs_v1:migrated";

    try {
        let raw = localStorage.getItem(storageKey);

        // One-time migration from legacy global key to the active scoped key.
        if (!raw && !localStorage.getItem(migrationFlagKey)) {
            const legacyRaw = localStorage.getItem(legacyKey);
            if (legacyRaw) {
                raw = legacyRaw;
                localStorage.setItem(storageKey, legacyRaw);
            }
            localStorage.setItem(migrationFlagKey, "1");
        }

        if (!raw) return getDefaultImmersivePrefs();

        const parsed = JSON.parse(raw);
        const prefs = {
            types: parsed?.types || {},
            states: parsed?.states || {},
            users: parsed?.users || {},
            tags: parsed?.tags || {},
            queries: parsed?.queries || {},
            seen: parsed?.seen || {},
            updatedAt: Number(parsed?.updatedAt) || Date.now(),
        };

        const { prefs: decayedPrefs, changed } =
            applyTemporalDecayToPrefs(prefs);
        if (changed) saveImmersivePrefs(decayedPrefs);
        return decayedPrefs;
    } catch (e) {
        return getDefaultImmersivePrefs();
    }
}

function getImmersivePrefsStorageKey() {
    const userId = currentUser?.id;
    return userId ? `immersive_prefs_v1:${userId}` : "immersive_prefs_v1:guest";
}

function applyDecayToMap(map, factor, floor = 0.02) {
    const source = map || {};
    const output = {};
    Object.entries(source).forEach(([key, value]) => {
        const next = (Number(value) || 0) * factor;
        if (Math.abs(next) >= floor) output[key] = next;
    });
    return output;
}

function applyTemporalDecayToPrefs(prefs) {
    const now = Date.now();
    const updatedAt = Number(prefs?.updatedAt) || now;
    const elapsedMs = Math.max(0, now - updatedAt);
    const minDecayIntervalMs = 1000 * 60 * 60 * 3; // Réduit à 3 heures au lieu de 6

    if (elapsedMs < minDecayIntervalMs) {
        return { prefs, changed: false };
    }

    const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

    // Utiliser une demi-vie plus courte pour mieux détecter les changements
    // 20 jours au lieu de 30 pour les utilisateurs with les intérêts qui changent
    const diversityScore = (prefs && prefs.diversityScore) || 0.5;
    const interactionCount = (prefs && prefs.interactionCount) || 0;

    // Les utilisateurs très engagés et diversifiés méritent une demi-vie plus courte
    // pour que les changements d'intérêts soient détectés rapidement
    let halfLifeDays = 25; // Base

    if (diversityScore > 0.7 && interactionCount > 100) {
        halfLifeDays = 16; // Plus court pour les utilisateurs engagés
    } else if (interactionCount < 20) {
        halfLifeDays = 28; // Plus long pour les nouveaux utilisateurs
    } else if (interactionCount > 300) {
        halfLifeDays = 18; // Court pour les utilisateurs très actifs
    }

    const factor = Math.pow(0.5, elapsedDays / halfLifeDays);

    // Appliquer la décroissance avec un plancher plus bas pour mieux oublier les préférences anciennes
    const floor = 0.008; // Plus bas que 0.02 pour oublier plus vite les anciennes préfs

    const decayed = {
        ...prefs,
        types: applyDecayToMap(prefs.types, factor, floor),
        states: applyDecayToMap(prefs.states, factor, floor),
        users: applyDecayToMap(prefs.users, factor, floor),
        tags: applyDecayToMap(prefs.tags, factor, floor),
        queries: applyDecayToMap(prefs.queries, factor, floor),
        updatedAt: now,
    };

    return { prefs: decayed, changed: true };
}

function saveImmersivePrefs(prefs) {
    try {
        localStorage.setItem(
            getImmersivePrefsStorageKey(),
            JSON.stringify({ ...prefs, updatedAt: Date.now() }),
        );
    } catch (e) {
        // Ignore storage errors
    }
}

function bumpPref(map, key, amount) {
    if (!key) return;
    map[key] = (map[key] || 0) + amount;
}

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function buildAuthorScoreMapFromContents() {
    const statsByUser = new Map();
    const buckets = userContents || {};

    Object.entries(buckets).forEach(([userId, list]) => {
        if (!Array.isArray(list) || list.length === 0) return;
        let views = 0;
        let encouragements = 0;
        let posts = 0;

        list.forEach((item) => {
            if (!item) return;
            posts += 1;
            views += Number(item.views) || 0;
            encouragements += Number(item.encouragementsCount) || 0;
        });

        const scoreRaw =
            Math.log1p(views) * 0.55 +
            Math.log1p(encouragements) * 1.25 +
            Math.log1p(posts) * 0.35;
        const score = clampNumber(scoreRaw, 0, 5);
        statsByUser.set(userId, score);
    });

    return statsByUser;
}

function prunePrefsObject(obj, maxEntries = 200) {
    const keys = Object.keys(obj || {});
    if (keys.length <= maxEntries) return obj;
    keys.sort((a, b) => (obj[b] || 0) - (obj[a] || 0));
    const trimmed = {};
    keys.slice(0, maxEntries).forEach((k) => {
        trimmed[k] = obj[k];
    });
    return trimmed;
}

function pruneSeen(seenMap, maxEntries = 600) {
    const entries = Object.entries(seenMap || {});
    if (entries.length <= maxEntries) return seenMap;
    entries.sort((a, b) => (a[1] || 0) - (b[1] || 0));
    const trimmed = {};
    entries.slice(entries.length - maxEntries).forEach(([k, v]) => {
        trimmed[k] = v;
    });
    return trimmed;
}

// Calcule les poids adaptatifs basés sur la récence et la fréquence
function computeAdaptiveWeights(prefs, action) {
    const baseWeights = {
        like: 2.8, // Poids augmenté pour les likes
        dislike: -2.0, // Poids augmenté négatif pour les dislikes
        view: 0.5, // Poids augmenté pour les vues
        default: 0.8, // Default augmenté
    };

    const weight = baseWeights[action] || baseWeights.default;

    // Ajuster les poids en fonction du nombre d'interactions (engagement)
    const interactionCount = prefs.interactionCount || 0;
    const recentInteractionTime = prefs.lastInteractionTime || Date.now();
    const timeSinceLastMs = Date.now() - recentInteractionTime;
    const timeSinceLastDays = timeSinceLastMs / (1000 * 60 * 60 * 24);

    // Multiplicateur de récence: interactions récentes sont plus importantes
    let recencyMultiplier = 1;
    if (timeSinceLastDays < 1) {
        recencyMultiplier = 1.2; // 20% boost si interagit aujourd'hui
    } else if (timeSinceLastDays < 7) {
        recencyMultiplier = 1.1; // 10% boost si dans la dernière semaine
    } else if (timeSinceLastDays > 30) {
        recencyMultiplier = 0.9; // 10% réduction si > 30 jours
    }

    // Multiplicateur d'engagement: plus l'utilisateur interagit, plus les poids sont influents
    let engagementMultiplier = Math.min(1.3, 1.0 + interactionCount / 500);

    return weight * recencyMultiplier * engagementMultiplier;
}

function updateImmersivePrefs(content, action) {
    if (!content) return;
    const prefs = loadImmersivePrefs();

    // Calculer les poids adaptatifs au lieu d'utiliser des poids statiques
    const weight = computeAdaptiveWeights(prefs, action);

    // Mise à jour avec poids adaptatifs
    bumpPref(prefs.types, content.type, weight);
    bumpPref(prefs.states, content.state, weight * 0.7);
    bumpPref(prefs.users, content.userId, weight * 1.0);

    // Augmenter l'importance des tags pour mieux détecter les catégories
    if (Array.isArray(content.tags)) {
        content.tags
            .map((tag) =>
                String(tag || "")
                    .trim()
                    .toLowerCase(),
            )
            .filter(Boolean)
            .forEach((tag) => bumpPref(prefs.tags, tag, weight * 1.0));
    }

    // Enregistrer le contenu comme vu
    prefs.seen[content.contentId] = Date.now();

    // Mettre à jour les statistiques de suivi pour la détection de changements
    prefs.interactionCount = (prefs.interactionCount || 0) + 1;
    prefs.lastInteractionTime = Date.now();

    // Calculer le score de diversité pour adapter le ratio d'exploration
    updateDiversityScore(prefs);

    // Élagage plus agressif des préférences anciennes
    prefs.types = prunePrefsObject(prefs.types, 100);
    prefs.states = prunePrefsObject(prefs.states, 40);
    prefs.users = prunePrefsObject(prefs.users, 150);
    prefs.tags = prunePrefsObject(prefs.tags, 150);
    prefs.queries = prunePrefsObject(prefs.queries, 150);
    prefs.seen = pruneSeen(prefs.seen, 600);

    saveImmersivePrefs(prefs);
}

// Calcule un score de diversité pour adapter l'exploration
function updateDiversityScore(prefs) {
    if (!prefs) return;

    const countCategories = (obj) => Object.keys(obj || {}).length;

    const typeCount = countCategories(prefs.types);
    const stateCount = countCategories(prefs.states);
    const userCount = countCategories(prefs.users);
    const tagCount = countCategories(prefs.tags);

    // Score basé sur la variété des catégories préférées
    // 0 = très spécialisé (peu de catégories), 1 = très diversifié (beaucoup de catégories)
    const maxScore = (30 + 20 + 100 + 100) / 250; // Normalisé
    const actualScore =
        (typeCount / 30 + stateCount / 20 + userCount / 100 + tagCount / 100) /
        4;

    prefs.diversityScore = Math.min(1, Math.max(0, actualScore));
}

// Ratio d'exploration adaptatif basé sur la diversité des intérêts
function getAdaptiveExplorationRatio(prefs) {
    const diversityScore = (prefs && prefs.diversityScore) || 0.5;
    const interactionCount = (prefs && prefs.interactionCount) || 0;

    // Utilisateurs très spécialisés explorent moins (moins de nouveauté)
    // Utilisateurs diversifiés explorent plus (plus curieux)
    let baseRatio = 0.08 + diversityScore * 0.12; // Entre 8% et 20%

    // Utilisateurs avec peu d'interactions explorent plus (pour apprendre les préférences)
    if (interactionCount < 50) {
        baseRatio += 0.1; // +10% pour les nouveaux utilisateurs
    } else if (interactionCount > 500) {
        baseRatio -= 0.02; // -2% pour les utilisateurs très engagés
    }

    return Math.min(0.4, Math.max(0.08, baseRatio)); // Clamper entre 8% et 40%
}

function extractSearchTokens(query) {
    if (!query) return [];
    return query
        .toLowerCase()
        .split(/[^a-z0-9À-ÿ]+/i)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3)
        .slice(0, 8);
}

function recordSearchPreference(query) {
    const tokens = extractSearchTokens(query);
    if (tokens.length === 0) return;
    const prefs = loadImmersivePrefs();
    tokens.forEach((token) => {
        const normalized = token.toLowerCase();
        bumpPref(prefs.tags, normalized, 0.9);
        bumpPref(prefs.queries, normalized, 1.1);
    });
    prefs.tags = prunePrefsObject(prefs.tags, 120);
    prefs.queries = prunePrefsObject(prefs.queries, 120);
    saveImmersivePrefs(prefs);
}
window.recordSearchPreference = recordSearchPreference;

/**
 * Retourne le multiplicateur de boost basé sur le plan du créateur
 * Free: 1.0 (pas de boost)
 * Standard: 1.125 (+12.5% du score)
 * Medium: 1.5 (+50% du score)
 * Pro: 5.0 (+400% du score)
 */
function getPlanBoostMultiplier(userId) {
    if (!userId || typeof allUsers === "undefined") return 1.0;

    const creator = Array.isArray(allUsers)
        ? allUsers.find((u) => u.id === userId)
        : null;

    if (!creator) return 1.0;

    const plan = String(creator.plan || "")
        .toLowerCase()
        .trim();

    switch (plan) {
        case "pro":
            return 5.0; // Score de visibilité multiplié par 5
        case "medium":
            return 1.5; // Score de visibilité multiplié par 1,5
        case "standard":
            return 1.125; // +12.5%
        default:
            return 1.0; // Pas de boost pour Free
    }
}

/**
 * Score le contenu basé sur les préférences de l'utilisateur
 * Retourne un score entre -1 et 5+
 * Les scores plus élevés indiquent une meilleure correspondance avec les préférences
 * Inclut les boosts basés sur le plan du créateur
 */
function scoreContentForRecommendation(content, prefs) {
    if (!content || !prefs) return 0;

    let score = 0;

    // Score basé sur le type de contenu
    if (content.type && prefs.types && prefs.types[content.type]) {
        const typeScore = Math.min(
            2,
            Math.abs(prefs.types[content.type]) * 0.5,
        );
        score += prefs.types[content.type] > 0 ? typeScore : -typeScore * 0.5;
    }

    // Score basé sur l'état du contenu
    if (content.state && prefs.states && prefs.states[content.state]) {
        const stateScore = Math.min(
            1.5,
            Math.abs(prefs.states[content.state]) * 0.4,
        );
        score +=
            prefs.states[content.state] > 0 ? stateScore : -stateScore * 0.5;
    }

    // Score basé sur l'utilisateur/créateur
    if (content.userId && prefs.users && prefs.users[content.userId]) {
        const userScore = Math.min(
            1.8,
            Math.abs(prefs.users[content.userId]) * 0.6,
        );
        score += prefs.users[content.userId] > 0 ? userScore : -userScore * 0.3;
    }

    // Score basé sur les tags
    if (Array.isArray(content.tags) && prefs.tags) {
        let tagScore = 0;
        let matchingTags = 0;

        content.tags.forEach((tag) => {
            const normalizedTag = String(tag || "")
                .trim()
                .toLowerCase();
            if (prefs.tags[normalizedTag]) {
                const tagValue = Math.abs(prefs.tags[normalizedTag]) * 0.3;
                tagScore +=
                    prefs.tags[normalizedTag] > 0 ? tagValue : -tagValue * 0.4;
                matchingTags++;
            }
        });

        if (matchingTags > 0) {
            score += Math.min(2, tagScore);
        }
    }

    // Pénalité si déjà vu
    if (content.contentId && prefs.seen && prefs.seen[content.contentId]) {
        score *= 0.3; // Réduire drastiquement le score du contenu déjà vu
    }

    // Appliquer le boost basé sur le plan du créateur
    const planBoost = getPlanBoostMultiplier(content.userId);
    score *= planBoost;

    return score;
}

/**
 * Retourne le niveau du plan (0-3) pour le tri par priorité
 */
function getPlanTier(userId) {
    if (!userId || typeof allUsers === "undefined") return 0;

    const creator = Array.isArray(allUsers)
        ? allUsers.find((u) => u.id === userId)
        : null;

    if (!creator) return 0;

    const plan = String(creator.plan || "")
        .toLowerCase()
        .trim();

    switch (plan) {
        case "pro":
            return 3; // Priorité maximale
        case "medium":
            return 2; // Priorité haute
        case "standard":
            return 1; // Priorité moyenne
        default:
            return 0; // Priorité basse (Free)
    }
}

/**
 * Filtre et trie le contenu basé sur les préférences avec exploration adaptative
 * et priorité par plan d'abonnement
 */
function filterAndSortContentByPreferences(contentList, prefs) {
    if (!Array.isArray(contentList) || !prefs) {
        return contentList;
    }

    // Calculer le ratio d'exploration adaptatif
    const explorationRatio = getAdaptiveExplorationRatio(prefs);

    // Diviser le contenu en contenu préféré et contenu d'exploration
    const scoredContent = contentList.map((content) => ({
        content,
        score: scoreContentForRecommendation(content, prefs),
        planTier: getPlanTier(content.userId),
    }));

    // Trier par: 1) Plan (pro > medium > standard > free), 2) Score (décroissant)
    scoredContent.sort((a, b) => {
        // D'abord comparer par niveau de plan (décroissant: 3, 2, 1, 0)
        if (b.planTier !== a.planTier) {
            return b.planTier - a.planTier;
        }
        // Si même plan, trier par score
        return b.score - a.score;
    });

    // Diviser entre contenu préféré et contenu d'exploration
    const preferredCount = Math.ceil(
        scoredContent.length * (1 - explorationRatio),
    );
    const preferred = scoredContent.slice(0, preferredCount);
    const exploration = scoredContent.slice(preferredCount);

    // Mélanger légèrement le contenu d'exploration pour plus de découverte
    exploration.sort(() => Math.random() - 0.5);

    // Créer un ordre entrelacé: recommandations, puis exploration
    // Cela maintient la priorité des plans tout en introduisant de la diversité
    const finalOrder = [];
    const chunkSize = Math.max(
        3,
        Math.floor(preferred.length / Math.max(1, exploration.length)),
    );

    for (let i = 0; i < preferred.length; i += chunkSize) {
        finalOrder.push(...preferred.slice(i, i + chunkSize));
        if (exploration.length > 0) {
            finalOrder.push(exploration.shift());
        }
    }

    // Ajouter le contenu d'exploration restant
    finalOrder.push(...exploration);

    return finalOrder.map((item) => item.content);
}

window.scoreContentForRecommendation = scoreContentForRecommendation;
window.filterAndSortContentByPreferences = filterAndSortContentByPreferences;
window.getPlanTier = getPlanTier;
window.getPlanBoostMultiplier = getPlanBoostMultiplier;

function findContentById(contentId) {
    if (!contentId || typeof userContents === "undefined") return null;
    for (const list of Object.values(userContents)) {
        if (!Array.isArray(list)) continue;
        const hit = list.find((item) => item.contentId === contentId);
        if (hit) return hit;
    }
    return null;
}

async function getFollowedUserIdSet(forceRefresh = false) {
    if (!currentUser) return new Set();
    const viewerId = currentUser.id;
    const now = Date.now();
    const cacheIsFresh =
        followedUserIdsCacheOwner === viewerId &&
        now - followedUserIdsCacheUpdatedAt < FOLLOWED_IDS_CACHE_TTL_MS;
    if (!forceRefresh && cacheIsFresh) {
        return new Set(followedUserIdsCache);
    }

    try {
        const { data, error } = await supabase
            .from("followers")
            .select("following_id")
            .eq("follower_id", viewerId);
        if (error) throw error;
        followedUserIdsCacheOwner = viewerId;
        followedUserIdsCache = new Set(
            (data || []).map((row) => row.following_id),
        );
        followedUserIdsCacheUpdatedAt = Date.now();
        return new Set(followedUserIdsCache);
    } catch (e) {
        console.error("Error fetching followed users for personalization:", e);
        return new Set();
    }
}

const IMMERSIVE_EXPLORATION_RATIO = 0.12; // ~12% of feed used for off-preference probing
const IMMERSIVE_PREF_ALIGNMENT_THRESHOLD = 0.45; // below this, content is considered non-preference

function normalizeArcStageLevelForScore(value) {
    const raw = String(value || "")
        .trim()
        .toLowerCase();
    if (raw === "idea" || raw === "idée") return "idee";
    if (raw === "prototype") return "prototype";
    if (raw === "demo" || raw === "démo") return "demo";
    if (raw === "beta" || raw === "bêta") return "beta";
    if (raw === "release") return "release";
    return "idee";
}

function normalizeArcOpportunityIntent(value) {
    const raw = String(value || "")
        .trim()
        .toLowerCase();
    if (raw === "cherche_collab" || raw === "collab") return "cherche_collab";
    if (
        raw === "cherche_investissement" ||
        raw === "investissement" ||
        raw === "investor"
    )
        return "cherche_investissement";
    if (raw === "open_to_recruit" || raw === "recruit" || raw === "recruiter")
        return "open_to_recruit";
    return null;
}

function normalizeArcOpportunityIntentList(values) {
    const asArray = Array.isArray(values)
        ? values
        : typeof values === "string" && values.trim()
          ? values
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
          : [];

    return Array.from(
        new Set(asArray.map(normalizeArcOpportunityIntent).filter(Boolean)),
    );
}

function getCurrentViewerDiscoveryRole() {
    if (!currentUser) return "fan";
    const profile = getCurrentUserProfile();
    const profileRole =
        profile?.account_subtype || profile?.accountSubtype || null;
    const metadataRole = currentUser?.user_metadata?.account_subtype || null;
    return normalizeDiscoveryAccountRole(profileRole || metadataRole || "fan");
}

function computeOpportunityRoleBoost(content, context) {
    const viewerRole = context?.viewerRole || "fan";
    const intents = normalizeArcOpportunityIntentList(
        content?.arcOpportunityIntents,
    );
    const stage = normalizeArcStageLevelForScore(content?.arcStageLevel);
    const hasArc = !!content?.arcId;
    const hasRecruitSignal = intents.includes("open_to_recruit");
    const hasInvestSignal = intents.includes("cherche_investissement");
    const hasCollabSignal = intents.includes("cherche_collab");

    let boost = 0;
    if (hasArc) {
        // Un arc sans ciblage reste "public"
        boost += intents.length === 0 ? 0.18 : 0.06;
    }

    if (viewerRole === "recruiter") {
        if (hasRecruitSignal) boost += 2.35;
        if (hasCollabSignal) boost += 0.7;
        if (hasInvestSignal) boost += 0.25;
        if (
            stage === "prototype" ||
            stage === "demo" ||
            stage === "beta" ||
            stage === "release"
        ) {
            boost += 0.42;
        }
        return boost;
    }

    if (viewerRole === "investor") {
        if (hasInvestSignal) boost += 2.45;
        if (hasCollabSignal) boost += 0.25;
        if (hasRecruitSignal) boost += 0.2;
        if (stage === "prototype") boost += 0.4;
        if (stage === "demo" || stage === "beta" || stage === "release") {
            boost += 0.72;
        }
        return boost;
    }

    // fan / default viewer
    if (hasCollabSignal) boost += 0.22;
    if (hasRecruitSignal) boost += 0.12;
    if (hasInvestSignal) boost += 0.08;
    if (stage === "demo" || stage === "release") boost += 0.2;
    return boost;
}

function scoreImmersiveContent(content, context) {
    const now = context.now || Date.now();
    const createdAt = content.createdAt
        ? new Date(content.createdAt).getTime()
        : now;
    const ageHours = Math.max(0, (now - createdAt) / (1000 * 60 * 60));
    const recency = Math.exp(-ageHours / 72); // 3 days half-ish
    const engagementRaw =
        Math.log1p(content.encouragementsCount || 0) * 1.15 +
        Math.log1p(content.views || 0) * 0.42;
    const engagement = Math.min(4.2, engagementRaw) * (0.6 + recency * 0.4);
    const followBoost =
        context.followedSet && context.followedSet.has(content.userId)
            ? 2.0
            : 0;
    const isVerifiedAuthor =
        typeof context.isVerifiedUserId === "function"
            ? !!context.isVerifiedUserId(content.userId)
            : false;
    const verifiedBoost = isVerifiedAuthor ? 1.6 : 0;
    const validationBoost = content.isValidatedPro ? 2.5 : 0;
    const authorScore =
        context.authorScoreMap && content.userId
            ? context.authorScoreMap.get(content.userId) || 0
            : 0;
    const authorBoost = authorScore * 0.85;
    const typePref = (context.prefs.types[content.type] || 0) * 0.45;
    const statePref = (context.prefs.states[content.state] || 0) * 0.25;
    const userPref = (context.prefs.users[content.userId] || 0) * 0.7;
    const tagPref = Array.isArray(content.tags)
        ? content.tags.reduce(
              (sum, tag) =>
                  sum +
                  (context.prefs.tags[String(tag || "").toLowerCase()] || 0) *
                      0.55,
              0,
          )
        : 0;
    let queryPref = 0;
    if (context.topQueries && context.topQueries.length > 0) {
        const text = `${(content.title || "").toString().toLowerCase()} ${(
            content.description || ""
        )
            .toString()
            .toLowerCase()}`;
        const tagSet = new Set(
            Array.isArray(content.tags)
                ? content.tags.map((t) => t.toLowerCase())
                : [],
        );
        context.topQueries.forEach(({ token, score }) => {
            if (!token) return;
            if (text.includes(token) || tagSet.has(token)) {
                queryPref += score * 0.35;
            }
        });
    }
    const seenPenalty =
        context.prefs.seen && context.prefs.seen[content.contentId] ? 0.8 : 0;
    const preferenceScore =
        typePref + statePref + userPref + tagPref + queryPref;
    const roleOpportunityBoost = computeOpportunityRoleBoost(content, context);
    const base =
        recency * 2.2 +
        engagement +
        followBoost +
        verifiedBoost +
        authorBoost +
        roleOpportunityBoost +
        preferenceScore -
        seenPenalty;
    const score = base + Math.random() * 0.08;
    return { score, preferenceScore };
}

function interleaveByUser(contents) {
    const buckets = new Map();
    contents.forEach((item) => {
        if (!buckets.has(item.userId)) buckets.set(item.userId, []);
        buckets.get(item.userId).push(item);
    });
    const result = [];
    let added = true;
    while (added) {
        added = false;
        for (const [userId, list] of buckets.entries()) {
            if (list.length > 0) {
                result.push(list.shift());
                added = true;
            }
        }
    }
    return result;
}

async function getPersonalizedFeed(contents) {
    if (!currentUser || !Array.isArray(contents) || contents.length < 3)
        return contents;
    const prefs = loadImmersivePrefs();
    const followedSet = await getFollowedUserIdSet();
    const authorScoreMap = buildAuthorScoreMapFromContents();
    const now = Date.now();
    const viewerRole = getCurrentViewerDiscoveryRole();
    const topQueries = Object.entries(prefs.queries || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([token, score]) => ({ token, score }));
    const scored = contents.map((item) => {
        const { score, preferenceScore } = scoreImmersiveContent(item, {
            prefs,
            followedSet,
            authorScoreMap,
            isVerifiedUserId: (userId) =>
                isVerifiedCreatorUserId(userId) ||
                isVerifiedStaffUserId(userId),
            now,
            topQueries,
            viewerRole,
        });
        return { item: { ...item }, score, preferenceScore };
    });

    scored.sort((a, b) => b.score - a.score);
    markExplorationInterest(scored);

    const ranked = scored.map((s) => s.item);
    return interleaveByUser(ranked);
}

function markExplorationInterest(scoredItems) {
    if (!Array.isArray(scoredItems) || scoredItems.length === 0) return;

    const viewer = currentUser?.id;
    const prefs = viewer ? loadImmersivePrefs() : null;
    const hasHistory =
        prefs &&
        ((Object.keys(prefs.tags || {}).length >= 8 &&
            Object.keys(prefs.users || {}).length >= 5) ||
            Object.keys(prefs.queries || {}).length >= 10);
    const explorationRatio = hasHistory ? IMMERSIVE_EXPLORATION_RATIO : 0.2;

    const targetRaw = Math.round(scoredItems.length * explorationRatio);
    const targetCount = Math.max(1, targetRaw);

    const candidates = scoredItems.filter(
        ({ preferenceScore }) =>
            (preferenceScore || 0) <= IMMERSIVE_PREF_ALIGNMENT_THRESHOLD,
    );

    if (candidates.length === 0) return;

    const cappedTarget = Math.min(targetCount, candidates.length);
    const step = Math.max(1, Math.floor(candidates.length / cappedTarget));

    let picked = 0;
    for (let i = 0; i < candidates.length && picked < cappedTarget; i += step) {
        candidates[i].item.__askInterest = true;
        picked += 1;
    }

    // If rounding left us short, fill sequentially
    let idx = 0;
    while (picked < cappedTarget && idx < candidates.length) {
        if (!candidates[idx].item.__askInterest) {
            candidates[idx].item.__askInterest = true;
            picked += 1;
        }
        idx += 1;
    }
}

// Helper to render header
async function renderImmersiveHeader(user, pageId = null) {
    let subscribeBtnHtml = "";
    let displayUser = {
        id: user?.id,
        name: user?.name,
        avatar: user?.avatar || "https://placehold.co/40",
        slug: null,
        isPage: false,
    };

    if (pageId) {
        const page =
            professionalPagesById.get(String(pageId)) ||
            window.professionalManager?.proPagesCache?.get(String(pageId));
        displayUser = {
            id: String(pageId),
            name: page?.name || "Page professionnelle",
            avatar: page?.avatar_url || "icons/enterprise.svg",
            slug: page?.slug || "",
            isPage: true,
        };
    }

    if (
        user &&
        currentUser &&
        currentUser.id !== user.id &&
        !displayUser.isPage
    ) {
        try {
            const isFollowingUser = await isFollowing(currentUser.id, user.id);
            const btnClass = isFollowingUser
                ? "btn-follow-immersive unfollow"
                : "btn-follow-immersive";
            const iconSrc = isFollowingUser
                ? "icons/subscribed.svg"
                : "icons/subscribe.svg";

            subscribeBtnHtml = `
                <button id="follow-immersive-btn-${user.id}" class="${btnClass}" onclick="event.stopPropagation(); toggleFollow('${currentUser.id}', '${user.id}')" style="background: transparent; border: none; padding: 0;">
                    <img src="${iconSrc}" class="btn-icon" style="width: 24px; height: 24px;">
                </button>
            `;
        } catch (e) {
            console.error(e);
        }
    } else if (!user && !displayUser.isPage) {
        return "";
    }

    const profileOnClick = displayUser.isPage
        ? `window.openProfessionalPageById('${escapeHtml(pageId)}')`
        : `handleProfileClick('${user.id}', this, true)`;

    return `
<div class="immersive-header" id="immersive-header-content">
            <button class="profile-link immersive-profile-link" onclick="event.stopPropagation(); ${profileOnClick}">
                <img src="${displayUser.avatar}" class="immersive-user-avatar">
                <span class="immersive-user-name">${renderUsernameWithBadge(displayUser.name, displayUser.isPage ? pageId : user.id, displayUser.isPage)}</span>
            </button>
            ${subscribeBtnHtml}
</div>
    `;
}

async function renderImmersiveFeed(contents) {
    let encouragedContentIds = new Set();
    const followMap = new Map();
    const liveStreamMap = new Map(); // userId -> live row

    const arcIdsForImmersive = (contents || [])
        .filter((c) => c && c.arcId)
        .map((c) => c.arcId);
    if (arcIdsForImmersive.length > 0) {
        await preloadArcCollaborators(arcIdsForImmersive);
    }

    // Pré-charger les pages pro si nécessaire
    if (window.professionalManager) {
        const pageIds = new Set();
        (contents || []).forEach((c) => {
            if (c && c.pageId) pageIds.add(c.pageId);
        });
        if (pageIds.size > 0) {
            await Promise.all(
                Array.from(pageIds).map((id) =>
                    window.professionalManager.getPageInfo(id),
                ),
            );
        }
    }

    // Pré-charger les lives actifs des auteurs présents dans le feed
    try {
        const userIds = Array.from(
            new Set((contents || []).map((c) => c && c.userId).filter(Boolean)),
        );
        if (userIds.length > 0) {
            const { data: liveRows } = await supabase
                .from("streaming_sessions")
                .select("id, user_id, title, status")
                .eq("status", "live")
                .in("user_id", userIds);
            (liveRows || []).forEach((row) => {
                if (!row?.user_id || !row?.id) return;
                liveStreamMap.set(row.user_id, row);
            });
        }
    } catch (e) {
        console.warn(
            "Impossible de précharger les lives pour l'immersive feed",
            e,
        );
    }

    // Fetch user encouragements if logged in
    if (currentUser && contents.length > 0) {
        try {
            const contentIds = contents.map((c) => c.contentId);
            // Limit request size if too many items
            const batchIds = contentIds.slice(0, 500);

            const { data } = await supabase
                .from("content_encouragements")
                .select("content_id")
                .eq("user_id", currentUser.id)
                .in("content_id", batchIds);

            if (data) {
                data.forEach((row) => encouragedContentIds.add(row.content_id));
            }
        } catch (e) {
            console.error("Error fetching encouragements:", e);
        }

        try {
            const uniqueUserIds = Array.from(
                new Set(contents.map((c) => c.userId)),
            );
            if (uniqueUserIds.length > 0) {
                const { data: followData } = await supabase
                    .from("followers")
                    .select("following_id")
                    .eq("follower_id", currentUser.id)
                    .in("following_id", uniqueUserIds);
                if (followData) {
                    followData.forEach((row) =>
                        followMap.set(row.following_id, true),
                    );
                }
            }
        } catch (e) {
            console.error(
                "Error fetching follow status for immersive feed:",
                e,
            );
        }
    }

    return contents
        .map((content) => {
            const stateLabel =
                content.state === "success"
                    ? "#Victoire"
                    : content.state === "failure"
                      ? "#Bloqué"
                      : "#Pause";
            const liveRow =
                content.type === "live"
                    ? liveStreamMap.get(content.userId) || null
                    : null;
            const isAnnouncement = isAnnouncementContent(content);
            const canReply = canReplyToContent(content);
            const timeLabel = timeAgo(content.createdAt || content.created_at);
            const replyContentId = content.contentId || content.id || "";
            const replyInputId = replyContentId
                ? `immersive-reply-input-${replyContentId}`
                : "";
            const replyCount =
                canReply && replyContentId ? getReplyCount(replyContentId) : 0;
            // Defensive: some cached/local items may still carry the tag payload inside
            // `description` (e.g. "\n\n#hashtags: ..."). Keep immersive copy clean.
            const fullDescription = extractTagsFromDescription(
                content.rawDescription || content.description || "",
            ).cleanDescription;

            // Nettoyer le titre en retirant le prefix "Objectif:" ou "objectif:"
            let cleanTitle = content.title || "";
            // Retirer "Objectif: ", "Objectif:" ou "objectif:" au début du titre
            cleanTitle = cleanTitle
                .replace(/^(Objectif|objectif):\s*/i, "")
                .trim();

            // Extract first two lines of description for immersive display
            const extractFirstTwoLines = (text) => {
                if (!text) return { preview: "", full: text, hasMore: false };
                const lines = text.split("\n").filter((line) => line.trim());
                if (lines.length <= 2) {
                    return { preview: text, full: text, hasMore: false };
                }
                const preview = lines.slice(0, 2).join("\n");
                return { preview, full: text, hasMore: true };
            };
            const descriptionInfo = extractFirstTwoLines(fullDescription);
            const immersiveDescription = descriptionInfo.preview;
            const hasMoreDescription =
                descriptionInfo.hasMore &&
                fullDescription &&
                fullDescription.length > immersiveDescription.length;

            const authorIdentity = getContentAuthorIdentity(content);
            const isPageAuthor = authorIdentity.type === "PAGE_PRO";
            const pageId = isPageAuthor ? authorIdentity.id : null;
            const contentBadges = getContentBadges(content);
            const contentBadgesHtml = renderBadges(contentBadges);
            const userBadgesHtml = isPageAuthor
                ? ""
                : renderUserBadges(content.userId);
            const badgesHtml = contentBadgesHtml + userBadgesHtml;
            const contentUser = getUser(content.userId);

            const page =
                pageId &&
                (professionalPagesById.get(String(pageId)) ||
                    window.professionalManager?.proPagesCache?.get(
                        String(pageId),
                    ));
            const displayUser = isPageAuthor
                ? {
                      id: String(pageId),
                      name: page?.name || "Page professionnelle",
                      avatar: page?.avatar_url || "icons/enterprise.svg",
                      slug: page?.slug || "",
                      isPage: true,
                  }
                : {
                      id: content.userId,
                      name: contentUser ? contentUser.name : "Utilisateur",
                      avatar: contentUser?.avatar || "https://placehold.co/40",
                      isPage: false,
                  };

            const contentUserNameHtml = renderUsernameWithBadge(
                displayUser.name,
                displayUser.isPage ? pageId : displayUser.id,
                displayUser.isPage,
            );
            const contentUserAvatar = displayUser.avatar;

            const isFollowingUser = currentUser
                ? followMap.get(content.userId) === true
                : false;
            const followIconSrc = isFollowingUser
                ? "icons/subscribed.svg"
                : "icons/subscribe.svg";
            const followBtnClass = isFollowingUser
                ? "btn-follow-immersive inline unfollow"
                : "btn-follow-immersive inline";
            const collabAvatarsHtml = buildArcCollaboratorAvatars(content, {
                size: 22,
                className: "arc-collab-avatars--immersive",
                fromImmersive: true,
            });
            const collabCornerHtml = buildArcCollaboratorCornerAvatars(
                content,
                {
                    size: 20,
                    max: 4,
                    className: "arc-collab-avatars--immersive-corner",
                    fromImmersive: true,
                },
            );
            const immersiveSupportButtonHtml =
                !isPageAuthor &&
                currentUser &&
                currentUser.id !== content.userId &&
                typeof window.generateSupportButtonHTML === "function"
                    ? window.generateSupportButtonHTML(contentUser, "feed")
                    : "";
            const immersiveSupportOverlayHtml = immersiveSupportButtonHtml
                ? `<div class="support-overlay support-overlay--immersive${collabCornerHtml ? " support-overlay--stacked" : ""}">${immersiveSupportButtonHtml}</div>`
                : "";

            let mediaHtml = "";
            const mediaList = Array.isArray(content.mediaUrls)
                ? content.mediaUrls.filter(Boolean)
                : content.mediaUrl
                  ? [content.mediaUrl]
                  : [];
            const c2paBadgeImmersive = renderC2PABadgeHtml(
                "immersive",
                content,
            );
            if (mediaList.length > 0) {
                if (content.type === "video") {
                    mediaHtml = `
                    <div class="immersive-video-wrap" style="position: relative; width: 100%; height: 100%;">
                        <video
                            id="immersive-video-${content.contentId}"
                            class="immersive-video"
                            data-src="${mediaList[0]}"
                            playsinline
                            webkit-playsinline
                            autoplay
                            muted
                            loop
                            preload="metadata"
                            style="width: 100%; height: 100%; object-fit: contain;"
                            data-content-id="${content.contentId}"
                            disablePictureInPicture
                        ></video>
                        ${c2paBadgeImmersive}
                        <div class="video-buffering-spinner" aria-hidden="true">
                            <div class="spinner-ring"></div>
                        </div>
                        <div class="video-fallback">
                            <img src="icons/play.svg" alt="Play" width="56" height="56">
                            <span>Vidéo</span>
                        </div>
                        ${collabCornerHtml}
                        <img class="immersive-video-play" src="icons/play.svg" alt="Play" style="position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); width:64px; height:64px; opacity:0.9; display:none; pointer-events:none;" />
                    </div>
                `;
                } else {
                    if (mediaList.length > 1) {
                        const slides = mediaList
                            .map(
                                (u, index) =>
                                    `<div class="xera-carousel-slide"><img ${index === 0 ? `src="${u}"` : `data-src="${u}"`} class="immersive-image" alt="${content.title || "Media"}" loading="lazy" decoding="async"></div>`,
                            )
                            .join("");
                        const dots = `<div class="xera-carousel-dots">${mediaList
                            .map(
                                (_, i) =>
                                    `<span class="xera-dot ${i === 0 ? "active" : ""}" data-index="${i}"></span>`,
                            )
                            .join("")}</div>`;
                        mediaHtml = `
                            <div class="immersive-image-wrap" style="position: relative;">
                                ${c2paBadgeImmersive}
                                <div class="xera-carousel xera-carousel--immersive" data-carousel>
                                    <div class="xera-carousel-track">${slides}</div>
                                    <button type="button" class="xera-carousel-arrow xera-carousel-arrow--prev" aria-label="Image précédente">&lsaquo;</button>
                                    <button type="button" class="xera-carousel-arrow xera-carousel-arrow--next" aria-label="Image suivante">&rsaquo;</button>
                                    <div class="xera-carousel-counter" aria-label="Collection de ${mediaList.length} images">
                                        Collection <span data-carousel-current>1</span>/<span data-carousel-total>${mediaList.length}</span>
                                    </div>
                                    ${dots}
                                </div>
                                ${collabCornerHtml}
                            </div>
                        `;
                    } else {
                        mediaHtml = `<div class="immersive-image-wrap" style="position: relative;"><img src="${mediaList[0]}" class="immersive-image" alt="${content.title || "Media"}">${c2paBadgeImmersive}${collabCornerHtml}</div>`;
                    }
                }
            } else {
                const textBody =
                    immersiveDescription ||
                    content.title ||
                    "Nouveau post texte";
                mediaHtml = `<div class="immersive-text-card">${collabCornerHtml}<p>${textBody}</p></div>`;
            }

            const targetContentId = content.contentId || content.id || "";
            const safeEncouragedSet =
                encouragedContentIds &&
                typeof encouragedContentIds.has === "function"
                    ? encouragedContentIds
                    : new Set();
            const isEncouraged = targetContentId
                ? safeEncouragedSet.has(targetContentId)
                : false;
            const courageIcon = isEncouraged
                ? "icons/courage-green.svg"
                : "icons/courage-blue.svg";
            const courageClass = isEncouraged
                ? "courage-btn encouraged"
                : "courage-btn";

            const dayPill =
                !isAnnouncement && typeof content.dayNumber === "number"
                    ? `<span class="step-indicator">Jour ${content.dayNumber}</span>`
                    : "";

            const isLiveContent = content.type === "live";
            const liveJoinHtml =
                isLiveContent && liveRow
                    ? `<button class="mood-btn live-join-btn" onclick="event.stopPropagation(); openLiveStreamById('${liveRow.id}', '${content.userId}', '${escapeHtml(liveRow.title || content.title || "Live en cours")}')">🔴 Rejoindre le live</button>`
                    : isLiveContent
                      ? `<button class="mood-btn live-join-btn" onclick="event.stopPropagation(); openLiveStreamForUser('${content.userId}', '${escapeHtml(content.title || "Live en cours")}')">🔴 Rejoindre le live</button>`
                      : "";

            const moodActionsHtml = content.__askInterest
                ? `
                <div class="mood-actions">
                    <button class="mood-btn" onclick="event.stopPropagation(); handleDiscoverInterest('${content.contentId}', 'like')">Intéressé</button>
                    <button class="mood-btn" onclick="event.stopPropagation(); handleDiscoverInterest('${content.contentId}', 'dislike')">Pas intéressé</button>
                    ${liveJoinHtml}
                </div>
            `
                : liveJoinHtml;

            const immersiveReplyHtml =
                canReply && replyContentId
                    ? `
                <div class="profile-update-reply-block immersive-reply-block">
                    <button type="button" class="reply-btn reply-btn-immersive" data-reply-toggle="${escapeHtml(replyContentId)}" aria-expanded="false" onclick="event.stopPropagation(); toggleProfileAnnouncementReplies(${inlineJsString(replyContentId)})">
                        <span data-reply-toggle-label="${escapeHtml(replyContentId)}">Répondre</span>
                        <span class="reply-count" data-reply-count="${escapeHtml(replyContentId)}">${replyCount}</span>
                    </button>
                </div>
            `
                    : "";

            return `
            <div class="immersive-post" data-content-id="${content.contentId}" data-user-id="${content.userId}">
                <div class="post-content-wrap">
                    ${immersiveSupportOverlayHtml}
                    ${mediaHtml}
                    <div class="post-info">
                        <div class="immersive-meta-row">
                            ${dayPill}
                            <span class="state-tag">${stateLabel}</span>
                            ${
                                isAnnouncement
                                    ? '<span class="announcement-chip">Annonce</span>'
                                    : content.type === "news"
                                      ? '<span class="announcement-chip">Actualité</span>'
                                      : content.type === "event"
                                        ? '<span class="announcement-chip">Événement</span>'
                                        : ""
                            }
                            ${
                                timeLabel
                                    ? `<span class="time-ago-label">${timeLabel}</span>`
                                    : ""
                            }
                        </div>
                        
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-top: 0.4rem; flex-wrap: wrap; gap: 10px;">
                            <div style="flex: 1; min-width: 200px;">
                                <h2>${cleanTitle}</h2>
                                ${window.professionalManager ? window.professionalManager.renderSealOfApproval(content) : ""}
                            </div>
                            <div class="post-stats" style="display:flex; gap:1rem;">
                                <div class="stat-pill" title="Vues">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    <span title="${(Number(content.views) || 0).toLocaleString("fr-FR")}">${formatCompactCount(content.views || 0)}</span>
                                </div>
                                <button type="button" class="${courageClass} immersive-courage-btn" data-content-id="${content.contentId}" aria-label="Encourager cette publication" onclick="event.stopPropagation(); toggleCourage('${content.contentId}', this)">
                                    <img class="immersive-courage-icon" src="${courageIcon}" width="18" height="18" alt="" aria-hidden="true">
                                    <span class="courage-count" data-count="${Number(content.encouragementsCount) || 0}" title="${(Number(content.encouragementsCount) || 0).toLocaleString("fr-FR")}">${formatCompactCount(content.encouragementsCount || 0)}</span>
                                </button>
                            </div>
                        </div>
                        
                        <div class="immersive-description-wrapper" data-content-id="${content.contentId}">
                            <p class="immersive-description" onclick="event.stopPropagation(); expandImmersiveDescription('${content.contentId}')">${renderRichDescription(immersiveDescription)}</p>
                            ${hasMoreDescription ? `<button type="button" class="immersive-description-more" onclick="event.stopPropagation(); expandImmersiveDescription('${content.contentId}')">Lire la suite</button>` : ""}
                        </div>
                        ${moodActionsHtml}
                        ${immersiveReplyHtml}
                        <div class="immersive-post-user">
                            <button class="profile-link immersive-profile-link" data-profile-author-type="${displayUser.isPage ? "PAGE_PRO" : "USER"}" data-profile-${displayUser.isPage ? "page" : "user"}-id="${escapeHtml(displayUser.isPage ? pageId : content.userId)}" onclick="event.stopPropagation(); ${displayUser.isPage ? `window.openProfessionalPageById('${escapeHtml(pageId)}')` : `handleProfileClick('${content.userId}', this, true)`}">
                                <img src="${contentUserAvatar}" alt="Avatar de ${displayUser.name}" class="immersive-post-user-avatar">
                                <span class="immersive-post-user-name">${contentUserNameHtml}</span>
                            </button>
                            ${collabAvatarsHtml}
                            ${
                                !isPageAuthor && currentUser && currentUser.id !== content.userId
                                    ? `
                                <button class="${followBtnClass}" data-follow-user="${content.userId}" onclick="event.stopPropagation(); toggleFollow('${currentUser.id}', '${content.userId}')">
                                    <img src="${followIconSrc}" class="btn-icon" style="width: 20px; height: 20px;">
                                </button>
                            `
                                    : ""
                            }
                        </div>
                        <div class="badges-immersive">
                            ${badgesHtml}
                            ${renderShareButton({ contentId: content.contentId, className: "btn-share-post-immersive" })}
                        </div>
                    </div>
                </div>
            </div>
`;
        })
        .join("");
}

// Squelettes de chargement pour le feed immersif
function renderImmersiveSkeleton(count = 3) {
    const items = [];
    for (let i = 0; i < count; i++) {
        items.push(`
            <div class="immersive-post skeleton">
                <div class="immersive-video-wrap skeleton-block"></div>
                <div class="immersive-meta skeleton-meta">
                    <div class="skeleton-line short"></div>
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line"></div>
                </div>
            </div>
`);
    }
    return items.join("");
}

// Backward compatibility
async function renderImmersiveContent(userId) {
    const contents = getUserContentLocal(userId);
    return renderImmersiveFeed(contents);
}

async function openImmersive(
    startUserId,
    startContentId = null,
    options = {},
) {
    console.log("Opening immersive for user:", startUserId);

    // Vérifier si les données sont chargées
    if (!allUsers || allUsers.length === 0) {
        console.error("Users data not loaded");
        alert("Chargement des données en cours, veuillez réessayer...");
        return;
    }

    const overlay = document.getElementById("immersive-overlay");

    if (!overlay) {
        console.error("Immersive overlay not found");
        return;
    }

    // Initial loading state
    overlay.innerHTML = `
<div class="close-immersive" onclick="closeImmersive()">✕</div>
<div id="immersive-content-container" class="immersive-skeleton-container">
            ${renderImmersiveSkeleton(4)}
</div>
    `;
    overlay.style.display = "block";
    overlay.classList.add("immersive-clean-mode");
    document.body.style.overflow = "hidden";
    // Ajouter une classe au body pour masquer les boutons "Ajouter une mise à jour"
    document.body.classList.add("immersive-mode-active");
    // Marquer l'immersif comme ouvert pour éviter les rafraîchissements indésirables
    window.__immersiveOpen = true;
    handleLoginPromptContext();

    try {
        initXeraCarousels(overlay);
    } catch (e) {
        /* ignore */
    }

    try {
        let startIndex = -1;
        let allContents = [];
        const profileOnlyUserId = options.profileOnly
            ? String(options.userId || startUserId || "")
            : "";

        if (profileOnlyUserId) {
            allContents = getUserContentLocal(profileOnlyUserId)
                .filter((content) => {
                    const authorId = String(
                        content.userId || content.user_id || profileOnlyUserId,
                    );
                    const mediaUrls = [
                        ...(Array.isArray(content.mediaUrls)
                            ? content.mediaUrls
                            : []),
                        ...(Array.isArray(content.media_urls)
                            ? content.media_urls
                            : []),
                        content.mediaUrl,
                        content.media_url,
                    ];
                    return (
                        authorId === profileOnlyUserId &&
                        String(content.type || "").toLowerCase() !== "live" &&
                        mediaUrls.some((url) => String(url || "").trim())
                    );
                })
                .sort(
                    (left, right) =>
                        new Date(
                            right.createdAt || right.created_at || 0,
                        ).getTime() -
                        new Date(
                            left.createdAt || left.created_at || 0,
                        ).getTime(),
                );

            const clickedIndex = allContents.findIndex(
                (content) =>
                    String(content.contentId || content.content_id || content.id) ===
                    String(startContentId || ""),
            );
            if (clickedIndex < 0) {
                closeImmersive();
                return;
            }

            allContents = allContents.slice(clickedIndex);
            startIndex = 0;
            startUserId = profileOnlyUserId;
        } else {
            // Global feed remains personalized; only profile entry points pass profileOnly.
            allContents = await waitForImmersiveFeedContent();
            if (!window.__immersiveOpen) return;
            console.log("All contents found:", allContents.length);

            if (startContentId) {
                startIndex = allContents.findIndex(
                    (content) => content.contentId === startContentId,
                );
            } else {
                const latest = getLatestContent(startUserId);
                startIndex = latest
                    ? allContents.findIndex(
                          (content) => content.contentId === latest.contentId,
                      )
                    : -1;
            }
            if (startIndex > 0) {
                const [pinned] = allContents.splice(startIndex, 1);
                allContents.unshift(pinned);
                startIndex = 0;
                if (pinned && pinned.userId) {
                    startUserId = pinned.userId;
                }
            }
            if (startIndex < 0 && allContents[0]) {
                startIndex = 0;
                startUserId = allContents[0].userId || startUserId;
            }
        }

        if (!window.__immersiveOpen) return;
        if (allContents.length === 0) {
            closeImmersive();
            return;
        }
        console.log(
            "Start index:",
            startIndex,
            "Start content:",
            startContentId || "(latest)",
        );

        // Pagination: ne charger qu'un nombre limité d'items au départ
        const IMMERSIVE_PAGE_SIZE = 200;
        let immersiveCurrentPage = 0;
        const immersiveTotalPages = Math.max(
            1,
            Math.ceil(allContents.length / IMMERSIVE_PAGE_SIZE),
        );
        const renderImmersivePage = async (pageIndex) => {
            const start = pageIndex * IMMERSIVE_PAGE_SIZE;
            const slice = allContents.slice(start, start + IMMERSIVE_PAGE_SIZE);
            if (!slice || slice.length === 0) return "";
            return await renderImmersiveFeed(slice);
        };

        // Initial page
        const initialContentHtml = await renderImmersivePage(0);

        // Initial header for the starting user
        const user = getUser(startUserId) || getUser(allContents[0]?.userId);
        if (!user) {
            console.error("User not found:", startUserId);
            alert("Utilisateur non trouvé");
            closeImmersive();
            return;
        }

        const startPost =
            startIndex >= 0 ? allContents[startIndex] : allContents[0];
        const headerHtml = await renderImmersiveHeader(user, startPost?.pageId);

        // Header Styles & HTML
        const headerStyle = `
            <style>
                .immersive-header {
                    position: absolute;
                    top: 20px;
                    left: 20px;
                    z-index: 100;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    pointer-events: none;
                    transition: opacity 0.3s;
                }
                .immersive-header > * {
                    pointer-events: auto;
                }
                .immersive-user-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    border: 2px solid rgba(255,255,255,0.8);
                    object-fit: cover;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                }
                .immersive-user-name {
                    color: white;
                    font-weight: 600;
                    cursor: pointer;
                    font-size: 1.1rem;
                }
                .btn-follow-immersive {
                    background: rgba(255,255,255,0.2);
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 20px;
                    padding: 6px 12px;
                    color: white;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-follow-immersive:hover {
                    background: rgba(255,255,255,0.3);
                }
                .btn-follow-immersive.unfollow {
                    background: rgba(16,185,129,0.8);
                    border-color: rgba(16,185,129,0.9);
                }
                .close-immersive {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 1001;
                    width: 40px;
                    height: 40px;
                    background: rgba(0,0,0,0.8);
                    border: none;
                    border-radius: 50%;
                    color: white;
                    font-size: 1.2rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .close-immersive:hover {
                    background: rgba(0,0,0,0.9);
                }
            </style>
`;

        // Assemble final HTML
        overlay.innerHTML = `
            ${headerStyle}
            <div class="close-immersive" onclick="closeImmersive()">✕</div>
            <div id="immersive-header-container">
                ${headerHtml}
            </div>
            <div id="immersive-content-container">
                ${initialContentHtml}
                <div id="immersive-load-sentinel" style="width:100%;height:4px"></div>
            </div>
            <div class="immersive-nav-arrows" id="immersive-nav-arrows">
                <button class="immersive-arrow" id="immersive-arrow-up" aria-label="Post précédent">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>
                </button>
                <button class="immersive-arrow" id="immersive-arrow-down" aria-label="Post suivant">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9l-6 6-6-6"/></svg>
                </button>
            </div>
`;
        applyImmersiveMetadataPreference(overlay);

        try {
            initXeraCarousels(overlay);
        } catch (e) {
            /* ignore */
        }

        // Scroll to the starting content (si présent dans la première page)
        if (startIndex >= 0) {
            setTimeout(() => {
                const startElement = document.querySelector(
                    `[data-content-id="${allContents[startIndex].contentId}"]`,
                );
                if (startElement) {
                    startElement.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                    });
                }
            }, 100);
        }

        // Setup immersive interactions and lazy-load pour la première page
        setTimeout(() => {
            setupImmersiveLazyLoad();
            setupImmersiveObserver();
            setupImmersiveVideoUI();
            setupImmersiveSnapNav();
            setupImmersiveKeyboardNav();
            setupImmersiveArrowNav();
            setupImmersiveFullscreenToggle();

            // Sentinel pour charger les pages suivantes lorsque l'utilisateur scroll
            const overlayEl = document.getElementById("immersive-overlay");
            const container = document.getElementById(
                "immersive-content-container",
            );
            const sentinel = document.getElementById("immersive-load-sentinel");
            if (sentinel && container && overlayEl) {
                const loadNextPage = async () => {
                    if (immersiveCurrentPage + 1 >= immersiveTotalPages) {
                        // Plus rien à charger
                        if (window.__immersiveSentinelObserver) {
                            try {
                                window.__immersiveSentinelObserver.disconnect();
                            } catch (e) {}
                            window.__immersiveSentinelObserver = null;
                        }
                        if (sentinel && sentinel.parentNode)
                            sentinel.parentNode.removeChild(sentinel);
                        return;
                    }
                    immersiveCurrentPage += 1;
                    try {
                        const pageHtml =
                            await renderImmersivePage(immersiveCurrentPage);
                        container.insertAdjacentHTML("beforeend", pageHtml);
                        applyImmersiveMetadataPreference(container);
                        // réinitialiser les observers / UI pour les nouveaux éléments
                        setupImmersiveLazyLoad();
                        setupImmersiveObserver();
                        setupImmersiveVideoUI();
                        setupImmersiveSnapNav();
                        setupImmersiveArrowNav();
                        setupImmersiveFullscreenToggle();
                    } catch (e) {
                        console.error("Erreur chargement page immersive:", e);
                    }
                };

                // Déconnecter l'ancien observer si présent
                if (window.__immersiveSentinelObserver) {
                    try {
                        window.__immersiveSentinelObserver.disconnect();
                    } catch (e) {}
                    window.__immersiveSentinelObserver = null;
                }

                window.__immersiveSentinelObserver = new IntersectionObserver(
                    (entries) => {
                        entries.forEach((entry) => {
                            if (entry.isIntersecting) {
                                loadNextPage().catch(console.error);
                            }
                        });
                    },
                    {
                        root:
                            document.getElementById("immersive-overlay") ||
                            null,
                        rootMargin: "600px 0px",
                        threshold: 0.1,
                    },
                );

                try {
                    window.__immersiveSentinelObserver.observe(sentinel);
                } catch (e) {
                    // fallback: remove sentinel
                    if (sentinel && sentinel.parentNode)
                        sentinel.parentNode.removeChild(sentinel);
                }
            }
        }, 100);
    } catch (error) {
        console.error("Error opening immersive:", error);
        overlay.innerHTML = `
            <div class="close-immersive" onclick="closeImmersive()">✕</div>
            <div style="display:flex;justify-content:center;align-items:center;height:100vh;color:white;">
                <div style="text-align:center;">
                    <h3>Erreur de chargement</h3>
                    <p>${error.message}</p>
                    <button onclick="closeImmersive()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #333; border: none; border-radius: 4px; color: white; cursor: pointer;">Fermer</button>
                </div>
            </div>
`;
    }
}

function closeImmersive() {
    const overlay = document.getElementById("immersive-overlay");
    if (!overlay) return;
    overlay.querySelectorAll("video.immersive-video").forEach((video) => {
        video.pause();
        video.muted = true;
    });
    overlay.style.display = "none";
    overlay.classList.remove("immersive-clean-mode");
    document.body.style.overflow = "auto";
    // Retirer la classe pour afficher à nouveau les boutons "Ajouter une mise à jour"
    document.body.classList.remove("immersive-mode-active");
    loginPromptImmersiveViews = 0;
    handleLoginPromptContext();
    // Nettoyage des états liés à l'immersif
    try {
        window.__immersiveOpen = false;
        window.__activeImmersiveContentId = null;
        if (window.__immersiveSentinelObserver) {
            window.__immersiveSentinelObserver.disconnect();
            window.__immersiveSentinelObserver = null;
        }
        if (window.__immersiveObserver) {
            try {
                window.__immersiveObserver.disconnect();
            } catch (e) {}
            window.__immersiveObserver = null;
        }
        if (window.__immersiveLazyObserver) {
            try {
                window.__immersiveLazyObserver.disconnect();
            } catch (e) {}
            window.__immersiveLazyObserver = null;
        }
        const sentinel = document.getElementById("immersive-load-sentinel");
        if (sentinel && sentinel.parentNode)
            sentinel.parentNode.removeChild(sentinel);
    } catch (e) {
        // ignore cleanup errors
    }
}

let currentImmersiveUser = null;

// Désactive le son et met en pause toutes les vidéos immersives sauf celle passée
function muteOtherImmersiveVideos(activeVideo) {
    const videos = document.querySelectorAll("video.immersive-video");
    videos.forEach((vid) => {
        if (vid === activeVideo) return;
        vid.pause();
        vid.muted = true;
    });
}

// Renvoie la vidéo immersive la plus visible à l'écran
function getActiveImmersiveVideo() {
    const videos = Array.from(
        document.querySelectorAll("video.immersive-video"),
    );
    let best = null;
    let bestScore = 0;
    videos.forEach((vid) => {
        const rect = vid.getBoundingClientRect();
        const visibleHeight =
            Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        const visibleWidth =
            Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
        const visibleArea =
            Math.max(0, visibleHeight) * Math.max(0, visibleWidth);
        const totalArea = Math.max(1, rect.width * rect.height);
        const ratio = visibleArea / totalArea;
        if (ratio > bestScore) {
            bestScore = ratio;
            best = vid;
        }
    });
    return bestScore >= 0.4 ? best : null; // au moins 40% visible
}

// Assure que la vidéo immersive est chargée (lazy) avant lecture
function ensureImmersiveVideoLoaded(video, autoplay = false) {
    if (!video) return;
    if (video.dataset.loaded === "1") return;
    const src = video.dataset.src;
    if (!src) return;
    video.src = src;
    video.dataset.loaded = "1";
    // On garde preload metadata (déjà dans le markup)
    if (autoplay) {
        video.play().catch(() => {});
    }
}

function setupImmersiveObserver() {
    const posts = document.querySelectorAll(".immersive-post");
    if (!posts.length || typeof IntersectionObserver === "undefined") return;

    // Créer un observer global réutilisable pour éviter les doublons
    if (!window.__immersiveObserver) {
        window.__immersiveObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const video = entry.target.querySelector(
                        "video.immersive-video",
                    );

                    if (entry.isIntersecting) {
                        // La vidéo est visible - la jouer
                        if (video) {
                            ensureImmersiveVideoLoaded(video, true);
                            muteOtherImmersiveVideos(video);
                            video.muted = !window.__immersiveSoundUnlocked;
                            video.play().catch((error) => {
                                console.log(
                                    "Autoplay bloqué, attente interaction:",
                                    error,
                                );
                            });
                        }

                        const contentId = entry.target.dataset.contentId;
                        const userId = entry.target.dataset.userId;

                        if (
                            contentId &&
                            entry.target.dataset.viewed !== "true"
                        ) {
                            scheduleImmersiveViewCount(entry.target, video);
                        }

                        if (
                            contentId &&
                            window.__activeImmersiveContentId !== contentId
                        ) {
                            window.__activeImmersiveContentId = contentId;
                            setImmersivePostUi(
                                entry.target,
                                getImmersiveMetadataPreference(),
                                { syncAll: false },
                            );
                        }

                        // Update Header si nécessaire
                        if (userId && userId !== currentImmersiveUser) {
                            currentImmersiveUser = userId;
                            const user = getUser(userId);
                            const headerContainer = document.getElementById(
                                "immersive-header-container",
                            );
                            renderImmersiveHeader(user).then((html) => {
                                if (headerContainer)
                                    headerContainer.innerHTML = html;
                            });
                        }
                    } else {
                        if (video) {
                            video.pause();
                            video.muted = true;
                        }
                        clearImmersiveViewTracker(entry.target);
                    }
                });
            },
            {
                threshold: 0.5,
            },
        );
    }

    posts.forEach((post) => {
        if (post.dataset.immersiveObserved === "1") return;
        try {
            window.__immersiveObserver.observe(post);
            post.dataset.immersiveObserved = "1";
        } catch (e) {
            // ignore observation errors
        }
    });
}

function setupImmersiveVideoUI() {
    const container = document.getElementById("immersive-content-container");
    if (!container) return;

    const wraps = container.querySelectorAll(".immersive-video-wrap");
    wraps.forEach((wrap) => {
        if (wrap.dataset.immersiveUiBound === "1") return;
        const video = wrap.querySelector("video.immersive-video");
        const playIcon = wrap.querySelector(".immersive-video-play");
        const spinner = wrap.querySelector(".video-buffering-spinner");
        if (!video || !playIcon) return;
        wrap.dataset.immersiveUiBound = "1";
        video.loop = true;

        const updateOverlay = () => {
            playIcon.style.display = video.paused ? "block" : "none";
            if (spinner) spinner.style.display = video.paused ? "flex" : "none";
        };

        updateOverlay();

        video.addEventListener("play", updateOverlay);
        video.addEventListener("pause", updateOverlay);
        video.addEventListener("ended", updateOverlay);
        video.addEventListener(
            "loadeddata",
            () => {
                wrap.classList.add("is-ready");
                if (spinner) spinner.style.display = "none";
            },
            { once: true },
        );
        video.addEventListener(
            "error",
            () => {
                wrap.classList.add("has-error");
                if (spinner) spinner.style.display = "none";
            },
            { once: true },
        );
        video.addEventListener("waiting", () => {
            if (spinner) spinner.style.display = "flex";
        });
        video.addEventListener("canplay", () => {
            if (spinner) spinner.style.display = "none";
        });
        // Si la lecture reprend après un buffering, rétablir le son si l'utilisateur l'avait autorisé
        video.addEventListener("playing", () => {
            if (window.__immersiveSoundUnlocked) {
                muteOtherImmersiveVideos(video);
                video.muted = false;
            }
            updateOverlay();
        });

        wrap.addEventListener("click", () => {
            if (video.paused) {
                if (!window.__immersiveSoundUnlocked) {
                    window.__immersiveSoundUnlocked = true;
                }
                ensureImmersiveVideoLoaded(video, true);
                muteOtherImmersiveVideos(video);
                video.muted = false;
                video.play().catch(() => {});
            }
        });

        // Précharger légèrement au scroll; la lecture/son est gérée par setupImmersiveObserver
        setupVideoAutoplay(video, wrap);
    });

    // Initialiser l'activation globale du son
    initGlobalSoundActivation();

    // Activer le lazy-load avec préchargement progressif
    setupImmersiveLazyLoad();
}

function getImmersiveMetadataPreference() {
    return window.__immersiveMetadataVisible === true;
}

const IMMERSIVE_CONTENT_RETRY_DELAY = 3000;

function waitForImmersiveRetry(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForImmersiveFeedContent() {
    const readFeed = async () => {
        const rawContents = getAllFeedContent();
        if (!rawContents.length) return [];
        return await getPersonalizedFeed(rawContents);
    };

    while (window.__immersiveOpen) {
        const currentContents = await readFeed();
        if (currentContents.length > 0) return currentContents;

        if (typeof loadAllData === "function") {
            try {
                if (!window.__immersiveContentRefreshPromise) {
                    window.__immersiveContentRefreshPromise = loadAllData()
                        .catch((error) => {
                            console.warn(
                                "Chargement feed immersif en attente:",
                                error,
                            );
                        })
                        .finally(() => {
                            window.__immersiveContentRefreshPromise = null;
                        });
                }
                await window.__immersiveContentRefreshPromise;
            } catch (error) {
                // Le skeleton reste visible; on retentera au prochain cycle.
            }
        }

        if (!window.__immersiveOpen) break;

        const refreshedContents = await readFeed();
        if (refreshedContents.length > 0) return refreshedContents;

        await waitForImmersiveRetry(IMMERSIVE_CONTENT_RETRY_DELAY);
    }

    return [];
}

function applyImmersiveMetadataPreference(root = document) {
    const visible = getImmersiveMetadataPreference();
    root.querySelectorAll?.(".immersive-post").forEach((post) => {
        post.classList.toggle("is-ui-visible", visible);
    });
}

function setImmersivePostUi(post, visible, options = {}) {
    const overlay = document.getElementById("immersive-overlay");
    if (!overlay || !post) return;
    const shouldSyncAll = options.syncAll !== false;

    window.__immersiveMetadataVisible = !!visible;

    if (shouldSyncAll) {
        applyImmersiveMetadataPreference(overlay);
        return;
    }

    post.classList.toggle("is-ui-visible", getImmersiveMetadataPreference());
}

function setupImmersiveFullscreenToggle(root = document) {
    const overlay = document.getElementById("immersive-overlay");
    const container =
        root?.querySelector?.("#immersive-content-container") ||
        document.getElementById("immersive-content-container");
    if (!overlay || !container) return;

    container
        .querySelectorAll(".immersive-post .post-content-wrap")
        .forEach((wrap) => {
            if (wrap.dataset.immersiveFullscreenToggleBound === "1") return;
            wrap.dataset.immersiveFullscreenToggleBound = "1";

            wrap.addEventListener("click", (event) => {
                if (
                    event.target.closest(
                        "button, a, input, textarea, select, [contenteditable='true'], .post-info, .xera-carousel-arrow, .xera-carousel-dots, .support-overlay, .arc-collab-avatars",
                    )
                ) {
                    return;
                }

                const post = wrap.closest(".immersive-post");
                if (!post) return;
                const shouldShow = !getImmersiveMetadataPreference();
                setImmersivePostUi(post, shouldShow);
            });
        });
}

// Précharge localement une vidéo immersive quand son conteneur approche de l'écran.
// La logique de lecture et de son doit rester centralisée dans setupImmersiveObserver.
function setupVideoAutoplay(video, container) {
    if (!video || !container) return;

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    ensureImmersiveVideoLoaded(video, false);
                    observer.unobserve(container);
                }
            });
        },
        {
            threshold: 0.2,
            rootMargin: "120px 0px",
        },
    );

    observer.observe(container);
}

// Lazy-load + préchargement progressif des vidéos immersives
function setupImmersiveLazyLoad() {
    const videos = document.querySelectorAll("video.immersive-video");
    if (!videos.length || typeof IntersectionObserver === "undefined") return;

    // Mettre à jour les index pour tous les videos
    videos.forEach((video, idx) => {
        video.dataset.index = idx;
        if (idx === 0) ensureImmersiveVideoLoaded(video, false);
    });

    // Déconnecter l'ancien observer si présent
    if (window.__immersiveLazyObserver) {
        try {
            window.__immersiveLazyObserver.disconnect();
        } catch (e) {}
        window.__immersiveLazyObserver = null;
    }

    window.__immersiveLazyObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                const video = entry.target;
                if (entry.isIntersecting) {
                    ensureImmersiveVideoLoaded(video, false);

                    // Précharger la vidéo suivante pour la fluidité
                    const nextIdx = Number(video.dataset.index || 0) + 1;
                    const next = document.querySelector(
                        `video.immersive-video[data-index="${nextIdx}"]`,
                    );
                    if (next) ensureImmersiveVideoLoaded(next, false);

                    window.__immersiveLazyObserver.unobserve(video);
                }
            });
        },
        {
            root: null,
            rootMargin: "280px 0px",
            threshold: 0.2,
        },
    );

    videos.forEach((video) => {
        try {
            window.__immersiveLazyObserver.observe(video);
        } catch (e) {}
    });
}

// Activation globale du son pour toutes les vidéos
function initGlobalSoundActivation() {
    let soundActivated = false;

    const activateAllSounds = () => {
        if (soundActivated) return;
        soundActivated = true;
        window.__immersiveSoundUnlocked = true;

        // Activer le son uniquement pour la vidéo immersive la plus visible
        const active = getActiveImmersiveVideo();
        if (active) {
            ensureImmersiveVideoLoaded(active, true);
            muteOtherImmersiveVideos(active);
            active.muted = false;
            active.play().catch(() => {});
        }

        console.log("Son activé (une seule vidéo immersive à la fois)");

        // Retirer tous les écouteurs
        document.removeEventListener("click", activateAllSounds, true);
        document.removeEventListener("keydown", activateAllSounds, true);
        document.removeEventListener("touchstart", activateAllSounds, true);
        document.removeEventListener("scroll", activateAllSounds, true);
        document.removeEventListener("mousemove", activateAllSounds, true);
    };

    // Écouter TOUTES les interactions possibles
    document.addEventListener("click", activateAllSounds, {
        once: true,
        capture: true,
    });
    document.addEventListener("keydown", activateAllSounds, {
        once: true,
        capture: true,
    });
    document.addEventListener("touchstart", activateAllSounds, {
        once: true,
        capture: true,
    });
    document.addEventListener("scroll", activateAllSounds, {
        once: true,
        capture: true,
    });
    document.addEventListener("mousemove", activateAllSounds, {
        once: true,
        capture: true,
    });

    // Ne pas forcer l'activation sans interaction utilisateur
}

function setupImmersiveSnapNav() {
    const overlay = document.getElementById("immersive-overlay");
    if (!overlay) return;

    // Rebind safely when the immersive overlay is rebuilt
    if (typeof overlay.__snapCleanup === "function") {
        overlay.__snapCleanup();
        overlay.__snapCleanup = null;
    }

    overlay.dataset.snapNavBound = "true";

    const SWIPE_THRESHOLD_PX = 52;
    const AXIS_LOCK_THRESHOLD_PX = 10;
    const NAV_COOLDOWN_MS = 420;
    const WHEEL_THRESHOLD = 10;

    let startX = 0;
    let startY = 0;
    let isTouching = false;
    let ignoreCurrentGesture = false;
    let lockUntilTs = 0;
    let lockTimer = null;

    const isOverlayOpen = () => overlay.style.display === "block";

    const isInteractiveTarget = (target) =>
        !!target?.closest(
            "input, textarea, select, button, a, [contenteditable='true'], .xera-carousel, .xera-carousel-track, .xera-carousel-arrow",
        );

    const getPosts = () =>
        Array.from(overlay.querySelectorAll(".immersive-post")).filter(
            (el) => el.offsetParent !== null,
        );

    const getActiveIndex = (posts) => {
        if (!posts.length) return 0;
        let closestIndex = 0;
        let minDistance = Infinity;
        const viewportMid = window.innerHeight * 0.4;
        posts.forEach((post, index) => {
            const rect = post.getBoundingClientRect();
            const distance = Math.abs(rect.top - viewportMid);
            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = index;
            }
        });
        return closestIndex;
    };

    const clearNavLockTimer = () => {
        if (!lockTimer) return;
        clearTimeout(lockTimer);
        lockTimer = null;
    };

    const engageNavLock = () => {
        lockUntilTs = Date.now() + NAV_COOLDOWN_MS;
        clearNavLockTimer();
        lockTimer = setTimeout(() => {
            lockUntilTs = 0;
            lockTimer = null;
        }, NAV_COOLDOWN_MS);
    };

    const isNavLocked = () => Date.now() < lockUntilTs;

    const scrollToIndex = (posts, index) => {
        if (!posts[index]) return;
        engageNavLock();
        posts[index].scrollIntoView({
            behavior: "smooth",
            block: "start",
            inline: "nearest",
        });
    };

    const navigateStep = (direction) => {
        if (!isOverlayOpen()) return;
        if (isNavLocked()) return;
        const posts = getPosts();
        if (posts.length === 0) return;
        const currentIndex = getActiveIndex(posts);
        const nextIndex = Math.max(
            0,
            Math.min(posts.length - 1, currentIndex + direction),
        );
        if (nextIndex === currentIndex) return;
        scrollToIndex(posts, nextIndex);
    };

    const onTouchStart = (e) => {
        if (!isOverlayOpen()) return;
        if (!e.touches || e.touches.length !== 1) {
            isTouching = false;
            return;
        }

        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        isTouching = true;
        ignoreCurrentGesture = isInteractiveTarget(e.target);
    };

    const onTouchMove = (e) => {
        if (!isTouching || ignoreCurrentGesture) return;
        if (!e.touches || e.touches.length !== 1) return;

        const touch = e.touches[0];
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        // Bloquer le scroll natif vertical pour imposer 1 swipe = 1 post.
        if (absY > AXIS_LOCK_THRESHOLD_PX && absY > absX) {
            e.preventDefault();
        }
    };

    const onTouchEnd = (e) => {
        if (!isTouching) return;
        isTouching = false;
        if (ignoreCurrentGesture) {
            ignoreCurrentGesture = false;
            return;
        }

        const touch =
            (e.changedTouches && e.changedTouches[0]) ||
            (e.touches && e.touches[0]) ||
            null;
        if (!touch) return;

        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (absY < SWIPE_THRESHOLD_PX || absY <= absX) return;

        e.preventDefault();
        const direction = deltaY < 0 ? 1 : -1;
        navigateStep(direction);
    };

    const onTouchCancel = () => {
        isTouching = false;
        ignoreCurrentGesture = false;
    };

    const onWheel = (e) => {
        if (!isOverlayOpen()) return;
        if (isInteractiveTarget(e.target)) return;
        if (Math.abs(e.deltaY) < WHEEL_THRESHOLD) return;

        e.preventDefault();
        const direction = e.deltaY > 0 ? 1 : -1;
        navigateStep(direction);
    };

    overlay.addEventListener("touchstart", onTouchStart, {
        passive: true,
    });
    overlay.addEventListener("touchmove", onTouchMove, {
        passive: false,
    });
    overlay.addEventListener("touchend", onTouchEnd, {
        passive: false,
    });
    overlay.addEventListener("touchcancel", onTouchCancel, {
        passive: true,
    });
    overlay.addEventListener("wheel", onWheel, { passive: false });

    overlay.__snapCleanup = () => {
        overlay.removeEventListener("touchstart", onTouchStart);
        overlay.removeEventListener("touchmove", onTouchMove);
        overlay.removeEventListener("touchend", onTouchEnd);
        overlay.removeEventListener("touchcancel", onTouchCancel);
        overlay.removeEventListener("wheel", onWheel);
        clearNavLockTimer();
        lockUntilTs = 0;
        isTouching = false;
        ignoreCurrentGesture = false;
    };
}

function setupImmersiveKeyboardNav() {
    const overlay = document.getElementById("immersive-overlay");
    if (!overlay) return;
    if (window.__immersiveKeyboardNavBound) return;
    window.__immersiveKeyboardNavBound = true;

    const handler = (e) => {
        if (overlay.style.display !== "block") return;
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const posts = Array.from(document.querySelectorAll(".immersive-post"));
        if (posts.length === 0) return;
        const currentIndex = (() => {
            let closestIndex = 0;
            let minDistance = Infinity;
            posts.forEach((post, index) => {
                const rect = post.getBoundingClientRect();
                const distance = Math.abs(rect.top);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestIndex = index;
                }
            });
            return closestIndex;
        })();
        const nextIndex =
            e.key === "ArrowDown" ? currentIndex + 1 : currentIndex - 1;
        const clamped = Math.max(0, Math.min(posts.length - 1, nextIndex));
        posts[clamped].scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
        e.preventDefault();
    };

    document.addEventListener("keydown", handler);
}

function setupImmersiveArrowNav() {
    const overlay = document.getElementById("immersive-overlay");
    const arrows = document.getElementById("immersive-nav-arrows");
    const btnUp = document.getElementById("immersive-arrow-up");
    const btnDown = document.getElementById("immersive-arrow-down");

    if (!overlay || !arrows || !btnUp || !btnDown) return;

    // Rebind safely when the immersive overlay is rebuilt
    if (typeof overlay.__arrowCleanup === "function") {
        overlay.__arrowCleanup();
        overlay.__arrowCleanup = null;
    }

    const getPosts = () =>
        Array.from(document.querySelectorAll(".immersive-post")).filter(
            (el) => el.offsetParent !== null,
        ); // skip hidden

    const getActiveIndex = (posts) => {
        let closestIndex = 0;
        let minDistance = Infinity;
        posts.forEach((post, index) => {
            const rect = post.getBoundingClientRect();
            const distance = Math.abs(rect.top);
            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = index;
            }
        });
        return closestIndex;
    };

    const scrollToIndex = (posts, index) => {
        if (!posts[index]) return;
        posts[index].scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    };

    const updateDisabled = () => {
        const posts = getPosts();
        if (posts.length === 0) {
            btnUp.disabled = true;
            btnDown.disabled = true;
            return;
        }
        const idx = getActiveIndex(posts);
        btnUp.disabled = idx <= 0;
        btnDown.disabled = idx >= posts.length - 1;
    };

    btnUp.addEventListener("click", (e) => {
        e.stopPropagation();
        const posts = getPosts();
        const idx = getActiveIndex(posts);
        scrollToIndex(posts, Math.max(0, idx - 1));
        setTimeout(updateDisabled, 350);
    });

    btnDown.addEventListener("click", (e) => {
        e.stopPropagation();
        const posts = getPosts();
        const idx = getActiveIndex(posts);
        scrollToIndex(posts, Math.min(posts.length - 1, idx + 1));
        setTimeout(updateDisabled, 350);
    });

    let ticking = false;
    const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            updateDisabled();
            ticking = false;
        });
    };

    overlay.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateDisabled);

    updateDisabled();

    overlay.__arrowCleanup = () => {
        overlay.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", updateDisabled);
    };
}

/* ========================================
   RENDERING - PROFILE TIMELINE
   ======================================== */

function formatUsdAmount(value) {
    const parsed = Number.parseFloat(value);
    const amount = Number.isFinite(parsed) ? parsed : 0;
    if (typeof formatCurrency === "function") {
        return formatCurrency(amount, "USD");
    }
    return new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "USD",
    }).format(amount);
}

async function renderProfileTimeline(userId) {
    console.log("renderProfileTimeline appelé pour userId:", userId);
    console.log("allUsers contient:", allUsers.length, "utilisateurs");

    let user = getUser(userId);
    if (!user) {
        // Tentative de récupération ponctuelle du profil
        try {
            const res = await getUserProfile(userId);
            if (res.success && res.data) {
                allUsers.push(res.data);
                user = res.data;
            }
        } catch (e) {
            console.error("Fetch profil échec:", e);
        }
    }
    if (!user && window.currentUser && window.currentUser.id === userId) {
        user = window.currentUser;
    }
    if (!user) {
        console.error("Utilisateur non trouvé dans allUsers:", userId);
        console.log(
            "Liste des IDs dans allUsers:",
            allUsers.map((u) => u.id),
        );
        return "<p>Utilisateur introuvable</p>";
    }

    console.log("Utilisateur trouvé:", user.name);
    const currentUserId = window.currentUserId;
    const isOwnProfile = userId === currentUserId;
    const isAdminViewer = isSuperAdmin();
    const adminReasonInputId = `profile-admin-reason-${userId}`;
    const profilePreferences = getUserProfilePreferences(user);
    const canAccessProfile = await canViewerAccessProfile(user, currentUserId);

    if (!canAccessProfile) {
        return renderProfilePrivacyNotice(user, profilePreferences);
    }

    const profilePrivacy = profilePreferences.privacy;
    const showPublicStats = isOwnProfile || profilePrivacy.showStats !== false;
    const showPublicSocials =
        isOwnProfile || profilePrivacy.showSocials !== false;
    const showPublicActivity =
        isOwnProfile || profilePrivacy.showActivity !== false;

    // Récupérer les contenus
    const contents = getUserContentLocal(userId);
    const userBadgesHtml = renderUserBadges(userId);
    const projectsPromise = ensureUserProjectsLoaded(userId);

    // Récupérer les certifications pro
    let certifications = [];
    try {
        if (window.professionalManager) {
            certifications = await window.professionalManager
                .getUserCertifications(userId)
                .catch(() => []);
        }
    } catch (e) {
        console.warn("Erreur chargement certifications:", e);
    }

    // Récupérer les ARCs
    let userArcs = [];
    try {
        const { data } = await supabase
            .from("arcs")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
        userArcs = data || [];
    } catch (e) {
        console.error("Erreur chargement ARCs:", e);
    }

    let collaboratorArcs = [];
    try {
        collaboratorArcs = await fetchCollaboratorArcs(userId);
    } catch (e) {
        console.error("Erreur chargement ARCs collaboratifs:", e);
    }

    const arcMap = new Map();
    userArcs.forEach((arc) => {
        arcMap.set(arc.id, { ...arc, _collabRole: "owner" });
    });
    (collaboratorArcs || []).forEach((arc) => {
        if (!arcMap.has(arc.id)) {
            arcMap.set(arc.id, { ...arc, _collabRole: "collaborator" });
        }
    });
    const allArcs = Array.from(arcMap.values());

    // Filtrer les contenus si un ARC est sélectionné
    let displayContents = contents;
    let selectedArc = null;

    if (window.selectedArcId) {
        selectedArc =
            allArcs.find((a) => a.id === window.selectedArcId) ||
            userArcs.find((a) => a.id === window.selectedArcId);
        try {
            const { data: arcContentsData, error: arcContentsError } =
                await supabase
                    .from("content")
                    .select(
                        `
                    *,
                    arcs (
                        id,
                        title,
                        status,
                        user_id
                    ),
                    projects (
                        id,
                        name
                    )
                `,
                    )
                    .eq("arc_id", window.selectedArcId)
                    .eq("author_type", "USER")
                    .eq("author_id", userId)
                    .is("page_id", null)
                    .order("created_at", { ascending: false });
            if (arcContentsError) throw arcContentsError;
            if (arcContentsData) {
                const converted = arcContentsData.map(convertSupabaseContent);
                displayContents = isSuperAdmin()
                    ? converted
                    : converted.filter((c) => !c.isDeleted);
            } else {
                displayContents = contents.filter(
                    (c) => c.arcId === window.selectedArcId,
                );
            }
        } catch (error) {
            console.error("Erreur chargement contenus ARC:", error);
            displayContents = contents.filter(
                (c) => c.arcId === window.selectedArcId,
            );
        }
    }

    // If project relation is missing (common on collaboration histories), hydrate by project_id.
    if (displayContents.length > 0) {
        const missingProjectIds = new Set();
        displayContents.forEach((content) => {
            if (content?.projectId && !content.project) {
                missingProjectIds.add(content.projectId);
            }
        });
        if (missingProjectIds.size > 0) {
            try {
                const { data: projectsData, error: projectsError } =
                    await supabase
                        .from("projects")
                        .select("id, name")
                        .in("id", Array.from(missingProjectIds));
                if (!projectsError && Array.isArray(projectsData)) {
                    const projectMap = new Map(
                        projectsData.map((p) => [p.id, p]),
                    );
                    displayContents = displayContents.map((content) => {
                        if (
                            content?.projectId &&
                            !content.project &&
                            projectMap.has(content.projectId)
                        ) {
                            return {
                                ...content,
                                project: projectMap.get(content.projectId),
                            };
                        }
                        return content;
                    });
                }
            } catch (e) {
                /* ignore */
            }
        }
    }

    const viewerCollabStatusMap = await fetchArcCollabStatusMap(
        allArcs.map((a) => a.id),
        currentUserId,
    );
    const pendingRequests = isOwnProfile
        ? await fetchPendingArcCollabRequests(userId)
        : [];

    let encouragedContentIds = new Set();
    if (currentUserId && displayContents.length > 0) {
        try {
            const contentIds = displayContents
                .map((content) => content.contentId)
                .filter(Boolean)
                .slice(0, 500);
            if (contentIds.length > 0) {
                const { data } = await supabase
                    .from("content_encouragements")
                    .select("content_id")
                    .eq("user_id", currentUserId)
                    .in("content_id", contentIds);
                if (Array.isArray(data)) {
                    data.forEach((row) => {
                        if (row?.content_id) {
                            encouragedContentIds.add(row.content_id);
                        }
                    });
                }
            }
        } catch (error) {
            console.error("Erreur chargement encouragements profil:", error);
        }
    }

    const trajectoryGuardHtml = await renderTrajectoryGuard(userId);

    // Générer HTML des ARCs
    let arcsHtml = "";
    if (allArcs.length > 0) {
        const arcItems = allArcs
            .map((arc) => {
                const isActive = window.selectedArcId === arc.id;
                const progress = 0; // Calculer progression si possible
                const viewerStatus = viewerCollabStatusMap.get(arc.id);
                const canCollaborate =
                    currentUserId && currentUserId !== arc.user_id;
                const collabBadgeHtml =
                    arc._collabRole === "collaborator"
                        ? `<div style="margin-top:0.35rem; font-size:0.7rem; color: var(--text-secondary);">Collaboration</div>`
                        : "";
                const ownerLabelHtml =
                    arc._collabRole === "collaborator" && arc.users?.name
                        ? `<div style="margin-top:0.25rem; font-size:0.7rem; color: var(--text-secondary);">Par ${renderUsernameWithBadge(arc.users.name, arc.users.id || arc.user_id)}</div>`
                        : "";
                let collabActionHtml = "";
                if (canCollaborate) {
                    if (viewerStatus === "pending") {
                        collabActionHtml = `<div style="margin-top:0.5rem; font-size:0.7rem; color: var(--text-secondary);">Demande envoyée</div>`;
                    } else if (viewerStatus === "accepted") {
                        collabActionHtml = `
                        <div style="margin-top:0.5rem;">
                            <button onclick="event.stopPropagation(); leaveArcCollaboration('${arc.id}')" style="background: transparent; border: 1px solid #ef4444; color: #ef4444; padding: 0.25rem 0.6rem; border-radius: 999px; font-size: 0.7rem; cursor: pointer;">
                                Quitter
                            </button>
                        </div>
                    `;
                    } else {
                        collabActionHtml = `
                        <div style="margin-top:0.5rem;">
                            <button class="btn-collaborate" onclick="event.stopPropagation(); requestArcCollaboration('${arc.id}', '${arc.user_id}')" style="background: rgba(255,255,255,0.06); color: var(--text-primary); padding: 0.25rem 0.6rem; border-radius: 999px; font-size: 0.7rem; cursor: pointer;">
                                Collaborer
                            </button>
                        </div>
                    `;
                    }
                }
                return `
                <div class="arc-card ${isActive ? "active" : ""}" onclick="selectArc('${arc.id}', '${userId}')" style="min-width: 200px; padding: 1rem; border: 1px solid var(--border-color); border-radius: 12px; cursor: pointer; background: ${isActive ? "rgba(255,255,255,0.05)" : "transparent"}; transition: all 0.2s;">
                    <div style="font-weight: 600; margin-bottom: 0.5rem; color: ${isActive ? "var(--accent-color)" : "inherit"}; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis; word-break:break-word; overflow-wrap:anywhere;">${arc.title}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">${arc.status === "completed" ? "Terminé" : "En cours"}</div>
                    ${collabBadgeHtml}
                    ${ownerLabelHtml}
                    ${isActive ? '<div style="margin-top:0.5rem; font-size:0.75rem; color:var(--accent-color);">Voir les mises à jour</div>' : ""}
                    ${collabActionHtml}
                </div>
            `;
            })
            .join("");

        arcsHtml = `
            <div class="arcs-section" style="margin: 2rem 0;">
                <h3 style="margin-bottom: 1rem; display:flex; align-items:center; justify-content:space-between;">
                    Projets
                    ${window.selectedArcId ? `<button onclick="selectArc(null, '${userId}')" style="background:none; border:none; color:var(--text-secondary); font-size:0.8rem; cursor:pointer;">Voir tout</button>` : ""}
                </h3>
                <div class="arcs-scroller" style="display: flex; gap: 1rem; overflow-x: auto; padding-bottom: 1rem;">
                    ${arcItems}
                </div>
            </div>
`;
    }

    const collabRequestsHtml =
        pendingRequests.length > 0
            ? `
<div class="collab-requests" style="margin: 1.5rem 0; padding: 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 12px;">
            <h3 style="margin-bottom: 1rem;">Demandes de collaboration</h3>
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                ${pendingRequests
                    .map((req) => {
                        const collaborator = req.collaborator;
                        const arc = req.arc;
                        const avatar =
                            collaborator?.avatar || "https://placehold.co/36";
                        const name = escapeHtml(
                            collaborator?.name || "Utilisateur",
                        );
                        const arcTitle = escapeHtml(arc?.title || "ARC");
                        return `
                        <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 10px;">
                            <img src="${avatar}" alt="Avatar ${name}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Souhaite collaborer sur ${arcTitle}</div>
                            </div>
                            <div style="display:flex; gap:0.4rem;">
                                <button onclick="acceptArcCollaboration('${req.id}', '${req.arcId}', '${req.collaboratorId}')" style="background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.4); color: #10b981; padding: 0.35rem 0.6rem; border-radius: 8px; font-size: 0.75rem; cursor: pointer;">
                                    Accepter
                                </button>
                                <button onclick="declineArcCollaboration('${req.id}', '${req.arcId}')" style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.4); color: #ef4444; padding: 0.35rem 0.6rem; border-radius: 8px; font-size: 0.75rem; cursor: pointer;">
                                    Refuser
                                </button>
                            </div>
                        </div>
                    `;
                    })
                    .join("")}
            </div>
</div>
    `
            : "";

    const isFollowingThisUser =
        currentUserId && !isOwnProfile
            ? await isFollowing(currentUserId, userId)
            : false;

    // ... Boutons existants ...
    const canAccessMonetizationDashboard =
        isOwnProfile && hasMonetizationDashboardAccess(user);
    const settingsButtonHtml = isOwnProfile
        ? `
<button class="badge settings-badge" onclick="window.launchLive('${userId}')" title="Lancer un live">
            <div class="badge-icon"><img src="icons/live.svg" alt="Live" style="width:100%;height:100%;"></div>
            <span>Live</span>
</button>
${
    canAccessMonetizationDashboard
        ? `
<button class="badge settings-badge" onclick="window.location.href='creator-dashboard.html'" title="Monétisation">
            <div class="badge-icon"><i class="fas fa-wallet" aria-hidden="true"></i></div>
            <span>Monétisation</span>
</button>
`
        : ""
}
${
    !window.userHasProPage
        ? `
<button class="badge settings-badge" onclick="window.navigateToProfessionalPage?.()" title="Page Pro">
            <div class="badge-icon"><img src="icons/enterprise.svg" alt="Page Pro" style="width:100%;height:100%;"></div>
            <span>Page Pro</span>
</button>
`
        : ""
}
<button class="badge settings-badge" onclick="window.location.href='analytics.html'" title="Analytics">
            <div class="badge-icon"><img src="icons/analytics.svg" alt="Analytics" style="width:100%;height:100%;"></div>
            <span>Analytics</span>
</button>
${
    isSuperAdmin()
        ? `
<button class="badge settings-badge" onclick="window.location.href='admin.html'" title="Administration">
            <div class="badge-icon"><img src="icons/team.svg" alt="Administration" style="width:100%;height:100%;"></div>
            <span>Admin</span>
</button>
`
        : ""
}
<button class="badge settings-badge" onclick="openSettings('${userId}')" title="Réglages">
            <div class="badge-icon"><img src="icons/reglages.svg" alt="Réglages" style="width:100%;height:100%;"></div>
            <span>Réglages</span>
</button>
    `
        : "";

    const shareButtonHtml = `  <button class="btn-action-small" onclick="shareProfileLink('${userId}')" title="Partager le profil" aria-label="Partager le profil">
            <img src="icons/share.svg" alt="Partager" style="width: 20px; height: 20px;">
</button>
    `;

    let followButtonHtml = "";
    if (!isOwnProfile && currentUserId) {
        const isCommunity =
            user.account_subtype === "community" ||
            user.accountSubtype === "community";
        if (isCommunity) {
            followButtonHtml = `
                <button 
                    class="btn btn-community-join"
                    onclick="toggleFollow('${currentUserId}', '${userId}')"
                    id="follow-btn-${userId}"
                    style="padding: 0.5rem 1.2rem; border-radius: 99px; font-weight: 600; font-size: 0.9rem; color: ${isFollowingThisUser ? "var(--text-primary)" : "var(--bg-color)"}; background: ${isFollowingThisUser ? "rgba(255,255,255,0.1)" : "var(--text-primary)"}; border: 1px solid ${isFollowingThisUser ? "var(--border-color)" : "transparent"};"
                >
                    ${isFollowingThisUser ? "Membre" : "Rejoindre"}
                </button>
            `;
        } else {
            followButtonHtml = `
                <button 
                    class="btn btn-follow ${isFollowingThisUser ? "unfollow" : ""}"
                    onclick="toggleFollow('${currentUserId}', '${userId}')"
                    id="follow-btn-${userId}"
                    style="background: transparent; border: none; padding: 0;"
                >
                    <img src="${isFollowingThisUser ? "icons/subscribed.svg" : "icons/subscribe.svg"}" class="btn-icon" style="width: 24px; height: 24px;">
                </button>
            `;
        }
    }

    const canMessageThisUser =
        !isOwnProfile &&
        currentUserId &&
        (profilePrivacy.allowMessages === "everyone" ||
            (profilePrivacy.allowMessages === "followers" &&
                isFollowingThisUser));

    const messageButtonHtml = canMessageThisUser
        ? `
                <button
                    class="btn-secondary profile-message-btn"
                    onclick="window.openMessagesWithUser && window.openMessagesWithUser('${userId}')"
                    title="Envoyer un message"
                    style="padding: 0.5rem 1rem; border-radius: 12px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.45rem;"
                >
                    <img src="icons/message.svg" alt="Message" style="width:16px;height:16px;">
                    Message
                </button>
            `
        : "";

    const followerCount = await getFollowerCount(userId).catch(() => 0);
    const followingCount = await getFollowingCount(userId).catch(() => 0);
    const engagementTotals = await getUserEngagementTotals(userId).catch(
        () => ({ totalViews: 0 }),
    );
    const userTraces = getUserContentLocal(userId) || [];
    const successCount = userTraces.filter(
        (t) => t?.state === "success",
    ).length;
    const failureCount = userTraces.filter(
        (t) => t?.state === "failure",
    ).length;
    const successRatio =
        userTraces.length > 0
            ? Math.round((successCount / userTraces.length) * 100)
            : 0;
    const latestTrace = userTraces.length > 0 ? userTraces[0] : null;
    const latestTraceLabel = latestTrace
        ? `Jour ${latestTrace.dayNumber || latestTrace.day_number || "-"}`
        : "Aucune";
    const progressSnapshotHtml = `
<div class="profile-progress-snapshot">
            <div class="snapshot-item">
                <div class="snapshot-label">Dernière mise à jour</div>
                <div class="snapshot-value">${latestTraceLabel}</div>
            </div>
            <div class="snapshot-item">
                <div class="snapshot-label">Taux réussite</div>
                <div class="snapshot-value">${successRatio}%</div>
            </div>
            <div class="snapshot-item">
                <div class="snapshot-label">Blocages</div>
                <div class="snapshot-value">${failureCount}</div>
            </div>
</div>
    `;
    const showVerificationCta = isOwnProfile && !isCurrentUserVerified();
    const verificationCtaHtml = showVerificationCta
        ? `
<div class="profile-verify-block">
            <button class="profile-verify-cta" onclick="window.location.href='subscription-plans.html'" aria-label="Demander une vérification XERA">
                <span>Obtenir une vérification</span>
                <img src="icons/verify-personal.svg?v=${BADGE_ASSET_VERSION}" alt="" aria-hidden="true" />
            </button>
</div>
`
        : "";
    const accountTypeValue = String(
        user.account_type || user.user_metadata?.account_type || "",
    ).toLowerCase();
    const accountSubtypeValue = String(
        user.account_subtype ||
            user.accountSubtype ||
            user.user_metadata?.account_subtype ||
            "",
    ).toLowerCase();
    const isCommunityAccount = isProAccountType(
        accountTypeValue,
        accountSubtypeValue,
    );

    // --- RECOUVREMENT PAGE PRO (COMPTE ENTREPRISE/COMMUNAUTÉ) ---
    // Les comptes organisationnels utilisent directement la page professionnelle, sans abonnement.
    if (
        isCommunityAccount &&
        window.professionalManager &&
        typeof window.professionalManager.renderProPage === "function"
    ) {
        // On vérifie si l'utilisateur a un slug de page pro
        const { data: proPage } = await supabase
            .from("professional_pages")
            .select("slug")
            .eq("owner_id", userId)
            .maybeSingle();

        if (proPage && proPage.slug) {
            const proContainer = document.querySelector(".pro-page-container");
            if (proContainer) {
                await window.professionalManager.renderProPage(proPage.slug);
                return ""; // On retourne vide car professionalManager injecte directement dans le DOM
            }
        }

        if (isOwnProfile) {
            // Un compte pro sans page doit être intercepté vers la création de page pro.
            try {
                window.professionalManager.startCreatePage();
                return "";
            } catch (error) {
                console.warn("Impossible de démarrer l'onboarding pro:", error);
            }
        }

        return renderProPageUnavailable(user);
    }

    const profileSignalStatsHtml = `
<div class="profile-signal-metrics">
            <div class="follower-stat">
                <div class="follower-stat-count" title="${Number(followerCount || 0).toLocaleString("fr-FR")}">${formatCompactCount(followerCount)}</div>
                <div class="follower-stat-label">Abonnés</div>
            </div>
            <div class="follower-stat">
                <div class="follower-stat-count" title="${Number(followingCount || 0).toLocaleString("fr-FR")}">${formatCompactCount(followingCount)}</div>
                <div class="follower-stat-label">Abonnements</div>
            </div>
            <div class="follower-stat">
                <div class="follower-stat-count" title="${Number(engagementTotals.totalViews || 0).toLocaleString("fr-FR")}">${formatCompactCount(engagementTotals.totalViews)}</div>
                <div class="follower-stat-label">Vues totales</div>
            </div>
            <div class="follower-stat">
                <div class="follower-stat-count" title="${Number(userTraces.length || 0).toLocaleString("fr-FR")}">${formatCompactCount(userTraces.length)}</div>
                <div class="follower-stat-label">Updates</div>
            </div>
</div>
    `;
    const publicSignalHtml = showPublicStats
        ? `${profileSignalStatsHtml}${progressSnapshotHtml}`
        : renderProfileHiddenSection("stats");

    const workspaceContentsById = new Map();
    const addWorkspaceContents = (items, source) => {
        (items || []).forEach((content, index) => {
            if (!content) return;
            const contentId =
                content.contentId || content.content_id || content.id;
            const key = contentId
                ? String(contentId)
                : String(source) + ":" + String(index);
            workspaceContentsById.set(key, content);
        });
    };
    addWorkspaceContents(contents, "cache");
    addWorkspaceContents(displayContents, "rendered");
    window.profileWorkspaceContext = {
        profileUserId: userId,
        contents: showPublicActivity
            ? Array.from(workspaceContentsById.values())
            : [],
        arcs: allArcs,
    };

    const timelinesHtml =
        window.selectedArcId && selectedArc
            ? renderProfileSelectedArcContent(selectedArc, displayContents, {
                  profileUserId: userId,
                  currentUserId,
                  isAdminViewer,
                  encouragedContentIds,
              })
            : renderProfileOverviewContent(displayContents, {
                  profileUserId: userId,
                  currentUserId,
                  isAdminViewer,
                  encouragedContentIds,
                  allArcs,
              });

    const imageVersion = encodeURIComponent(
        user.updated_at || user.updatedAt || Date.now(),
    );
    const withCacheBust = (url) => {
        if (!url) return url;
        if (typeof url !== "string") return url;
        if (url.startsWith("data:")) return url;
        const joiner = url.includes("?") ? "&" : "?";
        return `${url}${joiner}v=${imageVersion}`;
    };

    const safeBanner =
        user.banner &&
        (user.banner.startsWith("http") || user.banner.startsWith("data:"))
            ? user.banner
            : null;
    const bannerHtml = safeBanner
        ? `<img src="${withCacheBust(safeBanner)}" class="profile-banner" alt="Bannière de ${user.name}" onerror="this.style.display='none'">`
        : "";

    const projects = await projectsPromise;
    const projectsHtml = projects.length
        ? `
<div class="projects-grid">
            ${projects
                .map((p) => {
                    const projectState = getContentC2PAState({
                        metadata: p?.metadata || {},
                    });
                    const projectBadge = projectState.isAI
                        ? renderC2PABadgeHtml("profile", {
                              metadata: p?.metadata || {},
                          })
                        : "";
                    return `
                <div class="project-card" style="position: relative;">
                    <div style="position: relative; display: block;">
                        <img src="${p.cover || user.banner || user.avatar}" class="project-cover" alt="Cover">
                        ${projectBadge}
                    </div>
                    <div class="project-meta">
                        <h4>${p.name}</h4>
                        <p>${p.description || ""}</p>
                    </div>
                </div>
            `;
                })
                .join("")}
</div>
    `
        : "";

    // CTA classes for project creation buttons: add subtle animated purple glow
    const createCtaClass =
        isOwnProfile && projects.length < 2
            ? "create-project-cta create-highlight"
            : "create-project-cta";

    // Small onboarding banner for new users with zero projects
    const onboardingStyles = `
<style>
/* Subtle animated purple glow inspired by Google's micro-interactions */
.create-project-cta{position:relative}
.create-highlight{outline: none;}
.create-highlight::after{
  content:'';
  position:absolute;
  top:-6px; right:-6px; bottom:-6px; left:-6px;
  border-radius:12px;
  pointer-events:none;
  background: linear-gradient(90deg, rgba(148,0,211,0.0), rgba(148,0,211,0.08), rgba(148,0,211,0.0));
  box-shadow: 0 6px 30px rgba(124,58,237,0.12);
  animation: subtleSweep 2200ms ease-in-out infinite;
  opacity:0.95;
}
@keyframes subtleSweep{
  0%{transform:translateX(-12%); opacity:0}
  20%{opacity:0.28}
  50%{transform:translateX(12%); opacity:0.6}
  80%{opacity:0.28}
  100%{transform:translateX(36%); opacity:0}
}

/* Banner styling */
.project-onboarding-banner{display:flex;align-items:center;justify-content:space-between;gap:0.8rem;padding:0.9rem 1rem;border-radius:12px;background:linear-gradient(180deg, rgba(124,58,237,0.06), rgba(124,58,237,0.02));border:1px solid rgba(124,58,237,0.12);}
.project-onboarding-copy{max-width:68%;}
.project-onboarding-cta{display:inline-flex;align-items:center;gap:0.5rem;padding:0.55rem 0.9rem;border-radius:999px;background:linear-gradient(90deg,#7c3aed,#6d28d9);color:white;border:none}
</style>
`;

    const projectOnboardingBannerHtml =
        isOwnProfile && projects.length === 0
            ? `\n${onboardingStyles}<div class="project-onboarding-banner" role="region" aria-label="Créer votre premier projet">\n    <div class="project-onboarding-copy">\n        <strong>Commencez par créer votre premier projet</strong>\n        <div style="color:var(--text-secondary); margin-top:4px;">Transformez vos idées en objectifs publiables — créez un projet pour publier votre première mise à jour.</div>\n    </div>\n    <div style="display:flex;align-items:center;gap:0.6rem;">\n        <button class="project-onboarding-cta ${createCtaClass}" onclick="window.openCreateModal && window.openCreateModal()">\n            <svg width=16 height=16 viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" style=\"margin-right:6px;\"><path d=\"M12 5v14M5 12h14\" stroke=\"currentColor\"></path></svg>\n projet neuf\n        </button>\n    </div>\n</div>\n`
            : "";

    const banStateLabel = isUserBanned(user)
        ? `<span style="color:#ef4444; font-weight:600;">Banni (reste ${getBanRemainingLabel(user) || "en cours"})</span>`
        : `<span style="color: var(--text-secondary);">Statut : actif</span>`;

    const adminInlineHtml =
        isAdminViewer && !isOwnProfile
            ? `
<div class="admin-inline-box" style="margin: 1rem auto 0; max-width: 760px; border: 1px solid var(--border-color); border-radius: 12px; padding: 0.9rem 1rem; background: rgba(255,255,255,0.03);">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                <div style="display:flex; flex-direction:column; gap:0.25rem;">
                    <strong style="font-size:0.95rem;">Modération rapide (admin)</strong>
                    ${banStateLabel}
                </div>
                <div style="display:flex; gap:0.45rem; align-items:center; flex-wrap:wrap;">
                    <input type="number" id="profile-ban-duration-${userId}" class="form-input" value="24" min="1" style="width:90px;" aria-label="Durée">
                    <select id="profile-ban-unit-${userId}" class="form-input" style="width:110px;">
                        <option value="hours">heures</option>
                        <option value="days">jours</option>
                    </select>
                    <input type="text" id="${adminReasonInputId}" class="form-input" placeholder="Raison (optionnel)" style="min-width:160px;">
                    <button class="btn-verify" style="white-space:nowrap;" onclick="banUserFromProfile('${userId}')">Bannir</button>
                    <button class="btn-cancel" style="white-space:nowrap;" onclick="unbanUserFromProfile('${userId}')">Lever le ban</button>
                </div>
            </div>
            <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top:0.35rem;">Les actions s'appliquent immédiatement sur ce profil. La raison est enregistrée avec le ban ou la suppression douce.</p>
</div>
`
            : "";

    // --- UX INSTITUTION : BOUTON DE CERTIFICATION CONTEXTUEL ---
    let proCertificationCtaHtml = "";
    if (!isOwnProfile && window.userHasProPage && window.professionalManager) {
        proCertificationCtaHtml = `
            <div class="pro-certification-cta" style="margin: 1rem auto 0; max-width: 760px; border: 2px solid var(--primary-color); border-radius: 14px; padding: 1.2rem; background: rgba(var(--primary-rgb), 0.05); text-align: center;">
                <h4 style="margin: 0 0 0.5rem 0; color: var(--primary-color);"><i class="fas fa-certificate" style="margin-right: 8px;"></i> Action Institutionnelle</h4>
                <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 1rem;">Voulez-vous certifier <strong>${escapeHtml(user.name)}</strong> comme membre officiel de votre organisation ?</p>
                <button class="btn btn-primary" onclick="window.professionalManager.openTeamManagement(window.professionalManager.myPageSlug)" style="justify-content: center; margin: 0 auto;">
                    Certifier ce Talent
                </button>
            </div>
        `;
    }

    const hasArcs = Array.isArray(userArcs) && userArcs.length > 0;
    const profileRoleBadgeHtml = renderProfileRoleBadgeByUser(user);
    const monetizationBadgeHtml =
        typeof window.generatePlanBadgeHTML === "function"
            ? window.generatePlanBadgeHTML(user, "profile")
            : "";
    const supportButtonHtml =
        !isOwnProfile && typeof window.generateSupportButtonHTML === "function"
            ? window.generateSupportButtonHTML(user, "profile")
            : "";
    const supportProfileHtml =
        !isOwnProfile && supportButtonHtml
            ? `<div class="profile-support-cta">${supportButtonHtml}</div>`
            : "";

    const noArcNoticeHtml = !hasArcs
        ? isOwnProfile
            ? `
<div class="no-arc-notice own-nudge" style="margin: 2rem 0; padding: 2.5rem 1.5rem; border: 1px solid var(--border-color); border-radius: 16px; background: var(--bg-secondary); text-align: center;">
            <h4 style="margin: 0 0 0.75rem; color: var(--text-primary); font-family: 'Outfit', sans-serif; letter-spacing: -0.01em; font-size: 1.25rem;">Commencez votre trajectoire</h4>
            <p style="margin: 0 auto 1.5rem; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6; max-width: 400px;">Documentez vos efforts réels. Un projet (ARC) permet de regrouper vos preuves de travail et de construire votre réputation par l'exécution.</p>
            <button class="btn-primary" onclick="window.openCreateModal && window.openCreateModal()" style="padding: 0.8rem 2rem; border-radius: 8px; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em;">Lancer un ARC</button>
</div>
            `
            : `
<div class="no-arc-notice" style="margin: 1.5rem 0; padding: 1.5rem; border: 1px solid var(--border-color); border-radius: 12px; color: var(--text-muted); text-align: center; font-size: 0.9rem;">
            Aucun projet public pour le moment.
</div>
            `
        : "";

    const weeklyChartHtml = hasArcs
        ? `
<div class="weekly-progress-card" style="margin: 1.5rem 0; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 14px; padding: 1.25rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
                <div>
                    <h4 style="margin:0;">Progression hebdomadaire</h4>
                    <p style="margin:0; color: var(--text-secondary); font-size:0.9rem;">Survolez pour voir les mises à jour par jour.</p>
                </div>
                <button class="btn-secondary ${createCtaClass}" onclick="window.openCreateModal && window.openCreateModal()" style="padding:0.45rem 0.8rem; border-radius:10px;">nouveau projet</button>
            </div>
            <div style="margin-top:1rem; min-height:220px;">
                <canvas id="weekly-progress-chart-${userId}" aria-label="Progression hebdomadaire" role="img"></canvas>
            </div>
</div>
    `
        : "";

    const projectProgressBoardHtml = renderProfileProjectProgressBoard(
        allArcs,
        contents,
        userId,
    );
    const certificationsHtml = renderCertificationsHtml(certifications);
    const profileTitleHtml = escapeHtml(
        user.title || "Trajectoire en construction",
    );
    const profileBioHtml = escapeHtml(
        user.bio || "Progression, preuves et projets publics.",
    ).replace(/\n/g, "<br>");
    const externalConnectionsHtml = isOwnProfile
        ? `
<section class="external-connections-hero" style="margin: 1.25rem 0 1.5rem; background: linear-gradient(135deg, rgba(0,255,136,0.12), rgba(96,165,250,0.12)); border: 1px solid var(--border-color); border-radius: 20px; padding: 1.25rem 1.3rem; box-shadow: 0 18px 45px rgba(0,0,0,0.16);">
    <div style="display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap:1rem;">
        <div style="max-width: 620px;">
            <div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:0.5rem; color: var(--primary-color); font-weight:700; font-size:0.85rem; letter-spacing:0.14em; text-transform:uppercase;">
                <img src="icons/tech.svg" alt="" style="width:18px;height:18px;">
                Connectez vos outils de travail
            </div>
            <h3 style="margin:0 0 0.45rem; font-size:1.1rem;">Votre flux de documentation se met à jour automatiquement</h3>
            <p style="margin:0; color: var(--text-secondary); line-height:1.55;">Reliez GitHub, Figma, Notion et Google Cloud pour transformer votre activité réelle en mises à jour XERA sans effort.</p>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:0.6rem; align-items:center; justify-content:flex-end;">
            <button type="button" class="btn btn-secondary" onclick="startOAuthConnection('github')" style="padding:0.6rem 0.9rem; border-radius:999px; display:flex; align-items:center; gap:0.45rem;">
                <img src="icons/github.svg" alt="" style="width:16px;height:16px;">
                GitHub
            </button>
            <button type="button" class="btn btn-secondary" onclick="startOAuthConnection('figma')" style="padding:0.6rem 0.9rem; border-radius:999px; display:flex; align-items:center; gap:0.45rem;">
                <img src="icons/figma.svg" alt="" style="width:16px;height:16px;">
                Figma
            </button>
            <button type="button" class="btn btn-secondary" onclick="startOAuthConnection('notion')" style="padding:0.6rem 0.9rem; border-radius:999px; display:flex; align-items:center; gap:0.45rem;">
                <img src="icons/notion.svg" alt="" style="width:16px;height:16px;">
                Notion
            </button>
            <button type="button" class="btn btn-secondary" onclick="startOAuthConnection('google-cloud')" style="padding:0.6rem 0.9rem; border-radius:999px; display:flex; align-items:center; gap:0.45rem;">
                <img src="icons/google-cloud.svg" alt="" style="width:16px;height:16px;">
                Google Cloud
            </button>
        </div>
    </div>
</section>
`
        : "";
    const influenceSectionHtml = `
<section class="influence-section">
            <h3 class="section-title">Influence & Reach</h3>
            <div class="influence-grid">
                <div class="influence-card" id="yt-card">
                    <h4>YouTube</h4>
                    <div class="stat-block">
                        <div>
                            <div class="stat-value subs">--</div>
                            <div class="stat-label subs">Subscribers</div>
                        </div>
                        <div>
                            <div class="stat-value views">--</div>
                            <div class="stat-label views">Views</div>
                        </div>
                    </div>
                    <button class="connect-btn" data-connect="yt">Connect YouTube</button>
                </div>
                <div class="influence-card" id="sp-card">
                    <h4>Spotify</h4>
                    <div style="display:flex; align-items:center; gap:0.6rem;">
                        <img class="sp-avatar" alt="Spotify avatar">
                        <div>
                            <div class="stat-value followers">--</div>
                            <div class="stat-label followers">Followers</div>
                        </div>
                    </div>
                    <button class="connect-btn" data-connect="spotify">Connect Spotify</button>
                </div>
            </div>
</section>
    `;
    // Récupérer les "Evidence of Work" (Preuves de travail automatiques)
    let workItemsHtml = "";
    try {
        const workItems = await fetchWorkItems(userId);
        workItemsHtml = renderWorkItemsHtml(workItems);
    } catch (e) {
        console.warn("Erreur chargement work items:", e);
    }

    const publicActivityHtml = showPublicActivity
        ? `
${trajectoryGuardHtml}
${externalConnectionsHtml}
${workItemsHtml}
${projectProgressBoardHtml}
${arcsHtml}
${collabRequestsHtml}
${projectsHtml}
${hasArcs ? weeklyChartHtml : noArcNoticeHtml}
${showPublicStats ? influenceSectionHtml : ""}
<div class="timeline profile-content-shell">
            ${timelinesHtml}
</div>
    `
        : renderProfileHiddenSection("activity");

    const profileHtml = `
<div class="profile-hero profile-hero--glam ${getProfileAppearanceClass(profilePreferences)}" style="${getProfileAppearanceStyle(profilePreferences)}">
            <div class="profile-hero-glow" aria-hidden="true"></div>
            ${
                bannerHtml
                    ? `<div class="profile-banner-frame">${bannerHtml}</div>`
                    : `<div class="profile-banner-frame profile-banner-frame--empty"></div>`
            }
            <div class="profile-hero-grid">
                <div class="profile-identity-panel">
                    <div class="profile-avatar-wrapper">
                        <img src="${user.avatar && (user.avatar.startsWith("http") || user.avatar.startsWith("data:")) ? withCacheBust(user.avatar) : "https://placehold.co/150"}" class="profile-avatar-img" alt="Avatar de ${user.name}" onclick="navigateToUserProfile('${userId}')" style="cursor: pointer;">
                    </div>
                    <div class="profile-name-block">
                        <span class="profile-section-kicker">Profil XERA1</span>
                        <h2>${renderUsernameForProfile(user.name, user.id)}${monetizationBadgeHtml}</h2>
                        ${profileRoleBadgeHtml}
                        <p class="profile-title"><strong>${profileTitleHtml}</strong></p>
                        ${certificationsHtml}
                        <p class="profile-bio">${profileBioHtml}</p>
                        ${userBadgesHtml}
                        ${showPublicSocials ? renderProfileSocialLinks(userId) : renderProfileHiddenSection("socials")}
                        ${supportProfileHtml}
                    </div>
                </div>

                <div class="profile-signal-panel ${isOwnProfile ? "profile-signal-panel--owner" : "profile-signal-panel--viewer"}">
                    <span class="profile-section-kicker">Signaux</span>
                    ${
                        !isOwnProfile
                            ? `
                        ${publicSignalHtml}
                        <div class="profile-actions" style="margin-top:6px; display:flex; gap:8px; align-items:center; justify-content:center;">
                            ${followButtonHtml}
                            ${messageButtonHtml}
                            ${shareButtonHtml}
                        </div>
                        ${adminInlineHtml}
                    `
                            : `
                        ${publicSignalHtml}
                        ${verificationCtaHtml}
                        <div class="profile-actions" style="margin-top:6px; display:flex; gap:8px; align-items:center;">
                            <button class="btn-add" onclick="openCreateMenu('${userId}')" title="Ajouter une mise à jour">
                                <img src="icons/plus.svg" alt="Ajouter" style="width:18px;height:18px">
                            </button>
                            <button class="btn-add ${createCtaClass}" onclick="window.openCreateModal ? window.openCreateModal() : console.error('openCreateModal function not found')" title="Démarrer un projet" style="background: var(--text-primary); color: var(--bg-color);">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                            </button>
                            ${shareButtonHtml}
                            ${settingsButtonHtml}
                        </div>
                    `
                    }
                </div>
            </div>
</div>
${projectOnboardingBannerHtml}
${proCertificationCtaHtml}
${publicActivityHtml}

<!-- Footer uniquement sur la page profil -->
<footer style="background: var(--bg-secondary); border-top: 1px solid var(--border-color); padding: 2rem; margin-top: 4rem; text-align: center;">
            <div style="max-width: 1200px; margin: 0 auto;">
                <div style="display: flex; justify-content: center; align-items: center; gap: 2rem; margin-bottom: 1rem; flex-wrap: wrap;">
                    <a href="index.html" style="color: var(--text-secondary); text-decoration: none; transition: color 0.3s;">Accueil</a>
                    <a href="credits.html" style="color: var(--text-secondary); text-decoration: none; transition: color 0.3s;">Crédits</a>
                </div>
                <p style="color: var(--text-muted); font-size: 0.9rem;">© 2026 XERA1 - Documentez l'effort</p>
            </div>
</footer>
    `;

    const settingsButtonContainer = document.getElementById(
        "settings-button-container",
    );
    if (settingsButtonContainer) {
        settingsButtonContainer.innerHTML = "";
    }

    return profileHtml;
}

function isPageProRoute() {
    try {
        const pathname = String(window.location.pathname || "").replace(
            /\/+$/,
            "",
        );
        if (pathname === "/pagepro") return true;

        const params = new URLSearchParams(window.location.search);
        if (params.has("pro")) return true;

        // Si on est sur profile.html, on vérifie si l'utilisateur affiché est de type pro
        if (pathname === "/profile.html" || pathname === "/profile") {
            const userId = params.get("user");
            if (userId && typeof getUser === "function") {
                if (userId === "b0f9f893-1706-4721-899c-d26ad79afc86") {
                    return false;
                }
                const user = getUser(userId);
                const accountType =
                    user?.account_type ||
                    user?.user_metadata?.account_type ||
                    null;
                const accountSubtype =
                    user?.account_subtype ||
                    user?.user_metadata?.account_subtype ||
                    null;
                if (
                    (accountType || accountSubtype) &&
                    isProAccountType(accountType, accountSubtype)
                ) {
                    return true;
                }
            }
        }

        return false;
    } catch (error) {
        return false;
    }
}

function getProfileRenderContainer() {
    const profileContainer = document.querySelector(".profile-container");
    const proContainer = document.querySelector(".pro-page-container");
    if (isPageProRoute()) {
        return proContainer || profileContainer;
    }
    if (document.getElementById("pro-page")?.classList.contains("active")) {
        return proContainer || profileContainer;
    }
    return profileContainer || null;
}

async function renderProfileIntoContainer(userId) {
    if (!userId) return;

    const previousViewedId = window.currentProfileViewed;
    const sameProfileRenderKey = `${window.location.pathname || ""}|${window.location.search || ""}|${userId}`;
    if (window.__profileRenderInFlightKey === sameProfileRenderKey) {
        return;
    }
    if (
        window.__lastProfileRenderKey === sameProfileRenderKey &&
        window.__lastProfileRenderAt
    ) {
        const elapsed = Date.now() - window.__lastProfileRenderAt;
        if (elapsed < 1500) {
            return;
        }
    }

    window.currentProfileViewed = userId;
    window.__profileRenderInFlightKey = sameProfileRenderKey;
    window.__lastProfileRenderKey = sameProfileRenderKey;
    window.__lastProfileRenderAt = Date.now();

    const user = getUser(userId);
    const accountType =
        user?.account_type || user?.user_metadata?.account_type || null;
    const accountSubtype =
        user?.account_subtype || user?.user_metadata?.account_subtype || null;
    const isSuperAdminProfile =
        userId === "b0f9f893-1706-4721-899c-d26ad79afc86";
    const isProRoute = isPageProRoute();
    const hasExplicitProPageSlug = Boolean(
        new URLSearchParams(window.location.search).get("pro"),
    );
    const isPro =
        user && (!isSuperAdminProfile || isProRoute)
            ? isProAccountType(accountType, accountSubtype)
            : isProRoute;

    if (user && !isProRoute && isPro) {
        try {
            window.history.replaceState(
                {},
                document.title,
                buildProfileUrl(userId, accountType, accountSubtype),
            );
        } catch (e) {
            console.warn("Unable to normalize pro profile route:", e);
        }
    } else if (
        user &&
        isProRoute &&
        !hasExplicitProPageSlug &&
        isPro === false
    ) {
        try {
            window.history.replaceState(
                {},
                document.title,
                buildProfileUrl(userId, accountType),
            );
        } catch (e) {
            console.warn("Unable to normalize personal profile route:", e);
        }
    }

    const bodyIsPro = isPageProRoute();
    if (typeof document !== "undefined" && document.body) {
        document.body.classList.toggle("is-pro", bodyIsPro);
    }

    const hasLegacyProfileUserId =
        window.location.pathname.includes("/profile") &&
        new URLSearchParams(window.location.search).has("user");

    if (
        (isPageProRoute() || hasLegacyProfileUserId) &&
        window.professionalManager &&
        typeof window.professionalManager.handleInitialState === "function"
    ) {
        const handled = await window.professionalManager.handleInitialState();
        if (handled) {
            return;
        }
    }

    if (isPageProRoute() && typeof window.navigateTo === "function") {
        const params = new URLSearchParams(window.location.search);
        const proSlug = params.get("pro");
        const isProfilePage =
            window.location.pathname.includes("profile.html") ||
            window.location.pathname.includes("/pagepro");

        // Ne pas rediriger si on est déjà sur la bonne page/route pour éviter les boucles de redirection
        if (!isProfilePage) {
            window.navigateTo("pagepro", {
                query: proSlug ? { pro: proSlug } : {},
            });
        }
    }

    const profileContainer = getProfileRenderContainer();
    if (!profileContainer) {
        window.__profileRenderInFlightKey = null;
        return;
    }

    try {
        syncProfileCompletionReminders();
    } catch (e) {
        console.warn("Unable to sync profile completion reminders:", e);
    }

    const finalizeProfileRender = () => {
        try {
            persistProfileContentsCache(userId);
        } catch (e) {
            /* ignore */
        }

        try {
            initXeraCarousels(profileContainer);
        } catch (e) {
            /* ignore */
        }

        // Community Account Visuals
        const user = getUser(userId);
        if (user) {
            const preferences = getUserProfilePreferences(user);
            const appearanceClass = getProfileAppearanceClass(preferences);
            const appearanceStyle = getProfileAppearanceStyle(preferences);

            // Appliquer les classes et styles de personnalisation
            profileContainer.className = `container profile-container ${appearanceClass}`;
            profileContainer.setAttribute("style", appearanceStyle);

            if (
                user.account_subtype === "community" ||
                user.accountSubtype === "community"
            ) {
                profileContainer.classList.add("is-community");
            } else {
                profileContainer.classList.remove("is-community");
            }

            // Mettre à jour les meta tags Open Graph pour le partage du profil
            updateOpenGraphTags({
                userId: userId,
                userProfile: {
                    username: user.username || "Profil",
                    bio: user.bio || "",
                    avatar_url: user.avatar_url || user.avatarUrl || "",
                    profileImage: user.avatar_url || user.avatarUrl || "",
                },
            });
        }

        profileContainer.classList.toggle("arc-view", !!window.selectedArcId);
        if (window.loadUserArcs) window.loadUserArcs(userId);
        if (window.renderWeeklyProgressChart)
            window.renderWeeklyProgressChart(userId);
        if (window.renderInfluenceReach) window.renderInfluenceReach(userId);

        // Sécuriser l'appel aux analyses
        if (typeof window.renderProfileAnalytics === "function") {
            window
                .renderProfileAnalytics(userId)
                .catch((e) => console.warn("Analytics load failed:", e));
        }

        try {
            syncProfileCompletionReminders();
        } catch (e) {
            console.warn("Unable to sync profile completion reminders:", e);
        }

        maybeShowAmbassadorWelcome(userId);
        maybeApplyLatestPublishedPostHighlight(userId);

        // Injecter les widgets de croissance virale
        injectViralGrowthWidgets(userId);

        bindProfileImmersiveMedia(profileContainer);
        profileContainer.classList.remove("profile-content-enter");
        void profileContainer.offsetWidth;
        profileContainer.classList.add("profile-content-enter");
        setTimeout(
            () => profileContainer.classList.remove("profile-content-enter"),
            300,
        );
    };

    if (
        typeof window.renderProfileReact === "function" &&
        window.React &&
        window.ReactDOM
    ) {
        try {
            const didReactRender = window.renderProfileReact(
                profileContainer,
                userId,
                finalizeProfileRender,
            );
            if (didReactRender) {
                return;
            }
        } catch (e) {
            // fallback to vanilla
        }
    }

    profileContainer.innerHTML = getProfileLoadingMarkup(user);
    profileContainer.classList.remove("arc-view");
    try {
        profileContainer.innerHTML = await renderProfileTimeline(userId);
        finalizeProfileRender();
    } catch (error) {
        console.error("Erreur renderProfileTimeline:", error);
        profileContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <h3>Impossible de charger le profil</h3>
                <p>${error?.message || "Une erreur est survenue pendant le rendu."}</p>
            </div>
`;
    } finally {
        if (window.__profileRenderInFlightKey === sameProfileRenderKey) {
            window.__profileRenderInFlightKey = null;
        }
    }
}

function getProfileLoadingMarkup(user = null) {
    return getProfileSkeletonMarkup(user);
}

function renderProPageUnavailable(user) {
    const name = String(user?.name || user?.full_name || "Ce compte").trim();
    return `
        <div class="empty-state" style="text-align:center; padding: 3rem 1rem;">
            <div class="empty-state-icon">⚠️</div>
            <h3>Page professionnelle en cours de configuration</h3>
            <p style="max-width:600px; margin: 1rem auto; color: var(--text-secondary);">
                ${escapeHtml(name)} est un compte professionnel et ne peut plus s'afficher sur la page de profil standard.
                ${user?.id === window.currentUserId ? "Veuillez terminer la création de votre Page Pro pour accéder à votre espace." : "Cette page sera disponible dès que le propriétaire aura activé sa Page Pro."}
            </p>
        </div>
    `;
}

function getProfileSkeletonMarkup(user = null) {
    const accountType = String(
        user?.account_type || user?.user_metadata?.account_type || "",
    ).toLowerCase();
    const accountSubtype = String(
        user?.account_subtype ||
            user?.accountSubtype ||
            user?.user_metadata?.account_subtype ||
            "",
    ).toLowerCase();
    const isProfessionalAccount = isProAccountType(accountType, accountSubtype);

    const timelineItem = (key) => `
<div class="profile-skeleton-item" data-index="${key}">
            <div class="skeleton skeleton-dot"></div>
            <div class="profile-skeleton-card" style="${isProfessionalAccount ? "padding: 1.15rem; border-radius: 22px;" : ""}">
                <div class="skeleton skeleton-text" style="width: ${isProfessionalAccount ? "44%" : "32%"}; height: 0.8rem;"></div>
                <div class="skeleton skeleton-text" style="width: ${isProfessionalAccount ? "78%" : "68%"}; height: 0.9rem;"></div>
                <div class="skeleton skeleton-card-sm" style="${isProfessionalAccount ? "height: 96px; border-radius: 18px;" : ""}"></div>
            </div>
</div>
    `;
    const feedSkeleton = `
        <div class="profile-skeleton-feed" aria-hidden="true">
            <div class="profile-skeleton-feed-card"><div class="skeleton skeleton-card-sm"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text" style="width:65%"></div></div>
            <div class="profile-skeleton-feed-card"><div class="skeleton skeleton-card-sm"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text" style="width:65%"></div></div>
            <div class="profile-skeleton-feed-card"><div class="skeleton skeleton-card-sm"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text" style="width:65%"></div></div>
        </div>
    `;

    if (isProfessionalAccount) {
        return `
<div class="loading-state-container profile-skeleton profile-skeleton--professional" role="status" aria-label="Chargement du profil" aria-busy="true" aria-live="polite">
            <div class="skeleton skeleton-banner" aria-hidden="true" style="height: 220px; border-radius: 28px;"></div>

            <div class="profile-skeleton-header" style="margin-top: -58px; align-items: flex-end;">
                <div class="skeleton skeleton-avatar-lg" aria-hidden="true" style="width: 112px; height: 112px; border-radius: 24px;"></div>
                <div class="profile-skeleton-meta">
                    <div class="skeleton skeleton-text" style="width: 58%; height: 1.15rem;"></div>
                    <div class="skeleton skeleton-text" style="width: 42%; height: 0.95rem;"></div>
                    <div class="profile-skeleton-actions">
                        <div class="skeleton skeleton-pill" aria-hidden="true" style="width: 110px; height: 40px;"></div>
                        <div class="skeleton skeleton-pill" aria-hidden="true" style="width: 132px; height: 40px;"></div>
                        <div class="skeleton skeleton-pill skeleton-pill-short" aria-hidden="true" style="width: 86px; height: 40px;"></div>
                    </div>
                </div>
            </div>

            <div class="profile-skeleton-stats">
                <div class="skeleton skeleton-chip" style="height: 82px;"></div>
                <div class="skeleton skeleton-chip" style="height: 82px;"></div>
                <div class="skeleton skeleton-chip" style="height: 82px;"></div>
            </div>

            <div class="profile-skeleton-timeline" aria-hidden="true">
                ${timelineItem(1)}
                ${timelineItem(2)}
                ${timelineItem(3)}
            </div>
            ${feedSkeleton}
</div>
    `;
    }

    return `
<div class="loading-state-container profile-skeleton" role="status" aria-label="Chargement du profil" aria-busy="true" aria-live="polite">
            <div class="skeleton skeleton-banner" aria-hidden="true"></div>

            <div class="profile-skeleton-header">
                <div class="skeleton skeleton-avatar-lg" aria-hidden="true"></div>
                <div class="profile-skeleton-meta">
                    <div class="skeleton skeleton-text" style="width: 50%; height: 1.1rem;"></div>
                    <div class="skeleton skeleton-text" style="width: 35%; height: 0.95rem;"></div>
                    <div class="profile-skeleton-actions">
                        <div class="skeleton skeleton-pill" aria-hidden="true"></div>
                        <div class="skeleton skeleton-pill" aria-hidden="true"></div>
                        <div class="skeleton skeleton-pill skeleton-pill-short" aria-hidden="true"></div>
                    </div>
                </div>
            </div>

            <div class="profile-skeleton-stats">
                <div class="skeleton skeleton-chip"></div>
                <div class="skeleton skeleton-chip"></div>
                <div class="skeleton skeleton-chip"></div>
            </div>

            <div class="profile-skeleton-timeline" aria-hidden="true">
                ${timelineItem(1)}
                ${timelineItem(2)}
                ${timelineItem(3)}
            </div>
            ${feedSkeleton}
</div>
    `;
}

function getSettingsSkeletonMarkup() {
    return `
<div class="loading-state-container settings-skeleton" role="status" aria-busy="true" aria-live="polite">
            <div class="settings-skeleton-header">
                <div class="skeleton skeleton-text" style="width: 40%; height: 1.5rem; margin-bottom: 0.5rem;"></div>
                <div class="skeleton skeleton-text" style="width: 60%; height: 0.9rem;"></div>
            </div>
            <div class="settings-skeleton-sections">
                <div class="settings-skeleton-section">
                    <div class="skeleton skeleton-text" style="width: 30%; height: 1.2rem; margin-bottom: 1rem;"></div>
                    <div class="settings-skeleton-grid">
                        <div class="skeleton skeleton-field"></div>
                        <div class="skeleton skeleton-field"></div>
                        <div class="skeleton skeleton-field"></div>
                    </div>
                </div>
                <div class="settings-skeleton-section">
                    <div class="skeleton skeleton-text" style="width: 40%; height: 1.2rem; margin-bottom: 1rem;"></div>
                    <div class="settings-skeleton-grid">
                        <div class="skeleton skeleton-field"></div>
                        <div class="skeleton skeleton-field"></div>
                    </div>
                </div>
                <div class="settings-skeleton-section">
                    <div class="skeleton skeleton-text" style="width: 35%; height: 1.2rem; margin-bottom: 1rem;"></div>
                    <div class="settings-skeleton-grid">
                        <div class="skeleton skeleton-field"></div>
                        <div class="skeleton skeleton-field"></div>
                        <div class="skeleton skeleton-field"></div>
                        <div class="skeleton skeleton-field"></div>
                    </div>
                </div>
            </div>
            <div class="settings-skeleton-actions">
                <div class="skeleton skeleton-button" style="width: 100px;"></div>
                <div class="skeleton skeleton-button" style="width: 100px;"></div>
            </div>
</div>
    `;
}

window.getProfileSkeletonMarkup = getProfileSkeletonMarkup;

// Weekly progress chart (simple client-side aggregation)
window.renderWeeklyProgressChart = async function (userId) {
    try {
        const canvas = document.getElementById(
            `weekly-progress-chart-${userId}`,
        );
        if (!canvas || typeof Chart === "undefined") return;

        // Destroy existing chart instance if any
        if (!window._weeklyCharts) window._weeklyCharts = new Map();
        const existing = window._weeklyCharts.get(userId);
        if (existing) {
            existing.destroy();
            window._weeklyCharts.delete(userId);
        }

        const traces = getUserContentLocal(userId) || [];
        if (traces.length === 0) return;

        // Build last 7 day labels using created_at when available, else fallback to dayNumber
        const now = new Date();
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            days.push(key);
        }

        const counts = Object.fromEntries(days.map((d) => [d, 0]));
        traces.forEach((t) => {
            const raw = t.created_at || t.createdAt || null;
            let key = null;
            if (raw) {
                const d = new Date(raw);
                if (!isNaN(d)) key = d.toISOString().slice(0, 10);
            }
            if (!key && typeof t.dayNumber === "number") {
                // Map dayNumber to recent days: assume dayNumber 1 = today - (maxDay-1)
                const maxDay = Math.max(...traces.map((c) => c.dayNumber || 0));
                const offset = maxDay - t.dayNumber;
                const d = new Date(now);
                d.setDate(now.getDate() - offset);
                key = d.toISOString().slice(0, 10);
            }
            if (key && counts[key] !== undefined) counts[key] += 1;
        });

        const labels = days.map((d) => {
            const dt = new Date(d);
            if (!Number.isFinite(dt.getTime())) return "";
            try {
                return dt.toLocaleDateString(undefined, {
                    weekday: "short",
                });
            } catch (e) {
                return "";
            }
        });
        const data = days.map((d) => counts[d]);

        const chart = new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label: "Traces / jour",
                        data,
                        backgroundColor: "rgba(255,255,255,0.2)",
                        borderColor: "rgba(255,255,255,0.6)",
                        borderWidth: 1.5,
                        borderRadius: 6,
                        hoverBackgroundColor: "rgba(255,255,255,0.35)",
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 },
                        grid: { color: "rgba(255,255,255,0.05)" },
                    },
                    x: { grid: { display: false } },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) =>
                                `${ctx.parsed.y || 0} mise(s) à jour(s)`,
                        },
                    },
                },
            },
        });

        window._weeklyCharts.set(userId, chart);
    } catch (error) {
        console.error("Weekly progress chart error:", error);
    }
};

/* ========================================
   NAVIGATION
   ======================================== */

function syncFloatingCreateVisibility(pageId) {
    const container = document.getElementById("floating-create-container");
    if (!container) return;

    const isLoggedIn = !!window.currentUser;
    if (!isLoggedIn || pageId === "messages") {
        container.style.display = "none";
    } else {
        container.style.display = "flex";
    }
}

function navigateTo(pageId) {
    const normalizedPageId =
        pageId === "pagepro"
            ? "pro-page"
            : pageId === "pro-page"
              ? "pro-page"
              : pageId;

    // Vérifier si l'utilisateur essaie d'accéder à son profil sans être connecté
    if (
        normalizedPageId === "profile" &&
        !window.currentUser &&
        !window.currentProfileViewed
    ) {
        if (window.XeraRouter?.navigate) {
            window.XeraRouter.navigate("login");
        } else {
            window.location.href = "login.html";
        }
        return;
    }

    if (normalizedPageId === "profile" || normalizedPageId === "pro-page") {
        const profilePage = document.getElementById(normalizedPageId);
        if (!profilePage) {
            const targetUserId =
                window.currentProfileViewed || window.currentUserId || null;
            if (window.XeraRouter?.navigate) {
                if (normalizedPageId === "pro-page") {
                    window.XeraRouter.navigate("pagepro", {
                        query: { user: targetUserId },
                    });
                    return;
                }
                window.location.href = buildProfileUrl(targetUserId);
                return;
            }
            window.location.href = buildProfileUrl(
                targetUserId,
                normalizedPageId === "pro-page" ? "pro" : "personal",
            );
            return;
        }
    }

    if (pageId === "discover") {
        const discoverPage = document.getElementById("discover");
        if (!discoverPage) {
            if (window.XeraRouter?.navigate) {
                window.XeraRouter.navigate("discover");
            } else {
                window.location.href = "index.html";
            }
            return;
        }
        if (typeof setDiscoverFilter === "function") {
            setDiscoverFilter("all", { render: false });
        }
    }

    if (pageId === "messages") {
        if (!window.currentUser) {
            if (window.XeraRouter?.navigate) {
                window.XeraRouter.navigate("login");
            } else {
                window.location.href = "login.html";
            }
            return;
        }
        const messagesPage = document.getElementById("messages");
        if (!messagesPage) {
            if (window.XeraRouter?.navigate) {
                window.XeraRouter.navigate("discover", {
                    query: { messages: "1" },
                });
            } else {
                const url = new URL("index.html", window.location.href);
                url.searchParams.set("messages", "1");
                window.location.href = url.toString();
            }
            return;
        }
    }

    const pages = document.querySelectorAll(".page");
    pages.forEach((p) => p.classList.remove("active"));
    const targetPage = document.getElementById(normalizedPageId);
    if (targetPage) {
        targetPage.classList.add("active");
    }
    syncFloatingCreateVisibility(normalizedPageId);
    window.scrollTo(0, 0);
    document.body.classList.toggle(
        "profile-open",
        normalizedPageId === "profile",
    );
    handleLoginPromptContext();
}

window.syncFloatingCreateVisibility = syncFloatingCreateVisibility;

document.addEventListener(
    "click",
    (event) => {
        const pageTrigger = event.target.closest(
            '[data-profile-author-type="PAGE_PRO"][data-profile-page-id], [data-profile-page-id]',
        );
        if (pageTrigger) {
            const pageId = pageTrigger.dataset.profilePageId;
            if (!pageId) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            if (typeof window.openProfessionalPageById === "function") {
                Promise.resolve(window.openProfessionalPageById(pageId)).catch(
                    (error) =>
                        console.error("Ouverture de Page Pro impossible:", error),
                );
            } else if (window.XeraRouter?.navigate) {
                window.XeraRouter.navigate("pagepro", {
                    query: { pro: pageId },
                });
            } else {
                window.location.assign(
                    `profile.html?pro=${encodeURIComponent(pageId)}`,
                );
            }
            return;
        }

        const profileTrigger = event.target.closest(
            ".user-card .card-profile-link[data-profile-user-id]",
        );
        if (!profileTrigger) return;
        const userId = profileTrigger.dataset.profileUserId;
        if (!userId) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        handleProfileClick(userId, profileTrigger).catch((error) => {
            console.error("Discover profile click failed:", error);
        });
    },
    true,
);

// Make sure handleProfileNavigation is defined as an async function
async function handleProfileNavigation() {
    if (!window.currentUser) {
        // Rediriger vers la page de connexion
        if (window.XeraRouter?.navigate) {
            window.XeraRouter.navigate("login");
        } else {
            window.location.href = "login.html";
        }
        return;
    }

    const targetUserId = window.currentUserId || window.currentUser?.id;
    const accountType =
        window.currentUser.account_type ||
        window.currentUser.user_metadata?.account_type ||
        "personal";
    const accountSubtype =
        window.currentUser.account_subtype ||
        window.currentUser.user_metadata?.account_subtype ||
        "personal";
    const isSuperAdmin =
        !!window.currentUser &&
        window.currentUser.id === "b0f9f893-1706-4721-899c-d26ad79afc86";
    if (isSuperAdmin) {
        navigateToPersonalProfile();
        return;
    }
    const profileRoute = isProAccountType(accountType, accountSubtype)
        ? "pagepro"
        : "profile";
    window.currentProfileViewed = targetUserId || null;

    if (!document.getElementById("profile")) {
        window.location.href = buildProfileUrl(
            targetUserId,
            accountType,
            accountSubtype,
        );
        return;
    }

    // Afficher les skeletons IMMÉDIATEMENT au clic
    const profileContainer = document.querySelector(".profile-container");
    if (profileContainer) {
        profileContainer.innerHTML = getProfileLoadingMarkup();
        profileContainer.classList.remove("arc-view");
    }

    // Si connecté, naviguer vers le profil ou la page pro
    navigateTo(profileRoute);

    // Garder l'URL propre pour les comptes pro
    if (profileRoute === "pagepro") {
        const proUrl = buildProfileUrl(targetUserId, accountType);
        try {
            window.history.replaceState({}, "", proUrl);
        } catch (e) {
            console.warn("Unable to normalize profile URL for pro account:", e);
        }
    }

    // S'assurer que le profil est rendu avec l'utilisateur courant
    if (window.currentUserId) {
        await renderProfileIntoContainer(window.currentUserId);
    }
}

// Expose the function globally to ensure accessibility
window.handleProfileNavigation = handleProfileNavigation;

// Select ARC function
window.selectedArcId = null;
async function selectArc(arcId, userId) {
    window.selectedArcId = arcId;
    await renderProfileIntoContainer(userId);
}
window.selectArc = selectArc;

async function navigateToUserProfile(userId) {
    window.currentProfileViewed = userId;
    const user = getUser(userId);
    const accountType =
        user?.account_type || user?.user_metadata?.account_type || "personal";
    const accountSubtype =
        user?.account_subtype ||
        user?.user_metadata?.account_subtype ||
        "personal";
    const isSuperAdmin =
        !!window.currentUser &&
        window.currentUser.id === "b0f9f893-1706-4721-899c-d26ad79afc86";
    const profileRoute =
        isProAccountType(accountType, accountSubtype) && !isSuperAdmin
            ? "pagepro"
            : "profile";

    if (!document.getElementById("profile")) {
        window.location.href = buildProfileUrl(
            userId,
            accountType,
            accountSubtype,
        );
        return;
    }

    // Afficher les skeletons IMMÉDIATEMENT au clic
    const profileContainer = document.querySelector(".profile-container");
    if (profileContainer) {
        profileContainer.innerHTML = getProfileLoadingMarkup();
        profileContainer.classList.remove("arc-view");
    }

    navigateTo(profileRoute);

    // Déclencher le rendu (qui pourra écraser le skeleton avec les vraies données)
    await renderProfileIntoContainer(userId);
}

function navigateToProPage(slug) {
    if (!slug) return;
    if (window.professionalManager?.renderProPage) {
        window.professionalManager.renderProPage(slug);
        return;
    }

    console.log("Navigation vers la page pro:", slug);
}
window.navigateToProPage = navigateToProPage;

async function handleProfileClick(userId, triggerEl, fromImmersive = false) {
    if (!userId) return;

    if (triggerEl) {
        triggerEl.classList.add("click-loading", "click-loading-indicator");
    }

    if (
        fromImmersive &&
        document.getElementById("immersive-overlay")?.style.display === "block"
    ) {
        closeImmersive();
        await new Promise((resolve) => setTimeout(resolve, 60));
    }

    await navigateToUserProfile(userId);

    if (triggerEl && triggerEl.isConnected) {
        triggerEl.classList.remove("click-loading", "click-loading-indicator");
    }
}

/* ========================================
   UTILITAIRES UI
   ======================================== */

function toggleTimelineExpand(button) {
    const timelineLatest = button.closest(".timeline-latest");
    const timelineFull = timelineLatest.querySelector(".timeline-full");
    const toggleText = button.querySelector(".toggle-text");
    const isExpanded = !timelineFull.classList.contains("hidden");

    if (isExpanded) {
        timelineFull.classList.add("hidden");
        toggleText.textContent = "Afficher l'historique complet";
        button.classList.remove("expanded");
    } else {
        timelineFull.classList.remove("hidden");
        toggleText.textContent = "Masquer l'historique";
        button.classList.add("expanded");
    }
}

function toggleVideoPlay(video) {
    if (video.paused) {
        video.play().catch(() => {});
    } else {
        video.pause();
    }
}

function setupDiscoverVideoInteractions() {
    const videos = document.querySelectorAll("video.card-media");

    // Intersection Observer for Auto-play (shared to avoid stacking observers)
    if (!discoverVideoObserver) {
        const observerOptions = {
            root: null,
            rootMargin: "0px",
            threshold: 0.6, // Play when 60% visible
        };
        discoverVideoObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const video = entry.target;

                if (entry.isIntersecting) {
                    // Play if visible - keep muted for cards
                    video.muted = true;
                    video.play().catch(() => {
                        console.log("Autoplay blocked for card video");
                    });
                } else {
                    // Pause if not visible
                    video.pause();
                }
            });
        }, observerOptions);
    }

    videos.forEach((video) => {
        if (video.dataset.discoverVideoSetup === "1") return;
        video.dataset.discoverVideoSetup = "1";

        const wrap = video.closest(".card-media-wrap");
        // Initial setup - ensure muted for cards
        video.muted = true;
        video.playsInline = true;

        // Mark as ready when metadata is loaded
        const markReady = () => {
            if (wrap) wrap.classList.add("is-ready");
        };
        video.addEventListener("loadeddata", markReady, { once: true });
        video.addEventListener(
            "error",
            () => {
                if (wrap) wrap.classList.add("has-error");
            },
            { once: true },
        );

        // Start observing
        discoverVideoObserver.observe(video);

        const updateProgress = () => {
            const duration = Number(video.duration) || 0;
            const current = Number(video.currentTime) || 0;
            const progress =
                duration > 0 ? Math.max(0, Math.min(1, current / duration)) : 0;
            wrap?.style.setProperty("--video-progress", `${progress * 100}%`);
        };
        video.addEventListener("timeupdate", updateProgress);
        video.addEventListener("loadedmetadata", updateProgress);
        video.addEventListener("ended", () => {
            wrap?.style.setProperty("--video-progress", "0%");
        });

        // Autoplay on hover for discover cards
        video.addEventListener("mouseenter", function () {
            this.muted = true;
            this.play().catch(() => {});
        });
        video.addEventListener("mouseleave", function () {
            this.pause();
        });

        // Let clicks bubble to the card to open immersive
        video.addEventListener("click", function () {});
        video.addEventListener("touchstart", function () {});

        // Prevent default video controls from interfering
        video.addEventListener("contextmenu", (e) => e.preventDefault());

        // Force muted state on any volume change attempts
        video.addEventListener("volumechange", () => {
            if (!video.muted) {
                video.muted = true;
                console.log("Forced card video to stay muted");
            }
        });
    });
}

// Mood tracking - attention sensors (single observer for perf)
let discoverAttentionObserver = null;
const discoverAttentionTimers = new Map();

function clearDiscoverAttentionTimers() {
    discoverAttentionTimers.forEach((timer) => clearTimeout(timer));
    discoverAttentionTimers.clear();
}

function markContentAppreciated(el) {
    const contentId =
        el?.dataset?.contentId ||
        el?.closest(".user-card")?.dataset?.contentId ||
        null;
    if (!contentId) return;
    if (el.dataset.moodRecorded === "true") return;
    const content = findContentById(contentId);
    if (!content) return;
    el.dataset.moodRecorded = "true";
    adjustMoodScores(content.tags || [], 1.4);
}

function initDiscoverMoodTracking() {
    const discoverPage = document.getElementById("discover");
    if (!discoverPage || !discoverPage.classList.contains("active")) return;

    if (discoverAttentionObserver) {
        discoverAttentionObserver.disconnect();
        clearDiscoverAttentionTimers();
    }

    const options = {
        root: null,
        rootMargin: "0px 0px -30% 0px",
        threshold: 0.55,
    };

    discoverAttentionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            const target = entry.target;
            const isVideo = target.tagName === "VIDEO";
            const delay = isVideo ? 10000 : 4000; // 10s video, 4s image

            if (entry.isIntersecting) {
                if (!discoverAttentionTimers.has(target)) {
                    const timer = setTimeout(() => {
                        markContentAppreciated(target);
                        discoverAttentionTimers.delete(target);
                    }, delay);
                    discoverAttentionTimers.set(target, timer);
                }
            } else {
                const timer = discoverAttentionTimers.get(target);
                if (timer) {
                    clearTimeout(timer);
                    discoverAttentionTimers.delete(target);
                }
            }
        });
    }, options);

    const targets = document.querySelectorAll(
        ".user-card video.card-media, .user-card img.card-media",
    );
    targets.forEach((el) => {
        if (!el.dataset.contentId) return;
        discoverAttentionObserver.observe(el);
    });
}

/* ========================================
   SYSTÈME DE THÈME
   ======================================== */

function initTheme() {
    const savedTheme = localStorage.getItem("rize-theme");
    const initialTheme =
        savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";

    applyTheme(initialTheme, false);

    if (!window.__themeSystemListenerAttached && window.matchMedia) {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
        mediaQuery.addEventListener("change", (event) => {
            const hasManualPreference =
                localStorage.getItem("rize-theme") === "light" ||
                localStorage.getItem("rize-theme") === "dark";
            if (!hasManualPreference) {
                applyTheme(event.matches ? "light" : "dark", false);
            }
        });
        window.__themeSystemListenerAttached = true;
    }
}

function toggleTheme() {
    applyTheme(isLightMode() ? "dark" : "light", true);
}

function isLightMode() {
    return document.documentElement.classList.contains("light-mode");
}

function applyTheme(theme, persist = true) {
    const isLight = theme === "light";
    document.documentElement.classList.toggle("light-mode", isLight);

    if (persist) {
        localStorage.setItem("rize-theme", isLight ? "light" : "dark");
    }

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
        themeMeta.setAttribute("content", isLight ? "#f6f8fc" : "#050505");
    }

    updateThemeButtons(isLight);
}

function updateThemeButtons(isLight) {
    const controls = document.querySelectorAll(
        ".btn-theme-toggle, .settings-theme-control",
    );
    controls.forEach((control) => {
        const isLegacySettingsButton = control.id === "theme-toggle-btn";
        control.textContent = isLegacySettingsButton
            ? isLight
                ? "Passer en mode sombre"
                : "Passer en mode clair"
            : isLight
              ? "Mode sombre"
              : "Mode clair";
        control.setAttribute("aria-pressed", isLight ? "true" : "false");
    });
}

/* ========================================
   RÉGLAGES
   ======================================== */

async function fetchDmRelationshipStatus(otherUserId) {
    const currentUserId = window.currentUser?.id || window.currentUserId;
    if (!currentUserId || !otherUserId || otherUserId === currentUserId) {
        return {
            blocked_by_me: false,
            blocked_me: false,
            can_message: otherUserId !== currentUserId,
        };
    }

    const { data, error } = await supabase.rpc("get_dm_relationship_status", {
        p_other_user_id: otherUserId,
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    return {
        blocked_by_me: row?.blocked_by_me === true,
        blocked_me: row?.blocked_me === true,
        can_message: row?.can_message !== false,
    };
}

async function hideDmConversation(conversationId) {
    if (!conversationId) {
        throw new Error("Conversation invalide.");
    }
    const { data, error } = await supabase.rpc("hide_dm_conversation", {
        p_conversation_id: conversationId,
    });
    if (error) throw error;
    return data === true;
}

async function blockDmUser(otherUserId) {
    const currentUserId = window.currentUser?.id || window.currentUserId;
    if (!currentUserId) throw new Error("Session utilisateur absente.");
    if (!otherUserId || otherUserId === currentUserId) {
        throw new Error("Utilisateur invalide.");
    }

    const { data, error } = await supabase.rpc("block_dm_user", {
        p_other_user_id: otherUserId,
    });
    if (error) throw error;
    return data === true;
}

async function unblockDmUser(otherUserId) {
    const currentUserId = window.currentUser?.id || window.currentUserId;
    if (!currentUserId) throw new Error("Session utilisateur absente.");
    if (!otherUserId || otherUserId === currentUserId) {
        throw new Error("Utilisateur invalide.");
    }

    const { data, error } = await supabase.rpc("unblock_dm_user", {
        p_other_user_id: otherUserId,
    });
    if (error) throw error;
    return data === true;
}

async function fetchBlockedUsersForSettings(userId = window.currentUser?.id) {
    if (!userId) return [];

    const { data: rows, error } = await supabase
        .from("user_blocks")
        .select("blocked_user_id, created_at")
        .eq("blocker_id", userId)
        .order("created_at", { ascending: false });

    if (error) throw error;

    const blockedRows = rows || [];
    const blockedIds = blockedRows
        .map((row) => row.blocked_user_id)
        .filter(Boolean);
    const missingIds = blockedIds.filter((id) => !getUser(id));

    let fetchedUsers = [];
    if (missingIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
            .from("users")
            .select("id, name, avatar, account_subtype")
            .in("id", missingIds);

        if (usersError) throw usersError;
        fetchedUsers = usersData || [];
    }

    const fetchedById = new Map(fetchedUsers.map((entry) => [entry.id, entry]));

    return blockedRows.map((row) => {
        const profile =
            getUser(row.blocked_user_id) ||
            fetchedById.get(row.blocked_user_id) ||
            null;
        return {
            id: row.blocked_user_id,
            blockedAt: row.created_at || null,
            name: profile?.name || "Utilisateur",
            avatar:
                profile?.avatar ||
                "https://placehold.co/80x80?text=%F0%9F%9A%AB",
        };
    });
}

async function handleUnblockUserFromSettings(blockedUserId) {
    if (!blockedUserId || !window.currentUser?.id) return;
    try {
        await unblockDmUser(blockedUserId);
        if (window.ToastManager) {
            ToastManager.success(
                "Utilisateur débloqué",
                "Vous pouvez de nouveau recevoir et envoyer des messages.",
            );
        }
        if (
            document
                .getElementById("settings-modal")
                ?.classList.contains("active")
        ) {
            openSettings(window.currentUser.id);
        }
    } catch (error) {
        console.error("Unblock user error:", error);
        if (window.ToastManager) {
            ToastManager.error(
                "Déblocage impossible",
                error?.message || "Impossible de débloquer cet utilisateur.",
            );
        }
    }
}

function closeSettings() {
    const modal = document.getElementById("settings-modal");
    if (!modal) return;

    // Retirer immédiatement la classe active pour lancer l'animation de fermeture
    modal.classList.remove("active");

    // Restaurer le défilement du body
    document.body.style.overflow = "auto";

    // Cacher complètement la modale après la transition
    setTimeout(() => {
        if (modal && !modal.classList.contains("active")) {
            modal.style.display = "none";
        }
    }, 300);
}

function ensureSettingsModal() {
    if (document.getElementById("settings-modal")) return;
    const modal = document.createElement("div");
    modal.id = "settings-modal";
    modal.innerHTML = `<div class="settings-container"></div>`;
    document.body.appendChild(modal);
}

async function openSettings(userId) {
    if (!currentUser || currentUser.id !== userId) return;
    ensureSettingsModal();

    const user = getUser(userId);
    const modal = document.getElementById("settings-modal");
    const container = modal.querySelector(".settings-container");

    // Show skeleton immediately for better UX
    container.innerHTML = getSettingsSkeletonMarkup();
    modal.style.display = "block";
    // Force reflow
    modal.offsetHeight;
    modal.classList.add("active");
    document.body.style.overflow = "hidden";

    const followerCount = await getFollowerCount(userId);
    const accountType = user.account_type || "personal";
    const accountRole = normalizeDiscoveryAccountRole(
        user.account_subtype ||
            user.accountSubtype ||
            user.user_metadata?.account_subtype ||
            "fan",
    );
    const isCreatorVerified = isVerifiedCreatorUserId(userId);
    const isStaffVerified = isVerifiedStaffUserId(userId);
    const isCreatorEligible = followerCount >= 1000;
    const pendingTypes = await fetchUserPendingRequests(userId);
    const creatorRequestPending = pendingTypes.has("creator");
    const staffRequestPending = pendingTypes.has("staff");
    const pendingRequests = isVerificationAdmin()
        ? await fetchVerificationRequests()
        : [];
    const blockedUsers = await fetchBlockedUsersForSettings(userId).catch(
        (error) => {
            console.error("Blocked users fetch error:", error);
            return [];
        },
    );

    const verificationStatusHtml = isStaffVerified
        ? `<div class="verification-status verified">Entreprise vérifiée</div>`
        : isCreatorVerified
          ? `<div class="verification-status verified">Utilisateur vérifié</div>`
          : "";

    const verificationCtaHtml = `
<div class="verification-status info">
            Les demandes se font désormais sur la page Vérification.
</div>
<button type="button" class="btn-verify" onclick="window.location.href='subscription-plans.html'">
            Obtenir une vérification
            <img src="icons/verify-personal.svg?v=${BADGE_ASSET_VERSION}" alt="Badge" style="width:18px;height:18px;margin-left:8px;">
</button>
    `;

    const adminRequestsHtml = pendingRequests.length
        ? pendingRequests
              .map((req) => {
                  const reqUser =
                      getUser(req.userId) ||
                      (req.users
                          ? {
                                id: req.users.id,
                                name: req.users.name,
                                avatar: req.users.avatar,
                            }
                          : null);
                  const label =
                      req.type === "staff" ? "Équipe/Entreprise" : "Créateur";
                  const avatar = reqUser?.avatar || "https://placehold.co/40";
                  const name = reqUser?.name || "Utilisateur";
                  const nameHtml = renderUsernameWithBadge(name, req.userId);
                  return `
                <label class="verification-request-item">
                    <input type="checkbox" class="verification-request-check" data-user-id="${req.userId}" data-type="${req.type}">
                    <img src="${avatar}" alt="${name}">
                    <span class="verification-request-name">${nameHtml}</span>
                    <span class="verification-request-type">${label}</span>
                    <span class="verification-request-id">${req.userId}</span>
                </label>
            `;
              })
              .join("")
        : `<div class="verification-empty">Aucune demande en attente.</div>`;

    const verificationAdminHtml = isVerificationAdmin()
        ? `
<div class="settings-section">
            <h3>Administration vérification</h3>
            <div class="verification-admin-block">
                <div class="verification-requests">
                    ${adminRequestsHtml}
                </div>
                <div class="verification-actions" style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                    ${
                        isSuperAdmin()
                            ? `
                        <select id="verify-bulk-plan" class="form-input" style="min-width:170px;">
                            <option value="standard">Plan Standard</option>
                            <option value="medium">Plan Medium</option>
                            <option value="pro">Plan Pro</option>
                        </select>
                    `
                            : ""
                    }
                    <button type="button" class="btn-verify" onclick="handleVerificationSelection('approve')">Valider la sélection</button>
                    <button type="button" class="btn-cancel" onclick="handleVerificationSelection('reject')">Refuser la sélection</button>
                </div>
            </div>

            <div class="verification-manual">
                <h4>Ajouter un créateur vérifié</h4>
                <div class="verification-input-row">
                    <input type="text" id="verify-creator-id" class="form-input" placeholder="ID utilisateur">
                    ${
                        isSuperAdmin()
                            ? `
                        <select id="verify-creator-plan" class="form-input" style="min-width:170px;">
                            <option value="standard">Plan Standard</option>
                            <option value="medium">Plan Medium</option>
                            <option value="pro">Plan Pro</option>
                        </select>
                    `
                            : ""
                    }
                    <button type="button" class="btn-verify" onclick="addVerifiedUserId('creator', document.getElementById('verify-creator-id').value, document.getElementById('verify-creator-plan') ? document.getElementById('verify-creator-plan').value : null)">Ajouter</button>
                </div>
            </div>

            <div class="verification-manual">
                <h4>Ajouter une équipe vérifiée</h4>
                <div class="verification-input-row">
                    <input type="text" id="verify-staff-id" class="form-input" placeholder="ID utilisateur">
                    ${
                        isSuperAdmin()
                            ? `
                        <select id="verify-staff-plan" class="form-input" style="min-width:170px;">
                            <option value="standard">Plan Standard</option>
                            <option value="medium">Plan Medium</option>
                            <option value="pro">Plan Pro</option>
                        </select>
                    `
                            : ""
                    }
                    <button type="button" class="btn-verify" onclick="addVerifiedUserId('staff', document.getElementById('verify-staff-id').value, document.getElementById('verify-staff-plan') ? document.getElementById('verify-staff-plan').value : null)">Ajouter</button>
                </div>
            </div>
</div>
    `
        : "";

    const superAdminHtml = "";

    const blockedUsersHtml = blockedUsers.length
        ? blockedUsers
              .map((blockedUser) => {
                  const nameHtml = renderUsernameWithBadge(
                      blockedUser.name,
                      blockedUser.id,
                  );
                  const blockedAtLabel = blockedUser.blockedAt
                      ? safeFormatDate(blockedUser.blockedAt, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                        })
                      : "";
                  return `
                    <div class="blocked-user-item">
                        <div class="blocked-user-main">
                            <img class="blocked-user-avatar" src="${blockedUser.avatar}" alt="${blockedUser.name}">
                            <div class="blocked-user-meta">
                                <div class="blocked-user-name">${nameHtml}</div>
                                <div class="blocked-user-subtitle">
                                    ${blockedAtLabel ? `Bloqué le ${blockedAtLabel}` : "Utilisateur bloqué"}
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            class="btn-cancel blocked-user-action"
                            onclick="handleUnblockUserFromSettings('${blockedUser.id}')"
                        >
                            Débloquer
                        </button>
                    </div>
                `;
              })
              .join("")
        : `
            <div class="blocked-users-empty">
                Aucun utilisateur bloqué pour le moment.
            </div>
`;

    // Social links preparation
    const socialLinks = user.social_links || user.socialLinks || {};
    const profilePreferences = getUserProfilePreferences(user);
    const { appearance, privacy } = profilePreferences;
    const themeOptionsHtml = Object.entries(PROFILE_THEME_PRESETS)
        .map(([key, preset]) => {
            const checked = appearance.theme === key ? "checked" : "";
            return `
                <label class="profile-choice-card profile-theme-choice">
                    <input type="radio" name="setting-profile-theme" value="${key}" ${checked}>
                    <span class="theme-swatch" style="--swatch-a:${preset.accent};--swatch-b:${preset.secondary};"></span>
                    <span>${preset.label}</span>
                </label>
            `;
        })
        .join("");
    const layoutOptionsHtml = [
        ["balanced", "Équilibre", "Profil et signaux côte à côte."],
        ["showcase", "Showcase", "Identité large, signaux en second plan."],
        ["compact", "Compact", "Vue dense pour profils très actifs."],
    ]
        .map(
            ([value, label, description]) => `
                <label class="profile-choice-card">
                    <input type="radio" name="setting-profile-layout" value="${value}" ${appearance.layout === value ? "checked" : ""}>
                    <span>
                        <strong>${label}</strong>
                        <small>${description}</small>
                    </span>
                </label>
            `,
        )
        .join("");
    const bannerStyleOptionsHtml = [
        ["cover", "Cover"],
        ["contain", "Contain"],
        ["soft", "Soft"],
    ]
        .map(
            ([value, label]) => `
                <label class="segmented-option">
                    <input type="radio" name="setting-profile-banner-style" value="${value}" ${appearance.bannerStyle === value ? "checked" : ""}>
                    <span>${label}</span>
                </label>
            `,
        )
        .join("");
    const panelStyleOptionsHtml = [
        ["glass", "Glass"],
        ["solid", "Solid"],
        ["minimal", "Minimal"],
    ]
        .map(
            ([value, label]) => `
                <label class="segmented-option">
                    <input type="radio" name="setting-profile-panel-style" value="${value}" ${appearance.panelStyle === value ? "checked" : ""}>
                    <span>${label}</span>
                </label>
            `,
        )
        .join("");
    const visibilityOptionsHtml = [
        ["public", "Public", "Visible par tous."],
        ["followers", "Abonnés", "Visible par les abonnés."],
        ["private", "Privé", "Visible par vous seul."],
    ]
        .map(
            ([value, label, description]) => `
                <label class="profile-choice-card">
                    <input type="radio" name="setting-profile-visibility" value="${value}" ${privacy.visibility === value ? "checked" : ""}>
                    <span>
                        <strong>${label}</strong>
                        <small>${description}</small>
                    </span>
                </label>
            `,
        )
        .join("");
    const accountEmail = String(
        window.currentUser?.email || user.email || "",
    ).trim();
    const safeAccountEmailHtml = escapeHtml(accountEmail);
    const emailReminderEnabled = user.email_reminder_enabled !== false;
    const followerCountLabel = new Intl.NumberFormat("fr-FR").format(
        Number(followerCount) || 0,
    );
    const accountRoleLabel =
        {
            fan: "Fan",
            recruiter: "Recruteur",
            investor: "Investisseur",
        }[accountRole] || "Fan";
    const currentThemeLabel = isLightMode() ? "Mode sombre" : "Mode clair";
    container.innerHTML = `
<div class="settings-shell settings-shell-redesign">
            <div class="settings-header">
                <div class="settings-header-main">
                    <div class="settings-kicker">Centre de contrôle</div>
                    <div class="settings-title-row">
                        <h2>Réglages</h2>
                        ${isSuperAdmin() ? `<span class="admin-badge">Super admin</span>` : isVerificationAdmin() ? `<span class="admin-badge">Admin mode</span>` : ""}
                    </div>
                    <p>Organisez votre compte, votre profil public et vos préférences depuis un seul espace.</p>
                    <div class="settings-searchbar">
                        <input
                            type="search"
                            class="settings-search-input"
                            placeholder="Rechercher un réglage, section ou option"
                            aria-label="Rechercher un réglage"
                        />
                    </div>
                </div>
                <button type="button" class="settings-close-btn" onclick="closeSettings()" aria-label="Fermer les réglages">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>
                    </svg>
                </button>
                <div class="settings-status-strip" aria-label="Résumé du compte">
                    <div class="settings-status-card">
                        <span>Email</span>
                        <strong>${safeAccountEmailHtml || "Non renseigné"}</strong>
                    </div>
                    <div class="settings-status-card">
                        <span>Audience</span>
                        <strong>${followerCountLabel} abonnés</strong>
                    </div>
                    <div class="settings-status-card">
                        <span>Rôle</span>
                        <strong>${accountRoleLabel}</strong>
                    </div>
                </div>
            </div>

            <form id="settings-form" novalidate class="settings-form-layout">
                <div class="settings-workbench">
                    <div class="settings-mobile-list-header">
                        <span>Sections</span>
                        <strong>Choisir un réglage</strong>
                    </div>
                    <aside class="settings-navigation" aria-label="Sections des réglages">
                        <button type="button" class="settings-nav-item active" data-settings-target="preferences">
                            <span class="settings-nav-glyph">01</span>
                            <span><strong>Préférences</strong><small>Langue, thème, emails</small></span>
                        </button>
                        <button type="button" class="settings-nav-item" data-settings-target="appearance">
                            <span class="settings-nav-glyph">02</span>
                            <span><strong>Profil</strong><small>Look et mise en page</small></span>
                        </button>
                        <button type="button" class="settings-nav-item" data-settings-target="identity">
                            <span class="settings-nav-glyph">03</span>
                            <span><strong>Identité</strong><small>Avatar, bannière, bio</small></span>
                        </button>
                        <button type="button" class="settings-nav-item" data-settings-target="account-type">
                            <span class="settings-nav-glyph">04</span>
                            <span><strong>Compte</strong><small>Rôle Discover</small></span>
                        </button>
                        <button type="button" class="settings-nav-item" data-settings-target="verification">
                            <span class="settings-nav-glyph">05</span>
                            <span><strong>Vérification</strong><small>Badge et statut</small></span>
                        </button>
                        <button type="button" class="settings-nav-item" data-settings-target="socials">
                            <span class="settings-nav-glyph">06</span>
                            <span><strong>Réseaux</strong><small>Liens publics</small></span>
                        </button>
                        <button type="button" class="settings-nav-item" data-settings-target="direct-hook">
                            <span class="settings-nav-glyph">07</span>
                            <span><strong>Direct Hook</strong><small>API & Webhooks</small></span>
                        </button>
                        <button type="button" class="settings-nav-item" data-settings-target="privacy">
                            <span class="settings-nav-glyph">08</span>
                            <span><strong>Confidentialité</strong><small>Visibilité et messages</small></span>
                        </button>
                        <button type="button" class="settings-nav-item" data-settings-target="blocked">
                            <span class="settings-nav-glyph">09</span>
                            <span><strong>Blocages</strong><small>${blockedUsers.length} utilisateur${blockedUsers.length > 1 ? "s" : ""}</small></span>
                        </button>
                        <button type="button" class="settings-nav-item" data-settings-target="session">
                            <span class="settings-nav-glyph">10</span>
                            <span><strong>Session</strong><small>Déconnexion</small></span>
                        </button>
                        <button type="button" class="settings-nav-item settings-nav-danger" data-settings-target="danger">
                            <span class="settings-nav-glyph">11</span>
                            <span><strong>Danger</strong><small>Suppression du compte</small></span>
                        </button>
                    </aside>

                    <div class="settings-panel-stack">
                        <div class="settings-mobile-panel-topbar">
                            <button type="button" class="settings-mobile-back-btn" aria-label="Retour aux sections">
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M15 6 9 12l6 6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </button>
                            <strong class="settings-mobile-panel-title">Préférences</strong>
                        </div>
                <!-- Préférences -->
                <div class="accordion-section settings-panel" data-settings-section="preferences">
                    <button type="button" class="accordion-header">
                        <div class="accordion-title">
                            <span>Préférences de l'application</span>
                        </div>
                        <div class="accordion-arrow">
                            <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                    </button>
                    <div class="accordion-content">
                        <div class="accordion-body">
                            <div class="settings-preferences-grid">
                                <div class="form-group">
                                    <label for="lang-select">Langue</label>
                                    <select id="lang-select" class="lang-select">
                                        <option value="en">English (US)</option>
                                        <option value="fr">Français</option>
                                    </select>
                                    <div class="form-hint">La langue est aussi détectée automatiquement selon votre localisation.</div>
                                </div>
                                <div class="form-group">
                                    <label>Thème</label>
                                    <button type="button" class="btn-theme-toggle settings-theme-control" onclick="toggleTheme()">
                                        ${currentThemeLabel}
                                    </button>
                                    <div class="form-hint">Choisissez l'affichage qui vous convient.</div>
                                </div>
                                <div class="form-group">
                                    <label for="setting-email-reminder-enabled">Emails</label>
                                    <label class="settings-toggle-card">
                                        <input
                                            type="checkbox"
                                            id="setting-email-reminder-enabled"
                                            ${emailReminderEnabled ? "checked" : ""}
                                            ${accountEmail ? "" : "disabled"}
                                        >
                                        <span style="display:block;">
                                            <span style="display:block; font-weight:700;">RECEVOIR DES EMAILS</span>
                                            <span class="form-hint" style="display:block; margin-top:0.35rem;">
                                                ${
                                                    accountEmail
                                                        ? `Envoi à ${safeAccountEmailHtml}`
                                                        : "Envoi à l'adresse email du compte"
                                                }
                                            </span>
                                        </span>
                                    </label>
                                    <div class="form-hint">Vous pouvez couper ces emails à tout moment.</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Apparence du profil -->
                <div class="accordion-section settings-panel" data-settings-section="appearance">
                    <button type="button" class="accordion-header">
                        <div class="accordion-title">
                            <span>Apparence du profil</span>
                        </div>
                        <div class="accordion-arrow">
                            <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                    </button>
                    <div class="accordion-content">
                        <div class="accordion-body">
                            <div id="profile-customization-preview" class="profile-customization-preview ${getProfileAppearanceClass(profilePreferences)}" style="${getProfileAppearanceStyle(profilePreferences)}">
                                <div class="profile-customization-preview-banner"></div>
                                <div class="profile-customization-preview-grid">
                                    <div class="profile-customization-preview-card">
                                        <span class="profile-section-kicker">Profil XERA1</span>
                                        <strong>${escapeHtml(user.name || "Utilisateur")}</strong>
                                    </div>
                                    <div class="profile-customization-preview-card is-signal">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </div>
                                </div>
                            </div>

                            <div class="form-group">
                                <label>Thème du profil</label>
                                <div class="profile-choice-grid theme-choice-grid">
                                    ${themeOptionsHtml}
                                </div>
                            </div>

                            <div class="settings-duo-grid">
                                <div class="form-group">
                                    <label for="setting-profile-accent">Couleur principale</label>
                                    <input type="color" id="setting-profile-accent" class="profile-color-input" value="${appearance.accent}">
                                </div>
                                <div class="form-group">
                                    <label for="setting-profile-secondary">Couleur secondaire</label>
                                    <input type="color" id="setting-profile-secondary" class="profile-color-input" value="${appearance.secondary}">
                                </div>
                            </div>

                            <div class="form-group">
                                <label>Layout</label>
                                <div class="profile-choice-grid">
                                    ${layoutOptionsHtml}
                                </div>
                            </div>

                            <div class="settings-duo-grid">
                                <div class="form-group">
                                    <label>Bannière</label>
                                    <div class="settings-segmented-control">
                                        ${bannerStyleOptionsHtml}
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label>Cartes</label>
                                    <div class="settings-segmented-control">
                                        ${panelStyleOptionsHtml}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Identité -->
                <div class="accordion-section settings-panel" data-settings-section="identity">
                    <button type="button" class="accordion-header">
                        <div class="accordion-title">
                            <span>Identité</span>
                        </div>
                        <div class="accordion-arrow">
                            <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                    </button>
                    <div class="accordion-content">
                        <div class="accordion-body">
                            <div class="settings-media-grid">
                                <div class="settings-upload-card settings-upload-card-avatar" onclick="document.getElementById('setting-avatar-file').click()">
                                    <div class="settings-upload-copy">
                                        <span>Avatar</span>
                                        <strong>Photo principale</strong>
                                        <small>Format carré recommandé.</small>
                                    </div>
                                    <div class="settings-avatar-preview-wrap">
                                        <img src="${user.avatar && user.avatar.startsWith("http") ? escapeHtml(user.avatar) : "https://placehold.co/150"}" class="preview-avatar-circle" id="preview-avatar" alt="Avatar">
                                        <span class="settings-upload-action" aria-hidden="true">
                                            <svg viewBox="0 0 24 24">
                                                <path d="M12 3v12m0-12 5 5m-5-5-5 5M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                                            </svg>
                                        </span>
                                    </div>
                                    <input type="file" id="setting-avatar-file" accept="image/*">
                                    <input type="hidden" id="setting-avatar" value="${escapeHtml(user.avatar || "")}">
                                </div>

                                <div class="settings-upload-card settings-upload-card-banner" onclick="document.getElementById('setting-banner-file').click()">
                                    <div class="settings-upload-copy">
                                        <span>Bannière</span>
                                        <strong>Couverture du profil</strong>
                                        <small>Image large, lisible sur mobile.</small>
                                    </div>
                                    <div class="settings-banner-preview-wrap">
                                        <img src="${user.banner && user.banner.startsWith("http") ? escapeHtml(user.banner) : "https://placehold.co/1200x300/1a1a2e/00ff88?text=Ma+Trajectoire"}" class="preview-banner-rect" id="preview-banner" alt="Bannière">
                                        <span class="settings-upload-action" aria-hidden="true">Changer</span>
                                    </div>
                                    <input type="file" id="setting-banner-file" accept="image/*">
                                    <input type="hidden" id="setting-banner" value="${escapeHtml(user.banner || "")}">
                                </div>
                            </div>

                            <div class="form-group">
                                <label>Nom d'affichage</label>
                                <input type="text" id="setting-name" class="form-input" value="${escapeHtml(user.name || "")}" required>
                            </div>

                            <div class="form-group">
                                <label>Titre / Rôle</label>
                                <input type="text" id="setting-title" class="form-input" value="${escapeHtml(user.title || "")}" required>
                            </div>

                            <div class="form-group">
                                <label>Bio</label>
                                <textarea id="setting-bio" class="form-input" rows="4">${escapeHtml(user.bio || "")}</textarea>
                            </div>
                        </div>
                    </div>
                </div>



                <!-- Type de compte -->
                <div class="accordion-section settings-panel" data-settings-section="account-type">
                    <button type="button" class="accordion-header">
                        <div class="accordion-title">
                            <span>Type de compte</span>
                        </div>
                        <div class="accordion-arrow">
                            <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                    </button>
                    <div class="accordion-content">
                        <div class="accordion-body">
                            <p class="form-hint">Par défaut votre compte reste <strong>fan</strong>. Vous pouvez passer à recruteur ou investisseur à tout moment.</p>
                            <div class="account-type-toggle account-role-toggle">
                                <button type="button" class="account-type-btn account-role-btn ${accountRole === "fan" ? "active" : ""}" data-role="fan">Fan</button>
                                <button type="button" class="account-type-btn account-role-btn ${accountRole === "recruiter" ? "active" : ""}" data-role="recruiter">Recruteur</button>
                                <button type="button" class="account-type-btn account-role-btn ${accountRole === "investor" ? "active" : ""}" data-role="investor">Investisseur</button>
                            </div>
                            <input type="hidden" id="setting-account-role" value="${accountRole}">
                        </div>
                    </div>
                </div>

                <!-- Vérification -->
                <div class="accordion-section settings-panel" data-settings-section="verification">
                    <button type="button" class="accordion-header">
                        <div class="accordion-title">
                            <span>Vérification</span>
                        </div>
                        <div class="accordion-arrow">
                            <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                    </button>
                    <div class="accordion-content">
                        <div class="accordion-body">
                            <div class="verification-section">
                                ${verificationStatusHtml}
                                ${verificationCtaHtml}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Réseaux Sociaux -->
                <div class="accordion-section settings-panel" data-settings-section="socials">
                    <button type="button" class="accordion-header">
                        <div class="accordion-title">
                            <span>Réseaux Sociaux</span>
                        </div>
                        <div class="accordion-arrow">
                            <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                    </button>
                    <div class="accordion-content">
                        <div class="accordion-body">
                            <div class="form-group">
                                <div class="social-link-item">
                                    <img src="icons/email.svg" alt="Email">
                                    <input type="email" class="form-input" data-social="email" placeholder="email@exemple.com" value="${socialLinks.email || ""}">
                                </div>
                                <div class="social-link-item">
                                    <img src="icons/github.svg" alt="GitHub">
                                    <input type="text" class="form-input" data-social="github" placeholder="github.com/username" value="${socialLinks.github || ""}">
                                </div>
                                <div class="social-link-item">
                                    <img src="icons/instagram.svg" alt="Instagram">
                                    <input type="text" class="form-input" data-social="instagram" placeholder="instagram.com/username" value="${socialLinks.instagram || ""}">
                                </div>
                                <div class="social-link-item">
                                    <img src="icons/snapchat.svg" alt="Snapchat">
                                    <input type="text" class="form-input" data-social="snapchat" placeholder="snapchat.com/username" value="${socialLinks.snapchat || ""}">
                                </div>
                                <div class="social-link-item">
                                    <img src="icons/twitter.svg" alt="X">
                                    <input type="text" class="form-input" data-social="twitter" placeholder="x (twitter).com/username" value="${socialLinks.twitter || ""}">
                                </div>
                                <div class="social-link-item">
                                    <img src="icons/youtube.svg" alt="YouTube">
                                    <input type="text" class="form-input" data-social="youtube" placeholder="https://youtube.com" value="${socialLinks.youtube || ""}">
                                </div>
                                <div class="social-link-item">
                                    <img src="icons/twitch.svg" alt="Twitch">
                                    <input type="text" class="form-input" data-social="twitch" placeholder="twitch.com/username" value="${socialLinks.twitch || ""}">
                                </div>
                                <div class="social-link-item">
                                    <img src="icons/spotify.svg" alt="Spotify">
                                    <input type="text" class="form-input" data-social="spotify" placeholder="spotify.com/username" value="${socialLinks.spotify || ""}">
                                </div>
                                <div class="social-link-item">
                                    <img src="icons/tiktok.svg" alt="TikTok">
                                    <input type="text" class="form-input" data-social="tiktok" placeholder="tiktok.com/username" value="${socialLinks.tiktok || ""}">
                                </div>
                                <div class="social-link-item">
                                    <img src="icons/discord.svg" alt="Discord">
                                    <input type="text" class="form-input" data-social="discord" placeholder="discord.com/username" value="${socialLinks.discord || ""}">
                                </div>
                                <div class="social-link-item">
                                    <img src="icons/reddit.svg" alt="Reddit">
                                    <input type="text" class="form-input" data-social="reddit" placeholder="reddit.com/username" value="${socialLinks.reddit || ""}">
                                </div>
                                <div class="social-link-item">
                                    <img src="icons/pinterest.svg" alt="Pinterest">
                                    <input type="text" class="form-input" data-social="pinterest" placeholder="pinterest.com/username" value="${socialLinks.pinterest || ""}">
                                </div>
                                <div class="social-link-item">
                                    <img src="icons/linkedin.svg" alt="LinkedIn">
                                    <input type="text" class="form-input" data-social="linkedin" placeholder="linkedin.com/username" value="${socialLinks.linkedin || ""}">
                                </div>
                                <div class="social-link-item">
                                    <img src="icons/facebook.svg" alt="Facebook">
                                    <input type="text" class="form-input" data-social="facebook" placeholder="facebook.com/username" value="${socialLinks.facebook || ""}">
                                </div>
                                <div class="social-link-item">
                                    <img src="icons/link.svg" alt="Site">
                                    <input type="text" class="form-input" data-social="site" placeholder="https://example.com" value="${socialLinks.site || ""}">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Direct Hook (Developers) -->
                <div class="accordion-section settings-panel" data-settings-section="direct-hook">
                    <button type="button" class="accordion-header">
                        <div class="accordion-title">
                            <span>Direct Hook (API pour Builders)</span>
                        </div>
                    </button>
                    <div class="accordion-content">
                        <div class="accordion-body">
                            <p class="section-desc">Rendez votre log automatique. Envoyez des Traces directement depuis votre terminal ou vos scripts Git.</p>

                            <div class="form-group">
                                <label>Clé API Direct Hook</label>
                                <div style="display:flex; gap:0.5rem;">
                                    <input type="text" class="form-input" id="direct-hook-key" value="xera_live_${Math.random().toString(36).substring(7)}" readonly>
                                    <button type="button" class="btn btn-secondary" onclick="copyToClipboard(document.getElementById('direct-hook-key').value)">Copier</button>
                                </div>
                                <p class="form-hint">Gardez cette clé secrète. Elle permet de publier en votre nom.</p>
                            </div>

                            <div class="form-group">
                                <label>Webhook Endpoint (Simulé)</label>
                                <input type="text" class="form-input" value="https://xera.tech/api/hook/v1/publish" readonly>
                            </div>

                            <div class="form-group">
                                <label>Exemple cURL</label>
                                <pre style="background:rgba(0,0,0,0.5); padding:1rem; border-radius:10px; font-size:0.8rem; overflow-x:auto; color:var(--accent-color);">
curl -X POST https://xera.tech/api/hook/v1/publish \\
  -H "X-XERA-KEY: [VOTRE_CLE]" \\
  -d '{"title": "Git Commit: Merge UI", "day": 12, "arc_id": "..."}'
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Confidentialité du profil -->
                <div class="accordion-section settings-panel" data-settings-section="privacy">
                    <button type="button" class="accordion-header">
                        <div class="accordion-title">
                            <span>Confidentialité du profil</span>
                        </div>
                        <div class="accordion-arrow">
                            <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                    </button>
                    <div class="accordion-content">
                        <div class="accordion-body">
                            <div class="form-group">
                                <label>Visibilité</label>
                                <div class="profile-choice-grid">
                                    ${visibilityOptionsHtml}
                                </div>
                            </div>

                            <div class="privacy-toggle-list">
                                <label class="privacy-toggle-row">
                                    <span>
                                        <strong>Apparaître dans Discover</strong>
                                        <small>Votre profil peut être recommandé dans le flux public.</small>
                                    </span>
                                    <span class="toggle-switch">
                                        <input type="checkbox" id="setting-profile-discoverable" ${privacy.discoverable ? "checked" : ""}>
                                        <span class="toggle-slider"></span>
                                    </span>
                                </label>
                                <label class="privacy-toggle-row">
                                    <span>
                                        <strong>Afficher les signaux</strong>
                                        <small>Abonnés, vues, updates et progression.</small>
                                    </span>
                                    <span class="toggle-switch">
                                        <input type="checkbox" id="setting-profile-show-stats" ${privacy.showStats ? "checked" : ""}>
                                        <span class="toggle-slider"></span>
                                    </span>
                                </label>
                                <label class="privacy-toggle-row">
                                    <span>
                                        <strong>Afficher les liens sociaux</strong>
                                        <small>Email, portfolio et réseaux publics.</small>
                                    </span>
                                    <span class="toggle-switch">
                                        <input type="checkbox" id="setting-profile-show-socials" ${privacy.showSocials ? "checked" : ""}>
                                        <span class="toggle-slider"></span>
                                    </span>
                                </label>
                                <label class="privacy-toggle-row">
                                    <span>
                                        <strong>Afficher l'activité</strong>
                                        <small>Projets, updates, analytics et timeline.</small>
                                    </span>
                                    <span class="toggle-switch">
                                        <input type="checkbox" id="setting-profile-show-activity" ${privacy.showActivity ? "checked" : ""}>
                                        <span class="toggle-slider"></span>
                                    </span>
                                </label>
                            </div>

                            <div class="form-group" style="margin-top:1.25rem;">
                                <label for="setting-profile-allow-messages">Messages</label>
                                <select id="setting-profile-allow-messages" class="form-input">
                                    <option value="everyone" ${privacy.allowMessages === "everyone" ? "selected" : ""}>Tout le monde</option>
                                    <option value="followers" ${privacy.allowMessages === "followers" ? "selected" : ""}>Abonnés uniquement</option>
                                    <option value="none" ${privacy.allowMessages === "none" ? "selected" : ""}>Personne</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Utilisateurs bloqués -->
                <div class="accordion-section settings-panel" data-settings-section="blocked">
                    <button type="button" class="accordion-header">
                        <div class="accordion-title">
                            <span>Utilisateurs bloqués</span>
                            <span class="settings-counter-chip">${blockedUsers.length}</span>
                        </div>
                        <div class="accordion-arrow">
                            <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                    </button>
                    <div class="accordion-content">
                        <div class="accordion-body">
                            <div class="blocked-users-list">
                                ${blockedUsersHtml}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Session -->
                <div class="accordion-section settings-panel" data-settings-section="session">
                    <button type="button" class="accordion-header">
                        <div class="accordion-title">
                            <span>Session</span>
                        </div>
                        <div class="accordion-arrow">
                            <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                    </button>
                    <div class="accordion-content">
                        <div class="accordion-body">
                            <p>Déconnectez cet appareil si besoin.</p>
                            <button type="button" class="btn-signout-settings" onclick="handleSignOut()">
                                Se déconnecter
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Suppression de compte -->
                <div class="accordion-section settings-panel settings-danger-zone" data-settings-section="danger">
                    <button type="button" class="accordion-header">
                        <div class="accordion-title">
                            <span class="settings-danger-title">Suppression du compte</span>
                        </div>
                        <div class="accordion-arrow">
                            <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                    </button>
                    <div class="accordion-content">
                        <div class="accordion-body">
                            <div class="delete-account-box">
                                <p class="settings-danger-alert">
                                    Avertissement : cette action est définitive et irréversible.
                                </p>
                                <p>Toutes vos données, publications, ARCs et informations de profil seront supprimées de façon permanente.</p>
                                
                                <div class="delete-account-reasons">
                                    <label class="delete-account-reason-item">
                                        <input type="radio" name="delete-account-reason" value="inactive">
                                        <span>Je n'utilise plus XERA</span>
                                    </label>
                                    <label class="delete-account-reason-item">
                                        <input type="radio" name="delete-account-reason" value="technical">
                                        <span>J'ai des problèmes techniques</span>
                                    </label>
                                    <label class="delete-account-reason-item">
                                        <input type="radio" name="delete-account-reason" value="privacy">
                                        <span>Confidentialité / sécurité</span>
                                    </label>
                                    <label class="delete-account-reason-item">
                                        <input type="radio" name="delete-account-reason" value="experience">
                                        <span>L'expérience ne me convient pas</span>
                                    </label>
                                    <label class="delete-account-reason-item">
                                        <input type="radio" name="delete-account-reason" value="other">
                                        <span>Autre</span>
                                    </label>
                                </div>
                                <div class="delete-account-other-wrap" style="display:none;">
                                    <label for="delete-account-other">Précisez la raison</label>
                                    <textarea id="delete-account-other" class="form-input" rows="3" placeholder="Expliquez brièvement..." disabled></textarea>
                                </div>
                                <button type="button" class="btn-delete-account" onclick="requestAccountDeletion('${userId}')">
                                    Supprimer définitivement mon compte
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                    </div>
                </div>

                <div class="actions-bar">
                    <button type="button" class="btn-cancel" onclick="closeSettings()">Annuler</button>
                    <button type="submit" class="btn-save">Enregistrer</button>
                </div>
            </form>
            ${verificationAdminHtml}
</div>
    `;

    modal.style.display = "block";
    // Force reflow
    modal.offsetHeight;
    modal.classList.add("active");

    // Logic for the settings workspace navigation
    const accordionSections = container.querySelectorAll(".accordion-section");
    const navButtons = container.querySelectorAll(".settings-nav-item");
    const workbench = container.querySelector(".settings-workbench");
    const panelStack = container.querySelector(".settings-panel-stack");
    const mobilePanelTitle = container.querySelector(
        ".settings-mobile-panel-title",
    );
    const mobileBackButton = container.querySelector(
        ".settings-mobile-back-btn",
    );
    const mobileSettingsQuery = window.matchMedia("(max-width: 768px)");
    const getSectionTitle = (target) => {
        const button = container.querySelector(
            `.settings-nav-item[data-settings-target="${target}"] strong`,
        );
        return button?.textContent?.trim() || "Réglages";
    };
    const setActiveSettingsSection = (target) => {
        accordionSections.forEach((section) => {
            section.classList.toggle(
                "active",
                section.dataset.settingsSection === target,
            );
        });
        navButtons.forEach((button) => {
            const isActive = button.dataset.settingsTarget === target;
            button.classList.toggle("active", isActive);
            if (isActive) {
                button.setAttribute("aria-current", "page");
            } else {
                button.removeAttribute("aria-current");
            }
            if (
                isActive &&
                !mobileSettingsQuery.matches &&
                typeof button.scrollIntoView === "function"
            ) {
                button.scrollIntoView({
                    block: "nearest",
                    inline: "center",
                });
            }
        });
        if (mobilePanelTitle) {
            mobilePanelTitle.textContent = getSectionTitle(target);
        }
    };
    const openMobileSettingsSection = (target) => {
        setActiveSettingsSection(target);
        if (mobileSettingsQuery.matches) {
            workbench?.classList.add("settings-mobile-section-open");
            panelStack?.scrollTo({ top: 0, behavior: "auto" });
        }
    };
    const closeMobileSettingsSection = () => {
        workbench?.classList.remove("settings-mobile-section-open");
    };

    navButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const target = button.dataset.settingsTarget;
            if (!target) return;
            if (mobileSettingsQuery.matches) {
                openMobileSettingsSection(target);
            } else {
                setActiveSettingsSection(target);
            }
        });
    });

    mobileBackButton?.addEventListener("click", () => {
        closeMobileSettingsSection();
    });

    accordionSections.forEach((section) => {
        const header = section.querySelector(".accordion-header");
        header?.addEventListener("click", () => {
            setActiveSettingsSection(section.dataset.settingsSection);
        });
    });

    setActiveSettingsSection("preferences");
    closeMobileSettingsSection();

    if (window.refreshLanguageControl) {
        window.refreshLanguageControl();
    }

    initializeProfileCustomizationControls(container);
    refreshOAuthConnectionStatuses(container).catch((error) => {
        console.warn(
            "Impossible de charger les statuts de connexion OAuth:",
            error,
        );
    });

    const refreshReminderStateFromSettings = () => {
        try {
            syncProfileCompletionReminders();
        } catch (error) {
            console.warn("Unable to refresh reminder state:", error);
        }
    };

    document
        .getElementById("setting-name")
        ?.addEventListener("input", refreshReminderStateFromSettings);
    document
        .getElementById("setting-title")
        ?.addEventListener("input", refreshReminderStateFromSettings);
    document
        .getElementById("setting-bio")
        ?.addEventListener("input", refreshReminderStateFromSettings);
    document
        .getElementById("setting-avatar")
        ?.addEventListener("input", refreshReminderStateFromSettings);
    document
        .getElementById("setting-banner")
        ?.addEventListener("input", refreshReminderStateFromSettings);

    container.dataset.accountRoleTouched = "0";
    const accountRoleButtons = container.querySelectorAll(".account-role-btn");
    accountRoleButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            accountRoleButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById("setting-account-role").value =
                btn.dataset.role;
            container.dataset.accountRoleTouched = "1";
        });
    });

    const deleteReasonInputs = container.querySelectorAll(
        'input[name="delete-account-reason"]',
    );
    const deleteOtherWrap = container.querySelector(
        ".delete-account-other-wrap",
    );
    const deleteOtherInput = container.querySelector("#delete-account-other");
    const syncDeleteReasonVisibility = () => {
        const selected = container.querySelector(
            'input[name="delete-account-reason"]:checked',
        );
        const isOther = selected?.value === "other";
        if (deleteOtherWrap) {
            deleteOtherWrap.style.display = isOther ? "block" : "none";
        }
        if (deleteOtherInput) {
            deleteOtherInput.disabled = !isOther;
            if (!isOther) deleteOtherInput.value = "";
        }
    };
    deleteReasonInputs.forEach((input) =>
        input.addEventListener("change", syncDeleteReasonVisibility),
    );
    syncDeleteReasonVisibility();

    let pendingProfileMediaUploads = 0;
    const updateSaveButtonUploadState = () => {
        const btn = document.querySelector("#settings-form .btn-save");
        if (!btn) return;
        if (pendingProfileMediaUploads > 0) {
            btn.disabled = true;
            btn.textContent = "Upload image...";
        } else if (btn.textContent === "Upload image...") {
            btn.disabled = false;
            btn.textContent = "Enregistrer";
        }
    };

    // Handle form submission
    document
        .getElementById("settings-form")
        .addEventListener("submit", async (e) => {
            e.preventDefault();

            // Validate required fields before submission
            const nameInput = document.getElementById("setting-name");
            const nameTrimmed = String(nameInput?.value || "").trim();

            if (!nameTrimmed) {
                if (window.ToastManager) {
                    ToastManager.error(
                        "Erreur",
                        "Le nom d'affichage ne peut pas être vide.",
                    );
                } else {
                    alert("Le nom d'affichage ne peut pas être vide.");
                }
                return;
            }

            if (pendingProfileMediaUploads > 0) {
                alert(
                    "Un upload d'image est encore en cours. Attendez la fin puis réessayez.",
                );
                return;
            }

            const btnSave = e.target.querySelector(".btn-save");
            const originalText = btnSave.textContent;
            btnSave.disabled = true;
            btnSave.textContent = "Enregistrement...";

            const socialInputs = e.target.querySelectorAll("[data-social]");
            const newSocialLinks = {};
            socialInputs.forEach((input) => {
                if (input.value.trim()) {
                    newSocialLinks[input.dataset.social] = normalizeExternalUrl(
                        input.value,
                    );
                }
            });

            const isGifCandidate = (file) =>
                typeof isGifFile === "function"
                    ? isGifFile(file)
                    : file?.type === "image/gif" ||
                      String(file?.name || "")
                          .toLowerCase()
                          .endsWith(".gif");

            const uploadPendingProfileImage = async (
                inputId,
                hiddenId,
                label,
            ) => {
                const input = document.getElementById(inputId);
                const file = input?.files?.[0];
                if (!file) return;

                const isGif = isGifCandidate(file);
                if (isGif && !canUseGifProfile()) {
                    throw new Error(
                        "Astuce: les avatars/bannières animés sont réservés aux plans supérieurs. Passez à un plan Standard, Medium ou Pro pour débloquer cet avantage.",
                    );
                }

                let fileToUpload = file;
                if (!isGif && typeof compressImage === "function") {
                    try {
                        fileToUpload = await compressImage(file);
                    } catch (err) {
                        console.warn(`Compression ${label} échouée:`, err);
                    }
                }

                btnSave.textContent = `Upload ${label}...`;
                const uploadResult = await uploadFile(fileToUpload, "profile");
                if (!uploadResult?.success || !uploadResult?.url) {
                    throw new Error(
                        uploadResult?.error ||
                            `Échec upload ${label.toLowerCase()}.`,
                    );
                }

                const hidden = document.getElementById(hiddenId);
                if (hidden) hidden.value = uploadResult.url;
                if (input) input.value = "";
            };

            try {
                // Fallback safety: si un fichier est encore présent au submit,
                // on l'upload avant la sauvegarde profil.
                await uploadPendingProfileImage(
                    "setting-avatar-file",
                    "setting-avatar",
                    "avatar",
                );
                await uploadPendingProfileImage(
                    "setting-banner-file",
                    "setting-banner",
                    "bannière",
                );
            } catch (uploadErr) {
                alert("Erreur upload: " + (uploadErr?.message || uploadErr));
                btnSave.disabled = false;
                btnSave.textContent = originalText;
                return;
            }

            btnSave.textContent = "Enregistrement...";

            const selectedRoleValue =
                document.getElementById("setting-account-role")?.value || "fan";
            const emailReminderCheckbox = document.getElementById(
                "setting-email-reminder-enabled",
            );
            const reminderTimezone = (() => {
                try {
                    return (
                        Intl.DateTimeFormat().resolvedOptions().timeZone ||
                        emailReminderTimeZone ||
                        "UTC"
                    );
                } catch (error) {
                    return emailReminderTimeZone || "UTC";
                }
            })();
            const existingSubtypeRaw = String(
                user.account_subtype || user.accountSubtype || "",
            ).trim();
            const roleTouched = container.dataset.accountRoleTouched === "1";
            const shouldOverwriteSubtype =
                roleTouched ||
                !existingSubtypeRaw ||
                isManagedDiscoveryAccountRole(existingSubtypeRaw);
            const subtypeToSave = shouldOverwriteSubtype
                ? normalizeDiscoveryAccountRole(selectedRoleValue)
                : existingSubtypeRaw;
            const profilePreferences = collectProfilePreferencesFromSettings();

            // Collect and validate form values
            const collectedName = String(
                document.getElementById("setting-name")?.value || "",
            ).trim();
            const collectedTitle = String(
                document.getElementById("setting-title")?.value || "",
            ).trim();
            const collectedBio = String(
                document.getElementById("setting-bio")?.value || "",
            ).trim();
            const collectedAvatar = String(
                document.getElementById("setting-avatar")?.value || "",
            ).trim();
            const collectedBanner = String(
                document.getElementById("setting-banner")?.value || "",
            ).trim();

            // Validate name is not empty - fallback to current name if needed
            let finalName = collectedName;
            if (!finalName) {
                // Fallback to existing user name
                finalName = String(user.name || "").trim();
                if (!finalName && currentUser?.email) {
                    // Last resort: use email prefix
                    finalName = currentUser.email.split("@")[0];
                }
                if (!finalName) {
                    finalName = "Utilisateur";
                }
                console.warn(
                    "Empty username detected, using fallback:",
                    finalName,
                );
            }

            const profileData = {
                name: finalName,
                title: collectedTitle,
                bio: collectedBio,
                avatar: collectedAvatar,
                banner: collectedBanner,
                social_links: newSocialLinks,
                account_type: accountType || "personal",
                account_subtype: subtypeToSave,
                profile_preferences: profilePreferences,
            };

            // Debug logging
            console.log(
                "Saving profile with name:",
                profileData.name,
                "Previous name was:",
                user.name,
            );

            const okOnline = await ensureOnlineOrNotify();
            if (!okOnline) {
                btnSave.disabled = false;
                btnSave.textContent = originalText;
                return;
            }
            const sessionCheck = await ensureFreshSupabaseSession();
            if (!sessionCheck.ok) {
                console.warn("Session refresh failed", sessionCheck.error);
            }

            const result = await upsertUserProfile(userId, profileData);

            if (result.success) {
                // Validate response data
                const returnedName = String(result.data?.name || "").trim();

                // If server returned empty name or only email prefix, log warning
                if (
                    !returnedName ||
                    returnedName === currentUser?.email?.split("@")[0]
                ) {
                    console.warn(
                        "Server returned unexpected name value:",
                        returnedName,
                        "Expected:",
                        profileData.name,
                    );
                    // If name was lost, restore it from what we sent
                    if (!returnedName) {
                        result.data.name = profileData.name;
                    }
                }

                console.log(
                    "Profile save successful. Name in response:",
                    result.data?.name,
                );
                let reminderSaveResult = { success: true };
                if (emailReminderCheckbox && !emailReminderCheckbox.disabled) {
                    reminderSaveResult = await saveEmailReminderPreferences({
                        userId,
                        enabled: emailReminderCheckbox.checked,
                        timezone: reminderTimezone,
                    });
                }

                const updatedAt =
                    result.data?.updated_at || new Date().toISOString();
                try {
                    if (result.data?.avatar) {
                        result.data.avatar = withCacheBust(
                            result.data.avatar,
                            updatedAt,
                        );
                    }
                    if (result.data?.banner) {
                        result.data.banner = withCacheBust(
                            result.data.banner,
                            updatedAt,
                        );
                    }
                } catch (e) {
                    /* ignore */
                }

                // Update local state
                const userIndex = allUsers.findIndex((u) => u.id === userId);
                if (userIndex !== -1) {
                    // Merge new data
                    allUsers[userIndex] = {
                        ...allUsers[userIndex],
                        ...result.data,
                        profile_preferences:
                            result.data?.profile_preferences ||
                            profilePreferences,
                        ...(reminderSaveResult.success
                            ? {
                                  email_reminder_enabled:
                                      emailReminderCheckbox?.checked === true,
                                  email_reminder_timezone: reminderTimezone,
                              }
                            : {}),
                    };
                }

                // Keep current session user fresh (important for PWA cache-first flows)
                try {
                    if (
                        window.currentUser &&
                        window.currentUser.id === userId
                    ) {
                        window.currentUser = {
                            ...window.currentUser,
                            ...result.data,
                            profile_preferences:
                                result.data?.profile_preferences ||
                                profilePreferences,
                        };
                        currentUser = window.currentUser;
                    }
                } catch (e) {
                    /* ignore */
                }

                // Persist users cache so the PWA doesn't keep stale data after restart
                try {
                    if (Array.isArray(allUsers) && allUsers.length > 0) {
                        localStorage.setItem(
                            XERA_CACHE_USERS_KEY,
                            JSON.stringify(allUsers),
                        );
                    }
                } catch (e) {
                    /* ignore */
                }

                try {
                    syncProfileCompletionReminders();
                } catch (e) {
                    console.warn(
                        "Unable to sync reminders after profile save:",
                        e,
                    );
                }

                // Also refresh derived discover cache if used
                try {
                    if (typeof persistDiscoverCache === "function") {
                        persistDiscoverCache();
                    }
                } catch (e) {
                    /* ignore */
                }

                // Preserve current form values in case modal is still open during refresh
                const currentFormValues = {
                    name: document.getElementById("setting-name")?.value,
                    title: document.getElementById("setting-title")?.value,
                    bio: document.getElementById("setting-bio")?.value,
                };

                // Reload profile view - with error protection
                try {
                    if (document.querySelector("#profile.active")) {
                        await renderProfileIntoContainer(userId);
                    }
                } catch (e) {
                    console.warn("Profile refresh failed:", e);
                }

                // Restore form values if modal is still open
                const settingsModal = document.getElementById("settings-modal");
                if (
                    settingsModal &&
                    settingsModal.classList.contains("active")
                ) {
                    if (
                        currentFormValues.name &&
                        document.getElementById("setting-name")
                    ) {
                        document.getElementById("setting-name").value =
                            currentFormValues.name;
                    }
                    if (
                        currentFormValues.title &&
                        document.getElementById("setting-title")
                    ) {
                        document.getElementById("setting-title").value =
                            currentFormValues.title;
                    }
                    if (
                        currentFormValues.bio &&
                        document.getElementById("setting-bio")
                    ) {
                        document.getElementById("setting-bio").value =
                            currentFormValues.bio;
                    }
                }

                // Refresh Discover cards (multiple cards can exist per user/arc) - with error protection
                try {
                    if (document.querySelector(".discover-grid")) {
                        await renderDiscoverGrid();
                        if (typeof window.ToastManager !== "undefined") {
                            window.ToastManager.success(
                                "XΞRA High-Signal",
                                "Momentum Engine & Fluidity Active.",
                                3000,
                            );
                        }
                    }
                } catch (e) {
                    console.warn("Discover grid refresh failed:", e);
                }

                // Refresh discover React island if present
                try {
                    if (window.ReactIslands?.renderDiscover) {
                        window.ReactIslands.renderDiscover();
                    }
                } catch (e) {
                    /* ignore */
                }

                if (!reminderSaveResult.success) {
                    if (window.ToastManager) {
                        ToastManager.info(
                            "Profil enregistré",
                            "Mais le rappel email n'a pas pu être sauvegardé : " +
                                reminderSaveResult.error,
                        );
                    } else {
                        alert(
                            "Profil enregistre, mais le rappel email n'a pas pu etre sauvegarde: " +
                                reminderSaveResult.error,
                        );
                    }
                } else {
                    if (window.ToastManager) {
                        ToastManager.success(
                            "Succès",
                            "Vos réglages ont été enregistrés avec succès.",
                        );
                    }
                }
                // TOUJOURS fermer la modale, même si les rafraîchissements ont échoué
                closeSettings();
            } else {
                // Check if it's a name validation error
                const isNameError = String(result.error || "")
                    .toLowerCase()
                    .includes("nom");
                const errorMsg = isNameError
                    ? "Le nom d'affichage ne peut pas être vide. Veuillez remplir ce champ."
                    : result.error ||
                      "Une erreur est survenue lors de l'enregistrement.";

                if (window.ToastManager) {
                    ToastManager.error("Erreur", errorMsg);
                } else {
                    alert("Erreur: " + errorMsg);
                }
            }

            btnSave.disabled = false;
            btnSave.textContent = originalText;
        });

    // Initialize file uploads
    if (typeof initializeFileInput === "function") {
        // Avatar upload
        initializeFileInput("setting-avatar-file", {
            preview: "preview-avatar",
            compress: true,
            onBeforeUpload: () => {
                pendingProfileMediaUploads += 1;
                updateSaveButtonUploadState();
            },
            onAfterUpload: () => {
                pendingProfileMediaUploads = Math.max(
                    0,
                    pendingProfileMediaUploads - 1,
                );
                updateSaveButtonUploadState();
            },
            validate: (file) => {
                const isGif =
                    typeof isGifFile === "function"
                        ? isGifFile(file)
                        : file?.type === "image/gif" ||
                          String(file?.name || "")
                              .toLowerCase()
                              .endsWith(".gif");
                if (!isGif) return { valid: true };
                if (canUseGifProfile()) return { valid: true };
                return {
                    valid: false,
                    error: "Astuce: les avatars animés sont réservés aux plans supérieurs. Passez à un plan Standard, Medium ou Pro pour les débloquer.",
                };
            },
            onUpload: (result) => {
                if (result.success) {
                    document.getElementById("setting-avatar").value =
                        result.url;
                    try {
                        syncProfileCompletionReminders();
                    } catch (error) {
                        console.warn(
                            "Unable to sync reminders after avatar upload:",
                            error,
                        );
                    }
                } else {
                    alert("Erreur upload: " + result.error);
                }
            },
        });

        // Banner upload
        initializeFileInput("setting-banner-file", {
            preview: "preview-banner",
            compress: true,
            onBeforeUpload: () => {
                pendingProfileMediaUploads += 1;
                updateSaveButtonUploadState();
            },
            onAfterUpload: () => {
                pendingProfileMediaUploads = Math.max(
                    0,
                    pendingProfileMediaUploads - 1,
                );
                updateSaveButtonUploadState();
            },
            validate: (file) => {
                const isGif =
                    typeof isGifFile === "function"
                        ? isGifFile(file)
                        : file?.type === "image/gif" ||
                          String(file?.name || "")
                              .toLowerCase()
                              .endsWith(".gif");
                if (!isGif) return { valid: true };
                if (canUseGifProfile()) return { valid: true };
                return {
                    valid: false,
                    error: "Astuce: les bannières animées sont réservées aux plans supérieurs. Passez à un plan Standard, Medium ou Pro pour les débloquer.",
                };
            },
            onUpload: (result) => {
                if (result.success) {
                    document.getElementById("setting-banner").value =
                        result.url;
                    try {
                        syncProfileCompletionReminders();
                    } catch (error) {
                        console.warn(
                            "Unable to sync reminders after banner upload:",
                            error,
                        );
                    }
                } else {
                    alert("Erreur upload: " + result.error);
                }
            },
        });
    }
}

/* ========================================
   LIVE STREAMING
   ======================================== */

let currentStream = null;
let screenStream = null;
let cameraStream = null;
let isLive = false;

// Polyfill pour roundRect si non supporté
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        this.beginPath();
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r);
        this.lineTo(x + w, y + h - r);
        this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.lineTo(x + r, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r);
        this.lineTo(x, y + r);
        this.quadraticCurveTo(x, y, x + r, y);
        this.closePath();
        return this;
    };
}

function launchLive(userId) {
    if (!window.currentUser) {
        if (window.ToastManager) {
            ToastManager.error(
                "Login required",
                "Vous devez être connecté pour lancer un live",
            );
        }
        return;
    }

    if (window.currentUser.id !== userId) {
        if (window.ToastManager) {
            ToastManager.error(
                "Erreur",
                "Vous ne pouvez lancer un live que pour votre propre profil",
            );
        }
        return;
    }

    // Redirection vers la page de création de stream
    if (window.ToastManager) {
        ToastManager.success(
            "Lancement Live",
            "Redirection vers la configuration du live...",
        );
    }

    setTimeout(() => {
        window.location.href = "create-stream.html";
    }, 500);
}

// Exposer les fonctions globalement pour les onclick
window.launchLive = launchLive;
window.createLiveModal = createLiveModal;
window.closeLiveModal = closeLiveModal;
window.toggleCamera = toggleCamera;
window.toggleScreenShare = toggleScreenShare;
window.setLayout = setLayout;
window.updateCameraSize = updateCameraSize;
window.updateCameraPosition = updateCameraPosition;
window.startLiveStream = startLiveStream;
window.stopLiveStream = stopLiveStream;

function createLiveModal() {
    const modal = document.createElement("div");
    modal.id = "live-modal";
    modal.className = "modal";
    modal.innerHTML = `
<div class="modal-content live-modal-content">
            <div class="modal-header">
                <h2><img src="icons/live.svg" alt="Live" style="width:20px;height:20px;vertical-align:middle;margin-right:8px;filter:invert(0.2);"> Configuration Live Stream</h2>
                <button class="close-btn" onclick="closeLiveModal()">&times;</button>
            </div>
            <div class="live-controls">
                <div class="stream-preview">
                    <video id="live-preview" autoplay muted playsinline></video>
                    <div class="stream-status" id="stream-status">
                        <span class="status-indicator offline">● Hors ligne</span>
                    </div>
                </div>
                
                <div class="control-panel">
                    <div class="source-controls">
                        <h3>Sources de streaming</h3>
                        <div class="source-buttons">
                            <button class="source-btn" id="camera-btn" onclick="toggleCamera()">
                                📹 Caméra
                            </button>
                            <button class="source-btn" id="screen-btn" onclick="toggleScreenShare()">
                                🖥️ Écran
                            </button>
                        </div>
                    </div>
                    
                    <div class="layout-controls" id="layout-controls" style="display: none;">
                        <h3>Mise en page</h3>
                        <div class="layout-options">
                            <button class="layout-btn active" onclick="setLayout('single')">Simple</button>
                            <button class="layout-btn" onclick="setLayout('pip')">Incrustation</button>
                            <button class="layout-btn" onclick="setLayout('side')">Côte à côte</button>
                        </div>
                        
                        <div class="size-controls" id="size-controls">
                            <div class="size-control">
                                <label>Taille caméra (%)</label>
                                <input type="range" id="camera-size" min="20" max="80" value="30" onchange="updateCameraSize(this.value)">
                                <span id="camera-size-value">30%</span>
                            </div>
                            <div class="size-control">
                                <label>Position caméra</label>
                                <select id="camera-position" onchange="updateCameraPosition(this.value)">
                                    <option value="bottom-right">Bas droite</option>
                                    <option value="bottom-left">Bas gauche</option>
                                    <option value="top-right">Haut droite</option>
                                    <option value="top-left">Haut gauche</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div class="stream-actions">
                        <button class="btn-start-stream" id="start-stream-btn" onclick="startLiveStream()" disabled>
                            ▶️ Démarrer le live
                        </button>
                        <button class="btn-stop-stream" id="stop-stream-btn" onclick="stopLiveStream()" style="display: none;">
                            ⏹️ Arrêter le live
                        </button>
                    </div>
                    
                    <div class="stream-info">
                        <div class="info-item">
                            <label>Titre du live</label>
                            <input type="text" id="stream-title" placeholder="Mon super live stream!" maxlength="100">
                        </div>
                        <div class="info-item">
                            <label>Description</label>
                            <textarea id="stream-description" placeholder="Décrivez votre live..." maxlength="500"></textarea>
                        </div>
                    </div>
                </div>
            </div>
</div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function closeLiveModal() {
    const modal = document.getElementById("live-modal");
    modal.classList.remove("active");
    document.body.style.overflow = "";
    setTimeout(() => {
        modal.style.display = "none";
        // Nettoyer les streams si en cours
        if (cameraStream) {
            cameraStream.getTracks().forEach((track) => track.stop());
            cameraStream = null;
        }
        if (screenStream) {
            screenStream.getTracks().forEach((track) => track.stop());
            screenStream = null;
        }
    }, 300);
}

async function toggleCamera() {
    const btn = document.getElementById("camera-btn");
    const preview = document.getElementById("live-preview");

    if (cameraStream) {
        // Arrêter la caméra
        cameraStream.getTracks().forEach((track) => track.stop());
        cameraStream = null;
        btn.classList.remove("active");
        btn.textContent = "📹 Caméra";
        updatePreview();
    } else {
        // Démarrer la caméra
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: "user",
                },
                audio: true,
            });
            btn.classList.add("active");
            btn.textContent = "📹 Caméra (ON)";
            updatePreview();
            checkStreamReady();
        } catch (error) {
            console.error("Erreur caméra:", error);
            alert(
                "Impossible d'accéder à la caméra. Vérifiez les permissions.",
            );
        }
    }
}

async function toggleScreenShare() {
    const btn = document.getElementById("screen-btn");
    const preview = document.getElementById("live-preview");

    if (screenStream) {
        // Arrêter le partage d'écran
        screenStream.getTracks().forEach((track) => track.stop());
        screenStream = null;
        btn.classList.remove("active");
        btn.textContent = "🖥️ Écran";
        updatePreview();
    } else {
        // Démarrer le partage d'écran
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
                audio: true,
            });

            // Écouter l'arrêt du partage d'écran par l'utilisateur
            screenStream.getVideoTracks()[0].onended = () => {
                screenStream = null;
                btn.classList.remove("active");
                btn.textContent = "🖥️ Écran";
                updatePreview();
                checkStreamReady();
            };

            btn.classList.add("active");
            btn.textContent = "🖥️ Écran (ON)";
            updatePreview();
            checkStreamReady();
        } catch (error) {
            console.error("Erreur partage d'écran:", error);
            alert(
                "Impossible de partager l'écran. Opération annulée par l'utilisateur.",
            );
        }
    }
}

function updatePreview() {
    const preview = document.getElementById("live-preview");
    const layoutControls = document.getElementById("layout-controls");

    if (screenStream && cameraStream) {
        // Mode mixte - afficher les contrôles de layout
        layoutControls.style.display = "block";
        setLayout(
            document
                .querySelector(".layout-btn.active")
                ?.onclick?.toString()
                .match(/setLayout\('(.+)'\)/)?.[1] || "pip",
        );
    } else if (screenStream) {
        // Écran seulement
        preview.srcObject = screenStream;
        layoutControls.style.display = "none";
    } else if (cameraStream) {
        // Caméra seulement
        preview.srcObject = cameraStream;
        layoutControls.style.display = "none";
    } else {
        // Aucun stream
        preview.srcObject = null;
        layoutControls.style.display = "none";
    }
}

function setLayout(layout) {
    // Retirer la classe active de tous les boutons
    document
        .querySelectorAll(".layout-btn")
        .forEach((btn) => btn.classList.remove("active"));
    // Ajouter la classe active au bouton sélectionné
    event.target.classList.add("active");

    const preview = document.getElementById("live-preview");
    const sizeControls = document.getElementById("size-controls");

    if (!screenStream || !cameraStream) return;

    // Créer un canvas pour mixer les streams
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");

    const screenVideo = document.createElement("video");
    const cameraVideo = document.createElement("video");

    screenVideo.srcObject = screenStream;
    cameraVideo.srcObject = cameraStream;

    screenVideo.muted = true;
    cameraVideo.muted = true;

    Promise.all([
        new Promise((resolve) => (screenVideo.onloadedmetadata = resolve)),
        new Promise((resolve) => (cameraVideo.onloadedmetadata = resolve)),
    ]).then(() => {
        screenVideo.play();
        cameraVideo.play();

        function drawFrame() {
            if (layout === "single") {
                // Écran seulement
                ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
                sizeControls.style.display = "none";
            } else if (layout === "pip") {
                // Picture-in-picture
                const cameraSize = parseInt(
                    document.getElementById("camera-size").value,
                );
                const cameraWidth = (canvas.width * cameraSize) / 100;
                const cameraHeight = (cameraWidth * 9) / 16; // Ratio 16:9

                const position =
                    document.getElementById("camera-position").value;
                let x, y;

                switch (position) {
                    case "bottom-right":
                        x = canvas.width - cameraWidth - 20;
                        y = canvas.height - cameraHeight - 20;
                        break;
                    case "bottom-left":
                        x = 20;
                        y = canvas.height - cameraHeight - 20;
                        break;
                    case "top-right":
                        x = canvas.width - cameraWidth - 20;
                        y = 20;
                        break;
                    case "top-left":
                        x = 20;
                        y = 20;
                        break;
                }

                // Dessiner l'écran en arrière-plan
                ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);

                // Dessiner la caméra par-dessus
                ctx.save();
                ctx.beginPath();
                ctx.roundRect(x, y, cameraWidth, cameraHeight, 10);
                ctx.clip();
                ctx.drawImage(cameraVideo, x, y, cameraWidth, cameraHeight);
                ctx.restore();

                sizeControls.style.display = "block";
            } else if (layout === "side") {
                // Côte à côte
                const screenWidth = canvas.width * 0.7;
                const cameraWidth = canvas.width * 0.3;

                ctx.drawImage(screenVideo, 0, 0, screenWidth, canvas.height);
                ctx.drawImage(
                    cameraVideo,
                    screenWidth,
                    0,
                    cameraWidth,
                    canvas.height,
                );

                sizeControls.style.display = "none";
            }

            if (currentStream) {
                requestAnimationFrame(drawFrame);
            }
        }

        // Créer un stream à partir du canvas
        currentStream = canvas.captureStream(30);

        // Ajouter l'audio du stream principal (écran ou caméra)
        if (screenStream.getAudioTracks().length > 0) {
            currentStream.addTrack(screenStream.getAudioTracks()[0]);
        } else if (cameraStream.getAudioTracks().length > 0) {
            currentStream.addTrack(cameraStream.getAudioTracks()[0]);
        }

        preview.srcObject = currentStream;
        drawFrame();
    });
}

function updateCameraSize(value) {
    document.getElementById("camera-size-value").textContent = value + "%";
    if (
        currentStream &&
        document.querySelector(".layout-btn.active")?.textContent ===
            "Incrustation"
    ) {
        setLayout("pip");
    }
}

function updateCameraPosition(position) {
    if (
        currentStream &&
        document.querySelector(".layout-btn.active")?.textContent ===
            "Incrustation"
    ) {
        setLayout("pip");
    }
}

function checkStreamReady() {
    const startBtn = document.getElementById("start-stream-btn");
    startBtn.disabled = !(screenStream || cameraStream);
}

async function startLiveStream() {
    const title =
        document.getElementById("stream-title").value || "Live Stream";
    const description =
        document.getElementById("stream-description").value || "";

    if (!currentStream && !screenStream && !cameraStream) {
        alert("Veuillez sélectionner au moins une source (caméra ou écran)");
        return;
    }

    try {
        // Si pas de stream mixte, utiliser le stream principal
        if (!currentStream) {
            currentStream = screenStream || cameraStream;
        }

        // Mettre à jour l'interface
        isLive = true;
        document.getElementById("start-stream-btn").style.display = "none";
        document.getElementById("stop-stream-btn").style.display =
            "inline-block";
        document.getElementById("stream-status").innerHTML =
            '<span class="status-indicator live">● En direct</span>';

        // Créer une entrée de contenu live dans la base de données
        const liveResult = await createLiveContent(title, description);
        if (liveResult?.success && liveResult.data) {
            notifyFollowersOfLiveStart(liveResult.data, title).catch((e) =>
                console.warn("notifyFollowersOfLiveStart error", e),
            );
            alert("✅ Live démarré ! Votre stream est maintenant en direct.");
        } else {
            throw new Error(liveResult?.error || "Création live échouée");
        }
    } catch (error) {
        console.error("Erreur démarrage live:", error);
        alert("Erreur lors du démarrage du live: " + error.message);
    }
}

async function stopLiveStream() {
    try {
        // Arrêter tous les streams
        if (currentStream) {
            currentStream.getTracks().forEach((track) => track.stop());
            currentStream = null;
        }

        isLive = false;
        document.getElementById("start-stream-btn").style.display =
            "inline-block";
        document.getElementById("stop-stream-btn").style.display = "none";
        document.getElementById("stream-status").innerHTML =
            '<span class="status-indicator offline">● Hors ligne</span>';

        alert("⏹️ Live arrêté.");
    } catch (error) {
        console.error("Erreur arrêt live:", error);
        alert("Erreur lors de l'arrêt du live: " + error.message);
    }
}

async function getNextDayNumber(userId) {
    const contents = getUserContentLocal(userId);
    const dayNumbers = (contents || [])
        .map((item) => Number.parseInt(item?.dayNumber ?? item?.day_number, 10))
        .filter((day) => Number.isFinite(day) && day >= 0);
    const maxDay = dayNumbers.length > 0 ? Math.max(...dayNumbers) : 0;
    return maxDay + 1;
}

async function createLiveContent(title, description) {
    // Créer une entrée de contenu live
    const contentData = {
        userId: currentUser.id,
        type: "live",
        state: "success",
        title: title,
        description: description,
        mediaUrl: null, // Pour un live, pas d'URL statique
        dayNumber: await getNextDayNumber(currentUser.id),
    };

    try {
        const result = await createContent(contentData);
        console.log("Contenu live créé:", result);
        return result;
    } catch (error) {
        console.error("Erreur création contenu live:", error);
        return { success: false, error: error.message };
    }
}

// Naviguer vers le live actif d'un utilisateur (si disponible)
async function openLiveStreamForUser(userId, fallbackTitle = "Live") {
    try {
        if (!userId || typeof supabase === "undefined") return;
        const { data, error } = await supabase
            .from("streaming_sessions")
            .select("id, title, user_id, status")
            .eq("user_id", userId)
            .eq("status", "live")
            .order("started_at", { ascending: false })
            .limit(1)
            .single();
        if (error || !data) {
            ToastManager?.info("Live indisponible", "Aucun live actif trouvé.");
            const safeTitle = encodeURIComponent(
                (fallbackTitle || "Live").trim(),
            );
            window.location.href = `stream.html?host=${userId}&title=${safeTitle}&live=1`;
            return;
        }
        const liveTitle = encodeURIComponent(
            (data.title || fallbackTitle || "Live").trim(),
        );
        window.location.href = `stream.html?id=${data.id}&host=${data.user_id}&title=${liveTitle}`;
    } catch (e) {
        console.error("openLiveStreamForUser error", e);
        ToastManager?.error("Impossible d'ouvrir le live", e.message || "");
    }
}
window.openLiveStreamForUser = openLiveStreamForUser;

function openLiveStreamById(streamId, hostId = null, fallbackTitle = "Live") {
    if (!streamId) {
        if (hostId) {
            openLiveStreamForUser(hostId, fallbackTitle);
        }
        return;
    }
    const title = encodeURIComponent((fallbackTitle || "Live").trim());
    const hostPart = hostId ? `&host=${hostId}` : "";
    window.location.href = `stream.html?id=${streamId}${hostPart}&title=${title}`;
}
window.openLiveStreamById = openLiveStreamById;

/* ========================================
   CRÉATION DE CONTENU
   ======================================== */

function closeCreateMenu() {
    const modal = document.getElementById("create-modal");
    modal.classList.remove("active");
    setTimeout(() => {
        modal.style.display = "none";
    }, 300);
}

function getContentRecencyValue(item) {
    return (
        new Date(item?.created_at || item?.createdAt || 0).getTime() ||
        (item?.dayNumber ?? item?.day_number ?? 0)
    );
}

function getRecentContentsForFeedback(userId) {
    return [...(getUserContentLocal(userId) || [])].sort(
        (left, right) =>
            getContentRecencyValue(right) - getContentRecencyValue(left),
    );
}

function queueLatestPublishedPostHighlight(userId) {
    window.pendingLatestPublishedHighlightUserId = userId || null;
}

function maybeApplyLatestPublishedPostHighlight(userId) {
    if (window.pendingLatestPublishedHighlightUserId !== userId) return;
    if (window.currentProfileViewed !== userId) return;

    const profileContainer = document.querySelector(".profile-container");
    if (!profileContainer) return;

    const targetCard =
        profileContainer.querySelector(
            ".timeline-item-latest .timeline-card",
        ) ||
        profileContainer.querySelector(
            ".timeline-full .timeline-item .timeline-card",
        );

    if (!targetCard) return;

    window.pendingLatestPublishedHighlightUserId = null;
    targetCard.classList.remove("timeline-card-just-published");
    void targetCard.offsetWidth;
    targetCard.classList.add("timeline-card-just-published");
    targetCard.scrollIntoView({ behavior: "smooth", block: "center" });

    window.setTimeout(() => {
        targetCard.classList.remove("timeline-card-just-published");
    }, 2200);
}

async function focusLatestPublishedPost(userId) {
    if (!userId) return;
    queueLatestPublishedPostHighlight(userId);

    const isOwnProfileOpen =
        !!document.querySelector("#profile.active") &&
        window.currentProfileViewed === userId;

    if (isOwnProfileOpen) {
        maybeApplyLatestPublishedPostHighlight(userId);
        return;
    }

    await navigateToUserProfile(userId);
}

function buildPublishFeedbackPayload({
    userId,
    contentData,
    isEdit = false,
    arcTitle = "",
} = {}) {
    const recentContents = getRecentContentsForFeedback(userId);
    const streakDetails = getPostingStreakDetails(recentContents) || {
        streak: 1,
        total: recentContents.length,
    };
    const previousContent = recentContents[1] || null;
    const previousPublishedAt = previousContent
        ? new Date(
              previousContent.created_at || previousContent.createdAt || 0,
          ).getTime()
        : Number.NaN;
    const previousGapDays = Number.isFinite(previousPublishedAt)
        ? (Date.now() - previousPublishedAt) / (1000 * 60 * 60 * 24)
        : Number.POSITIVE_INFINITY;
    const totalPosts = Math.max(
        0,
        streakDetails.total || recentContents.length,
    );
    const safeArcTitle = String(arcTitle || "").trim();
    const isProfileOpen =
        !!document.querySelector("#profile.active") &&
        window.currentProfileViewed === userId;

    let eyebrow = isEdit ? "Mise a jour en ligne" : "C'est publie";
    let title = "";
    let message = "";

    if (isEdit) {
        title = "Tes changements sont deja visibles.";
        message = safeArcTitle
            ? `"${safeArcTitle}" a bien ete mis a jour.`
            : "Ta publication a ete mise a jour avec succes.";
    } else if (totalPosts <= 1) {
        eyebrow = "Nouveau depart";
        title = "Ton premier post est en ligne.";
        message = safeArcTitle
            ? `Tu viens de lancer "${safeArcTitle}" sur XERA.`
            : "Tu viens de publier ton premier contenu sur XERA.";
    } else if (previousGapDays >= 3) {
        eyebrow = "Bon retour";
        title = "Tu viens de relancer ton rythme.";
        message = safeArcTitle
            ? `"${safeArcTitle}" repart avec une nouvelle update.`
            : "Ta progression repart sur XERA.";
    } else if (streakDetails.streak >= 7) {
        eyebrow = "Serie en cours";
        title = `${streakDetails.streak} jours de suite.`;
        message = safeArcTitle
            ? `Tu gardes un vrai elan sur "${safeArcTitle}".`
            : "Tu maintiens une belle regularite.";
    } else if (streakDetails.streak >= 2) {
        eyebrow = "Bien joue";
        title = "+1 jour de constance.";
        message = safeArcTitle
            ? `Nouvelle avancee publiee pour "${safeArcTitle}".`
            : "Tu continues sur ta lancee.";
    } else {
        title = "Ta mise a jour est en ligne.";
        message = safeArcTitle
            ? `"${safeArcTitle}" a recu une nouvelle avancee.`
            : "Ton contenu est maintenant visible sur XERA.";
    }

    const chips = [];
    if (safeArcTitle) chips.push(safeArcTitle);
    if (!isEdit && streakDetails.streak > 1) {
        chips.push(`${streakDetails.streak} jours de suite`);
    }
    if (totalPosts > 0) {
        chips.push(`${totalPosts} post${totalPosts > 1 ? "s" : ""}`);
    }
    if (!isEdit && contentData?.type === "video") chips.push("video publiee");
    if (!isEdit && contentData?.type === "image") chips.push("media en ligne");

    return {
        eyebrow,
        title,
        message,
        chips: chips.slice(0, 3),
        primaryLabel: isProfileOpen ? "Voir ma publication" : "Voir mon profil",
        secondaryLabel: "Continuer",
        onPrimary: () => focusLatestPublishedPost(userId),
    };
}

function showPublishFeedbackCard(feedback) {
    if (!feedback) return;

    const existing = document.getElementById("publish-feedback-card");
    if (existing) existing.remove();

    const card = document.createElement("div");
    card.id = "publish-feedback-card";
    card.className = "publish-feedback-card";
    card.setAttribute("role", "status");
    card.setAttribute("aria-live", "polite");

    const chipsHtml = (feedback.chips || [])
        .map(
            (chip) =>
                `<span class="publish-feedback-chip">${escapeHtml(chip)}</span>`,
        )
        .join("");

    card.innerHTML = `
<div class="publish-feedback-glow" aria-hidden="true"></div>
<div class="publish-feedback-sparks" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
</div>
<button type="button" class="publish-feedback-close" aria-label="Fermer">✕</button>
<p class="publish-feedback-eyebrow">${escapeHtml(feedback.eyebrow || "Publication")}</p>
<h3 class="publish-feedback-title">${escapeHtml(feedback.title || "C'est en ligne")}</h3>
<p class="publish-feedback-message">${escapeHtml(feedback.message || "")}</p>
${chipsHtml ? `<div class="publish-feedback-chips">${chipsHtml}</div>` : ""}
<div class="publish-feedback-actions">
            <button type="button" class="publish-feedback-btn publish-feedback-btn-primary">
                ${escapeHtml(feedback.primaryLabel || "Voir")}
            </button>
            <button type="button" class="publish-feedback-btn publish-feedback-btn-secondary">
                ${escapeHtml(feedback.secondaryLabel || "Continuer")}
            </button>
</div>
    `;

    const removeCard = () => {
        card.classList.remove("is-visible");
        window.setTimeout(() => {
            if (card.parentNode) {
                card.parentNode.removeChild(card);
            }
        }, 240);
    };

    card.querySelector(".publish-feedback-close")?.addEventListener(
        "click",
        removeCard,
    );
    card.querySelector(".publish-feedback-btn-secondary")?.addEventListener(
        "click",
        removeCard,
    );
    card.querySelector(".publish-feedback-btn-primary")?.addEventListener(
        "click",
        async () => {
            removeCard();
            if (typeof feedback.onPrimary === "function") {
                await feedback.onPrimary();
            }
        },
    );

    document.body.appendChild(card);
    requestAnimationFrame(() => card.classList.add("is-visible"));

    if (
        typeof navigator !== "undefined" &&
        typeof navigator.vibrate === "function"
    ) {
        try {
            navigator.vibrate([18, 40, 18]);
        } catch (error) {
            // ignore
        }
    }

    window.setTimeout(removeCard, 7000);
}

const POST_PUBLISH_UPSELL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function trackPostPublishUpsell(eventName) {
    try {
        window.gtag?.("event", eventName, { event_category: "conversion" });
    } catch (error) {
        // Analytics is optional and must never affect publishing.
    }
}

function shouldShowPostPublishUpsell(user) {
    if (!user || hasActivePaidPlan(user)) return false;
    if (document.getElementById("post-publish-upsell")) return false;
    try {
        const lastShown = Number(
            localStorage.getItem("xera:post-publish-upsell:last-shown") || 0,
        );
        return (
            !lastShown ||
            Date.now() - lastShown >= POST_PUBLISH_UPSELL_COOLDOWN_MS
        );
    } catch (error) {
        return true;
    }
}

function showPostPublishUpsell(user) {
    if (!shouldShowPostPublishUpsell(user)) return false;
    try {
        localStorage.setItem(
            "xera:post-publish-upsell:last-shown",
            String(Date.now()),
        );
    } catch (error) {}

    // The success card is useful, but this is the one post-publication dialog: never stack both.
    document.getElementById("publish-feedback-card")?.remove();
    const avatar =
        user.avatar ||
        user.avatar_url ||
        user.avatarUrl ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.id || user.name || "xera")}`;
    const verified = isCurrentUserVerified() || Boolean(user.badge);
    const overlay = document.createElement("div");
    overlay.id = "post-publish-upsell";
    overlay.className = "post-publish-upsell";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "post-publish-upsell-title");
    overlay.innerHTML = `
        <section class="post-publish-upsell__dialog" tabindex="-1">
            <button type="button" class="post-publish-upsell__close" aria-label="Fermer la suggestion">✕</button>
            <div class="post-publish-upsell__avatar-wrap">
                <img class="post-publish-upsell__avatar" src="${escapeHtml(avatar)}" alt="Avatar de ${escapeHtml(user.name || "votre profil")}">
                ${verified ? '<span class="post-publish-upsell__badge" aria-label="Profil vérifié"><img src="icons/verify-personal.svg" alt=""></span>' : ""}
            </div>
            <p class="post-publish-upsell__eyebrow">C’est publié</p>
            <h2 id="post-publish-upsell-title">Maintenant, donne-lui plus de portée.</h2>
            <p>Ton contenu est en ligne. Les fonctionnalités avancées XERA1 t’aident à augmenter son potentiel de visibilité et à toucher une audience plus large.</p>
            <div class="post-publish-upsell__levels" aria-label="Niveaux de potentiel de visibilité">
                <span>Potentiel <strong>1,5×</strong></span><span>Potentiel <strong>2×</strong></span><span>Potentiel <strong>5×</strong></span>
            </div>
            <button type="button" class="post-publish-upsell__cta">Débloquer plus de portée</button>
        </section>`;
    const dialog = overlay.querySelector(".post-publish-upsell__dialog");
    const close = () => {
        trackPostPublishUpsell("post_publish_upsell_closed");
        overlay.classList.remove("is-visible");
        setTimeout(() => overlay.remove(), 180);
        document.removeEventListener("keydown", onKeydown);
    };
    const onKeydown = (event) => {
        if (event.key === "Escape") close();
    };
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
    });
    overlay
        .querySelector(".post-publish-upsell__close")
        .addEventListener("click", close);
    overlay
        .querySelector(".post-publish-upsell__cta")
        .addEventListener("click", () => {
            try {
                sessionStorage.setItem("xera:post-publish-upsell:clicked", "1");
            } catch (error) {}
            trackPostPublishUpsell("post_publish_upsell_clicked");
            const url =
                window.XeraRouter?.buildHtmlUrl?.("subscriptionPlans") ||
                "subscription-plans.html";
            window.location.href = url;
        });
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKeydown);
    requestAnimationFrame(() => {
        overlay.classList.add("is-visible");
        dialog.focus();
    });
    trackPostPublishUpsell("post_publish_upsell_shown");
    return true;
}

const PAGE_POST_UPSELL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

async function showProfessionalPagePostUpsell(pageId) {
    if (!pageId || document.getElementById("page-post-publish-upsell")) {
        return false;
    }

    let page;
    try {
        const { data, error } = await supabase
            .from("professional_pages")
            .select("id, name, slug, avatar_url")
            .eq("id", pageId)
            .single();
        if (error) throw error;
        page = data;
    } catch (error) {
        console.warn(
            "Impossible de charger la Page Pro pour la suggestion:",
            error,
        );
        return false;
    }

    if (!page || window.isVerifiedPageId?.(page.id)) return false;

    const storageKey = `xera:page-post-upsell:last-shown:${page.id}`;
    try {
        const lastShown = Number(localStorage.getItem(storageKey) || 0);
        if (
            lastShown &&
            Date.now() - lastShown < PAGE_POST_UPSELL_COOLDOWN_MS
        ) {
            return false;
        }
        localStorage.setItem(storageKey, String(Date.now()));
    } catch (error) {}

    document.getElementById("publish-feedback-card")?.remove();
    const avatar = page.avatar_url || "icons/enterprise.svg";
    const overlay = document.createElement("div");
    overlay.id = "page-post-publish-upsell";
    overlay.className = "post-publish-upsell page-post-publish-upsell";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "page-post-publish-upsell-title");
    overlay.innerHTML = `
        <section class="post-publish-upsell__dialog page-post-publish-upsell__dialog" tabindex="-1">
            <button type="button" class="post-publish-upsell__close" aria-label="Fermer">✕</button>
            <div class="post-publish-upsell__avatar-wrap">
                <img class="post-publish-upsell__avatar" src="${escapeHtml(avatar)}" alt="Logo de ${escapeHtml(page.name || "votre Page Pro")}">
                <span class="page-post-publish-upsell__status"><i class="fas fa-bolt"></i></span>
            </div>
            <p class="post-publish-upsell__eyebrow">Publication en ligne</p>
            <h2 id="page-post-publish-upsell-title">Donnez à ${escapeHtml(page.name || "votre Page Pro")} une portée supérieure.</h2>
            <p>Votre actualité est publiée. La vérification Page Pro peut lui offrir jusqu’à <strong>10 fois plus de visibilité</strong> dans Discover et les recommandations.</p>
            <div class="page-post-publish-upsell__proof"><i class="fas fa-chart-line"></i><span>Badge officiel, confiance renforcée et portée amplifiée.</span></div>
            <button type="button" class="post-publish-upsell__cta">Renforcer la visibilité</button>
        </section>`;

    const dialog = overlay.querySelector(".post-publish-upsell__dialog");
    const close = () => {
        overlay.classList.remove("is-visible");
        window.setTimeout(() => overlay.remove(), 180);
        document.removeEventListener("keydown", onKeydown);
    };
    const onKeydown = (event) => {
        if (event.key === "Escape") close();
    };
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
    });
    overlay
        .querySelector(".post-publish-upsell__close")
        .addEventListener("click", close);
    overlay
        .querySelector(".post-publish-upsell__cta")
        .addEventListener("click", () => {
            const destination = `subscription-plans.html?plan=page_verification&context=page-verification&page_id=${encodeURIComponent(page.id)}`;
            window.location.href = destination;
        });
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKeydown);
    requestAnimationFrame(() => {
        overlay.classList.add("is-visible");
        dialog.focus();
    });
    return true;
}

function trackPostPublishUpsellConversion(user) {
    if (!hasActivePaidPlan(user)) return;
    try {
        if (sessionStorage.getItem("xera:post-publish-upsell:clicked") !== "1")
            return;
        sessionStorage.removeItem("xera:post-publish-upsell:clicked");
        trackPostPublishUpsell("post_publish_upsell_conversion");
    } catch (error) {}
}

function showBackgroundPublishBanner({
    state = "loading",
    title = "",
    message = "",
    autoHideMs = 0,
} = {}) {
    let banner = document.getElementById("background-publish-banner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "background-publish-banner";
        banner.className = "background-publish-banner";
        banner.setAttribute("role", "status");
        banner.setAttribute("aria-live", "polite");
        banner.innerHTML = `
            <div class="background-publish-banner__inner">
                <div class="background-publish-banner__icon" aria-hidden="true"></div>
                <div class="background-publish-banner__content">
                    <strong class="background-publish-banner__title"></strong>
                    <span class="background-publish-banner__message"></span>
                </div>
                <button type="button" class="background-publish-banner__close" aria-label="Fermer">✕</button>
            </div>
`;
        banner
            .querySelector(".background-publish-banner__close")
            ?.addEventListener("click", () => hideBackgroundPublishBanner());
        document.body.appendChild(banner);
    }

    banner.dataset.state = state;
    banner.querySelector(".background-publish-banner__title").textContent =
        title || "Publication";
    banner.querySelector(".background-publish-banner__message").textContent =
        message || "";

    if (window.backgroundPublishBannerTimer) {
        window.clearTimeout(window.backgroundPublishBannerTimer);
        window.backgroundPublishBannerTimer = null;
    }

    requestAnimationFrame(() => banner.classList.add("is-visible"));

    if (autoHideMs > 0) {
        window.backgroundPublishBannerTimer = window.setTimeout(() => {
            hideBackgroundPublishBanner();
        }, autoHideMs);
    }

    return banner;
}

function hideBackgroundPublishBanner() {
    const banner = document.getElementById("background-publish-banner");
    if (!banner) return;
    banner.classList.remove("is-visible");
    if (window.backgroundPublishBannerTimer) {
        window.clearTimeout(window.backgroundPublishBannerTimer);
        window.backgroundPublishBannerTimer = null;
    }
}

// Remove floating 'Feedback' tab/buttons added by site or third-party scripts.
// This will attempt to remove common selectors and any small fixed-position
// element whose text content is exactly 'Feedback' (case-insensitive).
(function () {
    function removeFloatingFeedbackTabs() {
        try {
            const selectors = [
                "#feedback",
                ".feedback",
                ".feedback-tab",
                ".feedback-button",
                ".feedback-toggle",
                "[data-feedback]",
                ".feedback-cta",
                "#feedback-tab",
                ".feedback-panel",
                ".feedback-stub",
                ".feedback-bar",
            ];

            selectors.forEach((sel) => {
                try {
                    document.querySelectorAll(sel).forEach((el) => {
                        if (el && el.parentNode) el.parentNode.removeChild(el);
                    });
                } catch (e) {}
            });

            // Remove elements that render the literal word "Feedback" and are fixed/small
            const nodes = document.querySelectorAll("body *");
            for (const node of nodes) {
                try {
                    const txt = String(node.textContent || "").trim();
                    if (!txt) continue;
                    if (!/^feedback$/i.test(txt)) continue;
                    const st = window.getComputedStyle(node);
                    if (
                        st.position === "fixed" ||
                        st.position === "absolute" ||
                        st.position === "sticky"
                    ) {
                        const r = node.getBoundingClientRect();
                        if (
                            (r.width > 0 && r.width <= 180 && r.height >= 20) ||
                            r.height > r.width
                        ) {
                            node.remove();
                        }
                    }
                } catch (e) {
                    // ignore per-node errors
                }
            }
        } catch (e) {
            // ignore
        }
    }

    try {
        // initial cleanup
        removeFloatingFeedbackTabs();
        // observe DOM for dynamically inserted feedback controls
        const observer = new MutationObserver(() =>
            removeFloatingFeedbackTabs(),
        );
        observer.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true,
        });
        // expose for debugging if needed
        window._removeFloatingFeedbackTabs = removeFloatingFeedbackTabs;
    } catch (e) {}
})();

async function openCreateMenu(
    userId,
    preSelectedArcId = null,
    existingContent = null,
    pageId = null,
) {
    const finalPageId = pageId || window._pendingPageId || null;
    // Vérifications rapides avant d'afficher le modal
    if (!currentUser || currentUser.id !== userId) return;
    const profile = getCurrentUserProfile();
    if (isUserBanned(profile)) {
        const remaining = getBanRemainingLabel(profile);
        const reason = profile?.banned_reason
            ? `Raison: ${profile.banned_reason}`
            : "";
        alert(
            `Votre compte est temporairement banni. ${remaining ? `Fin dans ${remaining}.` : ""} ${reason}`.trim(),
        );
        return;
    }

    // Afficher le modal IMMÉDIATEMENT avec un contenu vide
    const modal = document.getElementById("create-modal");
    const container = modal.querySelector(".create-container");

    // Loading state: affiche un message simple rapidement
    container.innerHTML = `
<div class="settings-section" style="text-align: center; padding: 2rem;">
            <button type="button" class="create-close" onclick="closeCreateMenu()">✕</button>
            <div style="margin-top: 2rem;">
                <div style="display: inline-block; width: 32px; height: 32px; border: 3px solid var(--border-color); border-top-color: var(--accent-color); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <p style="margin-top: 1rem; color: var(--text-secondary);">Chargement du formulaire...</p>
            </div>
</div>
    `;

    modal.style.display = "block";
    modal.offsetHeight; // Force reflow
    modal.classList.add("active");

    // Charger les ARCs en arrière-plan avec timeout augmenté à 10s
    let arcs = [];
    try {
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 10000),
        );
        const arcPromise = (async () => {
            const { data: ownedArcs } = await supabase
                .from("arcs")
                .select("id, title, user_id, page_id")
                .eq("user_id", userId)
                .eq("status", "in_progress");
            let collabArcs = [];
            try {
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
                    const { data: collabData } = await supabase
                        .from("arcs")
                        .select("id, title, user_id, page_id")
                        .in("id", collabArcIds)
                        .eq("status", "in_progress");
                    collabArcs = collabData || [];
                }
            } catch (e) {
                console.error(
                    "Error fetching collaborative arcs for create menu",
                    e,
                );
            }

            const arcMap = new Map();
            (ownedArcs || []).forEach((arc) =>
                arcMap.set(arc.id, { ...arc, _collabRole: "owner" }),
            );
            (collabArcs || []).forEach((arc) => {
                if (!arcMap.has(arc.id))
                    arcMap.set(arc.id, {
                        ...arc,
                        _collabRole: "collaborator",
                    });
            });
            return Array.from(arcMap.values());
        })();

        arcs = await Promise.race([arcPromise, timeoutPromise]);
    } catch (e) {
        console.error("Error fetching arcs for create menu:", e);
        arcs = [];
    }

    // BLOCKAGE: Si l'utilisateur n'a pas d'ARC en cours, le forcer à en créer un
    if (arcs.length === 0 && !existingContent) {
        if (
            confirm(
                "Vous devez créer un projet avant de pouvoir poster une mise à jour. Voulez-vous créer votre premier projet maintenant ?",
            )
        ) {
            setPendingCreatePostAfterArc(userId, {
                reason: "arc-required",
            });
            closeCreateMenu();
            if (window.openCreateModal) {
                window.openCreateModal();
            } else {
                alert(
                    "Erreur: Impossible d'ouvrir la fenêtre de création de projet.",
                );
            }
        }
        return;
    }

    // Calculate next day ou utiliser jour existant si édition
    const contents = getUserContentLocal(userId);
    const getNumericDay = (item) =>
        Number.parseInt(item?.dayNumber ?? item?.day_number, 10);
    const dayNumbers = (contents || [])
        .map(getNumericDay)
        .filter((day) => Number.isFinite(day) && day >= 0);
    const maxDay = dayNumbers.length > 0 ? Math.max(...dayNumbers) : 0;
    const existingDay = existingContent
        ? getNumericDay(existingContent)
        : Number.NaN;
    const nextDay =
        Number.isFinite(existingDay) && existingDay >= 0
            ? existingDay
            : maxDay + 1;
    const isFirstPost =
        !existingContent && (!contents || contents.length === 0);
    const defaultTraceType = isFirstPost ? "text" : "image";
    const isEdit = !!existingContent;
    const existingRawDesc =
        (existingContent &&
            (existingContent.rawDescription || existingContent.description)) ||
        "";
    const { tags: existingTags, cleanDescription: existingCleanDesc } =
        extractTagsFromDescription(existingRawDesc);
    const isAnnouncementEdit =
        existingTags && existingTags.includes("annonce") ? true : false;
    let currentMode = isAnnouncementEdit ? "announcement" : "update";

    const smartDefaults = isEdit
        ? null
        : buildSmartCreateDefaults({
              userId,
              arcs,
              contents,
              preSelectedArcId,
              defaultType: defaultTraceType,
              nextDay,
          });
    const selectedArcId =
        (existingContent &&
            (existingContent.arcId || existingContent.arc_id || null)) ||
        preSelectedArcId ||
        smartDefaults?.preferredArcId ||
        null;
    const selectedArc = findArcInList(arcs, selectedArcId);
    const initialType = isEdit
        ? existingContent.type
        : smartDefaults?.preferredType || defaultTraceType;
    const initialState = isEdit
        ? existingContent.state
        : smartDefaults?.preferredState || "success";
    const initialTagSuggestions = isEdit
        ? []
        : smartDefaults?.tagSuggestions || [];
    const initialTitleSuggestions = isEdit
        ? []
        : smartDefaults?.titleSuggestions || [];
    const tagsPrefill = isEdit
        ? existingTags.map((t) => `#${t}`).join(" ")
        : "";

    // Generate ARC Options (Mandatory)
    let arcOptions = "";
    // Si on édite une mise à jour existante qui n'a pas d'arc (legacy), on laisse l'option vide ou on force ?
    // Le user veut "chaque mise à jour publiée doit faire partie d'un arc".
    // On va forcer la sélection.

    arcOptions = arcs
        .map((a) => {
            const selected =
                selectedArcId && a.id === selectedArcId ? "selected" : "";
            const label =
                a._collabRole === "collaborator"
                    ? `${a.title} · collaboration`
                    : a.title;
            return `<option value="${a.id}" ${selected}>${label}</option>`;
        })
        .join("");

    const title = isEdit ? "Modifier l'Update" : "Nouvelle Update";
    const subtitle = isEdit
        ? `Modifier la mise à jour du jour ${nextDay}`
        : `Update = mise à jour rapide (texte + photo optionnelle). Annonce = étape majeure partagée publiquement.`;

    // Remove old form element to detach previous event listeners - check it's in the modal
    const oldForm = modal.querySelector("#create-form");
    if (oldForm) {
        const newForm = oldForm.cloneNode(false);
        oldForm.parentNode.replaceChild(newForm, oldForm);
    }

    container.innerHTML = `
<div class="settings-section create-card-panel">
            <button type="button" class="create-close" onclick="closeCreateMenu()">✕</button>
            <div class="settings-header settings-header-inline">
                <div>
                    <h2>${title}</h2>
                    <p>${subtitle}</p>
                </div>
                <div class="create-top-actions">
                    <span class="mini-badge">${isEdit ? "Édition" : "Nouvelle trace"}</span>
                    <button type="button" class="cover-action" onclick="document.getElementById('create-media-file').click()">Ajouter un média</button>
                </div>
            </div>

            <form id="create-form" class="create-form-grid">
                ${isEdit ? `<input type="hidden" id="content-id" value="${existingContent.contentId || existingContent.id}">` : ""}
                <div class="form-group">
                    <label>Mode de publication</label>
                    <div class="mode-switch">
                        <button type="button" class="${isAnnouncementEdit ? "" : "active"}" data-mode="update">Mise à jour</button>
                        <button type="button" class="${isAnnouncementEdit ? "active" : ""}" data-mode="announcement">Annonce</button>
                    </div>
                    <p class="form-hint">Trace : mise à jour rapide (texte + photo optionnelle). Annonce : étape majeure partagée publiquement.</p>
                </div>
                
                <div class="form-group form-group-day">
                    <label>Jour #</label>
                    <input type="number" id="create-day" class="form-input" value="${nextDay}" required>
                </div>

                <div class="form-group form-group-title">
                    <label>Titre de l'accomplissement</label>
                    <input type="text" id="create-title" class="form-input" placeholder="${escapeHtml(initialTitleSuggestions[0] || "Ex: Intégration de l'API terminée")}" value="${isEdit ? existingContent.title : ""}" required>
                </div>

                <div class="create-smart-panel">
                    <div class="create-smart-summary" id="create-smart-summary">
                        ${isEdit ? "Edition complete active." : escapeHtml(selectedArc ? `Projet preselectionne: ${selectedArc.title}` : "Choisissez un projet pour declencher les suggestions rapides.")}
                    </div>
                    <div class="create-smart-row" id="create-title-suggestions-row">
                        <span class="create-smart-label">Titres rapides</span>
                        <div class="create-chip-list" id="create-title-suggestions"></div>
                    </div>
                    <div class="create-smart-row" id="create-tag-suggestions-row">
                        <span class="create-smart-label">Tags suggérés</span>
                        <div class="create-chip-list" id="create-tag-suggestions"></div>
                    </div>
                </div>

                <div class="form-group form-group-desc">
                    <label>Description</label>
                    <textarea id="create-desc" class="form-input" rows="4" placeholder="Détaillez ce que vous avez fait, appris ou surmonté...">${isEdit ? existingCleanDesc : ""}</textarea>
                </div>

                <div class="form-group form-group-tags">
                    <label>Hashtags (séparés par espaces ou virgules)</label>
                    <input type="text" id="create-tags" class="form-input" placeholder="#build #vlog #code" value="${tagsPrefill}">
                    <p class="form-hint">Les tags proposés sont optionnels. L'utilisateur peut saisir les hashtags qu'il veut.</p>
                </div>

                <div class="form-group form-group-state">
                    <label>État</label>
                    <select id="create-state" class="form-input">
                        <option value="success" ${initialState === "success" ? "selected" : ""}>Victoire (Vert)</option>
                        <option value="failure" ${initialState === "failure" ? "selected" : ""}>Bloqué / Échec (Rouge)</option>
                        <option value="pause" ${initialState === "pause" ? "selected" : ""}>Pause / Réflexion (Violet)</option>
                    </select>
                </div>

                <div class="form-group form-group-arc">
                    <label>Projet (Requis)</label>
                    <select id="create-arc" class="form-input" required>
                        <option value="" disabled ${!selectedArcId ? "selected" : ""}>Choisir un projet...</option>
                        ${arcOptions}
                    </select>
                </div>

                <div class="form-group">
                    <label>Type de publication</label>
                    <select id="create-type" class="form-input">
                        <option value="text" ${initialType === "text" ? "selected" : ""}>Texte</option>
                        <option value="image" ${initialType === "image" ? "selected" : ""}>Image</option>
                        <option value="video" ${initialType === "video" ? "selected" : ""}>Vidéo</option>
                        <option value="live" ${initialType === "live" ? "selected" : ""}>Live / Stream</option>
                    </select>
                    <div class="type-quick">
                        <button type="button" data-type="text">Texte</button>
                        <button type="button" data-type="image">Image</button>
                        <button type="button" data-type="video">Vidéo</button>
                        <button type="button" data-type="live">Live</button>
                    </div>
                </div>

                <div class="form-group media-upload-group">
                    <label>Média</label>
                    <div id="media-upload-container" class="media-upload-card">
	                        <div class="upload-zone" id="create-media-dropzone" style="border: 2px dashed var(--border-color); padding: 2rem; border-radius: 12px; text-align: center; cursor: pointer; transition: all 0.3s ease; background: rgba(255,255,255,0.02);">
	                            <div id="create-media-preview-container" style="display: none; margin-bottom: 1rem;">
	                                <!-- Preview will be inserted here -->
	                            </div>
	                            <div id="create-media-loader" style="display: none; margin-bottom: 1rem;">
	                                <div style="display: inline-block; width: 24px; height: 24px; border: 2px solid var(--accent-color); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
	                                <p style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">Upload en cours...</p>
	                                <div class="xera-upload-progress">
	                                    <div id="create-media-progress-bar" class="xera-upload-progress-bar is-indeterminate"></div>
	                                </div>
	                                <div id="create-media-progress-label" class="xera-upload-progress-label"></div>
	                            </div>
	                            <div id="create-media-placeholder">
	                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--text-secondary); margin-bottom: 0.5rem;">
	                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
	                                    <polyline points="17 8 12 3 7 8"></polyline>
                                    <line x1="12" y1="3" x2="12" y2="15"></line>
                                </svg>
                                <p style="color: var(--text-secondary); font-size: 0.9rem;">Cliquez ou glissez un fichier ici</p>
                                <p style="color: var(--text-secondary); font-size: 0.75rem; opacity: 0.7;">Images + vidéos (max 60 min)</p>
                            </div>
                        </div>
                        <input type="file" id="create-media-file" accept="image/*,video/*" style="display: none;">
                        <p class="form-hint" id="create-video-duration-hint"></p>
                    </div>

                    <!-- URL Input for Live -->
                    <div id="media-url-container" style="display: none;">
                        <input type="text" id="create-live-url" class="form-input" placeholder="Lien du Live (ex: Twitch, YouTube...)" style="margin-bottom: 0.5rem;">
                        <p class="form-hint">Le lien sera affiché comme une mise à jour active.</p>
                    </div>

                    <input type="hidden" id="create-media-url" value="${isEdit && (existingContent.media_url || existingContent.mediaUrl) ? existingContent.media_url || existingContent.mediaUrl : ""}">
                    <input type="hidden" id="create-media-urls" value="">
                    <input type="hidden" id="create-media-type" value="${initialType}">
                </div>

                <div class="actions-bar">
                    <button type="button" class="btn-cancel" onclick="closeCreateMenu()">Annuler</button>
                    <button type="submit" class="btn-save">${isEdit ? "Mettre à jour" : "Publier la mise à jour"}</button>
                </div>
            </form>
</div>
    `;

    // Ensure modal is visible
    modal.style.display = "block";
    modal.offsetHeight; // Force reflow
    modal.classList.add("active");

    // Select elements globally for this function scope
    const previewContainer = document.getElementById(
        "create-media-preview-container",
    );
    const placeholder = document.getElementById("create-media-placeholder");
    const uploadContainer = document.getElementById("media-upload-container");
    const urlContainer = document.getElementById("media-url-container");
    const liveInput = document.getElementById("create-live-url");
    const fileInput = document.getElementById("create-media-file");
    const mediaUrlInput = document.getElementById("create-media-url");
    const mediaUrlsInput = document.getElementById("create-media-urls");
    const mediaTypeInput = document.getElementById("create-media-type");
    const typeSelect = document.getElementById("create-type");
    const titleInput = document.getElementById("create-title");
    const tagsInput = document.getElementById("create-tags");
    const descInput = document.getElementById("create-desc");

    // Autocomplétion des mentions (@)
    if (descInput) attachMentionAutocomplete(descInput);

    const dayInput = document.getElementById("create-day");
    const stateSelect = document.getElementById("create-state");
    const arcSelect = document.getElementById("create-arc");
    const smartSummary = document.getElementById("create-smart-summary");
    const titleSuggestionsRow = document.getElementById(
        "create-title-suggestions-row",
    );
    const titleSuggestionsContainer = document.getElementById(
        "create-title-suggestions",
    );
    const tagSuggestionsRow = document.getElementById(
        "create-tag-suggestions-row",
    );
    const tagSuggestionsContainer = document.getElementById(
        "create-tag-suggestions",
    );
    const videoDurationHint = document.getElementById(
        "create-video-duration-hint",
    );
    const dayGroup = container.querySelector(".form-group-day");
    const stateGroup = container.querySelector(".form-group-state");
    const arcGroup = container.querySelector(".form-group-arc");
    const descGroup = container.querySelector(".form-group-desc");
    const tagsGroup = container.querySelector(".form-group-tags");
    const dropZone = document.getElementById("create-media-dropzone");
    const loader = document.getElementById("create-media-loader");
    const progressBar = document.getElementById("create-media-progress-bar");
    const progressLabel = document.getElementById(
        "create-media-progress-label",
    );
    const typeButtons = Array.from(
        container.querySelectorAll(".type-quick button"),
    );
    const modeButtons = Array.from(
        container.querySelectorAll(".mode-switch button"),
    );
    const typeOptions = Array.from(typeSelect?.options || []).filter(
        (option) => !!option.value,
    );
    let isMediaUploadInProgress = false;
    let mediaUploadUiArmed = false;
    let latestSelectedFileName = "";
    let currentTitleSuggestions = initialTitleSuggestions.slice();
    let currentTagSuggestions = initialTagSuggestions.slice();
    const createFlowStartedAt = Date.now();

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

    const buildMediaPreviewShell = (innerHtml) => `
<div class="media-preview-shell">
            <button type="button" class="media-remove-btn" title="Retirer le media">X</button>
            ${innerHtml}
</div>
    `;

    const updateMultiPreview = (urls = []) => {
        const clean = (urls || []).filter(Boolean);
        if (clean.length === 0) {
            previewContainer.style.display = "none";
            return;
        }
        const slides = clean
            .map(
                (u) =>
                    `<div class="xera-carousel-slide"><img src="${u}" alt="Media" loading="lazy" decoding="async"></div>`,
            )
            .join("");
        const dots =
            clean.length > 1
                ? `<div class="xera-carousel-dots">${clean
                      .map(
                          (_, i) =>
                              `<span class="xera-dot ${i === 0 ? "active" : ""}" data-index="${i}"></span>`,
                      )
                      .join("")}</div>`
                : "";
        previewContainer.innerHTML = buildMediaPreviewShell(`
            <div class="xera-carousel" data-carousel>
                <div class="xera-carousel-track">${slides}</div>
                ${dots}
            </div>
`);
    };

    const setGroupVisible = (group, visible) => {
        if (!group) return;
        group.style.display = visible ? "" : "none";
    };

    const syncTypeButtons = (value) => {
        typeButtons.forEach((btn) =>
            btn.classList.toggle("active", btn.dataset.type === value),
        );
    };

    const syncModeButtons = (value) => {
        modeButtons.forEach((btn) =>
            btn.classList.toggle("active", btn.dataset.mode === value),
        );
    };

    const getAllowedTypesForCurrentMode = () => {
        if (currentMode === "announcement") {
            return ["text", "image", "video"];
        }

        const updateTypes = ["image", "video", "live"];
        if (
            isEdit &&
            existingContent &&
            existingContent.type === "text" &&
            !isAnnouncementEdit
        ) {
            return ["text", ...updateTypes];
        }
        return updateTypes;
    };

    const syncTypeAvailability = () => {
        const allowedTypes = getAllowedTypesForCurrentMode();
        const allowedSet = new Set(allowedTypes);

        typeOptions.forEach((option) => {
            const allowed = allowedSet.has(option.value);
            option.disabled = !allowed;
            option.hidden = !allowed;
        });

        typeButtons.forEach((btn) => {
            const allowed = allowedSet.has(btn.dataset.type);
            btn.disabled = !allowed;
            btn.hidden = !allowed;
        });

        if (!allowedSet.has(typeSelect.value)) {
            typeSelect.value = allowedTypes[0] || "image";
        }
    };

    const markSmartValue = (input, value, { manual = false } = {}) => {
        if (!input) return;
        input.dataset.autoApplying = "1";
        input.value = value || "";
        input.dataset.autoApplying = "0";
        input.dataset.autofilled =
            !manual && String(value || "").trim() ? "1" : "0";
        input.dataset.manuallyEdited = manual ? "1" : "0";
    };

    const canAutofillField = (input) =>
        !!input &&
        input.dataset.manuallyEdited !== "1" &&
        (!String(input.value || "").trim() || input.dataset.autofilled === "1");

    titleInput.dataset.manuallyEdited =
        isEdit && titleInput.value.trim() ? "1" : "0";
    titleInput.dataset.autofilled = "0";
    tagsInput.dataset.manuallyEdited =
        isEdit && tagsInput.value.trim() ? "1" : "0";
    if (!isEdit && tagsInput.value.trim()) {
        tagsInput.dataset.autofilled = "1";
    }

    [titleInput, tagsInput].forEach((input) => {
        if (!input) return;
        input.addEventListener("input", () => {
            if (input.dataset.autoApplying === "1") return;
            input.dataset.manuallyEdited = "1";
            input.dataset.autofilled = "0";
        });
    });

    const renderTitleSuggestions = () => {
        if (!titleSuggestionsContainer || !titleSuggestionsRow) return;
        if (currentTitleSuggestions.length === 0) {
            titleSuggestionsRow.style.display = "none";
            titleSuggestionsContainer.innerHTML = "";
            return;
        }
        titleSuggestionsRow.style.display = "";
        titleSuggestionsContainer.innerHTML = currentTitleSuggestions
            .map(
                (suggestion) =>
                    `<button type="button" class="create-chip" data-create-title="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</button>`,
            )
            .join("");
    };

    const renderTagSuggestions = () => {
        if (!tagSuggestionsContainer || !tagSuggestionsRow) return;
        if (
            currentMode === "announcement" ||
            currentTagSuggestions.length === 0
        ) {
            tagSuggestionsRow.style.display = "none";
            tagSuggestionsContainer.innerHTML = "";
            return;
        }
        const activeTags = new Set(parseTagsInput(tagsInput.value));
        tagSuggestionsRow.style.display = "";
        tagSuggestionsContainer.innerHTML = currentTagSuggestions
            .map((tag) => {
                const isActive = activeTags.has(tag);
                return `<button type="button" class="create-chip ${isActive ? "active" : ""}" data-create-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`;
            })
            .join("");
    };

    const updateSmartSummary = () => {
        if (!smartSummary) return;
        const parts = [];
        const activeArc = findArcInList(arcs, arcSelect?.value);
        if (currentMode !== "announcement" && activeArc) {
            parts.push(`Projet: ${activeArc.title}`);
        }
        const tagsCount = parseTagsInput(tagsInput?.value || "").length;
        if (tagsCount > 0) {
            parts.push(
                `${tagsCount} tag${tagsCount > 1 ? "s" : ""} pret${tagsCount > 1 ? "s" : ""}`,
            );
        }
        if (latestSelectedFileName) {
            parts.push("media pret");
        }
        smartSummary.textContent =
            parts.join(" • ") ||
            "Choisissez un projet pour declencher les suggestions rapides.";
    };

    const refreshSmartSuggestions = ({
        fileName = latestSelectedFileName,
    } = {}) => {
        latestSelectedFileName = fileName || "";
        const activeArc = findArcInList(arcs, arcSelect?.value);
        const suggestionType =
            currentMode === "announcement"
                ? "text"
                : mediaTypeInput?.value || typeSelect?.value || initialType;
        currentTitleSuggestions = isEdit
            ? []
            : buildTitleSuggestions({
                  selectedArc: activeArc,
                  type: suggestionType,
                  dayNumber: Number.parseInt(dayInput?.value, 10),
                  fileName: latestSelectedFileName,
              });
        currentTagSuggestions = isEdit
            ? []
            : collectSuggestedTags(
                  contents.filter((content) => !isAnnouncementContent(content)),
                  activeArc,
                  XERA_CREATE_TAG_LIMIT,
              );

        if (!isEdit && currentMode !== "announcement") {
            if (
                currentTitleSuggestions[0] &&
                latestSelectedFileName &&
                canAutofillField(titleInput)
            ) {
                markSmartValue(titleInput, currentTitleSuggestions[0]);
            }
        }

        if (
            titleInput &&
            !titleInput.value &&
            Array.isArray(currentTitleSuggestions) &&
            currentTitleSuggestions[0]
        ) {
            titleInput.placeholder = currentTitleSuggestions[0];
        }

        renderTitleSuggestions();
        renderTagSuggestions();
        updateSmartSummary();
    };

    const syncFormSectionsVisibility = () => {
        if (currentMode === "announcement") {
            setGroupVisible(dayGroup, false);
            setGroupVisible(stateGroup, false);
            setGroupVisible(arcGroup, false);
            setGroupVisible(tagsGroup, true);
            setGroupVisible(descGroup, true);
            if (dayInput) dayInput.required = false;
            if (stateSelect) stateSelect.required = false;
            if (arcSelect) arcSelect.required = false;
            if (descInput) descInput.required = false;
            return;
        }

        setGroupVisible(dayGroup, true);
        setGroupVisible(stateGroup, true);
        setGroupVisible(tagsGroup, true);
        setGroupVisible(descGroup, true);
        setGroupVisible(arcGroup, true);
        if (dayInput) dayInput.required = true;
        if (stateSelect) stateSelect.required = true;
        if (arcSelect) arcSelect.required = true;
        if (descInput) descInput.required = false;
    };

    const applyMode = (mode) => {
        currentMode = mode === "announcement" ? "announcement" : "update";
        syncModeButtons(currentMode);
        syncTypeAvailability();
        syncFormSectionsVisibility();
        typeSelect.dispatchEvent(new Event("change"));
        refreshSmartSuggestions();
    };

    const clearMediaSelection = () => {
        mediaUrlInput.value = "";
        mediaUrlsInput.value = "";
        mediaTypeInput.value =
            currentMode === "announcement" ? "text" : typeSelect.value;
        latestSelectedFileName = "";
        window.__xeraLatestMediaC2PA = null;
        if (fileInput) fileInput.value = "";
        if (videoDurationHint) videoDurationHint.textContent = "";
        previewContainer.innerHTML = "";
        previewContainer.style.display = "none";
        placeholder.style.display = "block";
        refreshSmartSuggestions();
    };

    if (previewContainer && !previewContainer.dataset.clearHandler) {
        previewContainer.addEventListener("click", (e) => {
            const btn = e.target.closest(".media-remove-btn");
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            clearMediaSelection();
        });
        previewContainer.dataset.clearHandler = "true";
    }

    modeButtons.forEach((btn) =>
        btn.addEventListener("click", () => applyMode(btn.dataset.mode)),
    );

    typeSelect.addEventListener("change", () => {
        const type = typeSelect.value;
        mediaTypeInput.value = type;
        syncTypeButtons(type);

        if (type === "live") {
            uploadContainer.style.display = "none";
            urlContainer.style.display = "block";
            mediaUrlInput.value = liveInput.value;
        } else if (type === "text") {
            uploadContainer.style.display = "block";
            urlContainer.style.display = "none";
            fileInput.accept = "image/*";
            fileInput.multiple = currentMode === "announcement";
            mediaTypeInput.value = "text";
            if (placeholder) placeholder.style.display = "block";
        } else {
            uploadContainer.style.display = "block";
            urlContainer.style.display = "none";
            if (type === "image") {
                fileInput.accept = "image/*";
                fileInput.multiple = true;
            } else if (type === "video") {
                fileInput.accept = "video/*";
                fileInput.multiple = false;
            }
        }

        if (!isEdit && currentMode !== "announcement") {
            updateCreatePrefs(userId, { lastType: type });
        }
        refreshSmartSuggestions();
    });

    typeButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const targetType = btn.dataset.type;
            typeSelect.value = targetType;
            typeSelect.dispatchEvent(new Event("change"));
        });
    });

    arcSelect?.addEventListener("change", () => {
        if (!isEdit) {
            updateCreatePrefs(userId, {
                lastArcId: arcSelect.value || null,
            });
        }
        refreshSmartSuggestions();
    });
    dayInput?.addEventListener("input", () => refreshSmartSuggestions());
    tagsInput?.addEventListener("input", () => {
        renderTagSuggestions();
        updateSmartSummary();
    });
    stateSelect?.addEventListener("change", () => {
        if (!isEdit) {
            updateCreatePrefs(userId, { lastState: stateSelect.value });
        }
    });

    titleSuggestionsContainer?.addEventListener("click", (e) => {
        const button = e.target.closest("[data-create-title]");
        if (!button) return;
        const nextTitle = button.getAttribute("data-create-title") || "";
        markSmartValue(titleInput, nextTitle, { manual: true });
        updateSmartSummary();
    });

    tagSuggestionsContainer?.addEventListener("click", (e) => {
        const button = e.target.closest("[data-create-tag]");
        if (!button) return;
        const tag = normalizeTag(button.getAttribute("data-create-tag") || "");
        const nextTags = new Set(parseTagsInput(tagsInput.value));
        if (nextTags.has(tag)) nextTags.delete(tag);
        else nextTags.add(tag);
        markSmartValue(
            tagsInput,
            Array.from(nextTags)
                .slice(0, 8)
                .map((item) => `#${item}`)
                .join(" "),
            { manual: true },
        );
        renderTagSuggestions();
        updateSmartSummary();
    });

    // initial sync
    syncTypeAvailability();
    syncTypeButtons(typeSelect.value);
    syncModeButtons(currentMode);
    applyMode(currentMode);

    if (fileInput && fileInput.dataset.durationHintBound !== "1") {
        fileInput.dataset.durationHintBound = "1";
        fileInput.addEventListener("change", async () => {
            if (!videoDurationHint) return;
            videoDurationHint.textContent = "";
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            const isVideoSelection =
                (typeof isLikelyVideoFile === "function" &&
                    isLikelyVideoFile(file)) ||
                String(file.type || "").startsWith("video/");
            if (!isVideoSelection) return;
            if (typeof readVideoDurationSeconds !== "function") return;

            try {
                const seconds = await readVideoDurationSeconds(file);
                const mins = Math.floor(seconds / 60);
                const secs = Math.round(seconds % 60)
                    .toString()
                    .padStart(2, "0");
                if (seconds > 60 * 60) {
                    videoDurationHint.style.color = "#ef4444";
                    videoDurationHint.textContent = `Durée détectée: ${mins}:${secs} (max 60:00)`;
                } else {
                    videoDurationHint.style.color = "#10b981";
                    videoDurationHint.textContent = `Durée détectée: ${mins}:${secs}`;
                }
            } catch (e) {
                videoDurationHint.style.color = "var(--text-secondary)";
                videoDurationHint.textContent =
                    "Impossible de lire la durée de cette vidéo.";
            }
        });
    }

    liveInput.addEventListener("input", () => {
        if (typeSelect.value === "live") {
            mediaUrlInput.value = liveInput.value;
        }
    });

    dropZone.addEventListener("click", (e) => {
        if (e.target.tagName !== "IMG" && e.target.tagName !== "VIDEO") {
            fileInput.click();
        }
    });

    if (!document.getElementById("spin-style")) {
        const style = document.createElement("style");
        style.id = "spin-style";
        style.innerHTML =
            "@keyframes spin { to { transform: rotate(360deg); } }";
        document.head.appendChild(style);
    }

    fileInput.addEventListener("change", () => {
        const files = Array.from(fileInput.files || []);
        if (files.length === 0) return;
        const firstFile = files[0];
        latestSelectedFileName = firstFile?.name || "";
        const inferredType = isLikelyVideoFile(firstFile)
            ? "video"
            : isAllowedImageFile(firstFile)
              ? "image"
              : null;
        const allowedTypes = new Set(getAllowedTypesForCurrentMode());
        if (inferredType && allowedTypes.has(inferredType)) {
            typeSelect.value = inferredType;
            typeSelect.dispatchEvent(new Event("change"));
        }
        isMediaUploadInProgress = true;
        mediaUploadUiArmed = true;
        placeholder.style.display = "none";
        previewContainer.style.display = "none";
        loader.style.display = "block";
        setUploadProgress(0);
        refreshSmartSuggestions({ fileName: latestSelectedFileName });
    });

    refreshSmartSuggestions();

    // Initialize file upload
    if (typeof initializeFileInput === "function") {
        initializeFileInput("create-media-file", {
            dropZone,
            compress: true,
            multiple: () => !!fileInput.multiple,
            parallelUploads: 2,
            onBeforeUpload: () => {
                isMediaUploadInProgress = true;
                if (!mediaUploadUiArmed) {
                    mediaUploadUiArmed = true;
                    placeholder.style.display = "none";
                    previewContainer.style.display = "none";
                    loader.style.display = "block";
                    setUploadProgress(0);
                }
            },
            onProgress: (percent) => setUploadProgress(percent),
            onUpload: (result) => {
                if (!result?.success) {
                    alert("Erreur upload: " + (result?.error || "inconnue"));
                }
            },
            onUploadBatch: (results) => {
                isMediaUploadInProgress = false;
                mediaUploadUiArmed = false;
                const successful = (results || []).filter(
                    (r) => r && r.success && r.url,
                );
                const successUrls = successful.map((r) => r.url);
                if (successUrls.length > 0) {
                    setUploadProgress(100);
                    window.__xeraLatestMediaC2PA =
                        successful[0]?.c2pa ||
                        window.__xeraLatestMediaC2PA ||
                        null;
                }
                loader.style.display = "none";
                setUploadProgressIndeterminate();

                if (successUrls.length === 0) {
                    mediaUrlInput.value = "";
                    mediaUrlsInput.value = "";
                    placeholder.style.display = "block";
                    previewContainer.style.display = "none";
                    return;
                }

                mediaUrlInput.value = successUrls[0];
                mediaTypeInput.value =
                    successful[0]?.type || mediaTypeInput.value;
                mediaUrlsInput.value = JSON.stringify(successUrls);
                previewContainer.style.display = "block";
                placeholder.style.display = "none";

                const allowedTypes = new Set(getAllowedTypesForCurrentMode());
                if (
                    successful[0]?.type &&
                    allowedTypes.has(successful[0].type) &&
                    typeSelect.value !== successful[0].type
                ) {
                    typeSelect.value = successful[0].type;
                    typeSelect.dispatchEvent(new Event("change"));
                }

                if (successful[0]?.type === "video") {
                    previewContainer.innerHTML = buildMediaPreviewShell(
                        `<video src="${successUrls[0]}" controls style="max-width: 100%; max-height: 300px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);"></video>`,
                    );
                    refreshSmartSuggestions({
                        fileName: latestSelectedFileName,
                    });
                    return;
                }

                if (successUrls.length > 1) {
                    updateMultiPreview(successUrls);
                    try {
                        initXeraCarousels(previewContainer);
                    } catch (e) {
                        /* ignore */
                    }
                    refreshSmartSuggestions({
                        fileName: latestSelectedFileName,
                    });
                    return;
                }

                previewContainer.innerHTML = buildMediaPreviewShell(
                    `<img src="${successUrls[0]}" style="max-width: 100%; max-height: 300px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">`,
                );
                refreshSmartSuggestions({
                    fileName: latestSelectedFileName,
                });
            },
        });
    }

    // Préremplir les champs existants si édition
    if (isEdit && existingContent) {
        const mediaUrl = existingContent.media_url || existingContent.mediaUrl;
        const existingMediaUrls = Array.isArray(existingContent.mediaUrls)
            ? existingContent.mediaUrls.filter(Boolean)
            : mediaUrl
              ? [mediaUrl]
              : [];
        if (existingContent.type === "text") {
            uploadContainer.style.display = "block";
            urlContainer.style.display = "none";
            if (mediaUrl) {
                placeholder.style.display = "none";
                previewContainer.style.display = "block";
                if (existingMediaUrls.length > 1) {
                    mediaUrlsInput.value = JSON.stringify(existingMediaUrls);
                    updateMultiPreview(existingMediaUrls);
                    try {
                        initXeraCarousels(previewContainer);
                    } catch (e) {
                        /* ignore */
                    }
                } else {
                    previewContainer.innerHTML = buildMediaPreviewShell(
                        `<img src="${mediaUrl}" style="max-width: 100%; max-height: 300px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">`,
                    );
                }
            }
        } else if (existingContent.type === "image") {
            uploadContainer.style.display = "block";
            urlContainer.style.display = "none";
            fileInput.accept = "image/*";
            fileInput.multiple = true;
            if (mediaUrl) {
                placeholder.style.display = "none";
                previewContainer.style.display = "block";
                if (existingMediaUrls.length > 1) {
                    mediaUrlsInput.value = JSON.stringify(existingMediaUrls);
                    updateMultiPreview(existingMediaUrls);
                    try {
                        initXeraCarousels(previewContainer);
                    } catch (e) {
                        /* ignore */
                    }
                } else {
                    previewContainer.innerHTML = buildMediaPreviewShell(
                        `<img src="${mediaUrl}" style="max-width: 100%; max-height: 300px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">`,
                    );
                }
            }
        } else if (existingContent.type === "video") {
            uploadContainer.style.display = "block";
            urlContainer.style.display = "none";
            fileInput.accept = "video/*";
            fileInput.multiple = false;
            if (mediaUrl) {
                placeholder.style.display = "none";
                previewContainer.style.display = "block";
                previewContainer.innerHTML = buildMediaPreviewShell(
                    `<video src="${mediaUrl}" controls style="max-width: 100%; max-height: 300px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);"></video>`,
                );
            }
        } else if (existingContent.type === "live") {
            uploadContainer.style.display = "none";
            urlContainer.style.display = "block";
            liveInput.value = mediaUrl;
        }
    }

    // Handle form submission
    const createForm = modal.querySelector("#create-form");
    if (!createForm) {
        console.error("Error: create-form not found in modal");
        return;
    }

    try {
        createForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (isMediaUploadInProgress) {
                alert(
                    "Upload en cours. Attendez la fin de l'upload avant de publier.",
                );
                return;
            }

            const okOnline = await ensureOnlineOrNotify();
            if (!okOnline) return;
            const sessionCheck = await ensureFreshSupabaseSession();
            if (!sessionCheck.ok) {
                console.warn("Session refresh failed", sessionCheck.error);
            }

            let mediaUrl = mediaUrlInput.value;
            const mediaUrlsRaw = mediaUrlsInput?.value || "";
            let mediaUrls = [];
            try {
                const parsed = mediaUrlsRaw ? JSON.parse(mediaUrlsRaw) : [];
                if (Array.isArray(parsed)) mediaUrls = parsed.filter(Boolean);
            } catch (err) {
                mediaUrls = [];
            }
            if (!mediaUrl && mediaUrls.length > 0) {
                mediaUrl = mediaUrls[0];
            }
            if (mediaUrls.length === 0 && mediaUrl) {
                mediaUrls = [mediaUrl];
            }
            const selectedType = mediaTypeInput.value || typeSelect.value;
            if (selectedType !== "text" && !mediaUrl) {
                alert('Ajoutez un média ou sélectionnez "Post texte".');
                return;
            }

            let parsedTags = parseTagsInput(tagsInput.value);
            if (
                currentMode === "announcement" &&
                !parsedTags.includes("annonce")
            ) {
                parsedTags = ["annonce", ...parsedTags];
            }
            const baseDescription =
                currentMode === "announcement"
                    ? descInput.value || ""
                    : descInput.value;
            const descriptionWithTags = encodeDescriptionWithTags(
                baseDescription,
                parsedTags,
            );

            const btnSave = e.target.querySelector(".btn-save");
            const originalText = btnSave.textContent;
            btnSave.disabled = true;
            btnSave.textContent = isEdit ? "Mise à jour..." : "Publication...";
            const selectedArcLabel =
                currentMode === "announcement"
                    ? ""
                    : String(
                          arcSelect?.selectedOptions?.[0]?.textContent || "",
                      ).trim();

            const selectedArcId =
                currentMode === "announcement" ? null : arcSelect.value || null;
            const selectedArc = selectedArcId
                ? arcs.find((a) => a.id === selectedArcId)
                : null;
            const finalPageIdForContent = selectedArc?.page_id || finalPageId;

            const selectedMediaC2PA =
                window.__xeraLatestMediaC2PA &&
                typeof window.__xeraLatestMediaC2PA === "object"
                    ? {
                          isAI: !!window.__xeraLatestMediaC2PA.isAI,
                          provenance:
                              window.__xeraLatestMediaC2PA.provenance || null,
                          source: window.__xeraLatestMediaC2PA.source || null,
                      }
                    : null;
            const contentMetadata = {
                ...(selectedMediaC2PA
                    ? {
                          c2pa: selectedMediaC2PA,
                          is_ai: selectedMediaC2PA.isAI,
                      }
                    : {}),
            };

            const contentData = {
                userId: userId,
                dayNumber:
                    currentMode === "announcement"
                        ? 0
                        : parseInt(dayInput.value),
                title: titleInput.value,
                description: descriptionWithTags,
                state:
                    currentMode === "announcement"
                        ? "pause"
                        : stateSelect.value,
                type: selectedType,
                mediaUrl: mediaUrl || null,
                mediaUrls: mediaUrls,
                arcId: selectedArcId,
                pageId: finalPageIdForContent,
                metadata: contentMetadata,
            };

            closeCreateMenu();
            showBackgroundPublishBanner({
                state: "loading",
                title: isEdit ? "Mise a jour en cours" : "Publication en cours",
                message:
                    "Votre contenu est en train d'etre envoye en arriere-plan.",
            });

            try {
                let result;
                if (isEdit) {
                    // Mise à jour
                    const contentId =
                        document.getElementById("content-id").value;
                    result = await updateContent(contentId, contentData);
                } else {
                    // Création
                    result = await createContent(contentData);
                }

                if (result.success) {
                    const rememberedTags = parsedTags
                        .filter((tag) => tag !== "annonce")
                        .slice(0, XERA_CREATE_TAG_LIMIT);
                    updateCreatePrefs(userId, {
                        lastArcId: contentData.arcId,
                        lastState: contentData.state,
                        lastType: contentData.type,
                        recentTags: rememberedTags,
                    });
                    if (!isEdit) {
                        recordCreateMetric(
                            userId,
                            Math.max(0, Date.now() - createFlowStartedAt),
                        );
                    }
                    if (!isEdit && result.data) {
                        notifyFollowersOfTrace(result.data).catch((e) =>
                            console.warn("Follower notification failed:", e),
                        );
                        window.xeraGrowthLoops?.afterTracePublished?.({
                            content: result.data,
                            contentData,
                        });
                    }
                    clearPendingCreatePostAfterArc();
                    window._pendingPageId = null;
                    // Recharger les données locales et rafraîchir l'interface
                    const contentResult = await getUserContent(userId);
                    if (contentResult.success) {
                        userContents[userId] = contentResult.data.map(
                            convertSupabaseContent,
                        );
                    }

                    const publishFeedback = buildPublishFeedbackPayload({
                        userId,
                        contentData,
                        isEdit,
                        arcTitle: selectedArcLabel,
                    });
                    if (!isEdit) {
                        queueLatestPublishedPostHighlight(userId);
                    }

                    // Reload profile view
                    if (document.querySelector("#profile.active")) {
                        await renderProfileIntoContainer(userId);
                    }

                    // Refresh Discover cards (multiple cards can exist per user/arc)
                    if (document.querySelector(".discover-grid")) {
                        await renderDiscoverGrid();
                        if (typeof window.ToastManager !== "undefined") {
                            window.ToastManager.success(
                                "XΞRA High-Signal",
                                "Momentum Engine & Fluidity Active.",
                                3000,
                            );
                        }
                    }

                    // Refresh Arc details if open
                    if (
                        document.getElementById("immersive-overlay") &&
                        document.getElementById("immersive-overlay").style
                            .display === "block" &&
                        window.currentArc
                    ) {
                        if (window.openArcDetails) {
                            window.openArcDetails(window.currentArc.id);
                        }
                    }

                    showBackgroundPublishBanner({
                        state: "success",
                        title: isEdit
                            ? "Mise a jour terminee"
                            : "Publication terminee",
                        message:
                            "Votre contenu est maintenant en ligne sur XERA.",
                        autoHideMs: 3200,
                    });
                    requestAnimationFrame(async () => {
                        // Only a confirmed, newly-created Page Pro post gets the Page Pro upsell.
                        const shownPageUpsell =
                            !isEdit &&
                            contentData.pageId &&
                            (await showProfessionalPagePostUpsell(
                                contentData.pageId,
                            ));
                        const shownUpsell =
                            !shownPageUpsell &&
                            !isEdit &&
                            showPostPublishUpsell(window.currentUser);
                        if (!shownUpsell && !shownPageUpsell)
                            showPublishFeedbackCard(publishFeedback);
                    });
                } else {
                    showBackgroundPublishBanner({
                        state: "error",
                        title: "Publication echouee",
                        message:
                            result.error ||
                            "Une erreur est survenue pendant l'envoi du contenu.",
                        autoHideMs: 6000,
                    });
                }
            } catch (error) {
                console.error("Erreur soumission create-form:", error);
                showBackgroundPublishBanner({
                    state: "error",
                    title: "Publication echouee",
                    message:
                        error?.message ||
                        "Une erreur inattendue est survenue pendant la publication.",
                    autoHideMs: 6000,
                });
            } finally {
                btnSave.disabled = false;
                btnSave.textContent = originalText;
            }
        });
    } catch (e) {
        console.error("Error attaching form submit listener:", e);
    }
}

/* ========================================
   GESTION DU CONTENU - MODIFICATION/SUPPRESSION
   ======================================== */

async function editContent(contentId) {
    try {
        // Récupérer les détails du contenu SANS JOINTS pour éviter les erreurs de relations
        // Les noms des arcs et projets sont de toute façon chargés dans le menu via userContents/userProjects
        const { data: content, error } = await supabase
            .from("content")
            .select("*")
            .eq("id", contentId)
            .single();

        if (error) throw error;

        // Vérifier que c'est bien le contenu de l'utilisateur connecté
        if (!currentUser || content.user_id !== currentUser.id) {
            alert("Vous ne pouvez modifier que votre propre contenu.");
            return;
        }

        // Pré-remplir le formulaire d'édition
        // content contient arc_id et project_id en snake_case, que openCreateMenu gère maintenant
        await openCreateMenu(currentUser.id, content.arc_id, content);
    } catch (error) {
        console.error("Erreur lors de la récupération du contenu:", error);
        alert(
            "Erreur lors du chargement du contenu: " + (error.message || error),
        );
    }
}

async function deleteContent(contentId) {
    if (
        !confirm(
            "Êtes-vous sûr de vouloir supprimer cette mise à jour ? Cette action est irréversible.",
        )
    ) {
        return;
    }

    console.log("Tentative de suppression du contenu ID:", contentId);
    console.log("Utilisateur actuel:", currentUser);

    if (!window.currentUser) {
        alert("Vous devez être connecté pour supprimer une mise à jour.");
        return;
    }

    try {
        // Vérifier d'abord que le contenu existe et appartient à l'utilisateur
        const { data: contentToDelete, error: fetchError } = await supabase
            .from("content")
            .select("id, user_id, title")
            .eq("id", contentId)
            .single();

        if (fetchError) {
            console.error(
                "Erreur lors de la récupération du contenu:",
                fetchError,
            );
            throw new Error("Contenu introuvable: " + fetchError.message);
        }

        if (contentToDelete.user_id !== currentUser.id) {
            alert("Vous ne pouvez supprimer que votre propre contenu.");
            return;
        }

        console.log("Contenu à supprimer:", contentToDelete);

        // Procéder à la suppression
        const { error } = await supabase
            .from("content")
            .delete()
            .eq("id", contentId);

        if (error) {
            console.error("Erreur Supabase lors de la suppression:", error);
            throw error;
        }

        console.log("Suppression réussie, rechargement du profil...");

        // Recharger le contenu de l'utilisateur
        const contentResult = await getUserContent(currentUser.id);
        if (contentResult.success) {
            userContents[currentUser.id] = contentResult.data.map(
                convertSupabaseContent,
            );
        }

        // Recharger le profil
        if (document.querySelector("#profile.active")) {
            await renderProfileIntoContainer(currentUser.id);
        }

        // Refresh Discover cards (multiple cards can exist per user/arc)
        if (document.querySelector(".discover-grid")) {
            await renderDiscoverGrid();
            if (typeof window.ToastManager !== "undefined") {
                window.ToastManager.success(
                    "XΞRA High-Signal",
                    "Momentum Engine & Fluidity Active.",
                    3000,
                );
            }
        }

        // Refresh Arc details if open
        if (
            document.getElementById("immersive-overlay") &&
            document.getElementById("immersive-overlay").style.display ===
                "block" &&
            window.currentArc
        ) {
            if (window.openArcDetails) {
                window.openArcDetails(window.currentArc.id);
            }
        }

        alert("Update supprimée avec succès.");
    } catch (error) {
        console.error("Erreur lors de la suppression:", error);
        alert(
            "Erreur lors de la suppression de la mise à jour: " + error.message,
        );
    }
}

// Rendre les fonctions disponibles globalement
window.renderRichDescription = renderRichDescription;
window.renderProfileUpdateCard = renderProfileUpdateCard;
window.getUserContentLocal = getUserContentLocal;
window.getPageContentLocal = getPageContentLocal;
window.toggleProPostDescription = function (contentId) {
    const description = Array.from(
        document.querySelectorAll(".pro-post-description"),
    ).find((element) => element.dataset.proPostId === String(contentId || ""));
    if (!description) return;
    description.classList.toggle("is-expanded");
    description
        .closest(".pro-feed-card")
        ?.querySelector(".pro-post-expand-btn")
        ?.classList.toggle(
            "is-expanded",
            description.classList.contains("is-expanded"),
        );
};
window.editContent = editContent;
window.deleteContent = deleteContent;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.fetchDmRelationshipStatus = fetchDmRelationshipStatus;
window.hideDmConversation = hideDmConversation;
window.blockDmUser = blockDmUser;
window.unblockDmUser = unblockDmUser;
window.fetchBlockedUsersForSettings = fetchBlockedUsersForSettings;
window.handleUnblockUserFromSettings = handleUnblockUserFromSettings;
window.getUserProfilePreferences = getUserProfilePreferences;
window.canCurrentUserMessageTarget = canCurrentUserMessageTarget;
window.canCurrentUserMessageTargetAsync = canCurrentUserMessageTargetAsync;
window.openCreateMenu = openCreateMenu;
window.closeCreateMenu = closeCreateMenu;
window.setPendingCreatePostAfterArc = setPendingCreatePostAfterArc;
window.clearPendingCreatePostAfterArc = clearPendingCreatePostAfterArc;
window.toggleTimelineExpand = toggleTimelineExpand;
window.openImmersive = openImmersive;
window.closeImmersive = closeImmersive;
window.startOAuthConnection = startOAuthConnection;
window.refreshOAuthConnectionStatuses = refreshOAuthConnectionStatuses;
window.navigateToUserProfile = navigateToUserProfile;
window.renderUsernameWithBadge = renderUsernameWithBadge;
window.renderVerifiedPageBadge = renderVerifiedPageBadge;
window.renderVerifiedPageName = renderVerifiedPageName;
window.renderAmbassadorBadgeById = renderAmbassadorBadgeById;
window.isAmbassadorUserId = isAmbassadorUserId;
window.requestVerification = requestVerification;
window.addVerifiedUserId = addVerifiedUserId;
window.removeVerifiedUserId = removeVerifiedUserId;
window.handleVerificationSelection = handleVerificationSelection;
window.isSuperAdmin = isSuperAdmin;
window.createAdminAnnouncement = createAdminAnnouncement;
window.updateAdminAnnouncement = updateAdminAnnouncement;
window.deleteAdminAnnouncement = deleteAdminAnnouncement;
window.submitAdminAnnouncement = submitAdminAnnouncement;
window.editAdminAnnouncement = editAdminAnnouncement;
window.cancelAdminAnnouncementEdit = cancelAdminAnnouncementEdit;
window.renderSuperAdminPage = renderSuperAdminPage;
window.refreshAppPulse = refreshAppPulse;
window.fetchAdminAnnouncements = fetchAdminAnnouncements;
window.fetchFeedbackInbox = fetchFeedbackInbox;
window.fetchVerifiedBadges = fetchVerifiedBadges;
window.fetchVerificationRequests = fetchVerificationRequests;
window.getVerifiedBadgeSets = getVerifiedBadgeSets;
window.addVerifiedPageId = async function (pageId) {
    if (!pageId) return;
    try {
        const { error } = await supabase
            .from("verified_badges")
            .upsert(
                { user_id: pageId, type: "page" },
                { onConflict: "user_id,type" },
            );
        if (error) throw error;
        await fetchVerifiedBadges();
        if (window.ToastManager)
            ToastManager.success(
                "Page vérifiée",
                "La Page Pro a été vérifiée.",
            );
        if (
            window.currentProPageSlug &&
            window.professionalManager?.renderProPage
        ) {
            window.professionalManager
                .renderProPage(window.currentProPageSlug)
                .catch(() => {});
        }
    } catch (err) {
        console.error("addVerifiedPageId failed", err);
        if (window.ToastManager)
            ToastManager.error(
                "Erreur",
                "Impossible d'appliquer la vérification de la page.",
            );
    }
};

window.removeVerifiedPageId = async function (pageId) {
    if (!pageId) return;
    try {
        const { error } = await supabase
            .from("verified_badges")
            .delete()
            .eq("user_id", pageId)
            .eq("type", "page");
        if (error) throw error;
        await fetchVerifiedBadges();
        if (window.ToastManager)
            ToastManager.success(
                "Page non vérifiée",
                "La vérification a été retirée.",
            );
        if (
            window.currentProPageSlug &&
            window.professionalManager?.renderProPage
        ) {
            window.professionalManager
                .renderProPage(window.currentProPageSlug)
                .catch(() => {});
        }
    } catch (err) {
        console.error("removeVerifiedPageId failed", err);
        if (window.ToastManager)
            ToastManager.error(
                "Erreur",
                "Impossible de retirer la vérification de la page.",
            );
    }
};

window.isVerifiedPageId = function (pageId) {
    return !!(
        verifiedPageIds &&
        verifiedPageIds.has &&
        verifiedPageIds.has(pageId)
    );
};
window.banUserByAdmin = banUserByAdmin;
window.unbanUserByAdmin = unbanUserByAdmin;
window.banUserFromProfile = banUserFromProfile;
window.unbanUserFromProfile = unbanUserFromProfile;
window.softDeleteContentByAdmin = softDeleteContentByAdmin;
window.restoreContentByAdmin = restoreContentByAdmin;
window.hardDeleteContentByAdmin = hardDeleteContentByAdmin;
window.moderateContentFromProfile = moderateContentFromProfile;
window.hardDeleteUserByAdmin = hardDeleteUserByAdmin;
window.renderBadgeAdminPage = renderBadgeAdminPage;
window.toggleFollow = toggleFollow;
window.openReplyPrompt = openReplyPrompt;
window.setupAdminUserSearch = setupAdminUserSearch;
if (typeof openArcDetails !== "undefined") {
    window.openArcDetails = openArcDetails;
}
window.toggleTheme = toggleTheme;
window.handleSignOut = handleSignOut;
window.requestAccountDeletion = requestAccountDeletion;

/* ========================================
   INITIALISATION AU CHARGEMENT
   ======================================== */

document.addEventListener("DOMContentLoaded", function () {
    setupPwaSwUpdateReload();
    // Initialiser les meta tags OG rapidement pour le partage social
    initializeOpenGraphFromUrl();
    initializeApp();
});
window.openCreateMenu = openCreateMenu;

// Rafraîchissement périodique du feed (inclut les lives) pour compenser toute latence realtime
// MINIMIZED: Realtime subscriptions should handle most updates. Fallback to 5-minute refresh only.
const LIVE_REFRESH_MS = 5 * 60 * 1000; // was 20000ms (20s), now 300000ms (5 min)
let liveRefreshTimer = null;

function startLiveAutoRefresh() {
    if (liveRefreshTimer) clearInterval(liveRefreshTimer);
    liveRefreshTimer = setInterval(() => {
        if (document.hidden) return; // éviter du travail inutile en arrière-plan
        if (typeof renderDiscoverGrid === "function") {
            renderDiscoverGrid();
        }
    }, LIVE_REFRESH_MS);
}

/* ========================================
   REALTIME SUBSCRIPTIONS
   ======================================== */

function subscribeToRealtime() {
    console.log("Initialisation des souscriptions Realtime...");

    const scheduleDiscoverRefresh = (() => {
        let timer = null;
        return () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                // Éviter de rafraîchir si les données sont en train de se charger
                if (!window.hasLoadedUsers) {
                    console.log(
                        "Données en cours de chargement, skip discover refresh",
                    );
                    return;
                }
                if (typeof renderDiscoverGrid === "function") {
                    renderDiscoverGrid();
                }
            }, 300);
        };
    })();

    // Souscription aux changements de la table 'content'
    supabase
        .channel("public:content")
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "content" },
            async (payload) => {
                console.log("Changement détecté dans content:", payload);

                const { eventType, new: newRecord, old: oldRecord } = payload;

                if (eventType === "INSERT" || eventType === "UPDATE") {
                    const converted = convertSupabaseContent(newRecord);
                    const author = getContentAuthorIdentity(converted);
                    const contentId = converted.contentId;
                    if (!author.id || !contentId) return;

                    // Un changement d'identité retire aussi l'ancienne copie locale.
                    Object.keys(userContents).forEach((id) => {
                        userContents[id] = (userContents[id] || []).filter(
                            (item) => item?.contentId !== contentId,
                        );
                    });
                    professionalPageContents.forEach((items, id) => {
                        professionalPageContents.set(
                            id,
                            (items || []).filter(
                                (item) => item?.contentId !== contentId,
                            ),
                        );
                    });

                    // Mise a jour locale immediate pour un feed temps reel plus reactif
                    try {
                        const cache =
                            author.type === "PAGE_PRO"
                                ? professionalPageContents
                                : userContents;
                        const cacheKey = String(author.id);
                        const currentList = Array.isArray(cache.get?.(cacheKey))
                            ? cache.get(cacheKey)
                            : Array.isArray(cache[cacheKey])
                              ? cache[cacheKey]
                              : [];
                        const merged = [
                            converted,
                            ...currentList.filter(
                                (item) => item?.contentId !== contentId,
                            ),
                        ].sort(
                            (left, right) =>
                                new Date(
                                    right?.createdAt || right?.created_at || 0,
                                ) -
                                new Date(
                                    left?.createdAt || left?.created_at || 0,
                                ),
                        );
                        if (author.type === "PAGE_PRO") {
                            professionalPageContents.set(cacheKey, merged);
                        } else {
                            userContents[cacheKey] = merged;
                        }
                    } catch (_error) {
                        // fallback ci-dessous via refetch complet
                    }

                    // Recharger seulement l'historique USER; les posts Page Pro
                    // restent indexés dans professionalPageContents.
                    if (author.type === "USER") {
                        const userId = author.id;
                        try {
                            if (!window.__userContentRefetchTimers) {
                                window.__userContentRefetchTimers = new Map();
                            }
                            if (!window.__userContentRefetchTimers.has(userId)) {
                                const timerId = setTimeout(async () => {
                                    try {
                                        const contentResult =
                                            await getUserContent(userId);
                                        if (
                                            contentResult &&
                                            contentResult.success
                                        ) {
                                            userContents[userId] =
                                                contentResult.data.map(
                                                    convertSupabaseContent,
                                                );
                                        }
                                    } catch (e) {
                                        console.warn(
                                            "Background getUserContent failed:",
                                            e?.message || e,
                                        );
                                    } finally {
                                        const t =
                                            window.__userContentRefetchTimers.get(
                                                userId,
                                            );
                                        if (t) clearTimeout(t);
                                        window.__userContentRefetchTimers.delete(
                                            userId,
                                        );
                                    }
                                }, 3000);
                                window.__userContentRefetchTimers.set(
                                    userId,
                                    timerId,
                                );
                            }
                        } catch (e) {
                            console.warn(
                                "Scheduling background refetch failed:",
                                e,
                            );
                        }
                    }

                    // Si on affiche le profil de cet utilisateur, rafraîchir
                    if (
                        author.type === "USER" &&
                        window.currentProfileViewed === author.id
                    ) {
                        console.log("Mise à jour automatique du profil...");
                        if (!window.__immersiveOpen) {
                            await renderProfileIntoContainer(author.id);
                        } else {
                            console.log(
                                "Immersive open: skip profile auto-refresh",
                            );
                        }
                    }

                    // Refresh Discover cards (multiple cards can exist per user/arc)
                    if (document.querySelector(".discover-grid")) {
                        scheduleDiscoverRefresh();
                    }
                } else if (eventType === "DELETE") {
                    const contentId = oldRecord?.id;
                    const author = getContentAuthorIdentity(oldRecord);
                    if (contentId) {
                        Object.keys(userContents).forEach((id) => {
                            userContents[id] = (userContents[id] || []).filter(
                                (item) => item?.contentId !== contentId,
                            );
                        });
                        professionalPageContents.forEach((items, id) => {
                            professionalPageContents.set(
                                id,
                                (items || []).filter(
                                    (item) => item?.contentId !== contentId,
                                ),
                            );
                        });
                    }
                    if (
                        author.type === "USER" &&
                        author.id &&
                        window.currentProfileViewed === author.id &&
                        !window.__immersiveOpen
                    ) {
                        await renderProfileIntoContainer(author.id);
                    }
                    if (document.querySelector(".discover-grid")) {
                        scheduleDiscoverRefresh();
                    }
                }
            },
        )
        .subscribe();

    // Souscription aux changements de la table 'streaming_sessions'
    supabase
        .channel("public:streaming_sessions")
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "streaming_sessions",
            },
            (payload) => {
                console.log(
                    "Changement détecté dans streaming_sessions:",
                    payload,
                );
                scheduleDiscoverRefresh();
            },
        )
        .subscribe();

    // Démarrer un rafraîchissement de secours pour le feed (lives inclus)
    startLiveAutoRefresh();
}

/* ========================================
   GESTION DE LA LECTURE VIDÉO SYNCHRONISÉE
   ======================================== */

// Stocker l'état des vidéos
window.videoStates = new Map();

// Gérer la visibilité de la page pour contrôler les vidéos
document.addEventListener("visibilitychange", () => {
    const videos = document.querySelectorAll(
        "video.card-media, video.immersive-video",
    );

    if (document.hidden) {
        // Page cachée : mettre en pause toutes les vidéos et sauvegarder l'état
        videos.forEach((video) => {
            if (!video.paused) {
                const videoId = video.id || `video-${Date.now()}`;
                window.videoStates.set(videoId, {
                    currentTime: video.currentTime,
                    wasPlaying: true,
                });
                video.pause();
            }
        });
    } else {
        // Page visible : reprendre les vidéos qui étaient en lecture
        videos.forEach((video) => {
            const videoId = video.id || `video-${Date.now()}`;
            const savedState = window.videoStates.get(videoId);

            if (savedState && savedState.wasPlaying) {
                video.currentTime = savedState.currentTime;
                video
                    .play()
                    .catch((e) => console.log("Reprise vidéo bloquée:", e));
                window.videoStates.delete(videoId);
            }
        });
    }
});

// Gérer le focus/défocus de la fenêtre
window.addEventListener("blur", () => {
    const videos = document.querySelectorAll(
        "video.card-media, video.immersive-video",
    );
    videos.forEach((video) => {
        if (!video.paused) {
            const videoId = video.id || `video-${Date.now()}`;
            window.videoStates.set(videoId, {
                currentTime: video.currentTime,
                wasPlaying: true,
            });
            video.pause();
        }
    });
});

window.addEventListener("focus", () => {
    const videos = document.querySelectorAll(
        "video.card-media, video.immersive-video",
    );
    videos.forEach((video) => {
        const videoId = video.id || `video-${Date.now()}`;
        const savedState = window.videoStates.get(videoId);

        if (savedState && savedState.wasPlaying) {
            video.currentTime = savedState.currentTime;
            video.play().catch((e) => console.log("Reprise vidéo bloquée:", e));
            window.videoStates.delete(videoId);
        }
    });
});

// Initialiser les gestionnaires d'événements pour les nouvelles vidéos
function initializeVideoControls(root = document) {
    if (!root) return;

    let videos = [];
    if (
        root.matches &&
        root.matches("video.card-media, video.immersive-video")
    ) {
        videos = [root];
    } else if (root.querySelectorAll) {
        videos = root.querySelectorAll(
            "video.card-media, video.immersive-video",
        );
    }

    videos.forEach((video) => {
        // Éviter les doubles bindings et les remises à zéro d'état audio.
        if (video.dataset.controlsInitialized === "1") return;
        video.dataset.controlsInitialized = "1";

        // S'assurer que la vidéo a un ID unique
        if (!video.id) {
            video.id = `video-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }

        // Garder les vidéos des cartes muettes, permettre le son pour les vidéos immersives
        if (video.classList.contains("card-media")) {
            video.muted = true; // Forcer muted pour les cartes
        } else if (video.classList.contains("immersive-video")) {
            video.muted = true; // Démarrer muet, sera démuté uniquement pour la vidéo active
            video.loop = true; // Toujours en boucle
            if (
                video.dataset.src &&
                video.dataset.loaded !== "1" &&
                !video.currentSrc
            ) {
                video.removeAttribute("src"); // sera renseigné en lazy-load
            }
        }

        // Ajouter des gestionnaires pour les interactions utilisateur
        video.addEventListener("mouseenter", () => {
            if (video.paused && video.readyState >= 2) {
                video
                    .play()
                    .catch((e) => console.log("Lecture vidéo bloquée:", e));
            }
        });

        video.addEventListener("mouseleave", () => {
            // Optionnel : mettre en pause quand la souris quitte
            // video.pause();
        });

        // Si une vidéo immersive commence à jouer, muter les autres
        if (video.classList.contains("immersive-video")) {
            video.addEventListener("play", () =>
                muteOtherImmersiveVideos(video),
            );
        }
    });
}

// Appeler l'initialisation après le chargement du DOM
document.addEventListener("DOMContentLoaded", () => initializeVideoControls());

// Observer les changements dans le DOM pour les nouvelles vidéos
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const hasTargetVideo =
                        (node.matches &&
                            node.matches(
                                "video.card-media, video.immersive-video",
                            )) ||
                        (node.querySelector &&
                            node.querySelector(
                                "video.card-media, video.immersive-video",
                            ));
                    if (hasTargetVideo) {
                        initializeVideoControls(node);
                    }
                }
            });
        }
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true,
});

// ==================== ADMIN: BROADCAST EMAIL ====================
async function sendAdminBroadcastEmail() {
    const subject = document
        .getElementById("admin-broadcast-subject")
        ?.value?.trim();
    const body = document.getElementById("admin-broadcast-body")?.value?.trim();
    const ctaLabel =
        document.getElementById("admin-broadcast-cta-label")?.value?.trim() ||
        "";
    const ctaUrl =
        document.getElementById("admin-broadcast-cta-url")?.value?.trim() || "";
    const defaultLabel = "Envoyer à tous les utilisateurs";
    const loadingLabel = "Envoi en cours...";
    const successLabel = "Email envoyé";
    const partialLabel = "Envoi partiel";
    const errorLabel = "Échec de l'envoi";
    const minimumBusyMs = 1200;
    const resultLabelMs = 2200;

    if (!subject || !body) {
        window.ToastManager?.error(
            "Erreur",
            "Le sujet et le contenu sont requis.",
        );
        return;
    }

    const submitBtn = document.getElementById("admin-broadcast-submit");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = loadingLabel;
    }

    const startedAt = Date.now();
    const wait = (ms) =>
        new Promise((resolve) => {
            window.setTimeout(resolve, Math.max(0, ms));
        });
    const ensureMinimumBusyTime = async () => {
        const elapsed = Date.now() - startedAt;
        if (elapsed < minimumBusyMs) {
            await wait(minimumBusyMs - elapsed);
        }
    };

    try {
        const result = await fetchSuperAdminJson("/api/admin/broadcast-email", {
            method: "POST",
            body: JSON.stringify({
                subject,
                body,
                ctaLabel,
                ctaUrl,
            }),
        });

        await ensureMinimumBusyTime();

        const sentCount = Number(result.sentCount || 0);
        const failedCount = Number(result.failedCount || 0);
        const attemptedCount = Number(result.attemptedCount || sentCount);
        const summary = [
            `${sentCount} email${sentCount > 1 ? "s" : ""} envoyé${sentCount > 1 ? "s" : ""}`,
            failedCount > 0
                ? `${failedCount} échec${failedCount > 1 ? "s" : ""}`
                : null,
            attemptedCount > sentCount + failedCount
                ? `${attemptedCount - sentCount - failedCount} utilisateur${attemptedCount - sentCount - failedCount > 1 ? "s" : ""} sans adresse email`
                : null,
        ]
            .filter(Boolean)
            .join(" • ");

        if (failedCount > 0) {
            if (submitBtn) {
                submitBtn.textContent = partialLabel;
            }
            window.ToastManager?.info(
                "Envoi partiel",
                summary || "L'envoi est partiellement terminé.",
            );
        } else {
            if (submitBtn) {
                submitBtn.textContent = successLabel;
            }
            window.ToastManager?.success("Succès", summary || "Email envoyé.");
        }

        // Clear form
        if (document.getElementById("admin-broadcast-subject"))
            document.getElementById("admin-broadcast-subject").value = "";
        if (document.getElementById("admin-broadcast-body"))
            document.getElementById("admin-broadcast-body").value = "";
        if (document.getElementById("admin-broadcast-cta-label"))
            document.getElementById("admin-broadcast-cta-label").value = "";
        if (document.getElementById("admin-broadcast-cta-url"))
            document.getElementById("admin-broadcast-cta-url").value = "";
        await wait(resultLabelMs);
    } catch (error) {
        await ensureMinimumBusyTime();
        if (submitBtn) {
            submitBtn.textContent = errorLabel;
        }
        console.error("Broadcast email error:", error);
        window.ToastManager?.error(
            "Erreur",
            error.message || "Impossible d'envoyer l'email.",
        );
        await wait(resultLabelMs);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = defaultLabel;
        }
    }
}

/**
 * Charge les images d'un carousel de manière séquentielle (une par une)
 * pour optimiser la performance et le temps de chargement initial
 */
function sequentiallyLoadCarouselImages(carouselElement) {
    if (!carouselElement) return;

    const images = carouselElement.querySelectorAll("img[data-src]");
    if (images.length === 0) return;

    let loadedCount = 0;
    const totalImages = images.length;

    // Charger les images une par une avec un délai minimal
    images.forEach((img, index) => {
        const dataSrc = img.getAttribute("data-src");
        if (!dataSrc) return;

        // Délai progressif pour étaler le chargement
        setTimeout(() => {
            if (img.getAttribute("data-src")) {
                img.src = dataSrc;
                img.removeAttribute("data-src");
                loadedCount++;
                // Déclencher un événement custom quand toutes les images sont chargées
                if (loadedCount === totalImages) {
                    carouselElement.dispatchEvent(
                        new CustomEvent("carousel-images-loaded"),
                    );
                }
            }
        }, index * 150); // 150ms entre chaque image
    });
}

/**
 * Charge les images des carousels visibles dans le DOM
 */
function loadAllCarouselImagesSequentially() {
    const carousels = document.querySelectorAll(".xera-carousel");
    carousels.forEach((carousel) => sequentiallyLoadCarouselImages(carousel));
}

/**
 * Expand immersive description to show full text and views
 */
function expandImmersiveDescription(contentId) {
    showContentDetailsModal(contentId);
}

/**
 * Show content details modal with full description and metadata
 */
function showContentDetailsModal(contentId, contentTitle) {
    // Find content by contentId across all userContents
    let content = null;
    for (const userId in window.userContents || {}) {
        const contents = window.userContents[userId] || [];
        const found = contents.find((c) => (c.contentId || c.id) === contentId);
        if (found) {
            content = found;
            break;
        }
    }

    if (!content) {
        console.warn("Content not found:", contentId);
        return;
    }

    // Mettre à jour les meta tags Open Graph pour le partage du contenu
    updateOpenGraphTags({
        contentId: contentId,
        content: {
            title: contentTitle || content.title || "Contenu XERA",
            description: content.rawDescription || content.description || "",
            media:
                content.media || content.mediaUrl
                    ? [{ url: content.mediaUrl }]
                    : [],
            mediaUrl: content.mediaUrl,
            thumbnail_url: content.thumbnail_url,
        },
    });

    const fullDescription =
        extractTagsFromDescription(
            content.rawDescription || content.description || "",
        ).cleanDescription || "";

    const contentUser = getUser(content.userId);
    const contentUserName = contentUser ? contentUser.name : "Utilisateur";
    const contentUserAvatar = contentUser ? contentUser.avatar : "";
    const views = formatCompactCount(content.views || 0);
    const encouragements = formatCompactCount(content.encouragementsCount || 0);
    const createdAt = timeAgo(content.createdAt || new Date());

    // Get state label
    const stateLabel =
        content.state === "success"
            ? "✅ Victoire"
            : content.state === "failure"
              ? "🚫 Bloqué"
              : "⏸️ Pause";

    // Get day number if available
    const dayInfo =
        typeof content.dayNumber === "number"
            ? `<div class="stat-item"><span class="stat-label">Jour</span><span class="stat-value">${content.dayNumber}</span></div>`
            : "";

    const page =
        content.pageId &&
        window.professionalManager?.proPagesCache?.get(content.pageId);
    const authorName = page?.name || contentUserName;
    const authorAvatar =
        page?.avatar_url || contentUserAvatar || "icons/logo.png";
    const certificationBadge = page
        ? '<span class="immersive-details-badge">Page Pro</span>'
        : "";
    const metadataItems = [
        content.dayNumber ? `Jour ${content.dayNumber}` : "",
        stateLabel,
        `${views} vues`,
        `${encouragements} encouragements`,
    ].filter(Boolean);

    // Create bottom-sheet HTML
    const modalHtml = `
        <div class="content-details-modal-overlay immersive-details-overlay" onclick="if(event.target === this) closeContentDetailsModal()">
            <div class="content-details-modal immersive-details-sheet" role="dialog" aria-modal="true" aria-label="Description complète" onclick="event.stopPropagation()">
                <div class="immersive-details-handle" aria-hidden="true"></div>
                <button class="modal-close-btn immersive-details-close" aria-label="Fermer" onclick="closeContentDetailsModal()">✕</button>
                
                <div class="modal-header">
                    <h2>${escapeHtml(contentTitle || content.title)}</h2>
                    <p class="modal-user">
                        <img src="${escapeHtml(authorAvatar)}" alt="${escapeHtml(authorName)}" class="modal-user-avatar">
                        <span>${escapeHtml(authorName)} ${certificationBadge}</span>
                        <span class="modal-date">${createdAt}</span>
                    </p>
                </div>

                <div class="modal-body">
                    <p class="full-description">${fullDescription ? renderRichDescription(fullDescription) : "<em>Pas de description</em>"}</p>
                </div>

                <div class="modal-stats">
                    ${metadataItems.map((item) => `<span class="immersive-details-meta-item">${escapeHtml(item)}</span>`).join("")}
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existingModal = document.querySelector(
        ".content-details-modal-overlay",
    );
    if (existingModal) {
        existingModal.remove();
    }

    // Inject modal and lock the background while the sheet is open.
    document.body.insertAdjacentHTML("beforeend", modalHtml);
    const overlay = document.querySelector(".immersive-details-overlay");
    const sheet = overlay?.querySelector(".immersive-details-sheet");
    if (!overlay || !sheet) return;

    if (!document.getElementById("immersive-details-sheet-styles")) {
        const style = document.createElement("style");
        style.id = "immersive-details-sheet-styles";
        style.textContent = `
            .immersive-details-overlay { display:flex; align-items:flex-end; justify-content:center; padding:0; background:rgba(0,0,0,.72); backdrop-filter:blur(8px); }
            .immersive-details-sheet { position:relative; width:min(720px, 100%); max-height:min(82vh, 760px); overflow-y:auto; overscroll-behavior:contain; background:#09090b; border:1px solid rgba(255,255,255,.1); border-bottom:0; border-radius:24px 24px 0 0; padding:18px 24px 28px; transform:translateY(100%); opacity:.7; animation:immersive-sheet-in .28s cubic-bezier(.22,1,.36,1) forwards; touch-action:pan-y; }
            .immersive-details-handle { width:48px; height:4px; margin:0 auto 14px; border-radius:999px; background:#3f3f46; }
            .immersive-details-close { top:14px; right:16px; }
            .immersive-details-badge { display:inline-block; margin-left:6px; padding:3px 7px; border-radius:999px; background:#2e1065; color:#c4b5fd; font-size:.7rem; }
            .immersive-details-sheet .full-description { line-height:1.75; white-space:normal; color:#e4e4e7; }
            .immersive-details-sheet .rich-link, .immersive-details-sheet .rich-hashtag, .immersive-details-sheet .rich-mention { color:#a78bfa; }
            .immersive-details-meta-item { display:inline-flex; margin:4px 6px 0 0; padding:6px 9px; border:1px solid rgba(255,255,255,.08); border-radius:8px; color:#a1a1aa; font-size:.78rem; }
            @keyframes immersive-sheet-in { to { transform:translateY(0); opacity:1; } }
            @media (min-width:721px) { .immersive-details-sheet { margin-bottom:18px; border-bottom:1px solid rgba(255,255,255,.1); border-radius:24px; } }
        `;
        document.head.appendChild(style);
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.dataset.immersiveDetailsOverflow = previousBodyOverflow;
    document.body.style.overflow = "hidden";
    let startY = 0;
    let currentY = 0;
    let dragging = false;
    const dismiss = () => closeContentDetailsModal();
    sheet.addEventListener(
        "touchstart",
        (event) => {
            startY = event.touches[0].clientY;
            currentY = startY;
            dragging = sheet.scrollTop <= 0;
            if (dragging) sheet.style.transition = "none";
        },
        { passive: true },
    );
    sheet.addEventListener(
        "touchmove",
        (event) => {
            if (!dragging) return;
            currentY = event.touches[0].clientY;
            const delta = Math.max(0, currentY - startY);
            if (delta > 0) {
                event.preventDefault();
                sheet.style.transform = `translateY(${delta}px)`;
            }
        },
        { passive: false },
    );
    sheet.addEventListener(
        "touchend",
        () => {
            if (!dragging) return;
            const delta = Math.max(0, currentY - startY);
            sheet.style.transition = "transform .22s ease, opacity .22s ease";
            if (delta > 100) {
                sheet.style.transform = "translateY(100%)";
                sheet.style.opacity = "0";
                setTimeout(dismiss, 220);
            } else {
                sheet.style.transform = "translateY(0)";
            }
            dragging = false;
        },
        { passive: true },
    );
    sheet.addEventListener(
        "wheel",
        (event) => {
            if (sheet.scrollTop <= 0 && event.deltaY > 0) {
                event.preventDefault();
                dismiss();
            }
        },
        { passive: false },
    );
    const handleDetailsKeydown = (event) => {
        if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", handleDetailsKeydown);
    overlay.addEventListener(
        "details-closed",
        () => {
            document.removeEventListener("keydown", handleDetailsKeydown);
        },
        { once: true },
    );
}

/**
 * Close content details modal
 */
function closeContentDetailsModal() {
    const modal = document.querySelector(".content-details-modal-overlay");
    if (modal) {
        const sheet = modal.querySelector(".immersive-details-sheet");
        if (sheet) {
            sheet.style.transition = "transform .2s ease, opacity .2s ease";
            sheet.style.transform = "translateY(100%)";
            sheet.style.opacity = "0";
            setTimeout(() => modal.remove(), 200);
        } else {
            modal.remove();
        }
        modal.dispatchEvent(new CustomEvent("details-closed"));
        document.body.style.overflow =
            document.body.dataset.immersiveDetailsOverflow || "";
        delete document.body.dataset.immersiveDetailsOverflow;
    }
}
