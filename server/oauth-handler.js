const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const { getConfig } = require("./oauth-configs");
const { resolveChallengeConfig } = require("./fata-contract");
const { encryptToken } = require("./oauth-token-manager");
const { enqueueIngestion } = require("./ingestion-queue");

const jwksClients = {};

function getJwksClient(jwksUri) {
    if (!jwksClients[jwksUri]) {
        jwksClients[jwksUri] = jwksClient({
            jwksUri,
            cache: true,
            rateLimit: true,
        });
    }
    return jwksClients[jwksUri];
}

function verifyIdToken(token, config) {
    return new Promise((resolve, reject) => {
        const client = getJwksClient(config.jwksUrl);

        function getKey(header, callback) {
            client.getSigningKey(header.kid, (err, key) => {
                if (err) return callback(err);
                const signingKey = key.getPublicKey();
                callback(null, signingKey);
            });
        }

        jwt.verify(
            token,
            getKey,
            {
                issuer: config.issuer,
                audience: config.clientId,
                algorithms: ["RS256"],
            },
            (err, decoded) => {
                if (err) return reject(err);
                resolve(decoded);
            },
        );
    });
}

// Réutiliser le client supabase du server principal si possible,
// sinon créer une instance. Pour l'instant, on suppose qu'il est passé ou recréé.
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function getBearerToken(req) {
    const authHeader = req.headers.authorization || "";
    const [scheme, token] = authHeader.split(" ");
    if (scheme === "Bearer" && token) {
        return token;
    }
    return null;
}

function getSafeRedirectBase() {
    const configured =
        process.env.APP_FRONTEND_URL ||
        process.env.APP_BASE_URL ||
        "http://localhost:3000";
    return String(configured).split(",")[0].trim().replace(/\/$/, "");
}

function getOAuthCallbackUri(tool, config) {
    if (tool === "fata" && config.redirectUri) {
        return String(config.redirectUri).trim();
    }
    const callbackBase = String(
        process.env.OAUTH_CALLBACK_BASE_URL ||
            process.env.APP_BASE_URL ||
            "http://localhost:3000",
    )
        .split(",")[0]
        .trim()
        .replace(/\/$/, "");
    return `${callbackBase}/api/auth/${tool}/callback`;
}

function buildFataReturnUrl(params = {}) {
    const fallback = `${getSafeRedirectBase()}/profile`;
    const target = String(process.env.FATA_APP_RETURN_URL || fallback).trim();
    const url = new URL(target);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && String(value) !== "") {
            url.searchParams.set(key, String(value));
        }
    }
    return url.toString();
}

// POST /api/auth/:tool/start
router.post("/:tool/start", async (req, res) => {
    const { tool } = req.params;
    const config = getConfig(tool);

    if (!config) {
        return res.status(400).json({ error: "Outil non supporté" });
    }

    const token = getBearerToken(req);
    if (!token) {
        return res.status(401).json({ error: "Utilisateur non identifié" });
    }

    try {
        const {
            data: { user },
            error,
        } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: "Utilisateur non identifié" });
        }

        const state = crypto.randomBytes(16).toString("hex");
        const requestBody = req.body || {};
        const { challengeId } = requestBody;
        let codeVerifier = requestBody.codeVerifier || null;
        let codeChallenge = requestBody.codeChallenge || null;
        let nonce = requestBody.nonce || null;
        let storedChallengeId = challengeId || null;

        if (tool === "fata") {
            if (!config.clientId || !config.authUrl || !config.issuer) {
                return res.status(503).json({
                    error: "Configuration OAuth Fata indisponible",
                });
            }
            try {
                storedChallengeId = resolveChallengeConfig(challengeId).id;
            } catch (error) {
                return res.status(400).json({
                    error: error.message || "Challenge Fata invalide",
                });
            }

            codeVerifier = crypto.randomBytes(32).toString("base64url");
            codeChallenge = crypto
                .createHash("sha256")
                .update(codeVerifier)
                .digest("base64url");
            nonce = crypto.randomBytes(32).toString("base64url");
        }

        const { error: stateError } = await supabase
            .from("oauth_states")
            .insert({
                user_id: user.id,
                state,
                tool,
                challenge_id: storedChallengeId,
                code_verifier: codeVerifier,
                nonce,
            });

        if (stateError) {
            console.error("[OAuth] state insert error:", stateError);
            return res
                .status(500)
                .json({ error: "Impossible de démarrer la connexion OAuth" });
        }

        const redirectUri = getOAuthCallbackUri(tool, config);
        const authorizationUrl = new URL(config.authUrl);
        authorizationUrl.searchParams.set("client_id", config.clientId);
        authorizationUrl.searchParams.set("redirect_uri", redirectUri);
        authorizationUrl.searchParams.set("scope", config.scope);
        authorizationUrl.searchParams.set("state", state);
        authorizationUrl.searchParams.set("response_type", "code");

        if (codeChallenge) {
            authorizationUrl.searchParams.set("code_challenge", codeChallenge);
            authorizationUrl.searchParams.set(
                "code_challenge_method",
                "S256",
            );
        }
        if (nonce) authorizationUrl.searchParams.set("nonce", nonce);

        return res.json({ authUrl: authorizationUrl.toString() });
    } catch (error) {
        console.error("[OAuth] start error:", error);
        return res
            .status(500)
            .json({ error: "Impossible de démarrer la connexion OAuth" });
    }
});

router.get("/status", async (req, res) => {
    const token = getBearerToken(req);
    if (!token) {
        return res.status(401).json({ error: "Utilisateur non identifié" });
    }

    try {
        const {
            data: { user },
            error,
        } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: "Utilisateur non identifié" });
        }

        const { data, error: statusError } = await supabase
            .from("user_oauth_tokens")
            .select("tool,status,expires_at,updated_at")
            .eq("user_id", user.id);

        if (statusError) {
            return res
                .status(500)
                .json({ error: "Impossible de lire le statut de connexion" });
        }

        return res.json({ connections: data || [] });
    } catch (error) {
        console.error("[OAuth] status error:", error);
        return res
            .status(500)
            .json({ error: "Impossible de lire le statut de connexion" });
    }
});

// GET /api/auth/:tool/callback
router.get("/:tool/callback", async (req, res) => {
    const { tool } = req.params;
    const { code, state, error: oauthError, error_description: oauthErrorDesc } = req.query;
    const config = getConfig(tool);

    const isFata = tool === "fata";
    let callbackChallengeId = null;
    const sendOAuthError = (statusCode, message, challengeId = callbackChallengeId) => {
        if (isFata) {
            const redirectUrl = buildFataReturnUrl({
                fata: "error",
                reason: message,
                challengeId,
            });
            return res.redirect(redirectUrl);
        }
        return res.status(statusCode).json({ error: message });
    };

    if (oauthError) {
        const errorMsg =
            oauthErrorDesc ||
            oauthError ||
            "Autorisation refusée par l'utilisateur";
        if (isFata && state) {
            const { data: rejectedState } = await supabase
                .from("oauth_states")
                .select("challenge_id")
                .eq("state", state)
                .eq("tool", tool)
                .maybeSingle();
            callbackChallengeId = rejectedState?.challenge_id || null;
            await supabase
                .from("oauth_states")
                .delete()
                .eq("state", state)
                .eq("tool", tool);
        }
        console.warn(`[OAuth] Provider error callback for ${tool}:`, errorMsg);
        return sendOAuthError(400, errorMsg);
    }

    if (!config || !code || !state) {
        return sendOAuthError(400, "Paramètres invalides");
    }

    try {
        const { data: storedState, error: stateError } = await supabase
            .from("oauth_states")
            .select("user_id, challenge_id, code_verifier, nonce")
            .eq("state", state)
            .eq("tool", tool)
            .maybeSingle();

        if (stateError || !storedState) {
            return sendOAuthError(400, "State invalide");
        }
        callbackChallengeId = storedState.challenge_id || null;

        if (
            isFata &&
            (!storedState.challenge_id ||
                !storedState.code_verifier ||
                !storedState.nonce)
        ) {
            return sendOAuthError(400, "Contexte OIDC Fata incomplet");
        }
        if (isFata && !config.clientSecret) {
            return sendOAuthError(
                503,
                "Configuration du client secret Fata indisponible côté serveur",
            );
        }

        const redirectUri = getOAuthCallbackUri(tool, config);
        const tokenParams = new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
        });

        if (storedState.code_verifier) {
            tokenParams.append("code_verifier", storedState.code_verifier);
        }

        const tokenResponse = await fetch(config.tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: tokenParams.toString(),
        });

        if (!tokenResponse.ok) {
            console.error(
                "[OAuth] token exchange failed:",
                tokenResponse.status,
            );
            return sendOAuthError(502, "Impossible de récupérer le token OAuth");
        }

        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) {
            console.error("[OAuth] Token response missing access token");
            return sendOAuthError(500, "Impossible de récupérer le token OAuth");
        }

        // --- FATA SPECIFIC LOGIC ---
        if (tool === "fata") {
            if (!tokenData.id_token) {
                return sendOAuthError(400, "ID Token manquant pour Fata");
            }

            try {
                const decoded = await verifyIdToken(tokenData.id_token, config);
                if (!storedState.nonce || decoded.nonce !== storedState.nonce) {
                    return sendOAuthError(400, "Nonce invalide");
                }

                const existingUser = await supabase
                    .from("fata_linkages")
                    .select("user_id, fata_sub")
                    .eq("fata_iss", config.issuer)
                    .eq("fata_sub", decoded.sub)
                    .maybeSingle();

                if (
                    existingUser.data &&
                    existingUser.data.user_id !== storedState.user_id
                ) {
                    return sendOAuthError(
                        409,
                        "Cette identité Fata est déjà liée à un autre compte XERA1",
                    );
                }

                const { error: linkError } = await supabase
                    .from("fata_linkages")
                    .upsert(
                        {
                            user_id: storedState.user_id,
                            fata_iss: config.issuer,
                            fata_sub: decoded.sub,
                            preferred_username:
                                decoded.preferred_username || null,
                            metadata: {
                                challenge_id: storedState.challenge_id || null,
                                last_challenge_id:
                                    storedState.challenge_id || null,
                                source: "oidc",
                                linked_at: new Date().toISOString(),
                            },
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: "user_id,fata_iss" },
                    );

                if (linkError) {
                    console.error("[OAuth] Fata linkage error:", linkError);
                    return sendOAuthError(500, "Impossible de lier le compte Fata");
                }

                if (storedState.challenge_id) {
                    try {
                        resolveChallengeConfig(storedState.challenge_id);
                    } catch (error) {
                        return sendOAuthError(
                            400,
                            error.message || "Challenge Fata invalide",
                        );
                    }

                    await supabase
                        .from("fata_linkages")
                        .update({
                            metadata: {
                                challenge_id: storedState.challenge_id,
                                last_challenge_id: storedState.challenge_id,
                                source: "oidc",
                                linked_at: new Date().toISOString(),
                            },
                            updated_at: new Date().toISOString(),
                        })
                        .eq("user_id", storedState.user_id)
                        .eq("fata_iss", config.issuer);
                }
            } catch (err) {
                console.error(
                    "[OAuth] Fata ID Token verification failed:",
                    err,
                );
                return sendOAuthError(401, "Échec de vérification de l'identité Fata");
            }
        }

        const { error: tokenUpsertError } = await supabase
            .from("user_oauth_tokens")
            .upsert(
                {
                    user_id: storedState.user_id,
                    tool,
                    access_token_encrypted: encryptToken(
                        tokenData.access_token,
                    ),
                    refresh_token_encrypted: tokenData.refresh_token
                        ? encryptToken(tokenData.refresh_token)
                        : null,
                    expires_at: tokenData.expires_in
                        ? new Date(
                              Date.now() + Number(tokenData.expires_in) * 1000,
                          ).toISOString()
                        : null,
                    status: "active",
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id,tool" },
            );

        if (tokenUpsertError) {
            console.error("[OAuth] token save error:", tokenUpsertError);
            return sendOAuthError(500, "Impossible de sauvegarder le token OAuth");
        }

        const { error: clearStateError } = await supabase
            .from("oauth_states")
            .delete()
            .eq("state", state)
            .eq("tool", tool);

        if (clearStateError) {
            console.warn("[OAuth] state cleanup warning:", clearStateError);
        }

        try {
            await enqueueIngestion(storedState.user_id, tool, {
                source: "oauth_connect",
            });
        } catch (ingestionError) {
            console.warn("[OAuth] ingestion enqueue warning:", ingestionError);
        }

        if (tool === "fata") {
            return res.redirect(
                buildFataReturnUrl({
                    connection: "success",
                    fata: "success",
                    challengeId: storedState.challenge_id,
                }),
            );
        }

        return res.redirect(
            `${getSafeRedirectBase()}/profile?connection=success`,
        );
    } catch (error) {
        console.error("[OAuth] callback error:", error);
        return sendOAuthError(500, "Erreur pendant le callback OAuth");
    }
});

module.exports = router;
