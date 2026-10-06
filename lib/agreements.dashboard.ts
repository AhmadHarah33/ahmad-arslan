import { addDays } from "./agreements";
import type { AgreementOverview, AgreementPlan } from "./types";

// Pure calculations behind the Bakım & Garanti dashboard (stat cards, calendar,
// urgent and payment lists). No React, no database: everything is derived from
// rows the page already fetched, plus `today`, so it is easy to test and the
// server and browser always agree on what "today" is.

export type PlanFilter = "all" | AgreementPlan;

export interface DashAgreement extends AgreementOverview {
  machine_labels: string[];
  // Cities of the covered machines (for the customers table).
  cities: string[];
  technician_names: string[];
}

export interface DashVisit {
  id: string;
  agreement_id: string;
  due_date: string;
  done_at: string | null;
}

// A machine covered by a live agreement, as read from agreement_machines.
export interface CoveredMachine {
  agreement_id: string;
  machine_id: string;
  customer_id: string;
  customer_name: string;
  factory_end: string | null;
}

export interface WarrantyEvent {
  customer_id: string;
  customer_name: string;
  date: string;
  agreement_id: string;
}

const DAY_MS = 86_400_000;

function utc(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

// Whole days from a to b (positive when b is later).
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / DAY_MS);
}

// ---------------------------------------------------------------------------
// Calendar grid
// ---------------------------------------------------------------------------

// "2026-10" shifted by delta months.
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

// Monday-first weeks covering the month: 35 or 42 cells.
export function monthGrid(month: string): { date: string; inMonth: boolean }[] {
  const [y, m] = month.split("-").map(Number);
  const first = Date.UTC(y, m - 1, 1);
  const dow = (new Date(first).getUTCDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = Math.ceil((dow + daysInMonth) / 7);
  const out: { date: string; inMonth: boolean }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = new Date(first + (i - dow) * DAY_MS).toISOString().slice(0, 10);
    out.push({ date, inMonth: date.slice(0, 7) === month });
  }
  return out;
}

export type ChipKind = "periodic" | "annual" | "warranty-ends";
export type ChipState = "planned" | "done" | "late";

export interface CalendarChip {
  key: string;
  agreement_id: string;
  name: string;
  kind: ChipKind;
  state: ChipState;
  machine: string;
  who: string;
}

// Visit chips plus warranty-end chips, grouped by date. The plan filter only
// narrows visits; warranty ends always show (they are what you chase).
export function chipsByDate(
  agreements: DashAgreement[],
  visits: DashVisit[],
  warranties: WarrantyEvent[],
  filter: PlanFilter,
  today: string
): Map<string, CalendarChip[]> {
  const byId = new Map(agreements.map((a) => [a.id, a]));
  const out = new Map<string, CalendarChip[]>();
  const push = (date: string, chip: CalendarChip) => {
    const list = out.get(date);
    if (list) list.push(chip);
    else out.set(date, [chip]);
  };

  for (const v of visits) {
    const a = byId.get(v.agreement_id);
    if (!a || a.status === "draft" || a.plan === "warranty") continue;
    if (filter !== "all" && a.plan !== filter) continue;
    push(v.due_date, {
      key: `v-${v.id}`,
      agreement_id: a.id,
      name: a.customer_name,
      kind: a.plan === "annual" ? "annual" : "periodic",
      state: v.done_at ? "done" : v.due_date < today ? "late" : "planned",
      machine: a.machine_labels[0] ?? "",
      who: a.technician_names.join(", "),
    });
  }

  for (const w of warranties) {
    const a = byId.get(w.agreement_id);
    push(w.date, {
      key: `w-${w.customer_id}-${w.date}`,
      agreement_id: w.agreement_id,
      name: w.customer_name,
      kind: "warranty-ends",
      state: "planned",
      machine: a?.machine_labels[0] ?? "",
      who: "",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Warranty
// ---------------------------------------------------------------------------

// One event per customer per date: the day a machine's warranty runs out,
// counting the later of its factory warranty and any live agreement extension
// covering it.
export function warrantyEvents(
  covered: CoveredMachine[],
  agreements: Pick<
    AgreementOverview,
    "id" | "status" | "includes_warranty" | "warranty_end"
  >[]
): WarrantyEvent[] {
  const live = new Map(
    agreements.filter((a) => a.status === "active").map((a) => [a.id, a])
  );
  const byMachine = new Map<string, CoveredMachine[]>();
  for (const c of covered) {
    if (!live.has(c.agreement_id)) continue;
    const list = byMachine.get(c.machine_id);
    if (list) list.push(c);
    else byMachine.set(c.machine_id, [c]);
  }

  const events = new Map<string, WarrantyEvent>();
  for (const rows of byMachine.values()) {
    let best: { date: string; agreement_id: string } | null = null;
    const consider = (date: string | null, agreement_id: string) => {
      if (date && (!best || date > best.date)) best = { date, agreement_id };
    };
    consider(rows[0].factory_end, rows[0].agreement_id);
    for (const r of rows) {
      const a = live.get(r.agreement_id)!;
      if (a.includes_warranty) consider(a.warranty_end, r.agreement_id);
    }
    if (!best) continue;
    const { date, agreement_id } = best as { date: string; agreement_id: string };
    const key = `${rows[0].customer_id}|${date}`;
    if (!events.has(key)) {
      events.set(key, {
        customer_id: rows[0].customer_id,
        customer_name: rows[0].customer_name,
        date,
        agreement_id,
      });
    }
  }
  return [...events.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Stat cards
// ---------------------------------------------------------------------------

export interface DashStats {
  active: number;
  byPlan: Record<AgreementPlan, number>;
  month: string; // YYYY-MM of today
  visits: { done: number; late: number; planned: number };
  warrantyEnding: { count: number; names: string[] };
  payments: {
    count: number;
    overdue: number;
    // Totals per currency: amounts in different currencies never get added.
    totals: { currency: string; amount: number }[];
  };
}

export function dashStats(
  agreements: DashAgreement[],
  visits: DashVisit[],
  warranties: WarrantyEvent[],
  today: string
): DashStats {
  const active = agreements.filter((a) => a.status === "active");
  const byPlan: Record<AgreementPlan, number> = { periodic: 0, annual: 0, warranty: 0 };
  for (const a of active) byPlan[a.plan]++;

  const month = today.slice(0, 7);
  const liveIds = new Set(
    agreements.filter((a) => a.status === "active" || a.status === "ended").map((a) => a.id)
  );
  const v = { done: 0, late: 0, planned: 0 };
  for (const visit of visits) {
    if (!liveIds.has(visit.agreement_id) || visit.due_date.slice(0, 7) !== month) continue;
    if (visit.done_at) v.done++;
    else if (visit.due_date < today) v.late++;
    else v.planned++;
  }

  const horizon = addDays(today, 30);
  const ending = warranties.filter((w) => w.date >= today && w.date <= horizon);
  const names = [...new Set(ending.map((w) => w.customer_name))];

  const unpaid = agreements.filter((a) => a.is_unpaid && a.amount != null);
  const totals = new Map<string, number>();
  for (const a of unpaid) {
    totals.set(a.currency, (totals.get(a.currency) ?? 0) + Number(a.amount));
  }

  return {
    active: active.length,
    byPlan,
    month,
    visits: v,
    warrantyEnding: { count: names.length, names },
    payments: {
      count: unpaid.length,
      overdue: unpaid.filter((a) => a.payment_overdue).length,
      totals: [...totals.entries()].map(([currency, amount]) => ({ currency, amount })),
    },
  };
}

// ---------------------------------------------------------------------------
// "Needs attention"
// ---------------------------------------------------------------------------

export type UrgentKind = "visit-late" | "warranty-ends" | "agreement-ends";

export interface UrgentItem {
  key: string;
  kind: UrgentKind;
  agreement_id: string;
  name: string;
  plan: AgreementPlan | null;
  date: string; // overdue-since, warranty end or agreement end
  days: number; // days late (visit) or days left
  red: boolean;
}

export function urgentItems(
  agreements: DashAgreement[],
  visits: DashVisit[],
  warranties: WarrantyEvent[],
  today: string
): UrgentItem[] {
  const horizon = addDays(today, 30);
  const items: UrgentItem[] = [];
  const active = agreements.filter((a) => a.status === "active");

  for (const a of active) {
    const late = visits
      .filter((v) => v.agreement_id === a.id && !v.done_at && v.due_date < today)
      .sort((x, y) => x.due_date.localeCompare(y.due_date))[0];
    if (late) {
      items.push({
        key: `late-${a.id}`,
        kind: "visit-late",
        agreement_id: a.id,
        name: a.customer_name,
        plan: a.plan,
        date: late.due_date,
        days: daysBetween(late.due_date, today),
        red: true,
      });
    }
    if (a.end_date >= today && a.end_date <= horizon) {
      items.push({
        key: `end-${a.id}`,
        kind: "agreement-ends",
        agreement_id: a.id,
        name: a.customer_name,
        plan: a.plan,
        date: a.end_date,
        days: daysBetween(today, a.end_date),
        red: false,
      });
    }
  }

  const names = new Map(agreements.map((a) => [a.id, a]));
  for (const w of warranties) {
    if (w.date < today || w.date > horizon) continue;
    items.push({
      key: `war-${w.customer_id}-${w.date}`,
      kind: "warranty-ends",
      agreement_id: w.agreement_id,
      name: w.customer_name,
      plan: names.get(w.agreement_id)?.plan ?? null,
      date: w.date,
      days: daysBetween(today, w.date),
      red: false,
    });
  }

  // Late visits first (the longer overdue the higher), then soonest deadline.
  return items.sort((a, b) =>
    a.red !== b.red ? (a.red ? -1 : 1) : a.red ? b.days - a.days : a.days - b.days
  );
}

export interface PaymentItem {
  agreement_id: string;
  name: string;
  plan: AgreementPlan;
  amount: number;
  currency: string;
  due: string | null;
  overdueDays: number | null;
}

export function paymentItems(agreements: DashAgreement[], today: string): PaymentItem[] {
  return agreements
    .filter((a) => a.is_unpaid && a.amount != null)
    .map((a) => ({
      agreement_id: a.id,
      name: a.customer_name,
      plan: a.plan,
      amount: Number(a.amount),
      currency: a.currency,
      due: a.payment_due,
      overdueDays: a.payment_due && a.payment_due < today ? daysBetween(a.payment_due, today) : null,
    }))
    .sort((a, b) => {
      if ((a.overdueDays != null) !== (b.overdueDays != null)) return a.overdueDays != null ? -1 : 1;
      return (a.due ?? "9999").localeCompare(b.due ?? "9999");
    });
}

// ---------------------------------------------------------------------------
// Status pill for the agreement list
// ---------------------------------------------------------------------------

export type DisplayStatus = "draft" | "overdue" | "unpaid" | "expiring" | "active" | "ended";

export function displayStatus(a: DashAgreement): DisplayStatus {
  if (a.status === "draft") return "draft";
  if (a.status === "ended") return "ended";
  if (a.is_overdue) return "overdue";
  if (a.is_unpaid && a.payment_overdue) return "unpaid";
  if (a.is_expiring) return "expiring";
  if (a.is_unpaid) return "unpaid";
  return "active";
}
