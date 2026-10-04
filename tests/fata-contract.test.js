const test = require("node:test");
const assert = require("node:assert/strict");

const {
    getFataChallengeConfig,
    resolveChallengeConfig,
    buildIdempotencyKey,
    isRewardEligible,
    resolveVisibilityMultiplier,
} = require("../server/fata-contract");

test("real and test challenge IDs are recognized from environment config", () => {
    process.env.FATA_REAL_CHALLENGE_ID = "challenge_real_123";
    process.env.FATA_TEST_CHALLENGE_ID = "challenge_test_456";
    process.env.FATA_REQ_ARC = "req_arc";
    process.env.FATA_REQ_PREUVE = "req_preuve";
    process.env.FATA_REQ_JALON = "req_jalon";

    const real = resolveChallengeConfig("challenge_real_123");
    const testChallenge = resolveChallengeConfig("challenge_test_456");

    assert.ok(real);
    assert.equal(real.is_test, false);
    assert.ok(testChallenge);
    assert.equal(testChallenge.is_test, true);
});

test("unknown challenge IDs are rejected", () => {
    process.env.FATA_REAL_CHALLENGE_ID = "challenge_real_123";
    process.env.FATA_TEST_CHALLENGE_ID = "challenge_test_456";

    assert.throws(
        () => resolveChallengeConfig("challenge_unknown"),
        /Invalid Fata challengeId/i,
    );
});

test("idempotency keys are stable for the same tuple and differ for a changed payload", () => {
    const keyA = buildIdempotencyKey(
        "user-1",
        "challenge_real_123",
        "req_arc",
        "2026-09-19T10:00:00Z",
    );
    const keyB = buildIdempotencyKey(
        "user-1",
        "challenge_real_123",
        "req_arc",
        "2026-09-19T10:00:00Z",
    );
    const keyC = buildIdempotencyKey(
        "user-1",
        "challenge_real_123",
        "req_arc",
        "2026-09-19T10:05:00Z",
    );

    assert.equal(keyA, keyB);
    assert.notEqual(keyA, keyC);
});

test("event idempotency survives timestamp normalization and distinguishes source events", () => {
    const keyA = buildIdempotencyKey(
        "user-1",
        "challenge_real_123",
        "req_arc",
        "2026-09-19T10:00:00Z",
        "arc-1",
    );
    const sameEventAfterNormalization = buildIdempotencyKey(
        "user-1",
        "challenge_real_123",
        "req_arc",
        "2026-09-19T10:00:01Z",
        "arc-1",
    );
    const differentEvent = buildIdempotencyKey(
        "user-1",
        "challenge_real_123",
        "req_arc",
        "2026-09-19T10:00:00Z",
        "arc-2",
    );

    assert.equal(keyA, sameEventAfterNormalization);
    assert.notEqual(keyA, differentEvent);
});

test("config exposes the contract requirement IDs", () => {
    process.env.FATA_REQ_ARC = "req_arc";
    process.env.FATA_REQ_PREUVE = "req_preuve";
    process.env.FATA_REQ_JALON = "req_jalon";

    const config = getFataChallengeConfig();

    assert.equal(config.req_arc, "req_arc");
    assert.equal(config.req_preuve, "req_preuve");
    assert.equal(config.req_jalon, "req_jalon");
});

test("real challenge qualification is eligible but test challenge is blocked", () => {
    process.env.FATA_REAL_CHALLENGE_ID = "challenge_real_123";
    process.env.FATA_TEST_CHALLENGE_ID = "challenge_test_456";

    const eligible = isRewardEligible("challenge_real_123", {
        user_id: "user-1",
        fata_sub: "sub-123",
        visibility_boost_active: true,
        visibility_multiplier: 5.0,
    });

    const blocked = isRewardEligible("challenge_test_456", {
        user_id: "user-1",
        fata_sub: "sub-123",
        visibility_boost_active: true,
        visibility_multiplier: 5.0,
    });

    assert.equal(eligible, true);
    assert.equal(blocked, false);
});

test("visibility multiplier is capped at 5x for active real qualification", () => {
    const multiplier = resolveVisibilityMultiplier({
        visibility_boost_active: true,
        visibility_multiplier: 12,
    });

    assert.equal(multiplier, 5.0);
    assert.equal(
        resolveVisibilityMultiplier({ visibility_boost_active: false }),
        1.0,
    );
});
