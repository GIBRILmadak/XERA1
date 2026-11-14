// server/adapters/github-adapter.js
const crypto = require("crypto");
const { firstNonEmpty, imageFields } = require("./adapter-utils");

async function fetchData(accessToken) {
    // 1. Récupérer le dépôt le plus récemment mis à jour
    const reposResponse = await fetch(
        "https://api.github.com/user/repos?sort=updated&per_page=1",
        {
            headers: { Authorization: `token ${accessToken}` },
        },
    );
    const repos = await reposResponse.json();

    if (!repos.length) return [];

    const repo = repos[0];

    // 2. Récupérer le dernier commit
    const commitsResponse = await fetch(
        `https://api.github.com/repos/${repo.owner.login}/${repo.name}/commits?per_page=1`,
        {
            headers: { Authorization: `token ${accessToken}` },
        },
    );
    const commits = await commitsResponse.json();
    const commit = commits[0];
    if (!commit) return [];

    // 3. Récupérer les détails du commit pour la liste des fichiers
    const commitDetailResponse = await fetch(commit.url, {
        headers: { Authorization: `token ${accessToken}` },
    });
    const commitDetail = await commitDetailResponse.json();

    let codeSnippet = "// Aucun code source modifié identifiable.";

    // 4. Extraire un fragment de code
    const codeFile = commitDetail.files?.find((f) =>
        f.filename.match(/\.(js|ts|py|cpp|java|go|rs|css|html)$/),
    );

    if (codeFile) {
        const contentResponse = await fetch(
            `https://api.github.com/repos/${repo.owner.login}/${repo.name}/contents/${codeFile.filename}?ref=${commit.sha}`,
            {
                headers: { Authorization: `token ${accessToken}` },
            },
        );
        const contentData = await contentResponse.json();
        if (contentData.content) {
            const decoded = Buffer.from(contentData.content, "base64").toString(
                "utf-8",
            );
            codeSnippet = decoded.split("\n").slice(0, 10).join("\n"); // 10 premières lignes
        }
    }

    return [
        {
            ...commit,
            repository_name: repo.full_name || repo.name,
            repository_description: repo.description,
            repository_social_image: `https://opengraph.githubassets.com/1/${repo.full_name || `${repo.owner.login}/${repo.name}`}`,
            owner_avatar_url: repo.owner.avatar_url,
            codeSnippet,
        },
    ];
}

function normalize(commitData, userId) {
    const repositoryUrl =
        commitData.html_url?.split("/commit/")[0] ||
        `https://github.com/${commitData.repository_name}`;
    const repositoryDescription = firstNonEmpty(
        commitData.repository_description,
        commitData.commit.message.split("\n").slice(1).join(" ").trim(),
        `Mise à jour du dépôt ${commitData.repository_name}.`,
    );
    const image = imageFields(
        commitData.repository_social_image || commitData.owner_avatar_url,
        "github",
        commitData.repository_name,
    );

    return {
        id: commitData.sha,
        userId,
        source: "github",
        type: "commit",
        timestamp: commitData.commit.author.date,
        title: `Commit: ${commitData.commit.message.split("\n")[0]}`,
        description: repositoryDescription,
        content: {
            html_url: commitData.html_url,
            url: repositoryUrl,
            repository: commitData.repository_name,
        },
        codeSnippet: commitData.codeSnippet,
        ...image,
        metadata: { relevanceScore: 1, isPublic: true },
    };
}

module.exports = { fetchData, normalize };
