"use client";

import { useRef, useState } from "react";
import type { ChainId } from "@/lib/types";

const CHAINS: { id: ChainId | "auto"; label: string }[] = [
  { id: "auto", label: "Auto-detect" },
  { id: "solana", label: "Solana" },
  { id: "bsc", label: "BNB Chain" },
  { id: "base", label: "Base" },
  { id: "ethereum", label: "Ethereum" },
  { id: "robinhood", label: "Robinhood Chain" },
];

const SAMPLES: { label: string; address: string; chain: ChainId | "auto" }[] = [
  { label: "BONK", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", chain: "solana" },
  { label: "CAKE", address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", chain: "bsc" },
];

export function SearchBar({
  onAnalyze,
  loading,
}: {
  onAnalyze: (address: string, chain: ChainId | null) => void;
  loading: boolean;
}) {
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState<ChainId | "auto">("auto");
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const value = address.trim();
    if (!value || loading) return;
    onAnalyze(value, chain === "auto" ? null : chain);
  }

  const valid = address.trim().length > 0;

  return (
    <div>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Paste a contract or pair address"
            spellCheck={false}
            autoComplete="off"
            aria-label="Token contract address"
            className="w-full rounded border border-[#2a323d] bg-[#0c1015] py-3 pl-3.5 pr-16 font-mono text-[13.5px] text-slate-100 outline-none transition placeholder:font-sans placeholder:text-[13px] placeholder:text-slate-500 hover:border-[#39434f] focus:border-sky-500/70 focus:ring-2 focus:ring-sky-500/20"
          />
          {address && (
            <button
              type="button"
              onClick={() => {
                setAddress("");
                inputRef.current?.focus();
              }}
              aria-label="Clear address"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11.5px] text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
            >
              clear
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value as ChainId | "auto")}
            aria-label="Chain"
            className="min-h-[44px] rounded border border-[#2a323d] bg-[#0c1015] px-2.5 py-3 text-[12.5px] text-slate-300 outline-none transition hover:border-[#39434f] focus:border-sky-500/70"
          >
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading || !valid}
            className="min-h-[44px] flex-1 rounded bg-sky-500 px-5 py-3 text-[13px] font-semibold text-[#04121c] transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-[#1c232c] disabled:text-slate-500 sm:flex-none"
          >
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </div>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-500">
          try
        </span>
        {SAMPLES.map((s) => (
          <button
            key={s.address}
            onClick={() => {
              setAddress(s.address);
              setChain(s.chain);
              onAnalyze(s.address, s.chain === "auto" ? null : s.chain);
            }}
            disabled={loading}
            className="min-h-[36px] rounded border border-[#2a323d] bg-[#0c1015] px-2 py-1 font-mono text-[11.5px] text-slate-300 transition hover:border-sky-500/50 hover:text-sky-300 disabled:opacity-50"
          >
            {s.label}
          </button>
        ))}
        <span className="ml-auto hidden font-mono text-[10.5px] text-slate-500 sm:block">
          5 chains · no api key required
        </span>
      </div>
    </div>
  );
}
