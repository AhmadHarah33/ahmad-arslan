"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { PriorityChip } from "@/components/ui";
import { TASK_STATUSES } from "@/lib/types";
import type { Customer, Profile, Task, TaskStatus } from "@/lib/types";
import { canEditTask } from "@/lib/permissions";
import { moveTask } from "@/app/(app)/tasks/actions";
import type { FieldDefinition } from "@/lib/customFields";
import FieldValue from "@/components/fields/FieldValue";
import { AvatarGroup } from "@/components/avatar";
import { DUE_STYLES, dueStatus, formatDate } from "@/lib/dates";
import TaskModal from "./task-modal";

type Engineer = Profile;
type CustomerLite = Pick<Customer, "id" | "name">;
type ValueMap = Record<string, Record<string, unknown>>;

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
}: {
  profile: Profile;
  initialTasks: Task[];
  engineers: Engineer[];
  customers: CustomerLite[];
  fieldDefs: FieldDefinition[];
  fieldValues: ValueMap;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [view, setView] = useState<"board" | "list">("board");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; task: Task | null }>({
    open: false,
    task: null,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      done: [],
    };
    for (const t of tasks) map[t.status].push(t);
    return map;
  }, [tasks]);

  const activeTask = tasks.find((t) => t.id === activeId) || null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;

    const newStatus = overId as TaskStatus;
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === newStatus) return;
    if (!canEditTask(profile, task)) return;

    const position = Date.now();
    // Optimistic update.
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: newStatus, position } : t))
    );
    const res = await moveTask(id, newStatus, position);
    if (res?.error) {
      // Revert on failure.
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: task.status } : t))
      );
      alert(res.error);
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

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink md:text-2xl">Tasks</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {tasks.length} task{tasks.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-surface-border bg-surface p-0.5">
            <button
              onClick={() => setView("board")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                view === "board" ? "bg-brand-50 text-brand-700" : "text-ink-muted"
              }`}
            >
              Board
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                view === "list" ? "bg-brand-50 text-brand-700" : "text-ink-muted"
              }`}
            >
              List
            </button>
          </div>
          <button
            className="btn-primary"
            onClick={() => setModal({ open: true, task: null })}
          >
            + New
          </button>
        </div>
      </div>

      {view === "board" ? (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
            {TASK_STATUSES.map((col) => (
              <Column
                key={col.key}
                status={col.key}
                label={col.label}
                tasks={byStatus[col.key]}
                profile={profile}
                fieldDefs={fieldDefs}
                fieldValues={fieldValues}
                onOpen={(task) => setModal({ open: true, task })}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? <CardBody task={activeTask} /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <ListView
          tasks={tasks}
          fieldDefs={fieldDefs}
          fieldValues={fieldValues}
          onOpen={(task) => setModal({ open: true, task })}
        />
      )}

      {modal.open && (
        <TaskModal
          profile={profile}
          engineers={engineers}
          customers={customers}
          task={modal.task}
          onClose={() => setModal({ open: false, task: null })}
          onSaved={(t) => {
            upsertLocal(t);
            setModal({ open: false, task: null });
          }}
          onDeleted={(id) => {
            removeLocal(id);
            setModal({ open: false, task: null });
          }}
        />
      )}
    </div>
  );
}

function Column({
  status,
  label,
  tasks,
  profile,
  fieldDefs,
  fieldValues,
  onOpen,
}: {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  profile: Profile;
  fieldDefs: FieldDefinition[];
  fieldValues: ValueMap;
  onOpen: (t: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="w-72 shrink-0 md:w-80">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-ink">{label}</h3>
        <span className="chip bg-surface-soft text-ink-faint">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[120px] space-y-2 rounded-2xl p-2 transition ${
          isOver ? "bg-brand-50" : "bg-surface-soft"
        }`}
      >
        {tasks.map((t) => (
          <DraggableCard
            key={t.id}
            task={t}
            draggable={canEditTask(profile, t)}
            fieldDefs={fieldDefs}
            fieldValues={fieldValues}
            onOpen={onOpen}
          />
        ))}
        {tasks.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-ink-faint">
            Nothing here
          </p>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  task,
  draggable,
  fieldDefs,
  fieldValues,
  onOpen,
}: {
  task: Task;
  draggable: boolean;
  fieldDefs: FieldDefinition[];
  fieldValues: ValueMap;
  onOpen: (t: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      onClick={() => onOpen(task)}
      className={`cursor-pointer ${isDragging ? "opacity-40" : ""}`}
    >
      <CardBody task={task} fieldDefs={fieldDefs} fieldValues={fieldValues} />
    </div>
  );
}

function CardBody({
  task,
  fieldDefs,
  fieldValues,
}: {
  task: Task;
  fieldDefs?: FieldDefinition[];
  fieldValues?: ValueMap;
}) {
  return (
    <div className="card p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <PriorityChip priority={task.priority} />
        <DueBadge due={task.due_date} />
      </div>
      <p className="text-sm font-medium text-ink">{task.title}</p>
      {fieldDefs && fieldValues && (
        <TaskTags taskId={task.id} defs={fieldDefs} values={fieldValues} />
      )}
      <div className="mt-2.5">
        <AvatarGroup people={task.assignees} />
      </div>
    </div>
  );
}

function DueBadge({ due }: { due: string | null }) {
  if (!due) return null;
  const st = dueStatus(due);
  if (st === "none")
    return <span className="text-xs text-ink-faint">{formatDate(due)}</span>;
  return (
    <span className={`chip ${DUE_STYLES[st]}`}>
      {st === "overdue" ? "Overdue" : "Due soon"}
    </span>
  );
}

function ListView({
  tasks,
  fieldDefs,
  fieldValues,
  onOpen,
}: {
  tasks: Task[];
  fieldDefs: FieldDefinition[];
  fieldValues: ValueMap;
  onOpen: (t: Task) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="card px-5 py-10 text-center text-sm text-ink-faint">
        No tasks yet.
      </div>
    );
  }
  return (
    <div className="card divide-y divide-surface-border overflow-hidden">
      {tasks.map((t) => (
        <button
          key={t.id}
          onClick={() => onOpen(t)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-soft"
        >
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
              t.status === "done"
                ? "bg-green-500"
                : t.status === "in_progress"
                ? "bg-blue-500"
                : "bg-ink-faint/40"
            }`}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{t.title}</p>
            <div className="mt-1">
              <AvatarGroup people={t.assignees} size={18} />
            </div>
          </div>
          <div className="hidden sm:block">
            <TaskTags taskId={t.id} defs={fieldDefs} values={fieldValues} max={2} />
          </div>
          <DueBadge due={t.due_date} />
          <PriorityChip priority={t.priority} />
        </button>
      ))}
    </div>
  );
}
