(function () {
    "use strict";

    const PERSONAL_PROFILE_FILE = "profile-personal.html";

    function isPersonalProfilePage() {
        return String(window.location.pathname || "").endsWith(
            PERSONAL_PROFILE_FILE,
        );
    }

    function enforcePersonalProfileDisplay() {
        if (!isPersonalProfilePage()) return;

        document.body.classList.remove("is-pro");
        document.body.classList.add("personal-profile-page");

        const profilePage = document.getElementById("profile");
        const proPage = document.getElementById("pro-page");
        if (profilePage) {
            profilePage.classList.add("active");
            profilePage.style.setProperty("display", "block", "important");
        }
        if (proPage) {
            proPage.classList.remove("active");
            proPage.style.setProperty("display", "none", "important");
        }
    }

    function startPersonalProfileDisplayGuard() {
        if (!isPersonalProfilePage()) return;

        enforcePersonalProfileDisplay();
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            startPersonalProfileDisplayGuard,
            { once: true },
        );
    } else {
        startPersonalProfileDisplayGuard();
    }
})();
