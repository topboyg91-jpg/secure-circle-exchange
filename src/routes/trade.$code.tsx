import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { SiteLayout, Panel, SandBox } from "@/components/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { sha256 } from "@/lib/hash";
import { toast } from "sonner";

export const Route = createFileRoute("/trade/$code")({
  validateSearch: (s: Record<string, unknown>) => ({ pw: typeof s.pw === "string" ? s.pw : "" }),
  head: () => ({ meta: [{ title: "Trade Room — Fair Trade" }] }),
  component: TradePage,
});

type Trade = {
  id: string; trade_code: string; status: string; creator_role: string; payment_method: string;
  name: string; amount: number; amount_usd: number | null; quoted_rate: number | null;
  agreement: string; finalization_hours: number; deposit_address: string | null;
  created_at: string; accepted_at: string | null; declined_at: string | null;
  funded_at: string | null; delivered_at: string | null; disputed_at: string | null;
  completed_at: string | null;
  withdrawal_address: string | null; withdrawal_requested_at: string | null;
  withdrawal_approved_at: string | null; withdrawal_tx: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  created: "bg-muted text-muted-foreground",
  accepted: "bg-secondary text-secondary-foreground",
  funded: "bg-primary text-primary-foreground",
  delivered: "bg-secondary text-secondary-foreground",
  released: "bg-primary text-primary-foreground",
  completed: "bg-primary text-primary-foreground",
  disputed: "bg-destructive text-destructive-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

function TradePage() {
  const { code } = Route.useParams();
  const { pw } = useSearch({ from: "/trade/$code" });
  const [password, setPassword] = useState(pw);
  const [trade, setTrade] = useState<Trade | null>(null);
  const [withdrawAddr, setWithdrawAddr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("trades_public").select("*").eq("trade_code", code).maybeSingle();
    if (error) { toast.error(error.message); return; }
    if (!data) { toast.error("Trade not found"); return; }
    setTrade(data as unknown as Trade);
    if ((data as any).withdrawal_address) setWithdrawAddr((data as any).withdrawal_address);
  }, [code]);

  useEffect(() => { load(); const t = setInterval(load, 7000); return () => clearInterval(t); }, [load]);

  async function act(action: "accept" | "decline" | "mark_delivered" | "release" | "dispute") {
    if (!password) { toast.error("Enter your trade password"); return; }
    setBusy(true);
    try {
      const password_hash = await sha256(password);
      const { error } = await supabase.rpc("trade_action" as any, {
        _trade_code: code, _password_hash: password_hash, _action: action,
      });
      if (error) throw error;
      toast.success(`Action “${action}” submitted.`);
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Action failed");
    } finally { setBusy(false); }
  }

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
      toast.success("Withdrawal address submitted — admin will release shortly.");
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to submit withdrawal");
    } finally { setBusy(false); }
  }

  if (!trade) {
    return <SiteLayout><Panel><p className="text-center">Loading trade…</p></Panel></SiteLayout>;
  }

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/trade/${code}` : `/trade/${code}`;
  const isAccepted = !!trade.accepted_at || ["accepted","funded","delivered","released","completed"].includes(trade.status);
  const isFunded = ["funded","delivered","released","completed"].includes(trade.status);
  const isDelivered = ["delivered","released","completed"].includes(trade.status);
  const isReleased = ["released","completed"].includes(trade.status) || !!trade.withdrawal_approved_at;
  const isCompleted = trade.status === "completed";
  const isCancelled = trade.status === "cancelled";
  const isDisputed = trade.status === "disputed";

  const qrUrl = trade.deposit_address
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(trade.deposit_address)}`
    : null;

  return (
    <SiteLayout banner={<>Trade Room — auto-refreshes every 7 seconds.</>}>
      <Panel className="mx-auto max-w-3xl">
        {/* Top */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Trade ID</div>
            <code className="text-lg font-bold">{trade.trade_code}</code>
          </div>
          <span className={`rounded px-3 py-1 text-xs font-bold uppercase ${STATUS_COLORS[trade.status] ?? "bg-muted"}`}>
            {trade.status}
          </span>
        </div>
        <SandBox className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <Row k="Name" v={trade.name} />
          <Row k="Creator role" v={trade.creator_role} />
          <Row k="Amount" v={`${trade.amount} ${trade.payment_method}${trade.amount_usd ? ` ($${trade.amount_usd})` : ""}`} />
          <Row k="Delivery time" v={`${trade.finalization_hours}h`} />
        </SandBox>

        {/* Password prompt — required for all actions */}
        <div className="mt-4">
          <label className="mb-1 block text-sm font-semibold">Trade password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Required for any action"
            className="w-full rounded-md bg-accent text-accent-foreground px-3 py-2" />
        </div>

        {/* Invite */}
        <Section title="Invite" n={1} done={isAccepted}>
          <div className="text-sm">Share this link with the other party:</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input readOnly value={inviteUrl}
              className="flex-1 rounded-md bg-accent text-accent-foreground px-3 py-2 text-xs" />
            <button onClick={() => { navigator.clipboard.writeText(inviteUrl); toast.success("Copied"); }}
              className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Copy</button>
          </div>
          {!isAccepted && <p className="mt-2 text-xs italic text-muted-foreground">Waiting for counterparty to accept…</p>}
        </Section>

        {/* Accept / Decline */}
        {!isAccepted && !isCancelled && (
          <Section title="Counterparty review" n={2}>
            <p className="text-sm">The counterparty (or you, as creator) confirms the agreement to start escrow.</p>
            <div className="mt-2 flex gap-2">
              <button disabled={busy} onClick={() => act("accept")}
                className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
                Accept Trade
              </button>
              <button disabled={busy} onClick={() => act("decline")}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground disabled:opacity-50">
                Decline
              </button>
            </div>
          </Section>
        )}

        {/* Payment */}
        {isAccepted && !isFunded && !isCancelled && (
          <Section title="Buyer payment" n={3}>
            {trade.deposit_address ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                {qrUrl && <img src={qrUrl} alt="Deposit QR" className="h-44 w-44 rounded bg-white p-2" />}
                <div className="flex-1 space-y-2 text-sm">
                  <div><b>Send exactly:</b> {trade.amount} {trade.payment_method}</div>
                  <div><b>To address:</b></div>
                  <code className="block break-all rounded bg-accent text-accent-foreground p-2 text-xs">{trade.deposit_address}</code>
                  <button onClick={() => { navigator.clipboard.writeText(trade.deposit_address!); toast.success("Address copied"); }}
                    className="rounded-md bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">Copy address</button>
                  <p className="text-xs italic text-muted-foreground">Status flips to “Funds Received” once the admin confirms on-chain.</p>
                </div>
              </div>
            ) : (
              <p className="text-sm italic">No deposit address available yet — admin must add one for {trade.payment_method}.</p>
            )}
          </Section>
        )}

        {/* Escrow holding */}
        {isFunded && !isReleased && !isCancelled && (
          <Section title="In escrow" n={4} done>
            <p className="text-sm">Funds are secured. Seller delivers goods, then marks delivered.</p>
            {!isDelivered && trade.creator_role === "seller" && (
              <button disabled={busy} onClick={() => act("mark_delivered")}
                className="mt-2 rounded-md bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground disabled:opacity-50">
                Mark Delivered
              </button>
            )}
          </Section>
        )}

        {/* Release */}
        {isDelivered && !isReleased && trade.creator_role === "buyer" && (
          <Section title="Release funds" n={5}>
            <p className="text-sm">Confirm the seller delivered as agreed, then release escrow.</p>
            <button disabled={busy} onClick={() => act("release")}
              className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
              Release to Seller
            </button>
          </Section>
        )}

        {/* Seller withdrawal */}
        {isFunded && !isReleased && trade.creator_role === "seller" && (
          <Section title="Set payout wallet" n={5}>
            <p className="text-sm">Enter the {trade.payment_method} address where the released funds should be sent.</p>
            <input value={withdrawAddr} onChange={(e) => setWithdrawAddr(e.target.value)}
              placeholder={`Your ${trade.payment_method} address`}
              className="mt-2 w-full rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm" />
            <button disabled={busy} onClick={submitWithdrawal}
              className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {trade.withdrawal_address ? "Update payout address" : "Submit payout address"}
            </button>
          </Section>
        )}

        {isReleased && (
          <Section title="Released" n={6} done>
            <div className="text-sm space-y-1">
              <div><b>Sent to:</b> <span className="break-all">{trade.withdrawal_address ?? "(pending admin payout)"}</span></div>
              {trade.withdrawal_tx && <div><b>Tx:</b> <span className="break-all">{trade.withdrawal_tx}</span></div>}
            </div>
          </Section>
        )}

        {/* Dispute */}
        {!isCancelled && !isCompleted && !isDisputed && isAccepted && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <b>Something wrong?</b>{" "}
            <button disabled={busy} onClick={() => act("dispute")}
              className="ml-2 rounded-md bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground disabled:opacity-50">
              Open Dispute
            </button>
          </div>
        )}

        {/* Timeline */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold">Timeline</h3>
          <ul className="mt-2 space-y-1 text-xs">
            <TL label="Created" at={trade.created_at} done />
            <TL label="Seller Accepted" at={trade.accepted_at} done={!!trade.accepted_at} />
            <TL label="Awaiting Payment" at={trade.accepted_at} done={isAccepted && !isFunded ? false : isFunded} active={isAccepted && !isFunded} />
            <TL label="Payment Confirmed" at={trade.funded_at} done={!!trade.funded_at} />
            <TL label="In Escrow" at={trade.funded_at} done={isFunded} />
            <TL label="Delivered" at={trade.delivered_at} done={!!trade.delivered_at} />
            <TL label="Released" at={trade.withdrawal_approved_at} done={isReleased} />
            <TL label="Completed" at={trade.completed_at} done={isCompleted} />
            {trade.disputed_at && <TL label="Disputed" at={trade.disputed_at} done active />}
            {trade.declined_at && <TL label="Declined" at={trade.declined_at} done active />}
          </ul>
        </div>

        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-primary">Trade agreement</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm">{trade.agreement}</p>
        </details>

        <div className="mt-6 text-center">
          <Link to="/check-trade" className="text-xs text-muted-foreground hover:text-primary">Look up another trade</Link>
        </div>
      </Panel>
    </SiteLayout>
  );
}

function Section({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-md border border-border bg-card/60 p-4">
      <div className="flex items-center gap-3">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{n}</span>
        <div className="font-semibold">{title}</div>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><span className="font-semibold">{k}:</span><span className="break-all text-right">{v}</span></div>;
}

function TL({ label, at, done, active }: { label: string; at?: string | null; done?: boolean; active?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${active ? "bg-destructive" : done ? "bg-primary" : "bg-muted"}`} />
      <span className={done ? "" : "text-muted-foreground"}>{label}</span>
      {at && <span className="text-muted-foreground">— {new Date(at).toLocaleString()}</span>}
    </li>
  );
}