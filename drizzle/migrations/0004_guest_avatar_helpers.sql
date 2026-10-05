ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS avatar text;

CREATE OR REPLACE FUNCTION public.set_guest_avatar(_id text, _avatar text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ UPDATE public.guests SET avatar = NULLIF(left(_avatar, 200000), '') WHERE id = _id; $$;

CREATE OR REPLACE FUNCTION public.guests_info(_id text, _ids text[])
 RETURNS TABLE(id text, name text, avatar text, distance_meters integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH me AS (SELECT g.lat AS mlat, g.lng AS mlng FROM public.guests g WHERE g.id = _id)
  SELECT o.id, o.name, o.avatar,
    CASE WHEN me.mlat IS NULL OR o.lat IS NULL THEN NULL ELSE
    (6371000 * acos(LEAST(1, GREATEST(-1,
      cos(radians(me.mlat)) * cos(radians(o.lat)) * cos(radians(o.lng) - radians(me.mlng))
      + sin(radians(me.mlat)) * sin(radians(o.lat))))))::int END
  FROM public.guests o LEFT JOIN me ON true
  WHERE o.id = ANY(_ids);
$$;

CREATE OR REPLACE FUNCTION public.emergency_helpers_list(_emergency uuid, _id text)
 RETURNS TABLE(guest_id text, name text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT h.guest_id, h.name FROM public.emergency_helpers h
  JOIN public.emergencies e ON e.id = h.emergency_id
  WHERE h.emergency_id = _emergency AND e.guest_id = _id
  ORDER BY h.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.set_guest_avatar(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guests_info(text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emergency_helpers_list(uuid, text) TO anon, authenticated;