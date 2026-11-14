const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test_key";
process.env.FATA_TEST_CHALLENGE_ID = "xera1-test";
process.env.FATA_REQ_ARC = "req_arc";
process.env.FATA_REQ_PREUVE = "req_preuve";
process.env.FATA_REQ_JALON = "req_jalon";

const {
    queueEvent,
    decideFataDeliveryStatus,
    isEligibleActionTime,
} = require("../server/fata-worker");

function createDatabase({ error = null, existingEvent = null } = {}) {
    const calls = [];
    return {
        calls,
        from(table) {
            return {
                select() {
                    return {
                        eq(key, value) {
                            return {
                                async maybeSingle() {
                                    return { data: existingEvent, error: null };
                                },
                            };
                        },
                    };
                },
                eq(key, value) {
                    return {
                        async maybeSingle() {
                            return { data: existingEvent, error: null };
                        },
                    };
                },
                async upsert(values, options) {
                    calls.push({ table, values, options });
                    return { error };
                },
            };
        },
    };
}

test("queue persists one stable event with Supabase upsert idempotency", async () => {
    const database = createDatabase();
    await queueEvent(
        "user-1",
        "fata-sub-1",
        "xera1-test",
        "req_arc",
        "2026-09-24T12:00:00Z",
        "arc-1",
        database,
    );

    assert.equal(database.calls.length, 1);
    assert.equal(database.calls[0].table, "fata_pending_events");
    assert.equal(database.calls[0].values.user_id, "user-1");
    assert.equal(database.calls[0].values.fata_sub, "fata-sub-1");
    assert.equal(database.calls[0].values.status, "pending");
    assert.deepEqual(database.calls[0].options, {
        onConflict: "idempotency_key",
        ignoreDuplicates: true,
    });

    const retry = createDatabase();
    await queueEvent(
        "user-1",
        "fata-sub-1",
        "xera1-test",
        "req_arc",
        "2026-09-24T12:00:01Z",
        "arc-1",
        retry,
    );
    assert.equal(
        database.calls[0].values.idempotency_key,
        retry.calls[0].values.idempotency_key,
    );
});

test("queue failures propagate so the source activity log is retained", async () => {
    const database = createDatabase({ error: { code: "42P10" } });
    await assert.rejects(
        queueEvent(
            "user-1",
            "fata-sub-1",
            "xera1-test",
            "req_arc",
            "2026-09-24T12:00:00Z",
            "arc-1",
            database,
        ),
        /Could not persist Fata event \(42P10\)/,
    );
});

test("queue rejects requirements that are not in the configured Fata contract", async () => {
    const database = createDatabase();
    await assert.rejects(
        queueEvent(
            "user-1",
            "fata-sub-1",
            "xera1-test",
            "fake_requirement",
            "2026-09-24T12:00:00Z",
            "arc-1",
            database,
        ),
        /unmapped Fata requirement/,
    );
    assert.equal(database.calls.length, 0);
});

test("a same idempotency key with a different payload is treated as a contract conflict", async () => {
    const database = createDatabase({
        existingEvent: {
            challenge_id: "xera1-test",
            requirement_id: "req_arc",
            occurred_at: "2026-09-24T12:00:00Z",
        },
    });

    await assert.rejects(
        queueEvent(
            "user-1",
            "fata-sub-1",
            "xera1-test",
            "req_arc",
            "2026-09-24T12:05:00Z",
            "arc-1",
            database,
        ),
        /idempotency conflict/i,
    );
});

test("Fata response handling follows the contract retry/stop matrix", () => {
    assert.deepEqual(decideFataDeliveryStatus(200), { outcome: "delivered" });
    assert.deepEqual(decideFataDeliveryStatus(401), {
        outcome: "refresh",
    });
    assert.deepEqual(decideFataDeliveryStatus(403, { code: "link_revoked" }), {
        outcome: "stop",
        flag: "link_revoked",
    });
    assert.deepEqual(decideFataDeliveryStatus(409, { code: "idempotency_conflict" }), {
        outcome: "stop",
        flag: "idempotency_conflict",
    });
    assert.deepEqual(decideFataDeliveryStatus(422, { code: "not_registered" }), {
        outcome: "stop",
        flag: "not_registered",
    });
    assert.deepEqual(decideFataDeliveryStatus(422, { code: "outside_window" }), {
        outcome: "stop",
        flag: "outside_window",
    });
    assert.deepEqual(decideFataDeliveryStatus(422, { code: "receipt_deadline_passed" }), {
        outcome: "stop",
        flag: "receipt_deadline_passed",
    });
    assert.deepEqual(decideFataDeliveryStatus(429), { outcome: "retry" });
    assert.deepEqual(decideFataDeliveryStatus(500), { outcome: "retry" });
    assert.deepEqual(decideFataDeliveryStatus(400), {
        outcome: "stop",
        flag: "request",
    });
});

test("challenge proofs and milestones must occur after the selected ARC time", () => {
    const linkage = { created_at: "2026-01-01T00:00:00.000Z" };
    const selection = { selected_at: "2026-01-03T12:00:00.000Z" };
    const challenge = {
        opens_at: "2026-01-01T00:00:00.000Z",
        close_at: "2026-01-10T00:00:00.000Z",
    };

    assert.equal(
        isEligibleActionTime("2026-01-03T11:59:59.999Z", linkage, selection, challenge),
        false,
    );
    assert.equal(
        isEligibleActionTime("2026-01-03T12:00:00.000Z", linkage, selection, challenge),
        true,
    );
    assert.equal(
        isEligibleActionTime("2026-01-03T12:00:01.000Z", linkage, selection, challenge),
        true,
    );
    assert.equal(
        isEligibleActionTime(
            "2026-01-03T12:00:01.000Z",
            linkage,
            {},
            challenge,
        ),
        false,
    );
});
