function normalizePartnerAccessCode(value) {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "")
        .replace(/[^A-Z0-9_-]/g, "");
}

function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function validatePartnerAccess({ partner, now = new Date(), accessCode } = {}) {
    const effectiveNow = now instanceof Date ? now : new Date(now);
    if (!partner) {
        return { valid: false, reason: "Partenariat expiré ou code invalide" };
    }

    const status = String(partner.status || "").toLowerCase();
    if (status !== "active") {
        return { valid: false, reason: "Partenariat expiré ou code invalide" };
    }

    const code = normalizePartnerAccessCode(
        accessCode || partner.partner_access_code,
    );
    if (!code) {
        return { valid: false, reason: "Partenariat expiré ou code invalide" };
    }

    const startDate = parseDate(partner.start_date);
    const endDate = parseDate(partner.end_date);
    if (startDate && effectiveNow < startDate) {
        return { valid: false, reason: "Partenariat expiré ou code invalide" };
    }
    if (endDate && effectiveNow >= endDate) {
        return { valid: false, reason: "Partenariat expiré ou code invalide" };
    }

    return { valid: true, partner };
}

function resolvePartnerPromoCode({
    promo,
    requestedPlan,
    now = new Date(),
} = {}) {
    const effectiveNow = now instanceof Date ? now : new Date(now);
    if (!promo) {
        return { valid: false, reason: "Code promo partenaire invalide" };
    }

    const rawStatus = String(promo.status || "active")
        .trim()
        .toLowerCase();
    const isInactive =
        promo.is_active === false ||
        rawStatus === "inactive" ||
        rawStatus === "revoked" ||
        rawStatus === "expired";
    if (isInactive) {
        return { valid: false, reason: "Code promo partenaire invalide" };
    }

    const applicablePlan = String(promo.applicable_plan || promo.plan || "")
        .trim()
        .toUpperCase();
    const requested = String(requestedPlan || "")
        .trim()
        .toUpperCase();
    if (applicablePlan && requested && applicablePlan !== requested) {
        return {
            valid: false,
            reason: "Code promo partenaire invalide pour ce plan",
        };
    }

    const validUntil = parseDate(promo.valid_until || promo.expires_at);
    if (validUntil && effectiveNow > validUntil) {
        return { valid: false, reason: "Code promo partenaire expiré" };
    }

    return { valid: true, promo };
}

function applyPartnerDiscount(amount, discountPercentage) {
    const numericAmount = Number(amount || 0);
    const pct = Number(discountPercentage || 0);
    if (!Number.isFinite(numericAmount)) return 0;
    const safePct = Math.max(0, Math.min(100, pct));
    return Math.max(0, numericAmount * (1 - safePct / 100));
}

function calculatePartnerCommission(amount, rate = 0.05) {
    const numericAmount = Number(amount || 0);
    const commissionRate = Number(rate || 0.05);
    if (!Number.isFinite(numericAmount)) return 0;
    return Math.max(0, numericAmount * commissionRate);
}

module.exports = {
    normalizePartnerAccessCode,
    validatePartnerAccess,
    resolvePartnerPromoCode,
    applyPartnerDiscount,
    calculatePartnerCommission,
};
