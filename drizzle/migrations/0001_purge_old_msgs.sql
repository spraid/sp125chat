CREATE OR REPLACE FUNCTION public.purge_old_msgs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.msgs WHERE created_at < now() - interval '7 days';
$$;

GRANT EXECUTE ON FUNCTION public.purge_old_msgs() TO anon, authenticated;