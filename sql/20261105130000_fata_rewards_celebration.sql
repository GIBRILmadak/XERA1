-- Award the public Fata badge and persist the celebration acknowledgement
-- alongside the qualification so returning users see it exactly until closed.

alter table public.fata_qualifications
    add column if not exists celebration_seen_at timestamptz;

alter table public.verified_badges
    drop constraint if exists verified_badges_type_check;

alter table public.verified_badges
    add constraint verified_badges_type_check
    check (type = any (array['creator'::text, 'staff'::text, 'page'::text, 'fata'::text]));

create or replace function public.award_fata_qualification(
    p_user_id uuid,
    p_challenge_id text,
    p_fata_sub text,
    p_validated_by uuid
)
returns public.fata_qualifications
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    challenge_is_test boolean;
    qualification_row public.fata_qualifications%rowtype;
begin
    if p_user_id is null or nullif(trim(p_challenge_id), '') is null
        or nullif(trim(p_fata_sub), '') is null or p_validated_by is null then
        raise exception 'A user, challenge, Fata subject and validator are required'
            using errcode = '22023';
    end if;

    select is_test into challenge_is_test
    from public.fata_challenges_config
    where id = trim(p_challenge_id);

    if not found then
        raise exception 'Unknown Fata challenge: %', p_challenge_id
            using errcode = 'P0002';
    end if;

    insert into public.fata_qualifications as current_qualification (
        user_id, challenge_id, fata_sub, qualified_at, validated_by,
        badge_awarded, visibility_boost_active, visibility_multiplier,
        boost_started_at, boost_ends_at, metadata
    ) values (
        p_user_id, trim(p_challenge_id), trim(p_fata_sub), now(), p_validated_by,
        not challenge_is_test,
        not challenge_is_test,
        case when challenge_is_test then 1.0 else 5.0 end,
        case when challenge_is_test then null else now() end,
        null,
        jsonb_build_object('is_test', challenge_is_test, 'award_source', 'fata_admin_qualification')
    )
    on conflict (user_id, challenge_id) do update
    set fata_sub = excluded.fata_sub,
        qualified_at = excluded.qualified_at,
        validated_by = excluded.validated_by,
        badge_awarded = excluded.badge_awarded,
        visibility_boost_active = excluded.visibility_boost_active,
        visibility_multiplier = excluded.visibility_multiplier,
        boost_started_at = excluded.boost_started_at,
        boost_ends_at = excluded.boost_ends_at,
        metadata = coalesce(current_qualification.metadata, '{}'::jsonb) || excluded.metadata
    returning * into qualification_row;

    if not challenge_is_test then
        insert into public.verified_badges (user_id, type)
        values (p_user_id, 'fata')
        on conflict (user_id, type) do nothing;
    end if;

    return qualification_row;
end;
$$;

revoke all on function public.award_fata_qualification(uuid, text, text, uuid)
    from public, anon, authenticated;
grant execute on function public.award_fata_qualification(uuid, text, text, uuid)
    to service_role;

create or replace function public.mark_fata_celebration_seen(
    p_user_id uuid,
    p_challenge_id text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
    if p_user_id is null or nullif(trim(p_challenge_id), '') is null then
        return false;
    end if;

    update public.fata_qualifications
    set celebration_seen_at = coalesce(celebration_seen_at, now())
    where user_id = p_user_id
      and challenge_id = trim(p_challenge_id)
      and badge_awarded
      and visibility_boost_active
      and visibility_multiplier >= 5;

    return found;
end;
$$;

revoke all on function public.mark_fata_celebration_seen(uuid, text)
    from public, anon, authenticated;
grant execute on function public.mark_fata_celebration_seen(uuid, text)
    to service_role;

notify pgrst, 'reload schema';
