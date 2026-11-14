const { getConfig } = require("./oauth-configs");
const { resolveChallengeConfig } = require("./fata-contract");
const { getFataOidcClient } = require("./fata-oidc");

let cachedToken = null;
let tokenExpiresAt = 0;
let tokenRequest = null;

const REQUEST_TIMEOUT_MS = Math.max(
    1000,
    Number(process.env.FATA_API_TIMEOUT_MS) || 10000,
);

function invalidateTechnicalToken() {
    cachedToken = null;
    tokenExpiresAt = 0;
    tokenRequest = null;
}

function normalizeFataOccurredAt(value) {
    const timestamp = String(value || "").trim();
    if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ||
        !Number.isFinite(Date.parse(timestamp))
    ) {
        throw new Error("Fata occurredAt must be a valid RFC3339 timestamp");
    }
    return new Date(timestamp).toISOString();
}

async function getTechnicalToken() {
    if (cachedToken && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }

    if (tokenRequest) return tokenRequest;

    tokenRequest = requestTechnicalToken();
    try {
        return await tokenRequest;
    } finally {
        tokenRequest = null;
    }
}

async function requestTechnicalToken() {
    const config = getConfig("fata");
    if (!config || !config.clientId || !config.clientSecret) {
        throw new Error("Fata OAuth configuration or credentials missing");
    }
    const { oidc, configuration } = await getFataOidcClient(config);
    const data = await oidc.clientCredentialsGrant(configuration, {
        scope: "action-completions:write",
    });
    if (!data || !data.access_token) {
        throw new Error("Invalid token response from Fata");
    }

    cachedToken = data.access_token;
    const expiresInMs = Math.max(0, Number(data.expires_in || 3600) * 1000);
    const refreshMarginMs = Math.min(60000, expiresInMs * 0.1);
    tokenExpiresAt = Date.now() + Math.max(0, expiresInMs - refreshMarginMs);
    return cachedToken;
}

/**
 * Send action completion to Fata with 401 single-retry mechanism
 * @param {Object} payload { subject, challengeId, requirementId, occurredAt }
 * @param {string} idempotencyKey
 */
async function sendActionCompletion(payload, idempotencyKey) {
    const config = getConfig("fata");
    if (!config) {
        throw new Error("Fata OAuth config missing");
    }

    const challenge = resolveChallengeConfig(payload.challengeId);
    if (
        !payload.subject ||
        !payload.requirementId ||
        ![challenge.req_arc, challenge.req_preuve, challenge.req_jalon].includes(
            payload.requirementId,
        )
    ) {
        throw new Error("Invalid Fata action completion payload");
    }
    const occurredAt = normalizeFataOccurredAt(payload.occurredAt);
    if (!idempotencyKey || !String(idempotencyKey).trim()) {
        throw new Error("Fata Idempotency-Key is required");
    }

    const body = {
        subject: payload.subject,
        challengeId: payload.challengeId,
        requirementId: payload.requirementId,
        occurredAt,
    };

    const apiBase = String(
        config.apiBase || process.env.FATA_API_BASE_URL || "",
    ).replace(/\/$/, "");
    let parsedApiBase;
    try {
        parsedApiBase = new URL(apiBase);
    } catch (_) {
        throw new Error("Fata API base URL is invalid");
    }
    if (
        parsedApiBase.protocol !== "https:" ||
        parsedApiBase.search ||
        parsedApiBase.hash ||
        parsedApiBase.username ||
        parsedApiBase.password
    ) {
        throw new Error(
            "Fata API base URL must use HTTPS and contain no credentials, query, or fragment",
        );
    }

    let token = await getTechnicalToken();

    const executeRequest = async (currentToken) => {
        return fetch(`${apiBase}/v1/action-completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${currentToken}`,
                "Content-Type": "application/json",
                "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    };

    let response = await executeRequest(token);

    // Contract rule: 401 -> invalidate token -> refresh -> retry ONCE immediately
    if (response.status === 401) {
        console.warn(
            "[Fata API] HTTP 401. Refreshing the technical token and retrying once.",
        );
        invalidateTechnicalToken();
        token = await getTechnicalToken();
        response = await executeRequest(token);
    }

    return response;
}

module.exports = {
    getTechnicalToken,
    invalidateTechnicalToken,
    normalizeFataOccurredAt,
    sendActionCompletion,
};
