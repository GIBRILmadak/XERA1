const FATA_CALLBACK_PATH = "/api/auth/fata/callback";

const OIDC_RESPONSE_PARAMETERS = new Set([
    "code",
    "error",
    "error_description",
    "error_uri",
    "iss",
    "session_state",
    "state",
]);

function validateFataRedirectUri(value) {
    let redirectUrl;
    try {
        redirectUrl = new URL(String(value || "").trim());
    } catch (_) {
        return { valid: false, reason: "invalid_url" };
    }

    // Fata's development client is explicitly registered with this localhost
    // callback. Keep the HTTP exception narrow; every non-local callback must
    // use HTTPS.
    const isRegisteredLocalDevelopmentUri =
        redirectUrl.protocol === "http:" &&
        redirectUrl.hostname === "localhost" &&
        redirectUrl.port === "3000";
    if (redirectUrl.protocol !== "https:" && !isRegisteredLocalDevelopmentUri) {
        return { valid: false, reason: "https_required" };
    }
    if (
        redirectUrl.pathname.replace(/\/+$/, "") !== FATA_CALLBACK_PATH
    ) {
        return { valid: false, reason: "callback_path_required" };
    }
    if (
        redirectUrl.hash ||
        String(value).includes("#") ||
        redirectUrl.username ||
        redirectUrl.password
    ) {
        return { valid: false, reason: "fragment_or_credentials_not_allowed" };
    }

    for (const name of redirectUrl.searchParams.keys()) {
        if (OIDC_RESPONSE_PARAMETERS.has(name.toLowerCase())) {
            return { valid: false, reason: "reserved_oidc_parameter" };
        }
    }

    return { valid: true };
}

module.exports = { validateFataRedirectUri };
