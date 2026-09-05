import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings | Nearby Chat" },
      { name: "description", content: "Manage your Nearby Chat account." },
      { property: "og:title", content: "Settings | Nearby Chat" },
      { property: "og:description", content: "Manage your Nearby Chat account." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const deleteAccount = async () => {
    if (confirm !== "DELETE") {
      toast.error("Type DELETE to confirm");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("delete_my_account");
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <AppShell>
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">Settings</h1>
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            This permanently removes your profile, messages, and account data. This cannot be
            undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="confirm">Type DELETE to confirm</Label>
            <Input
              id="confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE"
            />
          </div>
          <Button variant="destructive" onClick={deleteAccount} disabled={busy}>
            {busy ? "Deleting…" : "Delete my account"}
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}
