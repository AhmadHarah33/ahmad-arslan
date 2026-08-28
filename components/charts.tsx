// Lightweight, theme-aware stat + bar primitives (no chart library).

export function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "danger" | "warn" | "good";
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-600"
      : tone === "warn"
      ? "text-amber-600"
      : tone === "good"
      ? "text-emerald-600"
      : "text-ink";
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

// A labeled progress bar (done / total).
export function ProgressRow({
  label,
  done,
  total,
}: {
  label: string;
  done: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="truncate text-ink">{label}</span>
        <span className="shrink-0 text-xs text-ink-faint">
          {done}/{total} · {pct}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-soft">
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// A simple horizontal count bar (e.g. workload per engineer).
export function CountBar({
  label,
  value,
  max,
  color = "bg-brand-500",
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-sm text-ink">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-soft">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 shrink-0 text-right text-xs text-ink-faint">
        {value}
      </span>
    </div>
  );
}
