export type C2PAPlacement = "feed-card" | "immersive" | "profile";

export interface C2PAProvenance {
    issuer?: string | null;
    tool?: string | null;
    api?: string | null;
    createdAt?: string | null;
    model?: string | null;
    actionHistory?: Array<{
        action?: string | null;
        digitalSourceType?: string | null;
        when?: string | null;
        description?: string | null;
        softwareAgent?: unknown;
        actors?: Array<Record<string, unknown>>;
    }>;
    raw?: unknown;
}

export interface C2PASourceSummary {
    activeManifestId?: string | null;
    manifestId?: string | null;
    vendor?: string | null;
    format?: string | null;
    title?: string | null;
    claimGenerator?: string | null;
}

export interface C2PAInspectionResult {
    isAI: boolean;
    provenance: C2PAProvenance | null;
    source: C2PASourceSummary | null;
    loading: boolean;
    error: string | null;
    raw?: unknown;
}

export interface C2PAInputPayload {
    c2pa_manifest_store?: unknown;
    manifest_store?: unknown;
    c2pa?: unknown;
    c2paMetadata?: unknown;
    c2pa_metadata?: unknown;
    metadata?: {
        c2pa?: unknown;
        [key: string]: unknown;
    };
    is_ai?: boolean;
    isAI?: boolean;
    ai_generated?: boolean;
    aiGenerated?: boolean;
    [key: string]: unknown;
}

export interface UseC2PAOptions {
    file?: File | Blob | null;
    payload?: C2PAInputPayload | null;
    enabled?: boolean;
}
