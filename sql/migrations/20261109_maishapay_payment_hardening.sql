-- ============================================================================
-- Migration : 20261109_maishapay_payment_hardening.sql
-- Description : Durcissement du schéma des transactions et fonctions atomiques
--               pour le module prestataire MaishaPay.
-- Idempotence : Oui (IF NOT EXISTS / CREATE OR REPLACE)
-- Sécurité : Fonctions SECURITY DEFINER avec search_path = ''
--            Accès restreint à service_role uniquement (pas d'accès public/anon/authenticated)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ÉVOLUTION DE LA TABLE TRANSACTIONS
-- ----------------------------------------------------------------------------

-- Référence externe unique marchande (ex: xera_<uuid>)
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS external_reference text;

-- Identifiant de transaction attribué par le prestataire (ex: MaishaPay transactionId)
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS provider_transaction_id text;

-- Horodatage de confirmation du statut final (succeeded ou failed)
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- Horodatage d'application des effets métier (crédit wallet, activation abonnement, etc.)
-- Reste NULL tant que les effets n'ont pas été effectivement appliqués.
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS effects_applied_at timestamptz;

-- Index partiel UNIQUE pour garantir l'unicité de la référence externe marchande
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_external_reference
    ON public.transactions(external_reference)
    WHERE external_reference IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 2. FONCTION ATOMIQUE : claim_transaction_result
-- ----------------------------------------------------------------------------
-- Fait un SEUL UPDATE atomique conditionné par status = 'pending'.
-- N'accepte que 'succeeded' ou 'failed'.
-- Renvoie la ligne de transaction complète + le booléen claimed.
-- claimed = true  -> cet appel a gagné la course et a changé le statut.
-- claimed = false -> la transaction avait déjà été traitée (idempotence).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_transaction_result(
    p_transaction_id uuid,
    p_new_status text,
    p_provider_tx text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    from_user_id uuid,
    to_user_id uuid,
    type text,
    amount_gross numeric,
    amount_net_creator numeric,
    amount_commission_xera numeric,
    currency text,
    status text,
    description text,
    metadata jsonb,
    created_at timestamptz,
    updated_at timestamptz,
    external_reference text,
    provider_transaction_id text,
    confirmed_at timestamptz,
    effects_applied_at timestamptz,
    claimed boolean
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

    -- 2. UN SEUL UPDATE atomique conditionné par status = 'pending'
    UPDATE public.transactions
    SET status = p_new_status,
        provider_transaction_id = COALESCE(p_provider_tx, provider_transaction_id),
        confirmed_at = COALESCE(confirmed_at, now()),
        updated_at = now()
    WHERE public.transactions.id = p_transaction_id
      AND public.transactions.status = 'pending'
    RETURNING * INTO v_tx;

    -- 3. Déterminer si cet appel a effectivement changé le statut
    IF FOUND THEN
        v_claimed := true;
    ELSE
        -- La transaction n'était plus à l'état 'pending' ou n'existe pas
        SELECT * INTO v_tx
        FROM public.transactions
        WHERE public.transactions.id = p_transaction_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'claim_transaction_result: transaction % introuvable.', p_transaction_id;
        END IF;

        v_claimed := false;
    END IF;

    -- 4. Retourner l'enregistrement complet avec le flag claimed
    RETURN QUERY SELECT
        v_tx.id,
        v_tx.from_user_id,
        v_tx.to_user_id,
        v_tx.type,
        v_tx.amount_gross,
        v_tx.amount_net_creator,
        v_tx.amount_commission_xera,
        v_tx.currency,
        v_tx.status,
        v_tx.description,
        v_tx.metadata,
        v_tx.created_at,
        v_tx.updated_at,
        v_tx.external_reference,
        v_tx.provider_transaction_id,
        v_tx.confirmed_at,
        v_tx.effects_applied_at,
        v_claimed;
END;
$$;


-- ----------------------------------------------------------------------------
-- 3. FONCTION ATOMIQUE : credit_creator_wallet_for_support
-- ----------------------------------------------------------------------------
-- Verrouille la transaction (FOR UPDATE).
-- Vérifie type = 'support', status = 'succeeded' et effects_applied_at IS NULL.
-- Fait l'upsert sur public.creator_wallets (available_balance += amount_net_creator).
-- Renseigne effects_applied_at = now().
-- Idempotent : un second appel retourne false sans rien recréditer.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.credit_creator_wallet_for_support(
    p_transaction_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tx public.transactions%ROWTYPE;
BEGIN
    -- 1. Verrouiller la transaction pour éviter tout traitement concurrent
    SELECT * INTO v_tx
    FROM public.transactions
    WHERE public.transactions.id = p_transaction_id
    FOR UPDATE;

    -- Vérifier l'existence
    IF NOT FOUND THEN
        RAISE EXCEPTION 'credit_creator_wallet_for_support: transaction % introuvable.', p_transaction_id;
    END IF;

    -- 2. Vérifications métier
    IF v_tx.type <> 'support' THEN
        RAISE EXCEPTION 'credit_creator_wallet_for_support: type de transaction invalide (%). Attendu: ''support''.', v_tx.type;
    END IF;

    IF v_tx.status <> 'succeeded' THEN
        RAISE EXCEPTION 'credit_creator_wallet_for_support: transaction non confirmée (status=%). Seules les transactions ''succeeded'' sont créditées.', v_tx.status;
    END IF;

    -- 3. Idempotence : si les effets ont déjà été appliqués, ne rien recréditer
    IF v_tx.effects_applied_at IS NOT NULL THEN
        RETURN false;
    END IF;

    -- 4. Upsert sur creator_wallets
    -- Colonne réelle en base : available_balance (numeric)
    INSERT INTO public.creator_wallets (user_id, available_balance, updated_at)
    VALUES (v_tx.to_user_id, v_tx.amount_net_creator, now())
    ON CONFLICT (user_id)
    DO UPDATE SET
        available_balance = public.creator_wallets.available_balance + EXCLUDED.available_balance,
        updated_at = now();

    -- 5. Marquer les effets comme appliqués sur la transaction
    UPDATE public.transactions
    SET effects_applied_at = now(),
        updated_at = now()
    WHERE public.transactions.id = p_transaction_id;

    RETURN true;
END;
$$;


-- ----------------------------------------------------------------------------
-- 4. PERMISSIONS DE SÉCURITÉ
-- ----------------------------------------------------------------------------
-- Conformité avec les audits de sécurité : interdire tout appel direct
-- depuis les rôles client (anon, authenticated, PUBLIC).
-- Seul service_role (le serveur backend) est autorisé à exécuter ces fonctions.
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.claim_transaction_result(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_transaction_result(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.credit_creator_wallet_for_support(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_creator_wallet_for_support(uuid) TO service_role;


-- ============================================================================
-- SCRIPT DE RETOUR ARRIÈRE (ROLLBACK) - À EXÉCUTER UNIQUEMENT EN CAS D'URGENCE
-- ============================================================================
/*
-- 1. Révoquer les permissions et supprimer les fonctions
REVOKE EXECUTE ON FUNCTION public.credit_creator_wallet_for_support(uuid) FROM service_role;
DROP FUNCTION IF EXISTS public.credit_creator_wallet_for_support(uuid);

REVOKE EXECUTE ON FUNCTION public.claim_transaction_result(uuid, text, text) FROM service_role;
DROP FUNCTION IF EXISTS public.claim_transaction_result(uuid, text, text);

-- 2. Supprimer l'index partiel unique
DROP INDEX IF EXISTS public.idx_transactions_external_reference;

-- 3. Supprimer les colonnes ajoutées à public.transactions
ALTER TABLE public.transactions DROP COLUMN IF EXISTS effects_applied_at;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS confirmed_at;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS provider_transaction_id;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS external_reference;
*/
