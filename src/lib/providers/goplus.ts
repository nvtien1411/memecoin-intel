import { fetchJson, num } from "../http";
import type { ChainId, HolderRow, HolderKind, SecurityData } from "../types";
import { CHAINS } from "../chains";

const BASE = "https://api.gopluslabs.io/api/v1";

interface GpHolder {
  address: string;
  tag?: string;
  is_contract?: number;
  balance?: string;
  percent?: string;
  is_locked?: number;
}

interface GpToken {
  // EVM fields
  is_honeypot?: string;
  buy_tax?: string;
  sell_tax?: string;
  transfer_tax?: string;
  cannot_buy?: string;
  cannot_sell_all?: string;
  is_open_source?: string;
  is_proxy?: string;
  hidden_owner?: string;
  can_take_back_ownership?: string;
  owner_change_balance?: string;
  selfdestruct?: string;
  external_call?: string;
  is_blacklisted?: string;
  is_whitelisted?: string;
  is_mintable?: string;
  pausable?: string;
  slippage_modifiable?: string;
  personal_slippage_modifiable?: string;
  trading_cooldown?: string;
  honeypot_with_same_creator?: string;
  creator_address?: string;
  creator_percent?: string;
  owner_address?: string;
  owner_percent?: string;
  holder_count?: string;
  holders?: GpHolder[];
  lp_holders?: GpHolder[];
  lp_total_supply?: string;
  total_supply?: string;
  // Solana fields
  mintable?: { status?: string; authority?: { address?: string }[] };
  freezable?: { status?: string; authority?: { address?: string }[] };
  balance_mutable_authority?: { status?: string };
  closable?: { status?: string };
  non_transferable?: string;
  transfer_fee?: { fee_rate?: number; status?: string };
  trusted_token?: number;
  creators?: { address: string; percentage?: string }[];
  metadata?: { mutable?: boolean; update_authority?: string };
}

type GpResponse = { code: number; message: string; result: Record<string, GpToken> };

export async function gpTokenSecurity(chain: ChainId, address: string) {
  const chainId = CHAINS[chain].goplusChainId;
  if (!chainId) return { ok: false, data: null, status: { source: "goplus", ok: false, ms: 0, error: "chain not supported" } };
  const url =
    chainId === "solana"
      ? `${BASE}/solana/token_security?contract_addresses=${address}`
      : `${BASE}/token_security/${chainId}?contract_addresses=${address.toLowerCase()}`;
  return fetchJson<GpResponse>("goplus", url, {
    ttlMs: 120_000,
    label: "goplus",
    timeoutMs: 12_000,
  });
}

export function pickGpToken(res: GpResponse | null, address: string): GpToken | null {
  if (!res?.result) return null;
  const key = Object.keys(res.result).find(
    (k) => k.toLowerCase() === address.toLowerCase(),
  );
  return key ? res.result[key] : Object.values(res.result)[0] ?? null;
}

const EVM_BURN = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
]);

export function holdersFromGp(t: GpToken | null): HolderRow[] {
  if (!t) return [];
  const holders: HolderRow[] = [];
  const creator = t.creator_address?.toLowerCase();
  for (const h of t.holders ?? []) {
    const p = num(h.percent);
    if (p === null || p <= 0) continue;
    const addr = h.address;
    let kind: HolderKind = "wallet";
    let label: string | undefined;
    if (EVM_BURN.has(addr.toLowerCase())) {
      kind = "burn";
      label = "Burn address";
    } else if (h.is_locked === 1) {
      kind = "locker";
      label = "Locked";
    } else if (creator && addr.toLowerCase() === creator) {
      kind = "creator";
      label = "Creator";
    } else if (h.is_contract === 1) {
      kind = "contract";
      label = h.tag || "Contract";
    }
    holders.push({
      address: addr,
      owner: addr,
      pct: p * 100,
      amount: num(h.balance) ?? 0,
      kind,
      label: label ?? (h.tag || undefined),
      insider: false,
    });
  }
  return holders.sort((a, b) => b.pct - a.pct);
}

export function securityFromGp(t: GpToken | null): SecurityData {
  if (!t) {
    return {
      mintAuthority: null,
      freezeAuthority: null,
      mintable: null,
      freezable: null,
      honeypot: null,
      buyTax: null,
      sellTax: null,
      transferFeePct: null,
      ownerPrivileges: [],
      verified: null,
      lpLockedPct: null,
      lpBurned: null,
      dataAvailable: false,
    };
  }

  const isSolana = t.mintable !== undefined || t.freezable !== undefined;
  const privileges: string[] = [];
  if (t.hidden_owner === "1") privileges.push("hidden owner");
  if (t.can_take_back_ownership === "1") privileges.push("ownership can be reclaimed");
  if (t.owner_change_balance === "1") privileges.push("owner can modify balances");
  if (t.is_blacklisted === "1") privileges.push("blacklist function");
  if (t.selfdestruct === "1") privileges.push("self-destruct");
  if (t.slippage_modifiable === "1") privileges.push("modifiable tax");
  if (t.is_proxy === "1") privileges.push("upgradable proxy");
  if (t.pausable === "1") privileges.push("pausable transfers");
  if (t.is_mintable === "1") privileges.push("mintable");
  if (t.balance_mutable_authority?.status === "1") privileges.push("balance authority active");

  let lpLockedPct: number | null = null;
  const lp = t.lp_holders ?? [];
  if (lp.length > 0) {
    const locked = lp
      .filter((h) => h.is_locked === 1 || EVM_BURN.has(h.address.toLowerCase()))
      .reduce((s, h) => s + (num(h.percent) ?? 0), 0);
    lpLockedPct = locked * 100;
  }

  const solanaMintable = isSolana ? t.mintable?.status === "1" : t.is_mintable === "1";
  const solanaFreezable = isSolana ? t.freezable?.status === "1" : false;

  return {
    mintAuthority:
      t.mintable?.authority?.[0]?.address ??
      (t.owner_address && t.is_mintable === "1" ? t.owner_address : null),
    freezeAuthority: t.freezable?.authority?.[0]?.address ?? null,
    mintable: solanaMintable ?? null,
    freezable: solanaFreezable,
    honeypot:
      t.is_honeypot === "1" || t.cannot_sell_all === "1" || t.cannot_buy === "1"
        ? true
        : t.is_honeypot === "0"
          ? false
          : null,
    buyTax: num(t.buy_tax) !== null ? (num(t.buy_tax) as number) * 100 : null,
    sellTax: num(t.sell_tax) !== null ? (num(t.sell_tax) as number) * 100 : null,
    transferFeePct:
      num(t.transfer_fee?.fee_rate) !== null
        ? (num(t.transfer_fee?.fee_rate) as number) * 100
        : null,
    ownerPrivileges: privileges,
    verified: t.is_open_source === "1" ? true : t.is_open_source === "0" ? false : null,
    lpLockedPct,
    lpBurned: lpLockedPct !== null ? lpLockedPct >= 99.5 : null,
    dataAvailable: true,
  };
}
