const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test_key";
process.env.FATA_TEST_CHALLENGE_ID = "xera1-test";

const { queueEvent } = require("../server/fata-worker");

function createDatabase({ error = null } = {}) {
    const calls = [];
    return {
        calls,
        from(table) {
            return {
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
