import * as client from "openid-client";

/** Les scopes de liaison : jamais `action-completions:write` côté navigateur. */
export const LINK_SCOPE = "openid profile action-completions:connect";

const ENDPOINTS = [
  "authorization_endpoint",
  "token_endpoint",
  "userinfo_endpoint",
  "jwks_uri",
];

/**
 * Construit la configuration openid-client à partir du document de découverte.
 *
 * L'émulateur annonce l'issuer de production (`https://fata.app/oidc`) : on
 * garde cet `iss` tel quel pour la validation des jetons et on renvoie les
 * endpoints vers FATA_ISSUER, l'URL réellement joignable. En production les
 * deux coïncident et rien n'est réécrit.
 */
export const configurationFor = ({
  metadata,
  issuer,
  clientId,
  clientSecret,
}) => {
  const rebase = (url) =>
    typeof url === "string" && url.startsWith(metadata.issuer)
      ? issuer + url.slice(metadata.issuer.length)
      : url;
  const server = { ...metadata };
  for (const endpoint of ENDPOINTS) server[endpoint] = rebase(server[endpoint]);
  const config = new client.Configuration(
    server,
    clientId,
    clientSecret,
    client.ClientSecretBasic(clientSecret),
  );
  if (new URL(issuer).protocol === "http:")
    client.allowInsecureRequests(config);
  return config;
};

export const discover = async ({
  issuer,
  clientId,
  clientSecret,
  fetch = globalThis.fetch,
}) => {
  const response = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!response.ok)
    throw new Error(`Discovery failed: HTTP ${response.status} from ${issuer}`);
  return configurationFor({
    metadata: await response.json(),
    issuer,
    clientId,
    clientSecret,
  });
};

/**
 * Démarre la liaison : PKCE (S256), `state` et `nonce` sont tous trois
 * obligatoires chez Fata. `pending` doit être conservé en session jusqu'au
 * retour sur REDIRECT_URI.
 */
export const beginLink = async (config, { redirectUri }) => {
  const codeVerifier = client.randomPKCECodeVerifier();
  const pending = {
    codeVerifier,
    state: client.randomState(),
    nonce: client.randomNonce(),
  };
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: LINK_SCOPE,
    code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: "S256",
    state: pending.state,
    nonce: pending.nonce,
  });
  return { url, pending };
};

/**
 * Termine la liaison : échange le code, vérifie `state`, `nonce`, la signature
 * et l'`iss` de l'id_token, puis lit `sub` — l'identifiant stable et opaque
 * de l'apprenant chez ce partenaire.
 */
export const completeLink = async (config, { pending, redirectUri, query }) => {
  const currentUrl = new URL(redirectUri);
  currentUrl.search = new URLSearchParams(query).toString();
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: pending.codeVerifier,
    expectedState: pending.state,
    expectedNonce: pending.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  const userinfo = await client.fetchUserInfo(
    config,
    tokens.access_token,
    claims.sub,
  );
  return {
    iss: claims.iss,
    sub: claims.sub,
    preferred_username: userinfo.preferred_username ?? null,
  };
};
