// Remplace le CDN Tailwind (cdn.tailwindcss.com) : CSS généré une fois au
// lieu de ~400 Ko de JS compilant les styles dans chaque navigateur.
// Régénérer après avoir ajouté des classes Tailwind : npm run build:css
module.exports = {
    content: ["./index.html", "./js/**/*.js"],
};
