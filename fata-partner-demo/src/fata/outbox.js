import { newId } from "../store.js";

/** Les actions du partenaire, dans l'ordre des étapes du challenge. */
export const ACTIONS = ["projectCreated", "proofAdded", "milestoneValidated"];

/** `REQUIREMENT_IDS` est aligné sur ACTIONS ; une action sans id n'est pas transmise. */
export const requirementFor = (action, requirementIds) =>
  requirementIds[ACTIONS.indexOf(action)];

/**
 * Stable par événement partenaire, et par challenge : le même projet présenté
 * à deux challenges est deux corps différents, donc deux clés.
 */
export const idempotencyKeyFor = ({ challengeId, action, entityId }) =>
  `${challengeId}:${action}:${entityId}`;

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 5 * 60_000;
const HISTORY_LIMIT = 20;

export const backoffMs = (attempts) =>
  Math.min(BASE_DELAY_MS * 2 ** Math.max(attempts - 1, 0), MAX_DELAY_MS);

/**
 * La table des statuts du contrat : que faire d'une réponse.
 *   retry   → nouvelle tentative avec backoff (5xx, 429, réseau, timeout)
 *   refresh → 401 : renouveler le jeton une fois puis renvoyer
 *   stop    → 4xx définitif : une personne doit regarder (`flag` dit quoi)
 */
export const decide = (status) => {
  if (status >= 200 && status < 300) return { outcome: "delivered" };
  if (status === 401) return { outcome: "refresh" };
  if (status === 403) return { outcome: "stop", flag: "link" };
  if (status === 409) return { outcome: "stop", flag: "conflict" };
  if (status === 422) return { outcome: "stop", flag: "rejected" };
  if (status === 429 || status >= 500) return { outcome: "retry" };
  if (status >= 400) return { outcome: "stop", flag: "request" };
  return { outcome: "retry" };
};

export const enqueue = (
  state,
  { userId, projectId, action, entityId, occurredAt, subject, challengeId },
  requirementIds,
) => {
  const requirementId = requirementFor(action, requirementIds);
  if (!requirementId || !subject || !challengeId) return null;
  const row = {
    id: newId(),
    userId,
    projectId,
    action,
    entityId,
    requirementId,
    subject,
    challengeId,
    occurredAt,
    idempotencyKey: idempotencyKeyFor({ challengeId, action, entityId }),
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date(0).toISOString(),
    eventId: null,
    flag: null,
    last: null,
    history: [],
  };
  state.outbox.push(row);
  return row;
};

const bodyOf = (row) => ({
  subject: row.subject,
  challengeId: row.challengeId,
  requirementId: row.requirementId,
  occurredAt: row.occurredAt,
});

export class OutboxWorker {
  #store;
  #apiBase;
  #tokens;
  #fetch;
  #now;
  #log;
  #timer = null;
  #inFlight = new Set();
  networkCut = false;

  constructor({
    store,
    apiBase,
    tokens,
    requestTimeoutMs = 10_000,
    fetch = globalThis.fetch,
    now = () => Date.now(),
    log = console.log,
  }) {
    this.#store = store;
    this.#apiBase = apiBase;
    this.#tokens = tokens;
    this.#fetch = fetch;
    this.#now = now;
    this.#log = log;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  start(intervalMs = 1_000) {
    this.#timer = setInterval(() => this.tick().catch(this.#log), intervalMs);
    this.#timer.unref?.();
  }

  stop() {
    clearInterval(this.#timer);
  }

  #isDue(row) {
    return (
      row.status === "pending" && Date.parse(row.nextAttemptAt) <= this.#now()
    );
  }

  async tick() {
    for (const row of this.#store.state.outbox.filter((r) => this.#isDue(r)))
      await this.attempt(row.id, { dueOnly: true });
  }

  /**
   * Une requête HTTP ; lève sur coupure réseau ou timeout. Un refus du
   * endpoint de jeton (secret faux, client désactivé) vaut un 401 : le
   * renouvellement unique échouera de la même façon et la ligne s'arrêtera.
   */
  async #send(row, body) {
    if (this.networkCut) throw new Error("simulated network cut");
    let token;
    try {
      token = await this.#tokens.get();
    } catch (error) {
      if (error.status >= 400 && error.status < 500)
        return {
          status: 401,
          json: {
            code: error.error ?? "invalid_client",
            message: error.message,
          },
        };
      throw error;
    }
    const response = await this.#fetch(
      `${this.#apiBase}/v1/action-completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "idempotency-key": row.idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      },
    );
    const json = await response.json().catch(() => ({}));
    return {
      status: response.status,
      json,
      retryAfter: response.headers.get("retry-after"),
    };
  }

  /**
   * Une tentative de livraison. Sur une ligne déjà `delivered` c'est un rejeu
   * volontaire (même clé) : le résultat est consigné, le statut ne bouge pas.
   * `drill: "differentBody"` renvoie la même clé avec un corps modifié — le
   * 409 attendu du guide.
   */
  async attempt(rowId, { drill = null, dueOnly = false } = {}) {
    const current = this.#store.state.outbox.find((row) => row.id === rowId);
    if (!current || this.#inFlight.has(rowId)) return null;
    // Deux ticks qui se chevauchent : le second a pu livrer ou reprogrammer la ligne.
    if (dueOnly && !this.#isDue(current)) return null;
    this.#inFlight.add(rowId);
    try {
      return await this.#deliver(current, drill);
    } finally {
      this.#inFlight.delete(rowId);
    }
  }

  async #deliver(current, drill) {
    const rowId = current.id;
    const body = bodyOf(current);
    if (drill === "differentBody")
      body.occurredAt = new Date(
        Date.parse(current.occurredAt) + 1_000,
      ).toISOString();

    let result;
    let note = drill ? `drill:${drill}` : null;
    try {
      result = await this.#send(current, body);
      if (result.status === 401) {
        this.#tokens.invalidate();
        note = "401 → jeton renouvelé, renvoi";
        result = await this.#send(current, body);
      }
    } catch (error) {
      result = { status: 0, json: { message: error.message } };
    }

    return this.#store.transaction((state) => {
      const row = state.outbox.find((r) => r.id === rowId);
      const decision = decide(result.status);
      const replay = row.status === "delivered";
      const entry = {
        at: new Date(this.#now()).toISOString(),
        status: result.status,
        code: result.json.code ?? null,
        requestId: result.json.requestId ?? null,
        message: result.json.message ?? null,
        eventId: result.json.eventId ?? null,
        note,
      };
      if (replay && entry.eventId)
        entry.note =
          entry.eventId === row.eventId
            ? "rejeu : même eventId"
            : "rejeu : eventId DIFFÉRENT";
      row.last = entry;
      row.history = [entry, ...row.history].slice(0, HISTORY_LIMIT);
      if (replay || drill) return row;

      row.attempts += 1;
      if (decision.outcome === "delivered") {
        row.status = "delivered";
        row.eventId = entry.eventId;
        row.flag = null;
      } else if (decision.outcome === "retry") {
        const retryAfterMs = Number(result.retryAfter) * 1_000;
        row.nextAttemptAt = new Date(
          this.#now() +
            (retryAfterMs > 0 ? retryAfterMs : backoffMs(row.attempts)),
        ).toISOString();
      } else {
        row.status = "failed";
        row.flag =
          decision.outcome === "refresh" ? "credentials" : decision.flag;
      }
      this.#log(
        `[outbox] ${row.id} ${row.action} → ${result.status} ${entry.code ?? ""} ${row.status}${row.eventId ? ` eventId=${row.eventId}` : ""}`,
      );
      return row;
    });
  }

  /** « Réessayer maintenant » : remet la ligne en attente et tente tout de suite. */
  async retryNow(rowId) {
    await this.#store.transaction((state) => {
      const row = state.outbox.find((r) => r.id === rowId);
      if (row && row.status !== "delivered") {
        row.status = "pending";
        row.flag = null;
        row.nextAttemptAt = new Date(0).toISOString();
      }
    });
    return this.attempt(rowId);
  }
}
