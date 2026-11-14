(function () {
    const Data = window.XeraSubscriptionPlansData;
    const Services = window.XeraAppServices || {};

    if (!Data) {
        console.error(
            "[subscription-plans-hooks] XeraSubscriptionPlansData est requis.",
        );
        return;
    }

    const ACTIONS = Object.freeze({
        SET_LOADING: "SET_LOADING",
        SET_BILLING_CYCLE: "SET_BILLING_CYCLE",
        SET_SESSION_USER: "SET_SESSION_USER",
        SET_CURRENT_USER: "SET_CURRENT_USER",
        MERGE_CURRENT_USER: "MERGE_CURRENT_USER",
        SET_NAV_AVATAR_URL: "SET_NAV_AVATAR_URL",
        ADD_NOTIFICATION: "ADD_NOTIFICATION",
        REMOVE_NOTIFICATION: "REMOVE_NOTIFICATION",
        TOGGLE_FAQ: "TOGGLE_FAQ",
        SET_SELECTED_PLAN: "SET_SELECTED_PLAN",
        SET_CONFIRM_MODAL_OPEN: "SET_CONFIRM_MODAL_OPEN",
    });

    let notificationSequence = 0;
    let checkoutInProgress = false;

    function createInitialState() {
        return {
            isLoading: true,
            billingCycle: Data.DEFAULT_BILLING_CYCLE,
            sessionUser: null,
            currentUser: null,
            navAvatarUrl: Data.DEFAULT_NAV_AVATAR,
            notifications: [],
            activeFaqId: null,
            selectedPlanId: readInitialSelectedPlan(),
            isConfirmModalOpen: false,
        };
    }

    function reducer(state, action) {
        switch (action.type) {
            case ACTIONS.SET_LOADING:
                return {
                    ...state,
                    isLoading: Boolean(action.payload),
                };
            case ACTIONS.SET_BILLING_CYCLE:
                return {
                    ...state,
                    billingCycle: Data.normalizeBillingCycle(action.payload),
                };
            case ACTIONS.SET_SESSION_USER:
                return {
                    ...state,
                    sessionUser: action.payload || null,
                };
            case ACTIONS.SET_CURRENT_USER:
                return {
                    ...state,
                    currentUser: action.payload || null,
                };
            case ACTIONS.MERGE_CURRENT_USER:
                return {
                    ...state,
                    currentUser: {
                        ...(state.currentUser || {}),
                        ...(action.payload || {}),
                    },
                };
            case ACTIONS.SET_NAV_AVATAR_URL:
                return {
                    ...state,
                    navAvatarUrl:
                        action.payload ||
                        state.navAvatarUrl ||
                        Data.DEFAULT_NAV_AVATAR,
                };
            case ACTIONS.ADD_NOTIFICATION:
                return {
                    ...state,
                    notifications: [...state.notifications, action.payload],
                };
            case ACTIONS.REMOVE_NOTIFICATION:
                return {
                    ...state,
                    notifications: state.notifications.filter(
                        (notification) => notification.id !== action.payload,
                    ),
                };
            case ACTIONS.TOGGLE_FAQ:
                return {
                    ...state,
                    activeFaqId:
                        state.activeFaqId === action.payload
                            ? null
                            : action.payload,
                };
            case ACTIONS.SET_SELECTED_PLAN:
                return {
                    ...state,
                    selectedPlanId: action.payload || null,
                };
            case ACTIONS.SET_CONFIRM_MODAL_OPEN:
                return {
                    ...state,
                    isConfirmModalOpen: Boolean(action.payload),
                };
            default:
                return state;
        }
    }

    function enqueueNotification(dispatch, message, type) {
        const notification = {
            id: `subscription-plans-notification-${Date.now()}-${(notificationSequence += 1)}`,
            message: String(message || "").trim(),
            type: type || "info",
        };
        dispatch({
            type: ACTIONS.ADD_NOTIFICATION,
            payload: notification,
        });
        return notification.id;
    }

    function removeNotification(dispatch, notificationId) {
        dispatch({
            type: ACTIONS.REMOVE_NOTIFICATION,
            payload: notificationId,
        });
    }

    function buildFallbackUser(user) {
        return {
            id: user?.id || null,
            plan: "free",
            plan_status: "inactive",
        };
    }

    function getFallbackAvatarFromSession(user) {
        return (
            user?.user_metadata?.avatar_url ||
            user?.user_metadata?.avatar ||
            Data.DEFAULT_NAV_AVATAR
        );
    }

    function redirectToLogin() {
        if (Services.auth?.redirectToLogin) {
            Services.auth.redirectToLogin({
                redirect: "subscription-plans",
                redirectHtmlFallback: "subscription-plans.html",
            });
            return;
        }
        window.location.href = "login.html?redirect=subscription-plans.html";
    }

    function redirectToCreatorDashboard() {
        if (Services.routing?.navigate) {
            Services.routing.navigate("creatorDashboard");
            return;
        }
        window.location.href = "creator-dashboard.html";
    }

    async function navigateToSubscriptionPayment(planId, billingCycle) {
        const normalizedPlanId = Data.normalizePlanId(planId);
        const normalizedBillingCycle = Data.normalizeBillingCycle(billingCycle);

        try {
            const user = await Services.auth.getSessionUser();
            const accessToken = await Services.auth.getAccessToken();

            if (!user || !accessToken) {
                const loginUrl = new URL("login.html", window.location.origin);
                loginUrl.searchParams.set(
                    "redirect",
                    "subscription-plans.html",
                );
                window.location.href = loginUrl.toString();
                return;
            }

            if (!window.XeraMobileMoney?.openCheckout) {
                await new Promise((resolve) => {
                    const s = document.createElement("script");
                    s.src = "js/mobile-money-modal.js";
                    s.onload = () => resolve();
                    s.onerror = () => resolve();
                    document.head.appendChild(s);
                });
            }

            const discountCode = document
                .getElementById("subscription-discount-code")
                ?.value?.trim();

            if (window.XeraMobileMoney?.openCheckout) {
                const planName = typeof Data.getPlanDisplayName === "function"
                    ? Data.getPlanDisplayName(normalizedPlanId)
                    : normalizedPlanId.toUpperCase();
                window.XeraMobileMoney.openCheckout({
                    type: "subscription",
                    title: `Abonnement ${planName}`,
                    amountLabel: normalizedBillingCycle === "annual" ? "Facturation annuelle (2 mois offerts)" : "Facturation mensuelle",
                    payload: {
                        plan: normalizedPlanId,
                        billing_cycle: normalizedBillingCycle,
                        user_id: user.id,
                        discount_code: discountCode || undefined,
                    },
                    accessToken,
                    onSuccess: () => {
                        if (typeof window.showToast === "function") {
                            window.showToast("Abonnement activé avec succès !", "success");
                        }
                    },
                });
                return;
            }

            // Fallback
            if (Services.subscriptions?.navigateToCheckout) {
                await Services.subscriptions.navigateToCheckout(
                    normalizedPlanId,
                    normalizedBillingCycle,
                );
                return;
            }

            if (typeof window.showToast === "function") {
                window.showToast(
                    "Erreur lors de l'initialisation du paiement sécurisé.",
                    "error",
                );
            }
        } catch (error) {
            console.error("[Subscription] Direct checkout error:", error);
            if (typeof window.showToast === "function") {
                window.showToast("Erreur lors de l'initialisation du paiement sécurisé.", "error");
            }
        }
    }

    function readPaymentReturnParams() {
        const urlParams = new URLSearchParams(window.location.search);
        return {
            status: String(urlParams.get("status") || "")
                .trim()
                .toLowerCase(),
            plan: String(urlParams.get("plan") || "")
                .trim()
                .toLowerCase(),
        };
    }

    function readInitialSelectedPlan() {
        const params = new URLSearchParams(window.location.search);
        const requestedPlan = String(params.get("plan") || "")
            .trim()
            .toLowerCase();
        return Data.normalizePlanId(requestedPlan);
    }

    function canBootstrapPage() {
        return (
            typeof Services.auth?.getSessionUser === "function" &&
            typeof Services.profiles?.getUserProfile === "function"
        );
    }

    function useNotificationTimers(notifications, dispatch) {
        const React = window.React;
        const timersRef = React.useRef({});

        React.useEffect(() => {
            notifications.forEach((notification) => {
                if (timersRef.current[notification.id]) {
                    return;
                }
                timersRef.current[notification.id] = window.setTimeout(() => {
                    removeNotification(dispatch, notification.id);
                    delete timersRef.current[notification.id];
                }, 5000);
            });

            Object.keys(timersRef.current).forEach((notificationId) => {
                const isStillVisible = notifications.some(
                    (notification) => notification.id === notificationId,
                );
                if (!isStillVisible) {
                    window.clearTimeout(timersRef.current[notificationId]);
                    delete timersRef.current[notificationId];
                }
            });
        }, [notifications, dispatch]);

        React.useEffect(() => {
            return () => {
                Object.values(timersRef.current).forEach((timerId) => {
                    window.clearTimeout(timerId);
                });
                timersRef.current = {};
            };
        }, []);
    }

    function useSubscriptionPlansBootstrap(dispatch) {
        const React = window.React;
        const redirectTimerRef = React.useRef(null);

        React.useEffect(() => {
            let isMounted = true;

            async function bootstrap() {
                try {
                    if (!canBootstrapPage()) {
                        throw new Error(
                            "Les dépendances d'initialisation des abonnements sont indisponibles.",
                        );
                    }

                    const user = await Services.auth.getSessionUser();
                    if (!isMounted) return;

                    if (!user) {
                        dispatch({
                            type: ACTIONS.SET_LOADING,
                            payload: false,
                        });
                        redirectToLogin();
                        return;
                    }

                    dispatch({
                        type: ACTIONS.SET_SESSION_USER,
                        payload: user,
                    });

                    let resolvedUser = null;
                    try {
                        const profileResult =
                            await Services.profiles.getUserProfile(user.id);
                        if (profileResult?.success && profileResult.data) {
                            resolvedUser = profileResult.data;
                            dispatch({
                                type: ACTIONS.SET_CURRENT_USER,
                                payload: profileResult.data,
                            });
                            dispatch({
                                type: ACTIONS.SET_NAV_AVATAR_URL,
                                payload: Data.resolveNavAvatarUrl(
                                    profileResult.data.avatar,
                                ),
                            });
                        }
                    } catch (profileError) {
                        console.error(
                            "Erreur chargement profil abonnements:",
                            profileError,
                        );
                    }

                    if (!isMounted) return;

                    if (!resolvedUser) {
                        resolvedUser = buildFallbackUser(user);
                        dispatch({
                            type: ACTIONS.SET_CURRENT_USER,
                            payload: resolvedUser,
                        });
                        dispatch({
                            type: ACTIONS.SET_NAV_AVATAR_URL,
                            payload: Data.resolveNavAvatarUrl(
                                getFallbackAvatarFromSession(user),
                            ),
                        });
                    }

                    const paymentReturn = readPaymentReturnParams();
                    if (
                        paymentReturn.status === "success" &&
                        paymentReturn.plan
                    ) {
                        enqueueNotification(
                            dispatch,
                            `Félicitations ! Votre abonnement ${paymentReturn.plan} est maintenant actif.`,
                            "success",
                        );

                        if (
                            resolvedUser?.id &&
                            typeof Services.subscriptions?.updateUserPlan ===
                                "function"
                        ) {
                            try {
                                await Services.subscriptions.updateUserPlan(
                                    resolvedUser.id,
                                    paymentReturn.plan,
                                    "active",
                                );
                            } catch (updateError) {
                                console.error(
                                    "Erreur mise à jour plan après paiement:",
                                    updateError,
                                );
                            }
                        }

                        if (!isMounted) return;

                        dispatch({
                            type: ACTIONS.MERGE_CURRENT_USER,
                            payload: {
                                plan: paymentReturn.plan,
                                plan_status: "active",
                            },
                        });

                        redirectTimerRef.current = window.setTimeout(() => {
                            redirectToCreatorDashboard();
                        }, 2000);
                    } else if (paymentReturn.status === "canceled") {
                        enqueueNotification(
                            dispatch,
                            "Le paiement a été annulé. Vous pouvez réessayer quand vous voulez.",
                            "info",
                        );
                    } else if (paymentReturn.status === "error") {
                        enqueueNotification(
                            dispatch,
                            "Une erreur est survenue lors du paiement. Veuillez réessayer.",
                            "error",
                        );
                    }
                } catch (error) {
                    console.error("Erreur initialisation page plans:", error);
                    enqueueNotification(
                        dispatch,
                        "Une erreur est survenue lors du chargement des abonnements.",
                        "error",
                    );
                } finally {
                    if (isMounted) {
                        dispatch({
                            type: ACTIONS.SET_LOADING,
                            payload: false,
                        });
                    }
                }
            }

            bootstrap();

            return () => {
                isMounted = false;
                if (redirectTimerRef.current) {
                    window.clearTimeout(redirectTimerRef.current);
                }
            };
        }, [dispatch]);
    }

    function useSubscriptionPlansController() {
        const React = window.React;
        const [state, dispatch] = React.useReducer(
            reducer,
            undefined,
            createInitialState,
        );

        useNotificationTimers(state.notifications, dispatch);
        useSubscriptionPlansBootstrap(dispatch);

        async function selectSubscription(planId) {
            const normalizedPlanId = Data.normalizePlanId(planId);

            if (!state.currentUser) {
                enqueueNotification(
                    dispatch,
                    "Veuillez vous connecter pour souscrire à un plan",
                    "error",
                );
                return false;
            }

            if (Data.isCurrentPlan(state.currentUser.plan, normalizedPlanId)) {
                enqueueNotification(
                    dispatch,
                    "Vous avez déjà ce plan actif",
                    "info",
                );
                return false;
            }

            dispatch({
                type: ACTIONS.SET_SELECTED_PLAN,
                payload: normalizedPlanId,
            });
            dispatch({
                type: ACTIONS.SET_CONFIRM_MODAL_OPEN,
                payload: true,
            });
            return true;
        }

        async function processSubscription() {
            if (!state.selectedPlanId || !state.currentUser) {
                return false;
            }

            await navigateToSubscriptionPayment(
                state.selectedPlanId,
                state.billingCycle,
            );
            return true;
        }

        function closeConfirmModal() {
            dispatch({
                type: ACTIONS.SET_CONFIRM_MODAL_OPEN,
                payload: false,
            });
            dispatch({
                type: ACTIONS.SET_SELECTED_PLAN,
                payload: null,
            });
        }

        function toggleFaq(faqId) {
            dispatch({
                type: ACTIONS.TOGGLE_FAQ,
                payload: faqId,
            });
        }

        function setBillingCycle(nextBillingCycle) {
            dispatch({
                type: ACTIONS.SET_BILLING_CYCLE,
                payload: nextBillingCycle,
            });
        }

        function showNotification(message, type) {
            return enqueueNotification(dispatch, message, type);
        }

        return {
            state,
            actions: {
                closeConfirmModal,
                processSubscription,
                selectSubscription,
                setBillingCycle,
                showNotification,
                toggleFaq,
            },
        };
    }

    window.XeraSubscriptionPlansHooks = Object.freeze({
        ACTIONS,
        buildFallbackUser,
        createInitialState,
        enqueueNotification,
        getFallbackAvatarFromSession,
        navigateToSubscriptionPayment,
        readPaymentReturnParams,
        redirectToCreatorDashboard,
        redirectToLogin,
        reducer,
        removeNotification,
        useSubscriptionPlansController,
    });
})();
