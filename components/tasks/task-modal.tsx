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
import { canEditData, canEditTask } from "@/lib/permissions";
import { createTask, deleteTask, updateTask } from "@/app/(app)/tasks/actions";
import Modal from "@/components/modal";
import CustomFields from "@/components/fields/CustomFields";

export default function TaskModal({
  profile,
  engineers,
  customers,
  task,
  onClose,
  onSaved,
  onDeleted,
}: {
  profile: Profile;
  engineers: Profile[];
  customers: Pick<Customer, "id" | "name">[];
  task: Task | null;
  onClose: () => void;
  onSaved: (t: Task) => void;
  onDeleted: (id: string) => void;
}) {
  const isNew = !task;
  const editable = isNew || canEditTask(profile, task!);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>(
    task?.priority ?? "medium"
  );
  const [assignee, setAssignee] = useState<string>(
    task?.assignee_id ?? (profile.role === "head" ? "" : profile.id)
  );
  const [customerId, setCustomerId] = useState<string>(task?.customer_id ?? "");
  const [dueDate, setDueDate] = useState<string>(task?.due_date ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      title,
      description,
      status,
      priority,
      assignee_id: assignee || null,
      customer_id: customerId || null,
      due_date: dueDate || null,
    };
    const res = isNew
      ? await createTask(payload)
      : await updateTask(task!.id, payload);
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

  return (
    <Modal
      title={isNew ? "New task" : editable ? "Edit task" : "Task"}
      onClose={onClose}
    >
      <div className="space-y-4">
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Assignee</label>
            <select
              className="input"
              value={assignee}
              disabled={!editable || profile.role !== "head"}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">Unassigned</option>
              {engineers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name || e.first_name}
                </option>
              ))}
            </select>
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

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {editable && (
          <div className="flex items-center justify-between gap-2 pt-2">
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
        )}
        {!editable && (
          <p className="pt-2 text-center text-xs text-ink-faint">
            You can only edit tasks assigned to you.
          </p>
        )}
      </div>
    </Modal>
  );
}
