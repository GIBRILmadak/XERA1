const DEFAULT_IMAGE_BASE = "https://api.dicebear.com/9.x/shapes/svg";

function firstNonEmpty(...values) {
    return (
        values.find(
            (value) => typeof value === "string" && value.trim().length > 0,
        ) || null
    );
}

function asHttpUrl(value) {
    if (!value) return null;
    try {
        const url = new URL(String(value));
        return url.protocol === "http:" || url.protocol === "https:"
            ? url.toString()
            : null;
    } catch {
        return null;
    }
}

function notionRichTextValue(value) {
    if (!Array.isArray(value)) return null;
    return firstNonEmpty(
        value
            .map((item) => item?.plain_text || item?.text?.content || "")
            .join(""),
    );
}

function notionPropertyText(properties, names) {
    for (const name of names) {
        const property = properties?.[name];
        const value =
            notionRichTextValue(property?.title) ||
            notionRichTextValue(property?.rich_text);
        if (value) return value;
    }
    return null;
}

function notionImageUrl(page) {
    const cover = page?.cover;
    const icon = page?.icon;
    return (
        asHttpUrl(
            cover?.type === "external" ? cover.external?.url : cover?.file?.url,
        ) ||
        asHttpUrl(
            icon?.type === "external" ? icon.external?.url : icon?.file?.url,
        )
    );
}

function fallbackImage(source, seed) {
    return `${DEFAULT_IMAGE_BASE}?seed=${encodeURIComponent(`${source}-${seed || "work-item"}`)}`;
}

function imageFields(imageUrl, source, seed) {
    const image = asHttpUrl(imageUrl) || fallbackImage(source, seed);
    return { previewUrl: image, mediaUrl: image };
}

module.exports = {
    asHttpUrl,
    fallbackImage,
    firstNonEmpty,
    imageFields,
    notionImageUrl,
    notionPropertyText,
};
