// Lightweight analytics bootstrapper for XERA1
// - Defaults to Google Analytics 4 if a measurement ID is provided (meta[name="ga-measurement-id"] or window.GA_MEASUREMENT_ID)
// - Falls back silently when no ID is configured to avoid runtime errors

(function () {
    const config = window.XERA_ANALYTICS_CONFIG || {};
    const provider = (config.provider || "ga").toLowerCase();
    const measurementId =
        config.measurementId ||
        window.GA_MEASUREMENT_ID ||
        document
            .querySelector('meta[name="ga-measurement-id"]')
            ?.getAttribute("content") ||
        "";

    function detectDeviceType() {
        if (navigator.userAgentData?.mobile) return "mobile";
        const ua = navigator.userAgent || "";
        return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? "mobile" : "desktop";
    }

    function detectBrowser() {
        const ua = navigator.userAgent || "";
        const matchers = [
            [/Firefox\/([\d.]+)/i, "Firefox"],
            [/Edg\/([\d.]+)/i, "Edge"],
            [/Chrome\/([\d.]+)/i, "Chrome"],
            [/Safari\/([\d.]+)/i, "Safari"],
        ];
        for (const [regex, name] of matchers) {
            const match = ua.match(regex);
            if (match) return { name, version: match[1] };
        }
        return { name: "Unknown", version: "" };
    }

    if (provider === "ga") {
        if (!measurementId) {
            console.info(
                "[XERA1] Google Analytics non configuré (measurementId manquant).",
            );
            return;
        }

        window.dataLayer = window.dataLayer || [];
        function gtag() {
            window.dataLayer.push(arguments);
        }
        window.gtag = window.gtag || gtag;

        const script = document.createElement("script");
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
            measurementId,
        )}`;
        document.head.appendChild(script);

        gtag("js", new Date());
        gtag("config", measurementId, {
            send_page_view: true,
            anonymize_ip: true,
        });

        const browserInfo = detectBrowser();
        const deviceType = detectDeviceType();
        const locale = navigator.language || "en";
        const viewport = `${window.innerWidth || 0}x${window.innerHeight || 0}`;
        const connection =
            navigator.connection?.effectiveType ||
            navigator.connection?.type ||
            "unknown";

        gtag("event", "xera_page_view", {
            event_category: "engagement",
            browser: browserInfo.name,
            browser_version: browserInfo.version,
            device_type: deviceType,
            viewport,
            locale,
            connection,
        });
    } else if (provider === "plausible") {
        const domain = config.domain || window.location.hostname;
        const script = document.createElement("script");
        script.defer = true;
        script.setAttribute("data-domain", domain);
        script.src = "https://plausible.io/js/script.tagged-events.js";
        document.head.appendChild(script);
    }
})();
