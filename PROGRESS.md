# PROGRESS — Memecoin Intelligence Terminal

Cập nhật: 2026-11-20 (session 4 — sửa lỗi độ chính xác)

## Bug đã sửa session 4 (phát hiện bằng test thật, không phải đọc code)

### Nhóm A — Solana không chạy được (blocker)

| # | Bug | Triệu chứng | Sửa |
|---|---|---|---|
| A1 | `getTransaction` hardcode `maxSupportedTransactionVersion: 0` | Token dùng tx version 1 → RPC từ chối → **toàn bộ request 502** (`CwnbD9F...pump` của Rico) | Đổi sang version 1 (chấp nhận cả 0) |
| A2 | Cluster trace throw → fail cả analysis | Một ví lỗi RPC làm mất toàn bộ report | `.catch()` → degrade riêng panel cluster |
| A3 | `rpc()` bỏ qua limiter, 429 bị nuốt thành `null` | 6/8 ví "unknown" giả, trace 32s | Serialize qua throttle + retry 429 + adaptive gap (220ms→1400ms) |
| A4 | `findFirstFunder` chỉ đọc 1 page 200 sig rồi coi cái cuối là "giao dịch đầu" | Ví >200 tx → không tìm được funder → **luôn báo 0 cluster**, kết luận sai "ví độc lập" | Page ngược tới đầu lịch sử, trả `unknown` khi hết budget thay vì bịa |

### Nhóm B — Kết luận sai (nguy hiểm hơn lỗi crash)

| # | Bug | Triệu chứng | Sửa |
|---|---|---|---|
| B1 | Bonding-curve token: 100% supply trong curve → `effectiveTop10Pct = 0%` | Đọc như "phân phối hoàn hảo" | Thêm `holders.meaningful`; UI hiện "not assessable", risk engine không bắn signal concentration |
| B2 | LP-unlocked false positive trên pump.fun | Mọi token mới bị gắn "LP not locked" dù curve không có LP token | Nhận diện curve pool → coi là locked |
| B3 | Exit math dùng `liquidity.quote` (đơn vị SOL) như USD | Bán $1,000 chỉ nhận $6 | Virtual balanced reserves từ tổng giá trị pool USD |
| B4 | Exit math trên pool Orca không cân (Q/B ≠ giá) | Impact và proceeds lệch nhau | Cùng fix B3 |
| B5 | Same-block buy trên token 4 năm tuổi | 40 block có ≥3 lệnh mua → bắn risk "bundle" sai | Gate theo tuổi (<48h) → `sameBlockMeaningful` |
| B6 | "Deep liquidity" khi liquidity chỉ 0.11% market cap | Nhãn gây hiểu nhầm | Yêu cầu liquidity/mcap ≥ 2% |
| B7 | "Survived its first week" trên token 1425 ngày | Nhãn vô nghĩa | Chỉ 168h–720h |
| B8 | Breaker mở → Robinhood fallback thành chain `bsc` với token `???` risk 0 | **Trả về kết quả giả trông như thật** | `resolved.unresolved` → trả lỗi rõ ràng thay vì bịa |

### Nhóm C — Hiệu năng / độ bền

| # | Bug | Triệu chứng | Sửa |
|---|---|---|---|
| C1 | 429 retry 4 lần × 4 call | 1 token mất 20–60s | Circuit breaker: provider vừa 429 bị skip 45s |
| C2 | Gọi GeckoTerminal dù DexScreener đã có dữ liệu | Đốt quota 30 rpm vô ích | Chỉ gọi GT khi DexScreener không trả lời được |
| C3 | EVM probe thử bsc→base→eth→robinhood = 4 call GT | Robinhood mất 59s | Probe robinhood trước (chain duy nhất DexScreener không index) + cache chain resolution 30 phút |
| C4 | GT trades fail → flow panel trống | Không có tín hiệu gì | Fallback sang txns 24h của DexScreener, gắn nhãn degraded |
| C5 | Cluster trace 32s/token | UX kém | Budget theo tuổi: <24h→5 ví/7s, <7d→4/6s, cũ hơn→bỏ (bundle chỉ có nghĩa lúc launch) |

### Kết quả đo được (trước → sau)

| Token | Trước | Sau |
|---|---|---|
| Solana BONK | 46s, 1 provider fail | **2.7s** |
| Solana RATS (CA của Rico) | **502 error** | **10–15s**, 200 |
| Robinhood MEME | 59s, chain sai, token `???` | **4.5s**, đúng chain |
| BSC CAKE | 23s | **0.5s** |
| Base DEGEN | 23s | **0.5s** |
| ETH USDC | 36s | **1.6s** |

## Trạng thái

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 1 | Market research | ✅ `research/market-research.md` |
| 2 | Competitor research | ✅ (§4 trong market-research) |
| 3 | API/RPC research (đã test thật) | ✅ `research/data-sources.md` |
| 4 | Product spec | ✅ `research/product-spec.md` |
| 5 | UI/UX | ✅ dashboard dark-mode, dense, responsive |
| 6 | Architecture | ✅ provider → analysis → orchestrator → API → UI |
| 7 | Implementation | ✅ MVP đủ 8 feature |
| 8 | Testing | ✅ build production pass, 2 chain test thật |
| 9 | Optimization | ✅ 2.5min → ~10s (funder trace bounded + cache) |
| 10 | Final report | ✅ (báo cáo trong chat) |

## Đã chạy thật (verified)

- `npx tsc --noEmit` → 0 lỗi
- `npm run build` → compiled, 5/5 static pages, route `/api/analyze` dynamic
- POST /api/analyze BONK (Solana) → 200, ~10.7s, verdict `caution`, risk 34
- POST /api/analyze CAKE (BSC) → 200, ~9.8s, verdict `neutral`, risk 25
- UI render đầy đủ: verdict header, 6 stat, risk signals (accordion + filter), holder table,
  cluster SVG map, deployer panel, social unavailable, flow + contract security, report, provenance

## Bug đã sửa trong session này

1. `creatorBalance` bị hiển thị như % → giờ chia cho total supply (BONK: 14.6B → 0.02%)
2. Next 16 `cacheComponents` không cho `export const runtime/dynamic` trong route → bỏ
3. Funder tracing quá chậm (2.5 phút) → chỉ đọc 1 page signature + probe 3 tx, có cache 1h
4. `findFirstFunder(wallet, 2)` sai signature sau khi đổi sang options object
5. Grid row kéo giãn panel → `items-start`
6. Bar buy/sell volume gây nhầm với số txn → tách nhãn rõ "buy volume %" + "N buy txns"
7. Symbol trùng tên token (Bonk/Bonk) → ẩn khi trùng
8. Price bị tô đỏ theo 24h → chỉ tô phần % thay đổi
9. Nhãn "266b / 34s" gây nhầm → "266 buys / 34 sells"

## Việc còn lại (post-MVP, không chặn)

- Wallet PnL / win-rate: cần Birdeye Lite ($39) trở lên
- X/KOL tracker: cần X API key
- Watchlist + diff alerts: cần storage + cron
- EVM funding-graph: cần decoded transfer logs (paid provider)
- Holder table >25 dòng: phân trang hoặc virtual scroll

## Chạy lại

```bash
cd ~/projects/memecoin-terminal
npm run dev     # http://localhost:3000
npm run build   # production build
```

Không cần API key nào để chạy. Env tuỳ chọn: `SOLANA_RPC_URL` (mặc định public mainnet-beta).
