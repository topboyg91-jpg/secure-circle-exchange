import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout, SandBox, Panel } from "@/components/SiteLayout";

export const Route = createFileRoute("/faq")({
  head: () => ({ meta: [{ title: "FAQ — Fair Trade" }, { name: "description", content: "Frequently asked questions about the Fair Trade escrow service." }] }),
  component: FAQ,
});

const qa = [
  ["What is Fair Trade?", "Fair Trade is an anonymous, moderated crypto escrow service. We hold the buyer's funds while the seller delivers, and release them once the buyer confirms (or the finalization timer expires)."],
  ["Which cryptocurrencies are supported?", "Deposits are accepted in Monero (XMR) and Bitcoin (BTC). Withdrawals are settled in Monero only."],
  ["What fees do you charge?", "There are no fees on a trade. A flat 4% withdraw fee is applied when the seller withdraws."],
  ["How do I track a trade?", "When you create a trade you receive a secret password and a Trade ID. Use the Check Trade page with your Trade ID and password to view status and perform actions."],
  ["What happens if the seller doesn't deliver?", "Open a dispute before the finalization timer expires. A moderator joins the conversation and rules based on the trade agreement."],
  ["Do you keep logs?", "Fair Trade is designed for use over Tor. We keep the minimum data needed to operate trades and disputes."],
];

function FAQ() {
  return (
    <SiteLayout banner={<>Read the Terms before starting a trade.</>}>
      <Panel>
        <h1 className="mb-6 text-center text-3xl text-primary">Frequently Asked Questions</h1>
        <div className="space-y-4">
          {qa.map(([q, a]) => (
            <SandBox key={q}>
              <h2 className="font-semibold">{q}</h2>
              <p className="mt-2 text-sm">{a}</p>
            </SandBox>
          ))}
        </div>
      </Panel>
    </SiteLayout>
  );
}