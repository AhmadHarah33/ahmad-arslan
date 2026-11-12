import type { Task } from "@/lib/types";
import { shiftMonth, type DashAgreement } from "@/lib/agreements.dashboard";

// What the Organizer's home screen shows: the approvals queue first, then
// money, visits and stock. Plain serializable values built in page.tsx.

export interface OrganizerData {
  approvals: { id: string; title: string; people: string; parts: number }[];
  approvalsTotal: number;
  collected: {
    symbol: string;
    code: string;
    paid: number; // this month
    pct: number | null; // paid share of everything still owed + paid this month
    // Last 6 months, oldest first. Only the current month carries due/overdue.
    months: { key: string; paid: number; due: number; overdue: number }[];
  };
  overdue: { count: number; money: { symbol: string; code: string; amount: number }[] };
  visitsWeek: { total: number; late: number };
  warrantyEnding: number;
  lowStock: {
    count: number;
    out: number;
    items: { id: string; name: string; sub: string; qty: number; min: number }[];
  };
  comingUp: { key: string; date: string; name: string; sub: string; late: boolean }[];
  chase: {
    id: string;
    name: string;
    amount: number;
    symbol: string;
    code: string;
    overdueDays: number | null;
    due: string | null;
  }[];
}

type Part = {
  id: string;
  name: string;
  part_number?: string | null;
  quantity: number;
  min_quantity: number | null;
  company?: { name: string } | null;
};

export function buildOrganizerData(args: {
  tasks: Task[];
  today: string;
  agreements: DashAgreement[];
  parts: Part[];
  partsByTask: Map<string, number>;
  symbols: Record<string, string>;
  unassignedLabel: string;
  visitsWeek: { total: number; late: number };
  warrantyEnding: number;
  comingUp: OrganizerData["comingUp"];
  chase: { agreement_id: string; name: string; amount: number; currency: string; due: string | null; overdueDays: number | null }[];
}): OrganizerData {
  const { agreements, symbols, today } = args;
  const sym = (c: string) => symbols[c] ?? `${c} `;

  const pending = args.tasks.filter((t) => t.status === "pending_approval");

  // Money: chart the currency with the most paid volume in the window, since
  // amounts in different currencies are never added together.
  const month = today.slice(0, 7);
  const keys = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
  const paidRows = agreements.filter(
    (a) => a.payment_status === "paid" && a.paid_at && a.amount != null && keys.includes(a.paid_at.slice(0, 7))
  );
  const volume = new Map<string, number>();
  for (const a of paidRows) volume.set(a.currency, (volume.get(a.currency) ?? 0) + Number(a.amount));
  const unpaid = agreements.filter((a) => a.is_unpaid && a.amount != null);
  for (const a of unpaid) if (!volume.has(a.currency)) volume.set(a.currency, 0);
  const code = [...volume.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "EUR";

  const months = keys.map((key) => ({
    key,
    paid: paidRows
      .filter((a) => a.currency === code && a.paid_at!.slice(0, 7) === key)
      .reduce((s, a) => s + Number(a.amount), 0),
    due: 0,
    overdue: 0,
  }));
  const cur = months[months.length - 1];
  for (const a of unpaid) {
    if (a.currency !== code) continue;
    if (a.payment_overdue) cur.overdue += Number(a.amount);
    else cur.due += Number(a.amount);
  }
  const owed = cur.due + cur.overdue;
  const pct = cur.paid + owed > 0 ? Math.round((cur.paid / (cur.paid + owed)) * 100) : null;

  const overdueRows = unpaid.filter((a) => a.payment_overdue);
  const overdueMoney = new Map<string, number>();
  for (const a of overdueRows) overdueMoney.set(a.currency, (overdueMoney.get(a.currency) ?? 0) + Number(a.amount));

  const low = args.parts
    .filter((p) => (p.min_quantity ?? 0) > 0 && p.quantity <= (p.min_quantity ?? 0))
    .sort((a, b) => a.quantity - b.quantity);

  return {
    approvals: pending.slice(0, 4).map((t) => ({
      id: t.id,
      title: t.title,
      people:
        t.assignees.map((a) => a.first_name || a.full_name).filter(Boolean).join(", ") ||
        args.unassignedLabel,
      parts: args.partsByTask.get(t.id) ?? 0,
    })),
    approvalsTotal: pending.length,
    collected: { symbol: sym(code), code, paid: cur.paid, pct, months },
    overdue: {
      count: overdueRows.length,
      money: [...overdueMoney].map(([c, amount]) => ({ code: c, amount, symbol: sym(c) })),
    },
    visitsWeek: args.visitsWeek,
    warrantyEnding: args.warrantyEnding,
    lowStock: {
      count: low.length,
      out: low.filter((p) => p.quantity <= 0).length,
      items: low.slice(0, 4).map((p) => ({
        id: p.id,
        name: p.name,
        sub: [p.company?.name, p.part_number].filter(Boolean).join(" · "),
        qty: p.quantity,
        min: p.min_quantity ?? 0,
      })),
    },
    comingUp: args.comingUp.slice(0, 4),
    chase: args.chase.slice(0, 3).map((p) => ({
      id: p.agreement_id,
      name: p.name,
      amount: p.amount,
      symbol: sym(p.currency),
      code: p.currency,
      overdueDays: p.overdueDays,
      due: p.due,
    })),
  };
}
