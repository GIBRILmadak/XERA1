const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync("js/fata-integration.js", "utf8");
const optimizedServer = fs.readFileSync("server/optimized-server.js", "utf8");

function createIntegration(location, fetchImpl, config = {}) {
    const window = { location, ...config };
    const document = { addEventListener() {} };
    vm.runInNewContext(source, {
        window,
        document,
        fetch: fetchImpl,
        AbortController,
        URL,
        URLSearchParams,
        setTimeout,
        clearTimeout,
        console,
        alert() {},
        localStorage: { getItem() { return null; } },
        sessionStorage: { getItem() { return null; }, setItem() {} },
    });
    return window.FataIntegration;
}

const jsonResponse = (ok, body = {}) => ({
    ok,
    json: async () => body,
});

test("uses the API hosted on the same local origin", async () => {
    const integration = createIntegration(
        {
            hostname: "localhost",
            port: "3000",
            protocol: "http:",
            origin: "http://localhost:3000",
        },
        async (url) => {
            assert.equal(url, "http://localhost:3000/api/health");
            return jsonResponse(true, { ok: true });
        },
    );

    assert.equal(await integration.resolveApiBaseUrl(), "");
});

test("finds the API fallback when the local page is served statically", async () => {
    const integration = createIntegration(
        {
            hostname: "localhost",
            port: "5502",
            protocol: "http:",
            origin: "http://localhost:5502",
        },
        async (url) =>
            url === "http://localhost:3000/api/health"
                ? jsonResponse(true, { ok: true })
                : jsonResponse(false),
    );

    assert.equal(
        await integration.resolveApiBaseUrl(),
        "http://localhost:3000",
    );
});

test("maps a 0.0.0.0 static origin to the localhost API fallback", async () => {
    const integration = createIntegration(
        {
            hostname: "0.0.0.0",
            port: "3000",
            protocol: "http:",
            origin: "http://0.0.0.0:3000",
        },
        async (url) =>
            url === "http://localhost:5050/api/health"
                ? jsonResponse(true, { ok: true })
                : jsonResponse(false),
    );

    assert.equal(
        await integration.resolveApiBaseUrl(),
        "http://localhost:5050",
    );
});

test("production defaults to same-origin API routing", async () => {
    const integration = createIntegration(
        {
            hostname: "xera1.xyz",
            port: "",
            protocol: "https:",
            origin: "https://xera1.xyz",
        },
        async () => {
            throw new Error("Production should not probe an alternate host");
        },
    );

    assert.equal(await integration.resolveApiBaseUrl(), "");
});

test("honors an explicitly configured production API origin", async () => {
    const integration = createIntegration(
        {
            hostname: "xera1.xyz",
            port: "",
            protocol: "https:",
            origin: "https://xera1.xyz",
        },
        async () => {
            throw new Error("Configured API should skip local probing");
        },
        { XERA_API_BASE_URL: "https://api.xera1.xyz/" },
    );

    assert.equal(
        await integration.resolveApiBaseUrl(),
        "https://api.xera1.xyz",
    );
});

test("reports an actionable error when no local API is running", async () => {
    let requests = 0;
    const integration = createIntegration(
        {
            hostname: "localhost",
            port: "5502",
            protocol: "http:",
            origin: "http://localhost:5502",
        },
        async () => {
            requests += 1;
            return jsonResponse(false);
        },
    );

    await assert.rejects(
        integration.resolveApiBaseUrl(),
        /API XERA1 introuvable.*npm start/,
    );
    await assert.rejects(
        integration.resolveApiBaseUrl(),
        /API XERA1 introuvable.*npm start/,
    );
    assert.equal(requests, 2, "recent API discovery errors should be reused");
});

test("allows arbitrary loopback ports only for local server origins", () => {
    assert.match(optimizedServer, /function isLocalDevelopmentOrigin\(origin\)/);
    assert.match(optimizedServer, /process\.env\.NODE_ENV === "production"/);
    assert.match(optimizedServer, /hasProductionOrigin/);
});
