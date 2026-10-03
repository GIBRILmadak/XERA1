(function () {
    "use strict";

    var styleId = "xera-profile-workspace-styles";
    var observer = null;
    var visibleUpdateLimit = 20;

    function installStyles() {
        if (document.getElementById(styleId)) return;
        var link = document.createElement("link");
        link.id = styleId;
        link.rel = "stylesheet";
        link.href = "css/profile-workspace.css?v=20261002-3";
        document.head.appendChild(link);
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[character];
        });
    }

    function getProfileUserId(root) {
        return root.getAttribute("data-profile-user-id") ||
            (window.profileWorkspaceContext && window.profileWorkspaceContext.profileUserId) ||
            window.currentProfileViewed ||
            new URLSearchParams(window.location.search).get("user") ||
            new URLSearchParams(window.location.search).get("u") ||
            window.currentUserId ||
            "";
    }

    function isProfileOwner(root, userId) {
        var hero = root.querySelector(":scope > .profile-hero--glam");
        return !!(hero && hero.querySelector(".profile-signal-panel--owner")) ||
            !!(userId && window.currentUserId && String(userId) === String(window.currentUserId));
    }

    function getContents(userId) {
        var sources = [];
        var hasMatchingProfileContext = false;
        try {
            var profileContext = window.profileWorkspaceContext;
            if (profileContext && String(profileContext.profileUserId) === String(userId) && Array.isArray(profileContext.contents)) {
                hasMatchingProfileContext = true;
                sources.push(profileContext.contents);
            }
            if (!hasMatchingProfileContext) {
                if (typeof window.getUserContentLocal === "function") {
                    sources.push(window.getUserContentLocal(userId) || []);
                } else if (window.userContents && Array.isArray(window.userContents[userId])) {
                    sources.push(window.userContents[userId]);
                }
            }
        } catch (error) {
            sources = [];
        }
        var isAdmin = typeof window.isSuperAdmin === "function" && window.isSuperAdmin();
        var unique = new Map();
        sources.flat().forEach(function (content, index) {
            if (!content || (!isAdmin && content.isDeleted)) return;
            var id = content.contentId || content.content_id || content.id;
            var key = id
                ? String(id)
                : [content.createdAt || content.created_at || "", content.title || "", index].join(":");
            unique.set(key, content);
        });
        return Array.from(unique.values()).sort(function (left, right) {
            return new Date(right.createdAt || right.created_at || 0).getTime() -
                new Date(left.createdAt || left.created_at || 0).getTime();
        });
    }

    function makeElement(tag, className, text) {
        var element = document.createElement(tag);
        if (className) element.className = className;
        if (text != null) element.textContent = text;
        return element;
    }

    function makeTab(name, label, panelId, selected) {
        var button = makeElement("button", "profile-workspace-tab", label);
        button.type = "button";
        button.id = "profile-workspace-tab-" + name;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-controls", panelId);
        button.setAttribute("aria-selected", selected ? "true" : "false");
        button.setAttribute("tabindex", selected ? "0" : "-1");
        button.dataset.profileTab = name;
        return button;
    }

    function makePanel(name, selected) {
        var panel = makeElement("section", "profile-workspace-panel profile-workspace-panel--" + name);
        panel.id = "profile-workspace-panel-" + name;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", "profile-workspace-tab-" + name);
        panel.tabIndex = 0;
        panel.hidden = !selected;
        panel.dataset.profilePanel = name;
        return panel;
    }

    function getCardTitle(card) {
        var title = card.querySelector(".profile-progress-project strong, .project-meta h4, h4, h3, strong");
        if (title && title.textContent.trim()) return title.textContent.trim();
        return (card.innerText || card.textContent || "").trim().split(/\n+/)[0] || "Projet";
    }

    function getStatusGroup(card) {
        var text = (card.innerText || card.textContent || "").toLowerCase();
        if (text.indexOf("termin") !== -1 || text.indexOf("completed") !== -1) return "completed";
        if (text.indexOf("pause") !== -1 || text.indexOf("abandon") !== -1) return "paused";
        return "active";
    }

    function getArcId(card) {
        var onclick = card.getAttribute("onclick") || "";
        var match = onclick.match(/selectArc\(['"]([^'"]+)['"]/);
        return match ? match[1] : "";
    }

    function getProjectId(card) {
        return card.dataset.projectId || card.getAttribute("data-project-id") || "";
    }

    function makeProjectCard(source, projectGrid, seenTitles, contents, userId) {
        if (!source || source.dataset.profileWorkspaceWrapped === "true") return;
        source.dataset.profileWorkspaceWrapped = "true";

        var title = getCardTitle(source);
        var normalizedTitle = title.toLocaleLowerCase().replace(/\s+/g, " ").trim();
        var arcId = getArcId(source);
        var projectId = getProjectId(source);
        var identityKey = arcId ? "arc:" + arcId : projectId ? "project:" + projectId : "title:" + normalizedTitle;
        if (seenTitles.has(identityKey)) {
            source.remove();
            return;
        }
        seenTitles.add(identityKey);
        var emptyProjectNotice = projectGrid.querySelector(":scope > .profile-content-empty");
        if (emptyProjectNotice) emptyProjectNotice.remove();
        var status = getStatusGroup(source);
        var wrapper = makeElement("article", "profile-workspace-project-card");
        wrapper.dataset.profileProjectStatus = status;
        wrapper.dataset.profileProjectName = normalizedTitle;
        wrapper.dataset.profileProjectTitle = title;
        wrapper.dataset.profileArcId = arcId;
        wrapper.dataset.profileProjectId = projectId;

        var contentTitle = title.toLocaleLowerCase();
        var relatedUpdates = contents.filter(function (content) {
            var arcTitle = String(content.arc && content.arc.title || "").toLocaleLowerCase();
            var projectTitle = String(content.project && content.project.name || "").toLocaleLowerCase();
            return (arcId && String(content.arcId || content.arc_id || content.arc && content.arc.id || "") === arcId) ||
                (projectId && String(content.projectId || content.project_id || content.project && content.project.id || "") === projectId) ||
                arcTitle === contentTitle || projectTitle === contentTitle;
        });
        var latestUpdate = relatedUpdates[0];
        var latestLabel = latestUpdate
            ? (typeof window.timeAgo === "function"
                ? window.timeAgo(latestUpdate.createdAt || latestUpdate.created_at)
                : new Date(latestUpdate.createdAt || latestUpdate.created_at).toLocaleDateString())
            : "Aucune update récente";

        var statusLabel = status === "completed" ? "Terminé" : status === "paused" ? "En pause" : "En cours";
        var originalStatus = source.querySelector(".profile-progress-project-status");
        if (originalStatus) statusLabel = originalStatus.textContent.trim();
        wrapper.dataset.profileStatusLabel = statusLabel;

        var sourceHolder = makeElement("div", "profile-workspace-project-source");
        source.removeAttribute("onclick");
        source.style.cursor = "pointer";
        sourceHolder.appendChild(source);

        var progressValue = source.querySelector(".profile-progress-track > span");
        if (progressValue) {
            var percent = parseFloat(progressValue.style.width);
            if (Number.isFinite(percent)) {
                wrapper.insertBefore(makeElement("span", "profile-workspace-project-progress-label", Math.round(percent) + "%"), sourceHolder);
            }
        }
        wrapper.appendChild(sourceHolder);

        if (!source.querySelector(".profile-progress-project-status")) {
            var statusChip = makeElement("span", "profile-workspace-project-status", statusLabel);
            wrapper.insertBefore(statusChip, sourceHolder);
        }

        if (!source.querySelector(".profile-progress-track")) {
            var updateMeta = makeElement("div", "profile-workspace-project-meta");
            updateMeta.appendChild(makeElement("span", "", relatedUpdates.length + " update" + (relatedUpdates.length === 1 ? "" : "s")));
            updateMeta.appendChild(makeElement("span", "", latestLabel));
            wrapper.appendChild(updateMeta);
        }

        var actions = makeElement("div", "profile-workspace-project-actions");
        var previewButton = makeElement("button", "profile-workspace-project-action", "Aperçu");
        previewButton.type = "button";
        previewButton.dataset.profileProjectPreview = "true";
        var updatesButton = makeElement("button", "profile-workspace-project-action", "Updates");
        updatesButton.type = "button";
        updatesButton.dataset.profileProjectUpdates = "true";
        actions.appendChild(previewButton);
        actions.appendChild(updatesButton);
        wrapper.appendChild(actions);

        var latest = makeElement("span", "profile-workspace-project-latest", "Dernière update · " + latestLabel);
        wrapper.appendChild(latest);

        projectGrid.appendChild(wrapper);
    }

    function collectProjects(root, projectGrid, overviewGrid, contents, userId, seenTitles) {
        seenTitles = seenTitles || new Set();
        var projectSections = Array.prototype.slice.call(
            root.querySelectorAll(".profile-progress-board, .arcs-section, .projects-grid")
        ).filter(function (section) {
            return !section.closest(".profile-workspace");
        });

        projectSections.forEach(function (section) {
            var cards = section.querySelectorAll(
                ".profile-progress-project, .arc-card, .project-card"
            );
            Array.prototype.forEach.call(cards, function (card) {
                makeProjectCard(card, projectGrid, seenTitles, contents, userId);
            });
            section.remove();
        });

        Array.prototype.slice.call(root.querySelectorAll("#user-arcs-section")).forEach(function (section) {
            if (section.closest(".profile-workspace")) return;
            Array.prototype.forEach.call(section.querySelectorAll(".arc-card, .project-card"), function (card) {
                makeProjectCard(card, projectGrid, seenTitles, contents, userId);
            });
            section.remove();
        });

    }

    function collectOverviewWidgets(root, widgets) {
        if (!widgets) return;
        var kept = new Set();
        Array.prototype.forEach.call(widgets.querySelectorAll(".trajectory-guard, .weekly-progress-card"), function (node) {
            kept.add(node.classList.contains("trajectory-guard") ? "trajectory" : "weekly");
        });
        Array.prototype.slice.call(root.querySelectorAll(".trajectory-guard, .weekly-progress-card"))
            .filter(function (node) { return !node.closest(".profile-workspace"); })
            .forEach(function (node) {
                var key = node.classList.contains("trajectory-guard") ? "trajectory" : "weekly";
                if (kept.has(key)) {
                    node.remove();
                    return;
                }
                kept.add(key);
                widgets.appendChild(node);
            });
    }

    function syncOverviewProjects(workspace) {
        var projectGrid = workspace.querySelector("[data-profile-projects]");
        var overviewGrid = workspace.querySelector("[data-profile-overview-projects]");
        if (!projectGrid || !overviewGrid) return;
        overviewGrid.replaceChildren();
        var activeCards = Array.prototype.filter.call(
            projectGrid.querySelectorAll(".profile-workspace-project-card"),
            function (card) {
                return card.dataset.profileProjectStatus !== "completed" && card.dataset.profileProjectStatus !== "paused";
            }
        );
        activeCards.slice(0, 3).forEach(function (card) {
            overviewGrid.appendChild(card.cloneNode(true));
        });
        if (!activeCards.length) {
            var empty = makeElement("div", "profile-content-empty");
            empty.innerHTML = "<h3>Aucun projet actif</h3><p>Les projets en cours apparaîtront ici.</p>";
            overviewGrid.appendChild(empty);
        }
    }

    function getContentTags(content) {
        var tags = Array.isArray(content.tags) ? content.tags.slice() : [];
        if (!tags.length) {
            var description = String(content.description || "");
            var hashtagBlock = description.match(/#hashtags:\s*([\w\-#,\s]+)/i);
            if (hashtagBlock) {
                tags = hashtagBlock[1].split(/[\s,]+/);
            } else {
                tags = description.match(/#[\w-]+/g) || [];
            }
        }
        return Array.from(new Set(tags.map(function (tag) {
            return String(tag).replace(/^#/, "").trim().toLowerCase();
        }).filter(Boolean)));
    }

    function getTypeLabel(content) {
        if (typeof window.getProfileContentTypeLabel === "function") {
            return window.getProfileContentTypeLabel(content);
        }
        return content.type || "Texte";
    }

    function renderFallbackUpdate(content) {
        var title = escapeHtml(content.title || "Mise à jour");
        var description = escapeHtml(content.description || "");
        var date = new Date(content.createdAt || content.created_at || 0).toLocaleDateString();
        return '<article class="profile-update-card profile-update-card--compact">' +
            '<div class="profile-update-top"><span class="profile-update-pill">' + escapeHtml(getTypeLabel(content)) + '</span>' +
            '<span class="profile-update-meta">' + escapeHtml(date) + '</span></div>' +
            '<div class="profile-update-main"><h4>' + title + '</h4><p>' + description + '</p></div></article>';
    }

    function buildUpdateFeed(panel, contents, userId) {
        var timeline = panel.querySelector(".timeline.profile-content-shell");
        if (timeline) timeline.remove();
        var previousView = panel.querySelector(".profile-updates-view");
        if (previousView) previousView.remove();

        var view = makeElement("section", "profile-updates-view");
        var toolbar = makeElement("div", "profile-updates-toolbar");
        var projectSelect = document.createElement("select");
        projectSelect.setAttribute("aria-label", "Filtrer par projet");
        projectSelect.dataset.profileFilter = "project";
        projectSelect.innerHTML = '<option value="">Tous les projets</option>';

        var projectOptions = new Map();
        var profileArcs = window.profileWorkspaceContext && window.profileWorkspaceContext.arcs || [];
        var arcTitles = new Map(profileArcs.map(function (arc) { return [String(arc.id), arc.title]; }));
        contents.forEach(function (content) {
            var arcId = content.arcId || content.arc_id || content.arc && content.arc.id;
            var projectId = content.projectId || content.project_id || content.project && content.project.id;
            if (arcId) projectOptions.set("arc:" + arcId, content.arc && content.arc.title || arcTitles.get(String(arcId)) || "Projet");
            if (projectId) projectOptions.set("project:" + projectId, content.project && content.project.name || "Projet");
        });
        projectOptions.forEach(function (label, value) {
            var option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            projectSelect.appendChild(option);
        });

        var tagSelect = document.createElement("select");
        tagSelect.setAttribute("aria-label", "Filtrer par tag");
        tagSelect.dataset.profileFilter = "tag";
        tagSelect.innerHTML = '<option value="">Tous les tags</option>';
        var tags = new Set();
        contents.forEach(function (content) {
            getContentTags(content).forEach(function (tag) {
                tags.add(tag);
            });
        });
        Array.from(tags).sort().forEach(function (tag) {
            var option = document.createElement("option");
            option.value = tag;
            option.textContent = "#" + tag;
            tagSelect.appendChild(option);
        });

        var typeSelect = document.createElement("select");
        typeSelect.setAttribute("aria-label", "Filtrer par type");
        typeSelect.dataset.profileFilter = "type";
        typeSelect.innerHTML = '<option value="">Tous les types</option>';
        var types = new Set();
        contents.forEach(function (content) { types.add(getTypeLabel(content)); });
        Array.from(types).sort().forEach(function (type) {
            var option = document.createElement("option");
            option.value = String(type).toLowerCase();
            option.textContent = type;
            typeSelect.appendChild(option);
        });

        toolbar.appendChild(projectSelect);
        toolbar.appendChild(tagSelect);
        toolbar.appendChild(typeSelect);
        var reset = makeElement("button", "profile-filter-reset", "Réinitialiser");
        reset.type = "button";
        reset.dataset.profileFilterReset = "true";
        toolbar.appendChild(reset);
        view.appendChild(toolbar);

        var count = makeElement("p", "profile-updates-count", "");
        count.dataset.profileUpdatesCount = "true";
        count.setAttribute("aria-live", "polite");
        view.appendChild(count);

        var feed = makeElement("div", "profile-update-feed");
        feed.dataset.profileUpdateFeed = "true";
        feed.dataset.visibleLimit = String(visibleUpdateLimit);
        var encouragements = new Set();
        contents.forEach(function (content, index) {
            var arcId = content.arcId || content.arc_id || content.arc && content.arc.id || "";
            var projectId = content.projectId || content.project_id || content.project && content.project.id || "";
            var item = makeElement("article", "profile-update-feed-item");
            var projectKeys = [];
            if (arcId) projectKeys.push("arc:" + arcId);
            if (projectId) projectKeys.push("project:" + projectId);
            item.dataset.profileProjectKeys = projectKeys.join(" ");
            item.dataset.profileTags = getContentTags(content).join(" ");
            item.dataset.profileType = String(getTypeLabel(content)).toLowerCase();
            item.dataset.profileUpdateIndex = String(index);
            item.dataset.profileContentId = content.contentId || content.content_id || content.id || "";

            var cardHtml = "";
            try {
                if (typeof window.renderProfileUpdateCard === "function") {
                    cardHtml = window.renderProfileUpdateCard(content, {
                        profileUserId: userId,
                        currentUserId: window.currentUserId,
                        isAdminViewer: typeof window.isSuperAdmin === "function" && window.isSuperAdmin(),
                        encouragedContentIds: encouragements,
                        compact: true,
                        selectedArcMode: false
                    });
                }
            } catch (error) {
                cardHtml = "";
            }
            item.innerHTML = cardHtml || renderFallbackUpdate(content);
            feed.appendChild(item);
        });
        view.appendChild(feed);

        var empty = makeElement("div", "profile-content-empty");
        empty.dataset.profileFilterEmpty = "true";
        empty.hidden = true;
        empty.innerHTML = "<h3>Aucun résultat</h3><p>Modifiez les filtres pour retrouver d’autres updates.</p>";
        view.appendChild(empty);

        var more = makeElement("button", "profile-load-more", "Charger les updates suivantes");
        more.type = "button";
        more.dataset.profileLoadMore = "true";
        more.hidden = true;
        view.appendChild(more);
        panel.appendChild(view);
    }

    function applyUpdateFilters(root, resetLimit) {
        var view = root.querySelector(".profile-updates-view");
        if (!view) return;
        var project = view.querySelector('[data-profile-filter="project"]');
        var tag = view.querySelector('[data-profile-filter="tag"]');
        var type = view.querySelector('[data-profile-filter="type"]');
        var feed = view.querySelector("[data-profile-update-feed]");
        if (!feed) return;

        if (resetLimit) feed.dataset.visibleLimit = String(visibleUpdateLimit);
        var limit = Number(feed.dataset.visibleLimit) || visibleUpdateLimit;
        var selectedProject = project ? project.value : "";
        var selectedTag = tag ? tag.value : "";
        var selectedType = type ? type.value : "";
        var matched = [];

        Array.prototype.forEach.call(feed.querySelectorAll(".profile-update-feed-item"), function (item) {
            var matchesProject = !selectedProject ||
                (" " + item.dataset.profileProjectKeys + " ").indexOf(" " + selectedProject + " ") !== -1;
            var matchesTag = !selectedTag ||
                (" " + item.dataset.profileTags + " ").indexOf(" " + selectedTag + " ") !== -1;
            var matchesType = !selectedType || item.dataset.profileType === selectedType;
            var matches = matchesProject && matchesTag && matchesType;
            item.hidden = !matches;
            if (matches) matched.push(item);
        });

        matched.forEach(function (item, index) {
            item.hidden = index >= limit;
        });
        var count = view.querySelector("[data-profile-updates-count]");
        if (count) count.textContent = matched.length + " update" + (matched.length === 1 ? "" : "s");
        var empty = view.querySelector("[data-profile-filter-empty]");
        if (empty) empty.hidden = matched.length > 0;
        var more = view.querySelector("[data-profile-load-more]");
        if (more) {
            more.hidden = matched.length <= limit;
            more.textContent = "Charger les " + Math.min(visibleUpdateLimit, Math.max(0, matched.length - limit)) + " suivantes";
        }
    }

    function applyProjectFilters(root) {
        var projectsPanel = root.querySelector('[data-profile-panel="projects"]');
        if (!projectsPanel) return;
        var queryInput = projectsPanel.querySelector("[data-profile-project-search]");
        var query = queryInput ? queryInput.value.trim().toLocaleLowerCase() : "";
        var activeFilter = projectsPanel.dataset.statusFilter || "all";
        var visible = 0;
        Array.prototype.forEach.call(projectsPanel.querySelectorAll(".profile-workspace-project-card"), function (card) {
            var matchesText = !query || card.dataset.profileProjectName.indexOf(query) !== -1;
            var matchesStatus = activeFilter === "all" || card.dataset.profileProjectStatus === activeFilter;
            card.hidden = !(matchesText && matchesStatus);
            if (!card.hidden) visible += 1;
        });
        var empty = projectsPanel.querySelector("[data-profile-project-empty]");
        if (empty) empty.hidden = visible > 0;
    }

    function getContentSignature(contents) {
        return contents.map(function (content, index) {
            return content.contentId || content.content_id || content.id ||
                [content.createdAt || content.created_at || "", content.title || "", index].join(":");
        }).join("|");
    }

    function syncOverviewUpdates(workspace, contents) {
        var latestGrid = workspace.querySelector("[data-profile-latest-updates]");
        if (!latestGrid) return;
        latestGrid.replaceChildren();

        var feedItems = workspace.querySelectorAll("[data-profile-update-feed] .profile-update-feed-item");
        contents.slice(0, 3).forEach(function (_content, index) {
            if (feedItems[index]) latestGrid.appendChild(feedItems[index].cloneNode(true));
        });

        if (!contents.length) {
            var empty = makeElement("div", "profile-content-empty");
            empty.innerHTML = "<h3>Aucune publication récente</h3><p>Les mises à jour visibles apparaîtront ici.</p>";
            latestGrid.appendChild(empty);
        }
    }

    function setActiveTab(root, name, pushHistory) {
        var valid = ["overview", "projects", "updates"];
        if (valid.indexOf(name) === -1) name = "overview";
        Array.prototype.forEach.call(root.querySelectorAll("[data-profile-tab]"), function (tab) {
            var active = tab.dataset.profileTab === name;
            tab.setAttribute("aria-selected", active ? "true" : "false");
            tab.setAttribute("tabindex", active ? "0" : "-1");
        });
        Array.prototype.forEach.call(root.querySelectorAll("[data-profile-panel]"), function (panel) {
            panel.hidden = panel.dataset.profilePanel !== name;
        });
        if (pushHistory) {
            var url = new URL(window.location.href);
            url.searchParams.set("profileTab", name);
            window.history.pushState(window.history.state, "", url.toString());
        }
    }

    function syncFilterUrl(root, key, value) {
        var url = new URL(window.location.href);
        var param = "profile" + key.charAt(0).toUpperCase() + key.slice(1);
        if (value) url.searchParams.set(param, value);
        else url.searchParams.delete(param);
        window.history.replaceState(window.history.state, "", url.toString());
    }

    function openQuickView(root, card) {
        var dialog = root.querySelector("[data-profile-project-dialog]");
        if (!dialog) return;
        var title = card.dataset.profileProjectTitle || card.dataset.profileProjectName || "Projet";
        var source = card.querySelector(".profile-workspace-project-source");
        var text = source ? source.innerText : card.innerText;
        var titleNode = dialog.querySelector("[data-dialog-title]");
        var bodyNode = dialog.querySelector("[data-dialog-body]");
        if (titleNode) titleNode.textContent = title;
        if (bodyNode) bodyNode.textContent = text;
        dialog.dataset.arcId = card.dataset.profileArcId || "";
        dialog.dataset.projectId = card.dataset.profileProjectId || "";
        dialog.dataset.userId = getProfileUserId(root);
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "open");
    }

    function createWorkspace(root, hero, userId) {
        if (root.querySelector(".profile-workspace")) return root.querySelector(".profile-workspace");
        var workspace = makeElement("section", "profile-workspace");
        workspace.dataset.profileWorkspace = "true";
        workspace.dataset.profileUserId = userId;

        var query = new URLSearchParams(window.location.search);
        var initialTab = query.get("profileTab") ||
            (query.get("arc") || window.selectedArcId ? "updates" : "overview");
        var tabs = makeElement("nav", "profile-workspace-tabs");
        tabs.setAttribute("role", "tablist");
        tabs.setAttribute("aria-label", "Contenu du profil");

        var overviewTab = makeTab("overview", "Vue d’ensemble", "profile-workspace-panel-overview", initialTab === "overview");
        var projectsTab = makeTab("projects", "Projets", "profile-workspace-panel-projects", initialTab === "projects");
        var updatesTab = makeTab("updates", "Fil d’Updates", "profile-workspace-panel-updates", initialTab === "updates");
        tabs.appendChild(overviewTab);
        tabs.appendChild(projectsTab);
        tabs.appendChild(updatesTab);
        workspace.appendChild(tabs);

        var overview = makePanel("overview", initialTab === "overview");
        var projects = makePanel("projects", initialTab === "projects");
        var updates = makePanel("updates", initialTab === "updates");

        var overviewWidgets = makeElement("div", "profile-workspace-overview-widgets");
        overviewWidgets.dataset.profileOverviewWidgets = "true";
        overview.appendChild(overviewWidgets);

        var projectHeading = makeElement("div", "profile-workspace-section-heading");
        projectHeading.innerHTML = '<div><span class="profile-section-kicker">Build in Public</span><h3>Projets actifs</h3></div>' +
            '<a class="profile-workspace-link" href="#profile-workspace-panel-projects" data-profile-tab-target="projects">Tous les projets →</a>';
        overview.appendChild(projectHeading);

        var overviewGrid = makeElement("div", "profile-workspace-project-grid profile-workspace-project-grid--overview");
        overviewGrid.dataset.profileOverviewProjects = "true";
        overview.appendChild(overviewGrid);

        var latestHeading = makeElement("div", "profile-workspace-section-heading");
        latestHeading.innerHTML = '<div><span class="profile-section-kicker">Updates récentes</span><h3>Dernières publications</h3></div>' +
            '<a class="profile-workspace-link" href="#profile-workspace-panel-updates" data-profile-tab-target="updates">Voir le fil complet →</a>';
        overview.appendChild(latestHeading);
        var latestGrid = makeElement("div", "profile-workspace-latest");
        latestGrid.dataset.profileLatestUpdates = "true";
        overview.appendChild(latestGrid);

        var projectToolbar = makeElement("div", "profile-workspace-project-toolbar");
        var projectSearch = document.createElement("input");
        projectSearch.type = "search";
        projectSearch.placeholder = "Rechercher un projet";
        projectSearch.setAttribute("aria-label", "Rechercher un projet");
        projectSearch.dataset.profileProjectSearch = "true";
        projectToolbar.appendChild(projectSearch);
        [
            ["all", "Tous"],
            ["active", "En cours"],
            ["completed", "Terminé"],
            ["paused", "En pause"]
        ].forEach(function (entry) {
            var button = makeElement("button", "profile-project-status-filter", entry[1]);
            button.type = "button";
            button.dataset.profileProjectStatusFilter = entry[0];
            button.setAttribute("aria-pressed", entry[0] === "all" ? "true" : "false");
            projectToolbar.appendChild(button);
        });
        projects.appendChild(projectToolbar);
        var projectGrid = makeElement("div", "profile-workspace-project-grid");
        projectGrid.dataset.profileProjects = "true";
        projects.appendChild(projectGrid);
        var projectEmpty = makeElement("div", "profile-content-empty");
        projectEmpty.dataset.profileProjectEmpty = "true";
        projectEmpty.hidden = true;
        projectEmpty.innerHTML = "<h3>Aucun projet trouvé</h3><p>Essayez un autre filtre.</p>";
        projects.appendChild(projectEmpty);

        var projectDialog = document.createElement("dialog");
        projectDialog.className = "profile-workspace-dialog";
        projectDialog.dataset.profileProjectDialog = "true";
        projectDialog.innerHTML = '<form method="dialog"><button class="profile-workspace-dialog-close" aria-label="Fermer">×</button></form>' +
            '<span class="profile-section-kicker">Aperçu du projet</span><h3 data-dialog-title></h3>' +
            '<div class="profile-workspace-dialog-body" data-dialog-body></div>' +
            '<button type="button" class="profile-workspace-link" data-dialog-updates>Voir ses updates →</button>';
        workspace.appendChild(overview);
        workspace.appendChild(projects);
        workspace.appendChild(updates);
        workspace.appendChild(projectDialog);
        root.insertBefore(workspace, hero.nextSibling);

        var footer = root.querySelector(":scope > footer");
        var privacyNoticeSource = hero.classList.contains("profile-privacy-locked")
            ? hero.querySelector(".profile-privacy-card, .profile-privacy-muted")
            : Array.prototype.slice.call(root.children).find(function (node) {
                return node !== hero && node.matches(".profile-privacy-card, .profile-privacy-muted");
            });
        var activityRestricted = hero.classList.contains("profile-privacy-locked") || !!privacyNoticeSource;
        workspace.dataset.profileActivityRestricted = activityRestricted ? "true" : "false";
        var privacyNotice = null;
        if (activityRestricted) {
            privacyNotice = makeElement("div", "profile-privacy-muted");
            var privacyKicker = privacyNoticeSource && privacyNoticeSource.querySelector(".profile-section-kicker");
            var privacyParagraph = privacyNoticeSource && privacyNoticeSource.querySelector("p");
            privacyNotice.appendChild(makeElement("span", "profile-section-kicker", privacyKicker ? privacyKicker.textContent : "Activité masquée"));
            privacyNotice.appendChild(makeElement("p", "", privacyParagraph ? privacyParagraph.textContent : "Cet utilisateur garde ses projets et mises à jour hors du profil public."));
        }
        var seenProjectTitles = new Set();
        if (!activityRestricted) {
            collectProjects(root, projects.querySelector("[data-profile-projects]"), overviewGrid, getContents(userId), userId, seenProjectTitles);
        }

        function ensureOwnerToolsDisclosure() {
            var disclosure = root.querySelector("[data-profile-owner-tools]");
            if (disclosure) return disclosure;
            disclosure = document.createElement("details");
            disclosure.className = "profile-workspace-owner-menu";
            disclosure.dataset.profileOwnerTools = "true";
            disclosure.innerHTML = "<summary>Connecter des outils</summary>";
            var ownerActions = root.querySelector(".profile-signal-panel--owner .profile-actions");
            if (ownerActions) ownerActions.appendChild(disclosure);
            else overview.appendChild(disclosure);
            return disclosure;
        }

        if (!activityRestricted) {
            var ownProfile = isProfileOwner(root, userId);
            collectOverviewWidgets(root, overviewWidgets);

            Array.prototype.slice.call(root.querySelectorAll(".external-connections-hero, .influence-section, .work-items-section"))
                .filter(function (node) {
                    return !node.closest(".profile-workspace, [data-profile-owner-tools], .profile-hero--glam");
                })
                .forEach(function (node) {
                    if (!ownProfile) {
                        node.remove();
                        return;
                    }
                    if (node.classList.contains("work-items-section")) {
                        var workDetails = document.createElement("details");
                        workDetails.className = "profile-workspace-work-items";
                        workDetails.innerHTML = "<summary>Preuves de travail connectées</summary>";
                        workDetails.appendChild(node);
                        ensureOwnerToolsDisclosure().appendChild(workDetails);
                    } else {
                        ensureOwnerToolsDisclosure().appendChild(node);
                    }
                });
        }

        var children = Array.prototype.slice.call(root.children);
        children.forEach(function (node) {
            if (node === hero || node === workspace || node === footer || node.tagName === "SCRIPT" || node.tagName === "STYLE") return;
            if (node !== hero && node.matches(".profile-privacy-card, .profile-privacy-muted")) {
                node.remove();
                return;
            }
            // The legacy profile is only a source for the curated workspace now.
            // Its widgets, projects, and owner tools are collected explicitly below;
            // every other activity section is discarded instead of being appended.
            node.remove();
        });

        var ownerActions = root.querySelector(".profile-signal-panel--owner .profile-actions");
        if (ownerActions) {
            var settingButtons = Array.prototype.slice.call(ownerActions.querySelectorAll(":scope > .settings-badge"));
            if (settingButtons.length) {
                var manage = document.createElement("details");
                manage.className = "profile-workspace-owner-menu";
                manage.innerHTML = "<summary>Gérer</summary>";
                settingButtons.forEach(function (button) { manage.appendChild(button); });
                ownerActions.appendChild(manage);
            }
        }

        if (activityRestricted) {
            projectGrid.replaceChildren();
            overviewGrid.replaceChildren();
            if (!overview.querySelector(".profile-privacy-card, .profile-privacy-muted, .profile-privacy-locked")) {
                overview.appendChild(privacyNotice.cloneNode(true));
            }
            updates.appendChild(privacyNotice.cloneNode(true));
            projects.appendChild(privacyNotice.cloneNode(true));
        } else {
            var contents = getContents(userId);
            if (!projectGrid.children.length) {
                var emptyProjects = makeElement("div", "profile-content-empty");
                emptyProjects.innerHTML = "<h3>Aucun projet public</h3><p>Les projets visibles apparaîtront ici.</p>";
                projectGrid.appendChild(emptyProjects);
            }
            syncOverviewProjects(workspace);
            buildUpdateFeed(updates, contents, userId);
            workspace.dataset.profileContentsSignature = getContentSignature(contents);
            syncOverviewUpdates(workspace, contents);
        }

        var filterBar = projects.querySelector(".profile-workspace-project-toolbar");
        if (filterBar) {
            filterBar.addEventListener("click", function (event) {
                var button = event.target.closest("[data-profile-project-status-filter]");
                if (!button) return;
                projects.dataset.statusFilter = button.dataset.profileProjectStatusFilter;
                filterBar.querySelectorAll("[data-profile-project-status-filter]").forEach(function (filterButton) {
                    filterButton.setAttribute("aria-pressed", filterButton === button ? "true" : "false");
                });
                applyProjectFilters(workspace);
            });
            filterBar.addEventListener("input", function () { applyProjectFilters(workspace); });
        }

        return workspace;
    }

    function bindWorkspace(root) {
        if (root.dataset.profileWorkspaceEvents === "true") return;
        root.dataset.profileWorkspaceEvents = "true";

        root.addEventListener("click", function (event) {
            var media = event.target.closest(".profile-update-media");
            if (media && !event.target.closest("button, a")) {
                var feedItem = media.closest(".profile-update-feed-item");
                var contentId = feedItem && feedItem.dataset.profileContentId;
                var userId = getProfileUserId(root);
                if (contentId && typeof window.openImmersive === "function") {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    window.openImmersive(userId, contentId, {
                        scope: "profile",
                        contents: getContents(userId),
                    });
                }
                return;
            }
            var tab = event.target.closest("[data-profile-tab]");
            var tabTarget = event.target.closest("[data-profile-tab-target]");
            if (tab) {
                setActiveTab(root, tab.dataset.profileTab, true);
                return;
            }
            if (tabTarget) {
                event.preventDefault();
                setActiveTab(root, tabTarget.dataset.profileTabTarget, true);
                return;
            }
            var reset = event.target.closest("[data-profile-filter-reset]");
            if (reset) {
                var view = root.querySelector(".profile-updates-view");
                if (view) view.querySelectorAll("[data-profile-filter]").forEach(function (select) { select.value = ""; });
                ["project", "tag", "type"].forEach(function (key) { syncFilterUrl(root, key, ""); });
                applyUpdateFilters(root, true);
                return;
            }
            var more = event.target.closest("[data-profile-load-more]");
            if (more) {
                var feed = root.querySelector("[data-profile-update-feed]");
                if (feed) feed.dataset.visibleLimit = String((Number(feed.dataset.visibleLimit) || visibleUpdateLimit) + visibleUpdateLimit);
                applyUpdateFilters(root, false);
                return;
            }
            var preview = event.target.closest("[data-profile-project-preview]");
            if (preview) {
                openQuickView(root, preview.closest(".profile-workspace-project-card"));
                return;
            }
            var sourceProject = event.target.closest(".profile-progress-project, .arc-card, .project-card");
            if (sourceProject && sourceProject.closest(".profile-workspace-project-card")) {
                var isProgressButton = sourceProject.matches(".profile-progress-project");
                var clickedControl = event.target.closest("a, button, input, select");
                if (isProgressButton || !clickedControl) {
                    openQuickView(root, sourceProject.closest(".profile-workspace-project-card"));
                    return;
                }
            }
            var projectUpdates = event.target.closest("[data-profile-project-updates], [data-dialog-updates]");
            if (projectUpdates) {
                var card = projectUpdates.closest(".profile-workspace-project-card");
                var dialog = projectUpdates.closest("[data-profile-project-dialog]");
                var arcId = card ? card.dataset.profileArcId : dialog && dialog.dataset.arcId;
                var projectId = card ? card.dataset.profileProjectId : dialog && dialog.dataset.projectId;
                var filter = arcId ? "arc:" + arcId : projectId ? "project:" + projectId : "";
                var projectSelect = root.querySelector('[data-profile-filter="project"]');
                if (projectSelect) projectSelect.value = filter;
                var dialogRoot = root.querySelector("[data-profile-project-dialog]");
                if (dialogRoot && dialogRoot.open) dialogRoot.close();
                setActiveTab(root, "updates", true);
                applyUpdateFilters(root, true);
                syncFilterUrl(root, "project", filter);
            }
        }, true);

        root.addEventListener("change", function (event) {
            var select = event.target.closest("[data-profile-filter]");
            if (!select) return;
            applyUpdateFilters(root, true);
            syncFilterUrl(root, select.dataset.profileFilter, select.value);
        });

        root.addEventListener("input", function (event) {
            if (event.target.matches("[data-profile-project-search]")) applyProjectFilters(root);
        });

        root.addEventListener("keydown", function (event) {
            var tab = event.target.closest("[data-profile-tab]");
            if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            var tabs = Array.prototype.slice.call(root.querySelectorAll("[data-profile-tab]"));
            var index = tabs.indexOf(tab);
            if (event.key === "ArrowLeft") index = (index - 1 + tabs.length) % tabs.length;
            if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
            if (event.key === "Home") index = 0;
            if (event.key === "End") index = tabs.length - 1;
            event.preventDefault();
            tabs[index].focus();
            setActiveTab(root, tabs[index].dataset.profileTab, true);
        });
    }

    function enhanceProfile(root) {
        if (!root) return;
        var hero = root.querySelector(":scope > .profile-hero--glam");
        if (!hero) return;
        var userId = getProfileUserId(root);
        var workspace = root.querySelector(".profile-workspace");
        if (!workspace) {
            workspace = createWorkspace(root, hero, userId);
            if (!workspace) return;
            bindWorkspace(root);
            var query = new URLSearchParams(window.location.search);
            var projectFilter = query.get("profileProject") || (query.get("arc") ? "arc:" + query.get("arc") : "");
            var updateView = workspace.querySelector(".profile-updates-view");
            if (updateView) {
                var projectSelect = updateView.querySelector('[data-profile-filter="project"]');
                var tagSelect = updateView.querySelector('[data-profile-filter="tag"]');
                var typeSelect = updateView.querySelector('[data-profile-filter="type"]');
                if (projectSelect && projectFilter) projectSelect.value = projectFilter;
                if (tagSelect && query.get("profileTag")) tagSelect.value = query.get("profileTag");
                if (typeSelect && query.get("profileType")) typeSelect.value = query.get("profileType");
                applyUpdateFilters(workspace, true);
            }
            setActiveTab(workspace, query.get("profileTab") || (projectFilter ? "updates" : "overview"), false);
            applyProjectFilters(workspace);
        } else {
            var footer = root.querySelector(":scope > footer");
            var projectGrid = workspace.querySelector("[data-profile-projects]");
            var overviewWidgets = workspace.querySelector("[data-profile-overview-widgets]");
            var ownProfile = isProfileOwner(root, userId);
            if (workspace.dataset.profileActivityRestricted !== "true") {
                var contents = getContents(userId);
                var signature = getContentSignature(contents);
                if (signature !== workspace.dataset.profileContentsSignature) {
                    var updatesPanel = workspace.querySelector('[data-profile-panel="updates"]');
                    if (updatesPanel) {
                        buildUpdateFeed(updatesPanel, contents, userId);
                        applyUpdateFilters(workspace, true);
                    }
                    syncOverviewUpdates(workspace, contents);
                    workspace.dataset.profileContentsSignature = signature;
                }
            }
            var lateProjectSources = Array.prototype.slice.call(root.querySelectorAll(".profile-progress-board, #user-arcs-section, .arcs-section, .projects-grid"))
                .filter(function (section) { return !section.closest(".profile-workspace"); });
            if (projectGrid && lateProjectSources.length) {
                var seen = new Set(Array.prototype.map.call(projectGrid.querySelectorAll(".profile-workspace-project-card"), function (card) {
                    return card.dataset.profileArcId
                        ? "arc:" + card.dataset.profileArcId
                        : card.dataset.profileProjectId
                            ? "project:" + card.dataset.profileProjectId
                            : "title:" + card.dataset.profileProjectName;
                }));
                collectProjects(root, projectGrid, workspace.querySelector("[data-profile-overview-projects]"), getContents(userId), userId, seen);
                applyProjectFilters(workspace);
                syncOverviewProjects(workspace);
            }

            collectOverviewWidgets(root, overviewWidgets);

            var ownerTools = root.querySelector("[data-profile-owner-tools]");
            Array.prototype.slice.call(root.querySelectorAll(".external-connections-hero, .influence-section, .work-items-section"))
                .filter(function (node) {
                    return !node.closest(".profile-workspace, [data-profile-owner-tools], .profile-hero--glam");
                })
                .forEach(function (node) {
                    if (!ownProfile) {
                        node.remove();
                        return;
                    }
                    if (!ownerTools) {
                        ownerTools = document.createElement("details");
                        ownerTools.className = "profile-workspace-owner-menu";
                        ownerTools.dataset.profileOwnerTools = "true";
                        ownerTools.innerHTML = "<summary>Connecter des outils</summary>";
                        var ownerActions = root.querySelector(".profile-signal-panel--owner .profile-actions");
                        if (ownerActions) ownerActions.appendChild(ownerTools);
                        else workspace.querySelector('[data-profile-panel="overview"]').appendChild(ownerTools);
                    }
                    if (node.classList.contains("work-items-section")) {
                        var workDetails = document.createElement("details");
                        workDetails.className = "profile-workspace-work-items";
                        workDetails.innerHTML = "<summary>Preuves de travail connectées</summary>";
                        workDetails.appendChild(node);
                        ownerTools.appendChild(workDetails);
                    } else {
                        ownerTools.appendChild(node);
                    }
                });

            // Remove every legacy root-level section that is not one of the
            // explicitly curated sources above. This also catches late inserts.
            Array.prototype.slice.call(root.children).forEach(function (node) {
                if (node === hero || node === workspace || node === footer || node.tagName === "SCRIPT" || node.tagName === "STYLE") return;
                if (node.closest(".profile-workspace") || node.closest(".profile-hero--glam")) return;
                node.remove();
            });
        }
    }

    function start() {
        installStyles();
        var root = document.querySelector(".profile-container");
        if (!root) return;
        if (!observer) {
            observer = new MutationObserver(function () {
                window.requestAnimationFrame(function () {
                    enhanceProfile(root);
                });
            });
            observer.observe(root, { childList: true, subtree: true });
        }
        enhanceProfile(root);

        window.addEventListener("popstate", function () {
            var workspace = root.querySelector(".profile-workspace");
            if (!workspace) return;
            var query = new URLSearchParams(window.location.search);
            setActiveTab(workspace, query.get("profileTab") || "overview", false);
            var projectSelect = workspace.querySelector('[data-profile-filter="project"]');
            var tagSelect = workspace.querySelector('[data-profile-filter="tag"]');
            var typeSelect = workspace.querySelector('[data-profile-filter="type"]');
            if (projectSelect) projectSelect.value = query.get("profileProject") || "";
            if (tagSelect) tagSelect.value = query.get("profileTag") || "";
            if (typeSelect) typeSelect.value = query.get("profileType") || "";
            applyUpdateFilters(workspace, true);
        });

    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
