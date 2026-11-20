import { fetchJson, num } from "../http";
import type { ChainId, Trade } from "../types";
import { CHAINS } from "../chains";

const BASE = "https://api.geckoterminal.com/api/v2";

interface GtTokenResponse {
  data?: {
    id: string;
    attributes: {
      address: string;
      name: string;
      symbol: string;
      decimals: number;
      image_url?: string | null;
      total_supply?: string | null;
      normalized_total_supply?: string | null;
    };
  };
}

interface GtPool {
  id: string;
  attributes: {
    name: string;
    address: string;
    reserve_in_usd?: string | null;
    volume_usd?: Record<string, string | null> | null;
    pool_created_at?: string | null;
    base_token_price_usd?: string | null;
    market_cap_usd?: string | null;
    fdv_usd?: string | null;
    transactions?: Record<string, { buys: number; sells: number; buyers?: number; sellers?: number }>;
    price_change_percentage?: Record<string, string>;
  };
  relationships?: {
    base_token?: { data?: { id: string } };
    quote_token?: { data?: { id: string } };
    dex?: { data?: { id: string } };
  };
}

function net(chain: ChainId): string {
  return CHAINS[chain].geckoNetwork ?? "";
}

export async function gtToken(chain: ChainId, address: string) {
  return fetchJson<GtTokenResponse>(
    "geckoterminal",
    `${BASE}/networks/${net(chain)}/tokens/${address}`,
    { ttlMs: 120_000, label: "geckoterminal:token" },
  );
}

export async function gtPools(chain: ChainId, address: string) {
  return fetchJson<{ data: GtPool[] }>(
    "geckoterminal",
    `${BASE}/networks/${net(chain)}/tokens/${address}/pools`,
    { ttlMs: 45_000, label: "geckoterminal:pools" },
  );
}

export async function gtSearchPools(chain: ChainId, query: string) {
  return fetchJson<{ data: GtPool[] }>(
    "geckoterminal",
    `${BASE}/search/pools?query=${encodeURIComponent(query)}&network=${net(chain)}`,
    { ttlMs: 45_000, label: "geckoterminal:search" },
  );
}

interface GtTrade {
  attributes: {
    block_number: number;
    block_timestamp: string;
    tx_hash: string;
    tx_from_address: string;
    kind: "buy" | "sell";
    from_token_amount: string;
    to_token_amount: string;
    price_to_in_usd?: string;
    price_from_in_usd?: string;
    volume_in_usd?: string;
  };
}

export async function gtTrades(chain: ChainId, pool: string) {
  return fetchJson<{ data: GtTrade[] }>(
    "geckoterminal",
    `${BASE}/networks/${net(chain)}/pools/${pool}/trades`,
    { ttlMs: 20_000, label: "geckoterminal:trades", timeoutMs: 12_000 },
  );
}

export function tradesFromGt(raw: GtTrade[] | undefined): Trade[] {
  if (!raw) return [];
  const out: Trade[] = [];
  for (const t of raw) {
    const a = t.attributes;
    const tokenAmount =
      a.kind === "buy" ? num(a.to_token_amount) : num(a.from_token_amount);
    const price = num(a.kind === "buy" ? a.price_to_in_usd : a.price_from_in_usd);
    const volume = num(a.volume_in_usd);
    const amountUsd =
      volume ?? (tokenAmount !== null && price !== null ? tokenAmount * price : null);
    out.push({
      txHash: a.tx_hash,
      blockNumber: a.block_number,
      timestamp: a.block_timestamp,
      wallet: a.tx_from_address,
      kind: a.kind,
      amountUsd,
      tokenAmount,
      priceUsd: price,
    });
  }
  // GeckoTerminal returns newest first; keep that but drop obvious non-token rows.
  return out.filter((t) => t.wallet && t.txHash).slice(0, 300);
}

export interface OhlcvRow {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function gtOhlcv(
  chain: ChainId,
  pool: string,
  timeframe: "minute" | "hour" | "day" = "hour",
  aggregate = 1,
  limit = 48,
) {
  return fetchJson<{ data: { attributes: { ohlcv_list: number[][] } } }>(
    "geckoterminal",
    `${BASE}/networks/${net(chain)}/pools/${pool}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}`,
    { ttlMs: 60_000, label: "geckoterminal:ohlcv" },
  );
}

export function ohlcvFromGt(raw: number[][] | undefined): OhlcvRow[] {
  if (!raw) return [];
  return raw
    .map((r) => ({ ts: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] }))
    .sort((a, b) => a.ts - b.ts);
}

/** Best pool by reserve_in_usd, falling back to volume. */
export function bestGtPool(pools: GtPool[] | undefined): GtPool | null {
  if (!pools || pools.length === 0) return null;
  return [...pools].sort((a, b) => {
    const ra = num(a.attributes.reserve_in_usd) ?? 0;
    const rb = num(b.attributes.reserve_in_usd) ?? 0;
    if (rb !== ra) return rb - ra;
    return (num(b.attributes.volume_usd?.h24) ?? 0) - (num(a.attributes.volume_usd?.h24) ?? 0);
  })[0];
}

export function poolAddress(pool: GtPool): string {
  return pool.attributes.address;
}

export function poolDex(pool: GtPool): string {
  return pool.relationships?.dex?.data?.id ?? "unknown";
}
