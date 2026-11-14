import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    SafeAreaView,
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    Switch,
    useWindowDimensions,
} from "react-native";
import styles from "./SettingsScreen.styles";

type SettingAction = "toggle" | "link" | "select";

interface SettingItem {
    id: string;
    icon: string;
    title: string;
    description: string;
    actionType: SettingAction;
    field: string;
    value?: boolean | string;
    extraLabel?: string;
}

interface SettingCategory {
    id: string;
    title: string;
    description: string;
    icon: string;
    items: SettingItem[];
}

const initialCategories: SettingCategory[] = [
    {
        id: "account",
        title: "Compte",
        description: "Gérez votre profil, confidentialité et accès.",
        icon: "👤",
        items: [
            {
                id: "profile",
                icon: "📝",
                title: "Profil utilisateur",
                description: "Mettez à jour votre nom, avatar et bios.",
                actionType: "link",
                field: "profile",
            },
            {
                id: "login_security",
                icon: "🔒",
                title: "Connexion & sécurité",
                description: "Activez 2FA, mot de passe et sessions actives.",
                actionType: "link",
                field: "login_security",
            },
            {
                id: "language",
                icon: "🌐",
                title: "Langue et région",
                description: "Préférences de langue et formats locaux.",
                actionType: "link",
                field: "language",
                extraLabel: "Français",
            },
        ],
    },
    {
        id: "notifications",
        title: "Notifications",
        description: "Contrôlez les alertes et messages que vous recevez.",
        icon: "🔔",
        items: [
            {
                id: "push_alerts",
                icon: "📲",
                title: "Notifications push",
                description:
                    "Recevez des alertes instantanées sur votre appareil.",
                actionType: "toggle",
                field: "pushAlerts",
                value: true,
            },
            {
                id: "email_updates",
                icon: "✉️",
                title: "Emails produits",
                description:
                    "Mises à jour et nouveautés directement dans votre boîte.",
                actionType: "toggle",
                field: "emailUpdates",
                value: false,
            },
            {
                id: "daily_summary",
                icon: "📈",
                title: "Résumé quotidien",
                description: "Un condensé de vos activités et performances.",
                actionType: "toggle",
                field: "dailySummary",
                value: true,
            },
        ],
    },
    {
        id: "security",
        title: "Sécurité",
        description:
            "Renforcez la protection de votre compte et de vos données.",
        icon: "🛡️",
        items: [
            {
                id: "two_factor",
                icon: "🔐",
                title: "Authentification 2FA",
                description: "Ajoutez une couche supplémentaire à votre accès.",
                actionType: "toggle",
                field: "twoFactor",
                value: true,
            },
            {
                id: "active_sessions",
                icon: "💻",
                title: "Sessions actives",
                description: "Voir et fermer les appareils connectés.",
                actionType: "link",
                field: "activeSessions",
            },
            {
                id: "privacy",
                icon: "🕶️",
                title: "Confidentialité",
                description: "Gérez ce que XERA1 partage à votre sujet.",
                actionType: "link",
                field: "privacy",
            },
        ],
    },
    {
        id: "display",
        title: "Affichage",
        description: "Personnalisez le rendu et l’ergonomie visuelle.",
        icon: "🖥️",
        items: [
            {
                id: "dark_mode",
                icon: "🌙",
                title: "Mode sombre",
                description: "Activez le thème sombre sur toute l’application.",
                actionType: "toggle",
                field: "darkMode",
                value: true,
            },
            {
                id: "text_size",
                icon: "🔤",
                title: "Taille du texte",
                description:
                    "Ajustez le confort de lecture selon vos préférences.",
                actionType: "link",
                field: "textSize",
                extraLabel: "Standard",
            },
            {
                id: "accent_color",
                icon: "🎨",
                title: "Accent violet",
                description: "Harmonisez les accents visuels de l’interface.",
                actionType: "link",
                field: "accentColor",
                extraLabel: "Activé",
            },
        ],
    },
    {
        id: "about",
        title: "À propos",
        description: "Informations sur l’application, support et licences.",
        icon: "ℹ️",
        items: [
            {
                id: "app_version",
                icon: "📄",
                title: "Version de l’application",
                description: "Consultez la version installée et l’historique.",
                actionType: "link",
                field: "appVersion",
                extraLabel: "2.4.1",
            },
            {
                id: "terms",
                icon: "📜",
                title: "Conditions d’utilisation",
                description:
                    "Accédez aux mentions légales et à la politique de confidentialité.",
                actionType: "link",
                field: "terms",
            },
            {
                id: "support",
                icon: "🧩",
                title: "Support & feedback",
                description: "Envoyez une demande ou consultez notre FAQ.",
                actionType: "link",
                field: "support",
            },
        ],
    },
];

const initialValues = {
    pushAlerts: true,
    emailUpdates: false,
    dailySummary: true,
    twoFactor: true,
    darkMode: true,
};

type SettingsScreenProps = {
    accountType?: string;
};

const SettingsScreen: React.FC<SettingsScreenProps> = ({
    accountType = "personal",
}) => {
    const [selectedCategoryId, setSelectedCategoryId] = useState("account");
    const [searchText, setSearchText] = useState("");
    const [toggles, setToggles] = useState(initialValues);
    const { width } = useWindowDimensions();
    const scrollViewRef = useRef<ScrollView>(null);
    const storage =
        typeof globalThis !== "undefined"
            ? (
                  globalThis as typeof globalThis & {
                      localStorage?: {
                          getItem: (key: string) => string | null;
                          setItem: (key: string, value: string) => void;
                      };
                  }
              ).localStorage
            : undefined;

    const isLargeScreen = width >= 860;

    useEffect(() => {
        try {
            const saved = storage?.getItem("xera1.settings.v1");
            if (saved) {
                const parsed = JSON.parse(saved) as Partial<typeof initialValues>;
                setToggles((prev) => ({ ...prev, ...parsed }));
            }
        } catch {
            // Ignore malformed saved settings and continue with defaults.
        }
    }, [storage]);

    useEffect(() => {
        try {
            storage?.setItem("xera1.settings.v1", JSON.stringify(toggles));
        } catch {
            // Ignore storage write errors in unsupported environments.
        }
    }, [storage, toggles]);

    const selectedCategory = useMemo(
        () =>
            initialCategories.find(
                (category) => category.id === selectedCategoryId,
            ) ?? initialCategories[0],
        [selectedCategoryId],
    );

    const isPro = useMemo(() => {
        const t = String(accountType || "").toLowerCase();
        return (
            t === "pro" ||
            t === "professional" ||
            t === "business" ||
            t === "company"
        );
    }, [accountType]);

    const visibleItems = useMemo(() => {
        const query = searchText.trim().toLowerCase();
        return selectedCategory.items.filter((item) => {
            if (!query) return true;
            return (
                item.title.toLowerCase().includes(query) ||
                item.description.toLowerCase().includes(query) ||
                item.icon.toLowerCase().includes(query)
            );
        });
    }, [searchText, selectedCategory]);

    const toggleValue = (field: string) => {
        setToggles((prev) => ({
            ...prev,
            [field]: !prev[field as keyof typeof prev],
        }));
    };

    const handleCategoryPress = (categoryId: string) => {
        setSelectedCategoryId(categoryId);
        setSearchText("");
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    };

    return (
        <SafeAreaView style={styles.screen}>
            <ScrollView
                ref={scrollViewRef}
                contentContainerStyle={styles.pageContainer}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.headerRow}>
                    <View style={styles.titleBlock}>
                        <Text style={styles.pageTitle}>Réglages</Text>
                        <Text style={styles.pageSubtitle}>
                            Une expérience centralisée, organisée et premium.
                        </Text>
                    </View>
                    {isPro ? (
                        <View style={styles.proPillWrapper}>
                            <View style={styles.proPill}>
                                <Text style={styles.proBadge}>🏢</Text>
                                <View style={{ marginLeft: 10 }}>
                                    <Text style={styles.proPillTitle}>
                                        Compte Professionnel
                                    </Text>
                                    <Text style={styles.proPillSub}>
                                        Interface entreprise — outils avancés
                                    </Text>
                                </View>
                            </View>
                        </View>
                    ) : null}
                    <View style={styles.searchWrapper}>
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Rechercher un paramètre"
                            placeholderTextColor="#7c82a6"
                            value={searchText}
                            onChangeText={setSearchText}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <Text style={styles.saveHint}>Sauvegarde automatique</Text>
                    </View>
                </View>

                <View
                    style={[
                        styles.mainLayout,
                        isLargeScreen ? styles.layoutRow : styles.layoutColumn,
                    ]}
                >
                    <View
                        style={[
                            styles.sidebar,
                            isLargeScreen
                                ? styles.sidebarLarge
                                : styles.sidebarMobile,
                        ]}
                    >
                        <Text style={styles.sidebarSectionTitle}>
                            Catégories
                        </Text>
                        {initialCategories.map((category) => {
                            const active = category.id === selectedCategoryId;
                            return (
                                <TouchableOpacity
                                    key={category.id}
                                    activeOpacity={0.8}
                                    style={[
                                        styles.sidebarItem,
                                        active && styles.sidebarItemActive,
                                    ]}
                                    onPress={() => handleCategoryPress(category.id)}
                                >
                                    <Text style={styles.sidebarIcon}>
                                        {category.icon}
                                    </Text>
                                    <View style={styles.sidebarTextGroup}>
                                        <Text
                                            style={[
                                                styles.sidebarItemTitle,
                                                active &&
                                                    styles.sidebarItemTitleActive,
                                            ]}
                                        >
                                            {category.title}
                                        </Text>
                                        <Text
                                            style={
                                                styles.sidebarItemDescription
                                            }
                                        >
                                            {category.description}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <View style={styles.contentArea}>
                        <View style={styles.breadcrumbs}>
                            <Text style={styles.breadcrumbText}>
                                Paramètres
                            </Text>
                            <Text style={styles.breadcrumbSeparator}>›</Text>
                            <Text style={styles.breadcrumbCurrent}>
                                {selectedCategory.title}
                            </Text>
                        </View>

                        <View style={styles.sectionHeader}>
                            <View>
                                <Text style={styles.sectionTitle}>
                                    {selectedCategory.title}
                                </Text>
                                <Text style={styles.sectionDescription}>
                                    {selectedCategory.description}
                                </Text>
                            </View>
                            <Text style={styles.sectionBadge}>
                                {selectedCategory.items.length} éléments
                            </Text>
                        </View>
                        {isPro && selectedCategory.id === "account" ? (
                            <>
                                <View style={styles.proHero}>
                                    <View style={styles.proHeroLeft}>
                                        <View style={styles.settingIconWrapper}>
                                            <Text style={styles.settingIcon}>🏢</Text>
                                        </View>
                                        <View style={styles.settingTextGroup}>
                                            <Text style={styles.companyName}>
                                                Raison sociale • Exemple SARL
                                            </Text>
                                            <Text style={styles.companyMeta}>
                                                Identifiant entreprise • FR-123456
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.proHeroRight}>
                                        <View style={styles.verificationPill}>
                                            <Text style={styles.verificationText}>
                                                Certifié
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.manageBillingBtn}
                                        >
                                            <Text style={styles.manageBillingText}>
                                                Gérer la facturation
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.proGrid}>
                                    <View style={styles.proCard}>
                                        <Text style={styles.proCardTitle}>
                                            Statistiques clés
                                        </Text>
                                        <Text style={styles.proMetricValue}>12,421</Text>
                                        <Text style={styles.proMetricLabel}>
                                            Visites profil (30j)
                                        </Text>
                                    </View>

                                    <View style={styles.proCard}>
                                        <Text style={styles.proCardTitle}>
                                            Facturation
                                        </Text>
                                        <Text style={styles.proMetricValue}>Dernière facture • Juin</Text>
                                        <Text style={styles.proMetricLabel}>
                                            Méthode: Carte • **** 4242
                                        </Text>
                                    </View>

                                    <View style={styles.proCard}>
                                        <Text style={styles.proCardTitle}>
                                            Équipe & Accès
                                        </Text>
                                        <Text style={styles.proMetricValue}>3 membres</Text>
                                        <Text style={styles.proMetricLabel}>
                                            Rôles, invitations et permissions
                                        </Text>
                                    </View>

                                    <View style={styles.proCard}>
                                        <Text style={styles.proCardTitle}>
                                            Outils Pro
                                        </Text>
                                        <Text style={styles.proMetricValue}>API, Intégrations</Text>
                                        <Text style={styles.proMetricLabel}>
                                            Accès aux endpoints privés
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionTitle}>Paramètres</Text>
                                    <Text style={styles.sectionBadge}>
                                        {visibleItems.length} éléments
                                    </Text>
                                </View>

                                {visibleItems.length === 0 ? (
                                    <View style={styles.emptyStateCard}>
                                        <Text style={styles.emptyStateTitle}>
                                            Aucun réglage trouvé
                                        </Text>
                                        <Text style={styles.emptyStateText}>
                                            Essayez un autre mot-clé ou sélectionnez une
                                            autre catégorie.
                                        </Text>
                                    </View>
                                ) : (
                                    visibleItems.map((item) => {
                                        const isToggle = item.actionType === "toggle";
                                        const cardContent = (
                                            <>
                                                <View style={styles.settingLeft}>
                                                    <View
                                                        style={
                                                            styles.settingIconWrapper
                                                        }
                                                    >
                                                        <Text
                                                            style={styles.settingIcon}
                                                        >
                                                            {item.icon}
                                                        </Text>
                                                    </View>
                                                    <View
                                                        style={styles.settingTextGroup}
                                                    >
                                                        <Text
                                                            style={styles.settingTitle}
                                                        >
                                                            {item.title}
                                                        </Text>
                                                        <Text
                                                            style={
                                                                styles.settingDescription
                                                            }
                                                        >
                                                            {item.description}
                                                        </Text>
                                                    </View>
                                                </View>
                                                <View style={styles.settingRight}>
                                                    {isToggle ? (
                                                        <Switch
                                                            trackColor={{
                                                                false: "#3f3f46",
                                                                true: "#7c3aed",
                                                            }}
                                                            thumbColor={
                                                                toggles[
                                                                    item.field as keyof typeof toggles
                                                                ]
                                                                    ? "#d8b4fe"
                                                                    : "#c4b5fd"
                                                            }
                                                            value={
                                                                toggles[
                                                                    item.field as keyof typeof toggles
                                                                ]
                                                            }
                                                            onValueChange={() =>
                                                                toggleValue(item.field)
                                                            }
                                                        />
                                                    ) : (
                                                        <>
                                                            {item.extraLabel ? (
                                                                <Text
                                                                    style={
                                                                        styles.optionLabel
                                                                    }
                                                                >
                                                                    {item.extraLabel}
                                                                </Text>
                                                            ) : null}
                                                            <Text
                                                                style={styles.chevron}
                                                            >
                                                                ›
                                                            </Text>
                                                        </>
                                                    )}
                                                </View>
                                            </>
                                        );

                                        return isToggle ? (
                                            <View key={item.id} style={styles.settingCard}>
                                                {cardContent}
                                            </View>
                                        ) : (
                                            <TouchableOpacity
                                                key={item.id}
                                                activeOpacity={0.85}
                                                style={styles.settingCard}
                                            >
                                                {cardContent}
                                            </TouchableOpacity>
                                        );
                                    })
                                )}
                            </>
                        ) : (
                            visibleItems.length === 0 ? (
                                <View style={styles.emptyStateCard}>
                                    <Text style={styles.emptyStateTitle}>
                                        Aucun réglage trouvé
                                    </Text>
                                    <Text style={styles.emptyStateText}>
                                        Essayez un autre mot-clé ou sélectionnez une
                                        autre catégorie.
                                    </Text>
                                </View>
                            ) : (
                                visibleItems.map((item) => {
                                    const isToggle = item.actionType === "toggle";
                                    const cardContent = (
                                        <>
                                            <View style={styles.settingLeft}>
                                                <View
                                                    style={
                                                        styles.settingIconWrapper
                                                    }
                                                >
                                                    <Text
                                                        style={styles.settingIcon}
                                                    >
                                                        {item.icon}
                                                    </Text>
                                                </View>
                                                <View
                                                    style={styles.settingTextGroup}
                                                >
                                                    <Text
                                                        style={styles.settingTitle}
                                                    >
                                                        {item.title}
                                                    </Text>
                                                    <Text
                                                        style={
                                                            styles.settingDescription
                                                        }
                                                    >
                                                        {item.description}
                                                    </Text>
                                                </View>
                                            </View>
                                            <View style={styles.settingRight}>
                                                {isToggle ? (
                                                    <Switch
                                                        trackColor={{
                                                            false: "#3f3f46",
                                                            true: "#7c3aed",
                                                        }}
                                                        thumbColor={
                                                            toggles[
                                                                item.field as keyof typeof toggles
                                                            ]
                                                                ? "#d8b4fe"
                                                                : "#c4b5fd"
                                                        }
                                                        value={
                                                            toggles[
                                                                item.field as keyof typeof toggles
                                                            ]
                                                        }
                                                        onValueChange={() =>
                                                            toggleValue(item.field)
                                                        }
                                                    />
                                                ) : (
                                                    <>
                                                        {item.extraLabel ? (
                                                            <Text
                                                                style={
                                                                    styles.optionLabel
                                                                }
                                                            >
                                                                {item.extraLabel}
                                                            </Text>
                                                        ) : null}
                                                        <Text
                                                            style={styles.chevron}
                                                        >
                                                            ›
                                                        </Text>
                                                    </>
                                                )}
                                            </View>
                                        </View>
                                    );

                                    return isToggle ? (
                                        <View key={item.id} style={styles.settingCard}>
                                            {cardContent}
                                        </View>
                                    ) : (
                                        <TouchableOpacity
                                            key={item.id}
                                            activeOpacity={0.85}
                                            style={styles.settingCard}
                                        >
                                            {cardContent}
                                        </TouchableOpacity>
                                    );
                                })
                            )
                        )}
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default SettingsScreen;
