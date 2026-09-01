import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, X, Inbox, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePresence } from "@/hooks/usePresence";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { initials, timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/requests")({
  head: () => ({
    meta: [
      { title: "Chat requests | Nearby Chat" },
      { name: "description", content: "Accept or decline chat requests from people near you." },
      { property: "og:title", content: "Chat requests | Nearby Chat" },
      { property: "og:description", content: "Accept or decline chat requests from people near you." },
    ],
  }),
  component: RequestsPage,
});

type Req = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
  profile?: { full_name: string | null; avatar_url: string | null } | null;
};

function RequestsPage() {
  usePresence(true);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [incoming, setIncoming] = useState<Req[]>([]);
  const [outgoing, setOutgoing] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("chat_requests")
      .select("id, sender_id, receiver_id, status, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const rows = data ?? [];
    const ids = Array.from(
      new Set(rows.map((r) => (r.sender_id === user.id ? r.receiver_id : r.sender_id))),
    );
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids)
      : { data: [] as { id: string; full_name: string | null; avatar_url: string | null }[] };
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    const decorated = rows.map((r) => ({
      ...r,
      profile: map.get(r.sender_id === user.id ? r.receiver_id : r.sender_id) ?? null,
    }));
    setIncoming(decorated.filter((r) => r.receiver_id === user.id && r.status === "pending"));
    setOutgoing(decorated.filter((r) => r.sender_id === user.id));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("requests-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_requests" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const respond = async (req: Req, accept: boolean) => {
    setBusy(req.id);
    const { data, error } = await supabase.rpc("respond_chat_request", {
      _request: req.id,
      _accept: accept,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    await load();
    if (accept && data) navigate({ to: "/chats/$id", params: { id: data as string } });
    else toast.success("Request declined");
  };

  const block = async (req: Req) => {
    setBusy(req.id);
    const { error } = await supabase.rpc("block_user", { _target: req.sender_id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("User blocked");
    load();
  };

  const cancel = async (req: Req) => {
    setBusy(req.id);
    const { error } = await supabase.rpc("cancel_chat_request", { _request: req.id });
    setBusy(null);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <AppShell>
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">Chat requests</h1>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : (
        <Tabs defaultValue="incoming">
          <TabsList>
            <TabsTrigger value="incoming">Incoming ({incoming.length})</TabsTrigger>
            <TabsTrigger value="outgoing">Sent ({outgoing.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="incoming" className="mt-4 space-y-3">
            {incoming.length === 0 && <Empty label="No pending requests." />}
            {incoming.map((r) => (
              <Card key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                <Person profile={r.profile} at={r.created_at} />
                <div className="ml-auto flex gap-2">
                  <Button size="sm" disabled={busy === r.id} onClick={() => respond(r, true)}>
                    <Check className="mr-1 size-4" /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === r.id}
                    onClick={() => respond(r, false)}
                  >
                    <X className="mr-1 size-4" /> Decline
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === r.id}
                    onClick={() => block(r)}
                    aria-label="Block user"
                  >
                    <Ban className="size-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="outgoing" className="mt-4 space-y-3">
            {outgoing.length === 0 && <Empty label="You haven't sent any requests yet." />}
            {outgoing.map((r) => (
              <Card key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                <Person profile={r.profile} at={r.created_at} />
                <div className="ml-auto flex items-center gap-2">
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs capitalize text-muted-foreground">
                    {r.status}
                  </span>
                  {r.status === "pending" && (
                    <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => cancel(r)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}

function Person({
  profile,
  at,
}: {
  profile: { full_name: string | null; avatar_url: string | null } | null | undefined;
  at: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-10">
        <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
        <AvatarFallback>{initials(profile?.full_name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium">{profile?.full_name ?? "Someone"}</p>
        <p className="text-xs text-muted-foreground">{timeAgo(at)}</p>
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
      <Inbox className="size-7" />
      {label}
    </Card>
  );
}
