import assert from "node:assert/strict";
import { test } from "node:test";
import { TokenCache } from "./token.js";

const cache = () => {
  let now = 1_000_000;
  let grants = 0;
  const tokens = new TokenCache({
    grant: async () => ({ access_token: `t${++grants}`, expires_in: 3600 }),
    now: () => now,
  });
  return { tokens, advance: (ms) => (now += ms), grants: () => grants };
};

test("reuses the token until shortly before expires_in", async () => {
  const c = cache();
  assert.equal(await c.tokens.get(), "t1");
  c.advance(3600_000 - 60_001);
  assert.equal(await c.tokens.get(), "t1");
  c.advance(2);
  assert.equal(await c.tokens.get(), "t2");
  assert.equal(c.grants(), 2);
});

test("invalidate forces a new grant; corrupt keeps the expiry but breaks the token", async () => {
  const c = cache();
  await c.tokens.get();
  c.tokens.invalidate();
  assert.equal(await c.tokens.get(), "t2");
  c.tokens.corrupt();
  assert.equal(await c.tokens.get(), "expired-token");
  assert.equal(c.grants(), 2);
});
