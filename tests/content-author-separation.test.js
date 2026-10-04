const assert = require("node:assert/strict");
const fs = require("node:fs");

const app = fs.readFileSync("js/app-supabase.js", "utf8");
const config = fs.readFileSync("js/supabase-config.js", "utf8");
const proPages = fs.readFileSync("js/professional-pages.js", "utf8");
const profileWorkspace = fs.readFileSync("js/profile-workspace.js", "utf8");
const migration = fs.readFileSync(
    "sql/20261004_content_author_identity.sql",
    "utf8",
);

assert.match(migration, /author_type IN \('USER', 'PAGE_PRO'\)/);
assert.match(migration, /author_type = 'USER' AND page_id IS NULL AND author_id = user_id/);
assert.match(migration, /author_type = 'PAGE_PRO' AND page_id IS NOT NULL AND author_id = page_id/);
assert.match(migration, /CREATE TRIGGER content_set_author_identity/);

assert.match(app, /\.eq\("author_type", "USER"\)\s*\.in\("author_id", userIds\)\s*\.is\("page_id", null\)/);
assert.match(app, /function getUserContentLocal\(userId\)[\s\S]*?isUserAuthoredContent\(content, userId\)/);
assert.match(app, /function getPageContentLocal\(pageId\)[\s\S]*?isPageProAuthoredContent\(content, pageId\)/);
assert.match(app, /professionalPageContents\.forEach\(\(_contents, pageId\) => \{[\s\S]*?getPageContentLocal\(pageId\)/);
assert.match(app, /data-profile-author-type="\$\{displayUser\.isPage \? "PAGE_PRO" : "USER"\}"/);
assert.match(app, /window\.openProfessionalPageById\('\$\{escapeHtml\(pageId\)\}'\)/);
assert.doesNotMatch(app, /window\.professionalManager\.renderProPage\('\$\{displayUser\.slug\}'\)/);
assert.match(app, /author\.type === "USER" &&\s*window\.currentProfileViewed === author\.id/);

assert.match(config, /\.eq\("author_type", "USER"\)\s*\.eq\("author_id", userId\)\s*\.is\("page_id", null\)/);
assert.match(profileWorkspace, /authorType !== "USER"[\s\S]*?String\(authorId \|\| ""\) !== String\(userId \|\| ""\)/);
assert.match(proPages, /window\.openProfessionalPageById = async function \(pageId\)/);
assert.match(proPages, /\.eq\(isPageId \? "id" : "slug", slugOrId\)/);

console.log("content author separation tests passed");
