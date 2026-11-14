export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

const STYLE = `
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; color: #1c1c1c; background: #f6f6f4; }
  header { background: #1c1c1c; color: #fff; padding: 0.75rem 1.5rem; display: flex; gap: 1.5rem; align-items: center; flex-wrap: wrap; }
  header a { color: #fff; text-decoration: none; }
  header a.active { text-decoration: underline; }
  header .context { margin-left: auto; font-size: 0.85rem; opacity: 0.85; }
  main { max-width: 64rem; margin: 1.5rem auto; padding: 0 1.5rem; }
  .card { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1rem; }
  .flash { border-left: 4px solid #b58900; }
  .flash.error { border-left-color: #c0392b; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid #eee; vertical-align: top; }
  code { font-size: 0.85em; background: #f0f0ee; padding: 0 0.25em; border-radius: 3px; word-break: break-all; }
  form.inline { display: inline; }
  button { font: inherit; padding: 0.3rem 0.7rem; border-radius: 6px; border: 1px solid #999; background: #fff; cursor: pointer; }
  button.primary { background: #1c1c1c; color: #fff; border-color: #1c1c1c; }
  input, textarea { font: inherit; padding: 0.3rem 0.5rem; border: 1px solid #bbb; border-radius: 6px; width: 100%; box-sizing: border-box; }
  label { display: block; margin: 0.5rem 0 0.2rem; font-weight: 600; }
  .status-pending { color: #b58900; } .status-delivered { color: #2d7d46; } .status-failed { color: #c0392b; }
  .muted { color: #666; }
`;

export const page = ({ title, user, challengeId, flash, path, body }) => {
  const nav = [
    ["/account", "Compte"],
    ["/projects", "Projets"],
    ["/outbox", "Outbox"],
  ]
    .map(
      ([href, label]) =>
        `<a href="${href}" class="${path === href ? "active" : ""}">${label}</a>`,
    )
    .join("");
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${escape(title)} · Partner demo</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${STYLE}</style></head>
<body>
<header>
  <strong>Partner demo</strong>
  ${user ? nav : `<a href="/login">Connexion</a>`}
  <span class="context">
    ${user ? `Utilisateur : <strong>${escape(user.name)}</strong> · ` : ""}
    Challenge Fata en contexte : <code>${escape(challengeId ?? "aucun")}</code>
  </span>
</header>
<main>
  <h1>${escape(title)}</h1>
  ${flash ? `<div class="card flash ${flash.type ?? ""}">${escape(flash.text)}</div>` : ""}
  ${body}
</main>
</body></html>`;
};
