import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Send, ArrowLeft, ImagePlus, MapPin, Smile, Mail, Phone, LogOut } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials, clockTime } from "@/lib/format";
import catAsset from "@/assets/cat.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cat Chat — talk to everyone on this site" },
      {
        name: "description",
        content:
          "See everyone who has this site open right now and send them messages, photos, emojis and your location instantly.",
      },
      { property: "og:title", content: "Cat Chat — talk to everyone on this site" },
      {
        property: "og:description",
        content:
          "See everyone who has this site open right now and send them messages, photos, emojis and your location instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LobbyPage,
});

type Peer = { id: string; name: string };
type Msg = {
  id: string;
  from: string;
  to: string;
  kind: "text" | "image" | "location";
  text: string;
  at: number;
};

const NAME_KEY = "cat-chat-name";
const ID_KEY = "cat-chat-id";
const EMOJIS = "😀 😂 🥰 😍 😎 🤩 😉 🙃 🤔 😴 😭 😡 👍 👎 🙏 👏 🔥 💯 ✨ 🎉 ❤️ 💙 💛 🐱 🐾 🍕 ☕ 🌸 🌙 ⚽".split(
  " ",
);

function LobbyPage() {
  const [nameInput, setNameInput] = useState("");
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const name = localStorage.getItem(NAME_KEY);
      let id = localStorage.getItem(ID_KEY);
      if (!id) {
        id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(ID_KEY, id);
      }
      if (name) setMe({ id, name });
    } catch {
      /* storage unavailable */
    }
    setLoaded(true);
  }, []);

  const signOut = () => {
    try {
      localStorage.removeItem(NAME_KEY);
    } catch {
      /* ignore */
    }
    setMe(null);
    setNameInput("");
  };

  if (!loaded) return <div className="min-h-screen bg-background" />;

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm overflow-hidden p-0">
          <img src={catAsset.url} alt="Cute kitten welcoming you to the chat" className="h-40 w-full object-cover" />
          <div className="p-6">
            <h1 className="font-display text-2xl tracking-tight">What should we call you?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your name is shown to everyone here. We remember it on this device.
            </p>
            <form
              className="mt-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const n = nameInput.trim().slice(0, 40);
                if (!n) return;
                let id = "";
                try {
                  localStorage.setItem(NAME_KEY, n);
                  id = localStorage.getItem(ID_KEY) ?? "";
                } catch {
                  /* ignore */
                }
                if (!id) id = Math.random().toString(36).slice(2) + Date.now().toString(36);
                setMe({ id, name: n });
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
          </div>
        </Card>
      </div>
    );
  }

  return <Lobby me={me} onSignOut={signOut} />;
}

async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 800;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.55);
}

function Lobby({ me, onSignOut }: { me: { id: string; name: string }; onSignOut: () => void }) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [active, setActive] = useState<Peer | null>(null);
  const [text, setText] = useState("");
  const [ready, setReady] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const chanRef = useRef<RealtimeChannel | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
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

  const push = (kind: Msg["kind"], body: string) => {
    if (!active || !chanRef.current) return;
    const msg: Msg = {
      id: Math.random().toString(36).slice(2),
      from: me.id,
      to: active.id,
      kind,
      text: body,
      at: Date.now(),
    };
    chanRef.current.send({ type: "broadcast", event: "dm", payload: msg });
    setMessages((prev) => [...prev, msg]);
  };

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    push("text", body.slice(0, 2000));
    setText("");
    setShowEmoji(false);
  };

  const sendImage = async (file: File) => {
    setBusy("Sending photo…");
    try {
      const dataUrl = await compressImage(file);
      push("image", dataUrl);
    } catch {
      setBusy("Could not send that photo");
      setTimeout(() => setBusy(null), 2500);
      return;
    }
    setBusy(null);
  };

  const sendLocation = () => {
    if (!navigator.geolocation) {
      setBusy("Location is not available on this device");
      setTimeout(() => setBusy(null), 2500);
      return;
    }
    setBusy("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        push("location", `https://www.google.com/maps?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`);
        setBusy(null);
      },
      () => {
        setBusy("Location permission was blocked");
        setTimeout(() => setBusy(null), 2500);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const unread = (id: string) => messages.filter((m) => m.from === id).length;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-2">
          <img src={catAsset.url} alt="" className="size-8 rounded-lg object-cover" />
          <span className="font-display text-lg tracking-tight">Cat Chat</span>
          <span className="ml-auto hidden text-sm text-muted-foreground sm:inline">
            You are <strong className="text-foreground">{me.name}</strong>
          </span>
          <Button variant="ghost" size="sm" onClick={onSignOut} title="Change name">
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        {!active ? (
          <>
            <h1 className="font-display text-3xl tracking-tight">People here right now</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Everyone with this site open appears below. Tap someone to start chatting.
            </p>

            {!ready ? (
              <p className="py-16 text-center text-muted-foreground">Connecting…</p>
            ) : peers.length === 0 ? null : (
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

            <Card className="mt-10 border-accent/50 p-5">
              <h2 className="font-display text-xl tracking-tight">Feedback</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Found a problem or have an idea? Reach out any time.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="secondary">
                  <a href="mailto:prasanthkumar99963@gmail.com?subject=Cat%20Chat%20feedback">
                    <Mail className="mr-2 size-4" /> prasanthkumar99963@gmail.com
                  </a>
                </Button>
                <Button asChild>
                  <a href="https://wa.me/916300193552" target="_blank" rel="noreferrer">
                    <Phone className="mr-2 size-4" /> WhatsApp 6300193552
                  </a>
                </Button>
              </div>
            </Card>
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
                      {m.kind === "image" ? (
                        <img
                          src={m.text}
                          alt="Shared photo"
                          className="inline-block max-h-64 max-w-[80%] rounded-2xl border border-border object-cover"
                        />
                      ) : m.kind === "location" ? (
                        <a
                          href={m.text}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex max-w-[80%] items-center gap-2 rounded-2xl px-3 py-2 text-sm underline ${
                            m.from === me.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                          }`}
                        >
                          <MapPin className="size-4 shrink-0" /> Open my location on the map
                        </a>
                      ) : (
                        <span
                          className={`inline-block max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                            m.from === me.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                          }`}
                        >
                          {m.text}
                        </span>
                      )}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {clockTime(new Date(m.at).toISOString())}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div ref={endRef} />
            </Card>

            {busy && <p className="mt-2 text-center text-xs text-muted-foreground">{busy}</p>}

            {showEmoji && (
              <div className="mt-2 grid grid-cols-10 gap-1 rounded-xl border border-border bg-card p-2">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="rounded-md py-1 text-xl transition hover:bg-muted"
                    onClick={() => setText((t) => (t + e).slice(0, 2000))}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={send} className="mt-3 flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void sendImage(f);
                  e.target.value = "";
                }}
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => setShowEmoji((s) => !s)} title="Emojis">
                <Smile className="size-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileRef.current?.click()}
                title="Send a photo"
              >
                <ImagePlus className="size-5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={sendLocation} title="Share my location">
                <MapPin className="size-5" />
              </Button>
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
