import type {
  ClusterAnalysis,
  DeployerAnalysis,
  ExitAnalysis,
  FlowAnalysis,
  HolderAnalysis,
  MarketData,

  SecurityData,
  TokenIdentity,
} from "../types";
import { fmtUsd } from "../http";

/**
 * Buy/skip decision engine.
 *
 * This is deliberately NOT a price prediction and NOT advice. It reproduces the
 * rejection standard that on-chain checklists converge on: which conditions make
 * a token un-investable, which are merely expensive, and what a trader would need
 * to see to change the answer.
 *
 * Thresholds are taken from published checklists (see MARKET_RESEARCH.md):
 *   top-10 ex-pool   ≤15% green / 15–30% caution / >30% red
 *   dev holdings     ≤3% green / 3–10% caution / >10% red
 *   LP locked        ≥90% green / 50–90% caution / <50% red
 *   bundled supply   <5% noise / 5–20% suspicious / >20% critical
 *   snipers          <10% / 10–20% / >20%
 *   liquidity/mcap   ≥10% healthy for micro-caps
 *   buy/sell         ~60/40–70/30 healthy, <50/50 the snipers already sold
 * They are heuristics agreed on by practitioners, not laws of nature.
 */

export type Stance = "avoid" | "high_risk" | "size_down" | "tradeable" | "cleanest";

export interface GateResult {
  id: string;
  label: string;
  state: "pass" | "caution" | "fail" | "unknown";
  reading: string;
  source: string;
}

export interface Decision {
  stance: Stance;
  headline: string;
  oneLiner: string;
  /** Conditions that would change the answer — the most useful part of any call. */
  wouldChange: string[];
  gates: GateResult[];
  /** Hard fails: any one of these means the answer is no, regardless of the rest. */
  hardFails: GateResult[];
  softWarnings: GateResult[];
  /** Position sizing implied by the exit math, in USD. */
  suggestedMaxSizeUsd: number | null;
  confidence: "high" | "medium" | "low";
  caveat: string;
}

export const STANCE_META: Record<
  Stance,
  { label: string; tone: string; blurb: string }
> = {
  avoid: {
    label: "AVOID",
    tone: "text-rose-300 border-rose-500/50 bg-rose-500/12",
    blurb: "A hard disqualifier is open. No size makes this a good trade.",
  },
  high_risk: {
    label: "HIGH RISK",
    tone: "text-orange-300 border-orange-500/50 bg-orange-500/12",
    blurb: "Multiple serious problems. Most traders would skip; if not, treat it as a lottery ticket.",
  },
  size_down: {
    label: "SIZE DOWN",
    tone: "text-amber-300 border-amber-500/50 bg-amber-500/12",
    blurb: "No dealbreaker, but the exit is the binding constraint. The position size matters more than the thesis.",
  },
  tradeable: {
    label: "TRADEABLE",
    tone: "text-sky-300 border-sky-500/50 bg-sky-500/12",
    blurb: "Passes the rejection standard. That is not the same as a good entry — timing and narrative are still yours to judge.",
  },
  cleanest: {
    label: "CLEANEST BUCKET",
    tone: "text-emerald-300 border-emerald-500/50 bg-emerald-500/12",
    blurb: "Contract, distribution and creator history are all clean. Rare, and still not a recommendation.",
  },
};

interface Input {
  token: TokenIdentity;
  market: MarketData;
  security: SecurityData;
  holders: HolderAnalysis;
  clusters: ClusterAnalysis;
  flow: FlowAnalysis;
  deployer: DeployerAnalysis;
  exit: ExitAnalysis;
}

function gate(
  id: string,
  label: string,
  state: GateResult["state"],
  reading: string,
  source: string,
): GateResult {
  return { id, label, state, reading, source };
}

export function buildDecision(input: Input): Decision {
  const { token, market, security, holders, clusters, flow, deployer, exit } = input;
  const gates: GateResult[] = [];

  // Most checklist thresholds are calibrated on fresh launches. Applying them
  // unchanged to a multi-year token produces confident nonsense, so gates that
  // depend on launch-time behaviour branch on age.
  const ageH = market.ageHours ?? 0;
  const young = ageH < 720; // 30 days
  const isEvm = token.chain !== "solana";

  /* ----------------------------- contract ----------------------------- */
  // EVM tokens can implement a sell block in the transfer function; Solana
  // cannot — the only route is a freeze authority, which has its own gate. So
  // this check is EVM-only rather than universally "unknown".
  if (security.honeypot === true) {
    gates.push(gate("honeypot", "Can you sell at all", "fail", "GoPlus flags a honeypot or sell block", "goplus"));
  } else if (security.honeypot === false) {
    gates.push(gate("honeypot", "Can you sell at all", "pass", "Sell path not blocked", "goplus"));
  } else if (isEvm) {
    gates.push(gate("honeypot", "Can you sell at all", "unknown", "Honeypot check did not return", "goplus"));
  }

  if (security.mintable === true) {
    gates.push(
      gate(
        "mint",
        "Supply is fixed",
        young ? "fail" : "caution",
        young ? "Mint authority still active" : "Mint authority active — normal for mature tokens, fatal for a new launch",
        "rugcheck/goplus",
      ),
    );
  } else if (security.mintable === false) {
    gates.push(gate("mint", "Supply is fixed", "pass", "Mint authority revoked", "rugcheck/goplus"));
  } else {
    gates.push(gate("mint", "Supply is fixed", "unknown", "Authority state not readable", "rugcheck/goplus"));
  }

  if (security.freezable === true) {
    gates.push(
      gate(
        "freeze",
        "Your wallet cannot be frozen",
        young ? "fail" : "caution",
        young ? "Freeze authority still active" : "Freeze authority active — can lock individual wallets",
        "rugcheck/goplus",
      ),
    );
  } else if (security.freezable === false) {
    gates.push(gate("freeze", "Your wallet cannot be frozen", "pass", "Freeze authority revoked", "rugcheck/goplus"));
  }

  const tax = Math.max(security.buyTax ?? 0, security.sellTax ?? 0, security.transferFeePct ?? 0);
  if (tax >= 10) {
    gates.push(gate("tax", "Round-trip cost", "fail", `${tax.toFixed(1)}% tax eats the trade`, "goplus"));
  } else if (tax >= 3) {
    gates.push(gate("tax", "Round-trip cost", "caution", `${tax.toFixed(1)}% tax`, "goplus"));
  } else if (security.dataAvailable) {
    gates.push(gate("tax", "Round-trip cost", "pass", tax > 0 ? `${tax.toFixed(1)}% tax` : "No buy/sell tax", "goplus"));
  }

  /* ----------------------------- liquidity ---------------------------- */
  const lp = security.lpLockedPct;
  const curve = security.lpBurned === true && (lp === null || lp >= 99);
  if (curve) {
    gates.push(gate("lp", "Liquidity cannot be pulled", "pass", "Launchpad curve — no LP token to rug", "rugcheck"));
  } else if (lp === null) {
    gates.push(gate("lp", "Liquidity cannot be pulled", "unknown", "LP lock state unreadable", "rugcheck/goplus"));
  } else if (lp >= 90) {
    gates.push(gate("lp", "Liquidity cannot be pulled", "pass", `${lp.toFixed(0)}% locked or burned`, "rugcheck/goplus"));
  } else if (lp >= 50) {
    gates.push(gate("lp", "Liquidity cannot be pulled", "caution", `${lp.toFixed(0)}% locked`, "rugcheck/goplus"));
  } else {
    gates.push(gate("lp", "Liquidity cannot be pulled", "fail", `Only ${lp.toFixed(0)}% locked — pullable`, "rugcheck/goplus"));
  }

  /* --------------------------- exit capacity -------------------------- */
  // Liquidity depth, pool-vs-valuation, and slippage capacity all answer one
  // question: can you get out? Counting them as three separate fails would
  // triple-penalise a single problem, so they collapse into one gate that
  // reports whichever constraint binds first.
  const liq = market.liquidityUsd;
  const cov = exit.liquidityCoverage;
  const cap = exit.available ? exit.maxSellUsd.slip5 : null;
  const exitProblems: string[] = [];
  let exitState: GateResult["state"] = "pass";

  if (liq !== null && liq < 10_000) {
    exitProblems.push(`pool only ${fmtUsd(liq)}`);
    exitState = "fail";
  } else if (liq !== null && liq < 50_000) {
    exitProblems.push(`${fmtUsd(liq)} liquidity`);
    exitState = "caution";
  }

  if (cov !== null && young) {
    if (cov < 1) {
      exitProblems.push(`pool is ${cov.toFixed(2)}% of market cap — price is not real`);
      exitState = "fail";
    } else if (cov < 5) {
      exitProblems.push(`pool is ${cov.toFixed(1)}% of market cap`);
      if (exitState === "pass") exitState = "caution";
    }
  }

  if (cap !== null) {
    if (cap < 2_000) {
      exitProblems.push(`5% slippage after ${fmtUsd(cap)}`);
      exitState = "fail";
    } else if (cap < 10_000) {
      exitProblems.push(`5% slippage after ${fmtUsd(cap)}`);
      if (exitState === "pass") exitState = "caution";
    }
  }

  if (exitProblems.length > 0) {
    gates.push(gate("exit", "Can you actually get out", exitState, exitProblems.join(" · "), "dexscreener reserves"));
  } else if (liq !== null) {
    gates.push(
      gate(
        "exit",
        "Can you actually get out",
        "pass",
        `${fmtUsd(liq)} pool${cap !== null ? `, ${fmtUsd(cap)} before 5% slippage` : ""}`,
        "dexscreener reserves",
      ),
    );
  } else {
    gates.push(gate("exit", "Can you actually get out", "unknown", "Reserves unreadable", "dexscreener"));
  }

  /* ------------------------------ holders ----------------------------- */
  // Concentration thresholds from public checklists are calibrated on NEW
  // launches. A four-year-old token with two million holders will always show a
  // large top-10 — that is custody, not a bundle. So the strict bands only apply
  // while the token is young; for mature pairs only an extreme reading counts.
  if (holders.meaningful && holders.effectiveTop10Pct !== null) {
    const eff = holders.effectiveTop10Pct;
    let state: GateResult["state"];
    if (young) {
      state = eff <= 15 ? "pass" : eff <= 30 ? "caution" : "fail";
    } else {
      state = eff <= 40 ? "pass" : eff <= 65 ? "caution" : "fail";
    }
    gates.push(
      gate(
        "top10",
        `Supply spread (LP/burn excluded, clusters merged)`,
        state,
        `Top-10 = ${eff.toFixed(1)}%${young ? "" : " · mature pair, looser band"}`,
        "rugcheck/goplus + funding trace",
      ),
    );
  } else if (holders.dataAvailable) {
    gates.push(gate("top10", "Supply spread", "unknown", holders.note ?? "Supply still in the curve", "rugcheck"));
  }

  if (deployer.balancePct !== null) {
    const d = deployer.balancePct;
    gates.push(
      gate(
        "dev_hold",
        "Creator holds little",
        d <= 3 ? "pass" : d <= 10 ? "caution" : "fail",
        `${d.toFixed(2)}% of supply`,
        "rugcheck/goplus",
      ),
    );
  } else if (deployer.dataAvailable) {
    gates.push(gate("dev_hold", "Creator holds little", "unknown", "Creator balance unreadable", "rugcheck"));
  }

  const bundled = clusters.bundledSupplyPct;
  if (clusters.dataAvailable && bundled !== null) {
    gates.push(
      gate(
        "bundle",
        "Bundled / linked supply",
        bundled < 5 ? "pass" : bundled < 20 ? "caution" : "fail",
        `${bundled.toFixed(1)}% held by wallets that share a funder`,
        "solana rpc funding trace",
      ),
    );
  } else {
    gates.push(
      gate(
        "bundle",
        "Bundled / linked supply",
        "unknown",
        clusters.note ?? "Funding trace unavailable",
        "solana rpc funding trace",
      ),
    );
  }

  if (deployer.ruggedCount > 0) {
    gates.push(
      gate("deployer", "Creator history", "fail", `${deployer.ruggedCount} prior token(s) rugged`, "rugcheck creatorTokens"),
    );
  } else if (deployer.dataAvailable && deployer.priorTokens.length > 0) {
    gates.push(
      gate("deployer", "Creator history", "pass", `${deployer.priorTokens.length} prior launch(es), none rugged`, "rugcheck creatorTokens"),
    );
  } else if (deployer.dataAvailable) {
    gates.push(gate("deployer", "Creator history", "pass", "Fresh wallet — no prior launches to judge", "rugcheck"));
  }

  /* -------------------------------- flow ------------------------------ */
  if (flow.dataAvailable && flow.imbalance !== null) {
    const imb = flow.imbalance;
    gates.push(
      gate(
        "flow",
        "Buy vs sell pressure",
        imb > 0.2 ? "pass" : imb > -0.2 ? "caution" : "fail",
        `Net ${(imb * 100).toFixed(0)}% by volume over ${flow.windowTrades} trades`,
        "geckoterminal trades",
      ),
    );
  }

  /* ----------------------------- aggregation --------------------------- */
  const hardFails = gates.filter((g) => g.state === "fail");
  const softWarnings = gates.filter((g) => g.state === "caution");
  const unknowns = gates.filter((g) => g.state === "unknown");
  const passes = gates.filter((g) => g.state === "pass");

  let stance: Stance;
  if (hardFails.length > 0) {
    stance = hardFails.length >= 2 ? "avoid" : "high_risk";
    // A contract-level fail is not a "size down" situation; a liquidity or
    // flow fail can still be a deliberate degen trade.
    const contractFail = hardFails.some((g) => ["honeypot", "mint", "freeze", "tax", "deployer"].includes(g.id));
    if (contractFail) stance = "avoid";
  } else if (softWarnings.length >= 3) {
    stance = "size_down";
  } else if (passes.length >= 6 && softWarnings.length <= 1) {
    stance = "tradeable";
  } else {
    stance = "size_down";
  }

  // "Cleanest bucket" needs a genuinely clean sheet, not just few warnings.
  if (
    stance === "tradeable" &&
    softWarnings.length === 0 &&
    unknowns.length === 0 &&
    passes.length >= 8
  ) {
    stance = "cleanest";
  }

  const meta = STANCE_META[stance];
  const headline = meta.label;

  let oneLiner: string;
  if (hardFails.length > 0) {
    oneLiner = `${hardFails.length} hard disqualifier${hardFails.length > 1 ? "s" : ""}: ${hardFails
      .map((g) => g.label.toLowerCase())
      .join(", ")}.`;
  } else if (softWarnings.length > 0) {
    oneLiner = `Nothing disqualifying, but ${softWarnings.length} caution${softWarnings.length > 1 ? "s" : ""} — ${softWarnings
      .map((g) => g.label.toLowerCase())
      .join(", ")}.`;
  } else {
    oneLiner = `All ${passes.length} checked conditions are within the range most checklists treat as acceptable.`;
  }

  /* --------------------- what would change the answer ------------------- */
  const wouldChange: string[] = [];
  for (const f of hardFails) {
    if (f.id === "lp") wouldChange.push("LP burned or locked ≥90% — removes the pull-liquidity exit");
    if (f.id === "mint") wouldChange.push("Mint authority revoked — removes the dilution path");
    if (f.id === "freeze") wouldChange.push("Freeze authority revoked — removes the ability to lock your wallet");
    if (f.id === "honeypot") wouldChange.push("A confirmed sell from an unrelated wallet — disproves the honeypot flag");
    if (f.id === "deployer") wouldChange.push("Nothing. Deployer rug history is the one signal you cannot explain away");
    if (f.id === "top10") wouldChange.push("Distribution: top-10 falling below 30% after LP/burn exclusion");
    if (f.id === "liq" || f.id === "liq_cov") wouldChange.push("Liquidity deeper than the position you intend to take");
    if (f.id === "exit") wouldChange.push("Deeper pool depth, or a size small enough that 5% slippage does not matter");
    if (f.id === "tax") wouldChange.push("Tax removed or reduced below 3%");
    if (f.id === "flow") wouldChange.push("A shift to net buying across many distinct wallets");
  }
  for (const w of softWarnings) {
    if (w.id === "bundle") wouldChange.push("Re-trace showing the linked wallets are an exchange or launchpad, not one operator");
    if (w.id === "dev_hold") wouldChange.push("Creator selling down to under 3%");
    if (w.id === "liq") wouldChange.push("Liquidity growing past $50K without the price moving");
  }
  if (unknowns.length > 0) {
    wouldChange.push(
      `Resolve ${unknowns.length} unknown check${unknowns.length > 1 ? "s" : ""} (${unknowns
        .map((u) => u.label.toLowerCase())
        .join(", ")}) — an unknown is not a pass`,
    );
  }
  if (wouldChange.length === 0) {
    wouldChange.push("A larger sample of holders and trades — this snapshot is a moment, not a trend");
  }

  /* ------------------------------ sizing ------------------------------ */
  const suggestedMaxSizeUsd = exit.available && exit.maxSellUsd.slip1 !== null
    ? Math.round(exit.maxSellUsd.slip1)
    : null;

  // Confidence reflects data coverage, not the strength of the call. Only gaps
  // that could change the answer count — a missing creator balance on a token
  // whose top-10 is already traced says little about the conclusion.
  const decisionGates = new Set(["honeypot", "freeze", "mint", "lp", "exit", "top10", "bundle", "deployer", "tax"]);
  const criticalUnknowns = unknowns.filter((g) => decisionGates.has(g.id));
  const confidence: Decision["confidence"] =
    criticalUnknowns.length === 0 && passes.length >= 5
      ? "high"
      : criticalUnknowns.length <= 1
        ? "medium"
        : "low";

  const caveat =
    "This is a rejection standard, not a recommendation. It tells you which rules a token breaks; it cannot tell you whether the price will go up, and it does not know the narrative, the team, or what the market already priced in.";

  return {
    stance,
    headline,
    oneLiner,
    wouldChange: [...new Set(wouldChange)].slice(0, 6),
    gates,
    hardFails,
    softWarnings,
    suggestedMaxSizeUsd,
    confidence,
    caveat,
  };
}


