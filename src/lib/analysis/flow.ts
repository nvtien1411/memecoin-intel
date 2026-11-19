import type { FlowAnalysis, MarketData, Trade } from "../types";

export function computeFlow(trades: Trade[], market: MarketData): FlowAnalysis {
  const dataAvailable = trades.length > 0;
  const empty: FlowAnalysis = {
    windowTrades: 0,
    buys: 0,
    sells: 0,
    buyVolumeUsd: 0,
    sellVolumeUsd: 0,
    uniqueTraders: 0,
    uniqueMakers: 0,
    tradesPerTrader: null,
    imbalance: null,
    largestTradeUsd: null,
    topTraderShare: null,
    washRatio: null,
    sameBlockBuyGroups: [],
    sameBlockMeaningful: false,
    sniperWallets: [],
    divergence: {
      priceChange24h: market.priceChange.h24 ?? null,
      liquidityChangePct: null,
      verdict: "unknown",
    },
    dataAvailable: false,
  };
  if (!dataAvailable) {
    // Degraded mode: DexScreener still gives buy/sell counts and 24h volume even
    // when the trade tape is unavailable. Report the coarse signal and say so,
    // rather than showing an empty panel as if nothing were happening.
    const t = market.txns24h;
    if (t && t.buys + t.sells > 0) {
      const total = t.buys + t.sells;
      const buyShare = t.buys / total;
      return {
        ...empty,
        buys: t.buys,
        sells: t.sells,
        // Volume split is unknown, so the imbalance is derived from txn counts
        // and labelled as such by the UI.
        imbalance: buyShare * 2 - 1,
        buyVolumeUsd: 0,
        sellVolumeUsd: 0,
        windowTrades: total,
        dataAvailable: false,
        note: "Trade tape unavailable — buy/sell counts come from the pair summary (24h), not from individual trades. Volume split, churn and same-block detection need the tape.",
      };
    }
    return empty;
  }

  const buys = trades.filter((t) => t.kind === "buy");
  const sells = trades.filter((t) => t.kind === "sell");
  const buyVolumeUsd = buys.reduce((s, t) => s + (t.amountUsd ?? 0), 0);
  const sellVolumeUsd = sells.reduce((s, t) => s + (t.amountUsd ?? 0), 0);
  const totalVolume = buyVolumeUsd + sellVolumeUsd;

  // Wallet-level aggregation
  const perWallet = new Map<
    string,
    { buyCount: number; sellCount: number; volume: number; buyVolume: number; sellVolume: number }
  >();
  for (const t of trades) {
    const w = perWallet.get(t.wallet) ?? {
      buyCount: 0,
      sellCount: 0,
      volume: 0,
      buyVolume: 0,
      sellVolume: 0,
    };
    if (t.kind === "buy") {
      w.buyCount += 1;
      w.buyVolume += t.amountUsd ?? 0;
    } else {
      w.sellCount += 1;
      w.sellVolume += t.amountUsd ?? 0;
    }
    w.volume += t.amountUsd ?? 0;
    perWallet.set(t.wallet, w);
  }

  const uniqueTraders = perWallet.size;
  const volumes = [...perWallet.values()].map((w) => w.volume).sort((a, b) => b - a);
  const topTraderShare = totalVolume > 0 ? (volumes[0] ?? 0) / totalVolume : null;

  // Wash heuristic: wallets that both bought and sold repeatedly inside the
  // window, i.e. churning rather than taking a position. Not proof of wash
  // trading — it is a churn/round-trip signal.
  const churners = [...perWallet.values()].filter(
    (w) => w.buyCount >= 2 && w.sellCount >= 2,
  );
  const churnVolume = churners.reduce((s, w) => s + w.volume, 0);
  const washRatio = totalVolume > 0 ? churnVolume / totalVolume : null;

  // Same-block coordinated buying: >= 3 distinct wallets buying in one block.
  const byBlock = new Map<number, { wallets: Set<string>; tokenAmount: number }>();
  for (const t of buys) {
    const g = byBlock.get(t.blockNumber) ?? { wallets: new Set<string>(), tokenAmount: 0 };
    g.wallets.add(t.wallet);
    g.tokenAmount += t.tokenAmount ?? 0;
    byBlock.set(t.blockNumber, g);
  }
  const sameBlockBuyGroups = [...byBlock.entries()]
    .filter(([, g]) => g.wallets.size >= 3)
    .map(([block, g]) => ({
      block,
      wallets: [...g.wallets],
      tokenAmount: g.tokenAmount,
    }))
    .sort((a, b) => a.block - b.block)
    .slice(0, 8);

  // Age gate: co-buying in one block only means something while the token is
  // young. On a mature pair the same pattern is ordinary market noise.
  const ageHours = market.ageHours;
  const sameBlockMeaningful =
    sameBlockBuyGroups.length > 0 && ageHours !== null && ageHours < 48;

  // Snipers: wallets that bought inside the earliest blocks of the observed
  // window. This is a lower bound — the launch block is often older than the
  // trade window, so it is labelled as a heuristic.
  const sortedByBlock = [...trades].sort((a, b) => a.blockNumber - b.blockNumber);
  const firstBlock = sortedByBlock[0]?.blockNumber ?? 0;
  const sniperWallets = buys
    .filter((t) => t.blockNumber <= firstBlock + 1)
    .map((t) => ({ wallet: t.wallet, block: t.blockNumber, amountUsd: t.amountUsd }))
    .slice(0, 10);

  const priceChange24h = market.priceChange.h24 ?? null;
  const liquidity = market.liquidityUsd;
  const volume24h = market.volume24h ?? totalVolume;
  let divergenceVerdict: FlowAnalysis["divergence"]["verdict"] = "unknown";
  if (priceChange24h !== null && liquidity !== null) {
    if (priceChange24h > 50 && liquidity < 25_000) divergenceVerdict = "pump_without_liquidity";
    else if (volume24h > 0 && liquidity > 0 && volume24h / liquidity > 10)
      divergenceVerdict = "liquidity_drain";
    else divergenceVerdict = "healthy";
  }

  return {
    windowTrades: trades.length,
    buys: buys.length,
    sells: sells.length,
    buyVolumeUsd,
    sellVolumeUsd,
    uniqueTraders,
    uniqueMakers: uniqueTraders,
    tradesPerTrader: trades.length / Math.max(1, uniqueTraders),
    imbalance: totalVolume > 0 ? (buyVolumeUsd - sellVolumeUsd) / totalVolume : null,
    largestTradeUsd: volumes.length > 0 ? Math.max(...trades.map((t) => t.amountUsd ?? 0)) : null,
    topTraderShare,
    washRatio,
    sameBlockBuyGroups,
    sameBlockMeaningful,
    sniperWallets,
    divergence: {
      priceChange24h,
      liquidityChangePct: null,
      verdict: divergenceVerdict,
    },
    dataAvailable: true,
  };
}
