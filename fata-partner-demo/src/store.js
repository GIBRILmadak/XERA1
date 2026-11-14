import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";

/**
 * Tout l'état du partenaire tient dans un seul data.json : utilisateurs,
 * liaisons Fata, projets et l'outbox. Une transaction modifie l'état en mémoire
 * puis l'écrit en entier (fichier temporaire + rename), donc « enregistrer
 * l'action » et « mettre en file d'attente » sont un seul et même write : après
 * un crash, soit les deux existent, soit aucun.
 *
 * All partner state lives in one data.json. A transaction mutates the in-memory
 * state then writes the whole file atomically (temp file + rename), so saving
 * an action and enqueueing its delivery are one write: after a crash both
 * exist or neither does.
 */
export const initialState = () => ({
  users: [
    { id: "alice", name: "Alice", fata: null },
    { id: "bob", name: "Bob", fata: null },
  ],
  projects: [],
  outbox: [],
});

export const newId = () => randomUUID().slice(0, 8);

export class Store {
  #file;
  #state;
  #queue = Promise.resolve();

  constructor(file, state) {
    this.#file = file;
    this.#state = state;
  }

  static async open(file) {
    let state;
    try {
      state = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      state = initialState();
    }
    return new Store(file, state);
  }

  /** Lecture seule : ne pas muter en dehors d'une transaction. */
  get state() {
    return this.#state;
  }

  /**
   * Sérialise les transactions : `fn(state)` mute l'état, puis tout est écrit.
   * Si `fn` lève, rien n'est écrit et l'état en mémoire reste inchangé.
   */
  transaction(fn) {
    const run = async () => {
      const draft = structuredClone(this.#state);
      const result = await fn(draft);
      await this.#write(draft);
      this.#state = draft;
      return result;
    };
    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => {});
    return next;
  }

  async #write(state) {
    const tmp = `${this.#file}.tmp`;
    await writeFile(tmp, JSON.stringify(state, null, 2));
    await rename(tmp, this.#file);
  }
}
