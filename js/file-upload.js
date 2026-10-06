/* ========================================
   SYSTÈME D'UPLOAD DE FICHIERS
   ======================================== */

const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
    "image/heif",
];
const MAX_VIDEO_DURATION_SECONDS = 60 * 60; // 60 minutes
const MAX_FILE_SIZE = Number.POSITIVE_INFINITY; // no client-side limit
// Passer en upload résumable pour les gros fichiers (ex: vidéos iPhone)
const RESUMABLE_THRESHOLD_BYTES = 45 * 1024 * 1024; // 45 Mo ~ limite CDN courante
const RESUMABLE_CHUNK_SIZE_BYTES = 8 * 1024 * 1024; // 8 Mo par chunk

// Chaque octet stocké est re-téléchargé à chaque vue (quota "egress" Supabase) :
// on réduit les médias avant l'upload plutôt que de servir les originaux.
// Les noms de fichiers sont uniques, le cache navigateur/CDN peut donc durer 1 an.
const MEDIA_CACHE_CONTROL = "31536000";
const IMAGE_MAX_SIDE = 1920;
const AVATAR_MAX_SIDE = 512;
const IMAGE_QUALITY = 0.82;
const IMAGE_SKIP_BELOW_BYTES = 200 * 1024;
const MAX_GIF_SIZE_BYTES = 5 * 1024 * 1024;
// Réencodage vidéo dans le navigateur (WebCodecs, accéléré matériellement).
// Mediabunny n'est chargé qu'au moment d'un upload vidéo.
const MEDIABUNNY_MODULE_URL =
    "https://cdn.jsdelivr.net/npm/mediabunny@1.61.3/dist/bundles/mediabunny.min.mjs";
const VIDEO_MAX_SHORT_SIDE = 720;
const VIDEO_MAX_FRAME_RATE = 30;
const VIDEO_BITRATE_720P = 1_600_000;
const VIDEO_AUDIO_BITRATE = 96_000;
const VIDEO_SKIP_BELOW_BYTES = 6 * 1024 * 1024;
// Abandonne le réencodage (et envoie l'original) s'il serait trop long.
const VIDEO_MAX_TRANSCODE_SECONDS = 240;
const VIDEO_POSTER_MAX_SIDE = 720;

// Uploader un fichier vers Supabase Storage

function getFileExtension(file) {
    const name = (file?.name || "").toLowerCase();
    const parts = name.split(".");
    return parts.length > 1 ? parts.pop() : "";
}

function isLikelyVideoFile(file) {
    if (!file) return false;
    const mime = (file.type || "").toLowerCase();
    if (mime.startsWith("video/")) return true;

    // Fallback by extension for browsers that leave MIME empty.
    const ext = getFileExtension(file);
    const knownVideoExts = new Set([
        "mp4",
        "mov",
        "m4v",
        "webm",
        "mkv",
        "avi",
        "wmv",
        "flv",
        "mpeg",
        "mpg",
        "m2ts",
        "mts",
        "3gp",
        "3g2",
        "ogv",
        "ts",
        "mxf",
        "f4v",
        "vob",
    ]);
    return knownVideoExts.has(ext);
}

async function readVideoDurationSeconds(file) {
    return await new Promise((resolve, reject) => {
        const video = document.createElement("video");
        const objectUrl = URL.createObjectURL(file);

        const cleanup = () => {
            try {
                video.removeAttribute("src");
                video.load();
            } catch (e) {
                // ignore
            }
            URL.revokeObjectURL(objectUrl);
        };

        const fail = () => {
            cleanup();
            reject(new Error("Impossible de lire la durée de cette vidéo."));
        };

        video.preload = "metadata";
        video.onloadedmetadata = () => {
            const duration = Number(video.duration);
            cleanup();
            if (!Number.isFinite(duration) || duration <= 0) {
                reject(new Error("Durée vidéo invalide."));
                return;
            }
            resolve(duration);
        };
        video.onerror = fail;
        video.onabort = fail;
        video.src = objectUrl;
    });
}

let mediabunnyModulePromise = null;

function loadMediabunny() {
    if (!mediabunnyModulePromise) {
        mediabunnyModulePromise = import(MEDIABUNNY_MODULE_URL).catch(
            (error) => {
                mediabunnyModulePromise = null;
                throw error;
            },
        );
    }
    return mediabunnyModulePromise;
}

function canTranscodeVideoInBrowser() {
    return (
        typeof window !== "undefined" &&
        typeof window.VideoEncoder === "function" &&
        typeof window.VideoDecoder === "function"
    );
}

function toEven(value) {
    return Math.max(2, Math.round(value / 2) * 2);
}

const MIME_BY_EXTENSION = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    avif: "image/avif",
    mp4: "video/mp4",
    m4v: "video/x-m4v",
    mov: "video/quicktime",
    webm: "video/webm",
    mkv: "video/x-matroska",
    "3gp": "video/3gpp",
    "3g2": "video/3gpp2",
    ogv: "video/ogg",
};

// Certains navigateurs mobiles laissent file.type vide : le bucket n'accepte
// que des images et des vidéos, on déduit donc le type de l'extension.
function resolveUploadContentType(file) {
    if (file?.type) return file.type;
    return MIME_BY_EXTENSION[getFileExtension(file)] || undefined;
}

function replaceFileExtension(name, extension) {
    const base = String(name || "media").replace(/\.[^/.]+$/, "");
    return `${base}.${extension}`;
}

// Réencode une vidéo en MP4 H.264 (720p max, 30 i/s max). Renvoie null si le
// navigateur ne sait pas le faire ou si le résultat n'est pas plus léger :
// l'appelant envoie alors le fichier d'origine.
async function transcodeVideoForUpload(file, onProgress) {
    if (!file || file.size < VIDEO_SKIP_BELOW_BYTES) return null;
    if (!canTranscodeVideoInBrowser()) return null;

    let mb;
    try {
        mb = await loadMediabunny();
    } catch (error) {
        console.warn("Mediabunny indisponible, envoi de l'original:", error);
        return null;
    }

    const input = new mb.Input({
        source: new mb.BlobSource(file),
        formats: mb.ALL_FORMATS,
    });

    try {
        const videoTrack = await input.getPrimaryVideoTrack();
        if (!videoTrack || !(await videoTrack.canDecode())) return null;

        const sourceWidth = videoTrack.displayWidth;
        const sourceHeight = videoTrack.displayHeight;
        if (!sourceWidth || !sourceHeight) return null;

        const scale = Math.min(
            1,
            VIDEO_MAX_SHORT_SIDE / Math.min(sourceWidth, sourceHeight),
        );
        const width = toEven(sourceWidth * scale);
        const height = toEven(sourceHeight * scale);
        const bitrate = Math.max(
            450_000,
            Math.round((VIDEO_BITRATE_720P * width * height) / (720 * 1280)),
        );
        const videoQuality = new mb.Quality({ bitrate });
        if (
            !(await mb.canEncodeVideo("avc", {
                width,
                height,
                quality: videoQuality,
            }))
        ) {
            return null;
        }

        let frameRate;
        try {
            const stats = await videoTrack.computePacketStats(120);
            if (stats.averagePacketRate > VIDEO_MAX_FRAME_RATE + 1) {
                frameRate = VIDEO_MAX_FRAME_RATE;
            }
        } catch (e) {
            // Débit d'images inconnu : on garde celui de la source.
        }

        const audioTrack = await input.getPrimaryAudioTrack();
        const canEncodeAac = await mb.canEncodeAudio("aac", {
            quality: new mb.Quality({ bitrate: VIDEO_AUDIO_BITRATE }),
        });

        const output = new mb.Output({
            format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
            target: new mb.BufferTarget(),
        });

        const conversion = await mb.Conversion.init({
            input,
            output,
            tracks: "primary",
            video: {
                width,
                height,
                fit: "contain",
                codec: "avc",
                quality: videoQuality,
                frameRate,
                forceTranscode: true,
            },
            // Sans encodeur AAC (ex : Firefox), on recopie la piste audio telle quelle.
            audio: canEncodeAac
                ? {
                      codec: "aac",
                      quality: new mb.Quality({ bitrate: VIDEO_AUDIO_BITRATE }),
                  }
                : {},
            showWarnings: false,
        });

        const lostAudio =
            audioTrack &&
            conversion.discardedTracks.some(
                (entry) => entry.track.type === "audio",
            );
        if (!conversion.isValid || lostAudio) return null;

        const startedAt = Date.now();
        let abortedForSlowness = false;
        conversion.onProgress = (progress) => {
            if (typeof onProgress === "function") onProgress(progress);
            const elapsed = (Date.now() - startedAt) / 1000;
            if (elapsed > 15 && progress > 0) {
                const estimatedTotal = elapsed / progress;
                if (estimatedTotal > VIDEO_MAX_TRANSCODE_SECONDS) {
                    abortedForSlowness = true;
                    conversion.cancel();
                }
            }
        };

        try {
            await conversion.execute();
        } catch (error) {
            if (abortedForSlowness) {
                console.info(
                    "Réencodage vidéo trop lent sur cet appareil, envoi de l'original.",
                );
                return null;
            }
            throw error;
        }

        const buffer = output.target.buffer;
        if (!buffer || buffer.byteLength >= file.size * 0.9) return null;

        const optimized = new File(
            [buffer],
            replaceFileExtension(file.name, "mp4"),
            { type: "video/mp4", lastModified: Date.now() },
        );
        console.info(
            `Vidéo optimisée : ${(file.size / 1048576).toFixed(1)} Mo -> ${(optimized.size / 1048576).toFixed(1)} Mo (${width}x${height})`,
        );
        return optimized;
    } catch (error) {
        console.warn("Réencodage vidéo impossible, envoi de l'original:", error);
        return null;
    } finally {
        try {
            input.dispose();
        } catch (e) {
            // ignore
        }
    }
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
        try {
            canvas.toBlob((blob) => resolve(blob || null), type, quality);
        } catch (e) {
            resolve(null);
        }
    });
}

// WebP quand le navigateur sait l'encoder (Safari renvoie du PNG à la place).
async function encodeCanvasCompact(canvas, quality, keepAlpha) {
    const webp = await canvasToBlob(canvas, "image/webp", quality);
    if (webp && webp.type === "image/webp") return webp;
    if (keepAlpha) return await canvasToBlob(canvas, "image/png");
    return await canvasToBlob(canvas, "image/jpeg", quality);
}

// Miniature affichée à la place de la vidéo tant qu'elle n'est pas lue :
// quelques dizaines de Ko au lieu de plusieurs Mo.
async function createVideoPoster(file) {
    if (!file || typeof document === "undefined") return null;
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    try {
        const frameReady = new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error("poster timeout")),
                10000,
            );
            video.addEventListener(
                "loadeddata",
                () => {
                    const duration = Number(video.duration) || 0;
                    video.currentTime =
                        duration > 0 ? Math.min(0.5, duration / 4) : 0;
                },
                { once: true },
            );
            video.addEventListener(
                "seeked",
                () => {
                    clearTimeout(timer);
                    resolve();
                },
                { once: true },
            );
            video.addEventListener(
                "error",
                () => {
                    clearTimeout(timer);
                    reject(new Error("poster decode error"));
                },
                { once: true },
            );
        });
        video.src = objectUrl;
        await frameReady;

        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;
        if (!sourceWidth || !sourceHeight) return null;
        const scale = Math.min(
            1,
            VIDEO_POSTER_MAX_SIDE / Math.max(sourceWidth, sourceHeight),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(sourceWidth * scale);
        canvas.height = Math.round(sourceHeight * scale);
        canvas
            .getContext("2d")
            .drawImage(video, 0, 0, canvas.width, canvas.height);
        return await encodeCanvasCompact(canvas, 0.72, false);
    } catch (error) {
        console.warn("Miniature vidéo non générée:", error);
        return null;
    } finally {
        try {
            video.removeAttribute("src");
            video.load();
        } catch (e) {
            // ignore
        }
        URL.revokeObjectURL(objectUrl);
    }
}

function getImageMaxSideForFolder(folder) {
    return /avatar/i.test(String(folder || "")) ? AVATAR_MAX_SIDE : IMAGE_MAX_SIDE;
}

// Redimensionne et réencode une image. Renvoie le fichier d'origine si rien
// n'est à gagner (déjà petite, format illisible comme HEIC hors Safari, etc.).
async function optimizeImageForUpload(file, maxSide = IMAGE_MAX_SIDE) {
    if (!file || isGifFile(file) || file.__xeraOptimized) return file;

    const objectUrl = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.decoding = "async";
        img.src = objectUrl;
        await img.decode();

        const sourceWidth = img.naturalWidth;
        const sourceHeight = img.naturalHeight;
        if (!sourceWidth || !sourceHeight) return file;
        const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
        if (scale === 1 && file.size <= IMAGE_SKIP_BELOW_BYTES) {
            file.__xeraOptimized = true;
            return file;
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        const keepAlpha = file.type === "image/png" || file.type === "image/webp";
        const ctx = canvas.getContext("2d");
        if (!keepAlpha) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const blob = await encodeCanvasCompact(canvas, IMAGE_QUALITY, keepAlpha);
        if (!blob || (scale === 1 && blob.size >= file.size)) {
            file.__xeraOptimized = true;
            return file;
        }

        const extension =
            blob.type === "image/webp"
                ? "webp"
                : blob.type === "image/png"
                  ? "png"
                  : "jpg";
        const optimized = new File(
            [blob],
            replaceFileExtension(file.name, extension),
            { type: blob.type, lastModified: Date.now() },
        );
        optimized.__xeraOptimized = true;
        if (file.__xeraC2PA) optimized.__xeraC2PA = file.__xeraC2PA;
        return optimized;
    } catch (error) {
        console.warn("Optimisation image ignorée:", error);
        return file;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function isGifFile(file) {
    if (!file) return false;
    if (file.type === "image/gif") return true;
    if (typeof file.name === "string") {
        return file.name.toLowerCase().endsWith(".gif");
    }
    return false;
}

function isAllowedImageFile(file) {
    if (!file) return false;
    if (ALLOWED_IMAGE_TYPES.includes(file.type)) return true;
    const name = (file.name || "").toLowerCase();
    return (
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg") ||
        name.endsWith(".png") ||
        name.endsWith(".gif") ||
        name.endsWith(".webp") ||
        name.endsWith(".heic") ||
        name.endsWith(".heif")
    );
}

async function uploadFile(file, folder = "content", onProgress) {
    try {
        // Validation du type de fichier
        const isGif = isGifFile(file);
        const isImage = isAllowedImageFile(file) || isGif;
        const isVideo = isLikelyVideoFile(file);

        if (!isImage && !isVideo) {
            throw new Error(
                "Type de fichier non supporté. Utilisez une image ou une vidéo.",
            );
        }

        // Validation PRÉVENTIVE de la taille du fichier
        // Limite cliente : 1GB (la limite réelle dépend du plan Supabase)
        const fileSizeMB = file.size / (1024 * 1024);
        const MAX_UPLOAD_SIZE_MB = 1024; // 1GB

        if (fileSizeMB > MAX_UPLOAD_SIZE_MB) {
            throw new Error(
                `Fichier trop volumineux (${fileSizeMB.toFixed(1)}MB). La taille maximale est de ${MAX_UPLOAD_SIZE_MB}MB.`,
            );
        }

        // Pendant un réencodage vidéo, la barre de progression est partagée :
        // 0-40 % pour la compression, 40-100 % pour l'envoi.
        let progressOffset = 0;
        let progressScale = 1;
        const reportProgress = (percent) => {
            if (typeof onProgress !== "function") return;
            onProgress(
                Math.min(100, Math.round(progressOffset + percent * progressScale)),
            );
        };

        if (isGif && file.size > MAX_GIF_SIZE_BYTES) {
            throw new Error(
                `GIF trop lourd (${fileSizeMB.toFixed(1)} Mo). Maximum ${MAX_GIF_SIZE_BYTES / (1024 * 1024)} Mo : réduis-le ou publie-le en vidéo, c'est bien plus léger.`,
            );
        }

        if (isImage && !isGif) {
            file = await optimizeImageForUpload(
                file,
                getImageMaxSideForFolder(folder),
            );
        }

        let posterBlob = null;
        if (isVideo) {
            const durationSeconds = await readVideoDurationSeconds(file);
            if (durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
                throw new Error(
                    "Vidéo trop longue. Durée maximale autorisée : 60 minutes.",
                );
            }

            if (
                file.size >= VIDEO_SKIP_BELOW_BYTES &&
                canTranscodeVideoInBrowser()
            ) {
                reportProgress(0);
                const optimized = await transcodeVideoForUpload(
                    file,
                    (progress) => reportProgress(progress * 40),
                );
                progressOffset = 40;
                progressScale = 0.6;
                if (optimized) file = optimized;
            }

            posterBlob = await createVideoPoster(file);
        }

        // Validation de la taille
        if (file.size > MAX_FILE_SIZE) {
            throw new Error("Fichier trop volumineux.");
        }

        // Vérifier que l'utilisateur est connecté (PWA: currentUser peut être non hydraté)
        if (!window.currentUser) {
            try {
                const { data, error } = await supabase?.auth?.getUser?.();
                if (!error && data?.user) {
                    window.currentUser = data.user;
                    window.currentUserId = data.user.id;
                }
            } catch (e) {
                // ignore
            }
        }
        if (!window.currentUser) {
            throw new Error("Utilisateur non connecté. Reconnectez-vous.");
        }

        // Générer un nom de fichier unique
        const fileExt = file.name.split(".").pop();
        const fileName = `${window.currentUser.id}/${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const supportsResumable =
            typeof supabase?.storage?.from("media")?.uploadResumable ===
            "function";
        const useResumable =
            supportsResumable &&
            (file.size >= RESUMABLE_THRESHOLD_BYTES || isVideo);

        const baseFileOptions = {
            cacheControl: MEDIA_CACHE_CONTROL,
            contentType: resolveUploadContentType(file),
            upsert: false,
        };

        const notifyProgress = (progressEvent) => {
            if (!progressEvent) return;

            // Gestion de plusieurs formats possibles d'évènement de progression
            const uploadedBytes =
                progressEvent.bytesUploaded ||
                progressEvent.uploadedBytes ||
                progressEvent.loaded ||
                0;
            const totalBytes =
                progressEvent.bytesTotal ||
                progressEvent.totalBytes ||
                progressEvent.total ||
                file.size;

            if (!totalBytes) return;
            const percent = Math.min(
                100,
                Math.round((uploadedBytes / totalBytes) * 100),
            );

            if (typeof onProgress === "function") {
                reportProgress(percent);
            } else if (typeof showUploadProgress === "function") {
                showUploadProgress(uploadedBytes, totalBytes);
            }
        };

        let uploadResponse;
        let fakeProgressTimer = null;
        const startFakeProgress = () => {
            if (typeof onProgress !== "function") return;
            let current = 0;
            reportProgress(0);
            fakeProgressTimer = setInterval(() => {
                current = Math.min(95, current + Math.random() * 8 + 4);
                reportProgress(current);
            }, 350);
        };
        const stopFakeProgress = () => {
            if (fakeProgressTimer) {
                clearInterval(fakeProgressTimer);
                fakeProgressTimer = null;
            }
        };

        reportProgress(0);

        if (useResumable) {
            uploadResponse = await supabase.storage
                .from("media")
                .uploadResumable(fileName, file, baseFileOptions, {
                    chunkSize: RESUMABLE_CHUNK_SIZE_BYTES,
                    onUploadProgress: notifyProgress,
                });
        } else {
            startFakeProgress();
            try {
                uploadResponse = await supabase.storage
                    .from("media")
                    .upload(fileName, file, baseFileOptions);
            } finally {
                stopFakeProgress();
            }
        }

        const { data, error } = uploadResponse || {};

        if (error) {
            console.error("Erreur détaillée upload:", error);

            // Messages d'erreur plus spécifiques
            if (error.statusCode === 400) {
                throw new Error(
                    "Fichier invalide ou bucket media non configure. Executez sql/storage-init.sql dans Supabase puis reessayez.",
                );
            } else if (error.statusCode === 401) {
                throw new Error("Non autorisé. Vérifiez votre connexion.");
            } else if (error.statusCode === 413) {
                throw new Error(
                    "Fichier trop volumineux pour Supabase Storage. La limite dépend de votre abonnement (50MB gratuit, 1GB Pro).",
                );
            }

            // Check for size limit error in message
            const errorMsg = String(error.message || "").toLowerCase();
            if (
                errorMsg.includes("exceed") ||
                errorMsg.includes("maximum size") ||
                errorMsg.includes("trop volumineux")
            ) {
                throw new Error(
                    "Le fichier dépasse la taille maximale autorisée par Supabase Storage. Upgradez votre plan Supabase pour des fichiers plus volumineux.",
                );
            }

            throw new Error(
                error.message || "Erreur inconnue lors de l'upload",
            );
        }

        // Récupérer l'URL publique
        const {
            data: { publicUrl },
        } = supabase.storage.from("media").getPublicUrl(fileName);

        let posterUrl = null;
        if (posterBlob) {
            const posterExt = posterBlob.type === "image/webp" ? "webp" : "jpg";
            const posterPath = `${fileName.replace(/\.[^/.]+$/, "")}.poster.${posterExt}`;
            try {
                const { error: posterError } = await supabase.storage
                    .from("media")
                    .upload(posterPath, posterBlob, {
                        cacheControl: MEDIA_CACHE_CONTROL,
                        contentType: posterBlob.type,
                        upsert: false,
                    });
                if (!posterError) {
                    posterUrl = supabase.storage
                        .from("media")
                        .getPublicUrl(posterPath).data.publicUrl;
                }
            } catch (e) {
                console.warn("Miniature vidéo non envoyée:", e);
            }
        }

        if (typeof onProgress === "function") {
            try {
                onProgress(100);
            } catch (e) {
                // ignore progress errors
            }
        }

        return {
            success: true,
            url: publicUrl,
            path: fileName,
            type: isImage ? "image" : "video",
            posterUrl,
            // Aperçu local : évite de re-télécharger le fichier qu'on vient d'envoyer.
            previewUrl: isVideo ? URL.createObjectURL(file) : null,
        };
    } catch (error) {
        console.error("Erreur upload:", error);
        return {
            success: false,
            error: error.message,
        };
    }
}

// Uploader plusieurs fichiers
async function uploadMultipleFiles(
    files,
    folder = "content",
    onProgress = null,
) {
    const results = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const result = await uploadFile(file, folder);
        results.push(result);

        if (onProgress) {
            onProgress(i + 1, files.length);
        }
    }

    return results;
}

// Supprimer un fichier de Supabase Storage
async function deleteFile(filePath) {
    try {
        const { error } = await supabase.storage
            .from("media")
            .remove([filePath]);

        if (error) throw error;

        return { success: true };
    } catch (error) {
        console.error("Erreur suppression:", error);
        return { success: false, error: error.message };
    }
}

// Créer un aperçu d'image
function createImagePreview(file, callback) {
    const reader = new FileReader();

    reader.onload = (e) => {
        callback(e.target.result);
    };

    reader.readAsDataURL(file);
}

// Compresser une image avant upload
async function compressImage(file, maxWidth = IMAGE_MAX_SIDE) {
    return await optimizeImageForUpload(file, maxWidth);
}

// Initialiser un input de fichier avec drag & drop
function initializeFileInput(inputId, options = {}) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const dropZone = options.dropZone || input.parentElement;
    const preview = options.preview;
    const onUpload = options.onUpload;
    const onUploadBatch = options.onUploadBatch;
    const onBeforeUpload = options.onBeforeUpload;
    const onAfterUpload = options.onAfterUpload;
    const onProgress = options.onProgress;
    const folder = options.folder;
    const resolveMultiple = () =>
        typeof options.multiple === "function"
            ? !!options.multiple()
            : !!options.multiple;
    const parallelUploads = Math.max(
        1,
        Number.parseInt(options.parallelUploads, 10) || 1,
    );
    const compress = options.compress || false;
    const validate = options.validate;

    // Gérer la sélection de fichiers
    input.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const allowMultiple = resolveMultiple();
        const chosen = allowMultiple ? files : files.slice(0, 1);
        const uploaded = await handleFileSelection(
            chosen,
            preview,
            onUpload,
            compress,
            {
                validate,
                onBeforeUpload,
                onAfterUpload,
                onProgress,
                folder,
                parallelUploads,
            },
        );
        input.value = "";

        if (typeof onUploadBatch === "function") {
            try {
                onUploadBatch(uploaded);
            } catch (err) {
                console.error("Erreur onUploadBatch:", err);
            }
        }
    });

    // Gérer le drag & drop
    if (dropZone) {
        dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropZone.classList.add("drag-over");
        });

        dropZone.addEventListener("dragleave", () => {
            dropZone.classList.remove("drag-over");
        });

        dropZone.addEventListener("drop", async (e) => {
            e.preventDefault();
            dropZone.classList.remove("drag-over");

            const files = Array.from(e.dataTransfer.files);
            if (files.length === 0) return;

            const allowMultiple = resolveMultiple();
            const chosen = allowMultiple ? files : files.slice(0, 1);
            const uploaded = await handleFileSelection(
                chosen,
                preview,
                onUpload,
                compress,
                {
                    validate,
                    onBeforeUpload,
                    onAfterUpload,
                    onProgress,
                    folder,
                    parallelUploads,
                },
            );

            if (typeof onUploadBatch === "function") {
                try {
                    onUploadBatch(uploaded);
                } catch (err) {
                    console.error("Erreur onUploadBatch:", err);
                }
            }
        });
    }
}

// Gérer la sélection de fichiers
async function handleFileSelection(
    files,
    preview,
    onUpload,
    compress,
    options = {},
) {
    const uploadedFiles = [];
    const validate = options.validate;
    const onBeforeUpload = options.onBeforeUpload;
    const onAfterUpload = options.onAfterUpload;
    const onProgress = options.onProgress;
    const folder = options.folder || "content";
    const totalFiles = Array.isArray(files) ? files.length : 0;
    const parallelUploads = Math.max(
        1,
        Number.parseInt(options.parallelUploads, 10) || 1,
    );
    const progressState = new Array(totalFiles).fill(0);

    const emitProgress = (currentIndex, file, filePercent) => {
        if (typeof onProgress !== "function") return;
        const safePercent =
            typeof filePercent === "number" && Number.isFinite(filePercent)
                ? Math.max(0, Math.min(100, filePercent))
                : 0;
        progressState[currentIndex] = safePercent;
        const completed = progressState.reduce((sum, value) => sum + value, 0);
        const overallPercent =
            totalFiles > 0 ? Math.round(completed / totalFiles) : safePercent;
        onProgress(overallPercent, {
            filePercent: safePercent,
            fileIndex: currentIndex,
            totalFiles,
            file,
        });
    };

    const processFile = async (file, currentIndex) => {
        if (typeof validate === "function") {
            const validation = validate(file);
            if (validation === false) {
                notifyUploadError("Fichier non autorisé.");
                emitProgress(currentIndex, file, 100);
                return null;
            }
            if (typeof validation === "string") {
                notifyUploadError(validation);
                emitProgress(currentIndex, file, 100);
                return null;
            }
            if (validation && validation.valid === false) {
                notifyUploadError(validation.error || "Fichier non autorisé.");
                emitProgress(currentIndex, file, 100);
                return null;
            }
        }

        let c2paInspection = null;
        if (typeof inspectMediaC2PA === "function") {
            try {
                c2paInspection = await inspectMediaC2PA(file);
                if (c2paInspection && c2paInspection.isAI) {
                    console.info(
                        "C2PA AI metadata detected before compression:",
                        c2paInspection,
                    );
                }
                file.__xeraC2PA = c2paInspection;
                window.__xeraLatestMediaC2PA = c2paInspection;
            } catch (error) {
                console.warn(
                    "Inspection C2PA ignorée avant compression:",
                    error,
                );
            }
        }

        if (preview && isAllowedImageFile(file)) {
            createImagePreview(file, (dataUrl) => {
                if (typeof preview === "function") {
                    preview(dataUrl);
                } else if (typeof preview === "string") {
                    const previewElement = document.getElementById(preview);
                    if (previewElement) {
                        previewElement.src = dataUrl;
                    }
                }
            });
        }

        let fileToUpload = file;
        const shouldCompress =
            compress && isAllowedImageFile(file) && !isGifFile(file);
        if (shouldCompress) {
            try {
                fileToUpload = await compressImage(
                    file,
                    getImageMaxSideForFolder(folder),
                );
                if (c2paInspection) {
                    fileToUpload.__xeraC2PA = c2paInspection;
                }
            } catch (error) {
                console.error("Erreur compression:", error);
                if (c2paInspection) {
                    fileToUpload.__xeraC2PA = c2paInspection;
                }
            }
        }

        if (typeof onBeforeUpload === "function") {
            try {
                onBeforeUpload(fileToUpload);
            } catch (e) {
                console.error("Erreur onBeforeUpload:", e);
            }
        }

        let result;
        try {
            result = await uploadFile(fileToUpload, folder, (filePercent) =>
                emitProgress(currentIndex, file, filePercent),
            );
        } finally {
            emitProgress(currentIndex, file, 100);
            if (typeof onAfterUpload === "function") {
                try {
                    onAfterUpload();
                } catch (e) {
                    console.error("Erreur onAfterUpload:", e);
                }
            }
        }

        if (result && c2paInspection) {
            result.c2pa = c2paInspection;
            result.is_ai = !!c2paInspection.isAI;
            result.provenance = c2paInspection.provenance || null;
            result.source = c2paInspection.source || null;
            window.__xeraLatestMediaC2PA = c2paInspection;
        }

        uploadedFiles[currentIndex] = result;
        if (onUpload) {
            onUpload(result);
        }
        return result;
    };

    if (parallelUploads <= 1 || totalFiles <= 1) {
        for (let index = 0; index < totalFiles; index += 1) {
            await processFile(files[index], index);
        }
        return uploadedFiles.filter((item) => item !== undefined);
    }

    let nextIndex = 0;
    const workerCount = Math.min(parallelUploads, totalFiles);
    const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < totalFiles) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            await processFile(files[currentIndex], currentIndex);
        }
    });
    await Promise.all(workers);

    return uploadedFiles.filter((item) => item !== undefined);
}

function notifyUploadError(message) {
    if (
        window.ToastManager &&
        typeof window.ToastManager.error === "function"
    ) {
        window.ToastManager.error("Erreur", message);
        return;
    }
    alert("Erreur: " + message);
}

// Afficher une barre de progression d'upload
function showUploadProgress(current, total) {
    const progressBar = document.getElementById("upload-progress");
    if (!progressBar) return;

    const percentage = Math.round((current / total) * 100);
    progressBar.style.width = `${percentage}%`;
    progressBar.textContent = `${current}/${total}`;

    if (current === total) {
        setTimeout(() => {
            progressBar.style.width = "0%";
            progressBar.textContent = "";
        }, 1000);
    }
}

// Valider un fichier avant upload
function validateFile(file) {
    const errors = [];

    // Vérifier le type
    const isImage = isAllowedImageFile(file);
    const isVideo = isLikelyVideoFile(file);

    if (!isImage && !isVideo) {
        errors.push("Type de fichier non supporté");
    }

    // Vérifier la taille (1GB max)
    const MAX_CLIENT_SIZE = 1024 * 1024 * 1024; // 1GB
    if (file.size > MAX_CLIENT_SIZE) {
        errors.push("Fichier trop volumineux (max 1GB)");
    }

    return {
        valid: errors.length === 0,
        errors: errors,
    };
}

// Formater la taille d'un fichier
function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
