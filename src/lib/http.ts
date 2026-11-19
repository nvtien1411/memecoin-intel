import type { SourceStatus } from "./types";

/* ------------------------------------------------------------------ *
 * TTL cache (process-local; survives across requests in the same node)
 * ------------------------------------------------------------------ */
type CacheEntry = { value: unknown; expires: number };
const cache = new Map<string, CacheEntry>();
const MAX_ENTRIES = 600;

export function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number) {
  if (cache.size > MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of cache) if (v.expires < now) cache.delete(k);
    if (cache.size > MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
  }
  cache.set(key, { value, expires: Date.now() + ttlMs });
}

/* ------------------------------------------------------------------ *
 * Token-bucket rate limiter per provider (protects upstream + us)
 * ------------------------------------------------------------------ */
class Limiter {
  private tokens: number;
  private last = Date.now();
  constructor(
    private capacity: number,
    private refillPerSec: number,
  ) {
    this.tokens = capacity;
  }
  async take(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.tokens = Math.min(
        this.capacity,
        this.tokens + ((now - this.last) / 1000) * this.refillPerSec,
      );
      this.last = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil(((1 - this.tokens) / this.refillPerSec) * 1000);
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 1000)));
    }
  }
}

const limiters: Record<string, Limiter> = {
  dexscreener: new Limiter(8, 5),
  // GeckoTerminal documents ~30 rpm. A single token analysis needs 3-4 calls,
  // so one user can trip it. Paced deliberately slowly and, when it does 429,
  // the breaker below stops us hammering it for the rest of the request.
  geckoterminal: new Limiter(2, 0.32),
  rugcheck: new Limiter(3, 1),
  goplus: new Limiter(2, 0.45), // 30 rpm documented
  solana: new Limiter(4, 2),
};

/* ------------------------------------------------------------------ *
 * Circuit breaker: a provider that just rate-limited us is skipped
 * instead of retried. Without this, one 429 turns into four retries
 * across four calls and a 60-second page load.
 * ------------------------------------------------------------------ */
interface Breaker {
  openUntil: number;
  failures: number;
}
const breakers = new Map<string, Breaker>();

export function breakerOpen(source: string): boolean {
  const b = breakers.get(source);
  return Boolean(b && b.openUntil > Date.now());
}

function tripBreaker(source: string, ms: number) {
  const b = breakers.get(source) ?? { openUntil: 0, failures: 0 };
  b.failures += 1;
  b.openUntil = Date.now() + ms;
  breakers.set(source, b);
}

function resetBreaker(source: string) {
  const b = breakers.get(source);
  if (b && b.failures > 0 && b.openUntil < Date.now()) {
    breakers.set(source, { openUntil: 0, failures: 0 });
  }
}

/* ------------------------------------------------------------------ *
 * Fetch with timeout + retry + limiter + status capture
 * ------------------------------------------------------------------ */
export interface FetchResult<T> {
  ok: boolean;
  data: T | null;
  status: SourceStatus;
}

export async function fetchJson<T>(
  source: keyof typeof limiters | string,
  url: string,
  opts: {
    timeoutMs?: number;
    retries?: number;
    headers?: Record<string, string>;
    ttlMs?: number;
    label?: string;
  } = {},
): Promise<FetchResult<T>> {
  const { timeoutMs = 8000, retries = 1, headers = {}, ttlMs = 30_000 } = opts;
  const label = opts.label ?? source;
  const key = `GET:${url}`;

  const cached = cacheGet<T>(key);
  if (cached !== undefined) {
    return {
      ok: true,
      data: cached,
      status: { source: label, ok: true, ms: 0, note: "cache" },
    };
  }

  const started = Date.now();

  // A provider that just 429'd us is skipped outright. Retrying into a rate
  // limit is what turned one slow upstream into a 60-second page load.
  if (breakerOpen(source)) {
    return {
      ok: false,
      data: null,
      status: {
        source: label,
        ok: false,
        ms: 0,
        error: "rate limited — skipped",
        degraded: true,
      },
    };
  }

  const limiter = limiters[source];
  let lastError = "";

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (limiter) await limiter.take();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json", ...headers },
        cache: "no-store",
      });
      clearTimeout(timer);

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        if (res.status === 429) {
          tripBreaker(source, 45_000);
          return {
            ok: false,
            data: null,
            status: {
              source: label,
              ok: false,
              ms: Date.now() - started,
              error: "HTTP 429 (rate limited)",
              degraded: true,
            },
          };
        }
        if (res.status >= 500) {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
            continue;
          }
          return {
            ok: false,
            data: null,
            status: { source: label, ok: false, ms: Date.now() - started, error: lastError },
          };
        }
        return {
          ok: false,
          data: null,
          status: { source: label, ok: false, ms: Date.now() - started, error: lastError },
        };
      }

      const data = (await res.json()) as T;
      cacheSet(key, data, ttlMs);
      resetBreaker(source);
      return {
        ok: true,
        data,
        status: { source: label, ok: true, ms: Date.now() - started },
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < retries) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }

  return {
    ok: false,
    data: null,
    status: { source: label, ok: false, ms: Date.now() - started, error: lastError },
  };
}

/* ---------------------------- helpers ---------------------------- */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function pct(part: number | null, total: number | null): number | null {
  if (part === null || total === null || total === 0) return null;
  return (part / total) * 100;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 0.01) return `$${n.toFixed(4)}`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  // Sub-cent prices: lead with significant digits, not a wall of zeros.
  const exp = Math.floor(Math.log10(abs));
  const mantissa = n / 10 ** exp;
  return `$${mantissa.toFixed(3)}e${exp}`;
}

export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  if (abs === 0) return "$0";
  return `$${n.toPrecision(3)}`;
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function fmtChange(
  pct: number | null | undefined,
  ageHours: number | null | undefined,
): { text: string; label: string } {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return { text: "—", label: "" };
  }
  // A token 21 hours old has no 24h window. DexScreener reports the change since
  // the first trade, so labelling it "24h" overstates the timeframe.
  const partial = ageHours !== null && ageHours !== undefined && ageHours < 24;
  return {
    text: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
    label: partial ? "since launch" : "24h",
  };
}

export function fmtAge(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours / 24)}d`;
}
