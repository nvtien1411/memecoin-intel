"use client";

import type { ReportSection, SourceStatus } from "@/lib/types";
import { Panel } from "./ui";

export function ReportPanel({ sections }: { sections: ReportSection[] }) {
  return (
    <Panel
      title="Intelligence report"
      subtitle="Generated from the data above — no figure in this report is invented"
    >
      <div className="space-y-4">
        {sections.map((s) => (
          <div key={s.title} className="border-b border-[#171c24] pb-3 last:border-0 last:pb-0">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                {s.title}
              </h3>
              {s.unavailable && (
                <span className="rounded border border-[#2a323d] px-1.5 py-px font-mono text-[13px] uppercase text-slate-500">
                  partial
                </span>
              )}
            </div>
            <p className="whitespace-pre-line text-[12px] leading-relaxed text-slate-400">
              {s.body}
            </p>
            {s.citations.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {s.citations.map((c) => (
                  <span
                    key={c}
                    className="rounded border border-[#2a323d] bg-[#0d1015] px-1.5 py-px font-mono text-[13px] text-slate-500"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function ProvenancePanel({
  provenance,
  generatedAt,
  cached,
  disclaimer,
}: {
  provenance: SourceStatus[];
  generatedAt: string;
  cached?: boolean;
  disclaimer: string;
}) {
  return (
    <Panel
      title="Data provenance"
      subtitle={`${new Date(generatedAt).toLocaleString()}${cached ? " · served from cache" : ""}`}
    >
      <ul className="grid gap-1 sm:grid-cols-2">
        {provenance.map((p, i) => (
          <li
            key={`${p.source}-${i}`}
            className="flex min-w-0 items-center gap-2 rounded border border-[#232b36] bg-[#0b0e12] px-2 py-1.5"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                p.ok ? "bg-emerald-400" : "bg-rose-400"
              }`}
            />
            <span className="truncate font-mono text-[13px] text-slate-300">{p.source}</span>
            <span
              className="ml-auto max-w-[55%] shrink-0 truncate text-right font-mono text-[12px] text-slate-500"
              title={p.ok ? undefined : (p.error ?? "failed")}
            >
              {p.ok ? `${p.ms}ms` : (p.error ?? "failed")}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-[#1c232c] pt-2 text-[13px] leading-relaxed text-slate-500">
        {disclaimer}
      </p>
    </Panel>
  );
}
