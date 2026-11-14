(function () {
    function resolvePageProMessageTarget(page = {}) {
        const ownerId =
            page.owner_id ||
            page.ownerId ||
            page.user_id ||
            page.userId ||
            null;
        const companySlug =
            page.slug || page.pageSlug || page.companySlug || null;

        return {
            userId: ownerId,
            companySlug,
            kind: "company",
        };
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = { resolvePageProMessageTarget };
    }

    if (typeof window !== "undefined") {
        window.resolvePageProMessageTarget = resolvePageProMessageTarget;
    }
})();
