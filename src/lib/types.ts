export type ChainId = "solana" | "bsc" | "base" | "ethereum" | "robinhood";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Confidence = "high" | "medium" | "low";
export type Verdict =
  | "high_risk"
  | "caution"
  | "neutral"
  | "interesting"
  | "strong_signals";

export interface SourceStatus {
  source: string;
  ok: boolean;
  ms: number;
  error?: string;
  degraded?: boolean;
  note?: string;
}

export interface TokenIdentity {
  address: string;
  chain: ChainId;
  name: string;
  symbol: string;
  decimals?: number;
  imageUrl?: string;
  pairAddress?: string;
  dexId?: string;
  pairCreatedAt?: number;
  url?: string;
}

export interface MarketData {
  priceUsd: number | null;
  priceNative: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  volume6h: number | null;
  volume1h: number | null;
  priceChange: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns24h?: { buys: number; sells: number };
  txns1h?: { buys: number; sells: number };
  totalSupply?: number | null;
  ageHours: number | null;
  pools?: PoolInfo[];
  reserves?: PoolReserves;
}

export interface PoolInfo {
  address: string;
  dex: string;
  liquidityUsd: number | null;
  volume24h: number | null;
  createdAt?: string;
}

/** Raw reserves of the deepest pool, used for exit-impact math. */
export interface PoolReserves {
  baseReserve: number | null; // token units in the pool
  quoteReserve: number | null; // quote units (SOL/ETH/USD) in the pool
  baseReserveUsd: number | null;
  quoteReserveUsd: number | null;
  priceUsd: number | null;
  dex: string | null;
  source: string;
}

export interface ExitScenario {
  /** USD size the trader would sell. */
  sellUsd: number;
  /** Tokens that size represents at the current price. */
  soldTokens: number;
  /** What actually comes out of the pool. */
  proceedsUsd: number;
  priceImpactPct: number;
  priceAfter: number | null;
  /** Supply % that would need to be sold to halve the price. */
  supplyPctToHalve: number | null;
}

export interface ExitAnalysis {
  available: boolean;
  reason?: string;
  reserves: PoolReserves | null;
  scenarios: ExitScenario[];
  /** Largest sell that stays under a given price impact, in USD. */
  maxSellUsd: { slip1: number | null; slip5: number | null; slip10: number | null };
  /** Highest-priority dump risk: the biggest single wallet's full exit. */
  topHolderExit: {
    wallet: string;
    supplyPct: number;
    proceedsUsd: number;
    priceImpactPct: number;
  } | null;
  liquidityCoverage: number | null; // pool liquidity / market cap
}

export interface HolderEntry {
  wallet: string;
  supplyPct: number;
  avgEntryUsd: number | null;
  currentPriceUsd: number | null;
  unrealizedPct: number | null;
  observedBuys: number;
  observedBuysUsd: number;
  soldInWindow: boolean;
  confidence: Confidence;
  note: string;
}


export type HolderKind =
  | "lp"
  | "burn"
  | "exchange"
  | "contract"
  | "locker"
  | "creator"
  | "wallet";

export interface HolderRow {
  address: string; // token account or wallet
  owner?: string; // wallet that controls it
  pct: number;
  amount: number;
  kind: HolderKind;
  label?: string;
  insider: boolean;
  clusterId?: string;
}

export interface HolderAnalysis {
  totalHolders: number | null;
  rows: HolderRow[];
  top10Pct: number | null;
  top10PctAdjusted: number | null; // after removing lp/burn
  top20Pct: number | null;
  effectiveTop10Pct: number | null; // after removing lp/burn AND merging clusters
  excludedPct: number; // lp + burn
  distribution: { bucket: string; pct: number; count: number }[];
  dataAvailable: boolean;
  /**
   * False when the supply is still effectively one program account (a bonding
   * curve before graduation, or a single pool). Concentration numbers are then
   * meaningless — a 0% "effective top-10" means "nobody holds it yet", not
   * "safely distributed".
   */
  meaningful: boolean;
  note?: string;
}

export interface ClusterNode {
  id: string;
  address: string;
  pct: number;
  kind: HolderKind;
  label?: string;
  fundingSource?: string;
  fundingLabel?: string;
  sameBlockAs?: string[];
  confidence: Confidence;
}

export interface ClusterEdge {
  from: string;
  to: string;
  type: "funding" | "same_block_buy";
  confidence: Confidence;
}

export interface ClusterAnalysis {
  nodes: ClusterNode[];
  edges: ClusterEdge[];
  groups: { id: string; label: string; pct: number; members: string[]; confidence: Confidence }[];
  effectiveTop10Pct: number | null;
  /** Supply % held by wallets we could link to a shared funder. */
  bundledSupplyPct: number | null;
  traced: number;
  total: number;
  /** Wallets whose first funding could not be reached within the RPC budget. */
  unknown: number;
  dataAvailable: boolean;
  note?: string;
}

export interface Trade {
  txHash: string;
  blockNumber: number;
  timestamp: string;
  wallet: string;
  kind: "buy" | "sell";
  amountUsd: number | null;
  tokenAmount: number | null;
  priceUsd: number | null;
}

export interface FlowAnalysis {
  windowTrades: number;
  buys: number;
  sells: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  uniqueTraders: number;
  uniqueMakers: number;
  tradesPerTrader: number | null;
  imbalance: number | null; // (buyVol - sellVol) / total
  largestTradeUsd: number | null;
  topTraderShare: number | null;
  washRatio: number | null; // share of volume from wallets with round-trip churn
  sameBlockBuyGroups: { block: number; wallets: string[]; tokenAmount: number }[];
  /**
   * Same-block co-buying is only evidence of a bundle on young or low-activity
   * tokens. On a mature token with thousands of trades a block, three buys in
   * one block is noise. False when the token is older than the gate.
   */
  sameBlockMeaningful: boolean;
  sniperWallets: { wallet: string; block: number; amountUsd: number | null }[];
  divergence: {
    priceChange24h: number | null;
    liquidityChangePct: number | null;
    verdict: "healthy" | "pump_without_liquidity" | "liquidity_drain" | "unknown";
  };
  dataAvailable: boolean;
  /** Set when only a coarse summary was available (no trade tape). */
  note?: string;
}

export interface RiskSignal {
  id: string;
  name: string;
  severity: Severity;
  evidence: string;
  source: string;
  confidence: Confidence;
  explanation: string;
  observedAt: string;
  category:
    | "contract"
    | "liquidity"
    | "holders"
    | "insiders"
    | "flow"
    | "deployer"
    | "market";
}

export interface PositiveSignal {
  id: string;
  name: string;
  evidence: string;
  source: string;
}

export interface CreatorToken {
  mint: string;
  symbol?: string;
  name?: string;
  rugged?: boolean;
  holders?: number;
  liquidityUsd?: number;
  createdAt?: string;
}

export interface DeployerAnalysis {
  address: string | null;
  balancePct: number | null;
  priorTokens: CreatorToken[];
  ruggedCount: number;
  dataAvailable: boolean;
  note?: string;
}

export interface SecurityData {
  mintAuthority: string | null;
  freezeAuthority: string | null;
  mintable: boolean | null;
  freezable: boolean | null;
  honeypot: boolean | null;
  buyTax: number | null;
  sellTax: number | null;
  transferFeePct: number | null;
  ownerPrivileges: string[];
  verified: boolean | null;
  lpLockedPct: number | null;
  lpBurned: boolean | null;
  launchpad?: string | null;
  dataAvailable: boolean;
}

export interface SocialAnalysis {
  dataAvailable: boolean;
  reason: string;
  mentions?: number;
  sentiment?: number;
  kols?: { handle: string; calledAt: string; priceAtCall: number }[];
}

export interface ReportSection {
  title: string;
  body: string;
  citations: string[];
  unavailable?: boolean;
}

export interface AnalysisResult {
  token: TokenIdentity;
  market: MarketData;
  security: SecurityData;
  holders: HolderAnalysis;
  clusters: ClusterAnalysis;
  flow: FlowAnalysis;
  deployer: DeployerAnalysis;
  exit: ExitAnalysis;
  holderEntries: HolderEntry[];
  social: SocialAnalysis;
  risks: RiskSignal[];
  positives: PositiveSignal[];
  riskScore: number;
  verdict: Verdict;
  tldr: string[];
  report: ReportSection[];
  provenance: SourceStatus[];
  generatedAt: string;
  cached?: boolean;
  disclaimer: string;
}
