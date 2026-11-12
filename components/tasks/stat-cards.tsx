"use client";

import { useT } from "@/lib/i18n/provider";
import { statusKey } from "@/lib/i18n/task-keys";
import { STATUS_VAR, TASK_STATUSES } from "@/lib/types";
import type { Profile, TaskStatus } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { CountUp, Reveal } from "@/components/dashboard/motion";

// The four cards above the task board. Same look and motion as the dashboards,
// and every card is a filter: tap it to narrow the board, tap again to clear.

export type CardFilter = "done" | "open" | "stuck" | "mine";

export default function TaskStatCards({
  counts,
  total,
  pct,
  engineers,
  mineOpen,
  mineHigh,
  stuckSub,
  filter,
  onFilter,
}: {
  counts: Record<TaskStatus, number>;
  total: number;
  pct: number;
  engineers: Profile[];
  mineOpen: number;
  mineHigh: number;
  stuckSub: string;
  filter: string;
  onFilter: (f: CardFilter | "all") => void;
}) {
  const t = useT();
  const toggle = (f: CardFilter) => onFilter(filter === f ? "all" : f);
  const open = counts.todo + counts.in_progress;
  const openSub = [
    `${counts.todo} ${t(statusKey("todo")).toLowerCase()}`,
    `${counts.in_progress} ${t(statusKey("in_progress")).toLowerCase()}`,
    counts.pending_approval > 0
      ? `${counts.pending_approval} ${t(statusKey("pending_approval")).toLowerCase()}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
      <Reveal className="col-span-2 md:col-span-1">
        <Tile
          active={filter === "done"}
          onClick={() => toggle("done")}
          label={t("tasks.done")}
          value={
            <>
              <CountUp value={pct} />
              <span className="text-ink-faint">%</span>
            </>
          }
          aside={
            <span className="flex items-center">
              {engineers.slice(0, 4).map((p, i) => (
                <span key={p.id} className={`rounded-full ring-2 ring-surface ${i > 0 ? "-ml-1.5" : ""}`}>
                  <Avatar id={p.id} name={p.full_name || p.first_name} size={24} />
                </span>
              ))}
            </span>
          }
          foot={`${counts.done} ${t("tasks.ofTasks")} ${total} ${t("tasks.tasksWord")}`}
        >
          <div className="mt-3 flex h-2 gap-[3px] overflow-hidden rounded-full bg-surface-soft">
            {TASK_STATUSES.map((s) =>
              counts[s.key] > 0 ? (
                <span
                  key={s.key}
                  className="rounded-full transition-[width] duration-700 ease-out"
                  style={{
                    width: `${(counts[s.key] / Math.max(total, 1)) * 100}%`,
                    background: `rgb(var(${STATUS_VAR[s.key]}))`,
                  }}
                />
              ) : null
            )}
          </div>
        </Tile>
      </Reveal>

      <Reveal delay={70}>
        <Tile
          active={filter === "open"}
          onClick={() => toggle("open")}
          label={t("tasks.openTasks")}
          value={<CountUp value={open} decimals={1} mutedDecimals />}
          foot={openSub}
        />
      </Reveal>

      <Reveal delay={140}>
        <Tile
          inverted
          active={filter === "stuck"}
          onClick={() => toggle("stuck")}
          label={t(statusKey("stuck"))}
          value={<CountUp value={counts.stuck} decimals={1} mutedDecimals />}
          foot={stuckSub}
        />
      </Reveal>

      <Reveal delay={210} className="col-span-2 md:col-span-1">
        <Tile
          active={filter === "mine"}
          onClick={() => toggle("mine")}
          label={t("tasks.mineOpen")}
          value={<CountUp value={mineOpen} decimals={1} mutedDecimals />}
          foot={mineHigh > 0 ? `${mineHigh} ${t("tasks.highSub")}` : ""}
        />
      </Reveal>
    </section>
  );
}

function Tile({
  label,
  value,
  foot,
  aside,
  children,
  active,
  inverted = false,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  foot?: string;
  aside?: React.ReactNode;
  children?: React.ReactNode;
  active: boolean;
  inverted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group flex h-full w-full flex-col gap-5 rounded-[28px] p-4 text-left transition-shadow duration-300 hover:shadow-pop sm:p-5 ${
        inverted ? "bg-ink text-surface" : "border border-surface-border bg-surface shadow-card"
      } ${active ? (inverted ? "ring-2 ring-[rgb(var(--tone-stuck))] ring-offset-2 ring-offset-[rgb(var(--canvas))]" : "ring-2 ring-ink") : ""}`}
    >
      <span
        className={`flex items-center justify-between gap-2 text-sm sm:text-[15px] ${
          inverted ? "opacity-85" : "text-ink-muted"
        }`}
      >
        <span className="min-w-0 truncate">{label}</span>
        {aside ?? (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition duration-300 group-hover:rotate-45 ${
              inverted ? "bg-surface/20" : "bg-surface-soft text-ink"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 17 17 7M8 7h9v9" />
            </svg>
          </span>
        )}
      </span>
      <span
        className={`text-[34px] font-semibold leading-none tracking-tight sm:text-4xl ${
          inverted ? "[&_.text-ink-faint]:text-surface [&_.text-ink-faint]:opacity-60" : "text-ink"
        }`}
      >
        {value}
      </span>
      <span className="mt-auto flex flex-col">
        {foot !== undefined && (
          <span className={`break-words text-xs sm:text-[13px] ${inverted ? "opacity-80" : "text-ink-muted"}`}>
            {foot || "—"}
          </span>
        )}
        {children}
      </span>
    </button>
  );
}
