// Lightweight, theme-aware stat + bar primitives (no chart library).
import CountUp from "@/components/count-up";

export function StatTile({
  label,
  value,
  tone = "default",
  icon,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "danger" | "warn" | "good";
  icon?: React.ReactNode;
}) {
  // The number takes the tone's ink token rather than a fixed Tailwind red/
  // amber/emerald, which are tuned for white and go muddy on the dark canvas.
  const toneInk =
    tone === "danger"
      ? "--tone-stuck-ink"
      : tone === "warn"
      ? "--tone-warn-ink"
      : tone === "good"
      ? "--tone-done-ink"
      : null;
  // Stat-tile icon wells stay filled — they read as a block, not a label —
  // but on theme tones so they don't glare in dark mode.
  const iconTone =
    tone === "danger"
      ? "tone-soft-stuck"
      : tone === "warn"
      ? "tone-soft-warn"
      : tone === "good"
      ? "tone-soft-done"
      : "bg-surface-soft text-ink-muted";
  return (
    <div className="card flex items-center gap-3 p-3.5">
      {icon && (
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconTone}`}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p
          className="text-xl font-bold leading-tight text-ink"
          style={toneInk ? { color: `rgb(var(${toneInk}))` } : undefined}
        >
          {typeof value === "number" ? <CountUp value={value} /> : value}
        </p>
        <p className="truncate text-xs font-medium text-ink-muted">{label}</p>
      </div>
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
      <div className="h-2 overflow-hidden rounded-full bg-ink/[0.08]">
        <div
          className="animate-barw h-full rounded-full bg-brand-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// Segmented donut with legend (inline SVG, no library).
export function Donut({
  segments,
  size = 132,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="animate-pop shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--surface-soft))" strokeWidth={12} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={12}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <ul className="space-y-1 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-ink-muted">{s.label}</span>
            <span className="ml-auto font-semibold text-ink">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 12-month bar chart from labeled counts (inline SVG).
export function MonthBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-32 items-end gap-1">
      {data.map((d, i) => (
        // h-full is required: the row is `items-end`, so columns don't stretch
        // and a percentage bar height would resolve against zero.
        <div key={i} className="flex h-full flex-1 flex-col items-center gap-1">
          <div className="flex w-full flex-1 items-end">
            <div
              className="animate-bar w-full rounded-t bg-brand-500"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 3 : 0 }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
          <span className="text-[9px] text-ink-faint">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
