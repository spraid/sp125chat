import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, ArrowLeft, ImagePlus, MapPin, Smile, Mail, Phone, LogOut, Check, X } from "lucide-react";
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
      { title: "Cat Chat — chat with people within 1 km" },
      {
        name: "description",
        content:
          "See people using this site within 1 km of you, send a chat request and message them with photos, emojis and your location.",
      },
      { property: "og:title", content: "Cat Chat — chat with people within 1 km" },
      {
        property: "og:description",
        content:
          "See people using this site within 1 km of you, send a chat request and message them with photos, emojis and your location.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LobbyPage,
});

type Peer = { id: string; name: string; distance_meters: number };
type Req = { id: string; from_id: string; to_id: string; status: string };
type Msg = {
  id: string;
  from_id: string;
  to_id: string;
  kind: string;
  body: string;
  created_at: string;
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
              Your name is shown to people near you. We remember it on this device.
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
  const [reqs, setReqs] = useState<Req[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [active, setActive] = useState<Peer | null>(null);
  const [text, setText] = useState("");
  const [locError, setLocError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadReqs = useCallback(async () => {
    const { data } = await supabase
      .from("chat_reqs")
      .select("id, from_id, to_id, status")
      .or(`from_id.eq.${me.id},to_id.eq.${me.id}`);
    if (data) setReqs(data as Req[]);
  }, [me.id]);

  const loadPeers = useCallback(async () => {
    const { data } = await supabase.rpc("guests_nearby", { _id: me.id });
    if (data) setPeers(data as Peer[]);
  }, [me.id]);

  // Location + presence heartbeat
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocError("This device cannot share its location, so nobody nearby can be found.");
      return;
    }
    let lat: number | null = null;
    let lng: number | null = null;

    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        setLocError(null);
        void supabase
          .rpc("guest_ping", { _id: me.id, _name: me.name, _lat: lat, _lng: lng })
          .then(() => {
            setReady(true);
            void loadPeers();
          });
      },
      () => setLocError("Please allow location access so we can show people within 1 km of you."),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );

    const beat = setInterval(() => {
      if (lat === null || lng === null) return;
      void supabase.rpc("guest_ping", { _id: me.id, _name: me.name, _lat: lat, _lng: lng });
      void loadPeers();
    }, 20000);

    return () => {
      navigator.geolocation.clearWatch(watch);
      clearInterval(beat);
    };
  }, [me, loadPeers]);

  // Messages + requests
  useEffect(() => {
    void loadReqs();
    void supabase
      .from("msgs")
      .select("id, from_id, to_id, kind, body, created_at")
      .or(`from_id.eq.${me.id},to_id.eq.${me.id}`)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setMessages(data as Msg[]);
      });

    const channel = supabase
      .channel("cat-chat-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "msgs" }, ({ new: row }) => {
        const m = row as Msg;
        if (m.from_id !== me.id && m.to_id !== me.id) return;
        setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reqs" }, () => {
        void loadReqs();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me.id, loadReqs]);

  const thread = useMemo(
    () => (active ? messages.filter((m) => m.from_id === active.id || m.to_id === active.id) : []),
    [messages, active],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length, active]);

  const reqWith = useCallback(
    (peerId: string) => reqs.find((r) => (r.from_id === me.id && r.to_id === peerId) || (r.from_id === peerId && r.to_id === me.id)),
    [reqs, me.id],
  );

  const sendRequest = async (peerId: string) => {
    const { error } = await supabase.from("chat_reqs").insert({ from_id: me.id, to_id: peerId, status: "pending" });
    if (error) {
      setBusy("Could not send the request");
      setTimeout(() => setBusy(null), 2500);
      return;
    }
    void loadReqs();
  };

  const respond = async (id: string, status: "accepted" | "rejected") => {
    await supabase.from("chat_reqs").update({ status }).eq("id", id);
    void loadReqs();
  };

  const push = async (kind: Msg["kind"], body: string) => {
    if (!active) return;
    await supabase.from("msgs").insert({ from_id: me.id, to_id: active.id, kind, body });
  };

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    void push("text", body.slice(0, 2000));
    setText("");
    setShowEmoji(false);
  };

  const sendImage = async (file: File) => {
    setBusy("Sending photo…");
    try {
      const dataUrl = await compressImage(file);
      await push("image", dataUrl);
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
        void push("location", `https://www.google.com/maps?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`);
        setBusy(null);
      },
      () => {
        setBusy("Location permission was blocked");
        setTimeout(() => setBusy(null), 2500);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const unread = (id: string) => messages.filter((m) => m.from_id === id).length;
  const distanceLabel = (m: number) => (m < 1000 ? `${m} m away` : "1 km away");

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
            <h1 className="font-display text-3xl tracking-tight">People within 1 km</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Send a chat request — once they accept, you can message each other.
            </p>

            {locError ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{locError}</p>
            ) : !ready ? (
              <p className="py-16 text-center text-muted-foreground">Finding people near you…</p>
            ) : peers.length === 0 ? null : (
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {peers.map((p) => {
                  const r = reqWith(p.id);
                  const accepted = r?.status === "accepted";
                  const incoming = r && r.status === "pending" && r.to_id === me.id;
                  const outgoing = r && r.status === "pending" && r.from_id === me.id;
                  return (
                    <li key={p.id}>
                      <Card className="flex items-center gap-3 p-4">
                        <div className="relative">
                          <Avatar className="size-11">
                            <AvatarFallback>{initials(p.name)}</AvatarFallback>
                          </Avatar>
                          <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card bg-emerald-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{distanceLabel(p.distance_meters)}</p>
                        </div>
                        {accepted ? (
                          <Button size="sm" onClick={() => setActive(p)}>
                            Chat
                            {unread(p.id) > 0 && (
                              <span className="ml-2 rounded-full bg-primary-foreground/20 px-1.5 text-xs">
                                {unread(p.id)}
                              </span>
                            )}
                          </Button>
                        ) : incoming ? (
                          <div className="flex gap-1">
                            <Button size="icon" variant="secondary" title="Accept" onClick={() => respond(r!.id, "accepted")}>
                              <Check className="size-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Decline" onClick={() => respond(r!.id, "rejected")}>
                              <X className="size-4" />
                            </Button>
                          </div>
                        ) : outgoing ? (
                          <span className="text-xs text-muted-foreground">Request sent</span>
                        ) : r?.status === "rejected" ? (
                          <span className="text-xs text-muted-foreground">Declined</span>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => sendRequest(p.id)}>
                            Request
                          </Button>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}

            <Card className="mt-10 border-accent/50 p-5">
              <h2 className="font-display text-xl tracking-tight">Feedback</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Found a problem or have an idea? Reach out any time.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="secondary" size="sm">
                  <a href="mailto:prasanthkumar99963@gmail.com?subject=Cat%20Chat%20feedback">
                    <Mail className="mr-2 size-4" /> prasanthkumar99963@gmail.com
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
                  Say hello — your messages are saved and stay here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {thread.map((m) => (
                    <li key={m.id} className={m.from_id === me.id ? "text-right" : "text-left"}>
                      {m.kind === "image" ? (
                        <img
                          src={m.body}
                          alt="Shared photo"
                          className="inline-block max-h-64 max-w-[80%] rounded-2xl border border-border object-cover"
                        />
                      ) : m.kind === "location" ? (
                        <a
                          href={m.body}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex max-w-[80%] items-center gap-2 rounded-2xl px-3 py-2 text-sm underline ${
                            m.from_id === me.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                          }`}
                        >
                          <MapPin className="size-4 shrink-0" /> Open my location on the map
                        </a>
                      ) : (
                        <span
                          className={`inline-block max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                            m.from_id === me.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                          }`}
                        >
                          {m.body}
                        </span>
                      )}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{clockTime(m.created_at)}</p>
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
