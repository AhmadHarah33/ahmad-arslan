"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage, useT } from "@/lib/i18n/provider";
import { statusKey } from "@/lib/i18n/task-keys";
import { formatAmount } from "@/lib/money";
import { PriorityChip } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import type { UrgentItem, PaymentItem } from "@/lib/agreements.dashboard";
import type { AgreementPlan, TaskPriority, TaskStatus } from "@/lib/types";

// Serializable props only: the page (a Server Component) does the querying and
// counting, this file owns the tab state and the layout.

export interface HomeTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  people: string;
  mine: boolean;
}

export interface HomeVisit {
  key: string;
  agreement_id: string;
  date: string;
  name: string;
  sub: string;
  plan: AgreementPlan;
}

export interface HomeData {
  today: string;
  greeting: string;
  tasks: {
    open: number;
    doneWeek: number;
    byStatus: { todo: number; in_progress: number; pending_approval: number; stuck: number };
    mineDone: number;
    mineTotal: number;
    rows: HomeTask[];
  };
  bakim: {
    visitsToday: number;
    next: { name: string; date: string } | null;
    visitsMonth: number;
    warrantyEnding: number;
    pending: string;
    upcoming: HomeVisit[];
    urgent: UrgentItem[];
    payments: PaymentItem[];
    symbols: Record<string, string>;
  };
  lowStock: number;
  people: { id: string; name: string }[];
}

const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-[rgb(var(--tone-neutral))]",
  in_progress: "bg-[rgb(var(--tone-yellow))]",
  pending_approval: "bg-[rgb(var(--tone-orange))]",
  done: "bg-[rgb(var(--tone-done))]",
  stuck: "bg-[rgb(var(--tone-stuck))]",
};

const TEAL = "bg-[#0B5F57]";

export default function DashboardHome({ data }: { data: HomeData }) {
  const t = useT();
  const { lang } = useLanguage();
  const locale = lang === "tr" ? "tr-TR" : "en-GB";

  // Dates arrive as server-side ISO days; format them in UTC so the server
  // and browser render the same day.
  const dayParts = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    const f = (o: Intl.DateTimeFormatOptions) =>
      d.toLocaleDateString(locale, { timeZone: "UTC", ...o });
    return {
      day: f({ day: "numeric" }),
      month: f({ month: "short" }).replace(".", "").toUpperCase(),
      weekday: f({ weekday: "short" }),
    };
  };
  const eyebrow = new Date(`${data.today}T00:00:00Z`)
    .toLocaleDateString(locale, {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    .toUpperCase();

  const short = (iso: string) => {
    const d = dayParts(iso);
    return `${d.day} ${d.month}`;
  };
  const planName = (p: AgreementPlan) => t(`ag.type.${p}` as const);
  const sym = (cur: string) => data.bakim.symbols[cur] ?? "";
  const money = (n: number, cur: string) =>
    `${sym(cur)}${formatAmount(n)}${sym(cur) ? "" : ` ${cur}`}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-ink-muted">{eyebrow}</p>
          <h1 className="text-2xl font-bold tracking-tight text-ink md:text-[30px]">
            {data.greeting}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.dispatchEvent(new Event("app:open-search"))}
            aria-label={t("shell.search")}
            title="Search (⌘K)"
            className="card hidden items-center gap-2 rounded-full py-2 pl-3.5 pr-3 text-sm text-ink-faint transition hover:text-ink md:flex"
          >
            <SearchGlyph className="h-4 w-4" />
            <span className="hidden lg:inline">{t("shell.search")}</span>
            <kbd className="hidden rounded border border-surface-border px-1 py-0.5 text-[10px] font-medium lg:inline">
              ⌘K
            </kbd>
          </button>
          <Link href="/tasks?new=1" className="btn-primary">
          <PlusGlyph className="h-4 w-4" />
          {t("dash.newTask")}
        </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TasksColumn data={data} />
        <BakimColumn
          data={data}
          dayParts={dayParts}
          short={short}
          planName={planName}
          money={money}
        />
      </div>

      {/* Shortcuts */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Shortcut
          href="/spare-parts"
          title={t("dash.browseParts")}
          sub={data.lowStock ? `${data.lowStock} ${t("dash.lowInStock")}` : t("dash.allStocked")}
          warn={data.lowStock > 0}
          tint="bg-[rgb(var(--tone-warn)/0.16)] text-[rgb(var(--tone-warn-ink))]"
          icon={<BoxGlyph />}
        />
        <Shortcut
          href="/agreements/new"
          title={t("dash.newAgreement")}
          sub={t("dash.newAgreementDesc")}
          tint="bg-[rgb(var(--tone-done)/0.16)] text-[rgb(var(--tone-done-ink))]"
          icon={<AgreementGlyph />}
        />
        <Shortcut
          href="https://drive.google.com/drive/folders/1sGwxZYtF_dxSXz2HRgu3Erlx61LNqJKr?usp=drive_link"
          external
          title={t("dash.database")}
          sub={t("dash.databaseDesc")}
          tint="bg-brand-600/10 text-brand-600"
          icon={<DatabaseGlyph />}
        />
        <Shortcut
          href="https://drive.google.com/drive/folders/1m_BFgqE0Y-DFh_MydXtBE-vi1xh0904C?usp=drive_link"
          external
          title={t("dash.desktopData")}
          sub={t("dash.desktopDataDesc")}
          tint="bg-brand-600/10 text-brand-600"
          icon={<DesktopGlyph />}
        />
      </div>
    </div>
  );
}

/* ----------------------------- Tasks column ----------------------------- */

function TasksColumn({ data }: { data: HomeData }) {
  const t = useT();
  const [tab, setTab] = useState<"mine" | "team" | "stuck">("mine");
  const { tasks } = data;

  const filters = {
    mine: (r: HomeTask) => r.mine,
    team: () => true,
    stuck: (r: HomeTask) => r.status === "stuck",
  };
  const tabs = [
    { id: "mine", label: t("dash.tabMine") },
    { id: "team", label: t("dash.tabTeam") },
    { id: "stuck", label: t("dash.tabStuck") },
  ] as const;
  const rows = tasks.rows.filter(filters[tab]);
  const pct = tasks.mineTotal ? Math.round((tasks.mineDone / tasks.mineTotal) * 100) : 0;

  const cells = [
    { key: "todo", n: tasks.byStatus.todo },
    { key: "in_progress", n: tasks.byStatus.in_progress },
    { key: "pending_approval", n: tasks.byStatus.pending_approval },
    { key: "stuck", n: tasks.byStatus.stuck },
  ] as const;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <section className="flex flex-col gap-5 rounded-3xl bg-brand-800 p-5 text-white sm:p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/15">
            <BoardGlyph className="h-4 w-4" />
          </span>
          <span className="flex-1 text-sm font-semibold">{t("dash.tasks")}</span>
          <Link href="/tasks" className="text-xs font-medium text-white/75 hover:text-white">
            {t("dash.openBoard")} →
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex min-w-0 flex-1 items-baseline gap-3">
            <span className="text-[52px] font-bold leading-[0.9] tracking-tight sm:text-[56px]">
              {tasks.open}
            </span>
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold">{t("dash.openTasksLabel")}</span>
              <span className="text-xs text-white/70">
                {tasks.doneWeek} {t("dash.closedWeek")}
              </span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <Ring pct={pct} />
            <span className="flex flex-col text-[11px] leading-snug text-white/70">
              <span className="text-[13px] font-semibold text-white">
                {tasks.mineDone} / {tasks.mineTotal}
              </span>
              {t("dash.mineDone")}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-3 rounded-2xl bg-white/10 py-3 sm:grid-cols-4">
          {cells.map((c, i) => (
            <div
              key={c.key}
              className={`flex flex-col gap-0.5 px-4 ${i > 0 ? "sm:border-l sm:border-white/15" : ""} ${
                i === 2 ? "max-sm:border-t-0" : ""
              }`}
            >
              <span className="text-[22px] font-bold">{c.n}</span>
              <span className="truncate text-[11px] text-white/70">{t(statusKey(c.key))}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card flex flex-1 flex-col overflow-hidden rounded-3xl">
        <Tabs
          items={tabs.map((x) => ({
            id: x.id,
            label: x.label,
            count: tasks.rows.filter(filters[x.id]).length,
          }))}
          value={tab}
          onChange={(id) => setTab(id as typeof tab)}
          on="bg-brand-800 text-white"
        />
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-faint">{t("dash.noTasks")}</p>
        ) : (
          <ul className="py-1.5">
            {rows.slice(0, 7).map((r) => (
              <li key={r.id} className="border-b border-surface-border last:border-0">
                <Link
                  href="/tasks"
                  className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-3.5 px-4 py-3 transition hover:bg-surface-soft sm:grid-cols-[8px_minmax(0,1fr)_130px_92px] sm:px-5"
                >
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[r.status]}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium text-ink">
                      {r.title}
                    </span>
                    <span className="block truncate text-xs text-ink-muted sm:hidden">
                      {r.people}
                    </span>
                  </span>
                  <span className="hidden truncate text-xs text-ink-muted sm:block">
                    {r.people}
                  </span>
                  <span className="justify-self-end">
                    <PriorityChip priority={r.priority} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ----------------------------- Bakim column ----------------------------- */

function BakimColumn({
  data,
  dayParts,
  short,
  planName,
  money,
}: {
  data: HomeData;
  short: (iso: string) => string;
  dayParts: (iso: string) => { day: string; month: string; weekday: string };
  planName: (p: AgreementPlan) => string;
  money: (n: number, cur: string) => string;
}) {
  const t = useT();
  const [tab, setTab] = useState<"upcoming" | "urgent" | "pay">("upcoming");
  const b = data.bakim;
  const today = dayParts(data.today);
  const next = b.next ? dayParts(b.next.date) : null;

  const tabs = [
    { id: "upcoming", label: t("dash.tabUpcoming"), count: String(b.upcoming.length) },
    { id: "urgent", label: t("dash.tabUrgent"), count: String(b.urgent.length) },
    { id: "pay", label: t("dash.tabPayments"), count: b.pending },
  ];

  const stats = [
    { n: String(b.visitsMonth), label: t("dash.visitsMonth") },
    { n: String(b.warrantyEnding), label: t("dash.warrantyEnding") },
    { n: b.pending, label: t("dash.pendingPayment") },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <section className={`flex flex-col gap-5 rounded-3xl ${TEAL} p-5 text-white sm:p-6`}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/15">
            <AgreementGlyph className="h-4 w-4" />
          </span>
          <span className="flex-1 text-sm font-semibold">{t("ag.title")}</span>
          <Link href="/agreements" className="text-xs font-medium text-white/75 hover:text-white">
            {t("dash.openService")} →
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex min-w-0 flex-1 items-baseline gap-3">
            <span className="text-[52px] font-bold leading-[0.9] tracking-tight sm:text-[56px]">
              {b.visitsToday}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[15px] font-semibold">{t("dash.visitsToday")}</span>
              <span className="truncate text-xs text-white/70">
                {b.next && next
                  ? `${t("dash.nextVisit")}: ${b.next.name} · ${next.weekday} ${next.day} ${next.month}`
                  : t("dash.noUpcoming")}
              </span>
            </span>
          </div>
          <div className="flex h-[68px] w-[68px] shrink-0 flex-col items-center justify-center rounded-[18px] bg-white text-[#0B5F57]">
            <span className="text-[10px] font-bold tracking-widest">{today.month}</span>
            <span className="text-[26px] font-bold leading-none">{today.day}</span>
            <span className="text-[10px] text-slate-500">{today.weekday}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 rounded-2xl bg-white/10 py-3">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={`flex min-w-0 flex-col gap-0.5 px-3 sm:px-4 ${i > 0 ? "border-l border-white/15" : ""}`}
            >
              <span className="truncate text-lg font-bold sm:text-[22px]">{s.n}</span>
              <span className="text-[11px] leading-tight text-white/70">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card flex flex-1 flex-col overflow-hidden rounded-3xl">
        <Tabs
          items={tabs}
          value={tab}
          onChange={(id) => setTab(id as typeof tab)}
          on={`${TEAL} text-white`}
        />
        <ul className="py-1.5">
          {tab === "upcoming" &&
            (b.upcoming.length === 0 ? (
              <Empty text={t("dash.noUpcoming")} />
            ) : (
              b.upcoming.map((v) => {
                const d = dayParts(v.date);
                return (
                  <Row
                    key={v.key}
                    href={`/agreements/${v.agreement_id}/edit`}
                    day={d.day}
                    month={d.month}
                    hot={v.date === data.today}
                    title={v.name}
                    sub={v.sub}
                    tag={planName(v.plan)}
                    tagClass={v.plan === "annual" ? "tone-purple" : "tone-progress"}
                  />
                );
              })
            ))}

          {tab === "urgent" &&
            (b.urgent.length === 0 ? (
              <Empty text={t("dash.nothingUrgent")} />
            ) : (
              b.urgent.slice(0, 7).map((u) => {
                const d = dayParts(u.date);
                const sub =
                  u.kind === "visit-late"
                    ? `${u.plan ? planName(u.plan) : ""} ${t("ag.attn.visitLate")} ${short(u.date)}`
                    : u.kind === "warranty-ends"
                      ? `${t("ag.attn.warrantyEnds")} ${short(u.date)}`
                      : `${t("ag.attn.agreementEnds")} · ${t("ag.attn.notRenewed")}`;
                return (
                  <Row
                    key={u.key}
                    href={`/agreements/${u.agreement_id}/edit`}
                    day={d.day}
                    month={d.month}
                    title={u.name}
                    sub={sub.trim()}
                    subRed={u.red}
                    tag={`${u.days} ${u.kind === "visit-late" ? t("ag.daysLate") : t("ag.daysLeft")}`}
                    tagClass={u.red ? "tone-stuck" : "tone-orange"}
                  />
                );
              })
            ))}

          {tab === "pay" &&
            (b.payments.length === 0 ? (
              <Empty text={t("ag.noPayments")} />
            ) : (
              b.payments.slice(0, 7).map((p) => {
                const late = p.overdueDays != null;
                const d = p.due ? dayParts(p.due) : null;
                return (
                  <Row
                    key={p.agreement_id}
                    href={`/agreements/${p.agreement_id}/edit`}
                    day={d?.day ?? "—"}
                    month={d?.month ?? ""}
                    title={p.name}
                    sub={`${
                      late
                        ? `${t("ag.overdueFor")} ${p.overdueDays} ${t("ag.daysLeft")}`
                        : p.due
                          ? `${t("ag.dueOn")} ${short(p.due)}`
                          : t("ag.noDueDate")
                    } · ${planName(p.plan)}`}
                    subRed={late}
                    tag={money(p.amount, p.currency)}
                    tagClass={late ? "tone-stuck" : "tone-neutral"}
                  />
                );
              })
            ))}
        </ul>
      </section>
    </div>
  );
}

/* ------------------------------- Pieces -------------------------------- */

function Tabs({
  items,
  value,
  onChange,
  on,
}: {
  items: { id: string; label: string; count: string | number }[];
  value: string;
  onChange: (id: string) => void;
  on: string;
}) {
  return (
    <div role="tablist" className="flex gap-1.5 overflow-x-auto px-3.5 pt-3">
      {items.map((x) => {
        const active = x.id === value;
        return (
          <button
            key={x.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(x.id)}
            className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition ${
              active ? on : "bg-surface-soft text-ink-muted hover:text-ink"
            }`}
          >
            {x.label} <span className="opacity-70">{x.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function Row({
  href,
  day,
  month,
  hot,
  title,
  sub,
  subRed,
  tag,
  tagClass,
}: {
  href: string;
  day: string;
  month: string;
  hot?: boolean;
  title: string;
  sub: string;
  subRed?: boolean;
  tag: string;
  tagClass: string;
}) {
  return (
    <li className="border-b border-surface-border last:border-0">
      <Link
        href={href}
        className="flex items-center gap-3.5 px-4 py-2.5 transition hover:bg-surface-soft sm:px-5"
      >
        <span
          className={`flex h-10 w-12 shrink-0 flex-col items-center justify-center rounded-xl leading-[1.1] ${
            hot ? `${TEAL} text-white` : "bg-surface-soft text-ink"
          }`}
        >
          <span className="text-[15px] font-bold">{day}</span>
          <span className="text-[9px] font-semibold tracking-wider">{month}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-ink">{title}</span>
          <span
            className={`block truncate text-xs ${
              subRed ? "text-[rgb(var(--tone-stuck-ink))]" : "text-ink-muted"
            }`}
          >
            {sub}
          </span>
        </span>
        <span
          className={`${tagClass} shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums`}
        >
          {tag}
        </span>
      </Link>
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <li className="px-5 py-8 text-center text-sm text-ink-faint">{text}</li>;
}

function Ring({ pct }: { pct: number }) {
  const c = 2 * Math.PI * 40;
  return (
    <div className="relative h-[68px] w-[68px]">
      <svg viewBox="0 0 96 96" className="-rotate-90">
        <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="10" />
        <circle
          cx="48"
          cy="48"
          r="40"
          fill="none"
          stroke="rgba(255,255,255,0.95)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[15px] font-bold">
        {pct}%
      </span>
    </div>
  );
}

function Shortcut({
  href,
  title,
  sub,
  tint,
  icon,
  warn,
  external,
}: {
  href: string;
  title: string;
  sub: string;
  tint: string;
  icon: React.ReactNode;
  warn?: boolean;
  external?: boolean;
}) {
  const body = (
    <>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-ink">{title}</span>
        <span
          className={`block truncate text-[11px] ${
            warn ? "text-[rgb(var(--tone-warn-ink))]" : "text-ink-muted"
          }`}
        >
          {sub}
        </span>
      </span>
    </>
  );
  const cls =
    "card flex flex-col items-start gap-2.5 rounded-[20px] p-3.5 transition hover:shadow-pop sm:flex-row sm:items-center sm:gap-3 sm:rounded-2xl sm:p-3";
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}

/* -------------------------------- Glyphs -------------------------------- */

type G = { className?: string };
const svg = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function SearchGlyph({ className = "h-5 w-5" }: G) {
  return (
    <svg {...svg} strokeWidth={2} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </svg>
  );
}
function PlusGlyph({ className = "h-5 w-5" }: G) {
  return (
    <svg {...svg} strokeWidth={2.2} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function BoardGlyph({ className = "h-5 w-5" }: G) {
  return (
    <svg {...svg} className={className}>
      <rect x="3" y="4" width="7" height="16" rx="1.5" />
      <rect x="14" y="4" width="7" height="9" rx="1.5" />
    </svg>
  );
}
function AgreementGlyph({ className = "h-5 w-5" }: G) {
  return (
    <svg {...svg} className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" />
    </svg>
  );
}
function BoxGlyph({ className = "h-5 w-5" }: G) {
  return (
    <svg {...svg} className={className}>
      <path d="M12 2 3 7v10l9 5 9-5V7z" />
      <path d="M3 7l9 5 9-5M12 12v10" />
    </svg>
  );
}
function DatabaseGlyph({ className = "h-5 w-5" }: G) {
  return (
    <svg {...svg} className={className}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    </svg>
  );
}
function DesktopGlyph({ className = "h-5 w-5" }: G) {
  return (
    <svg {...svg} className={className}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}
