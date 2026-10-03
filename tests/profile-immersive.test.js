const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("profile-personal.html", "utf8");
const source = fs.readFileSync("js/app-supabase.js", "utf8");
const styles = fs.readFileSync("css/style.css", "utf8");

assert.match(html, /profile-skeleton--initial[\s\S]*?aria-busy="true"/);
assert.match(html, /profile-skeleton-feed/);
assert.match(source, /function bindProfileImmersiveMedia\(container\)/);
assert.match(source, /\{ profileOnly: true \}/);
assert.match(source, /getUserContentLocal\(profileOnlyUserId\)/);
assert.match(source, /authorId === profileOnlyUserId/);
assert.match(source, /allContents = allContents\.slice\(clickedIndex\)/);
assert.match(source, /allContents = await waitForImmersiveFeedContent\(\)/);
assert.match(
    source,
    /class="\$\{courageClass\} immersive-courage-btn"[^>]*aria-label="Encourager cette publication"/,
);
assert.doesNotMatch(
    source,
    /class="\$\{courageClass\} immersive-courage-btn"[^>]*title="Encourager"/,
);
assert.match(
    styles,
    /#immersive-overlay \.post-stats \.immersive-courage-btn\.encouraged/,
);
assert.match(
    styles,
    /#immersive-overlay[\s\S]*?scroll-snap-type:\s*y mandatory/,
);
assert.match(styles, /\.immersive-post\s*\{[\s\S]*?scroll-snap-align:\s*start/);
assert.match(styles, /profile-container\.profile-content-enter/);

console.log("profile immersive tests passed");
