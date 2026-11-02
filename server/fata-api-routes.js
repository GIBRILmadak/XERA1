const express = require("express");

async function authenticate(req, res) {
    const authorization = String(req.headers.authorization || "");
    const token = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";
    if (!token) {
        res.status(401).json({ error: "Utilisateur non authentifié." });
        return null;
    }
    const { data, error } = await req.fataSupabase.auth.getUser(token);
    if (error || !data?.user?.id) {
        res.status(401).json({ error: "Utilisateur non authentifié." });
        return null;
    }
    return data.user;
}

function createFataApiRouter(supabase) {
    const router = express.Router();
    router.use((req, _res, next) => {
        req.fataSupabase = supabase;
        next();
    });

    router.get("/arcs", async (req, res) => {
        const user = await authenticate(req, res);
        if (!user) return;

        const challengeId = String(req.query.challengeId || "").trim();
        try {
            const {
                resolveChallengeConfig,
                areFataRequirementIdsConfigured,
                getChallengeSelection,
                countArcMilestones,
                isArcFataEligible,
                challengeRequirementIdsMatch,
                hasValidChallengeWindow,
            } = require("./fata-contract");
            if (!areFataRequirementIdsConfigured()) {
                return res.status(503).json({
                    error: "Les identifiants d’étapes Fata ne sont pas configurés.",
                });
            }
            const challenge = resolveChallengeConfig(challengeId);
            const provider = require("./oauth-configs").getConfig("fata");
            const [linkageResult, challengeResult] = await Promise.all([
                supabase
                    .from("fata_linkages")
                    .select("user_id,fata_iss,fata_sub,created_at,metadata")
                    .eq("user_id", user.id)
                    .eq("fata_iss", provider.issuer)
                    .maybeSingle(),
                supabase
                    .from("fata_challenges_config")
                    .select("id,is_active,opens_at,close_at,receipt_deadline_at,req_arc,req_preuve,req_jalon")
                    .eq("id", challenge.id)
                    .maybeSingle(),
            ]);
            if (linkageResult.error || challengeResult.error) {
                throw linkageResult.error || challengeResult.error;
            }
            const linkage = linkageResult.data;
            const challengeRow = challengeResult.data;
            if (!linkage || linkage.fata_iss !== provider.issuer) {
                return res.status(409).json({
                    error: "Connectez votre compte Fata avant de choisir un ARC.",
                });
            }
            if (!challengeRow?.is_active) {
                return res.status(409).json({
                    error: "Ce challenge Fata n'est pas actif sur XERA1.",
                });
            }
            if (!hasValidChallengeWindow(challengeRow)) {
                return res.status(503).json({
                    error: "Les dates du challenge Fata ne sont pas configurées correctement.",
                });
            }
            if (!challengeRequirementIdsMatch(challenge.id, challengeRow)) {
                return res.status(503).json({
                    error: "La configuration des étapes Fata doit être corrigée avant de choisir un ARC.",
                });
            }
            const now = Date.now();
            if (
                (challengeRow.opens_at && now < Date.parse(challengeRow.opens_at)) ||
                (challengeRow.close_at && now > Date.parse(challengeRow.close_at))
            ) {
                return res.status(409).json({
                    error: "La période d'activité de ce challenge n'est pas ouverte.",
                });
            }
            if (
                challengeRow.receipt_deadline_at &&
                now > Date.parse(challengeRow.receipt_deadline_at)
            ) {
                return res.status(409).json({
                    error: "La date limite de réception de ce challenge est dépassée.",
                });
            }

            const { data: arcs, error: arcsError } = await supabase
                .from("arcs")
                .select("id,user_id,page_id,title,description,status,milestones,created_at")
                .eq("user_id", user.id)
                .is("page_id", null)
                .order("created_at", { ascending: false })
                .limit(100);
            if (arcsError) throw arcsError;

            const selection = getChallengeSelection(linkage, challenge.id);
            return res.json({
                challengeId: challenge.id,
                selection,
                arcs: (arcs || []).map((arc) => ({
                    id: arc.id,
                    title: arc.title,
                    description: arc.description,
                    created_at: arc.created_at,
                    milestoneCount: countArcMilestones(arc),
                    eligible: isArcFataEligible(arc, user.id),
                    selected: String(selection?.arc_id || "") === String(arc.id),
                })),
            });
        } catch (error) {
            if (/Invalid Fata challengeId/i.test(error?.message || "")) {
                return res.status(400).json({ error: "Challenge Fata inconnu." });
            }
            console.error("Fata ARC list error:", error);
            return res.status(500).json({
                error: "Impossible de charger les ARC pour Fata.",
            });
        }
    });

    router.post("/select-arc", async (req, res) => {
        const user = await authenticate(req, res);
        if (!user) return;

        const challengeId = String(req.body?.challengeId || "").trim();
        const arcId = String(req.body?.arcId || "").trim();
        try {
            const {
                resolveChallengeConfig,
                areFataRequirementIdsConfigured,
                getChallengeSelection,
                getArcPresentationOccurredAt,
                isArcFataEligible,
                challengeRequirementIdsMatch,
                hasValidChallengeWindow,
            } = require("./fata-contract");
            if (!areFataRequirementIdsConfigured()) {
                return res.status(503).json({
                    error: "Les identifiants d’étapes Fata ne sont pas configurés.",
                });
            }
            const challenge = resolveChallengeConfig(challengeId);
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(arcId)) {
                return res.status(400).json({ error: "ARC invalide." });
            }

            const provider = require("./oauth-configs").getConfig("fata");
            const [linkageResult, challengeResult, arcResult] = await Promise.all([
                supabase
                    .from("fata_linkages")
                    .select("user_id,fata_iss,fata_sub,created_at,metadata")
                    .eq("user_id", user.id)
                    .eq("fata_iss", provider.issuer)
                    .maybeSingle(),
                supabase
                    .from("fata_challenges_config")
                    .select("id,is_active,opens_at,close_at,receipt_deadline_at,req_arc,req_preuve,req_jalon")
                    .eq("id", challenge.id)
                    .maybeSingle(),
                supabase
                    .from("arcs")
                    .select("id,user_id,page_id,title,description,status,milestones,created_at")
                    .eq("id", arcId)
                    .maybeSingle(),
            ]);
            if (linkageResult.error || challengeResult.error || arcResult.error) {
                throw linkageResult.error || challengeResult.error || arcResult.error;
            }
            const linkage = linkageResult.data;
            const challengeRow = challengeResult.data;
            const arc = arcResult.data;
            if (!linkage || linkage.fata_iss !== provider.issuer) {
                return res.status(409).json({
                    error: "Connectez votre compte Fata avant de choisir un ARC.",
                });
            }
            if (!challengeRow?.is_active) {
                return res.status(409).json({
                    error: "Ce challenge Fata n'est pas actif sur XERA1.",
                });
            }
            if (!hasValidChallengeWindow(challengeRow)) {
                return res.status(503).json({
                    error: "Les dates du challenge Fata ne sont pas configurées correctement.",
                });
            }
            if (!challengeRequirementIdsMatch(challenge.id, challengeRow)) {
                return res.status(503).json({
                    error: "La configuration des étapes Fata doit être corrigée avant de choisir un ARC.",
                });
            }
            const now = Date.now();
            if (
                (challengeRow.opens_at && now < Date.parse(challengeRow.opens_at)) ||
                (challengeRow.close_at && now > Date.parse(challengeRow.close_at))
            ) {
                return res.status(409).json({
                    error: "La période d'activité de ce challenge n'est pas ouverte.",
                });
            }
            if (
                challengeRow.receipt_deadline_at &&
                now > Date.parse(challengeRow.receipt_deadline_at)
            ) {
                return res.status(409).json({
                    error: "La date limite de réception de ce challenge est dépassée.",
                });
            }
            if (!isArcFataEligible(arc, user.id)) {
                return res.status(422).json({
                    error: "Choisissez un ARC personnel publié avec un titre, une description et au moins trois jalons.",
                });
            }

            const previousSelection = getChallengeSelection(linkage, challenge.id);
            if (previousSelection && String(previousSelection.arc_id) !== arcId) {
                return res.status(409).json({
                    error: "Un ARC est déjà associé à cette étape du challenge. Contactez le support XERA1 pour corriger cette sélection.",
                    selection: previousSelection,
                });
            }

            const { data: selection, error: selectionError } = await supabase.rpc(
                "record_fata_arc_selection",
                {
                    p_user_id: user.id,
                    p_issuer: provider.issuer,
                    p_challenge_id: challenge.id,
                    p_arc_id: arcId,
                },
            );
            if (selectionError) {
                if (selectionError.code === "23505") {
                    return res.status(409).json({
                        error: "Un ARC est déjà associé à ce challenge.",
                    });
                }
                throw selectionError;
            }

            const { queueEvent } = require("./fata-worker");
            await queueEvent(
                user.id,
                linkage.fata_sub,
                challenge.id,
                challenge.req_arc,
                getArcPresentationOccurredAt(arc, linkage, selection, challengeRow),
                `selection-${challenge.id}-${arcId}`,
            );
            return res.status(200).json({
                selection,
                arc: { id: arc.id, title: arc.title },
            });
        } catch (error) {
            if (/Invalid Fata challengeId/i.test(error?.message || "")) {
                return res.status(400).json({ error: "Challenge Fata inconnu." });
            }
            console.error("Fata ARC selection error:", error);
            return res.status(500).json({
                error: "Impossible d'enregistrer la sélection de l'ARC.",
            });
        }
    });

    return router;
}

module.exports = { createFataApiRouter };
