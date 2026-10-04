const test = require("node:test");
const assert = require("node:assert/strict");

// Set test environment variables BEFORE requiring server modules
process.env.FATA_CLIENT_ID = "xera1-26f84726";
process.env.FATA_CLIENT_SECRET = "test_secret_123";
process.env.FATA_OIDC_ISSUER = "https://fata.app/oidc";
process.env.FATA_API_BASE_URL = "https://fata.app/api";
process.env.FATA_OIDC_AUTH_URL = "https://fata.app/oidc/authorize";
process.env.FATA_OIDC_TOKEN_URL = "https://fata.app/oidc/token";
process.env.FATA_OIDC_JWKS_URL = "https://fata.app/oidc/jwks";
process.env.FATA_TEST_CHALLENGE_ID = "xera1-test";
process.env.FATA_REAL_CHALLENGE_ID = "xera1-real";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test_key";

const { getConfig } = require("../server/oauth-configs");
const {
    getFataChallengeConfig,
    resolveChallengeConfig,
    buildIdempotencyKey,
    isTestChallenge,
    resolveVisibilityMultiplier,
    isRewardEligible,
} = require("../server/fata-contract");
const {
    getTechnicalToken,
    invalidateTechnicalToken,
    sendActionCompletion,
} = require("../server/fata-api-client");

test("OIDC Config verifies production authorization URL /oidc/authorize", () => {
    const config = getConfig("fata");
    assert.equal(config.authUrl, "https://fata.app/oidc/authorize");
    assert.equal(config.tokenUrl, "https://fata.app/oidc/token");
    assert.equal(config.jwksUrl, "https://fata.app/oidc/jwks");
    assert.equal(config.issuer, "https://fata.app/oidc");
    assert.equal(config.apiBase, "https://fata.app/api");
});

test("Challenge config resolves real vs test challenges correctly", () => {
    assert.equal(isTestChallenge("xera1-test"), true);
    assert.equal(isTestChallenge("xera1-real"), false);

    const testChallenge = resolveChallengeConfig("xera1-test");
    assert.equal(testChallenge.is_test, true);
    assert.equal(testChallenge.req_arc, "req_arc");

    const realChallenge = resolveChallengeConfig("xera1-real");
    assert.equal(realChallenge.is_test, false);
});

test("Reward eligibility blocks test challenges from real rewards", () => {
    const qual = {
        user_id: "user-1",
        fata_sub: "sub-1",
        visibility_boost_active: true,
        visibility_multiplier: 5.0,
    };

    assert.equal(isRewardEligible("xera1-test", qual), false);
    assert.equal(isRewardEligible("xera1-real", qual), true);
    assert.equal(resolveVisibilityMultiplier(qual), 5.0);
});

test("Idempotency key generation is deterministic and sha256 stable", () => {
    const key1 = buildIdempotencyKey("u1", "xera1-test", "req_arc", "2026-09-24T12:00:00Z");
    const key2 = buildIdempotencyKey("u1", "xera1-test", "req_arc", "2026-09-24T12:00:00Z");
    const key3 = buildIdempotencyKey("u1", "xera1-test", "req_arc", "2026-09-24T12:00:01Z");

    assert.equal(key1, key2);
    assert.notEqual(key1, key3);
    assert.equal(key1.length, 64);
});

test("Fata API client handles 401 token invalidation and single retry", async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;
    let tokenRequestOptions = null;

    globalThis.fetch = async (url, options) => {
        callCount++;
        const urlStr = String(url || "");

        if (urlStr.includes("/oidc/token")) {
            tokenRequestOptions = options;
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    access_token: `mock_token_${callCount}`,
                    expires_in: 3600,
                }),
            };
        }

        if (urlStr.includes("/v1/action-completions")) {
            // First completion attempt returns 401, second attempt succeeds with 200
            if (callCount === 2) {
                return {
                    ok: false,
                    status: 401,
                    text: async () => "Unauthorized",
                    json: async () => ({ message: "Unauthorized" }),
                    headers: new Map(),
                };
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    eventId: "evt_12345",
                    requestId: "req_67890",
                }),
                headers: new Map([["x-request-id", "req_67890"]]),
            };
        }

        return originalFetch(url, options);
    };

    try {
        invalidateTechnicalToken();
        const payload = {
            subject: "fata_sub_test",
            challengeId: "xera1-test",
            requirementId: "req_arc",
            occurredAt: "2026-09-24T12:00:00Z",
        };

        const res = await sendActionCompletion(payload, "test_idempotency_key_123");
        assert.equal(res.ok, true);
        assert.equal(res.status, 200);
        assert.match(tokenRequestOptions.headers.Authorization, /^Basic /);
        assert.equal(
            new URLSearchParams(tokenRequestOptions.body).get("scope"),
            "action-completions:write",
        );
        assert.equal(
            new URLSearchParams(tokenRequestOptions.body).has("client_secret"),
            false,
        );

        const data = await res.json();
        assert.equal(data.eventId, "evt_12345");
        assert.equal(data.requestId, "req_67890");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("Fata API client rejects a requirement that does not belong to the challenge", async () => {
    await assert.rejects(
        sendActionCompletion(
            {
                subject: "sub-1",
                challengeId: "xera1-test",
                requirementId: "arbitrary_requirement",
                occurredAt: "2026-09-24T12:00:00Z",
            },
            "event-key",
        ),
        /Invalid Fata action completion payload/,
    );
});
