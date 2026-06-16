// Public price proxy — reachable from Tor browser via HTTPS Supabase domain
// when direct browser fetches to Coinbase/Kraken/CoinGecko are blocked.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fromCoinbase(c: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.coinbase.com/v2/prices/${c}-USD/spot`);
    if (!r.ok) return null;
    const j: any = await r.json();
    const v = Number(j?.data?.amount);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch { return null; }
}
async function fromKraken(c: string): Promise<number | null> {
  try {
    const pair = c === "BTC" ? "XBTUSD" : "XMRUSD";
    const r = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
    if (!r.ok) return null;
    const j: any = await r.json();
    const result = j?.result; if (!result) return null;
    const k = Object.keys(result)[0];
    const v = Number(result[k]?.c?.[0]);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch { return null; }
}
async function fromCoingecko(c: string): Promise<number | null> {
  try {
    const id = c === "BTC" ? "bitcoin" : "monero";
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    if (!r.ok) return null;
    const j: any = await r.json();
    const v = Number(j?.[id]?.usd);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const currency = (url.searchParams.get("currency") || "").toUpperCase();
    if (currency !== "BTC" && currency !== "XMR") {
      return new Response(JSON.stringify({ error: "Invalid currency" }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    const rate =
      (await fromCoinbase(currency)) ??
      (await fromKraken(currency)) ??
      (await fromCoingecko(currency));
    if (!rate) {
      return new Response(JSON.stringify({ error: "No upstream available" }), {
        status: 502, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ currency, rate }), {
      headers: { ...corsHeaders, "content-type": "application/json", "cache-control": "public, max-age=60" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});