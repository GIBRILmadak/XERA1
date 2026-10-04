const { getValidAccessToken } = require("./oauth-token-manager");
const { createSupabaseServiceClient } = require("./supabase-service-client");
const supabase = createSupabaseServiceClient();

// Adapteurs (implémentations spécifiques)
const adapters = {
    github: require("./adapters/github-adapter"),
    figma: require("./adapters/figma-adapter"),
    notion: require("./adapters/notion-adapter"),
    "google-cloud": require("./adapters/google-cloud-adapter"),
};
const defaultAdapter = require("./adapters/default-adapter");

function aggregateWorkItems(items) {
    const summaryThreshold =
        Number(process.env.INGESTION_AGGREGATION_THRESHOLD) || 10;
    const windowMs =
        Number(process.env.INGESTION_AGGREGATION_WINDOW_MS) || 60 * 60 * 1000;
    const groupMap = new Map();

    for (const item of items) {
        if (item.type !== "commit") {
            groupMap.set(item.id, [item]);
            continue;
        }

        const projectKey =
            item.content.repository ||
            item.content.projectId ||
            `${item.source}:${item.title}`;
        const bucket = groupMap.get(projectKey) || [];
        bucket.push(item);
        groupMap.set(projectKey, bucket);
    }

    const aggregated = [];
    for (const [groupKey, bucket] of groupMap.entries()) {
        if (bucket.length >= summaryThreshold) {
            const recent = bucket.reduce((prev, curr) =>
                new Date(prev.timestamp).getTime() >
                new Date(curr.timestamp).getTime()
                    ? prev
                    : curr,
            );
            aggregated.push({
                id: `summary-${groupKey}-${Date.now()}`,
                userId: recent.userId,
                source: recent.source,
                type: "work_summary",
                timestamp: recent.timestamp,
                title: `Récapitulatif : ${bucket.length} mises à jour`,
                description: `Regroupe ${bucket.length} actions sur ${groupKey} durant la dernière heure.`,
                content: {
                    summary: bucket.map((item) => item.title).slice(0, 8),
                    repository: groupKey,
                },
                previewUrl: recent.previewUrl,
                mediaUrl: recent.mediaUrl,
                metadata: {
                    skills: Array.from(
                        new Set(
                            bucket.flatMap(
                                (item) => item.metadata.skills || [],
                            ),
                        ),
                    ),
                    relevanceScore:
                        bucket.reduce(
                            (acc, item) =>
                                acc + (item.metadata.relevanceScore || 0),
                            0,
                        ) / bucket.length,
                    isPublic: bucket.some((item) => item.metadata.isPublic),
                },
            });
        } else {
            aggregated.push(...bucket);
        }
    }

    return aggregated;
}

/**
 * Moteur d'ingestion central
 */
async function runIngestion(userId, tool) {
    console.log(`[Ingestion] Début de la synchro pour ${userId} via ${tool}`);

    // 1. Récupérer un access token valide, avec refresh automatique si nécessaire
    const accessToken = await getValidAccessToken(userId, tool);

    // 2. Exécuter l'adaptateur
    const adapter = adapters[tool] || defaultAdapter;

    const rawData = await adapter.fetchData(accessToken);
    if (!Array.isArray(rawData)) {
        throw new Error(`Données attendues au format tableau pour ${tool}`);
    }

    const normalizedItems = rawData.map((item) =>
        adapter.normalize(item, userId, tool),
    );
    const itemsToInsert = aggregateWorkItems(normalizedItems);

    // 3. Normaliser et insérer
    for (const item of itemsToInsert) {
        await supabase.from("work_items").upsert(item, { onConflict: "id" });
        console.log(`[Ingestion] WorkItem créé: ${item.id}`);
    }
}

module.exports = { runIngestion };
