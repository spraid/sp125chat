import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MapPin, RefreshCw, Send, Radar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePresence } from "@/hooks/usePresence";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { formatDistance, initials, timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/nearby")({
  head: () => ({
    meta: [
      { title: "People nearby | Nearby Chat" },
      { name: "description", content: "See who is online within one kilometre of you and send a chat request." },
      { property: "og:title", content: "People nearby | Nearby Chat" },
      { property: "og:description", content: "See who is online within one kilometre of you and send a chat request." },
    ],
  }),
  component: NearbyPage,
});

type NearbyUser = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  distance_meters: number | null;
  online: boolean | null;
  last_seen: string | null;
};

function NearbyPage() {
  const geo = usePresence(true);
  const [people, setPeople] = useState<NearbyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_nearby_users");
    if (error) {
      toast.error(error.message);
    } else {
      setPeople((data ?? []) as NearbyUser[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 20_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (geo.status === "granted") load();
  }, [geo.status, geo.updatedAt, load]);

  const sendRequest = async (target: NearbyUser) => {
    setSending(target.id);
    const { error } = await supabase.rpc("send_chat_request", { _receiver: target.id });
    setSending(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent((s) => ({ ...s, [target.id]: true }));
    toast.success(`Chat request sent to ${target.full_name ?? "them"}`);
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">People nearby</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Online users within 1 km. Your exact coordinates are never shared — only distance.
        </p>
      </div>

      <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <MapPin className="size-5 shrink-0 text-primary" />
        <div className="flex-1 text-sm">
          {geo.status === "granted" && (
            <span className="text-muted-foreground">
              Location active{geo.accuracy ? ` · accurate to ~${geo.accuracy} m` : ""}
            </span>
          )}
          {geo.status === "requesting" && <span className="text-muted-foreground">Getting your location…</span>}
          {(geo.status === "denied" || geo.status === "error" || geo.status === "unsupported") && (
            <span className="text-destructive">{geo.message}</span>
          )}
          {geo.status === "idle" && <span className="text-muted-foreground">Starting location services…</span>}
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-2 size-4" /> Refresh
        </Button>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Scanning your area…
        </div>
      ) : people.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Radar className="size-8 text-muted-foreground" />
          <p className="font-medium">Nobody nearby right now</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            People appear here when they are online, have location enabled, and are within 1 km of you.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {people.map((p) => (
            <li key={p.id}>
              <Card className="flex items-center gap-3 p-4">
                <div className="relative">
                  <Avatar className="size-12">
                    <AvatarImage src={p.avatar_url ?? undefined} alt="" />
                    <AvatarFallback>{initials(p.full_name)}</AvatarFallback>
                  </Avatar>
                  {p.online && (
                    <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card bg-emerald-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.full_name ?? "Someone"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistance(p.distance_meters ?? 0)} ·{" "}
                    {p.online ? "online now" : `seen ${timeAgo(p.last_seen)}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={sending === p.id || sent[p.id]}
                  onClick={() => sendRequest(p)}
                >
                  {sending === p.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="mr-2 size-4" />
                      {sent[p.id] ? "Sent" : "Chat"}
                    </>
                  )}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
