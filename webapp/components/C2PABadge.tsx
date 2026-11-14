import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useC2PA } from "../hooks/useC2PA";
import type { C2PAPlacement } from "../types/C2PA";

interface C2PABadgeProps {
    file?: File | Blob | null;
    payload?: Record<string, any> | null;
    placement?: C2PAPlacement;
    size?: "small" | "medium";
}

const placementStyles: Record<C2PAPlacement, any> = {
    "feed-card": { top: "auto", right: 12, bottom: 12, left: "auto" },
    immersive: { top: 12, right: 12, bottom: "auto", left: "auto" },
    profile: { top: 12, right: 12, bottom: "auto", left: "auto" },
};

export const C2PABadge: React.FC<C2PABadgeProps> = ({
    file,
    payload,
    placement = "feed-card",
    size = "small",
}) => {
    const { isAI, provenance, loading, error } = useC2PA({
        file,
        payload,
        enabled: !!file || !!payload,
    });
    const [modalVisible, setModalVisible] = useState(false);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && modalVisible) {
                setModalVisible(false);
            }
        };

        if (typeof window !== "undefined") {
            window.addEventListener("keydown", onKeyDown);
            return () => window.removeEventListener("keydown", onKeyDown);
        }
        return undefined;
    }, [modalVisible]);

    const label = useMemo(
        () => (size === "medium" ? "AI content" : "AI"),
        [size],
    );

    if (!isAI || loading || error) return null;

    return (
        <>
            <Pressable
                onPress={() => setModalVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Open C2PA metadata"
                style={[
                    styles.badgeBase,
                    placementStyles[placement],
                    size === "medium" ? styles.badgeMedium : styles.badgeSmall,
                ]}
            >
                <Text style={styles.badgeText}>{label}</Text>
            </Pressable>

            <Modal
                transparent
                visible={modalVisible}
                animationType="fade"
                onRequestClose={() => setModalVisible(false)}
            >
                <Pressable
                    style={styles.backdrop}
                    onPress={() => setModalVisible(false)}
                >
                    <Pressable
                        style={styles.modalCard}
                        onPress={() => undefined}
                    >
                        <View style={styles.headerRow}>
                            <Text style={styles.modalTitle}>
                                Content Credentials
                            </Text>
                            <Pressable
                                onPress={() => setModalVisible(false)}
                                style={styles.closeButton}
                                accessibilityLabel="Close dialog"
                            >
                                <Text style={styles.closeButtonText}>×</Text>
                            </Pressable>
                        </View>

                        <View style={styles.metaList}>
                            <Text style={styles.metaLabel}>Émetteur</Text>
                            <Text style={styles.metaValue}>
                                {provenance?.issuer || "Non disponible"}
                            </Text>

                            <Text style={styles.metaLabel}>Outil / API</Text>
                            <Text style={styles.metaValue}>
                                {provenance?.tool ||
                                    provenance?.api ||
                                    "Non disponible"}
                            </Text>

                            <Text style={styles.metaLabel}>Date</Text>
                            <Text style={styles.metaValue}>
                                {provenance?.createdAt || "Non disponible"}
                            </Text>

                            <Text style={styles.metaLabel}>Historique</Text>
                            <Text style={styles.metaValue}>
                                {(provenance?.actionHistory ?? []).length > 0
                                    ? (provenance?.actionHistory ?? [])
                                          .map(
                                              (entry) =>
                                                  entry.action || "action",
                                          )
                                          .join(" · ")
                                    : "Aucune action détectée"}
                            </Text>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
        </>
    );
};

const styles = StyleSheet.create({
    badgeBase: {
        position: "absolute",
        zIndex: 40,
        borderRadius: 999,
        backgroundColor: "#0f172a",
        borderWidth: 1,
        borderColor: "rgba(148, 163, 184, 0.65)",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
        alignItems: "center",
        justifyContent: "center",
    },
    badgeSmall: {
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    badgeMedium: {
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    badgeText: {
        color: "#e2e8f0",
        fontSize: 10,
        letterSpacing: 0.5,
        fontWeight: "700",
        textTransform: "uppercase",
    },
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(15, 23, 42, 0.72)",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
    },
    modalCard: {
        width: "100%",
        maxWidth: 420,
        backgroundColor: "#111827",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(148, 163, 184, 0.35)",
        padding: 20,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
    },
    modalTitle: {
        color: "#f8fafc",
        fontSize: 18,
        fontWeight: "700",
    },
    closeButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(148, 163, 184, 0.2)",
    },
    closeButtonText: {
        color: "#f8fafc",
        fontSize: 18,
        fontWeight: "700",
        lineHeight: 18,
    },
    metaList: {
        gap: 10,
    },
    metaLabel: {
        color: "#94a3b8",
        fontSize: 12,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 0.4,
    },
    metaValue: {
        color: "#e2e8f0",
        fontSize: 14,
        lineHeight: 20,
    },
});

export default C2PABadge;
