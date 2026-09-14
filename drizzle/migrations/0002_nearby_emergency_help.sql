CREATE TABLE public.emergencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  blood_group text,
  hospital text,
  urgency text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.emergency_helpers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_id uuid NOT NULL REFERENCES public.emergencies(id) ON DELETE CASCADE,
  guest_id text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (emergency_id, guest_id)
);

CREATE INDEX emergencies_created_idx ON public.emergencies (created_at DESC);

GRANT ALL ON public.emergencies TO service_role;
GRANT ALL ON public.emergency_helpers TO service_role;

ALTER TABLE public.emergencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_helpers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.create_emergency(
  _id text, _name text, _kind text,
  _blood_group text DEFAULT NULL, _hospital text DEFAULT NULL, _urgency text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _lat double precision; _lng double precision; _new uuid;
BEGIN
  SELECT g.lat, g.lng INTO _lat, _lng FROM public.guests g WHERE g.id = _id;
  IF _lat IS NULL OR _lng IS NULL THEN
    RAISE EXCEPTION 'location unavailable';
  END IF;
  UPDATE public.emergencies SET active = false
    WHERE guest_id = _id AND active AND created_at < now() - interval '6 hours';
  INSERT INTO public.emergencies (guest_id, name, kind, blood_group, hospital, urgency, lat, lng)
  VALUES (_id, left(coalesce(_name,'Someone'),40), _kind, _blood_group, _hospital, _urgency, _lat, _lng)
  RETURNING id INTO _new;
  RETURN _new;
END; $$;

CREATE OR REPLACE FUNCTION public.emergencies_nearby(_id text)
RETURNS TABLE (
  id uuid, name text, kind text, blood_group text, hospital text, urgency text,
  distance_meters int, created_at timestamptz, helper_count int, mine boolean, i_helped boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT g.lat AS mlat, g.lng AS mlng FROM public.guests g WHERE g.id = _id)
  SELECT e.id, e.name, e.kind, e.blood_group, e.hospital, e.urgency,
    (6371000 * acos(LEAST(1, GREATEST(-1,
      cos(radians(me.mlat)) * cos(radians(e.lat)) * cos(radians(e.lng) - radians(me.mlng))
      + sin(radians(me.mlat)) * sin(radians(e.lat))))))::int AS distance_meters,
    e.created_at,
    (SELECT count(*) FROM public.emergency_helpers h WHERE h.emergency_id = e.id)::int AS helper_count,
    (e.guest_id = _id) AS mine,
    EXISTS (SELECT 1 FROM public.emergency_helpers h WHERE h.emergency_id = e.id AND h.guest_id = _id) AS i_helped
  FROM public.emergencies e, me
  WHERE e.active
    AND e.created_at > now() - interval '6 hours'
    AND me.mlat IS NOT NULL AND me.mlng IS NOT NULL
    AND (e.guest_id = _id OR (6371000 * acos(LEAST(1, GREATEST(-1,
      cos(radians(me.mlat)) * cos(radians(e.lat)) * cos(radians(e.lng) - radians(me.mlng))
      + sin(radians(me.mlat)) * sin(radians(e.lat)))))) <= 1000)
  ORDER BY e.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.offer_help(_emergency uuid, _id text, _name text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.emergency_helpers (emergency_id, guest_id, name)
  VALUES (_emergency, _id, left(coalesce(_name,'Someone'),40))
  ON CONFLICT (emergency_id, guest_id) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.close_emergency(_emergency uuid, _id text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.emergencies SET active = false WHERE id = _emergency AND guest_id = _id;
$$;

GRANT EXECUTE ON FUNCTION public.create_emergency(text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emergencies_nearby(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offer_help(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_emergency(uuid, text) TO anon, authenticated;