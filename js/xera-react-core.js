(function () {
    function canUseReact() {
        return Boolean(
            window.React &&
                window.ReactDOM &&
                typeof window.ReactDOM.createRoot === "function",
        );
    }

    function getReact() {
        return window.React || null;
    }

    function getReactRootKey(islandName) {
        return `__xeraReactRoot_${String(islandName || "default")}`;
    }

    function withCacheBust(url, version) {
        if (!url || typeof url !== "string") return url;
        if (url.startsWith("data:")) return url;
        const joiner = url.includes("?") ? "&" : "?";
        return `${url}${joiner}v=${encodeURIComponent(version || Date.now())}`;
    }

    function getOrCreateRoot(containerEl, islandName) {
        if (!containerEl || !canUseReact()) return null;

        const key = getReactRootKey(islandName);
        if (
            containerEl[key] &&
            typeof containerEl[key].render === "function"
        ) {
            return containerEl[key];
        }

        const root = window.ReactDOM.createRoot(containerEl);
        containerEl[key] = root;
        return root;
    }

    function unmountIsland(containerEl, islandName) {
        if (!containerEl) return false;

        const key = getReactRootKey(islandName);
        const root = containerEl[key];
        if (!root || typeof root.unmount !== "function") {
            return false;
        }

        try {
            root.unmount();
            delete containerEl[key];
            return true;
        } catch (error) {
            return false;
        }
    }

    function mountIsland(containerEl, renderElement, options = {}) {
        if (!canUseReact() || !containerEl || typeof renderElement !== "function") {
            return false;
        }

        if (
            options.captureMarkup &&
            typeof containerEl.__xeraFallbackMarkup === "undefined"
        ) {
            containerEl.__xeraFallbackMarkup = containerEl.innerHTML;
        }

        try {
            const React = getReact();
            const root = getOrCreateRoot(containerEl, options.name);
            if (!root) return false;

            const element = renderElement(React);
            const tree = options.strict
                ? React.createElement(React.StrictMode, null, element)
                : element;

            root.render(tree);
            return true;
        } catch (error) {
            console.error(
                `[xera1-react-core] Echec du rendu de l'ile ${options.name || "default"}:`,
                error,
            );

            if (options.restoreMarkup !== false) {
                const fallbackMarkup =
                    options.fallbackMarkup ??
                    containerEl.__xeraFallbackMarkup ??
                    "";
                containerEl.innerHTML = fallbackMarkup;
            }

            return false;
        }
    }

    function createStore(initialValue) {
        let state = initialValue;
        const subscribers = new Set();

        function notify() {
            subscribers.forEach((subscriber) => subscriber());
        }

        return {
            get() {
                return state;
            },
            set(nextValue) {
                state = nextValue;
                notify();
            },
            update(updater) {
                state =
                    typeof updater === "function"
                        ? updater(state)
                        : updater;
                notify();
            },
            subscribe(subscriber) {
                subscribers.add(subscriber);
                return function unsubscribe() {
                    subscribers.delete(subscriber);
                };
            },
            reset() {
                state = initialValue;
                notify();
            },
        };
    }

    function useStore(store, selector) {
        const React = getReact();
        const select =
            typeof selector === "function" ? selector : (value) => value;
        const getSnapshot = () => select(store.get());

        if (typeof React.useSyncExternalStore === "function") {
            return React.useSyncExternalStore(
                store.subscribe,
                getSnapshot,
                getSnapshot,
            );
        }

        const [snapshot, setSnapshot] = React.useState(getSnapshot);

        React.useEffect(() => {
            return store.subscribe(() => {
                setSnapshot(getSnapshot());
            });
        }, [store]);

        return snapshot;
    }

    function useStableInterval(callback, delay) {
        const React = getReact();
        const callbackRef = React.useRef(callback);

        React.useEffect(() => {
            callbackRef.current = callback;
        }, [callback]);

        React.useEffect(() => {
            if (!Number.isFinite(delay) || delay <= 0) {
                return undefined;
            }

            const intervalId = window.setInterval(() => {
                if (typeof callbackRef.current === "function") {
                    callbackRef.current();
                }
            }, delay);

            return () => {
                window.clearInterval(intervalId);
            };
        }, [delay]);
    }

    function registerIsland(name, renderer) {
        if (!name || typeof renderer !== "function") {
            return null;
        }

        if (!window.ReactIslands || typeof window.ReactIslands !== "object") {
            window.ReactIslands = {};
        }

        window.ReactIslands[name] = renderer;
        return renderer;
    }

    window.XeraReactCore = Object.freeze({
        canUseReact,
        createStore,
        getOrCreateRoot,
        getReact,
        mountIsland,
        registerIsland,
        unmountIsland,
        useStableInterval,
        useStore,
        withCacheBust,
    });
})();
