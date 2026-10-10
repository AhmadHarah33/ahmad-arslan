"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  closestCorners,
  defaultDropAnimationSideEffects,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  DropAnimation,
  MeasuringStrategy,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { STATUS_VAR, TASK_STATUSES } from "@/lib/types";
import { useT } from "@/lib/i18n/provider";
import { priorityKey, statusKey } from "@/lib/i18n/task-keys";
import type {
  AssigneeLite,
  City,
  Company,
  Customer,
  CustomerMachine,
  MachineModel,
  Profile,
  Task,
  TaskStatus,
} from "@/lib/types";
import { canEditTask, isManager } from "@/lib/permissions";
import { moveTask } from "@/app/(app)/tasks/actions";
import type { FieldDefinition } from "@/lib/customFields";
import { Avatar } from "@/components/avatar";
import PageTools from "@/components/page-tools";
import StatCard from "@/components/stat-card";
import Fab from "@/components/fab";
import TaskModal from "./task-modal";
import { toastErr } from "@/lib/toast";

type Engineer = Profile;
type CustomerLite = Pick<Customer, "id" | "name">;
type CustomerMachineLite = Pick<
  CustomerMachine,
  "id" | "customer_id" | "city_id" | "company_id" | "model_id" | "serial_number"
>;
type ValueMap = Record<string, Record<string, unknown>>;
type CountMap = Record<string, number>;

// "Pending approval" is a landing spot the completion gate puts a task into,
// not a column anyone drags a card into by hand — dropping straight into it
// would bypass the has-parts check entirely. Excluded from the drag-target
// set; the column still renders (from TASK_STATUSES) with its own
// Approve / Send back buttons instead of drag handles.
const STATUS_KEYS = new Set<string>(
  TASK_STATUSES.filter((c) => c.key !== "pending_approval").map((c) => c.key)
);
function isColumnId(id: string): id is TaskStatus {
  return STATUS_KEYS.has(id);
}

// Snaps the dragged card into its slot with the same easing the rest of the
// app's overlays use, instead of dnd-kit's default linear settle.
const dropAnimation: DropAnimation = {
  duration: 220,
  easing: "cubic-bezier(0.32, 0.72, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
};

// Drag-and-drop reordering stays desktop-only — on phones it fights native
// scrolling and is fiddly with a thumb, so mobile gets the three-dot menu's
// "Move to…" sheet instead. Defaults to false (matches the SSR render) and
// flips true after mount once the viewport is known.
function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setDesktop(mq.matches);
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return desktop;
}

type TaskFilter = "all" | "mine" | "high";

export default function TasksBoard({
  openNewOnMount = false,
  profile,
  initialTasks,
  engineers,
  customers,
  companies,
  cities,
  models,
  customerMachines,
  olderDoneHidden = 0,
  doneWindowDays = 60,
}: {
  // Dashboard "New task" quick action links to /tasks?new=1.
  openNewOnMount?: boolean;
  profile: Profile;
  initialTasks: Task[];
  engineers: Engineer[];
  customers: CustomerLite[];
  companies: Company[];
  cities: City[];
  models: MachineModel[];
  customerMachines: CustomerMachineLite[];
  fieldDefs: FieldDefinition[];
  fieldValues: ValueMap;
  commentCounts: CountMap;
  // Finished tasks older than the window the page loaded (0 = nothing hidden).
  olderDoneHidden?: number;
  doneWindowDays?: number;
}) {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [view, setView] = useState<"board" | "list">("board");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("all");
  // Columns the user has expanded past COLUMN_LIMIT (Done is the long one).
  const [expanded, setExpanded] = useState<Set<TaskStatus>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const isDesktop = useIsDesktop();
  const [modal, setModal] = useState<{
    open: boolean;
    task: Task | null;
    status: TaskStatus;
  }>({ open: openNewOnMount, task: null, status: "todo" });
  // Mobile-only "⋯" menu on a card: edit, or move to another column.
  const [actionSheet, setActionSheet] = useState<{
    task: Task;
    mode: "menu" | "move";
  } | null>(null);

  // Snapshot of `tasks` taken at drag start, so a failed save (or a drop
  // outside any column) can restore the exact pre-drag order in one shot.
  const dragSnapshot = useRef<Task[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // Customer name, only used to make search match "customer / issue" titles.
  const customerName = useMemo(() => {
    const m = new Map(customers.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) ?? "" : "");
  }, [customers]);

  const hasFilter = query.trim() !== "" || filter !== "all";
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((tk) => {
      if (filter === "mine" && !tk.assignees.some((a) => a.id === profile.id)) return false;
      if (filter === "high" && tk.priority !== "high") return false;
      if (q) {
        const hay = `${tk.title} ${customerName(tk.customer_id)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, query, filter, profile.id, customerName]);

  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      pending_approval: [],
      done: [],
      stuck: [],
    };
    for (const tk of visible) map[tk.status].push(tk);
    return map;
  }, [visible]);

  const activeTask = tasks.find((t) => t.id === activeId) || null;

  function onDragStart(e: DragStartEvent) {
    dragSnapshot.current = tasks;
    setActiveId(String(e.active.id));
  }

  // Live-reorders `tasks` as the pointer moves — across columns (status
  // changes) and within a column (position in the flat list changes). The
  // column lists are just filters over this one array, so moving an item's
  // spot here is what makes cards slide out of the way in real time instead
  // of jumping only once the drag ends.
  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    setTasks((prev) => {
      const activeTask = prev.find((t) => t.id === activeId);
      if (!activeTask) return prev;

      if (isColumnId(overId)) {
        if (activeTask.status === overId) return prev;
        const without = prev.filter((t) => t.id !== activeId);
        let insertAt = without.length;
        for (let i = without.length - 1; i >= 0; i--) {
          if (without[i].status === overId) {
            insertAt = i + 1;
            break;
          }
        }
        const moved = { ...activeTask, status: overId };
        return [...without.slice(0, insertAt), moved, ...without.slice(insertAt)];
      }

      const overTask = prev.find((t) => t.id === overId);
      if (!overTask) return prev;
      if (overTask.status === "pending_approval" && activeTask.status !== "pending_approval") {
        return prev; // no dropping onto a pending-approval card either
      }
      const without = prev.filter((t) => t.id !== activeId);
      const overIndex = without.findIndex((t) => t.id === overId);
      const moved =
        activeTask.status === overTask.status
          ? activeTask
          : { ...activeTask, status: overTask.status };
      return [...without.slice(0, overIndex), moved, ...without.slice(overIndex)];
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const before = dragSnapshot.current;
    dragSnapshot.current = null;
    const id = String(e.active.id);
    if (!before) return;

    // Dropped outside any column — undo the live reorder from onDragOver.
    if (!e.over) {
      setTasks(before);
      return;
    }

    const originalTask = before.find((t) => t.id === id);
    const task = tasks.find((t) => t.id === id);
    if (task) setExpanded((prev) => new Set(prev).add(task.status));
    if (!originalTask || !task || !canEditTask(profile, task)) {
      setTasks(before);
      return;
    }

    // Fractional position between the new neighbors keeps this an O(1)
    // write — no need to renumber the rest of the column.
    const column = tasks.filter((t) => t.status === task.status);
    const idx = column.findIndex((t) => t.id === id);
    const prevItem = column[idx - 1];
    const nextItem = column[idx + 1];
    const position =
      prevItem && nextItem
        ? (prevItem.position + nextItem.position) / 2
        : prevItem
        ? prevItem.position + 1
        : nextItem
        ? nextItem.position - 1
        : Date.now();

    if (task.status === originalTask.status && position === originalTask.position) {
      return; // dropped back where it started
    }

    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, position } : t)));

    const res = await moveTask(id, task.status, position);
    if (res?.error) {
      setTasks(before);
      toastErr(res.error);
    } else if (res?.task && res.task.status !== task.status) {
      // The server redirected the status (e.g. done -> pending_approval
      // because parts were attached) — reconcile so the card lands in the
      // column it actually ended up in, not the one it was dropped on.
      upsertLocal(res.task);
    }
  }

  function onDragCancel() {
    setActiveId(null);
    if (dragSnapshot.current) setTasks(dragSnapshot.current);
    dragSnapshot.current = null;
  }

  // Same persistence path as a drag drop (fractional position), but for the
  // mobile "Move to…" sheet: always lands at the end of the target column.
  async function onQuickMove(task: Task, newStatus: TaskStatus) {
    if (task.status === newStatus || !canEditTask(profile, task)) return;
    const before = tasks;
    const column = tasks.filter((t) => t.status === newStatus);
    const last = column[column.length - 1];
    const position = last ? last.position + 1 : Date.now();

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus, position } : t))
    );
    const res = await moveTask(task.id, newStatus, position);
    if (res?.error) {
      setTasks(before);
      toastErr(res.error);
    } else if (res?.task && res.task.status !== newStatus) {
      upsertLocal(res.task);
    }
  }

  function upsertLocal(task: Task) {
    setTasks((prev) => {
      const exists = prev.some((t) => t.id === task.id);
      return exists
        ? prev.map((t) => (t.id === task.id ? task : t))
        : [...prev, task];
    });
  }

  function removeLocal(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function openNew(status: TaskStatus = "todo") {
    setModal({ open: true, task: null, status });
  }

  const canApprove = isManager(profile);

  async function approveTask(task: Task) {
    const res = await moveTask(task.id, "done", Date.now());
    if (res?.error) return toastErr(res.error);
    if (res?.task) upsertLocal(res.task);
  }

  async function sendBackTask(task: Task) {
    const res = await moveTask(task.id, "in_progress", Date.now());
    if (res?.error) return toastErr(res.error);
    if (res?.task) upsertLocal(res.task);
  }

  const cardProps = {
    canApprove,
    onApproveTask: approveTask,
    onSendBackTask: sendBackTask,
  };

  // Whole-team figures for the summary band + list rail. Always computed from
  // every task, not the filtered view, so the progress number doesn't jump
  // around while someone is searching.
  const total = tasks.length;
  const counts = useMemo(() => {
    const c: Record<TaskStatus, number> = {
      todo: 0,
      in_progress: 0,
      pending_approval: 0,
      done: 0,
      stuck: 0,
    };
    for (const tk of tasks) c[tk.status]++;
    return c;
  }, [tasks]);
  const pct = total > 0 ? Math.round((counts.done / total) * 100) : 0;

  const mineTasks = useMemo(
    () => tasks.filter((tk) => tk.assignees.some((a) => a.id === profile.id)),
    [tasks, profile.id]
  );
  const mineOpen = mineTasks.filter((tk) => tk.status !== "done").length;
  const mineHigh = mineTasks.filter((tk) => tk.status !== "done" && tk.priority === "high").length;
  const stuckSub = counts.stuck > 0 ? tasks.find((tk) => tk.status === "stuck")?.title ?? "" : "";
  const highCount = tasks.filter((tk) => tk.priority === "high").length;

  const openByPerson = useMemo(() => {
    const m = new Map<string, number>();
    for (const tk of tasks) {
      if (tk.status === "done") continue;
      for (const a of tk.assignees) m.set(a.id, (m.get(a.id) ?? 0) + 1);
    }
    return engineers
      .map((e) => ({ person: e, n: m.get(e.id) ?? 0 }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);
  }, [tasks, engineers]);

  const filterChips: { id: TaskFilter; label: string }[] = [
    { id: "all", label: t("tasks.filterAll") },
    { id: "mine", label: t("tasks.filterMine") },
    { id: "high", label: t("tasks.filterHigh") },
  ];

  const empty = visible.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {olderDoneHidden > 0 && (
        <p className="text-xs text-ink-muted">
          {t("tasks.olderHidden").replace("{n}", String(olderDoneHidden)).replace("{d}", String(doneWindowDays))}{" "}
          <a href="/tasks?all=1" className="font-semibold text-brand-600">
            {t("tasks.showAllDone")}
          </a>
        </p>
      )}

      {/* Header: title · view tabs · search · create */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">
            {t("nav.tasks")}
          </h1>
          <span className="text-[13px] text-ink-muted">
            {total} {t("tasks.subtitle")}
          </span>
        </div>

        <div role="tablist" className="flex gap-[3px] rounded-xl bg-surface p-1">
          {(["board", "list"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`flex h-9 items-center gap-1.5 rounded-[9px] px-3.5 text-[13px] transition ${
                view === v
                  ? "bg-brand-800 font-semibold text-white"
                  : "font-medium text-ink-muted hover:text-ink"
              }`}
            >
              {v === "board" ? <BoardIcon className="h-4 w-4" /> : <ListIcon className="h-4 w-4" />}
              {t(v === "board" ? "task.viewBoard" : "task.viewList")}
            </button>
          ))}
        </div>

        <label className="flex h-11 items-center gap-2 rounded-xl bg-surface px-3.5 text-[13px] text-ink-faint">
          <SearchIcon className="h-4 w-4 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("tasks.search")}
            aria-label={t("tasks.search")}
            className="w-32 bg-transparent text-ink outline-none placeholder:text-ink-faint sm:w-44"
          />
        </label>

        <PageTools />

        <button
          className="hidden h-11 items-center gap-2 rounded-xl bg-ink px-[18px] text-sm font-semibold text-surface transition hover:opacity-90 md:inline-flex"
          onClick={() => openNew()}
        >
          <PlusIcon className="h-4 w-4" />
          {t("task.create")}
        </button>
      </div>

      <Fab onClick={() => openNew()} label={t("task.create")} />

      {/* Stat cards */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card col-span-2 flex flex-col p-4 md:col-span-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-2xl font-bold tabular-nums text-ink">{pct}%</div>
              <div className="mt-0.5 text-sm font-medium text-ink">{t("tasks.done")}</div>
            </div>
            <div className="flex items-center pt-0.5">
              {engineers.slice(0, 4).map((p, i) => (
                <span key={p.id} className={`rounded-full ring-2 ring-surface ${i > 0 ? "-ml-1.5" : ""}`}>
                  <Avatar id={p.id} name={p.full_name || p.first_name} size={24} />
                </span>
              ))}
            </div>
          </div>
          <div className="mt-1 text-xs text-ink-muted">
            {counts.done} {t("tasks.ofTasks")} {total} {t("tasks.tasksWord")}
          </div>
          <div className="mt-2.5 flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-surface-soft">
            {TASK_STATUSES.map((s2) =>
              counts[s2.key] > 0 ? (
                <span
                  key={s2.key}
                  style={{
                    width: `${(counts[s2.key] / Math.max(total, 1)) * 100}%`,
                    background: `rgb(var(${STATUS_VAR[s2.key]}))`,
                  }}
                />
              ) : null
            )}
          </div>
        </div>
        <StatCard
          value={counts.todo + counts.in_progress}
          label={t("tasks.openTasks")}
          sub={[
            `${counts.todo} ${t(statusKey("todo")).toLowerCase()}`,
            `${counts.in_progress} ${t(statusKey("in_progress")).toLowerCase()}`,
            counts.pending_approval > 0 ? `${counts.pending_approval} ${t(statusKey("pending_approval")).toLowerCase()}` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <StatCard
          value={counts.stuck}
          label={t(statusKey("stuck"))}
          tone="--tone-stuck"
          sub={stuckSub}
        />
        <StatCard
          value={mineOpen}
          label={t("tasks.mineOpen")}
          sub={mineHigh > 0 ? `${mineHigh} ${t("tasks.highSub")}` : ""}
          active={filter === "mine"}
          onClick={() => setFilter(filter === "mine" ? "all" : "mine")}
          className="col-span-2 md:col-span-1"
        />
      </section>

      {/* Filters */}
      <div role="tablist" className="seg max-w-full self-start overflow-x-auto">
        {filterChips.map((f) => {
          const n = f.id === "all" ? total : f.id === "mine" ? mineTasks.length : highCount;
          return (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`seg-btn whitespace-nowrap ${filter === f.id ? "seg-btn-on" : ""}`}
            >
              {f.label}
              <span className="text-xs font-normal text-ink-faint">{n}</span>
            </button>
          );
        })}
      </div>

      {view === "board" ? (
        <>
          {/* One board at every size: five columns on desktop (draggable),
              swipeable snap-scrolling columns on phones (cards move via the
              ⋯ menu instead). */}
          <div>
            <DndContext
              // Explicit id: without one dnd-kit derives its a11y ids from a
              // render counter that differs between the server and the client,
              // and the resulting hydration mismatch makes React discard and
              // re-render the whole board on load.
              id="task-board"
              sensors={sensors}
              collisionDetection={closestCorners}
              measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              onDragCancel={onDragCancel}
            >
              <div className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                <div className="snap-x flex items-start gap-3 md:grid md:min-w-[1180px] md:grid-cols-5">
                  {TASK_STATUSES.map((col) => (
                    <div
                      key={col.key}
                      className="w-[82vw] max-w-xs shrink-0 snap-start md:w-auto md:max-w-none"
                    >
                    <Column
                      status={col.key}
                      label={t(statusKey(col.key))}
                      tasks={byStatus[col.key]}
                      profile={profile}
                      draggableDesktop={isDesktop}
                      activeId={activeId}
                      expanded={expanded.has(col.key) || hasFilter}
                      onExpand={() =>
                        setExpanded((prev) => new Set(prev).add(col.key))
                      }
                      onOpen={(task) => setModal({ open: true, task, status: col.key })}
                      onNew={() => openNew(col.key)}
                      onMenu={(task) => setActionSheet({ task, mode: "menu" })}
                      {...cardProps}
                    />
                    </div>
                  ))}
                </div>
              </div>
              {/* Portalled to <body> on purpose. DragOverlay is position:fixed,
                  and the app shell wraps page content in a `.glass-strong` panel
                  whose backdrop-filter makes it the containing block for fixed
                  descendants — so the dragged card was positioned relative to that
                  panel and floated away from the cursor by the sidebar width and
                  header height. Same root cause as the modal fix. */}
              {mounted &&
                createPortal(
                  <DragOverlay dropAnimation={dropAnimation}>
                    {activeTask ? <CardBody task={activeTask} lifted {...cardProps} /> : null}
                  </DragOverlay>,
                  document.body
                )}
            </DndContext>
          </div>

        </>
      ) : (
        <ListView
          byStatus={byStatus}
          counts={counts}
          total={total}
          pct={pct}
          empty={empty}
          openByPerson={openByPerson}
          onOpen={(task) => setModal({ open: true, task, status: task.status })}
          labelFor={(s) => t(statusKey(s))}
        />
      )}

      {actionSheet && (
        <MobileActionSheet
          task={actionSheet.task}
          mode={actionSheet.mode}
          editable={canEditTask(profile, actionSheet.task)}
          onEdit={() => {
            const task = actionSheet.task;
            setActionSheet(null);
            setModal({ open: true, task, status: task.status });
          }}
          onPickMove={() => setActionSheet((s) => (s ? { ...s, mode: "move" } : s))}
          onBack={() => setActionSheet((s) => (s ? { ...s, mode: "menu" } : s))}
          onMove={(status) => {
            onQuickMove(actionSheet.task, status);
            setActionSheet(null);
          }}
          onClose={() => setActionSheet(null)}
        />
      )}

      {modal.open && (
        <TaskModal
          profile={profile}
          engineers={engineers}
          customers={customers}
          companies={companies}
          cities={cities}
          models={models}
          customerMachines={customerMachines}
          task={modal.task}
          initialStatus={modal.status}
          onClose={() => setModal({ open: false, task: null, status: "todo" })}
          onSaved={(t) => {
            upsertLocal(t);
            setModal({ open: false, task: null, status: "todo" });
          }}
          // A create keeps the modal open (so Properties / Parts used /
          // Activity can be filled in straight away), so the board just takes
          // the new card and leaves the dialog alone.
          onCreated={(t) => upsertLocal(t)}
          onDeleted={(id) => {
            removeLocal(id);
            setModal({ open: false, task: null, status: "todo" });
          }}
        />
      )}
    </div>
  );
}

type CardExtras = {
  canApprove: boolean;
  onApproveTask: (task: Task) => void;
  onSendBackTask: (task: Task) => void;
};

// How many cards a column shows before "Show more". Done grows without bound,
// so an unlimited column would push every other column's cards off screen.
const COLUMN_LIMIT = 8;

const PRIORITY_VAR: Record<Task["priority"], string> = {
  low: "--tone-done",
  medium: "--tone-warn",
  high: "--tone-stuck",
};

// Soft tinted pill. Built from the --tone tokens so it follows dark mode.
function PriorityPill({ priority }: { priority: Task["priority"] }) {
  const t = useT();
  return (
    <span
      className="shrink-0 text-xs font-semibold"
      style={{ color: `rgb(var(${PRIORITY_VAR[priority]}-ink))` }}
    >
      {t(priorityKey(priority))}
    </span>
  );
}

function Column({
  status,
  label,
  tasks,
  profile,
  draggableDesktop,
  activeId,
  expanded,
  onExpand,
  onOpen,
  onNew,
  onMenu,
  ...extras
}: {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  profile: Profile;
  draggableDesktop: boolean;
  activeId: string | null;
  expanded: boolean;
  onExpand: () => void;
  onOpen: (t: Task) => void;
  onNew: () => void;
  onMenu: (t: Task) => void;
} & CardExtras) {
  // Nothing is ever created directly into the review column — a task only
  // arrives there via the completion gate.
  const canCreateHere = status !== "pending_approval";
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const tint = STATUS_VAR[status];
  // The dragged card stays rendered even when it sits past the limit, or it
  // would vanish mid-drag the moment it crossed into a long column.
  const shown = expanded
    ? tasks
    : tasks.filter((c, i) => i < COLUMN_LIMIT || c.id === activeId);
  const hidden = tasks.length - shown.length;
  const taskIds = useMemo(() => shown.map((c) => c.id), [shown]);

  return (
    <section
      aria-label={label}
      ref={setNodeRef}
      style={{
        background: isOver ? `rgb(var(${tint}) / 0.1)` : "transparent",
        borderColor: isOver ? `rgb(var(${tint}) / 0.45)` : "rgb(var(--ink) / 0.12)",
      }}
      // Only background transitions — never `transform` — so it can't fight the
      // drag transform dnd-kit applies to the cards inside.
      className="flex min-h-[160px] flex-col gap-2 rounded-[20px] border-[1.5px] p-2.5 transition-[background-color,border-color] duration-150"
    >
      <div className="flex items-center gap-2 px-1.5 pb-1.5 pt-1">
        <span
          className="h-[9px] w-[9px] rounded-full"
          style={{ background: `rgb(var(${tint}))` }}
        />
        <span className="flex-1 truncate text-[13px] font-semibold text-ink">{label}</span>
        <span className="rounded-full bg-surface px-2 py-px text-xs font-semibold text-ink-muted">
          {tasks.length}
        </span>
        {canCreateHere && (
          <button
            onClick={onNew}
            aria-label={`New task in ${label}`}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-ink-muted transition hover:bg-surface hover:text-ink"
          >
            <PlusIcon className="h-[15px] w-[15px]" />
          </button>
        )}
      </div>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        {shown.map((card) => (
          <SortableCard
            key={card.id}
            task={card}
            draggable={draggableDesktop && canEditTask(profile, card)}
            onOpen={onOpen}
            onMenu={onMenu}
            {...extras}
          />
        ))}
      </SortableContext>

      {tasks.length === 0 && (
        <button
          onClick={canCreateHere ? onNew : undefined}
          className="rounded-[14px] border-[1.5px] border-dashed border-surface-border px-5 py-5 text-center text-xs text-ink-muted transition hover:border-ink-faint"
        >
          {canCreateHere ? t("task.addToColumn") : t("tasks.emptyColumn")}
        </button>
      )}

      {hidden > 0 && (
        <button
          onClick={onExpand}
          className="py-2 text-center text-xs font-semibold text-brand-600"
        >
          {t("tasks.showMore")} ({hidden})
        </button>
      )}
    </section>
  );
}

function SortableCard({
  task,
  draggable,
  onOpen,
  onMenu,
  ...extras
}: {
  task: Task;
  draggable: boolean;
  onOpen: (t: Task) => void;
  onMenu: (t: Task) => void;
} & CardExtras) {
  const { attributes, listeners, setNodeRef, isDragging, transform, transition } =
    useSortable({ id: task.id, disabled: !draggable });

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      onClick={() => onOpen(task)}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      // touch-none only while actually draggable — on mobile (not
      // draggable) it would block normal vertical scrolling over cards.
      className={`cursor-pointer ${draggable ? "touch-none" : ""} ${isDragging ? "opacity-0" : ""}`}
    >
      <CardBody task={task} onMenu={() => onMenu(task)} {...extras} />
    </div>
  );
}

// Overlapping avatar stack + first names, as in the design. Past three people
// the names stop fitting a column, so only the stack shows.
function Assignees({ people, size = 26 }: { people: AssigneeLite[]; size?: number }) {
  const t = useT();
  if (people.length === 0)
    return <span className="text-xs text-ink-faint">{t("task.unassigned")}</span>;
  const names = people.map((p) => p.first_name || p.full_name).join(", ");
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex shrink-0 items-center pr-[4px]">
        {people.slice(0, 3).map((p) => (
          <span key={p.id} className="-mr-[4px] rounded-full ring-2 ring-surface">
            <Avatar id={p.id} name={p.full_name || p.first_name} size={size} />
          </span>
        ))}
      </span>
      {people.length <= 3 && (
        <span className="truncate text-xs text-ink-muted">{names}</span>
      )}
    </span>
  );
}

// Title, who it's on, and priority — everything else about a task lives one
// click away in the modal, so a column stays scannable at a glance.
function CardBody({
  task,
  canApprove,
  onApproveTask,
  onSendBackTask,
  lifted = false,
  roomy = false,
  onMenu,
}: {
  task: Task;
  lifted?: boolean;
  roomy?: boolean;
  onMenu?: () => void;
} & Pick<CardExtras, "canApprove" | "onApproveTask" | "onSendBackTask">) {
  const t = useT();
  const pending = task.status === "pending_approval";
  const isDone = task.status === "done";

  return (
    <article
      className={`relative flex flex-col gap-3 border border-[rgb(var(--ink)/0.07)] bg-surface shadow-card transition-shadow ${
        roomy ? "rounded-[20px] p-4" : "rounded-[16px] p-3.5"
      } ${lifted ? "shadow-pop" : "hover:shadow-pop"} ${isDone && !lifted ? "opacity-80" : ""}`}
    >
      <div className="flex items-start gap-2">
        <p
          className={`line-clamp-2 flex-1 font-semibold leading-snug text-ink ${
            roomy ? "text-[15px]" : "text-sm"
          }`}
        >
          {task.title}
        </p>
        {isDone && (
          <span
            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
            style={{ background: "rgb(var(--tone-done) / 0.16)", color: "rgb(var(--tone-done-ink))" }}
          >
            <CheckIcon className="h-3 w-3" />
          </span>
        )}
        {/* Mobile only — desktop uses drag-and-drop to change columns, so the
            menu would be a redundant control there. */}
        {onMenu && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMenu();
            }}
            aria-label="Task options"
            className="icon-btn -mr-1 -mt-1 h-7 w-7 shrink-0 md:hidden"
          >
            <DotsIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Assignees people={task.assignees} size={roomy ? 28 : 26} />
        <PriorityPill priority={task.priority} />
      </div>

      {pending && (
        <div className="border-t border-surface-border pt-2.5">
          <p className="text-[11px] leading-snug text-ink-faint">
            {t("task.pendingApprovalBanner")}
          </p>
          {canApprove && (
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onApproveTask(task);
                }}
                className="btn-primary h-7 flex-1 px-2 text-xs"
              >
                {t("task.approveCompletion")}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSendBackTask(task);
                }}
                className="btn-ghost h-7 flex-1 px-2 text-xs"
              >
                {t("task.sendBack")}
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// Group order in the list: what needs attention first, finished work last.
const LIST_ORDER: TaskStatus[] = ["stuck", "in_progress", "todo", "pending_approval", "done"];

function ListView({
  byStatus,
  counts,
  total,
  pct,
  empty,
  openByPerson,
  onOpen,
  labelFor,
}: {
  byStatus: Record<TaskStatus, Task[]>;
  counts: Record<TaskStatus, number>;
  total: number;
  pct: number;
  empty: boolean;
  openByPerson: { person: Engineer; n: number }[];
  onOpen: (t: Task) => void;
  labelFor: (s: TaskStatus) => string;
}) {
  const t = useT();
  // Finished work starts folded away — it is the long tail.
  const [closed, setClosed] = useState<Set<TaskStatus>>(() => new Set(["done"]));
  const toggle = (s: TaskStatus) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  const maxOpen = Math.max(1, ...openByPerson.map((x) => x.n));

  return (
    <div className="flex flex-wrap items-start gap-4">
      <section
        aria-label="Task list"
        className="min-w-0 flex-[999_1_600px] overflow-hidden rounded-[22px] bg-surface"
      >
        {/* Desktop column header */}
        <div className="hidden grid-cols-[minmax(0,1fr)_190px_100px] gap-3.5 border-b border-surface-border px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted md:grid">
          <span>{t("tasks.colTask")}</span>
          <span>{t("tasks.colAssigned")}</span>
          <span>{t("tasks.colPriority")}</span>
        </div>

        {empty && (
          <div className="px-5 py-10 text-center text-sm text-ink-muted">{t("tasks.noMatch")}</div>
        )}

        {!empty &&
          LIST_ORDER.map((s) => {
            const rows = byStatus[s];
            const open = !closed.has(s);
            const tint = STATUS_VAR[s];
            return (
              <div key={s} className="border-b border-surface-border last:border-b-0">
                <button
                  aria-expanded={open}
                  onClick={() => toggle(s)}
                  className="flex h-[52px] w-full items-center gap-2.5 bg-surface-soft/60 px-4 text-left md:h-[46px] md:px-5"
                >
                  <ChevronRightIcon
                    className={`h-3.5 w-3.5 text-ink-muted transition-transform ${open ? "rotate-90" : ""}`}
                  />
                  <span
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-xs font-semibold"
                    style={{
                      background: `rgb(var(${tint}) / 0.14)`,
                      color: `rgb(var(${tint}-ink))`,
                    }}
                  >
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: `rgb(var(${tint}))` }} />
                    {labelFor(s)}
                  </span>
                  <span className="text-xs text-ink-muted">{rows.length}</span>
                </button>

                {open && rows.length === 0 && (
                  <div className="px-5 py-4 text-[13px] text-ink-muted md:pl-11">
                    {t("tasks.emptyColumn")}
                  </div>
                )}

                {open &&
                  rows.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => onOpen(task)}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1.5 border-t border-surface-border px-4 py-3 text-left transition hover:bg-surface-soft md:grid-cols-[minmax(0,1fr)_190px_100px] md:py-2.5 md:pl-11 md:pr-5"
                    >
                      <span
                        className={`truncate text-sm font-medium ${
                          s === "done" ? "text-ink-muted" : "text-ink"
                        }`}
                      >
                        {task.title}
                      </span>
                      <span className="col-start-1 row-start-2 min-w-0 md:col-start-auto md:row-start-auto">
                        <Assignees people={task.assignees} size={26} />
                      </span>
                      <span className="col-start-2 row-span-2 row-start-1 justify-self-end md:col-start-auto md:row-span-1 md:row-start-auto md:justify-self-start">
                        <PriorityPill priority={task.priority} />
                      </span>
                    </button>
                  ))}
              </div>
            );
          })}
      </section>

      {/* Right rail (desktop) */}
      <aside className="hidden min-w-0 max-w-[340px] flex-[1_1_280px] flex-col gap-3.5 lg:flex">
        <section className="flex flex-col gap-3.5 rounded-[22px] bg-brand-800 p-5 text-white">
          <span className="text-[13px] font-semibold text-brand-200">{t("tasks.teamProgress")}</span>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold leading-[0.9] tracking-tight">{counts.done}</span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{t("tasks.done")}</span>
              <span className="text-xs text-brand-200">
                {t("tasks.ofTasks")} {total} {t("tasks.tasksWord")} · {pct}%
              </span>
            </span>
          </div>
          <div className="h-2 rounded bg-white/15">
            <div className="h-2 rounded bg-brand-300" style={{ width: `${pct}%` }} />
          </div>
        </section>

        <section className="flex flex-col gap-3.5 rounded-[22px] bg-surface p-[18px]">
          <span className="text-sm font-semibold text-ink">{t("tasks.openByPerson")}</span>
          {openByPerson.map(({ person, n }) => (
            <div key={person.id} className="flex items-center gap-2.5">
              <Avatar id={person.id} name={person.full_name || person.first_name} size={30} />
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-ink">{person.first_name || person.full_name}</span>
                  <span className="font-semibold text-ink">{n}</span>
                </div>
                <div className="h-1.5 rounded-[3px] bg-surface-soft">
                  <div
                    className="h-1.5 rounded-[3px] bg-brand-800"
                    style={{ width: `${Math.round((n / maxOpen) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </section>
      </aside>
    </div>
  );
}
// Status dot used in the mobile action sheet.
function StatusDot({ status }: { status: TaskStatus }) {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: `rgb(var(${STATUS_VAR[status]}))` }}
    />
  );
}

// Mobile "⋯" card menu: edit, or move to another column. Replaces the
// drag-and-drop column change on phones (see useIsDesktop above).
function MobileActionSheet({
  task,
  mode,
  editable,
  onEdit,
  onPickMove,
  onBack,
  onMove,
  onClose,
}: {
  task: Task;
  mode: "menu" | "move";
  editable: boolean;
  onEdit: () => void;
  onPickMove: () => void;
  onBack: () => void;
  onMove: (status: TaskStatus) => void;
  onClose: () => void;
}) {
  const t = useT();
  // Same rule as desktop drag-and-drop: Pending approval isn't a manual
  // destination, only something the completion gate puts a task into.
  const otherStatuses = TASK_STATUSES.filter(
    (s) => s.key !== task.status && s.key !== "pending_approval"
  );
  const itemClass =
    "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-ink hover:bg-surface-soft";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden">
      <div className="animate-overlay absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        className="glass glass-strong animate-window relative z-10 w-full rounded-t-3xl p-2"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="sheet-handle mx-auto my-2" />
        <p className="truncate px-3 pb-2 text-sm font-semibold text-ink">{task.title}</p>
        {mode === "menu" ? (
          <div className="space-y-0.5">
            <button onClick={onEdit} className={itemClass}>
              Edit task
            </button>
            {editable && (
              <button onClick={onPickMove} className={itemClass}>
                Move to…
              </button>
            )}
            <button onClick={onClose} className={`${itemClass} text-ink-faint`}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="space-y-0.5">
            {otherStatuses.map((s) => (
              <button key={s.key} onClick={() => onMove(s.key)} className={itemClass}>
                <StatusDot status={s.key} />
                {t(statusKey(s.key))}
              </button>
            ))}
            <button onClick={onBack} className={`${itemClass} text-ink-faint`}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* --- inline icons --- */
function BoardIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="4" width="7" height="16" rx="1.5" />
      <rect x="14" y="4" width="7" height="10" rx="1.5" />
    </svg>
  );
}
function ListIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...p}>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </svg>
  );
}
function PlusIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function DotsIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}
function SearchIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}
function CheckIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}
function ChevronRightIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
