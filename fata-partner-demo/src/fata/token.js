import * as client from "openid-client";

export const WRITE_SCOPE = "action-completions:write";

/**
 * Cache du jeton `client_credentials` : un seul jeton serveur, renouvelé un peu
 * avant `expires_in`, invalidé sur 401 (voir outbox.js). `grant` fait l'appel
 * réel ; le worker n'a jamais à connaître le secret.
 */
export class TokenCache {
  #grant;
  #now;
  #skewMs;
  #cached = null;

  constructor({ grant, now = () => Date.now(), skewMs = 60_000 }) {
    this.#grant = grant;
    this.#now = now;
    this.#skewMs = skewMs;
  }

  async get() {
    if (this.#cached && this.#cached.expiresAt - this.#skewMs > this.#now())
      return this.#cached.token;
    const { access_token, expires_in } = await this.#grant();
    this.#cached = {
      token: access_token,
      expiresAt: this.#now() + expires_in * 1000,
    };
    return access_token;
  }

  invalidate() {
    this.#cached = null;
  }

  /**
   * Exercice « mon jeton a expiré » : on garde la date d'expiration mais on
   * remplace le jeton par un jeton invalide, pour provoquer un vrai 401 au
   * prochain appel et montrer le renouvellement unique.
   */
  corrupt() {
    if (this.#cached) this.#cached.token = "expired-token";
  }

  get expiresAt() {
    return this.#cached?.expiresAt ?? null;
  }
}

export const clientCredentialsGrant = (config) => async () =>
  client.clientCredentialsGrant(config, { scope: WRITE_SCOPE });
