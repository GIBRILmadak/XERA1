const crypto = require("crypto");
const { OAUTH_CONFIGS } = require("./oauth-configs");
const { createSupabaseServiceClient } = require("./supabase-service-client");

const supabase = createSupabaseServiceClient();

const ENCRYPTION_KEY_RAW =
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY ||
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_IV_BYTES = 12;

function getEncryptionKey() {
    const buffer = Buffer.from(
        ENCRYPTION_KEY_RAW,
        ENCRYPTION_KEY_RAW.includes("=") ? "base64" : "hex",
    );
    if (buffer.length !== 32) {
        throw new Error(
            "OAUTH_TOKEN_ENCRYPTION_KEY must be 32 bytes long (hex or base64)",
        );
    }
    return buffer;
}

const ENCRYPTION_KEY = getEncryptionKey();

function encryptToken(value) {
    if (!value) return null;
    const iv = crypto.randomBytes(ENCRYPTION_IV_BYTES);
    const cipher = crypto.createCipheriv(
        ENCRYPTION_ALGORITHM,
        ENCRYPTION_KEY,
        iv,
    );
    const ciphertext = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
        iv.toString("base64"),
        tag.toString("base64"),
        ciphertext.toString("base64"),
    ].join(".");
}

function decryptToken(payload) {
    if (!payload) return null;
    const parts = String(payload).split(".");
    if (parts.length !== 3) return null;

    const iv = Buffer.from(parts[0], "base64");
    const tag = Buffer.from(parts[1], "base64");
    const ciphertext = Buffer.from(parts[2], "base64");

    const decipher = crypto.createDecipheriv(
        ENCRYPTION_ALGORITHM,
        ENCRYPTION_KEY,
        iv,
    );
    decipher.setAuthTag(tag);
    return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]).toString("utf8");
}

async function refreshOAuthToken(userId, tool) {
    const config = OAUTH_CONFIGS[tool];
    if (!config) {
        throw new Error(`Refresh non supporté pour ${tool}`);
    }

    const { data: tokenRecord, error: tokenError } = await supabase
        .from("user_oauth_tokens")
        .select("*")
        .eq("user_id", userId)
        .eq("tool", tool)
        .single();

    if (tokenError || !tokenRecord) {
        throw new Error("Jeton OAuth introuvable pour actualisation");
    }

    const refreshToken = decryptToken(tokenRecord.refresh_token_encrypted);
    if (!refreshToken) {
        throw new Error("Refresh token manquant");
    }

    const response = await fetch(config.tokenUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        }),
    });

    const data = await response.json();
    if (!data || !data.access_token) {
        await supabase
            .from("user_oauth_tokens")
            .update({ status: "expired", updated_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("tool", tool);
        throw new Error(
            `Échec de rafraîchissement du token OAuth pour ${tool}`,
        );
    }

    const updates = {
        access_token_encrypted: encryptToken(data.access_token),
        expires_at: new Date(
            Date.now() + (Number(data.expires_in) || 3600) * 1000,
        ).toISOString(),
        last_refresh_at: new Date().toISOString(),
        status: "active",
        updated_at: new Date().toISOString(),
    };

    if (data.refresh_token) {
        updates.refresh_token_encrypted = encryptToken(data.refresh_token);
    }

    await supabase
        .from("user_oauth_tokens")
        .update(updates)
        .eq("user_id", userId)
        .eq("tool", tool);

    return updates.access_token_encrypted;
}

async function getValidAccessToken(userId, tool) {
    const { data: tokenRecord, error } = await supabase
        .from("user_oauth_tokens")
        .select("*")
        .eq("user_id", userId)
        .eq("tool", tool)
        .single();

    if (error || !tokenRecord) {
        throw new Error("Jeton OAuth introuvable");
    }

    const expiresAt = tokenRecord.expires_at
        ? new Date(tokenRecord.expires_at).getTime()
        : 0;
    if (Date.now() + 10 * 60 * 1000 >= expiresAt) {
        await refreshOAuthToken(userId, tool);
        const { data: refreshedRecord } = await supabase
            .from("user_oauth_tokens")
            .select("access_token_encrypted")
            .eq("user_id", userId)
            .eq("tool", tool)
            .single();

        return decryptToken(refreshedRecord.access_token_encrypted);
    }

    return decryptToken(tokenRecord.access_token_encrypted);
}

async function refreshTokensExpiringSoon(
    windowMs = 12 * 60 * 60 * 1000,
    limit = 25,
) {
    const threshold = new Date(Date.now() + windowMs).toISOString();
    const { data: tokens, error } = await supabase
        .from("user_oauth_tokens")
        .select("user_id,tool,expires_at")
        .lt("expires_at", threshold)
        .eq("status", "active")
        .limit(limit);

    if (error) {
        console.error("Erreur de lecture des tokens à actualiser", error);
        return { ok: false, error };
    }

    const results = [];
    for (const token of tokens || []) {
        try {
            await refreshOAuthToken(token.user_id, token.tool);
            results.push({
                user_id: token.user_id,
                tool: token.tool,
                ok: true,
            });
        } catch (refreshError) {
            console.warn(
                `Échec rafraîchissement token ${token.tool} pour ${token.user_id}:`,
                refreshError?.message || refreshError,
            );
            results.push({
                user_id: token.user_id,
                tool: token.tool,
                ok: false,
                error: String(refreshError),
            });
        }
    }

    return { ok: true, refreshed: results };
}

function startOAuthRefreshScheduler() {
    const interval =
        Number(process.env.OAUTH_REFRESH_INTERVAL_MS) || 60 * 60 * 1000;
    console.info(
        "[OAuth Token Manager] Scheduler démarré, interval:",
        interval,
    );
    setInterval(async () => {
        try {
            await refreshTokensExpiringSoon();
        } catch (error) {
            console.error(
                "[OAuth Token Manager] Erreur de rafraîchissement périodique",
                error,
            );
        }
    }, interval);
}

module.exports = {
    encryptToken,
    decryptToken,
    getValidAccessToken,
    refreshOAuthToken,
    refreshTokensExpiringSoon,
    startOAuthRefreshScheduler,
};
