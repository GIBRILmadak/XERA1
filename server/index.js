const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const logger = require("./logger");
const { createClient } = require("@supabase/supabase-js");
const webpush = require("web-push");

dotenv.config();

const {
    APP_BASE_URL = "http://localhost:3000",
    PORT = 5050,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
    PUSH_CONTACT_EMAIL = "mailto:hello@xera1.xyz",
    RETURN_REMINDER_HOURS = "10,18",
    RETURN_REMINDER_WINDOW_MINUTES = "15",
    RETURN_REMINDER_SWEEP_MS = "60000",
    RETURN_REMINDER_EMAIL_PROVIDER = "none",
    RETURN_REMINDER_EMAIL_FROM = "XERA1 <hello@xera1.xyz>",
    RETURN_REMINDER_EMAIL_API_KEY = "",
    RETURN_REMINDER_EMAIL_REPLY_TO = "hello@xera1.xyz",
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn(
        "Warning: Missing VAPID keys. Push notifications will not be sent.",
    );
} else {
    // Normalize subject: accept plain email in env and prefix mailto: if missing
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
app.use(express.json());
const allowedOrigins = APP_BASE_URL.split(",")
    .map((v) => v.trim())
    .filter(Boolean);
app.use(cors({ origin: allowedOrigins, methods: ["GET", "POST"] }));

const PRIMARY_ORIGIN =
    allowedOrigins[0] || APP_BASE_URL.split(",")[0] || "http://localhost:3000";
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
let reminderSweepInFlight = false;

function supportsPush() {
    return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
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
    if (parts.minute < 0 || parts.minute >= REMINDER_WINDOW_MIN) return null;
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
    if (!supportsPush()) return { success: false, skipped: true };
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

app.get("/api/health", (_req, res) => {
    res.json({
        ok: true,
        payments: "disabled",
        push: supportsPush() ? "enabled" : "disabled",
        reminderHours: REMINDER_HOURS,
        reminderWindowMinutes: REMINDER_WINDOW_MIN,
        message: "Payments are currently disabled.",
    });
});

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

            if (profileError) {
                throw profileError;
            }

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

app.get(
    "/api/pro/feature-demo",
    attachAuthenticatedUser,
    requirePro,
    (req, res) => {
        res.json({ ok: true, feature: "premium-insights", user: req.user });
    },
);

// Simple user upsert to keep Supabase usable while payments are disabled
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

// Enregistrer / mettre à jour un abonnement Web Push pour un utilisateur
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

        // Compatibilité: si la migration reminder n'est pas encore appliquée, on retombe sur le schéma minimal.
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

// Endpoint pour envoyer un push de test à l'utilisateur authentifié
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

// Relais temps-réel : notifications + messages directs
async function startPushRelay() {
    if (!supportsPush()) return;
    startNotificationPushRelay();
    startDirectMessagePushRelay();
}

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

function startDirectMessagePushRelay() {
    const channel = supabase.channel("server-push-relay-dm");
    channel
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "dm_messages",
            },
            async (payload) => {
                const message = payload.new;
                try {
                    await sendPushForDirectMessage(message);
                } catch (err) {
                    console.error("dm push relay error", err);
                }
            },
        )
        .subscribe((status) => {
            if (status === "CHANNEL_ERROR") {
                console.warn(
                    "DM push relay unavailable. Run sql/discovery-phase2-messaging.sql to enable messaging push.",
                );
            } else {
                logger.debug("DM push relay status:", status);
            }
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

async function sendPushForDirectMessage(messageRow) {
    if (!messageRow?.conversation_id || !messageRow?.sender_id) return;

    const [
        { data: recipients, error: recipientsError },
        { data: senderUser, error: senderError },
    ] = await Promise.all([
        supabase
            .from("dm_participants")
            .select("user_id, muted")
            .eq("conversation_id", messageRow.conversation_id)
            .neq("user_id", messageRow.sender_id),
        supabase
            .from("users")
            .select("id, name")
            .eq("id", messageRow.sender_id)
            .maybeSingle(),
    ]);

    if (recipientsError) throw recipientsError;
    if (senderError) {
        console.warn(
            "Sender lookup failed for DM push",
            senderError.message || senderError,
        );
    }

    // Conversation mise en sourdine : pas de notification push.
    const recipientIds = Array.from(
        new Set(
            (recipients || [])
                .filter((r) => r.muted !== true)
                .map((r) => r.user_id)
                .filter(Boolean),
        ),
    );
    if (recipientIds.length === 0) return;

    const { data: subs, error: subsError } = await supabase
        .from("push_subscriptions")
        .select("user_id, endpoint, keys")
        .in("user_id", recipientIds);

    if (subsError) throw subsError;
    if (!subs || subs.length === 0) return;

    const payload = buildDirectMessagePushPayload(
        messageRow,
        senderUser?.name || "",
    );
    for (const sub of subs) {
        await sendPushToSubscription(sub, payload);
    }

    // New: Email notification for DMs
    try {
        await sendEmailForDirectMessage(
            messageRow,
            senderUser?.name || "",
            recipientIds,
        );
    } catch (err) {
        console.error("DM email notification error:", err);
    }
}

async function sendEmailForDirectMessage(messageRow, senderName, recipientIds) {
    if (
        RETURN_REMINDER_EMAIL_PROVIDER !== "resend" ||
        !RETURN_REMINDER_EMAIL_API_KEY
    )
        return;

    // Only send to recipients who have email reminders enabled
    const { data: users, error } = await supabase
        .from("users")
        .select("id, email_reminder_enabled")
        .in("id", recipientIds)
        .eq("email_reminder_enabled", true);

    if (error || !users || users.length === 0) return;

    for (const user of users) {
        try {
            const { data: authUser, error: authError } =
                await supabase.auth.admin.getUserById(user.id);
            if (authError || !authUser?.user?.email) continue;

            const recipientEmail = authUser.user.email;
            const senderLabel = senderName || "Un utilisateur";
            const bodyPreview =
                messageRow.body ||
                (messageRow.media_type
                    ? `[${messageRow.media_type}]`
                    : "Nouveau message");

            const chatUrl = `${PRIMARY_ORIGIN.replace(/\/$/, "")}/index.html?messages=1&dm=${encodeURIComponent(messageRow.sender_id)}`;

            const emailHtml = `
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nouveau message sur XERA1</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:40px 10px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0, 0, 0, 0.1);border:1px solid #e5e7eb;">
          <tr>
            <td style="padding:40px 40px 24px 40px;">
              <img src="https://ssbuagqwjptyhavinkxg.supabase.co/storage/v1/object/public/assets/logo-512x512.png" alt="XERA1" style="width:56px;height:56px;border-radius:14px;display:block;" />
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 40px 40px;">
              <div style="font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#6366f1;margin-bottom:16px;">Nouveau Message</div>
              <h1 style="margin:0 0 20px 0;font-size:26px;font-weight:900;line-height:1.2;color:#111827;letter-spacing:-0.02em;">${senderLabel} vous a envoyé un message</h1>
              <p style="margin:0 0 24px 0;font-size:17px;line-height:1.6;color:#1f2937;">Bonjour,</p>
              <div style="background-color:#f8fafc;padding:24px;border-radius:16px;margin-bottom:32px;border-left:4px solid #6366f1;">
                <p style="margin:0;font-size:16px;line-height:1.6;color:#374151;font-style:italic;">"${bodyPreview}"</p>
              </div>
              <div style="margin-top:32px;">
                <a href="${chatUrl}" target="_blank" style="display:inline-block;background-color:#000000;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:12px;box-shadow:0 4px 6px -1px rgba(0, 0, 0, 0.1);">Répondre sur XERA1</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;background-color:#f9fafb;border-top:1px solid #f1f5f9;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
                Vous recevez cet email car vous avez activé les notifications XERA1.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

            const response = await (async () => {
                const nodeFetch =
                    typeof fetch !== "undefined" ? fetch : globalThis.fetch;
                if (typeof nodeFetch !== "function") {
                    throw new Error("fetch is not defined");
                }
                return nodeFetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${RETURN_REMINDER_EMAIL_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        from: RETURN_REMINDER_EMAIL_FROM,
                        to: [recipientEmail],
                        bcc: ["xera1.xyz+f82ea4b552@invite.trustpilot.com"],
                        subject: `XERA1 - Nouveau message de ${senderLabel}`,
                        html: emailHtml,
                        reply_to: RETURN_REMINDER_EMAIL_REPLY_TO,
                    }),
                });
            })();

            if (!response.ok) {
                const errorText = await response.text();
                console.warn(
                    `Resend API error (${response.status}): ${errorText}`,
                );
            }
        } catch (e) {
            console.warn("Failed to send DM email to user:", user.id, e);
        }
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

function buildDirectMessagePushPayload(messageRow, senderName) {
    const senderLabel =
        senderName && String(senderName).trim()
            ? String(senderName).trim()
            : "Nouveau message";
    const bodyRaw = String(messageRow?.body || "")
        .replace(/\s+/g, " ")
        .trim();
    const mediaType = String(messageRow?.media_type || "").toLowerCase();
    const mediaFallback =
        mediaType === "image"
            ? "Vous avez reçu une image."
            : mediaType === "video"
              ? "Vous avez reçu une vidéo."
              : "Vous avez reçu un nouveau message.";
    const body =
        bodyRaw.length > 160
            ? `${bodyRaw.slice(0, 159)}…`
            : bodyRaw || mediaFallback;
    const icon = `${PRIMARY_ORIGIN.replace(/\/$/, "")}/icons/logo.png`;
    const link = `${PRIMARY_ORIGIN.replace(/\/$/, "")}/index.html?messages=1&dm=${encodeURIComponent(messageRow.sender_id)}`;

    return {
        title: `Message de ${senderLabel}`,
        body,
        icon,
        link,
        tag: `dm-${messageRow.id}`,
        renotify: true,
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
    const pageProHtmlMatch = raw.match(/pagepro\?user=([\w-]{8,})/i);
    if (pageProHtmlMatch) {
        return `${base}/pagepro?user=${pageProHtmlMatch[1]}`;
    }
    const profileMatch = raw.match(/\/profile\/?([\w-]{8,})/i);
    if (profileMatch) {
        return `${base}/profile?user=${profileMatch[1]}`;
    }
    const profileHtmlMatch = raw.match(/profile\.html\?user=([\w-]{8,})/i);
    if (profileHtmlMatch) {
        return `${base}/profile?user=${profileHtmlMatch[1]}`;
    }
    if (raw.startsWith("http")) return raw;
    if (raw.startsWith("/")) return `${base}${raw}`;
    return `${base}/${raw}`;
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

function requirePro(req, res, next) {
    const user = req.user;
    if (user?.is_pro) {
        return next();
    }

    return res.status(403).json({
        error: "Premium required",
        code: "UPGRADE_NEEDED",
    });
}

async function sendScheduledReturnReminders() {
    if (!supportsPush()) return;
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
                console.warn(
                    "Reminder columns missing in push_subscriptions. Run sql/push-subscriptions.sql to enable 10h/18h reminders.",
                );
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
    if (!supportsPush()) return;
    if (REMINDER_HOURS.length === 0) return;
    setInterval(() => {
        sendScheduledReturnReminders().catch((error) => {
            console.error("Reminder scheduler tick error", error);
        });
    }, REMINDER_SWEEP_MS);
    sendScheduledReturnReminders().catch((error) => {
        console.error("Initial reminder sweep error", error);
    });
}

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

        const rawReason = String(req.body?.reason || "").trim();
        const rawDetail = String(req.body?.detail || "").trim();
        const allowedReasons = new Set([
            "inactive",
            "technical",
            "privacy",
            "experience",
            "other",
        ]);
        const safeReason = allowedReasons.has(rawReason) ? rawReason : "other";
        const safeDetail = rawDetail.slice(0, 1200);

        // Archive lightweight feedback before deletion (best effort).
        try {
            const reasonLine = `account-delete:${safeReason}`;
            const detailLine = safeDetail ? ` | detail:${safeDetail}` : "";
            const comment = `${reasonLine}${detailLine}`.slice(0, 400);
            await supabase.from("feedback_inbox").insert({
                mood: null,
                comment,
                sender_user_id: authedUserId,
                receiver_id: null,
            });
        } catch (feedbackError) {
            console.warn(
                "Account delete feedback insert failed",
                feedbackError?.message || feedbackError,
            );
        }

        // Remove app profile first; foreign keys should cascade related app data.
        const { error: profileDeleteError } = await supabase
            .from("users")
            .delete()
            .eq("id", authedUserId);

        if (profileDeleteError) {
            throw profileDeleteError;
        }

        // Delete Supabase Auth user (service role).
        const { error: authDeleteError } =
            await supabase.auth.admin.deleteUser(authedUserId);
        if (authDeleteError) {
            throw authDeleteError;
        }

        return res.json({ ok: true });
    } catch (error) {
        console.error("Account delete error", error);
        return res.status(500).json({
            error: error?.message || "Unable to delete account",
        });
    }
});

app.use((_req, res) => {
    res.status(501).json({
        error: "Paiements désactivés. Stripe sera ajouté plus tard.",
    });
});

app.listen(PORT, () => {
    logger.debug(`API listening on http://localhost:${PORT}`);
    startPushRelay();
    startReminderScheduler();
});
