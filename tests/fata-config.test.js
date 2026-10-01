const test = require('node:test');
const assert = require('node:assert/strict');

const { getConfig } = require('../server/oauth-configs');

test("Fata config defaults match the documented public endpoints", () => {
  const keys = [
    "FATA_CLIENT_ID",
    "CLIENT_ID",
    "FATA_CLIENT_SECRET",
    "CLIENT_SECRET",
    "FATA_OIDC_ISSUER",
    "FATA_ISSUER",
    "FATA_API_BASE_URL",
    "FATA_API_BASE",
    "FATA_OIDC_DISCOVERY_URL",
    "FATA_OIDC_AUTH_URL",
    "FATA_OIDC_TOKEN_URL",
    "FATA_OIDC_JWKS_URL",
    "FATA_OIDC_REDIRECT_URI",
  ];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];

  try {
    const config = getConfig("fata");
    assert.equal(config.clientId, "xera1-26f84726");
    assert.equal(config.clientSecret, "");
    assert.equal(config.issuer, "https://fata.app/oidc");
    assert.equal(
      config.discoveryUrl,
      "https://fata.app/oidc/.well-known/openid-configuration",
    );
    assert.equal(config.authUrl, "https://fata.app/oidc/authorize");
    assert.equal(config.tokenUrl, "https://fata.app/oidc/token");
    assert.equal(config.jwksUrl, "https://fata.app/oidc/jwks");
    assert.equal(config.apiBase, "https://fata.app/api");
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test('Fata config accepts the real production env names and exposes the binding scope', () => {
  process.env.FATA_CLIENT_ID = 'xera1-test-client';
  process.env.FATA_CLIENT_SECRET = 'test-secret';
  process.env.FATA_OIDC_ISSUER = 'https://fata.app/oidc';
  process.env.FATA_API_BASE_URL = 'https://fata.app/api';

  const config = getConfig('fata');

  assert.equal(config.clientId, 'xera1-test-client');
  assert.equal(config.clientSecret, 'test-secret');
  assert.equal(config.issuer, 'https://fata.app/oidc');
  assert.equal(config.apiBase, 'https://fata.app/api');
  assert.match(config.scope, /action-completions:connect/);
});
