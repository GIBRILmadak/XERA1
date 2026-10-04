const crypto = require("crypto");

function normalizeText(value) {
    return String(value ?? "").trim();
}

function getFataChallengeConfig() {
    const config = {
        realChallengeId: normalizeText(process.env.FATA_REAL_CHALLENGE_ID),
        testChallengeId: normalizeText(
            process.env.FATA_TEST_CHALLENGE_ID || "xera1-test",
        ),
        req_arc: normalizeText(process.env.FATA_REQ_ARC || "req_arc"),
        req_preuve: normalizeText(process.env.FATA_REQ_PREUVE || "req_preuve"),
        req_jalon: normalizeText(process.env.FATA_REQ_JALON || "req_jalon"),
    };

    return config;
}

function getConfiguredChallengeEntries() {
    const config = getFataChallengeConfig();
    const entries = [];

    if (config.realChallengeId) {
        entries.push({
            id: config.realChallengeId,
            is_test: false,
            req_arc: config.req_arc,
            req_preuve: config.req_preuve,
            req_jalon: config.req_jalon,
        });
    }

    if (config.testChallengeId) {
        entries.push({
            id: config.testChallengeId,
            is_test: true,
            req_arc: config.req_arc,
            req_preuve: config.req_preuve,
            req_jalon: config.req_jalon,
        });
    }

    return entries;
}

function resolveChallengeConfig(challengeId) {
    const normalized = normalizeText(challengeId);
    if (!normalized) {
        throw new Error("Invalid Fata challengeId: missing challengeId");
    }

    const challenge = getConfiguredChallengeEntries().find(
        (entry) => entry.id === normalized,
    );
    if (!challenge) {
        throw new Error(`Invalid Fata challengeId: ${normalized}`);
    }

    return challenge;
}

function isTestChallenge(challengeId) {
    try {
        return Boolean(resolveChallengeConfig(challengeId)?.is_test);
    } catch (error) {
        return false;
    }
}

function resolveVisibilityMultiplier(qualification = {}) {
    const active = Boolean(qualification.visibility_boost_active);
    if (!active) {
        return 1.0;
    }

    const rawValue = Number(qualification.visibility_multiplier ?? 1.0);
    if (!Number.isFinite(rawValue) || rawValue <= 1) {
        return 1.0;
    }

    return Math.min(5.0, rawValue);
}

function isRewardEligible(challengeId, qualification = {}) {
    const challenge = (() => {
        try {
            return resolveChallengeConfig(challengeId);
        } catch (error) {
            return null;
        }
    })();

    if (!challenge || challenge.is_test || isTestChallenge(challengeId)) {
        return false;
    }

    if (!qualification || typeof qualification !== "object") {
        return false;
    }

    const hasIdentity =
        Boolean(qualification.user_id) && Boolean(qualification.fata_sub);
    if (!hasIdentity) {
        return false;
    }

    const activeBoost =
        Boolean(qualification.visibility_boost_active) ||
        Boolean(qualification.badge_awarded);
    if (!activeBoost) {
        return false;
    }

    return resolveVisibilityMultiplier(qualification) > 1.0;
}

function buildIdempotencyKey(
    userId,
    challengeId,
    requirementId,
    occurredAt,
    eventKey = "",
) {
    // Prefer the durable source event identity. Its timestamp can be corrected
    // or normalized without turning a retry into a new Fata completion.
    const identity = normalizeText(eventKey) || normalizeText(occurredAt);
    const raw = [
        normalizeText(userId),
        normalizeText(challengeId),
        normalizeText(requirementId),
        identity,
    ].join("|");

    return crypto.createHash("sha256").update(raw).digest("hex");
}

module.exports = {
    getFataChallengeConfig,
    getConfiguredChallengeEntries,
    resolveChallengeConfig,
    isTestChallenge,
    resolveVisibilityMultiplier,
    isRewardEligible,
    buildIdempotencyKey,
};
