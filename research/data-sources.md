# Data Sources — đã kiểm chứng bằng call thật (2026-11-19)

Mọi dòng dưới đây đều được test bằng `curl` từ máy này. Cột "Kết quả test" là output thật, không phải suy đoán.

## 1. Bảng chọn nguồn

| Nguồn | Dùng cho | Key | Giới hạn | Kết quả test | Vai trò |
|---|---|---|---|---|---|
| **DexScreener** `/latest/dex/tokens/{addr}` | pair, giá, mcap, fdv, liquidity, volume, txns, priceChange, pairCreatedAt, dexId | Không | ~300 req/phút (không công bố chính thức) | ✅ trả pairs[] đầy đủ cho BONK | Market data chính |
| **DexScreener** `/latest/dex/search?q=` | tìm token theo symbol/address | Không | như trên | ✅ | Fallback discovery |
| **GeckoTerminal** `/networks/{net}/tokens/{addr}` | supply, decimals, name, image | Không | 30 req/phút | ✅ | Bổ sung metadata |
| **GeckoTerminal** `/networks/{net}/tokens/{addr}/pools` | pool list + reserve | Không | 30 rpm | ✅ | Chọn pool tốt nhất |
| **GeckoTerminal** `/networks/{net}/pools/{pool}/trades` | **trades gần nhất**: block_number, block_timestamp, tx_from_address, kind buy/sell, amount, price USD | Không | 30 rpm | ✅ 300 trades | Wash-trade / bundle / flow |
| **GeckoTerminal** `/networks/{net}/pools/{pool}/ohlcv/hour` | OHLCV | Không | 30 rpm | ✅ | Price/liquidity divergence |
| **GeckoTerminal** `/search/pools?network=robinhood` | pool theo address trên chain 4663 | Không | 30 rpm | ✅ | Robinhood Chain discovery (DexScreener trả `pairs: null` cho token này) |
| **RugCheck** `/v1/tokens/{mint}/report` | topHolders (có `insider`, `owner`), knownAccounts (AMM/LOCKER/CREATOR label), creatorTokens, insiderNetworks, graphInsidersDetected, mint/freezeAuthority, transferFee, totalHolders, markets, launchpad | Không | Không công bố; thực tế ~1 req/s ổn | ✅ Solana | **Nguồn lõi Solana** |
| **RugCheck** `/v1/tokens/{mint}/report/summary` | score rút gọn | Không | như trên | ✅ | Nhanh, ít payload |
| **GoPlus** `/api/v1/token_security/{chainId}` | honeypot, buy/sell tax, mintable, freezable, owner privileges, holder_count, holders[], lp_holders, creator_address | Không (30 rpm) | 30 rpm unauth | ✅ BSC 56, Solana, **chain 4663 (Robinhood)** | **Nguồn lõi EVM + Robinhood** |
| **Solana public RPC** `api.mainnet-beta.solana.com` | getTokenSupply, getSignaturesForAddress, getTransaction | Không | Rate limit chặt nhưng đủ cho 8-10 ví/token | ✅ ~0.33s/req | Funding-source tracing |
| **publicnode** `bsc-rpc.publicnode.com`, `base-rpc.publicnode.com` | eth_blockNumber, eth_getCode, eth_getLogs | Không | fair use | ✅ | EVM on-chain checks |
| **Robinhood RPC** `rpc.mainnet.chain.robinhood.com` | EVM JSON-RPC, chain 4663 | Không | fair use | ✅ | Robinhood Chain |
| **Bitquery** | Robinhood Chain decoded data (launchpad, holders) | Có | Trả tiền | Đọc docs, chưa test | Upgrade path |

## 2. Nguồn đã loại (và lý do)

| Nguồn | Lý do loại |
|---|---|
| **Birdeye API** | Free = 30.000 CU/tháng, **1 rps, chỉ 3 endpoint**; Wallet API 30 rpm. Không đủ cho production free. Pricing công khai: Lite $39, Starter $99, Premium $199. → upgrade path, không dùng ở MVP. |
| **GMGN** | Không có API công khai; dữ liệu nằm sau UI + auth. Chỉ học khái niệm (bundle %, wallet radar). |
| **Nansen / Arkham** | Account-gated, trả tiền, không có free tier dùng được bằng API. |
| **Bubblemaps API** | Không có public API ổn định; SDK không mở. → **tự dựng** graph từ funding data + transfer data. |
| **X / Twitter API** | Free tier đã bị gỡ; không có key trong môi trường này. → module social trả `unavailable`. Không scrape (ToS + chặn). |
| **Solscan API** | Cần key, free tier rất hạn chế (1 rps, 1000 req/ngày). RPC trực tiếp rẻ hơn. |
| **Etherscan API** | Cần key; V2 free 5 req/s nhưng holder list phải trả tiền. GoPlus thay thế. |
| **ankr / drpc / omniatech public Solana** | Test thật: ankr 403, drpc "chain not available on free plan", omniatech 521, alchemy demo trả rỗng. → chỉ dùng `api.mainnet-beta.solana.com`. |

## 3. Kiến trúc chịu lỗi (vì sao chọn các nguồn này)

- **Không key** = không có bí mật để rò rỉ, không có hoá đơn, deploy được ngay. Vẫn đọc `process.env` cho provider trả tiền sau này.
- **Nhiều nguồn cho cùng một field** → nếu một nguồn chết, dashboard vẫn render với `source: degraded` thay vì trắng trang.
- **Mọi signal đều ghi `source` + `observedAt`** → người dùng kiểm chứng được.
- Rate limit: mỗi provider có limiter riêng (token bucket) + cache TTL (30–120s) ở server.

## 4. Giới hạn phải nói thật với người dùng

1. **Funding tracing trên Solana** chỉ làm cho top N holder (mặc định 8) và chỉ lấy được tx đầu tiên nếu ví có <1000 signature. Ví hoạt động cực mạnh → trả `partial`.
2. **Bundle detection** từ GT trades chỉ thấy **trades gần nhất** (300), không thấy block launch. Bundle lúc launch lấy từ RugCheck (`insiderNetworks`, `graphInsidersDetected`, `topHolders[].insider`).
3. **Robinhood Chain**: DexScreener trả `pairs: null` cho token test → phải đi qua GeckoTerminal search. Holder data chỉ có từ GoPlus (không có insider label như Solana).
4. **Wallet PnL/win-rate** không có nguồn free → không hiển thị, không bịa.
5. **Social/KOL** không có nguồn → hiển thị "unavailable".
