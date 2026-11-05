-- Keep each qualifying Fata action and its delivery task in the same
-- PostgreSQL transaction. The existing activity-log worker remains as a
-- recovery path for rows written before this migration and for reconciliation.

create or replace function public.enqueue_fata_completion(
    p_user_id uuid,
    p_issuer text,
    p_fata_sub text,
    p_challenge_id text,
    p_requirement_id text,
    p_occurred_at timestamptz,
    p_event_key text
)
returns void
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
    normalized_occurred_at timestamptz := date_trunc('milliseconds', p_occurred_at);
    key_source text;
begin
    if p_user_id is null or nullif(trim(p_issuer), '') is null
        or nullif(trim(p_fata_sub), '') is null
        or nullif(trim(p_challenge_id), '') is null
        or nullif(trim(p_requirement_id), '') is null
        or p_occurred_at is null or nullif(trim(p_event_key), '') is null then
        raise exception 'Incomplete Fata outbox event' using errcode = '22023';
    end if;

    key_source := concat_ws('|', p_user_id::text, trim(p_challenge_id),
        trim(p_requirement_id), trim(p_event_key));

    insert into public.fata_pending_events (
        user_id, fata_iss, fata_sub, challenge_id, requirement_id,
        occurred_at, idempotency_key, status, retry_count, next_retry_at
    ) values (
        p_user_id, trim(p_issuer), trim(p_fata_sub), trim(p_challenge_id),
        trim(p_requirement_id), normalized_occurred_at,
        encode(extensions.digest(convert_to(key_source, 'UTF8'), 'sha256'), 'hex'),
        'pending', 0, null
    )
    on conflict (idempotency_key) do nothing;
end;
$$;

revoke all on function public.enqueue_fata_completion(uuid, text, text, text, text, timestamptz, text)
    from public, anon, authenticated;
grant execute on function public.enqueue_fata_completion(uuid, text, text, text, text, timestamptz, text)
    to service_role;

-- The existing activity trigger already records the source action in this
-- transaction. Extend it to add the actual delivery task before that
-- transaction commits.
create or replace function public.log_fata_activity()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
    v_user_id uuid;
    v_content public.content%rowtype;
    v_linkage public.fata_linkages%rowtype;
    v_challenge public.fata_challenges_config%rowtype;
    v_cursor record;
    v_milestone_count integer;
begin
    if tg_table_name = 'arcs' then
        v_user_id := new.user_id;
    elsif tg_table_name = 'content' then
        v_user_id := new.user_id;
    elsif tg_table_name = 'arc_milestone_validations' then
        select c.user_id into v_user_id
        from public.content c where c.id = new.content_id;
    end if;

    if v_user_id is null or not public.is_fata_user(v_user_id) then
        return new;
    end if;

    insert into public.fata_activity_log (user_id, entity_type, entity_id, action)
    values (v_user_id, tg_table_name, new.id, tg_op);

    -- The integration guide currently targets Fata production. Only links
    -- for its configured issuer can create tasks sent by this XERA1 client.
    if tg_table_name = 'arcs' and tg_op = 'INSERT' then
        if new.page_id is not null
            or nullif(trim(new.title), '') is null
            or nullif(trim(new.description), '') is null
            or lower(new.status) in ('draft', 'deleted', 'private') then
            return new;
        end if;

        select count(*) into v_milestone_count
        from jsonb_array_elements(coalesce(new.milestones, '[]'::jsonb)) milestone
        where case
            when jsonb_typeof(milestone) = 'string'
                then nullif(trim(milestone #>> '{}'), '') is not null
            else nullif(trim(milestone->>'title'), '') is not null
        end;
        if v_milestone_count < 3 then
            return new;
        end if;

        for v_cursor in
            select l as linkage, c as challenge
            from public.fata_linkages l
            cross join public.fata_challenges_config c
            where l.user_id = v_user_id
              and l.fata_iss = 'https://fata.app/oidc'
              and c.is_active
              and c.opens_at is not null and c.close_at is not null
              and c.opens_at <= c.close_at
              and new.created_at >= l.created_at
              and new.created_at >= c.opens_at and new.created_at <= c.close_at
        loop
            v_linkage := v_cursor.linkage;
            v_challenge := v_cursor.challenge;
            update public.fata_linkages
            set metadata = jsonb_set(
                    coalesce(metadata, '{}'::jsonb),
                    '{challenge_selections}',
                    coalesce(metadata->'challenge_selections', '{}'::jsonb)
                        || jsonb_build_object(
                            v_challenge.id,
                            jsonb_build_object('arc_id', new.id, 'selected_at', new.created_at)
                        ),
                    true
                ),
                updated_at = now()
            where user_id = v_user_id
              and fata_iss = v_linkage.fata_iss
              and coalesce(metadata->'challenge_selections'->v_challenge.id, 'null'::jsonb) = 'null'::jsonb;

            if found then
                perform public.enqueue_fata_completion(
                    v_user_id, v_linkage.fata_iss, v_linkage.fata_sub,
                    v_challenge.id, v_challenge.req_arc, new.created_at,
                    'selection-' || v_challenge.id || '-' || new.id::text
                );
            end if;
        end loop;
    elsif tg_table_name = 'content' then
        if new.page_id is not null or coalesce(new.is_deleted, false)
            or nullif(trim(new.description), '') is null
            or (nullif(trim(new.media_url), '') is null
                and coalesce(cardinality(new.media_urls), 0) = 0) then
            return new;
        end if;

        for v_cursor in
            select l as linkage, c as challenge
            from public.fata_linkages l
            cross join lateral jsonb_each(
                case when jsonb_typeof(l.metadata->'challenge_selections') = 'object'
                    then l.metadata->'challenge_selections' else '{}'::jsonb end
            ) s
            join public.fata_challenges_config c on c.id = s.key
            where l.user_id = v_user_id
              and l.fata_iss = 'https://fata.app/oidc'
              and s.value->>'arc_id' = new.arc_id::text
              and c.is_active
              and c.opens_at is not null and c.close_at is not null
              and c.opens_at <= c.close_at
              and new.created_at >= l.created_at
              and new.created_at >= c.opens_at and new.created_at <= c.close_at
        loop
            v_linkage := v_cursor.linkage;
            v_challenge := v_cursor.challenge;
            perform public.enqueue_fata_completion(
                v_user_id, v_linkage.fata_iss, v_linkage.fata_sub,
                v_challenge.id, v_challenge.req_preuve, new.created_at,
                'preuve-' || new.id::text
            );
        end loop;
    elsif tg_table_name = 'arc_milestone_validations' then
        select c.* into v_content
        from public.content c where c.id = new.content_id;
        if not found or new.validator_user_id <> v_user_id
            or v_content.user_id <> v_user_id
            or v_content.arc_id <> new.arc_id
            or v_content.page_id is not null
            or coalesce(v_content.is_deleted, false)
            or nullif(trim(v_content.description), '') is null
            or (nullif(trim(v_content.media_url), '') is null
                and coalesce(cardinality(v_content.media_urls), 0) = 0)
            or nullif(trim(new.comment), '') is null then
            return new;
        end if;

        for v_cursor in
            select l as linkage, c as challenge
            from public.fata_linkages l
            cross join lateral jsonb_each(
                case when jsonb_typeof(l.metadata->'challenge_selections') = 'object'
                    then l.metadata->'challenge_selections' else '{}'::jsonb end
            ) s
            join public.fata_challenges_config c on c.id = s.key
            where l.user_id = v_user_id
              and l.fata_iss = 'https://fata.app/oidc'
              and s.value->>'arc_id' = new.arc_id::text
              and c.is_active
              and c.opens_at is not null and c.close_at is not null
              and c.opens_at <= c.close_at
              and v_content.created_at >= l.created_at
              and v_content.created_at >= c.opens_at and v_content.created_at <= c.close_at
              and new.created_at >= l.created_at
              and new.created_at >= c.opens_at and new.created_at <= c.close_at
        loop
            v_linkage := v_cursor.linkage;
            v_challenge := v_cursor.challenge;
            -- The validation and its backing proof are one logical action;
            -- enqueue both rows atomically with the validation write.
            perform public.enqueue_fata_completion(
                v_user_id, v_linkage.fata_iss, v_linkage.fata_sub,
                v_challenge.id, v_challenge.req_preuve, v_content.created_at,
                'preuve-' || v_content.id::text
            );
            perform public.enqueue_fata_completion(
                v_user_id, v_linkage.fata_iss, v_linkage.fata_sub,
                v_challenge.id, v_challenge.req_jalon, new.created_at,
                'jalon-' || new.id::text
            );
        end loop;
    end if;

    return new;
end;
$$;

revoke all on function public.log_fata_activity() from public, anon, authenticated;

-- ARC selection is itself the action when an existing ARC is chosen. Put its
-- task in the same transaction that stores the immutable selection.
create or replace function public.record_fata_arc_selection(
    p_user_id uuid,
    p_issuer text,
    p_challenge_id text,
    p_arc_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
    saved_selection jsonb;
    selected_at timestamptz;
    occurred_at timestamptz;
    linked_at timestamptz;
    v_milestone_count integer;
    challenge_row public.fata_challenges_config%rowtype;
    arc_row public.arcs%rowtype;
    fata_subject text;
begin
    if p_user_id is null or nullif(trim(p_issuer), '') is null
        or nullif(trim(p_challenge_id), '') is null or p_arc_id is null then
        raise exception 'A user, issuer, challenge, and ARC are required'
            using errcode = '22023';
    end if;

    update public.fata_linkages
    set metadata = jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{challenge_selections}',
        coalesce(metadata->'challenge_selections', '{}'::jsonb)
            || jsonb_build_object(
                p_challenge_id,
                jsonb_build_object('arc_id', p_arc_id, 'selected_at', now())
            ),
        true
    ),
    updated_at = now()
    where user_id = p_user_id
      and fata_iss = p_issuer
      and coalesce(metadata->'challenge_selections'->p_challenge_id, 'null'::jsonb) = 'null'::jsonb;

    if found then
        select metadata->'challenge_selections'->p_challenge_id, created_at, fata_sub
        into saved_selection, linked_at, fata_subject
        from public.fata_linkages
        where user_id = p_user_id and fata_iss = p_issuer;

        selected_at := (saved_selection->>'selected_at')::timestamptz;
        select * into challenge_row from public.fata_challenges_config
        where id = p_challenge_id and is_active;
        select * into arc_row from public.arcs where id = p_arc_id;
        select count(*) into v_milestone_count
        from jsonb_array_elements(coalesce(arc_row.milestones, '[]'::jsonb)) milestone
        where case
            when jsonb_typeof(milestone) = 'string'
                then nullif(trim(milestone #>> '{}'), '') is not null
            else nullif(trim(milestone->>'title'), '') is not null
        end;

        if challenge_row.id is not null and arc_row.id is not null
            and arc_row.user_id = p_user_id and arc_row.page_id is null
            and nullif(trim(arc_row.title), '') is not null
            and nullif(trim(arc_row.description), '') is not null
            and lower(arc_row.status) not in ('draft', 'deleted', 'private')
            and v_milestone_count >= 3
            and challenge_row.opens_at is not null
            and challenge_row.close_at is not null
            and selected_at >= linked_at
            and selected_at >= challenge_row.opens_at
            and selected_at <= challenge_row.close_at then
            occurred_at := selected_at;
            if arc_row.created_at >= linked_at
                and arc_row.created_at >= challenge_row.opens_at
                and arc_row.created_at <= challenge_row.close_at then
                occurred_at := arc_row.created_at;
            end if;
            perform public.enqueue_fata_completion(
                p_user_id, p_issuer, fata_subject, p_challenge_id,
                challenge_row.req_arc, occurred_at,
                'selection-' || p_challenge_id || '-' || p_arc_id::text
            );
        end if;

        return saved_selection;
    end if;

    select metadata->'challenge_selections'->p_challenge_id
    into saved_selection
    from public.fata_linkages
    where user_id = p_user_id and fata_iss = p_issuer
    for update;

    if saved_selection is null then
        raise exception 'No active Fata linkage was found' using errcode = 'P0002';
    end if;
    if saved_selection->>'arc_id' <> p_arc_id::text then
        raise exception 'An ARC is already selected for this Fata challenge'
            using errcode = '23505';
    end if;
    return saved_selection;
end;
$$;

revoke all on function public.record_fata_arc_selection(uuid, text, text, uuid)
    from public, anon, authenticated;
grant execute on function public.record_fata_arc_selection(uuid, text, text, uuid)
    to service_role;

notify pgrst, 'reload schema';
