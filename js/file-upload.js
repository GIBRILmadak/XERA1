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

        if (isVideo) {
            const durationSeconds = await readVideoDurationSeconds(file);
            if (durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
                throw new Error(
                    "Vidéo trop longue. Durée maximale autorisée : 60 minutes.",
                );
            }
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
            contentType: file.type || undefined,
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
                onProgress(percent);
            } else if (typeof showUploadProgress === "function") {
                showUploadProgress(uploadedBytes, totalBytes);
            }
        };

        let uploadResponse;
        let fakeProgressTimer = null;
        const startFakeProgress = () => {
            if (typeof onProgress !== "function") return;
            let current = 0;
            onProgress(0);
            fakeProgressTimer = setInterval(() => {
                current = Math.min(95, current + Math.random() * 8 + 4);
                onProgress(current);
            }, 350);
        };
        const stopFakeProgress = () => {
            if (fakeProgressTimer) {
                clearInterval(fakeProgressTimer);
                fakeProgressTimer = null;
            }
        };

        if (typeof onProgress === "function") {
            onProgress(0);
        }

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
async function compressImage(file, maxWidth = 1920, quality = 0.8) {
    if (isGifFile(file)) {
        return file;
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();

            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;

                // Redimensionner si nécessaire
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(
                                new Error("Impossible de compresser l'image."),
                            );
                            return;
                        }
                        const compressedFile = new File([blob], file.name, {
                            type: "image/jpeg",
                            lastModified: Date.now(),
                        });
                        resolve(compressedFile);
                    },
                    "image/jpeg",
                    quality,
                );
            };

            img.onerror = reject;
            img.src = e.target.result;
        };

        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
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
                fileToUpload = await compressImage(file);
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
