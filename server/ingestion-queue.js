const crypto = require("crypto");
const { runIngestion } = require("./ingestion-engine");
const { createSupabaseServiceClient } = require("./supabase-service-client");

const supabase = createSupabaseServiceClient();
const MAX_ATTEMPTS = Number(process.env.INGESTION_JOB_MAX_ATTEMPTS) || 3;
const WORKER_INTERVAL_MS = Number(process.env.INGESTION_WORKER_MS) || 60 * 1000;

async function enqueueIngestion(userId, tool, payload = {}) {
    const job = {
        id: crypto.randomUUID(),
        user_id: userId,
        tool,
        status: "pending",
        attempts: 0,
        last_error: null,
        payload,
        scheduled_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("ingestion_jobs").insert(job);
    if (error) {
        console.error(
            "[Ingestion Queue] Impossible d’enregistrer le job",
            error,
        );
        throw error;
    }

    return job;
}

async function processIngestionJobs(limit = 10) {
    const { data: jobs, error } = await supabase
        .from("ingestion_jobs")
        .select("*")
        .in("status", ["pending", "retry"])
        .order("created_at", { ascending: true })
        .limit(limit);

    if (error) {
        console.error("[Ingestion Queue] Erreur de lecture des jobs", error);
        return { ok: false, error };
    }

    const results = [];
    for (const job of jobs || []) {
        const updating = await supabase
            .from("ingestion_jobs")
            .update({
                status: "processing",
                updated_at: new Date().toISOString(),
            })
            .eq("id", job.id)
            .eq("status", job.status);

        if (updating.error) {
            console.warn(
                "[Ingestion Queue] Impossible de verrouiller le job",
                job.id,
                updating.error,
            );
            results.push({ id: job.id, ok: false, error: updating.error });
            continue;
        }

        try {
            await runIngestion(job.user_id, job.tool);
            await supabase
                .from("ingestion_jobs")
                .update({
                    status: "completed",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", job.id);
            results.push({ id: job.id, ok: true });
        } catch (error) {
            const attempts = Number(job.attempts || 0) + 1;
            const nextStatus = attempts >= MAX_ATTEMPTS ? "failed" : "retry";
            await supabase
                .from("ingestion_jobs")
                .update({
                    status: nextStatus,
                    attempts,
                    last_error: String(error?.message || error),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", job.id);
            console.error(
                `[Ingestion Queue] Job ${job.id} échoué (${nextStatus})`,
                error?.message || error,
            );
            results.push({
                id: job.id,
                ok: false,
                attempts,
                error: String(error?.message || error),
            });
        }
    }

    return { ok: true, processed: results.length, results };
}

function startIngestionWorker() {
    console.info(
        "[Ingestion Queue] Worker démarré, interval:",
        WORKER_INTERVAL_MS,
    );
    setInterval(async () => {
        try {
            await processIngestionJobs();
        } catch (error) {
            console.error("[Ingestion Queue] Erreur worker", error);
        }
    }, WORKER_INTERVAL_MS);
}

module.exports = {
    enqueueIngestion,
    processIngestionJobs,
    startIngestionWorker,
};
