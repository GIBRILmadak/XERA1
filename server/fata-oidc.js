const metadataCache = new Map();
let openidClientPromise;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 15000;

function getFataOidcDiscoveryTimeoutMs(value = process.env.FATA_OIDC_DISCOVERY_TIMEOUT_MS) {
    const configured = Number(value);
    if (!Number.isFinite(configured) || configured <= 0) {
        return DEFAULT_DISCOVERY_TIMEOUT_MS;
    }
    return Math.min(30000, Math.max(1000, Math.floor(configured)));
}

async function loadOpenidClient() {
    if (!openidClientPromise) {
        openidClientPromise = import("openid-client");
    }
    return openidClientPromise;
}

async function getFataOidcMetadata(config) {
    if (!config?.issuer || !config?.discoveryUrl) {
        throw new Error("Fata OIDC issuer and discovery URL are not configured");
    }
    const issuerUrl = new URL(config.issuer);
    const discoveryUrl = new URL(config.discoveryUrl);
    if (issuerUrl.protocol !== "https:" || discoveryUrl.protocol !== "https:") {
        throw new Error("Fata OIDC issuer and discovery URL must use HTTPS");
    }

    const cacheKey = `${config.issuer}|${config.discoveryUrl}`;
    const cached = metadataCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.metadata;

    const timeoutMs = getFataOidcDiscoveryTimeoutMs();
    let response;
    try {
        response = await fetch(config.discoveryUrl, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (error) {
        if (
            error?.name === "TimeoutError" ||
            /timed? out|timeout|aborted due to timeout/i.test(
                error?.message || "",
            )
        ) {
            throw new Error(
                `Fata OIDC discovery timed out after ${timeoutMs}ms`,
                { cause: error },
            );
        }
        throw error;
    }
    if (!response.ok) {
        throw new Error(`Fata OIDC discovery failed: HTTP ${response.status}`);
    }

    const metadata = await response.json();
    if (!metadata || metadata.issuer !== config.issuer) {
        throw new Error("Fata OIDC discovery issuer does not match configured issuer");
    }
    if (
        !Array.isArray(metadata.response_types_supported) ||
        !metadata.response_types_supported.includes("code")
    ) {
        throw new Error("Fata OIDC provider does not support the authorization-code flow");
    }
    if (
        !Array.isArray(metadata.code_challenge_methods_supported) ||
        !metadata.code_challenge_methods_supported.includes("S256")
    ) {
        throw new Error("Fata OIDC provider does not support PKCE S256");
    }
    if (
        Array.isArray(metadata.token_endpoint_auth_methods_supported) &&
        !metadata.token_endpoint_auth_methods_supported.includes(config.tokenAuthMethod)
    ) {
        throw new Error("Configured Fata token authentication method is not supported by OIDC discovery");
    }

    const endpoints = {
        authorization_endpoint: metadata.authorization_endpoint,
        token_endpoint: metadata.token_endpoint,
        jwks_uri: metadata.jwks_uri,
    };
    for (const [name, endpoint] of Object.entries(endpoints)) {
        let parsed;
        try {
            parsed = new URL(endpoint);
        } catch (_) {
            throw new Error(`Fata OIDC discovery has an invalid ${name}`);
        }
        if (parsed.protocol !== "https:") {
            throw new Error(`Fata OIDC ${name} must use HTTPS`);
        }
    }

    const resolved = metadata;
    metadataCache.set(cacheKey, {
        metadata: resolved,
        expiresAt: Date.now() + 5 * 60 * 1000,
    });
    return resolved;
}

async function getFataOidcClient(config) {
    if (!config?.clientId || !config?.clientSecret) {
        throw new Error("Fata OIDC client credentials are missing");
    }

    const [oidc, metadata] = await Promise.all([
        loadOpenidClient(),
        getFataOidcMetadata(config),
    ]);

    let clientAuthentication;
    if (config.tokenAuthMethod === "client_secret_basic") {
        clientAuthentication = oidc.ClientSecretBasic(config.clientSecret);
    } else if (config.tokenAuthMethod === "client_secret_post") {
        clientAuthentication = oidc.ClientSecretPost(config.clientSecret);
    } else {
        throw new Error("Unsupported Fata token endpoint authentication method");
    }

    // The discovery document is fetched using the configured URL, its issuer
    // is checked above, and the OIDC library handles PKCE/token validation.
    const configuration = new oidc.Configuration(
        metadata,
        config.clientId,
        { client_secret: config.clientSecret },
        clientAuthentication,
    );

    return { oidc, configuration, metadata };
}

module.exports = {
    getFataOidcMetadata,
    getFataOidcClient,
    getFataOidcDiscoveryTimeoutMs,
};
