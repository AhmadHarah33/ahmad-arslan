"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage, useT } from "@/lib/i18n/provider";
import { statusKey } from "@/lib/i18n/task-keys";
import type { HeadData } from "@/lib/dashboard.head";
import { CountUp, Reveal, useInView } from "@/components/dashboard/motion";

// Home screen for the Head of engineers: one big picture of the workload,
// four things that need a decision, who is free, and the approvals queue.
// Status colours follow the task tones: done green, active amber, stuck red.

const DONE = "rgb(var(--tone-done))";
const ACTIVE = "rgb(var(--tone-warn))";
const TODO = "rgb(var(--tone-neutral))";
const STUCK = "rgb(var(--tone-stuck))";

export const CARD = "rounded-[28px] border border-surface-border bg-surface shadow-card";

export default function HeadHome({
  greeting,
  today,
  data,
}: {
  greeting: { hello: string; name: string };
  today: string;
  data: HeadData;
}) {
  const t = useT();
  const { lang } = useLanguage();
  const locale = lang === "tr" ? "tr-TR" : "en-GB";
  const eyebrow = new Date(`${today}T00:00:00Z`).toLocaleDateString(locale, {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-4">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-ink-muted sm:text-[13px]">{eyebrow}</p>
            <h1 className="text-[28px] font-medium tracking-tight text-ink sm:text-4xl">
              {greeting.hello}, <span className="text-ink-faint">{greeting.name}</span>
            </h1>
          </div>
          <Link
            href="/tasks?new=1"
            className="btn-primary min-h-[48px] rounded-full px-5 transition active:scale-95"
          >
            <span aria-hidden className="text-lg leading-none">
              +
            </span>
            {t("dash.newTask")}
          </Link>
        </div>
      </Reveal>

      <Reveal delay={80}>
        <Hero data={data} today={today} locale={locale} />
      </Reveal>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Reveal delay={120}>
          <Attention
            inverted
            href="/tasks"
            label={t("head.stuckTasks")}
            value={<CountUp value={data.stuck.count} decimals={1} mutedDecimals />}
            foot={
              data.stuck.count
                ? `${t("head.oldest")} ${data.stuck.oldestDays} ${t("head.days")}`
                : t("head.noneStuck")
            }
          />
        </Reveal>
        <Reveal delay={180}>
          <DataCard />
        </Reveal>
        <Reveal delay={240}>
          <Attention
            href="/tasks"
            label={t("head.unassigned")}
            value={<CountUp value={data.unassigned} decimals={1} mutedDecimals />}
            foot={t("head.nobodyClaimed")}
          />
        </Reveal>
        <Reveal delay={300}>
          <Attention
            href="/agreements"
            label={t("head.overduePayments")}
            value={
              data.overdue.money.length === 0 ? (
                <CountUp value={0} decimals={2} mutedDecimals prefix="€" />
              ) : (
                <CountUp
                  value={data.overdue.money[0].amount}
                  decimals={2}
                  mutedDecimals
                  prefix={data.overdue.money[0].symbol}
                  format={(n) =>
                    n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  }
                />
              )
            }
            foot={
              <>
                <b className={data.overdue.count ? "text-[rgb(var(--tone-stuck-ink))]" : ""}>
                  {data.overdue.count}
                </b>{" "}
                {t("head.agreements")} · {data.lateVisits} {t("head.lateVisits")}
              </>
            }
          />
        </Reveal>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1.1fr]">
        <Reveal delay={120} className="lg:col-span-2 xl:col-span-1">
          <Heatmap data={data} locale={locale} />
        </Reveal>
        <Reveal delay={200}>
          <Rings data={data} />
        </Reveal>
        <Reveal delay={280}>
          <Approvals data={data} />
        </Reveal>
      </div>
    </div>
  );
}

/* --------------------------------- Hero --------------------------------- */

function smoothPath(pts: [number, number][]) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
  }
  return d;
}

function Hero({ data, today, locale }: { data: HeadData; today: string; locale: string }) {
  const t = useT();
  const [ref, seen] = useInView<HTMLDivElement>();
  const series = data.closedPerDay;
  const peak = series.reduce((m, p, i) => (p.n > series[m].n ? i : m), 0);
  const [hover, setHover] = useState<number | null>(null);
  const sel = hover ?? peak;

  const W = 520;
  const H = 180;
  const max = Math.max(4, ...series.map((p) => p.n)) * 1.2;
  const pts: [number, number][] = series.map((p, i) => [
    (i * W) / (series.length - 1),
    H - 24 - (p.n / max) * (H - 54),
  ]);
  const line = smoothPath(pts);
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const selPt = pts[sel];

  const day = (iso: string, o: Intl.DateTimeFormatOptions) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC", ...o });

  const cells = [
    { key: "todo", n: data.byStatus.todo, color: TODO },
    { key: "in_progress", n: data.byStatus.in_progress, color: ACTIVE },
    { key: "pending_approval", n: data.byStatus.pending_approval, color: ACTIVE },
    { key: "stuck", n: data.byStatus.stuck, color: STUCK },
  ] as const;

  return (
    <section className={`${CARD} space-y-5 p-5 sm:p-7`}>
      <div className="flex flex-wrap gap-6 lg:flex-nowrap lg:gap-8">
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 lg:max-w-[340px]">
          <span className="self-start rounded-full bg-surface-soft px-4 py-2 text-sm font-semibold text-ink">
            {t("head.openTasks")}
          </span>
          <div className="flex flex-wrap items-end gap-3">
            <CountUp
              value={data.open}
              decimals={1}
              mutedDecimals
              className="text-[72px] font-semibold leading-[0.9] tracking-[-0.05em] text-ink sm:text-[96px]"
            />
            <span
              className="mb-2 flex items-center gap-1.5 whitespace-nowrap rounded-full border border-surface-border px-3 py-1.5 text-[13px] font-semibold"
              style={{ color: "rgb(var(--tone-done-ink))" }}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
              </svg>
              {data.doneWeek} {t("dash.closedWeek")}
            </span>
          </div>
        </div>

        <div ref={ref} className="relative h-[210px] min-w-0 flex-[2] basis-full lg:basis-0">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block h-[170px] w-full overflow-visible"
            role="img"
            aria-label={t("head.closedPerDay")}
          >
            <defs>
              <linearGradient id="head-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={DONE} stopOpacity=".4" />
                <stop offset="1" stopColor={DONE} stopOpacity="0" />
              </linearGradient>
            </defs>
            <g stroke="rgb(var(--surface-border))" strokeDasharray="4 5">
              {[30, 80, 130].map((y) => (
                <path key={y} d={`M0 ${y}H${W}`} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
            <path
              d={area}
              fill="url(#head-area)"
              style={{ opacity: seen ? 1 : 0, transition: "opacity 1000ms ease 500ms" }}
            />
            <path
              d={line}
              fill="none"
              stroke={DONE}
              strokeWidth="3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              pathLength={1}
              style={{
                strokeDasharray: 1,
                strokeDashoffset: seen ? 0 : 1,
                transition: "stroke-dashoffset 1500ms cubic-bezier(.4,0,.2,1)",
              }}
            />
          </svg>

          {/* Hover columns: one per day */}
          <div className="absolute inset-x-0 top-0 flex h-[170px]">
            {series.map((p, i) => (
              <button
                key={p.date}
                type="button"
                aria-label={`${day(p.date, { weekday: "short" })}: ${p.n}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={() => setHover(i)}
                className="flex-1 cursor-pointer focus:outline-none"
              />
            ))}
          </div>

          <div
            className="pointer-events-none absolute"
            style={{
              left: `${(selPt[0] / W) * 100}%`,
              top: `${(selPt[1] / H) * 170}px`,
              opacity: seen ? 1 : 0,
              transition: "left 350ms cubic-bezier(.3,.8,.3,1), top 350ms cubic-bezier(.3,.8,.3,1), opacity 400ms ease 1300ms",
            }}
          >
            <span
              className="absolute block h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-surface"
              style={{ borderColor: DONE }}
            />
            <span className="absolute -translate-x-1/2 -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-xs leading-snug text-surface">
              <span className="block opacity-70">
                {day(series[sel].date, { weekday: "short", day: "numeric", month: "short" })}
              </span>
              <b className="text-[15px]">
                {series[sel].n} {t("head.closed")}
              </b>
            </span>
          </div>

          <div className="flex justify-between pt-2 text-xs text-ink-muted">
            {series.map((p) => (
              <span key={p.date} className={p.date === today ? "font-semibold text-ink" : ""}>
                {p.date === today ? t("head.today") : day(p.date, { weekday: "short" })}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-[22px] border border-surface-border sm:grid-cols-4">
        {cells.map((c, i) => (
          <div
            key={c.key}
            className={`flex flex-col gap-2 px-5 py-4 ${i % 2 === 1 ? "border-l border-surface-border" : ""} ${
              i > 1 ? "border-t border-surface-border sm:border-t-0" : ""
            } ${i > 0 ? "sm:border-l" : ""}`}
          >
            <span className="flex items-center gap-2 text-sm text-ink-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
              {t(statusKey(c.key))}
            </span>
            <CountUp value={c.n} className="text-[26px] font-semibold text-ink" />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------- Attention card ---------------------------- */

export function Attention({
  href,
  label,
  value,
  foot,
  footTone,
  inverted = false,
}: {
  href: string;
  label: string;
  value: React.ReactNode;
  foot: React.ReactNode;
  footTone?: "warn";
  inverted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex h-full flex-col justify-between gap-6 rounded-[28px] p-4 transition duration-300 hover:-translate-y-1 hover:shadow-pop active:scale-[0.98] sm:p-[22px] ${
        inverted ? "bg-ink text-surface" : "border border-surface-border bg-surface shadow-card"
      }`}
    >
      <span
        className={`flex items-center justify-between gap-2 text-sm sm:text-[15px] ${
          inverted ? "opacity-85" : "text-ink-muted"
        }`}
      >
        <span className="min-w-0 truncate">{label}</span>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition duration-300 group-hover:rotate-45 ${
            inverted ? "bg-surface/20" : "bg-surface-soft text-ink"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 17 17 7M8 7h9v9" />
          </svg>
        </span>
      </span>
      <span
        className={`text-[32px] font-semibold leading-none tracking-tight sm:text-4xl ${
          inverted ? "[&_.text-ink-faint]:opacity-60 [&_.text-ink-faint]:text-surface" : "text-ink"
        }`}
      >
        {value}
      </span>
      <span
        className={`text-[13px] ${inverted ? "opacity-80" : "text-ink-muted"} ${
          footTone === "warn" ? "[&]:text-[rgb(var(--tone-warn-ink))]" : ""
        }`}
      >
        {foot}
      </span>
    </Link>
  );
}

/* ------------------------------ Shared drives ------------------------------ */

const DRIVES = [
  {
    title: "dash.database",
    sub: "dash.databaseDesc",
    href: "https://drive.google.com/drive/folders/1sGwxZYtF_dxSXz2HRgu3Erlx61LNqJKr?usp=drive_link",
  },
  {
    title: "dash.desktopData",
    sub: "dash.desktopDataDesc",
    href: "https://drive.google.com/drive/folders/1m_BFgqE0Y-DFh_MydXtBE-vi1xh0904C?usp=drive_link",
  },
] as const;

export function DataCard() {
  const t = useT();
  return (
    <div className={`${CARD} flex h-full flex-col gap-2 p-4 sm:p-[22px]`}>
      <span className="text-sm text-ink-muted sm:text-[15px]">{t("dash.resources")}</span>
      <div className="mt-auto flex flex-col gap-2">
        {DRIVES.map((d) => (
          <a
            key={d.href}
            href={d.href}
            target="_blank"
            rel="noreferrer"
            className="group flex min-h-[48px] items-center gap-3 rounded-2xl bg-surface-soft px-3.5 transition duration-300 hover:-translate-y-0.5 hover:shadow-pop active:scale-[0.98]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink sm:text-sm">
                {t(d.title)}
              </span>
              <span className="block truncate text-[11px] text-ink-muted">{t(d.sub)}</span>
            </span>
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink transition duration-300 group-hover:rotate-45" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 17 17 7M8 7h9v9" />
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- Heatmap -------------------------------- */

function Heatmap({ data, locale }: { data: HeadData; locale: string }) {
  const t = useT();
  const [ref, seen] = useInView<HTMLDivElement>();
  const { days, people } = data.load;
  const max = Math.max(4, ...people.flatMap((p) => p.cells));
  const alpha = (n: number) => (n === 0 ? 0 : 0.18 + 0.82 * (n / max));
  const weekday = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC", weekday: "short" });

  return (
    <section className={`${CARD} flex h-full flex-col gap-4 p-5 sm:p-[22px]`}>
      <h2 className="text-[17px] font-semibold text-ink">{t("head.teamLoad")}</h2>
      {people.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-faint">{t("head.noPeople")}</p>
      ) : (
        <div ref={ref} className="overflow-x-auto">
          <div
            className="grid min-w-[300px] items-center gap-1.5 text-xs text-ink-muted"
            style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}
          >
            <span />
            {days.map((d) => (
              <span key={d} className="text-center">
                {weekday(d)}
              </span>
            ))}
            {people.map((p, r) => (
              <Row key={p.id} name={p.name} cells={p.cells} r={r} seen={seen} alpha={alpha} />
            ))}
          </div>
        </div>
      )}
      <div className="mt-auto flex items-center justify-end gap-2 text-xs text-ink-muted">
        {t("head.free")}
        {[0, 0.25, 0.6, 1].map((a) => (
          <span
            key={a}
            className="h-3.5 w-3.5 rounded-[5px]"
            style={{ background: a ? `rgb(var(--tone-warn) / ${a})` : "rgb(var(--surface-soft))" }}
          />
        ))}
        {t("head.busy")}
      </div>
    </section>
  );
}

function Row({
  name,
  cells,
  r,
  seen,
  alpha,
}: {
  name: string;
  cells: number[];
  r: number;
  seen: boolean;
  alpha: (n: number) => number;
}) {
  return (
    <>
      <span className="truncate text-[13px] font-medium text-ink">{name}</span>
      {cells.map((n, c) => (
        <span
          key={c}
          title={String(n)}
          className="flex h-[34px] items-center justify-center rounded-[10px] text-[11px] font-semibold text-ink/70"
          style={{
            background: n ? `rgb(var(--tone-warn) / ${alpha(n)})` : "rgb(var(--surface-soft))",
            opacity: seen ? 1 : 0,
            transform: seen ? "none" : "scale(0.6)",
            transition: `opacity 450ms ease ${r * 70 + c * 40}ms, transform 450ms cubic-bezier(.3,1.4,.5,1) ${r * 70 + c * 40}ms`,
          }}
        >
          {n || ""}
        </span>
      ))}
    </>
  );
}

/* --------------------------------- Rings --------------------------------- */

function Rings({ data }: { data: HeadData }) {
  const t = useT();
  const [ref, seen] = useInView<HTMLDivElement>();
  const b = data.byStatus;
  const active = b.in_progress + b.pending_approval;
  const total = b.done + active + b.todo + b.stuck;
  const rings = [
    { key: "done", label: t(statusKey("done")), n: b.done, r: 52, color: DONE },
    { key: "active", label: t("head.active"), n: active, r: 40, color: ACTIVE },
    { key: "todo", label: t(statusKey("todo")), n: b.todo, r: 28, color: TODO },
    { key: "stuck", label: t(statusKey("stuck")), n: b.stuck, r: 16, color: STUCK },
  ];

  return (
    <section className={`${CARD} flex h-full flex-col gap-4 p-5 sm:p-[22px]`}>
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold text-ink">{t("head.taskStatus")}</h2>
        <Link href="/tasks" className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-ink-muted hover:text-ink">
          {t("head.detail")} ›
        </Link>
      </div>
      <div ref={ref} className="flex flex-wrap items-center gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] text-ink-muted">{t("head.allTasks")}</span>
          <CountUp value={total} className="text-[44px] font-semibold tracking-tight text-ink" />
        </div>
        <svg viewBox="0 0 120 120" className="ml-auto h-[140px] w-[140px]" role="img" aria-label={t("head.taskStatus")}>
          <g fill="none" strokeWidth="9" strokeLinecap="round" transform="rotate(-90 60 60)">
            {rings.map((g, i) => {
              const c = 2 * Math.PI * g.r;
              const frac = total ? g.n / total : 0;
              return (
                <g key={g.key}>
                  <circle cx="60" cy="60" r={g.r} stroke="rgb(var(--surface-soft))" />
                  <circle
                    cx="60"
                    cy="60"
                    r={g.r}
                    stroke={g.color}
                    strokeDasharray={`${seen ? Math.max(frac * c, g.n ? 1 : 0) : 0} ${c}`}
                    style={{ transition: `stroke-dasharray 1200ms cubic-bezier(.4,0,.2,1) ${i * 150}ms` }}
                  />
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <ul className="mt-auto grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
        {rings.map((g) => (
          <li key={g.key} className="flex items-center gap-2 text-ink">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
            {g.label}
            <b className="ml-auto tabular-nums">{g.n}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------- Approvals ------------------------------- */

function Approvals({ data }: { data: HeadData }) {
  const t = useT();
  return (
    <section className={`${CARD} flex h-full flex-col gap-1 p-5 sm:p-[22px]`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[17px] font-semibold text-ink">{t("head.waitingApproval")}</h2>
        {data.approvalsTotal > 0 && (
          <span className="rounded-full bg-[rgb(var(--tone-warn)/0.16)] px-3 py-1 text-xs font-bold text-[rgb(var(--tone-warn-ink))]">
            {data.approvalsTotal}
          </span>
        )}
      </div>
      {data.approvals.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-faint">{t("head.allClear")}</p>
      ) : (
        data.approvals.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-3 border-t border-surface-border py-3 first:border-t-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{a.title}</span>
              <span className="block truncate text-xs text-ink-muted">{a.people}</span>
            </span>
            {a.parts > 0 && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-soft px-3 py-1 text-xs text-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-[#BED631]" />
                {a.parts} {a.parts === 1 ? t("head.part") : t("head.parts")}
              </span>
            )}
            <Link
              href="/tasks"
              className="flex min-h-[44px] shrink-0 items-center rounded-full bg-ink px-4 text-[13px] font-semibold text-surface transition active:scale-95"
            >
              {t("head.review")}
            </Link>
          </div>
        ))
      )}
    </section>
  );
}
