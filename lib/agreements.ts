import type { Agreement, AgreementPlan, CustomerMachine } from "./types";

// Pure helpers shared by the agreement form (client) and the server actions.
// Dates are plain "YYYY-MM-DD" strings, and all arithmetic is done in UTC so
// results don't shift with the viewer's timezone or DST.

const DAY_MS = 86_400_000;

function toUtc(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isIsoDate(d: unknown): d is string {
  return (
    typeof d === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    fromUtc(toUtc(d)) === d
  );
}

export function addDays(d: string, days: number): string {
  return fromUtc(toUtc(d) + days * DAY_MS);
}

// Same calendar day N months later; clamps to month end (31 Jan + 1 mo = 28/29 Feb).
export function addMonths(d: string, months: number): string {
  const [y, m, day] = d.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fromUtc(target.getTime());
}

// Default end of an agreement: one year from the start, inclusive of the day before.
export function defaultEndDate(start: string): string {
  return addDays(addMonths(start, 12), -1);
}

// Visits an agreement of this plan has: periodic is the chosen count, annual
// is always one, warranty-only has none.
export function visitsForPlan(plan: AgreementPlan, perYear: number): number {
  if (plan === "warranty") return 0;
  if (plan === "annual") return 1;
  return Math.max(1, Math.min(24, Math.round(perYear)));
}

// Extended warranty end: N months after the factory warranty ends, or after
// the agreement starts when the machine has no factory date on record.
export function warrantyEndFrom(
  factoryEnd: string | null,
  agreementStart: string,
  months: number
): string {
  const base = factoryEnd && factoryEnd > agreementStart ? factoryEnd : agreementStart;
  return addMonths(base, months);
}

// Evenly spaced visit dates across the agreement period, the first on the
// start date, never past the end date. These are only the defaults: the form
// lets the user edit every date.
export function spreadVisitDates(
  start: string,
  end: string,
  count: number
): string[] {
  if (count <= 0) return [];
  if (count === 1) return [start];
  const span = Math.max(0, Math.round((toUtc(end) - toUtc(start)) / DAY_MS));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const offset = Math.min(span, Math.round((i * span) / count));
    out.push(addDays(start, offset));
  }
  return out;
}

// What "Renew" pre-fills on the New Agreement form: same customer, plan, machines
// and price, starting the day after the old period ends.
export function renewalDraft(a: Agreement, machineIds: string[]) {
  const start = addDays(a.end_date, 1);
  return {
    customer_id: a.customer_id,
    plan: a.plan,
    visits_per_year: a.visits_per_year,
    machine_ids: machineIds,
    start_date: start,
    end_date: defaultEndDate(start),
    includes_warranty: a.includes_warranty,
    coverage: a.coverage,
    warranty_months: a.warranty_months,
    remind_days: a.remind_days,
    amount: a.amount,
    currency: a.currency,
    assignee_id: a.assignee_id,
  };
}

// A machine's effective warranty end: its own standard warranty, or the
// latest extension from an active agreement that covers it, whichever is later.
export function effectiveWarrantyEnd(
  machine: Pick<CustomerMachine, "warranty_end">,
  agreements: Pick<Agreement, "includes_warranty" | "warranty_end" | "status">[]
): string | null {
  const dates = [machine.warranty_end]
    .concat(
      agreements
        .filter((a) => a.status === "active" && a.includes_warranty)
        .map((a) => a.warranty_end)
    )
    .filter((d): d is string => !!d);
  return dates.length ? dates.sort().at(-1)! : null;
}
