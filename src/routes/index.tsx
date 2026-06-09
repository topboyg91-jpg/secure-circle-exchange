import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout, Panel, SandBox } from "@/components/SiteLayout";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fair Trade — anonymous crypto escrow" },
      { name: "description", content: "Anonymous crypto escrow service. Buyer and seller protected by a moderated escrow process." },
      { property: "og:title", content: "Fair Trade — anonymous crypto escrow" },
      { property: "og:description", content: "Anonymous crypto escrow service supporting Monero and Bitcoin." },
    ],
  }),
  component: Index,
});

const steps = [
  "The buyer or seller creates a new trade. They then receive a password that allows them to track the trade and a link to share with the other party.",
  'The buyer deposits amount decided upon in the trade details, upon completion of the deposit; the "Trade ID" will become searchable for the other party.',
  "Once the buyer has successfully deposited the funds. The seller will be prompted to provide the specified product or service. The buyer is able to finalize the trade (upon successful recieval of the product/service) or cancel the trade (if abandoned by the seller). Each action can be performed by the buyer entering their secret password in.",
  "If the buyer forgets to log in, the seller automatically receives the funds after the finalization timer expires.",
  "If the seller didn't provide what was agreed, the buyer can open a dispute. A conversation between the buyer, seller and moderator is opened to clarify the situation.",
];

function Index() {
  return (
    <SiteLayout banner={<>We now accept Bitcoin payments!</>}>
      <Panel>
        <h1 className="text-center text-4xl font-semibold">
          Welcome to <span className="text-secondary">Fair </span>
          <span className="text-primary">Trade</span>
          <span className="text-foreground"> — we make every trade fair</span>
        </h1>
        <p className="mt-2 text-center text-xl text-primary">anonymous crypto escrow service</p>
        <h2 className="mt-6 text-center text-3xl text-primary">How it Works</h2>

        <div className="mt-6 space-y-10">
          {steps.map((s, i) => (
            <SandBox key={i} className="text-center text-base leading-relaxed">{s}</SandBox>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <a href="/start-trade" className="rounded-md bg-card border border-border px-6 py-3 font-medium text-foreground hover:bg-muted">
            Start Trade
          </a>
        </div>
      </Panel>
    </SiteLayout>
  );
}
