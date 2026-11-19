# Product Spec — Memecoin Intelligence Terminal

## 1. Positioning

Không phải screener. Là **verdict layer**: paste contract → một màn hình trả lời "có nên bỏ 5 phút để tìm hiểu token này không, và rủi ro cụ thể là gì" — mỗi kết luận có evidence + nguồn + confidence.

Khác biệt cốt lõi (từ research):
1. **Effective concentration** — concentration sau khi loại LP/burn/CEX và gộp cluster theo funding source. Không tool free nào làm.
2. **Deployer rap sheet** — lịch sử token của creator + kết cục.
3. **Verdict có trích dẫn** — không phải score trần.
4. **Cross-chain từ một ô input** — Solana, BSC, Base, Ethereum, Robinhood Chain.

## 2. Input

- Một ô duy nhất: contract address (hoặc pair address).
- Auto-detect chain: Solana = base58 32-44 ký tự; EVM = 0x + 40 hex.
- Nếu EVM: thử lần lượt các chain đã cấu hình (BSC, Base, ETH, Robinhood) song song, chọn chain có liquidity lớn nhất.
- Cho phép override chain bằng dropdown.

## 3. Output — information hierarchy

**Tầng 1 (thấy ngay, không scroll):** verdict badge (5 mức) + TL;DR 3 bullet + 4 số: price/mcap, liquidity, age, effective top-10 %.
**Tầng 2:** Risk signals (mỗi signal: severity, evidence, source, confidence) — sắp theo severity.
**Tầng 3:** Holder table có classification + insider/bundle flag; cluster map; flow panel (buy/sell, unique traders, wash ratio, divergence).
**Tầng 4:** Deployer & insider; data provenance panel (nguồn nào trả lời, latency, phần nào unavailable); report đầy đủ.

## 4. Risk signal schema (bắt buộc)

```ts
{
  id, name, severity: 'critical'|'high'|'medium'|'low'|'info',
  evidence: string,      // số liệu thật
  source: string,        // rugcheck | goplus | dexscreener | geckoterminal | rpc
  confidence: 'high'|'medium'|'low',
  explanation: string,
  observedAt: ISO string
}
```

Không signal nào một mình kết luận "scam". Verdict là tổng hợp có trọng số + ghi rõ yếu tố nào đóng góp.

## 5. Verdict scale

| Verdict | Điều kiện (rút gọn) |
|---|---|
| `high_risk` | ≥1 critical signal, hoặc risk score ≥ 75 |
| `caution` | risk score 50–74, hoặc ≥2 high |
| `neutral` | 25–49 |
| `interesting` | <25 và có ≥1 positive signal |
| `strong_signals` | <15, không high/critical, có ≥2 positive (vd: LP locked, mint revoked, holder growth, smart-money-like early buyers) |

Luôn kèm disclaimer: analytical tool, not financial advice.

## 6. Feature set MVP (từ 12 ý tưởng, chọn 8)

1. Effective Concentration (cluster-aware) ✅
2. Deployer Rap Sheet ✅
3. Evidence-based risk signals ✅
4. Funding-source cluster map (SVG, có confidence) ✅
5. One-screen verdict + cited TL;DR ✅
6. Wash-trade / flow-quality detector ✅
7. Liquidity-vs-price divergence ✅
8. Sniper/early-buyer window (từ trades + insider flags) ✅
9. Wallet PnL — ❌ cần API trả tiền
10. KOL tracker — ❌ cần X API
11. Watchlist diff alerts — ❌ post-MVP
12. Transfer graph 24h — ❌ post-MVP

## 7. Architecture

```
app/
  page.tsx                  # terminal UI (client)
  api/analyze/route.ts      # orchestration + cache + rate limit
lib/
  types.ts                  # toàn bộ data model
  chains.ts                 # config chain, detect address
  http.ts                   # fetch timeout/retry, TTL cache, limiter
  providers/
    dexscreener.ts geckoterminal.ts rugcheck.ts goplus.ts solana-rpc.ts
  analysis/
    holders.ts   # classify LP/burn/CEX/contract, effective concentration
    clusters.ts  # funding graph + cluster grouping
    flow.ts      # wash ratio, imbalance, divergence, sniper window
    risk.ts      # signal engine
    verdict.ts   # score, verdict, report text
  analyze.ts                 # orchestrator, Promise.allSettled
components/
  SearchBar, VerdictHeader, RiskPanel, HolderTable, ClusterMap,
  FlowPanel, ReportPanel, ProvenancePanel, ui/*
```

Nguyên tắc: provider là pure function (input → typed output + `ok/failed`), analysis là pure function (không gọi mạng) → test được, đổi provider không đổi analysis.

## 8. Non-goals (MVP)

Không phải nơi giao dịch. Không đưa lời khuyên mua/bán. Không hiển thị số liệu không có nguồn.
