import type {
  PositiveSignal,
  ReportSection,
  RiskSignal,
  Verdict,
  AnalysisResult,
  TokenIdentity,
} from "../types";
import { fmtAge, fmtChange, fmtUsd } from "../http";

const WEIGHT: Record<RiskSignal["severity"], number> = {
  critical: 30,
  high: 17,
  medium: 8,
  low: 3,
  info: 0,
};

const CATEGORY_CAP: Record<RiskSignal["category"], number> = {
  contract: 40,
  liquidity: 28,
  holders: 28,
  insiders: 30,
  flow: 16,
  deployer: 32,
  market: 8,
};

export function scoreRisks(risks: RiskSignal[]): number {
  const perCategory = new Map<string, number>();
  for (const r of risks) {
    perCategory.set(r.category, (perCategory.get(r.category) ?? 0) + WEIGHT[r.severity]);
  }
  let total = 0;
  for (const [cat, raw] of perCategory) {
    const cap = CATEGORY_CAP[cat as RiskSignal["category"]] ?? 30;
    total += Math.min(raw, cap);
  }
  return Math.min(100, Math.round(total));
}

export function pickVerdict(
  score: number,
  risks: RiskSignal[],
  positives: PositiveSignal[],
): Verdict {
  const hasCritical = risks.some((r) => r.severity === "critical");
  const highs = risks.filter((r) => r.severity === "high").length;
  if (hasCritical || score >= 75) return "high_risk";
  if (score >= 50 || highs >= 2) return "caution";
  if (score >= 25) return "neutral";
  if (positives.length >= 2 && score < 15) return "strong_signals";
  return "interesting";
}

export const VERDICT_META: Record<
  Verdict,
  { label: string; blurb: string; tone: string }
> = {
  high_risk: {
    label: "HIGH RISK",
    blurb: "Multiple critical or high-severity signals. Evidence points to capital loss risk.",
    tone: "text-rose-400 border-rose-500/40 bg-rose-500/10",
  },
  caution: {
    label: "CAUTION",
    blurb: "Real risks present. Only proceed with size you can lose and a clear exit.",
    tone: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  },
  neutral: {
    label: "NEUTRAL",
    blurb: "No dealbreaker found, but no edge either. Distribution or history is unproven.",
    tone: "text-slate-300 border-slate-500/40 bg-slate-500/10",
  },
  interesting: {
    label: "INTERESTING",
    blurb: "Few hard risks and some positive on-chain signals. Worth deeper work.",
    tone: "text-sky-400 border-sky-500/40 bg-sky-500/10",
  },
  strong_signals: {
    label: "STRONG SIGNALS",
    blurb: "Clean contract, distributed supply, no rug history. Still not a recommendation.",
    tone: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  },
};

export function buildTldr(
  token: TokenIdentity,
  result: Pick<
    AnalysisResult,
    "market" | "holders" | "clusters" | "flow" | "security" | "deployer" | "risks" | "exit"
  >,
): string[] {
  const { market, holders, clusters, flow, security, deployer, risks, exit } = result;
  const lines: string[] = [];

  const age = fmtAge(market.ageHours);
  const liq = fmtUsd(market.liquidityUsd);
  const mcap = fmtUsd(market.marketCap ?? market.fdv);
  const ch = fmtChange(market.priceChange.h24, market.ageHours);
  lines.push(
    `${token.symbol} on ${token.chain} — ${mcap} cap, ${liq} liquidity, ${age} old, ${ch.text}${ch.label ? ` ${ch.label}` : ""}.`,
  );

  const eff = holders.effectiveTop10Pct ?? clusters.effectiveTop10Pct;
  if (!holders.meaningful) {
    lines.push(
      holders.note ??
        "Holder concentration is not assessable yet — supply is still inside the launch mechanism.",
    );
  } else if (eff !== null) {
    const clusterNote =
      clusters.groups.length > 0
        ? ` (${clusters.groups.length} funding-linked group${clusters.groups.length > 1 ? "s" : ""} merged)`
        : "";
    lines.push(
      `Effective top-10 ownership ${eff.toFixed(1)}% after removing LP/burn and merging linked wallets${clusterNote}.`,
    );
  } else {
    lines.push("Holder distribution unavailable from current data sources.");
  }

  const topRisk = risks[0];
  if (topRisk) {
    lines.push(`Top risk — ${topRisk.name}: ${topRisk.evidence}.`);
  } else {
    lines.push("No risk signal fired from the checks available on this chain.");
  }

  if (deployer.priorTokens.length > 0) {
    lines.push(
      `Deployer has ${deployer.priorTokens.length} prior launch(es), ${deployer.ruggedCount} flagged rugged.`,
    );
  }

  if (flow.dataAvailable) {
    const imb = flow.imbalance ?? 0;
    lines.push(
      `Recent flow: ${flow.buys} buys / ${flow.sells} sells across ${flow.uniqueTraders} wallets, net ${(imb * 100).toFixed(0)}%.`,
    );
  }

  const ex = exit;
  if (ex?.available && ex.maxSellUsd.slip5 !== null) {
    lines.push(
      `Exit: at most ${fmtUsd(ex.maxSellUsd.slip5)} can be sold into the top pool before slippage passes 5%${
        ex.topHolderExit ? `, and the largest holder's full position would move price ${ex.topHolderExit.priceImpactPct.toFixed(0)}%` : ""
      }.`,
    );
  }

  if (security.honeypot === true) lines.push("⚠ GoPlus flags this token as a honeypot.");
  return lines.slice(0, 5);
}

export function buildReport(
  token: TokenIdentity,
  r: AnalysisResult,
): ReportSection[] {
  const sections: ReportSection[] = [];
  const { market, holders, clusters, flow, security, deployer, risks, positives } = r;

  sections.push({
    title: "Narrative",
    body:
      [
        `Token: ${token.name} (${token.symbol}) on ${token.chain}${token.dexId ? `, primary venue ${token.dexId}` : ""}.`,
        security.launchpad ? `Launched via ${security.launchpad}.` : "",
        `Pair age ${fmtAge(market.ageHours)}.`,
        "Narrative and social layer are not scored in this build: no X/KOL data source is configured, so anything about community quality here would be invented. Treat the story as unverified.",
      ]
        .filter(Boolean)
        .join(" "),
    citations: ["dexscreener", "rugcheck"],
  });

  const holderBody = holders.dataAvailable
    ? [
        `${holders.totalHolders ?? "?"} holders.`,
        `Top-10 raw ${holders.top10Pct?.toFixed(1) ?? "?"}%, excluding LP/burn ${holders.top10PctAdjusted?.toFixed(1) ?? "?"}%, effective after cluster merge ${holders.effectiveTop10Pct?.toFixed(1) ?? "?"}%.`,
        `LP/burn addresses account for ${holders.excludedPct.toFixed(1)}% and were removed from the ranking.`,
        clusters.groups.length > 0
          ? `${clusters.groups.length} wallet group(s) share a funding source, largest ${clusters.groups[0].pct.toFixed(1)}% across ${clusters.groups[0].members.length} wallets (confidence ${clusters.groups[0].confidence}).`
          : clusters.dataAvailable
            ? "No shared-funder clusters found among traced wallets."
            : "Cluster tracing unavailable.",
      ].join(" ")
    : "Holder data unavailable on this chain from the free sources in use.";

  sections.push({
    title: "On-chain",
    body: holderBody,
    citations: ["rugcheck", "goplus", "solana rpc"],
    unavailable: !holders.dataAvailable,
  });

  sections.push({
    title: "Smart money",
    body:
      "Wallet PnL, win-rate and smart-money labels require a paid data provider (Birdeye/GMGN/Nansen). This build does not fabricate them. What you can read instead: which wallets bought in the earliest observed blocks and whether their funding is shared.",
    citations: [],
    unavailable: true,
  });

  sections.push({
    title: "Flow & liquidity",
    body: flow.dataAvailable
      ? [
          `Last ${flow.windowTrades} trades: ${flow.buys} buys / ${flow.sells} sells, buy volume ${fmtUsd(flow.buyVolumeUsd)} vs sell volume ${fmtUsd(flow.sellVolumeUsd)}.`,
          `${flow.uniqueTraders} distinct wallets, ${flow.tradesPerTrader?.toFixed(1)} trades each.`,
          flow.topTraderShare !== null
            ? `Top trader share of volume ${(flow.topTraderShare * 100).toFixed(0)}%.`
            : "",
          flow.washRatio !== null
            ? `Churn ratio (wallets both buying and selling 2+ times) ${(flow.washRatio * 100).toFixed(0)}%.`
            : "",
          flow.sameBlockBuyGroups.length > 0
            ? `${flow.sameBlockBuyGroups.length} block(s) with 3+ distinct buyers — possible bundle.`
            : "",
          `Divergence check: ${flow.divergence.verdict.replaceAll("_", " ")}.`,
        ]
          .filter(Boolean)
          .join(" ")
      : "Trade-level data unavailable for this pair.",
    citations: ["geckoterminal", "dexscreener"],
    unavailable: !flow.dataAvailable,
  });

  sections.push({
    title: "Exit liquidity",
    body: r.exit.available
      ? [
          `Top pool holds ${fmtUsd(r.exit.reserves?.quoteReserveUsd ?? null)} of quote depth (${fmtUsd(r.exit.reserves?.baseReserveUsd ?? null)} of token value).`,
          `Max sell before 1% / 5% / 10% price impact: ${fmtUsd(r.exit.maxSellUsd.slip1)} / ${fmtUsd(r.exit.maxSellUsd.slip5)} / ${fmtUsd(r.exit.maxSellUsd.slip10)}.`,
          r.exit.topHolderExit
            ? `Largest non-pool wallet (${r.exit.topHolderExit.supplyPct.toFixed(1)}% of supply) selling in full would return ${fmtUsd(r.exit.topHolderExit.proceedsUsd)} and move price ${r.exit.topHolderExit.priceImpactPct.toFixed(0)}%.`
            : "",
          r.exit.liquidityCoverage !== null
            ? `Pool liquidity is ${r.exit.liquidityCoverage.toFixed(2)}% of market cap.`
            : "",
          "Constant-product math on one pool. Multi-pool routing, aggregators and CEX depth are not included, so treat these as a lower bound on depth.",
        ]
          .filter(Boolean)
          .join(" ")
      : (r.exit.reason ?? "Exit impact unavailable."),
    citations: ["dexscreener"],
    unavailable: !r.exit.available,
  });

  sections.push({
    title: "Risks",
    body:
      risks.length > 0
        ? risks
            .map(
              (s) =>
                `[${s.severity.toUpperCase()}] ${s.name} — ${s.evidence} (source: ${s.source}, confidence: ${s.confidence}). ${s.explanation}`,
            )
            .join("\n\n")
        : "No risk signal fired from the checks available.",
    citations: [...new Set(risks.map((s) => s.source))],
  });

  sections.push({
    title: "Positive signals",
    body:
      positives.length > 0
        ? positives.map((p) => `• ${p.name} — ${p.evidence} (${p.source})`).join("\n")
        : "None detected.",
    citations: [...new Set(positives.map((p) => p.source))],
  });

  sections.push({
    title: "What to watch next",
    body: [
      deployer.address
        ? `Watch the deployer wallet ${deployer.address} for transfers or sells.`
        : "",
      holders.rows[0]
        ? `Watch the largest non-pool wallet ${holders.rows[0].owner ?? holders.rows[0].address} (${holders.rows[0].pct.toFixed(1)}%).`
        : "",
      market.liquidityUsd !== null
        ? `Watch liquidity: a drop below ${fmtUsd(market.liquidityUsd * 0.7)} means LP is leaving.`
        : "",
      security.lpLockedPct !== null && security.lpLockedPct < 95
        ? "Watch LP lock status — the pool is not fully locked."
        : "",
      "Watch for a real sell transaction from an unrelated wallet to disprove honeypot risk.",
    ]
      .filter(Boolean)
      .join(" "),
    citations: ["dexscreener", "rugcheck"],
  });

  return sections;
}

export const DISCLAIMER =
  "Analytical tool, not financial advice. Signals are derived from public on-chain and market data at the timestamp shown; they can be wrong, stale, or gamed. Never trade on this output alone.";
