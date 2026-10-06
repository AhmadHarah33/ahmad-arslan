"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/provider";
import { formatDate } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { toCsv } from "@/lib/csv";
import {
  daysBetween,
  displayStatus,
  type DashAgreement,
  type DisplayStatus,
} from "@/lib/agreements.dashboard";
import type { AgreementPlan } from "@/lib/types";

type Tab = "all" | "periodic" | "annual" | "ext";

const SYMBOL: Record<string, string> = { TRY: "₺", EUR: "€", USD: "$" };
const money = (n: number, c: string) =>
  `${SYMBOL[c] ?? ""}${formatAmount(n)}${SYMBOL[c] ? "" : ` ${c}`}`;

const PLAN_TONE: Record<AgreementPlan, string> = {
  periodic: "tone-progress",
  annual: "tone-purple",
  warranty: "tone-orange",
};
const STATUS_TONE: Record<DisplayStatus, string> = {
  draft: "tone-neutral",
  active: "tone-done",
  ended: "tone-neutral",
  expiring: "tone-orange",
  overdue: "tone-stuck",
  unpaid: "tone-stuck",
};
const STATUS_ORDER: DisplayStatus[] = [
  "active",
  "expiring",
  "overdue",
  "unpaid",
  "ended",
  "draft",
];
const COLUMNS = [
  "customer",
  "machine",
  "plan",
  "extWarranty",
  "period",
  "nextVisit",
  "payment",
  "status",
] as const;

// How far through its period an agreement is, 0-100.
function elapsed(a: DashAgreement, today: string) {
  const total = daysBetween(a.start_date, a.end_date);
  if (total <= 0) return 100;
  return Math.max(
    0,
    Math.min(100, Math.round((daysBetween(a.start_date, today) / total) * 100))
  );
}

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}

export default function AgreementsTable({
  today,
  agreements,
}: {
  today: string;
  agreements: DashAgreement[];
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("all");
  const [status, setStatus] = useState<DisplayStatus | "all">("all");
  const [query, setQuery] = useState("");

  const planName = (p: AgreementPlan) => t(`ag.type.${p}` as const);
  const hasExt = (a: DashAgreement) => a.includes_warranty && !!a.warranty_end;

  const byTab = useMemo(
    () =>
      agreements.filter((a) =>
        tab === "all" ? true : tab === "ext" ? a.includes_warranty && !!a.warranty_end : a.plan === tab
      ),
    [agreements, tab]
  );

  const statusCounts = useMemo(() => {
    const m = new Map<DisplayStatus, number>();
    for (const a of byTab) {
      const s = displayStatus(a);
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return m;
  }, [byTab]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return byTab
      .filter((a) => status === "all" || displayStatus(a) === status)
      .filter(
        (a) =>
          !q ||
          [a.customer_name, ...a.machine_labels, ...a.cities]
            .join(" ")
            .toLowerCase()
            .includes(q)
      )
      // Soonest next visit first; agreements with none (warranty-only, ended) last.
      .sort((a, b) => {
        if (!a.next_visit !== !b.next_visit) return a.next_visit ? -1 : 1;
        return (
          (a.next_visit ?? "").localeCompare(b.next_visit ?? "") ||
          a.customer_name.localeCompare(b.customer_name)
        );
      });
  }, [byTab, status, query]);

  const live = agreements.filter((a) => a.status !== "draft");
  const count = (p: AgreementPlan) => live.filter((a) => a.plan === p).length;
  const summary = [
    `${live.length} ${t("ag.agreementsWord")}`,
    count("periodic") > 0 && `${count("periodic")} ${planName("periodic")}`,
    count("annual") > 0 && `${count("annual")} ${planName("annual")}`,
    live.some(hasExt) && `${live.filter(hasExt).length} ${t("ag.withExtWarranty")}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "all", label: t("ag.tab.all"), count: agreements.length },
    { id: "periodic", label: planName("periodic"), count: agreements.filter((a) => a.plan === "periodic").length },
    { id: "annual", label: planName("annual"), count: agreements.filter((a) => a.plan === "annual").length },
    { id: "ext", label: t("ag.tab.extWarranty"), count: agreements.filter(hasExt).length },
  ];

  const statusChips: [DisplayStatus | "all", number][] = [
    ["all", byTab.length],
    ...STATUS_ORDER.filter((s) => statusCounts.get(s)).map(
      (s) => [s, statusCounts.get(s)!] as [DisplayStatus, number]
    ),
  ];

  function nextCell(a: DashAgreement) {
    if (!a.next_visit) return { text: "—", red: false };
    if (a.next_visit === today) return { text: t("ag.today"), red: false };
    if (a.next_visit < today)
      return { text: `${formatDate(a.next_visit)} · ${t("ag.overdue")}`, red: true };
    return { text: formatDate(a.next_visit), red: false };
  }

  function payCell(a: DashAgreement) {
    if (a.payment_status === "paid") return { text: t("ag.pay.paid"), tone: "ok" as const };
    const amount = a.amount != null ? money(a.amount, a.currency) : "";
    if (a.payment_overdue && a.payment_due) {
      return {
        text: `${amount} · ${daysBetween(a.payment_due, today)} ${t("ag.daysLate")}`.trim(),
        tone: "late" as const,
      };
    }
    return {
      text: a.payment_due
        ? `${amount} ${t("ag.dueOn")} ${formatDate(a.payment_due)}`.trim()
        : amount || t("ag.status.unpaid"),
      tone: "due" as const,
    };
  }

  function exportCsv() {
    const cols = [
      "Customer",
      "City",
      "Machine",
      "Plan",
      "Extended warranty ends",
      "Start",
      "End",
      "Next visit",
      "Payment",
      "Amount",
      "Currency",
      "Status",
    ];
    const data = rows.map((a) => ({
      Customer: a.customer_name,
      City: a.cities.join(" / "),
      Machine: a.machine_labels.join(" / "),
      Plan: a.plan,
      "Extended warranty ends": hasExt(a) ? a.warranty_end : "",
      Start: a.start_date,
      End: a.end_date,
      "Next visit": a.next_visit ?? "",
      Payment: a.payment_status,
      Amount: a.amount ?? "",
      Currency: a.currency,
      Status: displayStatus(a),
    }));
    // BOM so Excel reads the Turkish characters as UTF-8.
    const blob = new Blob(["﻿" + toCsv(data, cols)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `agreements-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <Link href="/agreements" className="text-sm text-ink-muted hover:text-ink">
        ← {t("ag.title")}
      </Link>
      <div className="mb-5 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink md:text-[28px]">
            {t("ag.customersWith")}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{summary}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={exportCsv} disabled={rows.length === 0}>
            {t("ag.export")}
          </button>
          <Link href="/agreements/new" className="btn-primary">
            + {t("ag.new")}
          </Link>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="seg max-w-full overflow-x-auto" role="tablist">
          {tabs.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={tab === x.id}
              className={`seg-btn whitespace-nowrap ${tab === x.id ? "seg-btn-on" : ""}`}
              onClick={() => {
                setTab(x.id);
                setStatus("all");
              }}
            >
              {x.label}
              <span className="text-xs text-ink-faint">{x.count}</span>
            </button>
          ))}
        </div>
        <input
          className="input w-full sm:ml-auto sm:w-72"
          placeholder={t("ag.cust.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {statusChips.map(([s, n]) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              status === s
                ? "border-brand-400 bg-surface-soft text-ink"
                : "border-surface-border text-ink-muted hover:bg-surface-soft"
            }`}
          >
            {s === "all" ? t("ag.allStatuses") : t(`ag.status.${s}` as const)} · {n}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="card p-6 text-sm text-ink-muted">{t("ag.noMatch")}</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {COLUMNS.map((c) => (
                    <th key={c} className="px-4 py-3">
                      {t(`ag.col.${c}` as const)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {rows.map((a) => {
                  const st = displayStatus(a);
                  const nx = nextCell(a);
                  const pay = payCell(a);
                  return (
                    <tr key={a.id} className="hover:bg-surface-soft">
                      <td className="px-4 py-3">
                        <Link href={`/agreements/${a.id}/edit`} className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft text-xs font-semibold text-ink-muted">
                            {initials(a.customer_name)}
                          </span>
                          <span>
                            <span className="block font-medium text-ink">{a.customer_name}</span>
                            <span className="block text-xs text-ink-muted">
                              {a.cities.join(" · ")}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink">
                        {a.machine_labels[0] ?? "—"}
                        {a.machine_labels.length > 1 && (
                          <span className="ml-1 text-xs text-ink-muted">
                            +{a.machine_labels.length - 1}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`${PLAN_TONE[a.plan]} rounded-full px-2.5 py-0.5 text-xs font-medium`}
                        >
                          {planName(a.plan)}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink">
                        {hasExt(a) ? formatDate(a.warranty_end) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="block whitespace-nowrap tabular-nums text-ink">
                          {formatDate(a.start_date)} – {formatDate(a.end_date)}
                        </span>
                        <span className="mt-1.5 block h-1.5 w-40 overflow-hidden rounded-full bg-surface-soft">
                          <span
                            className="block h-full rounded-full bg-[rgb(var(--tone-progress))]"
                            style={{ width: `${elapsed(a, today)}%` }}
                          />
                        </span>
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 tabular-nums ${
                          nx.red ? "font-medium text-[rgb(var(--tone-stuck-ink))]" : "text-ink"
                        }`}
                      >
                        {nx.text}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 tabular-nums ${
                          pay.tone === "late"
                            ? "font-medium text-[rgb(var(--tone-stuck-ink))]"
                            : pay.tone === "ok"
                              ? "text-ink-muted"
                              : "text-ink"
                        }`}
                      >
                        {pay.text}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`${STATUS_TONE[st]} rounded-full px-2.5 py-0.5 text-xs font-medium`}
                        >
                          {t(`ag.status.${st}` as const)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per agreement */}
          <ul className="space-y-3 lg:hidden">
            {rows.map((a) => {
              const st = displayStatus(a);
              const nx = nextCell(a);
              const pay = payCell(a);
              return (
                <li key={a.id}>
                  <Link href={`/agreements/${a.id}/edit`} className="card block p-4">
                    <span className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft text-xs font-semibold text-ink-muted">
                        {initials(a.customer_name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">
                          {a.customer_name}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">
                          {[a.machine_labels[0], a.cities[0]].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span
                        className={`${STATUS_TONE[st]} rounded-full px-2.5 py-0.5 text-[11px] font-medium`}
                      >
                        {t(`ag.status.${st}` as const)}
                      </span>
                    </span>
                    <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span
                        className={`${PLAN_TONE[a.plan]} rounded-full px-2 py-0.5 font-medium`}
                      >
                        {planName(a.plan)}
                      </span>
                      <span
                        className={nx.red ? "text-[rgb(var(--tone-stuck-ink))]" : "text-ink-muted"}
                      >
                        {t("ag.col.nextVisit")}: {nx.text}
                      </span>
                      <span
                        className={
                          pay.tone === "late" ? "text-[rgb(var(--tone-stuck-ink))]" : "text-ink-muted"
                        }
                      >
                        {pay.text}
                      </span>
                    </span>
                    <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-surface-soft">
                      <span
                        className="block h-full rounded-full bg-[rgb(var(--tone-progress))]"
                        style={{ width: `${elapsed(a, today)}%` }}
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 flex justify-between text-xs text-ink-muted">
            <span>
              {t("ag.showing")} {rows.length} {t("ag.of")} {agreements.length}
            </span>
            <span>{t("ag.sortedByNext")}</span>
          </p>
        </>
      )}
    </div>
  );
}
