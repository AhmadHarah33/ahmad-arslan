"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import PageTools from "@/components/page-tools";
import { useRouter } from "next/navigation";
import { useLanguage, useT } from "@/lib/i18n/provider";
import { toast, toastErr } from "@/lib/toast";
import { formatDate } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { sendReminder, setVisitDone } from "@/app/(app)/agreements/actions";
import RowActions from "@/components/agreements/row-actions";
import {
  chipsByDate,
  dashStats,
  displayStatus,
  monthGrid,
  paymentItems,
  shiftMonth,
  urgentItems,
  type CalendarChip,
  type ChipKind,
  type DashAgreement,
  type DashVisit,
  type DisplayStatus,
  type PlanFilter,
  type UrgentItem,
  type WarrantyEvent,
} from "@/lib/agreements.dashboard";
import type { AgreementPlan } from "@/lib/types";

const SYMBOL: Record<string, string> = { TRY: "₺", EUR: "€", USD: "$" };
const money = (n: number, currency: string) =>
  `${SYMBOL[currency] ?? ""}${formatAmount(n)}${SYMBOL[currency] ? "" : ` ${currency}`}`;

const DOT: Record<ChipKind | "late", string> = {
  periodic: "bg-[rgb(var(--tone-progress))]",
  annual: "bg-[rgb(var(--tone-purple))]",
  "warranty-ends": "bg-[rgb(var(--tone-orange))]",
  late: "bg-[rgb(var(--tone-stuck))]",
};
const CHIP_TONE: Record<ChipKind, string> = {
  periodic: "tone-progress",
  annual: "tone-purple",
  "warranty-ends": "tone-orange",
};
const STATUS_TONE: Record<DisplayStatus, string> = {
  draft: "tone-neutral",
  active: "tone-done",
  ended: "tone-neutral",
  expiring: "tone-orange",
  overdue: "tone-stuck",
  unpaid: "tone-stuck",
};

const chipDot = (c: CalendarChip) => DOT[c.state === "late" ? "late" : c.kind];

export default function AgreementsDashboard({
  today,
  agreements,
  visits,
  warranties,
}: {
  today: string;
  agreements: DashAgreement[];
  visits: DashVisit[];
  warranties: WarrantyEvent[];
}) {
  const t = useT();
  const { lang } = useLanguage();
  const router = useRouter();

  const [filter, setFilter] = useState<PlanFilter>("all");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [attnTab, setAttnTab] = useState<"urgent" | "pay">("urgent");
  const [reminding, setReminding] = useState<string | null>(null);

  const stats = useMemo(
    () => dashStats(agreements, visits, warranties, today),
    [agreements, visits, warranties, today]
  );
  const chips = useMemo(
    () => chipsByDate(agreements, visits, warranties, filter, today),
    [agreements, visits, warranties, filter, today]
  );
  const urgent = useMemo(
    () => urgentItems(agreements, visits, warranties, today),
    [agreements, visits, warranties, today]
  );
  const payments = useMemo(() => paymentItems(agreements, today), [agreements, today]);
  const grid = useMemo(() => monthGrid(month), [month]);

  const visible = agreements.filter((a) => filter === "all" || a.plan === filter);
  const counts: Record<PlanFilter, number> = {
    all: agreements.filter((a) => a.status === "active").length,
    periodic: stats.byPlan.periodic,
    annual: stats.byPlan.annual,
    warranty: stats.byPlan.warranty,
  };

  // Locale-aware labels. Dates are built and formatted in UTC so they never
  // shift a day with the viewer's timezone.
  const fmt = (opts: Intl.DateTimeFormatOptions, iso: string) =>
    new Intl.DateTimeFormat(lang, { ...opts, timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`)
    );
  const monthTitle = fmt({ month: "long", year: "numeric" }, `${month}-01`);
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    fmt({ weekday: "short" }, `2024-01-0${i + 1}`)
  );
  const planName = (p: AgreementPlan) => t(`ag.type.${p}` as const);

  async function remind(id: string, kind: "payment" | "renewal" | "visit") {
    const key = `${id}-${kind}`;
    if (reminding) return;
    setReminding(key);
    try {
      const res = await sendReminder(id, kind);
      if (res.error) toastErr(res.error);
      else {
        toast(t("ag.reminderAdded"), "success");
        router.refresh();
      }
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setReminding(null);
    }
  }

  const sel = chips.get(selected) ?? [];
  const tabs: PlanFilter[] = ["all", "periodic", "annual", ...(counts.warranty ? (["warranty"] as const) : [])];

  const warrantyNames = stats.warrantyEnding.names;
  const warrantyText =
    warrantyNames.length === 0
      ? "—"
      : warrantyNames.slice(0, 2).join(" · ") +
        (warrantyNames.length > 2 ? ` +${warrantyNames.length - 2}` : "");
  const paymentTotal = stats.payments.totals.length
    ? stats.payments.totals.map((x) => money(x.amount, x.currency)).join(" + ")
    : money(0, "TRY");
  const planSplit = [
    stats.byPlan.periodic && `${stats.byPlan.periodic} ${planName("periodic")}`,
    stats.byPlan.annual && `${stats.byPlan.annual} ${planName("annual")}`,
    stats.byPlan.warranty && `${stats.byPlan.warranty} ${planName("warranty")}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink md:text-[28px]">
            {t("ag.title")}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{t("ag.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <PageTools />
          <Link href="/agreements/new" className="btn-primary">
            + {t("ag.new")}
          </Link>
        </div>
      </div>

      <div className="seg mb-5 max-w-full overflow-x-auto" role="tablist">
        {tabs.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            className={`seg-btn whitespace-nowrap ${filter === f ? "seg-btn-on" : ""}`}
            onClick={() => setFilter(f)}
          >
            {t(`ag.tab.${f}` as const)}
            <span className="text-xs text-ink-faint">{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Stat value={String(stats.active)} label={t("ag.stat.active")} sub={planSplit || "—"} />
        <Stat
          value={String(stats.visits.done + stats.visits.late + stats.visits.planned)}
          label={`${t("ag.stat.visitsIn")} ${fmt({ month: "long" }, `${stats.month}-01`)}`}
          sub={`${stats.visits.done} ${t("ag.done")} · ${stats.visits.late} ${t("ag.overdue")} · ${stats.visits.planned} ${t("ag.planned")}`}
          warn={stats.visits.late > 0}
        />
        <Stat
          value={String(stats.warrantyEnding.count)}
          label={t("ag.stat.warranty")}
          sub={warrantyText}
        />
        <Stat
          value={paymentTotal}
          label={t("ag.stat.payments")}
          sub={`${stats.payments.count} ${t("ag.agreementsWord")} · ${stats.payments.overdue} ${t("ag.overdue")}`}
          warn={stats.payments.overdue > 0}
        />
      </div>

      {/* Calendar */}
      <section className="card mb-5 p-4 md:p-5" aria-label={t("ag.title")}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold capitalize text-ink">{monthTitle}</h2>
          <button
            className="btn-ghost !px-3 !py-1.5"
            onClick={() => {
              setMonth(today.slice(0, 7));
              setSelected(today);
            }}
          >
            {t("ag.today")}
          </button>
          <button
            className="icon-btn h-9 w-9 text-lg"
            aria-label={t("ag.prevMonth")}
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
          >
            ‹
          </button>
          <button
            className="icon-btn h-9 w-9 text-lg"
            aria-label={t("ag.nextMonth")}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-surface-border bg-surface-border">
          {weekdays.map((w) => (
            <div
              key={w}
              className="bg-surface-soft px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
            >
              {w}
            </div>
          ))}
          {grid.map((cell) => {
            const list = chips.get(cell.date) ?? [];
            const isToday = cell.date === today;
            const isSel = cell.date === selected;
            const day = Number(cell.date.slice(8));
            return (
              <button
                key={cell.date}
                onClick={() => setSelected(cell.date)}
                aria-label={`${fmt({ day: "numeric", month: "long" }, cell.date)}, ${list.length}`}
                className={`flex min-h-[56px] flex-col items-stretch gap-1 p-1.5 text-left transition md:min-h-[104px] ${
                  cell.inMonth ? "bg-surface" : "bg-surface-soft"
                } ${isSel ? "ring-2 ring-inset ring-brand-400" : ""} hover:bg-surface-soft`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-medium ${
                    isToday
                      ? "bg-ink text-surface"
                      : cell.inMonth
                        ? "text-ink"
                        : "text-ink-faint"
                  }`}
                >
                  {day}
                </span>

                {/* md+: named chips · phones: dots (the agenda below has the names) */}
                <span className="hidden flex-col gap-0.5 md:flex">
                  {list.slice(0, 3).map((c) => (
                    <Link
                      key={c.key}
                      href={`/agreements/${c.agreement_id}/edit`}
                      onClick={(e) => e.stopPropagation()}
                      title={c.name}
                      className={`${c.state === "late" ? "tone-stuck" : CHIP_TONE[c.kind]} flex items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                        c.state === "done" ? "line-through opacity-60" : ""
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${chipDot(c)}`} />
                      <span className="truncate">{c.name}</span>
                    </Link>
                  ))}
                  {list.length > 3 && (
                    <span className="px-1.5 text-[11px] text-ink-muted">+{list.length - 3}</span>
                  )}
                </span>
                <span className="flex flex-wrap gap-0.5 md:hidden">
                  {list.slice(0, 4).map((c) => (
                    <span key={c.key} className={`h-1.5 w-1.5 rounded-full ${chipDot(c)}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
          <Legend dot={DOT.periodic} label={planName("periodic")} />
          <Legend dot={DOT.annual} label={planName("annual")} />
          <Legend dot={DOT["warranty-ends"]} label={t("ag.legend.warrantyEnds")} />
          <Legend dot={DOT.late} label={t("ag.legend.overdue")} />
        </div>
      </section>

      {/* Selected day (phones; the chips carry this on wider screens) */}
      <section className="card mb-5 p-4 md:hidden" aria-label={formatDate(selected)}>
        <h2 className="mb-2 text-sm font-semibold capitalize text-ink">
          {fmt({ weekday: "long", day: "numeric", month: "long" }, selected)}
        </h2>
        {sel.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("ag.noEventsDay")}</p>
        ) : (
          <ul className="divide-y divide-surface-border">
            {sel.map((c) => (
              <li key={c.key}>
                <Link
                  href={`/agreements/${c.agreement_id}/edit`}
                  className="flex items-center gap-3 py-2.5"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${chipDot(c)}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{c.name}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {[c.machine, c.who].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span
                    className={`${c.state === "late" ? "tone-stuck" : CHIP_TONE[c.kind]} rounded-full px-2 py-0.5 text-[11px] font-medium`}
                  >
                    {c.kind === "warranty-ends"
                      ? t("ag.legend.warrantyEnds")
                      : c.state === "late"
                        ? t("ag.legend.overdue")
                        : planName(c.kind)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        {/* Needs attention */}
        <section className="card order-1 p-4 md:p-5 lg:order-2">
          <div className="mb-3 flex gap-1 overflow-x-auto border-b border-surface-border" role="tablist">
            <AttnTab
              on={attnTab === "urgent"}
              onClick={() => setAttnTab("urgent")}
              label={t("ag.attn.urgent")}
              badge={String(urgent.length)}
            />
            <AttnTab
              on={attnTab === "pay"}
              onClick={() => setAttnTab("pay")}
              label={t("ag.attn.payments")}
              badge={paymentTotal}
            />
          </div>

          {attnTab === "urgent" ? (
            urgent.length === 0 ? (
              <p className="py-3 text-sm text-ink-muted">{t("ag.nothingUrgent")}</p>
            ) : (
              <ul className="divide-y divide-surface-border">
                {urgent.map((u) => (
                  <UrgentRow
                    key={u.key}
                    item={u}
                    planName={planName}
                    busy={reminding}
                    onRemind={remind}
                  />
                ))}
              </ul>
            )
          ) : payments.length === 0 ? (
            <p className="py-3 text-sm text-ink-muted">{t("ag.noPayments")}</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {payments.map((p) => {
                const key = `${p.agreement_id}-payment`;
                return (
                  <li key={p.agreement_id} className="flex items-center gap-3 py-2.5">
                    <Link href={`/agreements/${p.agreement_id}/edit`} className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                      <span
                        className={`block truncate text-xs ${p.overdueDays != null ? "text-[rgb(var(--tone-stuck-ink))]" : "text-ink-muted"}`}
                      >
                        {p.overdueDays != null
                          ? `${t("ag.overdueFor")} ${p.overdueDays} ${t("ag.daysLeft")}`
                          : p.due
                            ? `${t("ag.dueOn")} ${formatDate(p.due)}`
                            : t("ag.noDueDate")}{" "}
                        · {planName(p.plan)}
                      </span>
                    </Link>
                    <span className="text-right">
                      <span
                        className={`${p.overdueDays != null ? "tone-stuck" : "tone-neutral"} block rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums`}
                      >
                        {money(p.amount, p.currency)}
                      </span>
                      <button
                        className="mt-1 text-xs font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
                        disabled={reminding !== null}
                        onClick={() => remind(p.agreement_id, "payment")}
                      >
                        {reminding === key ? "…" : t("ag.sendReminder")}
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Customers with agreement */}
        <section className="card order-2 p-4 md:p-5 lg:order-1">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
            {t("ag.customersWith")}
            <span className="rounded-full bg-surface-soft px-2 py-0.5 text-xs text-ink-muted">
              {visible.length}
            </span>
            <Link
              href="/agreements/customers"
              className="ml-auto text-sm font-medium text-brand-600 hover:underline"
            >
              {t("ag.viewAll")}
            </Link>
          </h2>
          {visible.length === 0 ? (
            <p className="py-3 text-sm text-ink-muted">{t("ag.noAgreementsFilter")}</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {visible.map((a) => {
                const st = displayStatus(a);
                return (
                  <li key={a.id} className="flex items-center gap-1">
                    <Link
                      href={`/agreements/${a.id}/edit`}
                      className="flex min-w-0 flex-1 items-center gap-3 py-2.5 hover:opacity-80"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft text-xs font-semibold text-ink-muted">
                        {initials(a.customer_name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {a.customer_name}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">
                          <span className="font-medium">{planName(a.plan)}</span>
                          {a.includes_warranty && a.plan !== "warranty" ? ` ${t("ag.plusWarranty")}` : ""}
                          {a.machine_labels[0] ? ` · ${a.machine_labels[0]}` : ""}
                        </span>
                      </span>
                      <span className="text-right">
                        <span
                          className={`${STATUS_TONE[st]} block rounded-full px-2.5 py-0.5 text-[11px] font-medium`}
                        >
                          {t(`ag.status.${st}` as const)}
                        </span>
                        <span className="mt-0.5 block text-xs tabular-nums text-ink-muted">
                          {a.next_visit ? formatDate(a.next_visit) : formatDate(a.end_date)}
                        </span>
                      </span>
                    </Link>
                    <RowActions id={a.id} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function Stat({
  value,
  label,
  sub,
  warn,
}: {
  value: string;
  label: string;
  sub: string;
  warn?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-bold tabular-nums text-ink">{value}</div>
      <div className="mt-0.5 text-sm font-medium text-ink">{label}</div>
      <div
        className={`mt-1 break-words text-xs ${warn ? "text-[rgb(var(--tone-stuck-ink))]" : "text-ink-muted"}`}
      >
        {sub}
      </div>
    </div>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function AttnTab({
  on,
  onClick,
  label,
  badge,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  badge: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={`-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
        on
          ? "border-[rgb(var(--tone-stuck))] text-[rgb(var(--tone-stuck-ink))]"
          : "border-transparent text-ink-muted hover:text-ink"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
          on ? "tone-stuck" : "tone-neutral"
        }`}
      >
        {badge}
      </span>
    </button>
  );
}

function UrgentRow({
  item,
  planName,
  busy,
  onRemind,
}: {
  item: UrgentItem;
  planName: (p: AgreementPlan) => string;
  busy: string | null;
  onRemind: (id: string, kind: "payment" | "renewal" | "visit") => void;
}) {
  const t = useT();
  const router = useRouter();
  const [marking, setMarking] = useState(false);
  async function markDone() {
    if (!item.visit_id || marking) return;
    setMarking(true);
    try {
      const res = await setVisitDone(item.visit_id, true);
      if (res.error) toastErr(res.error);
      else {
        toast(t("ag.visitUpdated"), "success");
        router.refresh();
      }
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setMarking(false);
    }
  }
  const sub =
    item.kind === "visit-late"
      ? `${item.plan ? planName(item.plan) : ""} ${t("ag.attn.visitLate")} ${formatDate(item.date)}`
      : item.kind === "warranty-ends"
        ? `${t("ag.attn.warrantyEnds")} ${formatDate(item.date)}`
        : `${t("ag.attn.agreementEnds")} ${formatDate(item.date)} · ${t("ag.attn.notRenewed")}`;
  const tag =
    item.kind === "visit-late"
      ? `${item.days} ${t("ag.daysLate")}`
      : `${item.days} ${t("ag.daysLeft")}`;
  const remindKind =
    item.kind === "visit-late" ? "visit" : item.kind === "agreement-ends" ? "renewal" : null;
  const key = `${item.agreement_id}-${remindKind}`;

  return (
    <li className="flex items-center gap-3 py-2.5">
      <Link href={`/agreements/${item.agreement_id}/edit`} className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{item.name}</span>
        <span
          className={`block truncate text-xs ${item.red ? "text-[rgb(var(--tone-stuck-ink))]" : "text-ink-muted"}`}
        >
          {sub.trim()}
        </span>
      </Link>
      <span className="text-right">
        <span
          className={`${item.red ? "tone-stuck" : "tone-orange"} block rounded-full px-2.5 py-0.5 text-xs font-semibold`}
        >
          {tag}
        </span>
        {item.kind === "visit-late" && item.visit_id && (
          <button
            className="mt-1 block w-full text-right text-xs font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
            disabled={marking}
            onClick={markDone}
          >
            {marking ? "…" : t("ag.markDone")}
          </button>
        )}
        {remindKind && (
          <button
            className="mt-1 text-xs font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => onRemind(item.agreement_id, remindKind)}
          >
            {busy === key ? "…" : t("ag.sendReminder")}
          </button>
        )}
      </span>
    </li>
  );
}
