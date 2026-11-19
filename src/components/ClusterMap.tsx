"use client";

import type { ClusterAnalysis } from "@/lib/types";
import { shortAddr } from "@/lib/chains";
import { Panel, Unavailable } from "./ui";

const W = 330;
const H = 280;

export function ClusterMap({ clusters }: { clusters: ClusterAnalysis }) {
  if (!clusters.dataAvailable) {
    return (
      <Panel title="Wallet cluster map" subtitle="Funding-graph trace">
        <Unavailable
          reason={
            clusters.note ??
            "Funding tracing needs a chain where we can read each wallet's first SOL transfer. Not available for this token."
          }
        />
      </Panel>
    );
  }

  const nodes = clusters.nodes.slice(0, 12);
  const funders = [...new Set(nodes.map((n) => n.fundingSource).filter(Boolean))] as string[];

  // Simple deterministic layout: funders on the left ring, wallets on the right.
  const funderPos = new Map<string, { x: number; y: number }>();
  funders.forEach((f, i) => {
    funderPos.set(f, {
      x: 54,
      y: 40 + (i * (H - 80)) / Math.max(1, funders.length - 1 || 1),
    });
  });

  const grouped = new Map<string, typeof nodes>();
  for (const n of nodes) {
    const key = n.fundingSource ?? "__none__";
    grouped.set(key, [...(grouped.get(key) ?? []), n]);
  }

  const walletPos = new Map<string, { x: number; y: number }>();
  let row = 0;
  for (const [, list] of grouped) {
    for (const n of list) {
      walletPos.set(n.address, {
        x: 214,
        y: 28 + (row * (H - 56)) / Math.max(1, nodes.length - 1 || 1),
      });
      row += 1;
    }
  }

  const maxPct = Math.max(...nodes.map((n) => n.pct), 1);

  return (
    <Panel
      title="Wallet cluster map"
      subtitle={`${clusters.traced}/${clusters.total} wallets traced · ${clusters.unknown} unknown · shared funder = suspected common operator`}
      right={
        <span className="font-mono text-[12px] text-slate-500">
          {clusters.groups.length} shared funder{clusters.groups.length === 1 ? "" : "s"}
        </span>
      }
    >
      <div>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[280px] w-full">
          <defs>
            <linearGradient id="edge" x1="0" x2="1">
              <stop offset="0%" stopColor="#2b6c8f" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#2b6c8f" stopOpacity="0.35" />
            </linearGradient>
          </defs>

          {nodes.map((n) => {
            if (!n.fundingSource) return null;
            const a = funderPos.get(n.fundingSource);
            const b = walletPos.get(n.address);
            if (!a || !b) return null;
            return (
              <line
                key={`${n.fundingSource}-${n.address}`}
                x1={a.x + 22}
                y1={a.y}
                x2={b.x - 18}
                y2={b.y}
                stroke="url(#edge)"
                strokeWidth={n.confidence === "high" ? 2 : 1.2}
                strokeDasharray={n.confidence === "low" ? "4 4" : undefined}
              />
            );
          })}

          {funders.map((f) => {
            const p = funderPos.get(f)!;
            const size = clusters.groups.find((g) => g.id === f)?.pct ?? 0;
            const r = 12 + Math.min(14, size / 3);
            return (
              <g key={f}>
                <circle cx={p.x} cy={p.y} r={r} fill="#1b2430" stroke="#38bdf8" strokeWidth="1.5" />
                <text
                  x={p.x}
                  y={p.y + 3.5}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#7dd3fc"
                  fontFamily="monospace"
                >
                  {shortAddr(f, 2)}
                </text>
                <text x={p.x} y={p.y + r + 12} textAnchor="middle" fontSize="8.5" fill="#64748b">
                  funder
                </text>
              </g>
            );
          })}

          {nodes.map((n) => {
            const p = walletPos.get(n.address);
            if (!p) return null;
            const r = 7 + (n.pct / maxPct) * 13;
            const color = n.sameBlockAs?.length ? "#f87171" : "#a78bfa";
            return (
              <g key={n.address}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill="#151a22"
                  stroke={color}
                  strokeWidth={n.confidence === "high" ? 1.8 : 1.1}
                />
                <text x={p.x + r + 5} y={p.y + 3} fontSize="9" fill="#94a3b8" fontFamily="monospace">
                  {n.pct.toFixed(1)}%
                </text>
                {n.sameBlockAs?.length ? (
                  <text x={p.x + r + 5} y={p.y + 14} fontSize="8" fill="#f87171">
                    same block
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full border border-sky-400" /> funder
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full border border-violet-400" /> wallet (size = % held)
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full border border-rose-400" /> bought in same block
        </span>
        <span>dashed edge = low confidence</span>
      </div>

      {clusters.groups.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-t border-[#1c232c] pt-3">
          {clusters.groups.slice(0, 5).map((g) => (
            <li key={g.id} className="flex items-center gap-2 text-[13px]">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              <span className="text-slate-300">{g.label}</span>
              <span className="font-mono text-slate-500">
                {g.members.length} wallets · {g.pct.toFixed(1)}%
              </span>
              <span className="ml-auto rounded border border-[#2a323d] px-1.5 py-px font-mono text-[12px] text-slate-500">
                {g.confidence}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-t border-[#1c232c] pt-3 text-[13px] text-slate-500">
          {clusters.unknown > 0
            ? `${clusters.unknown} of the traced wallets have more transaction history than the public RPC budget allows, so their funding source is unknown — not absent. Do not read this as independence.`
            : "No two traced wallets share a funder — each node above has its own distinct funding source, which is why the group count is 0. Absence of a cluster is weak positive evidence, not proof of independence: a funder that is itself a fresh, unlinked wallet hides the real operator."}
        </p>
      )}
    </Panel>
  );
}
