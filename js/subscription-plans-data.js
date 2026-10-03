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
            text: "Badge vérifié bleu ou gold selon le plan",
        }),
        Object.freeze({
            iconClass: "fas fa-circle-check",
            text: "Soutiens communautaires avec un abonnement Medium ou Pro actif",
        }),
        Object.freeze({
            iconClass: "fas fa-circle-check",
            text: "Personnalisation avancée et recommandations prioritaires avec Medium+",
        }),
        Object.freeze({
            iconClass: "fas fa-circle-check",
            text: "Streaming HD et lives privés avec Pro",
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

    const PLAN_BENEFIT_RULES = Object.freeze({
        standard: Object.freeze({
            id: "standard",
            visibilityMultiplier: 1,
            includes: [],
            features: Object.freeze([
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Badge de vérification bleu",
                }),
                Object.freeze({
                    iconClass: "fas fa-chart-line",
                    text: "Bonus de visibilité dans les recommandations des Pages Pro",
                }),
            ]),
        }),
        medium: Object.freeze({
            id: "medium",
            visibilityMultiplier: 1.5,
            includes: ["standard"],
            features: Object.freeze([
                Object.freeze({
                    iconClass: "fas fa-check",
                    text: "Badge de vérification bleu",
                }),
                Object.freeze({
                    iconClass: "fas fa-chart-line",
                    text: "Score de visibilité dans le feed multiplié par 1,5",
                }),
                Object.freeze({
                    iconClass: "fas fa-sliders",
                    text: "Personnalisation avancée du profil",
                }),
                Object.freeze({
                    iconClass: "fas fa-arrow-up-wide-short",
                    text: "Priorité renforcée dans les recommandations",
                }),
                Object.freeze({
                    iconClass: "fas fa-heart",
                    text: "Réception des soutiens dès l’activation de l’abonnement",
                }),
            ]),
        }),
        pro: Object.freeze({
            id: "pro",
            visibilityMultiplier: 5,
            includes: ["medium", "standard"],
            features: Object.freeze([]),
        }),
    });

    const PLAN_DEFINITIONS = Object.freeze({
        standard: Object.freeze({
            id: "standard",
            title: "Standard",
            iconClass: "fas fa-check-circle",
            cardClassName: "standard",
            monthlyPrice: 2.99,
            description:
                "Affirmez votre profil avec un badge vérifié et un bonus de visibilité.",
            buttonLabel: "Choisir Standard",
            badgeLabel: "",
            features: PLAN_BENEFIT_RULES.standard.features,
        }),
        medium: Object.freeze({
            id: "medium",
            title: "Medium",
            iconClass: "fas fa-heart",
            cardClassName: "medium",
            monthlyPrice: 7.99,
            description:
                "Personnalisez votre profil, recevez des soutiens et profitez d’un score de visibilité multiplié par 1,5 dans le feed.",
            buttonLabel: "Choisir Medium",
            badgeLabel: "Populaire",
            features: PLAN_BENEFIT_RULES.medium.features,
        }),
        pro: Object.freeze({
            id: "pro",
            title: "Pro",
            iconClass: "fas fa-crown",
            cardClassName: "pro recommended",
            monthlyPrice: 14.99,
            description:
                "Le palier créateur : score de visibilité multiplié par 5 dans le feed, badge Gold, streaming HD et lives privés.",
            buttonLabel: "Choisir Pro",
            badgeLabel: "",
            features: Object.freeze([
                Object.freeze({
                    iconClass: "fas fa-check-double",
                    text: "Tous les avantages Medium",
                }),
                Object.freeze({
                    iconClass: "fas fa-heart",
                    text: "Réception des soutiens dès l’activation du plan, sans seuil d’abonnés",
                }),
                Object.freeze({
                    iconClass: "fas fa-chart-line",
                    text: "Score de visibilité dans le feed multiplié par 5",
                }),
                Object.freeze({
                    iconClass: "fas fa-crown",
                    text: "Badge de vérification Gold",
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
                    iconClass: "fas fa-wallet",
                    text: "Accès au dashboard des soutiens et des retraits",
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
                    text: "Jusqu'à 10 fois plus de visibilité sur les posts dans Discover et les recommandations",
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
            answer: "Un abonnement Medium ou Pro actif permet de recevoir des soutiens dès son activation, sans seuil d’abonnés. Le bouton apparaît sur le profil et les contenus éligibles.",
        }),
        Object.freeze({
            id: "commission",
            question: "Quelle commission prend XERA1 ?",
            answer: "XERA1 prélève une commission de 25% sur chaque soutien confirmé. Vous recevez 75% du montant, avant les éventuels frais du prestataire de paiement. Par exemple, pour un soutien de $10, votre part est de $7.50.",
        }),
        Object.freeze({
            id: "switch-plan",
            question: "Puis-je changer de plan à tout moment ?",
            answer: "Oui, vous pouvez upgrader ou downgrader votre plan à tout moment. Si vous passez à un plan supérieur, vous serez facturé au prorata. Si vous downgradez, le changement prendra effet à la fin de votre période de facturation actuelle.",
        }),
        Object.freeze({
            id: "payouts",
            question: "Comment sont payés les revenus ?",
            answer: "Les revenus sont versés via KPay. Vous devez avoir un compte KPay vérifié (KYC) pour recevoir les paiements de soutiens.",
        }),
        Object.freeze({
            id: "followers-threshold",
            question:
                "Faut-il un nombre minimum d’abonnés pour recevoir des soutiens ?",
            answer: "Non. Un abonnement Medium ou Pro actif suffit pour recevoir des soutiens. Les revenus déjà crédités restent consultables dans votre dashboard.",
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

    function getPlanBenefitRule(planId) {
        const normalizedPlanId = normalizePlanId(planId);
        return (
            PLAN_BENEFIT_RULES[normalizedPlanId] || PLAN_BENEFIT_RULES.standard
        );
    }

    function getVisibilityMultiplier(planId) {
        return Number(getPlanBenefitRule(planId).visibilityMultiplier || 1);
    }

    function includesPlanBenefit(planId, benefitKey) {
        const rule = getPlanBenefitRule(planId);
        if (!rule) return false;

        if (benefitKey === "standard") {
            return rule.id === "standard" || rule.includes.includes("standard");
        }

        // Héritage explicite : le plan medium inclut le standard
        if (rule.includes && rule.includes.includes("standard")) {
            return true;
        }

        return Object.prototype.hasOwnProperty.call(rule, benefitKey);
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
        PLAN_BENEFIT_RULES,
        PLAN_DEFINITIONS,
        PLAN_IDS,
        getAnnualBasePrice,
        getMoneyFormatter,
        getMonthlyPrice,
        getPlanBenefitRule,
        getPlanDefinition,
        getPlanDisplayName,
        getPlanPrice,
        getPlanPriceViewModel,
        getPlanSummary,
        getVisibilityMultiplier,
        includesPlanBenefit,
        isCurrentPlan,
        normalizeBillingCycle,
        normalizeCurrentPlan,
        normalizePlanId,
        resolveNavAvatarUrl,
    });
})();
