/**
 * XERA1 Smart Nudge System
 * Intelligent prompts to encourage user activity and retention.
 */

const NUDGE_COOLDOWN_KEY = "xera1-nudge-cooldown";

class XeraNudgeManager {
    constructor() {
        this.container = null;
    }

    init() {
        if (!window.currentUser) return;
    }

    async checkActivity() {
        const userId = window.currentUser?.id;
        if (!userId) return;

        const contents = window.userContents?.[userId] || [];
        if (contents.length === 0) return;

        const latest = contents[0];
        const lastPostDate = new Date(latest.createdAt || latest.created_at);
        const diffHours = (Date.now() - lastPostDate.getTime()) / 3600000;

        if (diffHours > 72) {
            this.showNudge({
                id: "inactivity-72h",
                title: "Trajectoire en pause",
                message:
                    "Trois jours sans mise à jour. Une simple trace suffit pour relancer votre progression.",
                actionLabel: "Ajouter une mise à jour",
                onAction: () => window.openCreateMenu?.(userId),
            });
        } else if (diffHours > 48) {
            this.showNudge({
                id: "inactivity-48h",
                title: "Maintenez le rythme",
                message:
                    "Votre trajectoire s'essouffle. Publiez une mise à jour pour maintenir votre momentum.",
                actionLabel: "Publier maintenant",
                onAction: () => window.openCreateMenu?.(userId),
            });
        }
    }

    showNudge(nudge) {
        const key = `${NUDGE_COOLDOWN_KEY}-${nudge.id}`;
        const cooldown = localStorage.getItem(key);
        if (cooldown && Date.now() - new Date(cooldown).getTime() < 86400000) {
            return;
        }

        this.container?.remove();
        this.container = document.createElement("div");
        this.container.className = "smart-nudge";
        this.container.innerHTML = `
            <div class="smart-nudge-content">
                <strong>${nudge.title}</strong>
                <p>${nudge.message}</p>
                <div class="smart-nudge-actions">
                    <button class="btn-nudge-action">${nudge.actionLabel}</button>
                    <button class="btn-nudge-close">Plus tard</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.container);

        this.container.querySelector(".btn-nudge-action").onclick = () => {
            nudge.onAction?.();
            this.dismiss(nudge.id);
        };
        this.container.querySelector(".btn-nudge-close").onclick = () => {
            this.dismiss(nudge.id);
        };
        setTimeout(() => this.dismiss(nudge.id), 15000);
    }

    dismiss(id) {
        if (!this.container) return;
        this.container.classList.add("dismiss");
        setTimeout(() => this.container?.remove(), 500);
        localStorage.setItem(
            `${NUDGE_COOLDOWN_KEY}-${id}`,
            new Date().toISOString(),
        );
    }

    triggerAfterArcCreation(userId, arcTitle) {
        setTimeout(() => {
            this.showNudge({
                id: "after-arc-creation",
                title: "Projet initialisé",
                message: `Le projet "${arcTitle}" est créé. Publiez votre première preuve pour marquer ce début.`,
                actionLabel: "Ajouter une trace",
                onAction: () => window.openCreateMenu?.(userId),
            });
        }, 1000);
    }
}

window.XeraNudgeManager = new XeraNudgeManager();
document.addEventListener("DOMContentLoaded", () =>
    window.XeraNudgeManager.init(),
);
