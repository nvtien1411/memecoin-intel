"use client";

import type { FlowAnalysis, SecurityData } from "@/lib/types";
import { fmtPct, fmtUsd } from "@/lib/http";
import { Panel, Unavailable } from "./ui";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#171c24] py-1.5 last:border-0">
      <span className="text-[12px] text-slate-500">{label}</span>
      <span className="font-mono text-[13px] text-slate-200">{value}</span>
    </div>
  );
}

export function FlowPanel({ flow, security }: { flow: FlowAnalysis; security: SecurityData }) {
  const buyShare =
    flow.buyVolumeUsd + flow.sellVolumeUsd > 0
      ? (flow.buyVolumeUsd / (flow.buyVolumeUsd + flow.sellVolumeUsd)) * 100
      : null;

  return (
    <div className="space-y-3">
      <Panel
        title="Trading flow"
        subtitle={
          flow.dataAvailable
            ? `Last ${flow.windowTrades} trades on the deepest pool`
            : "24h pair summary only — trade tape unavailable"
        }
      >
        {!flow.dataAvailable && !flow.note ? (
          <Unavailable reason="No trade tape available for this pair from the public trade endpoint." />
        ) : (
          <div className="space-y-3">
            {!flow.dataAvailable && flow.note && (
              <div className="rounded border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[12px] leading-relaxed text-amber-200/85">
                {flow.note}
              </div>
            )}
            {buyShare !== null && (
              <div>
                <div className="mb-1 flex justify-between font-mono text-[13px]">
                  <span className="text-emerald-400">buy volume {buyShare.toFixed(0)}%</span>
                  <span className="text-rose-400">sell volume {(100 - buyShare).toFixed(0)}%</span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-[#1c232c]">
                  <div className="bg-emerald-500" style={{ width: `${buyShare}%` }} />
                  <div className="bg-rose-500" style={{ width: `${100 - buyShare}%` }} />
                </div>
                <div className="mt-1 flex justify-between font-mono text-[12px] text-slate-500">
                  <span>{flow.buys} buy txns</span>
                  <span>{flow.sells} sell txns</span>
                </div>
              </div>
            )}
            <div>
              <Row label="Buys / sells" value={`${flow.buys} / ${flow.sells}`} />
              <Row label="Buy volume" value={fmtUsd(flow.buyVolumeUsd)} />
              <Row label="Sell volume" value={fmtUsd(flow.sellVolumeUsd)} />
              <Row label="Net imbalance" value={fmtPct((flow.imbalance ?? 0) * 100, 0)} />
              <Row label="Unique wallets" value={flow.uniqueTraders} />
              <Row label="Trades per wallet" value={flow.tradesPerTrader?.toFixed(1) ?? "—"} />
              <Row label="Top trader share" value={flow.topTraderShare === null ? "—" : `${(flow.topTraderShare * 100).toFixed(0)}%`} />
              <Row
                label="Churn ratio"
                value={flow.washRatio === null ? "—" : `${(flow.washRatio * 100).toFixed(0)}%`}
              />
              <Row label="Largest trade" value={fmtUsd(flow.largestTradeUsd)} />
            </div>

            {flow.sameBlockBuyGroups.length > 0 && (
              <div className="rounded border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-2">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-amber-400">
                  Same-block buying
                </div>
                <ul className="mt-1 space-y-0.5 font-mono text-[13px] text-amber-200/80">
                  {flow.sameBlockBuyGroups.slice(0, 3).map((g) => (
                    <li key={g.block}>
                      block {g.block} — {g.wallets.length} wallets
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[13px] leading-relaxed text-amber-200/60">
                  Heuristic signal — a router splitting one order looks identical to a bundle.
                </p>
              </div>
            )}

            <div className="rounded border border-[#232b36] bg-[#0b0e12] px-2.5 py-2">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                Price vs liquidity
              </div>
              <div className="mt-1 font-mono text-[12px] text-slate-300">
                {flow.divergence.verdict.replaceAll("_", " ")}
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Contract security" subtitle="Authority, tax and ownership checks">
        <div>
          <Row
            label="Mint authority"
            value={
              security.mintAuthority === null
                ? security.dataAvailable
                  ? "revoked"
                  : "—"
                : "active"
            }
          />
          <Row
            label="Freeze authority"
            value={
              security.freezeAuthority === null
                ? security.dataAvailable
                  ? "revoked"
                  : "—"
                : "active"
            }
          />
          <Row
            label="Honeypot"
            value={
              security.honeypot === null
                ? "not checked"
                : security.honeypot
                  ? "FLAGGED"
                  : "no flag"
            }
          />
          <Row label="Buy / sell tax" value={`${security.buyTax?.toFixed(1) ?? "—"}% / ${security.sellTax?.toFixed(1) ?? "—"}%`} />
          <Row
            label="Transfer fee"
            value={security.transferFeePct === null ? "none" : `${security.transferFeePct.toFixed(2)}%`}
          />
          <Row
            label="LP locked"
            value={security.lpLockedPct === null ? "unknown" : `${security.lpLockedPct.toFixed(1)}%`}
          />
          <Row
            label="Owner privileges"
            value={security.ownerPrivileges.length === 0 ? "none detected" : security.ownerPrivileges.length}
          />
          {security.ownerPrivileges.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1">
              {security.ownerPrivileges.map((p) => (
                <li
                  key={p}
                  className="rounded border border-rose-500/30 bg-rose-500/[0.07] px-1.5 py-px font-mono text-[12px] text-rose-300"
                >
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
}
