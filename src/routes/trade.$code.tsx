import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { SiteLayout, Panel, SandBox } from "@/components/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { sha256 } from "@/lib/hash";
import { toast } from "sonner";

export const Route = createFileRoute("/trade/$code")({
  validateSearch: (s: Record<string, unknown>) => ({ pw: typeof s.pw === "string" ? s.pw : "" }),
  head: () => ({ meta: [{ title: "Escrow Status — Fair Trade" }, { name: "description", content: "Track escrow funding and request withdrawal." }] }),
  component: TradePage,
});

type Trade = {
  trade_code: string; status: string; creator_role: string; payment_method: string;
  name: string; amount: number; amount_usd: number | null; quoted_rate: number | null;
  agreement: string; funded_at: string | null;
  withdrawal_address: string | null; withdrawal_requested_at: string | null;
  withdrawal_approved_at: string | null; withdrawal_tx: string | null;
};

function TradePage() {
  const { code } = Route.useParams();
  const { pw } = useSearch({ from: "/trade/$code" });
  const [password, setPassword] = useState(pw);
  const [trade, setTrade] = useState<Trade | null>(null);
  const [addresses, setAddresses] = useState<{ address: string; label: string | null }[]>([]);
  const [withdrawAddr, setWithdrawAddr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("trades_public").select("*").eq("trade_code", code).maybeSingle();
    if (error) { toast.error(error.message); return; }
    if (!data) { toast.error("Trade not found"); return; }
    setTrade(data as Trade);
    if (data.withdrawal_address) setWithdrawAddr(data.withdrawal_address);
    const { data: addr } = await supabase
      .from("crypto_addresses").select("address,label")
      .eq("currency", data.payment_method as string).eq("active", true);
    setAddresses(addr ?? []);
  }, [code]);

  useEffect(() => { load(); const t = setInterval(load, 7000); return () => clearInterval(t); }, [load]);

  async function submitWithdrawal() {
    if (!password) { toast.error("Enter your trade password"); return; }
    if (withdrawAddr.trim().length < 10) { toast.error("Enter a valid address"); return; }
    setBusy(true);
    try {
      const password_hash = await sha256(password);
      const { error } = await supabase.rpc("request_withdrawal", {
        _trade_code: code, _password_hash: password_hash, _address: withdrawAddr.trim(),
      });
      if (error) throw error;
      toast.success("Withdrawal address submitted — awaiting admin approval.");
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to submit withdrawal");
    } finally { setBusy(false); }
  }

  if (!trade) {
    return <SiteLayout><Panel><p className="text-center">Loading trade…</p></Panel></SiteLayout>;
  }

  const isFunded = ["funded", "released", "finalized"].includes(trade.status);
  const isReleased = trade.status === "released" || !!trade.withdrawal_approved_at;
  const sellerView = trade.creator_role === "seller";

  return (
    <SiteLayout banner={<>Escrow live tracking — page auto-refreshes every 7 seconds.</>}>
      <Panel className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Escrow Status</h1>
          <Link to="/check-trade" className="text-sm text-muted-foreground hover:text-primary">Look up another</Link>
        </div>

        <SandBox className="mt-4 space-y-2">
          <Row k="Trade ID" v={<code>{trade.trade_code}</code>} />
          <Row k="Name" v={trade.name} />
          <Row k="Amount" v={`${trade.amount} ${trade.payment_method}${trade.amount_usd ? ` ($${trade.amount_usd})` : ""}`} />
          <Row k="You are" v={trade.creator_role} />
        </SandBox>

        {/* Step 1 — Buyer funding */}
        <StatusStep
          n={1} title="Buyer deposit"
          state={isFunded ? "done" : "pending"}
          doneLabel="Funds Received"
          pendingLabel="Pending — awaiting buyer deposit"
        >
          {!isFunded && (
            addresses.length > 0 ? (
              <div className="mt-2 rounded-md bg-background/40 p-3 text-sm">
                <div className="font-semibold">Deposit address ({trade.payment_method}):</div>
                {addresses.map((a, i) => (
                  <div key={i} className="break-all">{a.label ? `[${a.label}] ` : ""}{a.address}</div>
                ))}
                <p className="mt-2 text-xs text-muted-foreground">
                  Status will flip to "Funds Received" after the admin confirms your deposit on-chain.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm italic">Admin hasn't approved a deposit address yet — check back shortly.</p>
            )
          )}
          {isFunded && trade.funded_at && (
            <p className="mt-2 text-xs text-muted-foreground">Marked funded at {new Date(trade.funded_at).toLocaleString()}.</p>
          )}
        </StatusStep>

        {/* Step 2 — Seller withdrawal */}
        <StatusStep
          n={2} title="Seller withdrawal"
          state={isReleased ? "done" : isFunded ? "active" : "locked"}
          doneLabel="Released to seller"
          pendingLabel={isFunded ? "Ready — submit your wallet address" : "Locked — waiting for funding"}
        >
          {!isFunded && (
            <p className="mt-2 text-sm text-muted-foreground">
              Once the buyer has deposited and the admin confirms, you'll be able to enter your wallet address here.
            </p>
          )}

          {isFunded && !isReleased && (
            <div className="mt-3 space-y-3">
              <div className="rounded-md bg-background/40 p-3 text-sm">
                <div className="font-semibold">Held in escrow</div>
                <div className="text-lg">{trade.amount} {trade.payment_method}
                  {trade.amount_usd ? <span className="ml-2 text-muted-foreground text-sm">(~${trade.amount_usd})</span> : null}
                </div>
              </div>

              {sellerView ? (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Your {trade.payment_method} wallet address</label>
                    <input value={withdrawAddr} onChange={(e) => setWithdrawAddr(e.target.value)}
                      placeholder={`Enter your ${trade.payment_method} address`}
                      className="w-full rounded-md bg-accent text-accent-foreground px-3 py-2" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Trade password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password from trade creation"
                      className="w-full rounded-md bg-accent text-accent-foreground px-3 py-2" />
                  </div>
                  <button onClick={submitWithdrawal} disabled={busy}
                    className="rounded-md bg-primary px-5 py-2 font-semibold text-primary-foreground disabled:opacity-50">
                    {busy ? "Submitting…" : trade.withdrawal_address ? "Update Withdrawal Address" : "Withdraw"}
                  </button>
                  {trade.withdrawal_requested_at && (
                    <p className="text-xs text-muted-foreground">
                      Submitted {new Date(trade.withdrawal_requested_at).toLocaleString()} — awaiting admin approval.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm italic">Only the seller can submit the withdrawal address.</p>
              )}
            </div>
          )}

          {isReleased && (
            <div className="mt-2 space-y-1 text-sm">
              <div><b>Sent to:</b> <span className="break-all">{trade.withdrawal_address}</span></div>
              {trade.withdrawal_tx && <div><b>Tx:</b> <span className="break-all">{trade.withdrawal_tx}</span></div>}
              {trade.withdrawal_approved_at && (
                <div className="text-xs text-muted-foreground">
                  Released {new Date(trade.withdrawal_approved_at).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </StatusStep>

        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-primary">Trade agreement</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm">{trade.agreement}</p>
        </details>
      </Panel>
    </SiteLayout>
  );
}

function StatusStep({ n, title, state, doneLabel, pendingLabel, children }: {
  n: number; title: string; state: "done" | "active" | "pending" | "locked";
  doneLabel: string; pendingLabel: string; children?: React.ReactNode;
}) {
  const dot = {
    done: "bg-primary text-primary-foreground",
    active: "bg-secondary text-secondary-foreground animate-pulse",
    pending: "bg-muted text-muted-foreground animate-pulse",
    locked: "bg-muted/50 text-muted-foreground",
  }[state];
  const label = state === "done" ? doneLabel : pendingLabel;
  return (
    <div className="mt-5 rounded-md border border-border bg-card/60 p-4">
      <div className="flex items-center gap-3">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${dot}`}>{n}</span>
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><span className="font-semibold">{k}:</span><span className="break-all text-right">{v}</span></div>;
}