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
import TaskModal from "./task-modal";

type Engineer = Profile;
type CustomerLite = Pick<Customer, "id" | "name">;

export default function TasksBoard({
  profile,
  initialTasks,
  engineers,
  customers,
}: {
  profile: Profile;
  initialTasks: Task[];
  engineers: Engineer[];
  customers: CustomerLite[];
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
  onOpen,
}: {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  profile: Profile;
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
  onOpen,
}: {
  task: Task;
  draggable: boolean;
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
      <CardBody task={task} />
    </div>
  );
}

function CardBody({ task }: { task: Task }) {
  return (
    <div className="card p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <PriorityChip priority={task.priority} />
        {task.due_date && (
          <span className="text-xs text-ink-faint">
            {new Date(task.due_date).toLocaleDateString()}
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-ink">{task.title}</p>
      {task.assignee && (
        <p className="mt-2 text-xs text-ink-muted">
          {task.assignee.full_name || task.assignee.first_name}
        </p>
      )}
    </div>
  );
}

function ListView({
  tasks,
  onOpen,
}: {
  tasks: Task[];
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
            {t.assignee && (
              <p className="truncate text-xs text-ink-faint">
                {t.assignee.full_name || t.assignee.first_name}
              </p>
            )}
          </div>
          <PriorityChip priority={t.priority} />
        </button>
      ))}
    </div>
  );
}
