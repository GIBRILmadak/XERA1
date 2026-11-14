import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { beginLink, configurationFor, LINK_SCOPE } from "./oidc.js";

const PRODUCTION = "https://fata.app/oidc";
const metadata = {
  issuer: PRODUCTION,
  authorization_endpoint: `${PRODUCTION}/authorize`,
  token_endpoint: `${PRODUCTION}/token`,
  userinfo_endpoint: `${PRODUCTION}/userinfo`,
  jwks_uri: `${PRODUCTION}/jwks`,
  response_types_supported: ["code"],
  subject_types_supported: ["pairwise"],
  code_challenge_methods_supported: ["S256"],
};
const client = { clientId: "demo", clientSecret: "secret" };

test("keeps the advertised issuer but reaches the endpoints where FATA_ISSUER points", () => {
  const issuer = "http://127.0.0.1:5000/oidc";
  const server = configurationFor({
    metadata,
    issuer,
    ...client,
  }).serverMetadata();
  assert.equal(server.issuer, PRODUCTION);
  assert.equal(server.authorization_endpoint, `${issuer}/authorize`);
  assert.equal(server.token_endpoint, `${issuer}/token`);
  assert.equal(server.userinfo_endpoint, `${issuer}/userinfo`);
  assert.equal(server.jwks_uri, `${issuer}/jwks`);
});

test("rewrites nothing in production", () => {
  const server = configurationFor({
    metadata,
    issuer: PRODUCTION,
    ...client,
  }).serverMetadata();
  assert.equal(server.token_endpoint, `${PRODUCTION}/token`);
});

test("the authorization URL carries PKCE S256, state and nonce, and pending holds their secrets", async () => {
  const config = configurationFor({ metadata, issuer: PRODUCTION, ...client });
  const redirectUri = "https://partner.example/auth/fata/callback";
  const { url, pending } = await beginLink(config, { redirectUri });
  const params = url.searchParams;
  assert.equal(url.origin + url.pathname, `${PRODUCTION}/authorize`);
  assert.equal(params.get("client_id"), "demo");
  assert.equal(params.get("response_type"), "code");
  assert.equal(params.get("redirect_uri"), redirectUri);
  assert.equal(params.get("scope"), LINK_SCOPE);
  assert.equal(params.get("code_challenge_method"), "S256");
  assert.equal(
    params.get("code_challenge"),
    createHash("sha256").update(pending.codeVerifier).digest("base64url"),
  );
  assert.equal(params.get("state"), pending.state);
  assert.equal(params.get("nonce"), pending.nonce);
  assert.ok(
    !url.href.includes(pending.codeVerifier),
    "the verifier never leaves the server",
  );
});
