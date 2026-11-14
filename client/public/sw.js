/*
 * XERA Service Worker for Web Push notifications
 */
const CACHE_NAME = "xera-shell-v6";
const PRECACHE_URLS = [
    "/manifest.json",
    "/icons/logo-192x192.png",
    "/icons/logo-512x512.png",
];

self.addEventListener("install", (event) => {
    // Precache critical assets so the install prompt shows icon immediately
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            await Promise.allSettled(
                PRECACHE_URLS.map((url) => cache.add(url)),
            );
            await self.skipWaiting();
        })(),
    );
});

self.addEventListener("activate", (event) => {
    // Become controlling SW for all clients
    event.waitUntil(
        (async () => {
            await self.clients.claim();
            // Cleanup old caches
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter(
                        (k) => k.startsWith("xera-shell-") && k !== CACHE_NAME,
                    )
                    .map((k) => caches.delete(k)),
            );
        })(),
    );
});

function isSameOrigin(request) {
    try {
        const url = new URL(request.url);
        return url.origin === self.location.origin;
    } catch (e) {
        return false;
    }
}

function isHtmlRequest(request) {
    const accept = request.headers.get("accept") || "";
    return accept.includes("text/html");
}

function isCacheableAsset(request) {
    if (!isSameOrigin(request)) return false;
    if (request.method !== "GET") return false;
    const url = new URL(request.url);
    // Only cache local static assets/pages; do NOT cache API calls.
    if (url.pathname.startsWith("/js/")) return true;
    if (url.pathname.startsWith("/css/")) return true;
    if (url.pathname.startsWith("/icons/")) return true;
    if (url.pathname.endsWith(".html")) return true;
    if (url.pathname === "/" || url.pathname === "/index.html") return true;
    return false;
}

async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        const cached = await cache.match(request);
        if (cached) return cached;

        // Fallback: serve app shell (prevents blank screen when offline)
        const fallback =
            (await cache.match("/index.html")) ||
            (await cache.match("/")) ||
            null;
        return fallback || Response.error();
    }
}

self.addEventListener("fetch", (event) => {
    const request = event.request;

    // Avoid interfering with non-GET / cross-origin (Supabase, CDNs, etc.)
    if (request.method !== "GET") return;
    if (!isSameOrigin(request)) return;
    if (!isCacheableAsset(request)) return;

    // Documents: network-first (fresh navigation) with cache fallback
    if (isHtmlRequest(request)) {
        event.respondWith(networkFirst(request));
        return;
    }

    // Static assets: network-first so updates are visible immediately
    event.respondWith(networkFirst(request));
});

self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SET_VAPID") {
        self.applicationServerKeyBase64 = event.data.publicKey;
    }
});

self.addEventListener("push", (event) => {
    if (!event.data) return;
    let payload = {};
    try {
        payload = event.data.json();
    } catch (e) {
        payload = { title: "XERA", body: event.data.text() };
    }

    const title = payload.title || "XERA";
    const body = payload.body || "";
    const icon = payload.icon || "/icons/logo-192x192.png";
    const badge = payload.badge || icon;
    const link = payload.link || "/profile.html";

    // Show the notification and try to update the app badge + notify open clients
    event.waitUntil(
        (async () => {
            await self.registration.showNotification(title, {
                body,
                icon,
                badge,
                data: { link },
                tag: payload.tag || undefined,
                renotify: payload.renotify || false,
                silent: payload.silent || false,
            });

            // If the platform supports registration.setAppBadge (Chrome PWA), try to set it.
            try {
                const badgeNumber = payload.badge || null;
                if (
                    badgeNumber !== null &&
                    typeof self.registration.setAppBadge === "function"
                ) {
                    // Some payloads set badge as a number; coerce safely
                    const n = Number(badgeNumber);
                    if (Number.isFinite(n)) {
                        await self.registration.setAppBadge(n);
                    }
                }
            } catch (e) {
                // Not critical
            }

            // Notify all open clients to update their UI badges (client will decide how to apply)
            try {
                const clientList = await clients.matchAll({
                    includeUncontrolled: true,
                    type: "window",
                });
                const badgeNumber = payload.badge || null;
                clientList.forEach((client) => {
                    try {
                        client.postMessage({
                            type: "PUSH_BADGE",
                            badge: badgeNumber,
                        });
                    } catch (e) {}
                });
            } catch (e) {
                // ignore
            }
        })(),
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const targetUrl = event.notification?.data?.link || "/";

    event.waitUntil(
        clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then((clientList) => {
                // Focus an existing tab if possible
                for (const client of clientList) {
                    if (
                        client.url.includes(self.location.origin) &&
                        "focus" in client
                    ) {
                        client.navigate(targetUrl);
                        return client.focus();
                    }
                }
                // Otherwise open a new tab
                if (clients.openWindow) {
                    return clients.openWindow(targetUrl);
                }
            }),
    );
});

self.addEventListener("pushsubscriptionchange", (event) => {
    // Browser may drop subscriptions; try to resubscribe automatically
    event.waitUntil(
        self.registration.pushManager
            .getSubscription()
            .then((sub) => {
                if (sub) return sub;
                // The VAPID public key must be provided via global variable set at registration time
                if (!self.applicationServerKeyBase64) return null;
                const key = urlBase64ToUint8Array(
                    self.applicationServerKeyBase64,
                );
                return self.registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: key,
                });
            })
            .then((newSub) => {
                // Post message to clients to re-sync subscription
                if (!newSub) return;
                return clients
                    .matchAll({ includeUncontrolled: true, type: "window" })
                    .then((list) => {
                        list.forEach((client) =>
                            client.postMessage({
                                type: "PUSH_SUBSCRIPTION_REFRESH",
                                subscription: newSub,
                            }),
                        );
                    });
            })
            .catch((err) => console.error("pushsubscriptionchange error", err)),
    );
});

function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
