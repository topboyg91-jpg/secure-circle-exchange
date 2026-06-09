import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteLayout, Panel, SandBox } from "@/components/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin Panel — Fair Trade" }, { name: "description", content: "Manage approved crypto deposit addresses." }] }),
  component: Admin,
});

type Addr = { id: string; currency: string; address: string; label: string | null; active: boolean };

function Admin() {
  const [addrs, setAddrs] = useState<Addr[]>([]);
  const [currency, setCurrency] = useState("XMR");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  async function refresh() {
    const { data } = await supabase.from("crypto_addresses").select("*").order("created_at", { ascending: false });
    setAddrs((data ?? []) as Addr[]);
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
      refresh();
    })();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("crypto_addresses").insert({ currency, address, label: label || null, active: false });
    if (error) { toast.error(error.message); return; }
    setAddress(""); setLabel(""); toast.success("Saved — toggle Active to approve."); refresh();
  }

  async function toggle(a: Addr) {
    const { error } = await supabase.from("crypto_addresses").update({ active: !a.active }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    refresh();
  }

  async function remove(a: Addr) {
    if (!confirm("Delete this address?")) return;
    const { error } = await supabase.from("crypto_addresses").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    refresh();
  }

  return (
    <SiteLayout banner={<>Domain panel — addresses become live once you toggle Active.</>}>
      <Panel>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Crypto Addresses</h1>
          <button onClick={() => supabase.auth.signOut().then(() => location.assign("/"))} className="text-sm text-muted-foreground hover:text-primary">Sign out</button>
        </div>

        {isAdmin === false && (
          <SandBox className="mt-4">
            <p className="font-semibold">Your account is not yet an admin.</p>
            <p className="text-sm mt-1">Run this in the database (Cloud → SQL) once, replacing the email:</p>
            <pre className="mt-2 overflow-auto text-xs">{`INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'you@example.com';`}</pre>
          </SandBox>
        )}

        <form onSubmit={add} className="mt-6 grid gap-3 sm:grid-cols-[120px_1fr_200px_auto]">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-md bg-accent text-accent-foreground px-3 py-2">
            <option value="XMR">XMR</option>
            <option value="BTC">BTC</option>
          </select>
          <input required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Deposit address"
            className="rounded-md bg-accent text-accent-foreground px-3 py-2" />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)"
            className="rounded-md bg-accent text-accent-foreground px-3 py-2" />
          <button className="rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground">Add</button>
        </form>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2">Currency</th><th>Address</th><th>Label</th><th>Active</th><th></th>
              </tr>
            </thead>
            <tbody>
              {addrs.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="py-2">{a.currency}</td>
                  <td className="break-all pr-2">{a.address}</td>
                  <td>{a.label}</td>
                  <td>
                    <button onClick={() => toggle(a)} className={`rounded px-2 py-1 text-xs font-semibold ${a.active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {a.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td><button onClick={() => remove(a)} className="text-destructive text-xs hover:underline">Delete</button></td>
                </tr>
              ))}
              {addrs.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No addresses yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </SiteLayout>
  );
}