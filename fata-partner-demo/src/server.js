import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import { beginLink, completeLink, discover } from "./fata/oidc.js";
import { enqueue, OutboxWorker } from "./fata/outbox.js";
import { clientCredentialsGrant, TokenCache } from "./fata/token.js";
import { session } from "./session.js";
import { newId, Store } from "./store.js";
import { page } from "../views/layout.js";
import {
  accountPage,
  loginPage,
  outboxPage,
  projectsPage,
} from "../views/pages.js";

dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

const env = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined)
    throw new Error(`${name} is required (see .env.example)`);
  return value;
};
const config = {
  issuer: env("FATA_ISSUER").replace(/\/$/, ""),
  apiBase: env("FATA_API_BASE").replace(/\/$/, ""),
  clientId: env("CLIENT_ID"),
  clientSecret: env("CLIENT_SECRET"),
  redirectUri: env("REDIRECT_URI"),
  // The callback is served wherever the registered URI says, so a partner can
  // run this demo behind the exact redirect_uri Fata has on file for them.
  callbackPath: new URL(env("REDIRECT_URI")).pathname,
  challengeId: env("CHALLENGE_ID", "") || null,
  requirementIds: env("REQUIREMENT_IDS", "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
  port: Number(env("PORT", "4312")),
  dataFile: env(
    "DATA_FILE",
    fileURLToPath(new URL("../data.json", import.meta.url)),
  ),
};

const store = await Store.open(config.dataFile);
const oidc = await discover(config);
const tokens = new TokenCache({ grant: clientCredentialsGrant(oidc) });
const outbox = new OutboxWorker({ store, apiBase: config.apiBase, tokens });

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(session());

const userOf = (req) =>
  store.state.users.find((user) => user.id === req.session.userId);
const challengeOf = (req) => req.session.challengeId ?? config.challengeId;
const render = (req, res, title, body, status = 200) => {
  const flash = req.session.flash;
  delete req.session.flash;
  res.status(status).send(
    page({
      title,
      user: userOf(req),
      challengeId: challengeOf(req),
      flash,
      path: req.path,
      body,
    }),
  );
};
const flashTo = (req, res, path, text, type = "") => {
  req.session.flash = { text, type };
  res.redirect(path);
};
const requireUser = (req, res, next) =>
  userOf(req) ? next() : res.redirect("/login");

app.get("/", (_req, res) => res.redirect("/projects"));

app.get("/login", (req, res) =>
  render(req, res, "Connexion", loginPage({ users: store.state.users })),
);
app.post("/login", (req, res) => {
  req.session.userId = req.body.userId;
  res.redirect("/account");
});

/** Ce que le bouton « Continuer sur {partenaire} » de Fata appelle : continueUrl + ?challengeId=. */
app.get("/context", (req, res) => {
  if (typeof req.query.challengeId === "string" && req.query.challengeId)
    req.session.challengeId = req.query.challengeId;
  res.redirect(userOf(req) ? "/account" : "/login");
});

app.get("/account", requireUser, (req, res) =>
  render(req, res, "Compte", accountPage({ user: userOf(req) })),
);

const startLink = async (req, res) => {
  const { url, pending } = await beginLink(oidc, config);
  req.session.pendingLink = pending;
  res.redirect(url.href);
};
app.get("/auth/fata", requireUser, startLink);
app.post("/auth/fata", requireUser, startLink);

app.get(config.callbackPath, requireUser, async (req, res) => {
  const pending = req.session.pendingLink;
  delete req.session.pendingLink;
  if (!pending)
    return flashTo(req, res, "/account", "Aucune liaison en cours.", "error");
  if (typeof req.query.error === "string")
    return flashTo(
      req,
      res,
      "/account",
      `Fata a refusé la liaison : ${req.query.error}`,
      "error",
    );
  let identity;
  try {
    identity = await completeLink(oidc, {
      pending,
      redirectUri: config.redirectUri,
      query: req.query,
    });
  } catch (error) {
    return flashTo(
      req,
      res,
      "/account",
      `Échange du code refusé : ${error.message}`,
      "error",
    );
  }
  const user = userOf(req);
  // Le cas « conflit » du guide : un compte Fata ne peut être lié qu'à un seul
  // compte local, vérifié dans la transaction qui écrit la liaison.
  const takenBy = await store.transaction((state) => {
    const other = state.users.find(
      (u) =>
        u.id !== user.id &&
        u.fata?.sub === identity.sub &&
        u.fata?.iss === identity.iss,
    );
    if (other) return other;
    state.users.find((u) => u.id === user.id).fata = {
      ...identity,
      linkedAt: new Date().toISOString(),
    };
    return null;
  });
  if (takenBy)
    return flashTo(
      req,
      res,
      "/account",
      `Ce compte Fata est déjà lié à ${takenBy.name}.`,
      "error",
    );
  flashTo(req, res, "/account", `Compte Fata lié (sub ${identity.sub}).`);
});

const projectsOf = (req) =>
  store.state.projects.filter((project) => project.userId === userOf(req).id);
const canSubmit = (req) => !!userOf(req).fata && !!challengeOf(req);
const contextOf = (req) => ({
  userId: userOf(req).id,
  subject: userOf(req).fata?.sub ?? null,
  challengeId: challengeOf(req),
});
/** Enregistre l'action et sa ligne d'outbox dans la même transaction, puis livre sans attendre le tick. */
const record = async (req, res, mutate) => {
  const row = await store.transaction((state) => {
    const action = mutate(state);
    return (
      action &&
      enqueue(state, { ...contextOf(req), ...action }, config.requirementIds)
    );
  });
  if (row) outbox.attempt(row.id).catch(console.error);
  res.redirect(row ? "/outbox" : "/projects");
};

app.get("/projects", requireUser, (req, res) =>
  render(
    req,
    res,
    "Projets",
    projectsPage({
      user: userOf(req),
      projects: projectsOf(req),
      requirementIds: config.requirementIds,
      canSubmit: canSubmit(req),
    }),
  ),
);

app.post("/projects", requireUser, (req, res) => {
  const milestones = String(req.body.milestones ?? "")
    .split("\n")
    .map((title) => title.trim())
    .filter(Boolean);
  if (milestones.length < 3)
    return flashTo(
      req,
      res,
      "/projects",
      "Un projet a au moins 3 jalons.",
      "error",
    );
  const occurredAtMs = Date.parse(
    String(req.body.occurredAt ?? "").trim() || new Date().toISOString(),
  );
  if (Number.isNaN(occurredAtMs))
    return flashTo(
      req,
      res,
      "/projects",
      "Date de l'action invalide.",
      "error",
    );
  const occurredAt = new Date(occurredAtMs).toISOString();
  return record(req, res, (state) => {
    const project = {
      id: newId(),
      userId: userOf(req).id,
      title: String(req.body.title ?? "").trim() || "Sans titre",
      description: String(req.body.description ?? "").trim(),
      milestones: milestones.map((title) => ({
        id: newId(),
        title,
        validatedAt: null,
      })),
      proofs: [],
      createdAt: occurredAt,
    };
    state.projects.push(project);
    return {
      projectId: project.id,
      action: "projectCreated",
      entityId: project.id,
      occurredAt,
    };
  });
});

const isWebUrl = (value) => /^https?:$/.test(URL.parse(value)?.protocol ?? "");

app.post("/projects/:projectId/proofs", requireUser, (req, res) => {
  if (!isWebUrl(String(req.body.url ?? "")))
    return flashTo(
      req,
      res,
      "/projects",
      "L'URL de la preuve doit être http(s).",
      "error",
    );
  return record(req, res, (state) => {
    const project = state.projects.find((p) => p.id === req.params.projectId);
    if (!project) return null;
    const occurredAt = new Date().toISOString();
    const proof = {
      id: newId(),
      url: String(req.body.url ?? ""),
      description: String(req.body.description ?? ""),
      createdAt: occurredAt,
    };
    project.proofs.push(proof);
    return {
      projectId: project.id,
      action: "proofAdded",
      entityId: proof.id,
      occurredAt,
    };
  });
});

app.post(
  "/projects/:projectId/milestones/:milestoneId/validate",
  requireUser,
  (req, res) =>
    record(req, res, (state) => {
      const project = state.projects.find((p) => p.id === req.params.projectId);
      const milestone = project?.milestones.find(
        (m) => m.id === req.params.milestoneId,
      );
      if (!milestone || milestone.validatedAt) return null;
      milestone.validatedAt = new Date().toISOString();
      return {
        projectId: project.id,
        action: "milestoneValidated",
        entityId: milestone.id,
        occurredAt: milestone.validatedAt,
      };
    }),
);

app.get("/outbox", requireUser, (req, res) =>
  render(
    req,
    res,
    "Outbox",
    outboxPage({
      rows: [...store.state.outbox].reverse(),
      networkCut: outbox.networkCut,
      tokenExpiresAt: tokens.expiresAt,
    }),
  ),
);
app.post("/outbox/network", requireUser, (_req, res) => {
  outbox.networkCut = !outbox.networkCut;
  res.redirect("/outbox");
});
app.post("/outbox/expire-token", requireUser, (_req, res) => {
  tokens.corrupt();
  res.redirect("/outbox");
});
app.post("/outbox/:rowId/retry", requireUser, async (req, res) => {
  await outbox.retryNow(req.params.rowId);
  res.redirect("/outbox");
});
app.post("/outbox/:rowId/different-body", requireUser, async (req, res) => {
  await outbox.attempt(req.params.rowId, { drill: "differentBody" });
  res.redirect("/outbox");
});

app.get("/healthz", (_req, res) =>
  res.json({ ok: true, issuer: oidc.serverMetadata().issuer }),
);

outbox.start();
app.listen(config.port, () => {
  console.log(
    `Partner demo on http://127.0.0.1:${config.port} — Fata issuer ${config.issuer}, API ${config.apiBase}`,
  );
});
