# MARKET RESEARCH — Memecoin Intelligence Terminal

Ngày: 2026-11-19 (vòng 2). Mục tiêu: tìm ra thứ trader thực sự cần mà tool hiện tại chưa làm tốt, rồi build.

## 0. Phương pháp & giới hạn (đọc trước)

**Nguồn đã dùng:** Reddit (r/memecoins, r/solana, r/CryptoHelp, r/defi, r/MemecoinSeason), GitHub (repo tool + dataset), arXiv (paper học thuật về memecoin trên Solana), review site độc lập (gmgnaiapp, airdropalert, dappatlas), blog phân tích on-chain (memecoin.wiki, scorplabs, cleansky).

**X (Twitter): KHÔNG truy cập được.** Không có X API key trong môi trường này; X chặn scrape không login. Mọi "KOL đang nói gì" dưới đây là **không có**. Không có số liệu mention/engagement/sentiment nào được thu thập. Sản phẩm vẫn trả `data unavailable` cho module social — đó là hành vi đúng, không phải thiếu sót.

**Không có phỏng vấn người dùng.** Pain point dưới đây là trích dẫn trực tiếp từ bài đăng công khai, không phải suy đoán của tôi. Chỗ nào là suy luận của tôi thì ghi rõ `[suy luận]`.

## 1. Trader thực sự check gì (trích dẫn trực tiếp)

Từ r/defi — "What do you actually check before touching a token youve never traded before?":
> "First, consider whether the minting and freezing privileges have been removed... Second, examine the leading holders, excluding the liquidity pool. It's essential to investigate if several of them **received funding from the same wallet shortly after the launch**. Sometimes, groups of snipers create the illusion of a 'healthy distribution.' Third, review the developer's wallet history. If their last five projects failed within just three days, that's a more telling indicator than any chart could provide."
> "I often think about the **exit strategy before making an entry**. Will I be able to liquidate my position without facing considerable slippage?"

Từ r/CryptoHelp — "What's everyone actually checking before buying a memecoin?":
> "Ideally, the top ten wallets should own less than 30%... it's a bonus if some of those wallets are identified as funds or reputable traders."
> "tokens newer than an hour tend to be speculative... volume consistency (preferably spread across many wallets rather than a few repeating trades)"

Từ r/memecoins — "Wasted $300 on these":
> "Check how much the top 10% owns. If it's over 20%, get out of the coin. 290 people own this coin and 29 of them (the top 10%) control 60% of the supply"

Từ r/MemecoinSeason — "How to Easily Spot Bundled Memecoins":
> "Top 10 Holding: If it exceeds 20%... Developer Holding: Any percentage over 5% is a warning sign... **Insider Holding (the rat icon)**: tokens that were transferred or 'gifted' between wallets rather than directly purchased... **Sniper Count**: wallets that make purchases within 20 seconds of a token's launch."

Từ memecoin.wiki — "How to Spot a Rug Pull" (5-check list):
> "whether the liquidity can be pulled out from under the pool, how much of the supply was bought in a coordinated bundle at the moment of launch, how concentrated the dev wallet and other insider wallets are, whether the contract actually lets buyers sell once they own the token, and what the deployer's wallet did on its previous launches."

**Tổng hợp: 5 câu hỏi lặp lại ở MỌI nguồn**
1. Contract có cho bán không (honeypot / tax)?
2. Top holders có thực sự độc lập, hay cùng một người (shared funder)?
3. Dev/deployer đã làm gì ở các token trước?
4. Bundle/sniper chiếm bao nhiêu supply lúc launch?
5. **Tôi có thoát được không, và thoát thì mất bao nhiêu?** ← câu này xuất hiện ở r/defi, memecoin.wiki, và mọi checklist.

## 2. Pain points với tool hiện tại (có nguồn)

| Tool | Phàn nàn cụ thể | Nguồn |
|---|---|---|
| **GMGN** | "PnL card and dashboard do not reliably deduct priority fees and tips, so users see green PnL and a shrinking wallet." / "UI can be laggy during high-traffic launches" / "no key export, no audit, undisclosed entity" / "honeypot data comes from third parties such as GoPlus and **may lag**" | gmgnaiapp.com/security/gmgn-review, dappatlas.com/projects/gmgn |
| **GMGN** | "support for new chains and new launchpads is too slow... the intel arrives after the battle is over" / "searching for a ticker on Base, if the coin launched a month ago, the results are mostly fakes" | docingest.com/docs/gmgn.ai |
| **GMGN** | Copy-trade lag 2–5s là structural: "You are always the later buyer... That lag is structural, and I have not found a setting in GMGN's copy trade documentation that closes it." | gmgnguide.com/guides/trading/gmgn-copy-trading |
| **DexScreener** | "DexScreener reports the current pool state; it has **no cross-token memory**." / "shows the balances; it doesn't connect them to one funder" | trader.scorplabs.online |
| **DexScreener API** | "No candles/OHLC/history; WS streams profiles/boosts only, not prices/trades... **Too slow and too thin for launch detection**. A token typically appears here *after* it has already moved." | gist.github.com/zshadowultra |
| **Birdeye** | Free API = 1 req/s, 3 endpoints, 30k CU/tháng → không đủ cho production. "Wallet API group: 30 rpm" | data.birdeye.so/docs/guides/payment/pricing |
| **Bubblemaps** | "a cluster map shows that wallets are related, **not why**. Common funding can be a market maker, an exchange hot wallet, a team allocation or a coordinated bundle." / "It does not tell you whether those holders are good traders." | memecentral.fun, airdropalert.com |
| **RugCheck** | "A score is a heuristic, not a verdict" — không giải thích đủ | memecentral.fun |
| **Tất cả** | Không tool nào trả lời "nếu top holders xả thì giá rơi bao nhiêu" | [suy luận từ khoảng trống: không có nguồn nào mô tả tính năng này ngoài QuantumOrb ở dạng beta] |

## 3. Bằng chứng học thuật: bundle lớn hơn trader tưởng

Paper **MELT** (arXiv 2602.13480, 41k+ launches, 200M+ transactions):
> "on average, **36.5% of token supply is held by coordinated accounts**, a concealment strategy that disguises the true ownership concentration from unsuspecting buyers."

Ba nguồn để nhận diện cùng một entity:
1. **Multi-account co-purchase** — nhiều địa chỉ cùng ký một transaction → chắc chắn cùng chủ.
2. **Fund-flow** — ví được fund bởi cùng một địa chỉ (loại trừ CEX).
3. **Jito bundle ID** — các tx trong cùng bundle do một entity kiểm soát.

Đây là nền tảng để nâng cấp cluster detection của tôi từ "shared funder" (yếu, nhiều false positive) lên **multi-signal với confidence**.

## 4. Ngưỡng chuẩn hoá từ repo open-source

Từ `agiprolabs/claude-trading-skills` (skill sybil-detection) — bảng ngưỡng healthy/suspicious/critical:

| Metric | Healthy | Suspicious | Critical |
|---|---|---|---|
| Unique funder ratio | >0.8 | 0.4–0.8 | <0.4 |
| Funding cluster size | <5 | 5–20 | >20 |
| Bundle ratio (early buys) | <0.1 | 0.1–0.4 | >0.4 |
| Bundled supply % | <5% | 5–20% | >20% |
| Transfer density | <0.1 | 0.1–0.3 | >0.3 |

Từ `CrawlHive`: "funders holding over 5,000 SOL are treated as exchanges, not links. Five or more linked top wallets (or 10%+ of supply) score as *Bundled*." → tôi đã có logic tương tự, cần thêm ngưỡng funder-balance để tránh false positive từ CEX/launchpad.

## 5. Khoảng trống thị trường (xếp theo giá trị)

| # | Opportunity | Bằng chứng | Trạng thái đối thủ | Quyết định |
|---|---|---|---|---|
| **O1** | **Exit liquidity simulator** — "nếu top holders xả X% supply thì giá rơi bao nhiêu; tôi bán $Y thì mất Z%" | Câu hỏi exit xuất hiện ở r/defi + memecoin.wiki; không tool free nào có | QuantumOrb có bản beta "sell scenario" nhưng chỉ pump.fun, không mở | ✅ **BUILD** — toán CPMM thật, dữ liệu đã có |
| **O2** | **Holder entry price & unrealized PnL** từ trade tape — whale đang lãi bao nhiêu → khả năng xả | "if you see a top holder selling... estimate how much more they might sell" (madeonsol) | Birdeye/GMGN có nhưng trả tiền; không ai làm từ trade tape free | ✅ **BUILD** — cross-ref top holders ↔ trades |
| **O3** | **Multi-signal bundle trace** với confidence (funder + same-block có điều kiện + same-tx) | MELT: 36.5% supply coordinated; Bubblemaps "related, not why" | Bubblemaps: chỉ đường nối, không confidence | ✅ **BUILD** — nâng cấp module clusters |
| **O4** | **Deployer rap sheet** (đã có) — thêm "tokens chết trong bao lâu" | r/defi: "last five projects failed within 3 days" | Có nhưng rải rác (Solscan/Kolscan) | ✅ đã có, giữ |
| **O5** | Wallet PnL/win-rate đầy đủ | GMGN/Birdeye mạnh | Cần API trả tiền | ⛔ không làm — sẽ phải bịa |
| **O6** | X/KOL call timing | — | Cần X API | ⛔ không làm |
| **O7** | Real-time launch alerts (sub-second) | gist: cần Yellowstone gRPC, $200+/mo | Đã bão hoà (GMGN/Axiom/Photon) | ⛔ không cạnh tranh |

## 6. Phát hiện quan trọng: false positive trong code hiện tại

Test thật trên BONK (token 4 năm tuổi, 2.1M holders): 300 trades gần nhất → **40 block có ≥3 lệnh mua**. Code hiện tại bắn risk signal "Multiple wallets bought in the same block" → **SAI**. Trên token volume cao, 3 lệnh mua trong một block 400ms là chuyện bình thường.

→ Phải gate theo: tuổi token (<24h) HOẶC cluster có shared funder. Đây là bug về độ chính xác do research + test phát hiện, không phải do đọc code.

## 7. Thiết kế lại UI (yêu cầu: crypto-native, không lạm dụng card/gradient)

Vấn đề hiện tại: mọi thứ là card bo góc + gradient panel + nhiều màu nhấn. Trông như template SaaS.

Hướng mới: **terminal thật** —
- Hairline dividers (`border-t`) thay vì card bao quanh.
- Bảng dữ liệu monospace, số căn phải, không badge trang trí.
- Một màu nhấn duy nhất (sky), đỏ/lục chỉ cho dấu giá trị.
- Không gradient nền, không radial glow, không bo góc lớn (4px).
- Section label dạng `// RISK` uppercase, nhỏ, xám.
- Ưu tiên mật độ: trader muốn thấy nhiều số trên một màn.


## 9. Decision engine — ngưỡng lấy từ đâu (vòng 3)

Người dùng hỏi trực tiếp: "nên mua hay không". Đây là câu hỏi mà mọi checklist
công khai đều trả lời bằng **ngưỡng số**, không phải bằng điểm tổng hợp. Nên
module `analysis/decision.ts` dựng theo dạng **gate pass/caution/fail**, không
phải một con số "điểm mua".

| Gate | Pass | Caution | Fail | Nguồn |
|---|---|---|---|---|
| Top-10 ex-LP/burn (token <30 ngày) | ≤15% | 15–30% | >30% | r/CryptoHelp, r/defi |
| Top-10 (token >30 ngày) | ≤40% | 40–65% | >65% | [suy luận] — ngưỡng mới hiệu chỉnh cho token trưởng thành |
| Creator holdings | ≤3% | 3–10% | >10% | checklist cộng đồng |
| LP locked/burned | ≥90% | 50–90% | <50% | memecoin.wiki |
| Bundled supply (shared funder) | <5% | 5–20% | >20% | r/MemecoinSeason, crawl-hive |
| Liquidity | ≥$50K | $10–50K | <$10K | [suy luận] từ exit math |
| Exit trước 5% slippage | ≥$10K | $2–10K | <$2K | r/defi "exit before entry" |
| Buy/sell imbalance | >+20% | ±20% | <−20% | [suy luận] |
| Tax | <3% | 3–10% | ≥10% | goplus |

**Quy tắc quan trọng nhất:** fail ở tầng contract (honeypot, mint, freeze, tax,
deployer rug history) → `AVOID` bất kể các gate khác. Fail ở tầng thanh khoản →
`HIGH RISK`, vì đó là câu chuyện position size, không phải câu chuyện "token lừa đảo".

**Ba lỗi đã sửa khi test bằng token thật:**
1. `liq`, `liq_cov`, `exit` cùng đo một thứ (độ sâu pool) → một token bị 3 fail
   cho một vấn đề, luôn ra `AVOID`. Gộp thành một gate `exit`.
2. Ngưỡng top-10 của token mới áp lên BONK (1.426 ngày, 2,1 triệu holder) →
   báo fail 36%. Thực tế đó là custody, không phải bundle. Thêm band theo tuổi.
3. Solana không có cơ chế honeypot (chỉ freeze authority) → mọi token Solana
   hiện "honeypot unknown", kéo confidence xuống `low` vĩnh viễn. Bỏ gate này
   khỏi chain Solana.

**Giới hạn:** không có dữ liệu PnL ví, không có smart-money label, không có X.
Nên engine không thể nói "smart money đang mua". Nó chỉ nói được token vi phạm
quy tắc nào. Panel ghi rõ điều đó thay vì giả vờ.

## 8. Nguồn (đầy đủ link)

- r/defi — What do you actually check before touching a token: https://www.reddit.com/r/defi/comments/1x0okrm/
- r/CryptoHelp — What's everyone actually checking before buying a memecoin: https://www.reddit.com/r/CryptoHelp/comments/1sljm4e/
- r/memecoins — Wasted $300 on these: https://www.reddit.com/r/memecoins/comments/1h7tyk5/
- r/memecoins — Finally made money by accepting it's gambling: https://www.reddit.com/r/memecoins/comments/1q7rqms/
- r/MemecoinSeason — How to Easily Spot Bundled Memecoins: https://www.reddit.com/r/MemecoinSeason/comments/1hzdai4/
- r/solana — Is there any skill in buying memecoins: https://www.reddit.com/r/solana/comments/1iyqp45/
- memecoin.wiki — How to Spot a Rug Pull: https://memecoin.wiki/wiki/how_to_spot_a_rug_pull
- arXiv 2602.13480 — MELT: behavioral trace dataset for high-risk memecoin launches: https://arxiv.org/html/2602.13480
- github.com/git-disl/MELT — dataset + code
- github.com/agiprolabs/claude-trading-skills — sybil-detection thresholds
- github.com/h100envy/crawl-hive — bundle detection heuristics (funder >5000 SOL = exchange)
- github.com/QuantumOrb/QuantOrb — "20 wallets can be 4 people", sell scenario
- github.com/ian05012/solana-memecoin-dataset — feature list (cluster_count, cluster_max_pct, insider_cluster_size…)
- gmgnaiapp.com/security/gmgn-review — GMGN complaints
- docingest.com/docs/gmgn.ai — GMGN user complaints
- gmgnguide.com/guides/trading/gmgn-copy-trading — copy lag structural
- dappatlas.com/projects/gmgn — honeypot data lags
- trader.scorplabs.online — DexScreener no cross-token memory
- gist.github.com/zshadowultra — API latency comparison table
- data.birdeye.so/docs/guides/payment/pricing — Birdeye free tier
- memecentral.fun/guides/best-memecoin-screeners-and-trackers — Bubblemaps "related, not why"
- madeonsol.com/blog/how-to-analyze-solana-token-holders — estimate remaining sell pressure
