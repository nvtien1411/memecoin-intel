import { cacheGet, cacheSet } from "../http";

const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

/**
 * The public endpoint 429s hard under a burst, and a silent 429 used to look
 * identical to "this wallet has no funder" — which made the cluster feature
 * claim independence it had never established. So: serialize through a small
 * limiter, retry on 429/5xx, and surface the failure instead of swallowing it.
 */
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;
let minGapMs = 220; // ~4.5 req/s to start
const MIN_GAP_FLOOR = 220;
const MIN_GAP_CEIL = 1400;
let lastPenalty = 0;

/**
 * Adaptive gap: the public endpoint tolerates a burst then 429s for a while.
 * Penalising every call individually (fixed 900ms retry) made a 6-wallet trace
 * take 20s+. Instead widen the global gap when a 429 is seen, then decay it
 * back down as calls start succeeding again.
 */
function penalise() {
  minGapMs = Math.min(MIN_GAP_CEIL, Math.round(minGapMs * 1.6));
  lastPenalty = Date.now();
}
function reward() {
  if (Date.now() - lastPenalty > 1500 && minGapMs > MIN_GAP_FLOOR) {
    minGapMs = Math.max(MIN_GAP_FLOOR, Math.round(minGapMs * 0.85));
  }
}

function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = Math.max(0, lastCall + minGapMs - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run as Promise<T>;
}

export class RpcError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function rpc<T>(method: string, params: unknown[], retries = 2): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await throttle(() =>
        fetch(RPC, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        }),
      );

      if (res.status === 429 || res.status >= 500) {
        penalise();
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw new RpcError(`RPC rate limited (HTTP ${res.status})`, res.status);
      }
      if (!res.ok) throw new RpcError(`RPC HTTP ${res.status}`, res.status);

      reward();
      const json = (await res.json()) as RpcResponse<T>;
      if (json.error) {
        // -32602 / "Indexed requests require a personal token" style errors.
        if (attempt < retries && /rate|limit|token/i.test(json.error.message)) {
          penalise();
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw new RpcError(json.error.message);
      }
      return json.result ?? null;
    } catch (err) {
      if (err instanceof RpcError) throw err;
      if (attempt === retries) {
        throw new RpcError(err instanceof Error ? err.message : String(err));
      }
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  return null;
}

export interface SignatureInfo {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
}

export async function getSignatures(
  address: string,
  limit = 20,
  before?: string,
): Promise<SignatureInfo[] | null> {
  const params: unknown[] = [address, { limit }];
  if (before) (params[1] as Record<string, unknown>).before = before;
  return rpc<SignatureInfo[]>("getSignaturesForAddress", params);
}
export interface ParsedTx {
  signature: string;
  slot: number;
  blockTime: number | null;
  feePayer: string | null;
  signers: string[];
  preBalances: number[];
  postBalances: number[];
  accountKeys: string[];
  err: unknown;
}

interface RawTx {
  slot: number;
  blockTime: number | null;
  meta?: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
  } | null;
  transaction: {
    message: {
      accountKeys: string[];
      header?: { numRequiredSignatures: number };
    };
    signatures: string[];
  };
}

export async function getTransaction(signature: string): Promise<ParsedTx | null> {
  // Some tokens (newer programs) emit version-1 transactions. Asking for
  // version 0 only makes the RPC reject the whole call, which used to surface
  // as a hard 502 for the entire analysis. Ask for 1 — it accepts 0 too.
  const tx = await rpc<RawTx>("getTransaction", [
    signature,
    { maxSupportedTransactionVersion: 1, encoding: "json" },
  ]);
  if (!tx?.transaction?.message) return null;
  const keys = tx.transaction.message.accountKeys ?? [];
  const n = tx.transaction.message.header?.numRequiredSignatures ?? 1;
  return {
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime,
    feePayer: keys[0] ?? null,
    signers: keys.slice(0, n),
    preBalances: tx.meta?.preBalances ?? [],
    postBalances: tx.meta?.postBalances ?? [],
    accountKeys: keys,
    err: tx.meta?.err ?? null,
  };
}

export type FunderResult =
  | { status: "found"; funder: string; sol: number; blockTime: number | null; slot: number }
  | { status: "not_found"; reason: string }
  | { status: "unknown"; reason: string };

/**
 * Find the wallet that first funded `address` with SOL.
 *
 * A single 200-signature page is NOT enough: a busy wallet's oldest signature
 * in that window is just some mid-history transaction, so probing it returns
 * "no funder" for almost every real wallet — which silently turned the cluster
 * feature into a machine that always reports "no clusters". We therefore page
 * backwards to the wallet's actual first signature (bounded), and report
 * `unknown` when we cannot reach it instead of pretending there is no link.
 */
export async function findFirstFunder(
  address: string,
  opts: { probe?: number; maxPages?: number } = {},
): Promise<FunderResult> {
  const probe = opts.probe ?? 3;
  const maxPages = opts.maxPages ?? 1;
  const cacheKey = `funder:${address}`;
  const cached = cacheGet<FunderResult>(cacheKey);
  if (cached !== undefined) return cached;

  // Walk back until a page comes back short (or we run out of budget).
  let before: string | undefined;
  let oldestPage: SignatureInfo[] = [];
  let reachedStart = false;

  try {
    for (let page = 0; page < maxPages; page++) {
      const sigs = await getSignatures(address, 1000, before);
      if (sigs === null) {
        const r: FunderResult = { status: "unknown", reason: "RPC returned no signature page" };
        cacheSet(cacheKey, r, 600_000);
        return r;
      }
      if (sigs.length === 0) {
        reachedStart = true;
        break;
      }
      oldestPage = sigs;
      if (sigs.length < 1000) {
        reachedStart = true;
        break;
      }
      before = sigs[sigs.length - 1].signature;
    }
  } catch (err) {
    const r: FunderResult = {
      status: "unknown",
      reason: `RPC failed while paging history: ${err instanceof Error ? err.message : String(err)}`,
    };
    cacheSet(cacheKey, r, 300_000);
    return r;
  }

  if (oldestPage.length === 0) {
    const r: FunderResult = { status: "not_found", reason: "Wallet has no transactions" };
    cacheSet(cacheKey, r, 3_600_000);
    return r;
  }

  // Oldest-first within the oldest page we reached.
  const candidates = [...oldestPage].reverse().slice(0, probe);

  for (const sig of candidates) {
    if (sig.err) continue;
    const tx = await getTransaction(sig.signature);
    if (!tx || tx.err) continue;
    const idx = tx.accountKeys.indexOf(address);
    if (idx < 0) continue;
    const delta = (tx.postBalances[idx] ?? 0) - (tx.preBalances[idx] ?? 0);
    if (delta <= 0) continue;
    const funder = tx.signers.find((s) => s !== address);
    if (!funder) continue;
    const found: FunderResult = {
      status: "found",
      funder,
      sol: delta / 1e9,
      blockTime: tx.blockTime,
      slot: tx.slot,
    };
    cacheSet(cacheKey, found, 3_600_000);
    return found;
  }

  const r: FunderResult = reachedStart
    ? {
        status: "not_found",
        reason:
          "Reached the wallet's first transactions; the first SOL came from a fee payer that is not a distinct funder.",
      }
    : {
        status: "unknown",
        reason: `Wallet has more than ${maxPages * 1000} transactions; first funding not reachable within budget.`,
      };
  cacheSet(cacheKey, r, reachedStart ? 3_600_000 : 600_000);
  return r;
}

export interface TokenSupply {
  amount: string;
  decimals: number;
  uiAmount: number;
}

export async function getTokenSupply(mint: string): Promise<TokenSupply | null> {
  const res = await rpc<{ value: TokenSupply }>("getTokenSupply", [mint]);
  return res?.value ?? null;
}

/** Native SOL balance of a wallet, in SOL. */
export async function getSolBalance(address: string): Promise<number | null> {
  const res = await rpc<{ value: number }>("getBalance", [address]);
  return res?.value !== undefined ? res.value / 1e9 : null;
}

export const SOLANA_RPC_URL = RPC;
