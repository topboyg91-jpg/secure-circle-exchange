import { createServerFn } from "@tanstack/react-start";

type Currency = "BTC" | "XMR";
const ID_MAP: Record<Currency, string> = { BTC: "bitcoin", XMR: "monero" };

// Tiny in-memory cache (per worker) — 60s TTL
const cache = new Map<Currency, { rate: number; at: number }>();

export const getCryptoQuote = createServerFn({ method: "POST" })
  .inputValidator((d: { currency: Currency; usd: number }) => {
    if (!["BTC", "XMR"].includes(d.currency)) throw new Error("Invalid currency");
    if (!(d.usd > 0) || d.usd > 10_000_000) throw new Error("Invalid USD amount");
    return d;
  })
  .handler(async ({ data }) => {
    const now = Date.now();
    const cached = cache.get(data.currency);
    let rate: number;
    if (cached && now - cached.at < 60_000) {
      rate = cached.rate;
    } else {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ID_MAP[data.currency]}&vs_currencies=usd`;
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`Price feed unavailable (${res.status})`);
      const json: any = await res.json();
      rate = Number(json?.[ID_MAP[data.currency]]?.usd);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid rate from feed");
      cache.set(data.currency, { rate, at: now });
    }
    const cryptoAmount = data.usd / rate;
    return {
      currency: data.currency,
      usd: data.usd,
      rate, // USD per 1 unit
      cryptoAmount: Number(cryptoAmount.toFixed(data.currency === "BTC" ? 8 : 6)),
    };
  });