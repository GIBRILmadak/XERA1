/* ========================================
   SYSTÈME DE RECHERCHE
   ======================================== */

let searchResults = [];
let searchTimeout = null;
let searchSkeleton = null;
let dedicatedSearchTimeout = null;
let searchRequestId = 0;
const SEARCH_HISTORY_KEY = "xera1-search-history-v1";
const SEARCH_HISTORY_TTL = 7 * 24 * 60 * 60 * 1000;
const SEARCH_TRENDING_FALLBACK = [
    "build in public",
    "founders",
    "open source",
    "milestones",
];

function readSearchHistory() {
    try {
        const now = Date.now();
        const raw = JSON.parse(
            localStorage.getItem(SEARCH_HISTORY_KEY) || "[]",
        );
        const valid = Array.isArray(raw)
            ? raw.filter(
                  (item) =>
                      item && now - Number(item.timestamp) < SEARCH_HISTORY_TTL,
              )
            : [];
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(valid));
        return valid;
    } catch (_) {
        return [];
    }
}

function saveSearchHistory(query) {
    const term = String(query || "").trim();
    if (!term) return;
    const history = readSearchHistory().filter(
        (item) => item.term.toLowerCase() !== term.toLowerCase(),
    );
    history.unshift({ term, timestamp: Date.now() });
    try {
        localStorage.setItem(
            SEARCH_HISTORY_KEY,
            JSON.stringify(history.slice(0, 12)),
        );
    } catch (_) {}
}

function removeSearchHistory(term) {
    const next = readSearchHistory().filter((item) => item.term !== term);
    try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
    } catch (_) {}
    renderSearchLanding();
}

function buildSearchSkeleton() {
    return `<div class="dedicated-search-skeleton" aria-hidden="true"><div class="dedicated-search-skeleton-bar animate-pulse"></div><div class="dedicated-search-skeleton-heading animate-pulse"></div><div class="dedicated-search-skeleton-pills">${Array.from({ length: 6 }, () => '<div class="dedicated-search-skeleton-pill animate-pulse"></div>').join("")}</div><div class="dedicated-search-skeleton-list">${Array.from({ length: 4 }, () => '<div class="dedicated-search-skeleton-row animate-pulse"></div>').join("")}</div></div>`;
}

function ensureDedicatedSearchStyles() {
    if (document.getElementById("dedicated-search-styles")) return;
    const style = document.createElement("style");
    style.id = "dedicated-search-styles";
    style.textContent = `
        .dedicated-search-overlay { position:fixed; inset:0; z-index:3000; overflow:auto; background:rgba(9,9,11,.82); color:#f4f4f5; backdrop-filter:blur(18px); animation:search-fade-in .2s ease-out; }
        .dedicated-search-view { width:min(672px,calc(100% - 32px)); min-height:auto; margin:clamp(8vh,15vh,18vh) auto 10vh; padding:18px; box-sizing:border-box; background:rgba(19,19,26,.94); border:1px solid rgba(255,255,255,.1); border-radius:18px; box-shadow:0 28px 90px rgba(0,0,0,.55); }
        .dedicated-search-top { display:flex; align-items:center; gap:8px; margin-bottom:24px; }
        .dedicated-search-command { display:flex; align-items:center; flex:1; min-width:0; height:52px; padding:0 10px 0 15px; border:1px solid #27272a; border-radius:12px; background:#09090b; transition:border-color .2s,box-shadow .2s; }
        .dedicated-search-command:focus-within { border-color:rgba(124,58,237,.65); box-shadow:0 0 0 3px rgba(124,58,237,.12); }
        .dedicated-search-command svg { flex:0 0 auto; width:18px; height:18px; color:#a78bfa; }
        .dedicated-search-top input { flex:1; min-width:0; height:100%; padding:0 10px; border:0; outline:0; background:transparent; color:#fff; font-size:1rem; }
        .dedicated-search-top input::-webkit-search-cancel-button { display:none; }
        .dedicated-search-clear { border:0; background:transparent; color:#71717a; cursor:pointer; font-size:1.2rem; line-height:1; }
        .dedicated-search-clear:hover { color:#e4e4e7; }
        .dedicated-search-command kbd { padding:3px 6px; border:1px solid #3f3f46; border-radius:5px; color:#a1a1aa; font:11px ui-monospace,SFMono-Regular,Menlo,monospace; }
        .dedicated-search-close { width:42px; height:42px; border:1px solid rgba(255,255,255,.1); border-radius:12px; background:transparent; color:#d4d4d8; cursor:pointer; font-size:1.2rem; }
        .dedicated-search-section { margin:26px 0; } .dedicated-search-section h2 { margin:0 0 12px; color:#71717a; font:11px ui-monospace,SFMono-Regular,Menlo,monospace; text-transform:uppercase; letter-spacing:.12em; } .dedicated-search-muted { color:#a1a1aa; }
        .dedicated-search-pills { display:flex; flex-wrap:wrap; gap:8px; } .dedicated-search-pill { padding:9px 12px; border:1px solid rgba(255,255,255,.08); border-radius:9px; background:#09090b; color:#d4d4d8; cursor:pointer; transition:background .18s,border-color .18s,color .18s; } .dedicated-search-pill:hover { border-color:rgba(124,58,237,.5); background:rgba(124,58,237,.1); color:#c4b5fd; }
        .dedicated-search-history-item { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:11px 8px; border-bottom:1px solid rgba(255,255,255,.06); } .dedicated-search-history-item::before { content:"◷"; color:#71717a; font-size:1rem; } .dedicated-search-history-term { flex:1; color:#e4e4e7; background:none; border:0; text-align:left; cursor:pointer; font-size:.9rem; } .dedicated-search-history-remove { opacity:0; border:0; background:none; color:#71717a; cursor:pointer; font-size:1rem; } .dedicated-search-history-item:hover .dedicated-search-history-remove,.dedicated-search-history-remove:focus { opacity:1; }
        .dedicated-search-pill::first-letter { color:#a78bfa; }
        .dedicated-search-results .search-section { margin:0; padding:0; } .dedicated-search-results .search-section-title { padding:14px 4px 8px; color:#71717a; font:11px ui-monospace,SFMono-Regular,Menlo,monospace; text-transform:uppercase; letter-spacing:.12em; } .dedicated-search-results .search-result-item { padding:12px 8px; border-radius:10px; } .dedicated-search-results .search-result-item:hover { background:rgba(124,58,237,.1); } .dedicated-search-results .search-result-avatar { border:1px solid rgba(255,255,255,.1); }
        .dedicated-search-media-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
        .dedicated-search-media-card { min-width:0; padding:8px; border:1px solid rgba(255,255,255,.08); border-radius:10px; background:#09090b; cursor:pointer; transition:background .18s,border-color .18s,transform .18s; }
        .dedicated-search-media-card:hover { border-color:rgba(124,58,237,.5); background:rgba(124,58,237,.1); transform:translateY(-1px); }
        .dedicated-search-media-preview { width:100%; aspect-ratio:1/1; display:block; object-fit:cover; border-radius:7px; background:#18181b; }
        .dedicated-search-media-placeholder { display:flex; align-items:center; justify-content:center; color:#71717a; font-size:1.5rem; }
        .dedicated-search-media-title { display:block; margin-top:8px; overflow:hidden; color:#e4e4e7; font-size:.8rem; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
        .dedicated-search-media-meta { display:block; margin-top:3px; overflow:hidden; color:#71717a; font-size:.7rem; text-overflow:ellipsis; white-space:nowrap; }
        @media (min-width:760px) { .dedicated-search-media-grid { grid-template-columns:repeat(4,minmax(0,1fr)); } }
        .dedicated-search-offline { margin:0 0 12px; padding:9px 10px; border:1px solid rgba(245,158,11,.2); border-radius:8px; color:#fbbf24; font-size:.78rem; }
        .dedicated-search-skeleton-bar { height:50px; border-radius:14px; background:rgba(255,255,255,.05); margin-bottom:34px; } .dedicated-search-skeleton-heading { width:180px; height:20px; border-radius:6px; background:rgba(255,255,255,.05); } .dedicated-search-skeleton-pills { display:flex; gap:10px; flex-wrap:wrap; margin:14px 0 34px; } .dedicated-search-skeleton-pill { width:100px; height:38px; border-radius:999px; background:rgba(255,255,255,.05); } .dedicated-search-skeleton-row { height:48px; margin:12px 0; border-radius:10px; background:rgba(255,255,255,.05); } .dedicated-search-skeleton .animate-pulse { animation:search-pulse 1.4s ease-in-out infinite; } @keyframes search-pulse { 50% { opacity:.45; } } @keyframes search-fade-in { from { opacity:0; } to { opacity:1; } }
        .nav-search-float { display:none; } .nav-search-float.is-visible { display:flex !important; animation:search-fade-in .2s ease-out; }
    `;
    document.head.appendChild(style);
}

function openDedicatedSearch(initialQuery = "") {
    ensureDedicatedSearchStyles();
    const existingOverlay = document.querySelector(".dedicated-search-overlay");
    if (existingOverlay) {
        existingOverlay.querySelector("input")?.focus();
        return;
    }
    const overlay = document.createElement("div");
    overlay.className = "dedicated-search-overlay";
    overlay.innerHTML = `<main class="dedicated-search-view"><div class="dedicated-search-top"><div class="dedicated-search-command"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg><input type="search" placeholder="Rechercher sur XERA1" value="${escapeHtml(initialQuery)}" aria-label="Rechercher sur XERA1"><button type="button" class="dedicated-search-clear" aria-label="Effacer la recherche">&times;</button><kbd>ESC</kbd></div><button type="button" class="dedicated-search-close" aria-label="Fermer">&times;</button></div><div id="dedicated-search-body">${buildSearchSkeleton()}</div></main>`;
    document.body.appendChild(overlay);
    document.body.dataset.searchOverflow = document.body.style.overflow || "";
    document.body.style.overflow = "hidden";
    const input = overlay.querySelector("input");
    const clearButton = overlay.querySelector(".dedicated-search-clear");
    overlay.querySelector(".dedicated-search-close").onclick =
        closeDedicatedSearch;
    clearButton.onclick = () => {
        input.value = "";
        clearTimeout(dedicatedSearchTimeout);
        renderSearchLanding();
        input.focus();
    };
    overlay.addEventListener(
        "click",
        (event) => {
            if (
                event.target.closest(
                    ".search-result-item, .dedicated-search-media-card",
                )
            ) {
                // Let the result's own handler navigate or act before closing.
                setTimeout(closeDedicatedSearch, 0);
            }
        },
        true,
    );
    input.addEventListener("input", () => {
        const query = input.value.trim();
        clearTimeout(dedicatedSearchTimeout);
        if (query.length < 2) {
            renderSearchLanding();
            return;
        }
        const body = overlay.querySelector("#dedicated-search-body");
        body.innerHTML = buildSearchSkeleton();
        dedicatedSearchTimeout = setTimeout(
            () => performSearch(query, body),
            300,
        );
    });
    input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeDedicatedSearch();
    });
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeDedicatedSearch();
    });
    setTimeout(() => {
        input.focus();
        renderSearchLanding();
        if (initialQuery) {
            saveSearchHistory(initialQuery);
            performSearch(
                initialQuery,
                overlay.querySelector("#dedicated-search-body"),
            );
        }
    }, 0);
}

function closeDedicatedSearch() {
    clearTimeout(dedicatedSearchTimeout);
    clearTimeout(searchTimeout);
    searchRequestId += 1;

    const overlay = document.querySelector(".dedicated-search-overlay");
    const hasSearchOverflow = Object.prototype.hasOwnProperty.call(
        document.body.dataset,
        "searchOverflow",
    );
    const overlayInput = overlay?.querySelector("input");
    if (overlayInput) overlayInput.value = "";
    overlay?.querySelector("#dedicated-search-body")?.replaceChildren();
    overlay?.remove();

    const searchInput = document.getElementById("search-input");
    if (searchInput) searchInput.value = "";
    const results = document.getElementById("search-results");
    if (results) {
        results.replaceChildren();
        results.style.display = "none";
    }
    hideSearchSkeleton();
    if (overlay || hasSearchOverflow) {
        document.body.style.overflow = document.body.dataset.searchOverflow || "";
        delete document.body.dataset.searchOverflow;
    }
}

function renderSearchLanding() {
    const body = document.querySelector("#dedicated-search-body");
    if (!body) return;
    const history = readSearchHistory();
    const trends = [
        ...new Set([
            ...history.map((item) => item.term),
            ...SEARCH_TRENDING_FALLBACK,
        ]),
    ].slice(0, 6);
    const categories = [
        "Builds",
        "Founders",
        "VCs",
        "Tech",
        "Milestones",
        "Open Source",
    ];
    body.innerHTML = `<section class="dedicated-search-section"><h2>Catégories de découverte</h2><div class="dedicated-search-pills">${categories.map((item) => `<button class="dedicated-search-pill" type="button" data-search-term="${item}">${item}</button>`).join("")}</div></section><section class="dedicated-search-section"><h2>Historique récent <span class="dedicated-search-muted">(7 jours)</span></h2>${history.length ? history.map((item) => `<div class="dedicated-search-history-item"><button type="button" class="dedicated-search-history-term" data-search-term="${escapeHtml(item.term)}">${escapeHtml(item.term)}</button><button type="button" class="dedicated-search-history-remove" aria-label="Supprimer ${escapeHtml(item.term)}" data-remove-search-term="${escapeHtml(item.term)}">&times;</button></div>`).join("") : '<p class="dedicated-search-muted">Aucune recherche récente.</p>'}</section><section class="dedicated-search-section"><h2>Tendances sur XERA1</h2><div class="dedicated-search-pills">${trends.map((item) => `<button class="dedicated-search-pill" type="button" data-search-term="${escapeHtml(item)}"># ${escapeHtml(item)}</button>`).join("")}</div></section>`;
    body.querySelectorAll("[data-search-term]").forEach(
        (button) =>
            (button.onclick = () => {
                const term = button.dataset.searchTerm;
                const input = document.querySelector(
                    ".dedicated-search-overlay input",
                );
                input.value = term;
                saveSearchHistory(term);
                performSearch(term, body);
            }),
    );
    body.querySelectorAll("[data-remove-search-term]").forEach(
        (button) =>
            (button.onclick = () =>
                removeSearchHistory(button.dataset.removeSearchTerm)),
    );
}

// Initialiser la recherche
function initializeSearch() {
    const searchInput = document.getElementById("search-input");
    const searchResultsContainer = document.getElementById("search-results");

    if (!searchInput || !searchResultsContainer) return;

    ensureSearchSkeleton();
    applyMobilePlaceholder(searchInput);
    searchInput.addEventListener("click", () =>
        openDedicatedSearch(searchInput.value),
    );
    searchInput.addEventListener("focus", () =>
        openDedicatedSearch(searchInput.value),
    );
    setupFloatingSearchButton(searchInput);

    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.trim();

        // Debounce pour éviter trop de requêtes
        clearTimeout(searchTimeout);

        if (query.length < 2) {
            searchResultsContainer.style.display = "none";
            hideSearchSkeleton();
            return;
        }

        searchResultsContainer.style.display = "none";
        showSearchSkeleton();
        searchTimeout = setTimeout(() => {
            performSearch(query, searchResultsContainer);
        }, 300);
    });

    // Fermer les résultats en cliquant ailleurs
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".search-container")) {
            searchResultsContainer.style.display = "none";
            hideSearchSkeleton();
        }
    });
    searchResultsContainer.addEventListener("click", (event) => {
        if (
            event.target.closest(
                ".search-result-item, .dedicated-search-media-card",
            )
        ) {
            // A deferred close preserves the inline result action/navigation.
            setTimeout(closeDedicatedSearch, 0);
        }
    });
}

// Effectuer la recherche
async function performSearch(
    query,
    targetContainer = document.getElementById("search-results"),
) {
    const searchResultsContainer = targetContainer;
    const searchTerm = normalizeSearchQuery(query);
    const requestId = ++searchRequestId;

    if (!searchResultsContainer || searchTerm.length < 2) {
        hideSearchSkeleton();
        return;
    }
    saveSearchHistory(searchTerm);

    try {
        const client = window.supabase;
        if (!client || typeof client.from !== "function") {
            throw new Error("Supabase indisponible");
        }
        const { data: users, error: usersError } = await client
            .from("users")
            .select("id, name, avatar, title, bio, badge, account_subtype")
            .or(
                `name.ilike.%${searchTerm}%,title.ilike.%${searchTerm}%,bio.ilike.%${searchTerm}%`,
            )
            .limit(10);
        if (usersError) throw usersError;

        const userIds = (users || []).map((user) => user.id).filter(Boolean);
        const { data: ownerPages, error: ownerPagesError } = userIds.length
            ? await client
                  .from("professional_pages")
                  .select("id, owner_id, name, slug, avatar_url")
                  .in("owner_id", userIds)
            : { data: [], error: null };
        if (ownerPagesError) throw ownerPagesError;
        const professionalPagesByOwnerId = new Map(
            (ownerPages || []).map((page) => [page.owner_id, page]),
        );

        const { data: content, error: contentError } = await client
            .from("content")
            .select(
                "id, user_id, title, description, day_number, page_id, media_url, type, users(name, avatar)",
            )
            .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
            .limit(10);
        if (contentError) throw contentError;

        const pageIds = [
            ...new Set(
                (content || []).map((item) => item.page_id).filter(Boolean),
            ),
        ];
        const { data: linkedPages, error: linkedPagesError } = pageIds.length
            ? await client
                  .from("professional_pages")
                  .select("id, name, slug, avatar_url")
                  .in("id", pageIds)
            : { data: [], error: null };
        if (linkedPagesError) throw linkedPagesError;
        const professionalPagesById = new Map(
            (linkedPages || []).map((page) => [page.id, page]),
        );

        const { data: proPages, error: proPagesError } = await client
            .from("professional_pages")
            .select(
                "id, name, slug, bio, description, industry, avatar_url, hiring_needs",
            )
            .or(
                `name.ilike.%${searchTerm}%,bio.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,industry.ilike.%${searchTerm}%`,
            )
            .limit(10);
        if (proPagesError) throw proPagesError;
        if (requestId !== searchRequestId) return;

        displaySearchResults(
            (users || []).map((user) => ({
                ...user,
                professional_page:
                    professionalPagesByOwnerId.get(user.id) || null,
            })),
            (content || []).map((item) => ({
                ...item,
                professional_pages:
                    professionalPagesById.get(item.page_id) || null,
            })),
            proPages || [],
            query,
            searchResultsContainer,
        );
        hideSearchSkeleton();
    } catch (error) {
        console.warn(
            "Recherche distante indisponible, affichage du fallback:",
            error?.message || error,
        );
        if (requestId !== searchRequestId) return;
        const mockResults = getMockSearchResults(searchTerm);
        displaySearchResults(
            mockResults.users,
            mockResults.content,
            mockResults.proPages,
            searchTerm,
            searchResultsContainer,
        );
        searchResultsContainer.insertAdjacentHTML(
            "afterbegin",
            '<div class="dedicated-search-offline">Recherche locale temporaire : la connexion au catalogue XERA1 est indisponible.</div>',
        );
        searchResultsContainer.style.display = "block";
        hideSearchSkeleton();
    }
}

function getMockSearchResults(query) {
    const term = escapeHtml(query);
    return {
        users: [
            {
                id: "mock-user",
                name: `Builder ${term}`,
                title: "Builder XERA1",
                avatar: "icons/logo.png",
                professional_page: null,
            },
        ],
        content: [
            {
                id: "mock-content",
                user_id: "mock-user",
                title: `Découvrir ${term}`,
                description: "Résultat de démonstration",
                day_number: 1,
                page_id: null,
                users: {
                    name: `Builder ${term}`,
                    avatar: "icons/logo.png",
                },
            },
        ],
        proPages: [],
    };
}

// Afficher les résultats de recherche
function displaySearchResults(
    users,
    content,
    proPages,
    query,
    searchResultsContainer = document.getElementById("search-results"),
) {
    searchResultsContainer.classList.add("dedicated-search-results");

    if (users.length === 0 && content.length === 0 && proPages.length === 0) {
        searchResultsContainer.innerHTML = `
            <div class="search-empty">
                <p>Aucun résultat pour "${escapeHtml(query)}"</p>
            </div>
        `;
        searchResultsContainer.style.display = "block";
        return;
    }

    let html = "";

    // Section Pages officielles
    if (proPages.length > 0) {
        html += '<div class="search-section">';
        html += '<h4 class="search-section-title">Pages officielles</h4>';
        proPages.forEach((page) => {
            const avatar = page.avatar_url || "icons/enterprise.svg";
            const name = page.name || "Page officielle";
            const industry = page.industry || "Organisation";
            const needs = Array.isArray(page.hiring_needs)
                ? page.hiring_needs.slice(0, 2).join(" • ")
                : "";
            const pageNameHtml =
                typeof window.renderVerifiedPageName === "function"
                    ? window.renderVerifiedPageName(
                          highlightMatch(name, query),
                          page.id,
                      )
                    : highlightMatch(name, query);
            html += `
                <div class="search-result-item search-result-item--pro" onclick="openSearchProPage('${escapeHtml(page.slug || "")}');">
                    <img src="${escapeHtml(avatar)}" class="search-result-avatar" alt="${escapeHtml(name)}">
                    <div class="search-result-info">
                        <div class="search-result-name">${pageNameHtml} <span class="search-result-badge">OFFICIEL</span></div>
                        <div class="search-result-meta">${escapeHtml(industry)}${needs ? ` • ${escapeHtml(needs)}` : ""}</div>
                    </div>
                </div>
            `;
        });
        html += "</div>";
    }

    // Section Utilisateurs
    if (users.length > 0) {
        html += '<div class="search-section">';
        html += '<h4 class="search-section-title">Utilisateurs</h4>';
        users.forEach((user) => {
            const avatar = user.avatar || "https://placehold.co/80";
            const name = user.name || "Utilisateur";
            const title = user.title || "";
            const userClickAction = user.professional_page?.slug
                ? `openSearchProPage('${escapeHtml(user.professional_page.slug)}')`
                : `navigateToUserProfile('${user.id}')`;
            html += `
                <div class="search-result-item" onclick="${userClickAction};">
                    <img src="${escapeHtml(avatar)}" class="search-result-avatar" alt="${escapeHtml(name)}">
                    <div class="search-result-info">
                        <div class="search-result-name">${typeof window.renderUsernameWithBadge === "function" ? window.renderUsernameWithBadge(highlightMatch(name, query), user.id) : highlightMatch(name, query)}</div>
                        <div class="search-result-meta">${escapeHtml(title)}</div>
                    </div>
                </div>
            `;
        });
        html += "</div>";
    }

    // Section Contenu
    if (content.length > 0) {
        html += '<div class="search-section">';
        html += '<h4 class="search-section-title">Projets &amp; Jalons</h4>';
        html += '<div class="dedicated-search-media-grid">';
        content.forEach((item) => {
            let authorName = item.users?.name || "Utilisateur";
            let authorAvatar = item.users?.avatar || "https://placehold.co/80";
            let clickAction = `navigateToUserProfile('${item.user_id}')`;

            if (item.page_id && item.professional_pages) {
                authorName = item.professional_pages.name;
                authorAvatar =
                    item.professional_pages.avatar_url ||
                    "icons/enterprise.svg";
                clickAction = `openSearchProPage('${escapeHtml(item.professional_pages.slug)}')`;
            }

            const title = item.title || "Publication";
            const mediaUrl = item.media_url || item.thumbnail_url || "";
            const mediaPreview = mediaUrl
                ? item.type === "video"
                    ? `<video class="dedicated-search-media-preview" src="${escapeHtml(mediaUrl)}" muted preload="metadata"></video>`
                    : `<img class="dedicated-search-media-preview" src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(title)}" loading="lazy">`
                : '<div class="dedicated-search-media-preview dedicated-search-media-placeholder">◈</div>';
            html += `
                <div class="dedicated-search-media-card" onclick="${clickAction};">
                    ${mediaPreview}
                    <span class="dedicated-search-media-title">${highlightMatch(title, query)}</span>
                    <span class="dedicated-search-media-meta">${escapeHtml(authorName)} • J${escapeHtml(item.day_number || "0")}</span>
                </div>
            `;
        });
        html += "</div>";
        html += "</div>";
    }

    searchResultsContainer.innerHTML = html;
    searchResultsContainer.style.display = "block";
}

function setupFloatingSearchButton(sourceInput) {
    const nav = document.querySelector("nav");
    if (!nav || document.getElementById("nav-search-float")) return;
    // The index page already has search in the desktop quick actions and feed UI.
    // initializeSearch() runs before router.js creates those quick actions.
    if (document.body.classList.contains("index-page")) return;
    if (document.getElementById("nav-profile-hub-trigger")) return;
    if (
        document.querySelector(
            '.desktop-quick-actions [data-quick-action="search"]',
        )
    ) {
        return;
    }
    const button = document.createElement("button");
    button.id = "nav-search-float";
    button.type = "button";
    button.className = "notification-button nav-search-float";
    button.title = "Rechercher";
    button.setAttribute("aria-label", "Ouvrir la recherche");
    button.innerHTML =
        '<svg class="notification-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>';
    button.onclick = () => openDedicatedSearch(sourceInput?.value || "");
    const navLinks = nav.querySelector(".nav-links");
    if (navLinks) navLinks.insertBefore(button, navLinks.firstChild);
    if (typeof IntersectionObserver === "function") {
        const observer = new IntersectionObserver(
            ([entry]) =>
                button.classList.toggle("is-visible", !entry.isIntersecting),
            { threshold: 0.05 },
        );
        observer.observe(
            sourceInput.closest(".search-container") || sourceInput,
        );
    } else {
        const update = () =>
            button.classList.toggle("is-visible", window.scrollY > 180);
        window.addEventListener("scroll", update, { passive: true });
        update();
    }
}

function openSearchProPage(slug) {
    const safeSlug = String(slug || "").trim();
    const results = document.getElementById("search-results");
    if (results) results.style.display = "none";
    if (!safeSlug) return;

    closeDedicatedSearch();

    const targetUrl = `profile.html?pro=${encodeURIComponent(safeSlug)}`;
    if (window.XeraRouter?.navigate) {
        window.XeraRouter.navigate("pagepro", { query: { pro: safeSlug } });
    } else if (typeof window.navigateTo === "function") {
        window.navigateTo("pagepro", { query: { pro: safeSlug } });
    } else {
        window.location.assign(targetUrl);
    }
}

function ensureSearchSkeleton() {
    if (searchSkeleton) return;
    const searchContainer = document.querySelector(".search-container");
    if (!searchContainer) return;
    const panel = document.createElement("div");
    panel.id = "search-skeleton-modal";
    panel.className = "search-skeleton-modal";
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = `
        <div class="search-skeleton-panel">
            ${buildSkeletonRows(5)}
        </div>
    `;
    searchContainer.appendChild(panel);
    searchSkeleton = panel;
}

function buildSkeletonRows(count) {
    const rows = [];
    for (let i = 0; i < count; i++) {
        rows.push(`
            <div class="search-skeleton-row">
                <div class="skeleton-avatar skeleton-shimmer"></div>
                <div class="search-skeleton-copy">
                    <div class="skeleton-line wide skeleton-shimmer"></div>
                    <div class="skeleton-line mid skeleton-shimmer"></div>
                </div>
            </div>
        `);
    }
    return rows.join("");
}

function showSearchSkeleton() {
    if (searchSkeleton) searchSkeleton.style.display = "block";
}

function hideSearchSkeleton() {
    if (searchSkeleton) searchSkeleton.style.display = "none";
}

function applyMobilePlaceholder(inputEl) {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        inputEl.placeholder = "Rechercher";
    }
}

// Mettre en évidence les correspondances
function highlightMatch(text, query) {
    if (!text) return "";
    const escapedText = escapeHtml(text);
    const escapedQuery = escapeRegExp(query.trim());
    if (!escapedQuery) return escapedText;
    const regex = new RegExp(`(${escapedQuery})`, "gi");
    return escapedText.replace(regex, "<mark>$1</mark>");
}

function normalizeSearchQuery(query) {
    return String(query || "")
        .trim()
        .replace(/[%,()'"`]/g, " ")
        .replace(/\s+/g, " ");
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        (char) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[char],
    );
}
