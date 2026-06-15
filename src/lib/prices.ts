type Currency = "BTC" | "XMR";

const cache = new Map<Currency, { rate: number; at: number }>();

async function tryFetchRate(currency: Currency): Promise<number | null> {
  const sources: Array<() => Promise<number | null>> = [
    async () => {
      const r = await fetch(`https://api.coinbase.com/v2/prices/${currency}-USD/spot`);
      if (!r.ok) return null;
      const j: any = await r.json();
      const v = Number(j?.data?.amount);
      return Number.isFinite(v) && v > 0 ? v : null;
    },
    async () => {
      const pair = currency === "BTC" ? "XBTUSD" : "XMRUSD";
      const r = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
      if (!r.ok) return null;
      const j: any = await r.json();
      const result = j?.result;
      if (!result) return null;
      const key = Object.keys(result)[0];
      const v = Number(result[key]?.c?.[0]);
      return Number.isFinite(v) && v > 0 ? v : null;
    },
    async () => {
      const id = currency === "BTC" ? "bitcoin" : "monero";
      const r = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      );
      if (!r.ok) return null;
      const j: any = await r.json();
      const v = Number(j?.[id]?.usd);
      return Number.isFinite(v) && v > 0 ? v : null;
    },
  ];
  for (const src of sources) {
    try {
      const v = await src();
      if (v) return v;
    } catch {
      // try next
    }
  }
  return null;
}

export async function getCryptoQuote(data: { currency: Currency; usd: number }) {
  if (!["BTC", "XMR"].includes(data.currency)) throw new Error("Invalid currency");
  if (!(data.usd > 0) || data.usd > 10_000_000) throw new Error("Invalid USD amount");

  const now = Date.now();
  const cached = cache.get(data.currency);
  let rate: number | null = null;
  if (cached && now - cached.at < 60_000) {
    rate = cached.rate;
  } else {
    rate = await tryFetchRate(data.currency);
    if (rate) cache.set(data.currency, { rate, at: now });
    else if (cached) rate = cached.rate;
  }
  if (!rate) throw new Error("Price feed unavailable — please try again in a moment");
  const cryptoAmount = data.usd / rate;
  return {
    currency: data.currency,
    usd: data.usd,
    rate,
    cryptoAmount: Number(cryptoAmount.toFixed(data.currency === "BTC" ? 8 : 6)),
  };
}