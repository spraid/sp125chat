import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Radar, Send, Users, ArrowLeft } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials, clockTime } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nearby Chat — talk to everyone on this site" },
      {
        name: "description",
        content: "See everyone who has this site open right now and message them instantly. No sign-up needed.",
      },
      { property: "og:title", content: "Nearby Chat — talk to everyone on this site" },
      {
        property: "og:description",
        content: "See everyone who has this site open right now and message them instantly. No sign-up needed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LobbyPage,
});

type Peer = { id: string; name: string };
type Msg = { id: string; from: string; to: string; text: string; at: number };

const ADJ = ["Swift", "Calm", "Bright", "Bold", "Cosmic", "Quiet", "Lucky", "Sunny", "Wild", "Neon"];
const NOUN = ["Falcon", "Otter", "Comet", "Maple", "Tiger", "Panda", "Nova", "Heron", "Fox", "Koi"];

function randomName() {
  return `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}`;
}

function LobbyPage() {
  const [nameInput, setNameInput] = useState("");
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm p-6">
          <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Radar className="size-5" />
          </span>
          <h1 className="mt-4 font-display text-xl font-semibold tracking-tight">What should we call you?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your name is shown to people nearby. It's required to start chatting.
          </p>
          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const n = nameInput.trim();
              if (!n) return;
              setMe({
                id: Math.random().toString(36).slice(2) + Date.now().toString(36),
                name: n.slice(0, 40),
              });
            }}
          >
            <Input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Your name"
              maxLength={40}
              required
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={!nameInput.trim()}>
              Continue
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return <Lobby me={me} />;
}

function Lobby({ me }: { me: { id: string; name: string } }) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [active, setActive] = useState<Peer | null>(null);
  const [text, setText] = useState("");
  const [ready, setReady] = useState(false);
  const chanRef = useRef<RealtimeChannel | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const channel = supabase.channel("public-lobby", {
      config: { presence: { key: me.id }, broadcast: { self: false } },
    });
    chanRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ id: string; name: string }>();
        const list: Peer[] = [];
        for (const key of Object.keys(state)) {
          const entry = state[key]?.[0];
          if (entry && entry.id !== me.id) list.push({ id: entry.id, name: entry.name });
        }
        setPeers(list.sort((a, b) => a.name.localeCompare(b.name)));
      })
      .on("broadcast", { event: "dm" }, ({ payload }) => {
        const m = payload as Msg;
        if (m.to !== me.id) return;
        setMessages((prev) => [...prev, m]);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ id: me.id, name: me.name });
          setReady(true);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [me]);

  const thread = useMemo(
    () => (active ? messages.filter((m) => m.from === active.id || m.to === active.id) : []),
    [messages, active],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length, active]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !active || !chanRef.current) return;
    const msg: Msg = {
      id: Math.random().toString(36).slice(2),
      from: me.id,
      to: active.id,
      text: body.slice(0, 2000),
      at: Date.now(),
    };
    chanRef.current.send({ type: "broadcast", event: "dm", payload: { ...msg, name: me.name } });
    setMessages((prev) => [...prev, msg]);
    setText("");
  };

  const unread = (id: string) => messages.filter((m) => m.from === id).length;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Radar className="size-4" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">Nearby Chat</span>
          <span className="ml-auto text-sm text-muted-foreground">
            You are <strong className="text-foreground">{me.name}</strong>
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        {!active ? (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight">People here right now</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Everyone with this site open appears below. Tap someone to start chatting.
            </p>

            {!ready ? (
              <p className="py-16 text-center text-muted-foreground">Connecting…</p>
            ) : peers.length === 0 ? (
              <Card className="mt-6 flex flex-col items-center gap-3 p-12 text-center">
                <Users className="size-8 text-muted-foreground" />
                <p className="font-medium">Nobody else is here yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Share the link — as soon as someone opens it, they show up here.
                </p>
              </Card>
            ) : (
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {peers.map((p) => (
                  <li key={p.id}>
                    <Card
                      className="flex cursor-pointer items-center gap-3 p-4 transition hover:bg-muted/50"
                      onClick={() => setActive(p)}
                    >
                      <div className="relative">
                        <Avatar className="size-11">
                          <AvatarFallback>{initials(p.name)}</AvatarFallback>
                        </Avatar>
                        <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card bg-emerald-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">online now</p>
                      </div>
                      {unread(p.id) > 0 && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                          {unread(p.id)}
                        </span>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="flex h-[calc(100vh-9rem)] flex-col">
            <div className="mb-3 flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setActive(null)}>
                <ArrowLeft className="mr-2 size-4" /> Back
              </Button>
              <Avatar className="size-8">
                <AvatarFallback>{initials(active.name)}</AvatarFallback>
              </Avatar>
              <p className="font-medium">{active.name}</p>
            </div>

            <Card className="flex-1 overflow-y-auto p-4">
              {thread.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Say hello — messages are live and disappear when you close the page.
                </p>
              ) : (
                <ul className="space-y-2">
                  {thread.map((m) => (
                    <li key={m.id} className={m.from === me.id ? "text-right" : "text-left"}>
                      <span
                        className={`inline-block max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          m.from === me.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {m.text}
                      </span>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {clockTime(new Date(m.at).toISOString())}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div ref={endRef} />
            </Card>

            <form onSubmit={send} className="mt-3 flex gap-2">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Message ${active.name}…`}
                maxLength={2000}
              />
              <Button type="submit" disabled={!text.trim()}>
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
