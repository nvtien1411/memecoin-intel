import type { ChainId } from "./types";

export interface ChainConfig {
  id: ChainId;
  name: string;
  short: string;
  geckoNetwork: string | null; // GeckoTerminal network id
  dexScreenerId: string | null;
  goplusChainId: string | null;
  rpc: string | null;
  explorer: string | null;
  nativeSymbol: string;
  family: "solana" | "evm";
}

export const CHAINS: Record<ChainId, ChainConfig> = {
  solana: {
    id: "solana",
    name: "Solana",
    short: "SOL",
    geckoNetwork: "solana",
    dexScreenerId: "solana",
    goplusChainId: "solana",
    rpc: "https://api.mainnet-beta.solana.com",
    explorer: "https://solscan.io/token/",
    nativeSymbol: "SOL",
    family: "solana",
  },
  bsc: {
    id: "bsc",
    name: "BNB Chain",
    short: "BSC",
    geckoNetwork: "bsc",
    dexScreenerId: "bsc",
    goplusChainId: "56",
    rpc: "https://bsc-rpc.publicnode.com",
    explorer: "https://bscscan.com/token/",
    nativeSymbol: "BNB",
    family: "evm",
  },
  base: {
    id: "base",
    name: "Base",
    short: "BASE",
    geckoNetwork: "base",
    dexScreenerId: "base",
    goplusChainId: "8453",
    rpc: "https://base-rpc.publicnode.com",
    explorer: "https://basescan.org/token/",
    nativeSymbol: "ETH",
    family: "evm",
  },
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    short: "ETH",
    geckoNetwork: "eth",
    dexScreenerId: "ethereum",
    goplusChainId: "1",
    rpc: "https://ethereum-rpc.publicnode.com",
    explorer: "https://etherscan.io/token/",
    nativeSymbol: "ETH",
    family: "evm",
  },
  robinhood: {
    id: "robinhood",
    name: "Robinhood Chain",
    short: "HOOD",
    geckoNetwork: "robinhood",
    dexScreenerId: "robinhood",
    goplusChainId: "4663",
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com/token/",
    nativeSymbol: "ETH",
    family: "evm",
  },
};

export const CHAIN_LIST = Object.values(CHAINS);

/** Chains probed in parallel when an EVM address is pasted without a chain. */
export const EVM_PROBE_ORDER: ChainId[] = ["bsc", "base", "ethereum", "robinhood"];

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_RE = /^0x[a-fA-F0-9]{40}$/;

export function isValidAddress(address: string): boolean {
  return BASE58_RE.test(address) || EVM_RE.test(address);
}

export function guessFamily(address: string): "solana" | "evm" | null {
  if (EVM_RE.test(address)) return "evm";
  if (BASE58_RE.test(address)) return "solana";
  return null;
}

export function chainByGeckoNetwork(network: string): ChainId | null {
  const found = CHAIN_LIST.find((c) => c.geckoNetwork === network);
  return found ? found.id : null;
}

export function chainByDexScreenerId(id: string): ChainId | null {
  const found = CHAIN_LIST.find((c) => c.dexScreenerId === id);
  return found ? found.id : null;
}

export function explorerUrl(chain: ChainId, address: string): string {
  const cfg = CHAINS[chain];
  return `${cfg.explorer ?? ""}${address}`;
}

export function shortAddr(address: string, size = 4): string {
  if (!address) return "";
  if (address.length <= size * 2 + 2) return address;
  return `${address.slice(0, size + 2)}…${address.slice(-size)}`;
}
