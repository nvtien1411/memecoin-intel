import type {
  ExitAnalysis,
  ExitScenario,
  HolderRow,
  MarketData,
  PoolReserves,
} from "../types";
import { num } from "../http";

/**
 * Constant-product (x*y=k) sell math against a single pool.
 *
 * Selling Δ base tokens into reserves (B, Q):
 *   out   = Q·Δ / (B + Δ)
 *   spot  = Δ · (Q/B)
 *   impact = 1 − out/spot = 1 − B/(B+Δ)
 *
 * This is exact for a CPMM pool and a good approximation for concentrated
 * liquidity only when the sell stays inside the active range — which is why
 * every number here is labelled an estimate.
 */
export function sellImpact(baseReserve: number, quoteReserve: number, tokensSold: number) {
  if (baseReserve <= 0 || quoteReserve <= 0 || tokensSold <= 0) return null;
  const price = quoteReserve / baseReserve;
  const out = (quoteReserve * tokensSold) / (baseReserve + tokensSold);
  const spot = tokensSold * price;
  if (spot <= 0) return null;
  return {
    proceeds: out,
    proceedsUsd: out,
    spot,
    impact: Math.max(0, 1 - out / spot),
    priceAfter: (quoteReserve - out) / (baseReserve + tokensSold),
  };
}

/** Largest token amount that keeps price impact under `slip` (0–1). */
export function maxSellForImpact(baseReserve: number, slip: number): number {
  if (baseReserve <= 0 || slip <= 0 || slip >= 1) return 0;
  return baseReserve * (1 / (1 - slip) - 1);
}

export function reservesFromMarket(market: MarketData, source = "dexscreener"): PoolReserves | null {
  const r = market.reserves;
  const price = market.priceUsd;
  const liqUsd = market.liquidityUsd;

  if (!price || price <= 0) return null;

  /**
   * Impact math needs self-consistent reserves: Q/B must equal the quoted
   * price. Real pools are not balanced (a concentrated Orca position can hold
   * 2:1 value), and raw `liquidity.quote` is in quote-token units, so feeding
   * either straight into x*y=k double-counts. Instead build VIRTUAL balanced
   * reserves from total pool USD value: half the USD on each side.
   *
   * This is the standard conservative approximation and it never splits a
   * position across the other side's value incorrectly.
   */
  const totalUsd = liqUsd ?? (r ? (r.baseReserveUsd ?? 0) + (r.quoteReserveUsd ?? 0) : null);
  if (!totalUsd || totalUsd <= 0) return null;

  const quoteReserveUsd = totalUsd / 2;
  const baseReserve = quoteReserveUsd / price;

  return {
    baseReserve,
    quoteReserve: quoteReserveUsd,
    baseReserveUsd: quoteReserveUsd,
    quoteReserveUsd,
    priceUsd: price,
    dex: r?.dex ?? null,
    source: `${source} · virtual balanced reserves (${totalUsd >= 1000 ? `$${(totalUsd / 1000).toFixed(1)}K` : `$${totalUsd.toFixed(0)}`} total pool value)`,
  };
}

export function computeExit(
  market: MarketData,
  holders: HolderRow[],
  totalSupply: number | null,
): ExitAnalysis {
  const reserves = reservesFromMarket(market);
  const price = market.priceUsd;

  if (!reserves || price === null || price <= 0 || reserves.baseReserve === null || reserves.quoteReserve === null) {
    return {
      available: false,
      reason:
        "Pool reserves or price are unavailable, so exit impact cannot be computed. Treat exit liquidity as unknown — not as safe.",
      reserves: null,
      scenarios: [],
      maxSellUsd: { slip1: null, slip5: null, slip10: null },
      topHolderExit: null,
      liquidityCoverage: null,
    };
  }

  const B = reserves.baseReserve;
  // Work in USD: quoteReserveUsd is dollar depth, so every proceeds figure
  // comes out in dollars and price = Q/B equals priceUsd.
  const Q = reserves.quoteReserveUsd ?? reserves.baseReserveUsd;
  if (Q === null || Q <= 0) {
    return {
      available: false,
      reason: "Quote-side pool depth could not be valued in USD.",
      reserves,
      scenarios: [],
      maxSellUsd: { slip1: null, slip5: null, slip10: null },
      topHolderExit: null,
      liquidityCoverage: null,
    };
  }

  // Scenarios are expressed as the USD size a trader would actually sell —
  // the question every checklist asks is "can I get out", not "what if a
  // quarter of the supply moved".
  const sizes = [1_000, 5_000, 25_000, 100_000];
  const scenarios: ExitScenario[] = [];
  const supply = totalSupply && totalSupply > 0 ? totalSupply : null;

  // Supply % that halves price: B/(B+Δ)=0.5 → Δ=B, so selling one full
  // pool-reserve worth of tokens halves the price.
  const halfPct = supply && B > 0 ? (B / supply) * 100 : null;

  for (const usd of sizes) {
    const tokens = usd / price;
    const m = sellImpact(B, Q, tokens);
    if (!m) continue;
    scenarios.push({
      sellUsd: usd,
      soldTokens: tokens,
      proceedsUsd: m.proceeds,
      priceImpactPct: m.impact * 100,
      priceAfter: m.priceAfter,
      supplyPctToHalve: halfPct,
    });
  }

  const maxSellUsd = {
    slip1: maxSellForImpact(B, 0.01) * price,
    slip5: maxSellForImpact(B, 0.05) * price,
    slip10: maxSellForImpact(B, 0.1) * price,
  };

  // Biggest single non-pool wallet's full exit — the most concrete dump risk.
  const biggest = holders
    .filter((h) => h.kind === "wallet" || h.kind === "creator")
    .sort((a, b) => b.pct - a.pct)[0];

  let topHolderExit: ExitAnalysis["topHolderExit"] = null;
  if (biggest && supply) {
    const tokens = (supply * biggest.pct) / 100;
    const m = sellImpact(B, Q, tokens);
    if (m) {
      topHolderExit = {
        wallet: biggest.owner ?? biggest.address,
        supplyPct: biggest.pct,
        proceedsUsd: m.proceeds,
        priceImpactPct: m.impact * 100,
      };
    }
  }

  const liquidityCoverage =
    market.marketCap && market.marketCap > 0 && market.liquidityUsd !== null
      ? (market.liquidityUsd / market.marketCap) * 100
      : null;

  return {
    available: true,
    reserves,
    scenarios,
    maxSellUsd,
    topHolderExit,
    liquidityCoverage,
  };
}

export function exitRiskBand(impactPct: number | null): {
  band: "ok" | "tight" | "danger" | "unknown";
  label: string;
} {
  if (impactPct === null) return { band: "unknown", label: "unknown" };
  if (impactPct < 5) return { band: "ok", label: "deep enough" };
  if (impactPct < 15) return { band: "tight", label: "tight" };
  return { band: "danger", label: "cannot exit cleanly" };
}

export function entryFromTrades(
  holders: HolderRow[],
  trades: { wallet: string; kind: "buy" | "sell"; priceUsd: number | null; amountUsd: number | null; tokenAmount: number | null }[],
  currentPrice: number | null,
) {
  const byWallet = new Map<string, { buys: { price: number; tokens: number; usd: number }[]; sold: boolean }>();

  for (const t of trades) {
    const entry = byWallet.get(t.wallet) ?? { buys: [], sold: false };
    if (t.kind === "buy" && t.priceUsd && t.tokenAmount) {
      entry.buys.push({ price: t.priceUsd, tokens: t.tokenAmount, usd: t.amountUsd ?? 0 });
    }
    if (t.kind === "sell") entry.sold = true;
    byWallet.set(t.wallet, entry);
  }

  const out = [];
  for (const h of holders) {
    const wallet = h.owner ?? h.address;
    const rec = byWallet.get(wallet);
    if (!rec || rec.buys.length === 0) continue;

    const totalTokens = rec.buys.reduce((s, b) => s + b.tokens, 0);
    const totalUsd = rec.buys.reduce((s, b) => s + b.usd, 0);
    const avgEntry = totalTokens > 0 ? totalUsd / totalTokens : null;

    out.push({
      wallet,
      supplyPct: h.pct,
      avgEntryUsd: avgEntry,
      currentPriceUsd: currentPrice,
      unrealizedPct:
        avgEntry && currentPrice ? ((currentPrice - avgEntry) / avgEntry) * 100 : null,
      observedBuys: rec.buys.length,
      observedBuysUsd: totalUsd,
      soldInWindow: rec.sold,
      confidence: (rec.buys.length >= 3 ? "high" : "medium") as "high" | "medium",
      note: `Entry estimated from ${rec.buys.length} observed buy(s) in the recent trade window — a lower bound, not the full position history.`,
    });
  }
  return out.sort((a, b) => b.supplyPct - a.supplyPct);
}

void num;
