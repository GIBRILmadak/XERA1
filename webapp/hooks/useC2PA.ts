import { useEffect, useState } from "react";
import type {
    C2PAInspectionResult,
    C2PAInputPayload,
    UseC2PAOptions,
} from "../types/C2PA";

const safeJsonParse = (value: string | null | undefined) => {
    if (!value || typeof value !== "string") return null;
    try {
        return JSON.parse(value);
    } catch (_error) {
        return null;
    }
};

const normalizeActionHistory = (
    manifest: any,
): Array<Record<string, unknown>> => {
    if (!manifest || !Array.isArray(manifest.assertions)) return [];

    return manifest.assertions.flatMap((assertion: any) => {
        const actions = Array.isArray(assertion?.data?.actions)
            ? assertion.data.actions
            : [];
        return actions.map((action: any) => ({
            action: action?.action || null,
            digitalSourceType: action?.digitalSourceType || null,
            when: action?.when || null,
            description: action?.description || null,
            softwareAgent: action?.softwareAgent || null,
            actors: Array.isArray(action?.actors) ? action.actors : [],
        }));
    });
};

export const normalizeC2PAInspectionResult = (
    manifestStore: any,
): Omit<C2PAInspectionResult, "loading" | "error"> => {
    if (!manifestStore || typeof manifestStore !== "object") {
        return { isAI: false, provenance: null, source: null, raw: null };
    }

    const activeManifestId =
        manifestStore.active_manifest ||
        Object.keys(manifestStore.manifests || {})[0] ||
        null;
    const manifest =
        activeManifestId && manifestStore.manifests
            ? manifestStore.manifests[activeManifestId]
            : null;
    const actionHistory = normalizeActionHistory(manifest);
    const generatorName =
        manifest?.claim_generator ||
        manifest?.claim_generator_info?.[0]?.name ||
        null;
    const claimGeneratorInfo = Array.isArray(manifest?.claim_generator_info)
        ? manifest.claim_generator_info[0]
        : null;
    const signatureInfo = manifest?.signature_info || {};
    const createdAt =
        actionHistory.find((entry: any) => entry.when)?.when ||
        signatureInfo.time ||
        null;

    const aiSignals = [
        String(generatorName || "").toLowerCase(),
        String(claimGeneratorInfo?.name || "").toLowerCase(),
        ...(actionHistory || []).map((entry: any) =>
            String(entry?.digitalSourceType || "").toLowerCase(),
        ),
        ...(actionHistory || []).map((entry: any) =>
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
            tool: generatorName || claimGeneratorInfo?.name || null,
            api: claimGeneratorInfo?.name || null,
            createdAt,
            model: claimGeneratorInfo?.version || null,
            actionHistory,
            raw: manifest || null,
        },
        source: {
            activeManifestId,
            manifestId: manifest?.instance_id || null,
            vendor: manifest?.vendor || null,
            format: manifest?.format || null,
            title: manifest?.title || null,
            claimGenerator: generatorName || claimGeneratorInfo?.name || null,
        },
        raw: manifestStore,
    };
};

const inspectC2PAFromPayload = async (
    payload: C2PAInputPayload | null,
): Promise<C2PAInspectionResult> => {
    if (!payload) {
        return {
            isAI: false,
            provenance: null,
            source: null,
            loading: false,
            error: null,
            raw: null,
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
            source: null,
            loading: false,
            error: null,
            raw: null,
        };
    }

    try {
        const parsed =
            typeof manifestRaw === "string"
                ? safeJsonParse(manifestRaw)
                : manifestRaw;
        const normalized = normalizeC2PAInspectionResult(parsed || {});
        return { ...normalized, loading: false, error: null };
    } catch (error) {
        return {
            isAI: false,
            provenance: null,
            source: null,
            loading: false,
            error:
                error instanceof Error ? error.message : "C2PA payload invalid",
            raw: manifestRaw,
        };
    }
};

const inspectC2PAFromFile = async (
    file: File | Blob | null,
): Promise<C2PAInspectionResult> => {
    if (!file || typeof (file as File).arrayBuffer !== "function") {
        return {
            isAI: false,
            provenance: null,
            source: null,
            loading: false,
            error: null,
            raw: null,
        };
    }

    try {
        const toolkit = await import("@contentauth/toolkit");
        const mod = toolkit.default || toolkit;
        const buffer = await file.arrayBuffer();
        const manifestStore = await mod.getManifestStoreFromArrayBuffer(
            buffer,
            file.type || "application/octet-stream",
            null,
        );
        const normalized = normalizeC2PAInspectionResult(manifestStore);
        return { ...normalized, loading: false, error: null };
    } catch (error) {
        return {
            isAI: false,
            provenance: null,
            source: null,
            loading: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Unable to read C2PA metadata",
            raw: null,
        };
    }
};

export const useC2PA = ({
    file,
    payload,
    enabled = true,
}: UseC2PAOptions = {}) => {
    const [state, setState] = useState<C2PAInspectionResult>({
        isAI: false,
        provenance: null,
        source: null,
        loading: false,
        error: null,
        raw: null,
    });

    useEffect(() => {
        if (!enabled) {
            setState({
                isAI: false,
                provenance: null,
                source: null,
                loading: false,
                error: null,
                raw: null,
            });
            return;
        }

        let isMounted = true;
        const run = async () => {
            setState((current) => ({ ...current, loading: true, error: null }));

            try {
                const nextState = file
                    ? await inspectC2PAFromFile(file)
                    : payload
                      ? await inspectC2PAFromPayload(payload)
                      : {
                            isAI: false,
                            provenance: null,
                            source: null,
                            loading: false,
                            error: null,
                            raw: null,
                        };

                if (!isMounted) return;
                setState(nextState);
            } catch (error) {
                if (!isMounted) return;
                setState({
                    isAI: false,
                    provenance: null,
                    source: null,
                    loading: false,
                    error:
                        error instanceof Error
                            ? error.message
                            : "C2PA inspection failed",
                    raw: null,
                });
            }
        };

        void run();
        return () => {
            isMounted = false;
        };
    }, [enabled, file, payload]);

    return state;
};
