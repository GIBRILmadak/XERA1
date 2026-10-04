-- =====================================================================
-- MESSAGERIE SÉCURISÉE (DM)
-- =====================================================================
-- À exécuter dans Supabase > SQL Editor AVANT de déployer le front.
-- Idempotent : peut être relancé sans risque.
--
-- Prérequis : le schéma DM d'origine (dm_conversations, dm_participants,
-- dm_messages, user_blocks, is_dm_blocked_between, block_dm_user...).
--
-- Ce script :
--   1. ferme les failles d'accès (un utilisateur pouvait s'ajouter à la
--      conversation de deux autres personnes et lire leurs messages) ;
--   2. contrôle chaque message côté serveur : expéditeur, participant,
--      blocage, confidentialité "qui peut m'écrire", anti-spam, horodatage ;
--   3. crée un bucket privé "dm-media" : les photos/vidéos ne sont lisibles
--      que par les participants, via l'app (plus aucune URL publique) ;
--   4. ajoute les RPC : boîte de réception, lu (heure serveur), sourdine,
--      modification, suppression pour tous, signalement ;
--   5. autorise l'indicateur "en train d'écrire" (Realtime privé).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Colonnes et contraintes
-- ---------------------------------------------------------------------

ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS media_path TEXT;
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID;
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.dm_participants ADD COLUMN IF NOT EXISTS muted BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_preferences JSONB;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_messages_reply_to_fk'
    ) THEN
        ALTER TABLE public.dm_messages
            ADD CONSTRAINT dm_messages_reply_to_fk
            FOREIGN KEY (reply_to_id) REFERENCES public.dm_messages(id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- Un message supprimé n'a plus de contenu ; un média peut être privé (path).
ALTER TABLE public.dm_messages DROP CONSTRAINT IF EXISTS dm_messages_content_required;
ALTER TABLE public.dm_messages
    ADD CONSTRAINT dm_messages_content_required CHECK (
        deleted_at IS NOT NULL
        OR char_length(btrim(COALESCE(body, ''))) > 0
        OR media_url IS NOT NULL
        OR media_path IS NOT NULL
    ) NOT VALID;

ALTER TABLE public.dm_messages DROP CONSTRAINT IF EXISTS dm_messages_media_requires_type;
ALTER TABLE public.dm_messages
    ADD CONSTRAINT dm_messages_media_requires_type CHECK (
        (media_url IS NULL AND media_path IS NULL) OR media_type IS NOT NULL
    ) NOT VALID;

ALTER TABLE public.dm_messages DROP CONSTRAINT IF EXISTS dm_messages_media_path_format;
ALTER TABLE public.dm_messages
    ADD CONSTRAINT dm_messages_media_path_format CHECK (
        media_path IS NULL
        OR media_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,180}$'
    ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_dm_messages_sender_created_at
    ON public.dm_messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_messages_media_path
    ON public.dm_messages (media_path) WHERE media_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dm_messages_reply_to
    ON public.dm_messages (reply_to_id) WHERE reply_to_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. Fonctions utilitaires (SECURITY DEFINER : contournent les RLS de
--    façon contrôlée, ce qui évite aussi la récursion dans les policies)
-- ---------------------------------------------------------------------

-- Interne : appartenance d'un utilisateur donné.
CREATE OR REPLACE FUNCTION public.dm_is_member(p_conversation_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.dm_participants p
        WHERE p.conversation_id = p_conversation_id
          AND p.user_id = p_user_id
    );
$$;

-- Exposée aux policies : l'utilisateur connecté est-il participant ?
CREATE OR REPLACE FUNCTION public.is_dm_participant(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.dm_is_member(p_conversation_id, auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.dm_other_participant(p_conversation_id UUID, p_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.user_id
    FROM public.dm_participants p
    WHERE p.conversation_id = p_conversation_id
      AND p.user_id <> p_user_id
    LIMIT 1;
$$;

-- Réglage "qui peut m'écrire" (users.profile_preferences.privacy.allowMessages) :
--   everyone  : tout le monde ;
--   followers : seulement les personnes qui me suivent ;
--   none      : personne ne peut démarrer de conversation.
-- Si le destinataire a déjà écrit dans la conversation, elle peut continuer.
CREATE OR REPLACE FUNCTION public.dm_can_message(
    p_sender UUID,
    p_recipient UUID,
    p_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_mode TEXT;
BEGIN
    IF p_sender IS NULL OR p_recipient IS NULL THEN
        RETURN FALSE;
    END IF;

    IF public.is_dm_blocked_between(p_sender, p_recipient) THEN
        RETURN FALSE;
    END IF;

    SELECT u.profile_preferences -> 'privacy' ->> 'allowMessages'
    INTO v_mode
    FROM public.users u
    WHERE u.id = p_recipient;

    IF v_mode IS NULL OR v_mode NOT IN ('followers', 'none') THEN
        RETURN TRUE;
    END IF;

    IF p_conversation_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.dm_messages m
        WHERE m.conversation_id = p_conversation_id
          AND m.sender_id = p_recipient
    ) THEN
        RETURN TRUE;
    END IF;

    IF v_mode = 'followers' THEN
        RETURN EXISTS (
            SELECT 1
            FROM public.followers f
            WHERE f.follower_id = p_sender
              AND f.following_id = p_recipient
        );
    END IF;

    RETURN FALSE;
END;
$$;

-- Chemin d'un média privé : "<conversation_id>/<sender_id>/<fichier>".
CREATE OR REPLACE FUNCTION public.dm_media_path_matches(
    p_path TEXT,
    p_conversation_id UUID,
    p_sender_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT p_path IS NOT NULL
       AND p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,180}$'
       AND split_part(p_path, '/', 1) = p_conversation_id::TEXT
       AND split_part(p_path, '/', 2) = p_sender_id::TEXT;
$$;

-- Storage : jamais d'exception (ces fonctions peuvent être évaluées sur des
-- objets d'autres buckets), d'où la validation par regex avant tout cast.
CREATE OR REPLACE FUNCTION public.dm_storage_can_upload(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
    v_conversation_id UUID;
    v_sender_id UUID;
    v_other UUID;
BEGIN
    IF v_me IS NULL OR p_name IS NULL OR p_name !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,180}$'
    THEN
        RETURN FALSE;
    END IF;

    v_conversation_id := split_part(p_name, '/', 1)::UUID;
    v_sender_id := split_part(p_name, '/', 2)::UUID;

    IF v_sender_id <> v_me OR NOT public.dm_is_member(v_conversation_id, v_me) THEN
        RETURN FALSE;
    END IF;

    v_other := public.dm_other_participant(v_conversation_id, v_me);
    RETURN v_other IS NULL OR public.dm_can_message(v_me, v_other, v_conversation_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.dm_storage_can_read(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
    v_conversation_id UUID;
    v_sender_id UUID;
BEGIN
    IF v_me IS NULL OR p_name IS NULL OR p_name !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,180}$'
    THEN
        RETURN FALSE;
    END IF;

    v_conversation_id := split_part(p_name, '/', 1)::UUID;
    v_sender_id := split_part(p_name, '/', 2)::UUID;

    IF NOT public.dm_is_member(v_conversation_id, v_me) THEN
        RETURN FALSE;
    END IF;

    -- L'expéditeur garde l'accès à ses fichiers ; l'autre participant
    -- seulement tant qu'un message non supprimé y fait référence.
    IF v_sender_id = v_me THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.dm_messages m
        WHERE m.media_path = p_name
          AND m.conversation_id = v_conversation_id
          AND m.deleted_at IS NULL
    );
END;
$$;

-- Realtime privé "dm:<conversation_id>" (indicateur "en train d'écrire").
CREATE OR REPLACE FUNCTION public.dm_realtime_topic_allowed(p_topic TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
    v_conversation_id UUID;
    v_other UUID;
BEGIN
    IF v_me IS NULL OR p_topic IS NULL OR p_topic !~
        '^dm:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
        RETURN FALSE;
    END IF;

    v_conversation_id := substr(p_topic, 4)::UUID;
    IF NOT public.dm_is_member(v_conversation_id, v_me) THEN
        RETURN FALSE;
    END IF;

    v_other := public.dm_other_participant(v_conversation_id, v_me);
    RETURN v_other IS NULL OR NOT public.is_dm_blocked_between(v_me, v_other);
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------

-- SECURITY DEFINER : les clients n'ont plus le droit de modifier
-- dm_conversations directement.
CREATE OR REPLACE FUNCTION public.update_dm_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.dm_conversations
    SET last_message_at = NEW.created_at,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dm_messages_touch_conversation ON public.dm_messages;
CREATE TRIGGER trg_dm_messages_touch_conversation
AFTER INSERT ON public.dm_messages
FOR EACH ROW EXECUTE FUNCTION public.update_dm_conversation_on_message();

-- Contrôle serveur de chaque nouveau message (s'exécute avant les RLS).
CREATE OR REPLACE FUNCTION public.dm_messages_guard_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
    v_other UUID;
    v_recent INTEGER;
BEGIN
    -- Horodatage serveur : impossible d'antidater ou de pré-éditer.
    NEW.created_at := NOW();
    NEW.edited_at := NULL;
    NEW.deleted_at := NULL;
    NEW.body := NULLIF(btrim(COALESCE(NEW.body, '')), '');

    -- Backend (service_role) : messages système autorisés.
    IF v_me IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.sender_id IS DISTINCT FROM v_me THEN
        RAISE EXCEPTION 'DM_SENDER_MISMATCH';
    END IF;

    IF NOT public.dm_is_member(NEW.conversation_id, v_me) THEN
        RAISE EXCEPTION 'DM_NOT_PARTICIPANT';
    END IF;

    v_other := public.dm_other_participant(NEW.conversation_id, v_me);
    IF v_other IS NOT NULL AND public.is_dm_blocked_between(v_me, v_other) THEN
        RAISE EXCEPTION 'DM_BLOCKED';
    END IF;
    IF v_other IS NOT NULL
       AND NOT public.dm_can_message(v_me, v_other, NEW.conversation_id) THEN
        RAISE EXCEPTION 'DM_PRIVACY_RESTRICTED';
    END IF;

    -- Les nouveaux médias passent uniquement par le bucket privé.
    IF NEW.media_url IS NOT NULL THEN
        RAISE EXCEPTION 'DM_MEDIA_URL_FORBIDDEN';
    END IF;

    IF NEW.media_path IS NOT NULL THEN
        IF NOT public.dm_media_path_matches(NEW.media_path, NEW.conversation_id, v_me) THEN
            RAISE EXCEPTION 'DM_MEDIA_PATH_INVALID';
        END IF;
        IF NEW.media_type IS NULL OR NEW.media_type NOT IN ('image', 'video') THEN
            RAISE EXCEPTION 'DM_MEDIA_TYPE_INVALID';
        END IF;
        IF NOT EXISTS (
            SELECT 1
            FROM storage.objects o
            WHERE o.bucket_id = 'dm-media'
              AND o.name = NEW.media_path
        ) THEN
            RAISE EXCEPTION 'DM_MEDIA_NOT_FOUND';
        END IF;
        NEW.media_name := left(NEW.media_name, 200);
    ELSE
        NEW.media_type := NULL;
        NEW.media_name := NULL;
        NEW.media_size_bytes := NULL;
    END IF;

    IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.dm_messages r
        WHERE r.id = NEW.reply_to_id
          AND r.conversation_id = NEW.conversation_id
    ) THEN
        RAISE EXCEPTION 'DM_REPLY_INVALID';
    END IF;

    -- Anti-spam : 40 messages par minute maximum.
    SELECT count(*)
    INTO v_recent
    FROM public.dm_messages m
    WHERE m.sender_id = v_me
      AND m.created_at > NOW() - INTERVAL '1 minute';
    IF v_recent >= 40 THEN
        RAISE EXCEPTION 'DM_RATE_LIMIT';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dm_messages_guard_insert ON public.dm_messages;
CREATE TRIGGER trg_dm_messages_guard_insert
BEFORE INSERT ON public.dm_messages
FOR EACH ROW EXECUTE FUNCTION public.dm_messages_guard_insert();

-- ---------------------------------------------------------------------
-- 4. RLS : on repart de zéro sur les 3 tables DM
-- ---------------------------------------------------------------------

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('dm_conversations', 'dm_participants', 'dm_messages')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END
$$;

ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

-- Lecture réservée aux participants. Aucune écriture directe sur les
-- conversations et participants : tout passe par les RPC.
CREATE POLICY dm_conversations_select_participants
ON public.dm_conversations
FOR SELECT TO authenticated
USING (public.is_dm_participant(id));

-- Les participants voient aussi la ligne de l'autre (accusés de lecture).
CREATE POLICY dm_participants_select_members
ON public.dm_participants
FOR SELECT TO authenticated
USING (public.is_dm_participant(conversation_id));

CREATE POLICY dm_messages_select_participants
ON public.dm_messages
FOR SELECT TO authenticated
USING (public.is_dm_participant(conversation_id));

-- Blocage, confidentialité, médias et anti-spam : voir le trigger ci-dessus.
CREATE POLICY dm_messages_insert_sender_member
ON public.dm_messages
FOR INSERT TO authenticated
WITH CHECK (
    sender_id = auth.uid()
    AND public.is_dm_participant(conversation_id)
);

REVOKE ALL ON public.dm_conversations, public.dm_participants, public.dm_messages FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.dm_conversations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.dm_participants FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.dm_messages FROM authenticated;
GRANT SELECT ON public.dm_conversations, public.dm_participants, public.dm_messages TO authenticated;
GRANT INSERT ON public.dm_messages TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Nettoyage : retire les participants qui ne font pas partie de la paire
--    (exploitation possible des anciennes policies d'insertion).
-- ---------------------------------------------------------------------

DO $$
DECLARE
    v_removed INTEGER;
    v_foreign INTEGER;
BEGIN
    DELETE FROM public.dm_participants p
    USING public.dm_conversations c
    WHERE p.conversation_id = c.id
      AND p.user_id::TEXT NOT IN (split_part(c.pair_key, ':', 1), split_part(c.pair_key, ':', 2));
    GET DIAGNOSTICS v_removed = ROW_COUNT;

    SELECT count(*)
    INTO v_foreign
    FROM public.dm_messages m
    JOIN public.dm_conversations c ON c.id = m.conversation_id
    WHERE m.sender_id::TEXT NOT IN (split_part(c.pair_key, ':', 1), split_part(c.pair_key, ':', 2));

    RAISE NOTICE 'DM : % participant(s) illégitime(s) retiré(s) ; % message(s) envoyés par un non-membre (à vérifier).',
        v_removed, v_foreign;
END
$$;

-- ---------------------------------------------------------------------
-- 6. Signalements
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.dm_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    reported_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.dm_conversations(id) ON DELETE SET NULL,
    message_id UUID REFERENCES public.dm_messages(id) ON DELETE SET NULL,
    reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'scam', 'other')),
    details TEXT CHECK (char_length(COALESCE(details, '')) <= 1000),
    -- Copie du message au moment du signalement (preuve, même s'il est supprimé).
    message_snapshot JSONB,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_reports_reporter_message
    ON public.dm_reports (reporter_id, message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dm_reports_status_created
    ON public.dm_reports (status, created_at DESC);

-- Aucune policy : seuls le backend (service_role) et les RPC y accèdent.
ALTER TABLE public.dm_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dm_reports FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. RPC
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_or_create_dm_conversation(p_other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
    v_pair_key TEXT;
    v_conversation_id UUID;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF p_other_user_id IS NULL THEN
        RAISE EXCEPTION 'OTHER_USER_REQUIRED';
    END IF;
    IF p_other_user_id = v_me THEN
        RAISE EXCEPTION 'SELF_CONVERSATION_NOT_ALLOWED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_other_user_id) THEN
        RAISE EXCEPTION 'OTHER_USER_REQUIRED';
    END IF;
    IF public.is_dm_blocked_between(v_me, p_other_user_id) THEN
        RAISE EXCEPTION 'DM_BLOCKED';
    END IF;

    v_pair_key :=
        CASE
            WHEN v_me::TEXT < p_other_user_id::TEXT
                THEN v_me::TEXT || ':' || p_other_user_id::TEXT
            ELSE p_other_user_id::TEXT || ':' || v_me::TEXT
        END;

    SELECT c.id
    INTO v_conversation_id
    FROM public.dm_conversations c
    WHERE c.pair_key = v_pair_key
    LIMIT 1;

    IF v_conversation_id IS NULL THEN
        IF NOT public.dm_can_message(v_me, p_other_user_id, NULL) THEN
            RAISE EXCEPTION 'DM_PRIVACY_RESTRICTED';
        END IF;
        INSERT INTO public.dm_conversations (created_by, pair_key, last_message_at)
        VALUES (v_me, v_pair_key, NOW())
        RETURNING id INTO v_conversation_id;
    END IF;

    INSERT INTO public.dm_participants (conversation_id, user_id, last_read_at, hidden_at)
    VALUES (v_conversation_id, v_me, NOW(), NULL)
    ON CONFLICT (conversation_id, user_id) DO UPDATE
    SET last_read_at = EXCLUDED.last_read_at,
        hidden_at = NULL;

    INSERT INTO public.dm_participants (conversation_id, user_id, last_read_at)
    VALUES (v_conversation_id, p_other_user_id, NOW())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    RETURN v_conversation_id;
END;
$$;

-- Ajout de "messages_restricted" : le type de retour change, donc DROP.
DROP FUNCTION IF EXISTS public.get_dm_relationship_status(UUID);
CREATE FUNCTION public.get_dm_relationship_status(p_other_user_id UUID)
RETURNS TABLE (
    blocked_by_me BOOLEAN,
    blocked_me BOOLEAN,
    can_message BOOLEAN,
    messages_restricted BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
    v_pair_key TEXT;
    v_conversation_id UUID;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF p_other_user_id IS NULL THEN
        RAISE EXCEPTION 'OTHER_USER_REQUIRED';
    END IF;

    blocked_by_me := EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE b.blocker_id = v_me AND b.blocked_user_id = p_other_user_id
    );
    blocked_me := EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE b.blocker_id = p_other_user_id AND b.blocked_user_id = v_me
    );

    v_pair_key :=
        CASE
            WHEN v_me::TEXT < p_other_user_id::TEXT
                THEN v_me::TEXT || ':' || p_other_user_id::TEXT
            ELSE p_other_user_id::TEXT || ':' || v_me::TEXT
        END;
    SELECT c.id INTO v_conversation_id
    FROM public.dm_conversations c
    WHERE c.pair_key = v_pair_key
    LIMIT 1;

    messages_restricted := NOT blocked_by_me
        AND NOT blocked_me
        AND NOT public.dm_can_message(v_me, p_other_user_id, v_conversation_id);
    can_message := NOT blocked_by_me AND NOT blocked_me AND NOT messages_restricted;
    RETURN NEXT;
END;
$$;

-- Boîte de réception en une seule requête (remplace 3 + N requêtes).
CREATE OR REPLACE FUNCTION public.get_dm_inbox()
RETURNS TABLE (
    conversation_id UUID,
    pair_key TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ,
    other_user_id UUID,
    my_last_read_at TIMESTAMPTZ,
    other_last_read_at TIMESTAMPTZ,
    hidden_at TIMESTAMPTZ,
    muted BOOLEAN,
    unread_count INTEGER,
    last_message JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        c.id,
        c.pair_key,
        c.created_at,
        c.updated_at,
        c.last_message_at,
        o.user_id,
        me.last_read_at,
        o.last_read_at,
        me.hidden_at,
        COALESCE(me.muted, FALSE),
        (
            SELECT count(*)::INTEGER
            FROM public.dm_messages m
            WHERE m.conversation_id = c.id
              AND m.sender_id <> me.user_id
              AND m.deleted_at IS NULL
              AND (me.last_read_at IS NULL OR m.created_at > me.last_read_at)
        ),
        (
            SELECT to_jsonb(lm)
            FROM (
                SELECT m.id, m.conversation_id, m.sender_id, m.body, m.media_url,
                       m.media_path, m.media_type, m.media_name, m.media_size_bytes,
                       m.reply_to_id, m.created_at, m.edited_at, m.deleted_at
                FROM public.dm_messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.created_at DESC
                LIMIT 1
            ) lm
        )
    FROM public.dm_participants me
    JOIN public.dm_conversations c ON c.id = me.conversation_id
    LEFT JOIN LATERAL (
        SELECT p.user_id, p.last_read_at
        FROM public.dm_participants p
        WHERE p.conversation_id = c.id
          AND p.user_id <> me.user_id
        LIMIT 1
    ) o ON TRUE
    WHERE me.user_id = auth.uid()
    ORDER BY c.last_message_at DESC NULLS LAST
    LIMIT 300;
$$;

-- "Lu" à l'heure du serveur (et non de l'horloge du téléphone).
CREATE OR REPLACE FUNCTION public.mark_dm_conversation_read(p_conversation_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
    v_now TIMESTAMPTZ := NOW();
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    UPDATE public.dm_participants
    SET last_read_at = v_now
    WHERE conversation_id = p_conversation_id
      AND user_id = v_me;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DM_NOT_PARTICIPANT';
    END IF;
    RETURN v_now;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_dm_conversation_muted(
    p_conversation_id UUID,
    p_muted BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    UPDATE public.dm_participants
    SET muted = COALESCE(p_muted, FALSE)
    WHERE conversation_id = p_conversation_id
      AND user_id = v_me;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DM_NOT_PARTICIPANT';
    END IF;
    RETURN COALESCE(p_muted, FALSE);
END;
$$;

-- Modification : par l'expéditeur, dans les 15 minutes.
CREATE OR REPLACE FUNCTION public.edit_dm_message(p_message_id UUID, p_body TEXT)
RETURNS public.dm_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
    v_message public.dm_messages;
    v_body TEXT := btrim(COALESCE(p_body, ''));
    v_other UUID;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    SELECT * INTO v_message
    FROM public.dm_messages
    WHERE id = p_message_id
    FOR UPDATE;

    IF NOT FOUND OR v_message.sender_id <> v_me THEN
        RAISE EXCEPTION 'DM_MESSAGE_NOT_FOUND';
    END IF;
    IF v_message.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'DM_MESSAGE_DELETED';
    END IF;
    IF v_message.created_at < NOW() - INTERVAL '15 minutes' THEN
        RAISE EXCEPTION 'DM_EDIT_WINDOW_EXPIRED';
    END IF;
    IF char_length(v_body) = 0
       AND v_message.media_path IS NULL
       AND v_message.media_url IS NULL THEN
        RAISE EXCEPTION 'DM_EMPTY_MESSAGE';
    END IF;
    IF char_length(v_body) > 4000 THEN
        RAISE EXCEPTION 'DM_MESSAGE_TOO_LONG';
    END IF;

    v_other := public.dm_other_participant(v_message.conversation_id, v_me);
    IF v_other IS NOT NULL AND public.is_dm_blocked_between(v_me, v_other) THEN
        RAISE EXCEPTION 'DM_BLOCKED';
    END IF;

    IF NULLIF(v_body, '') IS NOT DISTINCT FROM v_message.body THEN
        RETURN v_message;
    END IF;

    UPDATE public.dm_messages
    SET body = NULLIF(v_body, ''),
        edited_at = NOW()
    WHERE id = p_message_id
    RETURNING * INTO v_message;

    RETURN v_message;
END;
$$;

-- Suppression pour tout le monde : par l'expéditeur, à tout moment.
-- Renvoie les chemins des fichiers à effacer côté Storage par le client.
CREATE OR REPLACE FUNCTION public.delete_dm_message(p_message_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
    v_message public.dm_messages;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    SELECT * INTO v_message
    FROM public.dm_messages
    WHERE id = p_message_id
    FOR UPDATE;

    IF NOT FOUND OR v_message.sender_id <> v_me THEN
        RAISE EXCEPTION 'DM_MESSAGE_NOT_FOUND';
    END IF;
    IF v_message.deleted_at IS NOT NULL THEN
        RETURN jsonb_build_object('media_path', NULL, 'media_url', NULL);
    END IF;

    UPDATE public.dm_messages
    SET deleted_at = NOW(),
        body = NULL,
        media_url = NULL,
        media_path = NULL,
        media_type = NULL,
        media_name = NULL,
        media_size_bytes = NULL
    WHERE id = p_message_id;

    RETURN jsonb_build_object(
        'media_path', v_message.media_path,
        'media_url', v_message.media_url
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.report_dm(
    p_conversation_id UUID,
    p_message_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'other',
    p_details TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
    v_message public.dm_messages;
    v_reported UUID;
    v_report_id UUID;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF NOT public.dm_is_member(p_conversation_id, v_me) THEN
        RAISE EXCEPTION 'DM_NOT_PARTICIPANT';
    END IF;
    IF p_reason IS NULL OR p_reason NOT IN ('spam', 'harassment', 'inappropriate', 'scam', 'other') THEN
        RAISE EXCEPTION 'DM_REPORT_REASON_INVALID';
    END IF;

    IF p_message_id IS NOT NULL THEN
        SELECT * INTO v_message
        FROM public.dm_messages
        WHERE id = p_message_id
          AND conversation_id = p_conversation_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'DM_MESSAGE_NOT_FOUND';
        END IF;
        IF v_message.sender_id = v_me THEN
            RAISE EXCEPTION 'DM_REPORT_SELF';
        END IF;
        v_reported := v_message.sender_id;

        SELECT r.id INTO v_report_id
        FROM public.dm_reports r
        WHERE r.reporter_id = v_me
          AND r.message_id = p_message_id;
        IF v_report_id IS NOT NULL THEN
            RETURN v_report_id;
        END IF;
    ELSE
        v_reported := public.dm_other_participant(p_conversation_id, v_me);
    END IF;

    INSERT INTO public.dm_reports (
        reporter_id, reported_user_id, conversation_id, message_id,
        reason, details, message_snapshot
    )
    VALUES (
        v_me,
        v_reported,
        p_conversation_id,
        p_message_id,
        p_reason,
        left(NULLIF(btrim(COALESCE(p_details, '')), ''), 1000),
        CASE
            WHEN p_message_id IS NOT NULL THEN jsonb_build_object(
                'body', v_message.body,
                'media_path', v_message.media_path,
                'media_url', v_message.media_url,
                'media_type', v_message.media_type,
                'created_at', v_message.created_at,
                'edited_at', v_message.edited_at,
                'deleted_at', v_message.deleted_at
            )
        END
    )
    RETURNING id INTO v_report_id;

    RETURN v_report_id;
END;
$$;

-- ---------------------------------------------------------------------
-- 8. Storage : bucket privé pour les médias des DM
-- ---------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'dm-media',
    'dm-media',
    FALSE,
    52428800, -- 50 Mo
    ARRAY[
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
        'video/mp4', 'video/quicktime', 'video/webm'
    ]
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS dm_media_insert_participants ON storage.objects;
CREATE POLICY dm_media_insert_participants
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'dm-media' AND public.dm_storage_can_upload(name));

DROP POLICY IF EXISTS dm_media_select_participants ON storage.objects;
CREATE POLICY dm_media_select_participants
ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'dm-media' AND public.dm_storage_can_read(name));

DROP POLICY IF EXISTS dm_media_delete_sender ON storage.objects;
CREATE POLICY dm_media_delete_sender
ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'dm-media' AND split_part(name, '/', 2) = auth.uid()::TEXT);

-- ---------------------------------------------------------------------
-- 9. Realtime
-- ---------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'dm_messages'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'dm_participants'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_participants;
        END IF;
    END IF;
END
$$;

-- Canal privé "dm:<conversation_id>" réservé aux participants non bloqués.
DROP POLICY IF EXISTS dm_broadcast_read ON realtime.messages;
CREATE POLICY dm_broadcast_read
ON realtime.messages
FOR SELECT TO authenticated
USING (
    realtime.messages.extension = 'broadcast'
    AND public.dm_realtime_topic_allowed(realtime.topic())
);

DROP POLICY IF EXISTS dm_broadcast_write ON realtime.messages;
CREATE POLICY dm_broadcast_write
ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
    realtime.messages.extension = 'broadcast'
    AND public.dm_realtime_topic_allowed(realtime.topic())
);

-- ---------------------------------------------------------------------
-- 10. Droits d'exécution
-- ---------------------------------------------------------------------
-- Supabase accorde EXECUTE à anon/authenticated par défaut : on retire
-- tout, puis on ouvre uniquement ce dont le client a besoin.

REVOKE ALL ON FUNCTION public.dm_is_member(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dm_other_participant(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dm_can_message(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dm_messages_guard_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_dm_conversation_on_message() FROM PUBLIC, anon, authenticated;
-- Le blocage est désormais vérifié dans le trigger : inutile d'exposer
-- une fonction qui révèle qui a bloqué qui.
REVOKE ALL ON FUNCTION public.is_dm_blocked_between(UUID, UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.is_dm_participant(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dm_media_path_matches(TEXT, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dm_storage_can_upload(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dm_storage_can_read(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dm_realtime_topic_allowed(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_dm_participant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dm_media_path_matches(TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dm_storage_can_upload(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dm_storage_can_read(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dm_realtime_topic_allowed(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_or_create_dm_conversation(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_dm_relationship_status(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_dm_inbox() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_dm_conversation_read(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_dm_conversation_muted(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.edit_dm_message(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_dm_message(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_dm(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm_conversation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dm_relationship_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dm_inbox() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_dm_conversation_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_dm_conversation_muted(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_dm_message(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_dm_message(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_dm(UUID, UUID, TEXT, TEXT) TO authenticated;

COMMIT;

-- ---------------------------------------------------------------------
-- Vérification (à lancer séparément après le script) :
--
--   select tablename, policyname, cmd from pg_policies
--   where tablename like 'dm_%' or policyname like 'dm_%' order by 1, 2;
--
--   select id, public, file_size_limit from storage.buckets where id = 'dm-media';
--
-- Signalements à traiter :
--   select * from dm_reports where status = 'open' order by created_at desc;
-- ---------------------------------------------------------------------
