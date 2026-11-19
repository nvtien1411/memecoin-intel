"use client";

import type { HolderAnalysis } from "@/lib/types";
import { concentrationBand, holderKindLabel } from "@/lib/analysis/holders";
import { explorerUrl, shortAddr } from "@/lib/chains";
import type { ChainId } from "@/lib/types";
import { Bar, Panel, Unavailable } from "./ui";

const KIND_STYLE: Record<string, string> = {
  lp: "text-violet-300 border-violet-500/40",
  burn: "text-slate-400 border-slate-500/40",
  exchange: "text-cyan-300 border-cyan-500/40",
  contract: "text-blue-300 border-blue-500/40",
  locker: "text-teal-300 border-teal-500/40",
  creator: "text-rose-300 border-rose-500/40",
  wallet: "text-slate-300 border-[#2a323d]",
};

export function HolderTable({
  holders,
  chain,
}: {
  holders: HolderAnalysis;
  chain: ChainId;
}) {
  if (!holders.dataAvailable) {
    return (
      <Panel title="Holder distribution">
        <Unavailable reason="No holder list is exposed by the free data sources for this chain/pair. Concentration cannot be computed — treat as unknown, not as safe." />
      </Panel>
    );
  }

  if (!holders.meaningful) {
    return (
      <Panel title="Holder distribution" subtitle="Concentration is not assessable yet">
        <div className="rounded border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5">
          <div className="font-mono text-[12px] font-semibold uppercase tracking-wide text-amber-400">
            supply still in the launch mechanism
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-amber-200/80">
            {holders.note}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-px border border-[#2b333e] bg-[#2b333e]">
          <div className="bg-[#07080a] px-2.5 py-2">
            <div className="font-mono text-[13px] uppercase tracking-[0.12em] text-slate-500">
              holders
            </div>
            <div className="mt-0.5 font-mono text-[13px] text-slate-200">
              {holders.totalHolders?.toLocaleString() ?? "—"}
            </div>
          </div>
          <div className="bg-[#07080a] px-2.5 py-2">
            <div className="font-mono text-[13px] uppercase tracking-[0.12em] text-slate-500">
              held by pool / curve
            </div>
            <div className="mt-0.5 font-mono text-[13px] text-slate-200">
              {holders.excludedPct.toFixed(1)}%
            </div>
          </div>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
          Read the contract, liquidity and flow panels instead. Once the token graduates and holders
          appear, this panel will compute real concentration.
        </p>
      </Panel>
    );
  }

  const band = concentrationBand(holders.effectiveTop10Pct);
  const tone =
    band.band === "extreme" || band.band === "high"
      ? "rose"
      : band.band === "moderate"
        ? "amber"
        : "emerald";

  return (
    <Panel
      title="Holder distribution"
      subtitle={band.note}
      right={
        <div className="text-right">
          <div className="font-mono text-[15px] font-semibold text-slate-100">
            {holders.effectiveTop10Pct === null
              ? "—"
              : `${holders.effectiveTop10Pct.toFixed(1)}%`}
          </div>
          <div className="text-[12px] uppercase tracking-wide text-slate-500">effective top-10</div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded border border-[#232b36] bg-[#0b0e12] px-2 py-1.5">
            <div className="font-mono text-[13px] text-slate-200">
              {holders.top10Pct?.toFixed(1) ?? "—"}%
            </div>
            <div className="text-[12px] uppercase text-slate-500">raw top-10</div>
          </div>
          <div className="rounded border border-[#232b36] bg-[#0b0e12] px-2 py-1.5">
            <div className="font-mono text-[13px] text-slate-200">
              {holders.top10PctAdjusted?.toFixed(1) ?? "—"}%
            </div>
            <div className="text-[12px] uppercase text-slate-500">ex-LP/burn</div>
          </div>
          <div className="rounded border border-[#232b36] bg-[#0b0e12] px-2 py-1.5">
            <div className="font-mono text-[13px] text-slate-200">
              {holders.excludedPct.toFixed(1)}%
            </div>
            <div className="text-[12px] uppercase text-slate-500">excluded</div>
          </div>
        </div>

        <div>
          <Bar
            value={Math.min(100, holders.effectiveTop10Pct ?? 0)}
            tone={tone as "rose" | "amber" | "emerald"}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#232b36] text-[12px] uppercase tracking-wide text-slate-500">
                <th className="py-1.5 pr-2 font-medium">#</th>
                <th className="py-1.5 pr-2 font-medium">Wallet</th>
                <th className="py-1.5 pr-2 font-medium">Type</th>
                <th className="py-1.5 pr-2 text-right font-medium">%</th>
                <th className="py-1.5 text-right font-medium">Cluster</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {holders.rows.map((h, i) => (
                <tr
                  key={`${h.address}-${i}`}
                  className="border-b border-[#171c24] last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="py-1.5 pr-2 text-slate-500">{i + 1}</td>
                  <td className="py-1.5 pr-2">
                    <a
                      href={explorerUrl(chain, h.owner ?? h.address)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-300 underline decoration-dotted underline-offset-2 hover:text-sky-400"
                      title={h.owner ?? h.address}
                    >
                      {shortAddr(h.owner ?? h.address)}
                    </a>
                    {h.label && (
                      <span className="ml-1.5 font-sans text-[13px] text-slate-500">{h.label}</span>
                    )}
                    {h.insider && (
                      <span className="ml-1.5 rounded border border-rose-500/40 px-1 py-px font-sans text-[13px] uppercase text-rose-300">
                        insider
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span
                      className={`rounded border px-1.5 py-px font-sans text-[12px] ${
                        KIND_STYLE[h.kind] ?? KIND_STYLE.wallet
                      }`}
                    >
                      {holderKindLabel(h.kind)}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-right text-slate-200">{h.pct.toFixed(2)}</td>
                  <td className="py-1.5 text-right text-slate-500">
                    {h.clusterId ? "linked" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}
