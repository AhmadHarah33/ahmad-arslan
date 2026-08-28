import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { greeting } from "@/lib/permissions";
import { PriorityChip, StatusChip } from "@/components/ui";
import type { Task } from "@/lib/types";
import {
  PREVIEW,
  previewCustomers,
  previewSpareParts,
  previewTasks,
} from "@/lib/preview";

export default async function DashboardPage() {
  const profile = await requireProfile();

  if (PREVIEW) {
    const mine = previewTasks.filter(
      (t) => t.assignee_id === profile.id && t.status !== "done"
    );
    return (
      <DashboardContent
        firstName={profile.first_name}
        isHead={profile.role === "head"}
        tasks={mine}
        openCount={mine.length}
        customerCount={previewCustomers.length}
        sparePartCount={previewSpareParts.length}
      />
    );
  }

  const supabase = createClient();

  const [{ data: myTasks }, customers, spareParts, openTasks] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("assignee_id", profile.id)
      .neq("status", "done")
      .order("status", { ascending: true })
      .order("position", { ascending: true })
      .limit(8),
    supabase.from("customers").select("id", { count: "exact", head: true }),
    supabase.from("spare_parts").select("id", { count: "exact", head: true }),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("assignee_id", profile.id)
      .neq("status", "done"),
  ]);

  return (
    <DashboardContent
      firstName={profile.first_name || profile.full_name}
      isHead={profile.role === "head"}
      tasks={(myTasks ?? []) as Task[]}
      openCount={openTasks.count ?? 0}
      customerCount={customers.count ?? 0}
      sparePartCount={spareParts.count ?? 0}
    />
  );
}

function DashboardContent({
  firstName,
  isHead,
  tasks,
  openCount,
  customerCount,
  sparePartCount,
}: {
  firstName: string;
  isHead: boolean;
  tasks: Task[];
  openCount: number;
  customerCount: number;
  sparePartCount: number;
}) {
  const name = firstName || "there";

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-ink-muted">{today()}</p>
        <h1 className="mt-1 text-2xl font-bold text-ink md:text-3xl">
          {greeting()}, {name} 👋
        </h1>
        {isHead && (
          <p className="mt-1 text-sm text-ink-muted">
            You have full access to manage the team and all data.
          </p>
        )}
      </div>

      {/* My tasks — quick look */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            My tasks
          </h2>
          <Link href="/tasks" className="text-sm font-medium text-brand-600">
            View board →
          </Link>
        </div>

        {tasks.length === 0 ? (
          <div className="card px-5 py-8 text-center text-sm text-ink-faint">
            You&apos;re all caught up — no open tasks. 🎉
          </div>
        ) : (
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
                </div>
                <p className="font-medium text-ink">{t.title}</p>
                {t.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
                    {t.description}
                  </p>
                )}
                {t.due_date && (
                  <p className="mt-2 text-xs text-ink-faint">
                    Due {new Date(t.due_date).toLocaleDateString()}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Quick access */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Quick access
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile
            href="/tasks"
            title="Tasks"
            value={`${openCount} open`}
            desc="Kanban board & list"
          />
          <Tile
            href="/customers"
            title="Customers"
            value={`${customerCount} total`}
            desc="Machines, SNs & links"
          />
          <Tile
            href="/spare-parts"
            title="Spare parts"
            value={`${sparePartCount} items`}
            desc="Inventory by company"
          />
        </div>
      </section>
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
