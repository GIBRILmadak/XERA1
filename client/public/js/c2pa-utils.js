(function () {
    const C2PA_TOOLKIT_CANDIDATES = [
        typeof window !== "undefined" ? window?.C2PA : null,
        typeof globalThis !== "undefined" ? globalThis?.C2PA : null,
    ].filter(Boolean);

    function safeJsonParse(value) {
        if (!value || typeof value !== "string") return null;
        try {
            return JSON.parse(value);
        } catch (error) {
            return null;
        }
    }

    function getManifestFromStore(manifestStore, activeManifestId) {
        if (!manifestStore || typeof manifestStore !== "object") return null;
        if (manifestStore.manifests && activeManifestId) {
            return manifestStore.manifests[activeManifestId] || null;
        }
        const activeId =
            manifestStore.active_manifest ||
            Object.keys(manifestStore.manifests || {})[0];
        if (!activeId || !manifestStore.manifests) return null;
        return manifestStore.manifests[activeId] || null;
    }

    function extractActionHistory(manifest) {
        if (!manifest || !Array.isArray(manifest.assertions)) return [];

        return manifest.assertions
            .filter((assertion) => assertion && typeof assertion === "object")
            .flatMap((assertion) => {
                const actions = assertion?.data?.actions || [];
                return Array.isArray(actions)
                    ? actions.map((action) => ({
                          action: action?.action || null,
                          digitalSourceType: action?.digitalSourceType || null,
                          when: action?.when || null,
                          description: action?.description || null,
                          softwareAgent: action?.softwareAgent || null,
                          actors: Array.isArray(action?.actors)
                              ? action.actors
                              : [],
                      }))
                    : [];
            });
    }

    function normalizeC2PAInspectionResult(manifestStore) {
        const manifest = getManifestFromStore(
            manifestStore,
            manifestStore?.active_manifest,
        );
        const actionHistory = extractActionHistory(manifest);
        const directGenerator =
            manifest?.claim_generator ||
            manifest?.claim_generator_info?.[0]?.name ||
            null;
        const generatorInfo = Array.isArray(manifest?.claim_generator_info)
            ? manifest.claim_generator_info[0]
            : null;
        const signatureInfo = manifest?.signature_info || {};
        const createdAt =
            actionHistory.find((entry) => entry.when)?.when ||
            signatureInfo.time ||
            manifest?.metadata?.dateTime ||
            null;

        const aiSignals = [
            String(manifest?.claim_generator || "").toLowerCase(),
            String(generatorInfo?.name || "").toLowerCase(),
            ...(actionHistory || []).map((entry) =>
                String(entry?.digitalSourceType || "").toLowerCase(),
            ),
            ...(actionHistory || []).map((entry) =>
                String(entry?.action || "").toLowerCase(),
            ),
        ];

        const isAI = aiSignals.some(
            (value) =>
                value.includes("ai") ||
                value.includes("artificial") ||
                value.includes("generated") ||
                value.includes("firefly") ||
                value.includes("generative") ||
                value.includes("openai") ||
                value.includes("midjourney") ||
                value.includes("stable diffusion") ||
                value.includes("photoshop"),
        );

        return {
            isAI,
            provenance: {
                issuer: signatureInfo.issuer || null,
                tool: directGenerator || generatorInfo?.name || null,
                api: generatorInfo?.name || null,
                createdAt,
                model: generatorInfo?.version || null,
                actionHistory,
                raw: manifest || null,
            },
            source: {
                activeManifestId: manifestStore?.active_manifest || null,
                manifestId: manifest?.instance_id || null,
                vendor: manifest?.vendor || null,
                format: manifest?.format || null,
                title: manifest?.title || null,
                claimGenerator: directGenerator || generatorInfo?.name || null,
            },
            raw: manifestStore || null,
        };
    }

    async function inspectMediaC2PA(file) {
        if (!file || typeof file.arrayBuffer !== "function") {
            return {
                isAI: false,
                provenance: null,
                loading: false,
                error: null,
                raw: null,
                source: null,
            };
        }

        try {
            const buffer = await file.arrayBuffer();
            const mimeType = file.type || "application/octet-stream";

            if (!window || !window.__XERA_C2PA_TOOLKIT__) {
                const toolkitModule = await import("@contentauth/toolkit");
                const toolkit = toolkitModule.default || toolkitModule;
                const manifestStore =
                    await toolkit.getManifestStoreFromArrayBuffer(
                        buffer,
                        mimeType,
                        null,
                    );
                return {
                    ...normalizeC2PAInspectionResult(manifestStore),
                    loading: false,
                    error: null,
                };
            }

            const toolkit = C2PA_TOOLKIT_CANDIDATES[0];
            const manifestStore = await toolkit.getManifestStoreFromArrayBuffer(
                buffer,
                mimeType,
                null,
            );
            return {
                ...normalizeC2PAInspectionResult(manifestStore),
                loading: false,
                error: null,
            };
        } catch (error) {
            return {
                isAI: false,
                provenance: null,
                loading: false,
                error: error?.message || "C2PA inspection failed",
                raw: null,
                source: null,
            };
        }
    }

    async function inspectMediaC2PAFromPayload(payload) {
        if (!payload || typeof payload !== "object") {
            return {
                isAI: false,
                provenance: null,
                loading: false,
                error: null,
                raw: null,
                source: null,
            };
        }

        const manifestRaw =
            payload.c2pa_manifest_store ||
            payload.manifest_store ||
            payload.c2pa ||
            payload.c2paMetadata ||
            payload.c2pa_metadata ||
            payload.metadata?.c2pa ||
            null;

        if (!manifestRaw) {
            return {
                isAI: false,
                provenance: null,
                loading: false,
                error: null,
                raw: null,
                source: null,
            };
        }

        const parsed =
            typeof manifestRaw === "string"
                ? safeJsonParse(manifestRaw)
                : manifestRaw;
        const normalized = normalizeC2PAInspectionResult(parsed || {});
        return {
            ...normalized,
            loading: false,
            error: null,
        };
    }

    function isMediaAIFlagSet(mediaRecord) {
        if (!mediaRecord || typeof mediaRecord !== "object") return false;
        const values = [
            mediaRecord.is_ai,
            mediaRecord.isAI,
            mediaRecord.ai_generated,
            mediaRecord.aiGenerated,
            mediaRecord.c2pa_is_ai,
            mediaRecord.c2paIsAI,
            mediaRecord?.c2pa?.isAI,
            mediaRecord?.c2pa?.is_ai,
            mediaRecord?.metadata?.is_ai,
            mediaRecord?.metadata?.isAI,
            mediaRecord?.metadata?.ai_generated,
            mediaRecord?.metadata?.aiGenerated,
            mediaRecord?.metadata?.c2pa?.isAI,
            mediaRecord?.metadata?.c2pa?.is_ai,
        ];
        return values.some(
            (value) => value === true || value === "true" || value === 1,
        );
    }

    function resolveContentAIFlag(content) {
        if (!content || typeof content !== "object") return false;

        const metadata = content.metadata || {};
        const c2pa =
            metadata.c2pa || metadata.C2PA || metadata.provenance || {};
        const raw =
            content.is_ai ??
            content.isAI ??
            content.ai_generated ??
            content.aiGenerated ??
            metadata.is_ai ??
            metadata.isAI ??
            metadata.ai_generated ??
            metadata.aiGenerated ??
            c2pa.is_ai ??
            c2pa.isAI ??
            c2pa.ai_generated ??
            c2pa.aiGenerated ??
            false;

        if (raw === true || raw === "true" || raw === 1) return true;
        if (raw === false || raw === "false" || raw === 0) return false;

        return !!(
            metadata?.c2pa?.isAI ||
            metadata?.c2pa?.is_ai ||
            metadata?.C2PA?.isAI ||
            metadata?.C2PA?.is_ai ||
            metadata?.provenance?.isAI ||
            metadata?.provenance?.is_ai
        );
    }

    const extractAIFlagFromContent = resolveContentAIFlag;

    function buildC2PAState(mediaRecord, fallbackResult = null) {
        const explicit = isMediaAIFlagSet(mediaRecord);
        const payloadResult = mediaRecord
            ? inspectMediaC2PAFromPayload(mediaRecord)
            : null;
        const resolved =
            payloadResult && payloadResult.isAI !== undefined
                ? payloadResult
                : fallbackResult || {
                      isAI: false,
                      provenance: null,
                      source: null,
                  };
        return {
            isAI: explicit || resolved.isAI || false,
            provenance: resolved.provenance || null,
            source: resolved.source || null,
            loading: false,
            error: resolved.error || null,
            raw: resolved.raw || null,
        };
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = {
            inspectMediaC2PA,
            inspectMediaC2PAFromPayload,
            normalizeC2PAInspectionResult,
            buildC2PAState,
            isMediaAIFlagSet,
            resolveContentAIFlag,
            extractAIFlagFromContent,
        };
    }

    if (typeof window !== "undefined") {
        window.inspectMediaC2PA = inspectMediaC2PA;
        window.inspectMediaC2PAFromPayload = inspectMediaC2PAFromPayload;
        window.normalizeC2PAInspectionResult = normalizeC2PAInspectionResult;
        window.buildC2PAState = buildC2PAState;
        window.isMediaAIFlagSet = isMediaAIFlagSet;
        window.resolveContentAIFlag = resolveContentAIFlag;
        window.extractAIFlagFromContent = extractAIFlagFromContent;
    }
})();
