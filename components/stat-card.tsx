"use client";

// Plain white stat tile: big number, label, one small line of context. The
// same card the Service (Maintenance & Warranty) dashboard uses. When `onClick`
// is given the tile is a toggle (used as a filter) and gets an ink ring while
// `active`.
export default function StatCard({
  value,
  label,
  sub,
  tone,
  warn,
  active,
  onClick,
  className = "",
}: {
  value: string | number;
  label: string;
  sub?: string;
  // CSS token name for the number, e.g. "--tone-done". Omit for plain ink.
  tone?: string;
  warn?: boolean;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <div
        className="text-2xl font-bold tabular-nums text-ink"
        style={tone ? { color: `rgb(var(${tone}-ink))` } : undefined}
      >
        {value}
      </div>
      <div className="mt-0.5 text-sm font-medium text-ink">{label}</div>
      {sub !== undefined && (
        <div
          className="mt-1 break-words text-xs text-ink-muted"
          style={warn ? { color: "rgb(var(--tone-stuck-ink))" } : undefined}
        >
          {sub || "—"}
        </div>
      )}
    </>
  );
  const cls = `card p-4 text-left ${active ? "ring-2 ring-ink" : ""} ${className}`;
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={`${cls} transition hover:shadow-pop`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
