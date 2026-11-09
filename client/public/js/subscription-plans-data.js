(function () {
    const Services = window.XeraAppServices || {};
    const DEFAULT_NAV_AVATAR =
        "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='40' height='40' rx='20' fill='%231f2937'/><circle cx='20' cy='16' r='6' fill='%23e5e7eb'/><path d='M8%2034c2.5-6%208-9%2012-9s9.5%203%2012%209' fill='%23e5e7eb'/></svg>";
    const ANNUAL_DISCOUNT = 0.2;
    const DEFAULT_BILLING_CYCLE = "monthly";
    const BILLING_CYCLES = Object.freeze({
        MONTHLY: "monthly",
        ANNUAL: "annual",
    });

    const BILLING_OPTIONS = Object.freeze([
        Object.freeze({
            id: BILLING_CYCLES.MONTHLY,
            label: "Mensuel",
        }),
        Object.freeze({
            id: BILLING_CYCLES.ANNUAL,
            label: "Annuel -20%",
        }),
    ]);

    const HERO_UNLOCKS = Object.freeze([
        Object.freeze({
            iconClass: "fas fa-circle-check",
            text: "Badges bleu, medium ou gold",
        }),
        Object.freeze({
            iconClass: "fas fa-shield-halved",
            text: "Vérification premium pour Pages Pro",
        }),
        Object.freeze({
            iconClass: "fas fa-circle-check",
            text: "Monétisation et dons communautaires",
        }),
        Object.freeze({
            iconClass: "fas fa-circle-check",
            text: "Priorité Discover + analytics",
        }),
        Object.freeze({
            iconClass: "fas fa-circle-check",
            text: "Lives HD et lives privés (Pro)",
        }),
        Object.freeze({
            iconClass: "fas fa-circle-check",
            text: "GIF avatar/bannière + notifications live",
        }),
        Object.freeze({
            iconClass: "fas fa-star",
            text: "Stats détaillées et personnalisation avancée (Medium+)",
        }),
        Object.freeze({
            iconClass: "fas fa-crown",
            text: "Monétisation vidéo et accès anticipé (Pro)",
        }),
    ]);

    const HERO_TRUST_ITEMS = Object.freeze([
        Object.freeze({
            iconClass: "fas fa-shield-halved",
            text: "Paiement sécurisé",
        }),
        Object.freeze({
            iconClass: "fas fa-file-invoice",
            text: "Facturation claire",
        }),
        Object.freeze({
            iconClass: "fas fa-sliders",
            text: "Gestion depuis ton profil",
        }),
    ]);

    const PLAN_DEFINITIONS = Object.freeze({
        standard: Object.freeze({
            id: "standard",
            title: "Standard",
            iconClass: "fas fa-check-circle",
            cardClassName: "standard",
            monthlyPrice: 2.99,
            description: "La base idéale pour obtenir votre badge bleu",
            buttonLabel: "Choisir Standard",
            badgeLabel: "",
            features: Object.freeze([
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Badge de vérification bleu",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Historique complet et public",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Priorité dans le feed Discover",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Avatar/Bannière GIF autorisés",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Notifications automatiques aux followers quand vous lancez un live",
                }),
            ]),
        }),
        medium: Object.freeze({
            id: "medium",
            title: "Medium",
            iconClass: "fas fa-heart",
            cardClassName: "medium",
            monthlyPrice: 7.99,
            description: "Tous les avantages Standard + monétisation",
            buttonLabel: "Choisir Medium",
            badgeLabel: "Populaire",
            features: Object.freeze([
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Badge de vérification bleu",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Historique complet et public",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Priorité dans le feed Discover",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Avatar/Bannière GIF autorisés",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Notifications automatiques aux followers quand vous lancez un live",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Fonctionnalités de monétisation",
                }),
                Object.freeze({
                    iconClass: "fas fa-star",
                    text: "Statistiques détaillées des revenus",
                }),
                Object.freeze({
                    iconClass: "fas fa-star",
                    text: "Priorité dans les recommandations",
                }),
            ]),
        }),
        pro: Object.freeze({
            id: "pro",
            title: "Pro",
            iconClass: "fas fa-crown",
            cardClassName: "pro recommended",
            monthlyPrice: 14.99,
            description: "Le pack complet avec badge Gold et analytics avancés",
            buttonLabel: "Choisir Pro",
            badgeLabel: "",
            features: Object.freeze([
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Badge de vérification bleu",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Historique complet et public",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Priorité dans le feed Discover",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Avatar/Bannière GIF autorisés",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Notifications automatiques aux followers quand vous lancez un live",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Fonctionnalités de monétisation",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Badge Gold",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Analytics avancés",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Qualité de lives en HD",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Lives privés réservés aux followers",
                }),
                Object.freeze({
                    iconClass: "fas fa-star",
                    text: "Statistiques détaillées des revenus",
                }),
                Object.freeze({
                    iconClass: "fas fa-star",
                    text: "Priorité dans les recommandations",
                }),
                Object.freeze({
                    iconClass: "fas fa-crown",
                    text: "Accès anticipé aux nouvelles fonctionnalités",
                }),
                Object.freeze({
                    iconClass: "fas fa-crown",
                    text: "Export des données et rapports détaillés",
                }),
                Object.freeze({
                    iconClass: "fas fa-crown",
                    text: "Visibilité maximale dans Discover",
                }),
            ]),
        }),
        page_verification: Object.freeze({
            id: "page_verification",
            title: "Vérification Page Pro",
            iconClass: "fas fa-shield-halved",
            cardClassName: "page-verification",
            monthlyPrice: 25,
            description:
                "Vérification premium pour Pages Pro : plus de visibilité, plus de crédibilité, badge de vérification et accès aux meilleurs profils.",
            buttonLabel: "Payer la vérification",
            badgeLabel: "Nouveau",
            features: Object.freeze([
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Badge de vérification officiel sur la page",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Visibilité accrue dans Discover et recommandations",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Crédibilité renforcée auprès des talents et partenaires",
                }),
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Accès prioritaire aux meilleurs profils du réseau",
                }),
                Object.freeze({
                    iconClass: "fas fa-star",
                    text: "Offre annuelle à 20 % de réduction",
                }),
            ]),
        }),
    });

    const PLAN_IDS = Object.freeze(Object.keys(PLAN_DEFINITIONS));

    const FAQ_ITEMS = Object.freeze([
        Object.freeze({
            id: "monetization",
            question: "Comment fonctionne la monétisation ?",
            answer: "Pour activer la monétisation, vous devez avoir un abonnement Medium ou Pro actif ET au moins 1000 abonnés. Une fois activée, vous pouvez recevoir des soutiens financiers de votre communauté sur votre profil, vos lives et vos contenus.",
        }),
        Object.freeze({
            id: "commission",
            question: "Quelle commission prend XERA ?",
            answer: "XERA prélève une commission de 20% sur chaque transaction. Cela signifie que vous recevez 80% du montant des soutiens. Par exemple, pour un soutien de $10, vous recevez $8 net.",
        }),
        Object.freeze({
            id: "video-monetization",
            question: "Comment fonctionne la monétisation vidéo ?",
            answer: "Avec le plan Pro, vous gagnez $0.40 pour chaque 1000 vues sur vos vidéos de plus de 60 secondes. Les revenus sont calculés mensuellement et versés sur votre compte Mobile Money, moins la commission de 20% de XERA.",
        }),
        Object.freeze({
            id: "switch-plan",
            question: "Puis-je changer de plan à tout moment ?",
            answer: "Oui, vous pouvez upgrader ou downgrader votre plan à tout moment. Si vous passez à un plan supérieur, vous serez facturé au prorata. Si vous downgradez, le changement prendra effet à la fin de votre période de facturation actuelle.",
        }),
        Object.freeze({
            id: "payouts",
            question: "Comment sont payés les revenus ?",
            answer: "Les revenus sont versés par Mobile Money (Airtel Money, Orange Money, M-Pesa). Les revenus des soutiens sont disponibles immédiatement, tandis que les revenus vidéo sont calculés et payés mensuellement.",
        }),
        Object.freeze({
            id: "followers-threshold",
            question:
                "Que se passe-t-il si je descends en dessous de 1000 abonnés ?",
            answer: "Si vous descendez en dessous de 1000 abonnés, votre statut de monétisation sera temporairement désactivé. Vous ne pourrez plus recevoir de nouveaux soutiens tant que vous n'aurez pas retrouvé 1000 abonnés. Vos revenus précédents restent à vous.",
        }),
    ]);

    function normalizeBillingCycle(value) {
        return String(value || "").toLowerCase() === BILLING_CYCLES.ANNUAL
            ? BILLING_CYCLES.ANNUAL
            : DEFAULT_BILLING_CYCLE;
    }

    function normalizePlanId(value) {
        const planId = String(value || "").toLowerCase();
        return PLAN_DEFINITIONS[planId] ? planId : "standard";
    }

    function getPlanDefinition(planId) {
        return PLAN_DEFINITIONS[normalizePlanId(planId)];
    }

    function getPlanDisplayName(planId) {
        return getPlanDefinition(planId).title;
    }

    function getMoneyFormatter() {
        if (Services.formatters?.currency) {
            return Services.formatters.currency;
        }
        if (typeof window.formatCurrency === "function") {
            return window.formatCurrency;
        }
        return function fallbackFormatCurrency(amount) {
            return `$${Number(amount || 0).toFixed(2)}`;
        };
    }

    function getMonthlyPrice(planId) {
        return Number(getPlanDefinition(planId).monthlyPrice || 0);
    }

    function getAnnualBasePrice(planId) {
        return getMonthlyPrice(planId) * 12;
    }

    function getPlanPrice(planId, billingCycle) {
        const normalizedBillingCycle = normalizeBillingCycle(billingCycle);
        if (normalizedBillingCycle === BILLING_CYCLES.ANNUAL) {
            return getAnnualBasePrice(planId) * (1 - ANNUAL_DISCOUNT);
        }
        return getMonthlyPrice(planId);
    }

    function getPlanPriceViewModel(planId, billingCycle) {
        const normalizedPlanId = normalizePlanId(planId);
        const normalizedBillingCycle = normalizeBillingCycle(billingCycle);
        const formatter = getMoneyFormatter();
        const amount = getPlanPrice(normalizedPlanId, normalizedBillingCycle);
        const annualBase = getAnnualBasePrice(normalizedPlanId);

        return {
            amount,
            billingCycle: normalizedBillingCycle,
            formattedAmount: formatter(amount),
            monthlyPrice: getMonthlyPrice(normalizedPlanId),
            suffix:
                normalizedBillingCycle === BILLING_CYCLES.ANNUAL
                    ? "/an"
                    : "/mois",
            savingsLabel:
                normalizedBillingCycle === BILLING_CYCLES.ANNUAL
                    ? `au lieu de ${formatter(annualBase)}/an`
                    : "",
        };
    }

    function normalizeCurrentPlan(planId) {
        const normalizedPlanId = String(planId || "").toLowerCase();
        return PLAN_DEFINITIONS[normalizedPlanId] ? normalizedPlanId : "free";
    }

    function isCurrentPlan(currentPlan, planId) {
        return normalizeCurrentPlan(currentPlan) === normalizePlanId(planId);
    }

    function resolveNavAvatarUrl(avatarUrl) {
        const value = String(avatarUrl || "").trim();
        if (!value) return "";
        if (!/^https?:/i.test(value)) return value;
        try {
            const url = new URL(value, window.location.origin);
            url.searchParams.set("v", Date.now().toString());
            return url.toString();
        } catch (error) {
            return value;
        }
    }

    function getPlanSummary(planId, billingCycle) {
        const plan = getPlanDefinition(planId);
        return {
            id: plan.id,
            title: plan.title,
            description: plan.description,
            features: plan.features.slice(0, 4),
            price: getPlanPriceViewModel(plan.id, billingCycle),
        };
    }

    window.XeraSubscriptionPlansData = Object.freeze({
        ANNUAL_DISCOUNT,
        BILLING_CYCLES,
        BILLING_OPTIONS,
        DEFAULT_BILLING_CYCLE,
        DEFAULT_NAV_AVATAR,
        FAQ_ITEMS,
        HERO_TRUST_ITEMS,
        HERO_UNLOCKS,
        PLAN_DEFINITIONS,
        PLAN_IDS,
        getAnnualBasePrice,
        getMoneyFormatter,
        getMonthlyPrice,
        getPlanDefinition,
        getPlanDisplayName,
        getPlanPrice,
        getPlanPriceViewModel,
        getPlanSummary,
        isCurrentPlan,
        normalizeBillingCycle,
        normalizeCurrentPlan,
        normalizePlanId,
        resolveNavAvatarUrl,
    });
})();
