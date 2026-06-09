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
type Trade = {
  id: string; trade_code: string; status: string; creator_role: string; payment_method: string;
  name: string; amount: number; amount_usd: number | null; quoted_rate: number | null;
  agreement: string; finalization_hours: number; created_at: string; funded_at: string | null;
  admin_notes: string | null;
  withdrawal_address: string | null; withdrawal_requested_at: string | null;
  withdrawal_approved_at: string | null; withdrawal_tx: string | null;
};

const STATUSES = ["created", "funded", "released", "refunded", "disputed", "cancelled"] as const;

function Admin() {
  const [addrs, setAddrs] = useState<Addr[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [currency, setCurrency] = useState("XMR");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"trades" | "addresses">("trades");

  async function refresh() {
    const [{ data: a }, { data: t }] = await Promise.all([
      supabase.from("crypto_addresses").select("*").order("created_at", { ascending: false }),
      supabase.from("trades").select("*").order("created_at", { ascending: false }),
    ]);
    setAddrs((a ?? []) as Addr[]);
    setTrades((t ?? []) as Trade[]);
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

  async function setStatus(t: Trade, status: string) {
    const patch: any = { status };
    if (status === "funded" && !t.funded_at) patch.funded_at = new Date().toISOString();
    const { error } = await supabase.from("trades").update(patch).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Trade ${t.trade_code} → ${status}`);
    refresh();
  }

  async function approveWithdrawal(t: Trade, tx: string) {
    if (!t.withdrawal_address) { toast.error("No withdrawal address submitted yet"); return; }
    const patch: any = {
      status: "released",
      withdrawal_approved_at: new Date().toISOString(),
      withdrawal_tx: tx || null,
    };
    const { error } = await supabase.from("trades").update(patch).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Withdrawal approved for ${t.trade_code}`);
    refresh();
  }

  async function saveNotes(t: Trade, admin_notes: string) {
    const { error } = await supabase.from("trades").update({ admin_notes }).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Notes saved");
    refresh();
  }

  async function deleteTrade(t: Trade) {
    if (!confirm(`Delete trade ${t.trade_code}?`)) return;
    const { error } = await supabase.from("trades").delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    refresh();
  }

  return (
    <SiteLayout banner={<>Domain panel — addresses become live once you toggle Active.</>}>
      <Panel>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Domain Control Panel</h1>
          <button onClick={() => supabase.auth.signOut().then(() => location.assign("/"))} className="text-sm text-muted-foreground hover:text-primary">Sign out</button>
        </div>

        <div className="mt-4 flex gap-2">
          {(["trades", "addresses"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)}
              className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {k === "trades" ? `Escrow Trades (${trades.length})` : `Crypto Addresses (${addrs.length})`}
            </button>
          ))}
        </div>

        {isAdmin === false && (
          <SandBox className="mt-4">
            <p className="font-semibold">Admin role not yet attached to this session.</p>
            <p className="text-sm mt-1">Sign out and re-enter via the /auth page — the system will seed admin automatically.</p>
          </SandBox>
        )}

        {tab === "addresses" && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold">Approved Deposit Addresses</h2>
            <p className="text-sm text-muted-foreground">Toggle <b>Active</b> to approve an address — only active ones are shown to traders.</p>
            <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr_200px_auto]">
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
          </div>
        )}

        {tab === "trades" && (
          <div className="mt-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Escrow Queue</h2>
              <p className="text-sm text-muted-foreground">Approve funding, release, or refund every trade from here.</p>
            </div>
            {trades.length === 0 && <SandBox>No trades yet.</SandBox>}
            {trades.filter(t => t.withdrawal_requested_at && !t.withdrawal_approved_at).length > 0 && (
              <div className="rounded-md border border-secondary bg-secondary/10 p-3 text-sm">
                <b>Pending withdrawals:</b> {trades.filter(t => t.withdrawal_requested_at && !t.withdrawal_approved_at).length} — scroll to find badges marked <span className="rounded bg-secondary px-1 text-secondary-foreground">WITHDRAW REQUESTED</span>.
              </div>
            )}
            {trades.map((t) => <TradeCard key={t.id} t={t} onStatus={setStatus} onNotes={saveNotes} onDelete={deleteTrade} onApproveWithdrawal={approveWithdrawal} />)}
          </div>
        )}
      </Panel>
    </SiteLayout>
  );
}

function TradeCard({ t, onStatus, onNotes, onDelete }: {
  t: Trade;
  onStatus: (t: Trade, s: string) => void;
  onNotes: (t: Trade, n: string) => void;
  onDelete: (t: Trade) => void;
}) {
  const [notes, setNotes] = useState(t.admin_notes ?? "");
  const badgeColor: Record<string, string> = {
    created: "bg-muted text-muted-foreground",
    funded: "bg-secondary text-secondary-foreground",
    released: "bg-primary text-primary-foreground",
    refunded: "bg-accent text-accent-foreground",
    disputed: "bg-destructive text-destructive-foreground",
    cancelled: "bg-muted text-muted-foreground",
  };
  return (
    <div className="rounded-md border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <code className="text-sm font-bold">{t.trade_code}</code>
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badgeColor[t.status] ?? "bg-muted"}`}>{t.status}</span>
          <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</span>
        </div>
        <button onClick={() => onDelete(t)} className="text-xs text-destructive hover:underline">Delete</button>
      </div>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div><b>Name:</b> {t.name}</div>
        <div><b>Creator:</b> {t.creator_role}</div>
        <div><b>Amount:</b> {t.amount} {t.payment_method} {t.amount_usd ? <span className="text-muted-foreground">(${t.amount_usd})</span> : null}</div>
        <div><b>Rate locked:</b> {t.quoted_rate ? `1 ${t.payment_method} = $${Number(t.quoted_rate).toLocaleString()}` : "—"}</div>
        <div><b>Finalize:</b> {t.finalization_hours}h</div>
        <div><b>Funded at:</b> {t.funded_at ? new Date(t.funded_at).toLocaleString() : "—"}</div>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-primary">Agreement</summary>
        <p className="mt-2 whitespace-pre-wrap text-sm">{t.agreement}</p>
      </details>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUSES.filter((s) => s !== t.status).map((s) => (
          <button key={s} onClick={() => onStatus(t, s)}
            className="rounded-md bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-primary hover:text-primary-foreground">
            Mark {s}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Admin notes (private)"
          className="w-full rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm" />
        <button onClick={() => onNotes(t, notes)} className="mt-2 rounded-md bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">Save notes</button>
      </div>
    </div>
  );
}