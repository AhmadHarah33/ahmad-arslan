"use client";

import { useState } from "react";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/types";
import type {
  Customer,
  Profile,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";
import { canEditData, canEditTask, isHead } from "@/lib/permissions";
import {
  addAssignee,
  createTask,
  deleteTask,
  removeAssignee,
  updateTask,
} from "@/app/(app)/tasks/actions";
import Modal from "@/components/modal";
import CustomFields from "@/components/fields/CustomFields";
import TaskActivity from "./task-activity";
import TaskParts from "./task-parts";
import { createClient } from "@/lib/supabase/client";
import { PREVIEW, previewTemplates } from "@/lib/preview";
import type { AssigneeLite, TaskTemplate } from "@/lib/types";
import { useEffect } from "react";
import { toastErr } from "@/lib/toast";

export default function TaskModal({
  profile,
  engineers,
  customers,
  task,
  initialStatus = "todo",
  onClose,
  onSaved,
  onDeleted,
}: {
  profile: Profile;
  engineers: Profile[];
  customers: Pick<Customer, "id" | "name">[];
  task: Task | null;
  // Column a new task starts in (set when created from a column's menu).
  initialStatus?: TaskStatus;
  onClose: () => void;
  onSaved: (t: Task) => void;
  onDeleted: (id: string) => void;
}) {
  const isNew = !task;
  const editable = isNew || canEditTask(profile, task!);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? initialStatus);
  const [priority, setPriority] = useState<TaskPriority>(
    task?.priority ?? "medium"
  );
  // Assignees. New tasks collect ids locally (saved with createTask); existing
  // tasks manage membership live via add/remove actions.
  const [assignees, setAssignees] = useState<AssigneeLite[]>(
    task?.assignees ?? (isNew && !isHead(profile) ? [selfLite(profile)] : [])
  );
  const [customerId, setCustomerId] = useState<string>(task?.customer_id ?? "");
  const [dueDate, setDueDate] = useState<string>(task?.due_date ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);

  useEffect(() => {
    if (!isNew) return;
    let active = true;
    async function load() {
      if (PREVIEW) {
        setTemplates(previewTemplates);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase.from("task_templates").select("*").order("name");
      if (active) setTemplates((data ?? []) as TaskTemplate[]);
    }
    load();
    return () => {
      active = false;
    };
  }, [isNew]);

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTitle(t.name);
    setDescription(t.description);
    setPriority(t.priority);
  }

  async function save() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    const base = {
      title,
      description,
      status,
      priority,
      customer_id: customerId || null,
      due_date: dueDate || null,
    };
    const res = isNew
      ? await createTask({ ...base, assignee_ids: assignees.map((a) => a.id) })
      : await updateTask(task!.id, base);
    setSaving(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    if (res?.task) onSaved(res.task as Task);
  }

  async function remove() {
    if (!task) return;
    if (!confirm("Delete this task?")) return;
    setSaving(true);
    const res = await deleteTask(task.id);
    setSaving(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    onDeleted(task.id);
  }

  const footer = editable ? (
    <div className="flex items-center justify-between gap-2">
      {!isNew ? (
        <button className="btn-danger" onClick={remove} disabled={saving}>
          Delete
        </button>
      ) : (
        <span />
      )}
      <div className="flex gap-2">
        <button className="btn-ghost" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  ) : (
    <p className="text-center text-xs text-ink-faint">
      You can only edit tasks assigned to you.
    </p>
  );

  return (
    <Modal
      title={isNew ? "New task" : editable ? "Edit task" : "Task"}
      onClose={onClose}
      footer={footer}
    >
      <div className="space-y-4">
        {isNew && templates.length > 0 && (
          <div>
            <label className="label">Start from template</label>
            <select
              className="input"
              defaultValue=""
              onChange={(e) => applyTemplate(e.target.value)}
            >
              <option value="">Blank task</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">Title</label>
          <input
            className="input"
            value={title}
            disabled={!editable}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Repair chair unit at Clinic A"
          />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            className="input min-h-[80px] resize-y"
            value={description}
            disabled={!editable}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={status}
              disabled={!editable}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select
              className="input capitalize"
              value={priority}
              disabled={!editable}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Due date</label>
          <input
            type="date"
            className="input"
            value={dueDate}
            disabled={!editable}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Assignees</label>
          <AssigneeSection
            isNew={isNew}
            taskId={task?.id}
            profile={profile}
            engineers={engineers}
            assignees={assignees}
            setAssignees={setAssignees}
          />
        </div>

        <div>
          <label className="label">Customer (optional)</label>
          <select
            className="input"
            value={customerId}
            disabled={!editable}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">None</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Kept right after the core fields (not after Properties/Parts,
            which can run long with custom fields) so it stays reachable
            without scrolling through the whole form. */}
        {!isNew && (
          <div className="border-t border-surface-border pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="label mb-0">Activity</p>
              <a
                href={`/print/task/${task!.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-brand-600"
              >
                ⭳ Download report
              </a>
            </div>
            <TaskActivity taskId={task!.id} profile={profile} />
          </div>
        )}

        {!isNew && (
          <div className="border-t border-surface-border pt-4">
            <p className="label">Properties</p>
            <CustomFields
              entity="task"
              recordId={task!.id}
              canManage={canEditData(profile)}
              canEditValues={editable}
            />
          </div>
        )}

        {!isNew && (
          <div className="border-t border-surface-border pt-4">
            <p className="label">Parts used</p>
            <TaskParts taskId={task!.id} editable={editable} />
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function selfLite(p: Profile): AssigneeLite {
  return { id: p.id, full_name: p.full_name, first_name: p.first_name };
}

// Assignee management. Head can toggle anyone. An engineer can claim an
// unassigned task (add only themselves) or leave a task they're on; they can't
// add others or change a task already assigned to other people.
function AssigneeSection({
  isNew,
  taskId,
  profile,
  engineers,
  assignees,
  setAssignees,
}: {
  isNew: boolean;
  taskId?: string;
  profile: Profile;
  engineers: Profile[];
  assignees: AssigneeLite[];
  setAssignees: (v: AssigneeLite[]) => void;
}) {
  const head = isHead(profile);
  const ids = new Set(assignees.map((a) => a.id));
  const amMember = ids.has(profile.id);
  const isUnassigned = assignees.length === 0;

  async function toggle(p: Profile) {
    const lite = selfLite(p);
    const on = ids.has(p.id);
    const next = on
      ? assignees.filter((a) => a.id !== p.id)
      : [...assignees, lite];
    setAssignees(next);
    if (isNew) return; // saved with createTask
    const res = on
      ? await removeAssignee(taskId!, p.id)
      : await addAssignee(taskId!, p.id);
    if (res?.error) {
      setAssignees(assignees); // revert
      toastErr(res.error);
    }
  }

  // Head: full multi-select of engineers.
  if (head) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {engineers.map((e) => {
          const on = ids.has(e.id);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => toggle(e)}
              className={`chip cursor-pointer ${
                on
                  ? "bg-brand-50 text-brand-700 ring-2 ring-brand-300"
                  : "bg-surface-soft text-ink-muted"
              }`}
            >
              {e.full_name || e.first_name}
            </button>
          );
        })}
      </div>
    );
  }

  // Engineer view.
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {assignees.length > 0 ? (
          assignees.map((a) => (
            <span key={a.id} className="chip bg-surface-soft text-ink-muted">
              {a.full_name || a.first_name}
            </span>
          ))
        ) : (
          <span className="text-sm text-ink-faint">Unassigned</span>
        )}
      </div>
      {isNew ? (
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-surface-border text-brand-600"
            checked={amMember}
            onChange={() => toggle(profile)}
          />
          Assign to me
        </label>
      ) : isUnassigned ? (
        <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => toggle(profile)}>
          Claim this task
        </button>
      ) : amMember ? (
        <button
          className="btn-ghost px-3 py-1.5 text-sm"
          onClick={() => toggle(profile)}
        >
          Leave task
        </button>
      ) : (
        <p className="text-xs text-ink-faint">
          Assigned to someone else — only the head can change this.
        </p>
      )}
    </div>
  );
}
