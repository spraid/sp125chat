import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePresence } from "@/hooks/usePresence";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { initials, timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/chats")({
  head: () => ({
    meta: [
      { title: "Your conversations | Nearby Chat" },
      { name: "description", content: "All your private conversations with people you met nearby." },
      { property: "og:title", content: "Your conversations | Nearby Chat" },
      { property: "og:description", content: "All your private conversations with people you met nearby." },
    ],
  }),
  component: ChatsPage,
});

type Row = {
  id: string;
  updated_at: string;
  other: { id: string; full_name: string | null; avatar_url: string | null; online: boolean } | null;
  preview: string;
  unread: number;
};

function ChatsPage() {
  usePresence(true);
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: memberships } = await supabase
      .from("conversation_members")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id);
    const ids = (memberships ?? []).map((m) => m.conversation_id);
    if (ids.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    const readMap = new Map((memberships ?? []).map((m) => [m.conversation_id, m.last_read_at]));

    const [{ data: convos }, { data: others }, { data: messages }] = await Promise.all([
      supabase.from("conversations").select("id, updated_at").in("id", ids),
      supabase
        .from("conversation_members")
        .select("conversation_id, user_id")
        .in("conversation_id", ids)
        .neq("user_id", user.id),
      supabase
        .from("messages")
        .select("conversation_id, content, created_at, sender_id")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false }),
    ]);

    const otherIds = Array.from(new Set((others ?? []).map((o) => o.user_id)));
    const { data: profiles } = otherIds.length
      ? await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, online, last_seen")
          .in("id", otherIds)
      : { data: [] as any[] };
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const otherMap = new Map((others ?? []).map((o) => [o.conversation_id, o.user_id]));

    const built: Row[] = (convos ?? [])
      .map((c) => {
        const msgs = (messages ?? []).filter((m) => m.conversation_id === c.id);
        const last = msgs[0];
        const lastRead = readMap.get(c.id);
        const otherId = otherMap.get(c.id);
        const prof = otherId ? profileMap.get(otherId) : null;
        return {
          id: c.id,
          updated_at: last?.created_at ?? c.updated_at,
          other: prof
            ? {
                id: prof.id,
                full_name: prof.full_name,
                avatar_url: prof.avatar_url,
                online:
                  Boolean(prof.online) &&
                  new Date(prof.last_seen).getTime() > Date.now() - 2 * 60 * 1000,
              }
            : null,
          preview: last?.content ?? "No messages yet",
          unread: msgs.filter(
            (m) =>
              m.sender_id !== user.id &&
              lastRead &&
              new Date(m.created_at).getTime() > new Date(lastRead).getTime(),
          ).length,
        };
      })
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    setRows(built);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("chats-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return (
    <AppShell>
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">Conversations</h1>
      {loading ? (
        <div className="flex items-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <MessageCircle className="size-8 text-muted-foreground" />
          <p className="font-medium">No conversations yet</p>
          <p className="text-sm text-muted-foreground">
            Find someone on the{" "}
            <Link to="/nearby" className="text-primary underline underline-offset-4">
              Nearby
            </Link>{" "}
            page and send a chat request.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to="/chats/$id" params={{ id: r.id }}>
                <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-accent">
                  <div className="relative">
                    <Avatar className="size-11">
                      <AvatarImage src={r.other?.avatar_url ?? undefined} alt="" />
                      <AvatarFallback>{initials(r.other?.full_name)}</AvatarFallback>
                    </Avatar>
                    {r.other?.online && (
                      <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card bg-emerald-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.other?.full_name ?? "Someone"}</p>
                    <p className="truncate text-sm text-muted-foreground">{r.preview}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">{timeAgo(r.updated_at)}</span>
                    {r.unread > 0 && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                        {r.unread}
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
