# Market Research — Memecoin Intelligence Terminal

Ngày research: 2026-11-19. Phương pháp: web search + đọc trực tiếp các bài phân tích, checklist, so sánh công cụ công khai (DexScreener/Birdeye/GMGN/Bubblemaps/RugCheck reviews, "how to spot insiders", "how to read DexScreener"), và kiểm chứng bằng API thật (xem `data-sources.md`).

## 0. Giới hạn của research này (đọc trước)

- **X (Twitter) search không truy cập được từ môi trường này** (không có X API key, X chặn scrape). Các trích dẫn từ X dưới đây là những bài đã được index công khai qua web search, không phải kết quả search nội bộ X. Không có số liệu "mentions/engagement theo thời gian" nào được thu thập — vì vậy sản phẩm **không** hiển thị social momentum giả; module social mặc định trả `data unavailable` cho tới khi cấu hình provider.
- Không có phỏng vấn người dùng trực tiếp. Mọi "pain point" dưới đây được suy ra từ nội dung công khai của trader/analyst và từ việc **đối chiếu chéo nhiều nguồn độc lập**; mức tin cậy được ghi rõ.
- Giá/plan API có thể đổi; mọi con số pricing đều có ngày truy cập trong `data-sources.md`.

## 1. Findings cốt lõi (lặp lại ở ≥3 nguồn độc lập → tin cậy cao)

### F1. "Holder count" là con số dễ bị làm giả nhất trên một token page
Một token có thể hiện 900 holders nhưng 60% supply nằm trong tay **một** actor, nếu các ví đó được fund từ cùng một nguồn và mua trong cùng block. Nguồn: memecentral.fun (so sánh screener 2026), cleansky.io (forensics trước listing), madeonsol.com (holder analysis), video "22 mistakes beginners make" (400 holders / 15 người thật).
→ **Hệ quả sản phẩm:** không được hiển thị "holders" như một tín hiệu an toàn. Phải hiển thị **effective concentration** (concentration sau khi gộp cluster) song song với raw holder count.

### F2. Bundled launch / sniper supply là lỗ hổng lớn nhất của mọi checklist cơ bản
Bundle = một actor mua supply lớn qua nhiều ví trong block tạo token. Mint/freeze authority và LP lock đều có thể "sạch" trên một token bundle. Nguồn: x.com/malangeeSOL (research Solana memecoin 10/2026, mục "Bundling"), trader.scorplabs.online ("DexScreener shows balances, not the funder"), cleansky.io ("creator buys with multiple wallets in the same tx/block → 40-80% supply across 10-50 wallets").
→ **Hệ quả:** cần lớp **funding graph** (ai fund ví nào, cùng block không), không chỉ danh sách holder.

### F3. Lịch sử deployer là predictor mạnh nhất mà screener không có
"Công cụ dự đoán >70% rug: lịch sử của dev." DexScreener "reports current pool state; has no cross-token memory." Nguồn: trader.scorplabs.online, cleansky.io (deployer history → serial rugger), clitrader.com checklist (deployer đã launch token chết chưa).
→ **Hệ quả:** feature **Deployer Rap Sheet** — mọi token trước đó của creator, kết cục từng token. RugCheck đã có `creatorTokens` (kiểm chứng: có field này trong API report) → khai thác được ngay, không cần indexer riêng.

### F4. Dữ liệu bị phân tán: trader phải mở 4-6 tab trước khi mua
Workflow thực tế được mô tả lặp lại: DexScreener (chart/liquidity) → RugCheck/GoPlus (contract) → Bubblemaps (cluster) → Solscan/Etherscan (dev history, early txs) → GMGN/Birdeye (wallet PnL) → X (narrative/KOL). Nguồn: clitrader.com checklist, cleanksy checklist 5 bước, airdropalert.com ("first the contract, then the buyers"), madeonsol.com.
→ **Hệ quả:** giá trị lớn nhất không phải thêm data mới, mà là **tổng hợp + xếp hạng** thành một verdict có bằng chứng. Đây là positioning của sản phẩm.

### F5. Người dùng không thiếu số — họ thiếu *diễn giải*
"Bubblemaps shows that wallets are related, not why" (memecentral). "A score is a heuristic, not a verdict" (RugCheck). "Clusters do not prove common ownership" (memeassist).
→ **Hệ quả:** mỗi signal phải kèm severity + evidence + source + confidence + "what would change my mind". Không đưa một điểm số vô nghĩa.

### F6. Whale ≠ xấu; top holder thường là LP/burn/CEX
Nguồn: madeonsol.com (labels), clitrader (exclude LP & burn khi tính concentration), Birdeye holder labels (exchange/protocol).
→ **Hệ quả:** bắt buộc phân loại ví trước khi kết luận: LP / burn / CEX / contract / cá nhân; concentration phải tính lại sau khi loại LP+burn.

## 2. Pain points (xếp theo tần suất xuất hiện)

| # | Pain point | Bằng chứng | Ưu tiên |
|---|---|---|---|
| P1 | Không biết top holders có thực sự độc lập hay cùng một người | F1, F2, F5 | Cao |
| P2 | Không biết dev/deployer từng rug chưa | F3 | Cao |
| P3 | Phải mở 4-6 tab, mỗi tab một ngôn ngữ khác nhau | F4 | Cao |
| P4 | Không phân biệt được volume thật vs wash/bot volume | airdropalert ("300 fresh wallets flipping"), scorplabs ("wall of sells") | Cao |
| P5 | Không biết smart money đang mua hay đang xả | GMGN Wallet Radar docs, madeonsol | Trung bình-Cao |
| P6 | Không phát hiện được bundle/sniper sau khi token đã pump | F2 | Cao |
| P7 | Risk score của tool khác không giải thích lý do → không tin | F5 | Trung bình |
| P8 | Không có "what changed since yesterday" — phải check lại từ đầu | suy ra từ F4 (không có diff view) | Trung bình |
| P9 | Không theo dõi được narrative/KOL một cách có kiểm chứng (ai call sớm, ai call sau pump) | X analysis yêu cầu; hiện chỉ có tool thủ công | Trung bình |
| P10 | Không có cảnh báo khi LP bị rút / ví insider bắt đầu xả | clitrader (LP lock), scorplabs (wall of sells) | Cao (nhưng cần worker nền) |

## 3. Workflow thực tế của trader (tái dựng từ nguồn)

**Pre-ape checklist (5-10 phút/token, thủ công):**
1. Paste CA vào DexScreener → có đúng token không, thanh khoản bao nhiêu, age bao lâu.
2. Nếu <$50k liquidity hoặc age <1h → bỏ (clitrader, cleanksy).
3. RugCheck/TokenSniffer → mint/freeze authority, honeypot, tax.
4. Top 10 holders >25-30% → cảnh giác; >50% → bỏ.
5. Bubblemaps → có cluster không, có bundle không.
6. Solscan → dev wallet, dev đã launch gì trước đó.
7. GMGN/Birdeye → early buyers là ví mới hay ví có track record; smart money đang mua/xả.
8. X search symbol → có ai call không, call trước hay sau pump.
9. Quyết định.

**Điểm gãy:** bước 4-7 lặp lại thủ công cho từng token, mỗi bước một UI khác nhau, không lưu lại kết quả, không so sánh được giữa các token.

## 4. Competitor analysis

| Tool | Mạnh | Thiếu / yếu (theo nguồn) | Cơ hội cho sản phẩm |
|---|---|---|---|
| **DexScreener** | Discovery 60+ chain, chart, free, API công khai không cần key | Không có contract safety, không có cluster, không có cross-token memory, không có holder labels | Dùng làm lớp market data; bán giá trị ở lớp *trên* nó |
| **GMGN** | Smart-money tagging, bundle %, dev/sniper/insider labels, Wallet Radar, copy-trade | Đóng, API không công khai; tối ưu cho trading nhanh hơn là giải thích; Solana-centric | Lấy *khái niệm* (bundle %, wallet radar) nhưng mở và giải thích được |
| **Birdeye** | Solana depth, holder labels (insider/dev/sniper/bundler), Security Check, API có pricing công khai | Free tier 30k CU/tháng, 1 rps, 3 endpoint → không đủ cho production | Dùng GoPlus/DexScreener/RugCheck thay thế ở MVP; Birdeye là upgrade path |
| **Bubblemaps** | Visual cluster, time-travel, chuẩn de-facto cho "blob" | Không nói *tại sao* liên quan; không có intent; API/SDK hạn chế | Tự dựng graph từ funding data; hiển thị **loại quan hệ + confidence** thay vì chỉ đường nối |
| **DEXTools** | Audit panel, lịch sử dài, trade simulator | Premium gated bằng token, UI nặng | Không cạnh tranh trực diện |
| **RugCheck** | Solana risk score, bundled/sniper supply, insider networks, creatorTokens — **có API công khai** | Score là heuristic, không giải thích đủ; Solana only | **Nguồn dữ liệu chính** cho Solana; ta thêm lớp giải thích + cross-chain |
| **Arkham** | Entity labeling, fund-flow tracing, alerts | Hướng điều tra, không phải token verdict; account-gated | Học cách trình bày entity/flow |
| **GeckoTerminal** | API free, không key, OHLCV + **trades gần nhất** | Không có risk, không có wallet identity | Nguồn chính cho trades/OHLCV/wash-trade detection |
| **Solscan / Etherscan** | Transaction truth, first-funder | Explorer, không phải verdict | Dùng RPC trực tiếp thay vì scrape explorer |

**Kết luận cạnh tranh:** không có tool miễn phí nào kết hợp (a) market data, (b) contract security đa chain, (c) holder classification, (d) funding-graph cluster, (e) deployer history, (f) trade-flow/wash detection — **thành một verdict có trích dẫn**. Đó là khoảng trống.

## 5. Feature opportunities (từ research → 12 ý tưởng, chấm điểm giá trị/chi phí)

| # | Feature | Giải quyết pain | Giá trị | Chi phí | MVP? |
|---|---|---|---|---|---|
| 1 | **Effective Concentration** (concentration sau khi loại LP/burn + gộp cluster) | P1 | Rất cao | Thấp | ✅ |
| 2 | **Deployer Rap Sheet** (lịch sử token của creator + kết cục) | P2 | Rất cao | Thấp (RugCheck `creatorTokens`) | ✅ |
| 3 | **Risk Signals có evidence + source + confidence** thay vì score trần | P7 | Rất cao | Trung bình | ✅ |
| 4 | **Funding-Source Cluster Map** (ví nào fund ví nào, cùng block?) | P1, P6 | Rất cao | Trung bình-Cao | ✅ (Solana, có giới hạn) |
| 5 | **One-screen Verdict + TL;DR có trích dẫn** | P3 | Rất cao | Thấp | ✅ |
| 6 | **Trade-flow / Wash-trade detector** (unique makers vs trades, round-trip wallets, buy/sell imbalance) | P4 | Cao | Thấp (GT trades) | ✅ |
| 7 | **Liquidity vs Price divergence** (pump nhưng LP không tăng) | P4, P10 | Cao | Thấp (OHLCV + DS) | ✅ |
| 8 | **Sniper/early-buyer window** (buy trong N phút đầu, giá entry ước tính) | P6 | Cao | Trung bình | ✅ (một phần) |
| 9 | **Wallet PnL/win-rate** cho top holders | P5 | Cao | Cao (cần indexer) | ⛔ (cần API trả tiền) |
| 10 | **KOL call-timing tracker** (call trước/sau pump, paid vs organic) | P9 | Cao | Cao (cần X API) | ⛔ (module + honest unavailable) |
| 11 | **Watchlist + diff alerts** ("gì đã đổi từ lần check trước") | P8 | Cao | Trung bình | ⛔ (post-MVP) |
| 12 | **Holder-to-holder transfer graph** trong 24h gần nhất | P1 | Trung bình-Cao | Cao | ⛔ |

MVP = 1-8. Chấm điểm chi tiết trong `product-spec.md`.

## 6. Giả định CHƯA được xác minh (phải ghi rõ trong sản phẩm)

1. Ngưỡng "top 10 > 30% là xấu" là heuristic phổ biến, **không** phải chân lý — token mới luôn concentrated. Sản phẩm hiển thị ngưỡng như *benchmark cộng đồng*, không phải luật.
2. "3+ buys trong block 1-2 gần như chắc chắn là bundle" — heuristic từ một bài phân tích, chưa kiểm chứng thống kê.
3. Funding-source clustering có false positive: market maker, CEX hot wallet, launchpad đều fund nhiều ví. Sản phẩm phải loại trừ known entities và ghi confidence.
4. Tác động của bundle lên giá về sau chưa được định lượng trong research này.
5. Nhu cầu trả tiền cho sản phẩm: chưa kiểm chứng (không có phỏng vấn).

## 7. Nguồn

- memecentral.fun — "Best Memecoin Screeners and Trackers Compared (2026)" — https://memecentral.fun/guides/best-memecoin-screeners-and-trackers
- cleanksy.io — "Memecoins: how to spot insiders before listing — on-chain forensics" — https://cleansky.io/blog/memecoin-listing-onchain-forensics-2026/
- clitrader.com — "Memecoin Trading" checklist — https://clitrader.com/trading-skills/memecoin-trading/
- x.com/malangeeSOL — "What I found researching Solana memecoins in October 2026" — https://x.com/malangeeSOL/article/2108526904546648170
- trader.scorplabs.online — "How to Read DexScreener for Solana Memecoins" — https://trader.scorplabs.online/blog/how-to-read-dexscreener-solana-memecoins
- airdropalert.com — "How to Research Meme Coins: Who Is Buying" — https://airdropalert.com/blogs/how-to-research-meme-coins/
- madeonsol.com — "How to Analyze Solana Token Holders" — https://madeonsol.com/blog/how-to-analyze-solana-token-holders
- memeassist.com — "Wallet Checker Crypto: 10 Tools" / "Best Meme Coin Scanners" / "Insider Trading Website Picks" — https://memeassist.com/blog/wallet-checker-crypto , https://memeassist.com/learn/best-memecoin-scanners
- news.dextools.io — "Understanding Screeners for DEXs" — https://news.dextools.io/article/understanding-dex-screeners
- solbotrank.com — "Best Solana Memecoin Screeners (2026)" — https://solbotrank.com/best/best-memecoin-screener
- github.com/buddies2705/awesome-memecoin-trading — tool index
- docs.bitquery.io — Robinhood Chain (chain ID 4663) — https://docs.bitquery.io/docs/blockchain/robinhood/
- coinledger.io — "What Is a Memecoin?" (30% concentration heuristic) — https://coinledger.io/learn/what-is-a-memecoin
