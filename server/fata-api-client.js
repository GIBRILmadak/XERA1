const { getConfig } = require("./oauth-configs");
const { resolveChallengeConfig } = require("./fata-contract");

let cachedToken = null;
let tokenExpiresAt = 0;
let tokenRequest = null;

const REQUEST_TIMEOUT_MS = Math.max(
    1000,
    Number(process.env.FATA_API_TIMEOUT_MS) || 10000,
);

function encodeOAuthClientValue(value) {
    return new URLSearchParams({ value: String(value) })
        .toString()
        .slice("value=".length);
}

function buildClientAuthorization(clientId, clientSecret) {
    const credentials = `${encodeOAuthClientValue(clientId)}:${encodeOAuthClientValue(clientSecret)}`;
    return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

function invalidateTechnicalToken() {
    cachedToken = null;
    tokenExpiresAt = 0;
    tokenRequest = null;
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

    const params = new URLSearchParams({
        grant_type: "client_credentials",
        scope: "action-completions:write",
    });

    const response = await fetch(config.tokenUrl, {
        method: "POST",
        headers: {
            Authorization: buildClientAuthorization(
                config.clientId,
                config.clientSecret,
            ),
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        },
        body: params.toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
        // The provider's error body is untrusted and may echo submitted
        // credentials. Log only its status, never the response body.
        console.error("[Fata API] Token request error:", response.status);
        throw new Error(
            `Failed to get Fata technical token: HTTP ${response.status}`,
        );
    }

    const data = await response.json();
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
    if (
        !payload.occurredAt ||
        !String(payload.occurredAt).endsWith("Z") ||
        !Number.isFinite(Date.parse(payload.occurredAt))
    ) {
        throw new Error("Fata occurredAt must be an RFC3339 UTC timestamp");
    }
    if (!idempotencyKey || !String(idempotencyKey).trim()) {
        throw new Error("Fata Idempotency-Key is required");
    }

    const body = {
        subject: payload.subject,
        challengeId: payload.challengeId,
        requirementId: payload.requirementId,
        occurredAt: payload.occurredAt,
    };

    const apiBase = String(
        config.apiBase || process.env.FATA_API_BASE_URL || "https://fata.app/api",
    ).replace(/\/$/, "");

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
    sendActionCompletion,
    buildClientAuthorization,
};
