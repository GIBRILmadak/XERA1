import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { initialState, Store } from "./store.js";

const openTemp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "partner-demo-"));
  return { dir, store: await Store.open(join(dir, "data.json")) };
};
const onDisk = async (dir) =>
  JSON.parse(await readFile(join(dir, "data.json"), "utf8"));

test("starts from the initial state when data.json is missing", async () => {
  const { store } = await openTemp();
  assert.deepEqual(store.state, initialState());
});

test("a transaction is written whole, with no temp file left behind", async () => {
  const { dir, store } = await openTemp();
  await store.transaction((state) => {
    state.projects.push({ id: "p1" });
    state.outbox.push({ id: "o1" });
  });
  assert.deepEqual(await readdir(dir), ["data.json"]);
  const saved = await onDisk(dir);
  assert.equal(saved.projects.length, 1);
  assert.equal(saved.outbox.length, 1);
  assert.deepEqual((await Store.open(join(dir, "data.json"))).state, saved);
});

test("a failing transaction leaves state and file untouched", async () => {
  const { dir, store } = await openTemp();
  await store.transaction((state) => state.projects.push({ id: "kept" }));
  await assert.rejects(
    store.transaction((state) => {
      state.projects.push({ id: "lost" });
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.deepEqual(store.state.projects, [{ id: "kept" }]);
  assert.deepEqual((await onDisk(dir)).projects, [{ id: "kept" }]);
});

test("concurrent transactions are serialized", async () => {
  const { store } = await openTemp();
  await Promise.all(
    [1, 2, 3].map((n) =>
      store.transaction(async (state) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        state.projects.push({ id: `p${n}`, seen: state.projects.length });
      }),
    ),
  );
  assert.deepEqual(
    store.state.projects.map((p) => p.seen),
    [0, 1, 2],
  );
});
