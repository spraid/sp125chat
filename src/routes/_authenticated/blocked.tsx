import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/blocked")({
  head: () => ({
    meta: [
      { title: "Blocked users | Nearby Chat" },
      { name: "description", content: "Manage users you have blocked." },
      { property: "og:title", content: "Blocked users | Nearby Chat" },
      { property: "og:description", content: "Manage users you have blocked." },
    ],
  }),
  component: BlockedPage,
});

function BlockedPage() {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("blocks")
      .select("id, blocked:profiles!blocked_id(id, full_name, avatar_url)")
      .eq("blocker_id", user.id);
    setBlocks((data ?? []) as any[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user]);

  const unblock = async (id: string) => {
    const { error } = await supabase.from("blocks").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Unblocked");
    load();
  };

  return (
    <AppShell>
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">Blocked users</h1>
      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : blocks.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          You haven't blocked anyone.
        </Card>
      ) : (
        <ul className="space-y-3">
          {blocks.map((b: any) => (
            <li key={b.id}>
              <Card className="flex items-center gap-3 p-4">
                <Avatar className="size-10">
                  <AvatarImage src={b.blocked?.avatar_url} alt="" />
                  <AvatarFallback>{initials(b.blocked?.full_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{b.blocked?.full_name ?? "Someone"}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => unblock(b.id)}>
                  Unblock
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
