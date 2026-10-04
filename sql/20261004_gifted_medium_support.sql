CREATE OR REPLACE FUNCTION public.calculate_monetization_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
    IF lower(trim(COALESCE(NEW.plan, ''))) IN ('medium', 'pro', 'elite')
       AND lower(trim(COALESCE(NEW.plan_status, ''))) = 'active'
       AND (NEW.plan_ends_at IS NULL OR NEW.plan_ends_at > now()) THEN
        NEW.is_monetized := true;
    ELSE
        NEW.is_monetized := false;
    END IF;

    RETURN NEW;
END;
$function$;

UPDATE public.users
SET updated_at = now()
WHERE lower(trim(COALESCE(plan, ''))) IN ('medium', 'pro', 'elite')
  AND is_monetized IS DISTINCT FROM (
      lower(trim(COALESCE(plan_status, ''))) = 'active'
      AND (plan_ends_at IS NULL OR plan_ends_at > now())
  );
