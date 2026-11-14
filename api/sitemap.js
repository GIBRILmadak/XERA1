const { createClient } = require("@supabase/supabase-js");
if (!globalThis.WebSocket) {
    globalThis.WebSocket = class DummyWebSocket {};
}
const SUPABASE_URL =
    process.env.SUPABASE_URL || "https://ssbuagqwjptyhavinkxg.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
});

module.exports = async (req, res) => {
    const baseUrl = "https://xera1.xyz";

    // Pages statiques
    const staticPages = [
        "",
        "/login",
        "/analytics",
        "/subscription-plans",
        "/credits",
        "/verification",
        "/cgu",
        "/privacy",
        "/premium-plans",
        "/create-stream",
        "/creator-dashboard",
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    // Ajouter les pages statiques
    staticPages.forEach((page) => {
        xml += `
  <url>
    <loc>${baseUrl}${page}</loc>
    <changefreq>daily</changefreq>
    <priority>${page === "" ? "1.0" : "0.8"}</priority>
  </url>`;
    });

    try {
        // Récupérer les profils utilisateurs publics
        const { data: users, error: userError } = await supabase
            .from("users")
            .select("id, updated_at")
            .limit(1000);

        if (!userError && users) {
            users.forEach((user) => {
                const lastMod = user.updated_at
                    ? new Date(user.updated_at).toISOString().split("T")[0]
                    : new Date().toISOString().split("T")[0];
                xml += `
  <url>
    <loc>${baseUrl}/profile?user=${user.id}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
            });
        }

        // Récupérer les ARCs publics
        const { data: arcs, error: arcError } = await supabase
            .from("arcs")
            .select("id, user_id, updated_at")
            .eq("status", "in_progress")
            .limit(1000);

        if (!arcError && arcs) {
            arcs.forEach((arc) => {
                const lastMod = arc.updated_at
                    ? new Date(arc.updated_at).toISOString().split("T")[0]
                    : new Date().toISOString().split("T")[0];
                xml += `
  <url>
    <loc>${baseUrl}/profile?user=${arc.user_id}&amp;arc=${arc.id}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
            });
        }
    } catch (e) {
        console.error("Erreur génération sitemap dynamic:", e);
    }

    xml += `
</urlset>`;

    res.setHeader("Content-Type", "text/xml");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).send(xml);
};
