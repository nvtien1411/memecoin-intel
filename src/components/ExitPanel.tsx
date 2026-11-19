"use client";

import type { ExitAnalysis, HolderEntry } from "@/lib/types";
import { fmtUsd } from "@/lib/http";
import { shortAddr } from "@/lib/chains";
import { Panel, Unavailable } from "./ui";

function impactTone(pct: number): string {
  if (pct < 3) return "text-emerald-400";
  if (pct < 10) return "text-amber-400";
  if (pct < 30) return "text-orange-400";
  return "text-rose-400";
}

export function ExitPanel({ exit }: { exit: ExitAnalysis }) {
  if (!exit.available) {
    return (
      <Panel title="Exit liquidity" subtitle="Can you actually get out?">
        <Unavailable reason={exit.reason ?? "Pool reserves unavailable."} />
      </Panel>
    );
  }

  return (
    <Panel
      title="Exit liquidity"
      subtitle="Constant-product sell math against the deepest pool. A lower bound on real depth — multi-pool routing and CEX liquidity are not counted."
    >
      <div className="grid grid-cols-3 gap-px bg-[#1a2028]">
        {[
          { k: "1% slip", v: exit.maxSellUsd.slip1 },
          { k: "5% slip", v: exit.maxSellUsd.slip5 },
          { k: "10% slip", v: exit.maxSellUsd.slip10 },
        ].map((s) => (
          <div key={s.k} className="bg-[#07080a] px-2.5 py-2">
            <div className="font-mono text-[13px] uppercase tracking-[0.12em] text-slate-500">
              max sell @ {s.k}
            </div>
            <div className="mt-0.5 font-mono text-[13px] text-slate-200">{fmtUsd(s.v)}</div>
          </div>
        ))}
      </div>

      <table className="mt-3 w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-[#1a2028] font-mono text-[13px] uppercase tracking-[0.1em] text-slate-500">
            <th className="py-1.5 pr-2 font-normal">sell size</th>
            <th className="py-1.5 pr-2 text-right font-normal">you receive</th>
            <th className="py-1.5 pr-2 text-right font-normal">price impact</th>
            <th className="py-1.5 text-right font-normal">price after</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {exit.scenarios.map((s) => (
            <tr key={s.sellUsd} className="border-b border-[#12161c] last:border-0">
              <td className="py-1.5 pr-2 text-slate-300">{fmtUsd(s.sellUsd)}</td>
              <td className="py-1.5 pr-2 text-right text-slate-200">{fmtUsd(s.proceedsUsd)}</td>
              <td className={`py-1.5 pr-2 text-right ${impactTone(s.priceImpactPct)}`}>
                −{s.priceImpactPct.toFixed(1)}%
              </td>
              <td className="py-1.5 text-right text-slate-500">
                {s.priceAfter === null ? "—" : `$${s.priceAfter.toPrecision(3)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 space-y-1.5 border-t border-[#1a2028] pt-2.5 text-[12px] leading-relaxed text-slate-500">
        {exit.topHolderExit && (
          <p>
            <span className="text-slate-400">Largest non-pool wallet</span>{" "}
            <span className="font-mono text-slate-300">{shortAddr(exit.topHolderExit.wallet)}</span>{" "}
            holds {exit.topHolderExit.supplyPct.toFixed(1)}% — a full exit would realise{" "}
            <span className="font-mono text-slate-300">{fmtUsd(exit.topHolderExit.proceedsUsd)}</span>{" "}
            after price impact and move price{" "}
            <span className={`font-mono ${impactTone(exit.topHolderExit.priceImpactPct)}`}>
              −{exit.topHolderExit.priceImpactPct.toFixed(0)}%
            </span>
            .
          </p>
        )}
        {exit.scenarios[0]?.supplyPctToHalve != null && (
          <p>
            Selling{" "}
            <span className="font-mono text-slate-300">
              {exit.scenarios[0].supplyPctToHalve.toFixed(2)}%
            </span>{" "}
            of supply into this pool halves the price.
          </p>
        )}
        {exit.liquidityCoverage !== null && (
          <p>
            Pool liquidity is{" "}
            <span className="font-mono text-slate-300">
              {exit.liquidityCoverage.toFixed(2)}%
            </span>{" "}
            of market cap.
          </p>
        )}
      </div>
    </Panel>
  );
}

export function EntryPanel({ entries }: { entries: HolderEntry[] }) {
  if (entries.length === 0) {
    return (
      <Panel
        title="Holder entry & PnL"
        subtitle="Cross-references top holders against the recent trade tape"
      >
        <Unavailable reason="None of the current top holders appear in the observed trade window. They either bought before the window or received tokens by transfer — entry price cannot be estimated without inventing it." />
      </Panel>
    );
  }

  return (
    <Panel
      title="Holder entry & PnL"
      subtitle="Average entry estimated from buys visible in the recent trade window. A lower bound — not the wallet's full history."
    >
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-[#1a2028] font-mono text-[13px] uppercase tracking-[0.1em] text-slate-500">
            <th className="py-1.5 pr-2 font-normal">wallet</th>
            <th className="py-1.5 pr-2 text-right font-normal">supply</th>
            <th className="py-1.5 pr-2 text-right font-normal">entry</th>
            <th className="py-1.5 pr-2 text-right font-normal">unrealised</th>
            <th className="py-1.5 text-right font-normal">state</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {entries.slice(0, 8).map((e) => {
            const pnl = e.unrealizedPct;
            return (
              <tr key={e.wallet} className="border-b border-[#12161c] last:border-0">
                <td className="py-1.5 pr-2 text-slate-300">{shortAddr(e.wallet)}</td>
                <td className="py-1.5 pr-2 text-right text-slate-400">{e.supplyPct.toFixed(2)}%</td>
                <td className="py-1.5 pr-2 text-right text-slate-400">
                  {e.avgEntryUsd === null ? "—" : `$${e.avgEntryUsd.toPrecision(3)}`}
                </td>
                <td
                  className={`py-1.5 pr-2 text-right ${
                    pnl === null ? "text-slate-500" : pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {pnl === null ? "—" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}%`}
                </td>
                <td className="py-1.5 text-right text-[12px] text-slate-500">
                  {e.soldInWindow ? "selling" : pnl !== null && pnl > 100 ? "in profit" : "holding"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 border-t border-[#1a2028] pt-2 text-[13px] leading-relaxed text-slate-500">
        A holder deep in profit has a reason to sell. A holder underwater usually waits — which is
        not the same as being safe.
      </p>
    </Panel>
  );
}
