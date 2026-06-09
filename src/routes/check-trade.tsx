import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteLayout, Panel, SandBox } from "@/components/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/check-trade")({
  head: () => ({ meta: [{ title: "Check Trade — Fair Trade" }, { name: "description", content: "Look up a trade by Trade ID to view its current status." }] }),
  component: CheckTrade,
});

function CheckTrade() {
  const [code, setCode] = useState("");
  const [trade, setTrade] = useState<any>(null);
  const [addresses, setAddresses] = useState<any[]>([]);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase
      .from("trades_public")
      .select("*")
      .eq("trade_code", code.trim())
      .maybeSingle();
    if (error) { toast.error(error.message); return; }
    if (!data) { toast.error("Trade not found"); setTrade(null); return; }
    setTrade(data);
    const { data: addr } = await supabase
      .from("crypto_addresses")
      .select("*")
      .eq("currency", data.payment_method as string)
      .eq("active", true);
    setAddresses(addr ?? []);
  }

  return (
    <SiteLayout banner={<>Enter your Trade ID to view the status.</>}>
      <Panel>
        <h1 className="text-center text-3xl">Check Trade</h1>
        <form onSubmit={lookup} className="mt-6 flex gap-3 justify-center">
          <input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Trade ID"
            className="w-80 rounded-md bg-accent text-accent-foreground px-3 py-2" />
          <button className="rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground">Look up</button>
        </form>

        {trade && (
          <SandBox className="mt-6 space-y-2">
            <Row k="Trade ID" v={trade.trade_code} />
            <Row k="Name" v={trade.name} />
            <Row k="Amount" v={`${trade.amount} ${trade.payment_method}`} />
            <Row k="Status" v={trade.status} />
            <Row k="Creator" v={trade.creator_role} />
            <Row k="Finalization" v={`${trade.finalization_hours}h`} />
            <div>
              <div className="font-semibold">Agreement:</div>
              <p className="whitespace-pre-wrap text-sm">{trade.agreement}</p>
            </div>
            {trade.status === "created" && addresses.length > 0 && (
              <div className="mt-4 rounded-md bg-background/40 p-3">
                <div className="font-semibold">Deposit Address ({trade.payment_method}):</div>
                {addresses.map((a) => (
                  <div key={a.id} className="break-all text-sm">{a.label ? `[${a.label}] ` : ""}{a.address}</div>
                ))}
              </div>
            )}
            {trade.status === "created" && addresses.length === 0 && (
              <div className="text-sm italic">No deposit address has been approved yet — please check back shortly.</div>
            )}
          </SandBox>
        )}
      </Panel>
    </SiteLayout>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return <div><span className="font-semibold">{k}:</span> <span className="break-all">{String(v)}</span></div>;
}