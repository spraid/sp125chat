-- Guests (coordinates stay private: no anon SELECT on this table)
CREATE TABLE public.guests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT, UPDATE ON public.guests TO anon, authenticated;
GRANT ALL ON public.guests TO service_role;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can join" ON public.guests FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anyone can refresh" ON public.guests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Chat requests
CREATE TABLE public.chat_reqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_id, to_id),
  CHECK (from_id <> to_id)
);
GRANT SELECT, INSERT, UPDATE ON public.chat_reqs TO anon, authenticated;
GRANT ALL ON public.chat_reqs TO service_role;
ALTER TABLE public.chat_reqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read requests" ON public.chat_reqs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "create requests" ON public.chat_reqs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update requests" ON public.chat_reqs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Messages (persisted, never auto-deleted)
CREATE TABLE public.msgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','image','location')),
  body TEXT NOT NULL CHECK (char_length(body) <= 300000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX msgs_pair_idx ON public.msgs (from_id, to_id, created_at);
GRANT SELECT, INSERT ON public.msgs TO anon, authenticated;
GRANT ALL ON public.msgs TO service_role;
ALTER TABLE public.msgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read messages" ON public.msgs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "send messages" ON public.msgs FOR INSERT TO anon, authenticated WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reqs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.msgs;

-- Presence + location upsert
CREATE OR REPLACE FUNCTION public.guest_ping(_id TEXT, _name TEXT, _lat DOUBLE PRECISION, _lng DOUBLE PRECISION)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.guests (id, name, lat, lng, last_seen)
  VALUES (_id, left(_name, 40), _lat, _lng, now())
  ON CONFLICT (id) DO UPDATE
    SET name = excluded.name, lat = excluded.lat, lng = excluded.lng, last_seen = now();
$$;

-- Nearby guests within 1 km, online in the last 60 seconds. Never returns coordinates.
CREATE OR REPLACE FUNCTION public.guests_nearby(_id TEXT)
RETURNS TABLE (id TEXT, name TEXT, distance_meters INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT g.lat AS mlat, g.lng AS mlng FROM public.guests g WHERE g.id = _id)
  SELECT o.id,
         o.name,
         (6371000 * acos(LEAST(1, GREATEST(-1,
            cos(radians(me.mlat)) * cos(radians(o.lat)) * cos(radians(o.lng) - radians(me.mlng))
            + sin(radians(me.mlat)) * sin(radians(o.lat))
         ))))::int AS distance_meters
  FROM public.guests o, me
  WHERE o.id <> _id
    AND o.lat IS NOT NULL AND o.lng IS NOT NULL
    AND me.mlat IS NOT NULL AND me.mlng IS NOT NULL
    AND o.last_seen > now() - interval '60 seconds'
    AND (6371000 * acos(LEAST(1, GREATEST(-1,
            cos(radians(me.mlat)) * cos(radians(o.lat)) * cos(radians(o.lng) - radians(me.mlng))
            + sin(radians(me.mlat)) * sin(radians(o.lat))
         )))) <= 1000
  ORDER BY distance_meters ASC;
$$;

REVOKE ALL ON FUNCTION public.guest_ping(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guests_nearby(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_ping(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guests_nearby(TEXT) TO anon, authenticated;