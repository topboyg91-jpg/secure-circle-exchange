import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteLayout, Panel } from "@/components/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: Auth,
});

function Auth() {
  const nav = useNavigate();
  const [email, setEmail] = useState("topboyg91@gmail.com");
  const [password, setPassword] = useState("zuwep123");
  const [loading, setLoading] = useState(false);

  // If already signed in, jump straight to /admin.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) nav({ to: "/admin" });
    });
  }, [nav]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      nav({ to: "/admin" });
    } catch (err: any) {
      toast.error(err.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SiteLayout banner={<>One-click admin access — credentials are pre-filled.</>}>
      <Panel className="mx-auto max-w-md">
        <h1 className="text-center text-2xl font-semibold">Enter Admin Panel</h1>
        <form onSubmit={login} className="mt-6 space-y-4">
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md bg-accent text-accent-foreground px-3 py-2" />
          <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md bg-accent text-accent-foreground px-3 py-2" />
          <button disabled={loading} className="w-full rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50">
            {loading ? "Entering..." : "Enter Admin Panel"}
          </button>
        </form>
      </Panel>
    </SiteLayout>
  );
}