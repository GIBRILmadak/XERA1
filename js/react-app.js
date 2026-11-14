(function () {
    const ReactCore = window.XeraReactCore;
    const Services = window.XeraAppServices || {};

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

    function withCacheBust(url, version) {
        if (ReactCore?.withCacheBust) {
            return ReactCore.withCacheBust(url, version);
        }
        if (!url || typeof url !== "string" || url.startsWith("data:")) {
            return url;
        }
        const joiner = url.includes("?") ? "&" : "?";
        return `${url}${joiner}v=${encodeURIComponent(version || Date.now())}`;
    }

    function getDiscoverUsers() {
        if (Services.profiles?.getDiscoverUsers) {
            return Services.profiles.getDiscoverUsers();
        }
        return Array.isArray(window.allUsers) ? [...window.allUsers] : [];
    }

    function renderCardHtml(user) {
        if (!user?.id) return "";
        if (Services.profiles?.renderUserCard) {
            return Services.profiles.renderUserCard(user.id);
        }
        return "";
    }

    function DiscoverGridIsland(props) {
        const React = window.React;
        const [limit, setLimit] = React.useState(props.initialLimit || 18);
        const users = props.users;
        const total = users.length;

        React.useEffect(() => {
            if (limit >= total) return undefined;

            const revealMore = () => {
                setLimit((previousLimit) => Math.min(total, previousLimit + 24));
            };

            if (typeof requestIdleCallback === "function") {
                const idleHandle = requestIdleCallback(revealMore, {
                    timeout: 1200,
                });
                return () => {
                    try {
                        cancelIdleCallback(idleHandle);
                    } catch (error) {
                        /* ignore */
                    }
                };
            }

            const timerId = window.setTimeout(revealMore, 150);
            return () => window.clearTimeout(timerId);
        }, [limit, total]);

        return React.createElement(
            React.Fragment,
            null,
            users.slice(0, limit).map((user) =>
                React.createElement("div", {
                    key: user.id,
                    dangerouslySetInnerHTML: {
                        __html: renderCardHtml(user),
                    },
                }),
            ),
        );
    }

    function mountDiscover(gridEl) {
        if (!canUseReact() || !gridEl) return false;

        const users = getDiscoverUsers();
        if (ReactCore?.mountIsland) {
            return ReactCore.mountIsland(
                gridEl,
                (React) =>
                    React.createElement(DiscoverGridIsland, {
                        users,
                    }),
                {
                    captureMarkup: true,
                    name: "discoverGrid",
                },
            );
        }

        const root = window.ReactDOM.createRoot(gridEl);
        gridEl.__xeraReactRoot = root;
        root.render(window.React.createElement(DiscoverGridIsland, { users }));
        return true;
    }

    function ProfileIsland(props) {
        const React = window.React;
        const user = props.user;
        const version = user?.updated_at || user?.updatedAt || Date.now();

        const safeBanner =
            user?.banner &&
            (user.banner.startsWith("http") || user.banner.startsWith("data:"))
                ? user.banner
                : null;
        const safeAvatar =
            user?.avatar &&
            (user.avatar.startsWith("http") || user.avatar.startsWith("data:"))
                ? user.avatar
                : "https://placehold.co/150";

        const [fullHtml, setFullHtml] = React.useState("");
        const [isLoading, setIsLoading] = React.useState(true);

        React.useEffect(() => {
            let canceled = false;
            let idleHandle = null;
            let timerHandle = null;

            (async () => {
                try {
                    if (!Services.profiles?.renderProfileTimeline) {
                        setIsLoading(false);
                        return;
                    }

                    await new Promise((resolve) => {
                        if (typeof requestIdleCallback === "function") {
                            idleHandle = requestIdleCallback(resolve, {
                                timeout: 900,
                            });
                            return;
                        }
                        timerHandle = window.setTimeout(resolve, 40);
                    });

                    const html = await Services.profiles.renderProfileTimeline(
                        props.userId,
                    );

                    if (canceled) return;
                    setFullHtml(html || "");
                } catch (error) {
                    if (canceled) return;
                    setFullHtml("");
                } finally {
                    if (canceled) return;
                    setIsLoading(false);
                    if (typeof props.onRenderedFull === "function") {
                        props.onRenderedFull();
                    }
                }
            })();

            return () => {
                canceled = true;
                if (idleHandle && typeof cancelIdleCallback === "function") {
                    try {
                        cancelIdleCallback(idleHandle);
                    } catch (error) {
                        /* ignore */
                    }
                }
                if (timerHandle) {
                    window.clearTimeout(timerHandle);
                }
            };
        }, [props.userId]);

        if (fullHtml) {
            return React.createElement("div", {
                dangerouslySetInnerHTML: { __html: fullHtml },
            });
        }

        return React.createElement(
            "div",
            { className: "profile-react-shell" },
            safeBanner
                ? React.createElement("img", {
                      src: withCacheBust(safeBanner, version),
                      className: "profile-banner",
                      alt: user?.name ? `Banniere de ${user.name}` : "Banniere",
                      onError: (event) => {
                          try {
                              event.currentTarget.style.display = "none";
                          } catch (error) {
                              /* ignore */
                          }
                      },
                  })
                : null,
            React.createElement(
                "div",
                { className: "profile-hero" },
                React.createElement(
                    "div",
                    { className: "profile-avatar-wrapper" },
                    React.createElement("img", {
                        src: withCacheBust(safeAvatar, version),
                        className: "profile-avatar-img",
                        alt: user?.name ? `Avatar de ${user.name}` : "Avatar",
                        onClick: () =>
                            typeof window.navigateToUserProfile === "function" &&
                            window.navigateToUserProfile(props.userId),
                        style: { cursor: "pointer" },
                    }),
                ),
                React.createElement("h2", {
                    dangerouslySetInnerHTML: {
                        __html: Services.profiles?.renderProfileUsername
                            ? Services.profiles.renderProfileUsername(
                                  user?.name || "Utilisateur",
                                  user?.id,
                              )
                            : user?.name || "Utilisateur",
                    },
                }),
                user?.title
                    ? React.createElement(
                          "p",
                          {
                              style: { color: "var(--text-secondary)" },
                          },
                          React.createElement("strong", null, user.title),
                      )
                    : null,
                isLoading
                    ? React.createElement("div", {
                          className:
                              "loading-state-container profile-skeleton",
                          role: "status",
                          "aria-busy": "true",
                          "aria-live": "polite",
                      })
                    : null,
            ),
        );
    }

    function mountProfile(containerEl, userId, onRenderedFull) {
        if (!canUseReact() || !containerEl || !userId) return false;

        const user = Services.profiles?.getCachedUser
            ? Services.profiles.getCachedUser(userId)
            : null;
        if (!user) return false;

        if (ReactCore?.mountIsland) {
            return ReactCore.mountIsland(
                containerEl,
                (React) =>
                    React.createElement(ProfileIsland, {
                        onRenderedFull,
                        user,
                        userId,
                    }),
                {
                    captureMarkup: true,
                    name: "profile",
                },
            );
        }

        const root = window.ReactDOM.createRoot(containerEl);
        containerEl.__xeraProfileReactRoot = root;
        root.render(
            window.React.createElement(ProfileIsland, {
                onRenderedFull,
                user,
                userId,
            }),
        );
        return true;
    }

    window.renderDiscoverGridReact = function (gridEl) {
        const element = gridEl || document.querySelector(".discover-grid");
        return mountDiscover(element);
    };

    window.renderProfileReact = function (containerEl, userId, onRenderedFull) {
        const element =
            containerEl || document.querySelector(".profile-container");
        return mountProfile(element, userId, onRenderedFull);
    };

    if (ReactCore?.registerIsland) {
        ReactCore.registerIsland("renderDiscover", () =>
            window.renderDiscoverGridReact(),
        );
        ReactCore.registerIsland("renderProfile", function (
            containerEl,
            userId,
            onRenderedFull,
        ) {
            return window.renderProfileReact(
                containerEl,
                userId,
                onRenderedFull,
            );
        });
    } else {
        window.ReactIslands = window.ReactIslands || {};
        window.ReactIslands.renderDiscover = () =>
            window.renderDiscoverGridReact();
        window.ReactIslands.renderProfile = function (
            containerEl,
            userId,
            onRenderedFull,
        ) {
            return window.renderProfileReact(
                containerEl,
                userId,
                onRenderedFull,
            );
        };
    }
})();
