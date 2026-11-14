# Démo partenaire Fata

_English below._

Une application partenaire minimale, à lire comme implémentation de référence
des deux obligations du guide d'intégration :

1. **Lier le compte Fata** de l'apprenant (« Connecter mon compte Fata »,
   OpenID Connect, code + PKCE) et conserver son `sub` ;
2. **Transmettre chaque action** comme _action completion_ — un appel
   `POST /api/v1/action-completions` authentifié en `client_credentials`,
   idempotent, rejoué jusqu'au succès depuis une file durable.

Tout l'état (utilisateurs, liaisons, projets, file d'attente) tient dans un
`data.json` écrit atomiquement ; pas de base de données, pas de build. Le
contrat complet est dans [`docs/partner/CONTRACT.fr.md`](../../docs/partner/CONTRACT.fr.md).

## Lancer en cinq minutes

Prérequis : Node ≥ 22.

```bash
cp .env.example .env   # puis renseigner CLIENT_ID / CLIENT_SECRET / CHALLENGE_ID / REQUIREMENT_IDS
npm install
npm start              # http://127.0.0.1:4312
```

| Variable                     | Rôle                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `FATA_ISSUER`                | Base de l'issuer OIDC : `https://fata.app/oidc` en production                     |
| `FATA_API_BASE`              | Base de l'API : `https://fata.app/api`                                            |
| `CLIENT_ID`, `CLIENT_SECRET` | Le client OAuth remis par Fata                                                    |
| `REDIRECT_URI`               | Doit être enregistrée **à l'identique** sur le client                             |
| `CHALLENGE_ID`               | Challenge par défaut ; `/context?challengeId=…` le remplace pour la session       |
| `REQUIREMENT_IDS`            | Les identifiants des étapes du challenge, dans l'ordre projet créé, preuve, jalon |

**Contre la production** — Fata vous remet un client (`client_id`, secret,
`REDIRECT_URI` enregistrée) et un challenge de test non listé avec ses
`requirementId`. Il n'y a pas d'environnement de staging : la recette se fait
sur la production, avec des comptes apprenants de test.

**Contre l'émulateur** (depuis le monorepo Fata) — `pnpm dev` à la racine,
avec des secrets `PARTNER_*` jetables dans `functions/.secret.local` (voir
`docs/PARTNER_INTEGRATIONS.md`) ; l'issuer et l'API sont servis par l'émulateur
hosting sur `:5000`, ce que `.env.example` vise déjà. Les documents du client et
du challenge de `.env.example` se créent en une commande :

```bash
PARTNER_DEMO_SEED=1 pnpm --filter e2e exec playwright test --project=partner-demo --grep seed
```

La page de consentement est l'application Fata elle-même, servie par hosting :
`NODE_ENV=development pnpm --filter mobile build` avant `pnpm dev` (sans
`NODE_ENV=development`, le bundle vise la production Firebase, pas les
émulateurs), puis inscrivez un apprenant au
challenge sur `http://127.0.0.1:5000/challenge/demo-challenge`.

## Le parcours nominal

1. `/login` — choisir un utilisateur local (Alice, Bob). Pas de vraie
   authentification : le sujet est la _liaison_, pas la connexion.
2. `/context?challengeId=…` — l'URL que le bouton « Continuer sur {partenaire} »
   de Fata appelle (`continueUrl` + `?challengeId=`). Le challenge reste en
   session et s'affiche dans l'en-tête de chaque page : c'est ce contexte qui
   doit survivre jusqu'à l'envoi.
3. `/account` → « Connecter mon compte Fata » → `/auth/fata` →
   le chemin de `REDIRECT_URI` (par défaut `/auth/fata/callback`). On stocke
   `{ iss, sub, preferred_username }`. Un `sub`
   déjà lié à un autre utilisateur local est refusé.
4. `/projects` — créer un projet (≥ 3 jalons), ajouter une preuve, valider un
   jalon. Chaque action est enregistrée **et** mise en file dans la même
   transaction, avec le `requirementId` que `REQUIREMENT_IDS` lui associe.
5. `/outbox` — le worker : statut, tentatives, dernière réponse (`code`,
   `requestId`), `eventId` renvoyé par Fata, et les boutons des exercices.

Vocabulaire générique ↔ XERA1 :

| Ici          | XERA1  | Action               | `REQUIREMENT_IDS[i]` |
| ------------ | ------ | -------------------- | -------------------- |
| projet       | ARC    | `projectCreated`     | 0                    |
| preuve       | preuve | `proofAdded`         | 1                    |
| jalon validé | jalon  | `milestoneValidated` | 2                    |

`occurredAt` est l'heure de l'action **chez le partenaire**, en UTC. Pour un
projet antérieur au challenge, envoyez l'heure à laquelle l'apprenant l'a
sélectionné pour le challenge (le formulaire a un champ pour la surcharger).

## Comment c'est construit

| Fichier              | Rôle                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/fata/oidc.js`   | Découverte, URL d'autorisation (PKCE S256, `state`, `nonce` — tous obligatoires), échange du code, `userinfo` |
| `src/fata/token.js`  | Cache du jeton `client_credentials`, renouvelé avant `expires_in`, invalidé sur 401                           |
| `src/fata/outbox.js` | File durable + worker : backoff exponentiel, table des statuts du contrat, clé d'idempotence stable           |
| `src/store.js`       | `data.json` : `transaction(fn)` = écriture complète, fichier temporaire + `rename`                            |
| `src/server.js`      | Express, session cookie, les pages                                                                            |

Table des statuts (`decide()` dans `outbox.js`) :

| Réponse                   | Comportement                                                                    |
| ------------------------- | ------------------------------------------------------------------------------- |
| 2xx                       | livré, `eventId` conservé                                                       |
| 401                       | renouveler le jeton **une fois**, renvoyer ; second 401 → arrêt (`credentials`) |
| 403                       | arrêt : lien révoqué ou scope manquant, l'apprenant doit relier                 |
| 400, 404                  | arrêt : requête ou configuration à corriger                                     |
| 409                       | arrêt et drapeau : même clé, corps différent                                    |
| 422                       | arrêt et drapeau : action refusée (fenêtre, inscription, date limite)           |
| 429, 5xx, réseau, timeout | nouvelle tentative, backoff 2 s → 5 min (`Retry-After` respecté)                |

Clé d'idempotence : `${challengeId}:${action}:${entityId}` — stable par
événement partenaire et par challenge, jamais régénérée.

## Les exercices (contrat §4, « tests à réaliser ensemble »)

| Exercice                      | Comment                                                                                                  | Attendu                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Liaison, même `sub` au relien | `/account`, relier deux fois                                                                             | Même `sub`                                                    |
| Conflit de compte             | Se connecter en Bob, lier le même compte Fata                                                            | « déjà lié à Alice », aucune écriture                         |
| Rejeu                         | `/outbox`, « Renvoyer (même corps) » sur une ligne livrée                                                | 200, `rejeu : même eventId`                                   |
| Même clé, corps différent     | « Renvoyer avec un autre corps »                                                                         | 409 `idempotency_conflict`                                    |
| Coupure réseau                | « Simuler une coupure réseau », puis une action, puis « Rétablir le réseau » et « Réessayer maintenant » | Ligne `pending` avec backoff, rien ne part, puis livrée       |
| Jeton expiré                  | « Faire expirer mon jeton », puis une action                                                             | Livrée en une tentative, note `401 → jeton renouvelé, renvoi` |
| Action hors fenêtre           | Créer un projet avec une date antérieure au challenge                                                    | 422 `outside_window`, ligne `failed`                          |
| Lien révoqué                  | Faire révoquer la liaison côté Fata, puis une action                                                     | 403 `link_revoked`                                            |
| Mauvais `requirementId`       | `REQUIREMENT_IDS` faux dans `.env`                                                                       | 404 `unknown_requirement`                                     |
| Date limite dépassée          | Challenge dont `closeAt` est passé                                                                       | 422 `receipt_deadline_passed`                                 |

Chaque ligne d'outbox garde son historique (statut, `code`, `requestId`) : le
`requestId` est ce que le support Fata vous demandera.

## Tests

`npm test` (`node --test`, sans dépendance) couvre la file, la table des
statuts, la clé d'idempotence, le cache de jeton et la construction PKCE. Côté
Fata, `e2e/tests/partner-demo.spec.ts` pilote cette démo contre l'émulateur.

---

# Fata partner demo

A minimal partner application, meant to be read as the reference implementation
of the two obligations in the integration guide:

1. **Link the learner's Fata account** ("Connect my Fata account", OpenID
   Connect authorization code + PKCE) and keep its `sub`;
2. **Deliver every action** as an _action completion_ — one
   `POST /api/v1/action-completions` call, `client_credentials`
   authentication, idempotent, retried from a durable outbox until it succeeds.

All state (users, links, projects, outbox) lives in one atomically written
`data.json`; no database, no build step. The full contract is
[`docs/partner/CONTRACT.md`](../../docs/partner/CONTRACT.md).

## Run it in five minutes

Requires Node ≥ 22.

```bash
cp .env.example .env   # then fill in CLIENT_ID / CLIENT_SECRET / CHALLENGE_ID / REQUIREMENT_IDS
npm install
npm start              # http://127.0.0.1:4312
```

| Variable                     | Role                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `FATA_ISSUER`                | OIDC issuer base: `https://fata.app/oidc` in production                                  |
| `FATA_API_BASE`              | API base: `https://fata.app/api`                                                         |
| `CLIENT_ID`, `CLIENT_SECRET` | The OAuth client Fata handed you                                                         |
| `REDIRECT_URI`               | Must match the client's registered redirect URI **exactly**                              |
| `CHALLENGE_ID`               | Default challenge; `/context?challengeId=…` overrides it for the session                 |
| `REQUIREMENT_IDS`            | The challenge's step ids, in the order project created, proof added, milestone validated |

**Against production** — Fata gives you a client (`client_id`, secret,
registered `REDIRECT_URI`) and an unlisted test challenge with its
`requirementId`s. There is no staging environment: acceptance runs on
production with test learner accounts.

**Against the emulator** (from the Fata monorepo) — `pnpm dev` at the root,
with throwaway `PARTNER_*` secrets in `functions/.secret.local` (see
`docs/PARTNER_INTEGRATIONS.md`); the issuer and API are served by the hosting
emulator on `:5000`, which `.env.example` already targets. The client and
challenge documents from `.env.example` are one command away:

```bash
PARTNER_DEMO_SEED=1 pnpm --filter e2e exec playwright test --project=partner-demo --grep seed
```

The consent page is the Fata app itself, served by hosting: run
`NODE_ENV=development pnpm --filter mobile build` before `pnpm dev` (without
`NODE_ENV=development` the bundle targets production Firebase, not the
emulators), then register a learner for the
challenge at `http://127.0.0.1:5000/challenge/demo-challenge`.

## The happy path

1. `/login` — pick a local user (Alice, Bob). No real authentication: the
   point is the _link_, not the login.
2. `/context?challengeId=…` — what Fata's "Continue on {partner}" button hits
   (`continueUrl` + `?challengeId=`). The challenge stays in the session and is
   shown in every page header: that context has to survive until delivery.
3. `/account` → "Connect my Fata account" → `/auth/fata` →
   the path of `REDIRECT_URI` (`/auth/fata/callback` by default). Stores
   `{ iss, sub, preferred_username }`. A `sub`
   already linked to another local user is refused.
4. `/projects` — create a project (≥ 3 milestones), add a proof, validate a
   milestone. Each action is saved **and** enqueued in one transaction, with the
   `requirementId` that `REQUIREMENT_IDS` maps it to.
5. `/outbox` — the worker's view: status, attempts, last response (`code`,
   `requestId`), Fata's `eventId`, and the drill buttons.

Generic vocabulary ↔ XERA1:

| Here                | XERA1  | Action               | `REQUIREMENT_IDS[i]` |
| ------------------- | ------ | -------------------- | -------------------- |
| project             | ARC    | `projectCreated`     | 0                    |
| proof               | preuve | `proofAdded`         | 1                    |
| validated milestone | jalon  | `milestoneValidated` | 2                    |

`occurredAt` is the time of the action **on the partner's platform**, in UTC.
For a project that predates the challenge, send the time the learner selected it
for the challenge (the form has a field to override it).

## How it is built

| File                 | Role                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/fata/oidc.js`   | Discovery, authorization URL (PKCE S256, `state`, `nonce` — all mandatory), code exchange, `userinfo` |
| `src/fata/token.js`  | `client_credentials` token cache, refreshed before `expires_in`, invalidated on 401                   |
| `src/fata/outbox.js` | Durable outbox + worker: exponential backoff, the contract's status table, stable idempotency key     |
| `src/store.js`       | `data.json`: `transaction(fn)` = whole-file write, temp file + `rename`                               |
| `src/server.js`      | Express, cookie session, the pages                                                                    |

Status table (`decide()` in `outbox.js`):

| Response                   | Behaviour                                                               |
| -------------------------- | ----------------------------------------------------------------------- |
| 2xx                        | delivered, `eventId` kept                                               |
| 401                        | refresh the token **once**, resend; a second 401 → stop (`credentials`) |
| 403                        | stop: link revoked or scope missing, the learner has to re-link         |
| 400, 404                   | stop: request or configuration to fix                                   |
| 409                        | stop and flag: same key, different body                                 |
| 422                        | stop and flag: action rejected (window, registration, deadline)         |
| 429, 5xx, network, timeout | retry, backoff 2 s → 5 min (`Retry-After` honoured)                     |

Idempotency key: `${challengeId}:${action}:${entityId}` — stable per partner
event and per challenge, never regenerated.

## The drills (contract §4, "tests to run together")

| Drill                       | How                                                                                           | Expected                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Link, same `sub` on re-link | `/account`, link twice                                                                        | Same `sub`                                                     |
| Account conflict            | Log in as Bob, link the same Fata account                                                     | "already linked to Alice", nothing written                     |
| Replay                      | `/outbox`, "Renvoyer (même corps)" on a delivered row                                         | 200, `rejeu : même eventId`                                    |
| Same key, different body    | "Renvoyer avec un autre corps"                                                                | 409 `idempotency_conflict`                                     |
| Network cut                 | "Simuler une coupure réseau", an action, then "Rétablir le réseau" and "Réessayer maintenant" | Row `pending` with backoff, nothing leaves, then delivered     |
| Expired token               | "Faire expirer mon jeton", then an action                                                     | Delivered in one attempt, note `401 → jeton renouvelé, renvoi` |
| Out-of-window action        | Create a project dated before the challenge                                                   | 422 `outside_window`, row `failed`                             |
| Revoked link                | Have the link revoked on Fata's side, then an action                                          | 403 `link_revoked`                                             |
| Wrong `requirementId`       | Wrong `REQUIREMENT_IDS` in `.env`                                                             | 404 `unknown_requirement`                                      |
| Receipt deadline passed     | A challenge whose `closeAt` is in the past                                                    | 422 `receipt_deadline_passed`                                  |

Every outbox row keeps its history (status, `code`, `requestId`): the
`requestId` is what Fata support will ask you for.

## Tests

`npm test` (`node --test`, no dependencies) covers the outbox, the status
table, the idempotency key, the token cache and the PKCE request. On Fata's
side, `e2e/tests/partner-demo.spec.ts` drives this demo against the emulator.
