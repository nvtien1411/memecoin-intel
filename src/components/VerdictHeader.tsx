"use client";

import { useState } from "react";
import type { AnalysisResult } from "@/lib/types";
import { STANCE_META } from "@/lib/analysis/decision";
import { fmtAge, fmtChange, fmtPrice, fmtUsd } from "@/lib/http";
import { Stat } from "./ui";

function short(addr: string, n = 5) {
  return addr.length > n * 2 + 2 ? `${addr.slice(0, n + 2)}…${addr.slice(-n)}` : addr;
}

function CopyAddr({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="rounded border border-[#2a323d] px-1.5 py-0.5 text-[11px] text-slate-400 transition hover:border-sky-500/50 hover:text-sky-300"
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

export function VerdictHeader({ data }: { data: AnalysisResult }) {
  const call = data.decision;
  const stance = STANCE_META[call.stance];
  const change = data.market.priceChange.h24 ?? null;
  const changeInfo = fmtChange(change, data.market.ageHours);
  const eff = data.holders.effectiveTop10Pct;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4">
        {data.token.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.token.imageUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-full border border-[#232b36] object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#232b36] bg-[#11151b] font-mono text-[12px] text-slate-400">
            {data.token.symbol.slice(0, 3).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight text-slate-50">
              {data.token.name}
            </h1>
            {data.token.symbol.toLowerCase() !== data.token.name.toLowerCase() && (
              <span className="font-mono text-[14px] text-sky-400">
                {data.token.symbol.toUpperCase()}
              </span>
            )}
            <span className="rounded border border-[#2a323d] px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-slate-400">
              {data.token.chain}
            </span>
            {data.token.dexId && (
              <span className="font-mono text-[11.5px] text-slate-500">{data.token.dexId}</span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[12px] text-slate-400">
            <a
              href={data.token.url}
              target="_blank"
              rel="noreferrer"
              title={data.token.address}
              className="text-slate-300 underline decoration-[#39434f] decoration-dotted underline-offset-[3px] transition hover:text-sky-400"
            >
              {short(data.token.address, 6)}
            </a>
            <CopyAddr address={data.token.address} />
          </div>
        </div>

        <div className={`shrink-0 rounded border px-4 py-2.5 ${stance.tone}`}>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] opacity-60">
            our call
          </div>
          <div className="mt-0.5 text-[14px] font-bold uppercase leading-none tracking-[0.1em]">
            {stance.label}
          </div>
          <div className="mt-1.5 flex items-baseline gap-1 font-mono text-[11px] opacity-70">
            <span className="tabular-nums">{data.riskScore}</span>
            <span>/100 risk score</span>
          </div>
        </div>
      </div>

      <p className="max-w-3xl text-[13px] leading-relaxed text-slate-400">{call.oneLiner}</p>

      <div className="grid grid-cols-2 gap-px border border-[#2b333e] bg-[#2b333e] sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Price"
          value={fmtPrice(data.market.priceUsd)}
          sub={
            change === null
              ? "no price history"
              : `${changeInfo.text} ${changeInfo.label}`
          }
          subTone={change === null ? "default" : change >= 0 ? "up" : "down"}
        />
        <Stat
          label="Market cap"
          value={fmtUsd(data.market.marketCap ?? data.market.fdv)}
          sub={`FDV ${fmtUsd(data.market.fdv)}`}
        />
        <Stat
          label="Liquidity (top pool)"
          value={fmtUsd(data.market.liquidityUsd)}
          sub={`Vol 24h ${fmtUsd(data.market.volume24h)}`}
        />
        <Stat
          label="Age"
          value={fmtAge(data.market.ageHours)}
          sub={`${data.holders.totalHolders?.toLocaleString() ?? "?"} holders`}
        />
        <Stat
          label="Eff. top-10"
          value={
            !data.holders.meaningful ? "n/a" : eff === null ? "—" : `${eff.toFixed(1)}%`
          }
          sub={
            !data.holders.meaningful
              ? "curve holds supply"
              : eff === null
                ? "unavailable"
                : "ex-LP/burn, clusters merged"
          }
          tone={
            !data.holders.meaningful || eff === null
              ? "default"
              : eff >= 50
                ? "down"
                : eff >= 35
                  ? "warn"
                  : "up"
          }
        />
        <Stat
          label="Net flow (by volume)"
          value={
            data.flow.imbalance === null ? "—" : `${(data.flow.imbalance * 100).toFixed(0)}%`
          }
          sub={
            data.flow.dataAvailable
              ? `${fmtUsd(data.flow.buyVolumeUsd)} in / ${fmtUsd(data.flow.sellVolumeUsd)} out`
              : data.flow.note
                ? "from 24h txn counts"
                : "unavailable"
          }
          tone={
            data.flow.imbalance === null ? "default" : data.flow.imbalance >= 0 ? "up" : "down"
          }
        />
      </div>

      {data.tldr.length > 0 && (
        <ul className="space-y-2 border-l-2 border-sky-500/40 pl-4">
          {data.tldr.map((line, i) => (
            <li key={i} className="text-[13px] leading-relaxed text-slate-300">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
