const assert = require("node:assert/strict");
const express = require("express");
const { test } = require("node:test");

process.env.FATA_OIDC_ISSUER = "https://fata.app/oidc";
process.env.FATA_TEST_CHALLENGE_ID = "xera1-test";
process.env.FATA_REQ_ARC = "req_arc";
process.env.FATA_REQ_PREUVE = "req_preuve";
process.env.FATA_REQ_JALON = "req_jalon";

const { createFataApiRouter } = require("../server/fata-api-routes");

test("participation endpoint records intent only for a linked, active challenge", async (t) => {
    const now = Date.now();
    const challenge = {
        id: "xera1-test",
        is_active: true,
        opens_at: new Date(now - 60_000).toISOString(),
        close_at: new Date(now + 60_000).toISOString(),
        receipt_deadline_at: new Date(now + 120_000).toISOString(),
        req_arc: "req_arc",
        req_preuve: "req_preuve",
        req_jalon: "req_jalon",
    };
    const rpcCalls = [];
    const supabase = {
        auth: {
            async getUser(token) {
                return token === "user-token"
                    ? { data: { user: { id: "user-1" } }, error: null }
                    : { data: { user: null }, error: new Error("invalid token") };
            },
        },
        from(table) {
            let filters = {};
            const query = {
                select() {
                    return query;
                },
                eq(column, value) {
                    filters[column] = value;
                    return query;
                },
                async maybeSingle() {
                    if (table === "fata_linkages") {
                        return {
                            data: filters.user_id === "user-1" &&
                                filters.fata_iss === "https://fata.app/oidc"
                                ? { user_id: "user-1", fata_iss: filters.fata_iss, metadata: {} }
                                : null,
                            error: null,
                        };
                    }
                    if (table === "fata_challenges_config") {
                        return { data: filters.id === challenge.id ? challenge : null, error: null };
                    }
                    throw new Error(`Unexpected table: ${table}`);
                },
            };
            return query;
        },
        async rpc(name, args) {
            rpcCalls.push({ name, args });
            return {
                data: { participating_at: new Date().toISOString() },
                error: null,
            };
        },
    };
    const app = express();
    app.use(express.json());
    app.use("/api/fata", createFataApiRouter(supabase));
    const server = app.listen(0, "127.0.0.1");
    t.after(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));

    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/fata/participate`, {
        method: "POST",
        headers: {
            Authorization: "Bearer user-token",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ challengeId: "xera1-test" }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.challengeId, "xera1-test");
    assert.equal(body.requirements.arc, "req_arc");
    assert.equal(body.requirements.proof, "req_preuve");
    assert.equal(body.requirements.milestone, "req_jalon");
    assert.deepEqual(rpcCalls, [{
        name: "set_fata_challenge_participation",
        args: {
            p_user_id: "user-1",
            p_issuer: "https://fata.app/oidc",
            p_challenge_id: "xera1-test",
        },
    }]);
});
