-- Fata challenge contract support.
-- This migration is additive so existing ARCs and Fata events remain intact.

alter table public.arcs
    add column if not exists milestones jsonb not null default '[]'::jsonb;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'arcs_milestones_is_array'
          and conrelid = 'public.arcs'::regclass
    ) then
        alter table public.arcs
            add constraint arcs_milestones_is_array
            check (jsonb_typeof(milestones) = 'array');
    end if;
end;
$$;

alter table public.fata_linkages
    add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'fata_linkages_metadata_is_object'
          and conrelid = 'public.fata_linkages'::regclass
    ) then
        alter table public.fata_linkages
            add constraint fata_linkages_metadata_is_object
            check (jsonb_typeof(metadata) = 'object');
    end if;
end;
$$;

alter table public.fata_challenges_config
    add column if not exists opens_at timestamptz,
    add column if not exists receipt_deadline_at timestamptz;

comment on column public.fata_challenges_config.opens_at is
    'Optional start of the Fata challenge activity window, provided by Fata.';
comment on column public.fata_challenges_config.close_at is
    'End of the Fata challenge activity window, provided by Fata.';
comment on column public.fata_challenges_config.receipt_deadline_at is
    'Latest time Fata accepts delivery of an already occurred action.';

-- Record each participant's ARC selection once per challenge. This is an
-- invoker function and is only callable by the server-side service role.
create or replace function public.record_fata_arc_selection(
    p_user_id uuid,
    p_issuer text,
    p_challenge_id text,
    p_arc_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    saved_selection jsonb;
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
                jsonb_build_object(
                    'arc_id', p_arc_id,
                    'selected_at', now()
                )
            ),
        true
    ),
    updated_at = now()
    where user_id = p_user_id
      and fata_iss = p_issuer
      and coalesce(metadata->'challenge_selections'->p_challenge_id, 'null'::jsonb) = 'null'::jsonb;

    if found then
        select metadata->'challenge_selections'->p_challenge_id
        into saved_selection
        from public.fata_linkages
        where user_id = p_user_id
          and fata_iss = p_issuer;

        return saved_selection;
    end if;

    select metadata->'challenge_selections'->p_challenge_id
    into saved_selection
    from public.fata_linkages
    where user_id = p_user_id
      and fata_iss = p_issuer
    for update;

    if saved_selection is null then
        raise exception 'No active Fata linkage was found'
            using errcode = 'P0002';
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
