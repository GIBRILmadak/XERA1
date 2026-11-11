-- Make Fata participation explicit before source actions are eligible. The
-- source row and its durable outbox task are still committed atomically.

update public.fata_linkages as linkage
set metadata = jsonb_set(
    coalesce(linkage.metadata, '{}'::jsonb),
    '{challenge_intents}',
    coalesce(
        (
            select jsonb_object_agg(
                selection.key,
                jsonb_build_object(
                    'participating_at', selection.value->>'selected_at'
                )
            )
            from jsonb_each(linkage.metadata->'challenge_selections') as selection
            where nullif(selection.value->>'selected_at', '') is not null
        ),
        '{}'::jsonb
    ) || coalesce(linkage.metadata->'challenge_intents', '{}'::jsonb),
    true
)
where jsonb_typeof(linkage.metadata->'challenge_selections') = 'object';

create or replace function public.set_fata_challenge_participation(
    p_user_id uuid,
    p_issuer text,
    p_challenge_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    intent jsonb;
begin
    if p_user_id is null or nullif(trim(p_issuer), '') is null
        or nullif(trim(p_challenge_id), '') is null then
        raise exception 'A user, issuer, and challenge are required'
            using errcode = '22023';
    end if;

    update public.fata_linkages
    set metadata = jsonb_set(
            coalesce(metadata, '{}'::jsonb),
            '{challenge_intents}',
            coalesce(metadata->'challenge_intents', '{}'::jsonb)
                || jsonb_build_object(
                    p_challenge_id,
                    coalesce(
                        metadata->'challenge_intents'->p_challenge_id,
                        jsonb_build_object('participating_at', now())
                    )
                ),
            true
        ),
        updated_at = now()
    where user_id = p_user_id and fata_iss = p_issuer
    returning metadata->'challenge_intents'->p_challenge_id into intent;

    if intent is null then
        raise exception 'No active Fata linkage was found' using errcode = 'P0002';
    end if;

    return intent;
end;
$$;

revoke all on function public.set_fata_challenge_participation(uuid, text, text)
    from public, anon, authenticated;
grant execute on function public.set_fata_challenge_participation(uuid, text, text)
    to service_role;

-- Restrict transactionally enqueued events to a participant who explicitly
-- entered this challenge, and require proofs/validations to follow ARC choice.
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
              and jsonb_typeof(l.metadata->'challenge_intents') = 'object'
              and l.metadata->'challenge_intents' ? c.id
              and new.created_at >= nullif(
                    l.metadata->'challenge_intents'->c.id->>'participating_at', ''
                  )::timestamptz
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
                and not exists (
                    select 1
                    from unnest(new.media_urls) as media(url)
                    where nullif(trim(media.url::text), '') is not null
                )) then
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
              and jsonb_typeof(l.metadata->'challenge_intents') = 'object'
              and l.metadata->'challenge_intents' ? c.id
              and nullif(s.value->>'selected_at', '') is not null
              and new.created_at >= (s.value->>'selected_at')::timestamptz
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
                and not exists (
                    select 1
                    from unnest(v_content.media_urls) as media(url)
                    where nullif(trim(media.url::text), '') is not null
                ))
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
              and jsonb_typeof(l.metadata->'challenge_intents') = 'object'
              and l.metadata->'challenge_intents' ? c.id
              and nullif(s.value->>'selected_at', '') is not null
              and v_content.created_at >= (s.value->>'selected_at')::timestamptz
              and new.created_at >= (s.value->>'selected_at')::timestamptz
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

-- Selecting an existing ARC also records intent, selection, and the req_arc
-- outbox task in one transaction.
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
    linkage_row public.fata_linkages%rowtype;
    challenge_row public.fata_challenges_config%rowtype;
    arc_row public.arcs%rowtype;
    saved_selection jsonb;
    intent jsonb;
    selected_at timestamptz := now();
    occurred_at timestamptz;
    milestone_count integer;
begin
    if p_user_id is null or nullif(trim(p_issuer), '') is null
        or nullif(trim(p_challenge_id), '') is null or p_arc_id is null then
        raise exception 'A user, issuer, challenge, and ARC are required'
            using errcode = '22023';
    end if;

    select * into linkage_row
    from public.fata_linkages
    where user_id = p_user_id and fata_iss = p_issuer
    for update;
    if not found then
        raise exception 'No active Fata linkage was found' using errcode = 'P0002';
    end if;

    select * into challenge_row
    from public.fata_challenges_config
    where id = p_challenge_id and is_active;
    if not found or challenge_row.opens_at is null or challenge_row.close_at is null
        or challenge_row.opens_at > challenge_row.close_at
        or selected_at < challenge_row.opens_at or selected_at > challenge_row.close_at
        or selected_at < linkage_row.created_at then
        raise exception 'Fata challenge is not open for ARC selection'
            using errcode = '22023';
    end if;

    select * into arc_row from public.arcs where id = p_arc_id;
    if not found or arc_row.user_id <> p_user_id or arc_row.page_id is not null
        or nullif(trim(arc_row.title), '') is null
        or nullif(trim(arc_row.description), '') is null
        or lower(arc_row.status) in ('draft', 'deleted', 'private') then
        raise exception 'ARC does not meet Fata challenge requirements'
            using errcode = '22023';
    end if;

    select count(*) into milestone_count
    from jsonb_array_elements(coalesce(arc_row.milestones, '[]'::jsonb)) milestone
    where case
        when jsonb_typeof(milestone) = 'string'
            then nullif(trim(milestone #>> '{}'), '') is not null
        else nullif(trim(milestone->>'title'), '') is not null
    end;
    if milestone_count < 3 then
        raise exception 'ARC must have at least three named milestones'
            using errcode = '22023';
    end if;

    saved_selection := linkage_row.metadata->'challenge_selections'->p_challenge_id;
    if saved_selection is not null then
        if saved_selection->>'arc_id' <> p_arc_id::text then
            raise exception 'An ARC is already selected for this Fata challenge'
                using errcode = '23505';
        end if;
        intent := coalesce(
            linkage_row.metadata->'challenge_intents'->p_challenge_id,
            jsonb_build_object('participating_at', selected_at)
        );
        update public.fata_linkages
        set metadata = jsonb_set(
                coalesce(metadata, '{}'::jsonb),
                '{challenge_intents}',
                coalesce(metadata->'challenge_intents', '{}'::jsonb)
                    || jsonb_build_object(p_challenge_id, intent),
                true
            ),
            updated_at = now()
        where user_id = p_user_id and fata_iss = p_issuer;
        return saved_selection;
    end if;

    if challenge_row.receipt_deadline_at is not null
        and selected_at > challenge_row.receipt_deadline_at then
        raise exception 'Fata receipt deadline passed' using errcode = '22023';
    end if;

    intent := coalesce(
        linkage_row.metadata->'challenge_intents'->p_challenge_id,
        jsonb_build_object('participating_at', selected_at)
    );
    saved_selection := jsonb_build_object(
        'arc_id', p_arc_id,
        'selected_at', selected_at
    );
    occurred_at := selected_at;
    if arc_row.created_at >= selected_at
        and arc_row.created_at >= linkage_row.created_at
        and arc_row.created_at >= challenge_row.opens_at
        and arc_row.created_at <= challenge_row.close_at then
        occurred_at := arc_row.created_at;
    end if;

    update public.fata_linkages
    set metadata = jsonb_set(
            jsonb_set(
                coalesce(metadata, '{}'::jsonb),
                '{challenge_selections}',
                coalesce(metadata->'challenge_selections', '{}'::jsonb)
                    || jsonb_build_object(p_challenge_id, saved_selection),
                true
            ),
            '{challenge_intents}',
            coalesce(metadata->'challenge_intents', '{}'::jsonb)
                || jsonb_build_object(p_challenge_id, intent),
            true
        ),
        updated_at = now()
    where user_id = p_user_id and fata_iss = p_issuer;

    perform public.enqueue_fata_completion(
        p_user_id, p_issuer, linkage_row.fata_sub, p_challenge_id,
        challenge_row.req_arc, occurred_at,
        'selection-' || p_challenge_id || '-' || p_arc_id::text
    );
    return saved_selection;
end;
$$;

revoke all on function public.record_fata_arc_selection(uuid, text, text, uuid)
    from public, anon, authenticated;
grant execute on function public.record_fata_arc_selection(uuid, text, text, uuid)
    to service_role;

notify pgrst, 'reload schema';
