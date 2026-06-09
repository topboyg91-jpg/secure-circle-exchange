import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout, SandBox } from "@/components/SiteLayout";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms — Fair Trade" }, { name: "description", content: "Binding terms of the Fair Trade escrow service." }] }),
  component: Terms,
});

const items = [
  "The finalization timer starts as soon as the buyer pays.",
  "The buyer can choose to release funds at anytime. If they don't the seller will have to wait until the finalization time is over.",
  "The buyer has until the finalization time is over to dispute. If the buyer doesn't dispute before the finalization timer is over, the funds are transferred to the seller.",
  "If a seller doesn't deliver the goods in the designated time the buyer can choose to extended the time by disputing or be refunded by disputing.",
  "The trade amount, agreement and finalization time are binding and can not be changed.",
  "In the event of dispute the moderators decision is based on ONLY the trade agreement. Extra details or side deals not included in the trade agreement will not effect the moderators decision unless both parties agree to them.",
  "Failing to fill out the trade agreement correctly might cause loss of funds. We are not responsible if you don't fill out the trade agreement correctly.",
  "There are no fees except a 4% withdraw fee.",
  "Deposits can be made in Monero or Bitcoin. Withdraws are Monero only.",
  "Before starting a trade make sure there is a way for the seller to prove he provided the goods. If there is not you risk loosing your money.",
  "Dispute decisions can either be full or partial refunds.",
];

function Terms() {
  return (
    <SiteLayout banner={<>Everything below is binding and can't be changed!</>}>
      <SandBox className="relative">
        <h1 className="absolute right-6 top-4 text-3xl font-medium">Terms</h1>
        <ul className="list-disc space-y-3 pl-6 pr-32 leading-relaxed">
          {items.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
        <button className="mt-6 rounded-md bg-background px-5 py-2 text-foreground">Accept</button>
      </SandBox>
    </SiteLayout>
  );
}