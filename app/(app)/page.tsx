import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  generateDueAgreementVisits,
  loadAgreementsDashboardData,
} from "@/lib/agreements.server";
import { getServerT } from "@/lib/i18n/server";
import { greetingKey } from "@/lib/i18n/greeting";
import { TASK_SELECT, normalizeTasks } from "@/lib/tasks.server";
import { dashStats, paymentItems, urgentItems } from "@/lib/agreements.dashboard";
import { formatAmount } from "@/lib/money";
import DashboardHome, { type HomeData } from "@/components/dashboard/home";
import type { SparePart, TaskStatus } from "@/lib/types";

const SYMBOLS: Record<string, string> = { TRY: "₺", EUR: "€", USD: "$" };

// Most urgent first on the home list: stuck work, then what is being worked
// on, then the queue; high priority ahead within each.
const STATUS_ORDER: Record<TaskStatus, number> = {
  stuck: 0,
  in_progress: 1,
  pending_approval: 2,
  todo: 3,
  done: 4,
};
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export default async function DashboardPage() {
  const t = await getServerT();
  const profile = await requireProfile();
  const supabase = await createClient();

  // Create the board task for any agreement visit that has come due (Bakım &
  // Garanti; idempotent). Before the task query below so a visit that just
  // became due is already on the board in this render.
  await generateDueAgreementVisits(supabase);
  const [{ data: tasks }, { data: sp }, { data: profs }, agr] = await Promise.all([
    supabase.from("tasks").select(TASK_SELECT).order("position"),
    supabase.from("spare_parts").select("id, name, quantity, min_quantity"),
    supabase.from("profiles").select("id, full_name, first_name").order("full_name"),
    loadAgreementsDashboardData(supabase),
  ]);
  const allTasks = normalizeTasks(tasks);
  const parts = (sp ?? []) as Pick<SparePart, "id" | "name" | "quantity" | "min_quantity">[];

  // ---- Tasks ---------------------------------------------------------------
  const open = allTasks.filter((task) => task.status !== "done");
  const weekAgo = Date.now() - 7 * 86400000;
  const doneThisWeek = allTasks.filter(
    (task) =>
      task.status === "done" &&
      task.completed_at &&
      new Date(task.completed_at).getTime() >= weekAgo
  );
  const isMine = (task: (typeof allTasks)[number]) =>
    task.assignees.some((a) => a.id === profile.id);
  const mine = allTasks.filter(isMine);
  const count = (s: TaskStatus) => open.filter((task) => task.status === s).length;

  const rows = [...open]
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    )
    .slice(0, 200)
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      people:
        task.assignees.map((a) => a.first_name || a.full_name).filter(Boolean).join(", ") ||
        t("task.unassigned"),
      mine: isMine(task),
    }));

  // ---- Bakım & Garanti -----------------------------------------------------
  const { today, agreements, visits, warranties } = agr;
  const stats = dashStats(agreements, visits, warranties, today);
  const byId = new Map(agreements.map((a) => [a.id, a]));
  const live = (id: string) => byId.get(id)?.status === "active";

  const upcoming = visits
    .filter((v) => !v.done_at && v.due_date >= today && live(v.agreement_id))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 7)
    .map((v) => {
      const a = byId.get(v.agreement_id)!;
      return {
        key: v.id,
        agreement_id: a.id,
        date: v.due_date,
        name: a.customer_name,
        sub: [a.machine_labels.slice(0, 2).join(", "), a.technician_names.join(", ")]
          .filter(Boolean)
          .join(" · "),
        plan: a.plan,
      };
    });
  const urgent = urgentItems(agreements, visits, warranties, today);
  const payments = paymentItems(agreements, today);

  const pending =
    stats.payments.totals
      .map(({ currency, amount }) =>
        SYMBOLS[currency]
          ? `${SYMBOLS[currency]}${formatAmount(amount)}`
          : `${formatAmount(amount)} ${currency}`
      )
      .join(" + ") || "—";

  const data: HomeData = {
    today,
    greeting: `${t(greetingKey())}, ${profile.first_name || profile.full_name || "there"}`,
    tasks: {
      open: open.length,
      doneWeek: doneThisWeek.length,
      byStatus: {
        todo: count("todo"),
        in_progress: count("in_progress"),
        pending_approval: count("pending_approval"),
        stuck: count("stuck"),
      },
      mineDone: mine.filter((task) => task.status === "done").length,
      mineTotal: mine.length,
      rows,
    },
    bakim: {
      visitsToday: visits.filter((v) => v.due_date === today && live(v.agreement_id)).length,
      next: upcoming[0] ? { name: upcoming[0].name, date: upcoming[0].date } : null,
      visitsMonth: stats.visits.done + stats.visits.late + stats.visits.planned,
      warrantyEnding: stats.warrantyEnding.count,
      pending,
      upcoming,
      urgent,
      payments,
      symbols: SYMBOLS,
    },
    people: (profs ?? [])
      .filter((p) => p.id !== profile.id)
      .map((p) => ({ id: p.id, name: p.full_name || p.first_name })),
    lowStock: parts.filter((p) => (p.min_quantity ?? 0) > 0 && p.quantity <= (p.min_quantity ?? 0))
      .length,
  };

  return <DashboardHome data={data} />;
}
