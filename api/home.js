const fs = require("fs");
const path = require("path");
const {
    generateOrganizationSchema,
    generateWebsiteSchema,
    generateWebApplicationSchema
} = require("../server/seo-helpers");

module.exports = async (req, res) => {
    let title = "XERA1 — Proof of Building Platform for Developers & Builders";
    let description =
        "XERA1 is a Proof of Building platform that helps developers, students, founders, designers and technology creators document what they build, track progress, and build a reputation based on actual work.";
    let keywords =
        "XERA1, Proof of Building, developer portfolio, builder reputation, technical progress, project documentation, project evidence, verifiable achievements";
    let image = "https://xera1.xyz/icons/logo.png";
    let url = "https://xera1.xyz/";

    try {
        const distPath = path.join(process.cwd(), "client", "dist", "index.html");
        const rootPath = path.join(process.cwd(), "index.html");
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

        // Données structurées JSON-LD combinées (Organization, WebSite, WebApplication)
        const combinedSchemas = [
            generateOrganizationSchema(),
            generateWebsiteSchema(),
            generateWebApplicationSchema()
        ];
        const jsonLdScript = `<script type="application/ld+json">\n${JSON.stringify(combinedSchemas, null, 2)}\n</script>`;

        html = html.replace(/<title>.*?<\/title>/is, `<title>${title}</title>`);
        html = injectCanonical(html, url);
        html = injectMeta(html, "keywords", keywords, true);
        html = injectMeta(html, "description", description, true);
        html = injectMeta(html, "og:site_name", "XERA1");
        html = injectMeta(html, "og:type", "website");
        html = injectMeta(html, "og:title", title);
        html = injectMeta(html, "og:description", description);
        html = injectMeta(html, "og:image", image);
        html = injectMeta(html, "og:url", url);
        html = injectMeta(html, "twitter:title", title, true);
        html = injectMeta(html, "twitter:description", description, true);
        html = injectMeta(html, "twitter:image", image, true);
        html = injectMeta(html, "twitter:card", "summary_large_image", true);

        // Inject JSON-LD
        html = html.replace("</head>", `${jsonLdScript}\n</head>`);

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
        return res.status(200).send(html);
    } catch (error) {
        const distPath = path.join(process.cwd(), "client", "dist", "index.html");
        const rootPath = path.join(process.cwd(), "index.html");
        const fallbackPath = fs.existsSync(distPath) ? distPath : rootPath;
        return res.status(200).send(fs.readFileSync(fallbackPath, "utf8"));
    }
};
