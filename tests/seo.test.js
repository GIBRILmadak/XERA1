const fs = require("fs");
const path = require("path");
const assert = require("assert");

const {
    generateOrganizationSchema,
    generateWebsiteSchema,
    generateWebApplicationSchema,
    generateProfileSchema,
    generateProjectSchema,
    generateProfessionalPageSchema,
    generateBreadcrumbSchema
} = require("../server/seo-helpers");

console.log("--- STARTING SEO & JSON-LD TESTS ---");

// 1. Test llm.txt file
const llmPath = path.join(__dirname, "..", "llm.txt");
assert(fs.existsSync(llmPath), "llm.txt must exist at project root");
const llmContent = fs.readFileSync(llmPath, "utf8");
assert(llmContent.includes("XERA1"), "llm.txt must mention XERA1");
assert(llmContent.includes("Proof of Building"), "llm.txt must mention Proof of Building");
assert(llmContent.includes("Gibril Mad"), "llm.txt must mention CEO Gibril Mad");
assert(llmContent.includes("Ready Kalonda"), "llm.txt must mention CTO Ready Kalonda");
assert(llmContent.includes("Ild Faida"), "llm.txt must mention Secretary Ild Faida");
console.log("✓ llm.txt validated");

// 2. Test robots.txt file
const robotsPath = path.join(__dirname, "..", "robots.txt");
assert(fs.existsSync(robotsPath), "robots.txt must exist at project root");
const robotsContent = fs.readFileSync(robotsPath, "utf8");
assert(robotsContent.includes("User-agent: *"), "robots.txt must contain User-agent: *");
assert(robotsContent.includes("Allow: /"), "robots.txt must allow root");
assert(robotsContent.includes("Sitemap: https://xera1.xyz/sitemap.xml"), "robots.txt must point to sitemap.xml");
console.log("✓ robots.txt validated");

// 3. Test Organization Schema
const org = generateOrganizationSchema();
assert.strictEqual(org["@type"], "Organization");
assert.strictEqual(org.name, "XERA1");
assert.strictEqual(org.url, "https://xera1.xyz/");
assert.strictEqual(org.founder.name, "Gibril Mad");
assert(Array.isArray(org.employee), "Organization must list team members");
console.log("✓ Organization schema validated");

// 4. Test Website Schema
const website = generateWebsiteSchema();
assert.strictEqual(website["@type"], "WebSite");
assert.strictEqual(website.name, "XERA1");
assert.strictEqual(website.url, "https://xera1.xyz/");
assert(website.potentialAction, "WebSite schema must contain SearchAction");
console.log("✓ WebSite schema validated");

// 5. Test WebApplication Schema
const app = generateWebApplicationSchema();
assert.strictEqual(app["@type"], "WebApplication");
assert.strictEqual(app.name, "XERA1");
console.log("✓ WebApplication schema validated");

// 6. Test ProfilePage Schema
const profile = generateProfileSchema({
    id: "test-user-123",
    name: "John Builder",
    username: "johnbuilder",
    bio: "Building innovative software on XERA1",
    avatar: "https://xera1.xyz/icons/logo.png"
}, [
    { id: "arc-1", title: "My First Arc", description: "Arc description" }
]);
assert.strictEqual(profile["@type"], "ProfilePage");
assert.strictEqual(profile.mainEntity["@type"], "Person");
assert.strictEqual(profile.mainEntity.name, "John Builder");
assert(Array.isArray(profile.mainEntity.creatorOf), "Profile schema must list created Arcs");
console.log("✓ ProfilePage schema validated");

// 7. Test Professional Page Schema
const pro = generateProfessionalPageSchema({
    id: "pro-org-123",
    name: "Tech Hub DRC",
    bio: "Leading Innovation Hub in Kinshasa",
    avatar: "https://xera1.xyz/icons/logo.png"
});
assert.strictEqual(pro["@type"], "Organization");
assert.strictEqual(pro.name, "Tech Hub DRC");
console.log("✓ ProfessionalPage schema validated");

// 8. Test Breadcrumb Schema
const breadcrumbs = generateBreadcrumbSchema([
    { name: "Home", url: "/" },
    { name: "Profile", url: "/profile?user=123" }
]);
assert.strictEqual(breadcrumbs["@type"], "BreadcrumbList");
assert.strictEqual(breadcrumbs.itemListElement.length, 2);
console.log("✓ BreadcrumbList schema validated");

// 9. Test API Home handler
const homeHandler = require("../api/home");
const fakeReq = {};
let responseBody = "";
const fakeRes = {
    setHeader: () => {},
    status: function(code) {
        assert.strictEqual(code, 200, "Home route must return status 200");
        return this;
    },
    send: function(body) {
        responseBody = body;
    }
};

homeHandler(fakeReq, fakeRes).then(() => {
    assert(responseBody.includes("<title>"), "Home response must contain <title>");
    assert(responseBody.includes("https://xera1.xyz/"), "Home response must contain canonical URL");
    assert(responseBody.includes('type="application/ld+json"'), "Home response must contain JSON-LD script tag");
    assert(responseBody.includes("XERA1"), "Home response must contain XERA1 brand name");
    console.log("✓ Home route (api/home.js) validated");

    // 10. Test API Profile handler
    const profileHandler = require("../api/profile");
    const fakeProfileReq = { query: { user: "test-user" }, url: "/profile?user=test-user" };
    let profileResponseBody = "";
    const fakeProfileRes = {
        setHeader: () => {},
        status: function(code) {
            assert.strictEqual(code, 200, "Profile route must return status 200");
            return this;
        },
        send: function(body) {
            profileResponseBody = body;
        }
    };

    return profileHandler(fakeProfileReq, fakeProfileRes).then(() => {
        assert(profileResponseBody.includes("<title>"), "Profile response must contain <title>");
        assert(profileResponseBody.includes('rel="canonical"'), "Profile response must contain canonical link");
        assert(profileResponseBody.includes("XERA1"), "Profile response must contain XERA1");
        console.log("✓ Profile route (api/profile.js) validated");

        // 11. Test API Sitemap handler
        const sitemapHandler = require("../api/sitemap");
        const fakeSitemapReq = {};
        let sitemapBody = "";
        const fakeSitemapRes = {
            setHeader: () => {},
            status: function(code) {
                assert.strictEqual(code, 200, "Sitemap route must return status 200");
                return this;
            },
            send: function(body) {
                sitemapBody = body;
            }
        };

        return sitemapHandler(fakeSitemapReq, fakeSitemapRes).then(() => {
            assert(sitemapBody.includes("<?xml"), "Sitemap must be XML");
            assert(sitemapBody.includes("https://xera1.xyz"), "Sitemap must contain canonical base URL");
            assert(sitemapBody.includes("urlset"), "Sitemap must contain urlset tag");
            console.log("✓ Sitemap route (api/sitemap.js) validated");

            console.log("\nALL SEO & JSON-LD TESTS PASSED SUCCESSFULLY!");
        });
    });
}).catch(err => {
    console.error("Test error:", err);
    process.exit(1);
});
