const { imageFields } = require("./adapter-utils");

async function fetchData(accessToken) {
    if (!accessToken) return [];

    // Récupérer les projets récents
    const response = await fetch(
        "https://cloudresourcemanager.googleapis.com/v1/projects?filter=lifecycleState:ACTIVE",
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
            },
        },
    );

    if (!response.ok) return [];

    const data = await response.json();
    return Array.isArray(data.projects) ? data.projects.slice(0, 3) : [];
}

function normalize(project, userId) {
    // Génération d'une URL d'image dynamique et unique basée sur l'ID du projet
    // Utilisation d'un service d'avatars/formes aléatoires pour diversifier le feed
    const seed = project.projectId;
    const image = imageFields(null, "google-cloud", seed);

    return {
        id: project.projectId,
        userId,
        source: "google-cloud",
        type: "project_update",
        timestamp: project.createTime || new Date().toISOString(),
        title: `GCP Project: ${project.name || project.projectId}`,
        description: `Infrastructure : Projet Google Cloud ${project.projectId} est actif.`,
        content: {
            projectId: project.projectId,
        },
        ...image,
        metadata: {
            skills: ["Google Cloud", "DevOps", "Infrastructure"],
            relevanceScore: 1,
            isPublic: false,
        },
    };
}

module.exports = { fetchData, normalize };
