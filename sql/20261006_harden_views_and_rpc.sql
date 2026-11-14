-- Vues : elles s'exécutaient avec les droits de leur propriétaire et
-- contournaient le RLS (ex : creator_revenue_summary exposait les revenus de
-- tous les créateurs à un visiteur anonyme). Elles appliquent désormais le RLS
-- de l'utilisateur qui les interroge.
alter view public.creator_revenue_summary set (security_invoker = true);
alter view public.creator_monthly_stats set (security_invoker = true);
alter view public.message_unread_counts set (security_invoker = true);
alter view public.enterprise_talent_needs set (security_invoker = true);
alter view public.organization_arcs_pulse set (security_invoker = true);
alter view public.youtube_shorts_analytics set (security_invoker = true);
alter view public.momentum_discovery_feed set (security_invoker = true);

-- Fonctions financières appelées uniquement par le serveur (service_role).
revoke execute on function public.request_automatic_withdrawal(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.redeem_subscription_discount_code(text, uuid) from public, anon, authenticated;
revoke execute on function public.sync_creator_wallet(uuid) from public, anon, authenticated;

-- Fonctions de trigger : inutile de les exposer via /rest/v1/rpc.
revoke execute on function public.notify_on_follow() from public, anon, authenticated;
revoke execute on function public.log_fata_activity() from public, anon, authenticated;
revoke execute on function public.on_arc_change_fata() from public, anon, authenticated;

-- toggle_courage acceptait n'importe quel user_id_param : on pouvait
-- encourager / retirer un encouragement au nom de quelqu'un d'autre.
create or replace function public.toggle_courage(row_id uuid, user_id_param uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
    exists_check boolean;
    new_count integer;
    is_encouraged boolean;
begin
    if coalesce(auth.role(), '') <> 'service_role'
       and (auth.uid() is null or user_id_param is distinct from auth.uid()) then
        raise exception 'NOT_AUTHORIZED' using errcode = '42501';
    end if;

    select exists(select 1 from content_encouragements where content_id = row_id and user_id = user_id_param) into exists_check;

    if exists_check then
        delete from content_encouragements where content_id = row_id and user_id = user_id_param;
        update content set encouragements_count = greatest(encouragements_count - 1, 0) where id = row_id returning encouragements_count into new_count;
        is_encouraged := false;
    else
        insert into content_encouragements (user_id, content_id) values (user_id_param, row_id);
        update content set encouragements_count = encouragements_count + 1 where id = row_id returning encouragements_count into new_count;
        is_encouraged := true;
    end if;

    return jsonb_build_object('count', new_count, 'encouraged', is_encouraged);
end;
$function$;

revoke execute on function public.toggle_courage(uuid, uuid) from public, anon;
grant execute on function public.toggle_courage(uuid, uuid) to authenticated;
