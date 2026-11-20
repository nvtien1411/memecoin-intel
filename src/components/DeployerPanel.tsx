"use client";

import type { DeployerAnalysis, SocialAnalysis } from "@/lib/types";
import { explorerUrl, shortAddr } from "@/lib/chains";
import type { ChainId } from "@/lib/types";
import { fmtUsd } from "@/lib/http";
import { Panel, Unavailable } from "./ui";

export function DeployerPanel({
  deployer,
  chain,
}: {
  deployer: DeployerAnalysis;
  chain: ChainId;
}) {
  return (
    <Panel
      title="Deployer & insiders"
      subtitle="Deployer history is the strongest single rug predictor available on-chain"
      right={
        deployer.ruggedCount > 0 ? (
          <span className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-mono text-[12px] uppercase text-rose-300">
            {deployer.ruggedCount} rugged
          </span>
        ) : null
      }
    >
      {!deployer.dataAvailable || !deployer.address ? (
        <Unavailable
          reason={deployer.note ?? "Deployer could not be resolved from the available sources."}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] text-slate-500">Creator wallet</span>
            <a
              href={explorerUrl(chain, deployer.address)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[13px] text-sky-400 underline decoration-dotted underline-offset-2 hover:text-sky-300"
            >
              {shortAddr(deployer.address, 6)}
            </a>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] text-slate-400">Creator holdings</span>
            <span
              className={`font-mono text-[12.5px] ${
                deployer.balancePct === null
                  ? "text-slate-500"
                  : deployer.balancePct > 5
                    ? "text-amber-300"
                    : "text-slate-200"
              }`}
            >
              {deployer.balancePct === null
                ? "unknown"
                : `${deployer.balancePct.toFixed(2)}%`}
            </span>
          </div>

          {deployer.priorTokens.length > 0 ? (
            <div className="border-t border-[#1c232c] pt-2">
              <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                Prior launches ({deployer.priorTokens.length})
              </div>
              <ul className="space-y-1">
                {deployer.priorTokens.slice(0, 8).map((t) => (
                  <li
                    key={t.mint}
                    className="flex min-w-0 items-center gap-2 rounded border border-[#232b36] bg-[#0b0e12] px-2 py-1.5"
                  >
                    <a
                      href={explorerUrl(chain, t.mint)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[12px] text-slate-300 hover:text-sky-400"
                    >
                      {t.symbol ?? shortAddr(t.mint, 4)}
                    </a>
                    {t.rugged && (
                      <span className="rounded border border-rose-500/40 px-1 py-px text-[13px] uppercase text-rose-300">
                        rugged
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[12px] text-slate-500">
                      {t.holders !== undefined ? `${t.holders} holders` : ""}
                      {t.liquidityUsd !== undefined ? ` · ${fmtUsd(t.liquidityUsd)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="border-t border-[#1c232c] pt-2 text-[13px] text-slate-500">
              No prior launches from this deployer in the index. That means no rug history — and no
              track record either. Unproven is not the same as clean.
            </p>
          )}

          {deployer.note && (
            <p className="text-[13px] leading-relaxed text-slate-500">{deployer.note}</p>
          )}
        </div>
      )}
    </Panel>
  );
}

export function SocialPanel({ social }: { social: SocialAnalysis }) {
  return (
    <Panel title="Social & narrative" subtitle="X / KOL layer">
      <Unavailable reason={social.reason} />
    </Panel>
  );
}
