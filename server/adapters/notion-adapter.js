const NOTION_VERSION = "2022-06-28";
const {
    firstNonEmpty,
    imageFields,
    notionImageUrl,
    notionPropertyText,
} = require("./adapter-utils");

async function fetchData(accessToken) {
    if (!accessToken) return [];

    // Récupérer les pages récemment éditées
    const response = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            page_size: 5,
            sort: {
                direction: "descending",
                timestamp: "last_edited_time",
            },
        }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    return Array.isArray(data.results) ? data.results : [];
}

function normalize(page, userId, tool = "notion") {
    const title = firstNonEmpty(
        notionPropertyText(page.properties, ["title", "Name", "Title"]),
        page.child_page?.title,
        "Note Notion",
    );
    const description = firstNonEmpty(
        notionPropertyText(page.properties, [
            "description",
            "Description",
            "summary",
        ]),
        `Mise à jour de la note : ${title}.`,
    );
    const image = imageFields(notionImageUrl(page), "notion", page.id);

    return {
        id: page.id,
        userId,
        source: "notion",
        type: "document_update",
        timestamp: page.last_edited_time,
        title: `Note Notion : ${title}`,
        description,
        content: {
            url: page.url,
            pageId: page.id,
        },
        ...image,
        metadata: {
            skills: ["Notion", "Documentation"],
            relevanceScore: 1,
            isPublic: false,
        },
    };
}

module.exports = { fetchData, normalize };
