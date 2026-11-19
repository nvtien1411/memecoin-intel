# Memecoin Intelligence Terminal

Paste a contract address, get an evidence-based verdict instead of six browser tabs.

Built for the pre-ape check: is the supply actually distributed, has the deployer
rugged before, can I actually exit, and what does the flow look like right now.
Every conclusion carries its source; anything the free data sources cannot answer
is marked **unavailable** rather than estimated.

## What it answers

| Question | How |
|---|---|
| Is the holder list real? | Concentration after removing LP/burn addresses **and** merging wallets that share a funder |
| Has this dev done it before? | Deployer rap sheet: every prior token and whether it rugged |
| Can I get out? | Constant-product exit math: max sell before 1/5/10% price impact, plus the largest holder's full exit |
| Is the contract safe? | Mint/freeze authority, honeypot, taxes, owner privileges, LP lock |
| Is the volume real? | Buy/sell imbalance, churn ratio, same-block coordination, price-vs-liquidity divergence |
| Who bought early and at what price? | Top holders cross-referenced against the trade tape |

## Chains

Solana · BNB Chain · Base · Ethereum · Robinhood Chain — auto-detected, or pick one.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
```

No API key required. Optional env:

```bash
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com   # any Solana RPC; a private one is much faster
```

```bash
npm run build && npm start   # production
```

## Data sources

All free tier, no key, verified against live endpoints:

- **DexScreener** — pairs, price, liquidity, volume, txns (primary market data)
- **GeckoTerminal** — trade tape, OHLCV, pool discovery for chains DexScreener does not index (~30 rpm)
- **RugCheck** — Solana holder list, insider flags, deployer history, authorities
- **GoPlus** — EVM + Robinhood contract security, honeypot, taxes, holders (30 rpm)
- **Solana public RPC** — funding-source tracing for wallet clusters

Rate limits are respected per provider with a token bucket, a circuit breaker
that skips a provider after a 429 instead of retrying into it, and TTL caches.

## Design rules this code follows

1. **Never invent a number.** Missing data renders as `unavailable` with the reason.
2. **Never claim independence from an absence.** A wallet whose funding could not be
   traced is reported as `unknown`, not as "no cluster".
3. **Never let one signal be a verdict.** Risk signals carry evidence, source and
   confidence; the score is capped per category so no single dimension dominates.
4. **Degrade one panel, not the page.** A dead upstream loses its panel and says so.
5. **Label heuristics.** Same-block co-buying on a four-year-old token is noise, so
   it is gated on token age rather than reported as a bundle.

## Not in this build

Wallet PnL / win-rate (needs a paid provider), X/KOL tracking (needs an X API key),
watchlist alerts (needs storage + a scheduler). These are shown as unavailable
rather than faked.

## Docs

- `MARKET_RESEARCH.md` — user research with sources, competitor gaps, feature scoring
- `PROGRESS.md` — build log and every bug found through testing
- `research/data-sources.md` — every endpoint tested, with limits and decisions
- `research/product-spec.md` — architecture and signal schema

## Disclaimer

Analytical tool, not financial advice. Signals are derived from public on-chain and
market data at the timestamp shown; they can be wrong, stale, or gamed.
