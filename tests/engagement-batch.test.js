const assert = require("assert");
const logger = require("../server/logger");
const setupEngagementTracking = require("../server/engagement-tracking-api");

console.log("=== Running Engagement Batch & Logger Unit Tests ===");

// Test 1: Logger respects LOG_LEVEL
const originalLogLevel = process.env.LOG_LEVEL;

process.env.LOG_LEVEL = "error";
let loggedDebug = false;
const origDebug = console.debug;
console.debug = () => { loggedDebug = true; };

logger.debug("Test debug message when LOG_LEVEL=error");
assert.strictEqual(loggedDebug, false, "logger.debug should be suppressed when LOG_LEVEL=error");

process.env.LOG_LEVEL = "debug";
logger.debug("Test debug message when LOG_LEVEL=debug");
assert.strictEqual(loggedDebug, true, "logger.debug should output when LOG_LEVEL=debug");

console.debug = origDebug;
process.env.LOG_LEVEL = originalLogLevel;

// Test 2: Engagement Tracking Express Endpoints setup
const mockApp = {
    routes: {},
    post(path, handler) {
        this.routes[path] = handler;
    },
    get(path, handler) {
        this.routes[path] = handler;
    }
};

const mockSupabase = {};

setupEngagementTracking(mockApp, mockSupabase);

assert.ok(mockApp.routes["/api/app/feed/impressions-batch"], "Batch feed impressions endpoint should be registered");
assert.ok(mockApp.routes["/api/app/interaction/track-batch"], "Batch interaction track endpoint should be registered");

console.log("✅ All Engagement Batch & Logger Unit Tests Passed!");
