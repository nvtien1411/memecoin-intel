import { fetchJson, num } from "../http";
import type { CreatorToken, HolderRow, HolderKind, SecurityData } from "../types";

const BASE = "https://api.rugcheck.xyz/v1";

export interface RcHolder {
  address: string;
  owner?: string;
  pct: number;
  uiAmount?: number;
  insider?: boolean;
}

export interface RcReport {
  mint: string;
  creator?: string | null;
  creatorBalance?: number | null;
  tokenMeta?: { name?: string; symbol?: string; mutable?: boolean; updateAuthority?: string };
  topHolders?: RcHolder[];
  freezeAuthority?: string | null;
  mintAuthority?: string | null;
  risks?: { name: string; description: string; score: number; level: string }[];
  score?: number;
  score_normalised?: number;
  markets?: {
    pubkey: string;
    marketType?: string;
    mintLP?: string;
    lp?: { lpLocked?: number; lpLockedPct?: number; baseMint?: string };
  }[];
  totalMarketLiquidity?: number;
  totalHolders?: number;
  price?: number;
  rugged?: boolean;
  transferFee?: { pct?: number } | null;
  knownAccounts?: Record<string, { name?: string; type?: string }>;
  graphInsidersDetected?: number;
  insiderNetworks?: { id?: string; size?: number; type?: string; tokenAmount?: number }[];
  creatorTokens?: {
    mint?: string;
    meta?: { name?: string; symbol?: string } | null;
    rugged?: boolean;
    holders?: number;
    marketCap?: number;
    liquidity?: number;
    createdAt?: string;
  }[];
  launchpad?: string | null;
  deployPlatform?: string | null;
  verification?: { mint?: string; jup_strict_list?: boolean; name?: string } | null;
  tokenProgram?: string;
}

export async function rcReport(mint: string) {
  return fetchJson<RcReport>("rugcheck", `${BASE}/tokens/${mint}/report`, {
    ttlMs: 90_000,
    label: "rugcheck",
    timeoutMs: 15_000,
  });
}

function kindFromLabel(label?: string, type?: string): HolderKind | null {
  const t = (type ?? "").toUpperCase();
  const n = (label ?? "").toLowerCase();
  if (t === "AMM" || n.includes("pool") || n.includes("amm")) return "lp";
  if (t === "LOCKER" || n.includes("lock")) return "locker";
  if (t === "CREATOR" || n.includes("creator")) return "creator";
  if (
    n.includes("binance") ||
    n.includes("coinbase") ||
    n.includes("okx") ||
    n.includes("kraken") ||
    n.includes("bybit") ||
    n.includes("gate") ||
    n.includes("kucoin") ||
    n.includes("exchange")
  )
    return "exchange";
  return null;
}

const BURN_ADDRESSES = new Set([
  "1nc1nerator11111111111111111111111111111111",
  "So11111111111111111111111111111111111111112",
  "11111111111111111111111111111111",
]);

export function holdersFromRc(report: RcReport | null): HolderRow[] {
  if (!report?.topHolders) return [];
  const known = report.knownAccounts ?? {};
  const creator = report.creator ?? null;

  return report.topHolders
    .filter((h) => (h.pct ?? 0) > 0)
    .map((h) => {
      const owner = h.owner ?? h.address;
      const meta = known[owner] ?? known[h.address];
      let kind: HolderKind = "wallet";
      let label = meta?.name;
      const byLabel = kindFromLabel(meta?.name, meta?.type);
      if (byLabel) kind = byLabel;
      if (BURN_ADDRESSES.has(owner) || BURN_ADDRESSES.has(h.address)) {
        kind = "burn";
        label = label ?? "Burn / Incinerator";
      }
      if (creator && owner === creator) {
        kind = "creator";
        label = label ?? "Creator";
      }
      if (meta?.type?.toUpperCase() === "CONTRACT" || meta?.type?.toUpperCase() === "PROGRAM") {
        kind = "contract";
      }
      return {
        address: h.address,
        owner,
        pct: h.pct ?? 0,
        amount: h.uiAmount ?? 0,
        kind,
        label,
        insider: Boolean(h.insider),
      } satisfies HolderRow;
    })
    .sort((a, b) => b.pct - a.pct);
}

export function securityFromRc(report: RcReport | null): SecurityData {
  if (!report) {
    return {
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
    };
  }

  const markets = report.markets ?? [];
  let lockedPct: number | null = null;
  for (const m of markets) {
    const p = num(m.lp?.lpLockedPct);
    if (p !== null) lockedPct = Math.max(lockedPct ?? 0, p);
  }

  // A pump.fun / launchpad curve has no LP token to rug: liquidity sits in the
  // program account. mintLP is the all-ones placeholder there, and the reported
  // lock percentage is ~0 because there is nothing to lock. Treating that as
  // "LP unlocked" is a false positive that would flag every fresh launch.
  const curvePool = markets.some(
    (m) =>
      !m.mintLP ||
      m.mintLP === "11111111111111111111111111111111" ||
      /pump|launch|curve|bonk/i.test(m.marketType ?? ""),
  );

  if (curvePool) lockedPct = 100;
  const lpMintBurned = curvePool || markets.some((m) => !m.mintLP || m.mintLP === "11111111111111111111111111111111");

  return {
    mintAuthority: report.mintAuthority ?? null,
    freezeAuthority: report.freezeAuthority ?? null,
    mintable: report.mintAuthority ? true : false,
    freezable: report.freezeAuthority ? true : false,
    honeypot: null, // not measured by rugcheck
    buyTax: null,
    sellTax: null,
    transferFeePct: num(report.transferFee?.pct),
    ownerPrivileges: [],
    verified: report.verification?.jup_strict_list ?? null,
    lpLockedPct: lockedPct,
    lpBurned: markets.length > 0 ? lpMintBurned : null,
    launchpad: report.launchpad ?? report.deployPlatform ?? null,
    dataAvailable: true,
  };
}

export function creatorTokensFromRc(report: RcReport | null): CreatorToken[] {
  const list = report?.creatorTokens ?? [];
  return list
    .filter((t) => t.mint && t.mint !== report?.mint)
    .slice(0, 12)
    .map((t) => ({
      mint: t.mint as string,
      symbol: t.meta?.symbol,
      name: t.meta?.name,
      rugged: Boolean(t.rugged),
      holders: t.holders,
      liquidityUsd: t.liquidity,
      createdAt: t.createdAt,
    }));
}
