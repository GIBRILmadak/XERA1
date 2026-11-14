const { firstNonEmpty, imageFields } = require("./adapter-utils");

async function fetchData(accessToken) {
    // Récupérer les fichiers récents
    const response = await fetch("https://api.figma.com/v1/me/files", {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
    });
    const data = await response.json();
    return Array.isArray(data.files) ? data.files : [];
}

function normalize(file, userId) {
    const title = firstNonEmpty(file.name, "Fichier Figma");
    const url = file.url || `https://www.figma.com/file/${file.key}`;
    const image = imageFields(
        file.thumbnail_url || file.thumbnailUrl,
        "figma",
        file.key,
    );

    return {
        id: file.key,
        userId,
        source: "figma",
        type: "design_update",
        timestamp: file.updated_at || new Date().toISOString(),
        title: `Design Update: ${title}`,
        description: firstNonEmpty(
            file.description,
            `Mise à jour du fichier Figma : ${title}.`,
        ),
        content: {
            fileId: file.key,
            url,
        },
        ...image,
        metadata: {
            skills: ["Figma", "UI/UX"],
            relevanceScore: 1,
            isPublic: false,
        },
    };
}

module.exports = { fetchData, normalize };
