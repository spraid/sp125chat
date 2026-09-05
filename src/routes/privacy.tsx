import { createFileRoute, Link } from "@tanstack/react-router";
import { Radar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | Nearby Chat" },
      { name: "description", content: "Privacy policy for Nearby Chat." },
      { property: "og:title", content: "Privacy Policy | Nearby Chat" },
      { property: "og:description", content: "Privacy policy for Nearby Chat." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <Link to="/" className="mb-8 flex items-center justify-center gap-2">
        <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Radar className="size-5" />
        </span>
        <span className="font-display text-2xl font-semibold tracking-tight">Nearby Chat</span>
      </Link>
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Privacy Policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              We value your privacy. This application uses your location only to find people within
              1 km of you. Your exact coordinates are never shared with other users — only an
              approximate distance is shown.
            </p>
            <p>
              We store your email, name, profile photo, and location data securely. You can delete
              your account at any time from Settings.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
