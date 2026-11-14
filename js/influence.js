// Influence & Reach module (YouTube + Spotify) - OAuth2 PKCE client-side
(() => {
    const YT_CLIENT_ID =
        "424696440830-pm0i2gq0p4um890s53mmg9on5jfog07m.apps.googleusercontent.com";
    const SPOTIFY_CLIENT_ID = "d0b48e133d3d4a998b5ce47f2adbe537";
    const REDIRECT_URI = "https://rize-beta.netlify.app/";
    const LOCAL_REDIRECT_FALLBACK = window.location.origin + "/";

    const STORAGE = {
        yt: {
            token: "rize_yt_token",
            exp: "rize_yt_exp",
            refresh: "rize_yt_refresh",
            verifier: "rize_yt_verifier",
            state: "rize_yt_state",
        },
        spotify: {
            token: "rize_sp_token",
            exp: "rize_sp_exp",
            refresh: "rize_sp_refresh",
            verifier: "rize_sp_verifier",
            state: "rize_sp_state",
        },
    };

    function getRedirectUri() {
        // Use production URL, fallback to current origin for local/dev testing
        if (window.location.origin === "https://rize-beta.netlify.app") {
            return REDIRECT_URI;
        }
        return LOCAL_REDIRECT_FALLBACK;
    }

    // Helpers
    function generateRandomString(length = 64) {
        const charset =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
        let result = "";
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        array.forEach((x) => (result += charset[x % charset.length]));
        return result;
    }

    async function sha256(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hash = await crypto.subtle.digest("SHA-256", data);
        return new Uint8Array(hash);
    }

    function base64UrlEncode(buffer) {
        return btoa(String.fromCharCode.apply(null, [...buffer]))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    }

    async function createPkcePair() {
        const verifier = generateRandomString(64);
        const challenge = base64UrlEncode(await sha256(verifier));
        return { verifier, challenge };
    }

    function saveToken(provider, accessToken, expiresInSec, refreshToken) {
        const exp = Date.now() + (expiresInSec || 3600) * 1000;
        localStorage.setItem(STORAGE[provider].token, accessToken);
        localStorage.setItem(STORAGE[provider].exp, String(exp));
        if (refreshToken) {
            localStorage.setItem(STORAGE[provider].refresh, refreshToken);
        }
    }

    function getToken(provider) {
        const token = localStorage.getItem(STORAGE[provider].token);
        const exp = parseInt(localStorage.getItem(STORAGE[provider].exp) || "0");
        if (!token || Date.now() > exp) return null;
        return token;
    }

    function hasStoredCredential(provider) {
        const refresh = localStorage.getItem(STORAGE[provider].refresh);
        if (refresh) return true;
        const token = localStorage.getItem(STORAGE[provider].token);
        const exp = parseInt(localStorage.getItem(STORAGE[provider].exp) || "0");
        if (!token) return false;
        return Date.now() <= exp;
    }

    function clearToken(provider) {
        localStorage.removeItem(STORAGE[provider].token);
        localStorage.removeItem(STORAGE[provider].exp);
        localStorage.removeItem(STORAGE[provider].refresh);
    }

    function storeVerifier(provider, verifier, state) {
        sessionStorage.setItem(STORAGE[provider].verifier, verifier);
        sessionStorage.setItem(STORAGE[provider].state, state);
    }

    function popVerifier(provider) {
        const verifier = sessionStorage.getItem(STORAGE[provider].verifier);
        const state = sessionStorage.getItem(STORAGE[provider].state);
        sessionStorage.removeItem(STORAGE[provider].verifier);
        sessionStorage.removeItem(STORAGE[provider].state);
        return { verifier, state };
    }

    function buildAuthUrl(provider, codeChallenge, state) {
        const redirectUri = getRedirectUri();
        if (provider === "yt") {
            const scope = encodeURIComponent("https://www.googleapis.com/auth/youtube.readonly");
            return (
                "https://accounts.google.com/o/oauth2/v2/auth" +
                `?client_id=${encodeURIComponent(YT_CLIENT_ID)}` +
                `&redirect_uri=${encodeURIComponent(redirectUri)}` +
                "&response_type=code" +
                `&scope=${scope}` +
                "&access_type=offline" +
                "&include_granted_scopes=true" +
                "&prompt=consent" +
                `&code_challenge=${codeChallenge}` +
                "&code_challenge_method=S256" +
                `&state=${encodeURIComponent(state)}`
            );
        }
        if (provider === "spotify") {
            const scope = encodeURIComponent("user-read-email user-read-private");
            return (
                "https://accounts.spotify.com/authorize" +
                `?client_id=${encodeURIComponent(SPOTIFY_CLIENT_ID)}` +
                `&redirect_uri=${encodeURIComponent(redirectUri)}` +
                "&response_type=code" +
                `&scope=${scope}` +
                `&code_challenge_method=S256&code_challenge=${codeChallenge}` +
                `&state=${encodeURIComponent(state)}`
            );
        }
        return "#";
    }

    async function startAuth(provider) {
        try {
            const { verifier, challenge } = await createPkcePair();
            const state = `${provider}:${generateRandomString(12)}`;
            storeVerifier(provider, verifier, state);
            const url = buildAuthUrl(provider, challenge, state);
            window.location.href = url;
        } catch (error) {
            console.error("startAuth error", error);
            alert("Unable to start authentication.");
        }
    }

    async function exchangeToken(provider, code, storedState) {
        const { verifier, state } = popVerifier(provider);
        if (!verifier || !state || state !== storedState) {
            console.error("State/verifier mismatch");
            return;
        }
        const redirectUri = getRedirectUri();
        try {
            if (provider === "yt") {
                const body = new URLSearchParams({
                    client_id: YT_CLIENT_ID,
                    grant_type: "authorization_code",
                    code,
                    code_verifier: verifier,
                    redirect_uri: redirectUri,
                });
                const res = await fetch("https://oauth2.googleapis.com/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body,
                });
                const data = await res.json();
                if (!res.ok || !data.access_token) throw new Error(data.error || "Token error");
                saveToken("yt", data.access_token, data.expires_in, data.refresh_token);
            } else if (provider === "spotify") {
                const body = new URLSearchParams({
                    client_id: SPOTIFY_CLIENT_ID,
                    grant_type: "authorization_code",
                    code,
                    code_verifier: verifier,
                    redirect_uri: redirectUri,
                });
                const res = await fetch("https://accounts.spotify.com/api/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body,
                });
                const data = await res.json();
                if (!res.ok || !data.access_token) throw new Error(data.error || "Token error");
                saveToken("spotify", data.access_token, data.expires_in, data.refresh_token);
            }
        } catch (error) {
            console.error("exchangeToken error", error);
            alert("Authentication failed. Please try again.");
        } finally {
            // Clean URL
            const url = new URL(window.location.href);
            url.searchParams.delete("code");
            url.searchParams.delete("state");
            window.history.replaceState({}, document.title, url.toString());
        }
    }

    async function handleOAuthRedirect() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");
        if (!code || !state) return;
        const provider = state.split(":")[0];
        if (provider === "yt" || provider === "spotify") {
            await exchangeToken(provider, code, state);
        }
    }

    async function refreshToken(provider) {
        const refresh = localStorage.getItem(STORAGE[provider].refresh);
        if (!refresh) return null;
        const redirectUri = getRedirectUri();
        try {
            if (provider === "yt") {
                const body = new URLSearchParams({
                    client_id: YT_CLIENT_ID,
                    grant_type: "refresh_token",
                    refresh_token: refresh,
                    redirect_uri: redirectUri,
                });
                const res = await fetch("https://oauth2.googleapis.com/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body,
                });
                const data = await res.json();
                if (!res.ok || !data.access_token) throw new Error(data.error || "Refresh error");
                saveToken("yt", data.access_token, data.expires_in, data.refresh_token || refresh);
                return data.access_token;
            } else if (provider === "spotify") {
                const body = new URLSearchParams({
                    client_id: SPOTIFY_CLIENT_ID,
                    grant_type: "refresh_token",
                    refresh_token: refresh,
                });
                const res = await fetch("https://accounts.spotify.com/api/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body,
                });
                const data = await res.json();
                if (!res.ok || !data.access_token) throw new Error(data.error || "Refresh error");
                saveToken("spotify", data.access_token, data.expires_in, data.refresh_token || refresh);
                return data.access_token;
            }
        } catch (error) {
            console.error("Refresh token error:", error);
            clearToken(provider);
        }
        return null;
    }

    async function ensureValidToken(provider) {
        const token = getToken(provider);
        if (token) return token;
        return await refreshToken(provider);
    }

    async function fetchYouTubeStats() {
        const token = await ensureValidToken("yt");
        if (!token) return null;
        try {
            const res = await fetch(
                "https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true",
                { headers: { Authorization: `Bearer ${token}` } },
            );
            const data = await res.json();
            const stats = data.items?.[0]?.statistics;
            if (!stats) return null;
            return {
                subscribers: stats.subscriberCount ? Number(stats.subscriberCount) : 0,
                views: stats.viewCount ? Number(stats.viewCount) : 0,
            };
        } catch (error) {
            console.error("YouTube stats error", error);
            return null;
        }
    }

    async function fetchSpotifyStats() {
        const token = await ensureValidToken("spotify");
        if (!token) return null;
        try {
            const res = await fetch("https://api.spotify.com/v1/me", {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!data || data.error) return null;
            return {
                followers: data.followers?.total || 0,
                image: Array.isArray(data.images) && data.images.length > 0 ? data.images[0].url : null,
                displayName: data.display_name || "Spotify user",
            };
        } catch (error) {
            console.error("Spotify stats error", error);
            return null;
        }
    }

    async function renderInfluenceReach(userId) {
        const section = document.querySelector(".influence-section");
        const ytCard = document.getElementById("yt-card");
        const spCard = document.getElementById("sp-card");
        if (!section || !ytCard || !spCard) return;

        const ytConnected = hasStoredCredential("yt");
        const spConnected = hasStoredCredential("spotify");
        if (!ytConnected && !spConnected) {
            section.style.display = "none";
            return;
        }

        section.style.display = "";
        ytCard.style.display = ytConnected ? "" : "none";
        spCard.style.display = spConnected ? "" : "none";

        // Wire connect buttons
        ytCard.querySelectorAll("[data-connect='yt']").forEach((btn) =>
            btn.addEventListener("click", () => startAuth("yt")),
        );
        spCard.querySelectorAll("[data-connect='spotify']").forEach((btn) =>
            btn.addEventListener("click", () => startAuth("spotify")),
        );

        // YouTube stats
        if (ytConnected) {
            const ytStats = await fetchYouTubeStats();
            if (ytStats) {
                ytCard.querySelector(".stat-value.subs").textContent = ytStats.subscribers.toLocaleString();
                ytCard.querySelector(".stat-label.subs").textContent = "Subscribers";
                ytCard.querySelector(".stat-value.views").textContent = ytStats.views.toLocaleString();
                ytCard.querySelector(".stat-label.views").textContent = "Views";
                ytCard.classList.add("connected");
            } else {
                ytCard.classList.remove("connected");
            }
        } else {
            ytCard.classList.remove("connected");
        }

        // Spotify stats
        if (spConnected) {
            const spStats = await fetchSpotifyStats();
            if (spStats) {
                spCard.querySelector(".stat-value.followers").textContent =
                    spStats.followers.toLocaleString();
                spCard.querySelector(".stat-label.followers").textContent = "Followers";
                const avatar = spCard.querySelector(".sp-avatar");
                if (avatar && spStats.image) {
                    avatar.src = spStats.image;
                    avatar.style.display = "block";
                }
                spCard.classList.add("connected");
            } else {
                spCard.classList.remove("connected");
            }
        } else {
            spCard.classList.remove("connected");
        }
    }

    // Expose minimal API
    window.startAuthProvider = startAuth;
    window.renderInfluenceReach = renderInfluenceReach;

    // Handle redirect on load
    handleOAuthRedirect();
})();
