"use client";

import { CountUp, Reveal } from "@/components/dashboard/motion";

// Stat tile: label, big number, one small line of context. Same look and motion
// as the dashboards: numbers count up (whole numbers keep a greyed ".0"), and
// the tile fades in when the page opens. When `onClick` is given the tile is a
// toggle (used as a filter) and gets an ink ring while `active`.
export default function StatCard({
  value,
  label,
  sub,
  tone,
  warn,
  active,
  onClick,
  delay = 0,
  className = "",
}: {
  // A number counts up; a string (e.g. "€1,200.00") is shown as is.
  value: string | number;
  label: string;
  sub?: string;
  // CSS token name for the number, e.g. "--tone-done". Omit for plain ink.
  tone?: string;
  warn?: boolean;
  active?: boolean;
  onClick?: () => void;
  delay?: number;
  className?: string;
}) {
  const body = (
    <>
      <div className="text-sm font-medium text-ink-muted">{label}</div>
      <div
        className="mt-3 text-[32px] font-semibold leading-none tracking-tight text-ink sm:text-[36px]"
        style={tone ? { color: `rgb(var(${tone}-ink))` } : undefined}
      >
        {typeof value === "number" ? (
          <CountUp value={value} decimals={1} mutedDecimals />
        ) : (
          <span className="tabular-nums">{value}</span>
        )}
      </div>
      {sub !== undefined && (
        <div
          className="mt-3 break-words text-xs text-ink-muted"
          style={warn ? { color: "rgb(var(--tone-stuck-ink))" } : undefined}
        >
          {sub || "—"}
        </div>
      )}
    </>
  );
  const cls = `card h-full rounded-[28px] p-4 text-left sm:p-5 ${active ? "ring-2 ring-ink" : ""}`;
  return (
    <Reveal delay={delay} className={className}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          className={`${cls} block w-full transition-shadow duration-300 hover:shadow-pop`}
        >
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </Reveal>
  );
}
