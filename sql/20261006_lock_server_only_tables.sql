-- Tables utilisées uniquement par le serveur (clé service_role) : elles étaient
-- lisibles et modifiables par n'importe qui avec la clé publique (RLS désactivé
-- + droits complets pour anon/authenticated). service_role contourne le RLS,
-- le serveur continue donc de fonctionner.

do $$
declare
    t text;
begin
    foreach t in array array[
        'youtube_shorts_audit',
        'user_retention_metrics',
        'engagement_velocity',
        'user_affinity',
        'user_subscriptions',
        'oauth_states',
        'user_oauth_tokens',
        'ingestion_jobs',
        'promo_codes',
        'commissions',
        'partner_referrals'
    ] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('revoke all on table public.%I from anon, authenticated', t);
    end loop;
end $$;

-- Les triggers qui alimentent ces tables tournaient avec les droits de
-- l'appelant : ils doivent maintenant écrire avec les droits du propriétaire.
create or replace function public.audit_youtube_shorts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.youtube_shorts_audit (youtube_video_id, action, change_details, created_at)
  values (
    coalesce(new.youtube_video_id, old.youtube_video_id),
    tg_op,
    jsonb_build_object(
      'old_data', to_jsonb(old),
      'new_data', to_jsonb(new)
    ),
    current_timestamp
  );
  return coalesce(new, old);
end;
$function$;

create or replace function public.sync_partner_referrals()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.partner_referrals (partner_id, user_id)
  values (new.partner_id, new.user_id)
  on conflict do nothing;
  return new;
end;
$function$;

revoke execute on function public.audit_youtube_shorts() from public, anon, authenticated;
revoke execute on function public.sync_partner_referrals() from public, anon, authenticated;

-- Cette vue s'exécutait avec les droits de son propriétaire (contournement du
-- RLS). Elle n'est utilisée nulle part côté client.
alter view public.user_engagement_scores set (security_invoker = true);
revoke all on table public.user_engagement_scores from anon, authenticated;
