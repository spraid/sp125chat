import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { initials } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin | Nearby Chat" },
      { name: "description", content: "Admin moderation dashboard." },
      { property: "og:title", content: "Admin | Nearby Chat" },
      { property: "og:description", content: "Admin moderation dashboard." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: data.user.id,
      _role: "admin",
    });
    if (!isAdmin) throw redirect({ to: "/nearby" });
  },
  component: AdminPage,
});

function AdminPage() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: u }, { data: r }] = await Promise.all([
      supabase.rpc("admin_stats"),
      supabase.rpc("admin_list_users", { _limit: 100 }),
      supabase
        .from("reports")
        .select("id, reason, status, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setStats((s as Record<string, number>) ?? null);
    setUsers((u ?? []) as any[]);
    setReports((r ?? []) as any[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleSuspend = async (id: string, suspended: boolean) => {
    const { error } = await supabase.rpc("admin_set_suspended", {
      _user: id,
      _suspended: !suspended,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(suspended ? "User unsuspended" : "User suspended");
    load();
  };

  if (loading)
    return (
      <AppShell>
        <div className="py-20 text-center text-muted-foreground">Loading…</div>
      </AppShell>
    );

  return (
    <AppShell>
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">Admin dashboard</h1>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={stats?.total_users ?? 0} />
        <StatCard label="Online users" value={stats?.online_users ?? 0} />
        <StatCard label="Active requests" value={stats?.active_requests ?? 0} />
        <StatCard label="Active conversations" value={stats?.active_conversations ?? 0} />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reports yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.reason}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.status}</Badge>
                    </TableCell>
                    <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="size-8">
                          <AvatarImage src={u.avatar_url} alt="" />
                          <AvatarFallback>{initials(u.full_name)}</AvatarFallback>
                        </Avatar>
                        {u.full_name}
                      </div>
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      {u.suspended ? (
                        <Badge variant="destructive">Suspended</Badge>
                      ) : u.online ? (
                        <Badge>Online</Badge>
                      ) : (
                        "Offline"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={u.suspended ? "outline" : "destructive"}
                        onClick={() => toggleSuspend(u.id, u.suspended)}
                      >
                        {u.suspended ? "Unsuspend" : "Suspend"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-3xl font-semibold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
