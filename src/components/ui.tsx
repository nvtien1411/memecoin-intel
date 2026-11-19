import type { ReactNode } from "react";

export function Panel({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-t border-[#232a34] pt-4 ${className}`}>
      {(title || right) && (
        <header className="mb-3 flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h2 className="font-mono text-[11.5px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-slate-400">
                {subtitle}
              </p>
            )}
          </div>
          <div className="shrink-0">{right}</div>
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
  subTone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "up" | "down" | "warn";
  subTone?: "default" | "up" | "down" | "warn";
}) {
  const toneClass =
    tone === "up"
      ? "text-emerald-400"
      : tone === "down"
        ? "text-rose-400"
        : tone === "warn"
          ? "text-amber-400"
          : "text-slate-100";
  const subClass =
    subTone === "up"
      ? "text-emerald-400"
      : subTone === "down"
        ? "text-rose-400"
        : subTone === "warn"
          ? "text-amber-400"
          : "text-slate-400";
  return (
    <div className="bg-[#080a0d] px-3 py-2.5">
      <div className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">
        {label}
      </div>
      <div className={`mt-1 font-mono text-[16px] font-medium tabular-nums ${toneClass}`}>
        {value}
      </div>
      {sub && <div className={`mt-1 text-[12px] leading-snug ${subClass}`}>{sub}</div>}
    </div>
  );
}

const SEV_STYLE: Record<string, string> = {
  critical: "border-rose-500/50 bg-rose-500/15 text-rose-200",
  high: "border-orange-500/50 bg-orange-500/15 text-orange-200",
  medium: "border-amber-500/45 bg-amber-500/12 text-amber-200",
  low: "border-sky-500/45 bg-sky-500/12 text-sky-200",
  info: "border-slate-500/45 bg-slate-500/12 text-slate-300",
};

export function SeverityPill({ severity }: { severity: string }) {
  return (
    <span
      className={`inline-flex w-[62px] shrink-0 justify-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide ${
        SEV_STYLE[severity] ?? SEV_STYLE.info
      }`}
    >
      {severity}
    </span>
  );
}

export function SourceTag({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center rounded border border-[#2a323d] bg-[#0f1319] px-1.5 py-0.5 font-mono text-[10.5px] text-slate-400">
      {source}
    </span>
  );
}

export function Unavailable({ reason }: { reason: string }) {
  return (
    <div className="rounded border border-dashed border-[#2a323d] bg-[#0a0d11] px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-500" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Data unavailable
        </span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">{reason}</p>
    </div>
  );
}

export function Bar({
  value,
  tone = "sky",
}: {
  value: number;
  tone?: "sky" | "rose" | "amber" | "emerald";
}) {
  const map = {
    sky: "bg-sky-500",
    rose: "bg-rose-500",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
  } as const;
  return (
    <div className="h-2 w-full overflow-hidden rounded-sm bg-[#1c232c]">
      <div
        className={`h-full rounded-sm ${map[tone]}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/** Small labelled key/value row used across panels. */
export function Row({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "up" | "down" | "warn";
}) {
  const toneClass =
    tone === "up"
      ? "text-emerald-400"
      : tone === "down"
        ? "text-rose-400"
        : tone === "warn"
          ? "text-amber-400"
          : "text-slate-200";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#161b22] py-2 last:border-0">
      <span className="text-[12px] text-slate-400">{label}</span>
      <span className={`font-mono text-[12.5px] tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}
