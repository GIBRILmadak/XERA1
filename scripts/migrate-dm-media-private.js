#!/usr/bin/env node
// Déplace les anciens médias des DM (bucket public "media") vers le bucket
// privé "dm-media", puis supprime l'original public.
//
// À lancer UNE fois, après sql/20261005_dm_secure_messaging.sql.
// Par défaut le script ne fait que simuler ; ajoutez --apply pour agir.
//
// Usage :
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-dm-media-private.js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-dm-media-private.js --apply
//   ... --apply --keep-originals   (copie sans supprimer les fichiers publics)

require("dotenv").config();
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");
const KEEP_ORIGINALS = process.argv.includes("--keep-originals");
const PAGE_SIZE = 200;
const TARGET_BUCKET = "dm-media";

const MIME_BY_EXT = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
};

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
});

// ".../storage/v1/object/public/<bucket>/<path>" → { bucket, path }
function parsePublicStorageUrl(url) {
    const prefix = `${SUPABASE_URL}/storage/v1/object/public/`;
    if (typeof url !== "string" || !url.startsWith(prefix)) return null;
    const rest = url.slice(prefix.length).split("?")[0];
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;
    return {
        bucket: rest.slice(0, slash),
        path: decodeURIComponent(rest.slice(slash + 1)),
    };
}

function extensionOf(path) {
    const ext = String(path || "").split(".").pop().toLowerCase();
    return MIME_BY_EXT[ext] ? ext : "";
}

async function fetchLegacyMessages() {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
            .from("dm_messages")
            .select("id, conversation_id, sender_id, media_url, media_type")
            .not("media_url", "is", null)
            .is("media_path", null)
            .is("deleted_at", null)
            .order("created_at", { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
    }
    return rows;
}

async function migrateMessage(message) {
    const source = parsePublicStorageUrl(message.media_url);
    if (!source) return { status: "skipped", reason: "URL hors Storage du projet" };

    const ext = extensionOf(source.path);
    if (!ext) return { status: "skipped", reason: `extension inconnue (${source.path})` };
    const targetPath = `${message.conversation_id}/${message.sender_id}/${crypto.randomUUID()}.${ext}`;

    if (!APPLY) return { status: "planned", source, targetPath };

    const { data: blob, error: downloadError } = await supabase.storage
        .from(source.bucket)
        .download(source.path);
    if (downloadError || !blob) {
        return { status: "failed", reason: `téléchargement : ${downloadError?.message || "vide"}` };
    }

    const { error: uploadError } = await supabase.storage
        .from(TARGET_BUCKET)
        .upload(targetPath, blob, { contentType: MIME_BY_EXT[ext], upsert: false });
    if (uploadError) {
        return { status: "failed", reason: `upload : ${uploadError.message}` };
    }

    const { error: updateError } = await supabase
        .from("dm_messages")
        .update({ media_path: targetPath, media_url: null })
        .eq("id", message.id);
    if (updateError) {
        await supabase.storage.from(TARGET_BUCKET).remove([targetPath]);
        return { status: "failed", reason: `mise à jour : ${updateError.message}` };
    }

    if (!KEEP_ORIGINALS) {
        const { error: removeError } = await supabase.storage
            .from(source.bucket)
            .remove([source.path]);
        if (removeError) {
            return {
                status: "migrated",
                warning: `original public non supprimé : ${removeError.message}`,
            };
        }
    }
    return { status: "migrated" };
}

async function main() {
    console.log(
        APPLY
            ? `Migration réelle${KEEP_ORIGINALS ? " (originaux conservés)" : ""}…`
            : "Simulation (ajoutez --apply pour migrer)…",
    );
    const messages = await fetchLegacyMessages();
    console.log(`${messages.length} message(s) avec un média public.`);

    const counts = { planned: 0, migrated: 0, skipped: 0, failed: 0 };
    for (const message of messages) {
        const result = await migrateMessage(message);
        counts[result.status] += 1;
        if (result.status === "failed" || result.status === "skipped") {
            console.warn(`- ${message.id} : ${result.status} (${result.reason})`);
        } else if (result.warning) {
            console.warn(`- ${message.id} : ${result.warning}`);
        }
    }

    console.log(
        `Terminé : ${counts.migrated} migré(s), ${counts.planned} à migrer, ` +
            `${counts.skipped} ignoré(s), ${counts.failed} échec(s).`,
    );
    process.exit(counts.failed ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
