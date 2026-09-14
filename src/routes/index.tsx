import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  ArrowLeft,
  ImagePlus,
  MapPin,
  Smile,
  Mail,
  LogOut,
  Siren,
  HeartHandshake,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials, clockTime, timeAgo } from "@/lib/format";
import catAsset from "@/assets/cat.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cat Chat — chat and get help within 1 km" },
      {
        name: "description",
        content:
          "See people using this site within 1 km of you, message them with photos, emojis and your location, and raise an emergency help request nearby.",
      },
      { property: "og:title", content: "Cat Chat — chat and get help within 1 km" },
      {
        property: "og:description",
        content:
          "See people using this site within 1 km of you, message them with photos, emojis and your location, and raise an emergency help request nearby.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LobbyPage,
});

type Peer = { id: string; name: string; distance_meters: number };
type Msg = {
  id: string;
  from_id: string;
  to_id: string;
  kind: string;
  body: string;
  created_at: string;
};
type Emergency = {
  id: string;
  name: string;
  kind: string;
  blood_group: string | null;
  hospital: string | null;
  urgency: string | null;
  distance_meters: number;
  created_at: string;
  helper_count: number;
  mine: boolean;
  i_helped: boolean;
};

const NAME_KEY = "cat-chat-name";
const ID_KEY = "cat-chat-id";
const PEERS_KEY = "cat-chat-peer-names";
const EMOJIS = "😀 😂 🥰 😍 😎 🤩 😉 🙃 🤔 😴 😭 😡 👍 👎 🙏 👏 🔥 💯 ✨ 🎉 ❤️ 💙 💛 🐱 🐾 🍕 ☕ 🌸 🌙 ⚽".split(
  " ",
);

const EMERGENCY_KINDS = [
  { key: "accident", label: "🚨 Accident Emergency" },
  { key: "ambulance", label: "🚑 Ambulance Required" },
  { key: "blood", label: "🩸 Blood Required" },
  { key: "medical", label: "👨‍⚕️ Medical Help" },
  { key: "vehicle", label: "🚗 Vehicle Required" },
  { key: "general", label: "🆘 General Emergency" },
];
const kindLabel = (k: string) => EMERGENCY_KINDS.find((e) => e.key === k)?.label ?? "🆘 Emergency";

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

function readPeerNames(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PEERS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function Lobby({ me, onSignOut }: { me: { id: string; name: string }; onSignOut: () => void }) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [active, setActive] = useState<{ id: string; name: string } | null>(null);
  const [text, setText] = useState("");
  const [locError, setLocError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [showEmergency, setShowEmergency] = useState(false);
  const [bloodForm, setBloodForm] = useState<{ group: string; hospital: string; urgency: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setNames(readPeerNames()), []);

  const rememberNames = useCallback((list: Peer[]) => {
    if (list.length === 0) return;
    setNames((prev) => {
      const next = { ...prev };
      for (const p of list) next[p.id] = p.name;
      try {
        localStorage.setItem(PEERS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const loadPeers = useCallback(async () => {
    const { data } = await supabase.rpc("guests_nearby", { _id: me.id });
    if (data) {
      setPeers(data as Peer[]);
      rememberNames(data as Peer[]);
    }
  }, [me.id, rememberNames]);

  const loadEmergencies = useCallback(async () => {
    const { data } = await supabase.rpc("emergencies_nearby", { _id: me.id });
    if (data) setEmergencies(data as Emergency[]);
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
            void loadEmergencies();
          });
      },
      () => setLocError("Please allow location access so we can show people within 1 km of you."),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );

    const beat = setInterval(() => {
      if (lat === null || lng === null) return;
      void supabase.rpc("guest_ping", { _id: me.id, _name: me.name, _lat: lat, _lng: lng });
      void loadPeers();
      void loadEmergencies();
    }, 20000);

    return () => {
      navigator.geolocation.clearWatch(watch);
      clearInterval(beat);
    };
  }, [me, loadPeers, loadEmergencies]);

  // Messages
  useEffect(() => {
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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me.id]);

  const thread = useMemo(
    () => (active ? messages.filter((m) => m.from_id === active.id || m.to_id === active.id) : []),
    [messages, active],
  );

  // Recent chats: everyone we have messaged, even if no longer nearby
  const recent = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of messages) {
      const other = m.from_id === me.id ? m.to_id : m.from_id;
      map.set(other, m.created_at);
    }
    const nearbyIds = new Set(peers.map((p) => p.id));
    return [...map.entries()]
      .filter(([id]) => !nearbyIds.has(id))
      .sort((a, b) => b[1].localeCompare(a[1]))
      .map(([id, at]) => ({ id, name: names[id] ?? "Someone nearby", at }));
  }, [messages, peers, names, me.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length, active]);

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

  const raise = async (kind: string, extra?: { group: string; hospital: string; urgency: string }) => {
    setBusy("Sending your emergency alert…");
    const { error } = await supabase.rpc("create_emergency", {
      _id: me.id,
      _name: me.name,
      _kind: kind,
      _blood_group: extra?.group ?? null,
      _hospital: extra?.hospital ?? null,
      _urgency: extra?.urgency ?? null,
    });
    setShowEmergency(false);
    setBloodForm(null);
    if (error) {
      setBusy("Could not send the alert — please allow location first");
      setTimeout(() => setBusy(null), 3000);
      return;
    }
    setBusy(null);
    void loadEmergencies();
  };

  const help = async (id: string) => {
    await supabase.rpc("offer_help", { _emergency: id, _id: me.id, _name: me.name });
    void loadEmergencies();
  };

  const closeEmergency = async (id: string) => {
    await supabase.rpc("close_emergency", { _emergency: id, _id: me.id });
    void loadEmergencies();
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
            <Button
              variant="destructive"
              className="w-full py-6 text-base"
              onClick={() => {
                setShowEmergency((s) => !s);
                setBloodForm(null);
              }}
            >
              <Siren className="mr-2 size-5" /> Emergency Help
            </Button>

            {showEmergency && (
              <Card className="mt-3 p-4">
                {!bloodForm ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Pick what you need — everyone within 1 km will see it right away.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {EMERGENCY_KINDS.map((k) => (
                        <Button
                          key={k.key}
                          variant="secondary"
                          className="justify-start"
                          onClick={() =>
                            k.key === "blood"
                              ? setBloodForm({ group: "", hospital: "", urgency: "Urgent" })
                              : void raise(k.key)
                          }
                        >
                          {k.label}
                        </Button>
                      ))}
                    </div>
                  </>
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!bloodForm.group.trim() || !bloodForm.hospital.trim()) return;
                      void raise("blood", bloodForm);
                    }}
                  >
                    <p className="font-display text-lg tracking-tight">🩸 Blood Required</p>
                    <Input
                      value={bloodForm.group}
                      onChange={(e) => setBloodForm({ ...bloodForm, group: e.target.value.slice(0, 10) })}
                      placeholder="Blood group (e.g. O+)"
                      required
                    />
                    <Input
                      value={bloodForm.hospital}
                      onChange={(e) => setBloodForm({ ...bloodForm, hospital: e.target.value.slice(0, 80) })}
                      placeholder="Hospital name"
                      required
                    />
                    <div className="flex gap-2">
                      {["Urgent", "Required today"].map((u) => (
                        <Button
                          key={u}
                          type="button"
                          variant={bloodForm.urgency === u ? "default" : "secondary"}
                          size="sm"
                          onClick={() => setBloodForm({ ...bloodForm, urgency: u })}
                        >
                          {u}
                        </Button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" variant="destructive">
                        Send alert
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setBloodForm(null)}>
                        Back
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            )}

            {emergencies.length > 0 && (
              <section className="mt-6">
                <h2 className="font-display text-xl tracking-tight">Emergency alerts near you</h2>
                <ul className="mt-3 space-y-2">
                  {emergencies.map((e) => (
                    <li key={e.id}>
                      <Card className="border-destructive/40 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{kindLabel(e.kind)}</span>
                          <span className="text-xs text-muted-foreground">
                            {e.mine ? "You" : e.name} · {distanceLabel(e.distance_meters)} · {timeAgo(e.created_at)}
                          </span>
                        </div>
                        {e.kind === "blood" && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            Blood group {e.blood_group} · {e.hospital} · {e.urgency}
                          </p>
                        )}
                        <div className="mt-3 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {e.helper_count} {e.helper_count === 1 ? "person is" : "people are"} responding
                          </span>
                          <div className="ml-auto flex gap-2">
                            {e.mine ? (
                              <Button size="sm" variant="ghost" onClick={() => closeEmergency(e.id)}>
                                <X className="mr-1 size-4" /> Close
                              </Button>
                            ) : (
                              <Button size="sm" disabled={e.i_helped} onClick={() => help(e.id)}>
                                <HeartHandshake className="mr-1 size-4" />
                                {e.i_helped ? "You are helping" : "I Can Help"}
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <h1 className="mt-8 font-display text-3xl tracking-tight">People within 1 km</h1>
            <p className="mt-1 text-sm text-muted-foreground">Tap chat to start messaging straight away.</p>

            {locError ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{locError}</p>
            ) : !ready ? (
              <p className="py-16 text-center text-muted-foreground">Finding people near you…</p>
            ) : peers.length === 0 ? null : (
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {peers.map((p) => (
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
                      <Button size="sm" onClick={() => setActive({ id: p.id, name: p.name })}>
                        Chat
                        {unread(p.id) > 0 && (
                          <span className="ml-2 rounded-full bg-primary-foreground/20 px-1.5 text-xs">
                            {unread(p.id)}
                          </span>
                        )}
                      </Button>
                    </Card>
                  </li>
                ))}
              </ul>
            )}

            {recent.length > 0 && (
              <section className="mt-10">
                <h2 className="font-display text-xl tracking-tight">Recent chats</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  These stay here even when you are no longer near each other.
                </p>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {recent.map((r) => (
                    <li key={r.id}>
                      <Card className="flex items-center gap-3 p-4">
                        <Avatar className="size-11">
                          <AvatarFallback>{initials(r.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{r.name}</p>
                          <p className="text-xs text-muted-foreground">{timeAgo(r.at)}</p>
                        </div>
                        <Button size="sm" variant="secondary" onClick={() => setActive({ id: r.id, name: r.name })}>
                          Open
                        </Button>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
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

        {!active && busy && <p className="mt-3 text-center text-xs text-muted-foreground">{busy}</p>}
      </main>
    </div>
  );
}
