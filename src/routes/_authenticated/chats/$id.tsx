import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Send, Ban, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePresence } from "@/hooks/usePresence";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { initials, clockTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/chats/$id")({
  head: () => ({
    meta: [
      { title: "Chat | Nearby Chat" },
      { name: "description", content: "Private conversation on Nearby Chat." },
      { property: "og:title", content: "Chat | Nearby Chat" },
      { property: "og:description", content: "Private conversation on Nearby Chat." },
    ],
  }),
  component: ChatPage,
});

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
};

function ChatPage() {
  const { id } = Route.useParams();
  usePresence(true);
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<{
    id: string;
    full_name: string;
    avatar_url: string | null;
    online: boolean;
  } | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const markRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", id)
      .neq("sender_id", user.id)
      .is("read_at", null);
  }, [id, user]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: membership } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("conversation_id", id)
      .eq("user_id", user.id)
      .single();
    if (!membership) {
      toast.error("You don't have access to this conversation");
      setLoading(false);
      return;
    }
    const [{ data: msgs }, { data: members }] = await Promise.all([
      supabase.from("messages").select("*").eq("conversation_id", id).order("created_at", {
        ascending: true,
      }),
      supabase.from("conversation_members").select("user_id").eq("conversation_id", id),
    ]);
    const otherId = (members ?? []).find((m) => m.user_id !== user.id)?.user_id;
    if (otherId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, online, last_seen")
        .eq("id", otherId)
        .single();
      setOther(
        prof
          ? {
              ...prof,
              online:
                prof.online &&
                new Date(prof.last_seen).getTime() > Date.now() - 2 * 60 * 1000,
            }
          : null,
      );
    }
    setMessages((msgs ?? []) as Message[]);
    setLoading(false);
    markRead();
  }, [id, user, markRead]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`chat-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const next = payload.new as Message;
          setMessages((prev) => [...prev, next]);
          if (user && next.sender_id !== user.id) markRead();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load, user, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user) return;
    const { error } = await supabase.from("messages").insert({
      conversation_id: id,
      sender_id: user.id,
      content: input.trim(),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setInput("");
  };

  const block = async () => {
    if (!other) return;
    const { error } = await supabase.rpc("block_user", { _target: other.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("User blocked");
  };

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/chats">
            <ArrowLeft className="mr-1 size-4" /> Back
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Avatar className="size-9">
            <AvatarImage src={other?.avatar_url ?? undefined} alt="" />
            <AvatarFallback>{initials(other?.full_name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{other?.full_name ?? "Chat"}</p>
            <p className="text-xs text-muted-foreground">
              {other?.online ? "Online" : "Offline"}
            </p>
          </div>
        </div>
        <div className="ml-auto flex gap-1">
          {other && (
            <>
              <Button variant="ghost" size="icon" onClick={block} aria-label="Block">
                <Ban className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" asChild aria-label="Report">
                <Link to="/report" search={{ userId: other.id }}>
                  <Flag className="size-4" />
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="flex h-[calc(100vh-260px)] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.sender_id === user?.id ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                    m.sender_id === user?.id
                      ? "rounded-br-none bg-primary text-primary-foreground"
                      : "rounded-bl-none bg-muted"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  <p className="mt-1 text-[10px] opacity-70">
                    {clockTime(m.created_at)}
                    {m.sender_id === user?.id && m.read_at ? " · Read" : ""}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!input.trim()}>
            <Send className="size-4" />
          </Button>
        </form>
      </Card>
    </AppShell>
  );
}
