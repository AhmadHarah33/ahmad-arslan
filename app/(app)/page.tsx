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
import HeadHome from "@/components/dashboard/head-home";
import OrganizerHome from "@/components/dashboard/organizer-home";
import EngineerHome from "@/components/dashboard/engineer-home";
import { buildEngineerData } from "@/lib/dashboard.engineer";
import { buildHeadData } from "@/lib/dashboard.head";
import { DEFAULT_LINKS, type SharedLink } from "@/lib/shared-links";
import { canEditData } from "@/lib/permissions";
import { buildOrganizerData } from "@/lib/dashboard.organizer";
import { addDays } from "@/lib/agreements";
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
  const t = getServerT();
  const profile = await requireProfile();
  const supabase = createClient();

  // Create the board task for any agreement visit that has come due (Bakım &
  // Garanti; idempotent). Before the task query below so a visit that just
  // became due is already on the board in this render.
  await generateDueAgreementVisits(supabase);
  const [{ data: tasks }, { data: sp }, { data: profs }, agr] = await Promise.all([
    supabase.from("tasks").select(TASK_SELECT).order("position"),
    supabase
      .from("spare_parts")
      .select("id, name, part_number, quantity, min_quantity, company:company_id(name)"),
    supabase.from("profiles").select("id, full_name, first_name, role").order("full_name"),
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

  // Parts attached to each task waiting for approval (head and organizer).
  const partsByTask = new Map<string, number>();
  if (profile.role === "head" || profile.role === "organizer" || profile.role === "engineer") {
    const approvalIds =
      profile.role === "engineer"
        ? allTasks.filter((task) => task.status !== "done" && isMine(task)).map((task) => task.id)
        : allTasks.filter((task) => task.status === "pending_approval").map((task) => task.id);
    if (approvalIds.length) {
      const { data: tp } = await supabase.from("task_parts").select("task_id").in("task_id", approvalIds);
      for (const row of tp ?? []) {
        partsByTask.set(row.task_id, (partsByTask.get(row.task_id) ?? 0) + 1);
      }
    }
  }

  // The Shared drives card. If the table is not there yet, fall back to the two
  // default folders (read-only) rather than failing the page.
  const { data: linkRows, error: linkError } = await supabase
    .from("shared_links")
    .select("id, title, note, url, icon, position")
    .order("position", { ascending: true });
  const links: SharedLink[] = linkError || !linkRows ? DEFAULT_LINKS : (linkRows as SharedLink[]);
  const canEditLinks = !linkError && canEditData(profile);

  if (profile.role === "engineer") {
    const myVisits = visits
      .filter((v) => !v.done_at && v.due_date >= today && live(v.agreement_id))
      .filter((v) => {
        const a = byId.get(v.agreement_id)!;
        return a.assignee_id === profile.id || a.technician_names.includes(profile.full_name);
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .map((v) => {
        const a = byId.get(v.agreement_id)!;
        return {
          key: v.id,
          agreement_id: a.id,
          date: v.due_date,
          name: a.customer_name,
          sub: [a.machine_labels.slice(0, 2).join(", "), t(`ag.type.${a.plan}` as const)]
            .filter(Boolean)
            .join(" · "),
        };
      });
    return (
      <EngineerHome
        links={links}
        canEditLinks={canEditLinks}
        greeting={{
          hello: t(greetingKey()),
          name: profile.first_name || profile.full_name || "there",
        }}
        today={today}
        data={buildEngineerData({ profileId: profile.id, tasks: allTasks, today, partsByTask, myVisits })}
      />
    );
  }

  if (profile.role === "organizer") {
    const weekEnd = addDays(today, 6);
    const weekVisits = visits.filter((v) => !v.done_at && v.due_date <= weekEnd && live(v.agreement_id));
    const lateVisits = urgent.filter((u) => u.kind === "visit-late");
    const organizer = buildOrganizerData({
      tasks: allTasks,
      today,
      agreements,
      parts: (sp ?? []) as unknown as Parameters<typeof buildOrganizerData>[0]["parts"],
      partsByTask,
      symbols: SYMBOLS,
      unassignedLabel: t("task.unassigned"),
      visitsWeek: { total: weekVisits.length, late: weekVisits.filter((v) => v.due_date < today).length },
      warrantyEnding: stats.warrantyEnding.count,
      comingUp: [
        ...lateVisits.map((u) => ({
          key: u.key,
          date: u.date,
          name: u.name,
          sub: `${u.days} ${t("ag.daysLate")}`,
          late: true,
        })),
        ...upcoming.map((v) => ({ key: v.key, date: v.date, name: v.name, sub: v.sub, late: false })),
      ],
      chase: payments,
    });
    return (
      <OrganizerHome
        links={links}
        canEditLinks={canEditLinks}
        greeting={{
          hello: t(greetingKey()),
          name: profile.first_name || profile.full_name || "there",
        }}
        today={today}
        data={organizer}
      />
    );
  }

  if (profile.role === "head") {
    const overdueNow = payments.filter((p) => p.overdueDays != null);
    const money = new Map<string, number>();
    for (const p of overdueNow) money.set(p.currency, (money.get(p.currency) ?? 0) + p.amount);

    const head = buildHeadData({
      tasks: allTasks,
      today,
      people: (profs ?? [])
        .filter((p) => p.role === "engineer")
        .map((p) => ({ id: p.id, name: p.first_name || p.full_name })),
      partsByTask,
      unassignedLabel: t("task.unassigned"),
      lateVisits: urgent.filter((u) => u.kind === "visit-late").length,
      overdue: {
        count: overdueNow.length,
        money: [...money].map(([code, amount]) => ({ code, amount, symbol: SYMBOLS[code] ?? `${code} ` })),
      },
    });
    return (
      <HeadHome
        links={links}
        canEditLinks={canEditLinks}
        greeting={{
          hello: t(greetingKey()),
          name: profile.first_name || profile.full_name || "there",
        }}
        today={today}
        data={head}
      />
    );
  }

  return <DashboardHome data={data} />;
}
