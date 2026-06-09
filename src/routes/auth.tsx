import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SiteLayout, Panel } from "@/components/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Admin Login — Fair Trade" }, { name: "description", content: "Admin login for the Fair Trade panel." }] }),
  component: Auth,
});

function Auth() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const fn = mode === "login" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
      const { error } = await fn({ email, password, options: { emailRedirectTo: window.location.origin + "/admin" } } as any);
      if (error) throw error;
      if (mode === "signup") toast.success("Account created. You may need to confirm via email.");
      nav({ to: "/admin" });
    } catch (err: any) {
      toast.error(err.message ?? "Auth failed");
    } finally { setLoading(false); }
  }

  return (
    <SiteLayout>
      <Panel className="mx-auto max-w-md">
        <h1 className="text-center text-2xl font-semibold">Admin {mode === "login" ? "Login" : "Sign Up"}</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input required type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md bg-accent text-accent-foreground px-3 py-2" />
          <input required type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md bg-accent text-accent-foreground px-3 py-2" />
          <button disabled={loading} className="w-full rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50">
            {loading ? "..." : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
        <button onClick={() => setMode(mode === "login" ? "signup" : "login")} className="mt-4 w-full text-sm text-muted-foreground hover:text-primary">
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
        </button>
      </Panel>
    </SiteLayout>
  );
}