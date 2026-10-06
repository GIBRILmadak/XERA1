const { sendActionCompletion } = require("./fata-api-client");
const { createSupabaseServiceClient } = require("./supabase-service-client");
const {
    resolveChallengeConfig,
    buildIdempotencyKey,
    isTestChallenge,
} = require("./fata-contract");

const RETRY_INTERVALS = [
    1 * 60 * 1000,
    5 * 60 * 1000,
    30 * 60 * 1000,
    2 * 60 * 60 * 1000,
    6 * 60 * 60 * 1000,
];

const supabase = createSupabaseServiceClient();

async function markAlertIfFailure(event, errorMessage) {
    const hoursSinceCreated =
        (Date.now() - new Date(event.created_at || Date.now()).getTime()) /
        (60 * 60 * 1000);

    if (hoursSinceCreated >= 24) {
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

    const { data: logs, error: logError } = await supabase
        .from("fata_activity_log")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(100);

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

    const { data: linkage } = await supabase
        .from("fata_linkages")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle();

    if (!linkage) return;

    const metadataChallengeId =
        linkage.metadata?.last_challenge_id || linkage.metadata?.challenge_id;
    if (!metadataChallengeId) return;

    try {
        resolveChallengeConfig(metadataChallengeId);
    } catch (error) {
        console.warn(
            "[Fata Worker] Ignoring invalid challenge in linkage:",
            error.message,
        );
        return;
    }

    const { data: config } = await supabase
        .from("fata_challenges_config")
        .select("*")
        .eq("id", metadataChallengeId)
        .maybeSingle();

    if (!config || !config.is_active) return;

    if (entity_type === "arcs") {
        await evaluateAction1(user_id, entity_id, linkage, config);
    } else if (entity_type === "content") {
        await evaluateAction2(user_id, entity_id, linkage, config);
    } else if (entity_type === "arc_milestone_validations") {
        await evaluateAction3(user_id, entity_id, linkage, config);
    }
}

/**
 * Action 1: ARC Conforme
 * Belonging to learner, published, title/desc not empty, >= 3 milestones
 */
async function evaluateAction1(user_id, arc_id, linkage, config) {
    const { data: arc } = await supabase
        .from("arcs")
        .select("*")
        .eq("id", arc_id)
        .maybeSingle();

    if (!arc || !arc.user_id || arc.user_id !== user_id) return;
    if (!arc.title || !String(arc.title).trim()) return;
    if (!arc.description || !String(arc.description).trim()) return;

    // XERA1's content posts and validation records are not milestone
    // definitions. Only an explicit ARC milestone list can satisfy Fata's
    // requirement; guessing from related rows generated false completions.
    const milestones = Array.isArray(arc.milestones) ? arc.milestones : [];
    const milestoneCount = milestones.filter((milestone) => {
        if (typeof milestone === "string") return Boolean(milestone.trim());
        return Boolean(String(milestone?.title || "").trim());
    }).length;

    // Calculate occurredAt: for existing ARCs selected for challenge, occurredAt = max(arc.created_at, linkage.created_at)
    const arcCreatedAt = new Date(arc.created_at || Date.now()).getTime();
    const linkedAt = new Date(linkage.created_at || Date.now()).getTime();
    const occurredAtDate = new Date(Math.max(arcCreatedAt, linkedAt));

    // Must have at least 3 milestones / elements defined
    if (milestoneCount >= 3) {
        await queueEvent(
            user_id,
            linkage.fata_sub,
            config.id,
            config.req_arc,
            occurredAtDate,
            `arc-${arc_id}`,
        );
    }
}

/**
 * Action 2: PREUVE / TRACE Conforme
 * Belonging to learner, published after link, linked to ARC, has media and non-empty desc
 */
async function evaluateAction2(user_id, content_id, linkage, config) {
    const { data: content } = await supabase
        .from("content")
        .select("*")
        .eq("id", content_id)
        .maybeSingle();

    if (!content || content.user_id !== user_id) return;
    if (!content.arc_id) return;
    if (!content.media_url || !String(content.media_url).trim()) return;
    if (!content.description || !String(content.description).trim()) return;

    const createdAtTime = new Date(content.created_at || Date.now()).getTime();
    const linkedAtTime = new Date(linkage.created_at || Date.now()).getTime();

    if (createdAtTime < linkedAtTime - 5000) return; // Allow 5s clock skew tolerance

    await queueEvent(
        user_id,
        linkage.fata_sub,
        config.id,
        config.req_preuve,
        new Date(content.created_at || Date.now()),
        `preuve-${content_id}`,
    );
}

/**
 * Action 3: JALON Conforme
 * Same ARC, validated, description of result, admissible proof (media)
 */
async function evaluateAction3(user_id, validation_id, linkage, config) {
    const { data: val } = await supabase
        .from("arc_milestone_validations")
        .select("*, content(*)")
        .eq("id", validation_id)
        .maybeSingle();

    if (!val || !val.content) return;
    const content = val.content;

    if (!content.arc_id || !content.media_url || !content.description) return;
    if (!val.result_description && !val.comment) return;
    if (val.user_id && val.user_id !== user_id) return;

    await queueEvent(
        user_id,
        linkage.fata_sub,
        config.id,
        config.req_jalon,
        new Date(val.created_at || Date.now()),
        `jalon-${validation_id}`,
    );
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
        .select("*, fata_challenges_config(close_at)")
        .in("status", ["pending", "retry"])
        .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
        .limit(50);

    if (error) {
        console.error("[Fata Worker] Pending events fetch error:", error);
        return;
    }

    for (const event of events || []) {
        if (
            event.fata_challenges_config?.close_at &&
            new Date() > new Date(event.fata_challenges_config.close_at)
        ) {
            await supabase
                .from("fata_pending_events")
                .update({
                    status: "failed",
                    last_error: "Challenge closed",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", event.id);
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

            if (res.ok) {
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

            const errorMsg = jsonResponse.message || jsonResponse.code || `HTTP ${res.status}`;

            if (res.status === 429) {
                const retryAfterHeader = res.headers.get("retry-after");
                const retryAfterSec = Number(retryAfterHeader);
                const customDelayMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
                    ? retryAfterSec * 1000
                    : null;

                await scheduleRetry(event, `HTTP 429: ${errorMsg}`, customDelayMs);
            } else if (res.status >= 500) {
                await scheduleRetry(event, `HTTP ${res.status}: ${errorMsg}`);
            } else {
                // 4xx errors (400, 403, 404, 422) are non-retryable
                await supabase
                    .from("fata_pending_events")
                    .update({
                        status: "failed",
                        request_id: returnedRequestId,
                        last_error: `HTTP ${res.status}: ${errorMsg}`,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", event.id);
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
    isTestChallenge,
    resolveChallengeConfig,
};
