import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface OnboardingSnackbarProps {
    onClose: () => void;
    onCTA: () => void;
}

export const OnboardingSnackbar: React.FC<OnboardingSnackbarProps> = ({
    onClose,
    onCTA,
}) => {
    return (
        <View style={styles.container}>
            <Text style={styles.message}>
                Prêt à partager votre aventure ? Créez votre projet en 1 clic !
            </Text>
            <View style={styles.actions}>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <Text style={styles.closeText}>X</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onCTA} style={styles.ctaBtn}>
                    <Text style={styles.ctaText}>nouveau projet</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: "absolute",
        bottom: 20,
        left: 20,
        right: 20,
        backgroundColor: "#1e293b",
        padding: 16,
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
        borderWidth: 1,
        borderColor: "#3b82f6",
    },
    message: { color: "#fff", flex: 1, marginRight: 10 },
    actions: { flexDirection: "row", alignItems: "center", gap: 10 },
    closeBtn: { padding: 5 },
    closeText: { color: "#94a3b8", fontWeight: "bold" },
    ctaBtn: { backgroundColor: "#3b82f6", padding: 10, borderRadius: 8 },
    ctaText: { color: "#fff", fontWeight: "bold" },
});
