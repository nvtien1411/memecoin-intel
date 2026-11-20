"use client";

import type { Decision, GateResult } from "@/lib/analysis/decision";
import { STANCE_META } from "@/lib/analysis/decision";
import { fmtUsd } from "@/lib/http";

const STATE_DOT: Record<GateResult["state"], string> = {
  pass: "bg-emerald-500",
  caution: "bg-amber-500",
  fail: "bg-rose-500",
  unknown: "bg-slate-600",
};

const STATE_TEXT: Record<GateResult["state"], string> = {
  pass: "text-slate-300",
  caution: "text-amber-200",
  fail: "text-rose-200",
  unknown: "text-slate-500",
};

export function DecisionPanel({ decision }: { decision: Decision }) {
  const meta = STANCE_META[decision.stance];

  const groups: { title: string; items: GateResult[]; tone: string }[] = [
    { title: "Disqualifiers open", items: decision.hardFails, tone: "text-rose-300" },
    { title: "Worth cautioning", items: decision.softWarnings, tone: "text-amber-300" },
  ];

  return (
    <section className="border border-[#2b333e] bg-[#0a0d11]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#2b333e] px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
              why — {decision.gates.length} checks
            </span>
            <span
              className={`font-mono text-[10px] uppercase tracking-wide ${
                decision.confidence === "high"
                  ? "text-emerald-400/80"
                  : decision.confidence === "medium"
                    ? "text-slate-400"
                    : "text-amber-400/80"
              }`}
            >
              {decision.confidence} data confidence
            </span>
          </div>
        </div>
        {decision.suggestedMaxSizeUsd !== null && decision.stance !== "avoid" && (
          <div className="shrink-0 border-l border-[#2b333e] pl-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">
              ceiling before 1% slip
            </div>
            <div className="font-mono text-[16px] font-medium text-slate-100">
              {fmtUsd(decision.suggestedMaxSizeUsd)}
            </div>
            <div className="font-mono text-[9.5px] text-slate-600">not a target</div>
          </div>
        )}
        {decision.stance === "avoid" && (
          <div className="shrink-0 border-l border-[#2b333e] pl-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-rose-400/70">
              no size clears this
            </div>
            <div className="mt-0.5 font-mono text-[12px] text-slate-400">—</div>
          </div>
        )}
      </div>

      <div className="px-4 py-3">
        <p className="text-[12px] leading-relaxed text-slate-400">{meta.blurb}</p>

        {groups.map(
          (g) =>
            g.items.length > 0 && (
              <div key={g.title} className="mt-3">
                <h3 className={`font-mono text-[10px] uppercase tracking-[0.13em] ${g.tone}`}>
                  {g.title} · {g.items.length}
                </h3>
                <ul className="mt-1.5 space-y-1">
                  {g.items.map((item) => (
                    <li key={item.id} className="flex items-baseline gap-2 text-[12.5px]">
                      <span className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${STATE_DOT[item.state]}`} />
                      <span className={STATE_TEXT[item.state]}>{item.label}</span>
                      <span className="font-mono text-[11.5px] text-slate-500">{item.reading}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ),
        )}

        <div className="mt-3 border-t border-[#1a2028] pt-2.5">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.13em] text-sky-400/80">
            what would change this
          </h3>
          <ul className="mt-1.5 space-y-1">
            {decision.wouldChange.map((w, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-slate-400">
                <span className="mt-[2px] shrink-0 font-mono text-slate-600">→</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>

        <details className="mt-3 border-t border-[#1a2028] pt-2.5">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.13em] text-slate-500 hover:text-slate-300">
            all {decision.gates.length} checks
          </summary>
          <ul className="mt-2 space-y-1">
            {decision.gates.map((g) => (
              <li key={g.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATE_DOT[g.state]}`} />
                <span className="text-slate-400">{g.label}</span>
                <span className={`font-mono text-[11.5px] ${STATE_TEXT[g.state]}`}>{g.reading}</span>
                <span className="ml-auto font-mono text-[10px] text-slate-600">{g.source}</span>
              </li>
            ))}
          </ul>
        </details>

        <p className="mt-3 border-t border-[#1a2028] pt-2.5 text-[11px] leading-relaxed text-slate-500">
          {decision.caveat}
        </p>
      </div>
    </section>
  );
}
