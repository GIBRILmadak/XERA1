(function () {
    const WEB_APP_HEAD_ENTRIES = [
        {
            selector: 'link[rel="manifest"]',
            tagName: "link",
            attributes: {
                rel: "manifest",
                href: "/manifest.json",
            },
        },
        {
            selector: 'link[rel="icon"][sizes="192x192"]',
            tagName: "link",
            attributes: {
                rel: "icon",
                type: "image/png",
                sizes: "192x192",
                href: "/icons/logo.png",
            },
        },
        {
            selector: 'link[rel="icon"][sizes="512x512"]',
            tagName: "link",
            attributes: {
                rel: "icon",
                type: "image/png",
                sizes: "512x512",
                href: "/icons/logo-512x512.png",
            },
        },
        {
            selector: 'link[rel="shortcut icon"]',
            tagName: "link",
            attributes: {
                rel: "shortcut icon",
                href: "/icons/logo.png",
            },
        },
        {
            selector: 'link[rel="apple-touch-icon"]',
            tagName: "link",
            attributes: {
                rel: "apple-touch-icon",
                href: "/icons/logo.png",
            },
        },
        {
            selector: 'meta[name="theme-color"]',
            tagName: "meta",
            attributes: {
                name: "theme-color",
                content: "#050505",
            },
        },
        {
            selector: 'meta[name="mobile-web-app-capable"]',
            tagName: "meta",
            attributes: {
                name: "mobile-web-app-capable",
                content: "yes",
            },
        },
        {
            selector: 'meta[name="apple-mobile-web-app-capable"]',
            tagName: "meta",
            attributes: {
                name: "apple-mobile-web-app-capable",
                content: "yes",
            },
        },
        {
            selector: 'meta[name="apple-mobile-web-app-status-bar-style"]',
            tagName: "meta",
            attributes: {
                name: "apple-mobile-web-app-status-bar-style",
                content: "black",
            },
        },
    ];
    const HTML_TO_CLEAN_PATH = {
        "index.html": "/",
        "login.html": "/login",
        "profile.html": "/profile",
        "messages.html": "/messages",
        "analytics.html": "/analytics",
        "admin.html": "/admin",
        "badges-admin.html": "/badges-admin",
        "create-stream.html": "/create-stream",
        "creator-dashboard.html": "/creator-dashboard",
        "credits.html": "/credits",
        "stream.html": "/stream",
        "subscription-plans.html": "/subscription-plans",
        "verification.html": "/verification",
        "cgu.html": "/cgu",
        "privacy.html": "/privacy",
        "404.html": "/404",
    };
    const CLEAN_TO_HTML_PATH = Object.fromEntries(
        Object.entries(HTML_TO_CLEAN_PATH).map(([htmlPath, cleanPath]) => [
            cleanPath,
            `/${htmlPath}`,
        ]),
    );
    CLEAN_TO_HTML_PATH["/pagepro"] = "/profile.html";

    const ROUTE_NAMES = {
        discover: "/",
        login: "/login",
        profile: "/profile",
        messages: "/messages",
        pagepro: "/pagepro",
        analytics: "/analytics",
        admin: "/admin",
        badgesAdmin: "/badges-admin",
        createStream: "/create-stream",
        creatorDashboard: "/creator-dashboard",
        credits: "/credits",
        stream: "/stream",
        subscriptionPlans: "/subscription-plans",
        verification: "/verification",
        cgu: "/cgu",
        privacy: "/privacy",
        notFound: "/404",
    };

    const ROUTE_ALIASES = {
        home: "discover",
        index: "discover",
        discover: "discover",
        login: "login",
        profile: "profile",
        messages: "messages",
        pagepro: "pagepro",
        analytics: "analytics",
        admin: "admin",
        badgesadmin: "badgesAdmin",
        createstream: "createStream",
        creatordashboard: "creatorDashboard",
        credits: "credits",
        stream: "stream",
        subscriptionplans: "subscriptionPlans",
        verification: "verification",
        cgu: "cgu",
        privacy: "privacy",
        notfound: "notFound",
        404: "notFound",
    };

    function isSameOrigin(url) {
        return url.origin === window.location.origin;
    }

    function shouldNormalizeToCleanPath() {
        const { protocol, hostname } = window.location;
        if (protocol === "file:") return false;

        // Ne pas nettoyer le chemin (garder .html) en local pour éviter les 404 au refresh
        const isLocal =
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "0.0.0.0" ||
            hostname === "0" ||
            hostname.startsWith("192.168.") ||
            hostname.endsWith(".local");

        return !isLocal;
    }

    function normalizePathname(pathname) {
        return pathname === "/index.html" ? "/" : pathname;
    }

    function ensureHeadEntry({ selector, tagName, attributes }) {
        if (!document.head) return;

        let element = document.head.querySelector(selector);
        if (!element) {
            element = document.createElement(tagName);
            document.head.appendChild(element);
        }

        Object.entries(attributes).forEach(([name, value]) => {
            if (element.getAttribute(name) !== value) {
                element.setAttribute(name, value);
            }
        });
    }

    function ensureWebAppHead() {
        WEB_APP_HEAD_ENTRIES.forEach(ensureHeadEntry);
    }

    function mapHtmlPathToClean(pathname) {
        const normalized = pathname.startsWith("/")
            ? pathname.slice(1)
            : pathname;
        if (HTML_TO_CLEAN_PATH[normalized]) {
            return HTML_TO_CLEAN_PATH[normalized];
        }
        return normalizePathname(pathname);
    }

    function mapCleanPathToHtml(pathname) {
        const normalized = normalizePathname(pathname);
        if (normalized === "/pagepro" && shouldNormalizeToCleanPath()) {
            return normalized;
        }
        if (CLEAN_TO_HTML_PATH[normalized]) {
            return CLEAN_TO_HTML_PATH[normalized];
        }
        return pathname;
    }

    function toCleanUrl(target, options = {}) {
        const base = options.base || window.location.href;

        try {
            const url = new URL(target, base);
            if (!isSameOrigin(url)) {
                return url.toString();
            }

            url.pathname = mapHtmlPathToClean(url.pathname);
            const relative =
                url.pathname + (url.search || "") + (url.hash || "");

            return relative || "/";
        } catch (error) {
            return target;
        }
    }

    function toHtmlUrl(target, options = {}) {
        const base = options.base || window.location.href;

        try {
            const url = new URL(target, base);
            if (!isSameOrigin(url)) {
                return url.toString();
            }

            url.pathname = mapCleanPathToHtml(url.pathname);
            const relative =
                url.pathname + (url.search || "") + (url.hash || "");

            return relative || "/index.html";
        } catch (error) {
            return target;
        }
    }

    function buildUrl(routeName, options = {}) {
        const { query, hash } = options;
        const basePath = ROUTE_NAMES[routeName] || toCleanUrl(routeName);
        const url = new URL(basePath, window.location.origin);

        if (query && typeof query === "object") {
            Object.entries(query).forEach(([key, value]) => {
                if (value === null || value === undefined || value === "")
                    return;
                url.searchParams.set(key, String(value));
            });
        }

        if (hash) {
            url.hash = hash.startsWith("#") ? hash : `#${hash}`;
        }

        return `${url.pathname}${url.search}${url.hash}`;
    }

    function buildHtmlUrl(routeName, options = {}) {
        return toHtmlUrl(buildUrl(routeName, options));
    }

    function resolveRouteName(target) {
        if (typeof target !== "string") return null;
        if (ROUTE_NAMES[target]) return target;

        const normalized = target
            .trim()
            .replace(/^\//, "")
            .replace(/\.html$/i, "")
            .replace(/[^a-z0-9]+/gi, "")
            .toLowerCase();

        return ROUTE_ALIASES[normalized] || null;
    }

    function navigate(target, options = {}) {
        const { replace = false, query, hash } = options;
        const destination =
            query || hash || ROUTE_NAMES[target]
                ? buildHtmlUrl(target, { query, hash })
                : toHtmlUrl(target);

        const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (destination === currentUrl) return;

        if (replace) {
            window.location.replace(destination);
            return;
        }

        window.location.assign(destination);
    }

    function isProAccountType(accountType, accountSubtype) {
        const values = [accountType, accountSubtype]
            .filter(
                (value) =>
                    value !== undefined && value !== null && value !== "",
            )
            .map((value) => String(value).trim().toLowerCase());

        return values.some((value) =>
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
                "professional",
                "recruiter",
                "investor",
                "partner",
            ].includes(value),
        );
    }

    function buildProfileUrl(userId, accountType, accountSubtype) {
        const isPro = isProAccountType(accountType, accountSubtype);
        const route = isPro ? "pagepro" : "profile";
        return buildHtmlUrl(route, {
            query: userId ? { user: userId } : {},
        });
    }

    async function resolveCurrentUser() {
        if (window.currentUser?.id) {
            return window.currentUser;
        }

        if (window.currentUserId) {
            return { id: window.currentUserId };
        }

        if (typeof window.checkAuth === "function") {
            try {
                const user = await window.checkAuth();
                if (user?.id) {
                    return user;
                }
            } catch (error) {
                console.warn("[router] checkAuth fallback failed", error);
            }
        }

        const client = window.supabaseClient || window.supabase;
        if (client?.auth?.getUser) {
            try {
                const result = await client.auth.getUser();
                const user = result?.data?.user || null;
                if (user?.id) {
                    // Enrich with metadata if possible
                    const type =
                        user.user_metadata?.account_type || user.account_type;
                    user.account_type = type;

                    window.currentUser = window.currentUser || user;
                    window.currentUserId = window.currentUserId || user.id;
                    return user;
                }
            } catch (error) {
                console.warn("[router] Supabase user lookup failed", error);
            }
        }

        return null;
    }

    function fallbackNavigate(target, options = {}) {
        if (typeof target !== "string" || !target) return;

        if (target === "messages") {
            navigate("messages", options);
            return;
        }

        const routeName = resolveRouteName(target);
        if (routeName) {
            navigate(routeName, options);
            return;
        }

        const destination = toHtmlUrl(target);
        if (options.replace) {
            window.location.replace(destination);
            return;
        }

        window.location.assign(destination);
    }

    async function fallbackHandleProfileNavigation() {
        const user = await resolveCurrentUser();
        if (!user?.id) {
            navigate("login");
            return;
        }

        const type =
            user.user_metadata?.account_type || user.account_type || "personal";
        const subtype =
            user.user_metadata?.account_subtype ||
            user.account_subtype ||
            user.accountSubtype ||
            "personal";
        const isPro = isProAccountType(type, subtype);

        navigate(isPro ? "pagepro" : "profile", {
            query: { user: user.id },
        });
    }

    async function fallbackOpenMessagesPage() {
        const user = await resolveCurrentUser();
        if (!user?.id) {
            navigate("login");
            return;
        }

        navigate("messages");
    }

    function fallbackToggleNotificationPanel() {
        const panel = document.getElementById("notification-panel");
        if (panel) {
            panel.classList.toggle("show");
            return;
        }

        void fallbackOpenMessagesPage();
    }

    function normalizeLegacyProfileRoute(pathname, search) {
        const normalized = pathname.replace(/\/+/g, "/").replace(/\/$/, "");
        const pageProMatch = normalized.match(/^\/pagepro\/([\w-]{8,})$/i);
        if (pageProMatch) {
            return toHtmlUrl(
                `/pagepro?user=${encodeURIComponent(pageProMatch[1])}${search || ""}`,
            );
        }
        const profileMatch = normalized.match(/^\/profile\/([\w-]{8,})$/i);
        if (profileMatch) {
            return toHtmlUrl(
                `/profile?user=${encodeURIComponent(profileMatch[1])}${search || ""}`,
            );
        }
        return null;
    }

    function normalizeCurrentLocation() {
        const isLocal = !shouldNormalizeToCleanPath();
        const currentPath = normalizePathname(window.location.pathname);
        const legacyRedirect = normalizeLegacyProfileRoute(
            currentPath,
            window.location.search,
        );

        if (legacyRedirect) {
            window.history.replaceState({}, document.title, legacyRedirect);
            return;
        }

        if (isLocal) {
            // En local, on s'assure d'avoir le .html pour éviter les 404 au refresh
            const htmlPath = mapCleanPathToHtml(currentPath);
            if (htmlPath !== currentPath) {
                const nextUrl = `${htmlPath}${window.location.search}${window.location.hash}`;
                window.history.replaceState({}, document.title, nextUrl);
            }
            return;
        }

        const cleanPath = mapHtmlPathToClean(currentPath);
        if (cleanPath === currentPath) return;

        const nextUrl = `${cleanPath}${window.location.search}${window.location.hash}`;
        window.history.replaceState({}, document.title, nextUrl);
    }

    function updateLinks(root = document) {
        root.querySelectorAll("a[href]").forEach((anchor) => {
            const href = anchor.getAttribute("href");
            if (!href || href.startsWith("#")) return;
            anchor.setAttribute("href", toHtmlUrl(href));
        });
    }

    function ensureRouteHelpers() {
        if (typeof window.navigateTo !== "function") {
            window.navigateTo = fallbackNavigate;
        }

        if (typeof window.buildProfileUrl !== "function") {
            window.buildProfileUrl = buildProfileUrl;
        }

        if (typeof window.handleProfileNavigation !== "function") {
            window.handleProfileNavigation = fallbackHandleProfileNavigation;
        }

        if (typeof window.openMessagesPage !== "function") {
            window.openMessagesPage = fallbackOpenMessagesPage;
        }

        if (typeof window.toggleNotificationPanel !== "function") {
            window.toggleNotificationPanel = fallbackToggleNotificationPanel;
        }
    }

    function ensureSecondaryPageBottomNav() {
        let bottomNav = document.querySelector(".xera-bottom-nav");
        if (!bottomNav) {
            if (document.body?.classList.contains("index-page")) return;
            bottomNav = document.createElement("div");
            bottomNav.className = "xera-bottom-nav";
            bottomNav.innerHTML = `
                <a class="xera-bottom-item" href="index.html" title="Accueil">
                    <div class="xera-bottom-icon"><i class="fas fa-home"></i></div>
                    <span>Accueil</span>
                </a>
                <a class="xera-bottom-item" href="index.html" title="Explorer">
                    <div class="xera-bottom-icon"><i class="fas fa-search"></i></div>
                    <span>Explorer</span>
                </a>
                <button type="button" class="xera-bottom-fab" title="Créer" aria-label="Créer">
                    <i class="fas fa-plus"></i>
                </button>
                <a class="xera-bottom-item xera-bottom-item--messages" href="messages.html" title="Messages">
                    <div class="xera-bottom-icon"><i class="fas fa-envelope"></i></div>
                    <span>Messages</span>
                </a>
                <a class="xera-bottom-item" href="profile.html" title="Profil">
                    <div class="xera-bottom-icon"><i class="fas fa-user"></i></div>
                    <span>Profil</span>
                </a>
            `;
            document.body.appendChild(bottomNav);
        }

        const createButton = bottomNav.querySelector(".xera-bottom-fab");
        if (createButton && !createButton.dataset.bound) {
            createButton.dataset.bound = "true";
            createButton.addEventListener("click", () => {
                if (typeof window.openCreateChoiceModal === "function") {
                    window.openCreateChoiceModal();
                } else {
                    window.location.href = "index.html";
                }
            });
        }

        const profileTrigger = bottomNav.querySelector(
            '[data-profile-hub-trigger], .xera-bottom-item[title="Profil"]',
        );
        if (profileTrigger) {
            profileTrigger.dataset.profileHubTrigger = "";
            profileTrigger.setAttribute("href", "#");
            profileTrigger.setAttribute("aria-label", "Ouvrir le menu Profil");
            ensureProfileHubScripts();
        }

        if (bottomNav.dataset.scrollBound) return;
        bottomNav.dataset.scrollBound = "true";
        let lastScrollY = window.scrollY;
        window.addEventListener(
            "scroll",
            () => {
                const currentScrollY = window.scrollY;
                if (currentScrollY > lastScrollY + 4) {
                    bottomNav.classList.remove("is-hidden");
                } else if (
                    currentScrollY < lastScrollY - 4 &&
                    currentScrollY > 16
                ) {
                    bottomNav.classList.add("is-hidden");
                } else if (currentScrollY <= 16) {
                    bottomNav.classList.remove("is-hidden");
                }
                lastScrollY = currentScrollY;
            },
            { passive: true },
        );
    }

    function ensureProfileHubScripts() {
        const loadFataIntegration = () => {
            if (
                window.FataIntegration ||
                document.querySelector('script[src*="fata-integration.js"]')
            ) {
                return;
            }
            const fataScript = document.createElement("script");
            fataScript.src = "/js/fata-integration.js?v=20261004-3";
            document.body.appendChild(fataScript);
        };

        if (window.XeraNavHub) {
            loadFataIntegration();
            return;
        }

        const existingScript = document.querySelector(
            'script[src*="navigation-hub.js"]',
        );
        if (existingScript) {
            if (window.XeraNavHub) {
                loadFataIntegration();
            } else {
                window.setTimeout(loadFataIntegration, 0);
            }
            return;
        }

        const navigationScript = document.createElement("script");
        navigationScript.src = "/js/navigation-hub.js?v=20261004-1";
        navigationScript.addEventListener("load", loadFataIntegration, {
            once: true,
        });
        document.body.appendChild(navigationScript);
    }

    function getCreationUserId() {
        if (window.currentUser?.id) return window.currentUser.id;
        if (window.currentUserId) return window.currentUserId;
        try {
            const stored = JSON.parse(
                localStorage.getItem("xera_user") ||
                    localStorage.getItem("rize_user") ||
                    "null",
            );
            return stored?.id || stored?.user_id || null;
        } catch (_) {
            return null;
        }
    }

    function openCreateChoiceModal() {
        let modal = document.getElementById("creation-choice-modal");
        if (modal) {
            modal.classList.add("active");
            return;
        }
        modal = document.createElement("div");
        modal.id = "creation-choice-modal";
        modal.className = "creation-choice-modal active";
        modal.innerHTML = `
            <div class="creation-choice-panel" role="dialog" aria-modal="true" aria-labelledby="creation-choice-title">
                <button type="button" class="creation-choice-close" aria-label="Fermer">&times;</button>
                <span class="creation-choice-kicker">NOUVEL ÉLAN</span>
                <h2 id="creation-choice-title">Qu'allez-vous construire aujourd'hui ?</h2>
                <p class="creation-choice-intro">Choisissez une action pour documenter votre progression.</p>
                <div class="creation-choice-actions">
                    <button type="button" class="creation-choice-action" data-choice="project">
                        <span class="creation-choice-icon"><i class="fas fa-layer-group"></i></span>
                        <span><strong>Nouveau projet</strong><small>Définir une trajectoire et un objectif.</small></span>
                        <i class="fas fa-arrow-right creation-choice-arrow"></i>
                    </button>
                    <button type="button" class="creation-choice-action" data-choice="update">
                        <span class="creation-choice-icon"><i class="fas fa-bolt"></i></span>
                        <span><strong>Publier une update</strong><small>Partager une avancée avec votre communauté.</small></span>
                        <i class="fas fa-arrow-right creation-choice-arrow"></i>
                    </button>
                </div>
                <p class="creation-choice-note">Une update doit être rattachée à un projet existant.</p>
            </div>
        `;
        document.body.appendChild(modal);
        const close = () => modal.classList.remove("active");
        modal
            .querySelector(".creation-choice-close")
            .addEventListener("click", close);
        modal.addEventListener("click", (event) => {
            if (event.target === modal) close();
        });
        modal.querySelectorAll("[data-choice]").forEach((button) => {
            button.addEventListener("click", () => {
                const userId = getCreationUserId();
                if (!userId) {
                    close();
                    window.location.href = "login.html";
                    return;
                }
                close();
                if (button.dataset.choice === "project") {
                    window.openCreateModal?.();
                } else {
                    window.openCreateMenu?.(userId);
                }
            });
        });
    }

    function ensureDesktopQuickActions() {
        if (document.querySelector(".desktop-quick-actions")) return;

        const actions = document.createElement("div");
        actions.className = "desktop-quick-actions";
        actions.innerHTML = `
            <button type="button" class="desktop-quick-action" data-quick-action="feed" title="Ouvrir le feed" aria-label="Ouvrir le feed">
                <i class="fas fa-rss" aria-hidden="true"></i><span>Feed</span>
            </button>
            <button type="button" class="desktop-quick-action" data-quick-action="profile" title="Ouvrir mon profil" aria-label="Ouvrir mon profil">
                <i class="fas fa-user" aria-hidden="true"></i><span>Profil</span>
            </button>
            <button type="button" class="desktop-quick-action" data-quick-action="messages" title="Ouvrir la messagerie">
                <i class="fas fa-comments" aria-hidden="true"></i><span>Messages</span>
            </button>
            <button type="button" class="desktop-quick-action" data-quick-action="search" title="Rechercher">
                <i class="fas fa-search" aria-hidden="true"></i><span>Rechercher</span>
            </button>
            <button type="button" class="desktop-quick-action desktop-quick-action-primary" data-quick-action="create" title="Créer un nouvel élan">
                <i class="fas fa-plus" aria-hidden="true"></i><span>Nouvel élan</span>
            </button>
        `;

        const indexNav = document.querySelector(
            "body.index-page nav .nav-links",
        );
        if (indexNav) {
            indexNav.appendChild(actions);
        } else {
            document.body.appendChild(actions);
        }

        actions
            .querySelector('[data-quick-action="feed"]')
            .addEventListener("click", () => {
                if (typeof window.navigateTo === "function") {
                    window.navigateTo("discover");
                } else {
                    window.location.href = "index.html";
                }
            });
        actions
            .querySelector('[data-quick-action="profile"]')
            .addEventListener("click", () => {
                if (window.XeraNavHub?.toggleProfileHub()) return;

                const profileTrigger = document.getElementById(
                    "nav-profile-hub-trigger",
                );
                if (profileTrigger) {
                    profileTrigger.click();
                } else if (typeof window.handleProfileNavigation === "function") {
                    window.handleProfileNavigation();
                } else {
                    window.location.href = "profile.html";
                }
            });
        actions
            .querySelector('[data-quick-action="messages"]')
            .addEventListener("click", () => {
                window.openMessagesPage?.();
            });
        actions
            .querySelector('[data-quick-action="search"]')
            .addEventListener("click", () => {
                if (typeof window.openDedicatedSearch === "function") {
                    window.openDedicatedSearch();
                } else {
                    window.location.href = "index.html#search";
                }
            });
        actions
            .querySelector('[data-quick-action="create"]')
            .addEventListener("click", () => {
                window.openCreateChoiceModal?.();
            });
    }

    ensureWebAppHead();
    ensureRouteHelpers();
    window.openCreateChoiceModal = openCreateChoiceModal;

    document.addEventListener("DOMContentLoaded", () => {
        ensureWebAppHead();
        ensureRouteHelpers();
        ensureSecondaryPageBottomNav();
        ensureDesktopQuickActions();
        normalizeCurrentLocation();
        updateLinks();
    });

    window.XeraRouter = {
        buildUrl,
        buildHtmlUrl,
        buildProfileUrl,
        ensureWebAppHead,
        navigate,
        normalizeCurrentLocation,
        resolveRouteName,
        toHtmlUrl,
        toCleanUrl,
        updateLinks,
    };
})();
