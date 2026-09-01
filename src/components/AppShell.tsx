import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Radar, MessageCircle, Inbox, User, Settings, Shield, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/nearby", label: "Nearby", icon: Radar },
  { to: "/requests", label: "Requests", icon: Inbox },
  { to: "/chats", label: "Chats", icon: MessageCircle },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [isAdmin, setIsAdmin] = useState(false);
  const [pending, setPending] = useState(0);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const load = async () => {
      const [{ count: reqCount }, { data: notes }] = await Promise.all([
        supabase
          .from("chat_requests")
          .select("id", { count: "exact", head: true })
          .eq("receiver_id", user.id)
          .eq("status", "pending"),
        supabase
          .from("notifications")
          .select("id")
          .eq("read", false)
          .eq("type", "message"),
      ]);
      if (!active) return;
      setPending(reqCount ?? 0);
      setUnread(notes?.length ?? 0);
    };
    load();

    supabase
      .rpc("has_role", { _user_id: user.id, _role: "admin" })
      .then(({ data }) => active && setIsAdmin(Boolean(data)));

    const channel = supabase
      .channel("shell-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_requests" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, load)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const items = isAdmin
    ? [...nav, { to: "/admin", label: "Admin", icon: Shield } as const]
    : [...nav];

  const badgeFor = (to: string) =>
    to === "/requests" ? pending : to === "/chats" ? unread : 0;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3">
          <Link to="/nearby" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Radar className="size-4" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">Nearby Chat</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {items.map((item) => {
              const count = badgeFor(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "relative rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    path.startsWith(item.to) && "bg-accent text-foreground",
                  )}
                >
                  {item.label}
                  {count > 0 && (
                    <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <Link
              to="/settings"
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Settings"
            >
              <Settings className="size-4" />
            </Link>
            <button
              onClick={() => signOut()}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6 md:pb-10">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-5xl">
          {items.map((item) => {
            const Icon = item.icon;
            const count = badgeFor(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground",
                  path.startsWith(item.to) && "text-primary",
                )}
              >
                <Icon className="size-5" />
                {item.label}
                {count > 0 && (
                  <span className="absolute right-1/4 top-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
