(function () {
    let activeAdapter = null;
    let serviceOverrides = {};

    function createBrowserAdapter() {
        return {
            platform: "web",
            http: {
                async fetchJson(input, init) {
                    const response = await fetch(input, init);
                    const rawText = await response.text();
                    let data = null;

                    if (rawText) {
                        try {
                            data = JSON.parse(rawText);
                        } catch (error) {
                            data = rawText;
                        }
                    }

                    if (!response.ok) {
                        const message =
                            data?.error ||
                            data?.message ||
                            `HTTP ${response.status}`;
                        const httpError = new Error(message);
                        httpError.status = response.status;
                        httpError.data = data;
                        throw httpError;
                    }

                    return data;
                },
            },
            navigation: {
                getCurrentUrl() {
                    return window.location.href;
                },
                getSearch() {
                    return window.location.search || "";
                },
                getPathname() {
                    return window.location.pathname || "";
                },
                goToUrl(url, options = {}) {
                    if (!url) return false;
                    if (options.replace) {
                        window.location.replace(url);
                        return true;
                    }
                    window.location.href = url;
                    return true;
                },
            },
            storage: {
                getItem(key) {
                    try {
                        return window.localStorage.getItem(key);
                    } catch (error) {
                        return null;
                    }
                },
                setItem(key, value) {
                    try {
                        window.localStorage.setItem(key, value);
                        return true;
                    } catch (error) {
                        return false;
                    }
                },
                removeItem(key) {
                    try {
                        window.localStorage.removeItem(key);
                        return true;
                    } catch (error) {
                        return false;
                    }
                },
            },
        };
    }

    function getAdapter() {
        if (!activeAdapter) {
            activeAdapter = createBrowserAdapter();
        }
        return activeAdapter;
    }

    function setAdapter(nextAdapter) {
        if (!nextAdapter || typeof nextAdapter !== "object") {
            return getAdapter();
        }
        activeAdapter = {
            ...getAdapter(),
            ...nextAdapter,
        };
        return activeAdapter;
    }

    function setServiceOverrides(nextOverrides) {
        serviceOverrides = {
            ...serviceOverrides,
            ...(nextOverrides || {}),
        };
        return serviceOverrides;
    }

    function getServiceOverride(serviceName) {
        return serviceOverrides[serviceName] || null;
    }

    function getSupabaseClient() {
        return window.supabaseClient || window.supabase || null;
    }

    function getRouter() {
        return window.XeraRouter || null;
    }

    function buildAppApiUrl(pathname) {
        const safePathname = String(pathname || "").trim();
        if (!safePathname) return "/api";
        if (safePathname.startsWith("/api/")) return safePathname;
        if (safePathname.startsWith("/")) return `/api${safePathname}`;
        return `/api/${safePathname}`;
    }

    async function getSessionAccessToken() {
        const client = getSupabaseClient();
        if (client?.auth && typeof client.auth.getSession === "function") {
            const {
                data: { session } = {},
            } = await client.auth.getSession();
            return session?.access_token || "";
        }
        return "";
    }

    async function fetchAppJson(pathname, init) {
        return getAdapter().http.fetchJson(buildAppApiUrl(pathname), init);
    }

    async function fetchAuthorizedAppJson(pathname, init = {}) {
        const accessToken = await getSessionAccessToken();
        if (!accessToken) {
            throw new Error("Session invalide. Reconnectez-vous.");
        }

        const headers = {
            ...(init.headers || {}),
            Authorization: `Bearer ${accessToken}`,
        };

        return fetchAppJson(pathname, {
            ...init,
            headers,
        });
    }

    function buildLoginRedirectUrl(redirectTarget) {
        const url = new URL("login.html", window.location.href);
        if (redirectTarget) {
            url.searchParams.set("redirect", redirectTarget);
        }
        return url.toString();
    }

    function buildSubscriptionCheckoutUrl(planId, billingCycle) {
        const url = new URL("subscription-plans.html", window.location.origin);
        if (planId) {
            url.searchParams.set("plan", String(planId).toLowerCase());
        }
        if (billingCycle) {
            url.searchParams.set("billing", String(billingCycle).toLowerCase());
        }
        return url.toString();
    }

    function createAuthService() {
        const override = getServiceOverride("auth");
        if (override) return override;

        return {
            async getSessionUser() {
                if (typeof window.checkAuth === "function") {
                    return window.checkAuth();
                }

                const client = getSupabaseClient();
                if (
                    client?.auth &&
                    typeof client.auth.getSession === "function"
                ) {
                    const {
                        data: { session } = {},
                    } = await client.auth.getSession();
                    return session?.user || null;
                }

                return null;
            },
            async getSession() {
                const client = getSupabaseClient();
                if (
                    client?.auth &&
                    typeof client.auth.getSession === "function"
                ) {
                    const result = await client.auth.getSession();
                    return result?.data?.session || null;
                }
                return null;
            },
            async getAccessToken() {
                return getSessionAccessToken();
            },
            redirectToLogin(options = {}) {
                const redirectTarget =
                    options.redirect ||
                    `${window.location.pathname}${window.location.search}`;
                const fallbackRedirectTarget =
                    options.redirectHtmlFallback || redirectTarget;
                const router = getRouter();

                if (router?.navigate) {
                    router.navigate("login", {
                        query: { redirect: redirectTarget },
                    });
                    return true;
                }

                return getAdapter().navigation.goToUrl(
                    buildLoginRedirectUrl(fallbackRedirectTarget),
                    { replace: options.replace === true },
                );
            },
        };
    }

    function createRoutingService() {
        const override = getServiceOverride("routing");
        if (override) return override;

        return {
            navigate(routeName, options) {
                const router = getRouter();
                if (router?.navigate) {
                    router.navigate(routeName, options);
                    return true;
                }

                if (typeof routeName === "string" && routeName.includes(".html")) {
                    return getAdapter().navigation.goToUrl(routeName, options);
                }

                return false;
            },
            buildHtmlUrl(routeName, options) {
                const router = getRouter();
                if (router?.buildHtmlUrl) {
                    return router.buildHtmlUrl(routeName, options);
                }
                return null;
            },
            buildUrl(routeName, options) {
                const router = getRouter();
                if (router?.buildUrl) {
                    return router.buildUrl(routeName, options);
                }
                return null;
            },
        };
    }

    function createProfileService() {
        const override = getServiceOverride("profiles");
        if (override) return override;

        return {
            async getUserProfile(userId) {
                try {
                    return await fetchAppJson(
                        `/app/profiles/${encodeURIComponent(
                            String(userId || "").trim(),
                        )}`,
                    );
                } catch (error) {
                    /* fallback below */
                }
                if (typeof window.getUserProfile === "function") {
                    return window.getUserProfile(userId);
                }
                return {
                    success: false,
                    error: "getUserProfile n'est pas disponible.",
                };
            },
            getCachedUser(userId) {
                if (typeof window.getUser === "function") {
                    return window.getUser(userId);
                }
                return null;
            },
            getDiscoverUsers() {
                const users = Array.isArray(window.allUsers)
                    ? [...window.allUsers]
                    : [];
                if (typeof window.sortUsersByLatestRecency === "function") {
                    try {
                        return window.sortUsersByLatestRecency(users);
                    } catch (error) {
                        return users;
                    }
                }
                return users;
            },
            renderUserCard(userId) {
                if (typeof window.renderUserCard === "function") {
                    try {
                        return window.renderUserCard(userId) || "";
                    } catch (error) {
                        return "";
                    }
                }
                return "";
            },
            async renderProfileTimeline(userId) {
                if (typeof window.renderProfileTimeline === "function") {
                    return window.renderProfileTimeline(userId);
                }
                return "";
            },
            renderProfileUsername(name, userId) {
                if (typeof window.renderUsernameForProfile === "function") {
                    return window.renderUsernameForProfile(name, userId);
                }
                return String(name || "");
            },
        };
    }

    function createBadgeService() {
        const override = getServiceOverride("badges");
        if (override) return override;

        return {
            renderUsernameWithBadge(username, userId) {
                if (
                    typeof window.renderUsernameWithBadge === "function" &&
                    userId
                ) {
                    return window.renderUsernameWithBadge(username, userId);
                }
                return String(username || "");
            },
            getSignature() {
                const usersLoaded = window.hasLoadedUsers ? "1" : "0";
                const userCount = Array.isArray(window.allUsers)
                    ? window.allUsers.length
                    : 0;
                let creators = 0;
                let staff = 0;

                if (typeof window.getVerifiedBadgeSets === "function") {
                    const sets = window.getVerifiedBadgeSets();
                    creators = sets?.creators?.size || 0;
                    staff = sets?.staff?.size || 0;
                }

                return `${usersLoaded}|${userCount}|${creators}|${staff}`;
            },
        };
    }

    function createSubscriptionService() {
        const override = getServiceOverride("subscriptions");
        if (override) return override;

        return {
            async updateUserPlan(userId, plan, status) {
                if (typeof window.updateUserPlan === "function") {
                    return window.updateUserPlan(userId, plan, status);
                }
                return {
                    success: false,
                    error: "updateUserPlan n'est pas disponible.",
                };
            },
            async getCurrentState() {
                return fetchAuthorizedAppJson("/app/subscriptions/me");
            },
            async waitForPlanActivation(expectedPlan, options = {}) {
                const attempts = Math.max(
                    1,
                    parseInt(options.attempts, 10) || 4,
                );
                const delayMs = Math.max(
                    150,
                    parseInt(options.delayMs, 10) || 450,
                );
                const normalizedPlan = String(expectedPlan || "")
                    .trim()
                    .toLowerCase();
                let latestState = null;

                for (let attempt = 0; attempt < attempts; attempt += 1) {
                    latestState = await this.getCurrentState();
                    const currentUser = latestState?.data?.user || null;
                    const activePlan = String(currentUser?.plan || "")
                        .trim()
                        .toLowerCase();
                    const activeStatus = String(
                        currentUser?.plan_status || "",
                    )
                        .trim()
                        .toLowerCase();

                    if (
                        currentUser &&
                        activeStatus === "active" &&
                        (!normalizedPlan || activePlan === normalizedPlan)
                    ) {
                        return latestState;
                    }

                    if (attempt < attempts - 1) {
                        await new Promise((resolve) => {
                            window.setTimeout(resolve, delayMs);
                        });
                    }
                }

                return latestState;
            },
            async navigateToCheckout(planId, billingCycle) {
                try {
                    if (!window.XeraMobileMoney?.openCheckout) {
                        await new Promise((resolve) => {
                            const s = document.createElement("script");
                            s.src = "js/mobile-money-modal.js";
                            s.onload = () => resolve();
                            s.onerror = () => resolve();
                            document.head.appendChild(s);
                        });
                    }

                    if (window.XeraMobileMoney?.openCheckout) {
                        const accessToken = await getSessionAccessToken();
                        const client = getSupabaseClient();
                        const {
                            data: { user } = {},
                        } = client?.auth ? await client.auth.getUser() : {};

                        const normalizedPlanId = String(planId || "standard").toLowerCase();
                        const normalizedBillingCycle = String(billingCycle || "monthly").toLowerCase();

                        window.XeraMobileMoney.openCheckout({
                            type: "subscription",
                            title: `Abonnement ${normalizedPlanId.toUpperCase()}`,
                            amountLabel: normalizedBillingCycle === "annual" ? "Facturation annuelle" : "Facturation mensuelle",
                            payload: {
                                plan: normalizedPlanId,
                                billing_cycle: normalizedBillingCycle,
                                user_id: user?.id,
                            },
                            accessToken,
                        });
                        return true;
                    }
                } catch (e) {
                    console.warn("[Bridge] Mobile Money checkout failed:", e);
                }

                window.location.href = buildSubscriptionCheckoutUrl(planId, billingCycle);
                return true;
            },
        };
    }

    function createFormatterService() {
        const override = getServiceOverride("formatters");
        if (override) return override;

        return {
            currency(amount, currency) {
                if (typeof window.formatCurrency === "function") {
                    return window.formatCurrency(amount, currency || "USD");
                }
                return new Intl.NumberFormat("fr-FR", {
                    style: "currency",
                    currency: currency || "USD",
                }).format(Number(amount || 0));
            },
            time(value) {
                if (!value) return "";
                const date = new Date(value);
                return date.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                });
            },
        };
    }

    function createHttpService() {
        const override = getServiceOverride("http");
        if (override) return override;
        return getAdapter().http;
    }

    function defineLazyService(target, serviceName, factory) {
        Object.defineProperty(target, serviceName, {
            enumerable: true,
            configurable: false,
            get() {
                return factory();
            },
        });
    }

    const services = {};

    defineLazyService(services, "auth", createAuthService);
    defineLazyService(services, "badges", createBadgeService);
    defineLazyService(services, "formatters", createFormatterService);
    defineLazyService(services, "http", createHttpService);
    defineLazyService(services, "platform", getAdapter);
    defineLazyService(services, "profiles", createProfileService);
    defineLazyService(services, "routing", createRoutingService);
    defineLazyService(services, "subscriptions", createSubscriptionService);

    window.XeraPlatformBridge = Object.freeze({
        buildLoginRedirectUrl,
        buildSubscriptionCheckoutUrl,
        buildAppApiUrl,
        createBrowserAdapter,
        fetchAppJson,
        fetchAuthorizedAppJson,
        getAdapter,
        getServiceOverride,
        getSessionAccessToken,
        getSupabaseClient,
        setAdapter,
        setServiceOverrides,
    });

    window.XeraAppServices = services;
})();
