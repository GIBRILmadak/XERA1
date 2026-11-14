const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
const {
    generateProfileSchema,
    generateProjectSchema,
    generateProfessionalPageSchema,
    generateBreadcrumbSchema,
    toAbsoluteUrl,
    sanitizeString
} = require("../server/seo-helpers");

require("dotenv").config();
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

const DEFAULT_IMAGE = "https://xera1.xyz/icons/logo.png";

module.exports = async (req, res) => {
    const userId = req.query.id || req.query.user;
    const arcId = req.query.arc;
    const dayNumber = req.query.day;
    const postId = req.query.post;
    const isPagePro = (req.url || req.path || "").includes("pagepro");

    let title = "XERA1 | Builder Trajectory & Proof of Building";
    let description =
        "Document software execution, track project progress, and build verifiable reputation on XERA1.";
    let keywords =
        "XERA1, Proof of Building, developer portfolio, project trajectory, software execution, build in public";
    let image = DEFAULT_IMAGE;
    let url = isPagePro
        ? `https://xera1.xyz/pagepro${userId ? "?user=" + encodeURIComponent(userId) : ""}`
        : `https://xera1.xyz/profile${userId ? "?user=" + encodeURIComponent(userId) : ""}`;

    let userObj = null;
    let publicArcs = [];
    let jsonLdSchemas = [];

    if (userId) {
        try {
            // Fetch public user profile
            const { data: user } = await supabase
                .from("users")
                .select("id, name, username, bio, avatar, title, website, github, twitter, linkedin")
                .eq("id", userId)
                .maybeSingle();

            if (user) {
                userObj = user;
                const displayName = user.name || user.username || "Builder";
                title = isPagePro
                    ? `${displayName} — Professional Page | XERA1`
                    : `${displayName} — Developer Profile & Trajectory | XERA1`;
                description =
                    user.bio ||
                    `Explore the Proof of Building trajectory and project progress of ${displayName} on XERA1.`;
                image = toAbsoluteUrl(user.avatar);

                // Fetch public Arcs for this user
                const { data: arcs } = await supabase
                    .from("arcs")
                    .select("id, title, description, created_at, updated_at")
                    .eq("user_id", userId)
                    .limit(10);

                if (arcs) {
                    publicArcs = arcs;
                }

                // If specific Arc requested
                if (arcId) {
                    const specificArc = publicArcs.find(a => String(a.id) === String(arcId));
                    if (specificArc) {
                        title = `${specificArc.title} — ${displayName} | XERA1 Arc`;
                        if (specificArc.description) {
                            description = specificArc.description;
                        }
                        url = `${url}&arc=${encodeURIComponent(arcId)}`;
                        const arcSchema = generateProjectSchema(specificArc, user);
                        if (arcSchema) jsonLdSchemas.push(arcSchema);
                    }
                }

                if (isPagePro) {
                    const proSchema = generateProfessionalPageSchema({
                        id: user.id,
                        name: displayName,
                        description: user.bio,
                        logo: user.avatar,
                        website: user.website,
                        twitter: user.twitter,
                        linkedin: user.linkedin
                    });
                    if (proSchema) jsonLdSchemas.push(proSchema);
                } else {
                    const profileSchema = generateProfileSchema(user, publicArcs);
                    if (profileSchema) jsonLdSchemas.push(profileSchema);
                }

                // Generate Breadcrumbs
                const breadcrumbs = [
                    { name: "Home", url: "/" },
                    { name: "Discover", url: "/#discover" },
                    { name: displayName, url: isPagePro ? `/pagepro?user=${encodeURIComponent(userId)}` : `/profile?user=${encodeURIComponent(userId)}` }
                ];
                if (arcId) {
                    breadcrumbs.push({ name: "Arc", url: url });
                }
                const breadcrumbSchema = generateBreadcrumbSchema(breadcrumbs);
                if (breadcrumbSchema) jsonLdSchemas.push(breadcrumbSchema);
            }
        } catch (e) {
            console.error("Erreur SSR Profile Metadata:", e);
        }
    }

    try {
        const distPath = path.join(process.cwd(), "client", "dist", "index.html");
        const rootPath = path.join(process.cwd(), "profile.html");
        const filePath = fs.existsSync(distPath) ? distPath : rootPath;
        let html = fs.readFileSync(filePath, "utf8");

        const injectMeta = (html, property, content, isName = false) => {
            const attr = isName ? "name" : "property";
            const regex = new RegExp(
                `<meta[^>]*?${attr}=["']${property}["'][^>]*?content=["'].*?["'][^>]*?>`,
                "is",
            );
            const newTag = `<meta ${attr}="${property}" content="${content.replace(/"/g, "&quot;")}" />`;
            return regex.test(html)
                ? html.replace(regex, newTag)
                : html.replace("</head>", `${newTag}\n</head>`);
        };

        const injectCanonical = (html, canonicalUrl) => {
            const linkTag = `<link rel="canonical" href="${canonicalUrl}" />`;
            if (html.includes('rel="canonical"')) {
                return html.replace(/<link[^>]*?rel=["']canonical["'][^>]*?>/is, linkTag);
            }
            return html.replace("</head>", `${linkTag}\n</head>`);
        };

        html = html.replace(/<title>.*?<\/title>/is, `<title>${title}</title>`);
        html = injectCanonical(html, url);

        html = injectMeta(html, "keywords", keywords, true);
        html = injectMeta(html, "description", description, true);

        html = injectMeta(html, "og:site_name", "XERA1");
        html = injectMeta(html, "og:type", "profile");
        html = injectMeta(html, "og:title", title);
        html = injectMeta(html, "og:description", description);
        html = injectMeta(html, "og:image", image);
        html = injectMeta(html, "og:url", url);

        html = injectMeta(html, "twitter:title", title, true);
        html = injectMeta(html, "twitter:description", description, true);
        html = injectMeta(html, "twitter:image", image, true);
        html = injectMeta(html, "twitter:card", "summary_large_image", true);

        // Inject JSON-LD if schemas exist
        if (jsonLdSchemas.length > 0) {
            const jsonLdScript = `<script type="application/ld+json">\n${JSON.stringify(jsonLdSchemas, null, 2)}\n</script>`;
            html = html.replace("</head>", `${jsonLdScript}\n</head>`);
        }

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
        return res.status(200).send(html);
    } catch (error) {
        const distPath = path.join(process.cwd(), "client", "dist", "index.html");
        const rootPath = path.join(process.cwd(), "profile.html");
        const fallbackPath = fs.existsSync(distPath) ? distPath : rootPath;
        return res.status(200).send(fs.readFileSync(fallbackPath, "utf8"));
    }
};
