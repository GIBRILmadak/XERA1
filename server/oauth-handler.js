const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { getConfig } = require("./oauth-configs");
const { resolveChallengeConfigOrRealDefault } = require("./fata-contract");
const { encryptToken } = require("./oauth-token-manager");
const { enqueueIngestion } = require("./ingestion-queue");
const { createSupabaseServiceClient } = require("./supabase-service-client");
const { getFataOidcClient } = require("./fata-oidc");
const { validateFataRedirectUri } = require("./fata-redirect-uri");

// Réutiliser le client supabase du server principal si possible,
// sinon créer une instance. Pour l'instant, on suppose qu'il est passé ou recréé.
const supabase = createSupabaseServiceClient();

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
    if (tool === "fata") {
        return String(config.redirectUri || "").trim();
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

function getFataOidcErrorMessage(error) {
    if (
        error?.name === "TimeoutError" ||
        /timed? out|timeout|aborted due to timeout/i.test(error?.message || "")
    ) {
        return "Le document de découverte OIDC de Fata n’a pas répondu dans le délai configuré.";
    }
    return "La configuration OIDC de Fata est indisponible.";
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

        let state = crypto.randomBytes(16).toString("hex");
        const requestBody = req.body || {};
        let fataOidcClient = null;
        const requestedChallengeId = requestBody.challengeId;
        let codeVerifier = requestBody.codeVerifier || null;
        let codeChallenge = requestBody.codeChallenge || null;
        let nonce = requestBody.nonce || null;
        let storedChallengeId = requestedChallengeId || null;

        if (tool === "fata") {
            if (!String(requestedChallengeId || "").trim()) {
                return res.status(400).json({
                    error: "Ouvrez d’abord le challenge Fata et utilisez « Continuer sur XERA1 » pour charger son contexte.",
                });
            }
            if (
                !config.clientId ||
                !config.clientSecret ||
                !config.issuer ||
                !config.redirectUri
            ) {
                return res.status(503).json({
                    error: "Configuration OAuth Fata indisponible",
                });
            }
            if (!require("./fata-contract").areFataRequirementIdsConfigured()) {
                return res.status(503).json({
                    error: "Les identifiants d’étapes Fata ne sont pas configurés.",
                });
            }
            if (
                !String(requestedChallengeId || "").trim()
            ) {
                return res.status(503).json({
                    error: "L’identifiant du challenge Fata n’a pas été transmis.",
                });
            }
            try {
                fataOidcClient = await getFataOidcClient(config);
            } catch (error) {
                console.error(
                    "[OAuth] Fata OIDC discovery error:",
                    error.message,
                );
                return res.status(503).json({
                    error: getFataOidcErrorMessage(error),
                });
            }
            try {
                storedChallengeId =
                    resolveChallengeConfigOrRealDefault(
                        requestedChallengeId,
                    ).id;
            } catch (error) {
                return res.status(400).json({
                    error: error.message || "Challenge Fata invalide",
                });
            }

            state = fataOidcClient.oidc.randomState();
            codeVerifier = fataOidcClient.oidc.randomPKCECodeVerifier();
            codeChallenge =
                await fataOidcClient.oidc.calculatePKCECodeChallenge(
                    codeVerifier,
                );
            nonce = fataOidcClient.oidc.randomNonce();
        }

        const redirectUri = getOAuthCallbackUri(tool, config);
        if (tool === "fata") {
            const redirectUriValidation = validateFataRedirectUri(redirectUri);
            if (!redirectUriValidation.valid) {
                const redirectUriErrors = {
                    invalid_url: "L’adresse de retour OIDC Fata est invalide.",
                    https_required:
                        "L’adresse de retour OIDC Fata doit utiliser HTTPS.",
                    callback_path_required:
                        "L’adresse de retour OIDC Fata doit pointer vers /api/auth/fata/callback.",
                    fragment_or_credentials_not_allowed:
                        "L’adresse de retour OIDC Fata ne peut contenir de fragment ni d’identifiants.",
                    reserved_oidc_parameter:
                        "L’adresse de retour OIDC Fata contient un paramètre de réponse OAuth réservé.",
                };
                return res.status(503).json({
                    error:
                        redirectUriErrors[redirectUriValidation.reason] ||
                        "L’adresse de retour OIDC Fata est invalide.",
                });
            }
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

        let authorizationUrl;
        if (tool === "fata") {
            authorizationUrl = fataOidcClient.oidc.buildAuthorizationUrl(
                fataOidcClient.configuration,
                {
                    redirect_uri: redirectUri,
                    scope: config.scope,
                    state,
                    nonce,
                    code_challenge: codeChallenge,
                    code_challenge_method: "S256",
                },
            );
        } else {
            authorizationUrl = new URL(config.authUrl);
            authorizationUrl.searchParams.set("client_id", config.clientId);
            authorizationUrl.searchParams.set("redirect_uri", redirectUri);
            authorizationUrl.searchParams.set("scope", config.scope);
            authorizationUrl.searchParams.set("state", state);
            authorizationUrl.searchParams.set("response_type", "code");
            if (codeChallenge) {
                authorizationUrl.searchParams.set(
                    "code_challenge",
                    codeChallenge,
                );
                authorizationUrl.searchParams.set(
                    "code_challenge_method",
                    "S256",
                );
            }
            if (nonce) authorizationUrl.searchParams.set("nonce", nonce);
        }

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
    const {
        code,
        state,
        error: oauthError,
        error_description: oauthErrorDesc,
    } = req.query;
    const config = getConfig(tool);

    const isFata = tool === "fata";
    let callbackChallengeId = null;
    const sendOAuthError = (
        statusCode,
        message,
        challengeId = callbackChallengeId,
    ) => {
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
        console.warn(`[OAuth] Fata callback error for ${tool}:`, {
            state: state || null,
            challengeId: callbackChallengeId,
            error: errorMsg,
        });
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
        console.info(`[OAuth] Fata callback received:`, {
            state: state || null,
            challengeId: callbackChallengeId,
            userId: storedState.user_id || null,
        });

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

        if (isFata) {
            try {
                resolveChallengeConfigOrRealDefault(storedState.challenge_id);
            } catch (error) {
                if (
                    /requirement IDs are not configured/i.test(
                        error?.message || "",
                    )
                ) {
                    return sendOAuthError(
                        503,
                        "Les identifiants d’étapes Fata ne sont pas configurés.",
                    );
                }
                return sendOAuthError(
                    400,
                    error.message || "Challenge Fata invalide",
                );
            }
        }

        let fataOidcClient = null;
        if (isFata) {
            try {
                fataOidcClient = await getFataOidcClient(config);
            } catch (error) {
                console.error(
                    "[OAuth] Fata OIDC discovery error:",
                    error.message,
                );
                return sendOAuthError(503, getFataOidcErrorMessage(error));
            }
        }

        const redirectUri = getOAuthCallbackUri(tool, config);
        let tokenData;
        if (isFata) {
            try {
                const callbackUrl = new URL(redirectUri);
                const incomingUrl = new URL(req.originalUrl, redirectUri);
                incomingUrl.searchParams.forEach((value, key) => {
                    callbackUrl.searchParams.append(key, value);
                });
                const tokenResponse =
                    await fataOidcClient.oidc.authorizationCodeGrant(
                        fataOidcClient.configuration,
                        callbackUrl,
                        {
                            expectedState: String(state),
                            pkceCodeVerifier: storedState.code_verifier,
                            expectedNonce: storedState.nonce,
                            idTokenExpected: true,
                        },
                    );
                const claims = tokenResponse.claims();
                if (!claims || typeof claims.sub !== "string" || !claims.sub) {
                    return sendOAuthError(401, "L’identité Fata est invalide");
                }
                tokenData = { ...tokenResponse, claims };
            } catch (error) {
                console.warn(
                    "[OAuth] Fata OIDC response validation failed:",
                    error.message,
                );
                return sendOAuthError(
                    401,
                    "Échec de vérification de l'identité Fata",
                );
            }
        } else {
            const tokenParams = new URLSearchParams({
                client_id: config.clientId,
                code,
                grant_type: "authorization_code",
                redirect_uri: redirectUri,
            });
            const tokenHeaders = {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            };
            if (config.clientSecret) {
                tokenParams.set("client_secret", config.clientSecret);
            }
            if (storedState.code_verifier) {
                tokenParams.append("code_verifier", storedState.code_verifier);
            }

            const tokenResponse = await fetch(config.tokenUrl, {
                method: "POST",
                headers: tokenHeaders,
                body: tokenParams.toString(),
                signal: AbortSignal.timeout(10000),
            });

            if (!tokenResponse.ok) {
                console.error(
                    "[OAuth] token exchange failed:",
                    tokenResponse.status,
                );
                return sendOAuthError(
                    502,
                    "Impossible de récupérer le token OAuth",
                );
            }
            tokenData = await tokenResponse.json();
        }

        if (!tokenData.access_token) {
            console.error("[OAuth] Token response missing access token");
            return sendOAuthError(
                500,
                "Impossible de récupérer le token OAuth",
            );
        }

        // --- FATA SPECIFIC LOGIC ---
        if (isFata) {
            const decoded = tokenData.claims;

            const existingUser = await supabase
                .from("fata_linkages")
                .select("user_id, fata_sub")
                .eq("fata_iss", config.issuer)
                .eq("fata_sub", decoded.sub)
                .maybeSingle();

            const existingLinkage = await supabase
                .from("fata_linkages")
                .select("user_id, fata_sub, metadata, created_at")
                .eq("user_id", storedState.user_id)
                .eq("fata_iss", config.issuer)
                .maybeSingle();

            if (existingUser.error || existingLinkage.error) {
                console.error(
                    "[OAuth] Fata linkage lookup error:",
                    existingUser.error || existingLinkage.error,
                );
                return sendOAuthError(
                    500,
                    "Impossible de vérifier la liaison du compte Fata",
                );
            }

            if (
                existingUser.data &&
                existingUser.data.user_id !== storedState.user_id
            ) {
                return sendOAuthError(
                    409,
                    "Cette identité Fata est déjà liée à un autre compte XERA1",
                );
            }

            if (
                existingLinkage.data &&
                existingLinkage.data.fata_sub !== decoded.sub
            ) {
                return sendOAuthError(
                    409,
                    "Un autre compte Fata est déjà lié à ce compte XERA1. Contactez le support pour résoudre cette liaison.",
                );
            }

            const now = new Date().toISOString();
            const oldMetadata = existingLinkage.data?.metadata || {};
            const metadata = {
                ...oldMetadata,
                source: "oidc",
                linked_at:
                    oldMetadata.linked_at ||
                    existingLinkage.data?.created_at ||
                    now,
            };

            const { error: linkError } = await supabase
                .from("fata_linkages")
                .upsert(
                    {
                        user_id: storedState.user_id,
                        fata_iss: config.issuer,
                        fata_sub: decoded.sub,
                        preferred_username: decoded.preferred_username || null,
                        metadata,
                        updated_at: now,
                    },
                    { onConflict: "user_id,fata_iss" },
                );

            if (linkError) {
                console.error("[OAuth] Fata linkage error:", linkError);
                return sendOAuthError(500, "Impossible de lier le compte Fata");
            }

            // Re-consenting the same Fata subject re-enables only the
            // previously revoked events. The selected ARC and link time
            // are preserved; no identity is silently replaced.
            await supabase
                .from("fata_pending_events")
                .update({
                    status: "retry",
                    retry_count: 0,
                    next_retry_at: now,
                    last_error: null,
                    updated_at: now,
                })
                .eq("user_id", storedState.user_id)
                .eq("fata_sub", decoded.sub)
                .eq("status", "failed")
                .or(
                    "last_error.ilike.%link_revoked%,last_error.ilike.%authorization%",
                );
        }

        if (!isFata) {
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
                                  Date.now() +
                                      Number(tokenData.expires_in) * 1000,
                              ).toISOString()
                            : null,
                        status: "active",
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "user_id,tool" },
                );

            if (tokenUpsertError) {
                console.error("[OAuth] token save error:", tokenUpsertError);
                return sendOAuthError(
                    500,
                    "Impossible de sauvegarder le token OAuth",
                );
            }
        }

        const { error: clearStateError } = await supabase
            .from("oauth_states")
            .delete()
            .eq("state", state)
            .eq("tool", tool);

        if (clearStateError) {
            console.warn("[OAuth] state cleanup warning:", clearStateError);
        }

        if (!isFata) {
            try {
                await enqueueIngestion(storedState.user_id, tool, {
                    source: "oauth_connect",
                });
            } catch (ingestionError) {
                console.warn(
                    "[OAuth] ingestion enqueue warning:",
                    ingestionError,
                );
            }
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
