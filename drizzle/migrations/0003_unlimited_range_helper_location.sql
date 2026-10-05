CREATE OR REPLACE FUNCTION public.guests_nearby(_id text)
 RETURNS TABLE(id text, name text, distance_meters integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT g.lat AS mlat, g.lng AS mlng FROM public.guests g WHERE g.id = _id)
  SELECT o.id, o.name,
         (6371000 * acos(LEAST(1, GREATEST(-1,
            cos(radians(me.mlat)) * cos(radians(o.lat)) * cos(radians(o.lng) - radians(me.mlng))
            + sin(radians(me.mlat)) * sin(radians(o.lat))))))::int AS distance_meters
  FROM public.guests o, me
  WHERE o.id <> _id AND o.lat IS NOT NULL AND o.lng IS NOT NULL
    AND me.mlat IS NOT NULL AND me.mlng IS NOT NULL
    AND o.last_seen > now() - interval '60 seconds'
  ORDER BY distance_meters ASC;
$function$;

CREATE OR REPLACE FUNCTION public.emergencies_nearby(_id text)
 RETURNS TABLE(id uuid, name text, kind text, blood_group text, hospital text, urgency text, distance_meters integer, created_at timestamp with time zone, helper_count integer, mine boolean, i_helped boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT g.lat AS mlat, g.lng AS mlng FROM public.guests g WHERE g.id = _id)
  SELECT e.id, e.name, e.kind, e.blood_group, e.hospital, e.urgency,
    (6371000 * acos(LEAST(1, GREATEST(-1,
      cos(radians(me.mlat)) * cos(radians(e.lat)) * cos(radians(e.lng) - radians(me.mlng))
      + sin(radians(me.mlat)) * sin(radians(e.lat))))))::int,
    e.created_at,
    (SELECT count(*) FROM public.emergency_helpers h WHERE h.emergency_id = e.id)::int,
    (e.guest_id = _id),
    EXISTS (SELECT 1 FROM public.emergency_helpers h WHERE h.emergency_id = e.id AND h.guest_id = _id)
  FROM public.emergencies e, me
  WHERE e.active AND e.created_at > now() - interval '6 hours'
    AND me.mlat IS NOT NULL AND me.mlng IS NOT NULL
  ORDER BY e.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.emergency_live_location(_emergency uuid, _id text)
 RETURNS TABLE(lat double precision, lng double precision, updated_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(g.lat, e.lat), COALESCE(g.lng, e.lng), COALESCE(g.last_seen, e.created_at)
  FROM public.emergencies e
  LEFT JOIN public.guests g ON g.id = e.guest_id
  WHERE e.id = _emergency AND e.active
    AND EXISTS (SELECT 1 FROM public.emergency_helpers h WHERE h.emergency_id = e.id AND h.guest_id = _id);
$function$;
GRANT EXECUTE ON FUNCTION public.emergency_live_location(uuid, text) TO anon, authenticated;