import type { HolderAnalysis, HolderRow } from "../types";

const EXCLUDED: HolderRow["kind"][] = ["lp", "burn"];

export function computeHolderAnalysis(
  rows: HolderRow[],
  totalHolders: number | null,
  clusters?: Map<string, string>,
): HolderAnalysis {
  const sorted = [...rows].sort((a, b) => b.pct - a.pct);
  const dataAvailable = sorted.length > 0;

  const sum = (list: HolderRow[]) => list.reduce((s, r) => s + r.pct, 0);
  const excludedPct = sum(sorted.filter((r) => EXCLUDED.includes(r.kind)));

  // Rank holders excluding LP and burn addresses (they cannot dump on you).
  const adjusted = sorted.filter((r) => !EXCLUDED.includes(r.kind));
  const adjustedPct = adjusted.reduce((s, r) => s + r.pct, 0);

  // A bonding-curve token has ~100% of supply in one program account. Reporting
  // "effective top-10 = 0%" there reads as perfectly distributed, which is the
  // opposite of the truth: nobody holds it yet and every buy moves the curve.
  const meaningful = dataAvailable && adjustedPct >= 1 && adjusted.length >= 2;
  let note: string | undefined;
  if (dataAvailable && !meaningful) {
    note =
      adjusted.length === 0
        ? "All tracked supply sits in a pool or bonding curve — there is no holder base yet. Concentration cannot be assessed."
        : "Less than 1% of supply is held outside the pool/curve, so concentration numbers describe the launch mechanism, not real distribution.";
  }
  const top10PctAdjusted = dataAvailable ? sum(adjusted.slice(0, 10)) : null;
  const top20Pct = dataAvailable ? sum(adjusted.slice(0, 20)) : null;
  const top10Pct = dataAvailable ? sum(sorted.slice(0, 10)) : null;

  // Merge wallets that belong to the same entity (same owner key or cluster).
  const groups = new Map<string, number>();
  for (const r of adjusted) {
    const cluster = clusters?.get(r.owner ?? r.address);
    const key = cluster ?? r.owner ?? r.address;
    groups.set(key, (groups.get(key) ?? 0) + r.pct);
  }
  const groupTotals = [...groups.values()].sort((a, b) => b - a);
  const effectiveTop10Pct = dataAvailable
    ? groupTotals.slice(0, 10).reduce((s, v) => s + v, 0)
    : null;

  const buckets = [
    { bucket: "> 5%", min: 5, max: Infinity },
    { bucket: "1–5%", min: 1, max: 5 },
    { bucket: "0.1–1%", min: 0.1, max: 1 },
    { bucket: "< 0.1%", min: 0, max: 0.1 },
  ];
  const distribution = buckets.map((b) => {
    const inBucket = adjusted.filter((r) => r.pct >= b.min && r.pct < b.max);
    return {
      bucket: b.bucket,
      pct: inBucket.reduce((s, r) => s + r.pct, 0),
      count: inBucket.length,
    };
  });

  return {
    totalHolders,
    rows: sorted.slice(0, 25),
    top10Pct,
    top10PctAdjusted,
    top20Pct,
    effectiveTop10Pct,
    excludedPct,
    distribution,
    dataAvailable,
    meaningful,
    note,
  };
}

export function holderKindLabel(kind: HolderRow["kind"]): string {
  switch (kind) {
    case "lp":
      return "LP / Pool";
    case "burn":
      return "Burn";
    case "exchange":
      return "Exchange";
    case "contract":
      return "Contract";
    case "locker":
      return "Locker";
    case "creator":
      return "Creator";
    default:
      return "Wallet";
  }
}

/** Concentration benchmarks from public trader checklists (heuristic, not law). */
export function concentrationBand(pct: number | null): {
  band: "low" | "moderate" | "high" | "extreme" | "unknown";
  note: string;
} {
  if (pct === null) return { band: "unknown", note: "Holder data unavailable" };
  if (pct < 20)
    return { band: "low", note: "Below the 20–30% caution band used in trader checklists" };
  if (pct < 35)
    return { band: "moderate", note: "Inside the 20–35% caution band — a few wallets can move price" };
  if (pct < 50)
    return { band: "high", note: "Above 35% — top wallets can dump into liquidity at will" };
  return { band: "extreme", note: "Above 50% — supply is effectively controlled by a few actors" };
}
