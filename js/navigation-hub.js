/**
 * XERA1 Navigation Hub & Profile Popover System
 * Keeps the account switcher and member identity in sync with the signed-in user.
 */

(() => {
    function ensureProfileHubPopover() {
        let popover = document.getElementById("profile-hub-popover");
        if (popover) return popover;

        popover = document.createElement("div");
        popover.id = "profile-hub-popover";
        popover.className = "profile-hub-popover";
        popover.innerHTML = `
            <a href="profile-personal.html" class="hub-user-header hub-user-header--link" title="Voir et modifier mon profil">
                <div class="hub-avatar-wrap"><img id="hub-user-avatar" class="hub-user-avatar" src="icons/logo.png" alt="Avatar"></div>
                <div class="hub-user-info">
                    <span id="hub-user-name" class="hub-user-name">Mon profil</span>
                    <span id="hub-user-handle" class="hub-user-handle" hidden></span>
                    <span id="hub-pro-badge" class="hub-badge-pro" style="display:none"><i class="fas fa-certificate"></i> PRO</span>
                    <span class="hub-edit-label"><i class="fas fa-pencil-alt"></i> Modifier le profil</span>
                </div>
            </a>
            <div class="hub-menu-group">
                <button type="button" class="hub-menu-item" id="hub-nav-pro-page" data-profile-hub-pro-page style="display:none">
                    <i class="fas fa-building" data-pro-page-icon aria-hidden="true"></i>
                    <img class="hub-pro-page-avatar" data-pro-page-avatar alt="" hidden>
                    <span data-pro-page-name>Page Pro / Entreprise</span>
                </button>
                <button type="button" class="hub-menu-item" onclick="location.href='subscription-plans.html'">
                    <i class="fas fa-wallet"></i><span>Abonnements</span>
                </button>
                <button type="button" class="hub-menu-item" id="nav-fata-btn">
                    <img src="icons/fata.webp" alt="Fata" style="width:18px;height:18px;object-fit:contain">
                    <span>Challenge Fata</span>
                </button>
            </div>
            <div class="hub-divider"></div>
            <div class="hub-footer-row">
                <div class="lang-switcher-nav">
                    <select id="header-lang-select" class="nav-lang-select" aria-label="Language selection">
                        <option value="fr">FR</option><option value="en">EN</option>
                    </select>
                </div>
                <a href="login.html" id="nav-auth" class="hub-menu-item" data-i18n="navAuth">Connexion</a>
            </div>
        `;
        document.body.appendChild(popover);
        return popover;
    }

    function getProfileHubTriggers() {
        return Array.from(
            document.querySelectorAll(
                '#nav-profile-hub-trigger, #nav-profile, [data-quick-action="profile"], [data-profile-hub-trigger]',
            ),
        );
    }

    function initNavigationHub() {
        const profileTriggers = getProfileHubTriggers();
        const profilePopover = ensureProfileHubPopover();

        if (!profileTriggers.length || !profilePopover) return;

        profilePopover.setAttribute("aria-hidden", "true");

        const quickProfileAction = document.querySelector(
            '[data-quick-action="profile"]',
        );

        profileTriggers.forEach((profileTrigger) => {
            profileTrigger.setAttribute("aria-haspopup", "true");
            profileTrigger.setAttribute("aria-expanded", "false");
            profileTrigger.setAttribute("aria-controls", profilePopover.id);

            // The desktop quick action already calls toggleProfileHub() from router.js.
            // Binding a second click handler would toggle the panel twice.
            if (profileTrigger === quickProfileAction) return;

            // The mobile dock and the legacy avatar still have inline profile
            // navigation handlers. This control opens the same account menu as
            // the desktop quick action instead of navigating away.
            profileTrigger.removeAttribute("onclick");

            profileTrigger.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleProfileHub();
            });

            if (profileTrigger.matches('[role="button"]:not(button)')) {
                profileTrigger.addEventListener("keydown", (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleProfileHub();
                    }
                });
            }
        });

        document.addEventListener("click", (event) => {
            if (
                !profilePopover.contains(event.target) &&
                !getProfileHubTriggers().some((trigger) =>
                    trigger.contains(event.target),
                )
            ) {
                closeProfileHub();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") closeProfileHub();
        });

        profilePopover
            .querySelectorAll("a, button, [role='button']")
            .forEach((element) => {
                element.addEventListener("click", closeProfileHub);
            });
    }

    function getStoredUser() {
        try {
            const userString =
                localStorage.getItem("xera_user") ||
                localStorage.getItem("rize_user") ||
                localStorage.getItem("rize_user_session");
            return userString ? JSON.parse(userString) : null;
        } catch (_) {
            return null;
        }
    }

    function getCurrentHubUser() {
        const currentUser = window.currentUser || {};
        const storedUser = getStoredUser() || {};
        const currentMetadata = currentUser.user_metadata || {};
        const storedMetadata = storedUser.user_metadata || {};
        const cachedProfile =
            currentUser.profile ||
            (Array.isArray(window.allUsers)
                ? window.allUsers.find((candidate) => candidate.id === currentUser.id)
                : null) ||
            {};
        const username =
            currentUser.username ||
            currentMetadata.username ||
            cachedProfile.username ||
            storedUser.username ||
            storedMetadata.username ||
            "";

        return {
            ...storedUser,
            ...currentUser,
            username,
            user_metadata: { ...storedMetadata, ...currentMetadata },
            avatar_url:
                currentUser.avatar_url ||
                currentUser.avatar ||
                currentMetadata.avatar_url ||
                currentMetadata.avatar ||
                currentMetadata.picture ||
                cachedProfile.avatar_url ||
                cachedProfile.avatar ||
                storedUser.avatar_url ||
                storedUser.avatar ||
                storedMetadata.avatar_url ||
                storedMetadata.avatar ||
                storedMetadata.picture ||
                "",
            name:
                currentUser.name ||
                currentMetadata.full_name ||
                currentMetadata.name ||
                cachedProfile.name ||
                storedUser.name ||
                storedMetadata.full_name ||
                storedMetadata.name ||
                "",
        };
    }

    function setImageSource(image, source, fallbackSource = "") {
        if (!image) return;
        const nextSource = String(source || fallbackSource || "").trim();
        if (!nextSource) return;
        image.onerror = () => {
            image.onerror = null;
            if (fallbackSource && nextSource !== fallbackSource) {
                image.src = fallbackSource;
            }
        };
        image.src = nextSource;
    }

    function syncProfileHubData() {
        const user = getCurrentHubUser();
        const metadata = user.user_metadata || {};
        const username = String(user.username || "").trim().replace(/^@/, "");
        const displayName =
            username ||
            String(user.name || metadata.display_name || "").trim() ||
            String(user.email || "").split("@")[0] ||
            "Mon profil";
        const handle = document.getElementById("hub-user-handle");
        const name = document.getElementById("hub-user-name");
        const avatar = document.getElementById("hub-user-avatar");
        const navAvatar = document.getElementById("nav-profile-avatar");
        const proBadge = document.getElementById("hub-pro-badge");
        const proButton =
            document.querySelector("[data-profile-hub-pro-page]") ||
            document.getElementById("nav-pro-page");

        if (name) name.textContent = displayName;
        if (handle) {
            const shouldShowHandle = username && username !== displayName;
            handle.textContent = shouldShowHandle ? `@${username}` : "";
            handle.hidden = !shouldShowHandle;
        }

        const avatarUrl = String(user.avatar_url || "").trim();
        if (avatarUrl && typeof window.setNavProfileAvatar === "function") {
            window.setNavProfileAvatar(avatarUrl, user.id || null);
        }
        setImageSource(avatar, navAvatar?.src || avatar?.src || avatarUrl);
        if (avatar) avatar.alt = `Avatar de ${displayName}`;
        if (navAvatar) navAvatar.alt = `Avatar de ${displayName}`;

        const isPro =
            user.is_pro ||
            user.role === "pro" ||
            user.role === "professional" ||
            user.subscription_tier === "pro" ||
            user.subscription_tier === "professional" ||
            String(user.account_type || metadata.account_type || "")
                .toLowerCase()
                .includes("pro") ||
            (typeof window.isProUser === "function" && window.isProUser(user));
        if (proBadge) proBadge.style.display = isPro ? "inline-flex" : "none";

        if (proButton) {
            proButton.style.display = user.id ? "flex" : "none";
            proButton.title = "Ouvrir ou créer une Page Pro";
        }

        syncProfessionalPage(user, proButton);
    }

    async function syncProfessionalPage(user, button) {
        if (!button) return;

        const label = button.querySelector("[data-pro-page-name]");
        const logo = button.querySelector("[data-pro-page-avatar]");
        const defaultIcon = button.querySelector("[data-pro-page-icon]");
        const setDefault = () => {
            if (label) label.textContent = "Page Pro";
            if (logo) {
                logo.hidden = true;
                logo.removeAttribute("src");
            }
            if (defaultIcon) defaultIcon.hidden = false;
            delete button.dataset.proSlug;
            button.title = "Ouvrir ou créer une Page Pro";
            button.setAttribute("aria-label", "Page Pro");
        };

        setDefault();
        if (!user?.id) return;

        const client = window.supabaseClient || window.supabase;
        if (!client?.from) return;

        try {
            const { data: page, error } = await client
                .from("professional_pages")
                .select("id, owner_id, slug, name, avatar_url")
                .eq("owner_id", user.id)
                .limit(1)
                .maybeSingle();

            if (error || !page) return;

            const pageName = String(page.name || "Page Pro").trim();
            if (label) label.textContent = pageName;
            if (logo && page.avatar_url) {
                logo.hidden = false;
                setImageSource(logo, page.avatar_url);
                logo.onerror = () => {
                    logo.hidden = true;
                    if (defaultIcon) defaultIcon.hidden = false;
                    logo.onerror = null;
                };
                if (defaultIcon) defaultIcon.hidden = true;
            }
            button.title = `Basculer vers ${pageName}`;
            button.setAttribute("aria-label", `Basculer vers ${pageName}`);
            if (page.slug) button.dataset.proSlug = page.slug;
        } catch (error) {
            console.warn("Impossible de charger la Page Pro du profil:", error);
        }
    }

    function openProfileHub() {
        const profileTriggers = getProfileHubTriggers();
        const profilePopover = document.getElementById("profile-hub-popover");
        if (!profileTriggers.length || !profilePopover) return false;

        closeAllNavPanels();
        profilePopover.classList.add("is-open");
        profilePopover.setAttribute("aria-hidden", "false");
        profileTriggers.forEach((trigger) =>
            trigger.setAttribute("aria-expanded", "true"),
        );
        syncProfileHubData();
        return true;
    }

    function closeProfileHub() {
        const profileTriggers = getProfileHubTriggers();
        const profilePopover = document.getElementById("profile-hub-popover");
        if (profilePopover) {
            profilePopover.classList.remove("is-open");
            profilePopover.setAttribute("aria-hidden", "true");
        }
        profileTriggers.forEach((trigger) =>
            trigger.setAttribute("aria-expanded", "false"),
        );
    }

    function toggleProfileHub() {
        const profilePopover = document.getElementById("profile-hub-popover");
        if (profilePopover?.classList.contains("is-open")) {
            closeProfileHub();
            return true;
        }
        return openProfileHub();
    }

    function closeAllNavPanels() {
        closeProfileHub();
        const notificationPanel = document.getElementById("notification-panel");
        const fataPanel = document.getElementById("fata-challenge-panel");

        if (notificationPanel) notificationPanel.classList.remove("active", "is-open");
        if (fataPanel) fataPanel.classList.remove("is-open");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initNavigationHub, {
            once: true,
        });
    } else {
        initNavigationHub();
    }

    window.XeraNavHub = {
        initNavigationHub,
        closeAllNavPanels,
        closeProfileHub,
        openProfileHub,
        toggleProfileHub,
        syncProfileHubData,
    };
})();
