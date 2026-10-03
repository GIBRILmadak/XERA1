const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("js/profile-workspace.js", "utf8");

assert.match(source, /function getContents\(userId\)/);
assert.match(source, /sources\.push\(profileContext\.contents\)/);
assert.match(source, /if \(!hasMatchingProfileContext\)/);
assert.match(source, /sources\.push\(window\.getUserContentLocal\(userId\) \|\| \[\]\)/);
assert.match(source, /function syncOverviewUpdates\(workspace, contents\)/);
assert.match(source, /workspace\.dataset\.profileActivityRestricted !== "true"/);
assert.match(source, /signature !== workspace\.dataset\.profileContentsSignature/);
assert.match(source, /buildUpdateFeed\(updatesPanel, contents, userId\)/);
assert.match(source, /syncOverviewUpdates\(workspace, contents\)/);
assert.match(source, /root\.addEventListener\("click", function \(event\) \{[\s\S]*?\}, true\)/);
assert.match(source, /event\.preventDefault\(\);\s*setActiveTab\(root, tabTarget\.dataset\.profileTabTarget, true\)/);
assert.match(source, /data-profile-tab-target="projects"/);
assert.match(source, /previewButton\.dataset\.profileProjectPreview = "true"/);
assert.match(source, /updatesButton\.dataset\.profileProjectUpdates = "true"/);

console.log("profile workspace tests passed");
