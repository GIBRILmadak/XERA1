const { test, describe } = require("node:test");
const assert = require("node:assert");

const {
    getFataChallengeConfig,
    getConfiguredChallengeEntries,
    resolveChallengeConfig,
    isTestChallenge,
    resolveVisibilityMultiplier,
    isRewardEligible,
    buildIdempotencyKey,
} = require("../server/fata-contract");

const {
    invalidateTechnicalToken,
} = require("../server/fata-api-client");

describe("Fata × XERA1 Contract & Logic Unit Tests", () => {
    test("The documented test challenge is enabled by default", () => {
        const previous = process.env.FATA_TEST_CHALLENGE_ID;
        delete process.env.FATA_TEST_CHALLENGE_ID;
        try {
            const challenge = resolveChallengeConfig("xera1-test");
            assert.strictEqual(challenge.id, "xera1-test");
            assert.strictEqual(challenge.is_test, true);
            assert.strictEqual(challenge.req_arc, "req_arc");
            assert.strictEqual(challenge.req_preuve, "req_preuve");
            assert.strictEqual(challenge.req_jalon, "req_jalon");
        } finally {
            if (previous === undefined) delete process.env.FATA_TEST_CHALLENGE_ID;
            else process.env.FATA_TEST_CHALLENGE_ID = previous;
        }
    });

    test("Fata Challenge Config Resolution", () => {
        // Set test env var
        process.env.FATA_TEST_CHALLENGE_ID = "xera1-test";
        process.env.FATA_REAL_CHALLENGE_ID = "xera1-real-prod";

        const config = getFataChallengeConfig();
        assert.strictEqual(config.testChallengeId, "xera1-test");
        assert.strictEqual(config.realChallengeId, "xera1-real-prod");

        const testEntry = resolveChallengeConfig("xera1-test");
        assert.strictEqual(testEntry.id, "xera1-test");
        assert.strictEqual(testEntry.is_test, true);

        const realEntry = resolveChallengeConfig("xera1-real-prod");
        assert.strictEqual(realEntry.id, "xera1-real-prod");
        assert.strictEqual(realEntry.is_test, false);

        assert.throws(() => {
            resolveChallengeConfig("unknown-challenge-id");
        }, /Invalid Fata challengeId/);
    });

    test("Test Challenge Reward Protection Guard", () => {
        process.env.FATA_TEST_CHALLENGE_ID = "xera1-test";
        process.env.FATA_REAL_CHALLENGE_ID = "xera1-real-prod";

        // Test challenge MUST NOT be eligible for real rewards
        assert.strictEqual(isTestChallenge("xera1-test"), true);
        assert.strictEqual(
            isRewardEligible("xera1-test", {
                user_id: "usr-123",
                fata_sub: "sub-123",
                visibility_boost_active: true,
                visibility_multiplier: 5.0,
            }),
            false,
        );

        // Real challenge WITH active boost IS eligible
        assert.strictEqual(isTestChallenge("xera1-real-prod"), false);
        assert.strictEqual(
            isRewardEligible("xera1-real-prod", {
                user_id: "usr-123",
                fata_sub: "sub-123",
                visibility_boost_active: true,
                visibility_multiplier: 5.0,
            }),
            true,
        );

        // Real challenge WITHOUT active boost is NOT eligible
        assert.strictEqual(
            isRewardEligible("xera1-real-prod", {
                user_id: "usr-123",
                fata_sub: "sub-123",
                visibility_boost_active: false,
                visibility_multiplier: 1.0,
            }),
            false,
        );
    });

    test("Visibility Multiplier Calculation (Capped at 5.0)", () => {
        assert.strictEqual(
            resolveVisibilityMultiplier({ visibility_boost_active: false }),
            1.0,
        );
        assert.strictEqual(
            resolveVisibilityMultiplier({
                visibility_boost_active: true,
                visibility_multiplier: 2.5,
            }),
            2.5,
        );
        // Capped at 5.0
        assert.strictEqual(
            resolveVisibilityMultiplier({
                visibility_boost_active: true,
                visibility_multiplier: 10.0,
            }),
            5.0,
        );
    });

    test("Idempotency Key Determinism & Stability", () => {
        const key1 = buildIdempotencyKey(
            "user-1",
            "xera1-test",
            "req_arc",
            "2026-09-24T12:00:00.000Z",
        );
        const key2 = buildIdempotencyKey(
            "user-1",
            "xera1-test",
            "req_arc",
            "2026-09-24T12:00:00.000Z",
        );
        const key3 = buildIdempotencyKey(
            "user-1",
            "xera1-test",
            "req_preuve",
            "2026-09-24T12:00:00.000Z",
        );

        assert.strictEqual(key1, key2);
        assert.notStrictEqual(key1, key3);
        assert.strictEqual(typeof key1, "string");
        assert.strictEqual(key1.length, 64); // SHA256 hex
    });

    test("Technical Token Invalidation", () => {
        // Test that invalidateTechnicalToken resets cached token state without throwing
        assert.doesNotThrow(() => {
            invalidateTechnicalToken();
        });
    });
});
