import type { Task } from "@/lib/types";
import { addDays } from "@/lib/agreements";

// Everything the Head of engineers' home screen shows beyond the shared
// HomeData. Plain serializable values; built on the server in page.tsx.

export interface HeadData {
  open: number;
  doneWeek: number;
  byStatus: { done: number; in_progress: number; todo: number; stuck: number; pending_approval: number };
  // Tasks closed on each of the last 7 days, oldest first.
  closedPerDay: { date: string; n: number }[];
  stuck: { count: number; oldestDays: number };
  unassigned: number;
  approvals: { id: string; title: string; people: string; parts: number }[];
  approvalsTotal: number;
  lateVisits: number;
  overdue: { count: number; money: { symbol: string; code: string; amount: number }[] };
  // Open work per engineer for the next 7 days (overdue and undated work
  // counts on day 0).
  load: { days: string[]; people: { id: string; name: string; cells: number[] }[] };
}

const DAY = 86400000;

export function buildHeadData(args: {
  tasks: Task[];
  today: string;
  people: { id: string; name: string }[];
  partsByTask: Map<string, number>;
  unassignedLabel: string;
  lateVisits: number;
  overdue: HeadData["overdue"];
}): HeadData {
  const { tasks, today, people, partsByTask } = args;
  const open = tasks.filter((t) => t.status !== "done");
  const count = (s: Task["status"]) => tasks.filter((t) => t.status === s).length;

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const closed = new Map(days.map((d) => [d, 0]));
  for (const t of tasks) {
    if (t.status !== "done" || !t.completed_at) continue;
    const d = t.completed_at.slice(0, 10);
    if (closed.has(d)) closed.set(d, (closed.get(d) ?? 0) + 1);
  }

  const stuck = open.filter((t) => t.status === "stuck");
  const oldest = stuck.reduce(
    (m, t) => Math.max(m, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(t.created_at)) / DAY)),
    0
  );

  const pending = tasks.filter((t) => t.status === "pending_approval");

  const ahead = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const load = people.map((p) => {
    const cells = ahead.map(() => 0);
    for (const t of open) {
      if (!t.assignees.some((a) => a.id === p.id)) continue;
      const due = t.due_date?.slice(0, 10);
      const idx = !due || due <= today ? 0 : ahead.indexOf(due);
      if (idx >= 0) cells[idx] += 1;
    }
    return { id: p.id, name: p.name, cells };
  });

  return {
    open: open.length,
    doneWeek: [...closed.values()].reduce((a, b) => a + b, 0),
    byStatus: {
      done: [...closed.values()].reduce((a, b) => a + b, 0),
      in_progress: count("in_progress"),
      todo: count("todo"),
      stuck: count("stuck"),
      pending_approval: pending.length,
    },
    closedPerDay: days.map((date) => ({ date, n: closed.get(date) ?? 0 })),
    stuck: { count: stuck.length, oldestDays: oldest },
    unassigned: open.filter((t) => t.assignees.length === 0).length,
    approvals: pending.slice(0, 4).map((t) => ({
      id: t.id,
      title: t.title,
      people:
        t.assignees.map((a) => a.first_name || a.full_name).filter(Boolean).join(", ") ||
        args.unassignedLabel,
      parts: partsByTask.get(t.id) ?? 0,
    })),
    approvalsTotal: pending.length,
    lateVisits: args.lateVisits,
    overdue: args.overdue,
    load: { days: ahead, people: load },
  };
}
