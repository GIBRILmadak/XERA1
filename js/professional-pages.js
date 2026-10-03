// `isProUser` is provided globally by app-supabase.js (window.isProUser)
/**
 * XERA1 PROFESSIONAL PAGES & CERTIFICATIONS
 * Gère la création de pages entreprises et la certification des talents
 * Version Onboarding Interactif XXL - Haute Visibilité
 */

function isPhoneDestination(value) {
    const raw = String(value || "").trim();
    return raw.length >= 6 && /^[\d\s()+./-]+$/.test(raw);
}

function getProfessionalCta(page) {
    const cta = page?.metadata?.professional_cta || {};
    const rawUrl = cta.url || page?.website_url || "";
    const destination = String(rawUrl).trim();
    const phone = isPhoneDestination(destination);
    const externalUrl = phone
        ? `tel:${destination.replace(/[^\d+]/g, "")}`
        : destination && !/^[a-z][a-z\d+.-]*:/i.test(destination)
          ? `https://${destination}`
          : destination;
    return {
        objective: cta.objective || "sales",
        label: cta.label || "Visiter le site",
        type: phone ? "phone" : "external",
        url: externalUrl,
    };
}

function CompanyPageSkeleton() {
    return `
        <div class="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <section class="company-page-skeleton" role="status" aria-busy="true" aria-label="Chargement de la page professionnelle">
                <div class="company-skeleton-banner animate-pulse"></div>
                <div class="company-skeleton-header">
                    <div class="company-skeleton-logo animate-pulse"></div>
                    <div class="company-skeleton-identity">
                        <div class="company-skeleton-line company-skeleton-kicker animate-pulse"></div>
                        <div class="company-skeleton-line company-skeleton-title animate-pulse"></div>
                        <div class="company-skeleton-line company-skeleton-subtitle animate-pulse"></div>
                        <div class="company-skeleton-actions">
                            <div class="company-skeleton-button animate-pulse"></div>
                            <div class="company-skeleton-button company-skeleton-button-secondary animate-pulse"></div>
                        </div>
                    </div>
                </div>
                <div class="company-skeleton-metrics">
                    <div class="company-skeleton-metric animate-pulse"></div>
                    <div class="company-skeleton-metric animate-pulse"></div>
                    <div class="company-skeleton-metric animate-pulse"></div>
                    <div class="company-skeleton-metric animate-pulse"></div>
                </div>
                <div class="company-skeleton-content">
                    <div class="company-skeleton-main">
                        <div class="company-skeleton-section-heading animate-pulse"></div>
                        <div class="company-skeleton-card animate-pulse"></div>
                        <div class="company-skeleton-card company-skeleton-card-tall animate-pulse"></div>
                    </div>
                    <div class="company-skeleton-sidebar">
                        <div class="company-skeleton-section-heading animate-pulse"></div>
                        <div class="company-skeleton-card animate-pulse"></div>
                    </div>
                </div>
            </section>
        </div>
    `;
}

function ensureCompanyPageSkeletonStyles() {
    if (document.getElementById("company-page-skeleton-styles")) return;
    const style = document.createElement("style");
    style.id = "company-page-skeleton-styles";
    style.textContent = `
        .company-page-skeleton {
            width: 100%; max-width: 1240px; margin: 0 auto; padding: 28px clamp(16px, 3vw, 38px) 72px;
            box-sizing: border-box; color: #fff; background: #09090b; overflow: hidden;
        }
        .company-page-skeleton > * { box-sizing: border-box; }
        .company-skeleton-banner { height: clamp(180px, 25vw, 260px); border: 1px solid rgba(255,255,255,.05); border-radius: 24px 24px 0 0; background: #13131a; }
        .company-skeleton-header { display: grid; grid-template-columns: 126px minmax(0, 1fr); gap: 22px; align-items: end; min-height: 174px; padding: 0 30px 24px; background: #13131a; border: 1px solid rgba(255,255,255,.05); border-top: 0; }
        .company-skeleton-logo { width: 126px; height: 126px; margin-top: -62px; border: 5px solid #13131a; border-radius: 22px; background: rgba(255,255,255,.05); }
        .company-skeleton-identity { display: grid; gap: 9px; padding-bottom: 4px; }
        .company-skeleton-line, .company-skeleton-button, .company-skeleton-metric, .company-skeleton-section-heading, .company-skeleton-card { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.05); }
        .company-skeleton-kicker { width: 30%; height: 12px; border-radius: 4px; }
        .company-skeleton-title { width: min(360px, 72%); height: 32px; border-radius: 7px; }
        .company-skeleton-subtitle { width: 190px; height: 14px; border-radius: 5px; }
        .company-skeleton-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 7px; }
        .company-skeleton-button { width: 160px; height: 48px; border-radius: 16px; }
        .company-skeleton-button-secondary { width: 130px; }
        .company-skeleton-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 16px 0 22px; }
        .company-skeleton-metric { height: 82px; border-radius: 14px; background: #13131a; }
        .company-skeleton-content { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; }
        .company-skeleton-main, .company-skeleton-sidebar { display: grid; gap: 14px; align-content: start; }
        .company-skeleton-section-heading { width: 42%; height: 22px; border-radius: 6px; }
        .company-skeleton-card { width: 100%; height: 150px; border-radius: 22px; background: #13131a; }
        .company-skeleton-card-tall { height: 210px; }
        .company-page-skeleton .animate-pulse { animation: company-skeleton-shimmer 1.7s ease-in-out infinite; }
        @keyframes company-skeleton-shimmer { 0%, 100% { opacity: .48; } 50% { opacity: .9; } }
        .pro-page-wrapper.pro-page-fade-in { animation: company-page-fade-in .24s ease-out both; }
        @keyframes company-page-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 700px) {
            .company-page-skeleton { padding: 0 0 42px; }
            .company-skeleton-banner { height: 160px; border-radius: 0; }
            .company-skeleton-header { grid-template-columns: 100px minmax(0, 1fr); gap: 15px; min-height: 160px; padding: 0 15px 24px; }
            .company-skeleton-logo { width: 100px; height: 100px; margin-top: -50px; }
            .company-skeleton-title { width: 100%; height: 26px; }
            .company-skeleton-actions { display: none; }
            .company-skeleton-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 0 15px; }
            .company-skeleton-content { grid-template-columns: 1fr; padding: 0 15px; }
            .company-skeleton-sidebar { display: none; }
        }
    `;
    document.head.appendChild(style);
}

if (typeof window !== "undefined") {
    window.CompanyPageSkeleton = CompanyPageSkeleton;
    window.waitForProfessionalManager =
        window.waitForProfessionalManager ||
        async function (timeoutMs = 5000) {
            const start = Date.now();
            while (
                !window.professionalManager &&
                Date.now() - start < timeoutMs
            ) {
                await new Promise((r) => setTimeout(r, 50));
            }

            if (!window.professionalManager) {
                if (typeof window.showToast === "function") {
                    window.showToast(
                        "Chargement de la Page Pro, veuillez patienter...",
                        "info",
                    );
                } else {
                    console.info("Professional manager not ready yet.");
                }
                return null;
            }

            return window.professionalManager;
        };
}

class XERAProfessionalManager {
    constructor(supabase) {
        this.supabase = supabase;
        this.onboarding = null;
        this.myPageSlug = null;
        this.proPagesCache = new Map();
        this.initialStateHandled = false;
        this.initialStatePromise = null;
        this.proPageRenderSequence = 0;

        // Initialiser l'état global
        window.userHasProPage = window.userHasProPage || false;
    }

    normalizeAccountValues(user) {
        return [
            user?.account_type,
            user?.user_metadata?.account_type,
            user?.account_subtype,
            user?.accountSubtype,
            user?.user_metadata?.account_subtype,
        ]
            .filter(
                (value) =>
                    value !== undefined && value !== null && value !== "",
            )
            .map((value) => String(value).trim().toLowerCase());
    }

    isNonPersonalAccount(user) {
        return this.normalizeAccountValues(user).some((value) =>
            [
                "team",
                "enterprise",
                "company",
                "community",
                "organization",
                "organisation",
                "org",
                "pro",
                "institution",
                "professional",
                "recruiter",
                "investor",
                "partner",
            ].includes(value),
        );
    }

    /**
     * Vérifie si l'utilisateur est éligible à avoir une page pro.
     * La création d'une page pro ne dépend plus d'un abonnement.
     */
    isEligibleForProPage(user) {
        return Boolean(user?.id);
    }

    notify(message, type = "info") {
        if (typeof window.showToast === "function") {
            window.showToast(message, type);
            return;
        }

        if (typeof window.showToastNotification === "function") {
            window.showToastNotification(message, type);
            return;
        }

        console.info(message);
    }

    getUpgradeUrl() {
        if (window.XeraRouter?.buildHtmlUrl) {
            return window.XeraRouter.buildHtmlUrl("subscriptionPlans");
        }

        return "subscription-plans.html";
    }

    hasPageProEntitlements(pageId, ownerSubscriptionActive = false) {
        const isVerified =
            typeof window.isVerifiedPageId === "function" &&
            window.isVerifiedPageId(pageId);
        return Boolean(isVerified || ownerSubscriptionActive);
    }

    buildPageSlug(name) {
        return String(name || "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
    }

    escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    normalizeTokens(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .split(/[^a-z0-9]+/i)
            .map((token) => token.trim())
            .filter((token) => token.length >= 2);
    }

    buildNeedsTokens(page) {
        const needs = Array.isArray(page?.hiring_needs)
            ? page.hiring_needs
            : [];
        return Array.from(
            new Set(
                needs
                    .flatMap((need) => this.normalizeTokens(need))
                    .filter(Boolean),
            ),
        );
    }

    async getRecommendedProfilesForPage(page, employees = []) {
        const needTokens = this.buildNeedsTokens(page);
        if (needTokens.length === 0) return [];

        const employeeIds = new Set(
            (employees || [])
                .map((employee) => employee.user_id)
                .filter(Boolean),
        );

        // --- MOMENTUM ENGINE : DEEP ANALYSIS ---
        // On récupère les profils avec Arcs (intentions), Contenus (vélocité) et Certifications (confiance)
        const { data, error } = await this.supabase
            .from("users")
            .select(
                `
                id, name, avatar, title, bio, account_subtype, badge, plan, updated_at,
                content ( id, created_at, tags, title ),
                arcs ( id, title, opportunity_intents, description ),
                professional_certifications ( id, status )
            `,
            )
            .neq("id", page.owner_id)
            .order("updated_at", { ascending: false })
            .limit(100);
        if (error) {
            console.warn("Momentum Engine error:", error);
            return [];
        }

        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        return (data || [])
            .filter((user) => user?.id && !employeeIds.has(user.id))
            .map((user) => {
                // 1. CALCUL MOMENTUM (VÉLOCITÉ) : 1 post/jour = 100%
                const recentPosts = (user.content || []).filter(
                    (c) => new Date(c.created_at) >= sevenDaysAgo,
                );
                const velocity = recentPosts.length / 7;
                const momentumPercent = Math.round(velocity * 100);

                // 2. ANALYSE DU MATCHING PROFOND (TAGS ARCS + TRACES)
                const userContentTokens = new Set([
                    ...this.normalizeTokens(
                        user.name + " " + user.title + " " + user.bio,
                    ),
                    ...(user.arcs || []).flatMap((arc) =>
                        this.normalizeTokens(
                            arc.title +
                                " " +
                                (arc.tags?.join(" ") || "") +
                                " " +
                                arc.description,
                        ),
                    ),
                    ...(user.content || []).flatMap((c) =>
                        this.normalizeTokens(
                            c.title + " " + (c.tags?.join(" ") || ""),
                        ),
                    ),
                ]);

                const matchedTokens = needTokens.filter((token) =>
                    userContentTokens.has(token),
                );
                const matchRatio =
                    matchedTokens.length / Math.max(1, needTokens.length);

                // Matching d'Intention (Golden Match)
                // Analyse de l'audience cible (Collaborateurs, Investisseurs, Partenaires)
                const userIntents = (user.arcs || []).flatMap(
                    (arc) => arc.opportunity_intents || [],
                );
                const pageBio = (page.bio || "").toLowerCase();
                const isInvestorPage =
                    pageBio.includes("invest") ||
                    page.industry?.toLowerCase().includes("finance");
                const isRecruiterPage =
                    pageBio.includes("recrut") ||
                    page.industry?.toLowerCase().includes("rh");

                let goldenMatch = 0;
                if (
                    isInvestorPage &&
                    userIntents.includes("cherche_investissement")
                )
                    goldenMatch = 25;
                if (isRecruiterPage && userIntents.includes("open_to_recruit"))
                    goldenMatch = 25;

                // 3. BOOST VÉRIFICATION INSTITUTIONNELLE
                const isInstitutionVerified = (
                    user.professional_certifications || []
                ).some((cert) => cert.status === "active");
                const verificationBoost = isInstitutionVerified ? 30 : 0;

                // 4. BOOST ABONNEMENT PAYANT (Priorité SaaS)
                const isPaidUser = ["standard", "medium", "pro"].includes(
                    String(user.plan || "").toLowerCase(),
                );
                const subscriptionBoost = isPaidUser ? 20 : 0;

                // --- SCORE FINAL ÉQUILIBRÉ ---
                // Momentum (40%) + Match (30%) + Institution (15%) + Sub (15%) + GoldenMatch
                const baseScore =
                    momentumPercent * 0.4 +
                    matchRatio * 100 * 0.3 +
                    verificationBoost +
                    subscriptionBoost +
                    goldenMatch;
                const finalScore = Math.min(100, Math.round(baseScore));

                return {
                    ...user,
                    matchScore: finalScore,
                    momentum: momentumPercent,
                    matchedTokens,
                    isVerified: isInstitutionVerified,
                    isPro: isPaidUser,
                };
            })
            .sort((a, b) => b.matchScore - a.matchScore)
            .slice(0, 8);
    }

    scoreUserAgainstPage(user, page) {
        const needTokens = this.buildNeedsTokens(page);
        if (!user || needTokens.length === 0) {
            return {
                score: 0,
                matchedTokens: [],
                missingTokens: needTokens,
            };
        }

        const profileTokens = new Set(
            this.normalizeTokens(
                [
                    user.name,
                    user.title,
                    user.bio,
                    user.account_subtype,
                    user.account_type,
                    user.badge,
                ].join(" "),
            ),
        );
        const matchedTokens = needTokens.filter((token) =>
            profileTokens.has(token),
        );
        const missingTokens = needTokens.filter(
            (token) => !profileTokens.has(token),
        );
        const completeness = (user.title ? 8 : 0) + (user.bio ? 8 : 0);
        const score = Math.min(
            100,
            Math.round(
                (matchedTokens.length / needTokens.length) * 84 + completeness,
            ),
        );

        return { score, matchedTokens, missingTokens };
    }

    renderOfficialComparison(
        page,
        recommendedProfiles,
        hasActiveSubscription = false,
    ) {
        if (!window.currentUser) return "";

        const mine = this.scoreUserAgainstPage(window.currentUser, page);
        const topScore = recommendedProfiles?.[0]?.matchScore || 0;
        const averageScore =
            recommendedProfiles && recommendedProfiles.length > 0
                ? Math.round(
                      recommendedProfiles.reduce(
                          (total, profile) =>
                              total + Number(profile.matchScore || 0),
                          0,
                      ) / recommendedProfiles.length,
                  )
                : 0;
        const rivalScore = Math.max(topScore, averageScore);
        const mineWidth = Math.max(mine.score, 4);
        const rivalWidth = Math.max(rivalScore, 4);
        const matchedHtml = mine.matchedTokens.length
            ? mine.matchedTokens
                  .slice(0, 4)
                  .map((token) => `<span>${this.escapeHtml(token)}</span>`)
                  .join("")
            : "<span>aucun match direct</span>";
        const missingHtml = mine.missingTokens.length
            ? mine.missingTokens
                  .slice(0, 4)
                  .map((token) => `<span>${this.escapeHtml(token)}</span>`)
                  .join("")
            : "<span>profil aligné</span>";

        const content = `
            <div class="pro-versus-bars">
                <div class="pro-versus-row">
                    <div class="pro-versus-label">
                        <strong>Moi</strong>
                        <span>${mine.score}%</span>
                    </div>
                    <div class="pro-versus-track"><i style="width:${mineWidth}%"></i></div>
                </div>
                <div class="pro-versus-row">
                    <div class="pro-versus-label">
                        <strong>Eux</strong>
                        <span>${rivalScore}%</span>
                    </div>
                    <div class="pro-versus-track pro-versus-track--rivals"><i style="width:${rivalWidth}%"></i></div>
                </div>
            </div>
            <div class="pro-versus-details">
                <div>
                    <small>Vos signaux</small>
                    <div class="pro-versus-tags">${matchedHtml}</div>
                </div>
                <div>
                    <small>À renforcer</small>
                    <div class="pro-versus-tags is-muted">${missingHtml}</div>
                </div>
            </div>
        `;

        if (!hasActiveSubscription) {
            // Make the overlay clickable to send user to subscription page
            const upgradeUrl = this.getUpgradeUrl();
            return `
                <section class="pro-versus-panel" style="position: relative; overflow: hidden;">
                    <div class="pro-versus-head">
                        <h3>Moi vs eux</h3>
                        <p>Votre position face aux meilleurs profils qui matchent cette page officielle.</p>
                    </div>
                    <div style="filter: blur(9px); opacity: 0.7; pointer-events: none;">
                        ${content}
                    </div>
                    <a href="${upgradeUrl}" class="pro-locked-overlay pro-locked-link" aria-label="Passer au plan Pro">
                        <div class="pro-locked-message">Débloquez les analyses sur le matching</div>
                    </a>
                </section>
            `;
        }

        return `
            <section class="pro-versus-panel">
                <div class="pro-versus-head">
                    <h3>Moi vs eux</h3>
                    <p>Votre position face aux meilleurs profils qui matchent cette page officielle.</p>
                </div>
                ${content}
            </section>
        `;
    }

    renderRecommendedProfiles(profiles, page, hasActiveSubscription = false) {
        const needs = Array.isArray(page?.hiring_needs)
            ? page.hiring_needs.filter(Boolean)
            : [];

        if (!profiles || profiles.length === 0) {
            const body = needs.length
                ? "Aucun profil ne matche encore clairement ces besoins."
                : "Ajoutez des besoins à la page pour activer les recommandations.";

            if (!hasActiveSubscription) {
                return `
                    <section class="pro-match-panel" style="position: relative; overflow: hidden;">
                        <div class="pro-match-panel-head">
                            <h3>Meilleurs profils du moment</h3>
                            <p>${body}</p>
                        </div>
                        <div style="filter: blur(10px); opacity: 0.7; pointer-events: none;">
                            <div style="height: 90px; border-radius: 16px; background: rgba(255,255,255,0.06); margin-top: 12px;"></div>
                            <div style="height: 90px; border-radius: 16px; background: rgba(255,255,255,0.06); margin-top: 12px;"></div>
                        </div>
                        <a href="${this.getUpgradeUrl()}" class="pro-locked-overlay pro-locked-link" aria-label="Passer au plan Pro">
                            <div class="pro-locked-message">Débloquez tous les meilleurs talents</div>
                        </a>
                    </section>
                `;
            }

            return `
                <section class="pro-match-panel">
                    <div class="pro-match-panel-head">
                        <h3>Meilleurs profils du moment</h3>
                        <p>${body}</p>
                    </div>
                </section>
            `;
        }

        if (!hasActiveSubscription) {
            return `
                <section class="pro-match-panel" style="position: relative; overflow: hidden;">
                    <div class="pro-match-panel-head">
                        <h3>Meilleurs profils du moment</h3>
                        <p>Classés selon les besoins actuels de cette page.</p>
                    </div>
                    <div style="filter: blur(10px); opacity: 0.7; pointer-events: none;">
                        <div class="pro-match-list">
                            ${profiles
                                .slice(0, 3)
                                .map((profile) => {
                                    const name = this.escapeHtml(
                                        profile.name || "Profil XERA1",
                                    );
                                    const title = this.escapeHtml(
                                        profile.title ||
                                            profile.account_subtype ||
                                            "Trajectoire active",
                                    );
                                    const avatar = this.escapeHtml(
                                        profile.avatar ||
                                            "https://placehold.co/80",
                                    );

                                    return `
                                        <div class="pro-match-card">
                                            <img src="${avatar}" alt="Avatar ${name}">
                                            <span class="pro-match-card-body">
                                                <strong>${name}</strong>
                                                <small>${title}</small>
                                            </span>
                                        </div>
                                    `;
                                })
                                .join("")}
                        </div>
                    </div>
                    <a href="${this.getUpgradeUrl()}" class="pro-locked-overlay pro-locked-link" aria-label="Passer au plan Pro">
                        <div class="pro-locked-message">Débloquez tous les meilleurs talents</div>
                    </a>
                </section>
            `;
        }

        return `
            <section class="pro-match-panel">
                <div class="pro-match-panel-head">
                    <h3>Meilleurs profils du moment</h3>
                    <p>Classés selon les besoins actuels de cette page.</p>
                </div>
                <div class="pro-match-list">
                    ${profiles
                        .slice(0, 3)
                        .map((profile) => {
                            const name = this.escapeHtml(
                                profile.name || "Profil XERA1",
                            );
                            const title = this.escapeHtml(
                                profile.title ||
                                    profile.account_subtype ||
                                    "Trajectoire active",
                            );
                            const avatar = this.escapeHtml(
                                profile.avatar || "https://placehold.co/80",
                            );
                            const tokens = profile.matchedTokens
                                .slice(0, 3)
                                .map(
                                    (token) =>
                                        `<span>${this.escapeHtml(token)}</span>`,
                                )
                                .join("");

                            return `
                                <button class="pro-match-card" onclick="navigateToUserProfile('${profile.id}')">
                                    <img src="${avatar}" alt="Avatar ${name}">
                                    <span class="pro-match-card-body">
                                        <strong>${name}</strong>
                                        <small>${title}</small>
                                        <span class="pro-match-tags">${tokens || "<span>profil complet</span>"}</span>
                                    </span>
                                    <span class="pro-match-score">${profile.matchScore}%</span>
                                </button>
                            `;
                        })
                        .join("")}
                </div>
                <div style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <button class="btn btn-primary" onclick="window.professionalManager.openTopTalentExplorer()" style="width: 100%; justify-content: center; font-size: 0.85rem;">
                        <i class="fas fa-search-dollar" style="margin-right: 8px;"></i>
                        Tous les meilleurs profils
                    </button>
                </div>
            </section>
        `;
    }

    async isPageNameAvailable(name) {
        const pageName = String(name || "").trim();
        const slug = this.buildPageSlug(pageName);
        if (!pageName || !slug) return false;

        const [nameResult, slugResult] = await Promise.all([
            this.supabase
                .from("professional_pages")
                .select("id")
                .ilike("name", pageName)
                .limit(1),
            this.supabase
                .from("professional_pages")
                .select("id")
                .eq("slug", slug)
                .limit(1),
        ]);

        if (nameResult.error) throw nameResult.error;
        if (slugResult.error) throw slugResult.error;

        return (
            (nameResult.data || []).length === 0 &&
            (slugResult.data || []).length === 0
        );
    }

    startCreatePage() {
        console.log("[Pro] startCreatePage called");
        if (!window.currentUser) {
            this.notify("Connectez-vous pour créer une Page Pro.", "info");
            window.location.href = "login.html?redirect=profile.html";
            return;
        }

        // Empêcher l'onboarding multiple spécifique
        if (document.querySelector(".onboarding-xxl-split")) {
            console.log("[Pro] Onboarding already active, skipping start");
            return;
        }

        console.log("[Pro] Launching XERAProfessionalOnboarding");
        try {
            this.onboarding = new XERAProfessionalOnboarding(this);
            this.onboarding.start();
        } catch (e) {
            console.error("[Pro] Error starting onboarding:", e);
            this.notify("Erreur lors de l'ouverture du formulaire.", "error");
        }
    }
    /**
     * Initialise la navigation pour afficher le bouton Page Pro si nécessaire
     */
    async initNavigation(retryCount = 0) {
        if (
            String(window.location.pathname || "").endsWith(
                "profile-personal.html",
            )
        ) {
            return;
        }

        const initialParams = new URLSearchParams(window.location.search);
        if (
            (initialParams.get("pro") || initialParams.get("explorer")) &&
            !this.initialStateHandled &&
            !this.initialStatePromise
        ) {
            this.publicInitialStateStarted = true;
            this.initialStatePromise = this.handleInitialState().finally(() => {
                this.initialStateHandled = true;
                this.initialStatePromise = null;
            });
            await this.initialStatePromise;
        }

        // Attendre que l'utilisateur soit chargé (Augmenté à 15s pour correspondre à app-supabase)
        if (!window.currentUser || !window.currentUser.id) {
            if (retryCount < 60) {
                setTimeout(() => this.initNavigation(retryCount + 1), 250);
            } else {
                console.warn(
                    "[Pro] Giving up on initNavigation: currentUser not found after 15s",
                );
            }
            return;
        }

        // Hook sur navigateTo pour nettoyer les paramètres d'URL pro
        if (!window._proNavigationHooked) {
            const originalNavigateTo = window.navigateTo;
            window.navigateTo = (pageId, options) => {
                if (
                    pageId !== "pro-page" &&
                    pageId !== "pagepro" &&
                    pageId !== "talent-explorer" &&
                    pageId !== "pro-settings"
                ) {
                    this.syncUrl({ pro: null, explorer: null });
                }

                if (typeof originalNavigateTo === "function") {
                    return originalNavigateTo(pageId, options);
                }

                // Fallback si le router global est disponible mais n'était pas là au moment du hook
                if (
                    window.XeraRouter &&
                    typeof window.XeraRouter.navigate === "function"
                ) {
                    return window.XeraRouter.navigate(pageId, options);
                }
            };
            window._proNavigationHooked = true;
        }

        try {
            // Vérifier les pages possédées par l'utilisateur
            if (!window.currentUser?.id) return;

            const { data: pages, error } = await this.supabase
                .from("professional_pages")
                .select("slug")
                .eq("owner_id", window.currentUser.id);

            if (error) throw error;

            const hasPage = pages && pages.length > 0;
            const previousHasPage = window.userHasProPage;
            window.userHasProPage = hasPage;

            const navBtn = document.getElementById("nav-pro-page");
            const talentFilterBtn = document.getElementById("filter-talents");

            // Éviter de recréer le bouton si l'état n'a pas changé et qu'il est déjà initialisé
            if (navBtn && navBtn._proInitDone && hasPage === previousHasPage) {
                return;
            }

            const isSuperAdmin =
                window.currentUser?.id ===
                "b0f9f893-1706-4721-899c-d26ad79afc86";

            if (navBtn) {
                this.myPageSlug = hasPage ? pages[0].slug : null;
                navBtn.style.setProperty("display", "flex", "important");
                navBtn.title = hasPage
                    ? "Basculer vers ma Page Pro"
                    : "Créer une Page Pro";

                console.log(
                    "[Pro] Entrée Page Pro disponible. Slug:",
                    this.myPageSlug,
                );

                navBtn._proInitDone = true;
            }

            // Afficher l'onglet Talents si c'est un profil Pro/Institution
            if (talentFilterBtn) {
                const isPro =
                    hasPage || this.isNonPersonalAccount(window.currentUser);
                talentFilterBtn.style.display = isPro ? "inline-flex" : "none";
            }

            // Rafraîchir l'affichage du profil si on est dessus
            const profileBtn = document.querySelector(
                ".settings-badge[title='Page Pro']",
            );
            if (profileBtn) {
                // N'afficher que si l'utilisateur est un compte pro/entreprise (ou Super Admin) ET n'a pas encore de Page Pro
                const isNonPersonal = this.isNonPersonalAccount(
                    window.currentUser,
                );
                profileBtn.style.display =
                    hasPage || (!isNonPersonal && !isSuperAdmin)
                        ? "none"
                        : "flex";

                profileBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log("[Pro] Profile Pro button clicked");
                    this.startCreatePage();
                };
            }

            console.log("Pro Page Navigation Initialized. Has Page:", hasPage);

            // Gérer l'état initial depuis l'URL (permet de rester sur la page au refresh)
            if (!this.initialStateHandled && !this.initialStatePromise) {
                this.initialStatePromise = this.handleInitialState().finally(
                    () => {
                        this.initialStateHandled = true;
                        this.initialStatePromise = null;
                    },
                );
                await this.initialStatePromise;
            }

            // Si on a une page pro, empêcher le onboarding intempestif
            if (hasPage) {
                window.firstPostOnboardingHandled = true;
            }
        } catch (e) {
            console.error("InitNavigation Pro Page failed:", e);
        }
    }

    /**
     * Met à jour l'URL sans recharger la page
     */
    syncUrl(params) {
        try {
            const url = new URL(window.location.href);
            let changed = false;
            Object.entries(params).forEach(([key, value]) => {
                if (value === null) {
                    if (url.searchParams.has(key)) {
                        url.searchParams.delete(key);
                        changed = true;
                    }
                } else {
                    if (url.searchParams.get(key) !== String(value)) {
                        url.searchParams.set(key, String(value));
                        changed = true;
                    }
                }
            });
            if (changed) {
                window.history.replaceState({}, "", url.toString());
            }
        } catch (e) {
            console.warn("SyncUrl failed:", e);
        }
    }

    /**
     * Détecte si on doit charger une page pro ou l'explorateur depuis l'URL
     */
    async handleInitialState() {
        const params = new URLSearchParams(window.location.search);
        const proSlug = params.get("pro");
        const userId = params.get("user");
        const explorer = params.get("explorer");
        const team = params.get("team");

        if (userId && window.location.pathname.includes("pagepro")) {
            const page = await this.getPageByOwnerId(userId);
            if (page?.slug) {
                await this.renderProPage(page.slug);
                return true;
            }
        }

        if (explorer === "1") {
            await this.renderTalentExplorer();
            return true;
        }

        if (proSlug) {
            if (team === "1") {
                await this.renderCertifiedTeamDirectory(proSlug);
                return true;
            }
            await this.renderProPage(proSlug);
            return true;
        }

        return false;
    }

    /**
     * Ouvre la page pro existante, ou lance la création si aucune page n'existe.
     */
    async navigateToMyPage() {
        console.log("[Pro] navigateToMyPage called");

        // Notification immédiate pour retour utilisateur
        if (typeof window.showToast === "function") {
            window.showToast("Ouverture de l'espace professionnel...", "info");
        }

        // 1. Si on a déjà le slug, on y va direct (Instantané)
        if (this.myPageSlug) {
            console.log("[Pro] Navigating to existing page:", this.myPageSlug);
            await this.renderProPage(this.myPageSlug);
            return;
        }

        // 2. Vérification forcée si on n'a pas de slug
        try {
            console.log(
                "[Pro] No slug in cache, checking database for user:",
                window.currentUser?.id,
            );
            const { data: pages, error } = await this.supabase
                .from("professional_pages")
                .select("slug")
                .eq("owner_id", window.currentUser?.id);

            if (!error && pages && pages.length > 0) {
                this.myPageSlug = pages[0].slug;
                window.userHasProPage = true;
                await this.renderProPage(this.myPageSlug);
                return;
            }
        } catch (err) {
            console.warn("[Pro] Background page check failed:", err);
        }

        // 3. Si on arrive ici, c'est qu'il n'y a pas de page -> Onboarding
        console.log("[Pro] No page found, launching onboarding");
        this.startCreatePage();
    }

    /**
     * Crée une nouvelle page professionnelle
     */
    async createPage(data) {
        const {
            data: { user },
            error: authError,
        } = await this.supabase.auth.getUser();
        if (authError || !user) throw new Error("Utilisateur non connecté");

        // Utiliser l'ID de l'utilisateur authentifié
        const ownerId = user.id;

        const pageName = String(data.name || "").trim();
        const slug = this.buildPageSlug(pageName);
        if (!pageName || !slug) throw new Error("Nom de page invalide");

        const isAvailable = await this.isPageNameAvailable(pageName);
        if (!isAvailable) {
            throw new Error("Ce nom de Page Pro est déjà utilisé.");
        }

        const payload = {
            owner_id: ownerId, // ID fiable issu de l'auth
            name: pageName,
            slug: data.slug || slug,
            bio: data.bio || "",
            description: data.description || "",
            industry: data.industry,
            hiring_needs: data.hiringNeeds || [],
            talent_interests: data.talentInterests || [],
            avatar_url: data.avatarUrl,
            banner_url: data.bannerUrl,
            website_url: String(data.websiteUrl || "").trim(),
            metadata: {
                ...(data.metadata || {}),
                professional_cta: {
                    ...(data.professionalCta || {}),
                    url: String(
                        data.professionalCta?.url || data.websiteUrl || "",
                    ).trim(),
                },
            },
        };

        console.log("Tentative de création de page avec owner_id:", ownerId);
        console.log("Payload complet:", payload);

        const { data: page, error } = await this.supabase
            .from("professional_pages")
            .insert(payload)
            .select()
            .single();

        if (error) {
            console.error("Supabase creation error:", error);
            if (error.code === "23505") {
                throw new Error("Ce nom de Page Pro est déjà utilisé.");
            }
            if (error.code === "23503") {
                throw new Error(
                    "Erreur de compte : le profil utilisateur n'est pas correctement synchronisé avec la base de données.",
                );
            }
            throw new Error(
                error.message || "Erreur lors de la création de la page.",
            );
        }
        return page;
    }

    /**
     * Met à jour les informations d'une page pro
     */
    async updatePage(pageId, updates) {
        const { data, error } = await this.supabase
            .from("professional_pages")
            .update({
                name: updates.name,
                industry: updates.industry,
                bio: updates.bio,
                description: updates.description,
                avatar_url: updates.avatarUrl,
                banner_url: updates.bannerUrl,
                website_url: String(updates.websiteUrl || "").trim(),
                hiring_needs: updates.hiringNeeds,
                updated_at: new Date().toISOString(),
            })
            .eq("id", pageId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Certifie un utilisateur
     */
    async certifyUser(pageId, userId, type, details = {}) {
        const finalTitle =
            details.title || (type === "student" ? "Étudiant" : "Membre");

        const payload = {
            page_id: pageId,
            user_id: userId,
            type: type,
            title: finalTitle,
            department: details.department || null,
            status: "active",
            start_date:
                details.startDate || new Date().toISOString().split("T")[0],
            metadata: details.metadata || {},
        };

        const { data: cert, error } = await this.supabase
            .from("professional_certifications")
            .upsert(payload, { onConflict: "page_id, user_id, type" })
            .select()
            .single();

        if (error) throw error;
        return cert;
    }

    /**
     * Révoque une certification (changement de statut)
     */
    async revokeCertification(certId) {
        const { data, error } = await this.supabase
            .from("professional_certifications")
            .update({
                status: "revoked",
                updated_at: new Date().toISOString(),
            })
            .eq("id", certId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Supprime définitivement une certification
     */
    async deleteCertification(certId) {
        const { error } = await this.supabase
            .from("professional_certifications")
            .delete()
            .eq("id", certId);

        if (error) throw error;
        return true;
    }

    /**
     * Récupère les pages gérées par l'utilisateur actuel
     */
    async getMyPages() {
        if (!window.currentUser) return [];

        const { data, error } = await this.supabase
            .from("professional_pages")
            .select("*")
            .eq("owner_id", window.currentUser.id);

        if (error) throw error;
        return data || [];
    }

    /**
     * Récupère les infos d'une page (avec cache)
     */
    async getPageInfo(pageId) {
        if (this.proPagesCache.has(pageId)) {
            return this.proPagesCache.get(pageId);
        }

        const { data, error } = await this.supabase
            .from("professional_pages")
            .select("*")
            .eq("id", pageId)
            .single();

        if (error) return null;
        this.proPagesCache.set(pageId, data);
        return data;
    }

    async getPageFollowState(pageId) {
        if (!pageId) return { count: 0, isFollowing: false, available: false };

        try {
            const [{ count, error: countError }, followResult] =
                await Promise.all([
                    this.supabase
                        .from("page_followers")
                        .select("id", { count: "exact", head: true })
                        .eq("page_id", pageId),
                    window.currentUser?.id
                        ? this.supabase
                              .from("page_followers")
                              .select("id")
                              .eq("page_id", pageId)
                              .eq("user_id", window.currentUser.id)
                              .limit(1)
                        : Promise.resolve({ data: [] }),
                ]);

            if (countError) throw countError;
            if (followResult.error) throw followResult.error;

            return {
                count: count || 0,
                isFollowing: (followResult.data || []).length > 0,
                available: true,
            };
        } catch (error) {
            console.warn("Abonnements Page Pro indisponibles:", error);
            return { count: 0, isFollowing: false, available: false };
        }
    }

    async togglePageFollow(pageId) {
        if (!pageId) return;
        if (!window.currentUser?.id) {
            window.location.href = "login.html?redirect=profile.html";
            return;
        }

        const button = document.getElementById(`page-follow-btn-${pageId}`);
        if (button) button.disabled = true;

        try {
            const state = await this.getPageFollowState(pageId);
            if (!state.available) {
                throw new Error(
                    "Les abonnements aux Pages Pro sont indisponibles.",
                );
            }

            const query = this.supabase
                .from("page_followers")
                .delete()
                .eq("page_id", pageId)
                .eq("user_id", window.currentUser.id);

            const { error } = state.isFollowing
                ? await query
                : await this.supabase.from("page_followers").insert({
                      page_id: pageId,
                      user_id: window.currentUser.id,
                  });

            if (error && error.code !== "23505") throw error;

            const nextState = await this.getPageFollowState(pageId);
            if (button) {
                button.classList.toggle("is-following", nextState.isFollowing);
                button.innerHTML = `<img src="icons/${nextState.isFollowing ? "subscribed" : "subscribe"}.svg" class="btn-icon" style="width: 20px; height: 20px;"> ${nextState.isFollowing ? "Abonné" : "S'abonner"}`;
            }
            const countElement = document.getElementById(
                `page-follow-count-${pageId}`,
            );
            if (countElement)
                countElement.textContent = String(nextState.count);
        } catch (error) {
            console.error("Erreur abonnement Page Pro:", error);
            window.ToastManager?.error(
                "Erreur",
                error?.message || "Impossible de modifier l'abonnement.",
            );
        } finally {
            if (button) button.disabled = false;
        }
    }

    async getPageByOwnerId(ownerId) {
        if (!ownerId) return null;

        for (const page of this.proPagesCache.values()) {
            if (page.owner_id === ownerId) {
                return page;
            }
        }

        const { data, error } = await this.supabase
            .from("professional_pages")
            .select("*")
            .eq("owner_id", ownerId)
            .single();

        if (error || !data) {
            return null;
        }

        this.proPagesCache.set(data.id, data);
        return data;
    }

    /**
     * Récupère les certifications d'un utilisateur
     */
    async getUserCertifications(userId) {
        const { data, error } = await this.supabase
            .from("professional_certifications")
            .select(
                `
                *,
                page:professional_pages (
                    id,
                    name,
                    slug,
                    avatar_url
                )
            `,
            )
            .eq("user_id", userId)
            .eq("status", "active");

        if (error) throw error;
        return data || [];
    }

    /**
     * Récupère toutes les certifications d'une page
     */
    async getPageCertifications(pageId, includeInactive = false) {
        let query = this.supabase
            .from("professional_certifications")
            .select(
                `
                *,
                user:users (
                    id,
                    name,
                    avatar,
                    title,
                    bio,
                    account_subtype
                )
            `,
            )
            .eq("page_id", pageId);

        if (!includeInactive) {
            query = query.eq("status", "active");
        }
        query = query.order("created_at", { ascending: false });

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    }

    /**
     * Ouvre l'interface de gestion d'équipe
     */
    async openTeamManagement(pageId) {
        // Création du modal s'il n'existe pas
        let modal = document.getElementById("team-management-modal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "team-management-modal";
            modal.className = "modal-overlay-xxl";
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="onboarding-xxl" style="width: 700px; max-width: 95vw; padding: 40px; position: relative; background: #fff; border: 3px solid #000; box-shadow: 10px 10px 0px #000;">
                <button class="close-onboarding" onclick="this.closest('.modal-overlay-xxl').remove()" style="position: absolute; top: 20px; right: 20px; background: none; border: none; font-size: 2rem; cursor: pointer;">×</button>

                <h2 style="margin-bottom: 5px; font-size: 2rem;">Gestion de l'Équipe Certifiée</h2>
                <p style="color: var(--text-secondary); margin-bottom: 30px;">Ajoutez des membres officiels ou révoquez des accès.</p>

                <div class="team-management-tabs" style="display: flex; gap: 20px; border-bottom: 2px solid #eee; margin-bottom: 25px;">
                    <button class="tab-btn active" data-tab="members" style="padding: 10px 0; background: none; border: none; border-bottom: 3px solid #000; font-weight: 700; cursor: pointer;">Membres actuels</button>
                    <button class="tab-btn" data-tab="add" style="padding: 10px 0; background: none; border: none; border-bottom: 3px solid transparent; font-weight: 700; cursor: pointer;">+ Ajouter un membre</button>
                </div>

                <div id="team-tab-content">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        `;

        modal.style.display = "flex";
        modal.style.position = "fixed";
        modal.style.inset = "0";
        modal.style.backgroundColor = "rgba(0,0,0,0.8)";
        modal.style.zIndex = "11000";
        modal.style.justifyContent = "center";
        modal.style.alignItems = "center";

        await this.loadTeamTab(pageId, "members");
        this.attachTeamTabs(pageId);
    }

    /**
     * Gère le basculement entre les onglets
     */
    attachTeamTabs(pageId) {
        const modal = document.getElementById("team-management-modal");
        const tabs = modal.querySelectorAll(".tab-btn");
        tabs.forEach((tab) => {
            tab.onclick = async () => {
                tabs.forEach((t) => {
                    t.classList.remove("active");
                    t.style.borderBottomColor = "transparent";
                });
                tab.classList.add("active");
                tab.style.borderBottomColor = "#000";
                await this.loadTeamTab(pageId, tab.dataset.tab);
            };
        });
    }

    /**
     * Charge le contenu d'un onglet
     */
    async loadTeamTab(pageId, tabName) {
        const container = document.getElementById("team-tab-content");
        container.innerHTML = `<div style="text-align:center; padding: 40px;"><div class="loading-spinner"></div></div>`;

        if (tabName === "members") {
            const certs = await this.getPageCertifications(pageId, true);
            if (certs.length === 0) {
                container.innerHTML = `<p style="text-align: center; padding: 40px; color: var(--text-secondary);">Aucun membre certifié pour le moment.</p>`;
                return;
            }

            container.innerHTML = `
                <div class="team-list" style="max-height: 400px; overflow-y: auto;">
                    ${certs
                        .map(
                            (cert) => `
                        <div class="team-member-item" style="display: flex; align-items: center; gap: 15px; padding: 15px; border: 2px solid #eee; border-radius: 12px; margin-bottom: 10px;">
                            <img src="${cert.user?.avatar || "https://placehold.co/50"}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">
                            <div style="flex: 1;">
                                <div style="font-weight: 700;">${cert.user?.name}</div>
                                <div style="font-size: 0.85rem; color: var(--text-secondary);">${cert.title} • ${cert.type}</div>
                            </div>
                            <div style="display: flex; gap: 10px;">
                                <button class="btn btn-secondary btn-sm" onclick="window.professionalManager.handleDeleteCert('${cert.id}', '${pageId}')" style="padding: 5px 12px; font-size: 0.8rem; background: #fee2e2; color: #dc2626; border-color: #fecaca;">Supprimer</button>
                            </div>
                        </div>
                    `,
                        )
                        .join("")}
                </div>
            `;
        } else if (tabName === "add") {
            container.innerHTML = `
                <div class="add-member-form">
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: 700; margin-bottom: 10px;">Rechercher un utilisateur (Nom)</label>
                        <div style="position: relative;">
                            <input type="text" id="user-search-input" class="form-input" placeholder="Commencez à taper un nom..." autocomplete="off" style="width: 100%; background-color: #fff !important; color: #000 !important;">
                            <div id="user-search-results" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 100; background: #fff; border: 2px solid #000; max-height: 200px; overflow-y: auto; color: #000;"></div>
                        </div>
                    </div>

                    <div id="selected-user-preview" style="display: none; padding: 20px; border: 2px dashed #000; border-radius: 12px; margin-bottom: 20px; align-items: center; gap: 15px;">
                        <!-- JS Dynamic -->
                    </div>

                    <div id="certification-details" style="display: none;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                            <div class="form-group">
                                <label style="display: block; font-weight: 700; margin-bottom: 5px;">Type</label>
                                <select id="cert-type" class="form-input" style="width: 100%; background-color: #fff !important; color: #000 !important;">
                                    <option value="employee" style="background: #fff; color: #000;">Employé</option>
                                    <option value="student" style="background: #fff; color: #000;">Étudiant</option>
                                    <option value="partner" style="background: #fff; color: #000;">Partenaire</option>
                                    <option value="alumni" style="background: #fff; color: #000;">Ancien</option>
                                    <option value="contractor" style="background: #fff; color: #000;">Prestataire</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label style="display: block; font-weight: 700; margin-bottom: 5px;">Titre / Poste</label>
                                <input type="text" id="cert-title" class="form-input" placeholder="Ex: Lead Developer" style="width: 100%; background-color: #fff !important; color: #000 !important;">
                            </div>
                        </div>
                        <button id="submit-cert-btn" class="btn btn-primary" style="width: 100%; justify-content: center; height: 50px; font-size: 1.1rem;">Certifier cet utilisateur</button>
                    </div>
                </div>
            `;

            this.attachUserSearch(pageId);
        }
    }

    /**
     * Recherche d'utilisateur
     */
    attachUserSearch(pageId) {
        const input = document.getElementById("user-search-input");
        const results = document.getElementById("user-search-results");
        const preview = document.getElementById("selected-user-preview");
        const details = document.getElementById("certification-details");
        let selectedUserId = null;

        input.oninput = async (e) => {
            const val = e.target.value.trim();
            if (val.length < 2) {
                results.style.display = "none";
                return;
            }

            // Recherche via Supabase (table users)
            const { data, error } = await this.supabase
                .from("users")
                .select("id, name, avatar")
                .ilike("name", `%${val}%`)
                .limit(5);

            if (!error && data.length > 0) {
                results.innerHTML = data
                    .map(
                        (u) => `
                    <div class="user-option" data-id="${u.id}" data-name="${u.name}" data-avatar="${u.avatar || ""}" style="padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 10px; color: #000;">
                        <img src="${u.avatar || "https://placehold.co/30"}" style="width: 30px; height: 30px; border-radius: 50%;">
                        <span>${u.name}</span>
                    </div>
                `,
                    )
                    .join("");
                results.style.display = "block";
            } else {
                results.style.display = "none";
            }
        };

        results.onclick = (e) => {
            const option = e.target.closest(".user-option");
            if (option) {
                selectedUserId = option.dataset.id;
                const name = option.dataset.name;
                const avatar =
                    option.dataset.avatar || "https://placehold.co/50";

                preview.innerHTML = `
                    <img src="${avatar}" style="width: 50px; height: 50px; border-radius: 50%;">
                    <div style="flex: 1;">
                        <div style="font-weight: 700;">${name}</div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">Utilisateur sélectionné</div>
                    </div>
                    <button class="btn btn-secondary btn-sm" id="cancel-user-selection">Changer</button>
                `;
                preview.style.display = "flex";
                input.value = "";
                results.style.display = "none";
                input.parentElement.parentElement.style.display = "none";
                details.style.display = "block";

                document.getElementById("cancel-user-selection").onclick =
                    () => {
                        selectedUserId = null;
                        preview.style.display = "none";
                        input.parentElement.parentElement.style.display =
                            "block";
                        details.style.display = "none";
                    };
            }
        };

        document.getElementById("submit-cert-btn").onclick = async () => {
            if (!selectedUserId) return;
            const type = document.getElementById("cert-type").value;
            const title = document.getElementById("cert-title").value;

            try {
                await this.certifyUser(pageId, selectedUserId, type, { title });
                window.showToast?.("Utilisateur certifié avec succès !");
                await this.loadTeamTab(pageId, "members");
                const tabs = document.querySelectorAll(".tab-btn");
                tabs[0].classList.add("active");
                tabs[0].style.borderBottomColor = "#000";
                tabs[1].classList.remove("active");
                tabs[1].style.borderBottomColor = "transparent";
            } catch (err) {
                alert("Erreur: " + err.message);
            }
        };
    }

    async handleDeleteCert(certId, pageId) {
        if (!confirm("Révoquer cette certification ?")) return;
        try {
            await this.deleteCertification(certId);
            window.showToast?.("Certification révoquée.");
            await this.loadTeamTab(pageId, "members");
        } catch (err) {
            alert("Erreur: " + err.message);
        }
    }

    /**
     * Ouvre les réglages de la page (React Component)
     */
    async openPageSettings(pageId) {
        const waitForMount = async () => {
            const maxAttempts = 25;
            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                if (typeof window.mountProSettings === "function") {
                    return window.mountProSettings;
                }
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            return null;
        };

        const mount = await waitForMount();
        if (typeof mount !== "function") {
            alert("Le module de réglages n'est pas encore chargé.");
            console.warn("mountProSettings non défini après attente.");
            return;
        }

        const pageContainer = document.querySelector(
            "#pro-settings-page .pro-settings-page-container",
        );
        const closeHandler = () => {
            if (typeof window.navigateTo === "function") {
                window.navigateTo("pro-page");
            }
        };

        if (pageContainer) {
            mount(pageContainer, pageId, closeHandler, "page");
            if (typeof window.navigateTo === "function") {
                window.navigateTo("pro-settings-page");
            }
            return;
        }

        // Fallback : overlay React
        let overlay = document.getElementById("pro-settings-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "pro-settings-overlay";
            overlay.className =
                "fixed inset-0 bg-black/80 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm";
            document.body.appendChild(overlay);
        } else {
            overlay.style.display = "flex";
        }

        // On s'assure de passer les 4 arguments comme dans le cas pageContainer
        mount(
            overlay,
            pageId,
            () => {
                overlay.style.display = "none";
            },
            "overlay",
        );
    }

    /**
     * Ouvre le menu de création d'un ARC d'organisation
     */
    async openCreateOrgArc(pageId) {
        // On réutilise la logique de création d'ARC de arcs.js mais avec un context page_id
        if (window.openCreateModal) {
            window._pendingPageIdForArc = pageId;
            window.openCreateModal();
        }
    }

    /**
     * Valide officiellement une Trace d'un employé
     */
    async validateTrace(contentId, pageId) {
        const { data, error } = await this.supabase
            .from("content")
            .update({
                is_validated_pro: true,
                validated_by_page_id: pageId,
            })
            .eq("id", contentId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Retire la validation officielle
     */
    async invalidateTrace(contentId) {
        const { data, error } = await this.supabase
            .from("content")
            .update({
                is_validated_pro: false,
                validated_by_page_id: null,
            })
            .eq("id", contentId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Charge les publications de la page pro
     */
    async loadCompanyUpdates(pageId) {
        const container = document.getElementById("company-updates-container");
        if (!container) return;

        try {
            const { data: updates, error } = await this.supabase
                .from("content")
                .select("*")
                .eq("page_id", pageId)
                .order("created_at", { ascending: false });

            if (error) throw error;

            if (updates.length === 0) {
                container.innerHTML = `<p style="color: var(--text-secondary); font-style: italic; text-align: center; padding: 20px; border: 2px dashed #eee; border-radius: 12px;">Aucune actualité publiée par l'entreprise.</p>`;
                return;
            }

            const normalizedUpdates = updates.map((update) => ({
                ...update,
                type: update.metadata?.sub_type === "event" ? "event" : "news",
                createdAt: update.created_at,
            }));

            container.innerHTML = `
                <div class="pro-posts-carousel" tabindex="0" aria-label="Publications de la page">
                    ${normalizedUpdates
                        .map((update) => {
                            // On utilise la fonction de rendu globale si disponible, sinon fallback
                            if (
                                typeof window.renderProfileUpdateCard ===
                                "function"
                            ) {
                                return window.renderProfileUpdateCard(update, {
                                    profileUserId: update.user_id,
                                    currentUserId: window.currentUserId,
                                });
                            }

                            // Fallback (ancien style amélioré)
                            return `
                    <div class="timeline-card pro-feed-card" style="margin-bottom: 20px; padding: 25px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                            <h4 style="margin: 0; font-size: 1.2rem; font-family: var(--font-heading);">
                                ${update.metadata?.sub_type === "event" ? '<span style="background: #6366f1; color: #fff; font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; vertical-align: middle; margin-right: 8px;">ÉVÉNEMENT</span>' : ""}
                                ${update.title}
                            </h4>
                            <span style="font-size: 0.8rem; color: var(--text-secondary);">${new Date(update.created_at).toLocaleDateString()}</span>
                        </div>

                        ${
                            update.metadata?.sub_type === "event"
                                ? `
                            <div style="background: var(--bg-primary); padding: 12px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #6366f1; display: flex; flex-wrap: wrap; gap: 15px; font-size: 0.85rem;">
                                <span><i class="fas fa-calendar-alt" style="margin-right: 5px;"></i> ${update.metadata.event_date || "Date à venir"}</span>
                                <span><i class="fas fa-clock" style="margin-right: 5px;"></i> ${update.metadata.event_time || ""}</span>
                                <span><i class="fas fa-map-marker-alt" style="margin-right: 5px;"></i> ${update.metadata.location || "Lieu non défini"}</span>
                            </div>
                        `
                                : ""
                        }

                        <p style="white-space: pre-wrap; color: var(--text-secondary); line-height: 1.6; margin-bottom: 15px;">${update.description}</p>
                        ${
                            update.media_url
                                ? `
                            <div style="border-radius: 12px; overflow: hidden; margin-bottom: 15px; border: 1px solid var(--border-color);">
                                ${update.type === "video" ? `<video src="${update.media_url}" controls style="width: 100%;"></video>` : `<img src="${update.media_url}" style="width: 100%; object-fit: cover;">`}
                            </div>
                        `
                                : ""
                        }
                    </div>
                `;
                        })
                        .join("")}
                </div>
                <div class="pro-posts-scroll-hint" aria-hidden="true">
                    <span>Faites défiler pour voir les autres publications</span>
                    <span class="pro-posts-scroll-arrow">→</span>
                </div>
            `;
        } catch (err) {
            console.error(err);
            container.innerHTML = `<p style="color: #ef4444;">Erreur lors du chargement des actualités.</p>`;
        }
    }

    /**
     * Ouvre le menu de publication pour l'entreprise
     */
    async openCompanyPostMenu(pageId) {
        // On réutilise openCreateMenu mais en passant le pageId
        if (window.openCreateMenu) {
            // On a besoin que openCreateMenu supporte pageId.
            // On va devoir modifier js/app-supabase.js pour ça.

            // On injecte pageId dans le futur appel
            window._pendingPageId = pageId;
            window.openCreateMenu(window.currentUserId);
        } else {
            alert("Menu de création non disponible.");
        }
    }

    /**
     * Génère le HTML du badge "Seal of Approval"
     */
    renderSealOfApproval(content) {
        if (!content.isValidatedPro || !content.validatedByPageId) return "";

        const page = this.proPagesCache.get(content.validatedByPageId);
        const pageName = page ? page.name : "Organisation";
        const pageNameHtml =
            typeof window.renderVerifiedPageName === "function"
                ? window.renderVerifiedPageName(
                      pageName,
                      content.validatedByPageId,
                  )
                : pageName;
        const pageAvatar = page?.avatar_url || "icons/enterprise.svg";

        return `
            <div class="seal-of-approval" title="Validé officiellement par ${pageName}" style="display: flex; align-items: center; gap: 6px; background: #000; color: #fff; padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 800; border: 2px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.2); width: fit-content; margin-top: 5px;">
                <img src="${pageAvatar}" style="width: 14px; height: 14px; border-radius: 3px; object-fit: cover;">
                <span>VALIDÉ PAR ${pageNameHtml}</span>
                <span style="color: #00ff88;">✔</span>
            </div>
        `;
    }
    /**
     * Ouvre le menu de création LinkedIn-style pour les entreprises
     */
    async openProfessionalCreateMenu(pageId, initialType = "news") {
        const page = await this.getPageInfo(pageId);
        if (!page) return;

        let modal = document.getElementById("pro-create-modal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "pro-create-modal";
            modal.className = "modal-overlay-xxl";
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="onboarding-xxl pro-create-modal-content">
                <div class="modal-header pro-create-modal-header">
                    <h2>Créer une publication officielle</h2>
                    <button class="pro-create-modal-close" type="button" aria-label="Fermer" onclick="this.closest('.modal-overlay-xxl').remove()">×</button>
                </div>

                <div class="pro-create-tabs">
                    <button class="pro-tab-btn ${initialType === "news" ? "active" : ""}" data-type="news">
                        <i class="fas fa-newspaper"></i> Actualité
                    </button>
                    <button class="pro-tab-btn ${initialType === "event" ? "active" : ""}" data-type="event">
                        <i class="fas fa-calendar-alt"></i> Événement
                    </button>
                </div>

                <div id="pro-create-form-container">
                    <!-- Formulaire dynamique -->
                </div>

                <div class="modal-footer pro-create-modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay-xxl').remove()">Annuler</button>
                    <button id="pro-submit-btn" class="btn btn-primary">Publier maintenant</button>
                </div>
            </div>
        `;

        modal.style.display = "flex";
        modal.style.position = "fixed";
        modal.style.inset = "0";
        modal.style.backgroundColor = "rgba(0,0,0,0.85)";
        modal.style.backdropFilter = "blur(4px)";
        modal.style.zIndex = "11000";
        modal.style.justifyContent = "center";
        modal.style.alignItems = "center";

        const self = this;
        const renderForm = (type) => {
            const container = document.getElementById(
                "pro-create-form-container",
            );
            if (type === "news") {
                container.innerHTML = `
                    <div class="form-group pro-create-form-group">
                        <label>Titre de l'actualité</label>
                        <input type="text" id="pro-news-title" class="form-input" placeholder="LE TITRE DE VOTRE ACTUALITÉ" style="font-size: 1.1rem; font-weight: 700;">
                    </div>
                    <div class="form-group pro-create-form-group">
                        <label>Contenu</label>
                        <textarea id="pro-news-content" class="form-input" rows="8" placeholder="Écrivez votre annonce officielle ici..."></textarea>
                    </div>
                    <div class="form-group pro-create-form-group pro-create-media-group">
                        <label>Image de couverture (Optionnelle)</label>
                        <div id="pro-news-media-preview"></div>
                        <label class="btn btn-secondary pro-create-upload-control">
                            <i class="fas fa-image"></i> Ajouter un média
                            <input type="file" id="pro-news-file" accept="image/*" style="display: none;">
                        </label>
                        <input type="hidden" id="pro-news-media-url">
                    </div>
                `;

                // Correction : Activation de l'autocomplétion sur le textarea
                setTimeout(() => {
                    const textarea =
                        document.getElementById("pro-news-content");
                    if (window.attachMentionAutocomplete)
                        window.attachMentionAutocomplete(textarea);
                }, 50);

                const fileInput = document.getElementById("pro-news-file");
                fileInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const res = await window.uploadFile(file, "pro-pages/news");
                    if (res.success) {
                        document.getElementById("pro-news-media-url").value =
                            res.url;
                        const preview = document.getElementById(
                            "pro-news-media-preview",
                        );
                        preview.innerHTML = `<img src="${res.url}" style="width: 100%; border-radius: 8px; max-height: 200px; object-fit: cover;">`;
                        preview.style.display = "block";
                    }
                };
            } else {
                container.innerHTML = `
                    <div class="form-group pro-create-form-group">
                        <label>Nom de l'événement</label>
                        <input type="text" id="pro-event-title" class="form-input" placeholder="Ex: Web Summit 2026 - Meetup XERA1">
                    </div>
                    <div class="pro-create-event-grid">
                        <div class="form-group">
                            <label>Date</label>
                            <input type="date" id="pro-event-date" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Heure</label>
                            <input type="time" id="pro-event-time" class="form-input">
                        </div>
                    </div>
                    <div class="form-group pro-create-form-group">
                        <label>Lieu / Lien (Online)</label>
                        <input type="text" id="pro-event-location" class="form-input" placeholder="Ex: Paris, Station F ou Lien Zoom">
                    </div>
                    <div class="form-group pro-create-form-group">
                        <label>Description de l'événement</label>
                        <textarea id="pro-event-desc" class="form-input" rows="5" placeholder="Détails, agenda, intervenants..."></textarea>
                    </div>
                `;

                // Correction : Activation de l'autocomplétion sur le textarea
                setTimeout(() => {
                    const textarea = document.getElementById("pro-event-desc");
                    if (window.attachMentionAutocomplete)
                        window.attachMentionAutocomplete(textarea);
                }, 50);
            }
        };

        renderForm(initialType);

        const tabs = modal.querySelectorAll(".pro-tab-btn");
        tabs.forEach((tab) => {
            tab.onclick = () => {
                tabs.forEach((t) => t.classList.remove("active"));
                tab.classList.add("active");
                renderForm(tab.dataset.type);
            };
        });

        document.getElementById("pro-submit-btn").onclick = async () => {
            const activeType = modal.querySelector(".pro-tab-btn.active")
                .dataset.type;
            const btn = document.getElementById("pro-submit-btn");
            btn.disabled = true;
            btn.innerText = "Publication...";

            try {
                let payload = {
                    page_id: pageId,
                    user_id: window.currentUserId,
                    type: "text", // Par défaut, sera écrasé si média présent
                    state: "success", // Ajout du state pour éviter la contrainte NOT NULL
                    day_number: 0, // Correction : ajout du day_number pour éviter l'erreur NOT NULL
                    created_at: new Date().toISOString(),
                    metadata: {},
                };

                if (activeType === "news") {
                    payload.title =
                        document.getElementById("pro-news-title").value;
                    payload.description =
                        document.getElementById("pro-news-content").value;
                    payload.media_url =
                        document.getElementById("pro-news-media-url").value;
                    payload.type = payload.media_url ? "image" : "text";
                    payload.metadata.sub_type = "news";
                } else {
                    payload.title =
                        document.getElementById("pro-event-title").value;
                    payload.description =
                        document.getElementById("pro-event-desc").value;
                    payload.type = "text";
                    payload.metadata = {
                        sub_type: "event",
                        event_date:
                            document.getElementById("pro-event-date").value,
                        event_time:
                            document.getElementById("pro-event-time").value,
                        location:
                            document.getElementById("pro-event-location").value,
                    };
                }

                if (!payload.title || !payload.description) {
                    throw new Error(
                        "Veuillez remplir les champs obligatoires.",
                    );
                }

                const { data: createdContent, error } = await this.supabase
                    .from("content")
                    .insert(payload)
                    .select()
                    .single();

                if (error) throw error;

                // Notification des mentions @
                if (window.notifyMentions && createdContent) {
                    window
                        .notifyMentions(
                            payload.description,
                            createdContent.id,
                            window.currentUserId,
                            page.name || "Une Page Officielle",
                        )
                        .catch((e) =>
                            console.warn(
                                "Mention notification failed (pro):",
                                e,
                            ),
                        );
                }

                window.showToast?.("Publication réussie !");
                modal.remove();
                this.renderProPage(page.slug);
            } catch (err) {
                alert(err.message);
                btn.disabled = false;
                btn.innerText = "Publier maintenant";
            }
        };
    }

    /**
     * Rendu complet d'une Page Professionnelle
     */
    async renderProPage(slug) {
        console.log("[Pro] renderProPage starting for slug:", slug);

        const routeKey = `${window.location.pathname || ""}|${window.location.search || ""}|${slug || ""}`;
        const now = Date.now();
        if (
            window.__proPageRenderGuardKey === routeKey &&
            window.__proPageRenderGuardAt &&
            now - window.__proPageRenderGuardAt < 1200
        ) {
            return;
        }
        window.__proPageRenderGuardKey = routeKey;
        window.__proPageRenderGuardAt = now;

        const renderId = ++this.proPageRenderSequence;
        const isCurrentRender = () => renderId === this.proPageRenderSequence;

        const currentPath = window.location.pathname;
        const isProfilePage =
            currentPath.includes("profile.html") ||
            currentPath.endsWith("/profile") ||
            currentPath.includes("/pagepro");

        const hasProParam =
            new URLSearchParams(window.location.search).get("pro") === slug;

        // 1. Navigation / Redirection (Si on n'est pas sur la bonne page ou URL)
        if (!isProfilePage || !hasProParam) {
            console.log("[Pro] Redirecting to profile page with slug:", slug);
            const targetUrl = `profile.html?pro=${slug}`;

            if (
                window.XeraRouter &&
                typeof window.XeraRouter.navigate === "function"
            ) {
                window.XeraRouter.navigate("pagepro", { query: { pro: slug } });
            } else if (typeof window.navigateTo === "function") {
                window.navigateTo("pagepro", { query: { pro: slug } });
            } else {
                window.location.href = targetUrl;
            }
            return;
        }

        // 2. On est sur la bonne page, on prépare le rendu local
        const targetPage = document.getElementById("pro-page");
        if (targetPage) {
            const pages = document.querySelectorAll(".page");
            pages.forEach((p) => p.classList.remove("active"));
            targetPage.classList.add("active");
            console.log("[Pro] SPA Active section set to #pro-page");
        }

        let proContainer = document.querySelector(".pro-page-container");
        if (!proContainer) {
            proContainer = document.querySelector(".profile-container");
        }

        if (!proContainer) {
            console.warn(
                "[Pro] No container found for rendering pro page content",
            );
            return;
        }

        if (!isCurrentRender()) return;

        // Persister dans l'URL si on reste en mode SPA
        this.syncUrl({ pro: slug, explorer: null });

        if (typeof document !== "undefined" && document.body) {
            document.body.classList.add("is-pro");
        }

        ensureCompanyPageSkeletonStyles();
        proContainer.innerHTML = CompanyPageSkeleton();

        try {
            const { data: page, error } = await this.supabase
                .from("professional_pages")
                .select("*")
                .eq("slug", slug)
                .single();

            if (error || !page) throw new Error("Page introuvable");
            if (!isCurrentRender()) return;

            // Marquer la page courante pour re-rendu si on met à jour sa vérification
            try {
                window.currentProPageSlug = page.slug;
            } catch (e) {}

            const isOwner =
                window.currentUser && page.owner_id === window.currentUser.id;
            const pageFollowState = await this.getPageFollowState(page.id);
            const pageFollowHtml = isOwner
                ? ""
                : `<button id="page-follow-btn-${page.id}" class="btn-pro-primary pro-page-follow-btn${pageFollowState.isFollowing ? " is-following" : ""}" onclick="window.professionalManager.togglePageFollow('${page.id}')"><img src="icons/${pageFollowState.isFollowing ? "subscribed" : "subscribe"}.svg" class="btn-icon" style="width: 20px; height: 20px;"> ${pageFollowState.isFollowing ? "Abonné" : "S'abonner"}</button>`;
            if (typeof window.fetchVerifiedBadges === "function") {
                await window
                    .fetchVerifiedBadges()
                    .catch((verificationError) => {
                        console.warn(
                            "[Pro] Vérifications indisponibles, conservation du cache local:",
                            verificationError,
                        );
                    });
            }
            const isPageVerified =
                typeof window.isVerifiedPageId === "function"
                    ? window.isVerifiedPageId(page.id)
                    : false;

            const pageVerifiedBadgeHtml = isPageVerified
                ? `<span class="pro-badge-pill"><img src="icons/verify_page.svg" alt="Page Pro vérifiée" class="pro-page-verification-badge"> Page Professionnelle</span>`
                : `<span class="pro-badge-pill" style="background: rgba(255,255,255,0.05); color: var(--text-secondary);">Page Non-Vérifiée</span>`;

            const pageVerificationCtaHtml =
                isOwner && !isPageVerified
                    ? `<a href="subscription-plans.html?plan=page_verification&context=page-verification" class="btn-pro-action" style="margin-top:12px; text-decoration:none;">Vérifier la page</a>`
                    : "";

            const employees = await this.getPageCertifications(page.id);

            // Récupérer les ARCs de l'organisation
            const { data: orgArcs } = await this.supabase
                .from("arcs")
                .select("*")
                .eq("page_id", page.id)
                .order("created_at", { ascending: false });

            const toPublicMediaUrl = (value) => {
                const stored = String(value || "").trim();
                if (!stored) return "";
                if (/^(https?:|data:|blob:)/i.test(stored)) return stored;
                const path = stored.replace(/^\/+/, "").replace(/^media\//, "");
                try {
                    return (
                        this.supabase.storage.from("media").getPublicUrl(path)
                            .data.publicUrl || ""
                    );
                } catch (_) {
                    return "";
                }
            };
            const avatar =
                toPublicMediaUrl(page.avatar_url) || "icons/enterprise.svg";
            // Une bannière absente reste une surface éditoriale : aucune image externe
            // n'est ajoutée à la page professionnelle.
            // Older pages can contain either a complete Storage URL or its object
            // path. Normalize both forms identically for owners and visitors.
            const banner = toPublicMediaUrl(page.banner_url);
            const bannerAlt = this.escapeHtml(
                `Bannière de ${page.name || "la Page Pro"}`,
            );
            const pageOwner =
                window.currentUser?.id === page.owner_id
                    ? window.currentUser
                    : null;
            let pageOwnerSubscriptionActive = false;

            if (pageOwner) {
                pageOwnerSubscriptionActive =
                    typeof window.hasActivePaidPlan === "function"
                        ? window.hasActivePaidPlan(pageOwner)
                        : false;
            } else if (page.owner_id) {
                const { data: ownerProfile } = await this.supabase
                    .from("users")
                    .select("id, plan, plan_status, plan_ends_at")
                    .eq("id", page.owner_id)
                    .maybeSingle();
                pageOwnerSubscriptionActive =
                    typeof window.hasActivePaidPlan === "function"
                        ? window.hasActivePaidPlan(ownerProfile)
                        : false;
            }
            const pageProEntitlementsActive = this.hasPageProEntitlements(
                page.id,
                pageOwnerSubscriptionActive,
            );

            const recommendedProfiles =
                await this.getRecommendedProfilesForPage(page, employees);
            const recommendedProfilesHtml = this.renderRecommendedProfiles(
                recommendedProfiles,
                page,
                pageProEntitlementsActive,
            );
            const officialComparisonHtml = this.renderOfficialComparison(
                page,
                recommendedProfiles,
                pageProEntitlementsActive,
            );

            if (!isCurrentRender()) return;

            // Injection des styles premium spécifiques
            const proStyleId = "pro-page-premium-styles";
            let styleElement = document.getElementById(proStyleId);
            if (!styleElement) {
                styleElement = document.createElement("style");
                styleElement.id = proStyleId;
                document.head.appendChild(styleElement);
            }
            styleElement.textContent = `
                    #pro-page { padding-top: 76px !important; }
                    #pro-page .pro-page-container,
                    #pro-page .profile-container {
                        padding-top: 0 !important;
                    }
                    #pro-page .pro-page-container {
                        width: 100% !important;
                        max-width: none !important;
                        margin-inline: auto !important;
                        padding-inline: 0 !important;
                        box-sizing: border-box;
                    }

                    nav { transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important; }

                    .pro-page-wrapper {
                        max-width: 1100px;
                        width: 100%;
                        margin: 0 auto;
                        padding: 0 clamp(0.65rem, 2vw, 0.75rem) 12px;
                        background: #090909;
                        color: #fff;
                        font-family: 'Inter', sans-serif;
                        box-sizing: border-box;
                    }
                    .pro-header-card {
                        background: #141414;
                        border-radius: 24px;
                        overflow: hidden;
                        border: 1px solid rgba(255,255,255,0.06);
                        margin-bottom: 18px;
                        display: grid;
                    }
                    .pro-banner-container {
                        height: clamp(140px, 24vw, 180px);
                        position: relative;
                        background: linear-gradient(90deg, #6d28d9 0%, #f59e0b 100%);
                    }
                    .pro-banner-img {
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                    }
                    .pro-edit-banner-btn {
                        position: absolute;
                        top: 12px;
                        right: 12px;
                        width: 38px;
                        height: 38px;
                        background: rgba(0,0,0,0.48);
                        border: 1px solid rgba(255,255,255,0.22);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        color: #fff;
                        transition: all 0.2s;
                    }
                    .pro-edit-banner-btn:hover { background: rgba(0,0,0,0.75); transform: scale(1.05); }

                    .pro-header-info {
                        padding: 0 0 18px;
                        position: relative;
                        display: grid;
                        gap: 16px;
                        justify-items: center;
                        text-align: center;
                    }
                    .pro-avatar-overlap {
                        width: clamp(100px, 18vw, 120px);
                        height: clamp(100px, 18vw, 120px);
                        border-radius: 22px;
                        border: 4px solid #141414;
                        background: #141414;
                        margin: -52px 0 0 24px;
                        justify-self: start;
                        position: relative;
                        z-index: 10;
                        overflow: hidden;
                        box-shadow: 0 16px 28px rgba(0,0,0,0.22);
                    }
                    .pro-avatar-overlap img { width: 100%; height: 100%; object-fit: cover; }

                    @media (min-width: 1100px) {
                        .pro-header-info {
                            grid-template-columns: auto minmax(0, 1fr);
                            align-items: start;
                            gap: 28px;
                        }
                        .pro-avatar-overlap {
                            width: clamp(110px, 14vw, 132px);
                            height: clamp(110px, 14vw, 132px);
                            margin: -52px 0 0 32px;
                        }
                    }

                    .pro-main-details {
                        margin: 0 auto;
                        width: 100%;
                        padding: 0 10px;
                        text-align: center;
                    }
                    .pro-name-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; justify-content: center; }
                    .pro-name-row h2 { font-size: clamp(1.7rem, 6vw, 2.4rem); margin: 0; font-weight: 800; letter-spacing: -0.8px; line-height: 1.05; }
                    .pro-badge-pill { 
                        background: #8b5cf6;
                        color: #fff;
                        padding: 6px 14px;
                        border-radius: 999px;
                        font-size: 0.78rem;
                        font-weight: 600;
                    }
                    .pro-page-verification-badge {
                        width: 18px;
                        height: 18px;
                        vertical-align: middle;
                    }
                    .pro-industry-label { color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; margin-bottom: 6px; text-align: center; }
                    .pro-members-count { color: var(--text-secondary); font-size: 0.86rem; margin-top: 8px; text-align: center; }

                    .pro-secondary-details {
                        text-align: center;
                        margin-top: 0;
                        padding: 0 10px;
                    }
                    .pro-interests-label { color: var(--text-secondary); font-size: 0.72rem; font-weight: 600; margin-bottom: 10px; text-transform: uppercase; }
                    .pro-interest-list {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                        justify-content: center;
                        align-items: center;
                        margin: 0 auto;
                        max-width: 100%;
                    }
                    .pro-interest-chip {
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.12);
                        color: #ccc;
                        padding: 6px 12px;
                        border-radius: 999px;
                        font-size: 0.78rem;
                        transition: all 0.2s;
                        white-space: nowrap;
                        flex-shrink: 0;
                    }
                    .pro-interest-chip:hover { background: rgba(255,255,255,0.14); color: #fff; }
                    .pro-secondary-details > .pro-role-label { margin-top: 12px; color: var(--text-secondary); font-size: 0.8rem; font-weight: 600; }
                    .pro-secondary-details > .pro-role-label span { color: #fff; }

                    .pro-actions-row {
                        display: grid;
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                        gap: 10px;
                        margin: 12px auto 0;
                        padding: 0 10px 16px;
                        align-items: stretch;
                        justify-content: center;
                    }
                    .pro-actions-row > * {
                        width: 100%;
                        min-width: 0;
                    }
                    .btn-pro-primary,
                    .btn-pro-secondary {
                        min-height: 48px;
                        border-radius: 16px;
                        padding: 14px 16px;
                        font-weight: 700;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        width: 100%;
                        transition: all 0.2s;
                        font-size: clamp(0.88rem, 1vw, 0.98rem);
                        white-space: normal;
                    }
                    .btn-pro-primary {
                        background: #8b5cf6;
                        color: #fff;
                        border: none;
                    }
                    .btn-pro-primary:hover { background: #7c3aed; transform: translateY(-1px); }
                    .btn-pro-secondary {
                        background: rgba(255,255,255,0.03);
                        color: #fff;
                        border: 1px solid rgba(255,255,255,0.14);
                    }
                    .btn-pro-secondary:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.28); }

                    /* keep default centering (max-width set earlier); prevent horizontal scroll if any */
                    .pro-page-wrapper { overflow-x: hidden; }

                    .pro-features-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                        gap: 10px;
                        margin-bottom: 20px;
                    }

                    .pro-features-grid {
                        display: grid;
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                        gap: 10px;
                        margin-bottom: 20px;
                    }
                    .pro-features-grid > .feature-card-pro:nth-child(3) {
                        grid-column: 1 / -1;
                    }
                    .feature-card-pro {
                        background: #141414;
                        border-radius: 22px;
                        padding: 14px;
                        border: 1px solid rgba(255,255,255,0.08);
                        display: grid;
                        grid-template-columns: auto 1fr auto;
                        gap: 12px;
                        align-items: center;
                        min-height: 95px;
                        transition: all 0.25s ease;
                    }
                    .feature-card-pro:hover {
                        background: #181818;
                        border-color: #8b5cf6;
                        transform: translateY(-1px);
                        box-shadow: 0 10px 24px rgba(0,0,0,0.15);
                    }
                    .feature-icon-box {
                        width: 40px;
                        height: 40px;
                        border-radius: 14px;
                        background: rgba(139, 92, 246, 0.14);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #8b5cf6;
                        font-size: 1rem;
                    }
                    .feature-info {
                        display: grid;
                        gap: 6px;
                    }
                    .feature-info p {
                        margin: 0;
                        font-size: 0.8rem;
                        color: var(--text-secondary);
                        line-height: 1.4;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        display: -webkit-box;
                        -webkit-line-clamp: 1;
                        -webkit-box-orient: vertical;
                    }
                    .feature-info h4 { margin: 0; font-size: 0.98rem; font-weight: 700; }

                    .pro-info-carousel {
                        display: flex;
                        gap: 10px;
                        overflow-x: auto;
                        padding: 16px 0 10px;
                        margin-bottom: 14px;
                        scroll-snap-type: x mandatory;
                        -webkit-overflow-scrolling: touch;
                    }
                    .pro-info-carousel > section {
                        min-width: min(88vw, 280px);
                        width: min(88vw, 280px);
                        flex: 0 0 auto;
                        scroll-snap-align: start;
                        border-radius: 22px;
                        border: 1px solid rgba(255,255,255,0.08);
                        background: #141414;
                        padding: 16px;
                        box-sizing: border-box;
                    }
                    .pro-info-carousel::-webkit-scrollbar { height: 6px; }
                    .pro-info-carousel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 999px; }
                    .pro-info-carousel > section .pro-match-panel-head,
                    .pro-info-carousel > section .pro-versus-head {
                        margin-bottom: 10px;
                    }
                    .pro-info-carousel > section h3 { font-size: 1rem; margin: 0 0 4px; }
                    .pro-info-carousel > section p { font-size: 0.82rem; line-height: 1.4; margin: 0; color: var(--text-secondary); }
                    .pro-info-carousel .pro-match-list,
                    .pro-info-carousel .pro-versus-details {
                        margin-top: 10px;
                    }
                    .feature-info p { margin: 0; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.45; }
                    .feature-arrow { color: var(--text-secondary); opacity: 0.8; align-self: center; font-size: 0.9rem; }

                    .pro-content-layout {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 16px;
                    }
                    .pro-main-col,
                    .pro-page-sidebar {
                        width: 100%;
                    }
                    .pro-page-sidebar {
                        display: grid;
                        gap: 16px;
                    }

                    .pro-card-premium {
                        background: #141414;
                        border-radius: 22px;
                        padding: 18px;
                        border: 1px solid rgba(255,255,255,0.08);
                        margin-bottom: 0;
                    }

                    .pro-creation-card {
                        background: #141414;
                        border-radius: 22px;
                        padding: 18px;
                        border: 1px solid rgba(139, 92, 246, 0.16);
                        margin-bottom: 0;
                    }
                    .pro-creation-input-shell {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        background: rgba(255,255,255,0.03);
                        border-radius: 18px;
                        padding: 12px 14px;
                        border: 1px solid rgba(255,255,255,0.06);
                        margin-bottom: 14px;
                        width: 100%;
                    }
                    .pro-creation-input-shell img { width: 38px; height: 38px; border-radius: 14px; }
                    .pro-creation-input-shell button {
                        background: none; border: none; color: var(--text-secondary);
                        font-size: 0.95rem; padding: 10px 0; width: 100%; text-align: left; cursor: pointer;
                    }
                    .pro-creation-tabs {
                        display: grid;
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                        gap: 8px;
                    }
                    .pro-tab-item {
                        display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.88rem;
                        font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all 0.2s;
                        padding: 10px 12px; border-radius: 16px; background: rgba(255,255,255,0.05); text-align: center;
                        min-height: 44px;
                    }
                    .pro-tab-item:hover { color: #fff; background: rgba(255,255,255,0.08); }
                    .pro-tab-item.news i { color: #f59e0b; }
                    .pro-tab-item.event i { color: #ec4899; }
                    .pro-tab-item.project i { color: #3b82f6; }

                    @media (max-width: 720px) {
                        .pro-tab-item {
                            padding: 12px 0;
                            gap: 0;
                            justify-content: center;
                        }
                        .pro-tab-item span { display: none; }
                        .pro-tab-item i { font-size: 1.1rem; }
                    }

                    .pro-section-header {
                        display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 14px;
                    }
                    .pro-section-title { font-size: 1.1rem; font-weight: 800; margin: 0; letter-spacing: -0.4px; }
                    .btn-pill-small {
                        background: rgba(139, 92, 246, 0.12); color: #c4b5fd; border: none;
                        padding: 8px 14px; border-radius: 999px; font-size: 0.8rem; font-weight: 700; cursor: pointer;
                    }
                    .btn-pill-small:hover { background: #8b5cf6; color: #fff; }

                    .pro-empty-state {
                        text-align: center; padding: 22px; border: 2px dashed rgba(255,255,255,0.05); border-radius: 20px;
                        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
                    }
                    .pro-empty-icon { font-size: 2rem; color: #8b5cf6; margin-bottom: 0; }
                    .pro-empty-text { color: var(--text-secondary); font-size: 0.92rem; line-height: 1.5; margin: 0; }

                    .arc-card-pro-premium {
                        background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
                        border-radius: 22px; padding: 18px; transition: all 0.2s; border-left: 4px solid #8b5cf6;
                    }
                    .arc-card-pro-premium:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.14); }

                    .sidebar-card-premium {
                        background: #141414; border-radius: 22px; padding: 18px;
                        border: 1px solid rgba(255,255,255,0.08); margin-bottom: 0;
                    }
                    .matching-indicator {
                        display: flex; align-items: center; gap: 12px; margin-bottom: 14px;
                        padding: 12px; background: rgba(139, 92, 246, 0.05); border-radius: 14px;
                        border: 1px solid rgba(139, 92, 246, 0.12);
                    }

                    @media (max-width: 1024px) {
                        .pro-page-wrapper { padding: clamp(20px, 4vw, 32px); }
                        .pro-content-layout { grid-template-columns: 1fr; gap: 32px; }
                        .pro-features-grid { gap: 18px; }
                        .pro-header-info { align-items: stretch; }
                    }

                    @media (max-width: 900px) {
                        #pro-page { padding-top: 68px !important; }
                        .pro-banner-container { height: 220px; }
                        .pro-header-info { display: block; padding: 0 24px 32px; text-align: center; }
                        .pro-avatar-overlap { width: 120px; height: 120px; margin: -60px 0 15px 24px !important; border-width: 3px; justify-self: start; align-self: flex-start; }
                        .pro-main-details { margin: 0; text-align: center; padding: 0; width: 100%; }
                        .pro-name-row { justify-content: center; display: flex; width: 100%; }
                        .pro-interest-list { justify-content: center; display: flex; width: 100%; }
                        .pro-secondary-details { text-align: center; padding: 0; width: 100%; margin-top: 15px; }
                        .feature-card-pro { grid-template-columns: 1fr; min-height: auto; }
                        .feature-arrow { justify-self: start; }
                        .pro-creation-input-shell { flex-direction: column; align-items: stretch; }
                    }

                    @media (max-width: 768px) {
                        .pro-banner-container { height: 180px; }
                        .pro-header-card { border-radius: 0 0 24px 24px; }
                        .pro-header-info { padding: 0 18px 28px; }
                        .pro-name-row h2 { font-size: clamp(1.7rem, 5vw, 2rem); }
                        .btn-pro-primary, .btn-pro-secondary { padding: 14px 18px; }
                        .pro-section-title { font-size: 1.15rem; }
                        .pro-creation-tabs { gap: 10px; }
                        .pro-creation-card { padding: 22px; }
                        .pro-card-premium { padding: 24px; }
                    }

                    @media (max-width: 650px) {
                        #pro-page { padding-top: 68px !important; }
                        #pro-page .container.pro-page-container {
                            padding-top: 0 !important;
                            padding-left: 8px !important;
                            padding-right: 8px !important;
                            margin-left: 0 !important;
                            margin-right: 0 !important;
                            max-width: 100% !important;
                            width: 100% !important;
                            box-sizing: border-box !important;
                        }
                        .pro-banner-container { height: 160px; }
                        .pro-avatar-overlap { width: 100px; height: 100px; margin: -50px 0 10px 15px !important; align-self: flex-start; }
                        .pro-header-info { padding: 0 15px 24px !important; text-align: center !important; display: block !important; }
                        .pro-page-wrapper { padding-left: 0 !important; padding-right: 0 !important; max-width: 100% !important; margin: 0 !important; width: 100% !important; box-sizing: border-box !important; }
                        .pro-header-card { border-radius: 0 !important; border-left: none !important; border-right: none !important; width: 100% !important; margin-bottom: 15px !important; }
                        .pro-main-details { text-align: center !important; width: 100% !important; }
                        .pro-name-row { justify-content: center !important; display: flex !important; width: 100% !important; }
                        .pro-actions-row { grid-template-columns: repeat(3, 1fr) !important; gap: 8px !important; padding: 0 15px 20px !important; width: 100% !important; }
                        .btn-pro-primary, .btn-pro-secondary { padding: 12px 5px !important; min-height: 44px !important; font-size: 0.8rem !important; }
                        .btn-pro-label-short { display: inline !important; }
                        .btn-pro-label-long { display: none !important; }
                        .pro-creation-input-shell { padding: 14px 16px; }
                        .pro-creation-tabs { gap: 10px; }
                        .feature-icon-box { width: 44px; height: 44px; }
                        .feature-card-pro { padding: 20px; }
                        .pro-card-premium, .sidebar-card-premium, .pro-creation-card { padding: 22px; }
                    }

                    /* Portfolio institutionnel vivant — thème sombre local de la Page Pro. */
                    #pro-page { background: #090d16; }
                    #pro-page .pro-page-wrapper {
                        --pro-ink: #f5f3ff;
                        --pro-muted: #aab2c3;
                        --pro-line: #293244;
                        --pro-violet: #946cff;
                        --pro-violet-soft: #211947;
                        max-width: 100%;
                        padding: 28px 0 72px;
                        background: transparent;
                        color: var(--pro-ink);
                        font-family: inherit;
                        overflow: visible;
                    }
                    #pro-page .pro-header-card {
                        background: #101624;
                        border: 1px solid var(--pro-line);
                        border-radius: 24px;
                        box-shadow: 0 16px 38px rgba(17,24,39,.06);
                        margin-bottom: 22px;
                        overflow: visible;
                    }
                    #pro-page .pro-banner-container {
                        height: clamp(180px, 25vw, 260px);
                        border-radius: 23px 23px 0 0;
                        overflow: hidden;
                        background:
                          linear-gradient(120deg, rgba(15,23,42,.25), rgba(109,61,245,.16)),
                          linear-gradient(135deg, #111827 0%, #25334c 54%, #6850bb 100%);
                    }
                    #pro-page .pro-banner-container::after {
                        content: ''; position: absolute; inset: 0;
                        background: linear-gradient(90deg, rgba(17,24,39,.36), transparent 62%);
                        pointer-events: none;
                    }
                    #pro-page .pro-banner-img { filter: saturate(.82) contrast(1.04); }
                    #pro-page .pro-edit-banner-btn {
                        z-index: 2; width: 40px; height: 40px; border-radius: 12px;
                        background: rgba(17,24,39,.78); border-color: rgba(255,255,255,.28);
                    }
                    #pro-page .pro-header-info {
                        grid-template-columns: minmax(0, 1fr) minmax(280px, .8fr);
                        justify-items: stretch;
                        align-items: end;
                        gap: 22px;
                        padding: 0 30px 24px;
                        text-align: left;
                    }
                    #pro-page .pro-header-info > div:first-child { display: grid; grid-template-columns: 126px minmax(220px,1fr); min-width: 0; gap: 22px; align-items: end; }
                    #pro-page .pro-avatar-overlap {
                        width: 126px; height: 126px; margin: -72px 0 0;
                        border: 5px solid #101624; border-radius: 22px; background: #101624;
                        box-shadow: 0 12px 28px rgba(0,0,0,.32);
                    }
                    #pro-page .pro-main-details { min-width: 0; padding: 0; margin: 0; text-align: left; }
                    #pro-page .pro-industry-label { color: var(--pro-violet); font-size: .72rem; text-align: left; margin: 0 0 7px; overflow-wrap: anywhere; }
                    #pro-page .pro-name-row { justify-content: flex-start; gap: 9px; margin-bottom: 6px; }
                    #pro-page .pro-name-row h2 { min-width: 0; color: var(--pro-ink); font-size: clamp(1.65rem, 3.4vw, 2.45rem); letter-spacing: -1.35px; overflow-wrap: anywhere; }
                    #pro-page .pro-badge-pill { border-radius: 8px; padding: 5px 9px; background: var(--pro-violet-soft); color: #5130c7; font-size: .7rem; }
                    #pro-page .pro-members-count { margin: 0; text-align: left; color: var(--pro-muted); }
                    #pro-page .pro-secondary-details {
                        min-width: min(330px, 100%); padding: 14px 0 0 22px;
                        border-left: 1px solid var(--pro-line); text-align: left;
                    }
                    #pro-page .pro-interests-label { color: var(--pro-muted); text-align: left; letter-spacing: .08em; }
                    #pro-page .pro-interest-list { justify-content: flex-start; margin: 0; }
                    #pro-page .pro-interest-chip { max-width: 100%; background: #171f30; border-color: #344057; color: #d5d9e3; border-radius: 9px; padding: 6px 9px; white-space: normal; overflow-wrap: anywhere; }
                    #pro-page .pro-interest-chip:hover { background: #282051; color: #f3efff; border-color: #6e55c7; }
                    #pro-page .pro-secondary-details > .pro-role-label { color: var(--pro-muted); }
                    #pro-page .pro-secondary-details > .pro-role-label span { color: var(--pro-ink); }
                    #pro-page .pro-actions-row {
                        display: flex;
                        flex-wrap: wrap;
                        justify-content: flex-start;
                        padding: 0 30px 26px;
                        margin: 0;
                        gap: 12px;
                        border-top: 1px solid var(--pro-line);
                        padding-top: 20px;
                    }
                    #pro-page .pro-actions-row > * { width: auto; flex: 0 0 auto; }
                    #pro-page .btn-pro-label-short { display: none !important; }
                    #pro-page .btn-pro-primary, #pro-page .btn-pro-secondary {
                        width: auto; min-height: 42px; border-radius: 10px; padding: 10px 15px;
                        font-size: .86rem; box-sizing: border-box; text-decoration: none;
                    }
                    #pro-page .btn-pro-primary { background: var(--pro-violet); box-shadow: 0 7px 15px rgba(109,61,245,.18); }
                    #pro-page .btn-pro-primary:hover { background: #5930d4; transform: translateY(-1px); }
                    #pro-page .btn-pro-secondary { background: #171f2e; color: #e5e7ef; border-color: #38445a; }
                    #pro-page .btn-pro-secondary:hover { background: #242d40; border-color: #7961d7; color: #fff; }
                    #pro-page .pro-features-grid { grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; margin-bottom: 24px; }
                    #pro-page .pro-features-grid > .feature-card-pro:nth-child(3) { grid-column: auto; }
                    #pro-page .feature-card-pro { background: #121826; color: var(--pro-ink); border-color: var(--pro-line); border-radius: 16px; min-height: 110px; padding: 16px; }
                    #pro-page .feature-card-pro:hover { background: #171f30; border-color: #6250aa; box-shadow: 0 10px 24px rgba(0,0,0,.25); }
                    #pro-page .feature-icon-box { background: var(--pro-violet-soft); color: var(--pro-violet); border-radius: 11px; }
                    #pro-page .feature-info h4 { color: var(--pro-ink); }
                    #pro-page .feature-info p, #pro-page .feature-arrow { color: var(--pro-muted); }
                    #pro-page .pro-info-carousel { padding: 0 30px 24px; margin: 0; }
                    #pro-page .pro-info-carousel > section { background: #161e2d; border-color: var(--pro-line); border-radius: 14px; color: var(--pro-ink); }
                    #pro-page .pro-content-layout { grid-template-columns: minmax(0, 1fr) 310px; align-items: start; gap: 26px; min-width: 0; }
                    #pro-page .pro-main-col { display: grid; gap: 22px; }
                    #pro-page .pro-main-col,
                    #pro-page .pro-page-sidebar,
                    #pro-page .pro-card-premium,
                    #pro-page .pro-about-card { min-width: 0; }
                    #pro-page .pro-page-sidebar { position: static; align-self: start; gap: 12px; }
                    #pro-page .pro-card-premium, #pro-page .sidebar-card-premium, #pro-page .pro-creation-card {
                        background: #121826; color: var(--pro-ink); border-color: var(--pro-line); border-radius: 16px;
                        box-shadow: 0 8px 22px rgba(0,0,0,.2);
                    }
                    #pro-page .pro-about-card { width: 100%; max-width: 100%; box-sizing: border-box; }
                    #pro-page .pro-about-copy { max-width: 100%; overflow-wrap: anywhere; word-break: break-word; }
                    #pro-page .pro-page-wrapper,
                    #pro-page .pro-page-wrapper * { box-sizing: border-box; }
                    #pro-page img { max-width: 100%; }
                    #pro-page .pro-creation-card { padding: 16px; border-top: 3px solid var(--pro-violet); }
                    #pro-page .pro-creation-input-shell { background: #0d1320; border-color: #273146; border-radius: 12px; margin-bottom: 11px; }
                    #pro-page .pro-creation-input-shell button { color: var(--pro-muted); }
                    #pro-page .pro-tab-item { color: var(--pro-muted); background: transparent; border-radius: 9px; min-height: 39px; }
                    #pro-page .pro-tab-item:hover { background: var(--pro-violet-soft); color: #5130c7; }
                    #pro-page .pro-section-header { margin: 0; padding: 0 2px; }
                    #pro-page .pro-section-title { color: var(--pro-ink); font-size: 1.12rem; letter-spacing: -.45px; }
                    #pro-page .btn-pill-small { border-radius: 9px; color: #5130c7; background: var(--pro-violet-soft); }
                    #pro-page .btn-pill-small:hover { background: var(--pro-violet); }
                    #pro-page .org-arcs-grid { grid-template-columns: repeat(auto-fit,minmax(240px,1fr)) !important; gap: 13px !important; margin: -7px 0 0 !important; }
                    #pro-page .arc-card-pro-premium { background: #121826; color: var(--pro-ink); border-color: var(--pro-line); border-left: 3px solid var(--pro-violet); border-radius: 14px; padding: 18px; }
                    #pro-page .arc-card-pro-premium:hover { background: #171f30; border-color: #6250aa; box-shadow: 0 10px 25px rgba(0,0,0,.25); transform: translateY(-2px); }
                    #pro-page .pro-empty-state { border-color: #313b4e; background: #101624; color: var(--pro-ink); }
                    #pro-page .pro-empty-text { color: var(--pro-muted); }
                    #pro-page #company-updates-container { margin: -8px 0 0 !important; }
                    #pro-page .employees-grid { margin: -7px 0 0 !important; }
                    #pro-page .employees-grid .pro-card-premium:hover { border-color: #cfc5ff; transform: translateY(-2px); }
                    #pro-page .sidebar-card-premium { padding: 20px; }
                    #pro-page .sidebar-card-premium small { color: var(--pro-muted) !important; }
                    #pro-page .pro-main-col > h3.pro-section-title { margin: 0 !important; }
                    #pro-page .pro-main-col > .pro-card-premium { margin: -7px 0 0 !important; }
                    #pro-page :is(button,a):focus-visible { outline: 3px solid rgba(109,61,245,.35); outline-offset: 3px; }
                    @media (min-width: 901px) {
                        #pro-page .pro-avatar-overlap { transform: translateY(-70px); }
                    }
                    @media (max-width: 900px) {
                        #pro-page .pro-header-info { grid-template-columns: 1fr; padding: 0 22px 20px; }
                        #pro-page .pro-secondary-details { border-left: 0; border-top: 1px solid var(--pro-line); padding: 16px 0 0; }
                        #pro-page .pro-content-layout { grid-template-columns: 1fr; }
                        #pro-page .pro-page-sidebar { position: static; }
                        #pro-page .pro-features-grid { grid-template-columns: 1fr; }
                    }
                    @media (max-width: 620px) {
                        #pro-page .pro-page-wrapper { padding: 0 0 42px; }
                        #pro-page .pro-header-card { border-radius: 16px; }
                        #pro-page .pro-banner-container { height: 150px; border-radius: 15px 15px 0 0; }
                        #pro-page .pro-header-info { padding: 0 17px 17px; }
                        #pro-page .pro-header-info > div:first-child { grid-template-columns: 82px minmax(0,1fr); gap: 14px; }
                        #pro-page .pro-avatar-overlap { width: 82px; height: 82px; margin-top: -47px; border-radius: 17px; }
                        #pro-page .pro-name-row h2 { font-size: 1.48rem; }
                        #pro-page .pro-actions-row { padding: 16px 17px 20px; gap: 8px; }
                        #pro-page .btn-pro-primary, #pro-page .btn-pro-secondary { flex: 1 1 auto; justify-content: center; padding: 10px; }
                        #pro-page .pro-info-carousel { padding: 0 17px 18px; }
                        #pro-page .pro-content-layout { gap: 20px; padding: 0 14px; }
                        #pro-page .pro-card-premium, #pro-page .sidebar-card-premium, #pro-page .pro-creation-card { padding: 16px; }
                    }

                    /* Variante sombre par défaut : les surfaces internes restent calmes et très lisibles. */
                    #pro-page { background: #090d16; }
                    #pro-page .pro-page-wrapper {
                        --pro-ink: #f5f3ff;
                        --pro-muted: #aab2c3;
                        --pro-line: #293244;
                        --pro-violet: #946cff;
                        --pro-violet-soft: #211947;
                        background: #090d16;
                    }
                    #pro-page .pro-header-card,
                    #pro-page .feature-card-pro,
                    #pro-page .pro-card-premium,
                    #pro-page .sidebar-card-premium,
                    #pro-page .pro-creation-card,
                    #pro-page .arc-card-pro-premium {
                        background: #121826;
                        border-color: var(--pro-line);
                        box-shadow: 0 14px 32px rgba(0,0,0,.18);
                    }
                    #pro-page .pro-header-card { background: #101624; }
                    #pro-page .pro-banner-container {
                        background: linear-gradient(120deg, rgba(0,0,0,.25), rgba(116,76,224,.16)), linear-gradient(135deg, #080c14 0%, #17253c 58%, #493b82 100%);
                    }
                    #pro-page .pro-banner-img { display: block; position: relative; z-index: 1; }
                    #pro-page .pro-banner-container.pro-banner-unavailable {
                        background: #0b1120 !important;
                    }
                    #pro-page .pro-banner-container.pro-banner-unavailable::after { display: none; }
                    #pro-page .pro-avatar-overlap { border-color: #101624; background: #101624; }
                    #pro-page .pro-name-row h2,
                    #pro-page .feature-info h4,
                    #pro-page .pro-section-title,
                    #pro-page .pro-secondary-details > .pro-role-label span { color: var(--pro-ink); }
                    #pro-page .pro-interest-chip { background: #171f30; border-color: #344057; color: #d5d9e3; }
                    #pro-page .pro-interest-chip:hover { background: #282051; border-color: #6e55c7; color: #f3efff; }
                    #pro-page .pro-actions-row { border-top-color: var(--pro-line); }
                    #pro-page .btn-pro-secondary { background: #171f2e; color: #e5e7ef; border-color: #38445a; }
                    #pro-page .btn-pro-secondary:hover { background: #242d40; border-color: #7961d7; color: #fff; }
                    #pro-page .feature-card-pro:hover,
                    #pro-page .arc-card-pro-premium:hover { background: #171f30; border-color: #6250aa; box-shadow: 0 14px 30px rgba(0,0,0,.25); }
                    #pro-page .pro-info-carousel > section { background: #161e2d; border-color: var(--pro-line); color: var(--pro-ink); }
                    #pro-page .pro-creation-card { border-top-color: var(--pro-violet); }
                    #pro-page .pro-creation-input-shell { background: #0d1320; border-color: #273146; }
                    #pro-page .pro-tab-item:hover { background: #211947; color: #d8ccff; }
                    #pro-page .btn-pill-small { background: #211947; color: #d8ccff; }
                    #pro-page .btn-pill-small:hover { background: var(--pro-violet); color: #fff; }
                    #pro-page .pro-empty-state { background: #101624; border-color: #313b4e; }
                    #pro-page .pro-page-follow-count {
                        display: inline-flex; align-items: center; min-height: 42px;
                        padding: 0 13px; border: 1px solid #39455c; border-radius: 10px;
                        color: var(--pro-muted); font-size: .84rem; gap: 4px;
                    }
                    #pro-page .pro-page-follow-count strong { color: #fff; }
                    #pro-page .pro-public-stats {
                        display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
                        margin: 0 30px 28px; border: 1px solid var(--pro-line); border-radius: 14px;
                        background: #0c1220; overflow: hidden;
                    }
                    #pro-page .pro-stat-item { padding: 15px 17px; border-right: 1px solid var(--pro-line); }
                    #pro-page .pro-stat-item:last-child { border-right: 0; }
                    #pro-page .pro-stat-item strong { display: block; color: #fff; font-size: 1.18rem; letter-spacing: -.03em; }
                    #pro-page .pro-stat-item span { display: block; margin-top: 3px; color: var(--pro-muted); font-size: .73rem; font-weight: 600; }
                    /* Neutralise les couleurs héritées écrites en ligne sur les surfaces sombres. */
                    #pro-page .arc-card-pro-premium p,
                    #pro-page .pro-card-premium p,
                    #pro-page .employees-grid .pro-card-premium [style*="color"],
                    #pro-page .sidebar-card-premium [style*="color"] { color: var(--pro-muted) !important; }
                    #pro-page .arc-card-pro-premium h4,
                    #pro-page .employees-grid .pro-card-premium [style*="font-weight: 700"] { color: var(--pro-ink) !important; }
                    #pro-page .arc-card-pro-premium .badge { background: #26203f !important; color: #ded5ff !important; border: 1px solid #4e3f83; }
                    #pro-page .arc-card-pro-premium span[style*="color: #8b5cf6"],
                    #pro-page .employees-grid .pro-card-premium [style*="color: #8b5cf6"] { color: #b9a6ff !important; }
                    @media (max-width: 620px) {
                        #pro-page .pro-page-wrapper { background: #090d16 !important; }
                        #pro-page .pro-public-stats { grid-template-columns: repeat(2, minmax(0,1fr)); margin: 0 17px 20px; }
                        #pro-page .pro-stat-item:nth-child(2) { border-right: 0; }
                        #pro-page .pro-stat-item:nth-child(-n+2) { border-bottom: 1px solid var(--pro-line); }
                    }

                    /* Derniere garde responsive : le contenu doit toujours pouvoir
                       retrecir avant de forcer une largeur au viewport. */
                    #pro-page .pro-page-wrapper,
                    #pro-page .pro-page-wrapper * { min-width: 0; }
                    #pro-page .pro-page-wrapper h1,
                    #pro-page .pro-page-wrapper h2,
                    #pro-page .pro-page-wrapper h3,
                    #pro-page .pro-page-wrapper h4,
                    #pro-page .pro-page-wrapper p,
                    #pro-page .pro-page-wrapper span,
                    #pro-page .pro-page-wrapper a,
                    #pro-page .pro-page-wrapper button {
                        overflow-wrap: anywhere;
                    }
                    #pro-page .pro-actions-row {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 12px;
                    }
                    #pro-page .pro-actions-row > * {
                        width: auto;
                        flex: 0 1 auto;
                        min-width: 0;
                        max-width: 100%;
                    }
                    #pro-page .pro-actions-row .btn-icon {
                        flex: 0 0 auto;
                    }
                    #pro-page .pro-public-stats {
                        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                    }
                    #pro-page .pro-stat-item {
                        min-width: 0;
                        overflow-wrap: anywhere;
                    }
                    #pro-page .pro-info-carousel > section,
                    #pro-page .pro-card-premium,
                    #pro-page .sidebar-card-premium,
                    #pro-page .arc-card-pro-premium,
                    #pro-page .feature-card-pro {
                        overflow-wrap: anywhere;
                    }
                    #pro-page .feature-card-pro {
                        min-height: 0;
                        height: auto;
                        align-items: start;
                    }
                    #pro-page .feature-info {
                        min-height: 0;
                    }
                    #pro-page .feature-info p {
                        display: block;
                        overflow: visible;
                        text-overflow: clip;
                        -webkit-line-clamp: unset;
                        -webkit-box-orient: initial;
                    }
                    #pro-page .pro-info-carousel > section,
                    #pro-page .pro-public-stats,
                    #pro-page .pro-stat-item,
                    #pro-page .org-arcs-grid,
                    #pro-page .employees-grid {
                        height: auto;
                        grid-auto-rows: max-content;
                    }
                    #pro-page .pro-empty-state {
                        min-height: 0;
                    }
                    #pro-page {
                        max-width: 100%;
                        overflow-x: clip;
                    }
                    #pro-page .pro-page-container,
                    #pro-page .pro-page-wrapper,
                    #pro-page .pro-content-layout,
                    #pro-page .pro-main-col,
                    #pro-page .pro-page-sidebar,
                    #pro-page #company-updates-container {
                        width: 100%;
                        max-width: 100%;
                        min-width: 0;
                    }
                    #pro-page .pro-posts-carousel {
                        width: 100%;
                        max-width: 100%;
                        min-width: 0;
                        overflow-x: auto;
                        overflow-y: hidden;
                        align-items: stretch;
                    }
                    #pro-page .pro-posts-carousel .pro-feed-card {
                        flex: 0 1 min(640px, 100%);
                        width: min(640px, 100%);
                        max-width: 100%;
                        min-width: 0;
                    }
                    #pro-page .pro-feed-card img,
                    #pro-page .pro-feed-card video {
                        display: block;
                        width: 100%;
                        max-width: 100%;
                        height: auto;
                    }
                    #pro-page .pro-feed-card > div,
                    #pro-page .pro-feed-card h3,
                    #pro-page .pro-feed-card p,
                    #pro-page .pro-feed-card .profile-update-stats {
                        min-width: 0;
                        max-width: 100%;
                        overflow-wrap: anywhere;
                    }
                    #pro-page .pro-feed-card > div > div:first-of-type,
                    #pro-page .pro-card-footer,
                    #pro-page .pro-event-details {
                        flex-wrap: wrap;
                        gap: 12px;
                    }
                    #pro-page .pro-card-footer > *,
                    #pro-page .pro-event-details > * {
                        min-width: 0;
                        max-width: 100%;
                    }
                    #pro-page .pro-info-carousel {
                        width: 100%;
                        max-width: 100%;
                        min-width: 0;
                        overflow-x: auto;
                        overflow-y: hidden;
                    }
                    #pro-page .pro-info-carousel > section {
                        flex: 0 1 min(420px, 100%);
                        width: min(420px, 100%);
                        max-width: 100%;
                        min-width: min(280px, 100%);
                    }
                    #pro-page .pro-creation-input-shell button {
                        min-width: 0;
                        overflow-wrap: anywhere;
                    }
                    #pro-page .employees-grid {
                        grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)) !important;
                    }
                    #pro-page .certified-team-view-all {
                        display: flex; align-items: center; justify-content: center; gap: 10px;
                        width: 100%; min-height: 48px; margin: -22px 0 40px; padding: 12px 18px;
                        border: 1px solid #6650a9; border-radius: 12px; background: #211947;
                        color: #eeeaff; font-weight: 800; cursor: pointer; transition: .2s ease;
                    }
                    #pro-page .certified-team-view-all:hover { background: #302365; border-color: #9d83ff; transform: translateY(-1px); }
                    .certified-directory-loading { display: grid; place-items: center; min-height: 55vh; }
                    .certified-directory { max-width: 1120px; margin: 0 auto; padding: 32px 20px 72px; color: #f5f3ff; }
                    .certified-directory-topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
                    .certified-directory-back { display: inline-flex; align-items: center; gap: 9px; border: 0; background: transparent; color: #b9b0d9; font-weight: 700; cursor: pointer; padding: 8px 0; }
                    .certified-directory-back:hover { color: #fff; }
                    .certified-directory-kicker { color: #a992ff; font-size: .72rem; font-weight: 900; letter-spacing: .14em; }
                    .certified-directory-hero { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 30px; border: 1px solid #2b354b; border-radius: 24px; background: linear-gradient(135deg, #151d2c, #101522); box-shadow: 0 18px 45px rgba(0,0,0,.22); }
                    .certified-directory-brand { display: flex; align-items: center; gap: 18px; min-width: 0; }
                    .certified-directory-brand img { width: 76px; height: 76px; flex: 0 0 76px; object-fit: cover; border-radius: 20px; border: 1px solid #46516b; }
                    .certified-directory-brand p { margin: 0 0 6px; color: #a992ff; font-size: .72rem; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
                    .certified-directory-brand h1 { margin: 0 0 8px; font-size: clamp(1.5rem, 3vw, 2.5rem); line-height: 1.05; }
                    .certified-directory-brand span { color: #aab2c3; }
                    .certified-directory-total { min-width: 140px; padding-left: 24px; border-left: 1px solid #35405a; }
                    .certified-directory-total strong { display: block; color: #c2b3ff; font-size: 2rem; }
                    .certified-directory-total span { color: #aab2c3; font-size: .82rem; }
                    .certified-directory-search { display: flex; align-items: center; gap: 12px; margin: 24px 0; padding: 0 18px; min-height: 58px; border: 1px solid #3a4660; border-radius: 14px; background: #0e1420; box-shadow: 0 12px 30px rgba(0,0,0,.14); }
                    .certified-directory-search i { color: #a992ff; }
                    .certified-directory-search input { width: 100%; border: 0; outline: 0; background: transparent; color: #fff; font-size: 1rem; }
                    .certified-directory-search input::placeholder { color: #7f899d; }
                    .certified-directory-results-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 0 14px; }
                    .certified-directory-results-head h2 { margin: 0; font-size: 1.1rem; }
                    .certified-directory-results-head span { color: #8993a7; font-size: .86rem; }
                    .certified-directory-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
                    .certified-directory-card { display: flex; align-items: center; gap: 13px; min-width: 0; padding: 16px; border: 1px solid #2b354b; border-radius: 16px; background: #151d2c; color: #f5f3ff; text-align: left; cursor: pointer; transition: .2s ease; }
                    .certified-directory-card:hover { border-color: #8068d1; background: #1b2540; transform: translateY(-2px); }
                    .certified-directory-card img { width: 54px; height: 54px; flex: 0 0 54px; border-radius: 50%; object-fit: cover; border: 2px solid #55468b; }
                    .certified-directory-card-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 3px; }
                    .certified-directory-card-copy strong, .certified-directory-card-copy span, .certified-directory-card-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                    .certified-directory-card-copy span { color: #c3b5ff; font-size: .84rem; font-weight: 700; }
                    .certified-directory-card-copy small { color: #98a2b5; }
                    .certified-directory-card > i { color: #8d78e3; font-size: .8rem; }
                    .certified-directory-empty { display: grid; place-items: center; gap: 10px; min-height: 260px; padding: 30px; border: 1px dashed #39445c; border-radius: 18px; color: #9ba5b8; text-align: center; }
                    .certified-directory-empty i { color: #8d78e3; font-size: 1.6rem; }
                    @media (max-width: 700px) {
                        #pro-page .employees-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
                        #pro-page .employees-grid .pro-card-premium { padding: 15px 8px !important; }
                        #pro-page .employees-grid .pro-card-premium img { width: 58px !important; height: 58px !important; }
                        .certified-directory { padding: 20px 16px 48px; }
                        .certified-directory-topbar { align-items: flex-start; flex-direction: column-reverse; gap: 8px; }
                        .certified-directory-hero { align-items: flex-start; flex-direction: column; padding: 22px 18px; }
                        .certified-directory-total { width: 100%; padding: 14px 0 0; border-left: 0; border-top: 1px solid #35405a; }
                        .certified-directory-grid { grid-template-columns: 1fr; }
                    }
                    .talent-explorer-page,
                    .talent-explorer-page * { min-width: 0; box-sizing: border-box; }
                    .talent-explorer-page h1,
                    .talent-explorer-page p,
                    .talent-explorer-page span,
                    .talent-explorer-page button { overflow-wrap: anywhere; }
                    .talent-explorer-page .talent-explorer-header > div[style*="justify-content: space-between"] {
                        flex-wrap: wrap;
                        gap: 20px;
                    }
                    .talent-explorer-page .talent-search-box {
                        flex-wrap: wrap;
                    }
                    .talent-explorer-page .talent-search-box input {
                        min-width: 0;
                    }

                    @media (max-width: 700px) {
                        #pro-page .pro-page-wrapper { padding-bottom: 28px; }
                        #pro-page .pro-actions-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                        #pro-page .pro-public-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                        #pro-page .pro-posts-carousel .pro-feed-card {
                            flex-basis: 100%;
                            width: 100%;
                        }
                        #pro-page .pro-feed-card > div { padding: 18px !important; }
                        #pro-page .pro-feed-card h3 { font-size: clamp(1.05rem, 5vw, 1.35rem) !important; }
                        #pro-page .pro-feed-card .pro-post-description { max-height: none; }
                        #pro-page .pro-info-carousel > section { flex-basis: min(100%, 360px); }
                        .talent-explorer-page { padding: 12px !important; }
                        .talent-explorer-page .talent-explorer-header { padding: 22px !important; border-radius: 22px !important; margin-bottom: 22px !important; }
                        .talent-explorer-page .talent-explorer-header h1 { font-size: clamp(1.75rem, 8vw, 2.35rem) !important; }
                        .talent-explorer-page .talent-explorer-header p { font-size: 1rem !important; }
                        .talent-explorer-page .talent-search-box { gap: 8px !important; }
                        .talent-explorer-page .talent-search-box i { padding: 12px !important; }
                        .talent-explorer-page .talent-search-box input { flex: 1 1 calc(100% - 54px) !important; font-size: 1rem !important; }
                        .talent-explorer-page .talent-search-box button { flex: 1 1 100%; min-height: 46px; padding: 12px 20px !important; }
                    }
                    @media (max-width: 420px) {
                        #pro-page .pro-actions-row { grid-template-columns: 1fr; }
                        #pro-page .pro-public-stats { grid-template-columns: 1fr; }
                        #pro-page .pro-stat-item { border-right: 0 !important; border-bottom: 1px solid var(--pro-line); }
                        #pro-page .pro-stat-item:last-child { border-bottom: 0; }
                        #pro-page .pro-name-row { align-items: flex-start; flex-direction: column; }
                        #pro-page .pro-name-row h2 { font-size: 1.35rem; }
                        #pro-page .pro-page-follow-count { justify-content: center; }
                        #pro-page .pro-info-carousel { padding-left: 12px; padding-right: 12px; }
                        #pro-page .pro-info-carousel > section { min-width: 100%; }
                    }

                    /* Regles finales: une seule source de verite pour les dimensions.
                       Les carrousels sont les seuls blocs autorises a defiler. */
                    body.is-pro { overflow-x: hidden; }
                    #pro-page {
                        width: 100%;
                        max-width: none;
                        margin-inline: auto;
                        min-width: 0;
                    }
                    #pro-page .pro-page-container {
                        width: 100%;
                        max-width: none;
                        margin-inline: auto;
                        min-width: 0;
                    }
                    #pro-page .pro-page-wrapper {
                        width: min(100%, 1180px);
                        max-width: 1180px;
                        min-width: 0;
                    }
                    #pro-page .pro-page-wrapper {
                        margin-inline: auto;
                        padding-inline: clamp(16px, 3vw, 32px);
                        padding-bottom: clamp(32px, 6vw, 72px);
                        box-sizing: border-box;
                    }
                    #pro-page .pro-header-card,
                    #pro-page .pro-content-layout,
                    #pro-page .pro-main-col,
                    #pro-page .pro-page-sidebar,
                    #pro-page .pro-card-premium,
                    #pro-page .sidebar-card-premium,
                    #pro-page .pro-creation-card,
                    #pro-page .arc-card-pro-premium,
                    #pro-page .feature-card-pro {
                        min-width: 0;
                        max-width: 100%;
                    }
                    #pro-page .pro-banner-container,
                    #pro-page .pro-banner-img { max-width: 100%; }
                    #pro-page .pro-header-info > div:first-child,
                    #pro-page .pro-main-details,
                    #pro-page .pro-secondary-details {
                        min-width: 0;
                        max-width: 100%;
                    }
                    #pro-page .pro-name-row,
                    #pro-page .pro-interest-list,
                    #pro-page .pro-actions-row {
                        min-width: 0;
                        max-width: 100%;
                    }
                    #pro-page .pro-name-row h2,
                    #pro-page .pro-industry-label,
                    #pro-page .pro-members-count,
                    #pro-page .pro-role-label,
                    #pro-page .pro-interest-chip,
                    #pro-page .pro-about-copy,
                    #pro-page .arc-card-pro-premium h4,
                    #pro-page .arc-card-pro-premium p,
                    #pro-page .employees-grid .pro-card-premium div {
                        overflow-wrap: anywhere;
                        word-break: break-word;
                    }
                    #pro-page .pro-content-layout {
                        grid-template-columns: minmax(0, 1fr) minmax(240px, 310px);
                    }
                    #pro-page .org-arcs-grid,
                    #pro-page .employees-grid,
                    #pro-page .talent-grid-standalone {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)) !important;
                        gap: clamp(12px, 2vw, 20px) !important;
                        min-width: 0;
                        max-width: 100%;
                    }
                    #pro-page .org-arcs-grid,
                    #pro-page #company-updates-container,
                    #pro-page .employees-grid {
                        max-height: 65vh;
                        overflow-y: auto;
                        overflow-x: hidden;
                        overscroll-behavior-y: contain;
                        scrollbar-gutter: stable;
                        padding: 2px;
                    }
                    #pro-page #company-updates-container:has(.pro-posts-carousel) {
                        max-height: none;
                        overflow: visible;
                        padding: 0;
                    }
                    #pro-page .pro-actions-row {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 12px;
                        align-items: center;
                    }
                    #pro-page .pro-actions-row > a,
                    #pro-page .pro-actions-row > button {
                        min-width: 0;
                        max-width: 100%;
                    }
                    #pro-page .pro-public-stats {
                        grid-template-columns: repeat(4, minmax(0, 1fr));
                    }
                    #pro-page .pro-stat-item {
                        min-width: 0;
                        overflow-wrap: anywhere;
                    }
                    #pro-page .pro-posts-carousel,
                    #pro-page .pro-info-carousel {
                        width: 100%;
                        max-width: 100%;
                        min-width: 0;
                        overscroll-behavior-x: contain;
                        scrollbar-gutter: stable;
                    }
                    #pro-page .pro-posts-carousel .pro-feed-card {
                        flex: 0 0 min(640px, 100%);
                        width: min(640px, 100%);
                        max-width: 100%;
                    }
                    #pro-page .pro-info-carousel > section {
                        flex: 0 0 clamp(260px, 34vw, 420px);
                        width: clamp(260px, 34vw, 420px);
                        max-width: 100%;
                        min-width: 0;
                        height: auto;
                    }
                    #pro-page .pro-feed-card img,
                    #pro-page .pro-feed-card video,
                    #pro-page .pro-card-premium img,
                    #pro-page .arc-card-pro-premium img {
                        max-width: 100%;
                    }
                    #pro-page .pro-card-footer,
                    #pro-page .pro-event-details,
                    #pro-page .pro-feed-card > div > div:first-of-type {
                        display: flex;
                        flex-wrap: wrap;
                        min-width: 0;
                        max-width: 100%;
                    }
                    #pro-page .pro-card-footer > *,
                    #pro-page .pro-event-details > * { min-width: 0; max-width: 100%; }

                    @media (max-width: 1040px) {
                        #pro-page .pro-content-layout { grid-template-columns: 1fr; }
                        #pro-page .pro-page-sidebar { order: 2; }
                    }
                    @media (max-width: 900px) {
                        #pro-page .pro-page-wrapper { padding-inline: 18px; }
                        #pro-page .pro-header-info { grid-template-columns: 1fr; }
                        #pro-page .pro-secondary-details { border-left: 0; border-top: 1px solid var(--pro-line); padding: 16px 0 0; }
                        #pro-page .pro-features-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                        #pro-page .pro-public-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                        #pro-page .pro-stat-item:nth-child(2n) { border-right: 0; }
                        #pro-page .pro-stat-item:nth-child(-n+2) { border-bottom: 1px solid var(--pro-line); }
                    }
                    @media (max-width: 620px) {
                        #pro-page .pro-page-wrapper { padding-inline: 16px; }
                        #pro-page .pro-header-card { border-radius: 18px; border-inline: 1px solid var(--pro-line); }
                        #pro-page .pro-content-layout { padding-inline: 0; }
                        #pro-page .pro-actions-row { grid-template-columns: repeat(2, minmax(0, 1fr)); padding-inline: 17px; }
                        #pro-page .pro-info-carousel { padding-inline: 14px; }
                        #pro-page .pro-info-carousel > section { flex-basis: 100%; width: 100%; }
                        #pro-page .pro-features-grid { grid-template-columns: 1fr; }
                    }
                    @media (max-width: 420px) {
                        #pro-page .pro-actions-row { grid-template-columns: 1fr; }
                        #pro-page .pro-public-stats { grid-template-columns: 1fr; }
                        #pro-page .pro-stat-item { border-right: 0 !important; border-bottom: 1px solid var(--pro-line); }
                        #pro-page .pro-stat-item:last-child { border-bottom: 0; }
                        #pro-page .pro-header-info > div:first-child { grid-template-columns: 72px minmax(0, 1fr); gap: 12px; }
                        #pro-page .pro-avatar-overlap { width: 72px; height: 72px; margin-top: -42px; }
                        #pro-page .pro-name-row h2 { font-size: 1.28rem; }
                    }

                    /* Match the personal profile's true-black page canvas. */
                    body.is-pro { background-color: #050505 !important; }
                    #pro-page,
                    #pro-page .pro-page-container,
                    #pro-page .pro-page-wrapper {
                        background: #050505 !important;
                    }
                `;

            try {
                const floatingCreate = document.getElementById(
                    "floating-create-container",
                );
                if (floatingCreate) floatingCreate.style.display = "none";
            } catch (e) {
                // ignore if proContainer not present or DOM restricted
            }

            proContainer.innerHTML = `
                <div class="min-h-screen bg-[#050505] text-slate-100">
                    <main class="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
                    <div class="pro-page-wrapper pro-page-fade-in">
                        <!-- HEADER -->
                        <div class="pro-header-card">
                            <div class="pro-banner-container">
                                ${banner ? `<img src="${this.escapeHtml(banner)}" class="pro-banner-img" alt="${bannerAlt}" onerror="this.remove(); this.parentElement.classList.add('pro-banner-unavailable');">` : ""}
                                ${isOwner ? `<div class="pro-edit-banner-btn" onclick="window.professionalManager.openPageSettings('${page.id}')"><i class="fas fa-edit"></i></div>` : ""}
                            </div>

                            <div class="pro-header-info">
                                <div style="flex: 1;">
                                    <div class="pro-avatar-overlap">
                                        <img src="${avatar}" alt="Avatar">
                                    </div>
                                    <div class="pro-main-details">
                                        <div class="pro-industry-label">${page.industry}</div>
                                        <div class="pro-name-row">
                                            <h2>${typeof window.wrapUsernameLabel === "function" ? window.wrapUsernameLabel(page.name) : page.name}</h2>
                                            ${pageVerifiedBadgeHtml}
                                        </div>
                                        <div class="pro-members-count"><strong>${employees.length}</strong> Membres certifiés</div>
                                        ${pageVerificationCtaHtml}
                                    </div>
                                </div>

                                <div class="pro-secondary-details">
                                    <div class="pro-interests-label">Centres d'intérêt</div>
                                    <div class="pro-interest-list">
                                        ${page.hiring_needs?.map((need) => `<span class="pro-interest-chip">${need}</span>`).join("") || `<span class="pro-interest-chip">Aucun</span>`}
                                    </div>
                                    <div class="pro-role-label">Rôle actuel: <span>Page Professionnelle</span></div>
                                </div>
                            </div>

                            <div class="pro-actions-row flex flex-wrap items-center gap-3">
                                ${(() => {
                                    const cta = getProfessionalCta(page);
                                    if (!cta.url) return "";
                                    const target =
                                        cta.type === "phone"
                                            ? ""
                                            : ` target="_blank" rel="noopener noreferrer"`;
                                    const icon =
                                        cta.type === "phone"
                                            ? "phone"
                                            : "globe";
                                    return `<a href="${this.escapeHtml(cta.url)}"${target} class="btn-pro-primary" style="text-decoration:none;"><i class="fas fa-${icon}"></i><span>${this.escapeHtml(cta.label)}</span></a>`;
                                })()}
                                <button class="btn-pro-secondary" type="button" onclick="window.startCompanyMessageFromPage && window.startCompanyMessageFromPage('${this.escapeHtml(page.id)}','${this.escapeHtml(page.slug || "")}','${this.escapeHtml(page.name || "Page Pro")}')"><i class="fas fa-comment-dots"></i><span class="btn-pro-label-long">Contacter</span><span class="btn-pro-label-short">Message</span></button>
                                ${pageFollowHtml}
                                ${
                                    isOwner
                                        ? `
                                    <button class="btn-pro-secondary" onclick="window.professionalManager.openTeamManagement('${page.id}')"><i class="fas fa-users-cog"></i><span class="btn-pro-label-long">Gérer l'équipe</span><span class="btn-pro-label-short">Équipe</span></button>
                                    <a href="commissions.html" class="btn-pro-secondary" style="text-decoration:none"><i class="fas fa-chart-line"></i><span class="btn-pro-label-long">Commissions</span><span class="btn-pro-label-short">Com.</span></a>
                                    <button class="btn-pro-secondary" onclick="window.professionalManager.openPageSettings('${page.id}')"><i class="fas fa-cog"></i><span class="btn-pro-label-long">Réglages Page</span><span class="btn-pro-label-short">Réglages</span></button>
                                `
                                        : ""
                                }
                            </div>
                            <div class="pro-public-stats" aria-label="Aperçu de la page">
                                <div class="pro-stat-item"><strong>${employees.length}</strong><span>Membres certifiés</span></div>
                                <div class="pro-stat-item"><strong>${pageFollowState.count}</strong><span>Abonnés</span></div>
                                <div class="pro-stat-item"><strong>${orgArcs?.length || 0}</strong><span>Projets publics</span></div>
                                <div class="pro-stat-item"><strong>${page.hiring_needs?.length || 0}</strong><span>Spécialités</span></div>
                            </div>
                            ${
                                isOwner
                                    ? `<div class="pro-info-carousel">
                                ${recommendedProfilesHtml}
                                ${officialComparisonHtml}
                            </div>`
                                    : ""
                            }
                        </div>

                        <!-- QUICK ACTIONS -->
                        ${
                            isOwner
                                ? `<div class="pro-features-grid">
                            <div class="feature-card-pro" onclick="window.professionalManager.openProfessionalCreateMenu('${page.id}', 'news')">
                                <div class="feature-icon-box"><i class="fas fa-handshake"></i></div>
                                <div class="feature-info">
                                    <h4>Publier une actualité</h4>
                                    <p>Partagez une nouvelle officielle avec votre communauté.</p>
                                </div>
                                <div class="feature-arrow"><i class="fas fa-chevron-right"></i></div>
                            </div>
                            <div class="feature-card-pro" onclick="window.professionalManager.openCompanyPostMenu('${page.id}')">
                                <div class="feature-icon-box"><i class="fas fa-share-alt"></i></div>
                                <div class="feature-info">
                                    <h4>Partager des posts</h4>
                                    <p>Partagez vos dernières actualités et restez connecté avec votre réseau.</p>
                                </div>
                                <div class="feature-arrow"><i class="fas fa-chevron-right"></i></div>
                            </div>
                            <div class="feature-card-pro" onclick="window.professionalManager.openPageSettings('${page.id}')">
                                <div class="feature-icon-box"><i class="fas fa-sync"></i></div>
                                <div class="feature-info">
                                    <h4>Mettre à jour</h4>
                                    <p>Gardez votre profil à jour pour que les recruteurs vous trouvent facilement.</p>
                                </div>
                                <div class="feature-arrow"><i class="fas fa-chevron-right"></i></div>
                            </div>
                                </div>`
                                : ""
                        }

                        <div class="pro-content-layout">
                            <!-- MAIN CONTENT -->
                            <div class="pro-main-col">
                                <!-- CREATION BAR -->
                                ${
                                    isOwner
                                        ? `
                                    <div class="pro-creation-card">
                                        <div class="pro-creation-input-shell">
                                            <img src="${avatar}" alt="Logo">
                                            <button onclick="window.professionalManager.openProfessionalCreateMenu('${page.id}', 'news')">Commencer une actualité officielle...</button>
                                        </div>
                                        <div class="pro-creation-tabs">
                                            <div class="pro-tab-item news" onclick="window.professionalManager.openProfessionalCreateMenu('${page.id}', 'news')">
                                                <i class="fas fa-newspaper"></i>
                                                <span>Actualité</span>
                                            </div>
                                            <div class="pro-tab-item event" onclick="window.professionalManager.openProfessionalCreateMenu('${page.id}', 'event')">
                                                <i class="fas fa-calendar-alt"></i>
                                                <span>Événement</span>
                                            </div>
                                            <div class="pro-tab-item project" onclick="window.professionalManager.openCreateOrgArc('${page.id}')">
                                                <i class="fas fa-project-diagram"></i>
                                                <span>Projet</span>
                                            </div>
                                        </div>
                                    </div>
                                `
                                        : ""
                                }

                                <!-- ARCS -->
                                <div class="pro-section-header">
                                    <h3 class="pro-section-title">Projets d'Organisation (ARCs)</h3>
                                    ${isOwner ? `<button class="btn-pill-small" onclick="window.professionalManager.openCreateOrgArc('${page.id}')">+ Nouveau Projet</button>` : ""}
                                </div>
                                <div class="org-arcs-grid" style="margin-bottom: 40px;">
                                    ${
                                        orgArcs && orgArcs.length > 0
                                            ? orgArcs
                                                  .map(
                                                      (arc) => `
                                                <div class="arc-card-pro-premium" onclick="selectArc('${arc.id}', '${page.owner_id}')" style="cursor: pointer;">
                                                    <div style="font-size: 0.65rem; text-transform: uppercase; font-weight: 800; color: #8b5cf6; margin-bottom: 5px; letter-spacing: 1px;">ARC OFFICIEL</div>
                                                    <h4 style="margin: 0 0 10px 0; font-size: 1.1rem; font-weight: 700;">${arc.title}</h4>
                                                    <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 15px;">${arc.description || "Aucune description."}</p>
                                                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem;">
                                                        <span class="badge" style="background: rgba(255,255,255,0.05); color: #fff; padding: 4px 12px; border-radius: 6px;">${arc.status === "in_progress" ? "En cours" : "Terminé"}</span>
                                                        <span style="font-weight: 700; color: #8b5cf6;">Voir la trajectoire →</span>
                                                    </div>
                                                </div>
                                            `,
                                                  )
                                                  .join("")
                                            : `
                                            <div class="pro-empty-state">
                                                <div class="pro-empty-icon"><i class="fas fa-folder-open"></i></div>
                                                <div class="pro-empty-text">L'organisation n'a pas encore de projet public.<br>Ajoutez votre premier projet pour commencer.</div>
                                            </div>
                                            `
                                    }
                                </div>

                                <!-- UPDATES -->
                                <div class="pro-section-header">
                                    <h3 class="pro-section-title">Actualités de l'entreprise</h3>
                                    ${isOwner ? `<button class="btn-pill-small" onclick="window.professionalManager.openCompanyPostMenu('${page.id}')">+ Publier une update</button>` : ""}
                                </div>
                                <div id="company-updates-container" style="margin-bottom: 40px;">
                                    <div class="loading-spinner"></div>
                                </div>

                                <!-- ABOUT -->
                                <h3 class="pro-section-title" style="margin-bottom: 20px;">À propos</h3>
                                <div class="pro-card-premium pro-about-card" style="margin-bottom: 40px;">
                                    <p class="pro-about-copy" style="white-space: pre-wrap; line-height: 1.7; color: var(--text-secondary); font-size: 0.95rem; margin: 0;">${page.description || "Bienvenue sur notre page professionnelle."}</p>
                                </div>

                                <!-- TEAM -->
                                <h3 class="pro-section-title" style="margin-bottom: 20px;">Équipe Certifiée</h3>
                                <div class="employees-grid" style="margin-bottom: 40px;">
                                    ${
                                        employees.length > 0
                                            ? employees
                                                  .slice(0, 6)
                                                  .map(
                                                      (emp) => `
                                                <div class="pro-card-premium" style="text-align: center; cursor: pointer; padding: 25px; transition: all 0.2s;" onclick="navigateToUserProfile('${emp.user_id}')">
                                                    <img src="${emp.user?.avatar || "https://placehold.co/100"}" style="width: 70px; height: 70px; border-radius: 50%; margin-bottom: 15px; object-fit: cover; border: 2px solid rgba(255,255,255,0.05);">
                                                    <div style="font-weight: 700; margin-bottom: 4px; font-size: 0.95rem;">${emp.user?.name}</div>
                                                    <div style="font-size: 0.8rem; color: #8b5cf6; font-weight: 600;">${emp.title}</div>
                                                    ${emp.department ? `<div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 4px; opacity: 0.8;">${emp.department}</div>` : ""}
                                                </div>
                                            `,
                                                  )
                                                  .join("")
                                            : `<p style="color: var(--text-secondary); font-style: italic; font-size: 0.9rem;">Aucun membre certifié pour le moment.</p>`
                                    }
                                </div>
                                ${
                                    employees.length > 6
                                        ? `<button type="button" class="certified-team-view-all" onclick="window.professionalManager.openCertifiedTeamDirectory('${this.escapeHtml(page.slug)}')"><i class="fas fa-users"></i><span>Voir les ${employees.length} profils certifiés</span><i class="fas fa-arrow-right" aria-hidden="true"></i></button>`
                                        : ""
                                }
                            </div>

                            <!-- SIDEBAR -->
                            <div class="pro-page-sidebar">
                                <h3 class="pro-section-title" style="margin-bottom: 16px; font-size: 1.05rem;">Informations</h3>
                                <div class="sidebar-card-premium">
                                    <div style="margin-bottom: 20px;">
                                        <small style="color: var(--text-secondary); text-transform: uppercase; font-weight: 700; font-size: 0.65rem; letter-spacing: 1px;">Domaines d'activité</small>
                                        <div style="margin-top: 8px; font-weight: 600; font-size: 0.9rem; line-height: 1.4;">${page.industry}</div>
                                    </div>
                                    <div>
                                        <small style="color: var(--text-secondary); text-transform: uppercase; font-weight: 700; font-size: 0.65rem; letter-spacing: 1px;">Créée le</small>
                                        <div style="margin-top: 8px; font-weight: 600; font-size: 0.9rem;">${new Date(page.created_at).toLocaleDateString()}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    </div>
                </main>
                </div>
            `;

            await this.loadCompanyUpdates(page.id);

            // Gestion de la navigation intelligente (Sticky auto-hide/show)
            if (!window._proNavScrollHandler) {
                let lastScrollY = window.pageYOffset;
                window._proNavScrollHandler = () => {
                    const nav = document.querySelector("nav");
                    if (!nav) return;

                    // On ne s'active que si on est sur une page pro
                    const isProActive =
                        document.body.classList.contains("is-pro") &&
                        document
                            .getElementById("pro-page")
                            ?.classList.contains("active");

                    if (!isProActive) {
                        nav.style.transform = "translateY(0)";
                        return;
                    }

                    const currentScrollY = window.pageYOffset;
                    // Seuil de déclenchement pour éviter les micro-scrolls
                    if (Math.abs(currentScrollY - lastScrollY) < 10) return;

                    if (currentScrollY > lastScrollY && currentScrollY > 100) {
                        // On descend (Swipe UP) : on cache la navigation (montant vers le haut)
                        nav.style.transform = "translateY(-100%)";
                    } else {
                        // On remonte (Swipe DOWN) : on montre la navigation (descendant vers le bas)
                        nav.style.transform = "translateY(0)";
                    }
                    lastScrollY = currentScrollY;
                };
                window.addEventListener("scroll", window._proNavScrollHandler, {
                    passive: true,
                });
            }
        } catch (err) {
            if (!isCurrentRender()) return;

            document.body.classList.add("is-pro");
            document.querySelectorAll(".page").forEach((pageSection) => {
                pageSection.classList.toggle(
                    "active",
                    pageSection.id === "pro-page",
                );
            });
            proContainer.innerHTML = `
                <div class="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div class="empty-state pro-page-not-found" role="alert">
                        <div class="empty-state-icon" aria-hidden="true">!</div>
                        <h3>Entreprise introuvable</h3>
                        <p>Cette Page Professionnelle n'est plus disponible ou n'a pas pu être chargée.</p>
                        <button class="btn btn-secondary" type="button" onclick="navigateTo('discover')" style="margin-top: 20px;">Retour au feed</button>
                    </div>
                </div>
            `;
        }
    }

    async openCertifiedTeamDirectory(slug) {
        this.syncUrl({ pro: slug, team: "1", explorer: null });
        await this.renderCertifiedTeamDirectory(slug);
    }

    async closeCertifiedTeamDirectory(slug) {
        this.syncUrl({ team: null });
        await this.renderProPage(slug);
    }

    async renderCertifiedTeamDirectory(slug, initialQuery = "") {
        const container = document.querySelector(".pro-page-container");
        if (!container) return;

        container.innerHTML = `<div class="certified-directory-loading"><div class="loading-spinner"></div></div>`;

        try {
            const { data: page, error: pageError } = await this.supabase
                .from("professional_pages")
                .select("id, name, slug, avatar_url, industry, description")
                .eq("slug", slug)
                .single();

            if (pageError || !page) throw new Error("Page introuvable");
            const employees = await this.getPageCertifications(page.id);
            const pageAvatar = this.escapeHtml(
                page.avatar_url || "icons/enterprise.svg",
            );
            const safePageName = this.escapeHtml(page.name || "Page Pro");
            const normalizeSearchText = (value) =>
                String(value || "")
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLowerCase();
            const renderResults = (searchTerm = "") => {
                const normalizedQuery = normalizeSearchText(searchTerm).trim();
                const matches = (employees || []).filter((cert) => {
                    const searchable = normalizeSearchText(
                        [
                            cert.user?.name,
                            cert.title,
                            cert.type,
                            cert.department,
                            cert.user?.title,
                            cert.user?.account_subtype,
                            cert.user?.bio,
                        ].join(" "),
                    );
                    return (
                        !normalizedQuery || searchable.includes(normalizedQuery)
                    );
                });
                const results = document.getElementById(
                    "certified-directory-results",
                );
                const count = document.getElementById(
                    "certified-directory-count",
                );
                if (!results || !count) return;
                count.textContent = `${matches.length} profil${matches.length > 1 ? "s" : ""}`;
                results.innerHTML = matches.length
                    ? matches
                          .map((cert) => {
                              const name = this.escapeHtml(
                                  cert.user?.name || "Profil certifié",
                              );
                              const avatar = this.escapeHtml(
                                  cert.user?.avatar ||
                                      "https://placehold.co/120",
                              );
                              const role = this.escapeHtml(
                                  cert.title ||
                                      cert.user?.title ||
                                      cert.type ||
                                      "Membre certifié",
                              );
                              const talent = this.escapeHtml(
                                  cert.user?.title ||
                                      cert.user?.account_subtype ||
                                      cert.department ||
                                      "Talent XERA1",
                              );
                              return `<button type="button" class="certified-directory-card" onclick="navigateToUserProfile('${this.escapeHtml(cert.user_id)}')">
                                  <img src="${avatar}" alt="Avatar de ${name}">
                                  <span class="certified-directory-card-copy"><strong>${name}</strong><span>${role}</span><small>${talent}</small></span>
                                  <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
                              </button>`;
                          })
                          .join("")
                    : `<div class="certified-directory-empty"><i class="fas fa-user-slash"></i><strong>Aucun profil trouvé</strong><span>Essayez un nom, un rôle ou une compétence.</span></div>`;
            };

            container.innerHTML = `
                <section class="certified-directory" aria-labelledby="certified-directory-title">
                    <div class="certified-directory-topbar"><button type="button" class="certified-directory-back" aria-label="Retour à la page professionnelle"><i class="fas fa-arrow-left"></i><span>Retour à la page</span></button><span class="certified-directory-kicker">RÉSEAU CERTIFIÉ</span></div>
                    <header class="certified-directory-hero"><div class="certified-directory-brand"><img src="${pageAvatar}" alt="Logo de ${safePageName}"><div><p>Équipe vérifiée</p><h1 id="certified-directory-title">Profils certifiés par ${safePageName}</h1><span>${this.escapeHtml(page.industry || "Talents professionnels vérifiés")}</span></div></div><div class="certified-directory-total"><strong>${employees.length}</strong><span>profils certifiés</span></div></header>
                    <div class="certified-directory-search"><i class="fas fa-search" aria-hidden="true"></i><input id="certified-directory-search" type="search" value="${this.escapeHtml(initialQuery)}" placeholder="Rechercher un nom, un rôle ou une compétence..." aria-label="Rechercher dans les profils certifiés"></div>
                    <div class="certified-directory-results-head"><h2>Annuaire de l'équipe</h2><span id="certified-directory-count"></span></div>
                    <div id="certified-directory-results" class="certified-directory-grid"></div>
                </section>
            `;

            container
                .querySelector(".certified-directory-back")
                ?.addEventListener("click", () =>
                    this.closeCertifiedTeamDirectory(slug),
                );
            const searchInput = document.getElementById(
                "certified-directory-search",
            );
            searchInput?.addEventListener("input", (event) =>
                renderResults(event.target.value),
            );
            renderResults(initialQuery);
        } catch (error) {
            console.error("Erreur chargement de l'annuaire certifié:", error);
            container.innerHTML = `<div class="certified-directory-empty"><strong>Impossible de charger l'équipe certifiée.</strong><button type="button" class="btn btn-secondary" onclick="window.professionalManager.closeCertifiedTeamDirectory('${this.escapeHtml(slug)}')">Retour à la page</button></div>`;
        }
    }

    /**
     * Ouvre l'explorateur de talents premium (Standalone Page)
     */
    async openTopTalentExplorer() {
        this.syncUrl({ pro: null, explorer: "1" });
        await this.renderTalentExplorer();
    }

    /**
     * Rendu de la page Talent Explorer (Page à part entière)
     */
    async renderTalentExplorer(query = "") {
        console.log("[Pro] renderTalentExplorer starting...");

        const currentPath = window.location.pathname;
        const isProfilePage =
            currentPath.includes("profile.html") ||
            currentPath.includes("/pagepro");
        const hasExplorerParam = window.location.search.includes("explorer=1");

        // 1. Redirection si pas sur la bonne URL
        if (!isProfilePage || !hasExplorerParam) {
            console.log("[Pro] Redirecting to Talent Explorer...");
            if (
                window.XeraRouter &&
                typeof window.XeraRouter.navigate === "function"
            ) {
                window.XeraRouter.navigate("pagepro", {
                    query: { explorer: "1" },
                });
            } else if (typeof window.navigateTo === "function") {
                window.navigateTo("pagepro", { query: { explorer: "1" } });
            } else {
                window.location.href = "profile.html?explorer=1";
            }
            return;
        }

        // 2. Rendu local
        const container = document.querySelector(".pro-page-container");
        if (!container) return;

        const targetPage = document.getElementById("pro-page");
        if (targetPage) {
            document
                .querySelectorAll(".page")
                .forEach((p) => p.classList.remove("active"));
            targetPage.classList.add("active");
        }

        container.innerHTML = `<div style="text-align:center; padding: 100px;"><div class="loading-spinner"></div></div>`;

        const user = window.currentUser;
        const isPremium =
            user &&
            (this.isEligibleForProPage(user) ||
                ((user.plan === "pro" ||
                    user.plan === "medium" ||
                    user.plan === "elite") &&
                    user.plan_status === "active"));
        const expiryDate = user?.plan_ends_at
            ? new Date(user.plan_ends_at).toLocaleDateString("fr-FR")
            : "Illimitée";

        container.innerHTML = `
            <div class="talent-explorer-page" style="padding: 20px; max-width: 1200px; margin: 0 auto; animation: fadeIn 0.4s ease-out;">
                <div class="talent-explorer-header" style="margin-bottom: 40px; background: var(--bg-secondary); padding: 40px; border-radius: 32px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); position: relative; overflow: hidden;">
                    <div style="position: absolute; top: 0; right: 0; width: 300px; height: 300px; background: radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, transparent 70%); z-index: 0;"></div>

                    <div style="position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 35px;">
                        <div>
                            <h1 style="font-size: 2.8rem; margin: 0; font-family: var(--font-heading); color: var(--text-primary); letter-spacing: -1px;">XERA1 Talent Explorer</h1>
                            <p style="color: var(--text-secondary); margin-top: 10px; font-size: 1.15rem; max-width: 600px;">Analysez le Momentum des élites et identifiez les meilleurs profils certifiés pour vos projets.</p>
                        </div>
                        <div style="text-align: right;">
                            <span class="badge ${isPremium ? "badge-premium" : "badge-free"}" style="padding: 10px 20px; border-radius: 99px; font-weight: 800; letter-spacing: 1px; font-size: 0.75rem; background: ${isPremium ? "var(--primary-color)" : "var(--bg-primary)"}; color: ${isPremium ? "#fff" : "var(--text-secondary)"}; border: 1px solid ${isPremium ? "transparent" : "var(--border-color)"};">
                                ${isPremium ? "ACCÈS PREMIUM ACTIF" : "ACCÈS LIMITÉ"}
                            </span>
                            ${isPremium ? `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 10px; font-weight: 600;">Abonnement jusqu'au : ${expiryDate}</div>` : ""}
                        </div>
                    </div>

                    <div class="talent-search-box" style="position: relative; z-index: 1; display: flex; gap: 15px; background: var(--bg-primary); padding: 10px; border-radius: 20px; border: 2px solid var(--border-color); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); transition: all 0.3s ease;">
                        <i class="fas fa-search" style="padding: 15px; color: var(--primary-color); font-size: 1.2rem;"></i>
                        <input type="text" id="talent-search-main" placeholder="Rechercher par nom, compétence (React, IA), domaine ou titre..." style="flex: 1; background: transparent; border: none; color: var(--text-primary); font-size: 1.2rem; outline: none; font-weight: 500;" value="${query}">
                        <button class="btn btn-primary" onclick="window.professionalManager.handleTalentSearch()" style="border-radius: 14px; padding: 0 40px; font-weight: 700; font-size: 1rem;">Rechercher</button>
                    </div>

                    <div class="talent-explorer-tabs" style="position: relative; z-index: 1; display: flex; gap: 40px; margin-top: 30px; border-bottom: 1px solid var(--border-color);">
                        <button class="talent-tab active" onclick="window.professionalManager.switchTalentTab('grid', event)">
                            <i class="fas fa-users" style="margin-right: 8px;"></i> Répertoire des Talents
                        </button>
                        <button class="talent-tab" onclick="window.professionalManager.switchTalentTab('analytics', event)" ${!isPremium ? 'disabled title="Réservé aux membres Premium"' : ""}>
                            <i class="fas fa-chart-line" style="margin-right: 8px;"></i> Analytics Mensuels
                        </button>
                    </div>
                </div>

                <div id="talent-explorer-content">
                    <div id="talent-grid" class="talent-grid-standalone" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 30px;">
                        <!-- Les profils seront injectés ici -->
                    </div>
                </div>
            </div>
        `;

        // Injecter styles pour les tabs si pas déjà présents
        if (!document.getElementById("talent-explorer-styles")) {
            const style = document.createElement("style");
            style.id = "talent-explorer-styles";
            style.textContent = `
                .talent-tab {
                    background: none; border: none; padding: 15px 5px; font-weight: 700; color: var(--text-secondary); cursor: pointer; position: relative; font-size: 1.05rem; transition: all 0.2s;
                }
                .talent-tab:hover:not(:disabled) { color: var(--text-primary); }
                .talent-tab.active { color: var(--primary-color); }
                .talent-tab.active::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 3px; background: var(--primary-color); border-radius: 3px 3px 0 0; }
                .talent-tab:disabled { opacity: 0.4; cursor: not-allowed; }
                .talent-card-premium { border: 1px solid var(--border-color); border-radius: 24px; background: var(--bg-secondary); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
                .talent-card-premium:hover { transform: translateY(-10px); border-color: var(--primary-color) !important; box-shadow: 0 20px 40px -10px rgba(99, 102, 241, 0.2); }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `;
            document.head.appendChild(style);
        }

        if (isPremium) {
            await this.loadTalentExplorerData(query);
        } else {
            this.renderTalentPaywall();
        }

        // Focus et event Enter
        setTimeout(() => {
            const input = document.getElementById("talent-search-main");
            if (input) {
                input.onkeypress = (e) => {
                    if (e.key === "Enter") this.handleTalentSearch();
                };
                input.focus();
            }
        }, 100);
    }

    /**
     * Gère la recherche dans le Talent Explorer
     */
    handleTalentSearch() {
        const input = document.getElementById("talent-search-main");
        const query = input ? input.value.trim() : "";
        this.loadTalentExplorerData(query);
    }

    /**
     * Bascule entre l'explorateur et les analytics
     */
    async switchTalentTab(tab, event) {
        const container = document.getElementById("talent-explorer-content");
        if (!container) return;

        const tabs = document.querySelectorAll(".talent-tab");
        tabs.forEach((t) => t.classList.remove("active"));
        if (event) event.target.closest(".talent-tab").classList.add("active");

        if (tab === "grid") {
            container.innerHTML = `<div id="talent-grid" class="talent-grid-standalone" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 30px;"></div>`;
            this.loadTalentExplorerData(
                document.getElementById("talent-search-main")?.value || "",
            );
        } else if (tab === "analytics") {
            await this.renderAnalyticsDashboard();
        }
    }

    /**
     * Rendu du dashboard d'analytics pour les membres premium
     */
    async renderAnalyticsDashboard() {
        const container = document.getElementById("talent-explorer-content");
        if (!container) return;

        container.innerHTML = `<div style="text-align:center; padding: 100px;"><div class="loading-spinner"></div><p style="color: var(--text-secondary); margin-top: 20px;">Calcul des analytics Momentum...</p></div>`;

        let analytics = this.talentExplorerAnalytics;
        if (!analytics) {
            try {
                analytics = await this.fetchTalentExplorerAnalytics();
                this.talentExplorerAnalytics = analytics;
            } catch (err) {
                console.error(err);
                container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 100px; color: #ef4444; background: rgba(239, 68, 68, 0.05); border-radius: 20px;">Impossible de charger les analytics. Réessayez dans quelques instants.</div>`;
                return;
            }
        }

        const {
            totalMomentum,
            averageMomentum,
            certifiedCount,
            trendingCount,
            growthPercent,
            topAreas,
        } = analytics;

        container.innerHTML = `
            <div class="analytics-dashboard" style="animation: fadeIn 0.4s ease-out;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 25px; margin-bottom: 35px;">
                    <div class="analytics-card" style="background: var(--bg-secondary); padding: 35px; border-radius: 28px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); position: relative;">
                        <h4 style="margin: 0; color: var(--text-secondary); text-transform: uppercase; font-size: 0.8rem; letter-spacing: 1.5px; font-weight: 800;">Reach Global Momentum</h4>
                        <div style="font-size: 3.2rem; font-weight: 900; color: var(--primary-color); margin: 20px 0; font-family: var(--font-heading);">${this.formatCompactNumber(totalMomentum)}</div>
                        <div style="display: flex; align-items: center; gap: 8px; color: #22c55e; font-weight: 700; font-size: 1rem;">
                            <i class="fas fa-arrow-up"></i> +${growthPercent}% <span style="font-weight: 400; opacity: 0.7;">depuis le mois dernier</span>
                        </div>
                    </div>

                    <div class="analytics-card" style="background: var(--bg-secondary); padding: 35px; border-radius: 28px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                        <h4 style="margin: 0; color: var(--text-secondary); text-transform: uppercase; font-size: 0.8rem; letter-spacing: 1.5px; font-weight: 800;">Talents à fort momentum certifiés</h4>
                        <div style="font-size: 3.2rem; font-weight: 900; color: var(--text-primary); margin: 20px 0; font-family: var(--font-heading);">${this.formatCompactNumber(certifiedCount)}</div>
                        <div style="display: flex; align-items: center; gap: 8px; color: #22c55e; font-weight: 700; font-size: 1rem;">
                            <i class="fas fa-arrow-up"></i> +${trendingCount}% <span style="font-weight: 400; opacity: 0.7;">talents en croissance</span>
                        </div>
                    </div>

                    <div class="analytics-card" style="background: var(--bg-secondary); padding: 35px; border-radius: 28px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                        <h4 style="margin: 0; color: var(--text-secondary); text-transform: uppercase; font-size: 0.8rem; letter-spacing: 1.5px; font-weight: 800;">Momentum moyen / profil</h4>
                        <div style="font-size: 3.2rem; font-weight: 900; color: var(--text-primary); margin: 20px 0; font-family: var(--font-heading);">${averageMomentum.toFixed(1)}</div>
                        <div style="display: flex; align-items: center; gap: 8px; color: ${averageMomentum >= 6 ? "#22c55e" : "#ef4444"}; font-weight: 700; font-size: 1rem;">
                            <i class="fas ${averageMomentum >= 6 ? "fa-arrow-up" : "fa-arrow-down"}"></i> ${averageMomentum >= 6 ? "+" : ""}${(averageMomentum - 6.0).toFixed(1)} <span style="font-weight: 400; opacity: 0.7;">tendance relative</span>
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 30px;">
                    <div style="background: var(--bg-secondary); padding: 35px; border-radius: 32px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
                            <h3 style="margin: 0; font-size: 1.4rem;">Top Domaines & Compétences</h3>
                            <div style="display: flex; gap: 10px;">
                                <span style="width: 12px; height: 12px; border-radius: 3px; background: var(--primary-color);"></span>
                                <span style="font-size: 0.75rem; color: var(--text-secondary);">Scores Momentum</span>
                            </div>
                        </div>
                        <div style="display: grid; gap: 18px;">
                            ${topAreas
                                .map(
                                    (area) => `
                                <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                                    <span style="font-weight: 700; color: var(--text-primary);">${this.escapeHtml(area.name)}</span>
                                    <span style="font-weight: 800; color: var(--primary-color);">${area.count}</span>
                                </div>
                            `,
                                )
                                .join("")}
                        </div>
                    </div>

                    <div style="background: var(--bg-secondary); padding: 35px; border-radius: 32px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                        <h3 style="margin-top: 0; margin-bottom: 30px; font-size: 1.4rem;">Top Accélérateurs</h3>
                        <div style="display: grid; gap: 20px;">
                            ${topAreas
                                .slice(0, 4)
                                .map(
                                    (area) => `
                                <div>
                                    <div style="display: flex; justify-content: space-between; font-size: 0.95rem; margin-bottom: 8px;">
                                        <span style="font-weight: 700;">${this.escapeHtml(area.name)}</span>
                                        <span style="color: var(--text-primary); font-weight: 800;">${area.percent}%</span>
                                    </div>
                                    <div style="width: 100%; height: 8px; background: var(--bg-primary); border-radius: 10px; overflow: hidden;">
                                        <div style="width: ${area.percent}%; height: 100%; background: var(--primary-color); border-radius: 10px; transition: width 1.5s ease-in-out;"></div>
                                    </div>
                                </div>
                            `,
                                )
                                .join("")}
                        </div>
                        <div style="margin-top: 40px; padding: 20px; background: var(--bg-primary); border-radius: 16px; border: 1px solid var(--border-color);">
                            <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">
                                <i class="fas fa-info-circle" style="margin-right: 8px; color: var(--primary-color);"></i>
                                Ces analytics sont bâties sur les talents certifiés en visible par le Momentum Engine sur la période active.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Rendu du Paywall pour l'accès premium
     */
    renderTalentPaywall() {
        const grid = document.getElementById("talent-grid");
        if (!grid) return;

        grid.innerHTML = `
            <div style="grid-column: 1/-1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 40px; text-align: center; background: linear-gradient(180deg, transparent, rgba(99, 102, 241, 0.05)); border-radius: 40px; border: 1px solid var(--border-color); margin-top: 20px; position: relative; overflow: hidden;">
                <div style="position: absolute; inset: 0; background: url('icons/grid-pattern.svg'); opacity: 0.05; z-index: 0;"></div>

                <div style="position: relative; z-index: 1;">
                    <div style="width: 100px; height: 100px; background: rgba(99, 102, 241, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; margin: 0 auto 30px; border: 1px solid rgba(99, 102, 241, 0.2); box-shadow: 0 10px 20px rgba(99,102,241,0.1);">🔒</div>
                    <h2 style="font-size: 2.5rem; margin-bottom: 20px; font-family: var(--font-heading); color: var(--text-primary);">Débloquez l'Explorateur de Talents Elite</h2>
                    <p style="max-width: 650px; color: var(--text-secondary); margin: 0 auto 45px; line-height: 1.7; font-size: 1.2rem;">
                            Accédez à la base de données certifiée de XERA1, filtrez les profils par Momentum, et visualisez les analytics exclusifs pour vos recrutements et partenariats stratégiques.
                    </p>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 25px; width: 100%; max-width: 800px; margin: 0 auto 50px;">
                        <div style="background: var(--bg-secondary); padding: 40px 30px; border-radius: 32px; border: 1px solid var(--border-color); cursor: pointer; transition: transform 0.2s;" onclick="window.location.href='subscription-plans.html'">
                            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 15px; text-transform: uppercase; font-weight: 800; letter-spacing: 1px;">Abonnement Mensuel</div>
                            <div style="font-size: 2.5rem; font-weight: 900; color: var(--text-primary);">40 USD<span style="font-size: 1rem; opacity: 0.5; font-weight: 400;">/mois</span></div>
                            <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 15px;">Accès complet, sans engagement.</p>
                        </div>
                        <div style="background: var(--bg-secondary); padding: 40px 30px; border-radius: 32px; border: 2px solid var(--primary-color); cursor: pointer; position: relative; transition: transform 0.2s; box-shadow: 0 15px 30px -10px rgba(99, 102, 241, 0.3);" onclick="window.location.href='subscription-plans.html'">
                            <span style="position: absolute; top: -15px; right: 30px; background: #22c55e; color: #fff; padding: 6px 18px; border-radius: 99px; font-size: 0.75rem; font-weight: 900; box-shadow: 0 5px 15px rgba(34, 197, 94, 0.4);">OFFRE ANNUELLE -20%</span>
                            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 15px; text-transform: uppercase; font-weight: 800; letter-spacing: 1px;">Abonnement Annuel</div>
                            <div style="font-size: 2.5rem; font-weight: 900; color: var(--primary-color);">384 USD<span style="font-size: 1rem; opacity: 0.5; font-weight: 400; color: var(--text-secondary);">/an</span></div>
                            <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 15px;">La puissance XERA1 au meilleur prix.</p>
                        </div>
                    </div>

                    <button class="btn btn-primary" onclick="window.location.href='subscription-plans.html'" style="padding: 22px 80px; font-size: 1.3rem; font-weight: 900; border-radius: 20px; box-shadow: 0 15px 35px rgba(99, 102, 241, 0.5); text-transform: uppercase; letter-spacing: 1px;">
                        DEVENIR MEMBRE PREMIUM
                    </button>
                </div>
            </div>

            <!-- Mock Grid floutée -->
            <div style="grid-column: 1/-1; margin-top: 70px; filter: blur(12px); opacity: 0.15; pointer-events: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 30px;">
                ${this.renderMockTalentGrid(true)}
            </div>
        `;
    }

    /**
     * Charge les vrais talents pour les utilisateurs premium
     * Trié par MOMENTUM (Progression) via la vue momentum_discovery_feed
     */
    async loadTalentExplorerData(query = "") {
        const grid = document.getElementById("talent-grid");
        if (!grid) return;

        grid.innerHTML =
            '<div style="grid-column: 1/-1; text-align: center; padding: 100px; min-height: 400px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px;"><div class="loading-spinner"></div><p style="color: var(--text-secondary); font-weight: 600;">Le Momentum Engine analyse les trajectoires en temps réel...</p></div>';

        try {
            // Utilisation de la vue momentum_discovery_feed du Momentum Engine
            let supabaseQuery = this.supabase
                .from("momentum_discovery_feed")
                .select(
                    "id, name, avatar, title, bio, account_subtype, badge, momentum_score",
                );

            if (query) {
                supabaseQuery = supabaseQuery.or(
                    `name.ilike.%${query}%,title.ilike.%${query}%,bio.ilike.%${query}%,account_subtype.ilike.%${query}%`,
                );
            }

            // Tri par le score de momentum calculé en temps réel
            supabaseQuery = supabaseQuery
                .order("momentum_score", { ascending: false })
                .limit(48);

            const { data: users, error } = await supabaseQuery;

            if (error) throw error;

            if (users.length === 0) {
                grid.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 100px; background: var(--bg-secondary); border-radius: 32px; border: 2px dashed var(--border-color);">
                        <div style="font-size: 3rem; margin-bottom: 20px;">🔍</div>
                        <h3>Aucun talent ne correspond à "${this.escapeHtml(query)}"</h3>
                        <p style="color: var(--text-secondary);">Essayez d'utiliser des termes plus génériques comme "React", "Design" ou "AI".</p>
                        <button class="btn btn-secondary" style="margin-top: 20px;" onclick="document.getElementById('talent-search-main').value=''; window.professionalManager.handleTalentSearch()">Effacer la recherche</button>
                    </div>
                `;
                return;
            }

            grid.innerHTML = users
                .map((user) => {
                    const name = this.escapeHtml(user.name || "Talent Anonyme");
                    const title = this.escapeHtml(
                        user.title || user.account_subtype || "Membre Certifié",
                    );
                    const avatar = this.escapeHtml(
                        user.avatar || "https://placehold.co/120",
                    );
                    const score = user.momentum_score || 0;

                    return `
                    <div class="talent-card-premium" style="padding: 35px 25px; display: flex; flex-direction: column; align-items: center; text-align: center; cursor: pointer;" onclick="navigateToUserProfile('${user.id}')">
                        <div style="position: relative; margin-bottom: 20px;">
                            <div style="width: 110px; height: 110px; border-radius: 50%; padding: 5px; background: linear-gradient(135deg, var(--primary-color), #818cf8); margin-bottom: 5px;">
                                <img src="${avatar}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 4px solid var(--bg-secondary);">
                            </div>
                            ${
                                user.badge
                                    ? `
                                <div style="position: absolute; bottom: 8px; right: 8px; background: #000; color: #fff; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; border: 3px solid var(--bg-secondary); box-shadow: 0 4px 10px rgba(0,0,0,0.3);" title="Profil Certifié Official">
                                    <i class="fas fa-check"></i>
                                </div>
                            `
                                    : ""
                            }
                        </div>
                        <h4 style="margin: 0 0 8px 0; font-size: 1.25rem; font-weight: 800; color: var(--text-primary);">${name}</h4>
                        <div style="font-size: 0.9rem; color: var(--primary-color); font-weight: 700; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.5px;">${title}</div>
                        <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 20px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; height: 3.8rem; font-style: italic;">
                            "${user.bio || "Ce talent développe actuellement son Momentum sur XERA1 via des trajectoires certifiées."}"
                        </p>
                        <div style="width: 100%; height: 1px; background: linear-gradient(to right, transparent, var(--border-color), transparent); margin-bottom: 20px;"></div>
                        <div style="display: flex; flex-direction: column; gap: 5px; width: 100%;">
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">Score de Progression</div>
                            <div style="font-weight: 800; font-size: 1.2rem; color: var(--primary-color);">${score} <span style="font-weight: 400; font-size: 0.75rem; color: var(--text-secondary);">pts Momentum</span></div>
                        </div>
                    </div>
                `;
                })
                .join("");
        } catch (err) {
            console.error(err);
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 100px; color: #ef4444; background: rgba(239, 68, 68, 0.05); border-radius: 20px;">Erreur lors du chargement des profils via le Momentum Engine.</div>`;
        }
    }

    /**
     * Rendu des placeholders floutés pour l'état non-premium
     */
    renderMockTalentGrid(returnHtml = false) {
        const html = Array(12)
            .fill(0)
            .map(
                () => `
            <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 24px; padding: 35px 25px; display: flex; flex-direction: column; align-items: center; text-align: center;">
                <div style="width: 100px; height: 100px; background: rgba(255,255,255,0.05); border-radius: 50%; margin-bottom: 20px;"></div>
                <div style="height: 1.5rem; width: 70%; background: rgba(255,255,255,0.05); border-radius: 6px; margin-bottom: 10px;"></div>
                <div style="height: 1rem; width: 40%; background: rgba(255,255,255,0.03); border-radius: 6px; margin-bottom: 20px;"></div>
                <div style="height: 4rem; width: 100%; background: rgba(255,255,255,0.02); border-radius: 12px;"></div>
            </div>
        `,
            )
            .join("");

        if (returnHtml) return html;

        const grid = document.getElementById("talent-grid");
        if (grid) grid.innerHTML = html;
    }

    async fetchTalentExplorerAnalytics(query = "") {
        const { data: users, error } = await this.supabase
            .from("momentum_discovery_feed")
            .select("id, momentum_score, badge, title, account_subtype")
            .limit(100);

        if (error) {
            throw error;
        }

        const rows = users || [];
        const totalMomentum = rows.reduce(
            (sum, user) => sum + (Number(user.momentum_score) || 0),
            0,
        );
        const averageMomentum = rows.length ? totalMomentum / rows.length : 0;
        const certifiedCount = rows.filter((user) => user.badge).length;
        const trendingCount = rows.filter(
            (user) => Number(user.momentum_score) >= 85,
        ).length;
        const growthPercent = rows.length
            ? Math.max(
                  8,
                  Math.min(
                      28,
                      Math.round((certifiedCount / rows.length) * 100),
                  ),
              )
            : 12;

        const areaCounts = rows.reduce((acc, user) => {
            const rawArea = String(
                user.account_subtype || user.title || "Divers",
            )
                .split(/[,\/\-]/)
                .map((token) => token.trim())
                .find(Boolean);
            const area = rawArea || "Divers";
            acc[area] = (acc[area] || 0) + 1;
            return acc;
        }, {});

        const sortedAreas = Object.entries(areaCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);

        const topAreas = sortedAreas.map((area) => ({
            name: area.name,
            count: area.count,
            percent: Math.min(
                100,
                Math.round((area.count / Math.max(1, rows.length)) * 100),
            ),
        }));

        return {
            totalMomentum,
            averageMomentum,
            certifiedCount,
            trendingCount,
            growthPercent,
            topAreas,
        };
    }

    formatCompactNumber(value) {
        const absValue = Math.abs(value);
        if (absValue >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
        if (absValue >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
        return String(value);
    }

    /**
     * Gère la mise à jour depuis le formulaire des réglages
     */
    async handleUpdatePageFromSettings(pageId, form) {
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerText;
        btn.innerText = "Enregistrement...";
        btn.disabled = true;

        try {
            const formData = new FormData(form);
            const updates = {
                name: formData.get("name"),
                websiteUrl: formData.get("website_url"),
                hiringNeeds: formData
                    .get("hiring_needs")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                bio: formData.get("bio"),
                description: formData.get("description"),
                industry: formData.get("industry"),
            };

            await this.updatePage(pageId, updates);
            window.showToast?.("Page mise à jour avec succès !");

            if (window.openSettings) window.openSettings(window.currentUserId);
        } catch (err) {
            console.error(err);
            alert("Erreur lors de la mise à jour: " + err.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
}

/**
 * Classe Onboarding Interactif pour Page Pro
 */
class XERAProfessionalOnboarding {
    constructor(manager) {
        this.manager = manager;
        this.currentStep = 0;
        this.data = {
            name: "",
            industries: [],
            description: "",
            avatarUrl: "",
            bannerUrl: "",
            hiringNeeds: [],
            websiteUrl: "",
            professionalCta: {
                label: "Nous contacter",
                url: "",
            },
        };
        this.overlay = null;
        this.tooltip = null;
        this.industriesList = [
            "Agriculture, Pêche et Environnement",
            "Artisanat et Métiers d'Art",
            "Automobile, Aéronautique, Spatial et Naval",
            "Administration Publique, Secteur Public et Diplomatie",
            "Armée, Défense et Sécurité Nationale",
            "Banque, Finance et Assurance",
            "Chimie, Pharmacie et Biotechnologies",
            "Commerce, Vente et Marketing",
            "Communication, Médias et Audiovisuel",
            "Conseil, Audit et Stratégie (Consulting)",
            "Construction, BTP et Architecture",
            "Culture, Spectacle et Loisirs",
            "Droit, Justice et Sécurité Civil",
            "Éducation, Formation et Recherche",
            "Énergie, Eau et Services Publics (Utilities)",
            "Hôtellerie, Restauration et Tourisme",
            "Humanitaire, ONG et Économie Sociale",
            "Immobilier (Real Estate)",
            "Industrie, Production et Ingénierie",
            "Informatique, Tech et Télécoms",
            "Logistique, Transport et Supply Chain",
            "Luxe et Mode",
            "Ressources Humaines (RH) et Recrutement",
            "Santé, Social et Services à la personne",
            "Sciences, Recherche et Développement",
            "Sport et Bien-être",
        ];
    }

    start() {
        this.currentStep = 0;
        this.createUI();
        this.showStep();
    }

    createUI() {
        if (this.overlay) return;

        // Inject custom styles for the new premium design
        const styleId = "xera1-onboarding-custom-styles";
        if (!document.getElementById(styleId)) {
            const style = document.createElement("style");
            style.id = styleId;
            style.textContent = `
                .onboarding-xxl-split {
                    width: min(850px, 95vw) !important;
                    height: 580px !important;
                    display: flex !important;
                    padding: 0 !important;
                    overflow: hidden !important;
                    border: none !important;
                    border-radius: 16px !important;
                    background: #fff !important;
                    box-shadow: 0 40px 100px rgba(0, 0, 0, 0.2) !important;
                    font-family: 'Inter', sans-serif !important;
                }
                .onboarding-xxl-split * {
                    box-sizing: border-box !important;
                }
                .onboarding-visual-side {
                    flex: 1;
                    background: linear-gradient(135deg, #c4b5fd 0%, #8b5cf6 50%, #5b21b6 100%);
                    background-size: cover;
                    background-position: center;
                    display: flex;
                    flex-direction: column;
                    padding: 50px;
                    color: white;
                    position: relative;
                }
                @media (max-width: 768px) {
                    .onboarding-xxl-split {
                        flex-direction: column !important;
                        height: auto !important;
                        max-height: 90vh !important;
                        overflow-y: auto !important;
                    }
                    .onboarding-visual-side {
                        display: none !important;
                    }
                    .onboarding-form-side {
                        padding: 30px 25px !important;
                    }
                }
                .onboarding-visual-logo {
                    width: 44px;
                    height: 44px;
                    background: rgba(255,255,255,0.15);
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: auto;
                }
                .onboarding-visual-text {
                    margin-bottom: 40px;
                }
                .onboarding-visual-text h2 {
                    font-size: 28px !important;
                    font-weight: 800 !important;
                    margin: 0 !important;
                    color: white !important;
                    letter-spacing: -0.5px;
                    line-height: 1.2 !important;
                }
                .onboarding-visual-text p {
                    font-size: 15px;
                    opacity: 0.9;
                    margin-top: 12px;
                    line-height: 1.4;
                }
                .onboarding-form-side {
                    flex: 1.3;
                    padding: 50px 60px;
                    display: flex;
                    flex-direction: column;
                    background: #fff;
                    color: #000;
                    text-align: left;
                }
                .onboarding-form-side h3 {
                    font-size: 22px !important;
                    font-weight: 700 !important;
                    margin: 0 0 8px 0 !important;
                    color: #000 !important;
                }
                .onboarding-form-side .tutorial-text-body {
                    font-size: 14px !important;
                    color: #64748b !important;
                    margin-bottom: 35px !important;
                    line-height: 1.5 !important;
                }
                .onboarding-input-group {
                    position: relative;
                    margin-bottom: 20px;
                }
                .onboarding-input-group i {
                    position: absolute;
                    left: 0;
                    top: 14px;
                    color: #94a3b8;
                    font-size: 14px;
                }
                .onboarding-form-side .form-input {
                    border: none !important;
                    border-bottom: 1px solid #e2e8f0 !important;
                    border-radius: 0 !important;
                    padding: 12px 0 12px 30px !important;
                    font-size: 15px !important;
                    font-weight: 500 !important;
                    background: transparent !important;
                    color: #000 !important;
                    transition: border-color 0.2s !important;
                    box-shadow: none !important;
                    width: 100% !important;
                    display: block !important;
                }
                .onboarding-form-side .form-input:focus {
                    border-bottom-color: #8b5cf6 !important;
                    outline: none !important;
                }
                .onboarding-form-side textarea.form-input {
                    padding-left: 30px !important;
                }
                .btn-violet-premium {
                    background: #8b5cf6 !important;
                    color: #fff !important;
                    padding: 14px 40px !important;
                    border-radius: 30px !important;
                    font-weight: 600 !important;
                    font-size: 14px !important;
                    border: none !important;
                    cursor: pointer !important;
                    transition: background 0.2s, transform 0.1s !important;
                }
                .btn-violet-premium:hover {
                    background: #7c3aed !important;
                }
                .btn-violet-premium:active {
                    transform: scale(0.98);
                }
                .onboarding-footer-links {
                    margin-top: auto;
                    display: flex;
                    justify-content: center;
                    font-size: 12px;
                    color: #94a3b8;
                }
                .onboarding-footer-links span {
                    color: #8b5cf6;
                    cursor: pointer;
                    font-weight: 600;
                    margin-left: 5px;
                }
                .onboarding-step-counter-clean {
                    font-size: 13px;
                    font-weight: 600;
                    opacity: 0.7;
                    letter-spacing: 1px;
                    text-transform: uppercase;
                }
                .onboarding-cancel-clean {
                    background: none;
                    border: none;
                    color: #94a3b8;
                    font-size: 12px;
                    cursor: pointer;
                    margin-bottom: 30px;
                    padding: 0;
                    text-decoration: underline;
                    align-self: flex-start;
                }
                .selected-industries-chips {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-top: 15px;
                }
                .industry-chip {
                    background: #f1f5f9 !important;
                    color: #475569 !important;
                    padding: 6px 12px !important;
                    border-radius: 20px !important;
                    font-size: 12px !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 6px !important;
                }
                .industry-chip .remove-industry {
                    cursor: pointer;
                    font-weight: bold;
                }
                #onboarding-industry-results {
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
                }
                .industry-option:hover {
                    background: #f8fafc;
                }
                .custom-file-upload-premium {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    border: 1px dashed #e2e8f0;
                    padding: 30px;
                    border-radius: 12px;
                    cursor: pointer;
                    transition: border-color 0.2s;
                }
                .custom-file-upload-premium:hover {
                    border-color: #8b5cf6;
                }
            `;
            document.head.appendChild(style);
        }

        this.overlay = document.createElement("div");
        this.overlay.className = "tutorial-overlay-premium";
        this.overlay.style.zIndex = "10000";
        document.body.appendChild(this.overlay);

        this.tooltip = document.createElement("div");
        this.tooltip.className = "onboarding-xxl-split";
        this.tooltip.style.zIndex = "10001";
        this.tooltip.style.top = "50%";
        this.tooltip.style.left = "50%";
        this.tooltip.style.transform = "translate(-50%, -50%)";
        this.tooltip.style.position = "fixed";
        this.tooltip.style.display = "flex"; // Force display flex
        this.tooltip.style.pointerEvents = "auto"; // Ensure interaction
        document.body.appendChild(this.tooltip);
    }

    showStep() {
        const steps = [
            {
                title: "Nom de votre Page",
                desc: "Choisissez un nom qui représente votre marque ou organisation officielle.",
                icon: "fa-building",
                content: `<input type="text" id="onboarding-name" class="form-input" placeholder="Ex: MA PAGE corp" value="${this.data.name}">`,
            },
            {
                title: "Secteurs d'activité",
                desc: "Précisez vos domaines pour un ciblage optimal (Max 4).",
                icon: "fa-tags",
                content: `
                    <div class="industry-search-container" style="position: relative;">
                        <input type="text" id="onboarding-industry-search" class="form-input" placeholder="Rechercher un secteur..." autocomplete="off">
                        <div id="onboarding-industry-results" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 100; max-height: 200px; overflow-y: auto;">
                            ${this.industriesList.map((ind) => `<div class="industry-option" style="padding: 10px; cursor: pointer; font-size: 13px;">${ind}</div>`).join("")}
                        </div>
                    </div>
                    <div id="selected-industries-list" class="selected-industries-chips">
                        ${this.data.industries
                            .map(
                                (ind, idx) => `
                            <div class="industry-chip">
                                ${ind}
                                <span class="remove-industry" data-index="${idx}">×</span>
                            </div>
                        `,
                            )
                            .join("")}
                    </div>
                `,
            },
            {
                title: "Mission & Description",
                desc: "Racontez votre histoire et vos objectifs stratégiques.",
                icon: "fa-align-left",
                content: `<textarea id="onboarding-desc" class="form-input" placeholder="Détaillez vos missions..." style="min-height: 100px; resize: none;">${this.data.description}</textarea>`,
            },
            {
                title: "Logo Officiel",
                desc: "L'identité visuelle qui s'affichera partout sur XERA1.",
                icon: "fa-image",
                content: `
                    <label for="onboarding-avatar-file" class="custom-file-upload-premium">
                        ${this.data.avatarUrl ? `<img src="${this.data.avatarUrl}" style="width: 80px; height: 80px; border-radius: 12px; object-fit: cover;">` : '<i class="fa-solid fa-cloud-arrow-up" style="font-size: 24px; color: #cbd5e1; margin-bottom: 10px; position: static;"></i><span style="font-size: 13px; color: #94a3b8;">Uploader le logo</span>'}
                    </label>
                    <input type="file" id="onboarding-avatar-file" accept="image/*" style="display:none">
                    <div id="avatar-upload-status" style="font-size: 12px; color: #8b5cf6; margin-top: 10px; text-align: center;"></div>
                `,
            },
            {
                title: "Bannière",
                desc: "Habillez votre profil (optionnel).",
                icon: "fa-panorama",
                content: `
                    <label for="onboarding-banner-file" class="custom-file-upload-premium">
                         ${this.data.bannerUrl ? `<img src="${this.data.bannerUrl}" style="width: 100%; height: 60px; border-radius: 8px; object-fit: cover;">` : '<i class="fa-solid fa-image" style="font-size: 24px; color: #cbd5e1; margin-bottom: 10px; position: static;"></i><span style="font-size: 13px; color: #94a3b8;">Uploader la bannière</span>'}
                    </label>
                    <input type="file" id="onboarding-banner-file" accept="image/*" style="display:none">
                    <div id="banner-upload-status" style="font-size: 12px; color: #8b5cf6; margin-top: 10px; text-align: center;"></div>
                `,
            },
            {
                title: "Centres d'intérêts",
                desc: "Compétences ou technologies que vous recherchez.",
                icon: "fa-bolt",
                content: `<input type="text" id="onboarding-interests" class="form-input" placeholder="Ex: React, AI, Design..." value="${this.data.hiringNeeds.join(", ")}">`,
            },
            {
                title: "Action principale",
                desc: "Personnalisez un bouton qui ouvre un lien ou appelle un numéro.",
                icon: "fa-link",
                content: `<input type="text" id="onboarding-cta-label" class="form-input" maxlength="40" placeholder="Ex: Nous contacter, Réserver" value="${this.data.professionalCta.label || ""}"><input type="text" id="onboarding-website" class="form-input" placeholder="https://... ou +243 800 000 000" value="${this.data.professionalCta.url || this.data.websiteUrl || ""}">`,
            },
        ];

        const step = steps[this.currentStep];
        const isLast = this.currentStep === steps.length - 1;

        this.tooltip.innerHTML = `
            <div class="onboarding-visual-side">
                <div class="onboarding-visual-logo">
                    <img src="icons/logo.png" style="width: 24px; height: 24px; filter: brightness(0) invert(1);">
                </div>
                <div class="onboarding-visual-text">
                    <h2 style="font-family: 'Outfit', sans-serif !important;">XERA1 Pro Page</h2>
                    <p>Déployez votre entité professionnelle et commencez à recruter ou à collaborer.</p>
                </div>
                <div class="onboarding-step-counter-clean">
                    Étape ${this.currentStep + 1} / ${steps.length}
                </div>
            </div>
            <div class="onboarding-form-side">
                <button class="onboarding-cancel-clean" id="onboarding-cancel">Annuler la configuration</button>

                <h3 style="font-family: 'Outfit', sans-serif !important;">${step.title}</h3>
                <div class="tutorial-text-body" style="margin-bottom: 25px !important;">${step.desc}</div>

                <div class="onboarding-input-group" style="${this.currentStep === 3 || this.currentStep === 4 ? "display:none" : ""}">
                    <i class="fa-solid ${step.icon}"></i>
                    ${this.currentStep === 1 || this.currentStep === 2 ? "" : step.content}
                </div>

                ${this.currentStep === 1 || this.currentStep === 2 || this.currentStep === 3 || this.currentStep === 4 ? step.content : ""}

                <div style="display: flex; gap: 20px; align-items: center; margin-top: auto; justify-content: flex-end;">
                    ${this.currentStep > 0 ? `<button id="onboarding-prev" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-weight:600; font-size:13px; padding: 10px;">Retour</button>` : ""}
                    <button class="btn-violet-premium" id="onboarding-next">${isLast ? "Déployer la Page" : "Étape suivante"}</button>
                </div>
            </div>
        `;

        this.attachEvents();
    }

    attachEvents() {
        document.getElementById("onboarding-cancel").onclick = () =>
            this.destroy();
        const prevBtn = document.getElementById("onboarding-prev");
        if (prevBtn)
            prevBtn.onclick = () => {
                this.saveCurrentStepData();
                this.currentStep--;
                this.showStep();
            };

        const nextBtn = document.getElementById("onboarding-next");
        nextBtn.onclick = async () => {
            try {
                const ok = await this.validateCurrentStep();
                if (!ok) return;
                this.saveCurrentStepData();
                if (this.currentStep < 6) {
                    this.currentStep++;
                    this.showStep();
                } else {
                    await this.finish();
                }
            } catch (err) {
                console.error("Onboarding next error:", err);
                try {
                    alert(
                        `Erreur lors de l'étape d'onboarding: ${err?.message || err}`,
                    );
                } catch (e) {
                    // ignore alert errors
                }
            }
        };

        if (this.currentStep === 1) {
            const searchInput = document.getElementById(
                "onboarding-industry-search",
            );
            const resultsDiv = document.getElementById(
                "onboarding-industry-results",
            );
            const chipsContainer = document.getElementById(
                "selected-industries-list",
            );

            searchInput.onfocus = () => {
                resultsDiv.style.display = "block";
            };
            searchInput.oninput = (e) => {
                const val = e.target.value.toLowerCase();
                const options = resultsDiv.querySelectorAll(".industry-option");
                options.forEach((opt) => {
                    const text = opt.innerText.toLowerCase();
                    opt.style.display = text.includes(val) ? "block" : "none";
                });
            };

            resultsDiv.onclick = (e) => {
                if (e.target.classList.contains("industry-option")) {
                    const selected = e.target.innerText;
                    if (this.data.industries.length >= 4) {
                        alert("Maximum 4 secteurs autorisés.");
                        return;
                    }
                    if (!this.data.industries.includes(selected)) {
                        this.data.industries.push(selected);
                        this.renderIndustryChips();
                    }
                    searchInput.value = "";
                    resultsDiv.style.display = "none";
                }
            };

            chipsContainer.onclick = (e) => {
                if (e.target.classList.contains("remove-industry")) {
                    const idx = parseInt(e.target.dataset.index);
                    this.data.industries.splice(idx, 1);
                    this.renderIndustryChips();
                }
            };
        }

        if (this.currentStep === 3) {
            const fileInput = document.getElementById("onboarding-avatar-file");
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const status = document.getElementById("avatar-upload-status");
                status.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px;"><span class="loading-spinner" style="width:18px;height:18px;border-width:2px;"></span>Téléversement du logo en cours...</span>`;
                const res = await window.uploadFile(file, "pro-pages/avatars");
                if (res.success) {
                    this.data.avatarUrl = res.url;
                    this.showStep();
                } else {
                    alert("Échec du téléversement : " + res.error);
                    status.innerText = "Échec du téléversement.";
                }
            };
        }

        if (this.currentStep === 4) {
            const fileInput = document.getElementById("onboarding-banner-file");
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const status = document.getElementById("banner-upload-status");
                status.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px;"><span class="loading-spinner" style="width:18px;height:18px;border-width:2px;"></span>Téléversement de la bannière en cours...</span>`;
                const res = await window.uploadFile(file, "pro-pages/banners");
                if (res.success) {
                    this.data.bannerUrl = res.url;
                    this.showStep();
                } else {
                    alert("Échec du téléversement : " + res.error);
                    status.innerText = "Échec du téléversement.";
                }
            };
        }
    }

    async validateCurrentStep() {
        switch (this.currentStep) {
            case 0:
                const pageName = document
                    .getElementById("onboarding-name")
                    .value.trim();
                if (!pageName) {
                    alert("Nom obligatoire.");
                    return false;
                }
                try {
                    const isAvailable =
                        await this.manager.isPageNameAvailable(pageName);
                    if (!isAvailable) {
                        alert(
                            "Ce nom de Page Pro est déjà utilisé. Choisissez un autre nom.",
                        );
                        return false;
                    }
                } catch (error) {
                    console.error(
                        "Vérification du nom de Page Pro impossible:",
                        error,
                    );
                    alert(
                        "Impossible de vérifier l'unicité du nom pour le moment.",
                    );
                    return false;
                }
                return true;
            case 1:
                if (this.data.industries.length === 0) {
                    alert("Choisissez au moins 1 secteur.");
                    return false;
                }
                return true;
            case 2:
                if (
                    document.getElementById("onboarding-desc").value.trim()
                        .length < 20
                ) {
                    alert("Description trop courte (min 20 car.).");
                    return false;
                }
                return true;
            case 3:
                if (!this.data.avatarUrl) {
                    alert("Logo requis.");
                    return false;
                }
                return true;
            case 5:
                if (
                    !document
                        .getElementById("onboarding-interests")
                        .value.trim()
                ) {
                    alert("Centres d'intérêts requis.");
                    return false;
                }
                return true;
            case 6:
                if (
                    !document.getElementById("onboarding-website").value.trim()
                ) {
                    alert("Un lien ou un numéro est requis.");
                    return false;
                }
                const ctaLabel = document
                    .getElementById("onboarding-cta-label")
                    .value.trim();
                if (!ctaLabel || ctaLabel.length > 25) {
                    alert(
                        "Choisissez un intitulé valide (25 caractères maximum).",
                    );
                    return false;
                }
                return true;
        }
        return true;
    }

    renderIndustryChips() {
        const container = document.getElementById("selected-industries-list");
        if (!container) return;
        container.innerHTML = this.data.industries
            .map(
                (ind, idx) => `
            <div class="industry-chip">
                ${ind}
                <span class="remove-industry" data-index="${idx}">×</span>
            </div>
        `,
            )
            .join("");
    }

    saveCurrentStepData() {
        switch (this.currentStep) {
            case 0:
                this.data.name = document
                    .getElementById("onboarding-name")
                    .value.trim();
                break;
            case 2:
                this.data.description =
                    document.getElementById("onboarding-desc").value;
                break;
            case 5:
                const interests = document.getElementById(
                    "onboarding-interests",
                ).value;
                this.data.hiringNeeds = interests
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                break;
            case 6:
                this.data.websiteUrl = document
                    .getElementById("onboarding-website")
                    .value.trim();
                this.data.professionalCta = {
                    label: document
                        .getElementById("onboarding-cta-label")
                        .value.trim(),
                    url: this.data.websiteUrl,
                };
                break;
        }
    }

    async finish() {
        const nextBtn = document.getElementById("onboarding-next");
        nextBtn.innerText = "Initialisation...";
        nextBtn.disabled = true;

        try {
            const finalData = {
                ...this.data,
                industry: this.data.industries.join(", "),
            };
            const newPage = await this.manager.createPage(finalData);
            window.showToast?.("Page Pro déployée avec succès !");
            this.manager.myPageSlug = newPage.slug;
            this.destroy();
            await this.manager.initNavigation();
            this.manager.renderProPage(newPage.slug);
        } catch (err) {
            console.error(err);
            alert("Erreur: " + err.message);
            nextBtn.innerText = "Déployer la Page";
            nextBtn.disabled = false;
        }
    }

    destroy() {
        if (this.overlay) this.overlay.remove();
        if (this.tooltip) this.tooltip.remove();
        this.overlay = null;
        this.tooltip = null;
    }
}

window.openProfessionalCtaModal = async function (pageId) {
    const { data: page, error } = await window.supabase
        .from("professional_pages")
        .select("name, metadata")
        .eq("id", pageId)
        .single();
    if (error || !page) return;

    const cta = getProfessionalCta(page);
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal-content" style="max-width:460px;"><button type="button" class="modal-close" aria-label="Fermer">&times;</button><h3>${cta.label}</h3><p>Recevez une réponse de ${page.name}.</p><form id="professional-cta-lead-form"><input name="name" required placeholder="Nom complet" class="form-input"><input name="company" required placeholder="Entreprise / Fonds" class="form-input"><input name="email" type="email" required placeholder="Email professionnel" class="form-input"><button type="submit" class="btn-pro-primary">Envoyer ma demande</button></form></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".modal-close").onclick = () => overlay.remove();
    overlay.onclick = (event) => {
        if (event.target === overlay) overlay.remove();
    };
    overlay.querySelector("form").onsubmit = async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const submit = form.querySelector("button[type=submit]");
        submit.disabled = true;
        const values = Object.fromEntries(new FormData(form));
        const { error: insertError } = await window.supabase
            .from("professional_cta_leads")
            .insert({
                page_id: pageId,
                objective: cta.objective,
                name: values.name,
                company: values.company,
                email: values.email,
            });
        if (insertError) {
            submit.disabled = false;
            window.showToast?.("Impossible d'envoyer la demande.", "error");
            return;
        }
        window.showToast?.("Votre demande a bien été envoyée !");
        overlay.remove();
    };
};

window.resolvePageProMessageTarget = function resolvePageProMessageTarget(
    page = {},
) {
    const ownerId =
        page.owner_id || page.ownerId || page.user_id || page.userId || null;
    const companySlug = page.slug || page.pageSlug || page.companySlug || null;

    return {
        userId: ownerId,
        companySlug,
        kind: "company",
    };
};

window.startCompanyMessageFromPage = async function startCompanyMessageFromPage(
    pageId,
    pageSlug,
    pageName,
) {
    try {
        if (!window.supabase) {
            window.showToast?.("Connexion Supabase indisponible.", "error");
            return;
        }

        const targetPage = await window.supabase
            .from("professional_pages")
            .select("id, owner_id, slug, name")
            .or(pageId ? `id.eq.${pageId}` : `slug.eq.${pageSlug}`)
            .maybeSingle();

        const page = targetPage?.data || null;
        const resolved = window.resolvePageProMessageTarget(
            page || { id: pageId, slug: pageSlug, name: pageName },
        );

        if (!resolved.userId) {
            window.showToast?.(
                "Impossible d’ouvrir cette discussion.",
                "error",
            );
            return;
        }

        if (typeof window.openMessagesWithUser === "function") {
            window.openMessagesWithUser(resolved.userId);
            return;
        }

        const url = new URL("index.html", window.location.href);
        url.searchParams.set("messages", "1");
        url.searchParams.set("dm", resolved.userId);
        window.location.href = url.toString();
    } catch (error) {
        console.error("Start company message failed:", error);
        window.showToast?.(
            "Conversation indisponible pour cette Page Pro.",
            "error",
        );
    }
};

// Export pour usage global avec initialisation automatique
if (typeof window !== "undefined") {
    // 1. Définition immédiate des utilitaires de navigation pour éviter le "?.()" qui ne fait rien
    window.waitForProfessionalManager = async function (timeoutMs = 5000) {
        const start = Date.now();
        while (!window.professionalManager && Date.now() - start < timeoutMs) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return window.professionalManager;
    };

    window.navigateToProfessionalPage = async function (event) {
        console.log("[Pro] Global navigateToProfessionalPage called");

        if (event && typeof event.preventDefault === "function") {
            event.preventDefault();
        }

        // Notification immédiate pour retour utilisateur
        if (typeof window.showToast === "function") {
            window.showToast(
                "Ouverture de votre espace professionnel...",
                "info",
            );
        }

        const manager =
            window.professionalManager ||
            (await window.waitForProfessionalManager(4000));

        if (!manager) {
            console.error("[Pro] Professional Manager not ready after wait");
            // Fallback ultime : redirection manuelle si possible
            const params = new URLSearchParams(window.location.search);
            const currentSlug = params.get("pro");
            if (currentSlug) {
                window.location.href = `profile.html?pro=${currentSlug}`;
            } else {
                window.location.href = "profile.html";
            }
            return;
        }

        try {
            await manager.navigateToMyPage();
        } catch (err) {
            console.error("[Pro] Error in navigateToMyPage:", err);
            // Fallback sur erreur
            window.location.href = "profile.html";
        }
    };

    // 2. Initialisation du manager
    const initManager = () => {
        const client =
            window.supabaseClient ||
            window.supabase ||
            (typeof supabase !== "undefined" ? supabase : null);

        if (client && client.auth) {
            console.log("[Pro] Supabase client found, initializing manager...");
            window.professionalManager = new XERAProfessionalManager(client);
            window.professionalManager.initNavigation().catch(console.warn);
            console.log("XERA1 Professional Manager initialized.");
        } else {
            // Si pas encore de client, on réessaie (peut arriver si le CDN est lent)
            setTimeout(initManager, 200);
        }
    };

    initManager();
}
