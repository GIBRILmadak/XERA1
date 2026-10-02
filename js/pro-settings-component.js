(function () {
    function ProSettings({
        pageId,
        onClose,
        onSaveSuccess,
        viewMode = "overlay",
    }) {
        const React = window.React;
        const el = React.createElement;
        const [pageData, setPageData] = React.useState(null);
        const [loading, setLoading] = React.useState(true);
        const [saving, setSaving] = React.useState(false);
        const [activeSection, setActiveSection] = React.useState("identity");
        const [mobileSectionOpen, setMobileSectionOpen] = React.useState(false);
        const [slugError, setSlugError] = React.useState("");
        const [formData, setFormData] = React.useState({
            name: "",
            slug: "",
            bio: "",
            description: "",
            industry: "",
            website_url: "",
            contact_email: "",
            contact_phone: "",
            country: "",
            city: "",
            timezone: "",
            language: "fr",
            appearance_theme: "classic",
            privacy_comments: true,
            privacy_messages: true,
            allow_recruitment: true,
            social_links: {
                twitter: "",
                linkedin: "",
                github: "",
                instagram: "",
            },
            hiring_needs: "",
            talent_interests: "",
            avatar_url: "",
            banner_url: "",
            professional_cta: {
                objective: "sales",
                label: "Visiter le site",
                type: "external",
                url: "",
            },
        });

        React.useEffect(() => {
            fetchPageData();
        }, [pageId]);

        async function fetchPageData() {
            try {
                const { data, error } = await window.supabase
                    .from("professional_pages")
                    .select("*")
                    .eq("id", pageId)
                    .single();

                if (error) throw error;

                const metadata = data.metadata || {};
                const savedCta = metadata.professional_cta || {};
                const savedLabel = savedCta.label || "Visiter le site";
                setPageData(data);
                setFormData({
                    name: data.name || "",
                    slug: data.slug || "",
                    bio: data.bio || "",
                    description: data.description || "",
                    industry: data.industry || "",
                    website_url: data.website_url || "",
                    contact_email: metadata.contact_email || "",
                    contact_phone: metadata.contact_phone || "",
                    country: metadata.country || "",
                    city: metadata.city || "",
                    timezone: metadata.timezone || "",
                    language: metadata.language || "fr",
                    appearance_theme: metadata.appearance_theme || "classic",
                    privacy_comments: metadata.privacy_comments !== false,
                    privacy_messages: metadata.privacy_messages !== false,
                    allow_recruitment: metadata.allow_recruitment !== false,
                    social_links: {
                        twitter: data.social_links?.twitter || "",
                        linkedin: data.social_links?.linkedin || "",
                        github: data.social_links?.github || "",
                        instagram: data.social_links?.instagram || "",
                        ...(data.social_links || {}),
                    },
                    hiring_needs: (data.hiring_needs || []).join(", "),
                    talent_interests: (data.talent_interests || []).join(", "),
                    avatar_url: data.avatar_url || "",
                    banner_url: data.banner_url || "",
                    professional_cta: {
                        label: savedLabel,
                        url: savedCta.url || data.website_url || "",
                    },
                });
            } catch (err) {
                console.error("Error fetching pro page:", err);
                window.showToast
                    ? window.showToast(
                          "Erreur lors du chargement des réglages.",
                          "error",
                      )
                    : alert("Erreur lors du chargement des réglages.");
            } finally {
                setLoading(false);
            }
        }

        const handleInputChange = (e) => {
            const { name, value, type, checked } = e.target;
            setFormData((prev) => ({
                ...prev,
                [name]: type === "checkbox" ? checked : value,
            }));
            if (name === "slug") {
                setSlugError("");
            }
        };

        const handleSocialChange = (e) => {
            const { name, value } = e.target;
            setFormData((prev) => ({
                ...prev,
                social_links: { ...prev.social_links, [name]: value },
            }));
        };

        const handleCtaChange = (e) => {
            const { name, value } = e.target;
            setFormData((prev) => ({
                ...prev,
                professional_cta: {
                    ...prev.professional_cta,
                    [name]: value,
                },
            }));
        };

        const handleFileUpload = async (e, type) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const path = `pro-pages/${type === "avatar" ? "avatars" : "banners"}`;
            const res = await window.uploadFile(file, path);

            if (res.success) {
                setFormData((prev) => ({
                    ...prev,
                    [type === "avatar" ? "avatar_url" : "banner_url"]: res.url,
                }));
            } else {
                alert("Upload failed: " + res.error);
            }
        };

        const normalizeSlug = (value) =>
            String(value || "")
                .trim()
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/\s+/g, "-")
                .replace(/[^a-z0-9-]/g, "")
                .replace(/-+/g, "-")
                .replace(/^-|-$/g, "");

        const handleSubmit = async (e) => {
            e.preventDefault();
            setSaving(true);

            const slug = normalizeSlug(formData.slug || formData.name);
            const hiringNeedsArr = formData.hiring_needs
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
            const talentInterestsArr = formData.talent_interests
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);

            try {
                if (slug && slug !== pageData.slug) {
                    const { data: existing, error: slugErrorQuery } =
                        await window.supabase
                            .from("professional_pages")
                            .select("id")
                            .eq("slug", slug)
                            .neq("id", pageId)
                            .limit(1);

                    if (slugErrorQuery) throw slugErrorQuery;
                    if (existing?.length) {
                        setSlugError(
                            "Cette URL est déjà utilisée. Choisissez-en une autre.",
                        );
                        setSaving(false);
                        return;
                    }
                }

                const payload = {
                    name: formData.name,
                    slug,
                    bio: formData.bio,
                    description: formData.description,
                    industry: formData.industry,
                    website_url: formData.website_url.trim(),
                    social_links: formData.social_links,
                    hiring_needs: hiringNeedsArr,
                    talent_interests: talentInterestsArr,
                    avatar_url: formData.avatar_url,
                    banner_url: formData.banner_url,
                    metadata: {
                        ...(pageData.metadata || {}),
                        contact_email: formData.contact_email,
                        contact_phone: formData.contact_phone,
                        country: formData.country,
                        city: formData.city,
                        timezone: formData.timezone,
                        language: formData.language,
                        appearance_theme: formData.appearance_theme,
                        privacy_comments: formData.privacy_comments,
                        privacy_messages: formData.privacy_messages,
                        allow_recruitment: formData.allow_recruitment,
                        professional_cta: {
                            ...formData.professional_cta,
                            label: formData.professional_cta.label.trim(),
                            url: formData.professional_cta.url.trim(),
                        },
                    },
                    updated_at: new Date().toISOString(),
                };

                const { data, error } = await window.supabase
                    .from("professional_pages")
                    .update(payload)
                    .eq("id", pageId)
                    .select()
                    .single();

                if (error) throw error;

                window.showToast?.("Réglages Page Pro mis à jour !");
                if (onSaveSuccess) onSaveSuccess(data);
                onClose();
            } catch (err) {
                console.error("Save error:", err);
                alert("Erreur lors de la sauvegarde: " + (err.message || err));
            } finally {
                setSaving(false);
            }
        };

        const handleDeletePage = async () => {
            if (
                !confirm(
                    "Voulez-vous vraiment supprimer cette page professionnelle ? Cette action est irréversible.",
                )
            ) {
                return;
            }

            setSaving(true);
            try {
                const { error } = await window.supabase
                    .from("professional_pages")
                    .delete()
                    .eq("id", pageId);

                if (error) throw error;

                window.showToast?.("Page professionnelle supprimée.");
                onClose();
                if (typeof window.navigateTo === "function") {
                    window.navigateTo("pro-page");
                }
            } catch (err) {
                console.error("Delete error:", err);
                alert(
                    "Impossible de supprimer la page : " + (err.message || err),
                );
            } finally {
                setSaving(false);
            }
        };

        const sections = [
            {
                id: "identity",
                title: "Informations",
                description: "Nom, slogan, description et URL de page",
                icon: "🏢",
            },
            {
                id: "branding",
                title: "Identité visuelle",
                description: "Logo, bannière et signature visuelle",
                icon: "🎨",
            },
            {
                id: "presence",
                title: "Présence en ligne",
                description: "Site, réseaux et contact",
                icon: "🌐",
            },
            {
                id: "recruitment",
                title: "Recrutement",
                description: "Besoins, talents et marque employeur",
                icon: "💼",
            },
            {
                id: "security",
                title: "Sécurité",
                description: "Suppression et confidentialité",
                icon: "🛡️",
            },
        ];

        const activeSectionMeta =
            sections.find((section) => section.id === activeSection) ||
            sections[0];

        const panelStackRef = React.useRef(null);

        React.useEffect(() => {
            if (!mobileSectionOpen || !panelStackRef.current) return;
            panelStackRef.current.scrollTo({ top: 0, behavior: "smooth" });
        }, [activeSection, mobileSectionOpen]);

        const openSettingsSection = (sectionId, event) => {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            setActiveSection(sectionId);
            setMobileSectionOpen(true);
        };

        const renderSection = () => {
            const el = window.React.createElement;
            switch (activeSection) {
                case "identity":
                    return el("div", { className: "section-block" }, [
                        el(
                            "h3",
                            { className: "section-title" },
                            "Informations Générales",
                        ),
                        el(
                            "div",
                            { className: "section-description" },
                            "Gérez le nom, le slogan et la présentation de votre organisation.",
                        ),
                        el("div", { className: "form-grid" }, [
                            el("label", { className: "form-group" }, [
                                el("span", null, "Nom de l'organisation"),
                                el("input", {
                                    name: "name",
                                    value: formData.name,
                                    onChange: handleInputChange,
                                    placeholder: "Ex: MA PAGE corp",
                                    className: "form-input",
                                }),
                            ]),
                            el("label", { className: "form-group" }, [
                                el("span", null, "Secteur d'activité"),
                                el("input", {
                                    name: "industry",
                                    value: formData.industry,
                                    onChange: handleInputChange,
                                    placeholder: "Ex: Tech, Design, Finance",
                                    className: "form-input",
                                }),
                            ]),
                            el("label", { className: "form-group" }, [
                                el("span", null, "Slogan / Titre court"),
                                el("input", {
                                    name: "bio",
                                    value: formData.bio,
                                    onChange: handleInputChange,
                                    placeholder:
                                        "Ex: Construire le futur du Momentum Engine",
                                    className: "form-input",
                                }),
                            ]),
                        ]),
                        el(
                            "label",
                            {
                                className: "form-group",
                                style: { marginTop: "20px" },
                            },
                            [
                                el("span", null, "Description complète"),
                                el("textarea", {
                                    name: "description",
                                    value: formData.description,
                                    onChange: handleInputChange,
                                    placeholder:
                                        "Détaillez vos missions, votre histoire...",
                                    className: "form-input",
                                    style: {
                                        minHeight: "150px",
                                        resize: "vertical",
                                    },
                                }),
                            ],
                        ),
                    ]);
                case "branding":
                    return el("div", { className: "section-block" }, [
                        el(
                            "h3",
                            { className: "section-title" },
                            "Identité visuelle",
                        ),
                        el(
                            "div",
                            { className: "section-description" },
                            "Changez l’image de marque de votre page.",
                        ),
                        el("div", { className: "pro-settings-media-grid" }, [
                            el(
                                "label",
                                { className: "pro-settings-upload-card" },
                                [
                                    el("strong", null, "Logo de la Page"),
                                    el(
                                        "div",
                                        { className: "pro-settings-preview" },
                                        [
                                            el("img", {
                                                src:
                                                    formData.avatar_url ||
                                                    "icons/enterprise.svg",
                                                alt: "Logo",
                                                className: "preview-avatar",
                                            }),
                                        ],
                                    ),
                                    el("input", {
                                        type: "file",
                                        accept: "image/*",
                                        className: "pro-settings-file-input",
                                        onChange: (e) =>
                                            handleFileUpload(e, "avatar"),
                                    }),
                                    el(
                                        "span",
                                        {
                                            className:
                                                "pro-settings-upload-button",
                                        },
                                        "Changer le logo",
                                    ),
                                    el(
                                        "small",
                                        null,
                                        "Format carré recommandé.",
                                    ),
                                ],
                            ),
                            el(
                                "label",
                                { className: "pro-settings-upload-card" },
                                [
                                    el("strong", null, "Bannière principale"),
                                    el(
                                        "div",
                                        { className: "pro-settings-preview" },
                                        [
                                            el("img", {
                                                src:
                                                    formData.banner_url ||
                                                    "icons/enterprise.svg",
                                                alt: "Bannière",
                                                className: "preview-banner",
                                            }),
                                        ],
                                    ),
                                    el("input", {
                                        type: "file",
                                        accept: "image/*",
                                        className: "pro-settings-file-input",
                                        onChange: (e) =>
                                            handleFileUpload(e, "banner"),
                                    }),
                                    el(
                                        "span",
                                        {
                                            className:
                                                "pro-settings-upload-button",
                                        },
                                        "Changer la bannière",
                                    ),
                                    el(
                                        "small",
                                        null,
                                        "Format large 1200x400px recommandé.",
                                    ),
                                ],
                            ),
                        ]),
                    ]);
                case "presence":
                    return el("div", { className: "section-block" }, [
                        el(
                            "h3",
                            { className: "section-title" },
                            "Présence en ligne",
                        ),
                        el(
                            "div",
                            { className: "section-description" },
                            "Rassemblez les liens et coordonnées clés.",
                        ),
                        el("div", { className: "form-grid" }, [
                            el("label", { className: "form-group" }, [
                                el("span", null, "Site web officiel"),
                                el("input", {
                                    name: "website_url",
                                    value: formData.website_url,
                                    onChange: handleInputChange,
                                    placeholder: "https://votre-site.com",
                                    className: "form-input",
                                }),
                            ]),
                            el("label", { className: "form-group" }, [
                                el("span", null, "Intitulé du bouton"),
                                el("input", {
                                    name: "label",
                                    maxLength: 40,
                                    value: formData.professional_cta.label,
                                    onChange: handleCtaChange,
                                    placeholder: "Ex: Nous contacter, Réserver",
                                    className: "form-input",
                                }),
                            ]),
                            el("label", { className: "form-group" }, [
                                el("span", null, "Lien ou numéro de téléphone"),
                                el("input", {
                                    name: "url",
                                    type: "text",
                                    value: formData.professional_cta.url,
                                    onChange: handleCtaChange,
                                    placeholder:
                                        "https://... ou +243 800 000 000",
                                    className: "form-input",
                                }),
                            ]),
                            el("label", { className: "form-group" }, [
                                el("span", null, "Email de contact"),
                                el("input", {
                                    name: "contact_email",
                                    type: "email",
                                    value: formData.contact_email,
                                    onChange: handleInputChange,
                                    placeholder: "contact@entreprise.com",
                                    className: "form-input",
                                }),
                            ]),
                            el("label", { className: "form-group" }, [
                                el("span", null, "Téléphone"),
                                el("input", {
                                    name: "contact_phone",
                                    value: formData.contact_phone,
                                    onChange: handleInputChange,
                                    placeholder: "+33 1 23 45 67 89",
                                    className: "form-input",
                                }),
                            ]),
                            el("label", { className: "form-group" }, [
                                el("span", null, "Ville / Pays"),
                                el("input", {
                                    name: "city",
                                    value: formData.city,
                                    onChange: handleInputChange,
                                    placeholder: "Paris",
                                    className: "form-input",
                                }),
                            ]),
                            el("label", { className: "form-group" }, [
                                el("span", null, "Pays"),
                                el("input", {
                                    name: "country",
                                    value: formData.country,
                                    onChange: handleInputChange,
                                    placeholder: "France",
                                    className: "form-input",
                                }),
                            ]),
                            el("label", { className: "form-group" }, [
                                el("span", null, "Fuseau horaire"),
                                el("input", {
                                    name: "timezone",
                                    value: formData.timezone,
                                    onChange: handleInputChange,
                                    placeholder: "Europe/Paris",
                                    className: "form-input",
                                }),
                            ]),
                            el("label", { className: "form-group" }, [
                                el("span", null, "Langue"),
                                el("input", {
                                    name: "language",
                                    value: formData.language,
                                    onChange: handleInputChange,
                                    placeholder: "fr",
                                    className: "form-input",
                                }),
                            ]),
                        ]),
                        el("div", { className: "section-divider" }),
                        el(
                            "div",
                            { className: "form-grid" },
                            ["twitter", "linkedin", "github", "instagram"].map(
                                (key) =>
                                    el(
                                        "label",
                                        { key, className: "form-group" },
                                        [
                                            el(
                                                "span",
                                                null,
                                                key === "twitter"
                                                    ? "X / Twitter"
                                                    : key
                                                          .charAt(0)
                                                          .toUpperCase() +
                                                          key.slice(1),
                                            ),
                                            el("input", {
                                                name: key,
                                                value:
                                                    formData.social_links[
                                                        key
                                                    ] || "",
                                                onChange: handleSocialChange,
                                                placeholder:
                                                    key === "linkedin"
                                                        ? "linkedin.com/in/..."
                                                        : key === "github"
                                                          ? "github.com/..."
                                                          : "@nom",
                                                className: "form-input",
                                            }),
                                        ],
                                    ),
                            ),
                        ),
                    ]);
                case "recruitment":
                    return el("div", { className: "section-block" }, [
                        el("h3", { className: "section-title" }, "Recrutement"),
                        el(
                            "div",
                            { className: "section-description" },
                            "Affichez vos besoins actuels et vos centres d’intérêt.",
                        ),
                        el("label", { className: "form-group" }, [
                            el("span", null, "URL de la page professionnelle"),
                            el("input", {
                                name: "slug",
                                value: formData.slug,
                                onChange: handleInputChange,
                                placeholder: "nom-de-page",
                                className: "form-input",
                            }),
                            slugError &&
                                el(
                                    "small",
                                    { className: "form-error" },
                                    slugError,
                                ),
                        ]),
                        el("label", { className: "form-group" }, [
                            el("span", null, "Description courte / slogan"),
                            el("input", {
                                name: "bio",
                                value: formData.bio,
                                onChange: handleInputChange,
                                className: "form-input",
                            }),
                        ]),
                        el("label", { className: "form-group" }, [
                            el("span", null, "Besoins actuels"),
                            el("input", {
                                name: "hiring_needs",
                                value: formData.hiring_needs,
                                onChange: handleInputChange,
                                placeholder: "Design, Growth, Backend",
                                className: "form-input",
                            }),
                        ]),
                        el("label", { className: "form-group" }, [
                            el("span", null, "Centres d'intérêt"),
                            el("input", {
                                name: "talent_interests",
                                value: formData.talent_interests,
                                onChange: handleInputChange,
                                placeholder: "IA, Product, Blockchain",
                                className: "form-input",
                            }),
                        ]),
                        el(
                            "div",
                            { className: "toggle-grid" },
                            [
                                "allow_recruitment",
                                "privacy_comments",
                                "privacy_messages",
                            ].map((name) =>
                                el(
                                    "label",
                                    { key: name, className: "toggle-row" },
                                    [
                                        el(
                                            "span",
                                            null,
                                            name === "allow_recruitment"
                                                ? "Ouvert aux recrutements"
                                                : name === "privacy_comments"
                                                  ? "Autoriser les commentaires"
                                                  : "Autoriser les messages privés",
                                        ),
                                        el("input", {
                                            type: "checkbox",
                                            name,
                                            checked: Boolean(formData[name]),
                                            onChange: handleInputChange,
                                        }),
                                    ],
                                ),
                            ),
                        ),
                    ]);
                case "security":
                    return el("div", { className: "section-block" }, [
                        el(
                            "h3",
                            { className: "section-title" },
                            "Sécurité et suppression",
                        ),
                        el(
                            "div",
                            { className: "section-description" },
                            "Gestion des accès, confidentialité et suppression de la page.",
                        ),
                        el(
                            "div",
                            { className: "settings-card settings-danger-zone" },
                            [
                                el("div", null, [
                                    el(
                                        "strong",
                                        null,
                                        "Supprimer la page professionnelle",
                                    ),
                                    el(
                                        "p",
                                        null,
                                        "Cette action est irréversible et supprimera toutes les certifications liées.",
                                    ),
                                ]),
                                el(
                                    "button",
                                    {
                                        type: "button",
                                        className: "btn-delete-account",
                                        onClick: handleDeletePage,
                                        disabled: saving,
                                    },
                                    "Supprimer la page",
                                ),
                            ],
                        ),
                    ]);
                default:
                    return el("div", null, "Section introuvable.");
            }
        };

        if (!el) {
            return null;
        }

        if (loading) {
            return el(
                "div",
                { className: "pro-settings-loading" },
                "Chargement des réglages de la page professionnelle…",
            );
        }

        return el(
            "div",
            {
                className: `settings-shell-redesign ${
                    viewMode === "page"
                        ? "pro-settings-page-shell"
                        : "pro-settings-overlay-shell"
                }`,
            },
            [
                el("div", { className: "settings-header" }, [
                    el("div", { className: "settings-header-main" }, [
                        el(
                            "p",
                            { className: "settings-kicker" },
                            "Réglages Pro",
                        ),
                        el("div", { className: "settings-title-row" }, [
                            el(
                                "h2",
                                null,
                                "Réglages de la Page Professionnelle",
                            ),
                            el(
                                "span",
                                { className: "settings-subtitle" },
                                "Personnalisez votre page et optimisez votre présence professionnelle.",
                            ),
                        ]),
                    ]),
                    el(
                        "button",
                        {
                            type: "button",
                            onClick: onClose,
                            className: "settings-close-btn",
                            "aria-label": "Fermer",
                        },
                        "×",
                    ),
                ]),
                el(
                    "div",
                    {
                        className: `settings-workbench ${
                            mobileSectionOpen
                                ? "settings-mobile-section-open"
                                : ""
                        }`,
                    },
                    [
                        el(
                            "div",
                            { className: "settings-mobile-list-header" },
                            [
                                el("span", null, "Sections"),
                                el(
                                    "strong",
                                    null,
                                    "Choisissez un réglage à modifier",
                                ),
                            ],
                        ),
                        el(
                            "nav",
                            { className: "settings-navigation" },
                            sections.map((item) =>
                                el(
                                    "button",
                                    {
                                        key: item.id,
                                        type: "button",
                                        className: `settings-nav-item ${
                                            activeSection === item.id
                                                ? "active"
                                                : ""
                                        } ${item.id === "security" ? "settings-nav-danger" : ""}`,
                                        onClick: (event) =>
                                            openSettingsSection(item.id, event),
                                        "aria-expanded":
                                            activeSection === item.id &&
                                            mobileSectionOpen,
                                        "aria-current":
                                            activeSection === item.id
                                                ? "page"
                                                : undefined,
                                        "data-settings-section": item.id,
                                    },
                                    el(
                                        "span",
                                        { className: "settings-nav-glyph" },
                                        item.icon,
                                    ),
                                    el("div", null, [
                                        el("strong", null, item.title),
                                        el("small", null, item.description),
                                    ]),
                                ),
                            ),
                        ),
                        el(
                            "div",
                            {
                                className: "settings-panel-stack",
                                ref: panelStackRef,
                            },
                            [
                                el(
                                    "div",
                                    {
                                        className:
                                            "settings-mobile-panel-topbar",
                                    },
                                    [
                                        el(
                                            "button",
                                            {
                                                type: "button",
                                                className:
                                                    "settings-mobile-back-btn",
                                                onClick: () =>
                                                    setMobileSectionOpen(false),
                                                "aria-label":
                                                    "Retour aux sections",
                                            },
                                            "‹",
                                        ),
                                        el(
                                            "div",
                                            {
                                                className:
                                                    "settings-mobile-panel-title",
                                            },
                                            activeSectionMeta.title,
                                        ),
                                    ],
                                ),
                                el(
                                    "div",
                                    { className: "settings-panel active" },
                                    [
                                        el(
                                            "div",
                                            {
                                                className:
                                                    "settings-panel-intro",
                                            },
                                            [
                                                el(
                                                    "p",
                                                    null,
                                                    activeSectionMeta?.description ||
                                                        "Mettez à jour les détails de votre page professionnelle.",
                                                ),
                                            ],
                                        ),
                                        el(
                                            "form",
                                            {
                                                className: "settings-card-grid",
                                                onSubmit: handleSubmit,
                                            },
                                            [
                                                renderSection(),
                                                el(
                                                    "div",
                                                    {
                                                        className:
                                                            "settings-panel-actions",
                                                    },
                                                    [
                                                        el(
                                                            "button",
                                                            {
                                                                type: "button",
                                                                className:
                                                                    "btn-cancel",
                                                                onClick:
                                                                    onClose,
                                                                disabled:
                                                                    saving,
                                                            },
                                                            viewMode === "page"
                                                                ? "Retour à la page Pro"
                                                                : "Annuler",
                                                        ),
                                                        el(
                                                            "button",
                                                            {
                                                                type: "submit",
                                                                className:
                                                                    "btn-save",
                                                                disabled:
                                                                    saving,
                                                            },
                                                            saving
                                                                ? "Enregistrement..."
                                                                : "Enregistrer les modifications",
                                                        ),
                                                    ],
                                                ),
                                            ],
                                        ),
                                    ],
                                ),
                            ],
                        ),
                    ],
                ),
            ],
        );
    }

    window.mountProSettings = function (
        containerEl,
        pageId,
        onClose,
        viewMode = "overlay",
    ) {
        const React = window.React;
        const ReactDOM = window.ReactDOM;

        if (!containerEl) return;
        if (!ReactDOM || !React) {
            console.error(
                "React n’est pas disponible pour monter les réglages.",
            );
            return;
        }

        if (containerEl._proSettingsRoot) {
            containerEl._proSettingsRoot.unmount();
        }

        const root = ReactDOM.createRoot(containerEl);
        containerEl._proSettingsRoot = root;
        root.render(
            React.createElement(ProSettings, {
                pageId,
                viewMode,
                onClose: () => {
                    root.unmount();
                    if (typeof onClose === "function") {
                        onClose();
                    }
                },
                onSaveSuccess: (updatedPage) => {
                    if (window.professionalManager && updatedPage?.slug) {
                        window.professionalManager.renderProPage(
                            updatedPage.slug,
                        );
                    }
                },
            }),
        );
    };
})();
