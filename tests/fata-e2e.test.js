const test = require("node:test");
const assert = require("node:assert/strict");

// Set test environment variables BEFORE requiring server modules
process.env.FATA_CLIENT_ID = "xera1-test-client";
process.env.FATA_CLIENT_SECRET = "test_secret_123";
process.env.FATA_OIDC_ISSUER = "https://fata.app/oidc";
process.env.FATA_API_BASE_URL = "https://fata.app/api";
process.env.FATA_REQ_ARC = "req_arc";
process.env.FATA_REQ_PREUVE = "req_preuve";
process.env.FATA_REQ_JALON = "req_jalon";
process.env.FATA_TEST_CHALLENGE_ID = "xera1-test";
process.env.FATA_REAL_CHALLENGE_ID = "xera1-real";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test_key";

const { getConfig } = require("../server/oauth-configs");
const { validateFataRedirectUri } = require("../server/fata-redirect-uri");
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

test("OIDC config uses the configured issuer discovery and no proposal endpoint overrides", () => {
    const config = getConfig("fata");
    assert.equal(config.issuer, "https://fata.app/oidc");
    assert.equal(
        config.discoveryUrl,
        "https://fata.app/oidc/.well-known/openid-configuration",
    );
    assert.equal(config.apiBase, "https://fata.app/api");
});

test("Fata callback accepts its registered static query but rejects OAuth collisions", () => {
    assert.deepEqual(
        validateFataRedirectUri(
            "https://xera1.xyz/api/auth/fata/callback?challengeId=xera1-test",
        ),
        { valid: true },
    );
    assert.deepEqual(
        validateFataRedirectUri(
            "https://xera1.xyz/api/auth/fata/callback?state=untrusted",
        ),
        { valid: false, reason: "reserved_oidc_parameter" },
    );
    assert.deepEqual(
        validateFataRedirectUri(
            "https://xera1.xyz/profile?challengeId=xera1-test",
        ),
        { valid: false, reason: "callback_path_required" },
    );
    assert.deepEqual(
        validateFataRedirectUri("http://xera1.xyz/api/auth/fata/callback"),
        { valid: false, reason: "https_required" },
    );
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
    let tokenRequestCount = 0;
    let apiRequestCount = 0;
    const originalFetch = globalThis.fetch;
    let tokenRequestOptions = null;

    globalThis.fetch = async (url, options) => {
        const urlStr = String(url || "");

        if (urlStr.includes("/.well-known/openid-configuration")) {
            return new Response(JSON.stringify({
                issuer: "https://fata.app/oidc",
                authorization_endpoint: "https://fata.app/oidc/authorize",
                token_endpoint: "https://fata.app/oidc/token",
                jwks_uri: "https://fata.app/oidc/jwks",
                response_types_supported: ["code"],
                code_challenge_methods_supported: ["S256"],
                token_endpoint_auth_methods_supported: ["client_secret_basic"],
            }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }

        if (urlStr.includes("/oidc/token")) {
            tokenRequestCount++;
            tokenRequestOptions = options;
            return new Response(JSON.stringify({
                access_token: `mock_token_${tokenRequestCount}`,
                token_type: "Bearer",
                expires_in: 3600,
            }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }

        if (urlStr.includes("/v1/action-completions")) {
            apiRequestCount++;
            // First completion attempt returns 401, second attempt succeeds with 200
            if (apiRequestCount === 1) {
                return new Response(JSON.stringify({ message: "Unauthorized" }), {
                    status: 401,
                    headers: { "content-type": "application/json" },
                });
            }
            return new Response(JSON.stringify({
                eventId: "evt_12345",
                requestId: "req_67890",
                status: "recorded",
            }), {
                status: 200,
                headers: {
                    "content-type": "application/json",
                    "x-request-id": "req_67890",
                },
            });
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
        assert.match(new Headers(tokenRequestOptions.headers).get("authorization"), /^Basic /);
        assert.equal(
            new URLSearchParams(tokenRequestOptions.body).get("scope"),
            "action-completions:write",
        );
        assert.equal(
            new URLSearchParams(tokenRequestOptions.body).has("client_secret"),
            false,
        );
        assert.equal(tokenRequestCount, 2);
        assert.equal(apiRequestCount, 2);

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
