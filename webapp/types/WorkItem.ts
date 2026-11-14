export type SourceType = "github" | "figma" | "notion" | "google-cloud";

export interface WorkItem {
    id: string; // UUID
    userId: string;
    source: SourceType;
    type:
        | "commit"
        | "frame"
        | "video"
        | "design_update"
        | "document_update"
        | "project_update";
    timestamp: string; // ISO Date string
    title: string;
    description?: string;

    // Normalisation des données
    content: Record<string, any>; // Données brutes de l'API (ex: commit hash, frame ID)

    // Affichage dans le feed immersif
    previewUrl?: string; // URL de la capture d'écran générée ou du thumbnail
    mediaUrl?: string; // URL du média source (si vidéo/image)
    codeSnippet?: string; // Fragment de code pour GitHub

    // Enrichissement
    metadata: {
        skills: string[]; // ex: ['React', 'Python', 'UX Design']
        relevanceScore: number;
        isPublic: boolean;
    };
}
