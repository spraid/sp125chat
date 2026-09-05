import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/report")({
  head: () => ({
    meta: [
      { title: "Report user | Nearby Chat" },
      { name: "description", content: "Report inappropriate behavior on Nearby Chat." },
      { property: "og:title", content: "Report user | Nearby Chat" },
      { property: "og:description", content: "Report inappropriate behavior on Nearby Chat." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    userId: String(search.userId ?? ""),
  }),
  component: ReportPage,
});

const reasons = ["Spam", "Harassment", "Inappropriate content", "Fake profile", "Other"];

function ReportPage() {
  const { userId } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reason, setReason] = useState(reasons[0]);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      reported_user_id: userId,
      reason,
      description: description.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Report submitted");
    navigate({ to: "/chats" });
  };

  return (
    <AppShell>
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">Report user</h1>
      <Card>
        <CardHeader>
          <CardTitle>Submit a report</CardTitle>
          <CardDescription>
            Reports help keep Nearby Chat safe. We'll review this as soon as possible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell us more…"
              />
            </div>
            <Button type="submit" disabled={busy || !userId}>
              {busy ? "Submitting…" : "Submit report"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}
