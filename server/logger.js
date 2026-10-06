/**
 * XERA1 Server Logger Utility
 * Controls server-side console logging based on process.env.LOG_LEVEL.
 * Levels: 'debug' | 'info' | 'warn' | 'error' | 'none'
 * Default: 'error' (silences verbose debug/info/log statements in production)
 */

const LEVELS = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    none: 50,
};

function getLogLevel() {
    const configured = (process.env.LOG_LEVEL || "error").toLowerCase();
    return LEVELS[configured] !== undefined ? LEVELS[configured] : LEVELS.error;
}

const logger = {
    debug(...args) {
        if (getLogLevel() <= LEVELS.debug) {
            console.debug("[XERA Server]", ...args);
        }
    },
    info(...args) {
        if (getLogLevel() <= LEVELS.info) {
            console.info("[XERA Server]", ...args);
        }
    },
    log(...args) {
        if (getLogLevel() <= LEVELS.info) {
            console.log("[XERA Server]", ...args);
        }
    },
    warn(...args) {
        if (getLogLevel() <= LEVELS.warn) {
            console.warn("[XERA Server]", ...args);
        }
    },
    error(...args) {
        if (getLogLevel() <= LEVELS.error) {
            console.error("[XERA Server]", ...args);
        }
    },
};

module.exports = logger;
