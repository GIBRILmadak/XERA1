const assert = require("node:assert/strict");
const {
    normalizeC2PAInspectionResult,
    extractAIFlagFromContent,
} = require("../js/c2pa-utils.js");
const { resolvePageProMessageTarget } = require("../js/pro-message-targets.js");
const { rootCertificates } = require("node:tls");

const manifestStore = {
    active_manifest: "manifest-1",
    manifests: {
        "manifest-1": {
            claim_generator: "Adobe Firefly",
            claim_generator_info: [{ name: "Adobe Firefly", version: "4.0" }],
            signature_info: { issuer: "Adobe Content Credentials" },
            assertions: [
                {
                    label: "c2pa.actions.v2",
                    data: {
                        actions: [
                            {
                                action: "c2pa.created",
                                digitalSourceType: "AI generated",
                                when: "2026-08-18T09:00:00Z",
                                softwareAgent: {
                                    name: "Adobe Firefly",
                                    version: "4.0",
                                },
                            },
                        ],
                    },
                },
            ],
        },
    },
};

const normalized = normalizeC2PAInspectionResult(manifestStore);
assert.equal(normalized.isAI, true);
assert.equal(normalized.provenance.issuer, "Adobe Content Credentials");
assert.equal(normalized.provenance.tool, "Adobe Firefly");
assert.equal(normalized.provenance.createdAt, "2026-08-18T09:00:00Z");
assert.ok(Array.isArray(normalized.provenance.actionHistory));

const aiContent = {
    metadata: {
        c2pa: { isAI: true },
    },
    title: "Image générée",
};
assert.equal(extractAIFlagFromContent(aiContent), true);
assert.equal(
    extractAIFlagFromContent({ metadata: { ai_generated: true } }),
    true,
);
assert.equal(extractAIFlagFromContent({ metadata: { is_ai: false } }), false);

const pageTarget = resolvePageProMessageTarget({
    id: "page_123",
    owner_id: "user_456",
    slug: "acme",
    name: "Acme",
});
assert.equal(pageTarget.userId, "user_456");
assert.equal(pageTarget.companySlug, "acme");
assert.equal(pageTarget.kind, "company");
assert.deepEqual(resolvePageProMessageTarget({}), {
    userId: null,
    companySlug: null,
    kind: "company",
});
