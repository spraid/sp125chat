import { createFileRoute, Link } from "@tanstack/react-router";
import { Radar, MessageCircle, MapPin, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nearby Chat — meet people within 1 km" },
      { name: "description", content: "Discover and chat with people nearby in real time. Private, secure, and location-based." },
      { property: "og:title", content: "Nearby Chat — meet people within 1 km" },
      { property: "og:description", content: "Discover and chat with people nearby in real time. Private, secure, and location-based." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Radar className="size-4" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">Nearby Chat</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/auth">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 py-20 text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-6xl">
            Meet people within <span className="text-primary">1 km</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            A real-time, privacy-first chat app that connects you with nearby people. Your exact
            location is never shared.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/auth">Start chatting</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/privacy">Privacy</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-12">
          <div className="grid gap-4 sm:grid-cols-3">
            <Feature
              icon={MapPin}
              title="Nearby only"
              desc="Discover people who are actually close to you, filtered by a 1 km radius."
            />
            <Feature
              icon={MessageCircle}
              title="Realtime chat"
              desc="Send and receive messages instantly with secure, private conversations."
            />
            <Feature
              icon={Shield}
              title="Privacy first"
              desc="Your exact coordinates stay hidden. Only approximate distance is shown."
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        <Link to="/privacy" className="hover:underline">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link to="/terms" className="hover:underline">
          Terms
        </Link>
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: { icon: typeof MapPin; title: string; desc: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <Icon className="mb-3 size-6 text-primary" />
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      </CardContent>
    </Card>
  );
}
