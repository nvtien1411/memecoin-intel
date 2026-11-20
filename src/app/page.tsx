"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisResult, ChainId } from "@/lib/types";
import { SearchBar } from "@/components/SearchBar";
import { VerdictHeader } from "@/components/VerdictHeader";
import { RiskPanel } from "@/components/RiskPanel";
import { HolderTable } from "@/components/HolderTable";
import { ClusterMap } from "@/components/ClusterMap";
import { FlowPanel } from "@/components/FlowPanel";
import { DeployerPanel, SocialPanel } from "@/components/DeployerPanel";
import { EntryPanel, ExitPanel } from "@/components/ExitPanel";
import { DecisionPanel } from "@/components/DecisionPanel";
import { ProvenancePanel, ReportPanel } from "@/components/ReportPanel";

const SECTIONS = [
  { id: "sec-verdict", label: "verdict" },
  { id: "sec-call", label: "buy?" },
  { id: "sec-risk", label: "risk" },
  { id: "sec-exit", label: "exit" },
  { id: "sec-holders", label: "holders" },
  { id: "sec-flow", label: "flow" },
  { id: "sec-deployer", label: "deployer" },
  { id: "sec-report", label: "report" },
];

function Loading() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-32 w-full" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="skeleton h-56 w-full" />
          <div className="skeleton h-72 w-full" />
        </div>
        <div className="space-y-4">
          <div className="skeleton h-48 w-full" />
          <div className="skeleton h-64 w-full" />
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  const rows = [
    ["Effective concentration", "Top-10 ownership after removing LP/burn and merging wallets that share a funder."],
    ["Deployer history", "Every prior token from the creator wallet and how each one ended."],
    ["Exit liquidity", "How much you can actually sell before price impact eats the position."],
    ["Contract authority", "Mint, freeze, tax and owner privileges across Solana and EVM."],
    ["Flow quality", "Buy/sell imbalance, churn ratio, same-block coordination."],
  ];
  return (
    <div className="mt-6 border-t border-[#232a34] pt-6">
      <p className="text-[14px] text-slate-300">
        Paste a contract address above to get an evidence-based verdict.
      </p>
      <div className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="border-l-2 border-[#232a34] pl-3">
            <div className="text-[12.5px] font-medium text-slate-300">{k}</div>
            <div className="mt-0.5 text-[12px] leading-relaxed text-slate-400">{v}</div>
          </div>
        ))}
      </div>
      <p className="mt-5 max-w-2xl text-[12px] leading-relaxed text-slate-500">
        One screen instead of six tabs. Every number carries its source; anything the free data
        sources cannot answer is marked unavailable rather than estimated.
      </p>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string>("sec-call");
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const analyze = useCallback(async (address: string, chain: ChainId | null) => {
    setLoading(true);
    setError(null);
    setElapsed(0);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, chain }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
      setData(json as AnalysisResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setData(null);
    } finally {
      if (timer.current) clearInterval(timer.current);
      setLoading(false);
    }
  }, []);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  // Highlight the section currently in view. Only sections that actually exist
  // as tabs are observed: `sec-verdict` sits above the nav and has no tab, so
  // observing it left nothing highlighted at the top of the page.
  useEffect(() => {
    if (!data) return;
    const tabs = SECTIONS.slice(1);
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-72px 0px -60% 0px", threshold: 0 },
    );
    for (const s of tabs) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [data]);

  return (
    <main className="min-h-screen pb-20">
      <div className="sticky top-0 z-20 border-b border-[#1a2028] bg-[#07080a]/95 backdrop-blur">
        <div className="mx-auto w-full max-w-[1320px] px-4 py-3 sm:px-6">
          <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-100">
              memecoin<span className="text-sky-500">/</span>intel
            </h1>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-500">
              on-chain verdict · not financial advice
            </span>
            {data && (
              <span className="ml-auto font-mono text-[11px] text-slate-400">
                {data.token.symbol.toUpperCase()} · {data.token.chain} · risk{" "}
                <span
                  className={
                    data.riskScore >= 50
                      ? "text-rose-400"
                      : data.riskScore >= 25
                        ? "text-amber-400"
                        : "text-emerald-400"
                  }
                >
                  {data.riskScore}
                </span>
                /100
                {data.cached ? " · cached" : ""}
              </span>
            )}
          </div>
          <SearchBar onAnalyze={analyze} loading={loading} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1320px] px-4 pt-4 sm:px-6">
        {error && (
          <div className="mb-4 rounded border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-[13px] text-rose-200">
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-mono text-[11.5px] text-slate-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
              resolving token · fetching market, holders, contract, trades
              <span className="ml-auto tabular-nums">{elapsed}s</span>
            </div>
            <Loading />
          </div>
        )}

        {!loading && data && (
          <div className="space-y-5">
            <div id="sec-verdict" className="scroll-mt-32 border-b border-[#232a34] pb-5">
              <VerdictHeader data={data} />
            </div>

            <div id="sec-call" className="scroll-mt-32">
              <DecisionPanel decision={data.decision} />
            </div>

            <nav className="sticky top-[104px] z-10 -mx-1 flex gap-1 overflow-x-auto border-b border-[#232a34] bg-[#07080a]/95 px-1 py-2 backdrop-blur">
              {SECTIONS.slice(1).map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`shrink-0 border-b-2 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide transition ${
                    active === s.id
                      ? "border-sky-400 bg-sky-500/15 font-semibold text-sky-200"
                      : "border-transparent text-slate-500 hover:border-[#39434f] hover:bg-white/5 hover:text-slate-300"
                  }`}
                >
                  {s.label}
                </a>
              ))}
            </nav>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                <div id="sec-risk" className="scroll-mt-32">
                  <RiskPanel risks={data.risks} positives={data.positives} />
                </div>
                <div id="sec-exit" className="scroll-mt-32">
                  <ExitPanel exit={data.exit} />
                </div>
                <div id="sec-holders" className="scroll-mt-32">
                  <HolderTable holders={data.holders} chain={data.token.chain} />
                </div>
                <EntryPanel entries={data.holderEntries} />
                <div id="sec-report" className="scroll-mt-32">
                  <ReportPanel sections={data.report} />
                </div>
              </div>

              <aside className="space-y-5">
                <div id="sec-deployer" className="scroll-mt-32">
                  <DeployerPanel deployer={data.deployer} chain={data.token.chain} />
                </div>
                <ClusterMap clusters={data.clusters} />
                <div id="sec-flow" className="scroll-mt-32">
                  <FlowPanel flow={data.flow} security={data.security} />
                </div>
                <SocialPanel social={data.social} />
                <ProvenancePanel
                  provenance={data.provenance}
                  generatedAt={data.generatedAt}
                  cached={data.cached}
                  disclaimer={data.disclaimer}
                />
              </aside>
            </div>
          </div>
        )}

        {!loading && !data && !error && <EmptyState />}
      </div>
    </main>
  );
}
