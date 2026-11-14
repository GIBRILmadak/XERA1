/**
 * XERA1 SEO & Structured Data (JSON-LD) Helper Suite
 * Generates Schema.org compliant structured data for Organization, WebSite,
 * WebApplication, ProfilePage, CreativeWork (Project/Arc), Professional Page, and Breadcrumbs.
 */

const BASE_URL = "https://xera1.xyz";
const DOCS_URL = "https://docs.xera1.xyz";
const DEFAULT_LOGO = "https://xera1.xyz/icons/logo.png";

/**
 * Sanitize and format string to prevent HTML/XSS injection in JSON-LD output
 */
function sanitizeString(str) {
    if (!str || typeof str !== "string") return "";
    return str.replace(/["\\]/g, "\\$&").replace(/[\r\n]+/g, " ").trim();
}

/**
 * Convert relative media URLs to absolute public URLs
 */
function toAbsoluteUrl(urlPath, fallback = DEFAULT_LOGO) {
    if (!urlPath || typeof urlPath !== "string") return fallback;
    const trimmed = urlPath.trim();
    if (!trimmed) return fallback;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        return trimmed;
    }
    try {
        return new URL(trimmed, BASE_URL).toString();
    } catch (_) {
        return fallback;
    }
}

/**
 * 1. Organization Schema (XERA1 Official Entity)
 */
function generateOrganizationSchema() {
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${BASE_URL}/#organization`,
        "name": "XERA1",
        "legalName": "XERA1",
        "url": `${BASE_URL}/`,
        "logo": DEFAULT_LOGO,
        "image": DEFAULT_LOGO,
        "description": "XERA1 is a Proof of Building platform that helps developers, students, founders, designers and technology creators document what they build, track their progress and build a reputation based on their actual work.",
        "sameAs": [
            DOCS_URL,
            "https://www.linkedin.com/company/127293975"
        ],
        "knowsLanguage": ["fr", "en"],
        "areaServed": {
            "@type": "AdministrativeArea",
            "name": "Africa, with focus on Francophone Africa and the Democratic Republic of the Congo"
        },
        "founder": {
            "@type": "Person",
            "name": "Gibril Mad",
            "jobTitle": "Founder & CEO"
        },
        "employee": [
            {
                "@type": "Person",
                "name": "Gibril Mad",
                "jobTitle": "Founder & CEO"
            },
            {
                "@type": "Person",
                "name": "Ready Kalonda",
                "jobTitle": "Chief Technology Officer"
            },
            {
                "@type": "Person",
                "name": "Ild Faida",
                "jobTitle": "Secretary & Communications Officer"
            }
        ]
    };
}

/**
 * 2. WebSite Schema (XERA1 Domain Entity)
 */
function generateWebsiteSchema() {
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
            "url": `${BASE_URL}/`,
            "logo": DEFAULT_LOGO
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
 * 3. WebApplication Schema
 */
function generateWebApplicationSchema() {
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
 * 4. ProfilePage Schema (Dynamic Public User Profile)
 */
function generateProfileSchema(user = {}, publicArcs = []) {
    if (!user || (!user.id && !user.username && !user.name)) {
        return null;
    }

    const userId = user.id || user.username || "";
    const name = sanitizeString(user.name || user.username || "Builder XERA1");
    const bio = sanitizeString(user.bio || `Public Proof of Building trajectory for ${name} on XERA1.`);
    const avatar = toAbsoluteUrl(user.avatar || user.avatar_url);
    const profileUrl = `${BASE_URL}/profile?user=${encodeURIComponent(userId)}`;

    const sameAs = [];
    if (user.website) sameAs.push(user.website);
    if (user.github) sameAs.push(user.github.startsWith("http") ? user.github : `https://github.com/${user.github}`);
    if (user.twitter) sameAs.push(user.twitter.startsWith("http") ? user.twitter : `https://x.com/${user.twitter}`);
    if (user.linkedin) sameAs.push(user.linkedin.startsWith("http") ? user.linkedin : `https://linkedin.com/in/${user.linkedin}`);

    const personEntity = {
        "@type": "Person",
        "@id": `${profileUrl}#person`,
        "name": name,
        "identifier": userId,
        "description": bio,
        "image": avatar,
        "url": profileUrl
    };

    if (sameAs.length > 0) {
        personEntity.sameAs = sameAs;
    }

    // Attach public project/arc works if available
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

/**
 * 5. Project / CreativeWork Schema (Dynamic Arc / Project)
 */
function generateProjectSchema(project = {}, creator = {}) {
    if (!project || (!project.id && !project.title)) return null;

    const projId = project.id || "";
    const title = sanitizeString(project.title || "Project");
    const description = sanitizeString(project.description || "Documented project on XERA1 Proof of Building.");
    const creatorId = creator.id || project.user_id || "";
    const creatorName = sanitizeString(creator.name || creator.username || "Builder");
    const projectUrl = `${BASE_URL}/profile?user=${encodeURIComponent(creatorId)}&arc=${encodeURIComponent(projId)}`;
    const mediaUrl = project.media_url || project.cover_image ? toAbsoluteUrl(project.media_url || project.cover_image) : null;

    const schema = {
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        "@id": projectUrl,
        "url": projectUrl,
        "name": title,
        "description": description,
        "creator": {
            "@type": "Person",
            "name": creatorName,
            "url": `${BASE_URL}/profile?user=${encodeURIComponent(creatorId)}`
        }
    };

    if (mediaUrl) schema.image = mediaUrl;
    if (project.created_at) schema.dateCreated = new Date(project.created_at).toISOString();
    if (project.updated_at) schema.dateModified = new Date(project.updated_at).toISOString();

    return schema;
}

/**
 * 6. Professional Page Schema (Organization Entity for Pro Pages)
 */
function generateProfessionalPageSchema(proPage = {}) {
    if (!proPage || (!proPage.id && !proPage.name && !proPage.slug)) return null;

    const pageId = proPage.slug || proPage.id || "";
    const name = sanitizeString(proPage.name || "Professional Page");
    const description = sanitizeString(proPage.description || proPage.bio || `${name} — Professional Page on XERA1.`);
    const logo = proPage.logo || proPage.avatar ? toAbsoluteUrl(proPage.logo || proPage.avatar) : DEFAULT_LOGO;
    const pageUrl = `${BASE_URL}/pagepro?user=${encodeURIComponent(pageId)}`;

    const sameAs = [];
    if (proPage.website) sameAs.push(proPage.website);
    if (proPage.linkedin) sameAs.push(proPage.linkedin);
    if (proPage.twitter) sameAs.push(proPage.twitter);

    const schema = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": pageUrl,
        "url": pageUrl,
        "name": name,
        "description": description,
        "logo": logo,
        "image": logo,
        "parentOrganization": {
            "@type": "Organization",
            "name": "XERA1",
            "url": `${BASE_URL}/`
        }
    };

    if (sameAs.length > 0) schema.sameAs = sameAs;

    return schema;
}

/**
 * 7. BreadcrumbList Schema
 */
function generateBreadcrumbSchema(items = []) {
    if (!Array.isArray(items) || items.length === 0) return null;

    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": items.map((item, index) => ({
            "@type": "ListItem",
            "position": index + 1,
            "name": sanitizeString(item.name),
            "item": item.url ? toAbsoluteUrl(item.url) : BASE_URL
        }))
    };
}

module.exports = {
    BASE_URL,
    DEFAULT_LOGO,
    sanitizeString,
    toAbsoluteUrl,
    generateOrganizationSchema,
    generateWebsiteSchema,
    generateWebApplicationSchema,
    generateProfileSchema,
    generateProjectSchema,
    generateProfessionalPageSchema,
    generateBreadcrumbSchema
};
