import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import webpush from "web-push";

// --- Environment Variables & Configuration ---
const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";
export const SUPABASE_URL =
    process.env.SUPABASE_URL || "https://ssbuagqwjptyhavinkxg.supabase.co";
export const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzYnVhZ3F3anB0eWhhdmlua3hnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTk1MjUzMywiZXhwIjoyMDg1NTI4NTMzfQ._aEaTXFxqpfx64bts6Z7FoP3L4oHMGcqoi08yREU33s";
export const VAPID_PUBLIC_KEY =
    process.env.VAPID_PUBLIC_KEY ||
    "BDyU4kv_cnxruA5n_i3kw0-ipEXZTINrLmwVAhyyFhXsIVC6eImDqhkLVLs77Fl-TJdyOJVZsnp-k6z_7bu0bTM";
export const VAPID_PRIVATE_KEY =
    process.env.VAPID_PRIVATE_KEY ||
    "6dmRHoFpyGEFgL487qqwBc9BQ184TC8N9Yd3siS94Skpka";
export const PUSH_CONTACT_EMAIL =
    process.env.PUSH_CONTACT_EMAIL || "mailto:hello@xera1.xyz";
export const USD_TO_CDF_RATE_VALUE = Math.max(
    1,
    Number.parseFloat(process.env.USD_TO_CDF_RATE) || 2300,
);
export const CALLBACK_BASE_URL = process.env.CALLBACK_BASE_URL || "";
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

export const KPAY_PUBLIC_KEY = readEnvVar("KPAY_PUBLIC_KEY", "CLÉ PUBLIQUE KPAY", "CLE_PUBLIQUE_KPAY", "CLE PUBLIQUE KPAY") || process.env.KPAY_PUBLIC_KEY || "";
export const KPAY_SECRET_KEY = readEnvVar("KPAY_SECRET_KEY", "CLÉ SECRÈTE KPAY", "CLE_SECRETE_KPAY", "CLE SECRETE KPAY") || process.env.KPAY_SECRET_KEY || "";
export const KPAY_CHECKOUT_URL = process.env.KPAY_CHECKOUT_URL || "https://admin.kpay.site";
export const KPAY_CALLBACK_SECRET = readEnvVar("KPAY_CALLBACK_SECRET", "KPAY_CALLBACK_SECRET") || process.env.KPAY_CALLBACK_SECRET || "";
export const SUPER_ADMIN_ID =
    process.env.SUPER_ADMIN_ID || "b0f9f893-1706-4721-899c-d26ad79afc86";

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        PUSH_CONTACT_EMAIL,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY,
    );
}

// --- General Utility Functions ---
export function parseBooleanEnv(value, fallback = false) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return fallback;
}

export function hasPublicCallbackBaseUrl(value) {
    const raw = String(value || "").trim();
    if (!raw || raw.includes("xxxxx.loca.lt")) return false;
    try {
        const url = new URL(raw);
        const hostname = String(url.hostname || "").toLowerCase();
        if (url.protocol !== "https:") return false;
        if (hostname === "localhost" || hostname === "127.0.0.1") return false;
        return true;
    } catch (error) {
        return false;
    }
}

export function stripTrailingSlash(value) {
    return String(value || "")
        .trim()
        .replace(/\/+$/, "");
}

const PRIMARY_ORIGIN = stripTrailingSlash(
    APP_BASE_URL.split(",")[0] || "http://localhost:3000",
);
export const CALLBACK_ORIGIN = resolveCallbackOrigin(
    CALLBACK_BASE_URL,
    PRIMARY_ORIGIN,
);
export const KPAY_CALLBACK_ENABLED =
    parseBooleanEnv(KPAY_USE_CALLBACK, true) && Boolean(CALLBACK_ORIGIN);

export function resolveCallbackOrigin(callbackBaseUrl, primaryOrigin) {
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

export function escapeHtmlAttr(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// ...existing code...
export function isProAccountType(accountType) {
    const normalized = String(accountType || "").trim().toLowerCase();
    return [
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
        "professional",
        "recruiter",
        "investor",
        "partner",
    ].includes(normalized);
}

export async function buildProfileReturnPath(userId, client) {
    if (!userId) return "/profile";
    let accountType = "personal";
    let accountSubtype = "personal";
    if (client) {
        try {
            const { data: userProfile } = await client
                .from("users")
                .select("account_type, account_subtype, user_metadata")
                .eq("id", userId)
                .maybeSingle();
            if (userProfile) {
                accountType = userProfile.account_type || userProfile.user_metadata?.account_type;
                accountSubtype = userProfile.account_subtype || userProfile.user_metadata?.account_subtype;
            }
        } catch (e) {
            console.warn("Failed to fetch user account type for return path:", e);
        }
    }
    const route = isProAccountType(accountType, accountSubtype) ? "/pagepro" : "/profile";
    return `${route}?user=${encodeURIComponent(userId)}`;
}
// ...existing code...

export function sanitizeReturnPath(value, fallbackPath = "/") {
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
        return `${url.pathname}${url.search}${url.hash}`;
    } catch (error) {
        return fallback;
    }
}

export function roundMoney(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return 0;
    return Math.round(amount * 100) / 100;
}

export function isMissingRelationError(error) {
    const message = String(error?.message || "").toLowerCase();
    return (
        (message.includes("relation") && message.includes("does not exist")) ||
        (message.includes("could not find") && message.includes("table")) ||
        message.includes("schema cache")
    );
}

export function getWalletSchemaErrorMessage() {
    return "Schema portefeuille manquant. Executez sql/monetization-supabase-one-shot.sql ou sql/monetization-wallet.sql dans Supabase SQL Editor.";
}

export function getReadableServerErrorMessage(error, fallbackMessage) {
    const message = String(error?.message || "").trim();
    if (!message) return fallbackMessage;
    return message.slice(0, 280);
}

export function isMissingColumnError(error) {
    const message = String(error?.message || "").toLowerCase();
    return (
        (message.includes("column") && message.includes("does not exist")) ||
        ((message.includes("column") || message.includes("could not find")) &&
            message.includes("schema cache"))
    );
}

export function sendCheckoutErrorResponse(res, error, fallbackMessage) {
    if (isMissingRelationError(error) || isMissingColumnError(error)) {
        return res.status(503).send(getWalletSchemaErrorMessage());
    }

    if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
        return res
            .status(500)
            .send(getReadableServerErrorMessage(error, fallbackMessage));
    }

    return res.status(500).send(fallbackMessage);
}

// --- K-PAY Specifics ---
export const KPAY_PLANS = {
    standard: 2.99,
    medium: 7.99,
    pro: 14.99,
};

export function computeKPayAmount(plan, billingCycle, currency) {
    const monthlyUsd = KPAY_PLANS[plan];
    if (!monthlyUsd) return null;
    const amountUsd =
        billingCycle === "annual" ? monthlyUsd * 12 * 0.8 : monthlyUsd;
    if (String(currency).toUpperCase() === "CDF") {
        return Math.round(amountUsd * USD_TO_CDF_RATE_VALUE);
    }
    return Math.ceil(amountUsd);
}

export function computeSupportCheckoutAmount(amountUsd, currency) {
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

export function inferKPayKeyMode(value) {
    const key = String(value || "").toUpperCase();
    if (key.startsWith("KPAY_LIVE")) return "live";
    if (key.startsWith("KPAY_TEST")) return "sandbox";
    return "unknown";
}

export function maskKey(value, visible = 10) {
    const key = String(value || "");
    if (!key) return "<empty>";
    if (key.length <= visible) return `${"*".repeat(key.length)}`;
    return `${key.slice(0, visible)}***`;
}

export function createSignedState(payload) {
    if (!process.env.KPAY_CALLBACK_SECRET) return null;
    const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto
        .createHmac("sha256", process.env.KPAY_CALLBACK_SECRET)
        .update(data)
        .digest("hex");
    return `${data}.${signature}`;
}

export function verifySignedState(state) {
    if (!state || !process.env.KPAY_CALLBACK_SECRET) return null;
    const [data, signature] = String(state).split(".");
    if (!data || !signature) return null;
    const expected = crypto
        .createHmac("sha256", process.env.KPAY_CALLBACK_SECRET)
        .update(data)
        .digest("hex");
    const valid = crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expected, "hex"),
    );
    if (!valid) return null;
    try {
        const payload = JSON.parse(
            Buffer.from(data, "base64url").toString("utf8"),
        );
        if (payload.expires_at && Date.now() > payload.expires_at) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

        : "";

    return `
      <!doctype html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Redirection KPay</title>
      </head>
      <body>
        <p>Redirection vers KPay...</p>
          <input type="hidden" name="montant" value="${escapeHtmlAttr(amount)}">
          <input type="hidden" name="devise" value="${escapeHtmlAttr(currency)}">${callbackInput}
        </form>
        <script>
          document.getElementById('mpForm').submit();
        </script>
      </body>
      </html>
    `;
}

// --- Supabase & User Management ---
export async function resolveUserId(accessToken, fallbackId) {
    if (!accessToken) return fallbackId;
    try {
        const { data, error } = await supabase.auth.getUser(accessToken);
        if (!error && data?.user?.id) {
            return data.user.id;
        }
    } catch (e) {
        // ignore
    }
    return fallbackId;
}

export async function authenticateRequest(req) {
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

export async function authenticateSuperAdmin(req) {
    const authResult = await authenticateRequest(req);
    if (authResult.error) {
        return authResult;
    }
    if (authResult.user.id !== SUPER_ADMIN_ID) {
        return { error: { status: 403, message: "Accès refusé." } };
    }
    return authResult;
}

export function isPlanActiveForUser(user) {
    if (!user) return false;
    const status = String(user.plan_status || "").toLowerCase();
    if (status !== "active") return false;
    const planEnd = user.plan_ends_at || null;
    if (!planEnd) return true;
    const endMs = Date.parse(planEnd);
    if (!Number.isFinite(endMs)) return true;
    return endMs > Date.now();
}

export function isGiftedProUser(user) {
    if (!user) return false;
    return (
        String(user.plan || "").toLowerCase() === "pro" &&
        String(user.plan_status || "").toLowerCase() === "active" &&
        !user.plan_ends_at
    );
}

export function canUserReceiveSupport(user) {
    if (!user) return false;
    const plan = String(user.plan || "").toLowerCase();
    if (!["medium", "pro"].includes(plan)) return false;
    if (!isPlanActiveForUser(user)) return false;
    return true;
}

// --- Transaction & Subscription Management ---
export function addMonths(date, months) {
    const result = new Date(date);
    const desired = result.getMonth() + months;
    result.setMonth(desired);
    return result;
}

export async function createPendingSubscriptionPayment({
    userId,
    plan,
    billingCycle,
    currency,
    amount,
    method,
    provider,
    walletId,
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
        callback_enabled: KPAY_CALLBACK_ENABLED,
        callback_origin: KPAY_CALLBACK_ENABLED ? CALLBACK_ORIGIN : null,
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
        createdAt: data.created_at,
    };
}

export async function createPendingSupportPayment({
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
}) {
    const checkoutRefId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const metadata = {
        payment_provider: "kpay",
        checkout_ref_id: checkoutRefId,
        support_kind: "direct",
        sender_name: senderName || "Utilisateur",
        recipient_name: recipientName || "Créateur",
        method: String(method || "card").toLowerCase(),
        provider: provider || null,
        wallet_id: walletId || null,
        support_amount_usd: roundMoney(amountUsd),
        checkout_amount: checkoutAmount,
        checkout_currency: String(checkoutCurrency || "USD").toUpperCase(),
        callback_enabled: KPAY_CALLBACK_ENABLED,
        callback_origin: KPAY_CALLBACK_ENABLED ? CALLBACK_ORIGIN : null,
        checkout_started_at: nowIso,
    };

    const { data, error } = await supabase
        .from("transactions")
        .insert({
            from_user_id: fromUserId,
            to_user_id: toUserId,
            type: "support",
            amount_gross: roundMoney(amountUsd),
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
        createdAt: data.created_at,
    };
}

export const EXPIRES_BADGES = new Set([
    "verified",
    "verified_gold",
    "gold",
    "pro",
]);
export const PROTECTED_BADGES = new Set([
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

export function shouldClearBadge(value) {
    if (!value) return false;
    const normalized = String(value).toLowerCase();
    return EXPIRES_BADGES.has(normalized);
}

export async function activateSubscription({
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
}) {
    const paymentId = transactionRefId ? `kpay_${transactionRefId}` : null;
    const normalizedPlan = String(plan || "").toLowerCase();
    const badgeForPlan =
        normalizedPlan === "pro" ? "verified_gold" : "verified";

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
            if (["standard", "medium", "pro", "elite"].includes(normalizedPlan)) {
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
            if (["standard", "medium", "pro", "elite"].includes(normalizedPlan)) {
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
        if (PROTECTED_BADGES.has(existingBadge)) {
            badgeToApply = profile?.badge || badgeForPlan;
        }
    } catch (e) {
        // Ignore profile read errors; continue with default badge
    }
    const isMonetized =
        ["medium", "pro"].includes(normalizedPlan) && followersCount >= 1000;

    // Préparation des mises à jour avec activation automatique des avantages
    const userUpdates = {
        plan,
        plan_status: "active",
        plan_ends_at: periodEndIso,
        badge: badgeToApply,
        is_monetized: isMonetized,
    };

    if (normalizedPlan === "medium") {
        userUpdates.advanced_profile_customization = true;
        userUpdates.priority_recommendations = true;
    } else if (normalizedPlan === "pro") {
        userUpdates.advanced_profile_customization = true;
        userUpdates.priority_recommendations = true;
        userUpdates.full_profile_customization = true;
        userUpdates.hd_streaming = true;
        userUpdates.private_live = true;
        userUpdates.advanced_collab_tools = true;
        userUpdates.realtime_analytics = true;
        userUpdates.data_export = true;
        userUpdates.maximum_visibility = true;
    }

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

    const { data: updatedUser, error: updateUserError } = await supabase
        .from("users")
        .update(userUpdates)
        .eq("id", userId)
        .select("*")
        .single();
    if (updateUserError) throw updateUserError;

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

    // Journalisation de l'activation des avantages
    console.log(
        `[Subscription] Plan ${plan} activé pour ${userId}. Avantages appliqués:`,
        Object.keys(userUpdates).filter(
            (k) => userUpdates[k] === true && !["is_monetized"].includes(k),
        ),
    );

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

    return {
        alreadyActivated: false,
        user: updatedUser,
        subscriptionId: insertedSubscription?.id || null,
        transactionId,
    };
}

export async function failPendingTransaction({
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

export async function confirmSupportPayment({
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

    const supportAmountUsd = roundMoney(amountUsd);
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
        support_amount_usd: supportAmountUsd,
        checkout_amount:
            checkoutAmount ||
            pendingPayment?.metadata?.checkout_amount ||
            supportAmountUsd,
        checkout_currency: String(
            checkoutCurrency ||
                pendingPayment?.metadata?.checkout_currency ||
                "USD",
        ).toUpperCase(),
        confirmed_at: nowIso,
        confirmation_source: confirmationSource,
    };

    let transactionId = pendingTransactionId || null;
    if (pendingTransactionId) {
        const { error: updateError } = await supabase
            .from("transactions")
            .update({
                from_user_id: fromUserId,
                to_user_id: toUserId,
                amount_gross: supportAmountUsd,
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
                amount_gross: supportAmountUsd,
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
    const notification = await createNotificationRecord({
        userId: toUserId,
        type: "support",
        message: `${senderName} vous a envoye ${formatMoneyUsd(supportAmountUsd)} de soutien.`,
        link: `/creator-dashboard`,
        actorId: fromUserId,
        metadata: {
            transaction_id: transactionId,
            amount_gross: supportAmountUsd,
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
        recipient: {
            id: recipientProfile.id,
            name: recipientProfile.name || "Createur",
        },
    };
}

export function extractSubscriptionPaymentDetails(row) {
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

// --- Payouts & Withdrawals ---
export function normalizeMobileMoneyProvider(value) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    return SUPPORTED_MOBILE_MONEY_PROVIDERS.has(normalized) ? normalized : null;
}

export function sanitizeWalletNumber(value) {
    return String(value || "")
        .trim()
        .replace(/[^\d+]/g, "")
        .slice(0, 32);
}

export function sanitizePayoutText(value, maxLength = 160) {
    return String(value || "")
        .trim()
        .slice(0, maxLength);
}

export function extractPayoutSettings(row) {
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

export function extractWithdrawalRequest(row) {
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

export async function fetchCreatorPayoutSettings(userId) {
    const { data, error } = await supabase
        .from("creator_payout_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
    if (error) throw error;
    return extractPayoutSettings(data);
}

export async function fetchCreatorWithdrawalRequests(userId, options = {}) {
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

export async function buildCreatorWalletOverview(userId) {
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
        const net = roundMoney(tx.amount_net_creator);
        if (tx.type === "support") {
            if (tx.status === "succeeded") supportAvailable += net;
            if (tx.status === "pending") supportPending += net;
        }
        if (tx.type === "video_rpm") {
            if (tx.status === "succeeded") videoAvailable += net;
            if (tx.status === "pending") videoPending += net;
        }
    });

    const hasVideoRevenueTransactions = revenueTransactions.some(
        (tx) => tx.type === "video_rpm",
    );
    if (!hasVideoRevenueTransactions) {
        videoAvailable = 0;
        videoPending = 0;
        videoPayouts.forEach((payout) => {
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

// --- Notifications ---
export function supportsPush() {
    return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

export function formatMoneyUsd(value) {
    const amount = roundMoney(value);
    return `$${amount.toFixed(2)}`;
}

export async function createNotificationRecord({
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

export async function purgeStalePushSubscription(endpoint) {
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

export function buildNotificationPushPayload(notification) {
    const typeTitleMap = {
        support: "Nouveau soutien",
        follow: "Nouvel abonné",
        like: "Nouveau like",
        comment: "Nouveau commentaire",
        mention: "Mention",
        achievement: "Succès débloqué",
        stream: "Live en cours",
    };

    const title = typeTitleMap[notification?.type] || "Notification XERA1";
    const icon = `${PRIMARY_ORIGIN.replace(/\/$/, "")}/icons/logo.png`;
    const rawLink = String(notification?.link || "").trim();
    const link = rawLink
        ? rawLink.startsWith("http")
            ? rawLink
            : `${PRIMARY_ORIGIN.replace(/\/$/, "")}/${rawLink.replace(/^\//, "")}`
        : `${PRIMARY_ORIGIN.replace(/\/$/, "")}${await buildProfileReturnPath(notification?.user_id || "", supabase)}`;

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

export async function sendPushToUser(userId, payload) {
    if (!supportsPush() || !userId || !payload) return;

    try {
        const { data: subs, error } = await supabase
            .from("push_subscriptions")
            .select("endpoint, keys")
            .eq("user_id", userId);
        if (error) throw error;
        if (!subs || subs.length === 0) return;

        const payloadString = JSON.stringify(payload);
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
            } catch (error) {
                if (error?.statusCode === 404 || error?.statusCode === 410) {
                    await purgeStalePushSubscription(sub.endpoint);
                    continue;
                }
                console.warn("Support push error:", error?.message || error);
            }
        }
    } catch (error) {
        console.warn("Support push lookup error:", error?.message || error);
    }
}

// --- Cron Job Specifics ---
export const REMINDER_HOURS = (process.env.RETURN_REMINDER_HOURS || "10,18")
    .split(",")
    .map((value) => parseInt(value.trim(), 10))
    .filter((hour) => Number.isFinite(hour) && hour >= 0 && hour <= 23)
    .sort((a, b) => a - b);
export const REMINDER_WINDOW_MIN = Math.max(
    1,
    parseInt(process.env.RETURN_REMINDER_WINDOW_MINUTES, 10) || 15,
);
export const REMINDER_SWEEP_MS = Math.max(
    30000,
    parseInt(process.env.RETURN_REMINDER_SWEEP_MS, 10) || 60000,
);
export const SUBSCRIPTION_SWEEP_MS = Number.isFinite(
    parseInt(process.env.SUBSCRIPTION_SWEEP_MS, 10),
)
    ? Math.max(0, parseInt(process.env.SUBSCRIPTION_SWEEP_MS, 10))
    : 10 * 60 * 1000;

export function sanitizeTimeZone(value) {
    const fallback = "UTC";
    if (!value || typeof value !== "string") return fallback;
    try {
        Intl.DateTimeFormat("fr-FR", { timeZone: value }).format(new Date());
        return value;
    } catch (e) {
        return fallback;
    }
}

export function getTimePartsInZone(date, timeZone) {
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

export function resolveReminderSlot(now, timeZone) {
    if (REMINDER_HOURS.length === 0) return null;
    const parts = getTimePartsInZone(now, timeZone);
    if (!Number.isFinite(parts.hour) || !Number.isFinite(parts.minute))
        return null;
    const slotHour = REMINDER_HOURS.find((h) => h === parts.hour);
    if (slotHour === undefined) return null;
    if (parts.minute < 0 || parts.minute >= REMINDER_WINDOW_MIN) return null;
    return { hour: slotHour, dateKey: parts.dateKey };
}

export async function sweepExpiredSubscriptions() {
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
        if (userIds.length > 0) {
            await supabase
                .from("users")
                .update({
                    plan: "free",
                    plan_status: "inactive",
                    is_monetized: false,
                    updated_at: nowIso,
                    // Révocation automatique de tous les avantages
                    advanced_profile_customization: false,
                    priority_recommendations: false,
                    full_profile_customization: false,
                    hd_streaming: false,
                    private_live: false,
                    advanced_collab_tools: false,
                    realtime_analytics: false,
                    data_export: false,
                    maximum_visibility: false,
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

            console.log(
                `[Subscription] Avantages révoqués pour ${userIds.length} utilisateurs expirés.`,
            );
        }
        console.log(
            `Subscription sweep completed. Expired ${subscriptionIds.length} subscriptions and ${userIds.length} users.`,
        );
    } catch (error) {
        console.error("Subscription expiry sweep error:", error);
        // In a Vercel cron job, you might want to log this error to a monitoring service.
    }
}
