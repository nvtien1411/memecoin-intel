import { fetchJson, num } from "../http";
import type { ChainId, MarketData, PoolInfo, TokenIdentity } from "../types";

const BASE = "https://api.dexscreener.com";

interface DsToken {
  address: string;
  name: string;
  symbol: string;
}

export interface DsPair {
  chainId: string;
  dexId: string;
  url?: string;
  pairAddress: string;
  baseToken: DsToken;
  quoteToken: DsToken;
  priceNative?: string;
  priceUsd?: string;
  txns?: Record<string, { buys: number; sells: number }>;
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  labels?: string[];
}

export async function dsTokenPairs(address: string) {
  return fetchJson<{ pairs: DsPair[] | null }>(
    "dexscreener",
    `${BASE}/latest/dex/tokens/${address}`,
    { ttlMs: 30_000, label: "dexscreener" },
  );
}

export async function dsSearch(query: string) {
  return fetchJson<{ pairs: DsPair[] | null }>(
    "dexscreener",
    `${BASE}/latest/dex/search?q=${encodeURIComponent(query)}`,
    { ttlMs: 60_000, label: "dexscreener:search" },
  );
}

export function pickBestPair(pairs: DsPair[] | null | undefined): DsPair | null {
  if (!pairs || pairs.length === 0) return null;
  return [...pairs].sort(
    (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
  )[0];
}

export function pairsToPools(pairs: DsPair[]): PoolInfo[] {
  return pairs
    .map((p) => ({
      address: p.pairAddress,
      dex: p.dexId,
      liquidityUsd: num(p.liquidity?.usd),
      volume24h: num(p.volume?.h24),
      createdAt: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : undefined,
    }))
    .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
    .slice(0, 6);
}

export function identityFromPair(pair: DsPair, chain: ChainId): TokenIdentity {
  return {
    address: pair.baseToken.address,
    chain,
    name: pair.baseToken.name,
    symbol: pair.baseToken.symbol,
    pairAddress: pair.pairAddress,
    dexId: pair.dexId,
    pairCreatedAt: pair.pairCreatedAt,
    url: pair.url,
  };
}

export function marketFromPair(pair: DsPair | null): MarketData {
  if (!pair) {
    return {
      priceUsd: null,
      priceNative: null,
      marketCap: null,
      fdv: null,
      liquidityUsd: null,
      volume24h: null,
      volume6h: null,
      volume1h: null,
      priceChange: {},
      ageHours: null,
    };
  }
  const created = pair.pairCreatedAt ?? null;
  return {
    priceUsd: num(pair.priceUsd),
    priceNative: num(pair.priceNative),
    marketCap: num(pair.marketCap),
    fdv: num(pair.fdv),
    liquidityUsd: num(pair.liquidity?.usd),
    volume24h: num(pair.volume?.h24),
    volume6h: num(pair.volume?.h6),
    volume1h: num(pair.volume?.h1),
    priceChange: {
      m5: num(pair.priceChange?.m5) ?? undefined,
      h1: num(pair.priceChange?.h1) ?? undefined,
      h6: num(pair.priceChange?.h6) ?? undefined,
      h24: num(pair.priceChange?.h24) ?? undefined,
    },
    txns24h: pair.txns?.h24
      ? { buys: pair.txns.h24.buys, sells: pair.txns.h24.sells }
      : undefined,
    txns1h: pair.txns?.h1
      ? { buys: pair.txns.h1.buys, sells: pair.txns.h1.sells }
      : undefined,
    ageHours: created ? (Date.now() - created) / 3_600_000 : null,
    reserves: (() => {
      const baseReserve = num(pair.liquidity?.base);
      const quoteReserve = num(pair.liquidity?.quote);
      const price = num(pair.priceUsd);
      if (baseReserve === null || quoteReserve === null || !price) return undefined;
      return {
        baseReserve,
        quoteReserve,
        baseReserveUsd: baseReserve * price,
        quoteReserveUsd: quoteReserve * price,
        priceUsd: price,
        dex: pair.dexId ?? null,
        source: "dexscreener pair reserves",
      };
    })(),
  };
}
