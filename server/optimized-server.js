const express = require("express");
const fs = require("fs");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const logger = require("./logger");
const { createClient } = require("@supabase/supabase-js");
const webpush = require("web-push");

dotenv.config();

const oauthHandler = require("./oauth-handler");

const {
    APP_BASE_URL = "http://localhost:3000",
    APP_FRONTEND_URL = "",
    PORT = 5050,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
    PUSH_CONTACT_EMAIL = "mailto:hello@xera1.xyz",
    RETURN_REMINDER_HOURS = "10,18",
    RETURN_REMINDER_WINDOW_MINUTES = "15",
    RETURN_REMINDER_SWEEP_MS = "60000",
} = process.env;

// Configuration Supabase
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

// Configuration VAPID pour push notifications
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn(
        "Warning: Missing VAPID keys. Push notifications will not be sent.",
    );
} else {
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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const app = express();

// Middleware optimisé
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const allowedOrigins = [APP_BASE_URL, APP_FRONTEND_URL]
    .flatMap((value) => String(value || "").split(","))
    .map((v) => v.trim())
    .filter(Boolean);

function isLocalDevelopmentOrigin(origin) {
    const localHosts = new Set([
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "[::1]",
        "::1",
    ]);
    const hasProductionOrigin = allowedOrigins.some((configuredOrigin) => {
        try {
            const configuredUrl = new URL(configuredOrigin);
            return (
                configuredUrl.protocol === "https:" ||
                !localHosts.has(configuredUrl.hostname)
            );
        } catch (_) {
            return false;
        }
    });
    if (process.env.NODE_ENV === "production" || hasProductionOrigin) {
        return false;
    }
    try {
        const url = new URL(origin);
        return (
            url.protocol === "http:" &&
            localHosts.has(url.hostname)
        );
    } catch (_) {
        return false;
    }
}

app.use(
    cors({
        origin(origin, callback) {
            callback(
                null,
                !origin ||
                    allowedOrigins.includes(origin) ||
                    isLocalDevelopmentOrigin(origin),
            );
        },
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    }),
);

app.use("/api/auth", oauthHandler);

const PRIMARY_ORIGIN =
    APP_FRONTEND_URL.split(",")[0]?.trim() ||
    allowedOrigins[0] ||
    APP_BASE_URL.split(",")[0] ||
    "http://localhost:3000";

// Configuration du cache et headers optimisés
const CACHE_DURATION = 365 * 24 * 60 * 60; // 1 an en secondes
const HTML_CACHE_DURATION = 60; // 1 minute pour HTML

// Session management avec timeout 4h
const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 heures
const activeSessions = new Map();

function checkSessionTimeout(userId) {
    const session = activeSessions.get(userId);
    if (!session) return false;

    const now = Date.now();
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
        activeSessions.delete(userId);
        return false;
    }

    session.lastActivity = now;
    return true;
}

function updateSessionActivity(userId) {
    activeSessions.set(userId, {
        lastActivity: Date.now(),
        createdAt: activeSessions.get(userId)?.createdAt || Date.now(),
    });
}

// Middleware pour vérifier le timeout de session
function requireValidSession(req, res, next) {
    const token = getBearerToken(req);
    if (!token) {
        return res.status(401).json({
            error: "Session expired. Please reconnect.",
            code: "SESSION_EXPIRED",
            requireReconnect: true,
        });
    }

    // Extraire l'userId du token et vérifier
    try {
        const { data: authData } = supabase.auth.getUser(token);
        if (authData?.user?.id) {
            const userId = authData.user.id;
            if (!checkSessionTimeout(userId)) {
                return res.status(401).json({
                    error: "Session expired after 4h inactivity. Please reconnect.",
                    code: "SESSION_TIMEOUT",
                    requireReconnect: true,
                });
            }
            updateSessionActivity(userId);
        }
    } catch (e) {
        // Continuer si la vérification échoue
    }

    next();
}

// Servir les fichiers statiques avec cache optimisé
app.use(
    express.static(path.join(__dirname, ".."), {
        maxAge: CACHE_DURATION * 1000,
        etag: true,
        lastModified: true,
        setHeaders: (res, filePath) => {
            const ext = path.extname(filePath);

            // Headers spécifiques par type de fichier
            if (ext === ".html") {
                res.setHeader(
                    "Cache-Control",
                    `public, max-age=${HTML_CACHE_DURATION}`,
                );
            } else if (ext === ".js" || ext === ".css") {
                res.setHeader(
                    "Cache-Control",
                    `public, max-age=${CACHE_DURATION}, immutable`,
                );
            } else if (/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(ext)) {
                res.setHeader(
                    "Cache-Control",
                    `public, max-age=${CACHE_DURATION}, immutable`,
                );
            } else if (ext === ".json") {
                res.setHeader(
                    "Cache-Control",
                    `public, max-age=${HTML_CACHE_DURATION}`,
                );
            }

            // Security headers
            res.setHeader("X-Content-Type-Options", "nosniff");
            res.setHeader("X-Frame-Options", "DENY");
            res.setHeader("X-XSS-Protection", "1; mode=block");
        },
    }),
);

// Compression pour les réponses
app.use((req, res, next) => {
    res.setHeader("Vary", "Accept-Encoding");
    next();
});

// --- ROUTES SEO & MACHINE DISCOVERABILITY ---
app.get("/llm.txt", (req, res) => {
    const filePath = path.join(__dirname, "..", "llm.txt");
    if (fs.existsSync(filePath)) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate");
        return res.sendFile(filePath);
    }
    return res.status(404).type("text/plain").send("llm.txt non trouvé");
});

app.get("/robots.txt", (req, res) => {
    const filePath = path.join(__dirname, "..", "robots.txt");
    if (fs.existsSync(filePath)) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.sendFile(filePath);
    }
    return res.status(200).type("text/plain").send("User-agent: *\nAllow: /\nSitemap: https://xera1.xyz/sitemap.xml\n");
});

app.get("/sitemap.xml", async (req, res) => {
    try {
        const sitemapHandler = require("../api/sitemap");
        return await sitemapHandler(req, res);
    } catch (e) {
        console.error("Sitemap route error:", e);
        return res.status(500).send("Erreur lors de la génération du sitemap");
    }
});

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        server: "optimized",
        push: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
        sessionTimeout: "4h",
        cache: "enabled",
    });
});

// Fata linkage and challenge status for the authenticated XERA1 user.
app.get("/api/fata/status", async (req, res) => {
    const token = getBearerToken(req);
    if (!token) {
        return res.status(401).json({ error: "Utilisateur non identifié" });
    }

    try {
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ error: "Utilisateur non identifié" });
        }

        const [linkageResult, pendingResult, qualificationResult] =
            await Promise.all([
                supabase
                    .from("fata_linkages")
                    .select("*")
                    .eq("user_id", user.id)
                    .maybeSingle(),
                supabase
                    .from("fata_pending_events")
                    .select("*")
                    .eq("user_id", user.id)
                    .order("created_at", { ascending: false }),
                supabase
                    .from("fata_qualifications")
                    .select("*")
                    .eq("user_id", user.id)
                    .maybeSingle(),
            ]);

        const queryError =
            linkageResult.error ||
            pendingResult.error ||
            qualificationResult.error;
        if (queryError) throw queryError;

        const linkage = linkageResult.data || null;
        return res.json({
            connected: Boolean(linkage),
            linkage,
            qualification: qualificationResult.data || null,
            pendingEvents: pendingResult.data || [],
        });
    } catch (error) {
        console.error("Fata status error:", error?.message || "query failed");
        return res.status(500).json({ error: "Failed to fetch Fata status" });
    }
});

// Importer les fonctions du serveur original
const REMINDER_HOURS = RETURN_REMINDER_HOURS.split(",")
    .map((value) => parseInt(value.trim(), 10))
    .filter((hour) => Number.isFinite(hour) && hour >= 0 && hour <= 23)
    .sort((a, b) => a - b);

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
    return message.includes("column") && message.includes("does not exist");
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
    if (parts.minute < 0 || parts.minute >= 15) return null;
    const hourKey = String(slotHour).padStart(2, "0");
    return {
        hour: slotHour,
        dateKey: parts.dateKey,
        slotKey: `${parts.dateKey}-${hourKey}`,
    };
}

function buildProfileRoute(userId, accountType) {
    if (!userId) return "/profile";
    const isPro = [
        "community",
        "enterprise",
        "company",
        "pro",
        "communauté",
        "entreprise",
        "institution",
        "organization",
        "organisation",
        "org",
        "team",
    ].includes(
        String(accountType || "")
            .trim()
            .toLowerCase(),
    );
    const route = isPro ? "/pagepro" : "/profile";
    return `${route}?user=${encodeURIComponent(userId)}`;
}

function buildReturnReminderPayload(userId, slot) {
    const isMorning = slot.hour < 14;
    const title = isMorning ? "Rappel XERA1 • 10h" : "Rappel XERA1 • 18h";
    const body = isMorning
        ? "Prends 2 minutes pour documenter ta progression ce matin."
        : "Pense à documenter ta progression de la journée sur XERA1.";
    const icon = `${PRIMARY_ORIGIN.replace(/\/$/, "")}/icons/logo.png`;
    return {
        title,
        body,
        icon,
        link: `${PRIMARY_ORIGIN.replace(/\/$/, "")}${buildProfileRoute(userId)}`,
        tag: `xera1-return-reminder-${slot.slotKey}`,
        renotify: false,
        silent: false,
    };
}

async function purgeStaleSubscription(endpoint) {
    if (!endpoint) return;
    try {
        await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", endpoint);
        logger.debug("Removed stale subscription", endpoint);
    } catch (error) {
        console.error("Failed to remove stale subscription", endpoint, error);
    }
}

async function sendPushToSubscription(sub, payload) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY)
        return { success: false, skipped: true };
    if (!sub?.endpoint || !sub?.keys) return { success: false, skipped: true };

    const payloadString = JSON.stringify(payload);
    const subscription = {
        endpoint: sub.endpoint,
        keys: sub.keys,
    };

    try {
        await webpush.sendNotification(subscription, payloadString);
        return { success: true };
    } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
            await purgeStaleSubscription(sub.endpoint);
            return { success: false, stale: true };
        }
        console.error("send push error", err);
        return { success: false, error: err };
    }
}

function getBearerToken(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== "string") return "";
    const [scheme, token] = authHeader.split(" ");
    if (!scheme || !token) return "";
    if (scheme.toLowerCase() !== "bearer") return "";
    return token.trim();
}

function getUserAccessState(profile, authUser) {
    const normalizedRole = String(profile?.role || "normal").toLowerCase();
    const normalizedTier = String(
        profile?.subscription_tier || profile?.plan || "normal",
    )
        .toLowerCase()
        .trim();
    const normalizedStatus = String(
        profile?.subscription_status || profile?.plan_status || "inactive",
    )
        .toLowerCase()
        .trim();

    const isProByRole = ["pro", "admin"].includes(normalizedRole);
    const isProByTier =
        normalizedTier === "pro" &&
        ["active", "trialing", "premium"].includes(normalizedStatus);
    const isPro = Boolean(
        profile?.is_pro ||
        isProByRole ||
        isProByTier ||
        normalizedTier === "pro",
    );

    return {
        id: profile?.id || authUser?.id || null,
        email: authUser?.email || profile?.email || null,
        name:
            profile?.name ||
            authUser?.user_metadata?.full_name ||
            authUser?.email ||
            null,
        role: isProByRole ? "pro" : "normal",
        is_pro: isPro,
        plan: profile?.plan || "free",
        plan_status: profile?.plan_status || "inactive",
        subscription_tier: isPro ? "pro" : "normal",
        subscription_status: normalizedStatus || "inactive",
        subscription_ends_at: profile?.subscription_ends_at || null,
    };
}

async function attachAuthenticatedUser(req, res, next) {
    try {
        const token = getBearerToken(req);
        if (!token) {
            return res.status(401).json({
                error: "Missing authorization token",
                code: "AUTH_REQUIRED",
            });
        }

        const { data: authData, error: authError } =
            await supabase.auth.getUser(token);
        if (authError || !authData?.user?.id) {
            return res.status(401).json({
                error: "Invalid session token",
                code: "INVALID_TOKEN",
            });
        }

        // Vérifier le timeout de session
        const userId = authData.user.id;
        if (!checkSessionTimeout(userId)) {
            return res.status(401).json({
                error: "Session expired after 4h inactivity. Please reconnect.",
                code: "SESSION_TIMEOUT",
                requireReconnect: true,
            });
        }

        updateSessionActivity(userId);

        const { data: profile, error: profileError } = await supabase
            .from("users")
            .select(
                "id, name, email, role, is_pro, plan, plan_status, subscription_tier, subscription_status, subscription_ends_at",
            )
            .eq("id", authData.user.id)
            .maybeSingle();

        if (profileError) {
            console.warn("Failed to load user profile", profileError);
        }

        req.authUser = authData.user;
        req.user = getUserAccessState(profile, authData.user);
        return next();
    } catch (error) {
        console.error("attachAuthenticatedUser error", error);
        return res.status(500).json({
            error: "Unable to resolve authenticated user",
            code: "AUTH_RESOLUTION_FAILED",
        });
    }
}

// API Routes
app.get("/api/auth/me", attachAuthenticatedUser, (req, res) => {
    res.json({ ok: true, user: req.user });
});

app.post(
    "/api/subscriptions/upgrade",
    attachAuthenticatedUser,
    async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({
                    error: "Authentication required",
                    code: "AUTH_REQUIRED",
                });
            }

            const { error: profileError } = await supabase
                .from("users")
                .update({
                    role: "pro",
                    is_pro: true,
                    subscription_tier: "pro",
                    subscription_status: "active",
                    subscription_ends_at: null,
                })
                .eq("id", userId);

            if (profileError) throw profileError;

            try {
                await supabase.from("user_subscriptions").insert({
                    user_id: userId,
                    tier: "pro",
                    status: "active",
                    started_at: new Date().toISOString(),
                    ends_at: null,
                });
            } catch (subscriptionError) {
                console.warn(
                    "Subscription insert skipped",
                    subscriptionError?.message || subscriptionError,
                );
            }

            return res.json({
                ok: true,
                user: {
                    ...req.user,
                    is_pro: true,
                    role: "pro",
                    subscription_tier: "pro",
                    subscription_status: "active",
                    subscription_ends_at: null,
                },
            });
        } catch (error) {
            console.error("Upgrade error", error);
            return res.status(500).json({
                error: "Unable to activate Pro access",
                code: "UPGRADE_FAILED",
            });
        }
    },
);

app.post("/api/users/upsert", async (req, res) => {
    try {
        const { id, email } = req.body;
        if (!id) return res.status(400).json({ error: "Missing user id" });

        const { error } = await supabase
            .from("users")
            .upsert({ id, email: email || null });

        if (error) throw new Error(error.message);
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

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

app.post("/api/push/test", attachAuthenticatedUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Auth required" });

        const { data: subs, error } = await supabase
            .from("push_subscriptions")
            .select("endpoint, keys")
            .eq("user_id", userId);

        if (error) throw error;
        if (!subs || subs.length === 0)
            return res.json({ ok: false, message: "No subscriptions" });

        const payload = {
            title: "Test XERA1 • Notification",
            body: "Ceci est un test de notification Push. Si vous le voyez, les push fonctionnent.",
            icon: `${PRIMARY_ORIGIN.replace(/\/$/, "")}/icons/logo.png`,
            link: `${PRIMARY_ORIGIN.replace(/\/$/, "")}/index.html`,
            tag: `xera1-test-${Date.now()}`,
            renotify: false,
            silent: false,
        };

        const results = [];
        for (const sub of subs) {
            const r = await sendPushToSubscription(sub, payload);
            results.push(r);
        }

        return res.json({ ok: true, results });
    } catch (err) {
        console.error("push test error", err);
        return res
            .status(500)
            .json({ ok: false, error: err?.message || String(err) });
    }
});

// Push relay pour notifications
function startNotificationPushRelay() {
    const channel = supabase.channel("server-push-relay-notifications");
    channel
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "notifications",
            },
            async (payload) => {
                const notif = payload.new;
                try {
                    await sendPushForNotification(notif);
                } catch (err) {
                    console.error("notification push relay error", err);
                }
            },
        )
        .subscribe((status) => {
            logger.debug("Notification push relay status:", status);
        });
}

async function sendPushForNotification(notification) {
    if (!notification?.user_id) return;

    const { data: subs, error } = await supabase
        .from("push_subscriptions")
        .select("endpoint, keys")
        .eq("user_id", notification.user_id);

    if (error) throw error;
    if (!subs || subs.length === 0) return;

    const payload = buildPushPayload(notification);
    for (const sub of subs) {
        await sendPushToSubscription(sub, payload);
    }
}

function buildPushPayload(notification) {
    const typeTitleMap = {
        support: "Nouveau soutien",
        follow: "Nouvel abonné",
        arc_follow: "Nouveau follower de projet",
        encouragement: "Nouvel encouragement",
        new_trace: "Nouvelle trace",
        new_arc: "Nouvel ARC",
        stream: "Notification live",
        live_start: "Live en cours",
        live_chat: "Message du live",
        collaboration: "Demande de collaboration",
        like: "Nouveau like",
        comment: "Nouveau commentaire",
        mention: "Mention",
        achievement: "Succès débloqué",
    };

    const title = typeTitleMap[notification.type] || "Notification XERA1";
    const icon = `${PRIMARY_ORIGIN.replace(/\/$/, "")}/icons/logo.png`;
    const link =
        normalizeNotificationLink(notification) ||
        `${PRIMARY_ORIGIN.replace(/\/$/, "")}${buildProfileRoute(notification.user_id, notification.account_type || notification.accountType)}`;

    return {
        title,
        body: notification.message || "",
        icon,
        link,
        tag: notification.id,
        renotify: false,
        silent: false,
    };
}

function normalizeNotificationLink(notification) {
    const base = PRIMARY_ORIGIN.replace(/\/$/, "");
    const raw = (notification && notification.link) || "";
    if (!raw) return "";
    const streamMatch = raw.match(/\/stream\/?([\w-]{8,})/i);
    if (streamMatch) {
        return `${base}/stream.html?id=${streamMatch[1]}`;
    }
    const pageProMatch = raw.match(/\/pagepro\/?([\w-]{8,})/i);
    if (pageProMatch) {
        return `${base}/pagepro?user=${pageProMatch[1]}`;
    }
    const profileMatch = raw.match(/\/profile\/?([\w-]{8,})/i);
    if (profileMatch) {
        return `${base}/profile?user=${profileMatch[1]}`;
    }
    if (raw.startsWith("http")) return raw;
    if (raw.startsWith("/")) return `${base}${raw}`;
    return `${base}/${raw}`;
}

// Scheduled reminders
let reminderSweepInFlight = false;

async function sendScheduledReturnReminders() {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
    if (REMINDER_HOURS.length === 0) return;
    if (reminderSweepInFlight) return;
    reminderSweepInFlight = true;

    try {
        const { data: subs, error } = await supabase
            .from("push_subscriptions")
            .select(
                "endpoint, keys, user_id, reminder_timezone, reminder_enabled, last_reminder_slot",
            )
            .eq("reminder_enabled", true);

        if (error) {
            if (isMissingColumnError(error)) {
                console.warn("Reminder columns missing in push_subscriptions");
                return;
            }
            throw error;
        }
        if (!subs || subs.length === 0) return;

        const now = new Date();
        for (const sub of subs) {
            if (!sub?.endpoint || !sub?.keys || !sub?.user_id) continue;
            const timeZone = sanitizeTimeZone(sub.reminder_timezone || "UTC");
            const slot = resolveReminderSlot(now, timeZone);
            if (!slot) continue;
            if (sub.last_reminder_slot === slot.slotKey) continue;

            const payload = buildReturnReminderPayload(sub.user_id, slot);
            const result = await sendPushToSubscription(sub, payload);
            if (!result.success) continue;

            const { error: updateError } = await supabase
                .from("push_subscriptions")
                .update({
                    reminder_timezone: timeZone,
                    last_reminder_slot: slot.slotKey,
                })
                .eq("endpoint", sub.endpoint);

            if (updateError) {
                if (!isMissingColumnError(updateError)) {
                    console.error(
                        "Failed to persist reminder slot",
                        updateError,
                    );
                }
            }
        }
    } catch (error) {
        console.error("Reminder sweep error", error);
    } finally {
        reminderSweepInFlight = false;
    }
}

function startReminderScheduler() {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
    if (REMINDER_HOURS.length === 0) return;
    setInterval(
        () => {
            sendScheduledReturnReminders().catch((error) => {
                console.error("Reminder scheduler tick error", error);
            });
        },
        parseInt(RETURN_REMINDER_SWEEP_MS) || 60000,
    );
    sendScheduledReturnReminders().catch((error) => {
        console.error("Initial reminder sweep error", error);
    });
}

// Account deletion
app.post("/api/account/delete", async (req, res) => {
    try {
        const token = getBearerToken(req);
        if (!token) {
            return res
                .status(401)
                .json({ error: "Missing authorization token" });
        }

        const { data: authData, error: authError } =
            await supabase.auth.getUser(token);

        if (authError || !authData?.user?.id) {
            return res.status(401).json({ error: "Invalid session token" });
        }

        const authedUserId = authData.user.id;
        const requestedUserId = String(req.body?.userId || "").trim();
        if (requestedUserId && requestedUserId !== authedUserId) {
            return res
                .status(403)
                .json({ error: "Forbidden account deletion target" });
        }

        const { error: profileDeleteError } = await supabase
            .from("users")
            .delete()
            .eq("id", authedUserId);

        if (profileDeleteError) throw profileDeleteError;

        const { error: authDeleteError } =
            await supabase.auth.admin.deleteUser(authedUserId);
        if (authDeleteError) throw authDeleteError;

        // Nettoyer la session
        activeSessions.delete(authedUserId);

        return res.json({ ok: true });
    } catch (error) {
        console.error("Account delete error", error);
        return res.status(500).json({
            error: error?.message || "Unable to delete account",
        });
    }
});

// Session check endpoint
app.get("/api/session/check", attachAuthenticatedUser, (req, res) => {
    res.json({
        ok: true,
        valid: true,
        userId: req.user?.id,
        expiresIn:
            SESSION_TIMEOUT_MS -
            (Date.now() -
                (activeSessions.get(req.user?.id)?.lastActivity || Date.now())),
    });
});

// Fallback route
app.use((req, res) => {
    // Pour les routes API non définies
    if (req.path.startsWith("/api/")) {
        return res.status(501).json({
            error: "Endpoint not implemented",
        });
    }

    // Pour les routes HTML, servir index.html (SPA)
    res.sendFile(path.join(__dirname, "..", "index.html"));
});

// Démarrage du serveur
app.listen(PORT, () => {
    logger.debug(``);
    logger.debug(
        `╔════════════════════════════════════════════════════════════╗`,
    );
    logger.debug(
        `║          XERA1 OPTIMIZED SERVER - PRODUCTION READY          ║`,
    );
    logger.debug(
        `╠════════════════════════════════════════════════════════════╣`,
    );
    logger.debug(
        `║  Server running on: http://localhost:${PORT}                   ║`,
    );
    logger.debug(
        `║  Environment: ${process.env.NODE_ENV || "development"}                        ║`,
    );
    logger.debug(
        `║  Session timeout: 4 hours                                   ║`,
    );
    console.log(
        `║  Cache: Enabled (1 year for static assets)                   ║`,
    );
    console.log(
        `║  Hot-reload: DISABLED (manual restart required)              ║`,
    );
    logger.debug(
        `╚════════════════════════════════════════════════════════════╝`,
    );
    logger.debug(``);

    startNotificationPushRelay();
    startReminderScheduler();
});

// Gestion graceful shutdown
process.on("SIGTERM", () => {
    logger.debug("SIGTERM received, shutting down gracefully...");
    process.exit(0);
});

process.on("SIGINT", () => {
    logger.debug("SIGINT received, shutting down gracefully...");
    process.exit(0);
});
