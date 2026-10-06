const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const logger = require("./logger");
if (typeof global.WebSocket === "undefined") { try { global.WebSocket = require("ws"); } catch (e) {} }
const { createClient } = require("@supabase/supabase-js");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const webpush = require("web-push");
const crypto = require("crypto");
const {
    validatePartnerAccess,
    resolvePartnerPromoCode,
    applyPartnerDiscount,
    calculatePartnerCommission,
} = require("./partner-logic");
const { buildBotPostDraft } = require("./bot-post-generator");
const { normalizeReturnPathForBrowser } = require("./payment-return-paths");
const {
    buildDistributedMinuteSlots,
    buildIsoFromMinuteOfDay,
    getBotDailyEncourageTarget,
    getDeterministicRandom,
} = require("./bot-schedule-utils");
const {
    rankUsersIntelligently,
    fetchUserEngagementStats,
} = require("./recommendation-engine");

dotenv.config();

const {
    APP_BASE_URL = "http://localhost:3000",
    APP_FRONTEND_URL = "",
    PORT = 5050,
    SUPABASE_URL = "https://ssbuagqwjptyhavinkxg.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY,
    VAPID_PUBLIC_KEY = "BDyU4kv_cnxruA5n_i3kw0-ipEXZTINrLmwVAhyyFhXsIVC6eImDqhkLVLs77Fl-TJdyOJVZsnp-k6z_7bu0bTM",
    VAPID_PRIVATE_KEY = "6dmRHoFpyGEFgL487qqwBc9BQ184TC8N9Yd3siS94Skpka",
    PUSH_CONTACT_EMAIL = "mailto:hello@xera1.xyz",
    RETURN_REMINDER_HOURS = "10,18",
    RETURN_REMINDER_WINDOW_MINUTES = "15",
    RETURN_REMINDER_SWEEP_MS = "600000",
    RETURN_REMINDER_EMAIL_ENABLED = "0",
    RETURN_REMINDER_EMAIL_PROVIDER = "none",
    RETURN_REMINDER_EMAIL_FROM = "XERA1 <hello@xera1.xyz>",
    RETURN_REMINDER_EMAIL_REPLY_TO = "hello@xera1.xyz",
    RETURN_REMINDER_EMAIL_API_KEY = "",
    RETURN_REMINDER_EMAIL_WEBHOOK_URL = "",
    RETURN_REMINDER_EMAIL_WEBHOOK_TOKEN = "",
    USD_TO_CDF_RATE = "2300",
    CALLBACK_BASE_URL = "",
    KPAY_USE_CALLBACK = "1",
} = process.env;

function readEnvVar(...names) {
    for (const name of names) {
        if (!name) continue;
        const val = process.env[name];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
            return String(val).trim();
        }
    }
    return "";
}

const KPAY_PUBLIC_KEY =
    readEnvVar(
        "KPAY_PUBLIC_KEY",
        "CLÉ PUBLIQUE KPAY",
        "CLE_PUBLIQUE_KPAY",
        "CLE PUBLIQUE KPAY",
    ) ||
    process.env.KPAY_PUBLIC_KEY ||
    "";
const KPAY_SECRET_KEY =
    readEnvVar(
        "KPAY_SECRET_KEY",
        "CLÉ SECRÈTE KPAY",
        "CLE_SECRETE_KPAY",
        "CLE SECRETE KPAY",
    ) ||
    process.env.KPAY_SECRET_KEY ||
    "";

const KPAY_GATEWAY_MODE = process.env.KPAY_GATEWAY_MODE || "1";
const KPAY_CHECKOUT_URL =
    process.env.KPAY_CHECKOUT_URL || "https://admin.kpay.site";
const KPAY_CALLBACK_SECRET =
    readEnvVar("KPAY_CALLBACK_SECRET", "KPAY_CALLBACK_SECRET") ||
    process.env.KPAY_CALLBACK_SECRET ||
    "";
const KPAY_WEBHOOK_SECRET =
    readEnvVar(
        "KPAY_WEBHOOK_SECRET",
        "SECRET DU WEBHOOK KPAY",
        "SECRET_DU_WEBHOOK_KPAY",
        "SECRET WEBHOOK KPAY",
    ) ||
    process.env.KPAY_WEBHOOK_SECRET ||
    "";
const KPAY_PAYOUTS_ENABLED =
    readEnvVar(
        "KPAY_PAYOUTS_ENABLED",
        "KPAY_PAYOUTS_ACTIVÉ",
        "KPAY_PAYOUTS_ACTIVE",
    ) ||
    process.env.KPAY_PAYOUTS_ENABLED ||
    "0";
const KPAY_PAYOUT_CURRENCIES =
    readEnvVar("KPAY_PAYOUT_CURRENCIES") ||
    process.env.KPAY_PAYOUT_CURRENCIES ||
    "{}";
const SUPER_ADMIN_ID =
    process.env.SUPER_ADMIN_ID || "b0f9f893-1706-4721-899c-d26ad79afc86";

// Validate configuration for production
const isProduction =
    String(process.env.NODE_ENV || "").toLowerCase() === "production";
if (isProduction) {
    if (!KPAY_PUBLIC_KEY || KPAY_PUBLIC_KEY.includes("kpay_test")) {
        console.error(
            "CRITICAL: Missing or invalid KPAY_PUBLIC_KEY for production.",
        );
    }
    if (!KPAY_SECRET_KEY || KPAY_SECRET_KEY.includes("sk_test")) {
        console.error(
            "CRITICAL: Missing or invalid KPAY_SECRET_KEY for production.",
        );
    }
    if (!KPAY_CALLBACK_SECRET || KPAY_CALLBACK_SECRET === "...") {
        console.error(
            "CRITICAL: Missing or invalid KPAY_CALLBACK_SECRET for production.",
        );
    }
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    // Do not exit the process in serverless environments (Vercel functions)
    // to avoid FUNCTION_INVOCATION_FAILED on missing env vars. Endpoints
    // will return errors later if configuration is invalid.
}

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn(
        "Warning: Missing VAPID keys. Push notifications will not be sent.",
    );
} else {
    // Normalize subject: allow plain email addresses in .env
    let vapidSubject = String(PUSH_CONTACT_EMAIL || "").trim();
    if (vapidSubject && !/^(mailto:|https?:)/i.test(vapidSubject)) {
        vapidSubject = `mailto:${vapidSubject}`;
    }
    try {
        webpush.setVapidDetails(
            vapidSubject,
            VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY,
        );
    } catch (err) {
        console.warn("Invalid VAPID configuration:", err?.message || err);
    }
}

// Firebase Admin (FCM / APNs via FCM)
let firebaseAdminInitialized = false;
let firebaseAdmin = null;
try {
    firebaseAdmin = require("firebase-admin");
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } =
        process.env;

    if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
        try {
            firebaseAdmin.initializeApp({
                credential: firebaseAdmin.credential.cert({
                    projectId: FIREBASE_PROJECT_ID,
                    clientEmail: FIREBASE_CLIENT_EMAIL,
                    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
                }),
            });
            firebaseAdminInitialized = true;
            logger.info("Firebase admin initialized for native push");
        } catch (err) {
            console.warn(
                "Failed to initialize Firebase admin:",
                err?.message || err,
            );
        }
    } else {
        logger.info("Firebase admin not configured; native push disabled.");
    }
} catch (err) {
    logger.info("firebase-admin not installed; native push disabled.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const app = express();
// Must be registered before express.json(): KPay signs the exact raw JSON bytes.
app.post(
    "/api/webhooks/kpay",
    express.raw({ type: "application/json" }),
    async (req, res) => {
        const signature = String(req.headers["x-kpay-signature"] || "")
            .trim()
            .toLowerCase();
        const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
        if (!KPAY_WEBHOOK_SECRET || !signature || !raw.length)
            return res.status(400).send("Invalid webhook");
        const expected = crypto
            .createHmac("sha256", KPAY_WEBHOOK_SECRET)
            .update(raw)
            .digest("hex");
        if (
            signature.length !== expected.length ||
            !crypto.timingSafeEqual(
                Buffer.from(signature),
                Buffer.from(expected),
            )
        )
            return res.status(400).send("Invalid signature");
        let payload;
        try {
            payload = JSON.parse(raw.toString("utf8"));
        } catch (_) {
            return res.status(400).send("Invalid JSON");
        }
        const event = String(
            payload?.event || req.headers["x-kpay-event"] || "",
        ).toLowerCase();
        // This callback is deliberately restricted to payouts; deposit activation keeps
        // using the already secured checkout callback flow.
        if (!event.startsWith("payout."))
            return res.status(200).send("Ignored");
        const status = String(payload?.status || "").toUpperCase();
        if (!["COMPLETED", "FAILED", "CANCELLED"].includes(status))
            return res.status(200).send("Acknowledged");
        const withdrawalId = String(payload?.externalId || "").replace(
            /^XERA-WD-/,
            "",
        );
        if (!withdrawalId) return res.status(400).send("Missing external id");
        try {
            const paid = status === "COMPLETED";
            const isPartnerPayout = withdrawalId.startsWith("PW-");
            const { error } = await supabase
                .from(
                    isPartnerPayout ? "partner_payouts" : "withdrawal_requests",
                )
                .update({
                    status: paid ? "paid" : "rejected",
                    kpay_status: status,
                    kpay_withdrawal_id:
                        payload?.paymentId ||
                        payload?.withdrawalId ||
                        payload?.id ||
                        null,
                    kpay_reference: payload?.reference || null,
                    paid_at: paid
                        ? payload?.completedAt || new Date().toISOString()
                        : null,
                    ...(isPartnerPayout
                        ? {
                              note: paid
                                  ? null
                                  : `KPay: ${String(payload?.failureReason || status).slice(0, 220)}`,
                          }
                        : {
                              admin_note: paid
                                  ? null
                                  : `KPay: ${String(payload?.failureReason || status).slice(0, 220)}`,
                          }),
                    updated_at: new Date().toISOString(),
                })
                .eq(
                    "id",
                    isPartnerPayout ? withdrawalId.slice(3) : withdrawalId,
                )
                .eq("status", "processing");
            if (error) throw error;
            return res.status(200).send("OK");
        } catch (error) {
            console.error("KPay payout webhook error:", error);
            return res.status(500).send("Retry");
        }
    },
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "..")));

app.post("/api/account/delete", async (req, res) => {
    try {
        const authorization = String(req.headers.authorization || "");
        const token = authorization.startsWith("Bearer ")
            ? authorization.slice("Bearer ".length).trim()
            : "";
        if (!token) {
            return res
                .status(401)
                .json({ error: "Missing authorization token" });
        }

        const { data: authData, error: authError } =
            await supabase.auth.getUser(token);
        const authenticatedUser = authData?.user;
        if (authError || !authenticatedUser?.id) {
            return res.status(401).json({ error: "Invalid session token" });
        }

        const userId = authenticatedUser.id;
        const requestedUserId = String(req.body?.userId || "").trim();
        if (requestedUserId && requestedUserId !== userId) {
            return res
                .status(403)
                .json({ error: "Forbidden account deletion target" });
        }

        const allowedReasons = new Set([
            "inactive",
            "technical",
            "privacy",
            "experience",
            "other",
        ]);
        const reason = allowedReasons.has(String(req.body?.reason || ""))
            ? String(req.body.reason)
            : "other";
        const detail = String(req.body?.detail || "")
            .trim()
            .slice(0, 1200);

        // Keep deletion feedback separate and best-effort so it never blocks deletion.
        try {
            await supabase.from("feedback_inbox").insert({
                mood: null,
                comment:
                    `account-delete:${reason}${detail ? ` | detail:${detail}` : ""}`.slice(
                        0,
                        400,
                    ),
                sender_user_id: userId,
                receiver_id: null,
            });
        } catch (feedbackError) {
            console.warn(
                "Account delete feedback insert failed:",
                feedbackError?.message || feedbackError,
            );
        }

        const { error: profileDeleteError } = await supabase
            .from("users")
            .delete()
            .eq("id", userId);
        if (profileDeleteError) throw profileDeleteError;

        const { error: authDeleteError } =
            await supabase.auth.admin.deleteUser(userId);
        if (authDeleteError) throw authDeleteError;

        return res.json({ ok: true });
    } catch (error) {
        console.error("Account delete error:", error);
        return res.status(500).json({
            error: error?.message || "Unable to delete account",
        });
    }
});

const allowedOrigins = [APP_BASE_URL, APP_FRONTEND_URL]
    .flatMap((value) => String(value || "").split(","))
    .map((v) => v.trim())
    .filter(Boolean);

// Nettoie une adresse : "https://XERA1.xyz/" devient "https://xera1.xyz"
function normalizeOrigin(value) {
    try {
        return new URL(String(value || "").trim()).origin.toLowerCase();
    } catch (_) {
        return "";
    }
}

// Liste CORS : adresses nettoyees + variante avec / sans "www."
const corsAllowedOrigins = new Set();
allowedOrigins.forEach((raw) => {
    const origin = normalizeOrigin(raw);
    if (!origin) return;
    corsAllowedOrigins.add(origin);
    const variant = new URL(origin);
    variant.hostname = variant.hostname.startsWith("www.")
        ? variant.hostname.slice(4)
        : "www." + variant.hostname;
    corsAllowedOrigins.add(variant.origin);
});

function isLoopbackOrigin(origin) {
    try {
        const url = new URL(String(origin || "").trim());
        return (
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname)
        );
    } catch (error) {
        return false;
    }
}

function isOriginAllowed(req) {
    const origin = req.headers.origin;
    if (!origin) return true; // webhooks, curl, appels serveur a serveur
    const normalized = normalizeOrigin(origin);
    if (corsAllowedOrigins.has(normalized) || isLoopbackOrigin(origin)) {
        return true;
    }
    // Ton propre site qui appelle son propre serveur est toujours accepte
    return normalized === normalizeOrigin(getRequestOrigin(req));
}

// Refus explicite : 403 clair, jamais 500
app.use((req, res, next) => {
    if (isOriginAllowed(req)) return next();
    console.warn(
        "[CORS] origine refusee:",
        req.headers.origin,
        "| host:",
        req.headers.host,
    );
    return res.status(403).json({
        error: "origin_not_allowed",
        message: "Origine non autorisee.",
    });
});

app.use(
    cors({
        origin: true, // le controle est deja fait juste au-dessus
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
);

// Routes OAuth: keep body parsing and CORS in front of these handlers.
app.use("/api/auth", (req, res, next) => {
    return require("./oauth-handler")(req, res, next);
});

const APP_PROFILE_CACHE_TTL_MS = Math.max(
    5000,
    parseInt(process.env.APP_PROFILE_CACHE_TTL_MS || "15000", 10) || 15000,
);
const APP_DISCOVER_CACHE_TTL_MS = Math.max(
    5000,
    parseInt(process.env.APP_DISCOVER_CACHE_TTL_MS || "20000", 10) || 20000,
);
const APP_QUERY_CACHE = new Map();

function parseBooleanEnv(value, fallback = false) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return fallback;
}

function hasPublicCallbackBaseUrl(value) {
    const raw = String(value || "").trim();
    if (!raw || raw.includes("xxxxx.loca.lt")) return false;
    try {
        const url = new URL(raw);
        const hostname = String(url.hostname || "").toLowerCase();

        // Autoriser localhost pour les tests en dehors de la production
        const isProduction =
            String(process.env.NODE_ENV || "").toLowerCase() === "production";
        if (hostname === "localhost" || hostname === "127.0.0.1") {
            return !isProduction;
        }

        if (url.protocol !== "https:") return false;
        return true;
    } catch (error) {
        return false;
    }
}

function stripTrailingSlash(value) {
    return String(value || "")
        .trim()
        .replace(/\/+$/, "");
}

function resolveCallbackOrigin(callbackBaseUrl, primaryOrigin) {
    const explicitOrigin = stripTrailingSlash(callbackBaseUrl);
    if (hasPublicCallbackBaseUrl(explicitOrigin)) {
        return explicitOrigin;
    }

    const fallbackOrigin = stripTrailingSlash(primaryOrigin);
    if (hasPublicCallbackBaseUrl(fallbackOrigin)) {
        return fallbackOrigin;
    }

    return "";
}

function getRequestOrigin(req) {
    const forwardedProto = String(
        req?.headers?.["x-forwarded-proto"] || req?.protocol || "",
    )
        .split(",")[0]
        .trim()
        .toLowerCase();
    const forwardedHost = String(
        req?.headers?.["x-forwarded-host"] || req?.headers?.host || "",
    )
        .split(",")[0]
        .trim();

    if (!forwardedProto || !forwardedHost) {
        return "";
    }

    return stripTrailingSlash(`${forwardedProto}://${forwardedHost}`);
}

function readHeader(req, headerName) {
    if (!req || !req.headers) return "";
    const directValue = req.headers[headerName];
    if (typeof directValue === "string") return directValue.trim();

    const normalizedKey = Object.keys(req.headers).find(
        (key) => key && key.toLowerCase() === String(headerName).toLowerCase(),
    );
    return normalizedKey ? String(req.headers[normalizedKey] || "").trim() : "";
}

function authorizeCronRequest(req) {
    const configuredSecret = String(process.env.CRON_SECRET || "").trim();
    if (!configuredSecret) {
        return { ok: true, unsecured: true };
    }

    const authHeader = readHeader(req, "authorization");
    const bearerToken = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : "";
    const headerSecret = readHeader(req, "x-cron-secret");
    const providedSecret = bearerToken || headerSecret;

    if (providedSecret && providedSecret === configuredSecret) {
        return { ok: true, unsecured: false };
    }

    return {
        ok: false,
        status: 401,
        message: "Unauthorized cron request.",
    };
}

function escapeHtmlAttr(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

const PRODUCTION_FALLBACK_ORIGIN = "https://xera1.xyz";
const PRIMARY_ORIGIN = (() => {
    const fromEnv =
        APP_FRONTEND_URL.split(",")[0]?.trim() ||
        allowedOrigins[0] ||
        (APP_BASE_URL ? String(APP_BASE_URL).split(",")[0] : "");
    const clean = stripTrailingSlash(fromEnv);
    if (clean) return clean;
    const isProd =
        String(process.env.NODE_ENV || "").toLowerCase() === "production";
    return isProd ? PRODUCTION_FALLBACK_ORIGIN : "http://localhost:3000";
})();
const CALLBACK_ORIGIN = resolveCallbackOrigin(
    CALLBACK_BASE_URL,
    PRIMARY_ORIGIN,
);
const KPAY_CALLBACK_ALLOWED = parseBooleanEnv(KPAY_USE_CALLBACK, true);
const KPAY_CALLBACK_ENABLED = KPAY_CALLBACK_ALLOWED && Boolean(CALLBACK_ORIGIN);
const DEFAULT_SHARE_IMAGE_URL = `${PRIMARY_ORIGIN}/icons/logo-512x512.png`;

function escapeHtmlText(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function buildAbsoluteAppUrl(path = "/") {
    const cleanPath = String(path || "/").replace(/^\/?/, "/");
    return `${PRIMARY_ORIGIN}${cleanPath}`;
}

function toAbsoluteShareAssetUrl(value, fallback = DEFAULT_SHARE_IMAGE_URL) {
    const raw = String(value || "").trim();
    if (!raw) return fallback;
    try {
        return new URL(raw, PRIMARY_ORIGIN).toString();
    } catch (error) {
        return fallback;
    }
}

function firstMediaUrl(row) {
    const rawMediaUrls = row?.media_urls;
    if (Array.isArray(rawMediaUrls)) {
        return rawMediaUrls.find(Boolean) || row?.media_url || "";
    }
    if (typeof rawMediaUrls === "string") {
        try {
            const parsed = JSON.parse(rawMediaUrls);
            if (Array.isArray(parsed))
                return parsed.find(Boolean) || row?.media_url || "";
        } catch (error) {
            // Ignore malformed legacy values and fall back to media_url.
        }
    }
    return row?.media_url || "";
}

function pickShareImage(row, fallback = DEFAULT_SHARE_IMAGE_URL) {
    const explicitImage =
        row?.thumbnail_url || row?.avatar || row?.banner || "";
    if (explicitImage) return toAbsoluteShareAssetUrl(explicitImage, fallback);
    const type = String(row?.type || "").toLowerCase();
    const mediaUrl = firstMediaUrl(row);
    if (type === "image" && mediaUrl) {
        return toAbsoluteShareAssetUrl(mediaUrl, fallback);
    }
    return fallback;
}

function summarizeShareDescription(value, fallback) {
    const clean = String(value || "")
        .replace(/#\[[^\]]+\]\([^)]*\)/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return clean.slice(0, 220) || fallback;
}

function renderOpenGraphSharePage({
    title,
    description,
    image,
    url,
    targetUrl,
    type = "website",
}) {
    const safeTitle = escapeHtmlAttr(
        title || "XERA1 | Tracez votre progression",
    );
    const safeDescription = escapeHtmlAttr(
        description || "Découvrez les trajectoires créatives sur XERA1",
    );
    const safeImage = escapeHtmlAttr(image || DEFAULT_SHARE_IMAGE_URL);
    const safeUrl = escapeHtmlAttr(url || PRIMARY_ORIGIN);
    const safeTargetUrl = escapeHtmlAttr(targetUrl || PRIMARY_ORIGIN);
    const safeType = escapeHtmlAttr(type || "website");

    return `<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}">
    <link rel="canonical" href="${safeUrl}">
    <meta property="og:site_name" content="XERA1">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDescription}">
    <meta property="og:type" content="${safeType}">
    <meta property="og:url" content="${safeUrl}">
    <meta property="og:image" content="${safeImage}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${safeTitle}">
    <meta name="twitter:description" content="${safeDescription}">
    <meta name="twitter:image" content="${safeImage}">
    <meta http-equiv="refresh" content="1;url=${safeTargetUrl}">
</head>
<body>
    <main>
        <h1>${escapeHtmlText(title || "XERA1")}</h1>
        <p>${escapeHtmlText(description || "Ouverture de XERA1...")}</p>
        <p><a href="${safeTargetUrl}">Ouvrir dans XERA1</a></p>
    </main>
</body>
</html>`;
}

async function handleContentSharePage(req, res) {
    const contentId = String(req.params.id || "").trim();
    if (!contentId) return res.status(404).send("Content not found");

    try {
        const { data: content, error } = await supabase
            .from("content")
            .select(
                "id, user_id, title, description, type, media_url, media_urls, thumbnail_url",
            )
            .eq("id", contentId)
            .maybeSingle();

        if (error) throw error;
        if (!content) return res.status(404).send("Content not found");

        const shareUrl = buildAbsoluteAppUrl(
            `/share/content/${encodeURIComponent(content.id)}`,
        );
        const targetUrl = buildAbsoluteAppUrl(
            `/index.html?content=${encodeURIComponent(content.id)}`,
        );
        const html = renderOpenGraphSharePage({
            title: content.title || "Contenu XERA1",
            description: summarizeShareDescription(
                content.description,
                "Découvrez ce contenu sur XERA1",
            ),
            image: pickShareImage(content),
            url: shareUrl,
            targetUrl,
            type: "article",
        });

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
        return res.status(200).send(html);
    } catch (error) {
        console.error("content share page error", error);
        return res.status(500).send("Share preview unavailable");
    }
}

async function handleProfileSharePage(req, res) {
    const userId = String(req.params.id || "").trim();
    if (!userId) return res.status(404).send("Profile not found");

    try {
        const { data: user, error } = await supabase
            .from("users")
            .select("id, name, title, bio, avatar, banner")
            .eq("id", userId)
            .maybeSingle();

        if (error) throw error;
        if (!user) return res.status(404).send("Profile not found");

        const displayName = user.name || "Profil XERA1";
        const shareUrl = buildAbsoluteAppUrl(
            `/share/profile/${encodeURIComponent(user.id)}`,
        );
        const targetUrl = buildAbsoluteAppUrl(
            `/profile?user=${encodeURIComponent(user.id)}`,
        );
        const html = renderOpenGraphSharePage({
            title: `${displayName} sur XERA1`,
            description: summarizeShareDescription(
                user.bio || user.title,
                "Découvrez ce profil sur XERA1",
            ),
            image: pickShareImage(user),
            url: shareUrl,
            targetUrl,
            type: "profile",
        });

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
        return res.status(200).send(html);
    } catch (error) {
        console.error("profile share page error", error);
        return res.status(500).send("Share preview unavailable");
    }
}

function getKPayCallbackConfig(req) {
    if (!KPAY_CALLBACK_ALLOWED) {
        return {
            callbackEnabled: false,
            callbackOrigin: "",
        };
    }

    const requestOrigin = getRequestOrigin(req);
    const callbackOrigin = resolveCallbackOrigin(
        CALLBACK_BASE_URL,
        requestOrigin || PRIMARY_ORIGIN,
    );

    return {
        callbackEnabled: Boolean(callbackOrigin),
        callbackOrigin,
    };
}

function buildProfileReturnPath(userId) {
    if (!userId) return "/profile";
    return `/profile?user=${encodeURIComponent(userId)}`;
}

function sanitizeReturnPath(value, fallbackPath = "/") {
    const fallback = String(fallbackPath || "/").trim() || "/";
    const raw = String(value || "").trim();
    if (!raw) return fallback;

    try {
        const baseUrl = new URL(
            PRIMARY_ORIGIN || APP_BASE_URL || "http://localhost:3000",
        );
        const url = new URL(raw, baseUrl);
        if (url.origin !== baseUrl.origin) {
            return fallback;
        }
        return normalizeReturnPathForBrowser(
            `${url.pathname}${url.search}${url.hash}`,
            fallback,
            baseUrl.toString(),
        );
    } catch (error) {
        return fallback;
    }
}

const REMINDER_HOURS = RETURN_REMINDER_HOURS.split(",")
    .map((value) => parseInt(value.trim(), 10))
    .filter((hour) => Number.isFinite(hour) && hour >= 0 && hour <= 23)
    .sort((a, b) => a - b);
const REMINDER_WINDOW_MIN = Math.max(
    1,
    parseInt(RETURN_REMINDER_WINDOW_MINUTES, 10) || 15,
);
const REMINDER_SWEEP_MS = Math.max(
    30000,
    parseInt(RETURN_REMINDER_SWEEP_MS, 10) || 60000,
);
const REMINDER_EMAIL_ENABLED = parseBooleanEnv(
    RETURN_REMINDER_EMAIL_ENABLED,
    false, // Default to false in local development to avoid noise
);
const REMINDER_EMAIL_PROVIDER = String(RETURN_REMINDER_EMAIL_PROVIDER || "none")
    .trim()
    .toLowerCase();
const REMINDER_EMAIL_FROM = String(RETURN_REMINDER_EMAIL_FROM || "").trim();
const REMINDER_EMAIL_REPLY_TO = String(
    RETURN_REMINDER_EMAIL_REPLY_TO || "",
).trim();
const REMINDER_EMAIL_API_KEY = String(
    RETURN_REMINDER_EMAIL_API_KEY || "",
).trim();
const REMINDER_EMAIL_WEBHOOK_URL = String(
    RETURN_REMINDER_EMAIL_WEBHOOK_URL || "",
).trim();
const REMINDER_EMAIL_WEBHOOK_TOKEN = String(
    RETURN_REMINDER_EMAIL_WEBHOOK_TOKEN || "",
).trim();
const DAY_MS = 24 * 60 * 60 * 1000;
let reminderSweepInFlight = false;
const rawSubscriptionSweepMs = parseInt(process.env.SUBSCRIPTION_SWEEP_MS, 10);
const SUBSCRIPTION_SWEEP_MS = Number.isFinite(rawSubscriptionSweepMs)
    ? Math.max(0, rawSubscriptionSweepMs)
    : 10 * 60 * 1000;
let subscriptionSweepInFlight = false;
let lastSweepNetworkErrorAt = 0;

const EXPIRES_BADGES = new Set(["verified", "verified_gold", "gold", "pro"]);
const PROTECTED_BADGES = new Set([
    "staff",
    "team",
    "community",
    "company",
    "enterprise",
    "ambassador",
]);

async function approvePaidVerificationRequest(userId) {
    if (!userId) return;
    const { error } = await supabase
        .from("verification_requests")
        .update({ status: "approved" })
        .eq("user_id", userId)
        .eq("status", "pending");
    if (error) throw error;
}

/**
 * Calcule les fonctionnalités premium selon le plan
 * @param {string} plan - Le plan (standard, medium, pro)
 * @returns {object} Les fonctionnalités premium activées
 */
function computePremiumFeatures(plan) {
    const normalizedPlan = String(plan || "").toLowerCase();
    const features = {
        advanced_profile_customization: false,
        priority_recommendations: false,
        full_profile_customization: false,
        hd_streaming: false,
        private_live: false,
        advanced_collab_tools: false,
        realtime_analytics: false,
        data_export: false,
        maximum_visibility: false,
    };

    if (normalizedPlan === "medium") {
        features.advanced_profile_customization = true;
        features.priority_recommendations = true;
    } else if (normalizedPlan === "pro" || normalizedPlan === "elite") {
        features.advanced_profile_customization = true;
        features.priority_recommendations = true;
        features.full_profile_customization = true;
        features.hd_streaming = true;
        features.private_live = true;
        features.advanced_collab_tools = true;
        features.realtime_analytics = true;
        features.data_export = true;
        features.maximum_visibility = true;
    } else if (normalizedPlan === "page_verification") {
        features.advanced_profile_customization = true;
        features.priority_recommendations = true;
        features.full_profile_customization = true;
        features.maximum_visibility = true;
    }

    return features;
}

const KPAY_PLANS = {
    standard: 2.99,
    medium: 7.99,
    pro: 14.99,
    elite: 40.0,
    page_verification: 25.0,
};

const USD_TO_CDF_RATE_VALUE = Math.max(
    1,
    Number.parseFloat(USD_TO_CDF_RATE) || 2300,
);
const WITHDRAWAL_MIN_USD = 5;
const SUPPORT_MIN_USD = 1;
const SUPPORT_MAX_USD = 1000;
// XERA retains 25% of every confirmed platform donation; this is calculated server-side.
const SUPPORT_COMMISSION_RATE = 0.25;
// Provider codes must match exactly what KPay accepts in the paymentMethods field.
// Source: KPay dashboard → Applications → Edit → country selector (screenshot verified).
const SUPPORTED_MOBILE_MONEY_PROVIDERS = new Set([
    // Bénin
    "MTN_MOMO_BEN",
    "MOOV_BEN",
    // Cameroun
    "MTN_MOMO_CMR",
    "ORANGE_CMR",
    // Congo-Brazzaville
    "MTN_MOMO_COG",
    "AIRTEL_COG",
    // Côte d'Ivoire
    "MTN_MOMO_CIV",
    "ORANGE_CIV",
    // Gabon
    "AIRTEL_GAB",
    // Kenya
    "MPESA_KEN",
    // Ouganda
    "AIRTEL_OAPI_UGA",
    "MTN_MOMO_UGA",
    // RD Congo
    "VODACOM_MPESA_COD",
    "MTN_MOMO_COD",
    "AIRTEL_COD",
    "ORANGE_COD",
    // Rwanda
    "MTN_MOMO_RWA",
    "AIRTEL_RWA",
    // Sénégal
    "FREE_SEN",
    "ORANGE_SEN",
    // Sierra Leone
    "ORANGE_SLE",
    // Zambie
    "AIRTEL_OAPI_ZMB",
    "MTN_MOMO_ZMB",
    "ZAMTEL_ZMB",
]);

const MOBILE_MONEY_PROVIDER_LABELS = {
    MTN_MOMO_BEN: "MTN MoMo (Bénin)",
    MOOV_BEN: "Moov Money (Bénin)",
    MTN_MOMO_CMR: "MTN MoMo (Cameroun)",
    ORANGE_CMR: "Orange Money (Cameroun)",
    MTN_MOMO_COG: "MTN MoMo (Congo-Brazzaville)",
    AIRTEL_COG: "Airtel Money (Congo-Brazzaville)",
    MTN_MOMO_CIV: "MTN MoMo (Côte d'Ivoire)",
    ORANGE_CIV: "Orange Money (Côte d'Ivoire)",
    AIRTEL_GAB: "Airtel Money (Gabon)",
    MPESA_KEN: "M-Pesa (Kenya)",
    AIRTEL_OAPI_UGA: "Airtel Money (Ouganda)",
    MTN_MOMO_UGA: "MTN MoMo (Ouganda)",
    VODACOM_MPESA_COD: "Vodacom M-Pesa (RD Congo)",
    MTN_MOMO_COD: "MTN MoMo (RD Congo)",
    AIRTEL_COD: "Airtel Money (RD Congo)",
    ORANGE_COD: "Orange Money (RD Congo)",
    MTN_MOMO_RWA: "MTN MoMo (Rwanda)",
    AIRTEL_RWA: "Airtel Money (Rwanda)",
    FREE_SEN: "Free Money (Sénégal)",
    ORANGE_SEN: "Orange Money (Sénégal)",
    ORANGE_SLE: "Orange Money (Sierra Leone)",
    AIRTEL_OAPI_ZMB: "Airtel Money (Zambie)",
    MTN_MOMO_ZMB: "MTN MoMo (Zambie)",
    ZAMTEL_ZMB: "Zamtel (Zambie)",
};

function areKPayPayoutsEnabled() {
    return ["1", "true", "yes", "on"].includes(
        String(KPAY_PAYOUTS_ENABLED).toLowerCase(),
    );
}
function getKPayPayoutCurrency(country) {
    try {
        const values = JSON.parse(KPAY_PAYOUT_CURRENCIES);
        return String(
            values?.[String(country || "").toUpperCase()] || "",
        ).toUpperCase();
    } catch (_) {
        return "";
    }
}
async function kpayPayoutRequest(path, options = {}) {
    const response = await fetch(
        `https://admin.kpay.site/api/v1/payments${path}`,
        {
            ...options,
            headers: {
                "X-API-Key": KPAY_PUBLIC_KEY,
                "X-Secret-Key": KPAY_SECRET_KEY,
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
        },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new Error(
            data?.message ||
                data?.error ||
                `KPay payout error (${response.status})`,
        );
    return data;
}
async function initiateAutomaticKPayPayout({
    withdrawalId,
    amountUsd,
    phoneNumber,
    description,
}) {
    if (!areKPayPayoutsEnabled())
        throw new Error(
            "Les retraits KPay ne sont pas encore activés dans la configuration serveur.",
        );
    const prediction = await kpayPayoutRequest("/predict-provider", {
        method: "POST",
        body: JSON.stringify({ phoneNumber }),
    });
    if (!prediction?.provider || !prediction?.country)
        throw new Error("Opérateur Mobile Money non reconnu par KPay.");
    const payoutCurrency = getKPayPayoutCurrency(prediction.country);
    if (!payoutCurrency)
        throw new Error("Devise de retrait non configurée pour ce pays KPay.");
    const rateData = await kpayPayoutRequest(
        "/exchange-rate?from=USD&to=" + encodeURIComponent(payoutCurrency),
    );
    const rate = Number(rateData?.rate);
    if (!Number.isFinite(rate) || rate <= 0)
        throw new Error("Conversion USD indisponible pour cet opérateur KPay.");
    const amount = Math.max(1, Math.round(Number(amountUsd) * rate));
    const payout = await kpayPayoutRequest("/withdraw", {
        method: "POST",
        body: JSON.stringify({
            amount,
            provider: prediction.provider,
            phoneNumber: prediction.phoneNumber || phoneNumber,
            externalId: `XERA-WD-${withdrawalId}`,
            description,
        }),
    });
    return { payout, prediction, rate, payoutCurrency };
}

function isValidPlanId(value) {
    return ["standard", "medium", "pro", "elite", "page_verification"].includes(
        String(value || "").toLowerCase(),
    );
}

function computeKPayAmount(plan, billingCycle, currency) {
    const monthlyUsd = KPAY_PLANS[plan];
    if (!monthlyUsd) return null;
    const amountUsd =
        billingCycle === "annual" ? monthlyUsd * 12 * 0.8 : monthlyUsd;
    if (String(currency).toUpperCase() === "CDF") {
        return Math.round(amountUsd * USD_TO_CDF_RATE_VALUE);
    }
    // KPay: on affiche les prix décimaux côté UI, mais on facture un entier.
    return Math.ceil(amountUsd);
}

function normalizeDiscountCode(value) {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
}

async function findActiveDiscountCode(rawCode) {
    const code = normalizeDiscountCode(rawCode);
    if (!code) return null;
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from("subscription_discount_codes")
        .select(
            "id, code, plan, discount_percent, valid_from, valid_until, benefit_duration_days, max_uses, uses_count, active",
        )
        .eq("code", code)
        .eq("active", true)
        .lte("valid_from", nowIso)
        .or(`valid_until.is.null,valid_until.gte.${nowIso}`)
        .maybeSingle();
    if (!data) return null;
    if (
        data.max_uses !== null &&
        data.max_uses !== undefined &&
        Number(data.uses_count || 0) >= Number(data.max_uses)
    )
        return null;
    return data;
}

async function findActivePartnerDiscountCode(rawCode) {
    const code = normalizeDiscountCode(rawCode);
    if (!code) return null;
    const nowIso = new Date().toISOString();

    const { data: promoData, error: promoError } = await supabase
        .from("promo_codes")
        .select(
            "id, code, discount_percentage, applicable_plan, partner_id, valid_until, is_active, partners!inner(id, status, partner_access_code, start_date, end_date)",
        )
        .eq("code", code)
        .eq("is_active", true)
        .eq("partners.status", "active")
        .or(`valid_until.is.null,valid_until.gte.${nowIso}`)
        .maybeSingle();

    if (promoError && promoError.code !== "42P01") throw promoError;
    if (promoData) {
        const partner = promoData.partners;
        const validation = validatePartnerAccess({
            partner,
            now: new Date(nowIso),
            accessCode: partner?.partner_access_code,
        });
        if (!validation.valid) return null;
        return {
            id: promoData.id,
            code: promoData.code,
            partner_id: promoData.partner_id,
            discount_percent: Number(promoData.discount_percentage || 20),
            status: "active",
            expires_at: promoData.valid_until,
            partners: partner,
            applicable_plan: promoData.applicable_plan,
        };
    }

    const { data, error } = await supabase
        .from("partner_discount_codes")
        .select(
            "id, code, partner_id, discount_percent, status, starts_at, expires_at, partners!inner(status,start_date,end_date,partner_access_code)",
        )
        .eq("code", code)
        .eq("status", "active")
        .eq("partners.status", "active")
        .lte("starts_at", nowIso)
        .or(`expires_at.is.null,expires_at.gte.${nowIso}`)
        .maybeSingle();
    if (error && error.code !== "42P01") throw error;
    if (!data) return null;
    const validation = validatePartnerAccess({
        partner: data.partners,
        accessCode: data.partners.partner_access_code,
        now: new Date(nowIso),
    });
    return validation.valid ? data : null;
}

async function persistPartnerAssignment({ userId, partnerId }) {
    if (!userId || !partnerId) return null;
    const nowIso = new Date().toISOString();
    await Promise.all([
        supabase
            .from("users")
            .update({ referred_by_partner_id: partnerId, updated_at: nowIso })
            .eq("id", userId),
        supabase
            .from("user_subscriptions")
            .update({ referred_by_partner_id: partnerId, updated_at: nowIso })
            .eq("user_id", userId)
            .eq("status", "active"),
    ]);
    return { userId, partnerId };
}

async function getAssignedPartnerForUser(userId) {
    if (!userId) return null;
    const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id, referred_by_partner_id")
        .eq("id", userId)
        .maybeSingle();
    if (profileError && profileError.code !== "42P01") throw profileError;
    if (profile?.referred_by_partner_id) return profile.referred_by_partner_id;

    const { data: activeSub, error: subError } = await supabase
        .from("user_subscriptions")
        .select("referred_by_partner_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (subError && subError.code !== "42P01") throw subError;
    return activeSub?.referred_by_partner_id || null;
}

async function createPartnerAffiliationFromSubscription({
    userId,
    subscriptionId,
    periodEnd,
    metadata,
}) {
    const partnerCodeId = metadata?.partner_discount_code_id;
    const partnerId = metadata?.partner_id;
    if (!partnerCodeId || !partnerId || !subscriptionId || !periodEnd)
        return null;
    const { data, error } = await supabase
        .from("partner_affiliations")
        .upsert(
            {
                user_id: userId,
                partner_id: partnerId,
                partner_discount_code_id: partnerCodeId,
                subscription_id: subscriptionId,
                status: "active",
                eligible_from: new Date().toISOString(),
                eligible_until: periodEnd,
            },
            { onConflict: "user_id,subscription_id" },
        )
        .select("id")
        .maybeSingle();
    if (error && error.code !== "42P01") throw error;
    if (partnerId) {
        await persistPartnerAssignment({ userId, partnerId });
    }
    return data || null;
}

async function createPartnerCommissionForSupport({
    transactionId,
    beneficiaryUserId,
    gross,
    netCreator,
}) {
    const nowIso = new Date().toISOString();
    const partnerId = await getAssignedPartnerForUser(beneficiaryUserId);
    if (!partnerId) {
        return null;
    }

    const { data: partner, error: partnerError } = await supabase
        .from("partners")
        .select(
            "id, status, start_date, end_date, partner_access_code, access_code, commission_rate",
        )
        .eq("id", partnerId)
        .maybeSingle();
    if (partnerError && partnerError.code !== "42P01") throw partnerError;
    if (!partner) return null;

    const validation = validatePartnerAccess({
        partner,
        now: new Date(nowIso),
        accessCode: partner.partner_access_code || partner.access_code,
    });
    if (!validation.valid) return null;

    const rate = Number(partner.commission_rate || 0.05);
    const commission = calculatePartnerCommission(gross, rate);

    const partnerCommissionPayload = {
        partner_id: partnerId,
        donation_id: transactionId,
        support_transaction_id: transactionId,
        beneficiary_user_id: beneficiaryUserId,
        source_user_id: beneficiaryUserId,
        donation_amount: gross,
        amount_gross: gross,
        commission_amount: commission,
        beneficiary_net_amount: Math.max(
            0,
            Math.round((Number(netCreator) - commission) * 100) / 100,
        ),
        currency: "USD",
        status: "available",
        available_at: nowIso,
        created_at: nowIso,
    };

    const { data, error } = await supabase
        .from("commissions")
        .insert({
            partner_id: partnerId,
            source_user_id: beneficiaryUserId,
            donation_id: transactionId,
            amount_earned: commission,
            created_at: nowIso,
        })
        .select("id")
        .maybeSingle();
    if (!error || error.code === "23505") {
        const { error: dashboardCommissionError } = await supabase
            .from("partner_commissions")
            .upsert(partnerCommissionPayload, {
                onConflict: "partner_id,donation_id",
            });
        if (
            dashboardCommissionError &&
            !["42P01", "PGRST205"].includes(dashboardCommissionError.code)
        ) {
            throw dashboardCommissionError;
        }
        return data ? { ...data, commission } : { commission };
    }

    if (error && error.code !== "23505") {
        const legacy = await supabase
            .from("partner_commissions")
            .upsert(partnerCommissionPayload, {
                onConflict: "partner_id,donation_id",
            })
            .select("id")
            .maybeSingle();
        if (legacy.error && legacy.error.code !== "23505") throw legacy.error;
        return legacy.data ? { ...legacy.data, commission } : null;
    }

    return data ? { ...data, commission } : null;
}

async function redeemDiscountCode(code, userId) {
    const { data, error } = await supabase.rpc(
        "redeem_subscription_discount_code",
        {
            p_code: code,
            p_user_id: userId,
        },
    );
    if (error) {
        if (error.message?.includes("INVALID_DISCOUNT_CODE")) return null;
        if (error.message?.includes("DISCOUNT_CODE_ALREADY_USED")) {
            const duplicate = new Error("Ce code a déjà été utilisé.");
            duplicate.code = "DISCOUNT_CODE_ALREADY_USED";
            throw duplicate;
        }
        throw error;
    }
    return Array.isArray(data) ? data[0] || null : data || null;
}

function applyDiscount(amountUsd, discountPercent) {
    const percent = Math.min(100, Math.max(0, Number(discountPercent) || 0));
    return Math.max(0, Math.round(amountUsd * (1 - percent / 100) * 100) / 100);
}

function computeSupportCheckoutAmount(amountUsd, currency) {
    const normalizedAmount = roundMoney(amountUsd);
    if (
        !Number.isFinite(normalizedAmount) ||
        normalizedAmount < SUPPORT_MIN_USD ||
        normalizedAmount > SUPPORT_MAX_USD
    ) {
        return null;
    }

    if (String(currency).toUpperCase() === "CDF") {
        return Math.max(
            1,
            Math.round(normalizedAmount * USD_TO_CDF_RATE_VALUE),
        );
    }

    return Math.ceil(normalizedAmount);
}

function inferKPayKeyMode(value) {
    const key = String(value || "").toUpperCase();
    if (key.startsWith("MP-LIVE")) return "live";
    if (key.startsWith("MP-SB")) return "sandbox";
    return "unknown";
}

function maskKey(value, visible = 10) {
    const key = String(value || "");
    if (!key) return "<empty>";
    if (key.length <= visible) return `${"*".repeat(key.length)}`;
    return `${key.slice(0, visible)}***`;
}

function addMonths(date, months) {
    const result = new Date(date);
    const desired = result.getMonth() + months;
    result.setMonth(desired);
    return result;
}

function createSignedState(payload) {
    if (!KPAY_CALLBACK_SECRET) return null;
    const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto
        .createHmac("sha256", KPAY_CALLBACK_SECRET)
        .update(data)
        .digest("base64url");
    return `${data}.${signature}`;
}

function verifySignedState(state) {
    if (!state || !KPAY_CALLBACK_SECRET) return null;
    const [data, signature] = String(state).split(".");
    if (!data || !signature) return null;
    const expected = crypto
        .createHmac("sha256", KPAY_CALLBACK_SECRET)
        .update(data)
        .digest("base64url");
    const expectedHex = crypto
        .createHmac("sha256", KPAY_CALLBACK_SECRET)
        .update(data)
        .digest("hex");
    const validBase64Url =
        signature.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    const validHex =
        /^[a-f0-9]+$/i.test(signature) &&
        signature.length === expectedHex.length &&
        crypto.timingSafeEqual(
            Buffer.from(signature, "hex"),
            Buffer.from(expectedHex, "hex"),
        );
    if (!validBase64Url && !validHex) return null;
    try {
        const payload = JSON.parse(
            Buffer.from(data, "base64url").toString("utf8"),
        );
        const expiresAt = Number(payload?.e ?? payload?.expires_at);
        if (Number.isFinite(expiresAt) && Date.now() > expiresAt) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

async function resolveUserId(accessToken, fallbackId) {
    const requestUser = await resolveRequestUser(accessToken, fallbackId);
    return requestUser.id;
}

async function resolveRequestUser(accessToken, fallbackId) {
    if (!accessToken) {
        return {
            id: fallbackId || null,
            email: null,
            username: null,
            name: null,
            avatarUrl: null,
            accountType: null,
            accountSubtype: null,
            badge: null,
        };
    }
    try {
        const { data, error } = await supabase.auth.getUser(accessToken);
        if (!error && data?.user?.id) {
            const metadata =
                data.user.user_metadata &&
                typeof data.user.user_metadata === "object"
                    ? data.user.user_metadata
                    : {};
            return {
                id: data.user.id,
                email: data.user.email || null,
                username: metadata.username || null,
                name: metadata.name || metadata.full_name || null,
                avatarUrl: metadata.avatar_url || metadata.avatar || null,
                accountType: metadata.account_type || null,
                accountSubtype: metadata.account_subtype || null,
                badge: metadata.badge || null,
            };
        }
    } catch (e) {
        // ignore
    }
    return {
        id: fallbackId || null,
        email: null,
        username: null,
        name: null,
        avatarUrl: null,
        accountType: null,
        accountSubtype: null,
        badge: null,
    };
}

async function ensurePublicUserRecord(userId, options = {}) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) return;

    const email = String(options.email || "").trim() || null;
    const username =
        String(options.username || options.name || "").trim() ||
        (email ? email.split("@")[0] : "") ||
        "xera_user";
    const displayName = String(options.name || "").trim() || username;
    const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeUserId}`;
    const defaultBanner =
        "https://placehold.co/1200x300/1a1a2e/00ff88?text=Ma+Trajectoire";
    const nowIso = new Date().toISOString();
    const payloadCandidates = [
        {
            id: safeUserId,
            email,
            username,
            name: displayName,
            title: "Nouveau membre",
            bio: "",
            avatar: String(options.avatarUrl || "").trim() || defaultAvatar,
            banner: defaultBanner,
            account_type: options.accountType || null,
            account_subtype: options.accountSubtype || null,
            badge: options.badge || null,
            social_links: {},
            updated_at: nowIso,
        },
        {
            id: safeUserId,
            username,
            name: displayName,
            title: "Nouveau membre",
            bio: "",
            avatar: String(options.avatarUrl || "").trim() || defaultAvatar,
            banner: defaultBanner,
            badge: options.badge || null,
            updated_at: nowIso,
        },
        {
            id: safeUserId,
            username,
            name: displayName,
            updated_at: nowIso,
        },
        {
            id: safeUserId,
            name: displayName,
            updated_at: nowIso,
        },
        {
            id: safeUserId,
        },
    ].map((payload) =>
        Object.fromEntries(
            Object.entries(payload).filter(([, value]) => value !== undefined),
        ),
    );

    let lastError = null;
    for (const payload of payloadCandidates) {
        const { error } = await supabase.from("users").upsert(payload, {
            onConflict: "id",
        });

        if (!error) {
            return;
        }

        lastError = error;
        if (
            !isMissingColumnError(error) &&
            !isMissingRelationError(error) &&
            !isNotNullViolation(error)
        ) {
            break;
        }
    }

    if (lastError) {
        throw lastError;
    }
}

async function createPendingSubscriptionPayment({
    userId,
    plan,
    billingCycle,
    currency,
    amount,
    originalAmount,
    discountCode,
    discountPercent,
    partnerId,
    partnerDiscountCodeId,
    method,
    provider,
    walletId,
    returnPath,
    callbackEnabled = KPAY_CALLBACK_ENABLED,
    callbackOrigin = CALLBACK_ORIGIN,
}) {
    const checkoutRefId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const metadata = {
        payment_provider: "kpay",
        checkout_ref_id: checkoutRefId,
        plan: String(plan || "").toLowerCase(),
        billing_cycle: String(billingCycle || "monthly").toLowerCase(),
        method: String(method || "card").toLowerCase(),
        provider: provider || null,
        wallet_id: walletId || null,
        callback_return_path: returnPath || null,
        callback_enabled: callbackEnabled,
        callback_origin: callbackEnabled ? callbackOrigin || null : null,
        checkout_started_at: nowIso,
        original_amount: originalAmount ?? amount,
        discount_code: discountCode || null,
        discount_percent: discountPercent || 0,
        partner_id: partnerId || null,
        partner_discount_code_id: partnerDiscountCodeId || null,
    };

    const { data, error } = await supabase
        .from("transactions")
        .insert({
            from_user_id: userId,
            to_user_id: userId,
            type: "subscription",
            amount_gross: amount,
            amount_net_creator: 0,
            amount_commission_xera: 0,
            currency,
            status: "pending",
            description: `Paiement abonnement ${plan} (${billingCycle}) en attente`,
            metadata,
        })
        .select("id, metadata, created_at")
        .single();

    if (error) {
        throw error;
    }

    return {
        id: data.id,
        checkoutRefId,
        metadata: data.metadata || metadata,
        createdAt: data.created_at,
    };
}

async function createPendingSupportPayment({
    fromUserId,
    toUserId,
    amountUsd,
    checkoutAmount,
    checkoutCurrency,
    method,
    provider,
    walletId,
    description,
    senderName,
    recipientName,
    supportMessage = "",
    returnPath,
    callbackEnabled = KPAY_CALLBACK_ENABLED,
    callbackOrigin = CALLBACK_ORIGIN,
}) {
    const checkoutRefId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const breakdown = computeSupportRevenueBreakdown(amountUsd);
    const sanitizedSupportMessage = sanitizeSupportMessage(supportMessage, 200);
    const metadata = {
        payment_provider: "kpay",
        checkout_ref_id: checkoutRefId,
        support_kind: "direct",
        sender_name: senderName || "Utilisateur",
        recipient_name: recipientName || "Créateur",
        method: String(method || "card").toLowerCase(),
        provider: provider || null,
        wallet_id: walletId || null,
        support_amount_usd: breakdown.gross,
        support_message: sanitizedSupportMessage || null,
        checkout_amount: checkoutAmount,
        checkout_currency: String(checkoutCurrency || "USD").toUpperCase(),
        callback_return_path: returnPath || null,
        commission_rate: SUPPORT_COMMISSION_RATE,
        amount_net_creator: breakdown.netCreator,
        amount_commission_xera: breakdown.commission,
        callback_enabled: callbackEnabled,
        callback_origin: callbackEnabled ? callbackOrigin || null : null,
        checkout_started_at: nowIso,
    };

    const { data, error } = await supabase
        .from("transactions")
        .insert({
            from_user_id: fromUserId,
            to_user_id: toUserId,
            type: "support",
            amount_gross: breakdown.gross,
            amount_net_creator: breakdown.netCreator,
            amount_commission_xera: breakdown.commission,
            currency: "USD",
            status: "pending",
            description:
                description ||
                `Soutien pour ${recipientName || "un créateur"} en attente`,
            metadata,
        })
        .select("id, metadata, created_at")
        .single();

    if (error) {
        throw error;
    }

    return {
        id: data.id,
        checkoutRefId,
        metadata: data.metadata || metadata,
        createdAt: data.created_at,
    };
}

async function initiateKPayPayment(
    amount,
    externalId,
    description,
    successUrl,
    cancelUrl = successUrl,
    currency,
    phoneNumber = null,
    provider = null,
) {
    const requestBody = {
        amount,
        externalId,
        description,
        successUrl,
        cancelUrl,
        returnUrl: successUrl,
    };
    if (phoneNumber) requestBody.phoneNumber = phoneNumber;
    if (provider) requestBody.provider = provider;

    const response = await fetch(
        "https://admin.kpay.site/api/v1/payments/init",
        {
            method: "POST",
            headers: {
                "X-API-Key": KPAY_PUBLIC_KEY,
                "X-Secret-Key": KPAY_SECRET_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        },
    );

    if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        let jsonError = null;
        try {
            jsonError = JSON.parse(errorText);
        } catch (_) {}
        const exactMsg =
            jsonError?.message ||
            jsonError?.error ||
            errorText ||
            response.statusText;
        const err = new Error(`KPay: ${exactMsg}`);
        err.kpayStatus = response.status;
        err.kpayDetails = jsonError;
        throw err;
    }

    return await response.json();
}

async function storeKPayPaymentReference(pendingPayment, kpayPayment) {
    if (!pendingPayment?.id || !kpayPayment?.id) {
        throw new Error("Référence KPay manquante après l'initialisation.");
    }
    const metadata = {
        ...(pendingPayment.metadata || {}),
        kpay_payment_id: String(kpayPayment.id),
        kpay_reference: kpayPayment.reference || null,
        kpay_initialized_at: new Date().toISOString(),
    };
    const { error } = await supabase
        .from("transactions")
        .update({ metadata })
        .eq("id", pendingPayment.id);
    if (error) throw error;
    pendingPayment.metadata = metadata;
}

function safeEqualHex(left, right) {
    const a = String(left || "").trim();
    const b = String(right || "").trim();
    if (!a || !b || a.length !== b.length) return false;
    return crypto.timingSafeEqual(
        Buffer.from(a, "utf8"),
        Buffer.from(b, "utf8"),
    );
}

function verifyKPayGatewayReturn(params) {
    const status = String(params?.status || "")
        .trim()
        .toUpperCase();
    const reference = String(params?.reference || "").trim();
    const externalId = String(
        params?.externalId || params?.external_id || "",
    ).trim();
    const timestamp = Number(params?.ts);
    const signature = String(params?.sig || "").trim();
    if (!status || !reference || !externalId || !Number.isFinite(timestamp))
        return false;
    if (Math.abs(Date.now() - timestamp) > 10 * 60 * 1000) return false;
    const expected = crypto
        .createHmac("sha256", KPAY_SECRET_KEY)
        .update(`${status}|${reference}|${externalId}|${timestamp}`)
        .digest("hex");
    return safeEqualHex(signature, expected);
}

async function fetchKPayPaymentStatus(paymentId) {
    const response = await fetch(
        `https://admin.kpay.site/api/v1/payments/${encodeURIComponent(paymentId)}`,
        {
            headers: {
                "X-API-Key": KPAY_PUBLIC_KEY,
                "X-Secret-Key": KPAY_SECRET_KEY,
            },
        },
    );
    if (!response.ok) {
        throw new Error(`Vérification KPay impossible: ${response.statusText}`);
    }
    return response.json();
}

async function authenticateRequest(req) {
    const auth = String(req.headers.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) {
        return { error: { status: 401, message: "Token manquant." } };
    }

    const { data: authData, error: authError } =
        await supabase.auth.getUser(token);
    if (authError || !authData?.user?.id) {
        return {
            error: { status: 401, message: "Utilisateur non authentifié." },
        };
    }
    return { user: authData.user, token };
}

async function authenticateSuperAdmin(req) {
    const authResult = await authenticateRequest(req);
    if (authResult.error) {
        return authResult;
    }
    if (authResult.user.id !== SUPER_ADMIN_ID) {
        return { error: { status: 403, message: "Accès refusé." } };
    }
    return authResult;
}

function getCachedAppQueryValue(cacheKey) {
    if (!cacheKey) return null;
    const entry = APP_QUERY_CACHE.get(cacheKey);
    if (!entry) return null;
    if (!Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now()) {
        APP_QUERY_CACHE.delete(cacheKey);
        return null;
    }
    return entry.value;
}

function setCachedAppQueryValue(cacheKey, value, ttlMs) {
    if (!cacheKey) return value;
    const safeTtl = Math.max(1000, Number(ttlMs || 0) || 1000);
    APP_QUERY_CACHE.set(cacheKey, {
        value,
        expiresAt: Date.now() + safeTtl,
    });
    return value;
}

function deleteCachedAppQueryValue(cacheKey) {
    if (!cacheKey) return false;
    return APP_QUERY_CACHE.delete(cacheKey);
}

function normalizeUserProfileRecord(row) {
    if (!row || typeof row !== "object") return row;
    const normalizedSocialLinks =
        row.socialLinks && typeof row.socialLinks === "object"
            ? row.socialLinks
            : row.social_links && typeof row.social_links === "object"
              ? row.social_links
              : {};

    return {
        ...row,
        socialLinks: normalizedSocialLinks,
        accountSubtype: row.accountSubtype || row.account_subtype || null,
        planEndsAt: row.planEndsAt || row.plan_ends_at || null,
    };
}

function normalizeSubscriptionRecord(row) {
    if (!row || typeof row !== "object") return null;
    return {
        ...row,
        currentPeriodStart:
            row.currentPeriodStart || row.current_period_start || null,
        currentPeriodEnd:
            row.currentPeriodEnd || row.current_period_end || null,
        cancelAtPeriodEnd:
            row.cancelAtPeriodEnd || row.cancel_at_period_end || false,
        canceledAt: row.canceledAt || row.canceled_at || null,
    };
}

function sanitizeProfileField(value, maxLength = 280) {
    return String(value || "")
        .trim()
        .slice(0, maxLength);
}

function sanitizeProfileUrl(value, maxLength = 2048) {
    const normalized = sanitizeProfileField(value, maxLength);
    if (!normalized) return "";
    if (
        normalized.startsWith("http://") ||
        normalized.startsWith("https://") ||
        normalized.startsWith("data:")
    ) {
        return normalized;
    }
    if (
        normalized.startsWith("/") ||
        normalized.startsWith("./") ||
        normalized.startsWith("../")
    ) {
        return normalized;
    }
    return normalized;
}

function sanitizeProfileSocialLinks(rawValue) {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        return {};
    }

    const entries = Object.entries(rawValue)
        .filter(([key]) => typeof key === "string" && key.trim())
        .slice(0, 24);

    return entries.reduce((accumulator, [key, value]) => {
        const safeKey = String(key).trim().slice(0, 64);
        const safeValue = sanitizeProfileField(value, 320);
        if (safeKey) {
            accumulator[safeKey] = safeValue;
        }
        return accumulator;
    }, {});
}

function sanitizeProfilePayload(rawPayload, authUser, existingProfile) {
    const source =
        rawPayload && typeof rawPayload === "object" ? rawPayload : {};
    const currentProfile =
        existingProfile && typeof existingProfile === "object"
            ? existingProfile
            : {};
    const authMetadata =
        authUser?.user_metadata && typeof authUser.user_metadata === "object"
            ? authUser.user_metadata
            : {};

    const existingBadge = sanitizeProfileField(
        currentProfile.badge || authMetadata.badge || "",
        80,
    );
    const requestedAccountType = sanitizeProfileField(
        source.account_type || authMetadata.account_type || "",
        80,
    );
    const requestedAccountSubtype = sanitizeProfileField(
        source.account_subtype || authMetadata.account_subtype || "",
        80,
    );

    return {
        id: authUser?.id || currentProfile.id || null,
        name: sanitizeProfileField(
            source.name ||
                currentProfile.name ||
                authMetadata.username ||
                authUser?.email?.split("@")[0] ||
                "Nouveau membre",
            120,
        ),
        title: sanitizeProfileField(
            source.title || currentProfile.title || "",
            160,
        ),
        bio: sanitizeProfileField(source.bio || currentProfile.bio || "", 1600),
        avatar: sanitizeProfileUrl(
            source.avatar || currentProfile.avatar || "",
            4096,
        ),
        banner: sanitizeProfileUrl(
            source.banner || currentProfile.banner || "",
            4096,
        ),
        account_type: requestedAccountType || null,
        account_subtype: requestedAccountSubtype || null,
        badge: existingBadge || null,
        social_links: sanitizeProfileSocialLinks(
            source.socialLinks ||
                source.social_links ||
                currentProfile.social_links ||
                currentProfile.socialLinks ||
                {},
        ),
        updated_at: new Date().toISOString(),
    };
}

function getAppProfileCacheKey(userId) {
    return `app:profile:${String(userId || "").trim()}`;
}

function getAppDiscoverUsersCacheKey() {
    return "app:discover:users";
}

function getAppSubscriptionStateCacheKey(userId) {
    return `app:subscription-state:${String(userId || "").trim()}`;
}

function invalidateUserAppCaches(userId) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) return;
    deleteCachedAppQueryValue(getAppProfileCacheKey(safeUserId));
    deleteCachedAppQueryValue(getAppSubscriptionStateCacheKey(safeUserId));
    deleteCachedAppQueryValue(getAppDiscoverUsersCacheKey());
}

async function fetchProfileRecordById(userId, options = {}) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) {
        return {
            success: false,
            status: 400,
            code: "INVALID_USER_ID",
            error: "Identifiant utilisateur manquant.",
        };
    }

    const cacheKey = getAppProfileCacheKey(safeUserId);
    if (options.useCache !== false) {
        const cached = getCachedAppQueryValue(cacheKey);
        if (cached) {
            return {
                success: true,
                data: cached,
                cached: true,
            };
        }
    }

    const { data, error } = await supabase
        .from("users")
        .select(
            "id,name,avatar,banner,bio,title,social_links,email,followers_count,updated_at,plan,plan_status,plan_ends_at,badge,is_monetized,account_type,account_subtype",
        )
        .eq("id", safeUserId)
        .maybeSingle();

    if (error) {
        return {
            success: false,
            status: 500,
            code: String(error.code || "UNKNOWN"),
            error: error.message || "Impossible de lire le profil.",
        };
    }

    if (!data) {
        return {
            success: false,
            status: 404,
            code: "PGRST116",
            error: "Profile not found.",
        };
    }

    const normalizedProfile = normalizeUserProfileRecord(data);
    setCachedAppQueryValue(
        cacheKey,
        normalizedProfile,
        APP_PROFILE_CACHE_TTL_MS,
    );

    return { success: true, data: normalizedProfile };
}

/**
 * NOUVELLE FONCTION: Utilisateurs recommandés avec algorithme sophistiqué
 * Remplace la simple découverte chronologique
 */
async function fetchRecommendedUsers(options = {}) {
    const { requestingUserId = null } = options;
    const cacheKey = requestingUserId
        ? `app:recommend:users:v2:${requestingUserId}`
        : `app:recommend:users:v2:anonymous`;

    if (options.useCache !== false) {
        const cached = getCachedAppQueryValue(cacheKey);
        if (cached) {
            return {
                success: true,
                data: cached,
                cached: true,
            };
        }
    }

    try {
        // 1. Récupère les besoins de l'entreprise si l'utilisateur est un pro
        let enterpriseNeeds = [];
        if (requestingUserId) {
            const { data: proPages } = await supabase
                .from("professional_pages")
                .select("hiring_needs")
                .eq("owner_id", requestingUserId);

            if (proPages && proPages.length > 0) {
                // Combine tous les besoins de toutes ses pages
                enterpriseNeeds = proPages.flatMap((p) => p.hiring_needs || []);
            }
        }

        // 2. Récupère les données utilisateur enrichies
        const { data: users, error } = await supabase
            .from("users")
            .select(
                `
                id,
                name,
                avatar,
                followers_count,
                title,
                bio,
                plan,
                badge,
                is_monetized,
                account_type,
                account_subtype,
                updated_at,
                created_at,
                priority_recommendations,
                momentum_score,
                active_days,
                consistency_ratio,
                hashtags
            `,
            )
            .eq("deleted_at", null)
            .limit(200);

        if (error) {
            console.error("fetchRecommendedUsers error:", error);
            return {
                success: false,
                status: 500,
                code: String(error.code || "UNKNOWN"),
                error:
                    error.message ||
                    "Impossible de charger les recommandations.",
            };
        }

        if (!Array.isArray(users) || users.length === 0) {
            return {
                success: true,
                data: [],
            };
        }

        // 3. Récupère les certifications pour ces utilisateurs
        const userIds = users.map((u) => u.id);
        const { data: certs } = await supabase
            .from("professional_certifications")
            .select("user_id")
            .in("user_id", userIds)
            .eq("status", "active");

        const certifiedUserIds = new Set(certs?.map((c) => c.user_id) || []);

        // 4. Récupère les stats d'engagement pour scoring
        const engagementStats = await fetchUserEngagementStats(
            supabase,
            userIds,
        );

        // 5. Normalise et marque les certifiés
        const normalizedUsers = users.map((user) => {
            const normalized = normalizeUserProfileRecord(user);
            return {
                ...normalized,
                is_certified: certifiedUserIds.has(user.id),
            };
        });

        // 6. Applique l'algorithme de ranking
        const recommendedUsers = rankUsersIntelligently(
            normalizedUsers,
            engagementStats,
            {
                limit: 100,
                randomizationFactor: 0.05,
                boostPriority: true,
                boostMonetized: true,
                personalizationFactors: {},
                enterpriseNeeds: enterpriseNeeds, // Transmet les besoins au moteur
            },
        );

        // Cache le résultat
        setCachedAppQueryValue(
            cacheKey,
            recommendedUsers,
            APP_DISCOVER_CACHE_TTL_MS,
        );

        return {
            success: true,
            data: recommendedUsers,
        };
    } catch (err) {
        console.error("fetchRecommendedUsers exception:", err);
        return {
            success: false,
            status: 500,
            code: "INTERNAL_ERROR",
            error: "Erreur interne lors du calcul des recommandations.",
        };
    }
}

async function fetchDiscoverUsers(options = {}) {
    const cacheKey = getAppDiscoverUsersCacheKey();
    if (options.useCache !== false) {
        const cached = getCachedAppQueryValue(cacheKey);
        if (cached) {
            return {
                success: true,
                data: cached,
                cached: true,
            };
        }
    }

    const { data, error } = await supabase
        .from("users")
        .select("id,name,avatar,followers_count,title,bio,plan,updated_at")
        .order("created_at", { ascending: false })
        .limit(100); // Limit discover results to reduce egress

    if (error) {
        return {
            success: false,
            status: 500,
            code: String(error.code || "UNKNOWN"),
            error: error.message || "Impossible de charger Discover.",
        };
    }

    const normalizedUsers = Array.isArray(data)
        ? data.map((row) => normalizeUserProfileRecord(row))
        : [];

    setCachedAppQueryValue(
        cacheKey,
        normalizedUsers,
        APP_DISCOVER_CACHE_TTL_MS,
    );

    return { success: true, data: normalizedUsers };
}

async function fetchCurrentSubscriptionState(userId, options = {}) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) {
        return {
            success: false,
            status: 400,
            code: "INVALID_USER_ID",
            error: "Identifiant utilisateur manquant.",
        };
    }

    const cacheKey = getAppSubscriptionStateCacheKey(safeUserId);
    if (options.useCache !== false) {
        const cached = getCachedAppQueryValue(cacheKey);
        if (cached) {
            return {
                success: true,
                data: cached,
                cached: true,
            };
        }
    }

    const [profileResult, subscriptionResult] = await Promise.all([
        fetchProfileRecordById(safeUserId, options),
        supabase
            .from("subscriptions")
            .select("*")
            .eq("user_id", safeUserId)
            .order("created_at", { ascending: false })
            .limit(1),
    ]);

    if (!profileResult.success) {
        return profileResult;
    }

    const { data: subscriptions, error: subscriptionError } =
        subscriptionResult;

    if (subscriptionError) {
        return {
            success: false,
            status: 500,
            code: String(subscriptionError.code || "UNKNOWN"),
            error:
                subscriptionError.message ||
                "Impossible de charger l'abonnement actuel.",
        };
    }

    const normalizedState = {
        user: profileResult.data,
        subscription: normalizeSubscriptionRecord(
            Array.isArray(subscriptions) ? subscriptions[0] || null : null,
        ),
    };

    setCachedAppQueryValue(cacheKey, normalizedState, APP_PROFILE_CACHE_TTL_MS);

    return {
        success: true,
        data: normalizedState,
    };
}

function extractSubscriptionPaymentDetails(row) {
    const metadata =
        row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
    return {
        id: row?.id || null,
        userId: row?.to_user_id || row?.from_user_id || null,
        amount:
            Number.isFinite(Number(row?.amount_gross)) &&
            Number(row.amount_gross) > 0
                ? Number(row.amount_gross)
                : Number(metadata.amount || 0),
        currency: String(
            row?.currency || metadata.currency || "USD",
        ).toUpperCase(),
        status: String(row?.status || "").toLowerCase(),
        plan: String(metadata.plan || "").toLowerCase(),
        billingCycle: String(metadata.billing_cycle || "monthly").toLowerCase(),
        method: String(metadata.method || "card").toLowerCase(),
        provider: metadata.provider || null,
        walletId: metadata.wallet_id || null,
        checkoutRefId: metadata.checkout_ref_id || null,
        transactionRefId: metadata.transaction_ref_id || null,
        operatorRefId: metadata.operator_ref_id || null,
        description: row?.description || "",
        createdAt: row?.created_at || null,
        updatedAt: row?.updated_at || null,
        metadata,
    };
}

function roundMoney(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return 0;
    return Math.round(amount * 100) / 100;
}

function computeSupportRevenueBreakdown(amountUsd) {
    const gross = roundMoney(amountUsd);
    const commission = roundMoney(gross * SUPPORT_COMMISSION_RATE);
    const netCreator = roundMoney(Math.max(0, gross - commission));

    return {
        gross,
        commission,
        netCreator,
    };
}

function resolveTransactionNetAmount(row) {
    const explicitNet = Number(row?.amount_net_creator);
    if (Number.isFinite(explicitNet) && explicitNet > 0) {
        return roundMoney(explicitNet);
    }

    if (String(row?.type || "").toLowerCase() === "support") {
        return computeSupportRevenueBreakdown(row?.amount_gross).netCreator;
    }

    return roundMoney(explicitNet);
}

function resolveTransactionCommissionAmount(row) {
    const explicitCommission = Number(row?.amount_commission_xera);
    if (Number.isFinite(explicitCommission) && explicitCommission > 0) {
        return roundMoney(explicitCommission);
    }

    if (String(row?.type || "").toLowerCase() === "support") {
        return computeSupportRevenueBreakdown(row?.amount_gross).commission;
    }

    return roundMoney(explicitCommission);
}

function normalizeMobileMoneyProvider(value) {
    const upper = String(value || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
    if (SUPPORTED_MOBILE_MONEY_PROVIDERS.has(upper)) return upper;
    return null;
}

function sanitizeWalletNumber(value) {
    return String(value || "")
        .trim()
        .replace(/[^\d+]/g, "")
        .slice(0, 32);
}

function sanitizePayoutText(value, maxLength = 160) {
    return String(value || "")
        .trim()
        .slice(0, maxLength);
}

function isMissingRelationError(error) {
    const message = String(error?.message || "").toLowerCase();
    return (
        (message.includes("relation") && message.includes("does not exist")) ||
        (message.includes("could not find") && message.includes("table")) ||
        message.includes("schema cache")
    );
}

function getWalletSchemaErrorMessage() {
    return "Schema portefeuille manquant. Executez sql/monetization-supabase-one-shot.sql ou sql/monetization-wallet.sql dans Supabase SQL Editor.";
}

function isForeignKeyViolation(error) {
    const code = String(error?.code || "").trim();
    const message = String(error?.message || "").toLowerCase();
    return (
        code === "23503" ||
        (message.includes("foreign key") && message.includes("violates"))
    );
}

function isNotNullViolation(error) {
    const code = String(error?.code || "").trim();
    const message = String(error?.message || "").toLowerCase();
    return (
        code === "23502" ||
        (message.includes("null value") && message.includes("violates"))
    );
}

function getReadableServerErrorMessage(error, fallbackMessage) {
    const message = String(error?.message || "").trim();
    if (!message) return fallbackMessage;
    return message.slice(0, 280);
}

function setResponseHeader(res, name, value) {
    if (!res || !name) return;
    if (typeof res.set === "function") {
        res.set(name, value);
        return;
    }
    if (typeof res.setHeader === "function") {
        res.setHeader(name, value);
    }
}

function isUuidString(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value || "").trim(),
    );
}

function sendCheckoutErrorResponse(res, error, fallbackMessage, context = {}) {
    const returnPath = context.returnPath || "/";
    const sourceCode = String(error?.code || "").trim() || "UNKNOWN";
    const requestId = context.requestId || crypto.randomUUID();
    const stage = String(context.stage || "checkout");
    let category = "checkout_failure";
    console.error("[Checkout failure]", {
        requestId,
        stage,
        category,
        code: error?.code || null,
        message: error?.message || String(error),
        details: error?.details || null,
        hint: error?.hint || null,
    });
    setResponseHeader(res, "X-Xera1-Request-Id", requestId);
    setResponseHeader(res, "X-Xera1-Error-Stage", stage);

    if (isMissingRelationError(error) || isMissingColumnError(error)) {
        category = "schema_missing";
        setResponseHeader(res, "X-Xera1-Error-Category", category);
        setResponseHeader(res, "X-Xera1-Error-Code", sourceCode);
        return res
            .status(503)
            .send(`${getWalletSchemaErrorMessage()} [référence ${requestId}]`);
    }

    if (isForeignKeyViolation(error)) {
        category = "foreign_key_violation";
        setResponseHeader(res, "X-Xera1-Error-Category", category);
        setResponseHeader(res, "X-Xera1-Error-Code", sourceCode);
        return res
            .status(409)
            .send(
                "Profil utilisateur incomplet dans la base. Deconnectez-vous puis reconnectez-vous avant de reessayer.",
            );
    }

    if (isNotNullViolation(error)) {
        category = "not_null_violation";
        setResponseHeader(res, "X-Xera1-Error-Category", category);
        setResponseHeader(res, "X-Xera1-Error-Code", sourceCode);
        return res
            .status(409)
            .send(
                getReadableServerErrorMessage(
                    error,
                    "Certaines donnees du profil utilisateur sont manquantes pour lancer le paiement.",
                ),
            );
    }

    setResponseHeader(res, "X-Xera1-Error-Category", category);
    setResponseHeader(res, "X-Xera1-Error-Code", sourceCode);

    const message = String(error?.message || "");
    const safeKpayMessage =
        message.startsWith("KPay:") || message.startsWith("KPay API error:")
            ? message
            : fallbackMessage;

    const acceptsJson =
        String(res.req?.headers?.accept || "").includes("application/json") ||
        String(res.req?.headers?.["x-requested-with"] || "").toLowerCase() ===
            "xmlhttprequest";

    if (acceptsJson) {
        return res.status(error?.kpayStatus || 400).json({
            success: false,
            error: safeKpayMessage,
            message: safeKpayMessage,
            requestId,
            kpayDetails: error?.kpayDetails || null,
        });
    }

    const acceptsHtml = String(res.req?.headers?.accept || "").includes(
        "text/html",
    );

    if (acceptsHtml) {
        setResponseHeader(res, "Content-Type", "text/html; charset=utf-8");
        const safeTitle = escapeHtmlText("Service de Paiement KPay");
        const safeBody = escapeHtmlText(safeKpayMessage);
        const safeRef = escapeHtmlText(requestId);
        const safeReturn = escapeHtmlText(returnPath);
        return res.status(500).send(`<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle} - XERA</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; text-align: center; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px; max-width: 480px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
        .icon { font-size: 48px; margin-bottom: 16px; }
        h1 { font-size: 20px; font-weight: 700; margin: 0 0 12px 0; color: #f43f5e; }
        p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 24px 0; }
        .btn { display: inline-block; background: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; transition: background 0.2s; }
        .btn:hover { background: #4f46e5; }
        .ref { margin-top: 20px; font-size: 11px; color: #64748b; font-family: monospace; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">⚠️</div>
        <h1>${safeTitle}</h1>
        <p>${safeBody}</p>
        <a href="${safeReturn}" class="btn">Retour à l'application</a>
        <div class="ref">Réf: ${safeRef}</div>
    </div>
</body>
</html>`);
    }

    return res.status(500).send(`${safeKpayMessage} [référence ${requestId}]`);
}

function extractPayoutSettings(row) {
    if (!row) return null;
    const provider = normalizeMobileMoneyProvider(row.provider) || "other";
    return {
        id: row.id || null,
        userId: row.user_id || null,
        channel: row.channel || "mobile_money",
        provider,
        providerLabel:
            MOBILE_MONEY_PROVIDER_LABELS[provider] ||
            MOBILE_MONEY_PROVIDER_LABELS.other,
        accountName: row.account_name || "",
        walletNumber: row.wallet_number || "",
        countryCode: row.country_code || "CD",
        status: row.status === "inactive" ? "inactive" : "active",
        notes: row.notes || "",
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
    };
}

function extractWithdrawalRequest(row) {
    if (!row) return null;
    const provider = normalizeMobileMoneyProvider(row.provider) || "other";
    return {
        id: row.id || null,
        creatorId: row.creator_id || null,
        payoutSettingId: row.payout_setting_id || null,
        amountUsd: roundMoney(row.amount_usd),
        requestedAmount: roundMoney(row.requested_amount),
        requestedCurrency: String(
            row.requested_currency || "USD",
        ).toUpperCase(),
        channel: row.channel || "mobile_money",
        provider,
        providerLabel:
            MOBILE_MONEY_PROVIDER_LABELS[provider] ||
            MOBILE_MONEY_PROVIDER_LABELS.other,
        walletNumber: row.wallet_number || "",
        accountName: row.account_name || "",
        note: row.note || "",
        status: row.status || "pending",
        operatorRefId: row.operator_ref_id || null,
        adminNote: row.admin_note || "",
        requestedAt: row.requested_at || row.created_at || null,
        processedAt: row.processed_at || null,
        paidAt: row.paid_at || null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
    };
}

async function fetchCreatorPayoutSettings(userId) {
    const { data, error } = await supabase
        .from("creator_payout_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
    if (error) throw error;
    return extractPayoutSettings(data);
}

async function fetchCreatorWithdrawalRequests(userId, options = {}) {
    let query = supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("creator_id", userId)
        .order("created_at", { ascending: false });

    if (options.statuses?.length) {
        query = query.in("status", options.statuses);
    }
    if (options.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(extractWithdrawalRequest);
}

async function buildCreatorWalletOverview(userId) {
    const [
        profileResult,
        transactionsResult,
        payoutSettingsResult,
        withdrawalsResult,
    ] = await Promise.all([
        supabase
            .from("users")
            .select(
                "id, name, avatar, badge, followers_count, plan, plan_status, plan_ends_at, is_monetized",
            )
            .eq("id", userId)
            .maybeSingle(),
        supabase
            .from("transactions")
            .select(
                "id, type, amount_gross, amount_net_creator, amount_commission_xera, currency, status, description, metadata, created_at",
            )
            .eq("to_user_id", userId)
            .eq("type", "support")
            .in("status", ["pending", "succeeded"])
            .order("created_at", { ascending: false }),
        fetchCreatorPayoutSettings(userId),
        fetchCreatorWithdrawalRequests(userId, { limit: 20 }),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (transactionsResult.error) throw transactionsResult.error;

    const profile = profileResult.data || null;
    const revenueTransactions = transactionsResult.data || [];
    const payoutSettings = payoutSettingsResult || null;
    const withdrawals = withdrawalsResult || [];

    let supportAvailable = 0;
    let supportPending = 0;

    revenueTransactions.forEach((tx) => {
        if (!tx) return;
        const net = resolveTransactionNetAmount(tx);
        if (tx.type === "support") {
            if (tx.status === "succeeded") supportAvailable += net;
            if (tx.status === "pending") supportPending += net;
        }
    });

    let pendingWithdrawals = 0;
    let paidWithdrawals = 0;
    withdrawals.forEach((withdrawal) => {
        if (!withdrawal) return;
        if (["pending", "processing"].includes(withdrawal.status)) {
            pendingWithdrawals += roundMoney(withdrawal.amountUsd);
        }
        if (withdrawal.status === "paid") {
            paidWithdrawals += roundMoney(withdrawal.amountUsd);
        }
    });

    const creditedBalance = roundMoney(supportAvailable);
    const pendingIncoming = roundMoney(supportPending);
    const availableBalance = roundMoney(
        Math.max(0, creditedBalance - pendingWithdrawals - paidWithdrawals),
    );

    return {
        profile,
        payoutSettings,
        withdrawals,
        wallet: {
            currency: "USD",
            availableBalance,
            pendingIncoming,
            pendingWithdrawals: roundMoney(pendingWithdrawals),
            paidWithdrawals: roundMoney(paidWithdrawals),
            lifetimeNetRevenue: roundMoney(creditedBalance + paidWithdrawals),
            supportAvailable: roundMoney(supportAvailable),
            supportPending: roundMoney(supportPending),
            minimumWithdrawalUsd: WITHDRAWAL_MIN_USD,
            canRequestWithdrawal:
                availableBalance >= WITHDRAWAL_MIN_USD * 2 &&
                Boolean(
                    payoutSettings?.status === "active" &&
                    payoutSettings?.walletNumber &&
                    payoutSettings?.provider &&
                    payoutSettings?.accountName,
                ),
        },
    };
}

function shouldClearBadge(value) {
    if (!value) return false;
    const normalized = String(value).toLowerCase();
    return EXPIRES_BADGES.has(normalized);
}

async function sweepExpiredSubscriptions() {
    if (subscriptionSweepInFlight) return;
    subscriptionSweepInFlight = true;
    const nowIso = new Date().toISOString();

    try {
        const { data: expiredSubs, error: subsError } = await supabase
            .from("subscriptions")
            .select("id")
            .eq("status", "active")
            .lte("current_period_end", nowIso);

        if (subsError) throw subsError;

        const subscriptionIds = (expiredSubs || [])
            .map((row) => row.id)
            .filter(Boolean);
        if (subscriptionIds.length > 0) {
            await supabase
                .from("subscriptions")
                .update({
                    status: "canceled",
                    canceled_at: nowIso,
                    cancel_at_period_end: true,
                })
                .in("id", subscriptionIds);
        }

        const { data: expiredUsers, error: usersError } = await supabase
            .from("users")
            .select("id, badge")
            .eq("plan_status", "active")
            .lte("plan_ends_at", nowIso);

        if (usersError) throw usersError;

        try {
            await notifyUpcomingSubscriptionExpiries();
        } catch (notificationError) {
            console.warn(
                "Subscription expiry notification warning:",
                notificationError?.message || notificationError,
            );
        }

        const userIds = (expiredUsers || [])
            .map((row) => row.id)
            .filter(Boolean);
        // Révoquer toutes les fonctionnalités premium lors de l'expiration
        const expiredFeatures = {
            advanced_profile_customization: false,
            priority_recommendations: false,
            full_profile_customization: false,
            hd_streaming: false,
            private_live: false,
            advanced_collab_tools: false,
            realtime_analytics: false,
            data_export: false,
            maximum_visibility: false,
        };

        if (userIds.length > 0) {
            await supabase
                .from("users")
                .update({
                    plan: "free",
                    plan_status: "inactive",
                    is_monetized: false,
                    updated_at: nowIso,
                    ...expiredFeatures,
                })
                .in("id", userIds);

            const badgeIds = (expiredUsers || [])
                .filter((row) => shouldClearBadge(row.badge))
                .map((row) => row.id)
                .filter(Boolean);
            if (badgeIds.length > 0) {
                await supabase
                    .from("users")
                    .update({ badge: null, updated_at: nowIso })
                    .in("id", badgeIds);
            }
        }
    } catch (error) {
        const details = String(error?.details || "").toLowerCase();
        const message = String(error?.message || "").toLowerCase();
        const isNetworkTimeout =
            details.includes("connecttimeouterror") ||
            details.includes("und_err_connect_timeout") ||
            message.includes("fetch failed");

        if (isNetworkTimeout) {
            const now = Date.now();
            if (now - lastSweepNetworkErrorAt > 60 * 1000) {
                console.warn(
                    "Subscription expiry sweep warning: Supabase unreachable (network timeout). Vérifie internet/DNS/firewall ou mets SUBSCRIPTION_SWEEP_MS=0 en local.",
                );
                lastSweepNetworkErrorAt = now;
            }
        } else {
            console.error("Subscription expiry sweep error:", error);
        }
    } finally {
        subscriptionSweepInFlight = false;
    }
}

async function activateSubscription({
    userId,
    plan,
    billingCycle,
    currency,
    amount,
    transactionRefId,
    operatorRefId,
    method,
    provider,
    walletId,
    pendingTransactionId,
    confirmationSource = "kpay_callback",
    confirmedBy,
    note,
    benefitExpiresAt,
}) {
    const paymentId = transactionRefId ? `kpay_${transactionRefId}` : null;
    const normalizedPlan = String(plan || "").toLowerCase();
    const badgeForPlan =
        normalizedPlan === "elite"
            ? "verified_gold"
            : normalizedPlan === "pro"
              ? "verified_gold"
              : "verified";

    let pendingPayment = null;
    if (pendingTransactionId) {
        const { data, error } = await supabase
            .from("transactions")
            .select(
                "id, from_user_id, to_user_id, amount_gross, currency, status, metadata",
            )
            .eq("id", pendingTransactionId)
            .maybeSingle();
        if (error) throw error;
        if (!data) {
            throw new Error("Paiement en attente introuvable.");
        }
        if (String(data.status || "").toLowerCase() === "succeeded") {
            if (
                ["standard", "medium", "pro", "elite"].includes(normalizedPlan)
            ) {
                await approvePaidVerificationRequest(userId);
            }
            const { data: existingUser } = await supabase
                .from("users")
                .select("*")
                .eq("id", userId)
                .maybeSingle();
            return {
                alreadyActivated: true,
                user: existingUser || null,
                transactionId: data.id,
            };
        }
        if (String(data.status || "").toLowerCase() !== "pending") {
            throw new Error("Ce paiement ne peut plus être confirmé.");
        }
        pendingPayment = data;
    }

    if (transactionRefId) {
        const { data: existing } = await supabase
            .from("transactions")
            .select("id")
            .eq("metadata->>transaction_ref_id", String(transactionRefId))
            .eq("status", "succeeded")
            .maybeSingle();
        if (existing?.id && existing.id !== pendingTransactionId) {
            if (
                ["standard", "medium", "pro", "elite"].includes(normalizedPlan)
            ) {
                await approvePaidVerificationRequest(userId);
            }
            const { data: existingUser } = await supabase
                .from("users")
                .select("*")
                .eq("id", userId)
                .maybeSingle();
            return {
                alreadyActivated: true,
                user: existingUser || null,
                transactionId: existing.id,
            };
        }
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const periodEnd = benefitExpiresAt
        ? new Date(benefitExpiresAt)
        : billingCycle === "annual"
          ? addMonths(now, 12)
          : addMonths(now, 1);
    const periodEndIso = periodEnd.toISOString();

    let badgeToApply = badgeForPlan;
    try {
        const { data: profile } = await supabase
            .from("users")
            .select("badge")
            .eq("id", userId)
            .maybeSingle();
        const existingBadge = String(profile?.badge || "").toLowerCase();
        const protectedBadges = new Set([
            "staff",
            "team",
            "community",
            "company",
            "enterprise",
            "ambassador",
        ]);
        if (protectedBadges.has(existingBadge)) {
            badgeToApply = profile?.badge || badgeForPlan;
        }
    } catch (e) {
        // Ignore profile read errors; continue with default badge
    }
    const isMonetized = ["medium", "pro", "elite"].includes(normalizedPlan);

    const { error: cancelSubsError } = await supabase
        .from("subscriptions")
        .update({
            status: "canceled",
            canceled_at: nowIso,
            cancel_at_period_end: false,
        })
        .eq("user_id", userId)
        .eq("status", "active");
    if (cancelSubsError) throw cancelSubsError;

    const { data: insertedSubscription, error: insertSubError } = await supabase
        .from("subscriptions")
        .insert({
            user_id: userId,
            plan,
            status: "active",
            current_period_start: nowIso,
            current_period_end: periodEndIso,
        })
        .select("id")
        .single();
    if (insertSubError) throw insertSubError;

    // Calculer les fonctionnalités premium selon le plan
    const premiumFeatures = computePremiumFeatures(normalizedPlan);

    const { data: updatedUser, error: updateUserError } = await supabase
        .from("users")
        .update({
            plan,
            plan_status: "active",
            plan_ends_at: periodEndIso,
            badge: badgeToApply,
            is_monetized: isMonetized,
            ...premiumFeatures,
        })
        .eq("id", userId)
        .select("*")
        .single();
    if (updateUserError) throw updateUserError;

    if (normalizedPlan === "page_verification") {
        try {
            const { data: ownedPages, error: pagesError } = await supabase
                .from("professional_pages")
                .select("id")
                .eq("owner_id", userId);
            if (!pagesError && Array.isArray(ownedPages) && ownedPages.length) {
                await Promise.all(
                    ownedPages.map((page) =>
                        supabase
                            .from("verified_badges")
                            .upsert(
                                { user_id: page.id, type: "page" },
                                { onConflict: "user_id,type" },
                            ),
                    ),
                );
            }
        } catch (pageVerificationError) {
            console.warn(
                "Page verification activation warning:",
                pageVerificationError,
            );
        }
    }

    const mergedMetadata = {
        ...(pendingPayment?.metadata &&
        typeof pendingPayment.metadata === "object"
            ? pendingPayment.metadata
            : {}),
        payment_provider: "kpay",
        payment_ref: paymentId,
        transaction_ref_id: transactionRefId || null,
        method,
        provider,
        wallet_id: walletId,
        operator_ref_id: operatorRefId || null,
        activated_at: nowIso,
        activation_source: confirmationSource,
        subscription_id: insertedSubscription?.id || null,
    };
    if (confirmedBy) mergedMetadata.confirmed_by = confirmedBy;
    if (note) mergedMetadata.admin_note = note;

    // Persist the attribution at confirmation time; never infer it later from a coupon string.
    await createPartnerAffiliationFromSubscription({
        userId,
        subscriptionId: insertedSubscription?.id,
        periodEnd: periodEndIso,
        metadata: mergedMetadata,
    });

    let transactionId = pendingTransactionId || null;
    if (pendingTransactionId) {
        const { error: updateTxError } = await supabase
            .from("transactions")
            .update({
                amount_gross: amount,
                amount_net_creator: 0,
                amount_commission_xera: 0,
                currency,
                status: "succeeded",
                description: `Abonnement ${plan} (${billingCycle})`,
                metadata: mergedMetadata,
            })
            .eq("id", pendingTransactionId);
        if (updateTxError) throw updateTxError;
    } else {
        const { data: insertedTransaction, error: insertTxError } =
            await supabase
                .from("transactions")
                .insert({
                    from_user_id: userId,
                    to_user_id: userId,
                    type: "subscription",
                    amount_gross: amount,
                    amount_net_creator: 0,
                    amount_commission_xera: 0,
                    currency,
                    status: "succeeded",
                    description: `Abonnement ${plan} (${billingCycle})`,
                    metadata: mergedMetadata,
                })
                .select("id")
                .single();
        if (insertTxError) throw insertTxError;
        transactionId = insertedTransaction?.id || null;
    }

    if (["standard", "medium", "pro", "elite"].includes(normalizedPlan)) {
        await approvePaidVerificationRequest(userId);
    }

    try {
        await notifySubscriptionActivation({
            userId,
            plan,
            billingCycle,
            planEndsAt: updatedUser?.plan_ends_at || periodEndIso,
        });
    } catch (notificationError) {
        console.warn(
            "Subscription activation notification warning:",
            notificationError?.message || notificationError,
        );
    }

    invalidateUserAppCaches(userId);

    return {
        alreadyActivated: false,
        user: updatedUser,
        subscriptionId: insertedSubscription?.id || null,
        transactionId,
    };
}

function supportsPush() {
    return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

const INDEFINITE_GIFT_SUPPORT_STATUSES = new Set([
    "",
    "active",
    "gifted",
    "offered",
    "granted",
    "admin_granted",
    "complimentary",
]);

function isPlanActiveForUser(user) {
    if (!user) return false;
    const status = String(user.plan_status || user.planStatus || "")
        .trim()
        .toLowerCase();
    if (status !== "active") return false;
    const planEnd = user.plan_ends_at || user.planEndsAt || null;
    if (!planEnd) return true;
    const endMs = Date.parse(planEnd);
    if (!Number.isFinite(endMs)) return true;
    return endMs > Date.now();
}

function isGiftedProUser(user) {
    if (!user) return false;
    return (
        ["pro", "elite"].includes(
            String(user.plan || "").trim().toLowerCase(),
        ) &&
        String(user.plan_status || user.planStatus || "")
            .trim()
            .toLowerCase() === "active" &&
        !(user.plan_ends_at || user.planEndsAt)
    );
}

function canUserReceiveSupport(user) {
    if (!user) return false;
    const plan = String(user.plan || "").trim().toLowerCase();
    if (!["medium", "pro", "elite"].includes(plan)) return false;
    const status = String(user.plan_status || user.planStatus || "")
        .trim()
        .toLowerCase();
    const planEnd = user.plan_ends_at || user.planEndsAt || null;
    const giftedSupportPlan =
        ["medium", "pro"].includes(plan) &&
        !planEnd &&
        INDEFINITE_GIFT_SUPPORT_STATUSES.has(status);
    if (!isPlanActiveForUser(user) && !giftedSupportPlan) return false;
    if (isGiftedProUser(user)) return true;
    if (["medium", "pro"].includes(plan)) return true;
    return (
        user.is_monetized === true || Number(user.followers_count || 0) >= 1000
    );
}

function formatMoneyUsd(value) {
    const amount = roundMoney(value);
    return `$${amount.toFixed(2)}`;
}

function sanitizeSupportMessage(value, maxLength = 200) {
    const cleaned = String(value ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
    return cleaned;
}

function buildSupportNotificationMessage(
    senderName,
    amountUsd,
    supportMessage,
) {
    const safeSenderName =
        String(senderName || "Quelqu'un").trim() || "Quelqu'un";
    const safeAmount = formatMoneyUsd(amountUsd ?? 0);
    const message = sanitizeSupportMessage(supportMessage, 200);
    if (!message) {
        return `${safeSenderName} vous a envoyé ${safeAmount} de soutien.`;
    }
    return `${safeSenderName} vous a envoyé ${safeAmount} de soutien. Message: "${message}"`;
}

async function createNotificationRecord({
    userId,
    type,
    message,
    link,
    actorId,
    metadata,
}) {
    if (!userId || !type || !message) return null;

    const payload = {
        user_id: userId,
        type,
        message,
        link: link || null,
        read: false,
    };

    if (actorId) payload.actor_id = actorId;
    if (metadata && typeof metadata === "object") payload.metadata = metadata;

    try {
        let query = supabase
            .from("notifications")
            .insert(payload)
            .select("*")
            .single();
        let { data, error } = await query;

        if (error && isMissingColumnError(error)) {
            const fallbackPayload = {
                user_id: userId,
                type,
                message,
                link: link || null,
                read: false,
            };
            ({ data, error } = await supabase
                .from("notifications")
                .insert(fallbackPayload)
                .select("*")
                .single());
        }

        if (error) throw error;
        return data || null;
    } catch (error) {
        console.warn(
            "Support notification insert error:",
            error?.message || error,
        );
        return null;
    }
}

async function createUniqueSubscriptionNotification({
    userId,
    type,
    message,
    planEndsAt,
    link,
}) {
    if (!userId || !type || !message) return false;

    const { data: existing, error: lookupError } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("type", type)
        .eq("message", message)
        .limit(1);
    if (lookupError) throw lookupError;
    if (existing?.length) return false;

    const notification = await createNotificationRecord({
        userId,
        type,
        message,
        link,
        metadata: { plan_ends_at: planEndsAt },
    });
    return Boolean(notification);
}

async function notifySubscriptionActivation({
    userId,
    plan,
    billingCycle,
    planEndsAt,
}) {
    const planLabel = String(plan || "").toUpperCase();
    const cycleLabel =
        String(billingCycle || "monthly").toLowerCase() === "annual"
            ? "annuel"
            : "mensuel";
    const expiryLabel = planEndsAt
        ? new Date(planEndsAt).toLocaleDateString("fr-FR")
        : "la fin de votre période";

    return createUniqueSubscriptionNotification({
        userId,
        type: "subscription_activated",
        message: `Paiement KPay confirmé : votre plan ${planLabel} ${cycleLabel} et votre badge sont actifs jusqu'au ${expiryLabel}.`,
        planEndsAt,
        link: "profile.html",
    });
}

async function notifySubscriptionExpiryReminder(user, daysRemaining) {
    const expiryLabel = new Date(user.plan_ends_at).toLocaleDateString("fr-FR");
    const message =
        daysRemaining === 0
            ? `Votre abonnement ${String(user.plan || "").toUpperCase()} et votre badge expirent aujourd'hui (${expiryLabel}). Renouvelez votre abonnement pour conserver vos avantages.`
            : `Votre abonnement ${String(user.plan || "").toUpperCase()} et votre badge expirent dans ${daysRemaining} jours (${expiryLabel}). Renouvelez votre abonnement pour conserver vos avantages.`;

    return createUniqueSubscriptionNotification({
        userId: user.id,
        type: `subscription_expiry_${daysRemaining}d`,
        message,
        planEndsAt: user.plan_ends_at,
        link: "subscription-plans.html",
    });
}

async function notifyUpcomingSubscriptionExpiries() {
    const now = Date.now();
    const windowMs = Math.max(SUBSCRIPTION_SWEEP_MS || 0, 10 * 60 * 1000);
    const { data: users, error } = await supabase
        .from("users")
        .select("id, plan, plan_status, plan_ends_at")
        .eq("plan_status", "active")
        .not("plan_ends_at", "is", null);
    if (error) throw error;

    let sentCount = 0;
    for (const user of users || []) {
        if (!isValidPlanId(user.plan) || user.plan === "page_verification") {
            continue;
        }
        const remainingMs = new Date(user.plan_ends_at).getTime() - now;
        for (const daysRemaining of [7, 3, 0]) {
            const targetMs = daysRemaining * 24 * 60 * 60 * 1000;
            if (
                remainingMs >= targetMs - windowMs &&
                remainingMs <= targetMs + windowMs
            ) {
                if (
                    await notifySubscriptionExpiryReminder(user, daysRemaining)
                ) {
                    sentCount++;
                }
            }
        }
    }
    return sentCount;
}

async function purgeStalePushSubscription(endpoint) {
    if (!endpoint) return;
    try {
        await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", endpoint);
    } catch (error) {
        console.warn(
            "Failed to purge stale push subscription:",
            error?.message || error,
        );
    }
}

function buildNotificationPushPayload(notification) {
    const typeTitleMap = {
        support: "Nouveau soutien",
        follow: "Nouvel abonné",
        like: "Nouveau like",
        comment: "Nouveau commentaire",
        live_chat: "Message du live",
        mention: "Mention",
        achievement: "Succès débloqué",
        stream: "Live en cours",
        subscription_activated: "Abonnement confirmé",
        subscription_expiry_7d: "Abonnement bientôt expiré",
        subscription_expiry_3d: "Abonnement bientôt expiré",
        subscription_expiry_0d: "Abonnement expiré aujourd'hui",
    };

    const title = typeTitleMap[notification?.type] || "Notification XERA1";
    const icon = `${PRIMARY_ORIGIN.replace(/\/$/, "")}/icons/logo.png`;
    const rawLink = String(notification?.link || "").trim();
    const link = rawLink
        ? rawLink.startsWith("http")
            ? rawLink
            : `${PRIMARY_ORIGIN.replace(/\/$/, "")}/${rawLink.replace(/^\//, "")}`
        : `${PRIMARY_ORIGIN.replace(/\/$/, "")}/profile?user=${notification?.user_id || ""}`;

    return {
        title,
        body: notification?.message || "",
        icon,
        link,
        tag: notification?.id || `support-${notification?.user_id || "xera1"}`,
        renotify: false,
        silent: false,
    };
}

async function sendPushToUser(userId, payload) {
    if (!userId || !payload) return;

    try {
        // Compute unread count for badge synchronization
        let unreadCount = 0;
        try {
            const { count, error: countErr } = await supabase
                .from("notifications")
                .select("*", { head: true, count: "exact" })
                .eq("user_id", userId)
                .eq("read", false);
            if (!countErr) unreadCount = Number(count || 0);
        } catch (e) {
            // ignore counting errors
        }

        const payloadWithBadge = { ...(payload || {}), badge: unreadCount };

        // 1) Web Push (existing subscriptions)
        if (supportsPush()) {
            try {
                const { data: subs, error } = await supabase
                    .from("push_subscriptions")
                    .select("endpoint, keys")
                    .eq("user_id", userId);
                if (error) throw error;
                if (Array.isArray(subs)) {
                    const payloadString = JSON.stringify(payloadWithBadge);
                    for (const sub of subs) {
                        if (!sub?.endpoint || !sub?.keys) continue;
                        try {
                            await webpush.sendNotification(
                                {
                                    endpoint: sub.endpoint,
                                    keys: sub.keys,
                                },
                                payloadString,
                            );
                        } catch (err) {
                            if (
                                err?.statusCode === 404 ||
                                err?.statusCode === 410
                            ) {
                                await purgeStalePushSubscription(sub.endpoint);
                                continue;
                            }
                            console.warn(
                                "Support push error:",
                                err?.message || err,
                            );
                        }
                    }
                }
            } catch (error) {
                console.warn(
                    "Support push lookup error:",
                    error?.message || error,
                );
            }
        }

        // 2) Native mobile tokens via Firebase Admin (FCM -> Android / APNs)
        if (firebaseAdminInitialized && firebaseAdmin) {
            try {
                const { data: tokensRows, error: tokensErr } = await supabase
                    .from("device_push_tokens")
                    .select("token, platform")
                    .eq("user_id", userId);
                if (
                    !tokensErr &&
                    Array.isArray(tokensRows) &&
                    tokensRows.length > 0
                ) {
                    const tokens = tokensRows
                        .map((r) => String(r.token || ""))
                        .filter(Boolean);
                    if (tokens.length > 0) {
                        const message = {
                            tokens,
                            notification: {
                                title: String(
                                    payloadWithBadge.title || "XERA1",
                                ),
                                body: String(payloadWithBadge.body || ""),
                                image: String(payloadWithBadge.icon || ""),
                            },
                            data: {
                                link: String(payloadWithBadge.link || ""),
                                tag: String(payloadWithBadge.tag || ""),
                            },
                            android: {
                                priority: "high",
                                notification: {
                                    sound: "default",
                                },
                            },
                            apns: {
                                payload: {
                                    aps: {
                                        badge: unreadCount || 0,
                                        sound: "default",
                                    },
                                },
                            },
                        };

                        try {
                            await firebaseAdmin
                                .messaging()
                                .sendMulticast(message);
                        } catch (fcmErr) {
                            console.error(
                                "FCM send error:",
                                fcmErr?.message || fcmErr,
                            );
                        }
                    }
                }
            } catch (err) {
                console.warn(
                    "Device tokens lookup/send error:",
                    err?.message || err,
                );
            }
        }
    } catch (error) {
        console.warn("sendPushToUser error:", error?.message || error);
    }
}

async function failPendingTransaction({
    pendingTransactionId,
    transactionRefId,
    operatorRefId,
    reason,
    confirmationSource = "kpay_callback",
}) {
    if (!pendingTransactionId) return null;

    const { data: existing, error: existingError } = await supabase
        .from("transactions")
        .select("id, status, metadata")
        .eq("id", pendingTransactionId)
        .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return null;

    const currentStatus = String(existing.status || "").toLowerCase();
    if (currentStatus !== "pending") {
        return existing;
    }

    const nowIso = new Date().toISOString();
    const metadata = {
        ...(existing.metadata && typeof existing.metadata === "object"
            ? existing.metadata
            : {}),
        transaction_ref_id:
            transactionRefId || existing.metadata?.transaction_ref_id || null,
        operator_ref_id:
            operatorRefId || existing.metadata?.operator_ref_id || null,
        failure_reason: reason || null,
        failed_at: nowIso,
        confirmation_source: confirmationSource,
    };

    const { data, error } = await supabase
        .from("transactions")
        .update({
            status: "failed",
            metadata,
            updated_at: nowIso,
        })
        .eq("id", pendingTransactionId)
        .select("id, status, metadata")
        .single();
    if (error) throw error;

    return data;
}

async function confirmSupportPayment({
    fromUserId,
    toUserId,
    amountUsd,
    checkoutCurrency,
    checkoutAmount,
    method,
    provider,
    walletId,
    description,
    pendingTransactionId,
    transactionRefId,
    operatorRefId,
    confirmationSource = "kpay_callback",
}) {
    const paymentId = transactionRefId ? `kpay_${transactionRefId}` : null;
    const breakdown = computeSupportRevenueBreakdown(amountUsd);

    let pendingPayment = null;
    if (pendingTransactionId) {
        const { data, error } = await supabase
            .from("transactions")
            .select(
                "id, from_user_id, to_user_id, type, amount_gross, currency, status, description, metadata",
            )
            .eq("id", pendingTransactionId)
            .maybeSingle();
        if (error) throw error;
        if (!data) {
            throw new Error("Paiement de soutien introuvable.");
        }
        if (String(data.type || "").toLowerCase() !== "support") {
            throw new Error("Transaction de soutien invalide.");
        }
        if (String(data.status || "").toLowerCase() === "succeeded") {
            return {
                alreadyConfirmed: true,
                transactionId: data.id,
            };
        }
        if (String(data.status || "").toLowerCase() !== "pending") {
            throw new Error("Ce soutien ne peut plus être confirmé.");
        }
        pendingPayment = data;
    }

    if (transactionRefId) {
        const { data: existing, error: existingError } = await supabase
            .from("transactions")
            .select("id")
            .eq("type", "support")
            .eq("metadata->>transaction_ref_id", String(transactionRefId))
            .eq("status", "succeeded")
            .maybeSingle();
        if (existingError) throw existingError;
        if (existing?.id && existing.id !== pendingTransactionId) {
            return {
                alreadyConfirmed: true,
                transactionId: existing.id,
            };
        }
    }

    const [senderResult, recipientResult] = await Promise.all([
        supabase
            .from("users")
            .select("id, name, avatar")
            .eq("id", fromUserId)
            .maybeSingle(),
        supabase
            .from("users")
            .select("id, name, avatar")
            .eq("id", toUserId)
            .maybeSingle(),
    ]);
    if (senderResult.error) throw senderResult.error;
    if (recipientResult.error) throw recipientResult.error;

    const senderProfile = senderResult.data || null;
    const recipientProfile = recipientResult.data || null;
    if (!recipientProfile) {
        throw new Error("Createur introuvable.");
    }

    const nowIso = new Date().toISOString();
    const mergedMetadata = {
        ...(pendingPayment?.metadata &&
        typeof pendingPayment.metadata === "object"
            ? pendingPayment.metadata
            : {}),
        payment_provider: "kpay",
        payment_ref: paymentId,
        transaction_ref_id: transactionRefId || null,
        operator_ref_id: operatorRefId || null,
        method: String(
            method || pendingPayment?.metadata?.method || "card",
        ).toLowerCase(),
        provider: provider || pendingPayment?.metadata?.provider || null,
        wallet_id: walletId || pendingPayment?.metadata?.wallet_id || null,
        support_kind: "direct",
        sender_name:
            senderProfile?.name ||
            pendingPayment?.metadata?.sender_name ||
            "Utilisateur",
        recipient_name:
            recipientProfile?.name ||
            pendingPayment?.metadata?.recipient_name ||
            "Createur",
        support_amount_usd: breakdown.gross,
        checkout_amount:
            checkoutAmount ||
            pendingPayment?.metadata?.checkout_amount ||
            breakdown.gross,
        checkout_currency: String(
            checkoutCurrency ||
                pendingPayment?.metadata?.checkout_currency ||
                "USD",
        ).toUpperCase(),
        confirmed_at: nowIso,
        confirmation_source: confirmationSource,
        commission_rate: SUPPORT_COMMISSION_RATE,
        amount_net_creator: breakdown.netCreator,
        amount_commission_xera: breakdown.commission,
    };

    let transactionId = pendingTransactionId || null;
    if (pendingTransactionId) {
        const { error: updateError } = await supabase
            .from("transactions")
            .update({
                from_user_id: fromUserId,
                to_user_id: toUserId,
                amount_gross: breakdown.gross,
                amount_net_creator: breakdown.netCreator,
                amount_commission_xera: breakdown.commission,
                currency: "USD",
                status: "succeeded",
                description:
                    description ||
                    pendingPayment?.description ||
                    "Soutien XERA1",
                metadata: mergedMetadata,
            })
            .eq("id", pendingTransactionId);
        if (updateError) throw updateError;
    } else {
        const { data, error } = await supabase
            .from("transactions")
            .insert({
                from_user_id: fromUserId,
                to_user_id: toUserId,
                type: "support",
                amount_gross: breakdown.gross,
                amount_net_creator: breakdown.netCreator,
                amount_commission_xera: breakdown.commission,
                currency: "USD",
                status: "succeeded",
                description: description || "Soutien XERA1",
                metadata: mergedMetadata,
            })
            .select("id")
            .single();
        if (error) throw error;
        transactionId = data.id;
    }

    const senderName =
        senderProfile?.name || mergedMetadata.sender_name || "Un utilisateur";
    const supportMessage = sanitizeSupportMessage(
        pendingPayment?.metadata?.support_message ||
            mergedMetadata.support_message ||
            "",
        200,
    );
    const partnerCommission = await createPartnerCommissionForSupport({
        transactionId,
        beneficiaryUserId: toUserId,
        gross: breakdown.gross,
        netCreator: breakdown.netCreator,
    });
    // Partner campaigns add their 5% share to XERA's platform fee; both remain traceable.
    if (partnerCommission?.commission) {
        const partnerNet = Math.max(
            0,
            Math.round(
                (breakdown.netCreator - partnerCommission.commission) * 100,
            ) / 100,
        );
        mergedMetadata.partner_commission_amount = partnerCommission.commission;
        mergedMetadata.amount_net_creator = partnerNet;
        mergedMetadata.amount_commission_xera = breakdown.commission;
        await supabase
            .from("transactions")
            .update({
                amount_net_creator: partnerNet,
                amount_commission_xera: breakdown.commission,
                metadata: mergedMetadata,
            })
            .eq("id", transactionId);
    }
    const notification = await createNotificationRecord({
        userId: toUserId,
        type: "support",
        message: buildSupportNotificationMessage(
            senderName,
            breakdown.gross,
            supportMessage,
        ),
        link: `/creator-dashboard`,
        actorId: fromUserId,
        metadata: {
            transaction_id: transactionId,
            amount_gross: breakdown.gross,
            amount_net_creator: breakdown.netCreator,
            amount_commission_xera: breakdown.commission,
            currency: "USD",
            sender_id: fromUserId,
            support_message: supportMessage || null,
        },
    });

    if (notification) {
        await sendPushToUser(
            toUserId,
            buildNotificationPushPayload(notification),
        );
    }

    const creatorEmail = await resolveReminderEmailAddress(toUserId);
    if (creatorEmail) {
        await sendReminderEmail({
            to: creatorEmail,
            transactional: true,
            subject: `Nouveau soutien de ${senderName}`,
            html: buildReminderEmailLayout({
                eyebrow: "Soutien direct",
                greeting: `Bonjour,`,
                headline: `${senderName} a envoyé un soutien`,
                bodyLines: [
                    `${senderName} vous a envoyé ${formatMoneyUsd(breakdown.gross)} de soutien.`,
                    supportMessage
                        ? `Message: “${supportMessage}”`
                        : "Merci pour votre présence et votre énergie sur XERA1.",
                    "Votre revenu est maintenant visible dans votre tableau de bord.",
                ],
                ctaLabel: "Voir mon tableau de bord",
                ctaUrl: `${PRIMARY_ORIGIN.replace(/\/$/, "")}/creator-dashboard`,
            }).html,
            text: buildSupportNotificationMessage(
                senderName,
                breakdown.gross,
                supportMessage,
            ),
        });
    }

    return {
        alreadyConfirmed: false,
        transactionId,
        notification,
        recipient: recipientProfile,
    };
}

function sanitizeTimeZone(value) {
    const fallback = "UTC";
    if (!value || typeof value !== "string") return fallback;
    try {
        Intl.DateTimeFormat("fr-FR", { timeZone: value }).format(new Date());
        return value;
    } catch (e) {
        return fallback;
    }
}

function isMissingColumnError(error) {
    const message = String(error?.message || "").toLowerCase();
    return (
        (message.includes("column") && message.includes("does not exist")) ||
        ((message.includes("column") || message.includes("could not find")) &&
            message.includes("schema cache"))
    );
}

function getTimePartsInZone(date, timeZone) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const pick = (type) => parts.find((p) => p.type === type)?.value || "";
    const year = pick("year");
    const month = pick("month");
    const day = pick("day");
    const hour = parseInt(pick("hour"), 10);
    const minute = parseInt(pick("minute"), 10);
    return {
        dateKey: `${year}-${month}-${day}`,
        hour,
        minute,
    };
}

function resolveReminderSlot(now, timeZone) {
    if (REMINDER_HOURS.length === 0) return null;
    const parts = getTimePartsInZone(now, timeZone);
    if (!Number.isFinite(parts.hour) || !Number.isFinite(parts.minute))
        return null;
    const slotHour = REMINDER_HOURS.find((h) => h === parts.hour);
    if (slotHour === undefined) return null;
    if (parts.minute < 0 || parts.minute >= REMINDER_WINDOW_MIN) return null;
    const hourKey = String(slotHour).padStart(2, "0");
    return {
        hour: slotHour,
        dateKey: parts.dateKey,
        slotKey: `${parts.dateKey}-${hourKey}`,
    };
}

function supportsEmailReminders() {
    return !getEmailDeliveryIssue();
}

function getEmailDeliveryIssue() {
    if (!REMINDER_EMAIL_ENABLED) {
        return "Envoi email desactive via RETURN_REMINDER_EMAIL_ENABLED.";
    }
    if (REMINDER_EMAIL_PROVIDER === "resend") {
        if (!REMINDER_EMAIL_API_KEY) {
            return "Cle API Resend manquante.";
        }
        const normalizedApiKey = REMINDER_EMAIL_API_KEY.toLowerCase();
        if (
            REMINDER_EMAIL_API_KEY === "re_123456789" ||
            normalizedApiKey.includes("<cle api>") ||
            normalizedApiKey.includes("<api key>") ||
            normalizedApiKey.includes("example") ||
            normalizedApiKey.includes("changeme")
        ) {
            return "Cle API Resend invalide ou de demonstration.";
        }
        if (!REMINDER_EMAIL_FROM) {
            return "Adresse d'expedition email manquante.";
        }
        return null;
    }
    if (REMINDER_EMAIL_PROVIDER === "webhook") {
        if (!REMINDER_EMAIL_WEBHOOK_URL) {
            return "URL webhook email manquante.";
        }
        return null;
    }
    return "Fournisseur email non configure.";
}

function buildProfileReminderUrl(userId) {
    return `${PRIMARY_ORIGIN.replace(/\/$/, "")}/profile?user=${encodeURIComponent(userId || "")}`;
}

function buildCreateReminderUrl(userId) {
    const profileUrl = buildProfileReminderUrl(userId);
    return `${profileUrl}&action=create`;
}

function buildDiscoverReminderUrl() {
    return `${PRIMARY_ORIGIN.replace(/\/$/, "")}/`;
}

function hashString(value) {
    const input = String(value || "");
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
        hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
    }
    return hash;
}

function pickDeterministicVariant(seed, variants = []) {
    if (!Array.isArray(variants) || variants.length === 0) return null;
    return variants[hashString(seed) % variants.length] || variants[0];
}

function getDaysSince(dateValue, now = new Date()) {
    const time = Date.parse(dateValue || "");
    if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.floor((now.getTime() - time) / DAY_MS));
}

function isSentRecently(dateValue, minGapMs, now = new Date()) {
    const time = Date.parse(dateValue || "");
    if (!Number.isFinite(time)) return false;
    return now.getTime() - time < minGapMs;
}

function buildReminderEmailLayout({
    eyebrow,
    greeting,
    headline,
    bodyLines = [],
    ctaLabel,
    ctaUrl,
    footer,
}) {
    const safeLines = bodyLines
        .map((line) => String(line || "").trim())
        .filter(Boolean);
    const safeGreeting = String(greeting || "Bonjour,").trim() || "Bonjour,";
    const safeHeadline = String(headline || "").trim();
    const safeCtaLabel = String(ctaLabel || "Découvrir sur XERA1").trim();
    const safeCtaUrl = String(ctaUrl || buildDiscoverReminderUrl()).trim();
    const safeFooter = String(
        footer ||
            "Tu reçois ce message car tu as activé les notifications par email sur XERA1. Tu peux les désactiver à tout moment dans tes réglages.",
    ).trim();

    const htmlParagraphs = safeLines
        .map(
            (line) =>
                `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#374151;">${escapeHtmlAttr(line)}</p>`,
        )
        .join("");

    const text = [
        safeGreeting,
        "",
        safeHeadline,
        "",
        ...safeLines,
        "",
        `${safeCtaLabel}: ${safeCtaUrl}`,
        "",
        safeFooter,
    ].join("\n");

    const html = `
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtmlAttr(safeHeadline)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${escapeHtmlAttr(safeHeadline)}
  </div>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:40px 10px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);border:1px solid #e5e7eb;">
          <!-- Header -->
          <tr>
            <td style="padding:40px 40px 24px 40px;text-align:left;">
              <img src="https://xera1.xyz/icons/logo.png" alt="XERA1" style="width:56px;height:56px;border-radius:14px;display:block;" />
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:0 40px 40px 40px;">
              <div style="font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#6366f1;margin-bottom:16px;">
                ${escapeHtmlAttr(eyebrow || "XERA1 Update")}
              </div>
              <h1 style="margin:0 0 20px 0;font-size:28px;font-weight:900;line-height:1.2;color:#111827;letter-spacing:-0.02em;">
                ${escapeHtmlAttr(safeHeadline)}
              </h1>
              <p style="margin:0 0 24px 0;font-size:17px;line-height:1.6;color:#1f2937;">
                ${escapeHtmlAttr(safeGreeting)}
              </p>
              ${htmlParagraphs}

              <!-- Action Button -->
              <div style="margin-top:40px;margin-bottom:16px;">
                <a href="${escapeHtmlAttr(safeCtaUrl)}" target="_blank" style="display:inline-block;background-color:#000000;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:16px 32px;border-radius:12px;box-shadow:0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                  ${escapeHtmlAttr(safeCtaLabel)}
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:40px;background-color:#f9fafb;border-top:1px solid #f1f5f9;text-align:left;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
                ${escapeHtmlAttr(safeFooter)}
              </p>
              <div style="margin-top:24px;font-size:12px;color:#9ca3af;font-weight:500;">
                &copy; ${new Date().getFullYear()} XERA1. Tous droits réservés.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

    return { html, text };
}

function buildDailyPostReminderCampaign(user, context, slot) {
    if (!slot || context.hasPostedToday) return null;
    if (!Array.isArray(context.activeArcs) || context.activeArcs.length === 0) {
        return null;
    }
    if (user.last_email_reminder_slot === slot.slotKey) return null;

    const arcTitle =
        String(context.activeArcs[0]?.title || "").trim() || "ton projet";
    const ctaUrl = buildCreateReminderUrl(user.id);
    const greeting = user.name ? `Bonjour ${user.name},` : "Bonjour,";
    const variants = [
        {
            subject: `XERA1 - ${arcTitle} t'attend toujours`,
            headline: "Si tu as 30 secondes, reviens nous montrer ou tu en es.",
            bodyLines: [
                `Ton projet "${arcTitle}" est toujours en cours.`,
                "Pas besoin d'un long texte: une petite update suffit pour garder le fil.",
            ],
            ctaLabel: "Revenir poster",
        },
        {
            subject: `XERA1 - On n'a pas oublie ${arcTitle}`,
            headline: "On n'a pas oublie ton projet.",
            bodyLines: [
                `Tu peux revenir sur "${arcTitle}" quand tu veux.`,
                "Une photo, deux lignes, un point rapide: tout compte.",
            ],
            ctaLabel: "Ouvrir mon update",
        },
        {
            subject: `XERA1 - Tu veux remettre ${arcTitle} en mouvement ?`,
            headline: "Tu peux remettre ton projet en mouvement aujourd'hui.",
            bodyLines: [
                `"${arcTitle}" merite sa petite mise a jour du jour.`,
                "Le plus dur, c'est souvent d'ouvrir l'app. On te facilite le retour.",
            ],
            ctaLabel: "Publier en un clic",
        },
        {
            subject: `XERA1 - Un petit signe de vie pour ${arcTitle} ?`,
            headline: "Un petit signe de vie suffit.",
            bodyLines: [
                `Si tu avances sur "${arcTitle}", viens nous montrer ca.`,
                "Meme une update courte garde ton elan visible.",
            ],
            ctaLabel: "Faire ma mise a jour",
        },
    ];
    const variant = pickDeterministicVariant(
        `daily:${user.id}:${slot.slotKey}`,
        variants,
    );
    const layout = buildReminderEmailLayout({
        eyebrow:
            slot.hour < 14 ? "Un petit rappel" : "Avant de finir la journee",
        greeting,
        headline: variant.headline,
        bodyLines: variant.bodyLines,
        ctaLabel: variant.ctaLabel,
        ctaUrl,
    });

    return {
        type: "daily_post",
        subject: variant.subject,
        html: layout.html,
        text: layout.text,
        slotKey: slot.slotKey,
        ctaUrl,
    };
}

function buildInactiveReengagementCampaign(user, context, now) {
    if (!Array.isArray(context.activeArcs) || context.activeArcs.length === 0) {
        return null;
    }
    const noRecentPost = !Number.isFinite(context.inactivityDays);
    if (
        (!noRecentPost && context.inactivityDays < 7) ||
        (noRecentPost && context.projectAgeDays < 7)
    ) {
        return null;
    }
    if (isSentRecently(user.last_inactive_reminder_sent_at, 7 * DAY_MS, now)) {
        return null;
    }

    const arcTitle =
        String(context.activeArcs[0]?.title || "").trim() || "ton projet";
    const ctaUrl = `${PRIMARY_ORIGIN.replace(/\/$/, "")}/index.html?dashboard=1`;
    const greeting = user.name ? `Salut ${user.name},` : "Salut,";

    const subject = "Ça bouge fort sur XERA1 🚀 (tu manques à l'appel)";
    const headline =
        "Ça fait une semaine que tu ne t'es pas connecté, et franchement, tu rates pas mal de choses.";
    const bodyLines = [
        "Pendant ces 7 jours, la communauté n'a pas chômé : certains ont scalé leurs projets à une vitesse folle, d'autres ont carrément impressionné des partenaires tech et de gros investisseurs.",
        "La tech et le business n'attendent pas. Ton projet est toujours là où tu l'as laissé, mais le marché, lui, avance.",
        "Reprends les commandes avant de prendre du retard :",
    ];
    const ctaLabel = "Retourner sur mon tableau de bord";

    const layout = buildReminderEmailLayout({
        eyebrow: "REPRENDS L'AVANTAGE",
        greeting,
        headline,
        bodyLines,
        ctaLabel,
        ctaUrl,
    });

    return {
        type: "inactive_week",
        subject,
        html: layout.html,
        text: layout.text,
        ctaUrl,
    };
}

function buildNoProjectCampaign(user, context, now) {
    if (
        !Number.isFinite(context.accountAgeDays) ||
        context.accountAgeDays < 1
    ) {
        return null;
    }
    if (
        isSentRecently(user.last_no_project_reminder_sent_at, 7 * DAY_MS, now)
    ) {
        return null;
    }

    const displayName = String(user.name || "").trim();
    const greeting = displayName ? `Salut ${displayName} 👋` : "Salut 👋";
    const ctaUrl = buildDiscoverReminderUrl();
    const layout = buildReminderEmailLayout({
        eyebrow: "Bienvenue sur XERA1",
        greeting,
        headline:
            "Ton histoire est peut-être encore en train d'attendre d'être racontée.",
        bodyLines: [
            "Tu as créé ton compte sur XERA1.",
            "Chaque jour, de nouveaux développeurs, designers, étudiants et entrepreneurs rejoignent XERA1 pour montrer ce qu'ils construisent réellement.",
            "Aujourd'hui, ton profil est peut-être vide... alors que toi, tu ne l'es probablement pas.",
            "Prends 5 minutes aujourd'hui :",
            "✅ Complète ton profil",
            "✅ Ajoute tes compétences",
            "✅ Présente ton projet actuel",
            "✅ Publie ton premier post",
            "Tu n'as pas besoin d'attendre que ton projet soit terminé. Les meilleurs builders documentent leur progression au fur et à mesure.",
            "Le badge Membre Pionnier Vérifié est réservé aux membres qui démontrent réellement leur travail : profil complété, activité authentique et au moins 5 publications documentant un vrai projet.",
            "Merci de faire partie des premiers builders qui construisent XERA1 avec nous. Chaque retour, chaque publication et chaque projet partagé contribue à construire une communauté où les réalisations comptent plus que les promesses.",
            "À bientôt,\nL'équipe XERA1",
        ],
        ctaLabel: "Retourner sur XERA1",
        ctaUrl,
        footer: "XERA1 inc • XERA1",
    });

    return {
        type: "no_project",
        subject: "XERA1 - Ton histoire attend d'être racontée",
        html: layout.html,
        text: layout.text,
        ctaUrl,
    };
}

function buildSocialProgressCampaign(user, context, now) {
    const noRecentPost = !Number.isFinite(context.inactivityDays);
    if (
        (!noRecentPost && context.inactivityDays < 2) ||
        (noRecentPost && context.projectAgeDays < 2)
    ) {
        return null;
    }
    if (!context.socialSignal) return null;
    if (isSentRecently(user.last_social_progress_email_sent_at, DAY_MS, now)) {
        return null;
    }

    const authorName =
        String(context.socialSignal.authorName || "").trim() ||
        "Quelqu'un que tu suis";
    const activityTitle =
        String(context.socialSignal.title || "").trim() ||
        "une nouvelle avancee";
    const activityCount = Math.max(1, Number(context.socialSignal.count || 1));
    const ctaUrl = buildDiscoverReminderUrl();
    const greeting = user.name ? `Bonjour ${user.name},` : "Bonjour,";
    const variants = [
        {
            subject: `XERA1 - ${authorName} a publie quelque chose de nouveau`,
            headline: "Ca bouge encore du cote des comptes que tu suis.",
            bodyLines: [
                `${authorName} a partage ${activityTitle}.`,
                "Si tu veux reprendre le rythme, c'est peut-etre le bon moment pour revenir.",
            ],
            ctaLabel: "Voir ce qu'il y a de neuf",
        },
        {
            subject:
                "XERA1 - Pendant ton absence, quelques updates sont tombees",
            headline: "Tu as peut-etre manque deux ou trois choses.",
            bodyLines: [
                `${activityCount} update${activityCount > 1 ? "s" : ""} recente${activityCount > 1 ? "s" : ""} viennent d'apparaitre chez les comptes que tu suis.`,
                "Reviens jeter un oeil, puis publier la tienne si tu en as envie.",
            ],
            ctaLabel: "Retourner dans l'app",
        },
        {
            subject: "XERA1 - Les autres avancent, et ta place est toujours la",
            headline: "Les autres avancent, et ta place est toujours la.",
            bodyLines: [
                `${authorName} et d'autres continuent a documenter leur progression.`,
                "Reviens voir ce qui se passe et poster la tienne quand tu veux.",
            ],
            ctaLabel: "Revenir sur XERA1",
        },
        {
            subject: "XERA1 - Il y a du nouveau dans ton reseau",
            headline: "Il y a du nouveau dans ton reseau.",
            bodyLines: [
                `${authorName} bouge, et tu n'es pas loin de reprendre toi aussi.`,
                "On te remet dans l'app en un clic.",
            ],
            ctaLabel: "Voir les nouvelles updates",
        },
    ];
    const variant = pickDeterministicVariant(
        `social:${user.id}:${context.dateKey}:${authorName}:${activityCount}`,
        variants,
    );
    const layout = buildReminderEmailLayout({
        eyebrow: "Pendant ce temps sur XERA1",
        greeting,
        headline: variant.headline,
        bodyLines: variant.bodyLines,
        ctaLabel: variant.ctaLabel,
        ctaUrl,
    });

    return {
        type: "social_progress",
        subject: variant.subject,
        html: layout.html,
        text: layout.text,
        ctaUrl,
    };
}

async function buildEmailReminderContexts(users = [], now = new Date()) {
    const userIds = Array.from(
        new Set((users || []).map((user) => user?.id).filter(Boolean)),
    );
    if (userIds.length === 0) return new Map();

    const recentOwnActivityIso = new Date(
        now.getTime() - 8 * DAY_MS,
    ).toISOString();
    const recentSocialActivityIso = new Date(
        now.getTime() - 3 * DAY_MS,
    ).toISOString();

    const [arcsResult, ownContentResult, followRowsResult] = await Promise.all([
        supabase
            .from("arcs")
            .select("id, user_id, title, status, created_at")
            .in("user_id", userIds)
            .eq("status", "in_progress"),
        supabase
            .from("content")
            .select("id, author_id, title, created_at, arc_id")
            .eq("author_type", "USER")
            .in("author_id", userIds)
            .gte("created_at", recentOwnActivityIso)
            .order("created_at", { ascending: false }),
        supabase
            .from("followers")
            .select("follower_id, following_id")
            .in("follower_id", userIds),
    ]);

    if (arcsResult.error) throw arcsResult.error;
    if (ownContentResult.error) throw ownContentResult.error;
    if (followRowsResult.error) throw followRowsResult.error;

    const activeArcsByUser = new Map();
    (arcsResult.data || []).forEach((arc) => {
        if (!activeArcsByUser.has(arc.user_id)) {
            activeArcsByUser.set(arc.user_id, []);
        }
        activeArcsByUser.get(arc.user_id).push(arc);
    });

    const latestOwnContentByUser = new Map();
    (ownContentResult.data || []).forEach((row) => {
        if (!latestOwnContentByUser.has(row.author_id)) {
            latestOwnContentByUser.set(row.author_id, row);
        }
    });

    const followingsByUser = new Map();
    (followRowsResult.data || []).forEach((row) => {
        if (!followingsByUser.has(row.follower_id)) {
            followingsByUser.set(row.follower_id, []);
        }
        followingsByUser.get(row.follower_id).push(row.following_id);
    });

    const followedUserIds = Array.from(
        new Set(
            (followRowsResult.data || [])
                .map((row) => row.following_id)
                .filter(Boolean),
        ),
    );

    let recentSocialRows = [];
    let followedUsers = [];
    if (followedUserIds.length > 0) {
        const [socialContentResult, followedUsersResult] = await Promise.all([
            supabase
                .from("content")
                .select("id, author_id, title, created_at, arc_id")
                .eq("author_type", "USER")
                .in("author_id", followedUserIds)
                .gte("created_at", recentSocialActivityIso)
                .order("created_at", { ascending: false }),
            supabase.from("users").select("id, name").in("id", followedUserIds),
        ]);

        if (socialContentResult.error) throw socialContentResult.error;
        if (followedUsersResult.error) throw followedUsersResult.error;
        recentSocialRows = socialContentResult.data || [];
        followedUsers = followedUsersResult.data || [];
    }

    const followedUsersById = new Map(
        followedUsers.map((row) => [row.id, row]),
    );
    const recentSocialByAuthor = new Map();
    recentSocialRows.forEach((row) => {
        if (!recentSocialByAuthor.has(row.author_id)) {
            recentSocialByAuthor.set(row.author_id, []);
        }
        recentSocialByAuthor.get(row.author_id).push(row);
    });

    const contexts = new Map();
    users.forEach((user) => {
        const timeZone = sanitizeTimeZone(
            user.email_reminder_timezone || "UTC",
        );
        const slot = resolveReminderSlot(now, timeZone);
        const dateKey = getTimePartsInZone(now, timeZone).dateKey;
        const activeArcs = activeArcsByUser.get(user.id) || [];
        const lastOwnContent = latestOwnContentByUser.get(user.id) || null;
        const oldestActiveArc =
            activeArcs
                .slice()
                .sort(
                    (left, right) =>
                        Date.parse(left.created_at || 0) -
                        Date.parse(right.created_at || 0),
                )[0] || null;
        const lastOwnDateKey = lastOwnContent?.created_at
            ? getTimePartsInZone(new Date(lastOwnContent.created_at), timeZone)
                  .dateKey
            : "";
        const hasPostedToday = Boolean(
            lastOwnDateKey && lastOwnDateKey === dateKey,
        );
        const inactivityDays = getDaysSince(lastOwnContent?.created_at, now);
        const accountAgeDays = getDaysSince(user.created_at, now);
        const projectAgeDays = oldestActiveArc?.created_at
            ? getDaysSince(oldestActiveArc.created_at, now)
            : 0;

        const followedIds = Array.from(
            new Set((followingsByUser.get(user.id) || []).filter(Boolean)),
        );
        const socialCandidates = followedIds
            .flatMap((followedId) => {
                const rows = recentSocialByAuthor.get(followedId) || [];
                return rows.slice(0, 1).map((row) => ({
                    ...row,
                    authorName:
                        followedUsersById.get(followedId)?.name ||
                        "Un createur",
                }));
            })
            .sort(
                (left, right) =>
                    Date.parse(right.created_at || 0) -
                    Date.parse(left.created_at || 0),
            );

        contexts.set(user.id, {
            timeZone,
            slot,
            dateKey,
            activeArcs,
            lastOwnContent,
            hasPostedToday,
            inactivityDays,
            accountAgeDays,
            projectAgeDays,
            socialSignal:
                socialCandidates.length > 0
                    ? {
                          count: socialCandidates.length,
                          authorName: socialCandidates[0].authorName,
                          title:
                              socialCandidates[0].title ||
                              "une nouvelle avancee",
                          createdAt: socialCandidates[0].created_at || null,
                      }
                    : null,
        });
    });

    return contexts;
}

function selectReminderCampaign(user, context, now = new Date()) {
    if (!user || !context) return null;
    return (
        (!context.activeArcs || context.activeArcs.length === 0
            ? buildNoProjectCampaign(user, context, now)
            : null) ||
        buildInactiveReengagementCampaign(user, context, now) ||
        buildSocialProgressCampaign(user, context, now) ||
        buildDailyPostReminderCampaign(user, context, context.slot)
    );
}

async function resolveReminderEmailAddress(userId) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) return "";

    try {
        const { data, error } =
            await supabase.auth.admin.getUserById(safeUserId);
        if (error) throw error;
        return String(data?.user?.email || "")
            .trim()
            .toLowerCase();
    } catch (error) {
        console.warn(
            "Unable to resolve reminder email address:",
            safeUserId,
            error?.message || error,
        );
        return "";
    }
}

async function sendReminderEmail(payload) {
    if (!supportsEmailReminders() && !payload?.transactional) {
        return { success: false, skipped: true };
    }
    if (!payload?.to || !payload?.subject) {
        return { success: false, skipped: true };
    }

    try {
        // S'assurer que fetch est disponible (polyfill pour Node < 18)
        const nodeFetch =
            typeof fetch !== "undefined" ? fetch : globalThis.fetch;
        if (typeof nodeFetch !== "function") {
            throw new Error(
                "La fonction 'fetch' n'est pas disponible dans cet environnement Node.js.",
            );
        }

        let response = null;

        if (REMINDER_EMAIL_PROVIDER === "resend") {
            const body = {
                from: REMINDER_EMAIL_FROM,
                to: [payload.to],
                subject: payload.subject,
                html: payload.html || "",
                text: payload.text || "",
            };
            if (REMINDER_EMAIL_REPLY_TO) {
                body.reply_to = REMINDER_EMAIL_REPLY_TO;
            }

            response = await nodeFetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${REMINDER_EMAIL_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
        } else if (REMINDER_EMAIL_PROVIDER === "webhook") {
            const headers = {
                "Content-Type": "application/json",
            };
            if (REMINDER_EMAIL_WEBHOOK_TOKEN) {
                headers.Authorization = `Bearer ${REMINDER_EMAIL_WEBHOOK_TOKEN}`;
            }

            response = await nodeFetch(REMINDER_EMAIL_WEBHOOK_URL, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    ...payload,
                    from: REMINDER_EMAIL_FROM || null,
                    replyTo: REMINDER_EMAIL_REPLY_TO || null,
                }),
            });
        } else {
            return { success: false, skipped: true };
        }

        if (!response?.ok) {
            const details = await response.text().catch(() => "");
            throw new Error(
                `Email provider error ${response?.status || "unknown"} ${details.slice(0, 280)}`.trim(),
            );
        }

        return { success: true };
    } catch (error) {
        console.warn("Reminder email send failed:", error?.message || error);
        return { success: false, error: error?.message || String(error) };
    }
}

async function sendSubscriptionConfirmationEmail({
    userId,
    plan,
    billingCycle,
    planEndsAt,
}) {
    const email = await resolveReminderEmailAddress(userId);
    if (!email) {
        return { success: false, skipped: true, reason: "email_missing" };
    }

    const planLabel = String(plan || "").toUpperCase();
    const cycleLabel =
        String(billingCycle || "monthly").toLowerCase() === "annual"
            ? "annuel"
            : "mensuel";
    const expiryLabel = planEndsAt
        ? new Date(planEndsAt).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
          })
        : "la fin de votre période";

    return sendReminderEmail({
        to: email,
        transactional: true,
        subject: "Votre vérification XERA1 est active",
        html: buildReminderEmailLayout({
            eyebrow: "Confirmation XERA1",
            greeting: "Bonjour,",
            headline: "Paiement confirmé, vérification activée",
            bodyLines: [
                `Votre paiement KPay a été confirmé par XERA1.`,
                `Le plan ${planLabel} (${cycleLabel}) est actif jusqu'au ${expiryLabel}.`,
                "Votre vérification et les fonctionnalités associées sont maintenant disponibles.",
            ],
            ctaLabel: "Ouvrir mon profil",
            ctaUrl: buildProfileReminderUrl(userId),
        }).html,
        text: `Votre paiement KPay a été confirmé. Le plan ${planLabel} (${cycleLabel}) et votre vérification sont actifs jusqu'au ${expiryLabel}.`,
    });
}

async function sweepReturnReminderEmails(now = new Date()) {
    if (!supportsEmailReminders()) return { ok: true, skipped: true };

    const { data: users, error } = await supabase
        .from("users")
        .select(
            "id, name, created_at, email_reminder_enabled, email_reminder_timezone, last_email_reminder_slot, last_inactive_reminder_sent_at, last_no_project_reminder_sent_at, last_social_progress_email_sent_at",
        )
        .eq("email_reminder_enabled", true);

    if (error) {
        if (isMissingColumnError(error)) {
            console.warn(
                "Email reminder columns missing in users. Run sql/email-reminders.sql to enable email reminders.",
            );
            return { ok: false, schemaMissing: true };
        }
        throw error;
    }

    if (!users || users.length === 0) return { ok: true, sentCount: 0 };

    const contextsByUserId = await buildEmailReminderContexts(users, now);
    let sentCount = 0;
    let errorCount = 0;

    for (const user of users) {
        if (!user?.id) continue;

        const context = contextsByUserId.get(user.id) || null;
        const campaign = selectReminderCampaign(user, context, now);
        if (!campaign) continue;

        const email = await resolveReminderEmailAddress(user.id);
        if (!email) continue;

        const payload = {
            to: email,
            subject: campaign.subject,
            html: campaign.html,
            text: campaign.text,
        };

        const result = await sendReminderEmail(payload);
        if (!result.success) {
            errorCount++;
            continue;
        }

        sentCount++;

        const updatePayload = {
            email_reminder_timezone: context?.timeZone || "UTC",
        };
        if (campaign.type === "daily_post" && campaign.slotKey) {
            updatePayload.last_email_reminder_slot = campaign.slotKey;
        }
        if (campaign.type === "inactive_week") {
            updatePayload.last_inactive_reminder_sent_at = now.toISOString();
        }
        if (campaign.type === "no_project") {
            updatePayload.last_no_project_reminder_sent_at = now.toISOString();
        }
        if (campaign.type === "social_progress") {
            updatePayload.last_social_progress_email_sent_at =
                now.toISOString();
        }

        await supabase.from("users").update(updatePayload).eq("id", user.id);
    }

    return { ok: true, sentCount, errorCount };
}

async function sweepReturnReminderPush(now = new Date()) {
    const { data: subs, error } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("reminder_enabled", true);

    if (error) {
        console.error("Push sweep fetch error:", error);
        return { ok: false, error };
    }

    let sentCount = 0;
    for (const sub of subs || []) {
        if (!sub.endpoint || !sub.user_id) continue;

        // On récupère le profil pour avoir le nom et les stats
        const { data: user } = await supabase
            .from("users")
            .select(
                "id, name, last_email_reminder_slot, last_inactive_reminder_sent_at, last_social_progress_email_sent_at",
            )
            .eq("id", sub.user_id)
            .single();

        if (!user) continue;

        const timeZone = sub.reminder_timezone || "UTC";
        const slot = resolveReminderSlot(now, timeZone);

        if (!slot) continue;

        // On réutilise la logique de campagne existante
        const context = await buildEmailReminderContexts([user], now).then(
            (m) => m.get(user.id),
        );
        const campaign = selectReminderCampaign(user, context, now);

        if (!campaign) continue;

        // Éviter les doublons si déjà envoyé via cet endpoint pour ce slot
        // On peut stocker un état simple dans metadata ou une table dédiée
        // Pour simplifier ici, on utilise last_email_reminder_slot comme référence partagée
        if (
            campaign.type === "daily_post" &&
            user.last_email_reminder_slot === campaign.slotKey
        ) {
            continue;
        }

        try {
            const pushPayload = JSON.stringify({
                title: campaign.subject.replace("XERA1 - ", "XERA1 • "),
                body: campaign.text
                    .split("\n")
                    .filter((l) => l.trim())
                    .slice(1, 3)
                    .join(" "),
                icon: "/icons/logo.png",
                link: campaign.ctaUrl || "/index.html",
                tag: `reminder-${campaign.type}-${user.id}`,
            });

            await webpush.sendNotification(
                {
                    endpoint: sub.endpoint,
                    keys: sub.keys,
                },
                pushPayload,
            );

            sentCount++;

            // Mettre à jour l'état utilisateur pour éviter les doublons
            if (campaign.slotKey) {
                await supabase
                    .from("users")
                    .update({ last_email_reminder_slot: campaign.slotKey })
                    .eq("id", user.id);
            }
        } catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) {
                // Subscription expirée ou invalide
                await supabase
                    .from("push_subscriptions")
                    .delete()
                    .eq("endpoint", sub.endpoint);
            }
            console.warn("Push send failed for", sub.user_id, err.message);
        }
    }

    return { ok: true, sentCount };
}

async function sendScheduledReturnReminders() {
    if (reminderSweepInFlight) return;
    reminderSweepInFlight = true;

    try {
        const now = new Date();
        await Promise.all([
            sweepReturnReminderEmails(now),
            sweepReturnReminderPush(now),
        ]);
    } catch (error) {
        console.error("Return reminder sweep error:", error);
    } finally {
        reminderSweepInFlight = false;
    }
}

function startReminderScheduler() {
    if (!supportsEmailReminders()) return;

    setInterval(() => {
        sendScheduledReturnReminders().catch((error) => {
            console.error("Reminder scheduler tick error:", error);
        });
    }, REMINDER_SWEEP_MS);

    sendScheduledReturnReminders().catch((error) => {
        console.error("Initial reminder sweep error:", error);
    });
}

// ==================== KPAY CHECKOUT ====================

async function handleKPaySubscriptionCheckout(req, res) {
    let returnPath = "/";
    try {
        const callbackConfig = getKPayCallbackConfig(req);

        const {
            plan,
            billing_cycle: billingCycleRaw,
            currency: currencyRaw,
            method = "card",
            provider,
            wallet_id: walletId,
            access_token: accessToken,
            user_id: fallbackUserId,
            return_path: rawReturnPath,
            discount_code: rawDiscountCode,
        } = req.body || {};
        const planId = String(plan || "").toLowerCase();
        const paymentMethod = String(method || "card").toLowerCase();
        const billingCycle =
            String(billingCycleRaw || "monthly").toLowerCase() === "annual"
                ? "annual"
                : "monthly";
        const currency = String(currencyRaw || "USD").toUpperCase();
        const allowedCurrencies = new Set(["USD", "CDF"]);

        if (!KPAY_PLANS[planId]) {
            return res.status(400).send("Plan invalide");
        }
        if (!["card", "mobile_money", "paypal"].includes(paymentMethod)) {
            return res.status(400).send("Moyen de paiement invalide");
        }
        if (!allowedCurrencies.has(currency)) {
            return res.status(400).send("Devise invalide");
        }

        const requestUser = await resolveRequestUser(
            accessToken,
            fallbackUserId,
        );
        const userId = requestUser.id;
        if (!userId) {
            return res.status(401).send("Utilisateur non authentifié");
        }
        await ensurePublicUserRecord(userId, {
            email: requestUser.email,
            username: requestUser.username,
            name: requestUser.name,
            avatarUrl: requestUser.avatarUrl,
            accountType: requestUser.accountType,
            accountSubtype: requestUser.accountSubtype,
            badge: requestUser.badge,
        });

        returnPath = sanitizeReturnPath(
            rawReturnPath,
            buildProfileReturnPath(userId),
        );

        const originalAmount = computeKPayAmount(
            planId,
            billingCycle,
            currency,
        );
        if (!originalAmount) {
            return res.status(400).send("Montant invalide");
        }

        const normalizedDiscountCode = normalizeDiscountCode(rawDiscountCode);
        let discount = null;
        let partnerDiscount = null;
        if (normalizedDiscountCode) {
            discount = await findActiveDiscountCode(normalizedDiscountCode);
            if (!discount)
                partnerDiscount = await findActivePartnerDiscountCode(
                    normalizedDiscountCode,
                );
            if (!discount && !partnerDiscount)
                return res.status(400).send("Code de réduction invalide");
            if (partnerDiscount && planId !== "pro")
                return res
                    .status(400)
                    .send(
                        "Ce code partenaire est valable uniquement pour l'abonnement Pro.",
                    );
            if (partnerDiscount) {
                const partnerValidation = validatePartnerAccess({
                    partner: partnerDiscount.partners,
                    now: new Date(),
                    accessCode: partnerDiscount.partners?.partner_access_code,
                });
                if (!partnerValidation.valid) {
                    return res
                        .status(400)
                        .send("Partenariat expiré ou code invalide");
                }
                const promoValidation = resolvePartnerPromoCode({
                    promo: {
                        ...partnerDiscount,
                        partner: partnerDiscount.partners,
                        code: partnerDiscount.code,
                        discount_percentage: partnerDiscount.discount_percent,
                        valid_until: partnerDiscount.expires_at,
                        applied_plan: "PRO",
                        is_active: partnerDiscount.status === "active",
                    },
                    requestedPlan: "PRO",
                    now: new Date(),
                });
                if (!promoValidation.valid) {
                    return res
                        .status(400)
                        .send(
                            promoValidation.reason ||
                                "Code promo partenaire invalide",
                        );
                }
            }
        }
        const discountPercent = Number(
            discount?.discount_percent ||
                partnerDiscount?.discount_percent ||
                0,
        );
        const discountedUsd = applyPartnerDiscount(
            computeKPayAmount(planId, billingCycle, "USD"),
            discountPercent,
        );
        // A partner discount code is a valid discount too: it must reduce the
        // checkout amount while retaining its attribution metadata.
        const amount =
            discount || partnerDiscount
                ? currency === "CDF"
                    ? Math.round(discountedUsd * USD_TO_CDF_RATE_VALUE)
                    : Math.ceil(discountedUsd)
                : originalAmount;

        if (amount === 0) {
            if (discountPercent < 100) {
                return res.status(400).send("Montant invalide");
            }
            const redeemedCode = await redeemDiscountCode(
                normalizedDiscountCode,
                userId,
            );
            if (!redeemedCode) {
                return res.status(400).send("Code de réduction invalide");
            }
            await activateSubscription({
                userId,
                plan: redeemedCode.plan,
                billingCycle,
                currency,
                amount: 0,
                confirmationSource: "discount_code",
                benefitExpiresAt: redeemedCode.benefit_expires_at,
            });
            const freeReturnUrl = new URL(returnPath, PRIMARY_ORIGIN);
            freeReturnUrl.searchParams.set("status", "success");
            freeReturnUrl.searchParams.set("plan", redeemedCode.plan);
            return res.redirect(302, freeReturnUrl.toString());
        }

        if (!KPAY_PUBLIC_KEY || !KPAY_SECRET_KEY) {
            return sendCheckoutErrorResponse(
                res,
                new Error("Clés KPay non configurées sur le serveur."),
                "Le service de paiement KPay n'est pas encore configuré sur Vercel. Les variables KPAY_PUBLIC_KEY et KPAY_SECRET_KEY doivent être définies dans l'environnement Vercel.",
                { returnPath },
            );
        }

        const pendingPayment = await createPendingSubscriptionPayment({
            userId,
            plan: planId,
            billingCycle,
            currency,
            amount,
            originalAmount,
            discountCode: discount?.code || partnerDiscount?.code || null,
            discountPercent,
            partnerId: partnerDiscount?.partner_id || null,
            partnerDiscountCodeId: partnerDiscount?.id || null,
            method: paymentMethod,
            provider,
            walletId,
            returnPath,
            callbackEnabled: callbackConfig.callbackEnabled,
            callbackOrigin: callbackConfig.callbackOrigin,
        });

        let callbackUrl = null;
        if (callbackConfig.callbackEnabled) {
            const statePayload = {
                i: pendingPayment.id,
                e: Date.now() + 2 * 60 * 60 * 1000,
            };
            const state = createSignedState(statePayload);
            if (!state) {
                return res.status(500).send("Callback secret manquant");
            }
            callbackUrl = `${callbackConfig.callbackOrigin}/api/kpay/callback/${encodeURIComponent(state)}`;
        }
        const paymentReturnUrl =
            callbackUrl || new URL(returnPath, PRIMARY_ORIGIN).toString();

        console.info("[KPay checkout]", {
            gatewayMode: String(KPAY_GATEWAY_MODE),
            publicKey: maskKey(KPAY_PUBLIC_KEY),
            secretKey: maskKey(KPAY_SECRET_KEY),
            publicKeyMode: inferKPayKeyMode(KPAY_PUBLIC_KEY),
            secretKeyMode: inferKPayKeyMode(KPAY_SECRET_KEY),
            callbackEnabled: callbackConfig.callbackEnabled,
            callbackOrigin: callbackConfig.callbackOrigin,
            pendingTransactionId: pendingPayment.id,
            checkoutRefId: pendingPayment.checkoutRefId,
            plan: planId,
            billingCycle,
            currency,
            method: String(method || "card").toLowerCase(),
        });

        // 1. Initialiser le paiement via KPay
        const kpayRes = await initiateKPayPayment(
            amount,
            pendingPayment.checkoutRefId,
            `Abonnement ${planId} (${billingCycle})`,
            paymentReturnUrl,
            paymentReturnUrl,
            currency,
            walletId || null,
            provider || null,
        );

        await storeKPayPaymentReference(pendingPayment, kpayRes);

        // Return JSON response with gateway URL for client-side handling
        // This allows the client to decide how to handle the payment flow
        const responseData = {
            success: true,
            status: kpayRes.status || "PENDING",
            reference: kpayRes.reference || pendingPayment.checkoutRefId,
            pendingTransactionId: pendingPayment.id,
            checkoutRefId: pendingPayment.checkoutRefId,
            plan: planId,
            billingCycle: billingCycle,
        };

        // Add gateway URL if present (for card/paypal payments)
        if (kpayRes.gatewayUrl) {
            responseData.gatewayUrl = kpayRes.gatewayUrl;
            responseData.mode = "REDIRECT";
            responseData.message =
                "Redirection vers KPay pour compléter le paiement.";
        } else {
            // For USSD/Mobile Money payments
            responseData.mode = kpayRes.mode || "USSD";
            responseData.message =
                "Demande de paiement envoyée par USSD sur votre téléphone. Veuillez valider avec votre code PIN.";
        }

        return res.json(responseData);
    } catch (error) {
        console.error("KPay checkout error:", error);
        return sendCheckoutErrorResponse(res, error, "Erreur KPay", {
            returnPath,
        });
    }
}

app.post(
    ["/api/kpay/checkout", "/api/checkout-subscription"],
    handleKPaySubscriptionCheckout,
);

async function handleKPaySupportCheckout(req, res) {
    const supportRequestId = crypto.randomUUID();
    let supportCheckoutStage = "validation";
    let returnPath = "/";
    try {
        if (!KPAY_PUBLIC_KEY || !KPAY_SECRET_KEY) {
            return sendCheckoutErrorResponse(
                res,
                new Error("Clés KPay non configurées sur le serveur."),
                "Le service de paiement KPay n'est pas encore configuré sur Vercel. Les variables KPAY_PUBLIC_KEY et KPAY_SECRET_KEY doivent être définies dans l'environnement Vercel.",
                { returnPath: "/" },
            );
        }

        const callbackConfig = getKPayCallbackConfig(req);

        const {
            to_user_id: toUserId,
            amount_usd: rawAmountUsd,
            currency: currencyRaw,
            method = "card",
            provider,
            wallet_id: walletId,
            access_token: accessToken,
            user_id: fallbackUserId,
            description: rawDescription,
            support_message: supportMessageRaw,
            donation_message: donationMessageRaw,
            message: legacyMessageRaw,
            return_path: rawReturnPath,
        } = req.body || {};
        const paymentMethod = String(method || "card").toLowerCase();
        if (!["card", "mobile_money", "paypal"].includes(paymentMethod)) {
            return res.status(400).send("Moyen de paiement invalide");
        }

        const normalizedToUserId = String(toUserId || "").trim();
        if (!normalizedToUserId || !isUuidString(normalizedToUserId)) {
            return res.status(400).send("Identifiant du créateur invalide.");
        }

        const requestUser = await resolveRequestUser(
            accessToken,
            fallbackUserId,
        );
        const fromUserId = requestUser.id;
        if (!fromUserId || !isUuidString(fromUserId)) {
            return res
                .status(401)
                .send("Utilisateur non authentifié ou session invalide.");
        }
        await ensurePublicUserRecord(fromUserId, {
            email: requestUser.email,
            username: requestUser.username,
            name: requestUser.name,
            avatarUrl: requestUser.avatarUrl,
            accountType: requestUser.accountType,
            accountSubtype: requestUser.accountSubtype,
            badge: requestUser.badge,
        });

        if (fromUserId === normalizedToUserId) {
            return res.status(400).send("Auto-soutien interdit");
        }

        const amountUsd = roundMoney(rawAmountUsd);
        if (
            !Number.isFinite(amountUsd) ||
            amountUsd < SUPPORT_MIN_USD ||
            amountUsd > SUPPORT_MAX_USD
        ) {
            return res
                .status(400)
                .send(
                    `Le soutien doit etre entre ${SUPPORT_MIN_USD} et ${SUPPORT_MAX_USD} USD`,
                );
        }
        if (!Number.isInteger(amountUsd)) {
            return res
                .status(400)
                .send("Le soutien doit etre un montant entier en USD.");
        }

        const currency = String(currencyRaw || "USD").toUpperCase();
        if (!["USD", "CDF"].includes(currency)) {
            return res.status(400).send("Devise invalide");
        }

        const [senderResult, recipientResult] = await Promise.all([
            supabase
                .from("users")
                .select("id, name")
                .eq("id", fromUserId)
                .maybeSingle(),
            supabase
                .from("users")
                .select(
                    "id, name, followers_count, plan, plan_status, plan_ends_at, is_monetized",
                )
                .eq("id", normalizedToUserId)
                .maybeSingle(),
        ]);
        if (senderResult.error) throw senderResult.error;
        if (recipientResult.error) throw recipientResult.error;

        const senderProfile = senderResult.data || null;
        const recipientProfile = recipientResult.data || null;
        if (!senderProfile) {
            return res
                .status(400)
                .send(
                    "Profil expediteur introuvable. Rechargez votre session.",
                );
        }
        if (!recipientProfile) {
            return res.status(404).send("Createur introuvable");
        }
        if (!canUserReceiveSupport(recipientProfile)) {
            return res
                .status(400)
                .send("Ce createur n'est pas eligible aux soutiens.");
        }

        const checkoutAmount = computeSupportCheckoutAmount(
            amountUsd,
            currency,
        );
        if (!checkoutAmount) {
            return res.status(400).send("Montant invalide");
        }

        const description = sanitizePayoutText(rawDescription, 160);
        const supportMessage = sanitizeSupportMessage(
            supportMessageRaw ?? donationMessageRaw ?? legacyMessageRaw,
            200,
        );
        returnPath = sanitizeReturnPath(
            rawReturnPath,
            buildProfileReturnPath(toUserId),
        );
        supportCheckoutStage = "pending_transaction";
        const pendingPayment = await createPendingSupportPayment({
            fromUserId,
            toUserId,
            amountUsd,
            checkoutAmount,
            checkoutCurrency: currency,
            method: paymentMethod,
            provider,
            walletId,
            description:
                description ||
                `Soutien pour ${recipientProfile.name || "un createur"}`,
            senderName: senderProfile.name || "Utilisateur",
            recipientName: recipientProfile.name || "Createur",
            supportMessage,
            returnPath,
            callbackEnabled: callbackConfig.callbackEnabled,
            callbackOrigin: callbackConfig.callbackOrigin,
        });

        let callbackUrl = null;
        if (callbackConfig.callbackEnabled) {
            const statePayload = {
                i: pendingPayment.id,
                e: Date.now() + 2 * 60 * 60 * 1000,
            };
            const state = createSignedState(statePayload);
            if (!state) {
                return res.status(500).send("Callback secret manquant");
            }
            callbackUrl = `${callbackConfig.callbackOrigin}/api/kpay/callback/${encodeURIComponent(state)}`;
        }
        const paymentReturnUrl =
            callbackUrl || new URL(returnPath, PRIMARY_ORIGIN).toString();

        console.info("[KPay support checkout]", {
            gatewayMode: String(KPAY_GATEWAY_MODE),
            publicKey: maskKey(KPAY_PUBLIC_KEY),
            secretKey: maskKey(KPAY_SECRET_KEY),
            callbackEnabled: callbackConfig.callbackEnabled,
            callbackOrigin: callbackConfig.callbackOrigin,
            pendingTransactionId: pendingPayment.id,
            checkoutRefId: pendingPayment.checkoutRefId,
            fromUserId,
            toUserId,
            amountUsd,
            checkoutAmount,
            currency,
            method: String(method || "card").toLowerCase(),
        });

        // 1. Initialiser le paiement via KPay
        supportCheckoutStage = "kpay_initialization";
        const kpayRes = await initiateKPayPayment(
            checkoutAmount,
            pendingPayment.checkoutRefId,
            description ||
                `Soutien pour ${recipientProfile.name || "un createur"}`,
            paymentReturnUrl,
            paymentReturnUrl,
            currency,
            walletId || null,
            provider || null,
        );

        supportCheckoutStage = "payment_reference";
        await storeKPayPaymentReference(pendingPayment, kpayRes);

        // Return JSON response with gateway URL for client-side handling
        // This allows the client to decide how to handle the payment flow
        // (new tab, iframe, or redirect) while maintaining better error handling
        const responseData = {
            success: true,
            status: kpayRes.status || "PENDING",
            reference: kpayRes.reference || pendingPayment.checkoutRefId,
            pendingTransactionId: pendingPayment.id,
            checkoutRefId: pendingPayment.checkoutRefId,
        };

        // Add gateway URL if present (for card/paypal payments)
        if (kpayRes.gatewayUrl) {
            responseData.gatewayUrl = kpayRes.gatewayUrl;
            responseData.mode = "REDIRECT";
            responseData.message =
                "Redirection vers KPay pour compléter le paiement.";
        } else {
            // For USSD/Mobile Money payments
            responseData.mode = kpayRes.mode || "USSD";
            responseData.message =
                "Demande de soutien envoyée par USSD sur votre téléphone. Veuillez valider avec votre code PIN.";
        }

        return res.json(responseData);
    } catch (error) {
        return sendCheckoutErrorResponse(
            res,
            error,
            "Impossible d'initialiser le soutien.",
            {
                requestId: supportRequestId,
                stage: supportCheckoutStage,
            },
        );
    }
}

app.post(
    ["/api/kpay/support-checkout", "/api/checkout-support"],
    handleKPaySupportCheckout,
);

async function handleKPayCallback(req, res) {
    try {
        const params = { ...req.query, ...req.body };
        const description = params.description || "";
        const transactionRefId =
            params.transactionRefId || params.transaction_ref_id;
        const operatorRefId = params.operatorRefId || params.operator_ref_id;
        const state = params.state || req.params?.state;

        const payload = verifySignedState(state);
        if (!payload) {
            return res.status(400).send("Callback invalide");
        }
        if (!verifyKPayGatewayReturn(params)) {
            return res.status(400).send("Signature de retour KPay invalide");
        }

        const pendingTransactionId = String(
            payload.i || payload.pending_transaction_id || "",
        ).trim();
        if (!pendingTransactionId) {
            return res.status(400).send("Transaction callback manquante");
        }

        const { data: callbackTransaction, error: callbackTransactionError } =
            await supabase
                .from("transactions")
                .select(
                    "id, from_user_id, to_user_id, type, amount_gross, currency, status, description, metadata",
                )
                .eq("id", pendingTransactionId)
                .maybeSingle();
        if (callbackTransactionError) throw callbackTransactionError;
        if (!callbackTransaction) {
            return res.status(404).send("Transaction callback introuvable");
        }

        const callbackMetadata =
            callbackTransaction.metadata &&
            typeof callbackTransaction.metadata === "object"
                ? callbackTransaction.metadata
                : {};
        const expectedExternalId = String(
            callbackMetadata.checkout_ref_id || "",
        );
        const returnedExternalId = String(
            params.externalId || params.external_id || "",
        );
        if (!expectedExternalId || returnedExternalId !== expectedExternalId) {
            return res.status(400).send("Référence KPay non concordante");
        }

        const kpayPaymentId = callbackMetadata.kpay_payment_id;
        if (!kpayPaymentId) {
            return res
                .status(409)
                .send(
                    "Paiement KPay en attente de vérification. Contactez le support si nécessaire.",
                );
        }
        const kpayPayment = await fetchKPayPaymentStatus(kpayPaymentId);
        const kpayStatus = String(kpayPayment?.status || "").toUpperCase();
        const expectedAmount = Number(
            callbackMetadata.checkout_amount ??
                callbackTransaction.amount_gross,
        );
        if (
            String(kpayPayment?.externalId || "") !== expectedExternalId ||
            !Number.isFinite(Number(kpayPayment?.amount)) ||
            Number(kpayPayment.amount) !== expectedAmount
        ) {
            return res
                .status(400)
                .send("Montant ou référence KPay non concordant");
        }
        const paymentKind = String(
            payload.k ||
                payload.payment_kind ||
                callbackTransaction.type ||
                "subscription",
        ).toLowerCase();
        const isSuccess = kpayStatus === "COMPLETED";
        const isTerminalFailure = ["FAILED", "CANCELLED"].includes(kpayStatus);

        if (isSuccess) {
            if (paymentKind === "support") {
                await confirmSupportPayment({
                    fromUserId: callbackTransaction.from_user_id,
                    toUserId: callbackTransaction.to_user_id,
                    amountUsd:
                        callbackMetadata.support_amount_usd ??
                        callbackTransaction.amount_gross,
                    checkoutCurrency:
                        callbackMetadata.checkout_currency ||
                        callbackTransaction.currency,
                    checkoutAmount:
                        callbackMetadata.checkout_amount ||
                        callbackTransaction.amount_gross,
                    method: callbackMetadata.method,
                    provider: callbackMetadata.provider,
                    walletId: callbackMetadata.wallet_id,
                    description: callbackTransaction.description,
                    pendingTransactionId: callbackTransaction.id,
                    transactionRefId,
                    operatorRefId,
                    confirmationSource: "kpay_callback",
                });
            } else {
                const activationResult = await activateSubscription({
                    userId:
                        callbackTransaction.to_user_id ||
                        callbackTransaction.from_user_id,
                    plan: callbackMetadata.plan,
                    billingCycle: callbackMetadata.billing_cycle,
                    currency:
                        callbackTransaction.currency ||
                        callbackMetadata.currency,
                    amount: callbackTransaction.amount_gross,
                    transactionRefId,
                    operatorRefId,
                    method: callbackMetadata.method,
                    provider: callbackMetadata.provider,
                    walletId: callbackMetadata.wallet_id,
                    pendingTransactionId: callbackTransaction.id,
                    confirmationSource: "kpay_callback",
                });

                if (!activationResult?.alreadyActivated) {
                    const activatedUserId =
                        callbackTransaction.to_user_id ||
                        callbackTransaction.from_user_id;
                    const emailResult = await sendSubscriptionConfirmationEmail(
                        {
                            userId: activatedUserId,
                            plan: callbackMetadata.plan,
                            billingCycle: callbackMetadata.billing_cycle,
                            planEndsAt: activationResult?.user?.plan_ends_at,
                        },
                    );
                    if (!emailResult.success && !emailResult.skipped) {
                        console.warn(
                            "Subscription confirmation email failed:",
                            emailResult.error,
                        );
                    }
                }
            }
        } else if (isTerminalFailure) {
            await failPendingTransaction({
                pendingTransactionId: callbackTransaction.id,
                transactionRefId,
                operatorRefId,
                reason:
                    description || `Paiement KPay ${kpayStatus.toLowerCase()}`,
                confirmationSource: "kpay_callback",
            });
        }

        const successTitle =
            paymentKind === "support"
                ? "Soutien confirmé"
                : "Paiement confirmé";
        const successDescription =
            paymentKind === "support"
                ? "Le soutien a bien ete confirme et sera visible dans le dashboard du createur."
                : "Votre abonnement est activé.";
        const failureDescription =
            paymentKind === "support"
                ? "Le soutien n'a pas ete confirme. Veuillez reessayer ou changer de moyen de paiement."
                : "Veuillez réessayer ou changer de moyen de paiement.";
        const returnPath =
            paymentKind === "support"
                ? String(callbackMetadata.callback_return_path || "/").trim() ||
                  "/"
                : String(
                      callbackMetadata.callback_return_path ||
                          buildProfileReturnPath(
                              callbackTransaction.to_user_id ||
                                  callbackTransaction.from_user_id,
                          ),
                  ).trim() || "/";
        let normalizedReturnPath = "/";
        try {
            normalizedReturnPath = normalizeReturnPathForBrowser(
                returnPath,
                "/",
                PRIMARY_ORIGIN,
            );
        } catch (normErr) {
            normalizedReturnPath = "/";
        }
        const returnHref = String(normalizedReturnPath || "").startsWith("http")
            ? String(normalizedReturnPath)
            : `${PRIMARY_ORIGIN}/${String(normalizedReturnPath || "/").replace(/^\//, "")}`;
        const returnLabel =
            paymentKind === "support"
                ? "Retour a la page precedente"
                : "Retour au profil";
        const pendingDescription =
            "Votre paiement est encore en cours de confirmation par KPay. Aucun avantage n'est activé tant que le statut n'est pas COMPLETED.";
        const displayTitle = isSuccess
            ? successTitle
            : isTerminalFailure
              ? "Paiement non confirmé"
              : "Paiement en cours";
        const displayDescription = isSuccess
            ? description || successDescription
            : isTerminalFailure
              ? description || failureDescription
              : pendingDescription;
        const autoRedirectDelayMs = isSuccess ? 1400 : 2200;

        setResponseHeader(res, "Content-Type", "text/html");
        res.send(`
      <!doctype html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Paiement ${isSuccess ? "réussi" : "échoué"}</title>
        <style>
          body { font-family: Arial, sans-serif; background: #0b0b0b; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .card { max-width: 480px; padding: 32px; border-radius: 18px; background: #141414; border: 1px solid #2a2a2a; text-align: center; }
          .status { font-size: 22px; margin-bottom: 12px; }
          .desc { color: #9ca3af; margin-bottom: 20px; }
          a { color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 999px; border: 1px solid #2a2a2a; display: inline-block; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="status">${displayTitle}</div>
          <div class="desc">${displayDescription}</div>
          <a href="${escapeHtmlAttr(returnHref)}">${returnLabel}</a>
        </div>
        <script>
          setTimeout(function () {
            window.location.replace(${JSON.stringify(returnHref)});
          }, ${autoRedirectDelayMs});
        </script>
      </body>
      </html>
    `);
    } catch (error) {
        console.error("KPay callback error:", error);
        res.status(500).send("Erreur callback");
    }
}

app.all("/api/kpay/callback/:state?", handleKPayCallback);

// ==================== ADMIN: BROADCAST EMAIL ====================

app.post("/api/admin/broadcast-email", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const { subject, body, ctaLabel, ctaUrl } = req.body || {};
        if (!subject || !body) {
            return res
                .status(400)
                .json({ error: "Sujet ou contenu manquant." });
        }
        const emailDeliveryIssue = getEmailDeliveryIssue();
        if (emailDeliveryIssue) {
            return res.status(503).json({
                error: `Envoi email non configure. ${emailDeliveryIssue}`,
                provider: REMINDER_EMAIL_PROVIDER || null,
            });
        }

        const layout = buildReminderEmailLayout({
            eyebrow: "Annonce XERA1",
            greeting: "Bonjour,",
            headline: subject,
            bodyLines: body.split("\n"),
            ctaLabel: ctaLabel || "Ouvrir XERA1",
            ctaUrl: ctaUrl || buildDiscoverReminderUrl(),
        });

        let sentCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        let attemptedCount = 0;
        let page = 1;
        const perPage = 100;
        let lastErrorMessage = "";

        while (true) {
            const { data, error } = await supabase.auth.admin.listUsers({
                page,
                perPage,
            });

            if (error) throw error;

            const users = data.users || [];
            if (users.length === 0) {
                break;
            }

            // To avoid timeouts on serverless (Vercel), we process users in chunks
            // and we use parallel sending for each chunk.
            const userChunks = [];
            const chunkSize = 10;
            for (let i = 0; i < users.length; i += chunkSize) {
                userChunks.push(users.slice(i, i + chunkSize));
            }

            for (const chunk of userChunks) {
                const results = await Promise.all(
                    chunk.map(async (user) => {
                        if (!user.email) {
                            return { skipped: true };
                        }
                        const payload = {
                            to: user.email,
                            subject: `XERA1 - ${subject}`,
                            html: layout.html,
                            text: layout.text,
                        };
                        return {
                            ...(await sendReminderEmail(payload)),
                            userId: user.id,
                        };
                    }),
                );

                for (const result of results) {
                    if (result.skipped) {
                        skippedCount++;
                        continue;
                    }
                    attemptedCount++;
                    if (result.success) {
                        sentCount++;
                    } else {
                        failedCount++;
                        if (!lastErrorMessage) {
                            lastErrorMessage = String(
                                result?.error?.message || result?.error || "",
                            ).trim();
                        }
                    }
                }
            }

            if (users.length < perPage) {
                break;
            }
            page += 1;
        }

        if (attemptedCount === 0) {
            return res.status(404).json({
                error: "Aucun utilisateur avec email n'a ete trouve.",
                attemptedCount,
                sentCount,
                failedCount,
                skippedCount,
            });
        }

        if (sentCount === 0 && failedCount > 0) {
            return res.status(502).json({
                error:
                    lastErrorMessage ||
                    "Aucun email n'a pu etre envoye par le fournisseur.",
                attemptedCount,
                sentCount,
                failedCount,
                skippedCount,
                provider: REMINDER_EMAIL_PROVIDER,
            });
        }

        return res.json({
            success: failedCount === 0,
            attemptedCount,
            sentCount,
            failedCount,
            skippedCount,
            provider: REMINDER_EMAIL_PROVIDER,
        });
    } catch (error) {
        console.error("Admin broadcast email error:", error);
        return res.status(500).json({ error: "Erreur serveur." });
    }
});

// ==================== ADMIN: OFFER PLAN ====================

app.post("/api/admin/gift-plan", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const { target_user_id: targetUserId, plan } = req.body || {};
        const normalizedPlan = String(plan || "").toLowerCase();
        if (!targetUserId) {
            return res
                .status(400)
                .json({ error: "Utilisateur cible manquant." });
        }
        if (!["standard", "medium", "pro", "elite"].includes(normalizedPlan)) {
            return res.status(400).json({ error: "Plan invalide." });
        }

        const { data: profile, error: profileError } = await supabase
            .from("users")
            .select("badge")
            .eq("id", targetUserId)
            .maybeSingle();

        if (profileError) {
            return res.status(500).json({
                error:
                    profileError.message || "Impossible de charger le profil.",
            });
        }
        if (!profile) {
            return res.status(404).json({ error: "Utilisateur introuvable." });
        }

        const badgeForPlan =
            normalizedPlan === "pro" ? "verified_gold" : "verified";
        const existingBadge = String(profile.badge || "").toLowerCase();
        const badgeToApply =
            normalizedPlan !== "pro" && PROTECTED_BADGES.has(existingBadge)
                ? profile.badge
                : badgeForPlan;
        const isMonetized = ["medium", "pro", "elite"].includes(normalizedPlan);

        // Calculer les fonctionnalités premium selon le plan
        const premiumFeatures = computePremiumFeatures(normalizedPlan);

        const { data: updated, error: updateError } = await supabase
            .from("users")
            .update({
                plan: normalizedPlan,
                plan_status: "active",
                plan_ends_at: null,
                badge: badgeToApply,
                is_monetized: isMonetized,
                updated_at: new Date().toISOString(),
                ...premiumFeatures,
            })
            .eq("id", targetUserId)
            .select()
            .single();

        if (updateError) {
            return res.status(500).json({
                error: updateError.message || "Mise à jour impossible.",
            });
        }

        invalidateUserAppCaches(targetUserId);

        return res.json({ success: true, user: updated });
    } catch (error) {
        console.error("Admin gift plan error:", error);
        return res.status(500).json({ error: "Erreur serveur." });
    }
});

app.get("/api/admin/subscription-payments", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const requestedStatuses = String(req.query.status || "pending")
            .split(",")
            .map((value) =>
                String(value || "")
                    .trim()
                    .toLowerCase(),
            )
            .filter(Boolean);
        const allowedStatuses = new Set([
            "pending",
            "succeeded",
            "failed",
            "canceled",
            "refunded",
        ]);
        const statuses = requestedStatuses.filter((value) =>
            allowedStatuses.has(value),
        );
        const limit = Math.min(
            100,
            Math.max(1, parseInt(req.query.limit, 10) || 30),
        );

        let query = supabase
            .from("transactions")
            .select(
                "id, from_user_id, to_user_id, amount_gross, currency, status, description, metadata, created_at, updated_at",
            )
            .eq("type", "subscription")
            .eq("metadata->>payment_provider", "kpay")
            .order("created_at", { ascending: false })
            .limit(limit);

        if (statuses.length === 1) {
            query = query.eq("status", statuses[0]);
        } else if (statuses.length > 1) {
            query = query.in("status", statuses);
        }

        const { data: rows, error } = await query;
        if (error) throw error;

        const payments = rows || [];
        const userIds = Array.from(
            new Set(
                payments
                    .map((row) => row.to_user_id || row.from_user_id)
                    .filter(Boolean),
            ),
        );

        let usersById = new Map();
        if (userIds.length > 0) {
            const { data: userRows, error: userError } = await supabase
                .from("users")
                .select(
                    "id, name, avatar, badge, followers_count, plan, plan_status, plan_ends_at, is_monetized",
                )
                .in("id", userIds);
            if (userError) throw userError;
            usersById = new Map((userRows || []).map((row) => [row.id, row]));
        }

        return res.json({
            success: true,
            payments: payments.map((row) => {
                const details = extractSubscriptionPaymentDetails(row);
                return {
                    ...details,
                    user: usersById.get(details.userId) || null,
                };
            }),
        });
    } catch (error) {
        console.error("Admin subscription payments list error:", error);
        return res.status(500).json({ error: "Erreur serveur." });
    }
});

app.post("/api/promo/validate", async (req, res) => {
    try {
        const { code, plan } = req.body || {};
        if (!code) {
            return res.status(400).json({ valid: false, error: "Code requis" });
        }
        const normalized = normalizeDiscountCode(code);
        const discount = await findActiveDiscountCode(normalized);
        let partnerDiscount = null;
        if (!discount) {
            partnerDiscount = await findActivePartnerDiscountCode(normalized);
        }
        if (!discount && !partnerDiscount) {
            return res
                .status(404)
                .json({ valid: false, error: "Code invalide ou expiré" });
        }
        if (partnerDiscount && plan && String(plan).toLowerCase() !== "pro") {
            return res.status(400).json({
                valid: false,
                error: "Ce code partenaire est valable uniquement pour l'abonnement Pro.",
            });
        }

        const activeDiscount = discount || partnerDiscount;
        const discountPercent = Number(activeDiscount.discount_percent || 0);

        return res.json({
            valid: true,
            code: activeDiscount.code,
            discount_percent: discountPercent,
            type: discount ? "standard" : "partner",
            plan: activeDiscount.plan || (partnerDiscount ? "pro" : null),
        });
    } catch (err) {
        console.error("Promo validation error:", err);
        return res
            .status(500)
            .json({ valid: false, error: "Erreur de validation" });
    }
});

app.get("/api/admin/discount-codes", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error)
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        const { data, error } = await supabase
            .from("subscription_discount_codes")
            .select(
                "id, code, plan, discount_percent, valid_from, valid_until, benefit_duration_days, max_uses, uses_count, active, created_at",
            )
            .order("created_at", { ascending: false });
        if (error) throw error;
        return res.json({ success: true, codes: data || [] });
    } catch (error) {
        console.error("Admin discount codes list error:", error);
        return res.status(500).json({
            error: error?.message || "Impossible de charger les codes.",
        });
    }
});

app.post("/api/admin/discount-codes", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error)
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        const code = normalizeDiscountCode(req.body?.code);
        const plan = String(req.body?.plan || "").toLowerCase();
        const discountPercent = Number(req.body?.discount_percent);
        const benefitDurationDays = Number(req.body?.benefit_duration_days);
        const maxUses = req.body?.max_uses ? Number(req.body.max_uses) : null;
        const validFrom = new Date(req.body?.valid_from || Date.now());
        const validUntil = req.body?.valid_until
            ? new Date(req.body.valid_until)
            : null;
        if (!/^[A-Z0-9_-]{3,40}$/.test(code))
            return res
                .status(400)
                .json({ error: "Code invalide (3 à 40 caractères)." });
        if (
            !Number.isInteger(discountPercent) ||
            discountPercent < 10 ||
            discountPercent > 100
        )
            return res.status(400).json({
                error: "La réduction doit être comprise entre 10 et 100 %.",
            });
        if (!isValidPlanId(plan))
            return res.status(400).json({ error: "Plan offert invalide." });
        if (!Number.isInteger(benefitDurationDays) || benefitDurationDays < 1)
            return res.status(400).json({
                error: "La durée des avantages doit être d'au moins 1 jour.",
            });
        if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1))
            return res
                .status(400)
                .json({ error: "La limite d'utilisation est invalide." });
        if (
            Number.isNaN(validFrom.getTime()) ||
            (validUntil && Number.isNaN(validUntil.getTime())) ||
            (validUntil && validUntil < validFrom)
        )
            return res
                .status(400)
                .json({ error: "Période de validité invalide." });
        const { data, error } = await supabase
            .from("subscription_discount_codes")
            .insert({
                code,
                plan,
                discount_percent: discountPercent,
                valid_from: validFrom.toISOString(),
                valid_until: validUntil?.toISOString() || null,
                benefit_duration_days: benefitDurationDays,
                max_uses: maxUses,
                created_by: authResult.user.id,
            })
            .select(
                "id, code, plan, discount_percent, valid_from, valid_until, benefit_duration_days, max_uses, uses_count, active, created_at",
            )
            .single();
        if (error) throw error;
        return res.status(201).json({ success: true, code: data });
    } catch (error) {
        console.error("Admin discount code create error:", {
            code: error?.code,
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
        });
        if (["42P01", "PGRST205", "42883"].includes(error?.code)) {
            return res.status(503).json({
                error: "Le schéma des codes de réduction n'est pas installé. Exécutez sql/20260830_subscription_discount_codes.sql dans Supabase, puis réessayez.",
            });
        }
        return res.status(500).json({
            error:
                error?.code === "23505"
                    ? "Ce code existe déjà."
                    : error?.message || "Impossible de créer le code.",
            diagnostic: {
                code: error?.code || null,
                details: error?.details || null,
                hint: error?.hint || null,
            },
        });
    }
});

app.patch("/api/admin/discount-codes/:id", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error)
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        const plan = String(req.body?.plan || "").toLowerCase();
        const discountPercent = Number(req.body?.discount_percent ?? 100);
        const benefitDurationDays = Number(req.body?.benefit_duration_days);
        const maxUses = req.body?.max_uses ? Number(req.body.max_uses) : null;
        const validFrom = new Date(req.body?.valid_from || Date.now());
        const validUntil = req.body?.valid_until
            ? new Date(req.body.valid_until)
            : null;
        if (
            !isValidPlanId(plan) ||
            discountPercent !== 100 ||
            !Number.isInteger(benefitDurationDays) ||
            benefitDurationDays < 1 ||
            (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) ||
            Number.isNaN(validFrom.getTime()) ||
            (validUntil && Number.isNaN(validUntil.getTime())) ||
            (validUntil && validUntil < validFrom)
        ) {
            return res
                .status(400)
                .json({ error: "Paramètres du code invalides." });
        }
        const { data, error } = await supabase
            .from("subscription_discount_codes")
            .update({
                plan,
                discount_percent: 100,
                benefit_duration_days: benefitDurationDays,
                max_uses: maxUses,
                valid_from: validFrom.toISOString(),
                valid_until: validUntil?.toISOString() || null,
                updated_at: new Date().toISOString(),
            })
            .eq("id", req.params.id)
            .select(
                "id, code, plan, discount_percent, valid_from, valid_until, benefit_duration_days, max_uses, uses_count, active, created_at",
            )
            .single();
        if (error) throw error;
        return res.json({ success: true, code: data });
    } catch (error) {
        console.error("Admin discount code update error:", error);
        return res.status(500).json({
            error: error?.message || "Impossible de modifier le code.",
        });
    }
});

app.delete("/api/admin/discount-codes/:id", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error)
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        const { error } = await supabase
            .from("subscription_discount_codes")
            .update({ active: false, updated_at: new Date().toISOString() })
            .eq("id", req.params.id);
        if (error) throw error;
        return res.json({ success: true });
    } catch (error) {
        console.error("Admin discount code deactivate error:", error);
        return res.status(500).json({
            error: error?.message || "Impossible de désactiver le code.",
        });
    }
});

app.post("/api/admin/subscription-payments/confirm", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }
        return res.status(410).json({
            error: "La validation manuelle est désactivée. Les abonnements sont activés automatiquement après confirmation KPay.",
        });

        const {
            payment_id: paymentId,
            transaction_ref_id: transactionRefId,
            operator_ref_id: operatorRefId,
            note,
        } = req.body || {};
        if (!paymentId) {
            return res.status(400).json({ error: "Paiement manquant." });
        }

        const { data: paymentRow, error: paymentError } = await supabase
            .from("transactions")
            .select(
                "id, from_user_id, to_user_id, amount_gross, currency, status, metadata, created_at, updated_at",
            )
            .eq("id", paymentId)
            .eq("type", "subscription")
            .eq("metadata->>payment_provider", "kpay")
            .maybeSingle();
        if (paymentError) throw paymentError;
        if (!paymentRow) {
            return res.status(404).json({ error: "Paiement introuvable." });
        }

        const payment = extractSubscriptionPaymentDetails(paymentRow);
        if (payment.status !== "pending") {
            return res.status(409).json({
                error: "Ce paiement n'est plus en attente de confirmation.",
            });
        }
        if (!payment.userId || !isValidPlanId(payment.plan)) {
            return res.status(400).json({
                error: "Les donnees du paiement en attente sont invalides.",
            });
        }
        if (!payment.amount || !payment.currency) {
            return res.status(400).json({
                error: "Montant ou devise introuvable pour ce paiement.",
            });
        }

        const activationResult = await activateSubscription({
            userId: payment.userId,
            plan: payment.plan,
            billingCycle: payment.billingCycle,
            currency: payment.currency,
            amount: payment.amount,
            transactionRefId: transactionRefId || payment.transactionRefId,
            operatorRefId: operatorRefId || payment.operatorRefId,
            method: payment.method,
            provider: payment.provider,
            walletId: payment.walletId,
            pendingTransactionId: payment.id,
            confirmationSource: "admin_manual",
            confirmedBy: authResult.user.id,
            note,
        });

        if (!activationResult?.alreadyActivated) {
            const emailResult = await sendSubscriptionConfirmationEmail({
                userId: payment.userId,
                plan: payment.plan,
                billingCycle: payment.billingCycle,
                planEndsAt: activationResult?.user?.plan_ends_at,
            });
            if (!emailResult.success && !emailResult.skipped) {
                console.warn(
                    "Manual subscription confirmation email failed:",
                    emailResult.error,
                );
            }
        }

        const { data: refreshedPayment, error: refreshedPaymentError } =
            await supabase
                .from("transactions")
                .select(
                    "id, from_user_id, to_user_id, amount_gross, currency, status, description, metadata, created_at, updated_at",
                )
                .eq("id", payment.id)
                .maybeSingle();
        if (refreshedPaymentError) throw refreshedPaymentError;

        return res.json({
            success: true,
            alreadyActivated: activationResult?.alreadyActivated === true,
            user: activationResult?.user || null,
            payment: refreshedPayment
                ? extractSubscriptionPaymentDetails(refreshedPayment)
                : null,
        });
    } catch (error) {
        console.error("Admin subscription payment confirm error:", error);
        return res.status(500).json({
            error:
                error?.message ||
                "Impossible de confirmer ce paiement d'abonnement.",
        });
    }
});

app.post("/api/admin/subscription-payments/fail", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }
        return res.status(410).json({
            error: "La validation manuelle est désactivée. KPay détermine le statut final du paiement.",
        });

        const { payment_id: paymentId, reason } = req.body || {};
        if (!paymentId) {
            return res.status(400).json({ error: "Paiement manquant." });
        }

        const { data: paymentRow, error: paymentError } = await supabase
            .from("transactions")
            .select("id, status, metadata")
            .eq("id", paymentId)
            .eq("type", "subscription")
            .eq("metadata->>payment_provider", "kpay")
            .maybeSingle();
        if (paymentError) throw paymentError;
        if (!paymentRow) {
            return res.status(404).json({ error: "Paiement introuvable." });
        }
        if (String(paymentRow.status || "").toLowerCase() !== "pending") {
            return res.status(409).json({
                error: "Seuls les paiements en attente peuvent etre refuses.",
            });
        }

        const updatedMetadata = {
            ...(paymentRow.metadata && typeof paymentRow.metadata === "object"
                ? paymentRow.metadata
                : {}),
            failed_at: new Date().toISOString(),
            failed_by: authResult.user.id,
        };
        if (reason) updatedMetadata.admin_note = String(reason);

        const { error: updateError } = await supabase
            .from("transactions")
            .update({
                status: "failed",
                metadata: updatedMetadata,
            })
            .eq("id", paymentId);
        if (updateError) throw updateError;

        return res.json({ success: true });
    } catch (error) {
        console.error("Admin subscription payment fail error:", error);
        return res.status(500).json({
            error:
                error?.message ||
                "Impossible de marquer ce paiement comme echoue.",
        });
    }
});

// ==================== FONCTIONS UTILITAIRES ====================

// ==================== API PUBLIQUES MONETIZATION ====================

// Récupérer les revenus d'un créateur
app.get("/api/creator-revenue/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const { period = "all" } = req.query;

        let startDate;
        const now = new Date();

        switch (period) {
            case "today":
                startDate = new Date(
                    now.getFullYear(),
                    now.getMonth(),
                    now.getDate(),
                );
                break;
            case "7":
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case "30":
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = null;
        }

        let query = supabase
            .from("transactions")
            .select("*")
            .eq("to_user_id", userId)
            .eq("status", "succeeded");

        if (startDate) {
            query = query.gte("created_at", startDate.toISOString());
        }

        const { data: transactions, error } = await query;

        if (error) {
            console.error("Error fetching revenue:", error);
            return res.status(500).json({ error: "Failed to fetch revenue" });
        }

        // Calculer les totaux
        const summary = {
            totalGross: 0,
            totalNet: 0,
            totalCommission: 0,
            supportRevenue: 0,
            transactionCount: transactions ? transactions.length : 0,
        };

        if (transactions) {
            transactions.forEach((tx) => {
                const gross = parseFloat(tx.amount_gross || 0);
                const net = resolveTransactionNetAmount(tx);
                const commission = resolveTransactionCommissionAmount(tx);

                summary.totalGross += gross;
                summary.totalNet += net;
                summary.totalCommission += commission;

                if (tx.type === "support") {
                    summary.supportRevenue += net;
                }
            });
        }

        res.json({ success: true, data: summary });
    } catch (error) {
        console.error("Error fetching creator revenue:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/monetization/overview", async (req, res) => {
    try {
        const authResult = await authenticateRequest(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const overview = await buildCreatorWalletOverview(authResult.user.id);
        return res.json({
            success: true,
            profile: overview.profile,
            wallet: overview.wallet,
            payoutSettings: overview.payoutSettings,
            withdrawals: overview.withdrawals,
            supportedProviders: Object.entries(
                MOBILE_MONEY_PROVIDER_LABELS,
            ).map(([value, label]) => ({ value, label })),
        });
    } catch (error) {
        console.error("Monetization overview error:", error);
        if (isMissingRelationError(error)) {
            return res
                .status(503)
                .json({ error: getWalletSchemaErrorMessage() });
        }
        return res
            .status(500)
            .json({ error: "Impossible de charger le portefeuille." });
    }
});

app.post("/api/monetization/support", async (req, res) => {
    try {
        const authResult = await authenticateRequest(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const fromUserId = authResult.user.id;
        const {
            to_user_id: toUserId,
            amount: rawAmount,
            description: rawDescription,
        } = req.body || {};

        if (!toUserId) {
            return res.status(400).json({ error: "Destinataire manquant." });
        }

        if (fromUserId === toUserId) {
            return res
                .status(400)
                .json({ error: "Vous ne pouvez pas vous envoyer un soutien." });
        }

        const amount = Number.parseFloat(rawAmount);
        if (!Number.isFinite(amount)) {
            return res.status(400).json({ error: "Montant invalide." });
        }
        if (amount < SUPPORT_MIN_USD || amount > SUPPORT_MAX_USD) {
            return res.status(400).json({
                error: `Le montant doit etre entre ${SUPPORT_MIN_USD} et ${SUPPORT_MAX_USD} USD.`,
            });
        }

        const [senderProfileResult, recipientProfileResult] = await Promise.all(
            [
                supabase
                    .from("users")
                    .select("id, name, avatar")
                    .eq("id", fromUserId)
                    .maybeSingle(),
                supabase
                    .from("users")
                    .select(
                        "id, name, avatar, followers_count, plan, plan_status, plan_ends_at, is_monetized",
                    )
                    .eq("id", toUserId)
                    .maybeSingle(),
            ],
        );

        if (senderProfileResult.error) throw senderProfileResult.error;
        if (recipientProfileResult.error) throw recipientProfileResult.error;

        const senderProfile = senderProfileResult.data || null;
        const recipientProfile = recipientProfileResult.data || null;

        if (!recipientProfile) {
            return res.status(404).json({ error: "Createur introuvable." });
        }

        if (!canUserReceiveSupport(recipientProfile)) {
            return res.status(400).json({
                error: "Ce createur n'est pas eligible aux soutiens.",
            });
        }

        const description = String(rawDescription || "")
            .trim()
            .slice(0, 160);
        const breakdown = computeSupportRevenueBreakdown(amount);
        const metadata = {
            payment_provider: "internal_support",
            support_kind: "direct",
            sender_name:
                senderProfile?.name || authResult.user.email || "Utilisateur",
            created_via: "support_api",
            commission_rate: SUPPORT_COMMISSION_RATE,
            amount_net_creator: breakdown.netCreator,
            amount_commission_xera: breakdown.commission,
        };

        const { data: transaction, error: txError } = await supabase
            .from("transactions")
            .insert({
                from_user_id: fromUserId,
                to_user_id: toUserId,
                type: "support",
                amount_gross: breakdown.gross,
                amount_net_creator: breakdown.netCreator,
                amount_commission_xera: breakdown.commission,
                currency: "USD",
                status: "succeeded",
                description: description || "Soutien XERA1",
                metadata,
            })
            .select(
                "id, from_user_id, to_user_id, type, amount_gross, amount_net_creator, amount_commission_xera, currency, status, description, created_at",
            )
            .single();

        if (txError) throw txError;

        const senderName =
            senderProfile?.name ||
            authResult.user.user_metadata?.username ||
            "Un utilisateur";
        const notification = await createNotificationRecord({
            userId: toUserId,
            type: "support",
            message: `${senderName} vous a envoye ${formatMoneyUsd(breakdown.gross)} de soutien.`,
            link: `/creator-dashboard`,
            actorId: fromUserId,
            metadata: {
                transaction_id: transaction?.id || null,
                amount_gross: breakdown.gross,
                amount_net_creator: breakdown.netCreator,
                amount_commission_xera: breakdown.commission,
                currency: "USD",
                sender_id: fromUserId,
            },
        });

        if (notification) {
            await sendPushToUser(
                toUserId,
                buildNotificationPushPayload(notification),
            );
        }

        return res.json({
            success: true,
            transaction,
            notification,
            recipient: {
                id: recipientProfile.id,
                name: recipientProfile.name || "Createur",
            },
        });
    } catch (error) {
        console.error("Monetization support error:", error);
        if (isMissingRelationError(error) || isMissingColumnError(error)) {
            return res.status(503).json({
                error: "Schema monétisation ou notifications incomplet. Exécutez sql/monetization-supabase-one-shot.sql puis sql/notifications-rls-fix.sql si nécessaire.",
            });
        }
        return res
            .status(500)
            .json({ error: "Impossible d'envoyer le soutien." });
    }
});

app.get("/api/monetization/withdrawals", async (req, res) => {
    try {
        const authResult = await authenticateRequest(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const withdrawals = await fetchCreatorWithdrawalRequests(
            authResult.user.id,
            {
                limit: Math.min(
                    100,
                    Math.max(1, parseInt(req.query.limit, 10) || 30),
                ),
            },
        );
        return res.json({ success: true, withdrawals });
    } catch (error) {
        console.error("Monetization withdrawals list error:", error);
        if (isMissingRelationError(error)) {
            return res
                .status(503)
                .json({ error: getWalletSchemaErrorMessage() });
        }
        return res
            .status(500)
            .json({ error: "Impossible de charger les retraits." });
    }
});

app.post("/api/monetization/payout-settings", async (req, res) => {
    try {
        const authResult = await authenticateRequest(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const provider = normalizeMobileMoneyProvider(req.body?.provider);
        const walletNumber = sanitizeWalletNumber(req.body?.wallet_number);
        const accountName = sanitizePayoutText(req.body?.account_name, 80);
        const notes = sanitizePayoutText(req.body?.notes, 280);
        const countryCode = sanitizePayoutText(
            req.body?.country_code || "CD",
            8,
        ).toUpperCase();

        if (!provider) {
            return res.status(400).json({
                error: "Choisissez un fournisseur Mobile Money valide.",
            });
        }
        if (!walletNumber || walletNumber.length < 8) {
            return res.status(400).json({
                error: "Numero Mobile Money invalide.",
            });
        }
        if (!accountName) {
            return res.status(400).json({
                error: "Nom du titulaire requis.",
            });
        }

        const payload = {
            user_id: authResult.user.id,
            channel: "mobile_money",
            provider,
            account_name: accountName,
            wallet_number: walletNumber,
            country_code: countryCode || "CD",
            status: "active",
            notes,
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from("creator_payout_settings")
            .upsert(payload, { onConflict: "user_id" })
            .select("*")
            .single();
        if (error) throw error;

        return res.json({
            success: true,
            payoutSettings: extractPayoutSettings(data),
        });
    } catch (error) {
        console.error("Monetization payout settings error:", error);
        if (isMissingRelationError(error) || isMissingColumnError(error)) {
            return res
                .status(503)
                .json({ error: getWalletSchemaErrorMessage() });
        }
        return res.status(500).json({
            error: "Impossible d'enregistrer la methode de retrait.",
        });
    }
});

app.post("/api/monetization/withdrawals", async (req, res) => {
    try {
        const authResult = await authenticateRequest(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const requestedAmount = roundMoney(req.body?.amount);
        const note = sanitizePayoutText(req.body?.note, 280);

        if (!requestedAmount || requestedAmount < WITHDRAWAL_MIN_USD) {
            return res.status(400).json({
                error: `Le retrait minimum est de ${WITHDRAWAL_MIN_USD} USD.`,
            });
        }

        const overview = await buildCreatorWalletOverview(authResult.user.id);
        const payoutSettings = overview.payoutSettings;
        if (
            !payoutSettings?.provider ||
            !payoutSettings?.walletNumber ||
            !payoutSettings?.accountName
        ) {
            return res.status(400).json({
                error: "Enregistrez d'abord votre compte Mobile Money.",
            });
        }
        if (payoutSettings.status !== "active") {
            return res.status(400).json({
                error: "Votre compte Mobile Money est inactif. Reenregistrez-le avant le retrait.",
            });
        }
        // A withdrawal can never drain the wallet: a $5 reserve remains available.
        const maxWithdrawal = roundMoney(
            Math.max(0, overview.wallet.availableBalance - WITHDRAWAL_MIN_USD),
        );
        if (requestedAmount > maxWithdrawal) {
            return res.status(400).json({
                error: `Vous devez conserver au moins ${WITHDRAWAL_MIN_USD} USD sur votre compte. Montant maximum retirable : ${formatMoneyUsd(maxWithdrawal)}.`,
            });
        }

        const { data, error } = await supabase
            .from("withdrawal_requests")
            .insert({
                creator_id: authResult.user.id,
                payout_setting_id: payoutSettings.id,
                amount_usd: requestedAmount,
                requested_amount: requestedAmount,
                requested_currency: "USD",
                channel: "mobile_money",
                provider: payoutSettings.provider,
                wallet_number: payoutSettings.walletNumber,
                account_name: payoutSettings.accountName,
                note,
                status: "processing",
                requested_at: new Date().toISOString(),
                processed_at: new Date().toISOString(),
            })
            .select("*")
            .single();
        if (error) throw error;

        try {
            const initiated = await initiateAutomaticKPayPayout({
                withdrawalId: data.id,
                amountUsd: requestedAmount,
                phoneNumber: payoutSettings.walletNumber,
                description: "Retrait XERA1",
            });
            const kpayStatus = String(
                initiated.payout?.status || "PENDING",
            ).toUpperCase();
            const terminalPaid = kpayStatus === "COMPLETED";
            const { data: updated, error: updateError } = await supabase
                .from("withdrawal_requests")
                .update({
                    provider: initiated.prediction.provider,
                    provider_country: initiated.prediction.country,
                    kpay_withdrawal_id: initiated.payout?.id || null,
                    kpay_reference: initiated.payout?.reference || null,
                    kpay_status: kpayStatus,
                    payout_currency:
                        initiated.payout?.payoutCurrency ||
                        initiated.payout?.currency ||
                        initiated.payoutCurrency,
                    payout_amount:
                        initiated.payout?.payoutAmount ||
                        initiated.payout?.netAmount ||
                        null,
                    exchange_rate:
                        initiated.payout?.exchangeRate || initiated.rate,
                    payout_fee_amount: initiated.payout?.feeAmount || null,
                    status: terminalPaid ? "paid" : "processing",
                    paid_at: terminalPaid ? new Date().toISOString() : null,
                    operator_ref_id: initiated.payout?.reference || null,
                })
                .eq("id", data.id)
                .select("*")
                .single();
            if (updateError) throw updateError;
            return res.json({
                success: true,
                withdrawal: extractWithdrawalRequest(updated),
            });
        } catch (payoutError) {
            await supabase
                .from("withdrawal_requests")
                .update({
                    status: "rejected",
                    admin_note: `KPay: ${String(payoutError.message || "échec").slice(0, 240)}`,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", data.id);
            return res.status(502).json({
                error: payoutError.message || "Retrait KPay impossible.",
            });
        }
    } catch (error) {
        console.error("Monetization withdrawal request error:", error);
        if (isMissingRelationError(error) || isMissingColumnError(error)) {
            return res
                .status(503)
                .json({ error: getWalletSchemaErrorMessage() });
        }
        return res
            .status(500)
            .json({ error: "Impossible de creer la demande de retrait." });
    }
});

async function sweepKPayPayouts() {
    if (!areKPayPayoutsEnabled()) return { checked: 0, updated: 0 };
    const { data: rows, error } = await supabase
        .from("withdrawal_requests")
        .select("id,kpay_withdrawal_id")
        .eq("status", "processing")
        .not("kpay_withdrawal_id", "is", null)
        .limit(100);
    if (error) throw error;
    let updated = 0;
    for (const row of rows || []) {
        const payout = await kpayPayoutRequest(
            `/withdraw/${encodeURIComponent(row.kpay_withdrawal_id)}`,
        );
        const status = String(payout?.status || "PENDING").toUpperCase();
        if (!["COMPLETED", "FAILED", "CANCELLED"].includes(status)) continue;
        const paid = status === "COMPLETED";
        const { error: updateError } = await supabase
            .from("withdrawal_requests")
            .update({
                status: paid ? "paid" : "rejected",
                kpay_status: status,
                paid_at: paid ? new Date().toISOString() : null,
                admin_note: paid
                    ? null
                    : `KPay: ${payout?.failureReason || status}`,
                updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
        if (updateError) throw updateError;
        updated += 1;
    }
    return { checked: (rows || []).length, updated };
}

app.get("/api/cron/sweep-kpay-payouts", async (req, res) => {
    const auth = authorizeCronRequest(req);
    if (auth.error)
        return res
            .status(auth.error.status)
            .json({ error: auth.error.message });
    try {
        return res.json({ success: true, ...(await sweepKPayPayouts()) });
    } catch (error) {
        return res.status(500).json({
            error: error?.message || "Synchronisation KPay impossible.",
        });
    }
});

app.get("/api/admin/withdrawal-requests", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const requestedStatuses = String(
            req.query.status || "pending,processing",
        )
            .split(",")
            .map((value) =>
                String(value || "")
                    .trim()
                    .toLowerCase(),
            )
            .filter(Boolean);
        const allowedStatuses = new Set([
            "pending",
            "processing",
            "paid",
            "rejected",
            "canceled",
        ]);
        const statuses = requestedStatuses.filter((value) =>
            allowedStatuses.has(value),
        );
        const limit = Math.min(
            100,
            Math.max(1, parseInt(req.query.limit, 10) || 30),
        );

        let query = supabase
            .from("withdrawal_requests")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(limit);
        if (statuses.length === 1) {
            query = query.eq("status", statuses[0]);
        } else if (statuses.length > 1) {
            query = query.in("status", statuses);
        }

        const { data: rows, error } = await query;
        if (error) throw error;

        const requests = (rows || []).map(extractWithdrawalRequest);
        const userIds = Array.from(
            new Set(requests.map((item) => item.creatorId).filter(Boolean)),
        );

        let usersById = new Map();
        if (userIds.length > 0) {
            const { data: userRows, error: userError } = await supabase
                .from("users")
                .select(
                    "id, name, avatar, badge, followers_count, plan, plan_status, plan_ends_at, is_monetized",
                )
                .in("id", userIds);
            if (userError) throw userError;
            usersById = new Map((userRows || []).map((row) => [row.id, row]));
        }

        return res.json({
            success: true,
            requests: requests.map((request) => ({
                ...request,
                user: usersById.get(request.creatorId) || null,
            })),
        });
    } catch (error) {
        console.error("Admin withdrawal requests list error:", error);
        if (isMissingRelationError(error)) {
            return res
                .status(503)
                .json({ error: getWalletSchemaErrorMessage() });
        }
        return res
            .status(500)
            .json({ error: "Impossible de charger les demandes de retrait." });
    }
});

app.post("/api/admin/withdrawal-requests/status", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }
        return res.status(410).json({
            error: "Le traitement manuel des retraits est désactivé. Le statut payé doit provenir du prestataire de décaissement.",
        });

        const requestId = String(req.body?.request_id || "").trim();
        const status = String(req.body?.status || "")
            .trim()
            .toLowerCase();
        const operatorRefId = sanitizePayoutText(
            req.body?.operator_ref_id,
            120,
        );
        const adminNote = sanitizePayoutText(req.body?.note, 280);
        const allowedStatuses = new Set(["processing", "paid", "rejected"]);

        if (!requestId) {
            return res
                .status(400)
                .json({ error: "Demande de retrait manquante." });
        }
        if (!allowedStatuses.has(status)) {
            return res
                .status(400)
                .json({ error: "Statut de retrait invalide." });
        }

        const { data: existing, error: existingError } = await supabase
            .from("withdrawal_requests")
            .select("*")
            .eq("id", requestId)
            .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) {
            return res
                .status(404)
                .json({ error: "Demande de retrait introuvable." });
        }

        const currentStatus = String(existing.status || "").toLowerCase();
        if (currentStatus === "paid" || currentStatus === "rejected") {
            return res.status(409).json({
                error: "Cette demande a deja ete traitee definitivement.",
            });
        }

        const nowIso = new Date().toISOString();
        const updatePayload = {
            status,
            operator_ref_id: operatorRefId || existing.operator_ref_id || null,
            admin_note: adminNote || existing.admin_note || null,
            processed_at: nowIso,
            updated_at: nowIso,
        };
        if (status === "paid") {
            updatePayload.paid_at = nowIso;
        }

        const { data: updated, error: updateError } = await supabase
            .from("withdrawal_requests")
            .update(updatePayload)
            .eq("id", requestId)
            .select("*")
            .single();
        if (updateError) throw updateError;

        return res.json({
            success: true,
            request: extractWithdrawalRequest(updated),
        });
    } catch (error) {
        console.error("Admin withdrawal request update error:", error);
        if (isMissingRelationError(error) || isMissingColumnError(error)) {
            return res
                .status(503)
                .json({ error: getWalletSchemaErrorMessage() });
        }
        return res.status(500).json({
            error: "Impossible de mettre a jour cette demande de retrait.",
        });
    }
});

// ==================== API EXISTANTES ====================

app.post("/api/reminders/email/preferences", async (req, res) => {
    try {
        const authResult = await authenticateRequest(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

        const targetUserId = String(
            req.body?.userId || authResult.user.id || "",
        ).trim();
        if (!targetUserId || targetUserId !== authResult.user.id) {
            return res
                .status(403)
                .json({ error: "Utilisateur cible invalide." });
        }

        const metadata =
            authResult.user.user_metadata &&
            typeof authResult.user.user_metadata === "object"
                ? authResult.user.user_metadata
                : {};
        const enabled = req.body?.enabled !== false;
        const safeTimezone = sanitizeTimeZone(req.body?.timezone || "UTC");
        const nowIso = new Date().toISOString();

        await ensurePublicUserRecord(targetUserId, {
            email: authResult.user.email,
            username: metadata.username || null,
            name: metadata.name || metadata.full_name || null,
            avatarUrl: metadata.avatar_url || metadata.avatar || null,
            accountType: metadata.account_type || null,
            accountSubtype: metadata.account_subtype || null,
            badge: metadata.badge || null,
        });

        const updatePayload = {
            email_reminder_enabled: enabled,
            email_reminder_timezone: safeTimezone,
            updated_at: nowIso,
        };
        if (enabled) {
            updatePayload.email_reminder_opted_in_at = nowIso;
        }

        const { error } = await supabase
            .from("users")
            .update(updatePayload)
            .eq("id", targetUserId);

        if (error) {
            if (isMissingColumnError(error)) {
                return res.status(503).json({
                    error: "Colonnes de rappel email manquantes. Executez sql/email-reminders.sql.",
                });
            }
            throw error;
        }

        return res.json({
            ok: true,
            enabled,
            timezone: safeTimezone,
            email: authResult.user.email || null,
            deliveryReady: supportsEmailReminders(),
            provider: supportsEmailReminders() ? REMINDER_EMAIL_PROVIDER : null,
            deliveryIssue: getEmailDeliveryIssue(),
        });
    } catch (error) {
        console.error("Email reminder preference error:", error);
        return res.status(500).json({
            error:
                error?.message ||
                "Impossible d'enregistrer la preference email.",
        });
    }
});

app.get("/api/cron/send-reminders", async (req, res) => {
    const auth = authorizeCronRequest(req);
    if (!auth.ok) {
        return res.status(auth.status || 401).json({
            error: auth.message || "Unauthorized cron request.",
        });
    }

    await sendScheduledReturnReminders();

    return res.status(200).json({
        message: "Scheduled reminders (Email + Push) initiated.",
    });
});

// Master Daily Cron (Vercel Hobby Plan Compatible - Runs once per day)
app.all(["/api/cron/daily", "/api/cron/master"], async (req, res) => {
    const auth = authorizeCronRequest(req);
    if (!auth.ok) {
        return res.status(auth.status || 401).json({
            error: auth.message || "Unauthorized cron request.",
        });
    }

    const results = {};

    // 1. Reminders
    try {
        await sendScheduledReturnReminders();
        results.reminders = "ok";
    } catch (err) {
        results.reminders = err?.message || "error";
    }

    // 2. Sweep Subscriptions
    try {
        await sweepExpiredSubscriptions();
        results.sweepSubscriptions = "ok";
    } catch (err) {
        results.sweepSubscriptions = err?.message || "error";
    }

    // 3. Sweep KPay Payouts
    try {
        results.kpayPayouts = await sweepKPayPayouts();
    } catch (err) {
        results.kpayPayouts = err?.message || "error";
    }

    // 4. Evaluate Tech Badges
    try {
        results.techBadges = await evaluateTechBadges();
    } catch (err) {
        results.techBadges = err?.message || "error";
    }

    // 5. Fata Worker
    try {
        const {
            processActivityLog,
            processPendingEvents,
        } = require("./fata-worker");
        await processActivityLog();
        await processPendingEvents();
        results.fataWorker = "ok";
    } catch (err) {
        results.fataWorker = err?.message || "error";
    }

    return res.status(200).json({
        ok: true,
        message: "Master daily cron executed successfully",
        results,
    });
});

app.get("/api/cron/send-reminder-emails", async (req, res) => {
    const auth = authorizeCronRequest(req);
    if (!auth.ok) {
        return res.status(auth.status || 401).json({
            error: auth.message || "Unauthorized cron request.",
        });
    }

    const result = await sweepReturnReminderEmails(new Date());

    return res.status(200).json({
        message: "Reminder email sweep completed.",
        result,
    });
});

app.get("/api/cron/sweep-subscriptions", async (req, res) => {
    const auth = authorizeCronRequest(req);
    if (!auth.ok) {
        return res.status(auth.status || 401).json({
            error: auth.message || "Unauthorized cron request.",
        });
    }

    await sweepExpiredSubscriptions();

    return res.status(200).json({
        message: "Subscription sweep initiated successfully.",
    });
});

// Cron: evaluate & apply 'tech' badge based on 7-day continuous posting streak
app.get("/api/cron/evaluate-tech-badges", async (req, res) => {
    const auth = authorizeCronRequest(req);
    if (!auth.ok) {
        return res.status(auth.status || 401).json({
            error: auth.message || "Unauthorized cron request.",
        });
    }

    try {
        const result = await evaluateTechBadges();
        return res.status(200).json({
            message: "Tech badge evaluation completed.",
            result,
        });
    } catch (error) {
        console.error("evaluate-tech-badges error:", error);
        return res.status(500).json({ error: error?.message || "failed" });
    }
});

// Fata Cron Worker
app.all(["/api/cron/fata-worker", "/cron/fata-worker"], async (req, res) => {
    const auth = authorizeCronRequest(req);
    if (!auth.ok) {
        return res.status(auth.status || 401).json({
            error: auth.message || "Unauthorized cron request.",
        });
    }

    try {
        const {
            processActivityLog,
            processPendingEvents,
        } = require("./fata-worker");
        await processActivityLog();
        await processPendingEvents();
        return res.status(200).json({
            ok: true,
            message: "Fata worker processed successfully",
        });
    } catch (error) {
        console.error("[Fata Cron Worker Error]:", error);
        return res
            .status(500)
            .json({ error: error?.message || "Fata worker error" });
    }
});

// Fata Linkage & Challenge Status for Authenticated User
app.get("/api/fata/status", async (req, res) => {
    const auth = await authenticateRequest(req);
    if (auth.error) {
        return res
            .status(auth.error.status)
            .json({ error: auth.error.message });
    }

    try {
        const userId = auth.user.id;
        const { data: linkage } = await supabase
            .from("fata_linkages")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();

        const { data: pendingEvents } = await supabase
            .from("fata_pending_events")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });

        const { data: qualification } = await supabase
            .from("fata_qualifications")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();

        return res.json({
            connected: Boolean(linkage),
            linkage: linkage || null,
            qualification: qualification || null,
            pendingEvents: pendingEvents || [],
        });
    } catch (error) {
        console.error("Fata status error:", error);
        return res
            .status(500)
            .json({ error: error?.message || "Failed to fetch Fata status" });
    }
});

// Admin Ingestion for Fata Qualified Users
app.post("/api/admin/fata/qualifications", async (req, res) => {
    const auth = await authenticateSuperAdmin(req);
    if (auth.error) {
        return res
            .status(auth.error.status)
            .json({ error: auth.error.message });
    }

    const {
        challengeId,
        subjects,
        visibilityMultiplier = 5.0,
    } = req.body || {};

    if (!challengeId || !Array.isArray(subjects) || subjects.length === 0) {
        return res.status(400).json({
            error: "challengeId and non-empty subjects array are required",
        });
    }

    const {
        resolveChallengeConfig,
        isTestChallenge,
    } = require("./fata-contract");
    let challengeConfig;
    try {
        challengeConfig = resolveChallengeConfig(challengeId);
    } catch (error) {
        return res
            .status(400)
            .json({ error: error.message || "Invalid challengeId" });
    }

    const isTest = isTestChallenge(challengeId);
    const results = {
        totalSubmitted: subjects.length,
        matchedCount: 0,
        unmatchedSubjects: [],
        qualificationsCreated: 0,
        rewardsApplied: !isTest,
    };

    for (const rawSub of subjects) {
        const fataSub = String(rawSub || "").trim();
        if (!fataSub) continue;

        const { data: linkage } = await supabase
            .from("fata_linkages")
            .select("user_id, fata_iss")
            .eq("fata_sub", fataSub)
            .maybeSingle();

        if (!linkage || !linkage.user_id) {
            results.unmatchedSubjects.push(fataSub);
            continue;
        }

        results.matchedCount += 1;

        const multiplierVal = isTest
            ? 1.0
            : Math.min(5.0, Math.max(1.0, Number(visibilityMultiplier) || 5.0));

        const { error: qualError } = await supabase
            .from("fata_qualifications")
            .upsert(
                {
                    user_id: linkage.user_id,
                    challenge_id: challengeConfig.id,
                    fata_sub: fataSub,
                    qualified_at: new Date().toISOString(),
                    validated_by: auth.user.id,
                    badge_awarded: !isTest,
                    visibility_boost_active: !isTest,
                    visibility_multiplier: multiplierVal,
                    boost_started_at: isTest ? null : new Date().toISOString(),
                    metadata: {
                        imported_by: auth.user.id,
                        imported_at: new Date().toISOString(),
                        is_test: isTest,
                    },
                },
                { onConflict: "user_id,challenge_id" },
            );

        if (!qualError) {
            results.qualificationsCreated += 1;
        }
    }

    return res.json({ ok: true, results });
});

// Health check
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get(
    ["/api/share/content/:id", "/share/content/:id"],
    handleContentSharePage,
);
app.get(
    ["/api/share/profile/:id", "/share/profile/:id"],
    handleProfileSharePage,
);

app.get("/api/health", (_req, res) => {
    res.json({
        ok: true,
        reminderHours: REMINDER_HOURS,
        reminderWindowMinutes: REMINDER_WINDOW_MIN,
        emailReminders: supportsEmailReminders()
            ? REMINDER_EMAIL_PROVIDER
            : "disabled",
        emailReminderFrom: REMINDER_EMAIL_FROM || null,
        emailRemindersIssue: getEmailDeliveryIssue(),
        subscriptionSweepMs: SUBSCRIPTION_SWEEP_MS,
    });
});

function handlePublicConfig(req, res) {
    const callbackConfig = getKPayCallbackConfig(req);
    res.json({
        usdToCdfRate: USD_TO_CDF_RATE_VALUE,
        kPay: {
            callbackEnabled: callbackConfig.callbackEnabled,
            callbackOrigin: callbackConfig.callbackEnabled
                ? callbackConfig.callbackOrigin
                : null,
            gatewayMode: String(KPAY_GATEWAY_MODE),
        },
    });
}

app.get("/api/config", handlePublicConfig);

app.get("/api/app/profiles/:userId", async (req, res) => {
    try {
        const profileResult = await fetchProfileRecordById(req.params.userId);
        if (!profileResult.success) {
            return res.status(profileResult.status || 500).json({
                success: false,
                error:
                    profileResult.error || "Impossible de charger le profil.",
                code: profileResult.code || "UNKNOWN",
            });
        }

        return res.json({
            success: true,
            data: profileResult.data,
            cached: profileResult.cached === true,
        });
    } catch (error) {
        console.error("App profile read error:", error);
        return res.status(500).json({
            success: false,
            error: error?.message || "Impossible de charger le profil.",
            code: String(error?.code || "UNKNOWN"),
        });
    }
});

app.put("/api/app/profiles/:userId", async (req, res) => {
    try {
        const targetUserId = String(req.params.userId || "").trim();
        if (!targetUserId) {
            return res.status(400).json({
                success: false,
                error: "Identifiant utilisateur manquant.",
            });
        }

        const authResult = await authenticateRequest(req);
        if (authResult.error) {
            return res.status(authResult.error.status).json({
                success: false,
                error: authResult.error.message,
            });
        }

        if (
            authResult.user.id !== targetUserId &&
            authResult.user.id !== SUPER_ADMIN_ID
        ) {
            return res.status(403).json({
                success: false,
                error: "Mise a jour de profil refusee.",
            });
        }

        const existingProfileResult = await fetchProfileRecordById(
            targetUserId,
            {
                useCache: false,
            },
        );
        const existingProfile = existingProfileResult.success
            ? existingProfileResult.data
            : null;

        const payload = sanitizeProfilePayload(
            req.body?.profile || req.body || {},
            authResult.user,
            existingProfile,
        );

        const { data, error } = await supabase
            .from("users")
            .upsert(payload)
            .select("*")
            .single();

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message || "Mise a jour de profil impossible.",
                code: String(error.code || "UNKNOWN"),
            });
        }

        invalidateUserAppCaches(targetUserId);

        return res.json({
            success: true,
            data: normalizeUserProfileRecord(data),
        });
    } catch (error) {
        console.error("App profile upsert error:", error);
        return res.status(500).json({
            success: false,
            error: error?.message || "Mise a jour de profil impossible.",
            code: String(error?.code || "UNKNOWN"),
        });
    }
});

app.get("/api/work-items/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const { data, error } = await supabase
            .from("work_items")
            .select("*")
            .eq("userId", userId)
            .order("timestamp", { ascending: false })
            .limit(50);

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        console.error("Error fetching work items:", err);
        res.status(500).json({ error: "Failed to fetch work items" });
    }
});

app.get("/api/feed/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        // 1. Récupère le feed (recommandations)
        const result = await fetchRecommendedUsers({
            requestingUserId: userId,
        });
        if (!result.success) {
            return res
                .status(result.status || 500)
                .json({ error: result.error });
        }

        const recommendedUsers = result.data;
        if (!recommendedUsers || recommendedUsers.length === 0)
            return res.json([]);

        // 2. Hydrate avec les interactions réelles (is_followed, is_encouraged)
        const creatorIds = recommendedUsers.map((u) => u.id);

        const { data: interactions, error: interactError } = await supabase
            .from("user_interactions")
            .select("target_user_id, interaction_type")
            .eq("viewer_id", userId)
            .in("target_user_id", creatorIds)
            .in("interaction_type", ["follow", "encourage"]);

        if (interactError) {
            console.error("Hydration interactions error:", interactError);
        }

        // 3. Fusionne les statuts
        const hydratedUsers = recommendedUsers.map((user) => {
            const userInteractions =
                interactions?.filter((i) => i.target_user_id === user.id) || [];
            return {
                ...user,
                is_followed: userInteractions.some(
                    (i) => i.interaction_type === "follow",
                ),
                is_encouraged: userInteractions.some(
                    (i) => i.interaction_type === "encourage",
                ),
            };
        });

        res.json(hydratedUsers);
    } catch (err) {
        console.error("Feed fetch error:", err);
        res.status(500).json({
            error: "Erreur serveur lors de la récupération du feed",
        });
    }
});

app.get("/api/app/discover/users", async (req, res) => {
    try {
        // Tente de récupérer l'ID de l'utilisateur connecté (facultatif pour discover)
        const requestingUserId = req.query.userId || null;

        // Utilise le nouvel algorithme de recommandation
        const recommendedResult = await fetchRecommendedUsers({
            requestingUserId,
            useCache: !requestingUserId, // Désactive le cache si personnalisé
        });
        if (!recommendedResult.success) {
            return res.status(recommendedResult.status || 500).json({
                success: false,
                error:
                    recommendedResult.error ||
                    "Impossible de charger les recommandations.",
                code: recommendedResult.code || "UNKNOWN",
            });
        }

        return res.json({
            success: true,
            data: recommendedResult.data,
            cached: recommendedResult.cached === true,
            algorithm: "xera1-v2-composite", // Identifie l'algo utilisé
        });
    } catch (error) {
        console.error("App discover users error:", error);
        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "Impossible de charger les recommandations Discover.",
            code: String(error?.code || "UNKNOWN"),
        });
    }
});

app.get("/api/app/subscriptions/me", async (req, res) => {
    try {
        const authResult = await authenticateRequest(req);
        if (authResult.error) {
            return res.status(authResult.error.status).json({
                success: false,
                error: authResult.error.message,
            });
        }

        const stateResult = await fetchCurrentSubscriptionState(
            authResult.user.id,
            {
                useCache: false,
            },
        );

        if (!stateResult.success) {
            return res.status(stateResult.status || 500).json({
                success: false,
                error:
                    stateResult.error ||
                    "Impossible de charger l'etat de l'abonnement.",
                code: stateResult.code || "UNKNOWN",
            });
        }

        return res.json({
            success: true,
            data: stateResult.data,
        });
    } catch (error) {
        console.error("App subscription state error:", error);
        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "Impossible de charger l'etat de l'abonnement.",
            code: String(error?.code || "UNKNOWN"),
        });
    }
});

// Enregistrer / mettre à jour un abonnement Web Push (navigateur)
app.post("/api/push/subscribe", async (req, res) => {
    try {
        const {
            userId,
            subscription,
            timezone,
            reminderEnabled = true,
        } = req.body;
        if (!userId || !subscription || !subscription.endpoint) {
            return res
                .status(400)
                .json({ error: "Invalid subscription payload" });
        }

        const safeTimezone = sanitizeTimeZone(timezone);
        const basePayload = {
            user_id: userId,
            endpoint: subscription.endpoint,
            keys: subscription.keys || null,
        };
        const extendedPayload = {
            ...basePayload,
            reminder_timezone: safeTimezone,
            reminder_enabled: reminderEnabled !== false,
        };

        let { error } = await supabase
            .from("push_subscriptions")
            .upsert(extendedPayload, { onConflict: "endpoint" });

        // Compatibilité: si la migration reminder n'est pas encore appliquée, retomber sur le schéma minimal.
        if (error && isMissingColumnError(error)) {
            ({ error } = await supabase
                .from("push_subscriptions")
                .upsert(basePayload, { onConflict: "endpoint" }));
        }

        if (error) throw error;
        res.json({ ok: true, timezone: safeTimezone });
    } catch (err) {
        console.error("push subscribe error", err);
        if (["42P01", "42703", "PGRST204", "PGRST205"].includes(err?.code)) {
            return res.json({
                ok: true,
                skipped: true,
                reason: "push_schema_missing",
            });
        }
        res.status(400).json({ error: err.message });
    }
});

// Enregistrer un token de device mobile (FCM / APNs)
app.post("/api/push/register-device", async (req, res) => {
    try {
        const { userId, token, platform = "other" } = req.body;
        if (!userId || !token) {
            return res.status(400).json({ error: "Missing userId or token" });
        }
        const safePlatform = ["android", "ios"].includes(
            String(platform || "").toLowerCase(),
        )
            ? String(platform).toLowerCase()
            : "other";

        const { error } = await supabase.from("device_push_tokens").upsert(
            {
                token: String(token),
                user_id: userId,
                platform: safePlatform,
            },
            { onConflict: "token" },
        );

        if (error) throw error;
        res.json({ ok: true });
    } catch (err) {
        console.error("register device token error", err);
        res.status(400).json({ error: err.message || "failed" });
    }
});

// Obtenir le compteur de badge (notifications non lues) pour l'utilisateur authentifié
app.get("/api/notifications/badge", async (req, res) => {
    try {
        const authHeader =
            req.headers.authorization || req.headers.Authorization || "";
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length).trim()
            : "";
        if (!token)
            return res
                .status(401)
                .json({ error: "Missing authorization token" });

        const { data: authData, error: authError } =
            await supabase.auth.getUser(token);
        if (authError || !authData?.user?.id) {
            return res.status(401).json({ error: "Invalid session token" });
        }
        const userId = authData.user.id;

        const { count, error } = await supabase
            .from("notifications")
            .select("*", { head: true, count: "exact" })
            .eq("user_id", userId)
            .eq("read", false);

        if (error) throw error;
        return res.json({ unreadCount: Number(count || 0) });
    } catch (err) {
        console.error("badge count error", err);
        return res.status(500).json({ error: err.message || "failed" });
    }
});

// Remise à zéro du badge / marquer toutes les notifications comme lues pour l'utilisateur authentifié
app.post("/api/notifications/badge-reset", async (req, res) => {
    try {
        const authHeader =
            req.headers.authorization || req.headers.Authorization || "";
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length).trim()
            : "";
        if (!token)
            return res
                .status(401)
                .json({ error: "Missing authorization token" });

        const { data: authData, error: authError } =
            await supabase.auth.getUser(token);
        if (authError || !authData?.user?.id) {
            return res.status(401).json({ error: "Invalid session token" });
        }
        const userId = authData.user.id;

        const { error } = await supabase
            .from("notifications")
            .update({ read: true })
            .eq("user_id", userId)
            .eq("read", false);

        if (error) throw error;
        return res.json({ ok: true });
    } catch (err) {
        console.error("badge reset error", err);
        if (["42P01", "42703", "PGRST204", "PGRST205"].includes(err?.code)) {
            return res.json({
                ok: true,
                skipped: true,
                reason: "notifications_schema_missing",
            });
        }
        return res.status(500).json({ error: err.message || "failed" });
    }
});

// Create notification via server (use server key to bypass RLS if necessary)
app.post("/api/notifications/create", async (req, res) => {
    try {
        const { user_id, type, message, link, actor_id, metadata } =
            req.body || {};
        if (!user_id || !type || !message) {
            return res
                .status(400)
                .json({ success: false, error: "Missing parameters" });
        }

        const created = await createNotificationRecord({
            userId: user_id,
            type,
            message,
            link,
            actorId: actor_id,
            metadata,
        });

        if (!created) {
            return res
                .status(500)
                .json({ success: false, error: "Insert failed" });
        }

        return res.json({ success: true, data: created });
    } catch (err) {
        console.warn("/api/notifications/create error:", err);
        return res.status(500).json({ success: false, error: String(err) });
    }
});

// ... (le reste du code existant pour les rappels, etc.)

async function evaluateTechBadges(options = {}) {
    const safeTZ = sanitizeTimeZone(process.env.BADGE_TIMEZONE || "UTC");
    const lookbackDays = Number.isFinite(
        Number(process.env.BADGE_LOOKBACK_DAYS),
    )
        ? Math.max(7, parseInt(process.env.BADGE_LOOKBACK_DAYS, 10))
        : 14;
    const now = options.now || new Date();
    const nowIso = now.toISOString();
    const startDate = new Date(now.getTime() - lookbackDays * DAY_MS);
    const startIso = startDate.toISOString();

    // Fetch recent content for the lookback window
    const { data: rows, error: rowsError } = await supabase
        .from("content")
        .select("author_id, created_at")
        .eq("author_type", "USER")
        .gte("created_at", startIso);

    if (rowsError) {
        throw rowsError;
    }

    // Build per-user date sets and last post timestamp
    const map = new Map();
    (rows || []).forEach((r) => {
        const uid = String(r.author_id || "").trim();
        if (!uid) return;
        const createdAt = r.created_at;
        if (!createdAt) return;

        const parts = getTimePartsInZone(new Date(createdAt), safeTZ);
        const dateKey = parts.dateKey;

        let entry = map.get(uid);
        if (!entry) {
            entry = { dateSet: new Set(), lastCreatedAt: createdAt };
            map.set(uid, entry);
        }
        entry.dateSet.add(dateKey);
        if (
            !entry.lastCreatedAt ||
            new Date(createdAt) > new Date(entry.lastCreatedAt)
        ) {
            entry.lastCreatedAt = createdAt;
        }
    });

    const awarded = [];
    // Award badge when user has a 7-day streak (including today)
    for (const [uid, entry] of map.entries()) {
        let streak = 0;
        for (let i = 0; i < 7; i++) {
            const d = new Date(now.getTime() - i * DAY_MS);
            const key = getTimePartsInZone(d, safeTZ).dateKey;
            if (entry.dateSet.has(key)) streak++;
            else break;
        }

        if (streak >= 7) {
            try {
                const { data: profile, error: pErr } = await supabase
                    .from("users")
                    .select("id, badge")
                    .eq("id", uid)
                    .maybeSingle();
                if (pErr) {
                    console.warn(
                        "evaluateTechBadges: failed to read user",
                        uid,
                        pErr,
                    );
                    continue;
                }
                const currentBadge = String(profile?.badge || "").toLowerCase();
                if (currentBadge !== "tech") {
                    const { error: upErr } = await supabase
                        .from("users")
                        .update({ badge: "tech", updated_at: nowIso })
                        .eq("id", uid);
                    if (upErr) {
                        console.warn(
                            "evaluateTechBadges: failed to award badge to",
                            uid,
                            upErr.message || upErr,
                        );
                    } else {
                        awarded.push(uid);
                    }
                }
            } catch (e) {
                console.warn(
                    "evaluateTechBadges: exception awarding badge",
                    uid,
                    e,
                );
            }
        }
    }

    // Revoke badge when the user's last post was >= 3 days ago
    const { data: techUsers, error: techUsersErr } = await supabase
        .from("users")
        .select("id")
        .eq("badge", "tech");
    if (techUsersErr) {
        throw techUsersErr;
    }

    const revoked = [];
    for (const u of techUsers || []) {
        const uid = u.id;
        let lastCreatedAt = map.get(uid)?.lastCreatedAt || null;
        if (!lastCreatedAt) {
            // Fetch last post if not in the recent window
            try {
                const { data: lastRow, error: lastErr } = await supabase
                    .from("content")
                    .select("created_at")
                    .eq("author_type", "USER")
                    .eq("author_id", uid)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (!lastErr && lastRow)
                    lastCreatedAt = lastRow.created_at || null;
            } catch (e) {
                console.warn(
                    "evaluateTechBadges: failed to fetch last post for",
                    uid,
                    e,
                );
            }
        }

        const daysSinceLast = lastCreatedAt
            ? getDaysSince(lastCreatedAt, now)
            : Infinity;
        if (daysSinceLast >= 3) {
            try {
                const { error: upErr } = await supabase
                    .from("users")
                    .update({ badge: null, updated_at: nowIso })
                    .eq("id", uid);
                if (upErr) {
                    console.warn(
                        "evaluateTechBadges: failed to revoke badge for",
                        uid,
                        upErr.message || upErr,
                    );
                } else {
                    revoked.push(uid);
                }
            } catch (e) {
                console.warn(
                    "evaluateTechBadges: exception revoking badge",
                    uid,
                    e,
                );
            }
        }
    }

    return {
        evaluatedAt: nowIso,
        timezone: safeTZ,
        lookbackDays,
        awarded,
        revoked,
    };
}

const isDirectRun = require.main === module;

/* ========================================
   ADMIN - BOTS CONTROL ENDPOINTS
   ======================================== */

app.get("/api/admin/bots/status", async (req, res) => {
    const authResult = await authenticateSuperAdmin(req);
    if (authResult.error) {
        return res
            .status(authResult.error.status)
            .send(authResult.error.message);
    }
    try {
        const { count: totalBots, error: countErr } = await supabase
            .from("bots")
            .select("id", { count: "exact", head: true });
        if (countErr) console.warn("bots count error", countErr);

        const { count: activeBotsCount, error: activeCountErr } = await supabase
            .from("bots")
            .select("id", { count: "exact", head: true })
            .eq("active", true);
        if (activeCountErr)
            console.warn("active bots count error", activeCountErr);

        const { data: control } = await supabase
            .from("bot_control")
            .select("value")
            .eq("key", "bots.active_count")
            .maybeSingle();

        const configuredActiveCount =
            (control && control.value && control.value.count) || 0;

        // Read global auto-force-posts flag if present
        let forcePostsEnabled = false;
        try {
            const { data: fControl } = await supabase
                .from("bot_control")
                .select("value")
                .eq("key", "bots.force_posts")
                .maybeSingle();
            if (fControl && fControl.value !== undefined) {
                const v = fControl.value;
                if (typeof v === "object") {
                    forcePostsEnabled =
                        v.enabled === true || String(v.enabled) === "true";
                } else {
                    forcePostsEnabled =
                        v === true || String(v) === "true" || String(v) === "1";
                }
            }
        } catch (e) {
            // ignore
        }

        const { data: sampleData, error: sampleErr } = await supabase
            .from("bots")
            .select(
                "user_id, display_name, avatar_url, active, schedule_hour, encourage_days",
            )
            .limit(20);
        if (sampleErr) console.warn("bots sample error", sampleErr);

        return res.json({
            totalBots: Number(totalBots) || 0,
            activeCount: Number(activeBotsCount) || 0,
            configuredActiveCount: Number(configuredActiveCount) || 0,
            sample: sampleData || [],
            forcePosts: !!forcePostsEnabled,
        });
    } catch (e) {
        console.error("/api/admin/bots/status error", e?.message || e);
        return res.status(500).send("Erreur interne");
    }
});

app.post("/api/admin/bots/set-active-count", async (req, res) => {
    const authResult = await authenticateSuperAdmin(req);
    if (authResult.error) {
        return res
            .status(authResult.error.status)
            .send(authResult.error.message);
    }

    const rawCount =
        req.body && req.body.count !== undefined
            ? req.body.count
            : req.query.count;
    const parsed = Number(rawCount);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return res.status(400).send("Paramètre count invalide");
    }
    const maxCount = Math.max(
        0,
        Number.isFinite(Number(process.env.BOTS_ACTIVE_COUNT_MAX))
            ? Number(process.env.BOTS_ACTIVE_COUNT_MAX)
            : 10000,
    );
    const count = Math.max(0, Math.min(maxCount, parseInt(parsed, 10)));

    try {
        // Upsert control
        const { error: upErr } = await supabase.from("bot_control").upsert(
            {
                key: "bots.active_count",
                value: { count },
                updated_at: new Date().toISOString(),
            },
            { onConflict: "key" },
        );
        if (upErr) throw upErr;

        // Apply activation flags (simple strategy: reset all then enable first N by last_action_at)
        if (count <= 0) {
            await supabase.from("bots").update({ active: false });
        } else {
            const { data: selected } = await supabase
                .from("bots")
                .select("user_id")
                .order("last_action_at", { ascending: true })
                .limit(count);
            const ids = (selected || []).map((r) => r.user_id).filter(Boolean);

            // Deactivate all
            await supabase.from("bots").update({ active: false });

            if (ids.length) {
                await supabase
                    .from("bots")
                    .update({ active: true })
                    .in("user_id", ids);
            }
        }

        return res.json({ success: true, activeCount: count });
    } catch (e) {
        console.error(
            "/api/admin/bots/set-active-count error",
            e?.message || e,
        );
        return res.status(500).send("Erreur interne");
    }
});

// Toggle single bot active state
app.post("/api/admin/bots/toggle-active", async (req, res) => {
    const authResult = await authenticateSuperAdmin(req);
    if (authResult.error) {
        return res
            .status(authResult.error.status)
            .send(authResult.error.message);
    }

    const { user_id: userId, active } = req.body || {};
    if (!userId) return res.status(400).send("user_id missing");
    const isActive = !!active;
    try {
        const { error } = await supabase
            .from("bots")
            .update({
                active: isActive,
                last_action_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        if (error) throw error;
        return res.json({ success: true, user_id: userId, active: isActive });
    } catch (e) {
        console.error("/api/admin/bots/toggle-active error", e?.message || e);
        return res.status(500).send("Erreur interne");
    }
});

// Set global auto-force-posts flag for bots (stored in bot_control)
app.post("/api/admin/bots/set-force-posts", async (req, res) => {
    const authResult = await authenticateSuperAdmin(req);
    if (authResult.error) {
        return res
            .status(authResult.error.status)
            .send(authResult.error.message);
    }

    const raw =
        req.body && req.body.enabled !== undefined
            ? req.body.enabled
            : req.query.enabled;
    const enabled = raw === true || raw === "true" || raw === "1" || raw === 1;

    try {
        const { error: upErr } = await supabase.from("bot_control").upsert(
            {
                key: "bots.force_posts",
                value: { enabled: !!enabled },
                updated_at: new Date().toISOString(),
            },
            { onConflict: "key" },
        );
        if (upErr) throw upErr;
        return res.json({ success: true, enabled: !!enabled });
    } catch (e) {
        console.error("/api/admin/bots/set-force-posts error", e?.message || e);
        return res.status(500).send("Erreur interne");
    }
});

// Delete all bots - pour supprimer tous les bots de la DB
app.post("/api/admin/bots/delete-all", async (req, res) => {
    const adminAuth = await authenticateSuperAdmin(req);
    if (adminAuth.error) {
        return res.status(adminAuth.error.status).send(adminAuth.error.message);
    }

    try {
        // 1. Get all bot user_ids
        const { data: bots, error: botsErr } = await supabase
            .from("bots")
            .select("user_id");
        if (botsErr) {
            console.error("delete-all: fetch bots error", botsErr);
            throw botsErr;
        }

        const botUserIds = (bots || []).map((b) => b.user_id).filter(Boolean);
        logger.debug("delete-all: found", botUserIds.length, "bots");

        let deleted = { bots: 0, users: 0 };

        // 2. Delete from bots table - direct delete one by one to avoid .in() issues
        if (botUserIds.length > 0) {
            for (const userId of botUserIds) {
                const { error: delErr } = await supabase
                    .from("bots")
                    .delete()
                    .eq("user_id", userId);
                if (delErr) {
                    console.warn("delete-all: del bot error", userId, delErr);
                }
            }
            deleted.bots = botUserIds.length;
        }

        // 3. Delete users
        if (botUserIds.length > 0) {
            for (const userId of botUserIds) {
                const { error: delErr } = await supabase
                    .from("users")
                    .delete()
                    .eq("id", userId);
                if (delErr) {
                    console.warn("delete-all: del user error", userId, delErr);
                }
            }
            deleted.users = botUserIds.length;
        }

        // 4. Also delete related content
        if (botUserIds.length > 0) {
            for (const userId of botUserIds) {
                await supabase.from("content").delete().eq("user_id", userId);
            }
        }

        // 5. Reset bot_control count
        await supabase.from("bot_control").upsert(
            {
                key: "bots.active_count",
                value: { count: 0 },
                updated_at: new Date().toISOString(),
            },
            { onConflict: "key" },
        );

        logger.debug("delete-all: success", deleted);
        return res.json({ success: true, deleted });
    } catch (e) {
        console.error("/api/admin/bots/delete-all error", e?.message || e);
        return res.status(500).send("Erreur interne: " + (e?.message || e));
    }
});

// Run-once runner for bots - intended for serverless environments (Vercel cron)
app.post("/api/admin/bots/run-now", async (req, res) => {
    const cronAuth = authorizeCronRequest(req);
    let authorized = cronAuth.ok === true;
    if (!authorized) {
        const adminAuth = await authenticateSuperAdmin(req);
        if (!adminAuth.error) authorized = true;
    }
    if (!authorized) {
        return res.status(401).send("Unauthorized cron request.");
    }

    const force = req.body?.force === true;
    const limitRaw = Number(
        req.body?.limit ??
            req.query?.limit ??
            process.env.BOT_RUN_ONCE_BATCH ??
            20,
    );
    const limit = Math.max(
        1,
        Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 20),
    );
    const offsetRaw = Number(req.body?.offset ?? req.query?.offset ?? 0);
    const offset = Math.max(
        0,
        Number.isFinite(offsetRaw) ? Math.floor(offsetRaw) : 0,
    );
    const MAX_POSTS_PER_RUN = Number(process.env.BOT_MAX_POSTS_PER_RUN) || 50;
    const BOT_MIN_ACTIVE_ENCOURAGES_PER_DAY = Math.max(
        15,
        Number(process.env.BOT_MIN_ACTIVE_ENCOURAGES_PER_DAY) || 15,
    );
    const MAX_ENCOURAGES_PER_RUN = Math.max(
        Number(process.env.BOT_MAX_ENCOURAGES_PER_RUN) || 200,
        Math.max(1, limit) * BOT_MIN_ACTIVE_ENCOURAGES_PER_DAY,
    );
    const BOT_DAILY_VIEWS_TARGET =
        Number(process.env.BOT_DAILY_VIEWS_TARGET) || 30;
    const BOT_MIN_POSTS_PER_DAY = Math.max(
        1,
        Number(process.env.BOT_MIN_POSTS_PER_DAY) || 1,
    );
    const BOT_POST_WINDOW_START_MINUTE = Math.max(
        0,
        Number(process.env.BOT_POST_WINDOW_START_MINUTE) || 6 * 60,
    );
    const BOT_POST_WINDOW_END_MINUTE = Math.min(
        23 * 60 + 30,
        Number(process.env.BOT_POST_WINDOW_END_MINUTE) || 22 * 60 + 30,
    );
    const BOT_ENCOURAGE_WINDOW_START_MINUTE = Math.max(
        0,
        Number(process.env.BOT_ENCOURAGE_WINDOW_START_MINUTE) || 7 * 60,
    );
    const BOT_ENCOURAGE_WINDOW_END_MINUTE = Math.min(
        23 * 60 + 45,
        Number(process.env.BOT_ENCOURAGE_WINDOW_END_MINUTE) || 23 * 60,
    );

    function getCurrentUtcMinute(now = new Date()) {
        return now.getUTCHours() * 60 + now.getUTCMinutes();
    }

    function getElapsedWindowEnd(currentMinutes, startMinute, endMinute) {
        return Math.max(startMinute, Math.min(endMinute, currentMinutes));
    }

    function clampMinute(value, min, max) {
        const v = Math.floor(Number(value) || 0);
        return Math.max(min, Math.min(max, v));
    }

    function getBotScheduledPostMinute(bot, dayKey, fallbackMinute = 0) {
        const rawHour = Number(bot?.schedule_hour);
        const hour = Number.isFinite(rawHour)
            ? clampMinute(rawHour, 0, 23)
            : getDeterministicRandom(`${bot?.user_id}:${dayKey}:postHour`, 24);
        const minuteInHour = getDeterministicRandom(
            `${bot?.user_id}:${dayKey}:postMinute`,
            60,
        );
        const minuteOfDay = hour * 60 + minuteInHour;
        return clampMinute(
            Number.isFinite(minuteOfDay) ? minuteOfDay : fallbackMinute,
            BOT_POST_WINDOW_START_MINUTE,
            BOT_POST_WINDOW_END_MINUTE,
        );
    }

    function parseBotMeta(metaValue) {
        try {
            if (!metaValue) return {};
            if (typeof metaValue === "object" && !Array.isArray(metaValue)) {
                return { ...metaValue };
            }
            return JSON.parse(metaValue);
        } catch (_error) {
            return {};
        }
    }

    async function fetchCurrentBotMeta(userId, fallbackMeta = null) {
        try {
            const { data, error } = await supabase
                .from("bots")
                .select("meta")
                .eq("user_id", userId)
                .maybeSingle();
            if (error) throw error;
            return parseBotMeta(data?.meta);
        } catch (_error) {
            return parseBotMeta(fallbackMeta);
        }
    }

    async function persistMergedBotMeta(
        userId,
        metaUpdater,
        extraPayload = {},
    ) {
        const currentMeta = await fetchCurrentBotMeta(userId);
        const nextMeta =
            typeof metaUpdater === "function"
                ? metaUpdater({ ...currentMeta })
                : { ...currentMeta, ...(metaUpdater || {}) };
        await supabase
            .from("bots")
            .update({
                meta: nextMeta,
                ...extraPayload,
            })
            .eq("user_id", userId);
        return nextMeta;
    }

    async function fetchAlreadyEncouragedIds(botUserId, contentIds = []) {
        const uniqueIds = Array.from(
            new Set((contentIds || []).filter(Boolean)),
        );
        if (!botUserId || uniqueIds.length === 0) return new Set();

        try {
            const { data, error } = await supabase
                .from("content_encouragements")
                .select("content_id")
                .eq("user_id", botUserId)
                .in("content_id", uniqueIds);
            if (error) throw error;
            return new Set((data || []).map((row) => String(row.content_id)));
        } catch (error) {
            console.warn(
                `fetchAlreadyEncouragedIds error for ${botUserId}:`,
                error?.message || error,
            );
            return new Set();
        }
    }

    function resolveDailyPostCreatedAt(bot, postMinuteMap, now) {
        const dayKey = now.toISOString().slice(0, 10);
        const fallbackMinute = getElapsedWindowEnd(
            getCurrentUtcMinute(now),
            BOT_POST_WINDOW_START_MINUTE,
            BOT_POST_WINDOW_END_MINUTE,
        );
        const assignedMinute = Number.isFinite(Number(bot?.schedule_hour))
            ? getBotScheduledPostMinute(bot, dayKey, fallbackMinute)
            : (postMinuteMap.get(String(bot.user_id)) ?? fallbackMinute);
        return buildIsoFromMinuteOfDay(
            dayKey,
            assignedMinute,
            `${bot.user_id}:post`,
        );
    }

    function getBotEncouragementBacklog(bot, meta, todayStr, currentMinutes) {
        const dailyTarget = getBotDailyEncourageTarget(
            bot,
            BOT_MIN_ACTIVE_ENCOURAGES_PER_DAY,
        );
        if (
            dailyTarget <= 0 ||
            currentMinutes < BOT_ENCOURAGE_WINDOW_START_MINUTE
        ) {
            return 0;
        }

        const encouragedToday =
            meta.last_action_date === todayStr
                ? Number(meta.encouraged_today) || 0
                : 0;
        if (encouragedToday >= dailyTarget) return 0;

        const elapsedEnd = getElapsedWindowEnd(
            currentMinutes,
            BOT_ENCOURAGE_WINDOW_START_MINUTE,
            BOT_ENCOURAGE_WINDOW_END_MINUTE,
        );
        const fullSpan = Math.max(
            1,
            BOT_ENCOURAGE_WINDOW_END_MINUTE -
                BOT_ENCOURAGE_WINDOW_START_MINUTE +
                1,
        );
        const elapsedSpan = Math.max(
            1,
            elapsedEnd - BOT_ENCOURAGE_WINDOW_START_MINUTE + 1,
        );
        const targetByNow = Math.min(
            dailyTarget,
            Math.max(1, Math.ceil((elapsedSpan / fullSpan) * dailyTarget)),
        );

        return Math.max(0, targetByNow - encouragedToday);
    }

    let globalForcePostsEnabled = false;
    try {
        const { data: forceControl } = await supabase
            .from("bot_control")
            .select("value")
            .eq("key", "bots.force_posts")
            .maybeSingle();
        if (forceControl && forceControl.value !== undefined) {
            const v = forceControl.value;
            if (typeof v === "object") {
                globalForcePostsEnabled =
                    v.enabled === true ||
                    String(v.enabled) === "true" ||
                    Number(v.enabled) === 1;
            } else {
                globalForcePostsEnabled =
                    v === true || String(v) === "true" || String(v) === "1";
            }
        }
    } catch (_error) {
        // ignore and default to false
    }

    async function postAsBot(bot, options = {}) {
        try {
            const createdAt = options.createdAt || new Date().toISOString();
            const dayKey = createdAt.slice(0, 10);
            const todayStartIso = `${dayKey}T00:00:00Z`;
            const nextDayIso = new Date(
                Date.parse(`${dayKey}T00:00:00Z`) + 24 * 60 * 60 * 1000,
            ).toISOString();

            const { count: todayCount } = await supabase
                .from("content")
                .select("*", { count: "exact", head: true })
                .eq("author_type", "USER")
                .eq("author_id", bot.user_id)
                .gte("created_at", todayStartIso)
                .lt("created_at", nextDayIso);

            const postIndex = (todayCount || 0) + 1;

            const { data: recentPosts } = await supabase
                .from("content")
                .select("title, description, media_url")
                .eq("author_type", "USER")
                .eq("author_id", bot.user_id)
                .order("created_at", { ascending: false })
                .limit(20);

            const draft = await buildBotPostDraft({
                bot,
                dayKey,
                postIndex,
                recentPosts: recentPosts || [],
                recentMediaUrls: [
                    ...(recentPosts || [])
                        .map((row) => row?.media_url)
                        .filter(Boolean),
                    ...Array.from(usedVideoUrlsThisRun),
                ],
            });

            let nextDayNumber = 1;
            try {
                const { data: lastRow, error: lastErr } = await supabase
                    .from("content")
                    .select("day_number")
                    .eq("author_type", "USER")
                    .eq("author_id", bot.user_id)
                    .order("day_number", { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (
                    !lastErr &&
                    lastRow &&
                    Number.isFinite(Number(lastRow.day_number))
                ) {
                    nextDayNumber = Number(lastRow.day_number) + 1;
                }
            } catch (_error) {
                // ignore and fallback to 1
            }

            const payload = {
                user_id: bot.user_id,
                day_number: nextDayNumber,
                type: draft.mediaType || "image",
                state: "success",
                title: draft.title,
                description: draft.description,
                hashtags: draft.hashtags,
                media_url: draft.mediaUrl,
                created_at: createdAt,
            };

            const { data, error } = await supabase
                .from("content")
                .insert(payload)
                .select()
                .single();
            if (error) throw error;

            if (draft.mediaType === "video" && draft.mediaUrl) {
                usedVideoUrlsThisRun.add(String(draft.mediaUrl));
            }

            await supabase
                .from("bots")
                .update({
                    last_posted_at: createdAt,
                    last_action_at: new Date().toISOString(),
                })
                .eq("user_id", bot.user_id);
            return data;
        } catch (error) {
            console.warn(
                `postAsBot error for ${bot.user_id}:`,
                error?.message || error,
            );
            return null;
        }
    }

    async function encourageAsBot(bot) {
        try {
            const todayStr = new Date().toISOString().slice(0, 10);
            const { data: candidates, error } = await supabase
                .from("content")
                .select("id, user_id, created_at")
                .neq("user_id", bot.user_id)
                .order("created_at", { ascending: false })
                .limit(800);
            if (error) throw error;
            if (!candidates || candidates.length === 0) return null;

            const alreadyEncouragedIds = await fetchAlreadyEncouragedIds(
                bot.user_id,
                candidates.map((item) => item.id),
            );
            const availableCandidates = candidates.filter(
                (item) =>
                    item?.id && !alreadyEncouragedIds.has(String(item.id)),
            );
            if (availableCandidates.length === 0) return null;

            const userIds = Array.from(
                new Set(
                    availableCandidates.map((c) => c.user_id).filter(Boolean),
                ),
            );
            const usersMap = {};
            if (userIds.length > 0) {
                const { data: users } = await supabase
                    .from("users")
                    .select("id, is_bot")
                    .in("id", userIds);
                if (users && users.length) {
                    users.forEach((user) => {
                        usersMap[user.id] = !!user.is_bot;
                    });
                }
            }

            const prioritized = availableCandidates.filter(
                (item) => !usersMap[item.user_id],
            );
            const pickFrom =
                prioritized.length > 0 ? prioritized : availableCandidates;
            const freshnessPool = pickFrom.slice(
                0,
                Math.min(40, pickFrom.length),
            );
            const target =
                freshnessPool[
                    getDeterministicRandom(
                        `${bot.user_id}:${todayStr}:encourage:${freshnessPool.length}`,
                        freshnessPool.length,
                    )
                ];
            if (!target) return null;

            try {
                await supabase.rpc("increment_views", { row_id: target.id });
            } catch (incErr) {
                console.warn(
                    `increment_views rpc error for ${target.id}:`,
                    incErr?.message || incErr,
                );
            }

            const { data: rpcData, error: rpcErr } = await supabase.rpc(
                "toggle_courage",
                { row_id: target.id, user_id_param: bot.user_id },
            );
            if (rpcErr) throw rpcErr;

            try {
                const serverCount =
                    rpcData &&
                    (Number(rpcData.count) || Number(rpcData.count) === 0
                        ? Number(rpcData.count)
                        : null);
                if (Number.isFinite(serverCount)) {
                    await supabase
                        .from("content")
                        .update({ encouragements_count: serverCount })
                        .eq("id", target.id);
                } else {
                    const { data: row } = await supabase
                        .from("content")
                        .select("encouragements_count")
                        .eq("id", target.id)
                        .maybeSingle();
                    const newCount =
                        row && Number(row.encouragements_count)
                            ? Number(row.encouragements_count) + 1
                            : 1;
                    await supabase
                        .from("content")
                        .update({ encouragements_count: newCount })
                        .eq("id", target.id);
                }
            } catch (err) {
                console.warn(
                    `update encouragements_count error for ${target.id}:`,
                    err?.message || err,
                );
            }

            const nowIso = new Date().toISOString();
            await persistMergedBotMeta(
                bot.user_id,
                (meta) => {
                    if (meta.last_action_date !== todayStr) {
                        meta.last_action_date = todayStr;
                        meta.encouraged_today = 1;
                    } else {
                        meta.encouraged_today =
                            (Number(meta.encouraged_today) || 0) + 1;
                    }
                    return meta;
                },
                {
                    last_encouraged_at: nowIso,
                    last_action_at: nowIso,
                },
            );
            // Notifications for bot actions are intentionally disabled.
            // Real user notifications are created client-side when a user triggers an encouragement.

            return rpcData;
        } catch (error) {
            console.warn(
                `encourageAsBot error for ${bot.user_id}:`,
                error?.message || error,
            );
            return null;
        }
    }

    async function viewAsBot(bot, dailyTarget = BOT_DAILY_VIEWS_TARGET) {
        try {
            const todayStr = new Date().toISOString().slice(0, 10);
            const meta = await fetchCurrentBotMeta(bot.user_id, bot.meta);
            const viewedToday =
                meta.last_viewed_date === todayStr
                    ? Number(meta.viewed_today) || 0
                    : 0;
            const remaining = Math.max(0, Number(dailyTarget) - viewedToday);
            if (remaining <= 0) return 0;

            const seenIds =
                meta.last_viewed_date === todayStr &&
                Array.isArray(meta.viewed_content_ids)
                    ? meta.viewed_content_ids.map(String)
                    : [];
            const seenSet = new Set(seenIds);

            const { data: candidates, error } = await supabase
                .from("content")
                .select("id, user_id, created_at")
                .neq("user_id", bot.user_id)
                .order("created_at", { ascending: false })
                .limit(1000);
            if (error) throw error;

            const available = (candidates || []).filter(
                (item) => item?.id && !seenSet.has(String(item.id)),
            );
            if (available.length === 0) return 0;

            const shuffled = [...available].sort((a, b) => {
                const av = getDeterministicRandom(
                    `${bot.user_id}:${todayStr}:view:${a.id}`,
                    2147483646,
                );
                const bv = getDeterministicRandom(
                    `${bot.user_id}:${todayStr}:view:${b.id}`,
                    2147483646,
                );
                return av - bv;
            });

            const targets = shuffled.slice(0, Math.min(remaining, 30));
            let viewed = 0;
            const viewedIds = [];
            for (const target of targets) {
                try {
                    await supabase.rpc("increment_views", {
                        row_id: target.id,
                    });
                    viewed += 1;
                    viewedIds.push(String(target.id));
                } catch (_error) {
                    // ignore individual failures
                }
            }

            if (viewed > 0) {
                const nowIso = new Date().toISOString();
                await persistMergedBotMeta(
                    bot.user_id,
                    (latestMeta) => {
                        const baseViewed =
                            latestMeta.last_viewed_date === todayStr
                                ? Number(latestMeta.viewed_today) || 0
                                : 0;
                        const baseIds =
                            latestMeta.last_viewed_date === todayStr &&
                            Array.isArray(latestMeta.viewed_content_ids)
                                ? latestMeta.viewed_content_ids.map(String)
                                : [];
                        const mergedIds = Array.from(
                            new Set([...baseIds, ...viewedIds]),
                        ).slice(-180);
                        latestMeta.last_viewed_date = todayStr;
                        latestMeta.viewed_today = baseViewed + viewed;
                        latestMeta.viewed_content_ids = mergedIds;
                        return latestMeta;
                    },
                    { last_action_at: nowIso },
                );
            }

            return viewed;
        } catch (error) {
            console.warn(
                `viewAsBot error for ${bot.user_id}:`,
                error?.message || error,
            );
            return 0;
        }
    }

    try {
        const { data: control } = await supabase
            .from("bot_control")
            .select("value")
            .eq("key", "bots.active_count")
            .maybeSingle();
        const activeCountValue =
            (control && control.value && Number(control.value.count)) || 0;

        const query = supabase
            .from("bots")
            .select("*")
            .eq("active", true)
            .order("last_action_at", { ascending: true });
        query.range(offset, offset + limit - 1);
        const { data: bots, error: botsErr } = await query;
        if (botsErr) throw botsErr;
        const usedVideoUrlsThisRun = new Set();

        const now = new Date();
        const currentMinutes = getCurrentUtcMinute(now);
        const todayStart = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
        const todayStr = todayStart.toISOString().slice(0, 10);
        const shouldForcePostsForRun = force || globalForcePostsEnabled;

        let posts = 0;
        let encourages = 0;
        let views = 0;

        const botUserIds = (bots || [])
            .map((bot) => bot.user_id)
            .filter(Boolean);
        const { data: postsToday } = await supabase
            .from("content")
            .select("user_id")
            .in("user_id", botUserIds)
            .gte("created_at", todayStart.toISOString());

        const postsCountMap = {};
        (postsToday || []).forEach((post) => {
            postsCountMap[post.user_id] =
                (postsCountMap[post.user_id] || 0) + 1;
        });

        const postMinuteMap = buildDistributedMinuteSlots(bots || [], {
            dayKey: todayStr,
            actionKey: "post",
            startMinute: BOT_POST_WINDOW_START_MINUTE,
            endMinute: getElapsedWindowEnd(
                currentMinutes,
                BOT_POST_WINDOW_START_MINUTE,
                BOT_POST_WINDOW_END_MINUTE,
            ),
        });

        for (const bot of bots || []) {
            const meta = parseBotMeta(bot.meta);
            const currentPosts = postsCountMap[bot.user_id] || 0;

            if (
                posts < MAX_POSTS_PER_RUN &&
                currentPosts < BOT_MIN_POSTS_PER_DAY
            ) {
                const scheduledMinute = Number.isFinite(
                    Number(bot?.schedule_hour),
                )
                    ? getBotScheduledPostMinute(bot, todayStr)
                    : postMinuteMap.get(String(bot.user_id));
                const isDue =
                    Number.isFinite(Number(scheduledMinute)) &&
                    currentMinutes >= Number(scheduledMinute);
                if (!shouldForcePostsForRun && !isDue) {
                    // Not time yet for this bot today.
                    continue;
                }
                const createdAt = shouldForcePostsForRun
                    ? new Date().toISOString()
                    : resolveDailyPostCreatedAt(bot, postMinuteMap, now);
                const result = await postAsBot(bot, { createdAt });
                if (result) {
                    posts += 1;
                    postsCountMap[bot.user_id] = currentPosts + 1;
                }
            }

            if (encourages < MAX_ENCOURAGES_PER_RUN) {
                const encouragedToday =
                    meta.last_action_date === todayStr
                        ? Number(meta.encouraged_today) || 0
                        : 0;
                const dailyTarget = getBotDailyEncourageTarget(
                    bot,
                    BOT_MIN_ACTIVE_ENCOURAGES_PER_DAY,
                );
                const remainingToday = Math.max(
                    0,
                    dailyTarget - encouragedToday,
                );
                const backlog = shouldForcePostsForRun
                    ? remainingToday
                    : getBotEncouragementBacklog(
                          bot,
                          meta,
                          todayStr,
                          currentMinutes,
                      );
                const encourageAttempts = Math.min(5, backlog);
                for (let i = 0; i < encourageAttempts; i += 1) {
                    if (encourages >= MAX_ENCOURAGES_PER_RUN) break;
                    const result = await encourageAsBot(bot);
                    if (!result) break;
                    encourages += 1;
                }
            }

            try {
                const viewed = await viewAsBot(bot, BOT_DAILY_VIEWS_TARGET);
                if (viewed) views += viewed;
            } catch (_error) {
                // ignore view errors
            }
        }

        return res.json({
            success: true,
            processed: (bots || []).length,
            offset,
            nextOffset: offset + (bots || []).length,
            posts,
            encourages,
            follows: 0,
            views,
            activeCount: activeCountValue,
        });
    } catch (error) {
        console.error("/api/admin/bots/run-now error", error);
        if (error && error.stack) console.error(error.stack);
        return res.status(500).send("Erreur interne");
    }
});

// ==================== PARTNERSHIPS / COMMISSIONS ====================
app.post("/api/partners/activate", async (req, res) => {
    try {
        const auth = await authenticateRequest(req);
        if (auth.error)
            return res
                .status(auth.error.status)
                .json({ error: auth.error.message });
        const code = normalizeDiscountCode(req.body?.code);
        const pageId = String(req.body?.professional_page_id || "");
        if (!code || !pageId)
            return res
                .status(400)
                .json({ error: "Code partenaire et Page Pro requis." });
        const { data: page, error: pageError } = await supabase
            .from("professional_pages")
            .select("id")
            .eq("id", pageId)
            .eq("owner_id", auth.user.id)
            .maybeSingle();
        if (pageError) throw pageError;
        if (!page)
            return res
                .status(403)
                .json({ error: "Vous ne gérez pas cette Page Pro." });
        const now = new Date().toISOString();
        const { data: partnerCode, error } = await supabase
            .from("partner_codes")
            .select(
                "id, partner_id, status, expires_at, partners!inner(status,start_date,end_date)",
            )
            .eq("code", code)
            .eq("status", "active")
            .eq("partners.status", "active")
            .or(`expires_at.is.null,expires_at.gte.${now}`)
            .maybeSingle();
        if (error) throw error;
        if (partnerCode) {
            const validation = validatePartnerAccess({
                partner: partnerCode.partners,
                accessCode: code,
                now: new Date(now),
            });
            if (!validation.valid)
                return res.status(400).json({
                    error: "Ce code partenaire est hors période de validité.",
                });
        }
        if (!partnerCode)
            return res.status(400).json({
                error: "Ce code partenaire est invalide, expiré ou révoqué.",
            });
        const { data: existing } = await supabase
            .from("partner_page_memberships")
            .select("partner_id,status")
            .eq("professional_page_id", pageId)
            .maybeSingle();
        if (
            existing?.status === "active" &&
            existing.partner_id !== partnerCode.partner_id
        )
            return res.status(409).json({
                error: "Cette Page Pro est déjà rattachée à un autre partenaire.",
            });
        const { data, error: upsertError } = await supabase
            .from("partner_page_memberships")
            .upsert(
                {
                    professional_page_id: pageId,
                    partner_id: partnerCode.partner_id,
                    partner_code_id: partnerCode.id,
                    status: "active",
                    activated_at: now,
                    deactivated_at: null,
                    updated_at: now,
                },
                { onConflict: "professional_page_id" },
            )
            .select("id, partner_id, status")
            .single();
        if (upsertError) throw upsertError;
        await supabase.from("partner_audit_log").insert({
            actor_id: auth.user.id,
            action: "page_partnership_activated",
            entity_type: "partner_page_membership",
            entity_id: data.id,
            metadata: { page_id: pageId, partner_code_id: partnerCode.id },
        });
        res.json({ success: true, membership: data });
    } catch (error) {
        res.status(500).json({
            error: error?.message || "Activation impossible.",
        });
    }
});

app.get("/api/partners/dashboard", async (req, res) => {
    try {
        const auth = await authenticateRequest(req);
        if (auth.error)
            return res
                .status(auth.error.status)
                .json({ error: auth.error.message });
        const pageId = String(req.query.page_id || "");
        const { data: page } = await supabase
            .from("professional_pages")
            .select("id")
            .eq("id", pageId)
            .eq("owner_id", auth.user.id)
            .maybeSingle();
        if (!page) return res.status(403).json({ error: "Accès refusé." });
        const { data: membership, error } = await supabase
            .from("partner_page_memberships")
            .select(
                "id, partner_id, partner_code_id, status, partners!inner(name, status, discount_code, discount_rate)",
            )
            .eq("professional_page_id", pageId)
            .maybeSingle();
        if (error) throw error;
        if (!membership)
            return res.json({ active: false, reason: "not_activated" });
        if (
            membership.status !== "active" ||
            membership.partners.status !== "active"
        )
            return res.json({ active: false, reason: "expired_or_revoked" });
        const { data: activeCode } = await supabase
            .from("partner_codes")
            .select("status,expires_at")
            .eq("id", membership.partner_code_id)
            .maybeSingle();
        if (
            !activeCode ||
            activeCode.status !== "active" ||
            (activeCode.expires_at &&
                new Date(activeCode.expires_at).getTime() < Date.now())
        )
            return res.json({ active: false, reason: "expired_or_revoked" });
        const { data: discountCode } = await supabase
            .from("partner_discount_codes")
            .select("code,discount_percent,status,starts_at,expires_at")
            .eq("partner_id", membership.partner_id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        const resolvedDiscountCode =
            discountCode ||
            (membership.partners.discount_code
                ? {
                      code: membership.partners.discount_code,
                      discount_percent: membership.partners.discount_rate || 20,
                      status: "active",
                  }
                : null);
        const { data: commissions, error: commissionError } = await supabase
            .from("partner_commissions")
            .select(
                "id, amount_gross, commission_amount, status, created_at, beneficiary_user_id, support_transaction_id",
            )
            .eq("partner_id", membership.partner_id)
            .order("created_at", { ascending: false })
            .limit(100);
        if (commissionError) throw commissionError;
        const rows = commissions || [];
        const sum = (status) =>
            rows
                .filter((r) => status.includes(r.status))
                .reduce((n, r) => n + Number(r.commission_amount || 0), 0);
        const affiliateResult = await supabase
            .from("partner_affiliations")
            .select("user_id", { count: "exact", head: true })
            .eq("partner_id", membership.partner_id);
        const [{ data: payoutSetting }, { data: payouts }] = await Promise.all([
            supabase
                .from("partner_payout_settings")
                .select("provider,account_name,wallet_number,status")
                .eq("partner_id", membership.partner_id)
                .maybeSingle(),
            supabase
                .from("partner_payouts")
                .select("amount_usd,status")
                .eq("partner_id", membership.partner_id),
        ]);
        const reserved = (payouts || [])
            .filter((p) => ["processing", "paid"].includes(p.status))
            .reduce((n, p) => n + Number(p.amount_usd || 0), 0);
        const paid = (payouts || [])
            .filter((p) => p.status === "paid")
            .reduce((n, p) => n + Number(p.amount_usd || 0), 0);
        res.json({
            active: true,
            partner: membership.partners.name,
            discountCode: resolvedDiscountCode,
            payoutSetting: payoutSetting || null,
            metrics: {
                total: sum(["pending", "available", "paid"]),
                available: Math.max(0, sum(["available"]) - reserved),
                paid,
                affiliates: affiliateResult.count || 0,
                donations: rows.length,
                donationGross: rows.reduce(
                    (n, r) => n + Number(r.amount_gross || 0),
                    0,
                ),
            },
            commissions: rows,
        });
    } catch (error) {
        res.status(500).json({
            error: error?.message || "Dashboard indisponible.",
        });
    }
});

app.post("/api/partners/payout-settings", async (req, res) => {
    try {
        const auth = await authenticateRequest(req);
        if (auth.error)
            return res
                .status(auth.error.status)
                .json({ error: auth.error.message });

        const pageId = String(req.body?.professional_page_id || "");
        const provider = normalizeMobileMoneyProvider(req.body?.provider);
        const accountName = sanitizePayoutText(req.body?.account_name, 80);
        const walletNumber = sanitizeWalletNumber(req.body?.wallet_number);
        if (!pageId || !provider || !accountName || walletNumber.length < 8) {
            return res.status(400).json({
                error: "Réseau, titulaire et numéro Mobile Money valides requis.",
            });
        }

        const { data: page, error: pageError } = await supabase
            .from("professional_pages")
            .select("id")
            .eq("id", pageId)
            .eq("owner_id", auth.user.id)
            .maybeSingle();
        if (pageError) throw pageError;
        if (!page)
            return res
                .status(403)
                .json({ error: "Vous ne gérez pas cette Page Pro." });

        const { data: membership, error: membershipError } = await supabase
            .from("partner_page_memberships")
            .select("partner_id,status,partners!inner(status)")
            .eq("professional_page_id", pageId)
            .maybeSingle();
        if (membershipError) throw membershipError;
        if (
            !membership ||
            membership.status !== "active" ||
            membership.partners.status !== "active"
        )
            return res.status(403).json({ error: "Partenariat actif requis." });

        const { data, error } = await supabase
            .from("partner_payout_settings")
            .upsert(
                {
                    partner_id: membership.partner_id,
                    provider,
                    account_name: accountName,
                    wallet_number: walletNumber,
                    status: "active",
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "partner_id" },
            )
            .select("provider,account_name,wallet_number,status")
            .single();
        if (error) throw error;
        return res.json({ success: true, payoutSetting: data });
    } catch (error) {
        return res.status(500).json({
            error: error?.message || "Enregistrement du retrait impossible.",
        });
    }
});

app.post("/api/admin/partners", async (req, res) => {
    try {
        const auth = await authenticateSuperAdmin(req);
        if (auth.error)
            return res
                .status(auth.error.status)
                .json({ error: auth.error.message });
        const name = String(req.body?.name || "").trim();
        if (name.length < 2)
            return res.status(400).json({ error: "Nom partenaire invalide." });
        const accessCode = normalizeDiscountCode(
            req.body?.access_code ||
                `PART-${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
        );
        const discountCode = normalizeDiscountCode(
            req.body?.discount_code ||
                `XERA-${crypto.randomBytes(5).toString("hex").toUpperCase()}`,
        );
        const startDate = req.body?.start_date
            ? new Date(req.body.start_date)
            : new Date();
        const endDate = req.body?.end_date
            ? new Date(req.body.end_date)
            : new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);
        if (!/^[A-Z0-9_-]{3,60}$/.test(accessCode))
            return res.status(400).json({ error: "Code partenaire invalide." });
        if (!/^[A-Z0-9_-]{3,60}$/.test(discountCode))
            return res.status(400).json({ error: "Code réduction invalide." });
        if (
            Number.isNaN(startDate.getTime()) ||
            Number.isNaN(endDate.getTime()) ||
            endDate <= startDate
        )
            return res
                .status(400)
                .json({ error: "Période de partenariat invalide." });
        const completePartnerPayload = {
            name,
            status: "active",
            commission_rate: 0.05,
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
            partner_access_code: accessCode,
            access_code: accessCode,
            discount_code: discountCode,
            discount_rate: 20,
        };
        const legacyPartnerPayload = {
            name,
            status: "active",
            commission_rate: 0.05,
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
            partner_access_code: accessCode,
        };
        let { data, error } = await supabase
            .from("partners")
            .insert(completePartnerPayload)
            .select()
            .single();
        const missingColumnCodes = ["42703", "PGRST204", "PGRST205"];
        if (error && missingColumnCodes.includes(error.code)) {
            ({ data, error } = await supabase
                .from("partners")
                .insert(legacyPartnerPayload)
                .select()
                .single());
        }
        if (error) {
            console.error("/api/admin/partners insert failed:", {
                code: error.code,
                message: error.message,
                details: error.details,
            });
            if (
                ["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code)
            ) {
                return res.status(503).json({
                    error: "Le schéma Partenaires est incomplet. Exécutez sql/20260907_partner_commissions_complete.sql dans Supabase, puis rechargez.",
                    diagnostic: {
                        code: error.code,
                        details: error.details || null,
                    },
                });
            }
            if (error.code === "23505")
                return res.status(409).json({
                    error: "Un partenaire portant ce nom existe déjà.",
                });
            throw error;
        }
        const { error: codeError } = await supabase
            .from("partner_codes")
            .upsert(
                {
                    partner_id: data.id,
                    code: accessCode,
                    expires_at: endDate.toISOString(),
                },
                { onConflict: "code" },
            );
        const { error: discountError } = await supabase
            .from("partner_discount_codes")
            .upsert(
                {
                    partner_id: data.id,
                    code: discountCode,
                    discount_percent: 20,
                    status: "active",
                    starts_at: startDate.toISOString(),
                    expires_at: endDate.toISOString(),
                },
                { onConflict: "code" },
            );
        if (codeError || discountError) {
            console.error("/api/admin/partners code setup failed:", {
                codeError: codeError?.message,
                discountError: discountError?.message,
            });
            return res.status(503).json({
                error: "Le partenaire a été créé, mais ses codes ne sont pas disponibles. Exécutez la migration partenaire complète dans Supabase.",
                diagnostic: {
                    code: codeError?.code || discountError?.code || null,
                    details:
                        codeError?.details || discountError?.details || null,
                },
            });
        }
        return res.status(201).json({ partner: data });
    } catch (error) {
        console.error("/api/admin/partners error:", error);
        if (
            [
                "42P01",
                "42703",
                "23502",
                "23514",
                "PGRST204",
                "PGRST205",
                "42501",
            ].includes(error?.code)
        ) {
            return res.status(503).json({
                error: "Le schéma Partenaires Supabase est incomplet ou incompatible. Exécutez sql/20260907_partner_commissions_complete.sql, puis réessayez.",
                diagnostic: {
                    code: error.code,
                    details: error.details || null,
                    hint: error.hint || null,
                },
            });
        }
        if (error?.code === "23505") {
            return res.status(409).json({
                error: "Le nom ou l'un des codes existe déjà. Utilisez des valeurs uniques.",
                diagnostic: {
                    code: error.code,
                    details: error.details || null,
                },
            });
        }
        return res.status(500).json({
            error: error?.message || "Création impossible.",
            diagnostic: {
                code: error?.code || null,
                details: error?.details || null,
                hint: error?.hint || null,
            },
        });
    }
});
app.get("/api/admin/partners", async (req, res) => {
    try {
        const auth = await authenticateSuperAdmin(req);
        if (auth.error)
            return res
                .status(auth.error.status)
                .json({ error: auth.error.message });
        const { data, error } = await supabase
            .from("partners")
            .select(
                "id,name,status,commission_rate,start_date,end_date,created_at,partner_codes(id,code,status,expires_at),partner_discount_codes(id,code,discount_percent,status,starts_at,expires_at)",
            )
            .order("created_at", { ascending: false });
        if (error) throw error;
        res.json({ partners: data || [] });
    } catch (error) {
        res.status(500).json({
            error: error?.message || "Chargement impossible.",
        });
    }
});
app.post("/api/admin/partners/:id/codes", async (req, res) => {
    try {
        const auth = await authenticateSuperAdmin(req);
        if (auth.error)
            return res
                .status(auth.error.status)
                .json({ error: auth.error.message });
        const code = normalizeDiscountCode(req.body?.code);
        const kind = String(req.body?.kind || "");
        const expiresAt = req.body?.expires_at || null;
        if (
            !/^[A-Z0-9_-]{3,60}$/.test(code) ||
            !["partner", "discount"].includes(kind)
        )
            return res.status(400).json({ error: "Code invalide." });
        const table =
            kind === "partner" ? "partner_codes" : "partner_discount_codes";
        const { data: partner, error: partnerError } = await supabase
            .from("partners")
            .select("start_date,end_date,status")
            .eq("id", req.params.id)
            .maybeSingle();
        if (partnerError) throw partnerError;
        if (!partner || partner.status !== "active")
            return res
                .status(404)
                .json({ error: "Partenaire introuvable ou inactif." });
        const payload =
            kind === "partner"
                ? {
                      partner_id: req.params.id,
                      code,
                      expires_at: partner.end_date || expiresAt,
                  }
                : {
                      partner_id: req.params.id,
                      code,
                      discount_percent: 20,
                      starts_at: partner.start_date,
                      expires_at: partner.end_date || expiresAt,
                  };
        const { data, error } = await supabase
            .from(table)
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        res.status(201).json({ code: data });
    } catch (error) {
        res.status(500).json({
            error:
                error?.code === "23505"
                    ? "Ce code existe déjà."
                    : error?.message || "Création impossible.",
        });
    }
});
app.patch(
    "/api/admin/partners/:partnerId/codes/:kind/:codeId",
    async (req, res) => {
        try {
            const auth = await authenticateSuperAdmin(req);
            if (auth.error)
                return res
                    .status(auth.error.status)
                    .json({ error: auth.error.message });
            const table =
                req.params.kind === "partner"
                    ? "partner_codes"
                    : req.params.kind === "discount"
                      ? "partner_discount_codes"
                      : null;
            const status = String(req.body?.status || "");
            if (!table || !["active", "revoked", "expired"].includes(status))
                return res.status(400).json({ error: "Mise à jour invalide." });
            const { data, error } = await supabase
                .from(table)
                .update({
                    status,
                    revoked_at:
                        status === "revoked" ? new Date().toISOString() : null,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", req.params.codeId)
                .eq("partner_id", req.params.partnerId)
                .select()
                .single();
            if (error) throw error;
            await supabase.from("partner_audit_log").insert({
                actor_id: auth.user.id,
                action: "partner_code_updated",
                entity_type: table,
                entity_id: data.id,
                metadata: { status },
            });
            res.json({ success: true, code: data });
        } catch (error) {
            res.status(500).json({
                error: error?.message || "Mise à jour impossible.",
            });
        }
    },
);
app.patch("/api/admin/partners/:id", async (req, res) => {
    try {
        const auth = await authenticateSuperAdmin(req);
        if (auth.error)
            return res
                .status(auth.error.status)
                .json({ error: auth.error.message });
        const status = String(req.body?.status || "");
        if (!["active", "revoked", "expired"].includes(status))
            return res.status(400).json({ error: "Statut invalide." });
        const { data, error } = await supabase
            .from("partners")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", req.params.id)
            .select()
            .single();
        if (error) throw error;
        await supabase.from("partner_audit_log").insert({
            actor_id: auth.user.id,
            action: "partner_updated",
            entity_type: "partners",
            entity_id: data.id,
            metadata: { status },
        });
        res.json({ success: true, partner: data });
    } catch (error) {
        res.status(500).json({
            error: error?.message || "Mise à jour impossible.",
        });
    }
});

if (isDirectRun && SUBSCRIPTION_SWEEP_MS > 0) {
    sweepExpiredSubscriptions();
    setInterval(sweepExpiredSubscriptions, SUBSCRIPTION_SWEEP_MS);
} else if (isDirectRun && SUBSCRIPTION_SWEEP_MS === 0) {
    console.info(
        "Subscription expiry sweep disabled (SUBSCRIPTION_SWEEP_MS=0).",
    );
}

if (isDirectRun) {
    const { startOAuthRefreshScheduler } = require("./oauth-token-manager");
    const { startIngestionWorker } = require("./ingestion-queue");
    startOAuthRefreshScheduler();
    startIngestionWorker();
}

// Démarrer le serveur (local/dev uniquement)
if (isDirectRun) {
    console.info("KPay configuration summary:", {
        gatewayMode: String(KPAY_GATEWAY_MODE),
        publicKey: maskKey(KPAY_PUBLIC_KEY),
        secretKey: maskKey(KPAY_SECRET_KEY),
        publicKeyMode: inferKPayKeyMode(KPAY_PUBLIC_KEY),
        secretKeyMode: inferKPayKeyMode(KPAY_SECRET_KEY),
        callbackEnabled: KPAY_CALLBACK_ENABLED,
        callbackOrigin: CALLBACK_ORIGIN,
    });

    app.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
        logger.debug(`API endpoints available at /api/*`);
        if (supportsEmailReminders()) {
            startReminderScheduler();
        } else {
            console.info(
                "Email reminder scheduler disabled (provider not configured).",
            );
        }
    });
}

module.exports = app;
module.exports.sanitizeSupportMessage = sanitizeSupportMessage;
module.exports.buildSupportNotificationMessage =
    buildSupportNotificationMessage;
module.exports.sweepExpiredSubscriptions = sweepExpiredSubscriptions;
module.exports.sweepReturnReminderEmails = sweepReturnReminderEmails;
module.exports.sendScheduledReturnReminders = sendScheduledReturnReminders;
module.exports.handleKPaySubscriptionCheckout = handleKPaySubscriptionCheckout;
module.exports.handleKPaySupportCheckout = handleKPaySupportCheckout;
module.exports.handleKPayCallback = handleKPayCallback;
module.exports.handlePublicConfig = handlePublicConfig;
module.exports.evaluateTechBadges = evaluateTechBadges;
module.exports.canUserReceiveSupport = canUserReceiveSupport;
