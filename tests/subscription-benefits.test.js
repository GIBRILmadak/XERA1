const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { canReceiveSupport } = require("../js/monetization.js");
const { canUserReceiveSupport } = require("../server/monetization-server.js");

const activePlan = {
    plan_status: "active",
    plan_ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

const cases = [
    {
        name: "active Pro can receive support below 1,000 followers",
        user: { ...activePlan, plan: "pro", followers_count: 0 },
        expected: true,
    },
    {
        name: "active Medium can receive support below 1,000 followers",
        user: {
            ...activePlan,
            plan: "medium",
            followers_count: 999,
        },
        expected: true,
    },
    {
        name: "active Medium can receive support with zero followers",
        user: { ...activePlan, plan: "medium", followers_count: 0 },
        expected: true,
    },
    {
        name: "active Medium reaches support eligibility at 1,000 followers",
        user: { ...activePlan, plan: "medium", followers_count: 1000 },
        expected: true,
    },
    {
        name: "expired Pro cannot receive support",
        user: {
            plan: "pro",
            plan_status: "active",
            plan_ends_at: new Date(Date.now() - 1000).toISOString(),
            followers_count: 0,
        },
        expected: false,
    },
    {
        name: "active admin-granted Pro can receive support without an end date",
        user: { plan: "pro", plan_status: "active", followers_count: 0 },
        expected: true,
    },
    {
        name: "Standard cannot receive support",
        user: { ...activePlan, plan: "standard", followers_count: 5000 },
        expected: false,
    },
];

for (const { name, user, expected } of cases) {
    assert.equal(canReceiveSupport(user), expected, `frontend: ${name}`);
    assert.equal(canUserReceiveSupport(user), expected, `server: ${name}`);
}

const planContext = { window: {} };
vm.runInNewContext(
    fs.readFileSync("js/subscription-plans-data.js", "utf8"),
    planContext,
);
const plans = planContext.window.XeraSubscriptionPlansData.PLAN_DEFINITIONS;
const featureText = (plan) =>
    plan.features.map((feature) => feature.text).join(" ");
assert.match(featureText(plans.standard), /badge de vérification bleu/i);
assert.match(featureText(plans.medium), /dès l’activation de l’abonnement/i);
assert.doesNotMatch(featureText(plans.medium), /1 000 abonnés/i);
assert.match(featureText(plans.medium), /personnalisation avancée/i);
assert.match(featureText(plans.medium), /feed multiplié par 1,5/i);
assert.match(featureText(plans.pro), /sans seuil d’abonnés/i);
assert.match(featureText(plans.pro), /tous les avantages medium/i);
assert.match(featureText(plans.pro), /feed multiplié par 5/i);
assert.match(featureText(plans.pro), /HD/i);
assert.equal(
    planContext.window.XeraSubscriptionPlansData.getVisibilityMultiplier(
        "medium",
    ),
    1.5,
);
assert.equal(
    planContext.window.XeraSubscriptionPlansData.getVisibilityMultiplier("pro"),
    5,
);
assert.match(featureText(plans.pro), /lives privés/i);
assert.doesNotMatch(
    featureText(plans.pro),
    /accès anticipé|analytics avancés|export des données/i,
);
assert.match(
    planContext.window.XeraSubscriptionPlansData.FAQ_ITEMS.find(
        (item) => item.id === "commission",
    ).answer,
    /25%/,
);

const staticHtml = fs.readFileSync("subscription-plans.html", "utf8");
const appSource = fs.readFileSync("js/app-supabase.js", "utf8");
const legacyMonetizationSource = fs.readFileSync("monetization.js", "utf8");
const dashboardAccessFunction = appSource.match(
    /function hasMonetizationDashboardAccess\(user\) \{[\s\S]*?\n\}/,
);
assert.ok(dashboardAccessFunction, "monetization dashboard access function exists");
assert.match(dashboardAccessFunction[0], /\["medium", "pro"\]\.includes\(plan\)/);
assert.match(
    appSource,
    /const canAccessMonetizationDashboard =\s*isOwnProfile && hasMonetizationDashboardAccess\(user\)/,
);
assert.match(
    legacyMonetizationSource,
    /export function canUserReceiveSupport\(user\) \{[\s\S]*?if \(!isPlanActiveForUser\(user\)\) return false;\s*return true;/,
);
const boostFunction = appSource.match(
    /function getPlanBoostMultiplier\(userId\) \{[\s\S]*?\n\}/,
);
assert.ok(boostFunction, "feed plan boost function exists");
assert.match(boostFunction[0], /case "medium":\s*return 1\.5/);
assert.match(boostFunction[0], /case "pro":\s*return 5\.0/);
assert.match(staticHtml, /data-plan-id="standard"/);
assert.match(staticHtml, /data-plan-id="medium"/);
assert.match(staticHtml, /data-plan-id="pro"/);
assert.match(
    staticHtml,
    /réception des soutiens dès l’activation de\s+l’abonnement/i,
);
assert.match(staticHtml, /feed multiplié par\s*1,5/i);
assert.match(staticHtml, /feed multiplié par 5/i);
assert.doesNotMatch(staticHtml, /Soutiens :\s*Medium dès 1 000 abonnés/i);
assert.match(staticHtml, /commission de 25%/i);

console.log("subscription benefits tests passed");
