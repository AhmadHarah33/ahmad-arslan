import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { addDays } from "@/lib/agreements";

// What an engineer's home screen shows: their own open work first, today's
// Bakım visit, tasks nobody has claimed, and how the week is going.

export interface EngineerTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  due: string | null;
  parts: number;
}

export interface EngineerData {
  profileId: string;
  open: number;
  stuck: number;
  doneWeek: number;
  closedPerDay: { date: string; n: number }[];
  tasks: EngineerTask[];
  tasksTotal: number;
  visitToday: { agreement_id: string; name: string; sub: string } | null;
  visitsToday: number;
  nextVisits: { key: string; agreement_id: string; date: string; name: string; sub: string }[];
  grabs: { id: string; title: string; priority: TaskPriority }[];
  grabsTotal: number;
}

const STATUS_ORDER: Record<TaskStatus, number> = {
  stuck: 0,
  in_progress: 1,
  pending_approval: 2,
  todo: 3,
  done: 4,
};
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export function buildEngineerData(args: {
  profileId: string;
  tasks: Task[];
  today: string;
  partsByTask: Map<string, number>;
  myVisits: { key: string; agreement_id: string; date: string; name: string; sub: string }[];
}): EngineerData {
  const { profileId, today } = args;
  const mine = args.tasks.filter((t) => t.assignees.some((a) => a.id === profileId));
  const open = mine.filter((t) => t.status !== "done");

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const closed = new Map(days.map((d) => [d, 0]));
  for (const t of mine) {
    if (t.status !== "done" || !t.completed_at) continue;
    const d = t.completed_at.slice(0, 10);
    if (closed.has(d)) closed.set(d, (closed.get(d) ?? 0) + 1);
  }

  const sorted = [...open].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  );
  const unclaimed = args.tasks
    .filter((t) => t.status !== "done" && t.assignees.length === 0)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  const todays = args.myVisits.filter((v) => v.date === today);

  return {
    profileId,
    open: open.length,
    stuck: open.filter((t) => t.status === "stuck").length,
    doneWeek: [...closed.values()].reduce((a, b) => a + b, 0),
    closedPerDay: days.map((date) => ({ date, n: closed.get(date) ?? 0 })),
    tasks: sorted.slice(0, 6).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      position: t.position,
      due: t.due_date?.slice(0, 10) ?? null,
      parts: args.partsByTask.get(t.id) ?? 0,
    })),
    tasksTotal: open.length,
    visitToday: todays[0]
      ? { agreement_id: todays[0].agreement_id, name: todays[0].name, sub: todays[0].sub }
      : null,
    visitsToday: todays.length,
    nextVisits: args.myVisits.filter((v) => v.date > today).slice(0, 3),
    grabs: unclaimed.slice(0, 4).map((t) => ({ id: t.id, title: t.title, priority: t.priority })),
    grabsTotal: unclaimed.length,
  };
}
