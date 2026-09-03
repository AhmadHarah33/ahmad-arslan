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
import { PriorityChip, STATUS_TONE } from "@/components/ui";
import { STATUS_VAR, TASK_STATUSES } from "@/lib/types";
import { useT } from "@/lib/i18n/provider";
import { statusKey } from "@/lib/i18n/task-keys";
import type { AssigneeLite, Customer, Profile, Task, TaskStatus } from "@/lib/types";
import { canEditTask, isManager } from "@/lib/permissions";
import { moveTask } from "@/app/(app)/tasks/actions";
import type { FieldDefinition } from "@/lib/customFields";
import FieldValue from "@/components/fields/FieldValue";
import { Avatar, AvatarGroup } from "@/components/avatar";
import { dueStatus, formatDateShort } from "@/lib/dates";
import TaskModal from "./task-modal";
import { toastErr } from "@/lib/toast";

type Engineer = Profile;
type CustomerLite = Pick<Customer, "id" | "name">;
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

// Render up to `max` tag-style custom fields (select/multi-select) as chips.
function TaskTags({
  taskId,
  defs,
  values,
  max = 3,
}: {
  taskId: string;
  defs: FieldDefinition[];
  values: ValueMap;
  max?: number;
}) {
  const recVals = values[taskId];
  if (!recVals) return null;
  const tagDefs = defs.filter(
    (d) => d.field_type === "select" || d.field_type === "multi_select"
  );
  const chips = tagDefs
    .filter((d) => recVals[d.id] != null && recVals[d.id] !== "")
    .slice(0, max)
    .map((d) => <FieldValue key={d.id} def={d} value={recVals[d.id]} />);
  if (chips.length === 0) return null;
  return <div className="mt-2 flex flex-wrap gap-1">{chips}</div>;
}

export default function TasksBoard({
  openNewOnMount = false,
  profile,
  initialTasks,
  engineers,
  customers,
  fieldDefs,
  fieldValues,
  commentCounts,
}: {
  // Dashboard "New task" quick action links to /tasks?new=1.
  openNewOnMount?: boolean;
  profile: Profile;
  initialTasks: Task[];
  engineers: Engineer[];
  customers: CustomerLite[];
  fieldDefs: FieldDefinition[];
  fieldValues: ValueMap;
  commentCounts: CountMap;
}) {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [view, setView] = useState<"board" | "list">("board");
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

  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      pending_approval: [],
      done: [],
      stuck: [],
    };
    for (const t of tasks) map[t.status].push(t);
    return map;
  }, [tasks]);

  // Customer name shown as the card's subtitle.
  const customerName = useMemo(() => {
    const m = new Map(customers.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) ?? "" : "");
  }, [customers]);

  // Attachments live in `files`-type custom fields, already loaded with the page.
  const attachmentCount = useMemo(() => {
    const fileDefs = fieldDefs.filter((d) => d.field_type === "files");
    return (taskId: string) => {
      const vals = fieldValues[taskId];
      if (!vals) return 0;
      return fileDefs.reduce((n, d) => {
        const v = vals[d.id];
        return n + (Array.isArray(v) ? v.length : 0);
      }, 0);
    };
  }, [fieldDefs, fieldValues]);

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
    customerName,
    attachmentCount,
    commentCounts,
    canApprove,
    onApproveTask: approveTask,
    onSendBackTask: sendBackTask,
  };

  return (
    <div>
      {/* Toolbar: view switcher + primary action */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="seg">
          <button
            onClick={() => setView("board")}
            className={`seg-btn ${view === "board" ? "seg-btn-on" : ""}`}
          >
            <BoardIcon className="h-4 w-4" />
            {t("task.viewBoard")}
          </button>
          <button
            onClick={() => setView("list")}
            className={`seg-btn ${view === "list" ? "seg-btn-on" : ""}`}
          >
            <ListIcon className="h-4 w-4" />
            {t("task.viewList")}
          </button>
        </div>
        <button
          className="btn-primary hidden md:inline-flex"
          onClick={() => openNew()}
        >
          <PlusIcon className="h-4 w-4" />
          {t("task.create")}
        </button>
      </div>

      {view === "board" ? (
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
          {/* Columns scroll sideways until there's room for all five. */}
          <div className="no-scrollbar snap-x flex items-start gap-3 overflow-x-auto pb-2 xl:grid xl:grid-cols-5 xl:gap-4 xl:overflow-visible xl:pb-0">
            {TASK_STATUSES.map((col) => (
              <div
                key={col.key}
                className="w-[82vw] max-w-xs shrink-0 snap-start sm:w-72 xl:w-auto xl:max-w-none xl:shrink"
              >
                <Column
                  status={col.key}
                  label={t(statusKey(col.key))}
                  tasks={byStatus[col.key]}
                  profile={profile}
                  draggableDesktop={isDesktop}
                  onOpen={(task) => setModal({ open: true, task, status: col.key })}
                  onNew={() => openNew(col.key)}
                  onMenu={(task) => setActionSheet({ task, mode: "menu" })}
                  {...cardProps}
                />
              </div>
            ))}
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
      ) : (
        <ListView
          tasks={tasks}
          fieldDefs={fieldDefs}
          fieldValues={fieldValues}
          onOpen={(task) => setModal({ open: true, task, status: task.status })}
          {...cardProps}
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

// Shared card-rendering helpers passed down from the board.
type CardExtras = {
  customerName: (id: string | null) => string;
  attachmentCount: (taskId: string) => number;
  commentCounts: CountMap;
  canApprove: boolean;
  onApproveTask: (task: Task) => void;
  onSendBackTask: (task: Task) => void;
};

// Status dot used in the column header and the list view.
function StatusDot({ status, className = "" }: { status: TaskStatus; className?: string }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${className}`}
      style={{ background: `rgb(var(${STATUS_VAR[status]}))` }}
    />
  );
}

function Column({
  status,
  label,
  tasks,
  profile,
  draggableDesktop,
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
  onOpen: (t: Task) => void;
  onNew: () => void;
  onMenu: (t: Task) => void;
} & CardExtras) {
  // Nothing is ever created directly into the review column — a task only
  // arrives there via the completion gate.
  const canCreateHere = status !== "pending_approval";
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [menu, setMenu] = useState(false);
  const tint = STATUS_VAR[status];
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);

  return (
    <div className="w-full">
      {/* z-20 lifts the header (and its menu) above the cards below. */}
      <div className="relative z-20 mb-2 flex items-center gap-2 px-1">
        <span className={`chip ${STATUS_TONE[status]}`}>
          <StatusDot status={status} />
          {label}
        </span>
        <span className="text-xs font-medium text-ink-faint">{tasks.length}</span>

        {canCreateHere && (
          <button
            onClick={() => setMenu((v) => !v)}
            aria-label={`${label} options`}
            className="icon-btn ml-auto h-7 w-7"
          >
            <DotsIcon className="h-4 w-4" />
          </button>
        )}
        {canCreateHere && (
          <button
            onClick={onNew}
            aria-label={`New task in ${label}`}
            className="icon-btn h-7 w-7"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        )}

        {menu && canCreateHere && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenu(false)}
              aria-hidden="true"
            />
            <div className="card animate-pop absolute right-0 top-9 z-20 w-44 p-1">
              <button
                onClick={() => {
                  setMenu(false);
                  onNew();
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-surface-soft"
              >
                <PlusIcon className="h-4 w-4" />
                New task here
              </button>
            </div>
          </>
        )}
      </div>

      {/* Faint wash in the column's own hue groups its cards and gives the
          drop target an obvious edge; it deepens while dragging over it.
          Only background/ring transition — never `transform` — so it can't
          fight the drag transform dnd-kit applies to the cards inside. */}
      <div
        ref={setNodeRef}
        style={{ background: `rgb(var(${tint}) / ${isOver ? 0.14 : 0.05})` }}
        className={`min-h-[140px] space-y-2.5 rounded-2xl p-2.5 transition-[background-color,box-shadow] duration-150 ${
          isOver ? "ring-1" : "ring-0"
        }`}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((card) => (
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
            onClick={onNew}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-surface-border py-6 text-xs font-medium text-ink-faint transition hover:border-ink-faint hover:text-ink-muted"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {t("task.addToColumn")}
          </button>
        )}
      </div>
    </div>
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

// Assignees as avatar + first name, the way the reference board reads them —
// a bare initials circle makes you hover every card to find out whose it is.
// Past two people the names stop fitting a column, so it falls back to the
// overlapping stack.
function Assignees({ people }: { people: AssigneeLite[] }) {
  const t = useT();
  if (people.length === 0)
    return <span className="text-xs text-ink-faint">{t("task.unassigned")}</span>;
  if (people.length > 2) return <AvatarGroup people={people} size={20} max={4} />;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {people.map((p) => (
        <span key={p.id} className="flex min-w-0 items-center gap-1">
          <Avatar id={p.id} name={p.full_name || p.first_name} size={20} />
          <span className="truncate text-xs text-ink-muted">
            {p.first_name || p.full_name}
          </span>
        </span>
      ))}
    </div>
  );
}

// Deliberately minimal: title, who it's on, and priority. Everything else
// about a task — customer, due date, tags, attachments, comments — lives one
// click away in the modal, so a column stays scannable at a glance instead of
// being a wall of badges.
function CardBody({
  task,
  canApprove,
  onApproveTask,
  onSendBackTask,
  lifted = false,
  onMenu,
}: {
  task: Task;
  lifted?: boolean;
  onMenu?: () => void;
} & Pick<CardExtras, "canApprove" | "onApproveTask" | "onSendBackTask">) {
  const t = useT();
  const pending = task.status === "pending_approval";

  return (
    <div className={`task-card relative px-4 py-3.5 ${lifted ? "shadow-pop" : "hover:shadow-card"}`}>
      {/* Mobile only — desktop uses drag-and-drop to change columns, so the
          menu would be a redundant control there. */}
      {onMenu && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMenu();
          }}
          aria-label="Task options"
          className="icon-btn absolute right-1.5 top-1.5 h-6 w-6 md:hidden"
        >
          <DotsIcon className="h-3.5 w-3.5" />
        </button>
      )}
      <p className={`line-clamp-2 text-[15px] font-medium leading-snug text-ink ${onMenu ? "pr-6" : ""}`}>
        {task.title}
      </p>

      {/* Assignees and priority sit on their own lines rather than sharing a
          row: at column width the two together would wrap unevenly, and the
          stack gives the card its landscape proportion. */}
      <div className="mt-2.5">
        <Assignees people={task.assignees} />
      </div>
      <div className="mt-2">
        <PriorityChip priority={task.priority} />
      </div>

      {pending && (
        <div className="mt-3 border-t border-surface-border pt-2.5">
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
    </div>
  );
}

// Compact due date. Plain text normally; tinted only when it needs attention.
function DueBadge({ due }: { due: string }) {
  const st = dueStatus(due);
  const label = formatDateShort(due);
  if (st === "none") {
    return (
      <span className="flex items-center gap-1" title={`Due ${label}`}>
        <CalendarIcon className="h-3.5 w-3.5" />
        {label}
      </span>
    );
  }
  return (
    <span
      className={`chip px-2 py-0.5 ${st === "overdue" ? "tone-stuck" : "tone-warn"}`}
      title={st === "overdue" ? `Overdue — was due ${label}` : `Due soon — ${label}`}
    >
      <CalendarIcon className="h-3 w-3" />
      {label}
    </span>
  );
}

function ListView({
  tasks,
  fieldDefs,
  fieldValues,
  onOpen,
  customerName,
  attachmentCount,
  commentCounts,
}: {
  tasks: Task[];
  fieldDefs: FieldDefinition[];
  fieldValues: ValueMap;
  onOpen: (t: Task) => void;
} & CardExtras) {
  if (tasks.length === 0) {
    return (
      <div className="card px-5 py-10 text-center text-sm text-ink-faint">
        No tasks yet.
      </div>
    );
  }
  return (
    <div className="card divide-y divide-surface-border overflow-hidden">
      {tasks.map((t) => {
        const files = attachmentCount(t.id);
        const comments = commentCounts[t.id] ?? 0;
        return (
          <button
            key={t.id}
            onClick={() => onOpen(t)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-soft"
          >
            <StatusDot status={t.status} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{t.title}</p>
              <p className="truncate text-xs text-ink-muted">
                {customerName(t.customer_id) || "No customer"}
              </p>
            </div>
            <div className="hidden sm:block">
              <TaskTags taskId={t.id} defs={fieldDefs} values={fieldValues} max={2} />
            </div>
            {(files > 0 || comments > 0) && (
              <div className="hidden shrink-0 items-center gap-2 text-xs text-ink-faint sm:flex">
                {files > 0 && (
                  <span className="flex items-center gap-1">
                    <ClipIcon className="h-3.5 w-3.5" />
                    {files}
                  </span>
                )}
                {comments > 0 && (
                  <span className="flex items-center gap-1">
                    <CommentIcon className="h-3.5 w-3.5" />
                    {comments}
                  </span>
                )}
              </div>
            )}
            {t.due_date && (
              <span className="hidden shrink-0 text-xs text-ink-faint md:block">
                <DueBadge due={t.due_date} />
              </span>
            )}
            <AvatarGroup people={t.assignees} size={20} max={3} />
            <PriorityChip priority={t.priority} />
          </button>
        );
      })}
    </div>
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
function CalendarIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
function ClipIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M20 11.5 12.5 19a4.5 4.5 0 0 1-6.4-6.4l7.6-7.6a3 3 0 1 1 4.3 4.3l-7.6 7.6a1.5 1.5 0 0 1-2.1-2.1l7-7" />
    </svg>
  );
}
function CommentIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6.5A8 8 0 0 1 11 4h2a8 8 0 0 1 8 8z" />
    </svg>
  );
}
