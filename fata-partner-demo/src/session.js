import { randomUUID } from "node:crypto";

const COOKIE = "demo_sid";
const sessions = new Map();

/**
 * Session en mémoire indexée par un cookie : assez pour porter l'utilisateur
 * courant, le challenge en contexte et l'état PKCE entre l'aller et le retour
 * chez Fata. Redémarrer le serveur déconnecte tout le monde ; rien d'important
 * n'y vit (tout ce qui compte est dans data.json).
 */
export const session = () => (req, res, next) => {
  const cookies = Object.fromEntries(
    (req.headers.cookie ?? "")
      .split(";")
      .map((pair) => pair.trim().split("=", 2))
      .filter(([name]) => name),
  );
  let id = cookies[COOKIE];
  if (!id || !sessions.has(id)) {
    id = randomUUID();
    sessions.set(id, {});
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax`,
    );
  }
  req.session = sessions.get(id);
  next();
};
