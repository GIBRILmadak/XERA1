const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const webpush = require("web-push");
const crypto = require("crypto");
const { buildBotPostDraft } = require("./bot-post-generator");
const oauthHandler = require("./oauth-handler");
const { startOAuthRefreshScheduler } = require("./oauth-token-manager");
const { startIngestionWorker } = require("./ingestion-queue");
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
const { registerPaymentRoutes } = require("./payment/routes");
const { createPaymentOrchestrator } = require("./payment/orchestrator");

dotenv.config();

const {
    APP_BASE_URL = "http://localhost:3000",
    PORT = 5050,
    SUPABASE_URL = "https://ssbuagqwjptyhavinkxg.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzYnVhZ3F3anB0eWhhdmlua3hnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTk1MjUzMywiZXhwIjoyMDg1NTI4NTMzfQ._aEaTXFxqpfx64bts6Z7FoP3L4oHMGcqoi08yREU33s",
    VAPID_PUBLIC_KEY = "BDyU4kv_cnxruA5n_i3kw0-ipEXZTINrLmwVAhyyFhXsIVC6eImDqhkLVLs77Fl-TJdyOJVZsnp-k6z_7bu0bTM",
    VAPID_PRIVATE_KEY = "6dmRHoFpyGEFgL487qqwBc9BQ184TC8N9Yd3siS94Skpka",
    PUSH_CONTACT_EMAIL = "mailto:hello@xera1.xyz",
    RETURN_REMINDER_HOURS = "10,18",
    RETURN_REMINDER_WINDOW_MINUTES = "15",
    RETURN_REMINDER_SWEEP_MS = "600000",
    RETURN_REMINDER_EMAIL_ENABLED = "0",
    RETURN_REMINDER_EMAIL_PROVIDER = "none",
    RETURN_REMINDER_EMAIL_FROM = "XERA <hello@xera1.xyz>",
    RETURN_REMINDER_EMAIL_REPLY_TO = "hello@xera1.xyz",
    RETURN_REMINDER_EMAIL_API_KEY = "",
    RETURN_REMINDER_EMAIL_WEBHOOK_URL = "",
    RETURN_REMINDER_EMAIL_WEBHOOK_TOKEN = "",
    USD_TO_CDF_RATE = "2300",
    CALLBACK_BASE_URL = "",
    SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID ||
        "b0f9f893-1706-4721-899c-d26ad79afc86",
} = process.env;

// Validate configuration for production
const isProduction =
    String(process.env.NODE_ENV || "").toLowerCase() === "production";
if (isProduction) {
    if (!process.env.MAISHAPAY_PUBLIC_KEY) {
        console.warn("[MaishaPay] MAISHAPAY_PUBLIC_KEY manquant pour la production.");
    }
    if (!process.env.MAISHAPAY_SECRET_KEY) {
        console.warn("[MaishaPay] MAISHAPAY_SECRET_KEY manquant pour la production.");
    }
    if (!process.env.MAISHAPAY_WEBHOOK_TOKEN) {
        console.warn("[MaishaPay] MAISHAPAY_WEBHOOK_TOKEN manquant pour la production.");
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
            console.log("Firebase admin initialized for native push");
        } catch (err) {
            console.warn(
                "Failed to initialize Firebase admin:",
                err?.message || err,
            );
        }
    } else {
        console.info("Firebase admin not configured; native push disabled.");
    }
} catch (err) {
    console.info("firebase-admin not installed; native push disabled.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Routes OAuth
app.use("/api/auth", oauthHandler);

const allowedOrigins = APP_BASE_URL.split(",")
    .map((v) => v.trim())
    .filter(Boolean);

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

app.use(
    cors({
        origin(origin, callback) {
            if (!origin) {
                callback(null, true);
                return;
            }
            if (allowedOrigins.includes(origin) || isLoopbackOrigin(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error("Origin not allowed by CORS"));
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
);

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

const PRIMARY_ORIGIN = stripTrailingSlash(
    allowedOrigins[0] || APP_BASE_URL.split(",")[0] || "http://localhost:3000",
);
const CALLBACK_ORIGIN = resolveCallbackOrigin(
    CALLBACK_BASE_URL,
    PRIMARY_ORIGIN,
);
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
        title || "XERA | Tracez votre progression",
    );
    const safeDescription = escapeHtmlAttr(
        description || "Découvrez les trajectoires créatives sur XERA",
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
        <h1>${escapeHtmlText(title || "XERA")}</h1>
        <p>${escapeHtmlText(description || "Ouverture de XERA...")}</p>
        <p><a href="${safeTargetUrl}">Ouvrir dans XERA</a></p>
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
            title: content.title || "Contenu XERA",
            description: summarizeShareDescription(
                content.description,
                "Découvrez ce contenu sur XERA",
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

        const displayName = user.name || "Profil XERA";
        const shareUrl = buildAbsoluteAppUrl(
            `/share/profile/${encodeURIComponent(user.id)}`,
        );
        const targetUrl = buildAbsoluteAppUrl(
            `/profile?user=${encodeURIComponent(user.id)}`,
        );
        const html = renderOpenGraphSharePage({
            title: `${displayName} | XERA`,
            description: summarizeShareDescription(
                user.bio || user.title,
                "Découvrez ce profil sur XERA",
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

const SUBSCRIPTION_PLANS = {
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
const SUPPORT_COMMISSION_RATE = 0.2;
const SUPPORTED_MOBILE_MONEY_PROVIDERS = new Set([
    "airtel_money",
    "orange_money",
    "mpesa",
    "afrimoney",
    "other",
]);
const MOBILE_MONEY_PROVIDER_LABELS = {
    airtel_money: "Airtel Money",
    orange_money: "Orange Money",
    mpesa: "M-Pesa",
    afrimoney: "Afrimoney",
    other: "Autre",
};

function isValidPlanId(value) {
    return ["standard", "medium", "pro", "elite", "page_verification"].includes(
        String(value || "").toLowerCase(),
    );
}

function computeSubscriptionAmount(plan, billingCycle, currency) {
    const monthlyUsd = SUBSCRIPTION_PLANS[plan];
    if (!monthlyUsd) return null;
    const amountUsd =
        billingCycle === "annual" ? monthlyUsd * 12 * 0.8 : monthlyUsd;
    if (String(currency).toUpperCase() === "CDF") {
        return Math.round(amountUsd * USD_TO_CDF_RATE_VALUE);
    }
    return Math.ceil(amountUsd);
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
    method,
    provider,
    walletId,
    returnPath,
    callbackEnabled = false,
    callbackOrigin = CALLBACK_ORIGIN,
    paymentProvider = "maishapay",
}) {
    const checkoutRefId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const metadata = {
        payment_provider: paymentProvider,
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
    returnPath,
    callbackEnabled = false,
    callbackOrigin = CALLBACK_ORIGIN,
    paymentProvider = "maishapay",
}) {
    const checkoutRefId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const breakdown = computeSupportRevenueBreakdown(amountUsd);
    const metadata = {
        payment_provider: paymentProvider,
        checkout_ref_id: checkoutRefId,
        support_kind: "direct",
        sender_name: senderName || "Utilisateur",
        recipient_name: recipientName || "Créateur",
        method: String(method || "card").toLowerCase(),
        provider: provider || null,
        wallet_id: walletId || null,
        support_amount_usd: breakdown.gross,
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
    const normalized = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    return SUPPORTED_MOBILE_MONEY_PROVIDERS.has(normalized) ? normalized : null;
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

function sendCheckoutErrorResponse(res, error, fallbackMessage) {
    const sourceCode = String(error?.code || "").trim() || "UNKNOWN";
    let category = "checkout_failure";

    if (isMissingRelationError(error) || isMissingColumnError(error)) {
        category = "schema_missing";
        setResponseHeader(res, "X-Xera-Error-Category", category);
        setResponseHeader(res, "X-Xera-Error-Code", sourceCode);
        return res.status(503).send(getWalletSchemaErrorMessage());
    }

    if (isForeignKeyViolation(error)) {
        category = "foreign_key_violation";
        setResponseHeader(res, "X-Xera-Error-Category", category);
        setResponseHeader(res, "X-Xera-Error-Code", sourceCode);
        return res
            .status(409)
            .send(
                "Profil utilisateur incomplet dans la base. Deconnectez-vous puis reconnectez-vous avant de reessayer.",
            );
    }

    if (isNotNullViolation(error)) {
        category = "not_null_violation";
        setResponseHeader(res, "X-Xera-Error-Category", category);
        setResponseHeader(res, "X-Xera-Error-Code", sourceCode);
        return res
            .status(409)
            .send(
                getReadableServerErrorMessage(
                    error,
                    "Certaines donnees du profil utilisateur sont manquantes pour lancer le paiement.",
                ),
            );
    }

    setResponseHeader(res, "X-Xera-Error-Category", category);
    setResponseHeader(res, "X-Xera-Error-Code", sourceCode);

    if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
        return res
            .status(500)
            .send(getReadableServerErrorMessage(error, fallbackMessage));
    }

    return res.status(500).send(fallbackMessage);
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
        videoPayoutsResult,
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
            .in("type", ["support", "video_rpm"])
            .in("status", ["pending", "succeeded"])
            .order("created_at", { ascending: false }),
        supabase
            .from("video_payouts")
            .select(
                "id, period_month, views, rpm_rate, amount_gross, amount_net_creator, amount_commission_xera, status, paid_at, created_at",
            )
            .eq("creator_id", userId)
            .in("status", ["pending", "processing", "paid"])
            .order("period_month", { ascending: false }),
        fetchCreatorPayoutSettings(userId),
        fetchCreatorWithdrawalRequests(userId, { limit: 20 }),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (transactionsResult.error) throw transactionsResult.error;
    if (videoPayoutsResult.error) throw videoPayoutsResult.error;

    const profile = profileResult.data || null;
    const revenueTransactions = transactionsResult.data || [];
    const videoPayouts = videoPayoutsResult.data || [];
    const payoutSettings = payoutSettingsResult || null;
    const withdrawals = withdrawalsResult || [];

    let supportAvailable = 0;
    let supportPending = 0;
    let videoAvailable = 0;
    let videoPending = 0;

    revenueTransactions.forEach((tx) => {
        if (!tx) return;
        const net = resolveTransactionNetAmount(tx);
        if (tx.type === "support") {
            if (tx.status === "succeeded") supportAvailable += net;
            if (tx.status === "pending") supportPending += net;
        }
        if (tx.type === "video_rpm") {
            if (tx.status === "succeeded") videoAvailable += net;
            if (tx.status === "pending") videoPending += net;
        }
    });

    // Correction de la logique de revenus vidéo si les transactions ne sont pas encore créées
    const hasVideoRevenueTransactions = revenueTransactions.some(
        (tx) => tx.type === "video_rpm",
    );
    if (!hasVideoRevenueTransactions) {
        // Si pas de transactions de type video_rpm, on se base sur les payouts calculés
        videoAvailable = 0;
        videoPending = 0;
        videoPayouts.forEach((payout) => {
            if (!payout) return;
            const net = roundMoney(payout.amount_net_creator);
            if (payout.status === "paid") videoAvailable += net;
            if (["pending", "processing"].includes(payout.status)) {
                videoPending += net;
            }
        });
    }

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

    const creditedBalance = roundMoney(supportAvailable + videoAvailable);
    const pendingIncoming = roundMoney(supportPending + videoPending);
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
            videoAvailable: roundMoney(videoAvailable),
            videoPending: roundMoney(videoPending),
            minimumWithdrawalUsd: WITHDRAWAL_MIN_USD,
            canRequestWithdrawal:
                availableBalance >= WITHDRAWAL_MIN_USD &&
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
    confirmationSource = "maishapay",
    confirmedBy,
    note,
    alreadyClaimed = false,
}) {
    const paymentId = transactionRefId ? `maishapay_${transactionRefId}` : null;
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
                "id, from_user_id, to_user_id, amount_gross, currency, status, metadata, effects_applied_at",
            )
            .eq("id", pendingTransactionId)
            .maybeSingle();
        if (error) throw error;
        if (!data) {
            throw new Error("Paiement en attente introuvable.");
        }
        if (alreadyClaimed) {
            if (data.effects_applied_at) {
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
        } else {
            if (String(data.status || "").toLowerCase() === "succeeded") {
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
    const periodEnd =
        billingCycle === "annual" ? addMonths(now, 12) : addMonths(now, 1);
    const periodEndIso = periodEnd.toISOString();

    let badgeToApply = badgeForPlan;
    let followersCount = 0;
    try {
        const { data: profile } = await supabase
            .from("users")
            .select("badge, followers_count")
            .eq("id", userId)
            .maybeSingle();
        const existingBadge = String(profile?.badge || "").toLowerCase();
        followersCount = Number(profile?.followers_count || 0);
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
    const isMonetized =
        ["medium", "pro", "elite"].includes(normalizedPlan) &&
        followersCount >= 1000;

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
        payment_provider: pendingPayment?.metadata?.payment_provider || "maishapay",
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

    let transactionId = pendingTransactionId || null;
    if (pendingTransactionId) {
        const updatePayload = alreadyClaimed
            ? {
                  effects_applied_at: nowIso,
                  description: `Abonnement ${plan} (${billingCycle})`,
                  metadata: mergedMetadata,
                  updated_at: nowIso,
              }
            : {
                  amount_gross: amount,
                  amount_net_creator: 0,
                  amount_commission_xera: 0,
                  currency,
                  status: "succeeded",
                  effects_applied_at: nowIso,
                  description: `Abonnement ${plan} (${billingCycle})`,
                  metadata: mergedMetadata,
                  updated_at: nowIso,
              };
        const { error: updateTxError } = await supabase
            .from("transactions")
            .update(updatePayload)
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

function isPlanActiveForUser(user) {
    if (!user) return false;
    const status = String(user.plan_status || "").toLowerCase();
    if (status !== "active") return false;
    const planEnd = user.plan_ends_at || null;
    if (!planEnd) return true;
    const endMs = Date.parse(planEnd);
    if (!Number.isFinite(endMs)) return true;
    return endMs > Date.now();
}

function isGiftedProUser(user) {
    if (!user) return false;
    return (
        ["pro", "elite"].includes(String(user.plan || "").toLowerCase()) &&
        String(user.plan_status || "").toLowerCase() === "active" &&
        !user.plan_ends_at
    );
}

function canUserReceiveSupport(user) {
    if (!user) return false;
    const plan = String(user.plan || "").toLowerCase();
    if (!["medium", "pro", "elite"].includes(plan)) return false;
    if (!isPlanActiveForUser(user)) return false;
    if (isGiftedProUser(user)) return true;
    return (
        user.is_monetized === true || Number(user.followers_count || 0) >= 1000
    );
}

function formatMoneyUsd(value) {
    const amount = roundMoney(value);
    return `$${amount.toFixed(2)}`;
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
    };

    const title = typeTitleMap[notification?.type] || "Notification XERA";
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
        tag: notification?.id || `support-${notification?.user_id || "xera"}`,
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
                                title: String(payloadWithBadge.title || "XERA"),
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
    confirmationSource = "maishapay",
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
    confirmationSource = "maishapay",
    alreadyClaimed = false,
}) {
    const paymentId = transactionRefId ? `maishapay_${transactionRefId}` : null;
    const breakdown = computeSupportRevenueBreakdown(amountUsd);

    let pendingPayment = null;
    if (pendingTransactionId) {
        const { data, error } = await supabase
            .from("transactions")
            .select(
                "id, from_user_id, to_user_id, type, amount_gross, currency, status, description, metadata, effects_applied_at",
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
        if (alreadyClaimed) {
            if (data.effects_applied_at) {
                return {
                    alreadyConfirmed: true,
                    transactionId: data.id,
                };
            }
        } else {
            if (String(data.status || "").toLowerCase() === "succeeded") {
                return {
                    alreadyConfirmed: true,
                    transactionId: data.id,
                };
            }
            if (String(data.status || "").toLowerCase() !== "pending") {
                throw new Error("Ce soutien ne peut plus être confirmé.");
            }
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
        payment_provider: pendingPayment?.metadata?.payment_provider || "maishapay",
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
        const updatePayload = alreadyClaimed
            ? {
                  effects_applied_at: nowIso,
                  description:
                      description ||
                      pendingPayment?.description ||
                      "Soutien XERA",
                  metadata: mergedMetadata,
                  updated_at: nowIso,
              }
            : {
                  from_user_id: fromUserId,
                  to_user_id: toUserId,
                  amount_gross: breakdown.gross,
                  amount_net_creator: breakdown.netCreator,
                  amount_commission_xera: breakdown.commission,
                  currency: "USD",
                  status: "succeeded",
                  effects_applied_at: nowIso,
                  description:
                      description ||
                      pendingPayment?.description ||
                      "Soutien XERA",
                  metadata: mergedMetadata,
                  updated_at: nowIso,
              };
        const { error: updateError } = await supabase
            .from("transactions")
            .update(updatePayload)
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
                description: description || "Soutien XERA",
                metadata: mergedMetadata,
            })
            .select("id")
            .single();
        if (error) throw error;
        transactionId = data.id;
    }

    const senderName =
        senderProfile?.name || mergedMetadata.sender_name || "Un utilisateur";
    const notification = await createNotificationRecord({
        userId: toUserId,
        type: "support",
        message: `${senderName} vous a envoye ${formatMoneyUsd(breakdown.gross)} de soutien.`,
        link: `/creator-dashboard`,
        actorId: fromUserId,
        metadata: {
            transaction_id: transactionId,
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
    const safeCtaLabel = String(ctaLabel || "Découvrir sur XERA").trim();
    const safeCtaUrl = String(ctaUrl || buildDiscoverReminderUrl()).trim();
    const safeFooter = String(
        footer ||
            "Tu reçois ce message car tu as activé les notifications par email sur XERA. Tu peux les désactiver à tout moment dans tes réglages.",
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
              <img src="https://ssbuagqwjptyhavinkxg.supabase.co/storage/v1/object/public/assets/logo-512x512.png" alt="XERA" style="width:56px;height:56px;border-radius:14px;display:block;" />
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:0 40px 40px 40px;">
              <div style="font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#6366f1;margin-bottom:16px;">
                ${escapeHtmlAttr(eyebrow || "XERA Update")}
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
                &copy; ${new Date().getFullYear()} XERA. Tous droits réservés.
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
            subject: `XERA - ${arcTitle} t'attend toujours`,
            headline: "Si tu as 30 secondes, reviens nous montrer ou tu en es.",
            bodyLines: [
                `Ton projet "${arcTitle}" est toujours en cours.`,
                "Pas besoin d'un long texte: une petite update suffit pour garder le fil.",
            ],
            ctaLabel: "Revenir poster",
        },
        {
            subject: `XERA - On n'a pas oublie ${arcTitle}`,
            headline: "On n'a pas oublie ton projet.",
            bodyLines: [
                `Tu peux revenir sur "${arcTitle}" quand tu veux.`,
                "Une photo, deux lignes, un point rapide: tout compte.",
            ],
            ctaLabel: "Ouvrir mon update",
        },
        {
            subject: `XERA - Tu veux remettre ${arcTitle} en mouvement ?`,
            headline: "Tu peux remettre ton projet en mouvement aujourd'hui.",
            bodyLines: [
                `"${arcTitle}" merite sa petite mise a jour du jour.`,
                "Le plus dur, c'est souvent d'ouvrir l'app. On te facilite le retour.",
            ],
            ctaLabel: "Publier en un clic",
        },
        {
            subject: `XERA - Un petit signe de vie pour ${arcTitle} ?`,
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

    const subject = "Ça bouge fort sur XERA 🚀 (tu manques à l'appel)";
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
            subject: `XERA - ${authorName} a publie quelque chose de nouveau`,
            headline: "Ca bouge encore du cote des comptes que tu suis.",
            bodyLines: [
                `${authorName} a partage ${activityTitle}.`,
                "Si tu veux reprendre le rythme, c'est peut-etre le bon moment pour revenir.",
            ],
            ctaLabel: "Voir ce qu'il y a de neuf",
        },
        {
            subject:
                "XERA - Pendant ton absence, quelques updates sont tombees",
            headline: "Tu as peut-etre manque deux ou trois choses.",
            bodyLines: [
                `${activityCount} update${activityCount > 1 ? "s" : ""} recente${activityCount > 1 ? "s" : ""} viennent d'apparaitre chez les comptes que tu suis.`,
                "Reviens jeter un oeil, puis publier la tienne si tu en as envie.",
            ],
            ctaLabel: "Retourner dans l'app",
        },
        {
            subject: "XERA - Les autres avancent, et ta place est toujours la",
            headline: "Les autres avancent, et ta place est toujours la.",
            bodyLines: [
                `${authorName} et d'autres continuent a documenter leur progression.`,
                "Reviens voir ce qui se passe et poster la tienne quand tu veux.",
            ],
            ctaLabel: "Revenir sur XERA",
        },
        {
            subject: "XERA - Il y a du nouveau dans ton reseau",
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
        eyebrow: "Pendant ce temps sur XERA",
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
            .select("id, user_id, title, created_at, arc_id")
            .in("user_id", userIds)
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
        if (!latestOwnContentByUser.has(row.user_id)) {
            latestOwnContentByUser.set(row.user_id, row);
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
                .select("id, user_id, title, created_at, arc_id")
                .in("user_id", followedUserIds)
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
        if (!recentSocialByAuthor.has(row.user_id)) {
            recentSocialByAuthor.set(row.user_id, []);
        }
        recentSocialByAuthor.get(row.user_id).push(row);
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
    if (!supportsEmailReminders()) return { success: false, skipped: true };
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

async function sweepReturnReminderEmails(now = new Date()) {
    if (!supportsEmailReminders()) return { ok: true, skipped: true };

    const { data: users, error } = await supabase
        .from("users")
        .select(
            "id, name, email_reminder_enabled, email_reminder_timezone, last_email_reminder_slot, last_inactive_reminder_sent_at, last_social_progress_email_sent_at",
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
                title: campaign.subject.replace("XERA - ", "XERA • "),
                body: campaign.text
                    .split("\n")
                    .filter((l) => l.trim())
                    .slice(1, 3)
                    .join(" "),
                icon: "/icons/logo-192x192.png",
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

// ==================== MAISHAPAY PAYMENT MODULE ====================

const paymentOrchestrator = createPaymentOrchestrator({
    supabase,
    activateSubscription,
    confirmSupportPayment,
    createPendingSubscriptionPayment,
    createPendingSupportPayment,
    computeSubscriptionAmount,
    computeSupportCheckoutAmount,
    resolveRequestUser,
    getUserProfile: async (id) => {
        const { data } = await supabase
            .from("users")
            .select("*")
            .eq("id", id)
            .maybeSingle();
        return data;
    },
    canUserReceiveSupport,
    logger: console,
});

registerPaymentRoutes(app, {
    supabase,
    orchestrator: paymentOrchestrator,
    resolveRequestUser,
    computeSubscriptionAmount,
    computeSupportCheckoutAmount,
    createPendingSubscriptionPayment,
    createPendingSupportPayment,
    activateSubscription,
    confirmSupportPayment,
    getUserProfile: async (id) => {
        const { data } = await supabase
            .from("users")
            .select("*")
            .eq("id", id)
            .maybeSingle();
        return data;
    },
    canUserReceiveSupport,
    logger: console,
});

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
            eyebrow: "Annonce XERA",
            greeting: "Bonjour,",
            headline: subject,
            bodyLines: body.split("\n"),
            ctaLabel: ctaLabel || "Ouvrir XERA",
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
                            subject: `XERA - ${subject}`,
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
            .select("badge, followers_count")
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
        const badgeToApply = PROTECTED_BADGES.has(existingBadge)
            ? profile.badge
            : badgeForPlan;
        const followersCount = Number(profile.followers_count || 0);
        const isMonetized =
            normalizedPlan === "pro"
                ? true
                : normalizedPlan === "medium" && followersCount >= 1000;

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
            .in("metadata->>payment_provider", ["maishapay", "kpay"])
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

app.post("/api/admin/subscription-payments/confirm", async (req, res) => {
    try {
        const authResult = await authenticateSuperAdmin(req);
        if (authResult.error) {
            return res
                .status(authResult.error.status)
                .json({ error: authResult.error.message });
        }

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
            .in("metadata->>payment_provider", ["maishapay", "kpay"])
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

        const { payment_id: paymentId, reason } = req.body || {};
        if (!paymentId) {
            return res.status(400).json({ error: "Paiement manquant." });
        }

        const { data: paymentRow, error: paymentError } = await supabase
            .from("transactions")
            .select("id, status, metadata")
            .eq("id", paymentId)
            .eq("type", "subscription")
            .in("metadata->>payment_provider", ["maishapay", "kpay"])
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
            videoRevenue: 0,
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
                } else if (tx.type === "video_rpm") {
                    summary.videoRevenue += net;
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
        if (requestedAmount > overview.wallet.availableBalance) {
            return res.status(400).json({
                error: "Solde disponible insuffisant pour ce retrait.",
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
                status: "pending",
                requested_at: new Date().toISOString(),
            })
            .select("*")
            .single();
        if (error) throw error;

        return res.json({
            success: true,
            withdrawal: extractWithdrawalRequest(data),
        });
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
    res.json({
        usdToCdfRate: USD_TO_CDF_RATE_VALUE,
        paymentProvider: "maishapay",
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
            algorithm: "xera-v2-composite", // Identifie l'algo utilisé
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
        .select("user_id, created_at")
        .gte("created_at", startIso);

    if (rowsError) {
        throw rowsError;
    }

    // Build per-user date sets and last post timestamp
    const map = new Map();
    (rows || []).forEach((r) => {
        const uid = String(r.user_id || "").trim();
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
                    .eq("user_id", uid)
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
        console.log("delete-all: found", botUserIds.length, "bots");

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

        console.log("delete-all: success", deleted);
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
                .eq("user_id", bot.user_id)
                .gte("created_at", todayStartIso)
                .lt("created_at", nextDayIso);

            const postIndex = (todayCount || 0) + 1;

            const { data: recentPosts } = await supabase
                .from("content")
                .select("title, description, media_url")
                .eq("user_id", bot.user_id)
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
                    .eq("user_id", bot.user_id)
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

if (isDirectRun && SUBSCRIPTION_SWEEP_MS > 0) {
    sweepExpiredSubscriptions();
    setInterval(sweepExpiredSubscriptions, SUBSCRIPTION_SWEEP_MS);
} else if (isDirectRun && SUBSCRIPTION_SWEEP_MS === 0) {
    console.info(
        "Subscription expiry sweep disabled (SUBSCRIPTION_SWEEP_MS=0).",
    );
}

if (isDirectRun) {
    startOAuthRefreshScheduler();
    startIngestionWorker();
}

// Démarrer le serveur (local/dev uniquement)
if (isDirectRun) {
    console.info("MaishaPay configuration summary:", {
        provider: "maishapay",
        gatewayMode: process.env.MAISHAPAY_GATEWAY_MODE || "0",
    });

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`API endpoints available at /api/*`);
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
module.exports.sweepExpiredSubscriptions = sweepExpiredSubscriptions;
module.exports.sweepReturnReminderEmails = sweepReturnReminderEmails;
module.exports.sendScheduledReturnReminders = sendScheduledReturnReminders;
module.exports.handlePublicConfig = handlePublicConfig;
module.exports.evaluateTechBadges = evaluateTechBadges;
