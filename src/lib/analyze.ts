import { CHAINS, chainByDexScreenerId, guessFamily } from "./chains";
import { cacheGet, cacheSet, fetchJson } from "./http";
import type {
  AnalysisResult,
  ChainId,
  ClusterAnalysis,
  DeployerAnalysis,
  FlowAnalysis,
  HolderAnalysis,
  MarketData,
  SecurityData,
  SourceStatus,
  TokenIdentity,
  Trade,
} from "./types";
import {
  dsTokenPairs,
  dsSearch,
  identityFromPair,
  marketFromPair,
  pairsToPools,
  pickBestPair,
  type DsPair,
} from "./providers/dexscreener";
import {
  bestGtPool,
  gtPools,
  gtSearchPools,
  gtToken,
  gtTrades,
  ohlcvFromGt,
  gtOhlcv,
  poolAddress,
  tradesFromGt,
} from "./providers/geckoterminal";
import {
  creatorTokensFromRc,
  holdersFromRc,
  rcReport,
  securityFromRc,
} from "./providers/rugcheck";
import { gpTokenSecurity, holdersFromGp, pickGpToken, securityFromGp } from "./providers/goplus";
import { computeHolderAnalysis } from "./analysis/holders";
import { computeClusters, clustersToMap } from "./analysis/clusters";
import { computeFlow } from "./analysis/flow";
import { computeExit, entryFromTrades } from "./analysis/exit";
import { buildDecision } from "./analysis/decision";
import { buildPositiveSignals, buildRiskSignals } from "./analysis/risk";
import {
  DISCLAIMER,
  buildReport,
  buildTldr,
  pickVerdict,
  scoreRisks,
} from "./analysis/verdict";

const emptyHolders = (): HolderAnalysis => ({
  totalHolders: null,
  rows: [],
  top10Pct: null,
  top10PctAdjusted: null,
  top20Pct: null,
  effectiveTop10Pct: null,
  excludedPct: 0,
  distribution: [],
  dataAvailable: false,
  meaningful: false,
  note: "No holder list is available for this token.",
});

const emptyClusters = (note: string): ClusterAnalysis => ({
  nodes: [],
  edges: [],
  groups: [],
  effectiveTop10Pct: null,
  bundledSupplyPct: null,
  traced: 0,
  total: 0,
  unknown: 0,
  dataAvailable: false,
  note,
});

const emptySecurity = (): SecurityData => ({
  mintAuthority: null,
  freezeAuthority: null,
  mintable: null,
  freezable: null,
  honeypot: null,
  buyTax: null,
  sellTax: null,
  transferFeePct: null,
  ownerPrivileges: [],
  verified: null,
  lpLockedPct: null,
  lpBurned: null,
  dataAvailable: false,
});

const emptyDeployer = (note?: string): DeployerAnalysis => ({
  address: null,
  balancePct: null,
  priorTokens: [],
  ruggedCount: 0,
  dataAvailable: false,
  note,
});

export interface AnalyzeOptions {
  address: string;
  chain?: ChainId | null;
  /**
   * Cluster tracing is the slow, rate-limited part (it walks each wallet's
   * transaction history over a public RPC). When false, the result carries a
   * placeholder and the client fetches /api/clusters separately so the rest of
   * the dashboard renders immediately.
   */
  skipClusters?: boolean;
}

interface Resolved {
  chain: ChainId;
  pairs: DsPair[];
  bestPair: DsPair | null;
  poolAddress: string | null;
  dexId: string | null;
  statuses: SourceStatus[];
  /** Pool found via GeckoTerminal when DexScreener had nothing (Robinhood etc.). */
  gtPool?: GtPoolLike | null;
  /**
   * True when no pair could be found on any chain. Returning a made-up chain
   * with an "Unknown token" label would look like a real (safe) result, so the
   * orchestrator refuses instead.
   */
  unresolved?: boolean;
}

type GtPoolLike = {
  attributes: {
    name: string;
    address: string;
    reserve_in_usd?: string | null;
    volume_usd?: Record<string, string | null> | null;
    pool_created_at?: string | null;
    base_token_price_usd?: string | null;
    market_cap_usd?: string | null;
    fdv_usd?: string | null;
    transactions?: Record<string, { buys: number; sells: number }>;
    price_change_percentage?: Record<string, string>;
  };
  relationships?: {
    base_token?: { data?: { id: string } };
    dex?: { data?: { id: string } };
  };
};

/** Find which chain an address lives on, using DexScreener's cross-chain token lookup. */
async function resolveChain(address: string, explicit?: ChainId | null): Promise<Resolved> {
  const statuses: SourceStatus[] = [];

  // Chain discovery is the expensive part on EVM: with no DexScreener pair we
  // must probe GeckoTerminal chain by chain, and that index allows ~30 rpm.
  // Remember the answer so a second lookup of the same token costs nothing.
  const cacheKey = `chain:${address.toLowerCase()}`;
  if (!explicit) {
    const remembered = cacheGet<{ chain: ChainId; poolAddress: string | null; dexId: string | null; gtPool: GtPoolLike | null }>(cacheKey);
    if (remembered) {
      return {
        chain: remembered.chain,
        pairs: [],
        bestPair: null,
        poolAddress: remembered.poolAddress,
        dexId: remembered.dexId,
        statuses: [{ source: "chain-resolution", ok: true, ms: 0, note: "cache" }],
        gtPool: remembered.gtPool,
      };
    }
  }

  const ds = await dsTokenPairs(address);
  statuses.push(ds.status);
  const allPairs = (ds.data?.pairs ?? []) as DsPair[];

  if (explicit) {
    const onChain = allPairs.filter((p) => chainByDexScreenerId(p.chainId) === explicit);
    const best = pickBestPair(onChain);
    if (best) {
      return {
        chain: explicit,
        pairs: onChain,
        bestPair: best,
        poolAddress: best.pairAddress,
        dexId: best.dexId,
        statuses,
      };
    }
    // The chosen chain has no DexScreener pair. DexScreener does not index
    // Robinhood, and a pool may exist there or on a chain the user mistyped —
    // so probe GeckoTerminal for exactly the requested chain before giving up,
    // and never fall through to a fabricated token on that chain.
    const pools = await gtSearchPools(explicit, address);
    statuses.push(pools.status);
    const pool = bestGtPool(pools.data?.data);
    if (pool) {
      cacheSet(
        `chain:${address.toLowerCase()}`,
        {
          chain: explicit,
          poolAddress: poolAddress(pool),
          dexId: pool.relationships?.dex?.data?.id ?? null,
          gtPool: pool as unknown as GtPoolLike,
        },
        30 * 60_000,
      );
      return {
        chain: explicit,
        pairs: [],
        bestPair: null,
        poolAddress: poolAddress(pool),
        dexId: pool.relationships?.dex?.data?.id ?? null,
        statuses,
        gtPool: pool as unknown as GtPoolLike,
      };
    }
    return {
      chain: explicit,
      pairs: [],
      bestPair: null,
      poolAddress: null,
      dexId: null,
      statuses,
      unresolved: true,
    };
  }

  if (allPairs.length > 0) {
    // Pick the chain whose best pair has the deepest liquidity.
    const byChain = new Map<ChainId, DsPair[]>();
    for (const p of allPairs) {
      const c = chainByDexScreenerId(p.chainId);
      if (!c) continue;
      byChain.set(c, [...(byChain.get(c) ?? []), p]);
    }
    let winner: ChainId | null = null;
    let winnerLiq = -1;
    let winnerPair: DsPair | null = null;
    for (const [chain, pairs] of byChain) {
      const best = pickBestPair(pairs);
      const liq = best?.liquidity?.usd ?? 0;
      if (liq > winnerLiq) {
        winnerLiq = liq;
        winner = chain;
        winnerPair = best;
      }
    }
    if (winner) {
      return {
        chain: winner,
        pairs: byChain.get(winner) ?? [],
        bestPair: winnerPair,
        poolAddress: winnerPair?.pairAddress ?? null,
        dexId: winnerPair?.dexId ?? null,
        statuses,
      };
    }
  }

  // Fallbacks: symbol search, then GeckoTerminal search on EVM chains + Solana.
  const search = await dsSearch(address);
  statuses.push(search.status);
  const found = (search.data?.pairs ?? []) as DsPair[];
  const exact = found.filter((p) => p.baseToken.address.toLowerCase() === address.toLowerCase());
  if (exact.length > 0) {
    const best = pickBestPair(exact);
    const chain = best ? chainByDexScreenerId(best.chainId) : null;
    if (best && chain) {
      return {
        chain,
        pairs: exact,
        bestPair: best,
        poolAddress: best.pairAddress,
        dexId: best.dexId,
        statuses,
      };
    }
  }

  const family = guessFamily(address);
  // DexScreener indexes BSC, Base and Ethereum but NOT Robinhood Chain. So when
  // DexScreener returned nothing for an EVM address, the most likely chain that
  // still has the token is Robinhood — probe it first instead of burning three
  // GeckoTerminal calls on chains DexScreener already covered.
  const candidates: ChainId[] =
    family === "solana" ? ["solana"] : ["robinhood", "bsc", "base", "ethereum"];
  for (const chain of candidates) {
    const pools = await gtSearchPools(chain, address);
    statuses.push(pools.status);
    const pool = bestGtPool(pools.data?.data);
    if (pool) {
      // Keep the pool object: its attributes already carry price, liquidity,
      // market cap, volume, age and txn counts, so one call covers a chain
      // DexScreener does not index (Robinhood) instead of three.
      cacheSet(
        cacheKey,
        {
          chain,
          poolAddress: poolAddress(pool),
          dexId: pool.relationships?.dex?.data?.id ?? null,
          gtPool: pool as unknown as GtPoolLike,
        },
        30 * 60_000,
      );
      return {
        chain,
        pairs: [],
        bestPair: null,
        poolAddress: poolAddress(pool),
        dexId: pool.relationships?.dex?.data?.id ?? null,
        statuses,
        gtPool: pool as unknown as GtPoolLike,
      };
    }
  }

  return {
    chain: family === "solana" ? "solana" : "bsc",
    pairs: [],
    bestPair: null,
    poolAddress: null,
    dexId: null,
    statuses,
    unresolved: true,
  };
}

export async function analyzeToken(opts: AnalyzeOptions): Promise<AnalysisResult> {
  const address = opts.address.trim();
  const provenance: SourceStatus[] = [];

  const resolved = await resolveChain(address, opts.chain ?? null);
  provenance.push(...resolved.statuses);

  if (resolved.unresolved) {
    const gtDown = provenance.some(
      (p) => p.source.startsWith("geckoterminal") && !p.ok,
    );
    throw new Error(
      gtDown
        ? "No trading pair found on any chain. The fallback index (GeckoTerminal) is rate-limited right now, so this may be a false negative — retry in a minute, or select the chain manually."
        : "No trading pair found for this address on Solana, BNB Chain, Base, Ethereum or Robinhood Chain. Check the address, or the token may have no liquidity pool.",
    );
  }

  const chain = resolved.chain;
  const cfg = CHAINS[chain];

  /* ------------------------- identity + market ------------------------- */
  // DexScreener already returns name, symbol, price, liquidity, volume, age and
  // txns for every pair it knows. GeckoTerminal is a 30 rpm budget, so only call
  // it when DexScreener genuinely could not answer — otherwise one user burns
  // the whole quota on data we already had.
  const needGtToken = !resolved.bestPair;
  const gtTok = needGtToken
    ? await gtToken(chain, address)
    : {
        ok: true,
        data: null,
        status: { source: "geckoterminal:token", ok: true, ms: 0, note: "skipped (dexscreener)" },
      };
  provenance.push(gtTok.status);

  let token: TokenIdentity;
  if (resolved.bestPair) {
    token = identityFromPair(resolved.bestPair, chain);
  } else {
    const attr = gtTok.data?.data?.attributes;
    token = {
      address,
      chain,
      name: attr?.name ?? "Unknown token",
      symbol: attr?.symbol ?? "???",
      pairAddress: resolved.poolAddress ?? undefined,
      dexId: resolved.dexId ?? undefined,
    };
  }
  if (gtTok.data?.data?.attributes) {
    token.decimals = gtTok.data.data.attributes.decimals;
    token.imageUrl = gtTok.data.data.attributes.image_url ?? undefined;
  }

  const market: MarketData = marketFromPair(resolved.bestPair);
  if (gtTok.data?.data?.attributes?.normalized_total_supply) {
    market.totalSupply = Number(gtTok.data.data.attributes.normalized_total_supply);
  }

  /* ------------------------------ pools ------------------------------- */
  // Only needed to discover a pool address we don't have yet (Robinhood, or a
  // pair DexScreener lists without a tradable pool).
  const needPools = !resolved.poolAddress;
  const poolsRes = needPools
    ? await gtPools(chain, address)
    : {
        ok: true,
        data: null,
        status: { source: "geckoterminal:pools", ok: true, ms: 0, note: "skipped (dexscreener)" },
      };
  provenance.push(poolsRes.status);
  const gtPool = bestGtPool(poolsRes.data?.data) ?? (resolved.gtPool as never) ?? null;
  if (gtPool) {
    market.pools = [
      {
        address: poolAddress(gtPool),
        dex: gtPool.relationships?.dex?.data?.id ?? "unknown",
        liquidityUsd: gtPool.attributes.reserve_in_usd
          ? Number(gtPool.attributes.reserve_in_usd)
          : null,
        volume24h: gtPool.attributes.volume_usd?.h24
          ? Number(gtPool.attributes.volume_usd.h24)
          : null,
        createdAt: gtPool.attributes.pool_created_at ?? undefined,
      },
    ];
    if (market.liquidityUsd === null && gtPool.attributes.reserve_in_usd) {
      market.liquidityUsd = Number(gtPool.attributes.reserve_in_usd);
    }
    if (market.fdv === null && gtPool.attributes.fdv_usd) {
      market.fdv = Number(gtPool.attributes.fdv_usd);
    }
    if (market.marketCap === null && gtPool.attributes.market_cap_usd) {
      market.marketCap = Number(gtPool.attributes.market_cap_usd);
    }
    if (market.ageHours === null && gtPool.attributes.pool_created_at) {
      market.ageHours =
        (Date.now() - new Date(gtPool.attributes.pool_created_at).getTime()) / 3_600_000;
    }
    if (!token.pairAddress) token.pairAddress = poolAddress(gtPool);
    if (!token.dexId) token.dexId = gtPool.relationships?.dex?.data?.id;

    // Chains DexScreener does not index (Robinhood) get every market field from
    // the pool object, so the dashboard is not a wall of dashes.
    if (market.priceUsd === null && gtPool.attributes.base_token_price_usd) {
      market.priceUsd = Number(gtPool.attributes.base_token_price_usd);
    }
    const pc = gtPool.attributes.price_change_percentage;
    if (pc) {
      market.priceChange = {
        m5: pc.m5 ? Number(pc.m5) : undefined,
        h1: pc.h1 ? Number(pc.h1) : undefined,
        h6: pc.h6 ? Number(pc.h6) : undefined,
        h24: pc.h24 ? Number(pc.h24) : undefined,
      };
    }
    if (market.volume24h === null && gtPool.attributes.volume_usd?.h24) {
      market.volume24h = Number(gtPool.attributes.volume_usd.h24);
    }
    const tx = gtPool.attributes.transactions;
    if (!market.txns24h && tx?.h24) {
      market.txns24h = { buys: tx.h24.buys, sells: tx.h24.sells };
    }
  }
  if (resolved.pairs.length > 1) market.pools = pairsToPools(resolved.pairs);

  /* ------------------------------ trades ------------------------------ */
  const poolForTrades = gtPool ? poolAddress(gtPool) : resolved.poolAddress;
  let trades: Trade[] = [];
  if (poolForTrades) {
    const tradesRes = await gtTrades(chain, poolForTrades);
    provenance.push(tradesRes.status);
    trades = tradesFromGt(tradesRes.data?.data);
  }

  /* ---------------------------- ohlcv (24h) --------------------------- */
  // Only needed when DexScreener did not already give a 24h change — it costs
  // one more call against a 30 rpm budget.
  if (poolForTrades && market.priceChange.h24 === undefined) {
    const ohlcvRes = await gtOhlcv(chain, poolForTrades, "hour", 1, 25);
    provenance.push(ohlcvRes.status);
    const rows = ohlcvFromGt(ohlcvRes.data?.data?.attributes?.ohlcv_list);
    if (rows.length >= 2 && market.priceChange.h24 === undefined) {
      const first = rows[0].open;
      const last = rows[rows.length - 1].close;
      if (first > 0) market.priceChange.h24 = ((last - first) / first) * 100;
    }
  }

  /* ---------------------------- security ------------------------------ */
  let security: SecurityData = emptySecurity();
  let holderRows = [] as ReturnType<typeof holdersFromRc>;
  let totalHolders: number | null = null;
  let knownAccounts: Record<string, { name?: string; type?: string }> = {};
  let deployer: DeployerAnalysis = emptyDeployer();

  if (chain === "solana") {
    const rc = await rcReport(address);
    provenance.push(rc.status);
    if (rc.ok && rc.data) {
      const rep = rc.data;
      const rcSec = securityFromRc(rep);
      holderRows = holdersFromRc(rep);
      totalHolders = rep.totalHolders ?? null;
      knownAccounts = rep.knownAccounts ?? {};
      security = { ...rcSec };
      // Liquidity fallback: RugCheck's own market liquidity is available even
      // when the GeckoTerminal pool call is rate-limited.
      if (market.liquidityUsd === null && rep.totalMarketLiquidity) {
        market.liquidityUsd = rep.totalMarketLiquidity;
      }
      const supply = market.totalSupply ?? null;
      const creatorBal = rep.creatorBalance ?? null;
      deployer = {
        address: rep.creator ?? null,
        balancePct:
          creatorBal !== null && supply !== null && supply > 0
            ? (creatorBal / supply) * 100
            : null,
        priorTokens: creatorTokensFromRc(rep),
        ruggedCount: creatorTokensFromRc(rep).filter((t) => t.rugged).length,
        dataAvailable: true,
      };
    }
  }

  const gp = await gpTokenSecurity(chain, address);
  provenance.push(gp.status);
  const gpTok = pickGpToken(gp.data, address);
  if (gpTok) {
    const gpSec = securityFromGp(gpTok);
    if (!security.dataAvailable) {
      security = gpSec;
    } else {
      // Merge: keep Solana-specific truth, fill EVM-only fields.
      security = {
        ...security,
        honeypot: security.honeypot ?? gpSec.honeypot,
        buyTax: security.buyTax ?? gpSec.buyTax,
        sellTax: security.sellTax ?? gpSec.sellTax,
        ownerPrivileges: [...new Set([...security.ownerPrivileges, ...gpSec.ownerPrivileges])],
        lpLockedPct: security.lpLockedPct ?? gpSec.lpLockedPct,
        verified: security.verified ?? gpSec.verified,
        mintable: security.mintable ?? gpSec.mintable,
        freezable: security.freezable ?? gpSec.freezable,
      };
    }
    if (holderRows.length === 0) holderRows = holdersFromGp(gpTok);
    if (totalHolders === null && gpTok.holder_count) totalHolders = Number(gpTok.holder_count);
    if (!deployer.address && gpTok.creator_address) {
      deployer = {
        address: gpTok.creator_address,
        balancePct: gpTok.creator_percent ? Number(gpTok.creator_percent) * 100 : null,
        priorTokens: [],
        ruggedCount: 0,
        dataAvailable: true,
        note: "Deployer history is only available on Solana in this build.",
      };
    }
  }

  /* ------------------------------ flow -------------------------------- */
  const flow: FlowAnalysis = computeFlow(trades, market);

  /* ----------------------------- clusters ----------------------------- */
  const preliminary = computeHolderAnalysis(holderRows, totalHolders);
  // Bundle detection is a launch-time question: a four-year-old token's top
  // wallets have long since been funded from a hundred different places, and
  // tracing them costs RPC calls without changing the answer. Spend the budget
  // where it matters — young tokens — and keep old ones cheap.
  const ageH = market.ageHours ?? 0;
  // Bundle detection is a launch-time question. On a token older than a week the
  // top wallets have been funded from everywhere, tracing them burns public-RPC
  // budget for an answer that no longer means anything. Young tokens have short
  // histories, so the same trace is both cheap and meaningful there.
  const traceBudget =
    ageH < 24
      ? { maxWallets: 5, budgetMs: 7_000 }
      : ageH < 168
        ? { maxWallets: 4, budgetMs: 6_000 }
        : null;

  const clusters = opts.skipClusters
    ? emptyClusters(
        "Cluster trace is loading separately — it walks wallet history on-chain and takes longer than the rest of the report.",
      )
    : traceBudget === null
      ? emptyClusters(
          `Funding trace skipped: the pair is ${(ageH / 24).toFixed(0)} days old. Bundled-launch detection is only meaningful in the first week — a wallet funded four months ago says nothing about a launch bundle.`,
        )
      : await computeClusters({
          rows: preliminary.rows,
          flow,
          knownAccounts,
          isSolana: chain === "solana",
          maxWallets: traceBudget.maxWallets,
          budgetMs: traceBudget.budgetMs,
        }).catch((err) =>
          // Cluster tracing is an enhancement. If the RPC rejects something,
          // degrade this one panel — never fail the whole analysis.
          emptyClusters(
            `Funding trace failed: ${err instanceof Error ? err.message : String(err)}. Treat wallet relationships as unknown.`,
          ),
        );

  const holders = computeHolderAnalysis(
    holderRows,
    totalHolders,
    clustersToMap(clusters),
  );
  if (clusters.effectiveTop10Pct !== null) {
    holders.effectiveTop10Pct = clusters.effectiveTop10Pct;
  }

  /* --------------------------- exit + entries -------------------------- */
  const exitAnalysis = computeExit(market, holders.rows, market.totalSupply ?? null);
  const holderEntries = entryFromTrades(
    holders.rows.filter((h) => h.kind === "wallet" || h.kind === "creator"),
    trades.map((t) => ({
      wallet: t.wallet,
      kind: t.kind,
      priceUsd: t.priceUsd,
      amountUsd: t.amountUsd,
      tokenAmount: t.tokenAmount,
    })),
    market.priceUsd,
  );

  /* --------------------------- risk + verdict -------------------------- */
  const riskInput = { token, market, security, holders, clusters, flow, deployer, exit: exitAnalysis };
  const risks = buildRiskSignals(riskInput);
  const positives = buildPositiveSignals(riskInput);
  const decision = buildDecision({
    token,
    market,
    security,
    holders,
    clusters,
    flow,
    deployer,
    exit: exitAnalysis,
  });
  const riskScore = scoreRisks(risks);
  const verdict = pickVerdict(riskScore, risks, positives);

  const partial: AnalysisResult = {
    token,
    market,
    security,
    holders,
    clusters,
    flow,
    deployer,
    exit: exitAnalysis,
    holderEntries,
    social: {
      dataAvailable: false,
      reason:
        "No X/KOL data provider is configured. Social momentum, KOL call timing and sentiment are intentionally not estimated — any number here would be fabricated.",
    },
    risks,
    positives,
    decision,
    riskScore,
    verdict,
    tldr: [],
    report: [],
    provenance,
    generatedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
  };

  partial.tldr = buildTldr(token, partial);
  partial.report = buildReport(token, partial);
  partial.token.url = partial.token.url ?? (cfg.explorer ? `${cfg.explorer}${address}` : undefined);

  return partial;
}

export { emptyHolders, emptyClusters, emptySecurity, emptyDeployer };
void fetchJson;
