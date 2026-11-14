#!/usr/bin/env node
// Réduit les médias déjà publiés dans le bucket public "media" : vidéos en
// H.264 720p, GIF en WebP animé, photos redimensionnées. Chaque fichier est
// remplacé à la MÊME adresse : aucune URL en base ne change. Les vidéos
// reçoivent en plus une miniature (content.metadata.poster_url).
//
// Le téléchargement passe par l'API authentifiée (egress "non caché", quota
// distinct de celui du CDN). Il faut ffmpeg et ffprobe dans le PATH.
// Par défaut le script ne fait que lister ; ajoutez --apply pour agir.
//
// Usage :
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/optimize-existing-media.js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/optimize-existing-media.js --apply
//   ... --apply --only=video|gif|image   (un seul type de média)
//   node scripts/optimize-existing-media.js --local-test=<fichier> --role=content|avatar|banner

require("dotenv").config();
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const APPLY = process.argv.includes("--apply");
const arg = (name) =>
    (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").split("=")[1] ||
    "";
const ONLY = arg("only");
const LOCAL_TEST = arg("local-test");
const BUCKET = "media";
const CACHE_CONTROL = "31536000";
// En dessous de ces tailles, le gain ne vaut pas la perte de qualité.
const MIN_BYTES = { video: 4 * 1024 * 1024, gif: 700 * 1024, image: 300 * 1024 };
const MAX_SIDE = { content: 1920, banner: 1600, avatar: 512 };
const GIF_MAX_SIDE = { content: 720, banner: 960, avatar: 256 };
const MIN_GAIN_RATIO = 0.85; // on ne remplace que si le fichier fait < 85 % de l'original

function run(cmd, args) {
    return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
}

function probe(file) {
    const json = JSON.parse(
        run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]),
    );
    const video = (json.streams || []).find((s) => s.codec_type === "video");
    const audio = (json.streams || []).find((s) => s.codec_type === "audio");
    const [num, den] = String(video?.avg_frame_rate || "0/1").split("/").map(Number);
    return {
        formatName: json.format?.format_name || "",
        width: Number(video?.width) || 0,
        height: Number(video?.height) || 0,
        fps: den ? num / den : 0,
        hasAudio: Boolean(audio),
        codec: video?.codec_name || "",
        // rgba, ya8, yuva420p, pal8 (palette PNG/GIF transparente)...
        hasAlpha: /^(rgba|bgra|argb|abgr|ya\d|yuva|gbrap|pal8)/.test(String(video?.pix_fmt || "")),
    };
}

function kindOf(info) {
    if (info.codec === "gif") return "gif";
    if (/mov|mp4|matroska|webm|avi|mpeg/.test(info.formatName)) return "video";
    return "image";
}

// Toujours rendre des dimensions paires (exigé par H.264 yuv420p).
function scaleFilter(maxShortSide, maxLongSide) {
    if (maxShortSide) {
        return `scale='if(gte(iw,ih),-2,min(iw,${maxShortSide}))':'if(gte(iw,ih),min(ih,${maxShortSide}),-2)'`;
    }
    return `scale='if(gte(iw,ih),min(iw,${maxLongSide}),-2)':'if(gte(iw,ih),-2,min(ih,${maxLongSide}))'`;
}

function optimizeVideo(input, workDir, info) {
    const output = path.join(workDir, "out.mp4");
    const filters = [scaleFilter(720)];
    if (info.fps > 31) filters.push("fps=30");
    const args = ["-v", "error", "-y", "-i", input, "-map", "0:v:0"];
    if (info.hasAudio) args.push("-map", "0:a:0");
    args.push(
        "-vf", filters.join(","),
        "-c:v", "libx264", "-preset", "slow", "-crf", "26",
        "-maxrate", "1800k", "-bufsize", "3600k",
        "-pix_fmt", "yuv420p", "-profile:v", "high",
    );
    if (info.hasAudio) args.push("-c:a", "aac", "-b:a", "96k");
    args.push("-movflags", "+faststart", output);
    run("ffmpeg", args);

    const poster = path.join(workDir, "poster.webp");
    run("ffmpeg", [
        "-v", "error", "-y", "-ss", "0.5", "-i", output, "-frames:v", "1",
        "-vf", scaleFilter(null, 720), "-c:v", "libwebp", "-quality", "72", poster,
    ]);
    return { file: output, contentType: "video/mp4", poster };
}

function optimizeGif(input, workDir, role) {
    const output = path.join(workDir, "out.webp");
    run("ffmpeg", [
        "-v", "error", "-y", "-i", input,
        "-vf", `${scaleFilter(null, GIF_MAX_SIDE[role] || GIF_MAX_SIDE.content)}:flags=lanczos`,
        "-c:v", "libwebp_anim", "-pix_fmt", "yuva420p", "-lossless", "0", "-quality", "70",
        "-compression_level", "6", "-loop", "0", "-an", output,
    ]);
    return { file: output, contentType: "image/webp" };
}

function optimizeImage(input, workDir, role, info) {
    const output = path.join(workDir, "out.webp");
    run("ffmpeg", [
        "-v", "error", "-y", "-i", input,
        "-vf", `${scaleFilter(null, MAX_SIDE[role] || MAX_SIDE.content)}:flags=lanczos`,
        "-c:v", "libwebp", "-pix_fmt", info.hasAlpha ? "yuva420p" : "yuv420p",
        "-quality", "80", "-frames:v", "1", output,
    ]);
    return { file: output, contentType: "image/webp" };
}

function optimizeFile(input, role, fileName) {
    const info = probe(input);
    const kind = kindOf(info);
    const size = fs.statSync(input).size;
    // Un ".gif" déjà converti en WebP animé : ffmpeg ne sait pas le relire.
    if (/\.gif$/i.test(fileName) && kind !== "gif") {
        return { kind: "gif", skipped: "déjà optimisé" };
    }
    if (ONLY && ONLY !== kind) return { kind, skipped: "type filtré" };
    if (size < MIN_BYTES[kind]) return { kind, skipped: "déjà léger" };

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "xera-media-"));
    const result =
        kind === "video"
            ? optimizeVideo(input, workDir, info)
            : kind === "gif"
              ? optimizeGif(input, workDir, role)
              : optimizeImage(input, workDir, role, info);
    const newSize = fs.statSync(result.file).size;
    if (newSize >= size * MIN_GAIN_RATIO) {
        removeDir(workDir);
        return { kind, skipped: "gain insuffisant", size, newSize };
    }
    return { kind, size, newSize, workDir, ...result };
}

const mb = (bytes) => `${(bytes / 1048576).toFixed(2)} Mo`;

function removeDir(dir) {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
}

async function main() {
    if (LOCAL_TEST) {
        const role = arg("role") || "content";
        const res = optimizeFile(LOCAL_TEST, role, path.basename(LOCAL_TEST));
        console.log(JSON.stringify({ ...res, size: res.size && mb(res.size), newSize: res.newSize && mb(res.newSize) }, null, 2));
        return;
    }

    const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
        process.exit(1);
    }
    const { createClient } = require("@supabase/supabase-js");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const publicPrefix = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
    const toPath = (url) => {
        const value = String(url || "").trim();
        if (!value.startsWith(publicPrefix)) return null;
        return decodeURIComponent(value.slice(publicPrefix.length).split("?")[0]);
    };

    // chemin -> { role, contentIds }
    const targets = new Map();
    const addTarget = (url, role, contentId) => {
        const p = toPath(url);
        if (!p || /\.poster\.(webp|jpg)$/.test(p)) return;
        const entry = targets.get(p) || { role, contentIds: new Set() };
        // Une image utilisée comme avatar doit rester nette en grand ailleurs.
        if (entry.role === "avatar" && role !== "avatar") entry.role = role;
        if (contentId) entry.contentIds.add(contentId);
        targets.set(p, entry);
    };

    const { data: contents, error: contentError } = await supabase
        .from("content")
        .select("id, type, media_url, media_urls")
        .eq("is_deleted", false);
    if (contentError) throw contentError;
    for (const row of contents || []) {
        const urls = new Set([row.media_url, ...(row.media_urls || [])].filter(Boolean));
        urls.forEach((u) => addTarget(u, "content", row.type === "video" ? row.id : null));
    }
    const { data: users, error: usersError } = await supabase.from("users").select("avatar, banner");
    if (usersError) throw usersError;
    for (const u of users || []) {
        addTarget(u.avatar, "avatar");
        addTarget(u.banner, "banner");
    }
    const { data: pages } = await supabase.from("professional_pages").select("avatar_url, banner_url");
    for (const p of pages || []) {
        addTarget(p.avatar_url, "avatar");
        addTarget(p.banner_url, "banner");
    }
    const { data: arcs } = await supabase.from("arcs").select("media_url");
    for (const a of arcs || []) addTarget(a.media_url, "content");

    console.log(`${targets.size} fichiers référencés.${APPLY ? "" : " (simulation : ajoutez --apply pour agir)"}`);
    if (!APPLY) {
        for (const [p, t] of targets) console.log(`  ${t.role.padEnd(7)} ${p}`);
        return;
    }

    let before = 0;
    let after = 0;
    for (const [storagePath, target] of targets) {
        const label = `${target.role.padEnd(7)} ${storagePath}`;
        let inputDir = null;
        let res = null;
        try {
            const { data: blob, error } = await supabase.storage.from(BUCKET).download(storagePath);
            if (error) throw error;
            inputDir = fs.mkdtempSync(path.join(os.tmpdir(), "xera-src-"));
            const input = path.join(inputDir, path.basename(storagePath));
            fs.writeFileSync(input, Buffer.from(await blob.arrayBuffer()));

            res = optimizeFile(input, target.role, storagePath);
            if (res.skipped) {
                console.log(`= ${label} (${res.skipped})`);
                continue;
            }

            const { error: uploadError } = await supabase.storage
                .from(BUCKET)
                .upload(storagePath, fs.readFileSync(res.file), {
                    upsert: true,
                    contentType: res.contentType,
                    cacheControl: CACHE_CONTROL,
                });
            if (uploadError) throw uploadError;
            before += res.size;
            after += res.newSize;
            console.log(`✓ ${label} ${mb(res.size)} -> ${mb(res.newSize)}`);

            if (res.poster && target.contentIds.size > 0) {
                const posterPath = `${storagePath.replace(/\.[^/.]+$/, "")}.poster.webp`;
                const { error: posterError } = await supabase.storage
                    .from(BUCKET)
                    .upload(posterPath, fs.readFileSync(res.poster), {
                        upsert: true,
                        contentType: "image/webp",
                        cacheControl: CACHE_CONTROL,
                    });
                if (posterError) throw posterError;
                const posterUrl = supabase.storage.from(BUCKET).getPublicUrl(posterPath).data.publicUrl;
                for (const contentId of target.contentIds) {
                    const { data: row } = await supabase
                        .from("content")
                        .select("metadata")
                        .eq("id", contentId)
                        .single();
                    await supabase
                        .from("content")
                        .update({ metadata: { ...(row?.metadata || {}), poster_url: posterUrl } })
                        .eq("id", contentId);
                }
                console.log(`  miniature -> ${posterPath}`);
            }
        } catch (error) {
            console.error(`✗ ${label}: ${error.message || error}`);
        } finally {
            removeDir(inputDir);
            removeDir(res?.workDir);
        }
    }
    console.log(`\nTotal remplacé : ${mb(before)} -> ${mb(after)}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
