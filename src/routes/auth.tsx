import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteLayout, Panel } from "@/components/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { ensureAdminSeeded } from "@/lib/admin-seed.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin Login — Fair Trade" }, { name: "description", content: "Admin login for the Fair Trade panel." }] }),
  component: Auth,
});

function Auth() {
  const nav = useNavigate();
  const seed = useServerFn(ensureAdminSeeded);
  const [email, setEmail] = useState("topboyg91@gmail.com");
  const [password, setPassword] = useState("zuwep123");
  const [loading, setLoading] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Seed the admin user once on mount so there is never an SQL/signup step.
  useEffect(() => {
    seed()
      .then(() => setSeeded(true))
      .catch((e) => toast.error(`Seed failed: ${e.message ?? e}`));
  }, [seed]);

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
      if (!seeded) await seed().then(() => setSeeded(true));
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
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {seeded ? "Admin account ready." : "Preparing admin account…"}
        </p>
      </Panel>
    </SiteLayout>
  );
}