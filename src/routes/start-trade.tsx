import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteLayout, SandBox, Panel } from "@/components/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { sha256, randomPassword } from "@/lib/hash";
import { toast } from "sonner";

export const Route = createFileRoute("/start-trade")({
  head: () => ({ meta: [{ title: "Start Trade — Fair Trade" }, { name: "description", content: "Create a new escrow trade. You will receive a Trade ID and a secret password." }] }),
  component: StartTrade,
});

const finalizationOptions = [6, 12, 24, 48, 72, 168];

function StartTrade() {
  const [role, setRole] = useState<"buyer" | "seller">("buyer");
  const [method, setMethod] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [agreement, setAgreement] = useState("");
  const [hours, setHours] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ code: string; password: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!method || !hours) { toast.error("Please complete all required fields."); return; }
    setSubmitting(true);
    try {
      const password = randomPassword(16);
      const password_hash = await sha256(password);
      const { data, error } = await supabase
        .from("trades")
        .insert({
          creator_role: role,
          payment_method: method,
          name,
          amount: Number(amount),
          agreement,
          finalization_hours: Number(hours),
          password_hash,
        })
        .select("trade_code")
        .single();
      if (error) throw error;
      setResult({ code: data.trade_code, password });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create trade");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <SiteLayout banner={<>Save these credentials — they cannot be recovered!</>}>
        <Panel>
          <h1 className="text-center text-3xl">Trade Created</h1>
          <SandBox className="mt-6 space-y-3">
            <div><span className="font-semibold">Trade ID:</span> <code className="break-all">{result.code}</code></div>
            <div><span className="font-semibold">Password:</span> <code className="break-all">{result.password}</code></div>
            <p className="text-sm">Share the Trade ID with the other party. Use the password on the Check Trade page to manage the trade.</p>
          </SandBox>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/check-trade" className="rounded-md bg-secondary px-4 py-2 font-semibold text-secondary-foreground">Go to Check Trade</Link>
          </div>
        </Panel>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout banner={<>Everything below is binding and can't be changed!</>}>
      <SandBox className="relative mb-6">
        <h2 className="absolute right-6 top-4 text-2xl font-medium">Important!</h2>
        <p>The trade agreement needs to contain all these details:</p>
        <ul className="ml-6 mt-2 list-disc space-y-1 text-sm">
          <li>*What the seller is going to provide?</li>
          <li>*How the seller is going to provide it?</li>
          <li>*How the seller can prove he provided it?</li>
          <li>What is the buyer's and seller's alias (their username on another platform)?</li>
        </ul>
        <p className="mt-3 text-sm">If any of the non-optional questions can't be answered you shouldn't use our service.</p>
      </SandBox>

      <Panel>
        <h1 className="text-center text-3xl">New Trade</h1>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <fieldset className="space-y-3">
            <legend className="font-semibold">You Are The:</legend>
            {(["buyer", "seller"] as const).map((r) => (
              <label key={r} className="flex w-fit cursor-pointer items-center gap-3 rounded-md bg-accent px-4 py-2 text-accent-foreground">
                <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />
                <span><strong>{r[0].toUpperCase() + r.slice(1)}</strong> ({r === "buyer" ? "buying the goods" : "selling the goods"})</span>
              </label>
            ))}
          </fieldset>

          <Field label="Payment Method:">
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-md bg-accent text-accent-foreground px-3 py-2">
              <option value="">Choose</option>
              <option value="XMR">Monero (XMR)</option>
              <option value="BTC">Bitcoin (BTC)</option>
            </select>
          </Field>

          <Field label="Trade Name:">
            <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="Short description of the trade"
              className="w-full rounded-md bg-accent text-accent-foreground px-3 py-2 placeholder:text-accent-foreground/60" />
          </Field>

          <Field label="Trade Amount:">
            <input required type="number" step="0.0001" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter Transaction Amount"
              className="w-64 rounded-md bg-accent text-accent-foreground px-3 py-2 placeholder:text-accent-foreground/60" />
          </Field>

          <Field label="Trade Agreement:">
            <textarea required maxLength={5000} rows={6} value={agreement} onChange={(e) => setAgreement(e.target.value)}
              placeholder="Exactly what the seller needs to provide and how the seller will provide it. Optionally leave the username of the other party"
              className="w-full rounded-md bg-accent text-accent-foreground px-3 py-2 placeholder:text-accent-foreground/60" />
          </Field>

          <Field label="Time For Seller To Deliver Goods (finalization time):">
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="rounded-md bg-accent text-accent-foreground px-3 py-2">
              <option value="">Choose</option>
              {finalizationOptions.map((h) => <option key={h} value={h}>{h} hours</option>)}
            </select>
          </Field>

          <button disabled={submitting} className="rounded-md bg-secondary px-5 py-2 font-semibold text-secondary-foreground disabled:opacity-50">
            {submitting ? "Creating..." : "Start Trade"}
          </button>
        </form>
      </Panel>
    </SiteLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-semibold">{label}</div>
      {children}
    </div>
  );
}