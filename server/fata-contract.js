const crypto = require("crypto");

function normalizeText(value) {
    return String(value ?? "").trim();
}

function getFataChallengeConfig() {
    const config = {
        realChallengeId: normalizeText(process.env.FATA_REAL_CHALLENGE_ID),
        testChallengeId: normalizeText(process.env.FATA_TEST_CHALLENGE_ID),
        req_arc: normalizeText(process.env.FATA_REQ_ARC),
        req_preuve: normalizeText(process.env.FATA_REQ_PREUVE),
        req_jalon: normalizeText(process.env.FATA_REQ_JALON),
    };

    return config;
}

function areFataRequirementIdsConfigured() {
    const config = getFataChallengeConfig();
    return Boolean(config.req_arc && config.req_preuve && config.req_jalon);
}

function getConfiguredChallengeEntries() {
    const config = getFataChallengeConfig();
    const entries = [];
    const hasRequirementIds = Boolean(
        config.req_arc && config.req_preuve && config.req_jalon,
    );

    if (config.realChallengeId && hasRequirementIds) {
        entries.push({
            id: config.realChallengeId,
            is_test: false,
            req_arc: config.req_arc,
            req_preuve: config.req_preuve,
            req_jalon: config.req_jalon,
        });
    }

    if (config.testChallengeId && hasRequirementIds) {
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
    if (!areFataRequirementIdsConfigured()) {
        throw new Error("Fata challenge requirement IDs are not configured");
    }

    const challenge = getConfiguredChallengeEntries().find(
        (entry) => entry.id === normalized,
    );
    if (!challenge) {
        throw new Error(`Invalid Fata challengeId: ${normalized}`);
    }

    return challenge;
}

function resolveChallengeConfigOrRealDefault(challengeId) {
    const requestedId = normalizeText(challengeId);
    const realChallengeId = getFataChallengeConfig().realChallengeId;
    return resolveChallengeConfig(requestedId || realChallengeId);
}

function countArcMilestones(arc) {
    const milestones = Array.isArray(arc?.milestones) ? arc.milestones : [];
    return milestones.filter((milestone) => {
        if (typeof milestone === "string") return Boolean(milestone.trim());
        return Boolean(String(milestone?.title || "").trim());
    }).length;
}

function getChallengeSelection(linkage, challengeId) {
    const selections = linkage?.metadata?.challenge_selections;
    if (!selections || typeof selections !== "object" || Array.isArray(selections)) {
        return null;
    }
    const selection = selections[normalizeText(challengeId)];
    if (!selection || typeof selection !== "object") return null;
    if (!normalizeText(selection.arc_id) || !normalizeText(selection.selected_at)) {
        return null;
    }
    return selection;
}

function challengeRequirementIdsMatch(challengeId, row = {}) {
    try {
        const expected = resolveChallengeConfig(challengeId);
        return (
            row.req_arc === expected.req_arc &&
            row.req_preuve === expected.req_preuve &&
            row.req_jalon === expected.req_jalon
        );
    } catch (_) {
        return false;
    }
}

function hasValidChallengeWindow(row = {}) {
    const opensAt = Date.parse(row.opens_at || "");
    const closesAt = Date.parse(row.close_at || "");
    const receiptDeadlineAt = Date.parse(row.receipt_deadline_at || "");
    return (
        Number.isFinite(opensAt) &&
        Number.isFinite(closesAt) &&
        Number.isFinite(receiptDeadlineAt) &&
        opensAt <= closesAt &&
        closesAt <= receiptDeadlineAt
    );
}

function isArcFataEligible(arc, userId) {
    if (!arc || arc.user_id !== userId || arc.page_id) return false;
    if (!normalizeText(arc.title) || !normalizeText(arc.description)) return false;
    if (["draft", "deleted", "private"].includes(normalizeText(arc.status).toLowerCase())) {
        return false;
    }
    return countArcMilestones(arc) >= 3;
}

function getArcPresentationOccurredAt(arc, linkage, selection, challenge) {
    const arcCreatedAt = Date.parse(arc?.created_at || "");
    const linkedAt = Date.parse(linkage?.created_at || "");
    const selectedAt = Date.parse(selection?.selected_at || "");
    const opensAt = Date.parse(challenge?.opens_at || "");
    const closesAt = Date.parse(challenge?.close_at || "");
    if (
        Number.isFinite(arcCreatedAt) &&
        Number.isFinite(linkedAt) &&
        Number.isFinite(selectedAt) &&
        Number.isFinite(opensAt) &&
        Number.isFinite(closesAt) &&
        arcCreatedAt >= linkedAt &&
        arcCreatedAt >= selectedAt &&
        arcCreatedAt >= opensAt &&
        arcCreatedAt <= closesAt
    ) {
        return arc.created_at;
    }
    return selection?.selected_at || null;
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

function isFataCelebrationPending(qualification = {}) {
    return Boolean(
        isRewardEligible(qualification.challenge_id, qualification) &&
            qualification.badge_awarded &&
            qualification.visibility_boost_active &&
            Number(qualification.visibility_multiplier) >= 5 &&
            !qualification.celebration_seen_at &&
            qualification.metadata?.is_test !== true,
    );
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
    areFataRequirementIdsConfigured,
    getConfiguredChallengeEntries,
    resolveChallengeConfig,
    resolveChallengeConfigOrRealDefault,
    countArcMilestones,
    getChallengeSelection,
    challengeRequirementIdsMatch,
    hasValidChallengeWindow,
    isArcFataEligible,
    getArcPresentationOccurredAt,
    isTestChallenge,
    resolveVisibilityMultiplier,
    isRewardEligible,
    isFataCelebrationPending,
    buildIdempotencyKey,
};
