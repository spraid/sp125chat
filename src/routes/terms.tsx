import { createFileRoute, Link } from "@tanstack/react-router";
import { Radar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions | Nearby Chat" },
      { name: "description", content: "Terms and conditions for Nearby Chat." },
      { property: "og:title", content: "Terms & Conditions | Nearby Chat" },
      { property: "og:description", content: "Terms and conditions for Nearby Chat." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
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
            <CardTitle>Terms & Conditions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              By using Nearby Chat, you agree to use the platform respectfully. Harassment, spam,
              and inappropriate content are not allowed and may result in account suspension.
            </p>
            <p>
              We provide the service as-is and reserve the right to suspend or terminate accounts
              that violate these terms.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
