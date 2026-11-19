import type {
  ClusterAnalysis,
  DeployerAnalysis,
  ExitAnalysis,
  FlowAnalysis,
  HolderAnalysis,
  MarketData,
  PositiveSignal,
  RiskSignal,
  SecurityData,
  TokenIdentity,
} from "../types";
import { fmtPct, fmtUsd } from "../http";

export interface RiskInput {
  token: TokenIdentity;
  market: MarketData;
  security: SecurityData;
  holders: HolderAnalysis;
  clusters: ClusterAnalysis;
  flow: FlowAnalysis;
  deployer: DeployerAnalysis;
  exit?: ExitAnalysis;
}

const now = () => new Date().toISOString();

function sig(
  s: Omit<RiskSignal, "observedAt">,
): RiskSignal {
  return { ...s, observedAt: now() };
}

export function buildRiskSignals(input: RiskInput): RiskSignal[] {
  const { market, security, holders, clusters, flow, deployer, token } = input;
  const out: RiskSignal[] = [];

  /* ----------------------------- contract ----------------------------- */
  if (security.honeypot === true) {
    out.push(
      sig({
        id: "honeypot",
        name: "Honeypot / cannot sell",
        severity: "critical",
        evidence: "GoPlus reports is_honeypot or cannot_sell_all = 1",
        source: "goplus",
        confidence: "high",
        explanation:
          "Buying may succeed while selling is blocked or taxed to zero. Do not buy until this is disproven by a real sell transaction from an unrelated wallet.",
        category: "contract",
      }),
    );
  }

  if (security.mintable === true) {
    out.push(
      sig({
        id: "mintable",
        name: "Supply can be inflated",
        severity: "high",
        evidence: security.mintAuthority
          ? `Mint authority still active: ${security.mintAuthority}`
          : "Mint authority is not revoked",
        source: token.chain === "solana" ? "rugcheck/goplus" : "goplus",
        confidence: "high",
        explanation:
          "The authority holder can mint new tokens and dilute every existing holder. On memecoins this is usually revoked before launch.",
        category: "contract",
      }),
    );
  }

  if (security.freezable === true) {
    out.push(
      sig({
        id: "freezable",
        name: "Accounts can be frozen",
        severity: "medium",
        evidence: "Freeze authority is still active",
        source: token.chain === "solana" ? "rugcheck/goplus" : "goplus",
        confidence: "high",
        explanation:
          "The authority can freeze holder accounts, which can block your ability to sell.",
        category: "contract",
      }),
    );
  }

  if (security.sellTax !== null && security.sellTax > 10) {
    out.push(
      sig({
        id: "high_sell_tax",
        name: `Sell tax ${security.sellTax.toFixed(1)}%`,
        severity: "high",
        evidence: `Buy tax ${security.buyTax?.toFixed(1) ?? "?"}% / sell tax ${security.sellTax.toFixed(1)}%`,
        source: "goplus",
        confidence: "medium",
        explanation:
          "A high asymmetric sell tax is a soft honeypot: you can exit, but at a large loss.",
        category: "contract",
      }),
    );
  } else if (security.sellTax !== null && security.sellTax > 5) {
    out.push(
      sig({
        id: "moderate_sell_tax",
        name: `Sell tax ${security.sellTax.toFixed(1)}%`,
        severity: "medium",
        evidence: `Sell tax ${security.sellTax.toFixed(1)}%`,
        source: "goplus",
        confidence: "medium",
        explanation: "Above the 5% level most memecoin traders treat as acceptable.",
        category: "contract",
      }),
    );
  }

  if (security.transferFeePct !== null && security.transferFeePct > 3) {
    out.push(
      sig({
        id: "transfer_fee",
        name: `Transfer fee ${security.transferFeePct.toFixed(2)}%`,
        severity: "medium",
        evidence: `Token-2022 transfer fee ${security.transferFeePct.toFixed(2)}%`,
        source: "rugcheck/goplus",
        confidence: "high",
        explanation:
          "A Token-2022 transfer fee is charged on every transfer, including your sell.",
        category: "contract",
      }),
    );
  }

  if (security.ownerPrivileges.length > 0) {
    const dangerous = security.ownerPrivileges.filter((p) =>
      /balance|hidden|reclaim|blacklist|self-destruct|modifiable tax/.test(p),
    );
    out.push(
      sig({
        id: "owner_privileges",
        name: "Owner has dangerous privileges",
        severity: dangerous.length > 0 ? "high" : "medium",
        evidence: security.ownerPrivileges.join(", "),
        source: "goplus",
        confidence: "high",
        explanation:
          "These functions let the owner change balances, reclaim ownership, blacklist wallets or change taxes after you buy.",
        category: "contract",
      }),
    );
  }

  /* ----------------------------- liquidity ---------------------------- */
  const liq = market.liquidityUsd;
  if (liq !== null) {
    if (liq < 10_000) {
      out.push(
        sig({
          id: "liq_very_low",
          name: "Liquidity under $10K",
          severity: "critical",
          evidence: `Liquidity ${fmtUsd(liq)}`,
          source: "dexscreener",
          confidence: "high",
          explanation:
            "At this depth a single mid-sized sell can move price 50%+ and exiting is likely to be impossible at quoted prices.",
          category: "liquidity",
        }),
      );
    } else if (liq < 50_000) {
      out.push(
        sig({
          id: "liq_low",
          name: "Liquidity under $50K",
          severity: "high",
          evidence: `Liquidity ${fmtUsd(liq)}`,
          source: "dexscreener",
          confidence: "high",
          explanation:
            "Below the $50K floor used in most public pre-buy checklists. Slippage on exit will be severe.",
          category: "liquidity",
        }),
      );
    } else if (liq < 100_000) {
      out.push(
        sig({
          id: "liq_thin",
          name: "Thin liquidity",
          severity: "medium",
          evidence: `Liquidity ${fmtUsd(liq)}`,
          source: "dexscreener",
          confidence: "high",
          explanation: "Enough to trade, thin enough that whales can front-run exits.",
          category: "liquidity",
        }),
      );
    }
  }

  const lpLocked = security.lpLockedPct;
  if (lpLocked !== null && lpLocked < 50) {
    out.push(
      sig({
        id: "lp_unlocked",
        name: "LP not locked or burned",
        severity: security.lpBurned ? "low" : "high",
        evidence: `${lpLocked.toFixed(1)}% of LP locked`,
        source: token.chain === "solana" ? "rugcheck" : "goplus",
        confidence: "medium",
        explanation:
          "If the LP tokens are still in a wallet the provider controls, liquidity can be pulled at any moment (classic rug).",
        category: "liquidity",
      }),
    );
  }

  if (flow.divergence.verdict === "pump_without_liquidity") {
    out.push(
      sig({
        id: "pump_without_liq",
        name: "Price up without matching liquidity",
        severity: "high",
        evidence: `24h price ${fmtPct(flow.divergence.priceChange24h)} on ${fmtUsd(liq)} liquidity`,
        source: "dexscreener",
        confidence: "medium",
        explanation:
          "A large price move on thin liquidity is usually a few buys moving the pool, not real demand. It unwinds just as fast.",
        category: "liquidity",
      }),
    );
  }

  if (
    flow.divergence.verdict === "liquidity_drain" &&
    market.volume24h &&
    liq &&
    market.volume24h / liq > 10
  ) {
    out.push(
      sig({
        id: "high_turnover",
        name: "Extreme volume-to-liquidity turnover",
        severity: "medium",
        evidence: `24h volume ${fmtUsd(market.volume24h)} vs liquidity ${fmtUsd(liq)} (${(market.volume24h / liq).toFixed(1)}x)`,
        source: "dexscreener",
        confidence: "medium",
        explanation:
          "Turnover above 10x liquidity in a day is often bot churn or wash volume rather than new money.",
        category: "liquidity",
      }),
    );
  }

  /* -------------------------------- exit ------------------------------ */
  const ex = input.exit;
  // Single-pool exit math only describes reality for tokens whose liquidity
  // actually lives in one pool. A token with thousands of holders and a
  // month of history trades across many venues and CEXes, so these numbers
  // are downgraded instead of being presented as a red flag.
  const mature =
    (market.ageHours ?? 0) > 720 && (holders.totalHolders ?? 0) > 5_000;

  if (ex?.available && ex.topHolderExit && !mature) {
    const t = ex.topHolderExit;
    if (t.priceImpactPct >= 25) {
      out.push(
        sig({
          id: "exit_impossible",
          name: "Largest holder cannot exit through this pool",
          severity: t.priceImpactPct >= 60 ? "high" : "medium",
          evidence: `${t.supplyPct.toFixed(1)}% of supply sold into the top pool = −${t.priceImpactPct.toFixed(0)}% price (${fmtUsd(t.proceedsUsd)} out)`,
          source: "dexscreener reserves + constant-product math",
          confidence: "medium",
          explanation:
            "Single-pool constant-product math. The holder may route through other pools or OTC — but a position this large relative to visible depth is a structural cap on everyone's exit, not just theirs.",
          category: "liquidity",
        }),
      );
    }
  }

  if (ex?.available && ex.maxSellUsd.slip5 !== null && !mature) {
    const cap = ex.maxSellUsd.slip5;
    if (cap < 2_000) {
      out.push(
        sig({
          id: "position_size_cap",
          name: "Position size is capped by exit slippage",
          severity: cap < 500 ? "high" : "medium",
          evidence: `Only ${fmtUsd(cap)} can be sold before price impact exceeds 5%`,
          source: "dexscreener reserves + constant-product math",
          confidence: "high",
          explanation:
            "Size the position from the exit, not from conviction. Above this number you are the exit liquidity.",
          category: "liquidity",
        }),
      );
    }
  }

  if (ex?.available && ex.liquidityCoverage !== null && ex.liquidityCoverage < 1 && !mature) {
    out.push(
      sig({
        id: "thin_float",
        name: `Pool holds only ${ex.liquidityCoverage.toFixed(2)}% of market cap`,
        severity: ex.liquidityCoverage < 0.3 ? "high" : "medium",
        evidence: `Liquidity / market cap = ${ex.liquidityCoverage.toFixed(2)}%`,
        source: "dexscreener",
        confidence: "high",
        explanation:
          "A valuation this far above the actual liquidity is a paper price. Realising it is not possible at the quoted number.",
        category: "liquidity",
      }),
    );
  }

  /* ------------------------------ holders ----------------------------- */
  const eff = holders.meaningful ? holders.effectiveTop10Pct : null;
  if (eff !== null) {
    if (eff >= 50) {
      out.push(
        sig({
          id: "concentration_extreme",
          name: "Effective top-10 holds over half the supply",
          severity: "critical",
          evidence: `Top-10 (LP/burn excluded, clusters merged) = ${eff.toFixed(1)}%`,
          source: "rugcheck/goplus + funding trace",
          confidence: clusters.dataAvailable ? "high" : "medium",
          explanation:
            "After removing pool and burn addresses and merging wallets that share a funder, a handful of entities control the float. They can exit in one slot.",
          category: "holders",
        }),
      );
    } else if (eff >= 35) {
      out.push(
        sig({
          id: "concentration_high",
          name: "High effective concentration",
          severity: "high",
          evidence: `Effective top-10 = ${eff.toFixed(1)}%`,
          source: "rugcheck/goplus + funding trace",
          confidence: clusters.dataAvailable ? "high" : "medium",
          explanation:
            "Above the 35% level, top wallets can dump into liquidity and take the pool with them.",
          category: "holders",
        }),
      );
    } else if (eff >= 20) {
      out.push(
        sig({
          id: "concentration_moderate",
          name: "Moderate concentration",
          severity: "medium",
          evidence: `Effective top-10 = ${eff.toFixed(1)}%`,
          source: "rugcheck/goplus + funding trace",
          confidence: clusters.dataAvailable ? "high" : "medium",
          explanation:
            "Inside the 20–35% band that public checklists treat as caution rather than disqualifying.",
          category: "holders",
        }),
      );
    }
  }

  const top1 = holders.meaningful
    ? holders.rows.find((r) => r.kind === "wallet" || r.kind === "creator")
    : undefined;
  if (top1 && top1.pct > 20) {
    out.push(
      sig({
        id: "single_whale",
        name: `Single wallet holds ${top1.pct.toFixed(1)}%`,
        severity: top1.pct > 30 ? "critical" : "high",
        evidence: `${top1.owner ?? top1.address} holds ${top1.pct.toFixed(1)}%`,
        source: token.chain === "solana" ? "rugcheck" : "goplus",
        confidence: "high",
        explanation:
          "One non-pool wallet with this much supply can single-handedly break the chart.",
        category: "holders",
      }),
    );
  }

  const insiders = holders.rows.filter((r) => r.insider);
  if (insiders.length > 0) {
    out.push(
      sig({
        id: "insider_holders",
        name: `${insiders.length} holder(s) flagged as insiders`,
        severity: insiders.length >= 3 ? "high" : "medium",
        evidence: `Insider-flagged supply ${insiders.reduce((s, r) => s + r.pct, 0).toFixed(1)}%`,
        source: "rugcheck",
        confidence: "medium",
        explanation:
          "RugCheck marks wallets it links to the launch (creator-side allocation, bundlers, snipers). Flags are leads, not proof of intent.",
        category: "insiders",
      }),
    );
  }

  if (holders.totalHolders !== null && holders.totalHolders < 50) {
    out.push(
      sig({
        id: "few_holders",
        name: "Very few holders",
        severity: "medium",
        evidence: `${holders.totalHolders} holders`,
        source: token.chain === "solana" ? "rugcheck" : "goplus",
        confidence: "high",
        explanation:
          "Holder count this low means there is no distribution yet; the entire float can be moved by a handful of wallets.",
        category: "holders",
      }),
    );
  }

  /* ------------------------------ clusters ---------------------------- */
  const bundled = clusters.bundledSupplyPct;
  if (bundled !== null && bundled > 0) {
    if (bundled >= 20) {
      out.push(
        sig({
          id: "bundled_supply_critical",
          name: `Funding-linked wallets hold ${bundled.toFixed(1)}% of supply`,
          severity: "critical",
          evidence: `${clusters.groups.length} cluster(s), ${bundled.toFixed(1)}% of supply`,
          source: "solana rpc funding trace",
          confidence: "high",
          explanation:
            "Thresholds from published sybil-detection work: bundled supply under 5% is normal, 5–20% is suspicious, above 20% means the float is effectively one actor wearing several wallets.",
          category: "insiders",
        }),
      );
    } else if (bundled >= 5) {
      out.push(
        sig({
          id: "bundled_supply_suspicious",
          name: `Bundled supply ${bundled.toFixed(1)}%`,
          severity: "high",
          evidence: `${clusters.groups.length} cluster(s), ${bundled.toFixed(1)}% of supply`,
          source: "solana rpc funding trace",
          confidence: "high",
          explanation:
            "Inside the 5–20% band where coordinated holders can front-run every exit.",
          category: "insiders",
        }),
      );
    }
  }

  const biggestCluster = clusters.groups[0];
  if (biggestCluster && biggestCluster.confidence !== "low") {
    if (biggestCluster.pct >= 25) {
      out.push(
        sig({
          id: "cluster_major",
          name: "Linked wallets control a large share",
          severity: "critical",
          evidence: `${biggestCluster.members.length} wallets sharing a funder hold ${biggestCluster.pct.toFixed(1)}%`,
          source: "solana rpc funding trace",
          confidence: biggestCluster.confidence,
          explanation:
            "These wallets received SOL from the same source. Shared funding is evidence of a common operator, not proof — market makers and launchpads also fund many wallets.",
          category: "insiders",
        }),
      );
    } else if (biggestCluster.pct >= 12) {
      out.push(
        sig({
          id: "cluster_significant",
          name: "Funding-linked wallet group",
          severity: "high",
          evidence: `${biggestCluster.members.length} wallets share a funder, holding ${biggestCluster.pct.toFixed(1)}%`,
          source: "solana rpc funding trace",
          confidence: biggestCluster.confidence,
          explanation:
            "A common funder plus simultaneous holdings is the pattern behind most bundled launches.",
          category: "insiders",
        }),
      );
    }
  }

  if (flow.sameBlockBuyGroups.length > 0 && flow.sameBlockMeaningful) {
    const g = flow.sameBlockBuyGroups[0];
    out.push(
      sig({
        id: "same_block_buys",
        name: "Multiple wallets bought in the same block",
        severity: g.wallets.length >= 5 ? "high" : "medium",
        evidence: `${g.wallets.length} distinct wallets bought in block ${g.block}`,
        source: "geckoterminal trades",
        confidence: "medium",
        explanation:
          "Coordinated same-block buying is the fingerprint of a bundled launch. It can also be a router or aggregator splitting one order — check whether the wallets are linked.",
        category: "insiders",
      }),
    );
  }

  /* -------------------------------- flow ------------------------------ */
  if (flow.imbalance !== null && flow.imbalance < -0.4) {
    out.push(
      sig({
        id: "sell_pressure",
        name: "Sell pressure dominates recent trades",
        severity: "high",
        evidence: `Net flow ${(flow.imbalance * 100).toFixed(0)}% over last ${flow.windowTrades} trades`,
        source: "geckoterminal trades",
        confidence: "medium",
        explanation:
          "Recent volume is mostly exits. Buying into distribution means insiders are selling to you.",
        category: "flow",
      }),
    );
  }

  if (flow.washRatio !== null && flow.washRatio > 0.6 && flow.windowTrades >= 40) {
    out.push(
      sig({
        id: "churn",
        name: "Most volume is wallet churn",
        severity: "medium",
        evidence: `${(flow.washRatio * 100).toFixed(0)}% of volume from wallets that both bought and sold 2+ times`,
        source: "geckoterminal trades",
        confidence: "medium",
        explanation:
          "Round-trip churn inflates reported volume. It is not proof of wash trading, but real demand is smaller than the number suggests.",
        category: "flow",
      }),
    );
  }

  if (flow.topTraderShare !== null && flow.topTraderShare > 0.5 && flow.windowTrades >= 20) {
    out.push(
      sig({
        id: "single_trader_dominance",
        name: "One wallet is most of the volume",
        severity: "medium",
        evidence: `Top trader = ${(flow.topTraderShare * 100).toFixed(0)}% of observed volume`,
        source: "geckoterminal trades",
        confidence: "medium",
        explanation:
          "Volume concentrated in one wallet is usually market making or a self-trade loop, not organic interest.",
        category: "flow",
      }),
    );
  }

  /* ------------------------------ deployer ---------------------------- */
  if (deployer.ruggedCount >= 2) {
    out.push(
      sig({
        id: "serial_rugger",
        name: "Creator has multiple rugged tokens",
        severity: "critical",
        evidence: `${deployer.ruggedCount} prior tokens by ${deployer.address} are flagged rugged`,
        source: "rugcheck creatorTokens",
        confidence: "high",
        explanation:
          "Deployer history is the single strongest rug predictor available on-chain. A repeat pattern is a hard stop.",
        category: "deployer",
      }),
    );
  } else if (deployer.ruggedCount === 1) {
    out.push(
      sig({
        id: "rugged_before",
        name: "Creator rugged a previous token",
        severity: "high",
        evidence: `1 prior token by ${deployer.address} is flagged rugged`,
        source: "rugcheck creatorTokens",
        confidence: "high",
        explanation: "Same deployer, previous failure. Treat the launch as adversarial until proven otherwise.",
        category: "deployer",
      }),
    );
  }

  if (deployer.priorTokens.length >= 3) {
    out.push(
      sig({
        id: "serial_launcher",
        name: `Serial launcher (${deployer.priorTokens.length} tokens)`,
        severity: "medium",
        evidence: `Creator deployed ${deployer.priorTokens.length} other tokens`,
        source: "rugcheck creatorTokens",
        confidence: "high",
        explanation:
          "High launch volume with little follow-through is a factory pattern. Most of these tokens die within days.",
        category: "deployer",
      }),
    );
  }

  if (deployer.balancePct !== null && deployer.balancePct > 5) {
    out.push(
      sig({
        id: "creator_holds",
        name: `Creator holds ${deployer.balancePct.toFixed(1)}%`,
        severity: deployer.balancePct > 15 ? "high" : "medium",
        evidence: `Creator balance ${deployer.balancePct.toFixed(1)}% of supply`,
        source: "rugcheck/goplus",
        confidence: "high",
        explanation:
          "Creator-side supply is the first thing sold when price moves. It is exit liquidity aimed at buyers.",
        category: "deployer",
      }),
    );
  }

  /* ------------------------------- market ----------------------------- */
  if (market.ageHours !== null && market.ageHours < 1) {
    out.push(
      sig({
        id: "brand_new",
        name: "Token is less than an hour old",
        severity: "medium",
        evidence: `Pair age ${Math.round(market.ageHours * 60)} minutes`,
        source: "dexscreener",
        confidence: "high",
        explanation:
          "No holder history exists yet, so every concentration and insider metric below is a snapshot of the launch, not of distribution.",
        category: "market",
      }),
    );
  }

  const order: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function buildPositiveSignals(input: RiskInput): PositiveSignal[] {
  const { security, holders, market, flow, clusters, deployer } = input;
  const out: PositiveSignal[] = [];

  if (security.mintable === false && security.freezable === false) {
    out.push({
      id: "authorities_revoked",
      name: "Mint and freeze authority revoked",
      evidence: "No mint authority, no freeze authority",
      source: "rugcheck/goplus",
    });
  }
  if (security.lpBurned === true) {
    out.push({
      id: "lp_burned",
      name: "LP burned / fully locked",
      evidence: `LP lock ${security.lpLockedPct?.toFixed(1) ?? "100"}%`,
      source: "rugcheck/goplus",
    });
  }
  if (security.honeypot === false) {
    out.push({
      id: "sellable",
      name: "Sells are possible (no honeypot flag)",
      evidence: "GoPlus honeypot check negative",
      source: "goplus",
    });
  }
  if (holders.meaningful && holders.effectiveTop10Pct !== null && holders.effectiveTop10Pct < 20) {
    out.push({
      id: "distribution_good",
      name: "Supply is well distributed",
      evidence: `Effective top-10 ${holders.effectiveTop10Pct.toFixed(1)}%`,
      source: "holders + funding trace",
    });
  }
  if (market.liquidityUsd !== null && market.liquidityUsd > 100_000 && market.marketCap) {
    const cov = (market.liquidityUsd / market.marketCap) * 100;
    if (cov >= 2) {
      out.push({
        id: "liq_deep",
        name: "Liquidity is deep relative to market cap",
        evidence: `${fmtUsd(market.liquidityUsd)} pool vs ${fmtUsd(market.marketCap)} cap (${cov.toFixed(1)}%)`,
        source: "dexscreener",
      });
    }
  }
  if (holders.totalHolders !== null && holders.totalHolders > 1000) {
    out.push({
      id: "many_holders",
      name: "Broad holder base",
      evidence: `${holders.totalHolders} holders`,
      source: "rugcheck/goplus",
    });
  }
  if (deployer.priorTokens.length > 0 && deployer.ruggedCount === 0) {
    out.push({
      id: "clean_deployer",
      name: "Deployer has no rug history",
      evidence: `${deployer.priorTokens.length} prior tokens, none flagged rugged`,
      source: "rugcheck creatorTokens",
    });
  }
  if (flow.imbalance !== null && flow.imbalance > 0.2) {
    out.push({
      id: "net_buying",
      name: "Net buying in recent trades",
      evidence: `Net flow +${(flow.imbalance * 100).toFixed(0)}%`,
      source: "geckoterminal trades",
    });
  }
  if (clusters.dataAvailable && clusters.groups.length === 0 && clusters.unknown === 0) {
    out.push({
      id: "no_clusters",
      name: "No funding-linked wallet clusters found",
      evidence: `${clusters.traced} wallets traced to their first funding, no shared funders`,
      source: "solana rpc funding trace",
    });
  }
  if (market.ageHours !== null && market.ageHours > 168 && market.ageHours < 720) {
    out.push({
      id: "survived_week",
      name: "Survived its first week",
      evidence: `Pair age ${(market.ageHours / 24).toFixed(1)} days`,
      source: "dexscreener",
    });
  }
  return out;
}
