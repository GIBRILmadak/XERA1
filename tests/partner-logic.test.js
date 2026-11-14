const assert = require("node:assert/strict");
const {
    validatePartnerAccess,
    resolvePartnerPromoCode,
    calculatePartnerCommission,
    applyPartnerDiscount,
} = require("../server/partner-logic");

const now = new Date("2026-09-05T12:00:00Z");

const validPartner = {
    partner_access_code: "PARTNER-ALPHA",
    start_date: "2026-01-01T00:00:00Z",
    end_date: "2026-12-31T00:00:00Z",
    status: "active",
};

const activePromo = {
    code: "ALPHA20",
    discount_percentage: 20,
    applicable_plan: "PRO",
    is_active: true,
    valid_until: "2026-12-31T00:00:00Z",
    partner: validPartner,
};

assert.deepEqual(validatePartnerAccess({ partner: validPartner, now }), {
    valid: true,
    partner: validPartner,
});

assert.deepEqual(
    validatePartnerAccess({
        partner: { ...validPartner, end_date: "2026-01-01T00:00:00Z" },
        now,
    }),
    {
        valid: false,
        reason: "Partenariat expiré ou code invalide",
    },
);

assert.deepEqual(
    resolvePartnerPromoCode({ promo: activePromo, requestedPlan: "PRO", now }),
    {
        valid: true,
        promo: activePromo,
    },
);

assert.deepEqual(
    resolvePartnerPromoCode({
        promo: { ...activePromo, applicable_plan: "STANDARD" },
        requestedPlan: "PRO",
        now,
    }),
    {
        valid: false,
        reason: "Code promo partenaire invalide pour ce plan",
    },
);

assert.equal(applyPartnerDiscount(100, 20), 80);
assert.equal(calculatePartnerCommission(100, 0.05), 5);

console.log("partner logic tests passed");
