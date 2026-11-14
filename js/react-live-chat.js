// React-powered live chat renderer (read-only); plugs into existing Supabase events.
// Falls back silently if React is unavailable.
(function () {
    const ReactCore = window.XeraReactCore;
    const Services = window.XeraAppServices || {};
    const PLACEHOLDER_AVATAR = "https://placehold.co/32";

    function createFallbackStore() {
        let messages = [];
        const subscribers = new Set();

        function notify() {
            subscribers.forEach((subscriber) => subscriber());
        }

        return {
            replace(nextList) {
                messages = Array.isArray(nextList) ? [...nextList] : [];
                notify();
            },
            push(message) {
                messages = [...messages, message];
                notify();
            },
            updateMessage(messageKey, patch) {
                messages = messages.map((message) =>
                    getMessageKey(message) === messageKey
                        ? {
                              ...message,
                              ...(patch || {}),
                              users: {
                                  ...(message.users || {}),
                                  ...(patch?.users || {}),
                              },
                          }
                        : message,
                );
                notify();
            },
            get() {
                return messages;
            },
            subscribe(subscriber) {
                subscribers.add(subscriber);
                return () => subscribers.delete(subscriber);
            },
        };
    }

    const store = ReactCore?.createStore
        ? ReactCore.createStore([])
        : createFallbackStore();

    const liveChatStore = {
        replace(nextList) {
            if (typeof store.set === "function") {
                store.set(Array.isArray(nextList) ? [...nextList] : []);
                return;
            }
            store.replace(nextList);
        },
        push(message) {
            if (typeof store.update === "function") {
                store.update((currentList) => [...currentList, message]);
                return;
            }
            store.push(message);
        },
        updateMessage(messageKey, patch) {
            if (typeof store.update === "function") {
                store.update((currentList) =>
                    currentList.map((message) =>
                        getMessageKey(message) === messageKey
                            ? {
                                  ...message,
                                  ...(patch || {}),
                                  users: {
                                      ...(message.users || {}),
                                      ...(patch?.users || {}),
                                  },
                              }
                            : message,
                    ),
                );
                return;
            }
            if (typeof store.updateMessage === "function") {
                store.updateMessage(messageKey, patch);
            }
        },
        get() {
            return typeof store.get === "function" ? store.get() : [];
        },
        subscribe(subscriber) {
            return store.subscribe(subscriber);
        },
    };

    window.liveChatStore = liveChatStore;

    function canUseReact() {
        if (ReactCore?.canUseReact) {
            return ReactCore.canUseReact();
        }
        return Boolean(
            window.React &&
                window.ReactDOM &&
                typeof window.ReactDOM.createRoot === "function",
        );
    }

    function formatTime(value) {
        if (Services.formatters?.time) {
            return Services.formatters.time(value);
        }
        if (!value) return "";
        const date = new Date(value);
        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) return "";
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function resolveMessageUserId(message) {
        return message?.user_id || message?.users?.id || message?.users?.user_id || null;
    }

    function getMessageKey(message) {
        if (!message) return "anonymous";
        if (message.id) return String(message.id);
        return `${message.user_id || "anonymous"}:${message.created_at || ""}:${message.message || ""}`;
    }

    function getBadgeSignature() {
        if (Services.badges?.getSignature) {
            return Services.badges.getSignature();
        }
        return "0|0|0|0";
    }

    function mountReact() {
        if (!canUseReact()) return;

        const rootEl = document.getElementById("stream-chat-messages");
        if (!rootEl) return;
        if (window.XeraLiveChatUI?.setup) {
            window.XeraLiveChatUI.setup();
        }

        const React = window.React;
        const e = React.createElement;

        function useChatMessages() {
            if (ReactCore?.useStore) {
                return ReactCore.useStore(liveChatStore);
            }

            const [messages, setMessages] = React.useState(liveChatStore.get());

            React.useEffect(() => {
                return liveChatStore.subscribe(() => {
                    setMessages(liveChatStore.get());
                });
            }, []);

            return messages;
        }

        function ChatMessage(props) {
            const message = props.message;
            const isOwnMessage =
                message.user_id && message.user_id === window.currentUser?.id;
            const className =
                "chat-message" + (isOwnMessage ? " own-message" : "");
            const username =
                message.users?.name || message.user_name || "Utilisateur";
            const userId = resolveMessageUserId(message);
            const usernameHtml =
                Services.badges?.renderUsernameWithBadge && userId
                    ? Services.badges.renderUsernameWithBadge(username, userId)
                    : escapeHtml(username);
            const avatar = message.users?.avatar || PLACEHOLDER_AVATAR;

            return e(
                "div",
                { className },
                e("img", {
                    src: avatar,
                    className: "chat-avatar",
                    alt: username,
                    loading: "lazy",
                    referrerPolicy: "no-referrer",
                }),
                e(
                    "div",
                    { className: "chat-message-content" },
                    e(
                        "div",
                        { className: "chat-message-header" },
                        e("span", {
                            className: "chat-username",
                            dangerouslySetInnerHTML: {
                                __html: usernameHtml,
                            },
                        }),
                        e(
                            "span",
                            { className: "chat-timestamp" },
                            formatTime(message.created_at),
                        ),
                    ),
                    e(
                        "div",
                        { className: "chat-message-text" },
                        message.message || "",
                    ),
                ),
            );
        }

        function ChatList() {
            const messages = useChatMessages();
            const [, setBadgeRenderTick] = React.useState(0);
            const previousSignatureRef = React.useRef("");

            const refreshBadges = () => {
                const nextSignature = getBadgeSignature();
                if (nextSignature !== previousSignatureRef.current) {
                    previousSignatureRef.current = nextSignature;
                    setBadgeRenderTick((tick) => tick + 1);
                }
            };

            if (ReactCore?.useStableInterval) {
                React.useEffect(() => {
                    refreshBadges();
                }, []);
                ReactCore.useStableInterval(refreshBadges, 1200);
            } else {
                React.useEffect(() => {
                    refreshBadges();
                    const intervalId = window.setInterval(refreshBadges, 1200);
                    return () => window.clearInterval(intervalId);
                }, []);
            }

            React.useEffect(() => {
                if (window.XeraLiveChatUI?.onMessagesRendered) {
                    window.XeraLiveChatUI.onMessagesRendered({
                        behavior: "auto",
                    });
                    return;
                }
                rootEl.scrollTop = rootEl.scrollHeight;
            }, [messages.length]);

            if (!messages || messages.length === 0) {
                return e(
                    "div",
                    { className: "chat-empty" },
                    "Aucun message pour le moment",
                );
            }

            return e(
                React.Fragment,
                null,
                messages.map((message) =>
                    e(ChatMessage, {
                        key: getMessageKey(message),
                        message,
                    }),
                ),
            );
        }

        if (ReactCore?.mountIsland) {
            ReactCore.mountIsland(
                rootEl,
                () => e(ChatList),
                {
                    captureMarkup: true,
                    name: "streamChat",
                    strict: true,
                },
            );
            return;
        }

        window.ReactDOM.createRoot(rootEl).render(
            e(window.React.StrictMode, null, e(ChatList)),
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", mountReact, {
            once: true,
        });
    } else {
        mountReact();
    }
})();
