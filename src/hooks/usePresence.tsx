import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type GeoState = {
  status: "idle" | "requesting" | "granted" | "denied" | "unsupported" | "error";
  message?: string;
  accuracy?: number;
  updatedAt?: number;
};

/**
 * Keeps the signed-in user "online" and their coordinates fresh.
 * Coordinates are written through the update_my_location RPC and are never
 * exposed to other users — only a computed distance is.
 */
export function usePresence(enabled: boolean) {
  const { user } = useAuth();
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const lastSent = useRef(0);

  useEffect(() => {
    if (!enabled || !user) return;
    let cancelled = false;

    const beat = () => {
      supabase.rpc("heartbeat", { _online: true });
    };
    beat();
    const hb = window.setInterval(beat, 45_000);

    const onHide = () => {
      if (document.visibilityState === "hidden") supabase.rpc("heartbeat", { _online: false });
      else beat();
    };
    document.addEventListener("visibilitychange", onHide);

    let watchId: number | undefined;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo({ status: "unsupported", message: "Geolocation is not supported by this browser." });
    } else {
      setGeo({ status: "requesting" });
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (cancelled) return;
          setGeo({
            status: "granted",
            accuracy: Math.round(pos.coords.accuracy),
            updatedAt: Date.now(),
          });
          const now = Date.now();
          if (now - lastSent.current < 20_000) return;
          lastSent.current = now;
          supabase.rpc("update_my_location", {
            _lat: pos.coords.latitude,
            _lng: pos.coords.longitude,
          });
        },
        (err) => {
          if (cancelled) return;
          setGeo({
            status: err.code === err.PERMISSION_DENIED ? "denied" : "error",
            message:
              err.code === err.PERMISSION_DENIED
                ? "Location permission denied. Enable it to discover people nearby."
                : "Could not determine your location. Check your device settings.",
          });
        },
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
      );
    }

    return () => {
      cancelled = true;
      window.clearInterval(hb);
      document.removeEventListener("visibilitychange", onHide);
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      supabase.rpc("heartbeat", { _online: false });
    };
  }, [enabled, user]);

  return geo;
}
