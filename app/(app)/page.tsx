import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { greeting } from "@/lib/permissions";
import { TASK_SELECT, normalizeTasks } from "@/lib/tasks.server";
import { PriorityChip, StatusChip } from "@/components/ui";
import { AvatarGroup } from "@/components/avatar";
import { StatTile, ProgressRow, Donut, MonthBars } from "@/components/charts";
import { DUE_STYLES, dueStatus, formatDateShort } from "@/lib/dates";
import { STATUS_VAR, TASK_STATUSES } from "@/lib/types";
import type { Profile, SparePart, Task } from "@/lib/types";
import {
  PREVIEW,
  previewCustomers,
  previewEngineers,
  previewSpareParts,
  previewTasks,
} from "@/lib/preview";

export default async function DashboardPage() {
  const profile = await requireProfile();
  const head = profile.role === "head";

  let allTasks: Task[];
  let engineers: Profile[];
  let parts: Pick<SparePart, "id" | "name" | "quantity" | "min_quantity">[];
  let customerCount: number;
  let sparePartCount: number;

  if (PREVIEW) {
    allTasks = previewTasks;
    engineers = previewEngineers;
    parts = previewSpareParts;
    customerCount = previewCustomers.length;
    sparePartCount = previewSpareParts.length;
  } else {
    const supabase = createClient();
    // Create any due preventive-maintenance tasks (idempotent; safe to call).
    try {
      await supabase.rpc("generate_due_maintenance");
    } catch {
      /* ignore — generation is best-effort */
    }
    const [{ data: tasks }, { data: profs }, { data: sp }, customers] =
      await Promise.all([
        supabase.from("tasks").select(TASK_SELECT).order("position"),
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("spare_parts").select("id, name, quantity, min_quantity"),
        supabase.from("customers").select("id", { count: "exact", head: true }),
      ]);
    allTasks = normalizeTasks(tasks);
    engineers = (profs ?? []) as Profile[];
    parts = (sp ?? []) as any[];
    customerCount = customers.count ?? 0;
    sparePartCount = parts.length;
  }

  const open = allTasks.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => dueStatus(t.due_date) === "overdue");
  const weekAgo = Date.now() - 7 * 86400000;
  const doneThisWeek = allTasks.filter(
    (t) => t.status === "done" && t.completed_at && new Date(t.completed_at).getTime() >= weekAgo
  );
  const lowStock = parts.filter((p) => (p.min_quantity ?? 0) > 0 && p.quantity <= (p.min_quantity ?? 0));

  // Home task list (engineers: unassigned + own; head: all open).
  const visible = head
    ? open
    : open.filter(
        (t) => t.assignees.length === 0 || t.assignees.some((a) => a.id === profile.id)
      );

  // Progress: head → per engineer; engineer → their own.
  const progress = head
    ? engineers
        .map((e) => {
          const mine = allTasks.filter((t) => t.assignees.some((a) => a.id === e.id));
          return { name: e.full_name || e.first_name, done: mine.filter((t) => t.status === "done").length, total: mine.length };
        })
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total)
    : (() => {
        const mine = allTasks.filter((t) => t.assignees.some((a) => a.id === profile.id));
        return [{ name: "My completion", done: mine.filter((t) => t.status === "done").length, total: mine.length }];
      })();

  const Header = (
    <div>
      <h1 className="text-[26px] font-bold tracking-tight text-ink md:text-[32px]">
        Good {greeting().toLowerCase()},{" "}
        {profile.first_name || profile.full_name || "there"}
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        Stay on top of your tasks, monitor progress, and track status.
      </p>
    </div>
  );

  const statTiles = (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Open tasks" value={open.length} icon={<TasksGlyph />} />
      <StatTile
        label="Overdue"
        value={overdue.length}
        tone={overdue.length ? "danger" : "default"}
        icon={<ClockGlyph />}
      />
      <StatTile
        label="Done this week"
        value={doneThisWeek.length}
        tone="good"
        icon={<CheckGlyph />}
      />
      <StatTile
        label="Low stock"
        value={lowStock.length}
        tone={lowStock.length ? "warn" : "default"}
        icon={<BoxGlyph />}
      />
    </div>
  );

  // ---- Head: compact card dashboard --------------------------------------
  if (head) {
    // One segment per board column, coloured from the same --tone-* tokens the
    // board uses, so the ring reads as a straight breakdown of the four
    // columns. (Overdue isn't a segment — it cuts across statuses and already
    // has its own tile above.)
    const statusSegments = TASK_STATUSES.map(({ key, label }) => ({
      label,
      value: allTasks.filter((t) => t.status === key).length,
      color: `rgb(var(${STATUS_VAR[key]}))`,
    }));
    const months = lastMonths(allTasks);
    const unassigned = open.filter((t) => t.assignees.length === 0);

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          {Header}
          <Link href="/tasks" className="text-sm font-medium text-brand-600">
            View board →
          </Link>
        </div>

        {statTiles}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card title="Cases by status">
            <Donut segments={statusSegments} />
          </Card>

          <Card title="Cases over the year" className="xl:col-span-2">
            <MonthBars data={months} />
          </Card>

          <Card title="Engineers leaderboard">
            {progress.length === 0 ? (
              <p className="text-sm text-ink-faint">No assigned tasks yet.</p>
            ) : (
              <ol className="space-y-3">
                {progress.slice(0, 6).map((r, i) => (
                  <li key={r.name} className="flex items-center gap-3">
                    <span className="w-4 shrink-0 text-sm font-semibold text-ink-faint">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <ProgressRow label={r.name} done={r.done} total={r.total} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title={`Unassigned (${unassigned.length})`}>
            {unassigned.length === 0 ? (
              <p className="text-sm text-ink-faint">Everything is assigned. 🎉</p>
            ) : (
              <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                {unassigned.map((t) => (
                  <li key={t.id}>
                    <Link href="/tasks" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-soft">
                      <StatusChip status={t.status} />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.title}</span>
                      {t.due_date && dueStatus(t.due_date) !== "none" && (
                        <span className={`chip ${DUE_STYLES[dueStatus(t.due_date) as "overdue" | "soon"]}`}>
                          {dueStatus(t.due_date) === "overdue" ? "Overdue" : "Soon"}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Low stock (${lowStock.length})`}>
            {lowStock.length === 0 ? (
              <p className="text-sm text-ink-faint">All parts above threshold.</p>
            ) : (
              <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                {lowStock.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-2 py-1">
                    <span className="min-w-0 truncate text-sm text-ink">{p.name}</span>
                    <span className="chip shrink-0 bg-amber-50 text-amber-700">{p.quantity} / {p.min_quantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Tile href="/tasks" title="Tasks" value={`${open.length} open`} desc="Kanban board & list" />
          <Tile href="/customers" title="Customers" value={`${customerCount} total`} desc="By brand & machine" />
          <Tile href="/spare-parts" title="Spare parts" value={`${sparePartCount} items`} desc="Inventory by company" />
        </div>
      </div>
    );
  }

  // ---- Engineer: simple focused list -------------------------------------
  return (
    <div className="space-y-8">
      {Header}
      {statTiles}

      {progress.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Your progress
          </h2>
          <div className="card space-y-3 p-4">
            {progress.map((r) => (
              <ProgressRow key={r.name} label={r.name} done={r.done} total={r.total} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            My tasks & unassigned
          </h2>
          <Link href="/tasks" className="text-sm font-medium text-brand-600">
            View board →
          </Link>
        </div>
        {visible.length === 0 ? (
          <div className="card px-5 py-8 text-center text-sm text-ink-faint">
            Nothing assigned to you and nothing unassigned. 🎉
          </div>
        ) : (
          <TaskGrid tasks={visible} />
        )}
      </section>
    </div>
  );
}

function Card({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`card p-4 ${className}`}>
      <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

// Counts of tasks created per month for the last 12 months.
function lastMonths(tasks: Task[]) {
  const now = new Date();
  const out: { label: string; value: number; key: string }[] = [];
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ label: M[d.getMonth()], value: 0, key: `${d.getFullYear()}-${d.getMonth()}` });
  }
  const idx = new Map(out.map((o, i) => [o.key, i]));
  for (const t of tasks) {
    if (!t.created_at) continue;
    const d = new Date(t.created_at);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    const i = idx.get(k);
    if (i !== undefined) out[i].value++;
  }
  return out.map(({ label, value }) => ({ label, value }));
}

// Compact task card, matching the board's.
function TaskGrid({ tasks }: { tasks: Task[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tasks.map((t) => {
        const st = dueStatus(t.due_date);
        return (
          <Link
            key={t.id}
            href="/tasks"
            className="card block p-3 transition hover:shadow-pop"
          >
            <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
              {t.title}
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <AvatarGroup people={t.assignees} size={20} max={3} />
              <PriorityChip priority={t.priority} />
              {t.due_date && (
                <span
                  className={`ml-auto text-xs ${
                    st === "none"
                      ? "text-ink-faint"
                      : `chip px-2 py-0.5 ${DUE_STYLES[st]}`
                  }`}
                >
                  {formatDateShort(t.due_date)}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function Tile({ href, title, value, desc }: { href: string; title: string; value: string; desc: string }) {
  return (
    <Link href={href} className="card block p-5 transition hover:shadow-pop">
      <p className="text-sm font-medium text-ink-muted">{title}</p>
      <p className="mt-1 text-lg font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink-faint">{desc}</p>
    </Link>
  );
}

/* --- stat-tile glyphs --- */
function TasksGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="7" height="16" rx="1.5" />
      <rect x="14" y="4" width="7" height="10" rx="1.5" />
    </svg>
  );
}
function ClockGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.5l3.5 2" />
    </svg>
  );
}
function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}
function BoxGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 3 7v10l9 5 9-5V7z" />
      <path d="M3 7l9 5 9-5M12 12v10" />
    </svg>
  );
}
