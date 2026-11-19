"use client";

import { useState } from "react";
import type { PositiveSignal, RiskSignal } from "@/lib/types";
import { Panel, SeverityPill } from "./ui";

const FILTERS = ["all", "critical", "high", "medium", "low"] as const;

export function RiskPanel({
  risks,
  positives,
}: {
  risks: RiskSignal[];
  positives: PositiveSignal[];
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [open, setOpen] = useState<string | null>(risks[0]?.id ?? null);

  const shown = filter === "all" ? risks : risks.filter((r) => r.severity === filter);
  const counts = {
    critical: risks.filter((r) => r.severity === "critical").length,
    high: risks.filter((r) => r.severity === "high").length,
    medium: risks.filter((r) => r.severity === "medium").length,
    low: risks.filter((r) => r.severity === "low").length,
  };

  return (
    <Panel
      title="Risk signals"
      subtitle="Every signal carries its evidence, source and confidence. Score = severity weight per category, capped so one category cannot dominate; a single signal is never treated as proof of fraud."
      right={
        <div className="flex flex-wrap gap-1 font-mono text-[12px]">
          {FILTERS.map((f) => {
            const count = f === "all" ? risks.length : counts[f as keyof typeof counts];
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-1.5 py-0.5 uppercase transition ${
                  active
                    ? "text-sky-400 underline decoration-sky-500/60 underline-offset-4"
                    : "text-slate-500 hover:text-slate-400"
                }`}
              >
                {f} {count}
              </button>
            );
          })}
        </div>
      }
    >
      {shown.length === 0 ? (
        <p className="text-[12px] text-slate-500">
          No signal in this severity band.
        </p>
      ) : (
        <ul>
          {shown.map((r) => {
            const isOpen = open === r.id;
            return (
              <li key={r.id} className="border-b border-[#12161c] last:border-0">
                <button
                  onClick={() => setOpen(isOpen ? null : r.id)}
                  className="flex w-full items-center gap-2 py-2 text-left transition hover:bg-white/[0.02]"
                >
                  <SeverityPill severity={r.severity} />
                  <span className="flex-1 text-[13px] text-slate-200">{r.name}</span>
                  <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-wide text-slate-500 sm:block">
                    {r.category}
                  </span>
                  <span
                    aria-hidden
                    className={`shrink-0 font-mono text-[11px] text-slate-500 transition-transform ${
                      isOpen ? "rotate-90" : ""
                    }`}
                  >
                    ›
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-2 pb-3 pl-1">
                    <div className="border-l-2 border-[#2a323d] pl-2.5 font-mono text-[12px] text-slate-300">
                      {r.evidence}
                    </div>
                    <p className="pl-2.5 text-[13px] leading-relaxed text-slate-400">
                      {r.explanation}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pl-2.5 font-mono text-[12px] text-slate-500">
                      <span className="text-slate-500">{r.source}</span>
                      <span>confidence {r.confidence}</span>
                      <span>{new Date(r.observedAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {positives.length > 0 && (
        <div className="mt-3 border-t border-[#1a2028] pt-2.5">
          <h3 className="mb-1.5 font-mono text-[13px] uppercase tracking-[0.14em] text-emerald-500/70">
            positive signals
          </h3>
          <ul className="space-y-1">
            {positives.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-1.5 text-[13px]">
                <span className="font-mono text-emerald-500">+</span>
                <span className="text-slate-300">{p.name}</span>
                <span className="font-mono text-[13px] text-slate-500">— {p.evidence}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
