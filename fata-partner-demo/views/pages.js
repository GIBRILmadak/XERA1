import { escape } from "./layout.js";

const button = (action, label, extra = "") =>
  `<form class="inline" method="post" action="${action}">${extra}<button type="submit">${label}</button></form>`;

export const loginPage = ({ users }) => `
<div class="card">
  <p>Pas de vraie authentification ici : le sujet de la démo est la <em>liaison</em> avec Fata, pas la connexion au partenaire.</p>
  ${users
    .map(
      (user) =>
        `<form class="inline" method="post" action="/login"><input type="hidden" name="userId" value="${escape(user.id)}"><button class="primary" type="submit">Se connecter en tant que ${escape(user.name)}</button></form> `,
    )
    .join("")}
</div>`;

export const accountPage = ({ user }) => `
<div class="card">
  <h2>Compte Fata</h2>
  ${
    user.fata
      ? `<p>Lié à Fata en tant que <strong>${escape(user.fata.preferred_username ?? "(sans pseudo)")}</strong>.</p>
         <table>
           <tr><th>iss</th><td><code>${escape(user.fata.iss)}</code></td></tr>
           <tr><th>sub</th><td><code>${escape(user.fata.sub)}</code></td></tr>
           <tr><th>lié le</th><td>${escape(user.fata.linkedAt)}</td></tr>
         </table>
         <p class="muted">C'est ce <code>sub</code> que le serveur envoie comme <code>subject</code> à chaque action. La liaison se révoque côté Fata ; la prochaine livraison répondra alors <code>403 link_revoked</code>.</p>
         ${button("/auth/fata", "Relier (même sub attendu)")}`
      : `<p>Aucun compte Fata lié.</p>
         ${button("/auth/fata", "Connecter mon compte Fata")}`
  }
</div>`;

const milestoneRow = (project, milestone) => `
<li>${escape(milestone.title)} —
  ${
    milestone.validatedAt
      ? `<span class="status-delivered">validé le ${escape(milestone.validatedAt)}</span>`
      : button(
          `/projects/${project.id}/milestones/${milestone.id}/validate`,
          "Valider ce jalon",
        )
  }
</li>`;

export const projectsPage = ({ user, projects, requirementIds, canSubmit }) => `
${
  canSubmit
    ? ""
    : `<div class="card flash">Les actions sont enregistrées mais <strong>ne seront pas transmises</strong> : il faut un compte Fata lié (<a href="/account">Compte</a>) et un challenge en contexte (<code>/context?challengeId=…</code>).</div>`
}
<div class="card">
  <h2>Nouveau projet</h2>
  <form method="post" action="/projects">
    <label for="title">Titre</label><input id="title" name="title" required>
    <label for="description">Description</label><textarea id="description" name="description" rows="2"></textarea>
    <label for="milestones">Jalons (un par ligne, au moins 3)</label><textarea id="milestones" name="milestones" rows="3" required>Cadrage
Prototype
Livraison</textarea>
    <label for="occurredAt">Date de l'action (RFC 3339, vide = maintenant)</label>
    <input id="occurredAt" name="occurredAt" placeholder="2026-09-07T14:32:00Z">
    <p class="muted">Un projet antérieur au challenge : Fata attend la date à laquelle l'apprenant l'a <em>sélectionné</em> pour le challenge, pas sa date de création. Une date hors fenêtre est refusée (<code>422 outside_window</code>).</p>
    <p><button class="primary" type="submit">Créer le projet</button> <span class="muted">→ requirement <code>${escape(requirementIds[0] ?? "(non mappé)")}</code></span></p>
  </form>
</div>
${projects
  .map(
    (project) => `
<div class="card">
  <h2>${escape(project.title)}</h2>
  <p class="muted">${escape(project.description)} · créé le ${escape(project.createdAt)}</p>
  <h3>Jalons <span class="muted">→ <code>${escape(requirementIds[2] ?? "(non mappé)")}</code></span></h3>
  <ul>${project.milestones.map((m) => milestoneRow(project, m)).join("")}</ul>
  <h3>Preuves <span class="muted">→ <code>${escape(requirementIds[1] ?? "(non mappé)")}</code></span></h3>
  <ul>${project.proofs.map((p) => `<li><a href="${escape(p.url)}">${escape(p.url)}</a> — ${escape(p.description)}</li>`).join("") || "<li class='muted'>aucune</li>"}</ul>
  <form method="post" action="/projects/${project.id}/proofs">
    <label for="url-${project.id}">URL de la preuve</label><input id="url-${project.id}" name="url" type="url" required placeholder="https://…">
    <label for="desc-${project.id}">Description de la preuve</label><input id="desc-${project.id}" name="description" required>
    <p><button type="submit">Ajouter une preuve</button></p>
  </form>
</div>`,
  )
  .join("")}
${projects.length ? "" : `<p class="muted">Aucun projet pour ${escape(user.name)}.</p>`}`;

const lastCell = (row) =>
  row.last
    ? `<div>${escape(row.last.status || "réseau")} ${row.last.code ? `<code>${escape(row.last.code)}</code>` : ""}</div>
       ${row.last.requestId ? `<div class="muted">requestId <code>${escape(row.last.requestId)}</code></div>` : ""}
       ${row.last.message ? `<div class="muted">${escape(row.last.message)}</div>` : ""}
       ${row.last.note ? `<div class="muted">${escape(row.last.note)}</div>` : ""}`
    : `<span class="muted">—</span>`;

export const outboxPage = ({ rows, networkCut, tokenExpiresAt }) => `
<div class="card">
  <strong>Exercices</strong> (contrat, tests à réaliser ensemble) :
  ${button("/outbox/network", networkCut ? "Rétablir le réseau" : "Simuler une coupure réseau")}
  ${button("/outbox/expire-token", "Faire expirer mon jeton")}
  <span class="muted">réseau : ${networkCut ? "<strong>coupé</strong>" : "ok"} · jeton serveur : ${tokenExpiresAt ? `expire ${escape(new Date(tokenExpiresAt).toISOString())}` : "aucun en cache"}</span>
</div>
<div class="card">
<table>
  <thead><tr><th>Action</th><th>Idempotency-Key</th><th>Statut</th><th>Tentatives</th><th>Dernière réponse</th><th>eventId Fata</th><th></th></tr></thead>
  <tbody>
  ${rows
    .map(
      (row) => `
    <tr data-row="${escape(row.id)}" data-status="${escape(row.status)}">
      <td>${escape(row.action)}<div class="muted"><code>${escape(row.requirementId)}</code><br>${escape(row.occurredAt)}</div></td>
      <td><code>${escape(row.idempotencyKey)}</code></td>
      <td class="status-${escape(row.status)}"><strong>${escape(row.status)}</strong>${row.flag ? `<div class="muted">à traiter : ${escape(row.flag)}</div>` : ""}${row.status === "pending" ? `<div class="muted">prochaine ${escape(row.nextAttemptAt)}</div>` : ""}</td>
      <td>${row.attempts}</td>
      <td>${lastCell(row)}</td>
      <td>${row.eventId ? `<code>${escape(row.eventId)}</code>` : `<span class="muted">—</span>`}</td>
      <td>
        ${button(`/outbox/${row.id}/retry`, row.status === "delivered" ? "Renvoyer (même corps)" : "Réessayer maintenant")}
        ${row.status === "delivered" ? button(`/outbox/${row.id}/different-body`, "Renvoyer avec un autre corps") : ""}
      </td>
    </tr>`,
    )
    .join("")}
  </tbody>
</table>
${rows.length ? "" : `<p class="muted">Outbox vide : créez un projet.</p>`}
</div>`;
