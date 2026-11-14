/**
 * XERA1 Client Logger Utility
 * Controls client-side console logging based on window.LOG_LEVEL.
 * Levels: 'debug' | 'info' | 'warn' | 'error' | 'none'
 * Default: 'error' (silences debug/info/log statements in production)
 */

(function () {
    const LEVELS = {
        debug: 10,
        info: 20,
        warn: 30,
        error: 40,
        none: 50,
    };

    function getLogLevel() {
        const configured = (window.LOG_LEVEL || "error").toLowerCase();
        return LEVELS[configured] !== undefined ? LEVELS[configured] : LEVELS.error;
    }

    const XERALogger = {
        debug(...args) {
            if (getLogLevel() <= LEVELS.debug) {
                console.debug("[XERA]", ...args);
            }
        },
        info(...args) {
            if (getLogLevel() <= LEVELS.info) {
                console.info("[XERA]", ...args);
            }
        },
        log(...args) {
            if (getLogLevel() <= LEVELS.info) {
                console.log("[XERA]", ...args);
            }
        },
        warn(...args) {
            if (getLogLevel() <= LEVELS.warn) {
                console.warn("[XERA]", ...args);
            }
        },
        error(...args) {
            if (getLogLevel() <= LEVELS.error) {
                console.error("[XERA]", ...args);
            }
        },
    };

    window.XERALogger = XERALogger;
    window.logger = XERALogger;
})();
