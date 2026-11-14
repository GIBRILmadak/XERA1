-- ============================================================================
-- Migration : 20261109_maishapay_payment_hardening.sql
-- Description : Durcissement du schéma des transactions et fonction atomique
--               de réclamation pour le module prestataire MaishaPay.
-- Idempotence : Oui (IF NOT EXISTS / CREATE OR REPLACE)
-- Sécurité : Fonction SECURITY DEFINER avec search_path = ''
--            Accès restreint à service_role uniquement (pas d'accès public/anon/authenticated)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ÉVOLUTION DE LA TABLE TRANSACTIONS
-- ----------------------------------------------------------------------------

-- Identifiant de transaction attribué par le prestataire (ex: MaishaPay transactionId)
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS provider_transaction_id text;

-- Horodatage de confirmation du statut final (succeeded ou failed)
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- Horodatage d'application des effets métier (notifications, activation plan, etc.)
-- Reste NULL tant que les effets n'ont pas été effectivement appliqués.
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS effects_applied_at timestamptz;

-- Horodatage de la dernière vérification auprès de l'API prestataire (checkStatus)
-- Utilisé pour le rate limiting (ex: max 1 check toutes les 10s par transaction).
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS last_status_check_at timestamptz;


-- ----------------------------------------------------------------------------
-- 2. FONCTION ATOMIQUE : claim_transaction_result
-- ----------------------------------------------------------------------------
-- Fait un SEUL UPDATE atomique selon la règle de transition d'état :
--   - 'failed'    : permis uniquement depuis 'pending'
--   - 'succeeded' : permis depuis 'pending' OU 'failed' (paiement tardif)
--   - 'refunded', 'canceled' : JAMAIS modifiables
-- Si paiement tardif (failed -> succeeded) : consigne metadata.late_success_at.
-- Renvoie (claimed boolean, transaction jsonb) via to_jsonb(v_tx).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_transaction_result(
    p_transaction_id uuid,
    p_new_status text,
    p_provider_tx text DEFAULT NULL
)
RETURNS TABLE (
    claimed boolean,
    transaction jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tx public.transactions%ROWTYPE;
    v_claimed boolean := false;
BEGIN
    -- 1. Validation stricte du statut cible
    IF p_new_status NOT IN ('succeeded', 'failed') THEN
        RAISE EXCEPTION 'claim_transaction_result: nouveau statut invalide (%). Seuls ''succeeded'' ou ''failed'' sont autorisés.', p_new_status;
    END IF;

    -- 2. UN SEUL UPDATE atomique conditionné par la règle de transition
    IF p_new_status = 'failed' THEN
        -- 'failed' permis UNIQUEMENT depuis 'pending'
        UPDATE public.transactions
        SET status = 'failed',
            provider_transaction_id = COALESCE(p_provider_tx, public.transactions.provider_transaction_id),
            confirmed_at = COALESCE(public.transactions.confirmed_at, now()),
            updated_at = now()
        WHERE public.transactions.id = p_transaction_id
          AND public.transactions.status = 'pending'
        RETURNING * INTO v_tx;

    ELSIF p_new_status = 'succeeded' THEN
        -- 'succeeded' permis depuis 'pending' OU 'failed' (paiement tardif après timeout)
        UPDATE public.transactions
        SET status = 'succeeded',
            provider_transaction_id = COALESCE(p_provider_tx, public.transactions.provider_transaction_id),
            confirmed_at = COALESCE(public.transactions.confirmed_at, now()),
            metadata = CASE
                WHEN public.transactions.status = 'failed' THEN
                    jsonb_set(
                        COALESCE(public.transactions.metadata, '{}'::jsonb),
                        '{late_success_at}',
                        to_jsonb(now()::text)
                    )
                ELSE public.transactions.metadata
            END,
            updated_at = now()
        WHERE public.transactions.id = p_transaction_id
          AND public.transactions.status IN ('pending', 'failed')
        RETURNING * INTO v_tx;
    END IF;

    -- 3. Déterminer si cet appel a effectivement changé le statut
    IF FOUND THEN
        v_claimed := true;
    ELSE
        -- La transaction n'était pas dans un état éligible ou n'existe pas
        SELECT * INTO v_tx
        FROM public.transactions
        WHERE public.transactions.id = p_transaction_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'claim_transaction_result: transaction % introuvable.', p_transaction_id;
        END IF;

        v_claimed := false;
    END IF;

    -- 4. Retourner (claimed, transaction jsonb)
    RETURN QUERY SELECT v_claimed, to_jsonb(v_tx);
END;
$$;


-- ----------------------------------------------------------------------------
-- 3. FONCTION ATOMIQUE : touch_status_check
-- ----------------------------------------------------------------------------
-- Met à jour atomiquement last_status_check_at à now() si et seulement si
-- l'intervalle minimal (en secondes) s'est écoulé depuis la dernière vérification,
-- ou si aucune vérification n'a encore eu lieu.
-- Renvoie true si l'UPDATE a été effectué (check autorisé), false sinon.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_status_check(
    p_transaction_id uuid,
    p_min_interval_seconds int DEFAULT 10
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated boolean := false;
BEGIN
    UPDATE public.transactions
    SET last_status_check_at = now()
    WHERE public.transactions.id = p_transaction_id
      AND (
          public.transactions.last_status_check_at IS NULL
          OR public.transactions.last_status_check_at <= now() - (p_min_interval_seconds || ' seconds')::interval
      );

    IF FOUND THEN
        v_updated := true;
    ELSE
        v_updated := false;
    END IF;

    RETURN v_updated;
END;
$$;


-- ----------------------------------------------------------------------------
-- 4. PERMISSIONS DE SÉCURITÉ
-- ----------------------------------------------------------------------------
-- Seul service_role (le serveur backend) est autorisé à exécuter ces fonctions.
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.claim_transaction_result(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_transaction_result(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.touch_status_check(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_status_check(uuid, int) TO service_role;


-- ============================================================================
-- SCRIPT DE RETOUR ARRIÈRE (ROLLBACK) - À EXÉCUTER UNIQUEMENT EN CAS D'URGENCE
-- ============================================================================
/*
-- 1. Révoquer les permissions et supprimer les fonctions
REVOKE EXECUTE ON FUNCTION public.touch_status_check(uuid, int) FROM service_role;
DROP FUNCTION IF EXISTS public.touch_status_check(uuid, int);

REVOKE EXECUTE ON FUNCTION public.claim_transaction_result(uuid, text, text) FROM service_role;
DROP FUNCTION IF EXISTS public.claim_transaction_result(uuid, text, text);

-- 2. Supprimer les colonnes ajoutées à public.transactions
ALTER TABLE public.transactions DROP COLUMN IF EXISTS last_status_check_at;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS effects_applied_at;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS confirmed_at;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS provider_transaction_id;
*/
