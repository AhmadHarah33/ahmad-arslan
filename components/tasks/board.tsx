"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import type { Customer, Profile, Task, TaskStatus } from "@/lib/types";
import { canEditTask } from "@/lib/permissions";
import { moveTask } from "@/app/(app)/tasks/actions";
import type { FieldDefinition } from "@/lib/customFields";
import FieldValue from "@/components/fields/FieldValue";
import { AvatarGroup } from "@/components/avatar";
import { dueStatus, formatDateShort } from "@/lib/dates";
import TaskModal from "./task-modal";
import { toastErr } from "@/lib/toast";

type Engineer = Profile;
type CustomerLite = Pick<Customer, "id" | "name">;
type ValueMap = Record<string, Record<string, unknown>>;
type CountMap = Record<string, number>;

const STATUS_KEYS = new Set<string>(TASK_STATUSES.map((c) => c.key));
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
  profile,
  initialTasks,
  engineers,
  customers,
  fieldDefs,
  fieldValues,
  commentCounts,
}: {
  profile: Profile;
  initialTasks: Task[];
  engineers: Engineer[];
  customers: CustomerLite[];
  fieldDefs: FieldDefinition[];
  fieldValues: ValueMap;
  commentCounts: CountMap;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [view, setView] = useState<"board" | "list">("board");
  const [activeId, setActiveId] = useState<string | null>(null);
  const isDesktop = useIsDesktop();
  const [modal, setModal] = useState<{
    open: boolean;
    task: Task | null;
    status: TaskStatus;
  }>({ open: false, task: null, status: "todo" });
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

  const cardProps = { customerName, attachmentCount, commentCounts };

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
            Board
          </button>
          <button
            onClick={() => setView("list")}
            className={`seg-btn ${view === "list" ? "seg-btn-on" : ""}`}
          >
            <ListIcon className="h-4 w-4" />
            List
          </button>
        </div>
        <button
          className="btn-primary hidden md:inline-flex"
          onClick={() => openNew()}
        >
          <PlusIcon className="h-4 w-4" />
          Create Task
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
          {/* Columns scroll sideways until there's room for all four. */}
          <div className="no-scrollbar snap-x flex items-start gap-3 overflow-x-auto pb-2 xl:grid xl:grid-cols-4 xl:overflow-visible xl:pb-0">
            {TASK_STATUSES.map((col) => (
              <div
                key={col.key}
                className="w-[82vw] max-w-xs shrink-0 snap-start sm:w-72 xl:w-auto xl:max-w-none xl:shrink"
              >
                <Column
                  status={col.key}
                  label={col.label}
                  tasks={byStatus[col.key]}
                  profile={profile}
                  fieldDefs={fieldDefs}
                  fieldValues={fieldValues}
                  draggableDesktop={isDesktop}
                  onOpen={(task) => setModal({ open: true, task, status: col.key })}
                  onNew={() => openNew(col.key)}
                  onMenu={(task) => setActionSheet({ task, mode: "menu" })}
                  {...cardProps}
                />
              </div>
            ))}
          </div>
          <DragOverlay dropAnimation={dropAnimation}>
            {activeTask ? <CardBody task={activeTask} lifted {...cardProps} /> : null}
          </DragOverlay>
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
  fieldDefs,
  fieldValues,
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
  fieldDefs: FieldDefinition[];
  fieldValues: ValueMap;
  draggableDesktop: boolean;
  onOpen: (t: Task) => void;
  onNew: () => void;
  onMenu: (t: Task) => void;
} & CardExtras) {
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

        <button
          onClick={() => setMenu((v) => !v)}
          aria-label={`${label} options`}
          className="icon-btn ml-auto h-7 w-7"
        >
          <DotsIcon className="h-4 w-4" />
        </button>
        <button
          onClick={onNew}
          aria-label={`New task in ${label}`}
          className="icon-btn h-7 w-7"
        >
          <PlusIcon className="h-4 w-4" />
        </button>

        {menu && (
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
        className={`min-h-[120px] space-y-2 rounded-2xl p-2 transition-[background-color,box-shadow] duration-150 ${
          isOver ? "ring-1" : "ring-0"
        }`}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <SortableCard
              key={t.id}
              task={t}
              draggable={draggableDesktop && canEditTask(profile, t)}
              fieldDefs={fieldDefs}
              fieldValues={fieldValues}
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
            Add a task
          </button>
        )}
      </div>
    </div>
  );
}

function SortableCard({
  task,
  draggable,
  fieldDefs,
  fieldValues,
  onOpen,
  onMenu,
  ...extras
}: {
  task: Task;
  draggable: boolean;
  fieldDefs: FieldDefinition[];
  fieldValues: ValueMap;
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
      <CardBody
        task={task}
        fieldDefs={fieldDefs}
        fieldValues={fieldValues}
        onMenu={() => onMenu(task)}
        {...extras}
      />
    </div>
  );
}

function CardBody({
  task,
  fieldDefs,
  fieldValues,
  customerName,
  attachmentCount,
  commentCounts,
  lifted = false,
  onMenu,
}: {
  task: Task;
  fieldDefs?: FieldDefinition[];
  fieldValues?: ValueMap;
  lifted?: boolean;
  onMenu?: () => void;
} & CardExtras) {
  const subtitle = customerName(task.customer_id);
  const files = attachmentCount(task.id);
  const comments = commentCounts[task.id] ?? 0;

  return (
    <div className={`task-card relative p-3 ${lifted ? "shadow-pop" : "hover:shadow-card"}`}>
      {/* Mobile only — desktop uses drag-and-drop to change columns, so the
          menu would be a redundant control there. */}
      {onMenu && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMenu();
          }}
          aria-label="Task options"
          className="icon-btn absolute right-1 top-1 h-6 w-6 md:hidden"
        >
          <DotsIcon className="h-3.5 w-3.5" />
        </button>
      )}
      <p className={`line-clamp-2 text-sm font-semibold leading-snug text-ink ${onMenu ? "pr-6" : ""}`}>
        {task.title}
      </p>
      {subtitle && (
        <p className="mt-1 truncate text-xs text-ink-muted">{subtitle}</p>
      )}

      {fieldDefs && fieldValues && (
        <TaskTags taskId={task.id} defs={fieldDefs} values={fieldValues} max={2} />
      )}

      {/* Meta row. It wraps rather than truncating, so nothing can end up
          sitting on top of anything else in a narrow column. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <AvatarGroup people={task.assignees} size={20} max={3} />
        <PriorityChip priority={task.priority} />
        <div className="ml-auto flex items-center gap-2 text-xs text-ink-faint">
          {task.due_date && <DueBadge due={task.due_date} />}
          {files > 0 && (
            <span className="flex items-center gap-1" title={`${files} attachments`}>
              <ClipIcon className="h-3.5 w-3.5" />
              {files}
            </span>
          )}
          {comments > 0 && (
            <span className="flex items-center gap-1" title={`${comments} comments`}>
              <CommentIcon className="h-3.5 w-3.5" />
              {comments}
            </span>
          )}
        </div>
      </div>
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
  const otherStatuses = TASK_STATUSES.filter((s) => s.key !== task.status);
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
                {s.label}
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
