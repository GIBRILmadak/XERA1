(function () {
    const Data = window.XeraSubscriptionPlansData;
    const Hooks = window.XeraSubscriptionPlansHooks;
    const ReactCore = window.XeraReactCore;

    if (!Data || !Hooks) {
        console.error(
            "[subscription-plans] Les modules de données et de logique sont requis.",
        );
        return;
    }

    let activeController = null;

    function setActiveController(controller) {
        activeController = controller;
        window.XeraSubscriptionPlansController = controller;
    }

    function getPlanIdFromCard(cardElement) {
        if (!cardElement?.getAttribute) return null;
        const explicitPlanId = cardElement.getAttribute("data-plan-id");
        if (explicitPlanId) return explicitPlanId;
        if (cardElement.classList.contains("standard")) return "standard";
        if (cardElement.classList.contains("medium")) return "medium";
        if (cardElement.classList.contains("pro")) return "pro";
        return null;
    }

    function getUrlContext() {
        try {
            const params = new URLSearchParams(window.location.search);
            return String(params.get("context") || "")
                .trim()
                .toLowerCase();
        } catch (e) {
            return "";
        }
    }

    function readInitialSelectedPlan() {
        try {
            const params = new URLSearchParams(window.location.search);
            return String(params.get("plan") || "")
                .trim()
                .toLowerCase();
        } catch (e) {
            return "";
        }
    }

    function isPageAccount(user) {
        if (!user) return false;
        const values = [
            user?.account_type,
            user?.user_metadata?.account_type,
            user?.account_subtype,
            user?.accountSubtype,
            user?.user_metadata?.account_subtype,
        ]
            .filter(Boolean)
            .map((v) => String(v).trim().toLowerCase());

        return values.some((value) =>
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
            ].includes(value),
        );
    }

    function getFaqId(faqInput) {
        if (typeof faqInput === "string") {
            return faqInput;
        }
        if (faqInput?.getAttribute) {
            return faqInput.getAttribute("data-faq-id") || null;
        }
        return null;
    }

    function selectSubscription(planId) {
        return activeController?.selectSubscription
            ? activeController.selectSubscription(planId)
            : false;
    }

    function processSubscription() {
        return activeController?.processSubscription
            ? activeController.processSubscription()
            : false;
    }

    function closeConfirmModal() {
        return activeController?.closeConfirmModal
            ? activeController.closeConfirmModal()
            : false;
    }

    function toggleFaq(faqInput) {
        const faqId = getFaqId(faqInput);
        return activeController?.toggleFaq
            ? activeController.toggleFaq(faqId, faqInput)
            : false;
    }

    window.selectSubscription = selectSubscription;
    window.processSubscription = processSubscription;
    window.closeConfirmModal = closeConfirmModal;
    window.toggleFaq = toggleFaq;

    function canUseReact() {
        if (ReactCore?.canUseReact) {
            return (
                ReactCore.canUseReact() &&
                typeof Hooks.useSubscriptionPlansController === "function"
            );
        }
        return Boolean(
            window.React &&
            window.ReactDOM &&
            window.ReactDOM.createRoot &&
            typeof Hooks.useSubscriptionPlansController === "function",
        );
    }

    function createFallbackNotification(message, type) {
        const notification = document.createElement("div");
        notification.className = `notification notification-${type || "info"}`;

        const icons = {
            success: "fa-check-circle",
            error: "fa-exclamation-circle",
            info: "fa-info-circle",
        };

        notification.innerHTML = `
            <i class="fas ${icons[type] || icons.info}"></i>
            <span>${String(message || "")}</span>
        `;

        document.body.appendChild(notification);

        window.setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    function buildFallbackController() {
        const root = document.getElementById("subscriptionPlansRoot");
        let currentUser = null;
        let selectedPlanId = null;
        let billingCycle = Data.DEFAULT_BILLING_CYCLE;

        function updateNavAvatar(avatarUrl) {
            const navAvatar = document.getElementById("navAvatar");
            const resolvedAvatar = Data.resolveNavAvatarUrl(avatarUrl);
            if (navAvatar && resolvedAvatar) {
                navAvatar.src = resolvedAvatar;
            }
        }

        function resetPlanCard(cardElement, planId) {
            const button = cardElement.querySelector(".btn-subscribe");
            const existingBadge = cardElement.querySelector(
                ".current-plan-badge",
            );

            if (existingBadge) {
                existingBadge.remove();
            }

            if (button) {
                button.disabled = false;
                button.classList.remove("btn-current");
                button.textContent = Data.getPlanDefinition(planId).buttonLabel;
            }
        }

        function highlightCurrentPlan(planId) {
            document
                .querySelectorAll(".plan-detail-card")
                .forEach((cardElement) => {
                    const cardPlanId = getPlanIdFromCard(cardElement);
                    if (!cardPlanId) return;

                    resetPlanCard(cardElement, cardPlanId);

                    if (!Data.isCurrentPlan(planId, cardPlanId)) {
                        return;
                    }

                    const button = cardElement.querySelector(".btn-subscribe");
                    const title = cardElement.querySelector("h3");
                    if (!button || !title) return;

                    const badge = document.createElement("div");
                    badge.className = "current-plan-badge";
                    badge.style.marginBottom = "15px";
                    badge.innerHTML =
                        '<i class="fas fa-check-circle"></i> Votre plan actuel';

                    cardElement.insertBefore(badge, title);
                    button.innerHTML =
                        '<i class="fas fa-check"></i> Plan actuel';
                    button.disabled = true;
                    button.classList.add("btn-current");
                });
        }

        function applyBillingCycle(nextBillingCycle) {
            billingCycle = Data.normalizeBillingCycle(nextBillingCycle);

            root?.querySelectorAll(".billing-btn").forEach((button) => {
                const isActive =
                    button.getAttribute("data-cycle") === billingCycle;
                button.classList.toggle("active", isActive);
                button.setAttribute(
                    "aria-pressed",
                    isActive ? "true" : "false",
                );
            });

            root?.querySelectorAll(".plan-detail-card .price").forEach(
                (priceEl) => {
                    const planId =
                        priceEl
                            .closest(".plan-detail-card")
                            ?.getAttribute("data-plan-id") ||
                        getPlanIdFromCard(priceEl.closest(".plan-detail-card"));

                    if (!planId) return;

                    const price = Data.getPlanPriceViewModel(
                        planId,
                        billingCycle,
                    );
                    priceEl.textContent = "";

                    priceEl.appendChild(
                        document.createTextNode(price.formattedAmount),
                    );

                    const suffix = document.createElement("span");
                    suffix.textContent = price.suffix;
                    priceEl.appendChild(suffix);

                    if (price.savingsLabel) {
                        const savings = document.createElement("small");
                        savings.className = "annual-savings";
                        savings.textContent = price.savingsLabel;
                        priceEl.appendChild(savings);
                    }
                },
            );

            // Keep the active cycle on every card. The click handler below reads
            // this live value, so a toggle change is never lost before checkout.
            root?.querySelectorAll(".plan-detail-card").forEach((cardEl) => {
                const planId =
                    cardEl.getAttribute("data-plan-id") ||
                    getPlanIdFromCard(cardEl);
                if (!planId) return;

                cardEl.dataset.billingCycle = billingCycle;
            });
        }

        function setBillingCycle(nextBillingCycle) {
            applyBillingCycle(nextBillingCycle);
            return billingCycle;
        }

        function openFaqById(faqId) {
            const faqButtons = Array.from(
                root?.querySelectorAll(".faq-question") || [],
            );

            faqButtons.forEach((button) => {
                const answer = button.nextElementSibling;
                const isTarget = button.getAttribute("data-faq-id") === faqId;
                button.classList.toggle("active", isTarget);
                answer?.classList.toggle("show", isTarget);
            });
        }

        function hideAllFaqs() {
            root?.querySelectorAll(".faq-question").forEach((button) => {
                button.classList.remove("active");
            });
            root?.querySelectorAll(".faq-answer").forEach((answer) => {
                answer.classList.remove("show");
            });
        }

        async function handlePaymentReturn() {
            const paymentReturn = Hooks.readPaymentReturnParams();
            if (paymentReturn.status === "success" && paymentReturn.plan) {
                createFallbackNotification(
                    `Félicitations ! Votre abonnement ${paymentReturn.plan} est maintenant actif.`,
                    "success",
                );

                if (
                    currentUser?.id &&
                    typeof window.updateUserPlan === "function"
                ) {
                    try {
                        await window.updateUserPlan(
                            currentUser.id,
                            paymentReturn.plan,
                            "active",
                        );
                    } catch (error) {
                        console.error(
                            "Erreur mise à jour plan après paiement:",
                            error,
                        );
                    }
                }

                currentUser = {
                    ...(currentUser || {}),
                    plan: paymentReturn.plan,
                    plan_status: "active",
                };
                highlightCurrentPlan(paymentReturn.plan);

                window.setTimeout(() => {
                    Hooks.redirectToCreatorDashboard();
                }, 2000);
                return;
            }

            if (paymentReturn.status === "canceled") {
                createFallbackNotification(
                    "Le paiement a été annulé. Vous pouvez réessayer quand vous voulez.",
                    "info",
                );
            } else if (paymentReturn.status === "error") {
                createFallbackNotification(
                    "Une erreur est survenue lors du paiement. Veuillez réessayer.",
                    "error",
                );
            }
        }

        async function bootstrap() {
            applyBillingCycle(billingCycle);

            try {
                const user = await window.checkAuth();
                if (!user) {
                    Hooks.redirectToLogin();
                    return;
                }

                const profileResult = await window.getUserProfile(user.id);
                if (profileResult?.success && profileResult.data) {
                    currentUser = profileResult.data;
                    updateNavAvatar(profileResult.data.avatar);
                    highlightCurrentPlan(profileResult.data.plan);
                } else {
                    currentUser = Hooks.buildFallbackUser(user);
                    updateNavAvatar(Hooks.getFallbackAvatarFromSession(user));
                }

                await handlePaymentReturn();

                // Adjust plan visibility for fallback DOM based on context and user type
                try {
                    const urlContext = getUrlContext();
                    const initialSelected = readInitialSelectedPlan();
                    let visiblePlanIds = Array.from(Data.PLAN_IDS || []);

                    if (!isPageAccount(currentUser)) {
                        visiblePlanIds = visiblePlanIds.filter(
                            (id) => id !== "page_verification",
                        );
                    }

                    if (
                        (urlContext === "page-verification" ||
                            initialSelected === "page_verification") &&
                        isPageAccount(currentUser)
                    ) {
                        visiblePlanIds = ["page_verification"];
                    }

                    // Hide DOM cards that are not in visiblePlanIds
                    const cards = root.querySelectorAll(".plan-detail-card");
                    cards.forEach((card) => {
                        const pid =
                            card.getAttribute("data-plan-id") ||
                            getPlanIdFromCard(card);
                        if (!pid) return;
                        if (!visiblePlanIds.includes(pid)) {
                            card.style.display = "none";
                        } else {
                            card.style.display = "";
                        }
                    });
                } catch (e) {
                    console.warn("Erreur ajustement visibilité plans:", e);
                }
            } catch (error) {
                console.error("Erreur initialisation page plans:", error);
                createFallbackNotification(
                    "Une erreur est survenue lors du chargement des abonnements.",
                    "error",
                );
            }
        }

        const controller = {
            closeConfirmModal() {
                const modal = document.getElementById("confirmModal");
                if (modal) {
                    modal.classList.remove("active");
                }
                selectedPlanId = null;
                return true;
            },
            async processSubscription() {
                if (!selectedPlanId || !currentUser) {
                    return false;
                }

                await Hooks.navigateToSubscriptionPayment(
                    selectedPlanId,
                    billingCycle,
                );
                return true;
            },
            async selectSubscription(planId) {
                const normalizedPlanId = Data.normalizePlanId(planId);

                if (!currentUser) {
                    createFallbackNotification(
                        "Veuillez vous connecter pour souscrire à un plan",
                        "error",
                    );
                    return false;
                }

                if (Data.isCurrentPlan(currentUser.plan, normalizedPlanId)) {
                    createFallbackNotification(
                        "Vous avez déjà ce plan actif",
                        "info",
                    );
                    return false;
                }

                selectedPlanId = normalizedPlanId;

                // Populate summary for non-React fallback
                const detailsContainer =
                    document.getElementById("confirmPlanDetails");
                if (detailsContainer) {
                    const summary = Data.getPlanSummary(
                        normalizedPlanId,
                        billingCycle,
                    );
                    const planDef = Data.getPlanDefinition(normalizedPlanId);

                    detailsContainer.innerHTML = `
                        <div class="plan-confirm-card">
                            <div class="plan-confirm-header">
                                <div class="plan-confirm-icon">
                                    <i class="${planDef.iconClass}"></i>
                                </div>
                                <div>
                                    <h3>${summary.title}</h3>
                                    <p class="plan-confirm-desc">${summary.description}</p>
                                </div>
                            </div>
                            <div class="plan-confirm-price">
                                <span class="amount">${summary.price.formattedAmount}</span>
                                <span class="cycle">${summary.price.suffix}</span>
                            </div>
                            <ul class="plan-confirm-features">
                                ${summary.features
                                    .map(
                                        (f) =>
                                            `<li><i class="fas fa-check"></i> <span>${f.text}</span></li>`,
                                    )
                                    .join("")}
                            </ul>
                        </div>
                    `;
                }

                const modal = document.getElementById("confirmModal");
                if (modal) modal.classList.add("active");
                return true;
            },
            setBillingCycle,
            showNotification(message, type) {
                createFallbackNotification(message, type);
                return true;
            },
            toggleFaq(faqId, faqElement) {
                const resolvedFaqId = faqId || getFaqId(faqElement);
                const targetButton =
                    faqElement?.getAttribute?.("data-faq-id") != null
                        ? faqElement
                        : root?.querySelector(
                              `.faq-question[data-faq-id="${resolvedFaqId}"]`,
                          );

                if (!targetButton || !resolvedFaqId) {
                    return false;
                }

                const isAlreadyOpen = targetButton.classList.contains("active");

                hideAllFaqs();
                if (!isAlreadyOpen) {
                    openFaqById(resolvedFaqId);
                }
                return true;
            },
        };

        if (root) {
            const billingToggle = root.querySelector(".billing-toggle");
            billingToggle?.addEventListener("click", (event) => {
                const button = event.target.closest(".billing-btn");
                if (!button) return;
                const nextCycle = button.getAttribute("data-cycle");
                controller.setBillingCycle(nextCycle);
            });

            root.addEventListener("click", (event) => {
                if (event.target?.classList?.contains("modal")) {
                    controller.closeConfirmModal();
                    return;
                }

                const card = event.target?.closest?.(".plan-detail-card");
                if (!card || !root.contains(card)) return;
                if (event.target?.closest?.("a, input, select, textarea")) {
                    return;
                }

                const planId = getPlanIdFromCard(card);
                if (planId) controller.selectSubscription(planId);
            });
        }

        return {
            bootstrap,
            controller,
        };
    }

    function mountFallback() {
        const fallbackApp = buildFallbackController();
        setActiveController(fallbackApp.controller);
        fallbackApp.bootstrap();
    }

    function mountReact() {
        const root = document.getElementById("subscriptionPlansRoot");
        if (!root) {
            mountFallback();
            return;
        }

        const fallbackMarkup = root.innerHTML;
        const React = window.React;
        const e = React.createElement;

        function NotificationStack(props) {
            const icons = {
                success: "fa-check-circle",
                error: "fa-exclamation-circle",
                info: "fa-info-circle",
            };

            return e(
                React.Fragment,
                null,
                props.notifications.map((notification) =>
                    e(
                        "div",
                        {
                            key: notification.id,
                            className: `notification notification-${notification.type || "info"}`,
                        },
                        e("i", {
                            className: `fas ${icons[notification.type] || icons.info}`,
                        }),
                        e("span", null, notification.message),
                    ),
                ),
            );
        }

        function NavBar(props) {
            return e(
                "nav",
                null,
                e(
                    "a",
                    {
                        className: "logo",
                        href: "index.html",
                    },
                    e(
                        "div",
                        {
                            className: "logo-img",
                        },
                        e("img", {
                            src: "icons/logo.png",
                            alt: "XERA1 - Logo",
                        }),
                    ),
                    e("span", null, "XΞRA1"),
                ),
                e(
                    "div",
                    {
                        className: "nav-links",
                    },
                    e(
                        "a",
                        { href: "index.html" },
                        e("i", { className: "fas fa-home" }),
                        " Accueil",
                    ),
                    e(
                        "a",
                        { href: "creator-dashboard.html" },
                        e("i", { className: "fas fa-chart-line" }),
                        " Monétisation",
                    ),
                ),
                e(
                    "div",
                    {
                        className: "nav-actions",
                    },
                    e(
                        "a",
                        {
                            className: "notification-button profile-nav-button",
                            href: "profile.html",
                            title: "Profil",
                            "aria-label": "Profil",
                        },
                        e("img", {
                            id: "navAvatar",
                            className: "notification-icon profile-nav-avatar",
                            src: props.avatarUrl || Data.DEFAULT_NAV_AVATAR,
                            alt: "Avatar utilisateur",
                        }),
                    ),
                ),
            );
        }

        function BillingToggle(props) {
            return e(
                "div",
                {
                    className: "billing-toggle",
                    role: "group",
                    "aria-label": "Choisir la facturation",
                },
                Data.BILLING_OPTIONS.map((option) =>
                    e(
                        "button",
                        {
                            key: option.id,
                            className:
                                "billing-btn" +
                                (props.billingCycle === option.id
                                    ? " active"
                                    : ""),
                            "data-cycle": option.id,
                            "aria-pressed":
                                props.billingCycle === option.id
                                    ? "true"
                                    : "false",
                            type: "button",
                            onClick: () =>
                                props.onBillingCycleChange(option.id),
                        },
                        option.label,
                    ),
                ),
            );
        }

        function HeroSection(props) {
            return e(
                "section",
                {
                    className: "plans-hero",
                },
                e(
                    "div",
                    {
                        className: "plans-hero-inner",
                    },
                    e(
                        "div",
                        {
                            className: "plans-hero-content",
                        },
                        e(
                            "span",
                            {
                                className: "hero-eyebrow",
                            },
                            e("i", { className: "fas fa-star" }),
                            " Vérification & monétisation",
                        ),
                        e("h1", null, "Fais passer ton profil au niveau pro."),
                        e(
                            "p",
                            {
                                className: "hero-lead",
                            },
                            "Choisis un plan pour débloquer le badge, la visibilité et les outils qui accélèrent ta progression.",
                        ),
                        e(BillingToggle, {
                            billingCycle: props.billingCycle,
                            onBillingCycleChange: props.onBillingCycleChange,
                        }),
                        e(
                            "p",
                            {
                                className: "billing-note",
                            },
                            "Économisez 20% avec la facturation annuelle.",
                        ),
                        e(
                            "div",
                            {
                                className: "hero-trust",
                            },
                            Data.HERO_TRUST_ITEMS.map((item) =>
                                e(
                                    "div",
                                    { key: item.text },
                                    e("i", { className: item.iconClass }),
                                    " ",
                                    item.text,
                                ),
                            ),
                        ),
                    ),
                    e(
                        "div",
                        {
                            className: "plans-hero-card",
                        },
                        e(
                            "div",
                            {
                                className: "hero-card-header",
                            },
                            e("span", null, "Ce que tu peux débloquer"),
                            e(
                                "span",
                                {
                                    className: "hero-card-pill",
                                },
                                "-20% annuel",
                            ),
                        ),
                        e(
                            "ul",
                            {
                                className: "hero-card-list",
                            },
                            Data.HERO_UNLOCKS.map((item) =>
                                e(
                                    "li",
                                    { key: item.text },
                                    e("i", { className: item.iconClass }),
                                    " ",
                                    item.text,
                                ),
                            ),
                        ),
                        e(
                            "div",
                            {
                                className: "hero-card-foot",
                            },
                            e("i", { className: "fas fa-lock" }),
                            " Paiement Mobile Money",
                        ),
                    ),
                ),
            );
        }

        function PlanCard(props) {
            const plan = props.plan;
            const price = Data.getPlanPriceViewModel(
                plan.id,
                props.billingCycle,
            );
            const isCurrent = Data.isCurrentPlan(props.currentPlan, plan.id);
            const buttonClassName = isCurrent
                ? "btn-subscribe btn-current"
                : "btn-subscribe";

            return e(
                "div",
                {
                    className: `plan-detail-card ${plan.cardClassName}`,
                    "data-plan-id": plan.id,
                    "data-billing-cycle": props.billingCycle,
                    role: isCurrent ? undefined : "button",
                    tabIndex: isCurrent ? undefined : 0,
                    onClick: isCurrent
                        ? undefined
                        : () => props.onSelectPlan(plan.id),
                    onKeyDown: isCurrent
                        ? undefined
                        : (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  props.onSelectPlan(plan.id);
                              }
                          },
                },
                plan.badgeLabel
                    ? e(
                          "div",
                          {
                              className: "recommended-badge",
                          },
                          plan.badgeLabel,
                      )
                    : null,
                e(
                    "div",
                    {
                        className: "plan-icon",
                    },
                    e("i", { className: plan.iconClass }),
                ),
                isCurrent
                    ? e(
                          "div",
                          {
                              className: "current-plan-badge",
                              style: { marginBottom: "15px" },
                          },
                          e("i", {
                              className: "fas fa-check-circle",
                          }),
                          " Votre plan actuel",
                      )
                    : null,
                e("h3", null, plan.title),
                e(
                    "div",
                    {
                        className: "price",
                        "data-monthly": plan.monthlyPrice.toFixed(2),
                    },
                    price.formattedAmount,
                    e("span", null, price.suffix),
                    price.savingsLabel
                        ? e(
                              "small",
                              {
                                  className: "annual-savings",
                              },
                              price.savingsLabel,
                          )
                        : null,
                ),
                e(
                    "p",
                    {
                        className: "description",
                    },
                    plan.description,
                ),
                e(
                    "ul",
                    {
                        className: "plan-features-list",
                    },
                    plan.features.map((feature) =>
                        e(
                            "li",
                            {
                                key: `${plan.id}-${feature.text}`,
                            },
                            e("i", { className: feature.iconClass }),
                            " ",
                            feature.text,
                        ),
                    ),
                ),
                e(
                    "button",
                    {
                        className: buttonClassName,
                        "data-plan": plan.id,
                        disabled: isCurrent,
                        onClick: (event) => {
                            event.stopPropagation();
                            props.onSelectPlan(plan.id);
                        },
                    },
                    isCurrent
                        ? [
                              e("i", {
                                  key: "icon",
                                  className: "fas fa-check",
                              }),
                              " Plan actuel",
                          ]
                        : plan.buttonLabel,
                ),
            );
        }

        function PlansGrid(props) {
            const visiblePlanIds = Array.isArray(props.planIds)
                ? props.planIds
                : Data.PLAN_IDS;

            return e(
                "div",
                {
                    className: "plans-container",
                },
                e(
                    "div",
                    {
                        className: "plans-grid",
                    },
                    visiblePlanIds.map((planId) =>
                        e(PlanCard, {
                            key: planId,
                            billingCycle: props.billingCycle,
                            currentPlan: props.currentPlan,
                            onSelectPlan: props.onSelectPlan,
                            plan: Data.getPlanDefinition(planId),
                        }),
                    ),
                ),
            );
        }

        function FaqSection(props) {
            return e(
                "section",
                {
                    className: "faq-section",
                },
                e("h2", null, "Questions fréquentes"),
                Data.FAQ_ITEMS.map((item) => {
                    const isOpen = props.activeFaqId === item.id;
                    return e(
                        "div",
                        {
                            key: item.id,
                            className: "faq-item",
                        },
                        e(
                            "button",
                            {
                                className:
                                    "faq-question" + (isOpen ? " active" : ""),
                                "data-faq-id": item.id,
                                type: "button",
                                onClick: () => props.onToggleFaq(item.id),
                            },
                            item.question,
                            e("i", {
                                className: "fas fa-chevron-down",
                            }),
                        ),
                        e(
                            "div",
                            {
                                className:
                                    "faq-answer" + (isOpen ? " show" : ""),
                            },
                            e("p", null, item.answer),
                        ),
                    );
                }),
            );
        }

        function ConfirmModal(props) {
            const summary = Data.getPlanSummary(
                props.selectedPlanId || "standard",
                props.billingCycle,
            );

            return e(
                "div",
                {
                    className:
                        "modal plan-modal" + (props.isOpen ? " active" : ""),
                    id: "confirmModal",
                    role: "dialog",
                    "aria-modal": "true",
                    "aria-labelledby": "confirmModalTitle",
                    onClick: (event) => {
                        if (event.target === event.currentTarget) {
                            props.onClose();
                        }
                    },
                },
                e(
                    "div",
                    {
                        className: "modal-content plan-modal-content",
                    },
                    e(
                        "div",
                        {
                            className: "modal-header",
                        },
                        e(
                            "h2",
                            { id: "confirmModalTitle" },
                            "Confirmer l'abonnement",
                        ),
                        e(
                            "button",
                            {
                                className: "close-btn",
                                type: "button",
                                "aria-label":
                                    "Fermer la fenêtre de confirmation",
                                onClick: props.onClose,
                            },
                            e("i", {
                                className: "fas fa-times",
                            }),
                        ),
                    ),
                    e(
                        "div",
                        {
                            className: "modal-body",
                        },
                        e(
                            "div",
                            {
                                className: "plan-confirm-card",
                            },
                            e(
                                "div",
                                { className: "plan-confirm-header" },
                                e(
                                    "div",
                                    { className: "plan-confirm-icon" },
                                    e("i", {
                                        className: Data.getPlanDefinition(
                                            summary.id,
                                        ).iconClass,
                                    }),
                                ),
                                e(
                                    "div",
                                    null,
                                    e("h3", null, summary.title),
                                    e(
                                        "p",
                                        { className: "plan-confirm-desc" },
                                        summary.description,
                                    ),
                                ),
                            ),
                            e(
                                "div",
                                { className: "plan-confirm-price" },
                                e(
                                    "span",
                                    { className: "amount" },
                                    summary.price.formattedAmount,
                                ),
                                e(
                                    "span",
                                    { className: "cycle" },
                                    summary.price.suffix,
                                ),
                            ),
                            e(
                                "ul",
                                {
                                    className: "plan-confirm-features",
                                },
                                summary.features.map((feature) =>
                                    e(
                                        "li",
                                        {
                                            key: `${summary.id}-${feature.text}`,
                                        },
                                        e("i", {
                                            className: "fas fa-check",
                                        }),
                                        e("span", null, feature.text),
                                    ),
                                ),
                            ),
                        ),
                        e(
                            "div",
                            { className: "discount-section" },
                            e(
                                "label",
                                { htmlFor: "subscription-discount-code" },
                                "Code de réduction (optionnel)",
                            ),
                            e(
                                "div",
                                { className: "discount-input-wrap" },
                                e("input", {
                                    id: "subscription-discount-code",
                                    className: "form-input",
                                    type: "text",
                                    maxLength: 40,
                                    placeholder: "Entrez votre code",
                                }),
                                e("i", { className: "fas fa-tag" }),
                            ),
                        ),
                        e(
                            "div",
                            { className: "redirect-info" },
                            e("i", {
                                className: "fas fa-info-circle",
                            }),
                            " Validation sécurisée par code PIN Mobile Money (Airtel, Orange, M-Pesa).",
                        ),
                        e(
                            "button",
                            {
                                className: "btn-primary btn-full btn-process",
                                type: "button",
                                onClick: props.onConfirm,
                            },
                            e("i", { className: "fas fa-lock" }),
                            " Procéder au paiement",
                        ),
                    ),
                ),
            );
        }

        function SubscriptionPlansPage() {
            const ReactInner = window.React;
            const subscriptionPlans = Hooks.useSubscriptionPlansController();
            const state = subscriptionPlans.state;
            const actions = subscriptionPlans.actions;

            const urlContext = getUrlContext();
            const initialSelected = readInitialSelectedPlan();
            const isPageUser = isPageAccount(state.currentUser);

            // Determine which plans should be visible for this user/context
            let visiblePlanIds = Array.from(Data.PLAN_IDS || []);

            // For personal accounts, keep all non-page-verification plans visible.
            if (!isPageUser) {
                visiblePlanIds = visiblePlanIds.filter(
                    (id) => id !== "page_verification",
                );
            }

            // For page-pro accounts, show only the verification card.
            if (isPageUser) {
                visiblePlanIds = ["page_verification"];
            }

            // Keep the page-verification context behavior aligned with the same rule.
            if (
                (urlContext === "page-verification" ||
                    initialSelected === "page_verification") &&
                !isPageUser
            ) {
                visiblePlanIds = [];
            }

            ReactInner.useEffect(() => {
                setActiveController({
                    closeConfirmModal: actions.closeConfirmModal,
                    processSubscription: actions.processSubscription,
                    selectSubscription: actions.selectSubscription,
                    setBillingCycle: actions.setBillingCycle,
                    showNotification: actions.showNotification,
                    toggleFaq: actions.toggleFaq,
                });
            }, [
                actions.closeConfirmModal,
                actions.processSubscription,
                actions.selectSubscription,
                actions.setBillingCycle,
                actions.showNotification,
                actions.toggleFaq,
            ]);

            return e(
                ReactInner.Fragment,
                null,
                e(NotificationStack, {
                    notifications: state.notifications,
                }),
                e(NavBar, {
                    avatarUrl: state.navAvatarUrl,
                }),
                e(HeroSection, {
                    billingCycle: state.billingCycle,
                    onBillingCycleChange: actions.setBillingCycle,
                }),
                e(PlansGrid, {
                    billingCycle: state.billingCycle,
                    currentPlan: state.currentUser?.plan,
                    onSelectPlan: actions.selectSubscription,
                    planIds: visiblePlanIds,
                }),
                e(FaqSection, {
                    activeFaqId: state.activeFaqId,
                    onToggleFaq: actions.toggleFaq,
                }),
                e(ConfirmModal, {
                    billingCycle: state.billingCycle,
                    isOpen: state.isConfirmModalOpen,
                    onClose: actions.closeConfirmModal,
                    onConfirm: actions.processSubscription,
                    selectedPlanId: state.selectedPlanId,
                }),
            );
        }

        try {
            const didMount = ReactCore?.mountIsland
                ? ReactCore.mountIsland(root, () => e(SubscriptionPlansPage), {
                      captureMarkup: true,
                      fallbackMarkup,
                      name: "subscriptionPlans",
                      strict: true,
                  })
                : false;

            if (didMount) {
                return;
            }

            const reactRoot = window.ReactDOM.createRoot(root);
            root.__xeraReactRoot = reactRoot;
            reactRoot.render(
                e(React.StrictMode, null, e(SubscriptionPlansPage)),
            );
        } catch (error) {
            console.error(
                "Erreur montage React des abonnements, bascule vers le fallback:",
                error,
            );
            root.innerHTML = fallbackMarkup;
            mountFallback();
        }
    }

    function init() {
        if (canUseReact()) {
            mountReact();
            return;
        }
        mountFallback();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, {
            once: true,
        });
    } else {
        init();
    }
})();
