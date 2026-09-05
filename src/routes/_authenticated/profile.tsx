import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { initials } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your profile | Nearby Chat" },
      { name: "description", content: "View and edit your Nearby Chat profile." },
      { property: "og:title", content: "Your profile | Nearby Chat" },
      { property: "og:description", content: "View and edit your Nearby Chat profile." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        if (data) {
          setFullName(data.full_name ?? "");
          setAvatar(data.avatar_url);
        }
        setLoading(false);
      });
  }, [user]);

  const upload = async (file: File) => {
    if (!user) return;
    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error: upError } = await supabase.storage.from("avatars").upload(path, file, {
      upsert: true,
    });
    if (upError) {
      toast.error(upError.message);
      return;
    }
    const { data: url } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = url.publicUrl;
    setAvatar(avatarUrl);
    const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
    if (error) toast.error(error.message);
    else toast.success("Photo updated");
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Profile saved");
  };

  const changePassword = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(user?.email ?? "", {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset link sent");
  };

  if (loading)
    return (
      <AppShell>
        <div className="py-20 text-center">
          <Loader2 className="inline size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );

  return (
    <AppShell>
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">Your profile</h1>
      <Card>
        <CardHeader>
          <CardTitle>Public profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="size-20">
                <AvatarImage src={avatar ?? undefined} alt="" />
                <AvatarFallback className="text-2xl">{initials(fullName)}</AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 rounded-full bg-primary p-1.5 text-primary-foreground shadow-sm"
              >
                <Camera className="size-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              />
            </div>
            <div>
              <p className="font-medium">{fullName || "Your name"}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
            <Button variant="outline" onClick={changePassword}>
              Change password
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
