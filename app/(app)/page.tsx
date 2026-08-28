import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { greeting } from "@/lib/permissions";
import { TASK_SELECT, normalizeTasks } from "@/lib/tasks.server";
import { PriorityChip, StatusChip } from "@/components/ui";
import { AvatarGroup } from "@/components/avatar";
import { DUE_STYLES, dueStatus, formatDate } from "@/lib/dates";
import type { Task } from "@/lib/types";
import {
  PREVIEW,
  previewCustomers,
  previewSpareParts,
  previewTasks,
} from "@/lib/preview";

export default async function DashboardPage() {
  const profile = await requireProfile();
  const head = profile.role === "head";

  let openTasks: Task[];
  let customerCount: number;
  let sparePartCount: number;

  if (PREVIEW) {
    openTasks = previewTasks.filter((t) => t.status !== "done");
    customerCount = previewCustomers.length;
    sparePartCount = previewSpareParts.length;
  } else {
    const supabase = createClient();
    const [{ data: tasks }, customers, spareParts] = await Promise.all([
      supabase
        .from("tasks")
        .select(TASK_SELECT)
        .neq("status", "done")
        .order("position", { ascending: true }),
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("spare_parts").select("id", { count: "exact", head: true }),
    ]);
    openTasks = normalizeTasks(tasks);
    customerCount = customers.count ?? 0;
    sparePartCount = spareParts.count ?? 0;
  }

  // Engineers see only unassigned tasks + tasks assigned to them (home only).
  const visible = head
    ? openTasks
    : openTasks.filter(
        (t) =>
          t.assignees.length === 0 ||
          t.assignees.some((a) => a.id === profile.id)
      );

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-ink-muted">{today()}</p>
        <h1 className="mt-1 text-2xl font-bold text-ink md:text-3xl">
          {greeting()}, {profile.first_name || profile.full_name || "there"} 👋
        </h1>
        {head && (
          <p className="mt-1 text-sm text-ink-muted">
            Here&apos;s everyone&apos;s open work and who&apos;s responsible.
          </p>
        )}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            {head ? "Team tasks" : "My tasks & unassigned"}
          </h2>
          <Link href="/tasks" className="text-sm font-medium text-brand-600">
            View board →
          </Link>
        </div>

        {visible.length === 0 ? (
          <div className="card px-5 py-8 text-center text-sm text-ink-faint">
            {head
              ? "No open tasks right now. 🎉"
              : "Nothing assigned to you and nothing unassigned. 🎉"}
          </div>
        ) : head ? (
          <HeadGroups tasks={visible} />
        ) : (
          <TaskGrid tasks={visible} />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Quick access
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile href="/tasks" title="Tasks" value={`${openTasks.length} open`} desc="Kanban board & list" />
          <Tile href="/customers" title="Customers" value={`${customerCount} total`} desc="By brand, machines & links" />
          <Tile href="/spare-parts" title="Spare parts" value={`${sparePartCount} items`} desc="Inventory by company" />
        </div>
      </section>
    </div>
  );
}

// Head view: group open tasks by responsible engineer (+ an Unassigned group).
function HeadGroups({ tasks }: { tasks: Task[] }) {
  const groups = new Map<string, { name: string; tasks: Task[] }>();
  const unassigned: Task[] = [];

  for (const t of tasks) {
    if (t.assignees.length === 0) {
      unassigned.push(t);
      continue;
    }
    for (const a of t.assignees) {
      const g = groups.get(a.id) ?? { name: a.full_name || a.first_name, tasks: [] };
      g.tasks.push(t);
      groups.set(a.id, g);
    }
  }

  const ordered = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      {ordered.map((g) => (
        <div key={g.name}>
          <h3 className="mb-2 text-sm font-semibold text-ink">
            {g.name}
            <span className="ml-2 text-xs font-normal text-ink-faint">
              {g.tasks.length}
            </span>
          </h3>
          <TaskGrid tasks={g.tasks} />
        </div>
      ))}
      {unassigned.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-brand-700">
            Unassigned
            <span className="ml-2 text-xs font-normal text-ink-faint">
              {unassigned.length}
            </span>
          </h3>
          <TaskGrid tasks={unassigned} />
        </div>
      )}
    </div>
  );
}

function TaskGrid({ tasks }: { tasks: Task[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tasks.map((t) => (
        <Link
          key={t.id}
          href="/tasks"
          className="card block p-4 transition hover:shadow-pop"
        >
          <div className="mb-2 flex items-center gap-2">
            <StatusChip status={t.status} />
            <PriorityChip priority={t.priority} />
            {t.due_date &&
              dueStatus(t.due_date) !== "none" &&
              (() => {
                const st = dueStatus(t.due_date) as "overdue" | "soon";
                return (
                  <span className={`chip ${DUE_STYLES[st]}`}>
                    {st === "overdue" ? "Overdue" : "Due soon"}
                  </span>
                );
              })()}
          </div>
          <p className="font-medium text-ink">{t.title}</p>
          <div className="mt-2.5 flex items-center justify-between">
            <AvatarGroup people={t.assignees} size={20} />
            {t.due_date && (
              <span className="text-xs text-ink-faint">
                {formatDate(t.due_date)}
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

function Tile({
  href,
  title,
  value,
  desc,
}: {
  href: string;
  title: string;
  value: string;
  desc: string;
}) {
  return (
    <Link href={href} className="card block p-5 transition hover:shadow-pop">
      <p className="text-sm font-medium text-ink-muted">{title}</p>
      <p className="mt-1 text-lg font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink-faint">{desc}</p>
    </Link>
  );
}

function today() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
