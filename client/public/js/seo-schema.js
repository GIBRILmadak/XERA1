/**
 * XERA1 Universal Client-Side JSON-LD & Dynamic Metadata Generator
 * Generates and injects Schema.org structured data, canonical URLs, and Open Graph tags.
 */

(() => {
    const BASE_URL = "https://xera1.xyz";
    const DEFAULT_LOGO = "https://xera1.xyz/icons/logo.png";

    function sanitizeString(str) {
        if (!str || typeof str !== "string") return "";
        return str.replace(/["\\]/g, "\\$&").replace(/[\r\n]+/g, " ").trim();
    }

    function toAbsoluteUrl(urlPath) {
        if (!urlPath || typeof urlPath !== "string") return DEFAULT_LOGO;
        const trimmed = urlPath.trim();
        if (!trimmed) return DEFAULT_LOGO;
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return trimmed;
        }
        try {
            return new URL(trimmed, BASE_URL).toString();
        } catch (_) {
            return DEFAULT_LOGO;
        }
    }

    /**
     * Inject or update JSON-LD script tag in document head
     */
    function injectJsonLd(schemaData, scriptId = "xera1-jsonld") {
        if (!schemaData || typeof document === "undefined") return;

        let script = document.getElementById(scriptId);
        if (!script) {
            script = document.createElement("script");
            script.id = scriptId;
            script.type = "application/ld+json";
            document.head.appendChild(script);
        }
        script.textContent = JSON.stringify(schemaData, null, 2);
    }

    /**
     * Inject or update Canonical URL link in document head
     */
    function setCanonicalUrl(url) {
        if (typeof document === "undefined") return;
        const targetUrl = url ? toAbsoluteUrl(url) : window.location.href;

        let link = document.querySelector('link[rel="canonical"]');
        if (!link) {
            link = document.createElement("link");
            link.rel = "canonical";
            document.head.appendChild(link);
        }
        link.href = targetUrl;
    }

    /**
     * Set dynamic page metadata (Title, Description, Open Graph, Twitter)
     */
    function setPageMetadata({ title, description, image, url, type = "website" }) {
        if (typeof document === "undefined") return;

        const pageTitle = title || "XERA1 — Infrastructure de Proof of Building";
        const pageDesc = description || "Certifiez votre trajectoire, vos jalons et votre exécution de build.";
        const pageImg = toAbsoluteUrl(image);
        const pageUrl = url ? toAbsoluteUrl(url) : window.location.href;

        document.title = pageTitle;

        const updateMeta = (attrName, attrValue, contentValue) => {
            let el = document.querySelector(`meta[${attrName}="${attrValue}"]`);
            if (!el) {
                el = document.createElement("meta");
                el.setAttribute(attrName, attrValue);
                document.head.appendChild(el);
            }
            el.setAttribute("content", contentValue);
        };

        updateMeta("name", "description", pageDesc);
        updateMeta("property", "og:title", pageTitle);
        updateMeta("property", "og:description", pageDesc);
        updateMeta("property", "og:image", pageImg);
        updateMeta("property", "og:url", pageUrl);
        updateMeta("property", "og:type", type);
        updateMeta("name", "twitter:title", pageTitle);
        updateMeta("name", "twitter:description", pageDesc);
        updateMeta("name", "twitter:image", pageImg);
        updateMeta("name", "twitter:card", "summary_large_image");

        setCanonicalUrl(pageUrl);
    }

    /**
     * Organization Schema
     */
    function getOrganizationSchema() {
        return {
            "@context": "https://schema.org",
            "@type": "Organization",
            "@id": `${BASE_URL}/#organization`,
            "name": "XERA1",
            "url": `${BASE_URL}/`,
            "logo": DEFAULT_LOGO,
            "description": "XERA1 is a Proof of Building platform that helps developers, students, founders, designers and technology creators document what they build, track their progress and build a reputation based on their actual work.",
            "sameAs": [
                "https://docs.xera1.xyz",
                "https://www.linkedin.com/company/127293975"
            ],
            "knowsLanguage": ["fr", "en"],
            "areaServed": "Africa, with focus on Francophone Africa and the Democratic Republic of the Congo",
            "founder": {
                "@type": "Person",
                "name": "Gibril Mad",
                "jobTitle": "Founder & CEO"
            },
            "employee": [
                { "@type": "Person", "name": "Gibril Mad", "jobTitle": "Founder & CEO" },
                { "@type": "Person", "name": "Ready Kalonda", "jobTitle": "Chief Technology Officer" },
                { "@type": "Person", "name": "Ild Faida", "jobTitle": "Secretary & Communications Officer" }
            ]
        };
    }

    /**
     * WebSite Schema
     */
    function getWebSiteSchema() {
        return {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "@id": `${BASE_URL}/#website`,
            "name": "XERA1",
            "url": `${BASE_URL}/`,
            "description": "Proof of Building platform for developers, students, founders, designers and technology creators.",
            "inLanguage": ["fr", "en"],
            "publisher": {
                "@type": "Organization",
                "name": "XERA1",
                "url": `${BASE_URL}/`
            },
            "potentialAction": {
                "@type": "SearchAction",
                "target": {
                    "@type": "EntryPoint",
                    "urlTemplate": `${BASE_URL}/?search={search_term_string}`
                },
                "query-input": "required name=search_term_string"
            }
        };
    }

    /**
     * WebApplication Schema
     */
    function getWebApplicationSchema() {
        return {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "@id": `${BASE_URL}/#webapplication`,
            "name": "XERA1",
            "url": `${BASE_URL}/`,
            "applicationCategory": "DeveloperApplication",
            "operatingSystem": "Web",
            "inLanguage": ["fr", "en"],
            "description": "A Proof of Building platform for documenting projects, progress, milestones and evidence of technical work.",
            "author": {
                "@type": "Organization",
                "name": "XERA1",
                "url": `${BASE_URL}/`
            }
        };
    }

    /**
     * ProfilePage Schema
     */
    function getProfileSchema(user = {}, publicArcs = []) {
        if (!user || (!user.id && !user.username && !user.name)) return null;

        const userId = user.id || user.username || "";
        const name = sanitizeString(user.name || user.username || "Builder XERA1");
        const bio = sanitizeString(user.bio || `Public Proof of Building trajectory for ${name} on XERA1.`);
        const avatar = toAbsoluteUrl(user.avatar || user.avatar_url);
        const profileUrl = `${BASE_URL}/profile?user=${encodeURIComponent(userId)}`;

        const personEntity = {
            "@type": "Person",
            "@id": `${profileUrl}#person`,
            "name": name,
            "identifier": userId,
            "description": bio,
            "image": avatar,
            "url": profileUrl
        };

        if (Array.isArray(publicArcs) && publicArcs.length > 0) {
            personEntity.creatorOf = publicArcs.map(arc => ({
                "@type": "CreativeWork",
                "name": sanitizeString(arc.title || "Project"),
                "description": sanitizeString(arc.description || ""),
                "url": `${profileUrl}&arc=${encodeURIComponent(arc.id || "")}`
            }));
        }

        return {
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            "@id": profileUrl,
            "url": profileUrl,
            "name": `${name} — Developer Profile | XERA1`,
            "description": bio,
            "mainEntity": personEntity
        };
    }

    // Expose client API
    window.XeraSeo = {
        injectJsonLd,
        setCanonicalUrl,
        setPageMetadata,
        getOrganizationSchema,
        getWebSiteSchema,
        getWebApplicationSchema,
        getProfileSchema
    };

    // Auto-initialize base schemas on homepage
    if (typeof window !== "undefined" && (window.location.pathname === "/" || window.location.pathname === "/index.html")) {
        setCanonicalUrl(`${BASE_URL}/`);
        injectJsonLd([getOrganizationSchema(), getWebSiteSchema(), getWebApplicationSchema()], "xera1-global-schema");
    }
})();
