import type {
  ClusterAnalysis,
  ClusterEdge,
  ClusterNode,
  Confidence,
  FlowAnalysis,
  HolderRow,
} from "../types";
import { findFirstFunder, type FunderResult } from "../providers/solana-rpc";

const TRACEABLE: HolderRow["kind"][] = ["wallet", "creator"];

async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface ClusterInput {
  rows: HolderRow[];
  flow: FlowAnalysis;
  knownAccounts?: Record<string, { name?: string; type?: string }>;
  isSolana: boolean;
  maxWallets?: number;
  /** Wall-clock budget for RPC tracing; returns partial results when exceeded. */
  budgetMs?: number;
}

export async function computeClusters(input: ClusterInput): Promise<ClusterAnalysis> {
  const {
    rows,
    flow,
    knownAccounts = {},
    isSolana,
    maxWallets = 6,
    budgetMs = 12_000,
  } = input;

  const candidates = rows.filter((r) => TRACEABLE.includes(r.kind)).slice(0, maxWallets);

  if (!isSolana) {
    return {
      nodes: rows.slice(0, 20).map((r) => ({
        id: r.owner ?? r.address,
        address: r.owner ?? r.address,
        pct: r.pct,
        kind: r.kind,
        label: r.label,
        confidence: "low" as Confidence,
      })),
      edges: [],
      groups: [],
      effectiveTop10Pct: null,
      bundledSupplyPct: null,
      traced: 0,
      total: rows.length,
      unknown: 0,
      dataAvailable: false,
      note: "Funding-graph tracing is Solana-only in this build. EVM clusters need decoded transfer logs (not in the free tier we use).",
    };
  }

  const startedAt = Date.now();
  const timedOut = () => Date.now() - startedAt > budgetMs;

  const traced = await pool(candidates, 2, async (row) => {
    const wallet = row.owner ?? row.address;
    if (timedOut()) {
      return {
        wallet,
        pct: row.pct,
        kind: row.kind,
        label: row.label,
        funder: { status: "unknown", reason: "Skipped: cluster trace hit its time budget" } as FunderResult,
      };
    }
    const funder = await findFirstFunder(wallet, { probe: 2, maxPages: 2 });
    return { wallet, pct: row.pct, kind: row.kind, label: row.label, funder };
  });

  const nodes: ClusterNode[] = [];
  const edges: ClusterEdge[] = [];
  const byFunder = new Map<string, { wallet: string; pct: number }[]>();
  let tracedCount = 0;
  let unknownCount = 0;

  for (const t of traced) {
    const found = t.funder.status === "found" ? t.funder : null;
    const known = knownAccounts[found?.funder ?? ""];
    if (t.funder.status === "unknown") unknownCount += 1;
    nodes.push({
      id: t.wallet,
      address: t.wallet,
      pct: t.pct,
      kind: t.kind,
      label: t.label,
      fundingSource: found?.funder,
      fundingLabel: known?.name,
      confidence: found ? "medium" : t.funder.status === "unknown" ? "low" : "medium",
    });
    if (!found) continue;
    tracedCount += 1;
    const list = byFunder.get(found.funder) ?? [];
    list.push({ wallet: t.wallet, pct: t.pct });
    byFunder.set(found.funder, list);
    edges.push({
      from: found.funder,
      to: t.wallet,
      type: "funding",
      confidence: found.sol > 0 ? "medium" : "low",
    });
  }

  // Same-block coordinated buys are weaker evidence than a shared funder,
  // but they are real on-chain observations — record them as edges.
  for (const group of flow.sameBlockBuyGroups.slice(0, 4)) {
    const members = group.wallets.filter((w) =>
      nodes.some((n) => n.address === w),
    );
    for (let i = 1; i < members.length; i++) {
      edges.push({
        from: members[0],
        to: members[i],
        type: "same_block_buy",
        confidence: "medium",
      });
    }
    for (const m of members) {
      const node = nodes.find((n) => n.address === m);
      if (node) node.sameBlockAs = members.filter((x) => x !== m);
    }
  }

  const groups = [...byFunder.entries()]
    .filter(([, wallets]) => wallets.length >= 2)
    .map(([funder, wallets]) => {
      const known = knownAccounts[funder];
      const isInfra = Boolean(known?.type);
      const pctSum = wallets.reduce((s, w) => s + w.pct, 0);
      const confidence: Confidence = isInfra ? "low" : wallets.length >= 3 ? "high" : "medium";
      return {
        id: funder,
        label: known?.name ? `Funded by ${known.name}` : `Shared funder ${funder.slice(0, 6)}…`,
        pct: pctSum,
        members: wallets.map((w) => w.wallet),
        confidence,
        isInfra,
      };
    })
    .filter((g) => !g.isInfra)
    .sort((a, b) => b.pct - a.pct)
    .map((g) => {
      const { isInfra: _drop, ...rest } = g;
      void _drop;
      return rest;
    });

  // Effective top-10 after merging cluster groups into single entities.
  const clusterMap = new Map<string, string>();
  for (const g of groups) for (const m of g.members) clusterMap.set(m, g.id);
  const adjusted = rows.filter((r) => r.kind !== "lp" && r.kind !== "burn");
  const entityTotals = new Map<string, number>();
  for (const r of adjusted) {
    const key = clusterMap.get(r.owner ?? r.address) ?? r.owner ?? r.address;
    entityTotals.set(key, (entityTotals.get(key) ?? 0) + r.pct);
  }
  const effectiveTop10Pct = [...entityTotals.values()]
    .sort((a, b) => b - a)
    .slice(0, 10)
    .reduce((s, v) => s + v, 0);

  return {
    nodes,
    edges,
    groups,
    effectiveTop10Pct,
    bundledSupplyPct: groups
      .filter((g) => g.confidence !== "low")
      .reduce((s, g) => s + g.pct, 0),
    traced: tracedCount,
    total: candidates.length,
    unknown: unknownCount,
    dataAvailable: tracedCount > 0,
    note:
      unknownCount > 0
        ? `${tracedCount}/${candidates.length} wallets traced to their first funding. ${unknownCount} had more history than the RPC budget allows, so their funding source is unknown — not absent.`
        : tracedCount < candidates.length
          ? `${tracedCount}/${candidates.length} wallets had a distinct SOL funder; the rest were fee-paid by themselves.`
          : undefined,
  };
}

export function clustersToMap(clusters: ClusterAnalysis): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of clusters.groups) for (const m of g.members) map.set(m, g.id);
  return map;
}
