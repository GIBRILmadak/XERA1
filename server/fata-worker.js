const { sendActionCompletion } = require("./fata-api-client");
const { createSupabaseServiceClient } = require("./supabase-service-client");
const logger = require("./logger");
const {
    resolveChallengeConfig,
    buildIdempotencyKey,
    isTestChallenge,
    isArcFataEligible,
    challengeRequirementIdsMatch,
    hasValidChallengeWindow,
    getArcPresentationOccurredAt,
} = require("./fata-contract");
const { getConfig } = require("./oauth-configs");

const RETRY_INTERVALS = [
    1 * 60 * 1000,
    5 * 60 * 1000,
    30 * 60 * 1000,
    2 * 60 * 60 * 1000,
    6 * 60 * 60 * 1000,
];
const OUTBOX_BATCH_SIZE = Math.max(
    1,
    Math.min(5, Number(process.env.FATA_WORKER_BATCH_SIZE) || 4),
);
const ACTIVITY_LOG_BATCH_SIZE = Math.max(
    1,
    Math.min(50, Number(process.env.FATA_ACTIVITY_LOG_BATCH_SIZE) || 25),
);

function decideFataDeliveryStatus(status, payload = {}) {
    if (status >= 200 && status < 300) {
        return { outcome: "delivered" };
    }
    if (status === 401) {
        return { outcome: "refresh" };
    }
    if (status === 403) {
        return {
            outcome: "stop",
            flag: payload?.code === "link_revoked" ? "link_revoked" : "authorization",
        };
    }
    if (status === 409) {
        return {
            outcome: "stop",
            flag: payload?.code === "idempotency_conflict" ? "idempotency_conflict" : "idempotency_conflict",
        };
    }
    if (status === 422) {
        const code = String(payload?.code || "");
        if (code === "not_registered") return { outcome: "stop", flag: "not_registered" };
        if (code === "outside_window") return { outcome: "stop", flag: "outside_window" };
        if (code === "receipt_deadline_passed") return { outcome: "stop", flag: "receipt_deadline_passed" };
        return { outcome: "stop", flag: "rejected" };
    }
    if (status === 429 || status >= 500) {
        return { outcome: "retry" };
    }
    if (status >= 400) {
        return { outcome: "stop", flag: "request" };
    }
    return { outcome: "retry" };
}

const supabase = createSupabaseServiceClient();

async function markAlertIfFailure(event, errorMessage, force = false) {
    const hoursSinceCreated =
        (Date.now() - new Date(event.created_at || Date.now()).getTime()) /
        (60 * 60 * 1000);

    if (force || hoursSinceCreated >= 24) {
        try {
            await supabase.from("fata_alerts").upsert(
                {
                    event_id: event.id,
                    type: "fata_action_retry_failure",
                    severity: "high",
                    message: errorMessage || "Fata action retry failed for 24h",
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "event_id" },
            );
        } catch (alertError) {
            console.warn(
                "[Fata Worker] Alert creation error:",
                alertError.message,
            );
        }
    }
}

async function processActivityLog() {
    logger.debug("[Fata Worker] Scanning activity log...");

    await reconcileSelectedArcs();

    const { data: logs, error: logError } = await supabase
        .from("fata_activity_log")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(ACTIVITY_LOG_BATCH_SIZE);

    if (logError) {
        console.error("[Fata Worker] Activity log fetch error:", logError);
        return;
    }

    if (!logs || logs.length === 0) return;

    for (const log of logs) {
        try {
            await handleLogEntry(log);
            await supabase.from("fata_activity_log").delete().eq("id", log.id);
        } catch (err) {
            console.error(`[Fata Worker] Error processing log ${log.id}:`, err);
        }
    }
}

async function handleLogEntry(log) {
    const { user_id, entity_type, entity_id } = log;
    const configuredIssuer = getConfig("fata")?.issuer;
    if (!configuredIssuer) return;

    const { data: linkage, error: linkageError } = await supabase
        .from("fata_linkages")
        .select("*")
        .eq("user_id", user_id)
        .eq("fata_iss", configuredIssuer)
        .maybeSingle();
    if (linkageError) throw linkageError;

    // Actions made before a Fata link or ARC selection cannot qualify. Drop
    // those source-log rows; the durable outbox is created before deleting any
    // eligible row, and selected ARC actions are reconciled independently.
    if (!linkage || entity_type === "arcs") return;

    const selections = Object.entries(
        linkage.metadata?.challenge_selections || {},
    ).filter(([, selection]) => selection?.arc_id && selection?.selected_at);
    if (!selections.length) return;

    if (entity_type === "content") {
        const { data: content, error: contentError } = await supabase
            .from("content")
            .select("id,user_id,arc_id,media_url,media_urls,description,created_at,is_deleted")
            .eq("id", entity_id)
            .maybeSingle();
        if (contentError) throw contentError;
        if (!content || content.user_id !== user_id) return;
        for (const [challengeId, selection] of selections) {
            if (String(selection.arc_id) !== String(content.arc_id)) continue;
            const config = await getActiveChallengeConfig(challengeId);
            if (!config || !isEligibleActionTime(content.created_at, linkage, selection, config)) continue;
            if (content.is_deleted || !hasPublishedMedia(content)) continue;
            if (!String(content.description || "").trim()) continue;
            await queueEvent(
                user_id,
                linkage.fata_sub,
                challengeId,
                config.req_preuve,
                content.created_at,
                `preuve-${content.id}`,
            );
        }
    } else if (entity_type === "arc_milestone_validations") {
        await evaluateAction3(user_id, entity_id, linkage, selections);
    }
}

function isEligibleActionTime(occurredAt, linkage, selection, config) {
    const occurredMs = Date.parse(occurredAt || "");
    const linkedMs = Date.parse(linkage.created_at || "");
    const opensAt = Date.parse(config.opens_at || "");
    const closesAt = Date.parse(config.close_at || "");
    if (![occurredMs, linkedMs, opensAt, closesAt].every(Number.isFinite)) return false;
    if (occurredMs < linkedMs) return false;
    if (occurredMs < opensAt || occurredMs > closesAt) return false;
    return true;
}

function hasPublishedMedia(content) {
    if (String(content?.media_url || "").trim()) return true;
    return Array.isArray(content?.media_urls) &&
        content.media_urls.some((url) => String(url || "").trim());
}

async function getActiveChallengeConfig(challengeId) {
    try {
        resolveChallengeConfig(challengeId);
    } catch (error) {
        console.warn("[Fata Worker] Ignoring unknown challenge:", challengeId);
        return null;
    }
    const { data: config, error } = await supabase
        .from("fata_challenges_config")
        .select("id,req_arc,req_preuve,req_jalon,is_active,opens_at,close_at,receipt_deadline_at")
        .eq("id", challengeId)
        .maybeSingle();
    if (error) throw error;
    if (!config?.is_active) return null;
    if (!hasValidChallengeWindow(config)) {
        console.error("[Fata Worker] Challenge dates are missing or invalid:", challengeId);
        return null;
    }
    if (!challengeRequirementIdsMatch(challengeId, config)) {
        console.error("[Fata Worker] Challenge step IDs do not match the Fata contract:", challengeId);
        return null;
    }
    return config;
}

async function reconcileSelectedArcs() {
    const { data: linkages, error } = await supabase
        .from("fata_linkages")
        .select("user_id,fata_iss,fata_sub,created_at,metadata")
        .limit(1000);
    if (error) {
        console.error("[Fata Worker] Linkage scan error:", error);
        return;
    }

    const configuredIssuer = getConfig("fata")?.issuer;
    for (const linkage of linkages || []) {
        if (linkage.fata_iss !== configuredIssuer) continue;
        const selections = Object.entries(
            linkage.metadata?.challenge_selections || {},
        ).filter(([, selection]) => selection?.arc_id && selection?.selected_at);
        for (const [challengeId, selection] of selections) {
            const config = await getActiveChallengeConfig(challengeId);
            if (!config || !isEligibleActionTime(selection.selected_at, linkage, selection, config)) continue;
            const { data: arc, error: arcError } = await supabase
                .from("arcs")
                .select("id,user_id,page_id,title,description,status,milestones,created_at")
                .eq("id", selection.arc_id)
                .maybeSingle();
            if (arcError) throw arcError;
            if (!isArcFataEligible(arc, linkage.user_id)) continue;
            await queueEvent(
                linkage.user_id,
                linkage.fata_sub,
                challengeId,
                config.req_arc,
                getArcPresentationOccurredAt(arc, linkage, selection, config),
                `selection-${challengeId}-${selection.arc_id}`,
            );

            // Reconcile the earliest admissible proof and the earliest owner
            // milestone report even if their source-log rows were already
            // consumed before the user selected this ARC.
            const { data: proofs, error: proofsError } = await supabase
                .from("content")
                .select("id,user_id,arc_id,media_url,media_urls,description,created_at,is_deleted")
                .eq("user_id", linkage.user_id)
                .eq("arc_id", selection.arc_id)
                .or("is_deleted.is.null,is_deleted.eq.false")
                .order("created_at", { ascending: true })
                .limit(100);
            if (proofsError) throw proofsError;
            for (const proof of proofs || []) {
                if (!hasPublishedMedia(proof)) continue;
                if (!String(proof.description || "").trim()) continue;
                if (!isEligibleActionTime(proof.created_at, linkage, selection, config)) continue;
                await queueEvent(
                    linkage.user_id,
                    linkage.fata_sub,
                    challengeId,
                    config.req_preuve,
                    proof.created_at,
                    `preuve-${proof.id}`,
                );
                break;
            }

            const { data: validations, error: validationsError } = await supabase
                .from("arc_milestone_validations")
                .select("id,arc_id,content_id,validator_user_id,comment,created_at")
                .eq("arc_id", selection.arc_id)
                .eq("validator_user_id", linkage.user_id)
                .not("comment", "is", null)
                .order("created_at", { ascending: true })
                .limit(100);
            if (validationsError) throw validationsError;
            for (const validation of validations || []) {
                if (!String(validation.comment || "").trim()) continue;
                if (!isEligibleActionTime(validation.created_at, linkage, selection, config)) continue;
                const { data: proof, error: proofError } = await supabase
                    .from("content")
                    .select("id,user_id,arc_id,media_url,media_urls,description,created_at,is_deleted")
                    .eq("id", validation.content_id)
                    .maybeSingle();
                if (proofError) throw proofError;
                if (!proof || proof.user_id !== linkage.user_id || proof.is_deleted) continue;
                if (String(proof.arc_id) !== String(selection.arc_id)) continue;
                if (!hasPublishedMedia(proof)) continue;
                if (!String(proof.description || "").trim()) continue;
                if (!isEligibleActionTime(proof.created_at, linkage, selection, config)) continue;
                await queueEvent(
                    linkage.user_id,
                    linkage.fata_sub,
                    challengeId,
                    config.req_preuve,
                    proof.created_at,
                    `preuve-${proof.id}`,
                );
                await queueEvent(
                    linkage.user_id,
                    linkage.fata_sub,
                    challengeId,
                    config.req_jalon,
                    validation.created_at,
                    `jalon-${validation.id}`,
                );
                break;
            }
        }
    }
}

/** Action 3 is the ARC owner's published milestone report, backed by a
 * published proof on the selected ARC. The same proof may satisfy action 2.
 */
async function evaluateAction3(user_id, validation_id, linkage, selections) {
    const { data: val, error: validationError } = await supabase
        .from("arc_milestone_validations")
        .select("id,arc_id,content_id,validator_user_id,comment,created_at")
        .eq("id", validation_id)
        .maybeSingle();
    if (validationError) throw validationError;
    if (!val || val.validator_user_id !== user_id || !val.content_id) return;
    if (!String(val.comment || "").trim()) return;

    const { data: content, error: contentError } = await supabase
        .from("content")
        .select("id,user_id,arc_id,media_url,media_urls,description,created_at,is_deleted")
        .eq("id", val.content_id)
        .maybeSingle();
    if (contentError) throw contentError;
    if (!content || content.user_id !== user_id || content.is_deleted) return;
    if (!hasPublishedMedia(content)) return;
    if (!String(content.description || "").trim()) return;
    if (String(val.arc_id) !== String(content.arc_id)) return;

    for (const [challengeId, selection] of selections) {
        if (String(selection.arc_id) !== String(val.arc_id)) continue;
        const config = await getActiveChallengeConfig(challengeId);
        if (!config) continue;
        if (!isEligibleActionTime(content.created_at, linkage, selection, config)) continue;

        // Queue the proof too, with its original publication timestamp. This
        // remains idempotent if its own content activity row was already read.
        await queueEvent(
            user_id,
            linkage.fata_sub,
            challengeId,
            config.req_preuve,
            content.created_at,
            `preuve-${content.id}`,
        );
        if (!isEligibleActionTime(val.created_at, linkage, selection, config)) continue;
        await queueEvent(
            user_id,
            linkage.fata_sub,
            challengeId,
            config.req_jalon,
            val.created_at,
            `jalon-${validation_id}`,
        );
    }
}

async function queueEvent(
    user_id,
    fata_sub,
    challenge_id,
    requirement_id,
    occurred_at,
    idempotency_seed,
    database = supabase,
) {
    const safeChallengeId = String(challenge_id || "").trim();
    const safeRequirement = String(requirement_id || "").trim();
    const safeOccurredAt =
        occurred_at instanceof Date
            ? occurred_at.toISOString()
            : new Date(occurred_at).toISOString();

    const challenge = resolveChallengeConfig(safeChallengeId);
    if (
        ![challenge.req_arc, challenge.req_preuve, challenge.req_jalon].includes(
            safeRequirement,
        )
    ) {
        throw new Error("Refusing to queue an unmapped Fata requirement");
    }
    if (!String(idempotency_seed || "").trim()) {
        throw new Error("A durable source event id is required");
    }

    const idempotency_key = buildIdempotencyKey(
        user_id,
        safeChallengeId,
        safeRequirement,
        safeOccurredAt,
        idempotency_seed,
    );

    const existingQuery = database.from("fata_pending_events");
    const selectExisting = existingQuery.select
        ? existingQuery.select(
              "id,idempotency_key,challenge_id,requirement_id,occurred_at,status",
          )
        : existingQuery;

    const existingResult = 
        typeof selectExisting.eq === "function"
            ? await selectExisting.eq("idempotency_key", idempotency_key).maybeSingle()
            : { data: null, error: null };

    if (existingResult?.data) {
        const existingEvent = existingResult.data;
        const existingOccurredAtMs = Date.parse(existingEvent.occurred_at || "");
        const queuedOccurredAtMs = Date.parse(safeOccurredAt);
        const samePayload =
            String(existingEvent.challenge_id || "") === safeChallengeId &&
            String(existingEvent.requirement_id || "") === safeRequirement &&
            Number.isFinite(existingOccurredAtMs) &&
            existingOccurredAtMs === queuedOccurredAtMs;

        if (!samePayload) {
            throw new Error(
                "Fata idempotency conflict: a duplicate key was already used with a different payload",
            );
        }
    }

    const { error } = await database
        .from("fata_pending_events")
        .upsert(
            {
            user_id,
            fata_sub,
            challenge_id: safeChallengeId,
            requirement_id: safeRequirement,
            occurred_at: safeOccurredAt,
            idempotency_key,
            status: "pending",
            retry_count: 0,
            next_retry_at: null,
            },
            { onConflict: "idempotency_key", ignoreDuplicates: true },
        );

    if (error) {
        throw new Error(
            `Could not persist Fata event (${error.code || "database_error"})`,
        );
    }
}

/**
 * Process pending events and send to Fata
 */
async function processPendingEvents() {
    logger.debug("[Fata Worker] Processing pending events...");

    const now = new Date().toISOString();
    const { data: events, error } = await supabase
        .from("fata_pending_events")
        .select("*, fata_challenges_config(receipt_deadline_at)")
        .in("status", ["pending", "retry"])
        .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
        .limit(OUTBOX_BATCH_SIZE);

    if (error) {
        console.error("[Fata Worker] Pending events fetch error:", error);
        return;
    }

    for (const event of events || []) {
        const receiptDeadline = Date.parse(
            event.fata_challenges_config?.receipt_deadline_at || "",
        );
        if (!Number.isFinite(receiptDeadline)) {
            await supabase
                .from("fata_pending_events")
                .update({
                    status: "failed",
                    last_error: "Fata receipt deadline is missing from challenge configuration",
                    updated_at: new Date().toISOString(),
                    next_retry_at: null,
                })
                .eq("id", event.id);
            await markAlertIfFailure(
                event,
                "Fata receipt deadline is missing from challenge configuration",
                true,
            );
            continue;
        }
        if (Date.now() > receiptDeadline) {
            await supabase
                .from("fata_pending_events")
                .update({
                    status: "failed",
                    last_error: "Fata receipt deadline passed",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", event.id);
            await markAlertIfFailure(event, "Fata receipt deadline passed", true);
            continue;
        }

        try {
            const res = await sendActionCompletion(
                {
                    subject: event.fata_sub,
                    challengeId: event.challenge_id,
                    requirementId: event.requirement_id,
                    occurredAt: event.occurred_at,
                },
                event.idempotency_key,
            );

            let jsonResponse = {};
            try {
                jsonResponse = await res.json();
            } catch (_) {
                jsonResponse = {};
            }

            const returnedEventId = jsonResponse.eventId || null;
            const returnedRequestId = jsonResponse.requestId || res.headers.get("x-request-id") || null;

            if (
                res.status === 200 &&
                returnedEventId &&
                jsonResponse.status === "recorded"
            ) {
                await supabase
                    .from("fata_pending_events")
                    .update({
                        status: "delivered",
                        event_id: returnedEventId,
                        request_id: returnedRequestId,
                        updated_at: new Date().toISOString(),
                        next_retry_at: null,
                        last_error: null,
                    })
                    .eq("id", event.id);
                continue;
            }

            if (res.status >= 200 && res.status < 300) {
                await scheduleRetry(
                    event,
                    "Fata returned a success status without the required eventId and recorded status",
                );
                continue;
            }

            const errorMsg = jsonResponse.message || jsonResponse.code || `HTTP ${res.status}`;

            const decision = decideFataDeliveryStatus(res.status, jsonResponse);

            if (decision.outcome === "retry") {
                const retryAfterHeader = res.headers.get("retry-after");
                const retryAfterSeconds = Number(retryAfterHeader);
                const retryAfterDateMs = retryAfterHeader
                    ? Date.parse(retryAfterHeader) - Date.now()
                    : NaN;
                const customDelayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
                    ? retryAfterSeconds * 1000
                    : Number.isFinite(retryAfterDateMs) && retryAfterDateMs > 0
                      ? retryAfterDateMs
                      : null;

                await scheduleRetry(
                    event,
                    `HTTP ${res.status}: ${errorMsg}`,
                    customDelayMs,
                );
            } else if (decision.outcome === "refresh") {
                await supabase
                    .from("fata_pending_events")
                    .update({
                        status: "failed",
                        request_id: returnedRequestId,
                        last_error: `HTTP ${res.status}: ${errorMsg} (credentials refreshed once but still rejected)`,
                        updated_at: new Date().toISOString(),
                        next_retry_at: null,
                    })
                    .eq("id", event.id);
                await markAlertIfFailure(event, errorMsg, true);
            } else {
                await supabase
                    .from("fata_pending_events")
                    .update({
                        status: "failed",
                        request_id: returnedRequestId,
                        last_error: `HTTP ${res.status}: ${errorMsg} (${decision.flag || "contract_error"})`,
                        updated_at: new Date().toISOString(),
                        next_retry_at: null,
                    })
                    .eq("id", event.id);
                await markAlertIfFailure(event, errorMsg, true);
            }
        } catch (err) {
            await scheduleRetry(event, err?.message || String(err));
        }
    }
}

async function scheduleRetry(event, errorMsg, overrideDelayMs = null) {
    const retryCount = (event.retry_count || 0) + 1;
    const interval = overrideDelayMs || RETRY_INTERVALS[Math.min(retryCount - 1, RETRY_INTERVALS.length - 1)];
    const nextRetry = new Date(Date.now() + interval).toISOString();

    await supabase
        .from("fata_pending_events")
        .update({
            status: "retry",
            retry_count: retryCount,
            next_retry_at: nextRetry,
            last_error: errorMsg,
            updated_at: new Date().toISOString(),
        })
        .eq("id", event.id);

    await markAlertIfFailure(event, errorMsg);
}

module.exports = {
    processActivityLog,
    processPendingEvents,
    queueEvent,
    scheduleRetry,
    decideFataDeliveryStatus,
    reconcileSelectedArcs,
    isTestChallenge,
    resolveChallengeConfig,
};
