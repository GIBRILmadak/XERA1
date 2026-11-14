import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  backoffMs,
  decide,
  enqueue,
  idempotencyKeyFor,
  OutboxWorker,
  requirementFor,
} from "./outbox.js";
import { Store } from "../store.js";

const REQUIREMENTS = ["req_arc", "req_preuve", "req_jalon"];
const ACTION = {
  userId: "alice",
  projectId: "p1",
  action: "projectCreated",
  entityId: "p1",
  occurredAt: "2026-09-07T14:32:00.000Z",
  subject: "fata_abc",
  challengeId: "ch1",
};

const jsonResponse = (status, body, headers = {}) => ({
  status,
  headers: new Headers(headers),
  json: async () => body,
});

/** Un worker sur un store temporaire, un `fetch` scripté et une horloge fixe. */
const harness = async (responses) => {
  const dir = await mkdtemp(join(tmpdir(), "outbox-"));
  const store = await Store.open(join(dir, "data.json"));
  const calls = [];
  let tokenVersion = 0;
  const tokens = {
    get: async () => `token-${tokenVersion}`,
    invalidate: () => tokenVersion++,
  };
  let now = Date.parse("2026-09-07T15:00:00Z");
  const worker = new OutboxWorker({
    store,
    apiBase: "http://fata.test/api",
    tokens,
    now: () => now,
    log: () => {},
    fetch: async (url, init) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  });
  const row = await store.transaction((state) =>
    enqueue(state, ACTION, REQUIREMENTS),
  );
  return {
    store,
    worker,
    calls,
    rowId: row.id,
    row: () => store.state.outbox.find((r) => r.id === row.id),
    advance: (ms) => (now += ms),
  };
};

test("requirement ids follow REQUIREMENT_IDS in step order; unmapped actions are skipped", () => {
  assert.equal(requirementFor("projectCreated", REQUIREMENTS), "req_arc");
  assert.equal(requirementFor("milestoneValidated", REQUIREMENTS), "req_jalon");
  assert.equal(requirementFor("milestoneValidated", ["req_arc"]), undefined);
});

test("idempotency key is stable per (challenge, action, entity)", () => {
  const key = idempotencyKeyFor({
    challengeId: "ch1",
    action: "proofAdded",
    entityId: "pr9",
  });
  assert.equal(
    key,
    idempotencyKeyFor({
      challengeId: "ch1",
      action: "proofAdded",
      entityId: "pr9",
    }),
  );
  assert.notEqual(
    key,
    idempotencyKeyFor({
      challengeId: "ch2",
      action: "proofAdded",
      entityId: "pr9",
    }),
  );
  assert.ok(key.length <= 200);
});

test("enqueue needs a link, a challenge and a mapped requirement", async () => {
  const state = { outbox: [] };
  assert.equal(
    enqueue(state, { ...ACTION, subject: null }, REQUIREMENTS),
    null,
  );
  assert.equal(
    enqueue(state, { ...ACTION, challengeId: null }, REQUIREMENTS),
    null,
  );
  assert.equal(
    enqueue(state, { ...ACTION, action: "milestoneValidated" }, ["req_arc"]),
    null,
  );
  assert.equal(state.outbox.length, 0);
  const row = enqueue(state, ACTION, REQUIREMENTS);
  assert.equal(row.status, "pending");
  assert.equal(row.requirementId, "req_arc");
  assert.equal(state.outbox[0], row);
});

test("the guide's status table", () => {
  assert.deepEqual(decide(200), { outcome: "delivered" });
  assert.deepEqual(decide(401), { outcome: "refresh" });
  assert.deepEqual(decide(403), { outcome: "stop", flag: "link" });
  assert.deepEqual(decide(400), { outcome: "stop", flag: "request" });
  assert.deepEqual(decide(404), { outcome: "stop", flag: "request" });
  assert.deepEqual(decide(409), { outcome: "stop", flag: "conflict" });
  assert.deepEqual(decide(422), { outcome: "stop", flag: "rejected" });
  assert.deepEqual(decide(429), { outcome: "retry" });
  assert.deepEqual(decide(500), { outcome: "retry" });
  assert.deepEqual(decide(503), { outcome: "retry" });
  assert.deepEqual(decide(0), { outcome: "retry" });
});

test("backoff doubles from the base and is capped", () => {
  assert.equal(backoffMs(1), 2_000);
  assert.equal(backoffMs(2), 4_000);
  assert.equal(backoffMs(3), 8_000);
  assert.equal(backoffMs(20), 5 * 60_000);
});

test("delivers with the token, the key and the body from the guide", async () => {
  const h = await harness([
    jsonResponse(200, { eventId: "ev1", status: "recorded" }),
  ]);
  await h.worker.tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, "http://fata.test/api/v1/action-completions");
  assert.equal(h.calls[0].headers.authorization, "Bearer token-0");
  assert.equal(h.calls[0].headers["idempotency-key"], "ch1:projectCreated:p1");
  assert.deepEqual(h.calls[0].body, {
    subject: "fata_abc",
    challengeId: "ch1",
    requirementId: "req_arc",
    occurredAt: "2026-09-07T14:32:00.000Z",
  });
  assert.equal(h.row().status, "delivered");
  assert.equal(h.row().eventId, "ev1");
  assert.equal(h.row().attempts, 1);
});

test("5xx and network errors retry with backoff, then deliver", async () => {
  const h = await harness([
    jsonResponse(503, {
      code: "server_error",
      message: "boom",
      requestId: "r1",
    }),
    new Error("socket hang up"),
    jsonResponse(200, { eventId: "ev1", status: "recorded" }),
  ]);
  await h.worker.tick();
  assert.equal(h.row().status, "pending");
  assert.equal(h.row().attempts, 1);
  assert.equal(h.row().last.requestId, "r1");
  await h.worker.tick();
  assert.equal(h.calls.length, 1, "not due yet");
  h.advance(2_000);
  await h.worker.tick();
  assert.equal(h.row().attempts, 2);
  assert.equal(h.row().last.status, 0);
  h.advance(3_999);
  await h.worker.tick();
  assert.equal(h.calls.length, 2, "backoff doubled");
  h.advance(1);
  await h.worker.tick();
  assert.equal(h.row().status, "delivered");
  assert.equal(h.row().attempts, 3);
});

test("401 refreshes the token once and resends within the same attempt", async () => {
  const h = await harness([
    jsonResponse(401, { code: "invalid_token" }),
    jsonResponse(200, { eventId: "ev1" }),
  ]);
  await h.worker.tick();
  assert.equal(h.calls[0].headers.authorization, "Bearer token-0");
  assert.equal(h.calls[1].headers.authorization, "Bearer token-1");
  assert.equal(h.row().status, "delivered");
  assert.equal(h.row().attempts, 1);
});

test("a second 401 after refresh stops the row for a human", async () => {
  const h = await harness([jsonResponse(401, {}), jsonResponse(401, {})]);
  await h.worker.tick();
  assert.equal(h.row().status, "failed");
  assert.equal(h.row().flag, "credentials");
});

test("403, 409 and 422 stop and flag; retry now re-arms the row", async () => {
  for (const [status, code, flag] of [
    [403, "link_revoked", "link"],
    [409, "idempotency_conflict", "conflict"],
    [422, "outside_window", "rejected"],
  ]) {
    const h = await harness([
      jsonResponse(status, { code, message: "m", requestId: "rq" }),
      jsonResponse(200, { eventId: "late" }),
    ]);
    await h.worker.tick();
    assert.equal(h.row().status, "failed");
    assert.equal(h.row().flag, flag);
    assert.equal(h.row().last.code, code);
    await h.worker.tick();
    assert.equal(h.calls.length, 1, "no automatic retry on a definitive 4xx");
    await h.worker.retryNow(h.rowId);
    assert.equal(h.row().status, "delivered");
    assert.equal(h.row().eventId, "late");
  }
});

test("429 honours Retry-After", async () => {
  const h = await harness([
    jsonResponse(429, {}, { "retry-after": "30" }),
    jsonResponse(200, { eventId: "ev1" }),
  ]);
  await h.worker.tick();
  assert.equal(
    Date.parse(h.row().nextAttemptAt),
    Date.parse("2026-09-07T15:00:30Z"),
  );
});

test("a network cut is a retry, and the request never leaves", async () => {
  const h = await harness([jsonResponse(200, { eventId: "ev1" })]);
  h.worker.networkCut = true;
  await h.worker.tick();
  assert.equal(h.calls.length, 0);
  assert.equal(h.row().status, "pending");
  assert.equal(h.row().attempts, 1);
  h.worker.networkCut = false;
  h.advance(2_000);
  await h.worker.tick();
  assert.equal(h.row().status, "delivered");
});

test("replaying a delivered row keeps its status and reports the eventId match", async () => {
  const h = await harness([
    jsonResponse(200, { eventId: "ev1" }),
    jsonResponse(200, { eventId: "ev1" }),
    jsonResponse(409, { code: "idempotency_conflict", requestId: "rq" }),
  ]);
  await h.worker.tick();
  await h.worker.retryNow(h.rowId);
  assert.equal(h.row().status, "delivered");
  assert.equal(h.row().attempts, 1);
  assert.match(h.row().last.note, /même eventId/);
  await h.worker.attempt(h.rowId, { drill: "differentBody" });
  assert.equal(
    h.calls[2].headers["idempotency-key"],
    h.calls[0].headers["idempotency-key"],
  );
  assert.equal(h.calls[2].body.occurredAt, "2026-09-07T14:32:01.000Z");
  assert.equal(h.row().status, "delivered");
  assert.equal(h.row().last.status, 409);
  assert.equal(h.row().last.code, "idempotency_conflict");
  assert.equal(h.row().history.length, 3);
});

test("a rejected token grant stops the row for a human instead of retrying forever", async () => {
  const h = await harness([]);
  const grantError = Object.assign(new Error("invalid_client"), {
    status: 401,
    error: "invalid_client",
  });
  const worker = new OutboxWorker({
    store: h.store,
    apiBase: "http://fata.test/api",
    tokens: {
      get: async () => {
        throw grantError;
      },
      invalidate() {},
    },
    log: () => {},
    fetch: async () => {
      throw new Error("must not be called");
    },
  });
  await worker.tick();
  assert.equal(h.row().status, "failed");
  assert.equal(h.row().flag, "credentials");
  assert.equal(h.row().last.code, "invalid_client");
});

test("a due-only attempt skips a row another tick already handled", async () => {
  const h = await harness([jsonResponse(200, { eventId: "ev1" })]);
  await h.worker.tick();
  assert.equal(await h.worker.attempt(h.rowId, { dueOnly: true }), null);
  assert.equal(h.calls.length, 1);
  assert.equal(h.row().history.length, 1);
});

test("a row already in flight is not sent twice", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const h = await harness([]);
  const worker = new OutboxWorker({
    store: h.store,
    apiBase: "http://fata.test/api",
    tokens: { get: async () => "t", invalidate() {} },
    log: () => {},
    fetch: async () => {
      await gate;
      return jsonResponse(200, { eventId: "ev1" });
    },
  });
  const first = worker.attempt(h.rowId);
  const second = await worker.tick();
  assert.equal(second, undefined);
  release();
  assert.equal((await first).attempts, 1);
  assert.equal(h.row().history.length, 1);
});
