# Deploy

Repo is committed and clean. One step needs you: GitHub authentication.
Nothing secret should pass through chat, so this uses GitHub's own device flow.

## 1. Push to GitHub

```bash
cd ~/projects/memecoin-terminal
bash push.sh
```

It will:
1. check `gh` is installed
2. run `gh auth login` — pick **GitHub.com → HTTPS → Login with a web browser**,
   then paste the one-time code into the page that opens
3. create `github.com/<you>/memecoin-intel` as a public repo
4. push `main`

Result: `https://github.com/nvtien1411/memecoin-intel`

If `gh` is missing:

```bash
winget install --id GitHub.cli -e
```

## 2. Deploy to Vercel

1. https://vercel.com/new
2. Import the `memecoin-intel` repo
3. Framework preset: **Next.js** (auto-detected). Build command and output
   directory need no changes.
4. **No environment variables are required** — every data source is free and
   keyless. Deploy.

### Optional: faster Solana tracing

The public Solana RPC is rate-limited, which makes the wallet-cluster trace slow
on very active wallets. A private endpoint fixes that:

```
SOLANA_RPC_URL = https://<your-rpc-provider>/...
```

Free options that work: Helius, Triton, QuickNode free tiers. Add it in
Vercel → Project → Settings → Environment Variables, then redeploy.

### Optional: avoid GeckoTerminal rate limits

GeckoTerminal allows ~30 requests/minute per IP. On a shared serverless egress
IP, heavy traffic will occasionally degrade the trade-tape panel (it falls back
to DexScreener 24h counts and says so). If that becomes common, the upgrade path
is a Birdeye Lite key ($39/mo) — the provider layer is already abstracted for it.

## Verify after deploy

```bash
curl -s -X POST https://<your-app>.vercel.app/api/analyze \
  -H 'content-type: application/json' \
  -d '{"address":"CwnbD9FpaFSNou634knczXVCRUjTqmzwCrs3AiQvpump"}' | head -c 300
```

Expect HTTP 200 with a `token`, `market`, `risks` and `report` object.

Then open the site, paste a token, and confirm the panels populate.

## Known limits (by design, not bugs)

| Limit | Why |
|---|---|
| Wallet PnL / win-rate not shown | needs a paid provider; faking it would be worse than omitting it |
| X / KOL tracking not shown | needs an X API key |
| Wallet cluster trace is Solana-only | EVM needs decoded transfer logs |
| Trace skipped for pairs older than 7 days | a wallet funded months ago says nothing about a launch bundle |
| Exit math is single-pool | multi-pool routing and CEX depth are not included; the panel says so |
