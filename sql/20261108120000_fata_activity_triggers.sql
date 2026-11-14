-- Ensure every source action has an AFTER INSERT hook. The trigger function
-- writes the activity and outbox records inside the source row transaction.
-- Existing active triggers are retained and never duplicated.
do $$
declare
    target record;
    relation_oid regclass;
begin
    for target in
        select * from (values
            ('arcs', 'trg_fata_activity_arcs_insert'),
            ('content', 'trg_fata_activity_content_insert'),
            ('arc_milestone_validations', 'trg_fata_activity_milestones_insert')
        ) as tables(table_name, trigger_name)
    loop
        relation_oid := to_regclass('public.' || quote_ident(target.table_name));
        if relation_oid is null then
            raise exception 'Required Fata source table public.% is missing',
                target.table_name;
        end if;

        if not exists (
            select 1
            from pg_trigger as trigger_row
            where trigger_row.tgrelid = relation_oid
              and trigger_row.tgfoid = 'public.log_fata_activity()'::regprocedure
              and not trigger_row.tgisinternal
              and trigger_row.tgenabled <> 'D'
              and (trigger_row.tgtype & 4) <> 0
        ) then
            execute format(
                'create trigger %I after insert on public.%I for each row execute function public.log_fata_activity()',
                target.trigger_name,
                target.table_name
            );
        end if;
    end loop;
end;
$$;

notify pgrst, 'reload schema';
